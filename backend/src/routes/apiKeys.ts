import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { generateApiKey } from '../utils/crypto';
import { logger } from '../utils/logger';

const router = Router();


// List API keys
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        key: true,
        createdAt: true,
        lastUsed: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Mask API keys - show first 8 characters and mask the rest
    const maskedKeys = apiKeys.map(apiKey => {
      const visible = 8;
      if (!apiKey.key) return { ...apiKey, key: '' };
      const masked = apiKey.key.length <= visible ? apiKey.key : apiKey.key.substring(0, visible) + '*'.repeat(apiKey.key.length - visible);
      return { ...apiKey, key: masked };
    });

    res.json(maskedKeys);
  } catch (error) {
    logger.error('Error listing API keys:', error);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// Create API key
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'API key name is required' });
    }

      // Prevent duplicate key names per user
      const existing = await prisma.apiKey.findFirst({ where: { userId, name } });
      if (existing) {
        return res.status(409).json({ error: 'API key name already exists' });
      }

    const key = generateApiKey();

    const apiKey = await prisma.apiKey.create({
      data: {
        key,
        name,
        userId,
      },
    });

    res.json(apiKey);
  } catch (error) {
    logger.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Delete API key
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    const apiKey = await prisma.apiKey.findFirst({
      where: { id, userId },
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    await prisma.apiKey.delete({ where: { id } });

    res.json({ message: 'API key deleted successfully' });
  } catch (error) {
    logger.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

export default router;
