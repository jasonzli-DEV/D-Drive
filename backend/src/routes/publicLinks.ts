import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { generateSlug, isValidSlug } from '../utils/slugGenerator';
import { downloadChunkFromDiscord } from '../services/discord';
import { decryptBuffer } from '../utils/crypto';

const router = Router();

function serializeFile(file: any) {
  if (!file) return null;
  return {
    ...file,
    size: file.size?.toString() || '0',
  };
}

router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { fileId, slug: customSlug, expiresAt } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' });
    }

    const file = await prisma.file.findFirst({
      where: { id: fileId, userId, deletedAt: null },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const existingLink = await prisma.publicLink.findFirst({
      where: { fileId, userId },
    });

    if (existingLink) {
      return res.status(409).json({ 
        error: 'Public link already exists for this file',
        link: existingLink 
      });
    }

    let slug = customSlug;
    if (slug) {
      if (!isValidSlug(slug)) {
        return res.status(400).json({ error: 'Invalid slug format. Use lowercase letters and hyphens only (e.g., "flying-truck")' });
      }
      
      const slugExists = await prisma.publicLink.findUnique({
        where: { slug },
      });

      if (slugExists) {
        return res.status(409).json({ error: 'This link slug is already in use. Please choose a different one.' });
      }
    } else {
      let attempts = 0;
      const maxAttempts = 20;
      
      while (attempts < maxAttempts) {
        slug = generateSlug();
        const slugExists = await prisma.publicLink.findUnique({
          where: { slug },
        });
        
        if (!slugExists) break;
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        return res.status(500).json({ error: 'Failed to generate unique link' });
      }
    }

    let expiration: Date | null = null;
    if (expiresAt) {
      expiration = new Date(expiresAt);
      if (isNaN(expiration.getTime()) || expiration < new Date()) {
        return res.status(400).json({ error: 'Invalid expiration date. Must be in the future.' });
      }
    }

    const publicLink = await prisma.publicLink.create({
      data: {
        slug: slug!,
        fileId,
        userId,
        expiresAt: expiration,
      },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            type: true,
            size: true,
            mimeType: true,
            path: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    logger.info('Public link created', { fileId, userId, slug });

    res.json({
      ...publicLink,
      file: serializeFile(publicLink.file),
    });
  } catch (error) {
    logger.error('Error creating public link:', error);
    res.status(500).json({ error: 'Failed to create public link' });
  }
});

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const links = await prisma.publicLink.findMany({
      where: { userId },
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
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const validLinks = links.filter(link => !link.file.deletedAt);

    res.json(validLinks.map(link => ({
      ...link,
      file: serializeFile(link.file),
    })));
  } catch (error) {
    logger.error('Error listing public links:', error);
    res.status(500).json({ error: 'Failed to list public links' });
  }
});

router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const { slug, expiresAt } = req.body;

    const link = await prisma.publicLink.findFirst({
      where: { id, userId },
    });

    if (!link) {
      return res.status(404).json({ error: 'Public link not found' });
    }

    const updateData: any = {};

    if (slug !== undefined) {
      if (!isValidSlug(slug)) {
        return res.status(400).json({ error: 'Invalid slug format. Use lowercase letters and hyphens only (e.g., "flying-truck")' });
      }
      
      if (slug !== link.slug) {
        const slugExists = await prisma.publicLink.findUnique({
          where: { slug },
        });
        
        if (slugExists) {
          return res.status(409).json({ error: 'This link slug is already in use. Please choose a different one.' });
        }
        
        updateData.slug = slug;
      }
    }

    if (expiresAt !== undefined) {
      if (expiresAt === null) {
        updateData.expiresAt = null;
      } else {
        const expiration = new Date(expiresAt);
        if (isNaN(expiration.getTime()) || expiration < new Date()) {
          return res.status(400).json({ error: 'Invalid expiration date. Must be in the future.' });
        }
        updateData.expiresAt = expiration;
      }
    }

    const updated = await prisma.publicLink.update({
      where: { id },
      data: updateData,
      include: {
        file: {
          select: {
            id: true,
            name: true,
            type: true,
            size: true,
            mimeType: true,
            path: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    res.json({
      ...updated,
      file: serializeFile(updated.file),
    });
  } catch (error) {
    logger.error('Error updating public link:', error);
    res.status(500).json({ error: 'Failed to update public link' });
  }
});

router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    const link = await prisma.publicLink.findFirst({
      where: { id, userId },
    });

    if (!link) {
      return res.status(404).json({ error: 'Public link not found' });
    }

    await prisma.publicLink.delete({ where: { id } });

    logger.info('Public link deleted', { id, userId, slug: link.slug });

    res.json({ message: 'Public link deleted successfully' });
  } catch (error) {
    logger.error('Error deleting public link:', error);
    res.status(500).json({ error: 'Failed to delete public link' });
  }
});

router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const link = await prisma.publicLink.findUnique({
      where: { slug },
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
            createdAt: true,
            updatedAt: true,
            userId: true,
            encrypted: true,
          },
        },
        user: {
          select: {
            encryptionKey: true,
          },
        },
      },
    });

    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    if (link.file.deletedAt) {
      return res.status(404).json({ error: 'File no longer available' });
    }

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'Link has expired' });
    }

    res.json({
      slug: link.slug,
      file: serializeFile(link.file),
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
    });
  } catch (error) {
    logger.error('Error fetching public link:', error);
    res.status(500).json({ error: 'Failed to fetch public link' });
  }
});

router.get('/:slug/download', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const link = await prisma.publicLink.findUnique({
      where: { slug },
      include: {
        file: {
          include: {
            chunks: {
              orderBy: { chunkIndex: 'asc' },
            },
          },
        },
        user: {
          select: {
            encryptionKey: true,
          },
        },
      },
    });

    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    if (link.file.deletedAt) {
      return res.status(404).json({ error: 'File no longer available' });
    }

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'Link has expired' });
    }

    if (link.file.type !== 'FILE') {
      return res.status(400).json({ error: 'Cannot download a folder directly' });
    }

    const chunks = link.file.chunks;
    if (!chunks || chunks.length === 0) {
      return res.status(404).json({ error: 'File chunks not found' });
    }

    res.setHeader('Content-Type', link.file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(link.file.name)}"`);
    res.setHeader('Content-Length', link.file.size.toString());

    for (const chunk of chunks) {
      try {
        let buffer = await downloadChunkFromDiscord(chunk.messageId, chunk.channelId);
        
        if (link.file.encrypted && link.user.encryptionKey) {
          buffer = decryptBuffer(buffer, link.user.encryptionKey);
        }

        if (!res.write(buffer)) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      } catch (chunkError) {
        logger.error(`Error downloading chunk ${chunk.chunkIndex}:`, chunkError);
        if (!res.headersSent) {
          return res.status(500).json({ error: 'Failed to download file' });
        }
        res.end();
        return;
      }
    }

    res.end();
    logger.info('Public file downloaded', { fileId: link.file.id, slug });
  } catch (error) {
    logger.error('Error downloading public file:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download file' });
    }
  }
});

router.get('/:slug/folder', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { folderId } = req.query;

    const link = await prisma.publicLink.findUnique({
      where: { slug },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            type: true,
            path: true,
            deletedAt: true,
            userId: true,
          },
        },
      },
    });

    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    if (link.file.deletedAt) {
      return res.status(404).json({ error: 'File no longer available' });
    }

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'Link has expired' });
    }

    if (link.file.type !== 'DIRECTORY') {
      return res.status(400).json({ error: 'Not a folder' });
    }

    const targetFolderId = folderId || link.file.id;

    const targetFolder = await prisma.file.findFirst({
      where: {
        id: targetFolderId as string,
        userId: link.file.userId,
        deletedAt: null,
      },
    });

    if (!targetFolder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const isDescendant = async (childId: string, ancestorId: string): Promise<boolean> => {
      if (childId === ancestorId) return true;
      
      const child = await prisma.file.findUnique({
        where: { id: childId },
        select: { parentId: true },
      });
      
      if (!child || !child.parentId) return false;
      return isDescendant(child.parentId, ancestorId);
    };

    const hasAccess = await isDescendant(targetFolder.id, link.file.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const files = await prisma.file.findMany({
      where: {
        parentId: targetFolderId as string,
        userId: link.file.userId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        mimeType: true,
        path: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { type: 'desc' },
        { name: 'asc' },
      ],
    });

    res.json(files.map(serializeFile));
  } catch (error) {
    logger.error('Error fetching public folder contents:', error);
    res.status(500).json({ error: 'Failed to fetch folder contents' });
  }
});

router.get('/:slug/file/:fileId/download', async (req: Request, res: Response) => {
  try {
    const { slug, fileId } = req.params;

    const link = await prisma.publicLink.findUnique({
      where: { slug },
      include: {
        file: {
          select: {
            id: true,
            type: true,
            deletedAt: true,
            userId: true,
          },
        },
      },
    });

    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    if (link.file.deletedAt) {
      return res.status(404).json({ error: 'File no longer available' });
    }

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'Link has expired' });
    }

    if (link.file.type !== 'DIRECTORY') {
      return res.status(400).json({ error: 'Base link is not a folder' });
    }

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        userId: link.file.userId,
        deletedAt: null,
        type: 'FILE',
      },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const isDescendant = async (childId: string, ancestorId: string): Promise<boolean> => {
      if (childId === ancestorId) return true;
      
      const child = await prisma.file.findUnique({
        where: { id: childId },
        select: { parentId: true },
      });
      
      if (!child || !child.parentId) return false;
      return isDescendant(child.parentId, ancestorId);
    };

    const hasAccess = await isDescendant(file.id, link.file.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const chunks = file.chunks;
    if (!chunks || chunks.length === 0) {
      return res.status(404).json({ error: 'File chunks not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: link.file.userId },
      select: { encryptionKey: true },
    });

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Length', file.size.toString());

    for (const chunk of chunks) {
      try {
        let buffer = await downloadChunkFromDiscord(chunk.messageId, chunk.channelId);
        
        if (file.encrypted && user?.encryptionKey) {
          buffer = decryptBuffer(buffer, user.encryptionKey);
        }

        if (!res.write(buffer)) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      } catch (chunkError) {
        logger.error(`Error downloading chunk ${chunk.chunkIndex}:`, chunkError);
        if (!res.headersSent) {
          return res.status(500).json({ error: 'Failed to download file' });
        }
        res.end();
        return;
      }
    }

    res.end();
    logger.info('Public folder file downloaded', { fileId, slug });
  } catch (error) {
    logger.error('Error downloading public folder file:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download file' });
    }
  }
});

export default router;
