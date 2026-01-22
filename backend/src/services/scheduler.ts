import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { runTaskNow } from './taskRunner';
import { logger } from '../utils/logger';
import { cleanupOrphanedDiscordFiles, cleanupTempFiles } from './cleanup';

const prisma = new PrismaClient();

// Map of taskId -> cron job
const jobs: Map<string, any> = new Map();
const running: Map<string, boolean> = new Map();

// Global task queue to serialize backup tasks and prevent bandwidth competition
const taskQueue: { taskId: string; addedAt: Date }[] = [];
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
      continue;
    }
    
    running.set(taskId, true);
    const waitTime = Date.now() - addedAt.getTime();
    logger.info('Processing queued task', { taskId, queueWaitMs: waitTime, remainingInQueue: taskQueue.length });
    
    try {
      await runTaskNow(taskId);
    } catch (err) {
      logger.error('Scheduled task run failed', { taskId, err });
    } finally {
      running.set(taskId, false);
    }
  }
  
  queueProcessing = false;
}

// Add a task to the queue (called by cron scheduler)
function queueTask(taskId: string) {
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
  
  taskQueue.push({ taskId, addedAt: new Date() });
  logger.info('Task added to queue', { taskId, queuePosition: taskQueue.length });
  
  // Start processing if not already
  processTaskQueue();
}

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
    
    logger.info('Scheduler initialized', { count: tasks.length, cleanupScheduled: true, logCleanupScheduled: true });
  } catch (err) {
    logger.error('Failed to initialize scheduler', err);
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

export default {
  initScheduler,
  scheduleTask,
  unscheduleTask,
  rescheduleTask,
};
