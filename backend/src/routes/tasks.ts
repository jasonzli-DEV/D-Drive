import { Router, Request, Response } from 'express';
import { PrismaClient, CompressFormat } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { runTaskNow } from '../services/taskRunner';
import { deleteOrphanedDiscordMessages } from '../services/discordCleanup';
import scheduler from '../services/scheduler';

function isValidCronExpression(expr: string | undefined) {
  if (!expr) return false;
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5 || parts.length === 6;
}

const router = Router();
const prisma = new PrismaClient();

// List tasks for current user
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const tasks = await prisma.task.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    res.json(tasks);
  } catch (err) {
    logger.error('Error listing tasks', err);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

// Create task
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const {
      name,
      cron,
      sftpHost,
      sftpPort,
      sftpUser,
      sftpPath,
      sftpPrivateKey,
      sftpPassword,
      authPassword,
      authPrivateKey,
      destinationId,
      compress,
      compressFiles,
      timestampNames,
      maxFiles,
      encrypt,
      enabled,
    } = req.body;

    // Validate maxFiles
    if (maxFiles !== undefined && Number(maxFiles) < 0) {
      return res.status(400).json({ error: 'maxFiles must be >= 0' });
    }

    // Validate cron expression (basic check: 5 or 6 fields)
    if (!isValidCronExpression(cron || '* * * * *')) {
      return res.status(400).json({ error: 'Invalid cron expression' });
    }

    const task = await prisma.task.create({
      data: {
        userId,
        name: name || `Task ${new Date().toISOString()}`,
        cron: cron || '* * * * *',
        sftpHost: sftpHost || '',
        sftpPort: sftpPort ? Number(sftpPort) : 22,
        sftpUser: sftpUser || '',
        sftpPath: sftpPath || '/',
        sftpPrivateKey: sftpPrivateKey || null,
        sftpPassword: sftpPassword || null,
        authPassword: !!authPassword,
        authPrivateKey: authPrivateKey === undefined ? true : !!authPrivateKey,
        destinationId: destinationId || null,
        compress: (compress as CompressFormat) || 'NONE',
        compressFiles: !!compressFiles,
        timestampNames: timestampNames === undefined ? true : !!timestampNames,
        maxFiles: maxFiles ? Number(maxFiles) : 0,
        encrypt: !!encrypt,
        enabled: enabled === undefined ? true : !!enabled,
      },
    });

    // Schedule the task immediately if enabled
    if (task.enabled) {
      try { scheduler.scheduleTask(task.id, task.cron); } catch (e) { logger.warn('Failed to schedule new task', { err: e }); }
    }

    res.status(201).json(task);
  } catch (err) {
    logger.error('Error creating task', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Not found' });

    // Validate maxFiles if present
    if (req.body.maxFiles !== undefined && Number(req.body.maxFiles) < 0) {
      return res.status(400).json({ error: 'maxFiles must be >= 0' });
    }

    // Validate cron if present (basic check)
    if (req.body.cron && !isValidCronExpression(req.body.cron)) {
      return res.status(400).json({ error: 'Invalid cron expression' });
    }

    const updated = await prisma.task.update({ where: { id }, data: req.body });

    // Reschedule or unschedule based on enabled flag
    try {
      if (updated.enabled) scheduler.rescheduleTask(updated.id, updated.cron);
      else scheduler.unscheduleTask(updated.id);
    } catch (e) { logger.warn('Failed to (re)schedule task after update', { err: e }); }

    res.json(updated);
  } catch (err) {
    logger.error('Error updating task', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Not found' });

    await prisma.task.delete({ where: { id } });
    try { scheduler.unscheduleTask(id); } catch (e) { /* ignore */ }
    res.json({ ok: true });
  } catch (err) {
    logger.error('Error deleting task', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Trigger run now (for testing) - in future this will invoke the task runner
router.post('/:id/run', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task || task.userId !== userId) return res.status(404).json({ error: 'Not found' });
    // Execute the runner now and update lastRun when complete.
    await runTaskNow(id);
    const updated = await prisma.task.update({ where: { id }, data: { lastRun: new Date() } });
    res.json({ ok: true, task: updated });
  } catch (err) {
    logger.error('Error running task', err);
    res.status(500).json({ error: 'Failed to run task' });
  }
});

// Orphan cleanup trigger (gated). No admin role required; this route is
// only active when ENABLE_ORPHAN_CLEANUP is set to 'true' in the environment.
router.post('/admin/cleanup-orphans', authenticate, async (req: Request, res: Response) => {
  try {
    if (process.env.ENABLE_ORPHAN_CLEANUP !== 'true') {
      return res.status(403).json({ error: 'Orphan cleanup is disabled on this server' });
    }

    const result = await deleteOrphanedDiscordMessages(200, 10);
    res.json({ message: 'Orphan cleanup complete', deleted: result.totalDeleted });
  } catch (err) {
    logger.error('Orphan cleanup failed', err);
    res.status(500).json({ error: 'Failed to cleanup orphans', details: String(err) });
  }
});

export default router;
