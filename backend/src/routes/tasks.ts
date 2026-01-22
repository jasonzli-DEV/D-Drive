import { Router, Request, Response } from 'express';
import { CompressFormat } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { runTaskNow, stopTask, isTaskRunning, getTaskProgress, getAllRunningTasksProgress } from '../services/taskRunner';
import { testSftpConnection } from '../services/sftp';
import scheduler, { queueTaskAndWait, getQueueStatus, dequeueTask, isTaskQueued } from '../services/scheduler';

function isValidCronExpression(expr: string | undefined) {
  if (!expr) return false;
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5 || parts.length === 6;
}

const router = Router();


// List tasks for current user (ordered by priority)
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const tasks = await prisma.task.findMany({ where: { userId }, orderBy: { priority: 'asc' } });
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

    // Required fields validation
    if (!name || String(name).trim().length === 0) {
      return res.status(400).json({ error: 'Task name is required' });
    }

    if (!cron || String(cron).trim().length === 0) {
      return res.status(400).json({ error: 'Cron expression is required' });
    }

    // Validate maxFiles
    if (maxFiles !== undefined && Number(maxFiles) < 0) {
      return res.status(400).json({ error: 'maxFiles must be >= 0' });
    }

    // Validate cron expression (basic check: 5 or 6 fields)
    if (!isValidCronExpression(cron || '* * * * *')) {
      return res.status(400).json({ error: 'Invalid cron expression' });
    }

    // Require at least one authentication method with credentials
    const hasPasswordAuth = !!authPassword && !!sftpPassword;
    const hasKeyAuth = !!authPrivateKey && !!sftpPrivateKey;
    if (!hasPasswordAuth && !hasKeyAuth) {
      return res.status(400).json({ error: 'At least one authentication method with credentials is required (password or private key)' });
    }

    // Test SFTP connection before creating the task
    try {
      await testSftpConnection({ host: sftpHost, port: sftpPort, username: sftpUser, password: sftpPassword, privateKey: sftpPrivateKey, authPassword: !!authPassword, authPrivateKey: !!authPrivateKey });
    } catch (err: any) {
      return res.status(400).json({ error: `SFTP connection failed: ${err?.message || String(err)}` });
    }

    // Look up destination path if destinationId provided
    let destinationPath: string | null = null;
    if (destinationId) {
      const destFolder = await prisma.file.findUnique({ where: { id: destinationId }, select: { path: true } });
      if (destFolder) {
        destinationPath = destFolder.path;
      }
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
        destinationPath,
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

    // Merge existing values with updates for validation and SFTP testing
    const merged = { ...existing, ...req.body } as any;

    if (!merged.name || String(merged.name).trim().length === 0) {
      return res.status(400).json({ error: 'Task name is required' });
    }

    if (!merged.cron || String(merged.cron).trim().length === 0) {
      return res.status(400).json({ error: 'Cron expression is required' });
    }

    if (!isValidCronExpression(merged.cron)) {
      return res.status(400).json({ error: 'Invalid cron expression' });
    }

    const hasPasswordAuthUpd = !!merged.authPassword && !!merged.sftpPassword;
    const hasKeyAuthUpd = !!merged.authPrivateKey && !!merged.sftpPrivateKey;
    if (!hasPasswordAuthUpd && !hasKeyAuthUpd) {
      return res.status(400).json({ error: 'At least one authentication method with credentials is required (password or private key)' });
    }

    // Test SFTP connection with merged values
    try {
      await testSftpConnection({ host: merged.sftpHost, port: merged.sftpPort, username: merged.sftpUser, password: merged.sftpPassword, privateKey: merged.sftpPrivateKey, authPassword: !!merged.authPassword, authPrivateKey: !!merged.authPrivateKey });
    } catch (err: any) {
      return res.status(400).json({ error: `SFTP connection failed: ${err?.message || String(err)}` });
    }

    // If destinationId is being updated, also update destinationPath
    const updateData = { ...req.body };
    if (req.body.destinationId !== undefined) {
      if (req.body.destinationId) {
        const destFolder = await prisma.file.findUnique({ where: { id: req.body.destinationId }, select: { path: true } });
        updateData.destinationPath = destFolder?.path || null;
      } else {
        updateData.destinationPath = null;
      }
    }

    const updated = await prisma.task.update({ where: { id }, data: updateData });

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

// Get progress of all running tasks
// IMPORTANT: This must be before /:id routes to avoid "running" being matched as an ID
router.get('/running/progress', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const allProgress = getAllRunningTasksProgress();
    
    // Filter to only tasks owned by this user
    const userTasks = await prisma.task.findMany({
      where: { userId },
      select: { id: true },
    });
    const userTaskIds = new Set(userTasks.map(t => t.id));
    
    const userProgress = allProgress.filter(p => userTaskIds.has(p.taskId));
    res.json({ tasks: userProgress });
  } catch (err) {
    logger.error('Error getting running tasks progress', err);
    res.status(500).json({ error: 'Failed to get running tasks progress' });
  }
});

// Get queue status (queued and running tasks)
// IMPORTANT: This must be before /:id routes
router.get('/queue/status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const status = getQueueStatus();
    
    // Filter to only tasks owned by this user
    const userTasks = await prisma.task.findMany({
      where: { userId },
      select: { id: true },
    });
    const userTaskIds = new Set(userTasks.map(t => t.id));
    
    res.json({
      queueLength: status.queueLength,
      queuedTasks: status.queuedTasks.filter(t => userTaskIds.has(t.taskId)),
      runningTasks: status.runningTasks.filter(id => userTaskIds.has(id)),
    });
  } catch (err) {
    logger.error('Error getting queue status', err);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

// Update task priorities (reorder tasks)
router.post('/reorder', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { taskIds } = req.body; // Array of task IDs in desired priority order
    
    if (!Array.isArray(taskIds)) {
      return res.status(400).json({ error: 'taskIds must be an array' });
    }
    
    // Verify all tasks belong to this user
    const userTasks = await prisma.task.findMany({
      where: { userId, id: { in: taskIds } },
      select: { id: true },
    });
    
    if (userTasks.length !== taskIds.length) {
      return res.status(400).json({ error: 'Some tasks not found or not owned by user' });
    }
    
    // Update priorities based on order (index 0 = priority 0, etc.)
    for (let i = 0; i < taskIds.length; i++) {
      await prisma.task.update({
        where: { id: taskIds[i] },
        data: { priority: i },
      });
    }
    
    res.json({ ok: true });
  } catch (err) {
    logger.error('Error reordering tasks', err);
    res.status(500).json({ error: 'Failed to reorder tasks' });
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

// Trigger run now (for testing) - uses queue to serialize with scheduled tasks
router.post('/:id/run', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task || task.userId !== userId) return res.status(404).json({ error: 'Not found' });
    
    // Use queue to serialize with other tasks and prevent bandwidth competition
    await queueTaskAndWait(id);
    const updated = await prisma.task.update({ where: { id }, data: { lastRun: new Date() } });
    res.json({ ok: true, task: updated });
  } catch (err: any) {
    // Check if it's the "already running" or "already queued" error
    if (err?.message === 'Task is already running' || err?.message === 'Task is already queued') {
      return res.status(409).json({ error: err.message });
    }
    logger.error('Error running task', err);
    res.status(500).json({ error: 'Failed to run task' });
  }
});

// Stop a running task
router.post('/:id/stop', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task || task.userId !== userId) return res.status(404).json({ error: 'Not found' });
    
    await stopTask(id);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Error stopping task', err);
    res.status(500).json({ error: 'Failed to stop task' });
  }
});

// Cancel a queued task (remove from queue)
router.post('/:id/dequeue', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task || task.userId !== userId) return res.status(404).json({ error: 'Not found' });
    
    const removed = dequeueTask(id);
    if (!removed) {
      return res.status(400).json({ error: 'Task is not in queue' });
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error('Error dequeuing task', err);
    res.status(500).json({ error: 'Failed to dequeue task' });
  }
});

// Get progress of a specific running task
router.get('/:id/progress', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task || task.userId !== userId) return res.status(404).json({ error: 'Not found' });
    
    const progress = getTaskProgress(id);
    if (!progress) {
      return res.json({ running: false, progress: null });
    }
    res.json({ running: true, progress });
  } catch (err) {
    logger.error('Error getting task progress', err);
    res.status(500).json({ error: 'Failed to get task progress' });
  }
});

export default router;