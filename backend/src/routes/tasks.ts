import { Router, Request, Response } from 'express';
import { PrismaClient, CompressFormat } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

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
      destinationId,
      compress,
      compressFiles,
      timestampNames,
      maxFiles,
      encrypt,
      enabled,
    } = req.body;

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
        destinationId: destinationId || null,
        compress: (compress as CompressFormat) || 'NONE',
        compressFiles: !!compressFiles,
        timestampNames: timestampNames === undefined ? true : !!timestampNames,
        maxFiles: maxFiles ? Number(maxFiles) : 0,
        encrypt: !!encrypt,
        enabled: enabled === undefined ? true : !!enabled,
      },
    });

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

    const updated = await prisma.task.update({ where: { id }, data: req.body });
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

    // TODO: enqueue actual runner job. For now just update lastRun.
    const updated = await prisma.task.update({ where: { id }, data: { lastRun: new Date() } });
    res.json({ ok: true, task: updated });
  } catch (err) {
    logger.error('Error running task', err);
    res.status(500).json({ error: 'Failed to run task' });
  }
});

export default router;
