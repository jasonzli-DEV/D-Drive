import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { runTaskNow, isTaskRunning } from './taskRunner';
import { logger } from '../utils/logger';
import { cleanupOrphanedDiscordFiles, cleanupTempFiles, cleanupOldRecycleBinFiles } from './cleanup';



// Map of taskId -> cron job
const jobs: Map<string, any> = new Map();
const running: Map<string, boolean> = new Map();

// Global task queue to serialize backup tasks and prevent bandwidth competition
const taskQueue: { taskId: string; addedAt: Date; priority: number }[] = [];
let queueProcessing = false;

// Process the task queue one task at a time
async function processTaskQueue() {
  if (queueProcessing) return;
  queueProcessing = true;
  
  while (taskQueue.length > 0) {
    const item = taskQueue.shift()!;
    const { taskId, addedAt } = item;
    
    // Skip if this task is already running (shouldn't happen but be safe)
    if (running.get(taskId)) {
      logger.info('Skipping queued task; already running', { taskId });
      // Notify any waiting callers
      const pending = pendingCompletions.get(taskId);
      if (pending) {
        pending.reject(new Error('Task is already running'));
        pendingCompletions.delete(taskId);
      }
      continue;
    }
    
    running.set(taskId, true);
    const waitTime = Date.now() - addedAt.getTime();
    logger.info('Processing queued task', { taskId, queueWaitMs: waitTime, remainingInQueue: taskQueue.length });
    
    let taskError: Error | null = null;
    try {
      await runTaskNow(taskId);
    } catch (err: any) {
      logger.error('Scheduled task run failed', { taskId, err });
      taskError = err instanceof Error ? err : new Error(String(err));
    } finally {
      running.delete(taskId);
      
      // Notify any waiting callers
      const pending = pendingCompletions.get(taskId);
      if (pending) {
        if (taskError) {
          pending.reject(taskError);
        } else {
          pending.resolve();
        }
        pendingCompletions.delete(taskId);
      }
    }
  }
  
  queueProcessing = false;
}

// Add a task to the queue (called by cron scheduler)
export async function queueTask(taskId: string) {
  // Check if task is already in queue
  if (taskQueue.some(t => t.taskId === taskId)) {
    logger.info('Task already in queue, skipping', { taskId });
    return;
  }
  
  // Check if task is currently running
  if (running.get(taskId)) {
    logger.info('Task already running, not adding to queue', { taskId });
    return;
  }
  
  // Get task priority from database
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { priority: true } });
  const priority = task?.priority ?? 999;
  
  taskQueue.push({ taskId, addedAt: new Date(), priority });
  
  // Sort queue by priority (lower number = higher priority)
  taskQueue.sort((a, b) => a.priority - b.priority);
  
  logger.info('Task added to queue', { taskId, priority, queuePosition: taskQueue.findIndex(t => t.taskId === taskId) + 1, queueLength: taskQueue.length });
  
  // Start processing if not already
  processTaskQueue();
}

// Queue a task and wait for it to complete (for manual runs)
export async function queueTaskAndWait(taskId: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    // Check if task is already in queue
    if (taskQueue.some(t => t.taskId === taskId)) {
      reject(new Error('Task is already queued'));
      return;
    }
    
    // Check if task is currently running
    if (running.get(taskId)) {
      reject(new Error('Task is already running'));
      return;
    }
    
    // Get task priority from database
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { priority: true } });
    const priority = task?.priority ?? 999;
    
    // Add to pending completions
    pendingCompletions.set(taskId, { resolve, reject });
    
    taskQueue.push({ taskId, addedAt: new Date(), priority });
    
    // Sort queue by priority (lower number = higher priority)
    taskQueue.sort((a, b) => a.priority - b.priority);
    
    logger.info('Task added to queue (with wait)', { taskId, priority, queuePosition: taskQueue.findIndex(t => t.taskId === taskId) + 1, queueLength: taskQueue.length });
    
    // Start processing if not already
    processTaskQueue();
  });
}

// Track pending completions for queueTaskAndWait
const pendingCompletions = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();

export async function initScheduler() {
  try {
    const tasks = await prisma.task.findMany({ where: { enabled: true } });
    for (const t of tasks) {
      scheduleTask(t.id, t.cron);
    }
    
    // Schedule hourly cleanup task for orphaned Discord files and temp files
    cron.schedule('0 * * * *', async () => {
      logger.info('Running hourly cleanup tasks');
      try {
        await cleanupOrphanedDiscordFiles();
        await cleanupTempFiles();
      } catch (err) {
        logger.error('Cleanup tasks failed:', err);
      }
    });
    
    // Schedule daily cleanup of old logs (runs at 3 AM every day)
    cron.schedule('0 3 * * *', async () => {
      logger.info('Running daily log cleanup task');
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const deleted = await prisma.log.deleteMany({
          where: {
            createdAt: {
              lt: thirtyDaysAgo
            }
          }
        });
        
        logger.info('Old logs cleaned up', { deletedCount: deleted.count, olderThan: thirtyDaysAgo });
      } catch (err) {
        logger.error('Log cleanup task failed:', err);
      }
    });
    
    // Schedule daily cleanup of old recycle bin files (runs at 4 AM every day)
    // Files older than 30 days in the recycle bin will be permanently deleted
    cron.schedule('0 4 * * *', async () => {
      logger.info('Running daily recycle bin cleanup task');
      try {
        await cleanupOldRecycleBinFiles();
      } catch (err) {
        logger.error('Recycle bin cleanup task failed:', err);
      }
    });
    
    logger.info('Scheduler initialized', { count: tasks.length, cleanupScheduled: true, logCleanupScheduled: true });
    
    // Start stale task checker (every 30 seconds)
    setInterval(checkStaleRunningTasks, 30000);
    logger.info('Stale task checker started (30s interval)');
  } catch (err) {
    logger.error('Failed to initialize scheduler', err);
  }
}

// Check for tasks that appear to be running in DB but aren't actually running in memory
async function checkStaleRunningTasks() {
  try {
    // Find tasks where lastStarted > lastRun (indicates "running" state in DB)
    const potentiallyRunning = await prisma.task.findMany({
      where: {
        lastStarted: { not: null }
      },
      select: { id: true, name: true, lastStarted: true, lastRun: true, userId: true }
    });
    
    for (const task of potentiallyRunning) {
      // Task is considered "running in DB" if lastStarted > lastRun (or lastRun is null)
      const isRunningInDb = task.lastStarted && (!task.lastRun || task.lastStarted > task.lastRun);
      
      if (isRunningInDb && !isTaskRunning(task.id) && !running.get(task.id)) {
        // DB says running but it's not actually running - this is a stale state
        logger.warn('Detected stale running task state, fixing', { taskId: task.id, taskName: task.name });
        
        await prisma.task.update({
          where: { id: task.id },
          data: { lastRun: new Date() }
        });
        
        // Log the fix
        try {
          const { createLog } = require('../routes/logs');
          await createLog(task.userId, 'TASK', `Stale state fixed: ${task.name}`, true, 'Task was marked as running but process was not found');
        } catch (logErr) {
          logger.warn('Failed to log stale task fix:', logErr);
        }
      }
    }
  } catch (err) {
    logger.error('Error checking for stale tasks:', err);
  }
}

export function scheduleTask(taskId: string, expression: string) {
  try {
    // Cancel existing if present
    if (jobs.has(taskId)) {
      const existing = jobs.get(taskId)!;
      existing.stop();
      jobs.delete(taskId);
    }

    const job = cron.schedule(expression, async () => {
      // Use global queue instead of running directly
      // This serializes all backup tasks to prevent bandwidth competition
      logger.info('Scheduled task triggered, adding to queue', { taskId });
      queueTask(taskId);
    });

    jobs.set(taskId, job);
    logger.info('Scheduled task', { taskId, expression });
    return true;
  } catch (err) {
    logger.error('Failed to schedule task', { taskId, expression, err });
    return false;
  }
}

export function unscheduleTask(taskId: string) {
  if (jobs.has(taskId)) {
    const job = jobs.get(taskId)!;
    job.stop();
    jobs.delete(taskId);
    running.delete(taskId);
    logger.info('Unscheduled task', { taskId });
  }
}

export function rescheduleTask(taskId: string, expression: string) {
  unscheduleTask(taskId);
  scheduleTask(taskId, expression);
}

// Remove a task from the queue (cancel a queued task)
export function dequeueTask(taskId: string): boolean {
  const index = taskQueue.findIndex(t => t.taskId === taskId);
  if (index === -1) {
    return false;
  }
  taskQueue.splice(index, 1);
  
  // Reject any pending completion
  const pending = pendingCompletions.get(taskId);
  if (pending) {
    pending.reject(new Error('Task was cancelled from queue'));
    pendingCompletions.delete(taskId);
  }
  
  logger.info('Task removed from queue', { taskId });
  return true;
}

// Check if a task is in the queue
export function isTaskQueued(taskId: string): boolean {
  return taskQueue.some(t => t.taskId === taskId);
}

// Clear running state for a task (called when task is manually stopped)
export function clearRunningState(taskId: string): void {
  running.delete(taskId);
  logger.info('Cleared running state for task', { taskId });
}

// Get queue status for API
export function getQueueStatus() {
  return {
    queueLength: taskQueue.length,
    queuedTasks: taskQueue.map(t => ({ taskId: t.taskId, queuedAt: t.addedAt, priority: t.priority })),
    runningTasks: Array.from(running.entries()).filter(([_, isRunning]) => isRunning).map(([taskId]) => taskId),
  };
}

export default {
  initScheduler,
  scheduleTask,
  unscheduleTask,
  rescheduleTask,
  getQueueStatus,
  dequeueTask,
  isTaskQueued,
};
