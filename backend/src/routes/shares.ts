import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// Helper to serialize file for response
function serializeFile(file: any) {
  if (!file) return null;
  return {
    ...file,
    size: file.size?.toString() || '0',
  };
}

// List shares I've created (files I've shared with others)
router.get('/by-me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const shares = await prisma.share.findMany({
      where: { ownerId: userId },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            type: true,
            size: true,
            mimeType: true,
            path: true,
          },
        },
        sharedWith: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(shares.map(s => ({
      ...s,
      file: serializeFile(s.file),
    })));
  } catch (error) {
    logger.error('Error listing shares by me:', error);
    res.status(500).json({ error: 'Failed to list shares' });
  }
});

// List files shared with me
router.get('/with-me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    // Check if user allows shares
    const user = await prisma.user.findUnique({ 
      where: { id: userId }, 
      select: { allowSharedWithMe: true } 
    });
    
    if (!user?.allowSharedWithMe) {
      return res.json([]); // Return empty if sharing is disabled
    }

    const shares = await prisma.share.findMany({
      where: { sharedWithId: userId },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            type: true,
            size: true,
            mimeType: true,
            path: true,
            deletedAt: true,
          },
        },
        owner: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter out deleted files
    const validShares = shares.filter(s => !s.file.deletedAt);

    res.json(validShares.map(s => ({
      ...s,
      file: serializeFile(s.file),
    })));
  } catch (error) {
    logger.error('Error listing shares with me:', error);
    res.status(500).json({ error: 'Failed to list shares' });
  }
});

// Share a file or folder with another user
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { fileId, username, permission = 'VIEW' } = req.body;

    if (!fileId || !username) {
      return res.status(400).json({ error: 'fileId and username are required' });
    }

    // Validate permission
    if (!['VIEW', 'EDIT', 'ADMIN'].includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission. Must be VIEW, EDIT, or ADMIN' });
    }

    // Check file exists and belongs to user
    const file = await prisma.file.findFirst({
      where: { id: fileId, userId, deletedAt: null },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Find target user by username
    const targetUser = await prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true, username: true, allowSharedWithMe: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.id === userId) {
      return res.status(400).json({ error: 'Cannot share with yourself' });
    }

    if (!targetUser.allowSharedWithMe) {
      return res.status(403).json({ error: 'This user has disabled sharing' });
    }

    // Check if already shared
    const existingShare = await prisma.share.findUnique({
      where: { fileId_sharedWithId: { fileId, sharedWithId: targetUser.id } },
    });

    if (existingShare) {
      // Update permission if different
      const updated = await prisma.share.update({
        where: { id: existingShare.id },
        data: { permission },
        include: {
          sharedWith: {
            select: { id: true, username: true, avatar: true },
          },
        },
      });
      return res.json({ message: 'Share updated', share: updated });
    }

    // Create share
    const share = await prisma.share.create({
      data: {
        fileId,
        ownerId: userId,
        sharedWithId: targetUser.id,
        permission,
      },
      include: {
        sharedWith: {
          select: { id: true, username: true, avatar: true },
        },
      },
    });

    logger.info('File shared', { fileId, fromUser: userId, toUser: targetUser.id, permission });

    res.json({ message: 'File shared successfully', share });
  } catch (error) {
    logger.error('Error sharing file:', error);
    res.status(500).json({ error: 'Failed to share file' });
  }
});

// Update share permission
router.patch('/:shareId', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { shareId } = req.params;
    const { permission } = req.body;

    if (!['VIEW', 'EDIT', 'ADMIN'].includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission' });
    }

    const share = await prisma.share.findFirst({
      where: { id: shareId, ownerId: userId },
    });

    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }

    const updated = await prisma.share.update({
      where: { id: shareId },
      data: { permission },
    });

    res.json(updated);
  } catch (error) {
    logger.error('Error updating share:', error);
    res.status(500).json({ error: 'Failed to update share' });
  }
});

// Remove share (unshare a file)
router.delete('/:shareId', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { shareId } = req.params;

    const share = await prisma.share.findFirst({
      where: { 
        id: shareId,
        OR: [
          { ownerId: userId },      // Owner can remove
          { sharedWithId: userId }, // Recipient can remove themselves
        ]
      },
    });

    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }

    await prisma.share.delete({ where: { id: shareId } });

    res.json({ message: 'Share removed successfully' });
  } catch (error) {
    logger.error('Error removing share:', error);
    res.status(500).json({ error: 'Failed to remove share' });
  }
});

// Get shares for a specific file
router.get('/file/:fileId', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { fileId } = req.params;

    // Check file belongs to user
    const file = await prisma.file.findFirst({
      where: { id: fileId, userId },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const shares = await prisma.share.findMany({
      where: { fileId },
      include: {
        sharedWith: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    res.json(shares);
  } catch (error) {
    logger.error('Error getting file shares:', error);
    res.status(500).json({ error: 'Failed to get file shares' });
  }
});

// Download shared file (for recipients)
router.get('/download/:fileId', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { fileId } = req.params;

    // Check if user has access via share
    const share = await prisma.share.findFirst({
      where: { 
        fileId, 
        sharedWithId: userId,
      },
      include: {
        file: {
          include: {
            chunks: {
              orderBy: { chunkIndex: 'asc' },
            },
            user: {
              select: { encryptionKey: true },
            },
          },
        },
      },
    });

    if (!share) {
      return res.status(404).json({ error: 'File not found or not shared with you' });
    }

    if (share.file.deletedAt) {
      return res.status(404).json({ error: 'File has been deleted' });
    }

    // For now, just return the file info - actual download will use the files route
    // with shared file support
    res.json({
      file: serializeFile(share.file),
      permission: share.permission,
    });
  } catch (error) {
    logger.error('Error downloading shared file:', error);
    res.status(500).json({ error: 'Failed to download shared file' });
  }
});

export default router;
