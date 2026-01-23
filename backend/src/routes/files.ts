import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { uploadChunkToDiscord, downloadChunkFromDiscord, deleteChunkFromDiscord } from '../services/discord';
import { logger } from '../utils/logger';
import { encryptBuffer, decryptBuffer, generateEncryptionKey } from '../utils/crypto';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
// Import Busboy with interop guard (handles CJS vs ESM default export)
// @ts-ignore
const RawBusboy = require('busboy');
// Prefer the default export, then commonjs export, then common alternate shapes
const Busboy = (RawBusboy && (RawBusboy.default || RawBusboy || (RawBusboy as any).Busboy || (RawBusboy as any).busboy)) as any;
try {
  logger.info('Busboy inspect', {
    typeofRaw: typeof RawBusboy,
    rawKeys: Object.keys(RawBusboy || {}),
    typeofBusboy: typeof Busboy,
    busboyIsFunction: typeof Busboy === 'function',
  });
} catch (e) {
  // ignore logging errors at module load
}
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();
// Use disk storage to avoid buffering large files in memory on the Pi
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname}`;
      cb(null, unique);
    },
  }),
});

const CHUNK_SIZE = 9 * 1024 * 1024; // 9MB chunks (Discord limit ~10MB, keep margin for overhead)

// Helper to split name and extension
function splitName(name: string) {
  // Coerce to string to guard against unexpected types from multipart parsers
  name = String(name || '');
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
    // Prefer the explicit parentId (server-side source of truth) when provided.
    // If parentId is present, derive the parentPath from the DB and ignore any
    // client-supplied `path` value to avoid mismatches that can lead to
    // duplicate-name anomalies.
    if (parentId) {
      const parent = await prisma.file.findUnique({ where: { id: parentId }, select: { path: true } });
      parentPath = parent?.path || null;
    } else if (path) {
      parentPath = path as string;
    } else {
      parentPath = null;
    }

    // numeric/null parent id to store in DB
    const targetParentId = parentId || null;

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

    // Process file on disk to avoid high memory usage. We will read the
    // uploaded temp file in CHUNK_SIZE blocks and stream each block to
    // Discord. If encryption is requested we create a temporary encrypted
    // file on disk (streaming encryption would be ideal, but the current
    // helper operates on buffers so we write an encrypted temp file).
    const tmpPath = (file as any).path as string;
    let processingPath = tmpPath;
    const chunks: any[] = [];
    const uploadName = fileRecord.name;

    try {
      // If encryption requested, read file and write encrypted temp file
      if (shouldEncrypt && encryptionKey) {
        logger.info(`Encrypting uploaded file to temp file: ${file.originalname}`);
        const raw = await fs.promises.readFile(tmpPath);
        const encrypted = encryptBuffer(raw, encryptionKey);
        const encPath = `${tmpPath}.enc`;
        await fs.promises.writeFile(encPath, encrypted);
        processingPath = encPath;
      }

      const fd = await fs.promises.open(processingPath, 'r');
      const stat = await fd.stat();
      const totalSize = stat.size;

      let offset = 0;
      let chunkCounter = 0;

      while (offset < totalSize) {
        const readSize = Math.min(CHUNK_SIZE, totalSize - offset);
        const buffer = Buffer.alloc(readSize);
        await fd.read(buffer, 0, readSize, offset);

        const filename = `${fileRecord.id}_chunk_${chunkCounter}_${uploadName}`;
        logger.info(`Uploading chunk ${chunkCounter + 1} for file ${uploadName} (bytes=${buffer.length})`);

        const { messageId, attachmentUrl, channelId } = await uploadChunkToDiscord(
          filename,
          buffer
        );

        const chunk = await prisma.fileChunk.create({
          data: {
            fileId: fileRecord.id,
            chunkIndex: chunkCounter,
            messageId,
            channelId,
            attachmentUrl,
            size: buffer.length,
          },
        });

        chunks.push(chunk);

        // Move to next chunk
        chunkCounter += 1;
        offset += readSize;
      }

      await fd.close();

      // Clean up temp files (original upload and encrypted temp if created)
      try {
        if (processingPath && processingPath !== tmpPath) {
          await fs.promises.unlink(processingPath);
        }
        if (tmpPath) {
          await fs.promises.unlink(tmpPath);
        }
      } catch (rmErr) {
        logger.warn('Failed to remove temp upload files:', rmErr);
      }

      logger.info(`File uploaded successfully: ${uploadName} (${chunks.length} chunks)`);

      // Return the created file (with stored name) and chunk count
      const storedFile = await prisma.file.findUnique({ where: { id: fileRecord.id } });

      return res.json({
        file: serializeFile(storedFile),
        chunks: chunks.length,
        storedName: uploadName,
      });
    } catch (uploadError: any) {
      logger.error(`Failed uploading chunks for file ${fileRecord.id}:`, uploadError);

      // Attempt to clean up any uploaded chunks (best-effort)
      try {
        // Delete discord messages for created chunks
        const uploadedChunks = await prisma.fileChunk.findMany({ where: { fileId: fileRecord.id } });
        for (const c of uploadedChunks) {
          try {
            await deleteChunkFromDiscord(c.messageId, c.channelId);
          } catch (e) {
            logger.warn('Failed to delete chunk from Discord during rollback:', e);
          }
        }
        await prisma.fileChunk.deleteMany({ where: { fileId: fileRecord.id } });
      } catch (cleanupErr) {
        logger.warn('Failed to cleanup file chunks after upload error:', cleanupErr);
      }

      try {
        await prisma.file.delete({ where: { id: fileRecord.id } });
      } catch (cleanupErr) {
        logger.warn('Failed to delete file record after upload error:', cleanupErr);
      }

      // Remove any temp files
      try {
        if (processingPath && processingPath !== tmpPath) {
          await fs.promises.unlink(processingPath).catch(() => null);
        }
        if (tmpPath) {
          await fs.promises.unlink(tmpPath).catch(() => null);
        }
      } catch (rmErr) {
        logger.warn('Failed to remove temp files during rollback:', rmErr);
      }

      return res.status(500).json({ error: `Failed to upload file: ${uploadError?.message || uploadError}` });
    }
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
    let parentPath: string | null = null;
    if (file.parentId) {
      const parent = await prisma.file.findUnique({ where: { id: file.parentId }, select: { path: true } });
      parentPath = parent?.path || null;
    } else {
      parentPath = null;
    }
    const uniqueName = await getUniqueName(userId, parentPath, name, id);

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
    let targetFolder: any = null;
    if (parentId) {
      targetFolder = await prisma.file.findFirst({
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

    // Determine target parent path for uniqueness checks
    const targetParentPath = targetFolder ? targetFolder.path : null;

    // Ensure name uniqueness in target folder (exclude the file itself)
    const uniqueName = await getUniqueName(userId, targetParentPath, file.name, id);

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

// Streaming upload endpoint (starts uploading chunks to Discord while client uploads)
router.post('/upload/stream', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    let bb: any;
    try {
      bb = new Busboy({ headers: req.headers });
      logger.info('Busboy constructed with `new`');
    } catch (e) {
      try {
        // Some module shapes export a factory function instead of a constructable class
        bb = Busboy({ headers: req.headers });
        logger.info('Busboy constructed by calling function');
      } catch (callErr) {
        logger.error('Failed to initialize Busboy (new and call both failed):', callErr);
        throw callErr;
      }
    }

    let parentId: string | null = null;
    let parentPath: string | null = null;
    let shouldEncrypt = false;
    let encryptionKey: string | null = null;

    let fileProcessed = false;

    // Will hold the created file record
    let fileRecord: any = null;
    const chunks: any[] = [];

    // gather fields
    bb.on('field', async (fieldname: string, val: string) => {
      if (fieldname === 'parentId') parentId = val || null;
      if (fieldname === 'path') parentPath = val || null;
      if (fieldname === 'encrypt') shouldEncrypt = val === 'true';
    });

    bb.on('file', (fieldname: string, fileStream: any, filename: any, encoding: string, mimetype: string) => {
      (async () => {
        try {
          // Resolve parentPath from DB if parentId provided (server authoritative)
          if (parentId) {
            const parent = await prisma.file.findUnique({ where: { id: parentId }, select: { path: true } });
            parentPath = parent?.path || null;
          }

          // Prepare encryption key if requested
          if (shouldEncrypt) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user?.encryptionKey) {
              encryptionKey = generateEncryptionKey();
              await prisma.user.update({ where: { id: userId }, data: { encryptionKey } });
            } else {
              encryptionKey = user.encryptionKey;
            }
          }

            // Normalize filename: some Busboy builds pass an object with { filename, encoding, mimeType }
            // instead of a plain string. Extract `.filename` when present, otherwise coerce to string.
            const originalName = (typeof filename === 'string')
              ? filename
              : (filename && typeof filename.filename === 'string')
                ? filename.filename
                : String(filename || 'file');
          let uniqueName = await getUniqueName(userId, parentPath, originalName);
          const maxAttempts = 5;
          let attempt = 0;
          while (!fileRecord && attempt < maxAttempts) {
            try {
              const computedPath = parentPath ? `${parentPath}/${uniqueName}` : `/${uniqueName}`;
              fileRecord = await prisma.file.create({
                data: {
                  name: uniqueName,
                  path: computedPath,
                  size: BigInt(0), // will update later
                  mimeType: mimetype,
                  type: 'FILE',
                  encrypted: shouldEncrypt,
                  userId,
                  parentId: parentId || null,
                },
              });
            } catch (createErr: any) {
              if (createErr?.code === 'P2002') {
                uniqueName = await getUniqueName(userId, parentPath, originalName);
                attempt += 1;
                continue;
              }
              throw createErr;
            }
          }

          if (!fileRecord) throw new Error('Failed to create file record');

          // Centralized handler to cleanup and respond on stream errors
          const handleStreamError = async (err: any) => {
            logger.error('Stream upload error (handler):', err);
            try {
              if (fileRecord) {
                const uploaded = await prisma.fileChunk.findMany({ where: { fileId: fileRecord.id } });
                for (const c of uploaded) {
                  try { await deleteChunkFromDiscord(c.messageId, c.channelId); } catch (_) {}
                }
                await prisma.fileChunk.deleteMany({ where: { fileId: fileRecord.id } });
                await prisma.file.delete({ where: { id: fileRecord.id } });
              }
            } catch (cleanupErr) {
              logger.warn('Cleanup after stream error failed (handler):', cleanupErr);
            }
            try { fileStream.destroy(); } catch (_) {}
            if (!res.headersSent) res.status(500).json({ error: `Streaming upload failed: ${err?.message || err}` });
          };

          logger.info(`Streaming upload started: user=${userId} fileId=${fileRecord.id} name=${fileRecord.name} parent=${parentPath}`);

          // Stream processing: accumulate until CHUNK_SIZE, then send
          let bufferQueue: Buffer[] = [];
          let bufferedBytes = 0;
          let chunkCounter = 0;
          let totalBytes = 0;

          // helper to flush a chunk (plaintext chunkBuffer)
          const flushChunk = async (chunkBuffer: Buffer) => {
            // optionally encrypt per-chunk
            let toSend = chunkBuffer;
            if (shouldEncrypt && encryptionKey) {
              try {
                toSend = encryptBuffer(chunkBuffer, encryptionKey);
              } catch (encErr) {
                logger.error('Encryption failed for chunk:', encErr);
                throw encErr;
              }
            }

            const filenameForDiscord = `${fileRecord.id}_chunk_${chunkCounter}_${fileRecord.name}`;
            logger.info(`Streaming: uploading chunk ${chunkCounter} for file ${fileRecord.id} (bytes=${toSend.length}) to Discord`);

            // pause stream while uploading to reduce memory pressure
            fileStream.pause();
            try {
              let uploadRes;
              try {
                uploadRes = await uploadChunkToDiscord(filenameForDiscord, toSend);
              } catch (uErr) {
                logger.error(`Discord upload failed for chunk ${chunkCounter} of file ${fileRecord.id}:`, uErr);
                throw uErr;
              }

              const { messageId, attachmentUrl, channelId } = uploadRes;

              const created = await prisma.fileChunk.create({
                data: {
                  fileId: fileRecord.id,
                  chunkIndex: chunkCounter,
                  messageId,
                  channelId,
                  attachmentUrl,
                  size: chunkBuffer.length,
                },
              });
              chunks.push(created);
              logger.info(`Streaming: chunk ${chunkCounter} stored (messageId=${messageId})`);
              chunkCounter += 1;
            } finally {
              fileStream.resume();
            }
          };

          fileStream.on('data', (data: Buffer) => {
            (async () => {
              try {
                bufferQueue.push(data);
                bufferedBytes += data.length;
                totalBytes += data.length;

                // while we have at least CHUNK_SIZE, extract and send
                while (bufferedBytes >= CHUNK_SIZE) {
                  // build chunkBuffer of CHUNK_SIZE
                  const chunkBuffer = Buffer.alloc(CHUNK_SIZE);
                  let offset = 0;
                  while (offset < CHUNK_SIZE) {
                    const head = bufferQueue[0];
                    const need = Math.min(head.length, CHUNK_SIZE - offset);
                    head.copy(chunkBuffer, offset, 0, need);
                    if (need === head.length) {
                      bufferQueue.shift();
                    } else {
                      bufferQueue[0] = head.slice(need);
                    }
                    offset += need;
                  }
                  bufferedBytes -= CHUNK_SIZE;
                  await flushChunk(chunkBuffer);
                }
              } catch (e) {
                await handleStreamError(e);
              }
            })();
          });

          fileStream.on('end', () => {
            (async () => {
              try {
                // flush remaining bytes as final chunk
                if (bufferedBytes > 0) {
                  const finalBuffer = Buffer.concat(bufferQueue, bufferedBytes);
                  await flushChunk(finalBuffer);
                }

                // update file record size
                try {
                  await prisma.file.update({ where: { id: fileRecord.id }, data: { size: BigInt(totalBytes) } });
                } catch (e) {
                  logger.warn('Failed to update file size:', e);
                }

                fileProcessed = true;
                logger.info(`Streaming upload complete for file ${fileRecord.id}, chunks=${chunks.length}`);
                // respond now (but busboy 'finish' will also fire)
                if (!res.headersSent) {
                  res.json({ file: serializeFile(await prisma.file.findUnique({ where: { id: fileRecord.id } })), chunks: chunks.length, storedName: fileRecord.name });
                }
              } catch (e) {
                await handleStreamError(e);
              }
            })();
          });

          fileStream.on('error', async (err: any) => {
            await handleStreamError(err);
          });
        } catch (err) {
          logger.error('Stream upload error:', err);
          // best-effort cleanup
          try {
            if (fileRecord) {
              const uploaded = await prisma.fileChunk.findMany({ where: { fileId: fileRecord.id } });
              for (const c of uploaded) {
                try { await deleteChunkFromDiscord(c.messageId, c.channelId); } catch (_) {}
              }
              await prisma.fileChunk.deleteMany({ where: { fileId: fileRecord.id } });
              await prisma.file.delete({ where: { id: fileRecord.id } });
            }
          } catch (cleanupErr) {
            logger.warn('Cleanup after stream error failed:', cleanupErr);
          }
          if (!res.headersSent) res.status(500).json({ error: 'Streaming upload failed' });
        }
      })();
    });

    bb.on('finish', () => {
      // Defer finish handling to allow file 'end' handlers to run first.
      setImmediate(() => {
        // Only respond with 400 if no file was started and no file processed.
        // Some Busboy builds fire 'finish' before async file handlers complete,
        // so checking `fileRecord` (created early) prevents premature 400s.
        if (!fileRecord && !fileProcessed && !res.headersSent) {
          return res.status(400).json({ error: 'No file uploaded' });
        }
      });
    });

    req.pipe(bb);
  } catch (error) {
    logger.error('Error in streaming upload endpoint:', error);
    res.status(500).json({ error: 'Failed to handle streaming upload' });
  }
});
