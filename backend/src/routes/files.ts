import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { uploadChunkToDiscord, downloadChunkFromDiscord, deleteChunkFromDiscord } from '../services/discord';
import { logger } from '../utils/logger';
import multer from 'multer';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks (Discord limit is 25MB, but requests have overhead)

// Helper to convert BigInt to string for JSON serialization
function serializeFile(file: any): any {
  if (!file) return file;
  return {
    ...file,
    size: file.size?.toString() || '0',
    children: file.children?.map(serializeFile),
    chunks: file.chunks?.map((c: any) => ({ ...c, size: c.size?.toString() || '0' })),
  };
}

// List files
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { path, parentId } = req.query;

    const where: any = { userId };
    
    if (path) {
      where.path = path;
    } else if (parentId) {
      where.parentId = parentId;
    } else {
      where.parentId = null; // Root level
    }

    const files = await prisma.file.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { type: 'desc' }, // Directories first
        { name: 'asc' },
      ],
    });

    res.json(files.map(serializeFile));
  } catch (error) {
    logger.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Get file details
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    const file = await prisma.file.findFirst({
      where: { id, userId },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(serializeFile(file));
  } catch (error) {
    logger.error('Error getting file:', error);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// Upload file
router.post('/upload', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { path, parentId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Create file record
    const fileRecord = await prisma.file.create({
      data: {
        name: file.originalname,
        path: path || `/${file.originalname}`,
        size: BigInt(file.size),
        mimeType: file.mimetype,
        type: 'FILE',
        userId,
        parentId: parentId || null,
      },
    });

    // Split file into chunks and upload to Discord
    const buffer = file.buffer;
    const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
    const chunks = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, buffer.length);
      const chunkBuffer = buffer.slice(start, end);
      const filename = `${fileRecord.id}_chunk_${i}_${file.originalname}`;

      logger.info(`Uploading chunk ${i + 1}/${totalChunks} for file ${file.originalname}`);

      const { messageId, attachmentUrl, channelId } = await uploadChunkToDiscord(
        filename,
        chunkBuffer
      );

      const chunk = await prisma.fileChunk.create({
        data: {
          fileId: fileRecord.id,
          chunkIndex: i,
          messageId,
          channelId,
          attachmentUrl,
          size: chunkBuffer.length,
        },
      });

      chunks.push(chunk);
    }

    logger.info(`File uploaded successfully: ${file.originalname} (${chunks.length} chunks)`);

    res.json({
      file: serializeFile(fileRecord),
      chunks: chunks.length,
    });
  } catch (error) {
    logger.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Download file
router.get('/:id/download', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    const file = await prisma.file.findFirst({
      where: { id, userId, type: 'FILE' },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Content-Length', file.size.toString());

    // Stream chunks
    for (const chunk of file.chunks) {
      const buffer = await downloadChunkFromDiscord(chunk.messageId, chunk.channelId);
      res.write(buffer);
    }

    res.end();
  } catch (error) {
    logger.error('Error downloading file:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download file' });
    }
  }
});

// Create directory
router.post('/directory', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { name, path, parentId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Directory name is required' });
    }

    const directory = await prisma.file.create({
      data: {
        name,
        path: path || `/${name}`,
        type: 'DIRECTORY',
        userId,
        parentId: parentId || null,
      },
    });

    res.json(serializeFile(directory));
  } catch (error) {
    logger.error('Error creating directory:', error);
    res.status(500).json({ error: 'Failed to create directory' });
  }
});

// Delete file or directory
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    const file = await prisma.file.findFirst({
      where: { id, userId },
      include: {
        chunks: true,
        children: true,
      },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.type === 'DIRECTORY' && file.children.length > 0) {
      return res.status(400).json({ error: 'Directory is not empty' });
    }

    // Delete chunks from Discord
    if (file.chunks.length > 0) {
      for (const chunk of file.chunks) {
        await deleteChunkFromDiscord(chunk.messageId, chunk.channelId);
      }
    }

    // Delete from database
    await prisma.file.delete({ where: { id } });

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    logger.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Rename file
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const file = await prisma.file.findFirst({
      where: { id, userId },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const updatedFile = await prisma.file.update({
      where: { id },
      data: { name, updatedAt: new Date() },
    });

    res.json(serializeFile(updatedFile));
  } catch (error) {
    logger.error('Error renaming file:', error);
    res.status(500).json({ error: 'Failed to rename file' });
  }
});

export default router;
