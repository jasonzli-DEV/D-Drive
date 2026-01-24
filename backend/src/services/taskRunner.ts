import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Prune oldest files in a destination folder to enforce maxFiles retention.
export async function pruneOldBackups(userId: string, destinationId: string, maxFiles: number) {
  if (maxFiles <= 0) return;
  try {
    const files = await prisma.file.findMany({
      where: { userId, parentId: destinationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, name: true },
    });

    if (files.length <= maxFiles) return;

    const toDelete = files.slice(maxFiles);
    for (const f of toDelete) {
      try {
        // delete via prisma to ensure cascades (chunks) are removed
        await prisma.file.delete({ where: { id: f.id } });
        logger.info('Pruned old backup', { fileId: f.id, name: f.name });
      } catch (err) {
        logger.warn('Failed to prune backup', { fileId: f.id, err });
      }
    }
  } catch (err) {
    logger.error('Error pruning backups', err);
  }
}

// Placeholder runner: will perform SFTP pull, optional compression, encryption and upload.
// For now this is a stub to be implemented.
export async function runTaskNow(taskId: string) {
  // TODO: implement SFTP client, download files, compress, and call upload endpoints
  logger.info('runTaskNow called (stub)', { taskId });
}
