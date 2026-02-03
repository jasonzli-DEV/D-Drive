import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { runTaskNow } from './taskRunner';
import { logger } from '../utils/logger';
import { cleanupOrphanedDiscordFiles } from './cleanup';

const prisma = new PrismaClient();

// Map of taskId -> cron job
const jobs: Map<string, any> = new Map();
const running: Map<string, boolean> = new Map();

export async function initScheduler() {
  try {
    const tasks = await prisma.task.findMany({ where: { enabled: true } });
    for (const t of tasks) {
      scheduleTask(t.id, t.cron);
    }
    
    // Schedule hourly cleanup task for orphaned Discord files
    cron.schedule('0 * * * *', async () => {
      logger.info('Running hourly Discord cleanup task');
      try {
        await cleanupOrphanedDiscordFiles();
      } catch (err) {
        logger.error('Discord cleanup task failed:', err);
      }
    });
    
    logger.info('Scheduler initialized', { count: tasks.length, cleanupScheduled: true });
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
      if (running.get(taskId)) {
        logger.info('Skipping scheduled run; previous run still in progress', { taskId });
        return;
      }
      running.set(taskId, true);
      try {
        logger.info('Scheduled task triggered', { taskId });
        await runTaskNow(taskId);
      } catch (err) {
        logger.error('Scheduled task run failed', { taskId, err });
      } finally {
        running.set(taskId, false);
      }
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
