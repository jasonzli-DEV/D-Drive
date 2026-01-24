import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();

const AVATAR_DIR = process.env.AVATAR_DIR || path.join(process.cwd(), 'data', 'avatars');

// GET /api/avatars/:userId
// Serve a cached local avatar if present; otherwise redirect to Discord CDN
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  const localPath = path.join(AVATAR_DIR, `${userId}.png`);

  try {
    if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }

    // No local avatar; try to get user's avatar hash from DB
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { discordId: true, avatar: true } });
    if (user && user.avatar) {
      const cdn = `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png?size=256`;
      return res.redirect(cdn);
    }

    return res.status(404).send('No avatar');
  } catch (err) {
    logger.error('Error serving avatar', err);
    return res.status(500).send('Server error');
  }
});

export default router;
