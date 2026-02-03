import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get logs for the authenticated user
router.get('/', authenticate, async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { type, limit = '100', offset = '0' } = req.query;
    
    const where: any = { userId };
    if (type && typeof type === 'string') {
      where.type = type.toUpperCase();
    }

    const logs = await prisma.log.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    const total = await prisma.log.count({ where });

    res.json({ logs, total });
  } catch (err) {
    console.error('Error fetching logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Create a log entry (internal use by other services)
export async function createLog(
  userId: string,
  type: 'TASK' | 'UPLOAD' | 'COPY' | 'DELETE',
  action: string,
  success: boolean,
  message?: string,
  metadata?: any
) {
  try {
    await prisma.log.create({
      data: {
        userId,
        type,
        action,
        success,
        message,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch (err) {
    console.error('Error creating log:', err);
  }
}

export default router;
