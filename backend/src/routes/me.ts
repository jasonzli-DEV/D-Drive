import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();


// Get current user info (limited)
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        avatar: true,
        email: true,
        encryptionKey: true,
        encryptByDefault: true,
        recycleBinEnabled: true,
        allowSharedWithMe: true,
        theme: true,
        timezone: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    logger.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// Update current user preferences
router.patch('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { encryptByDefault, recycleBinEnabled, allowSharedWithMe, theme, timezone } = req.body;

    const updates: any = {};
    if (typeof encryptByDefault === 'boolean') updates.encryptByDefault = encryptByDefault;
    if (typeof recycleBinEnabled === 'boolean') updates.recycleBinEnabled = recycleBinEnabled;
    if (typeof allowSharedWithMe === 'boolean') updates.allowSharedWithMe = allowSharedWithMe;
    if (typeof theme === 'string' && ['light', 'dark', 'auto'].includes(theme)) updates.theme = theme;
    if (typeof timezone === 'string' || timezone === null) updates.timezone = timezone;

    const user = await prisma.user.update({
      where: { id: userId },
      data: updates,
      select: { id: true, encryptByDefault: true, recycleBinEnabled: true, allowSharedWithMe: true, theme: true, timezone: true },
    });

    res.json(user);
  } catch (error) {
    logger.error('Error updating user preferences:', error);
    res.status(500).json({ error: 'Failed to update user preferences' });
  }
});

export default router;
