import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user!.id;

    const [
      totalFiles,
      totalFolders,
      totalSizeResult,
      encryptedFiles,
      starredFiles,
      totalShares,
      totalTasks,
      activeTasks,
      recycleBinItems,
      lastUploadLog,
      totalUploads,
      avgSizeResult,
    ] = await Promise.all([
      prisma.file.count({
        where: { userId, type: 'FILE', deletedAt: null },
      }),
      prisma.file.count({
        where: { userId, type: 'DIRECTORY', deletedAt: null },
      }),
      prisma.file.aggregate({
        where: { userId, type: 'FILE', deletedAt: null },
        _sum: { size: true },
      }),
      prisma.file.count({
        where: { userId, type: 'FILE', encrypted: true, deletedAt: null },
      }),
      prisma.file.count({
        where: { userId, starred: true, deletedAt: null },
      }),
      prisma.share.count({
        where: { ownerId: userId },
      }),
      prisma.task.count({
        where: { userId },
      }),
      prisma.task.count({
        where: { userId, enabled: true },
      }),
      prisma.file.count({
        where: { userId, deletedAt: { not: null } },
      }),
      prisma.log.findFirst({
        where: { userId, type: 'UPLOAD' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.log.count({
        where: { userId, type: 'UPLOAD' },
      }),
      prisma.file.aggregate({
        where: { userId, type: 'FILE', deletedAt: null },
        _avg: { size: true },
      }),
    ]);

    const totalSize = totalSizeResult._sum.size
      ? Number(totalSizeResult._sum.size)
      : 0;
    const averageFileSize = avgSizeResult._avg.size
      ? Number(avgSizeResult._avg.size)
      : 0;

    res.json({
      totalFiles,
      totalFolders,
      totalSize,
      encryptedFiles,
      starredFiles,
      totalShares,
      totalTasks,
      activeTasks,
      recycleBinItems,
      lastUploadDate: lastUploadLog?.createdAt || null,
      totalUploads,
      averageFileSize,
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

export default router;
