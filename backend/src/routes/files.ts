import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { uploadChunkToDiscord, downloadChunkFromDiscord, deleteChunkFromDiscord } from '../services/discord';
import { logger } from '../utils/logger';
import { encryptBuffer, decryptBuffer, generateEncryptionKey } from '../utils/crypto';
import multer from 'multer';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

const CHUNK_SIZE = 9 * 1024 * 1024; // 9MB chunks (Discord limit ~10MB, keep margin for overhead)

// Helper to split name and extension
function splitName(name: string) {
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1) return { base: name, ext: '' };
  return { base: name.substring(0, lastDot), ext: name.substring(lastDot) };
}

// Compute a unique filename within a parent folder for a user by appending
// " (1)", " (2)", ... before the extension when conflicts exist.
// Generate a unique filename by checking the full `path` uniqueness (userId + path).
// `parentPath` is the parent folder's full path (e.g. "/photos/2025"). If null, file will be created at root.
async function getUniqueName(userId: string, parentPath: string | null, desiredName: string, excludeId?: string) {
  const { base, ext } = splitName(desiredName);
  let newName = desiredName;
  let counter = 1;
  while (true) {
    const candidatePath = parentPath ? `${parentPath}/${newName}` : `/${newName}`;
    const existing = await prisma.file.findFirst({
      where: {
        userId,
        path: candidatePath,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (!existing) break;
    newName = `${base} (${counter})${ext}`;
    counter += 1;
  }
  return newName;
}

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
    const { path, parentId, encrypt } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Get user's encryption key if encryption is requested
    let encryptionKey: string | null = null;
    const shouldEncrypt = encrypt === 'true' || encrypt === true;
    
    if (shouldEncrypt) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user?.encryptionKey) {
        // Generate encryption key for user if not exists
        encryptionKey = generateEncryptionKey();
        await prisma.user.update({
          where: { id: userId },
          data: { encryptionKey },
        });
      } else {
        encryptionKey = user.encryptionKey;
      }
    }

    // Ensure filename is unique within the target parent folder.
    // Resolve the parent path string (use explicit `path` if provided, otherwise derive it from `parentId`).
    const originalName = file.originalname;
    let parentPath: string | null = null;
    if (path) {
      parentPath = path as string;
    } else if (parentId) {
      const parent = await prisma.file.findUnique({ where: { id: parentId }, select: { path: true } });
      parentPath = parent?.path || null;
    } else {
      parentPath = null;
    }

    // Try to create the file record; if unique constraint fails, retry with a new unique name.
    let fileRecord: any = null;
    let uniqueName = await getUniqueName(userId, parentPath, originalName);
    const maxAttempts = 5;
    let attempt = 0;
    while (!fileRecord && attempt < maxAttempts) {
      try {
        // computePath should include the current uniqueName so retries change the path too
        const computedPath = parentPath ? `${parentPath}/${uniqueName}` : `/${uniqueName}`;

        fileRecord = await prisma.file.create({
          data: {
            name: uniqueName,
            path: computedPath,
            size: BigInt(file.size),
            mimeType: file.mimetype,
            type: 'FILE',
            encrypted: shouldEncrypt,
            userId,
            parentId: targetParentId,
          },
        });
      } catch (createErr: any) {
        // Prisma unique constraint on (userId, path) — generate another unique name and retry
        if (createErr?.code === 'P2002') {
          logger.warn('Unique constraint on file path, retrying with a different name');
          uniqueName = await getUniqueName(userId, parentPath, originalName);
          attempt += 1;
          continue;
        }
        throw createErr;
      }
    }

    if (!fileRecord) {
      throw new Error('Failed to create unique file record after multiple attempts');
    }

    // Process file buffer - encrypt if needed
    let processedBuffer = file.buffer;
    if (shouldEncrypt && encryptionKey) {
      processedBuffer = encryptBuffer(file.buffer, encryptionKey);
      logger.info(`File encrypted: ${file.originalname}`);
    }

    // Split file into chunks and upload to Discord. Use a sequential chunkCounter
    // so chunkIndex increases for each stored piece regardless of slicing.
    const chunks: any[] = [];
    const uploadName = fileRecord.name;

    try {
      let offset = 0;
      let chunkCounter = 0;
      while (offset < processedBuffer.length) {
        const end = Math.min(offset + CHUNK_SIZE, processedBuffer.length);
        const chunkBuffer = processedBuffer.slice(offset, end);
        const filename = `${fileRecord.id}_chunk_${chunkCounter}_${uploadName}`;

        logger.info(`Uploading chunk ${chunkCounter + 1} for file ${uploadName} (bytes=${chunkBuffer.length})`);

        const { messageId, attachmentUrl, channelId } = await uploadChunkToDiscord(
          filename,
          chunkBuffer
        );

        const chunk = await prisma.fileChunk.create({
          data: {
            fileId: fileRecord.id,
            chunkIndex: chunkCounter,
            messageId,
            channelId,
            attachmentUrl,
            size: chunkBuffer.length,
          },
        });

        chunks.push(chunk);

        chunkCounter += 1;
        offset = end;
      }
    } catch (uploadError: any) {
      logger.error(`Failed uploading chunks for file ${fileRecord.id}:`, uploadError);
      // Attempt to clean up any uploaded chunks (best-effort)
      try {
        await prisma.fileChunk.deleteMany({ where: { fileId: fileRecord.id } });
      } catch (cleanupErr) {
        logger.warn('Failed to cleanup file chunks after upload error:', cleanupErr);
      }

      try {
        await prisma.file.delete({ where: { id: fileRecord.id } });
      } catch (cleanupErr) {
        logger.warn('Failed to delete file record after upload error:', cleanupErr);
      }

      return res.status(500).json({ error: `Failed to upload file: ${uploadError?.message || uploadError}` });
    }

    logger.info(`File uploaded successfully: ${uploadName} (${chunks.length} chunks)`);

    // Return the created file (with stored name) and chunk count
    const storedFile = await prisma.file.findUnique({ where: { id: fileRecord.id } });

    res.json({
      file: serializeFile(storedFile),
      chunks: chunks.length,
      storedName: uploadName,
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
        user: {
          select: { encryptionKey: true },
        },
      },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Collect all chunks
    const chunkBuffers: Buffer[] = [];
    for (const chunk of file.chunks) {
      const buffer = await downloadChunkFromDiscord(chunk.messageId, chunk.channelId);
      chunkBuffers.push(buffer);
    }
    
    // Buffer.concat may produce Buffer<ArrayBufferLike> depending on lib types; cast to plain Buffer
    let fileData = Buffer.concat(chunkBuffers) as unknown as Buffer;

    // Decrypt if encrypted
    if (file.encrypted && file.user.encryptionKey) {
      try {
        fileData = decryptBuffer(fileData, file.user.encryptionKey);
        logger.info(`File decrypted: ${file.name}`);
      } catch (decryptError) {
        logger.error('Decryption failed:', decryptError);
        return res.status(500).json({ error: 'Failed to decrypt file' });
      }
    }

    // Sanitize filename to prevent header injection
    const sanitizedName = file.name.replace(/["\r\n\\]/g, '_');
    
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedName}"`);
    res.setHeader('Content-Length', fileData.length.toString());

    res.send(fileData);
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
    if (file.chunks && file.chunks.length > 0) {
      for (const chunk of file.chunks) {
        try {
          await deleteChunkFromDiscord(chunk.messageId, chunk.channelId);
        } catch (discordError) {
          logger.warn(`Failed to delete chunk ${chunk.id} from Discord:`, discordError);
          // Continue anyway - chunk might already be deleted
        }
      }
    }

    // Delete chunks from database first (foreign key constraint)
    await prisma.fileChunk.deleteMany({ where: { fileId: id } });

    // Delete file from database
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

    // Ensure new name is unique within the same parent folder (exclude current file)
    const parentOfFile = file.parentId || null;
    const uniqueName = await getUniqueName(userId, parentOfFile, name, id);

    const updatedFile = await prisma.file.update({
      where: { id },
      data: { name: uniqueName, updatedAt: new Date() },
    });

    res.json(serializeFile(updatedFile));
  } catch (error) {
    logger.error('Error renaming file:', error);
    res.status(500).json({ error: 'Failed to rename file' });
  }
});

// Move file
router.patch('/:id/move', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const { parentId } = req.body;

    const file = await prisma.file.findFirst({
      where: { id, userId },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Verify target folder exists if specified
    if (parentId) {
      const targetFolder = await prisma.file.findFirst({
        where: { id: parentId, userId, type: 'DIRECTORY' },
      });

      if (!targetFolder) {
        return res.status(404).json({ error: 'Target folder not found' });
      }

      // Prevent moving folder into itself or its children
      if (file.type === 'DIRECTORY') {
        const isChild = await isChildOf(id, parentId);
        if (isChild || id === parentId) {
          return res.status(400).json({ error: 'Cannot move folder into itself or its child' });
        }
      }
    }

    // If moving into same folder, nothing to do
    const targetParent = parentId || null;

    // Ensure name uniqueness in target folder (exclude the file itself)
    const uniqueName = await getUniqueName(userId, targetParent, file.name, id);

    const updatedFile = await prisma.file.update({
      where: { id },
      data: { parentId: targetParent, name: uniqueName, updatedAt: new Date() },
    });

    res.json(serializeFile(updatedFile));
  } catch (error) {
    logger.error('Error moving file:', error);
    res.status(500).json({ error: 'Failed to move file' });
  }
});

// Get all folders (for move dialog)
router.get('/folders/all', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const folders = await prisma.file.findMany({
      where: { userId, type: 'DIRECTORY' },
      select: {
        id: true,
        name: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json(folders);
  } catch (error) {
    logger.error('Error listing folders:', error);
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

// Helper function to check if targetId is a child of sourceId
async function isChildOf(sourceId: string, targetId: string): Promise<boolean> {
  const target = await prisma.file.findUnique({
    where: { id: targetId },
    select: { parentId: true },
  });

  if (!target || !target.parentId) return false;
  if (target.parentId === sourceId) return true;
  return isChildOf(sourceId, target.parentId);
}

export default router;
