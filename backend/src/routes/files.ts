import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import { uploadChunkToDiscord, downloadChunkFromDiscord, deleteChunkFromDiscord, DISCORD_MAX } from '../services/discord';
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

// Use 8MB chunks to stay safely under Discord attachment size limits.
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

// small helper for delays (used for retry backoff)
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// Helper to split name and extension
function splitName(name: string) {
  // Coerce to string to guard against unexpected types from multipart parsers
  name = String(name || '');
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1) return { base: name, ext: '' };
  return { base: name.substring(0, lastDot), ext: name.substring(lastDot) };
}

// Split a Buffer into parts no larger than `partSize`
function splitBuffer(buf: Buffer, partSize: number): Buffer[] {
  const parts: Buffer[] = [];
  let offset = 0;
  while (offset < buf.length) {
    const end = Math.min(offset + partSize, buf.length);
    parts.push(buf.slice(offset, end));
    offset = end;
  }
  return parts;
}

// Compute a unique filename within a parent folder for a user by appending
// " (1)", " (2)", ... before the extension when conflicts exist.
// Generate a unique filename by checking the full `path` uniqueness (userId + path).
// `parentPath` is the parent folder's full path (e.g. "/photos/2025"). If null, file will be created at root.
// Get unique name for a file in a given parent folder (excludes trashed files by default)
async function getUniqueName(userId: string, parentPath: string | null, desiredName: string, excludeId?: string, includeTrashed = false) {
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
        ...(includeTrashed ? {} : { deletedAt: null }),
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

    const where: any = { userId, deletedAt: null }; // Exclude deleted files
    
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
        path: true,
        parentId: true,
        mimeType: true,
        starred: true,
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

// ==================== STARRED FILES ROUTES ====================
// NOTE: These routes MUST come before /:id to avoid "starred" being matched as an ID

// List starred files
router.get('/starred', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const starredFiles = await prisma.file.findMany({
      where: { 
        userId, 
        starred: true,
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        path: true,
        parentId: true,
        mimeType: true,
        starred: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { type: 'desc' },
        { updatedAt: 'desc' },
      ],
    });

    res.json(starredFiles.map(serializeFile));
  } catch (error) {
    logger.error('Error listing starred files:', error);
    res.status(500).json({ error: 'Failed to list starred files' });
  }
});

// ==================== RECYCLE BIN ROUTES ====================
// NOTE: These routes MUST come before /:id to avoid "recycle-bin" being matched as an ID

// List files in recycle bin
// Shows only top-level deleted items (folders contain their children like macOS Trash)
router.get('/recycle-bin', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    // Get only top-level deleted items (items where deletedWithParentId is null)
    // This follows macOS Trash behavior where folders are shown as single items
    const topLevelDeleted = await prisma.file.findMany({
      where: { 
        userId, 
        deletedAt: { not: null },
        deletedWithParentId: null,
      },
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        mimeType: true,
        deletedAt: true,
        originalPath: true,
        createdAt: true,
        path: true,
      },
      orderBy: { deletedAt: 'desc' },
    });

    // For directories, count how many items are inside (macOS shows item count)
    const result = await Promise.all(topLevelDeleted.map(async (item) => {
      let itemCount = 0;
      let totalSize = item.size;
      let children: any[] = [];
      
      logger.info(`Processing item: ${item.name}, type: ${item.type}`);
      
      if (item.type === 'DIRECTORY') {
        logger.info(`Item ${item.name} is a directory, fetching children...`);
        // Get all children deleted with this folder, recursively
        const getAllDeletedChildren = async (parentId: string): Promise<any[]> => {
          const directChildren = await prisma.file.findMany({
            where: {
              userId,
              deletedWithParentId: parentId,
            },
            select: {
              id: true,
              name: true,
              type: true,
              size: true,
              mimeType: true,
              deletedAt: true,
            },
            orderBy: { name: 'asc' },
          });

          const childrenWithNested = await Promise.all(
            directChildren.map(async (child) => {
              if (child.type === 'DIRECTORY') {
                const nestedChildren = await getAllDeletedChildren(child.id);
                return {
                  ...child,
                  size: Number(child.size),
                  children: nestedChildren,
                };
              }
              return {
                ...child,
                size: Number(child.size),
              };
            })
          );

          return childrenWithNested;
        };

        children = await getAllDeletedChildren(item.id);
        
        logger.info(`Children for ${item.name}:`, { children });
        
        // Count all descendants recursively
        const countAllDescendants = (items: any[]): number => {
          return items.reduce((sum, child) => {
            return sum + 1 + (child.children ? countAllDescendants(child.children) : 0);
          }, 0);
        };
        
        itemCount = countAllDescendants(children);
        
        // Calculate total size of all children recursively
        const sumAllSizes = (items: any[]): bigint => {
          return items.reduce((sum, child) => {
            return sum + child.size + (child.children ? sumAllSizes(child.children) : BigInt(0));
          }, BigInt(0));
        };
        
        totalSize = item.size + sumAllSizes(children);
      }
      
      return {
        ...item,
        size: totalSize.toString(),
        itemCount, // Number of items inside (for directories)
        children, // Nested children for hierarchical display
      };
    }));

    res.json(result);
  } catch (error) {
    logger.error('Error listing recycle bin:', error);
    res.status(500).json({ error: 'Failed to list recycle bin' });
  }
});



// Restore file from recycle bin
// Restores to original location if parent folder still exists, otherwise to root.
// If a file with the same name exists, appends (1), (2), etc. following Windows conventions.
router.post('/recycle-bin/:id/restore', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    // Find the file to restore
    const file = await prisma.file.findFirst({
      where: { id, userId, deletedAt: { not: null } },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found in recycle bin' });
    }

    const childrenDeletedWithParent = await prisma.file.findMany({
      where: {
        userId,
        deletedAt: { not: null },
        deletedWithParentId: file.id,
      },
      select: { id: true, originalPath: true, path: true, parentId: true, name: true, type: true }
    });

    const itemsToRestore = [file, ...childrenDeletedWithParent];

    // Parse original path to determine restore location
    const targetPath = file.originalPath || file.path;
    const targetPathParts = targetPath.split('/').filter(Boolean);
    const fileName = targetPathParts.pop() || file.name;
    const originalParentPath = targetPathParts.length > 0 ? '/' + targetPathParts.join('/') : null;
    
    const targetOriginalPath = file.originalPath || file.path;
    
    // Determine where to restore: original parent if exists, otherwise root
    let restoreToPath: string | null = null;
    let newParentId: string | null = null;
    let restoredToRoot = false;
    
    if (originalParentPath) {
      // Check if the original parent folder still exists
      const existingParent = await prisma.file.findFirst({
        where: { userId, path: originalParentPath, type: 'DIRECTORY', deletedAt: null }
      });
      
      if (existingParent) {
        // Original parent exists - restore there
        restoreToPath = originalParentPath;
        newParentId = existingParent.id;
      } else {
        // Original parent doesn't exist - restore to root
        restoreToPath = null;
        newParentId = null;
        restoredToRoot = true;
      }
    } else {
      // File was originally at root
      restoreToPath = null;
      newParentId = null;
    }
    
    // Generate unique name using Windows-style (1), (2), etc. for conflicts
    let uniqueName = fileName;
    let counter = 1;
    while (true) {
      const checkPath = restoreToPath ? `${restoreToPath}/${uniqueName}` : `/${uniqueName}`;
      const existing = await prisma.file.findFirst({
        where: { userId, path: checkPath, deletedAt: null }
      });
      if (!existing) break;
      
      // Use Windows-style numbering: "file (1).txt", "file (2).txt", etc.
      const { base, ext } = splitName(fileName);
      uniqueName = `${base} (${counter})${ext}`;
      counter++;
    }
    
    const finalPath = restoreToPath ? `${restoreToPath}/${uniqueName}` : `/${uniqueName}`;
    const wasRenamed = uniqueName !== fileName;

    // Restore all items in a transaction
    await prisma.$transaction(async (tx) => {
      for (const f of itemsToRestore) {
        let restorePath = f.originalPath || f.path;
        let newName = f.name;
        let parentId: string | null = f.parentId;
        
        if (f.id === file.id) {
          // This is the main file being restored
          restorePath = finalPath;
          newName = uniqueName;
          // Update parent ID: if restoring to root, set to null; otherwise use the found parent
          parentId = newParentId;
        } else {
          // This is a child file - update its path based on the new parent path
          const childOriginalPath = f.originalPath || f.path;
          if (wasRenamed || restoredToRoot) {
            // Replace the old base path with the new path
            restorePath = childOriginalPath.replace(targetOriginalPath, finalPath);
          } else {
            restorePath = childOriginalPath;
          }
          
          // For children, find their parent in the restored set or use their original parent
          // But if the parent was deleted, it should also be in itemsToRestore
          // Leave parentId as-is for children since they maintain their hierarchy
        }
        
        await tx.file.update({
          where: { id: f.id },
          data: {
            deletedAt: null,
            name: f.id === file.id ? newName : f.name,
            path: restorePath,
            originalPath: null,
            deletedWithParentId: null,
            parentId: parentId,
          },
        });
      }
    });

    // Log the restore
    try {
      const { createLog } = require('./logs');
      await createLog(userId, 'RESTORE', `Restored from recycle bin: ${file.name}${wasRenamed ? ` (renamed to ${uniqueName})` : ''}${restoredToRoot ? ' (to root - original folder deleted)' : ''}`, true, undefined, { 
        fileName: file.name, 
        fileType: file.type,
        filesRestored: itemsToRestore.length,
        restoredToRoot,
        renamedTo: wasRenamed ? uniqueName : undefined,
        originalPath: targetOriginalPath
      });
    } catch (logErr) {
      logger.warn('Failed to log restore:', logErr);
    }

    res.json({ 
      message: wasRenamed 
        ? `File restored as "${uniqueName}"${restoredToRoot ? ' (original folder no longer exists)' : ''}` 
        : restoredToRoot 
          ? 'File restored to root (original folder no longer exists)' 
          : 'File restored successfully', 
      filesRestored: itemsToRestore.length,
      restoredToRoot,
      renamedTo: wasRenamed ? uniqueName : undefined,
      restoredPath: finalPath
    });
  } catch (error) {
    logger.error('Error restoring file:', error);
    res.status(500).json({ error: 'Failed to restore file' });
  }
});

// Permanently delete file from recycle bin
router.delete('/recycle-bin/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    const file = await prisma.file.findFirst({
      where: { id, userId, deletedAt: { not: null } },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found in recycle bin' });
    }

    const allDeleted = await prisma.file.findMany({
      where: {
        userId,
        deletedAt: { not: null },
      },
      select: { id: true, originalPath: true, path: true }
    });

    const targetOriginalPath = file.originalPath || file.path;
    const filesToDelete = allDeleted.filter(f => {
      const fOriginalPath = f.originalPath || f.path;
      return f.id === file.id || fOriginalPath.startsWith(`${targetOriginalPath}/`);
    });

    const fileIds = filesToDelete.map(f => f.id);

    await prisma.$transaction(async (tx) => {
      await tx.fileChunk.deleteMany({ where: { fileId: { in: fileIds } } });
      await tx.file.deleteMany({ where: { id: { in: fileIds } } });
    });

    // Log the permanent deletion
    try {
      const { createLog } = require('./logs');
      await createLog(userId, 'DELETE', `Permanently deleted: ${file.name}`, true, undefined, { 
        fileName: file.name, 
        fileType: file.type,
        filesDeleted: fileIds.length
      });
    } catch (logErr) {
      logger.warn('Failed to log permanent deletion:', logErr);
    }

    res.json({ message: 'File permanently deleted', filesDeleted: fileIds.length });
  } catch (error) {
    logger.error('Error permanently deleting file:', error);
    res.status(500).json({ error: 'Failed to permanently delete file' });
  }
});

// Empty entire recycle bin
router.delete('/recycle-bin', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const deletedFiles = await prisma.file.findMany({
      where: { userId, deletedAt: { not: null } },
      select: { id: true }
    });

    const fileIds = deletedFiles.map(f => f.id);

    if (fileIds.length === 0) {
      return res.json({ message: 'Recycle bin is already empty', filesDeleted: 0 });
    }

    // Permanently delete all
    await prisma.$transaction(async (tx) => {
      await tx.fileChunk.deleteMany({ where: { fileId: { in: fileIds } } });
      await tx.file.deleteMany({ where: { id: { in: fileIds } } });
    });

    // Log the empty
    try {
      const { createLog } = require('./logs');
      await createLog(userId, 'DELETE', `Emptied recycle bin`, true, undefined, { 
        filesDeleted: fileIds.length
      });
    } catch (logErr) {
      logger.warn('Failed to log recycle bin empty:', logErr);
    }

    res.json({ message: 'Recycle bin emptied', filesDeleted: fileIds.length });
  } catch (error) {
    logger.error('Error emptying recycle bin:', error);
    res.status(500).json({ error: 'Failed to empty recycle bin' });
  }
});

// ==================== END RECYCLE BIN ROUTES ====================

// Get file details - also supports shared files
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    // First try to find file owned by user
    let file = await prisma.file.findFirst({
      where: { id, userId, deletedAt: null },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });

    // If not found, check if file is shared with the user
    if (!file) {
      const share = await prisma.share.findFirst({
        where: { 
          fileId: id, 
          sharedWithId: userId 
        },
        include: {
          file: {
            include: {
              chunks: {
                orderBy: { chunkIndex: 'asc' },
              },
            },
          },
        },
      });
      
      if (share?.file && !share.file.deletedAt) {
        file = share.file;
      }
    }

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
    // Resolve the parent path string. Only derive a parentPath from `parentId`
    // (server-authoritative). Do NOT trust a client-supplied `path` value when
    // `parentId` is not provided — that can create inconsistent `path` vs
    // `parentId` state (e.g. paths that claim a file is inside a folder while
    // `parentId` is null). If client omitted `parentId`, create at root.
    const originalName = file.originalname;
    let parentPath: string | null = null;
    if (parentId) {
      const parent = await prisma.file.findUnique({ where: { id: parentId }, select: { path: true } });
      parentPath = parent?.path || null;
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
    // uploaded temp file in CHUNK_SIZE blocks, optionally encrypt each chunk,
    // and stream each block to Discord.
    const tmpPath = (file as any).path as string;
    const chunks: any[] = [];
    const uploadName = fileRecord.name;
    const ENCRYPTION_OVERHEAD = 16 + 12 + 16; // salt (16) + iv (12) + authTag (16) = 44 bytes

    try {
      // Process file in chunks directly from the original file (not whole-file encryption)
      // Encryption is done per-chunk to match streaming upload behavior
      const fd = await fs.promises.open(tmpPath, 'r');
      const stat = await fd.stat();
      const totalSize = stat.size;

      let offset = 0;
      let chunkCounter = 0;

      while (offset < totalSize) {
        const readSize = Math.min(CHUNK_SIZE, totalSize - offset);
        const buffer = Buffer.alloc(readSize);
        await fd.read(buffer, 0, readSize, offset);

        // Encrypt per-chunk if encryption is enabled
        let toUpload: Buffer = buffer;
        if (shouldEncrypt && encryptionKey) {
          toUpload = encryptBuffer(buffer, encryptionKey);
        }

        const filename = `${fileRecord.id}_chunk_${chunkCounter}_${uploadName}`;
        logger.info(`Uploading chunk ${chunkCounter + 1} for file ${uploadName} (plaintext=${buffer.length}, encrypted=${toUpload.length})`);

        const { messageId, attachmentUrl, channelId } = await uploadChunkToDiscord(
          filename,
          toUpload
        );

        // Store the DECRYPTED size in chunk.size for Range calculations
        const chunk = await prisma.fileChunk.create({
          data: {
            fileId: fileRecord.id,
            chunkIndex: chunkCounter,
            messageId,
            channelId,
            attachmentUrl,
            size: buffer.length,  // Decrypted size, NOT encrypted size
          },
        });

        chunks.push(chunk);

        // Move to next chunk
        chunkCounter += 1;
        offset += readSize;
      }

      await fd.close();

      // Clean up temp file (original upload)
      try {
        if (tmpPath) {
          await fs.promises.unlink(tmpPath);
        }
      } catch (rmErr) {
        logger.warn('Failed to remove temp upload file:', rmErr);
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

      // Remove temp file
      try {
        if (tmpPath) {
          await fs.promises.unlink(tmpPath).catch(() => null);
        }
      } catch (rmErr) {
        logger.warn('Failed to remove temp file during rollback:', rmErr);
      }

      return res.status(500).json({ error: `Failed to upload file: ${uploadError?.message || uploadError}` });
    }
  } catch (error) {
    logger.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Helper to authenticate from header or query parameter (for video elements)
async function authenticateDownload(req: Request, res: Response, next: NextFunction) {
  const queryToken = req.query.token as string | undefined;
  
  if (queryToken) {
    // Authenticate using query token (for video elements that can't send headers)
    try {
      // Check if it's a JWT token or API key
      if (queryToken.startsWith('dd_')) {
        // API Key authentication
        const apiKey = await prisma.apiKey.findUnique({
          where: { key: queryToken },
          include: { user: true },
        });

        if (!apiKey) {
          return res.status(401).json({ error: 'Invalid API key' });
        }

        await prisma.apiKey.update({
          where: { id: apiKey.id },
          data: { lastUsed: new Date() },
        });

        (req as any).user = {
          userId: apiKey.userId,
          discordId: apiKey.user.discordId,
        };
        return next();
      } else {
        // JWT authentication
        const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) {
          return res.status(500).json({ error: 'Server configuration error' });
        }
        
        const decodedAny = jwt.verify(queryToken, JWT_SECRET as string) as unknown;
        const decoded = (decodedAny as any) as { userId: string; discordId?: string };

        if (!decoded || typeof decoded !== 'object' || !decoded.userId) {
          return res.status(401).json({ error: 'Invalid token payload' });
        }

        const session = await prisma.session.findUnique({
          where: { token: queryToken },
        });

        if (!session || session.expiresAt < new Date()) {
          return res.status(401).json({ error: 'Session expired' });
        }

        (req as any).user = { userId: decoded.userId, discordId: decoded.discordId };
        return next();
      }
    } catch (error) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }
  } else {
    // Use normal header authentication
    return authenticate(req, res, next);
  }
}

// Download file - supports both header auth and query param token (for video elements)
// Also supports downloading files shared with the user
router.get('/:id/download', authenticateDownload, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    // First try to find file owned by user
    let file = await prisma.file.findFirst({
      where: { id, userId, type: 'FILE', deletedAt: null },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
        user: {
          select: { encryptionKey: true },
        },
      },
    });

    // If not found, check if file is shared with the user
    if (!file) {
      const share = await prisma.share.findFirst({
        where: { 
          fileId: id, 
          sharedWithId: userId 
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
      
      if (share?.file && share.file.type === 'FILE' && !share.file.deletedAt) {
        file = share.file;
        logger.info('Downloading shared file', { fileId: id, sharedWithUserId: userId });
      }
    }

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Sanitize filename to prevent header injection
    const sanitizedName = file.name.replace(/["\r\n\\]/g, '_');
    const inlineParam = String(req.query.inline || '').toLowerCase();
    const preferInline = inlineParam === '1' || inlineParam === 'true';
    
    // Detect MIME type by file extension first (before isPdf/isVideo checks)
    let contentType = file.mimeType || 'application/octet-stream';
    if (!file.mimeType || file.mimeType === 'application/octet-stream') {
      const ext = sanitizedName.toLowerCase().match(/\.([^.]+)$/);
      if (ext) {
        const extension = ext[1];
        const mimeMap: Record<string, string> = {
          // Video
          'mp4': 'video/mp4',
          'm4v': 'video/mp4',
          'mov': 'video/quicktime',
          'avi': 'video/x-msvideo',
          'wmv': 'video/x-ms-wmv',
          'flv': 'video/x-flv',
          'webm': 'video/webm',
          'mkv': 'video/x-matroska',
          'ogv': 'video/ogg',
          // Image
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'svg': 'image/svg+xml',
          'bmp': 'image/bmp',
          'ico': 'image/x-icon',
          // Audio
          'mp3': 'audio/mpeg',
          'wav': 'audio/wav',
          'ogg': 'audio/ogg',
          'oga': 'audio/ogg',
          'flac': 'audio/flac',
          'm4a': 'audio/mp4',
          // Documents
          'pdf': 'application/pdf',
          'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'xls': 'application/vnd.ms-excel',
          'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'ppt': 'application/vnd.ms-powerpoint',
          'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          // Text
          'txt': 'text/plain',
          'html': 'text/html',
          'css': 'text/css',
          'js': 'text/javascript',
          'json': 'application/json',
          'xml': 'application/xml',
          // Archives
          'zip': 'application/zip',
          'tar': 'application/x-tar',
          'gz': 'application/gzip',
          'bz2': 'application/x-bzip2',
          '7z': 'application/x-7z-compressed',
          'rar': 'application/vnd.rar',
        };
        contentType = mimeMap[extension] || 'application/octet-stream';
      }
    }
    
    // Calculate total file size (decrypted size)
    const totalFileSize = Number(file.size);
    
    // Support HTTP Range requests for efficient streaming
    const rangeHeader = req.headers.range;
    
    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Handle Range requests - only download needed chunks for efficient streaming
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalFileSize - 1;
      
      if (start >= totalFileSize || end >= totalFileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${totalFileSize}`);
        return res.end();
      }
      
      // Calculate cumulative sizes to find which chunks contain the requested range
      // chunk.size is the decrypted size of each chunk (as stored during upload)
      let cumulativeSize = 0;
      let startChunkIndex = -1;
      let endChunkIndex = -1;
      let startOffsetInChunk = 0;
      
      for (let i = 0; i < file.chunks.length; i++) {
        const chunk = file.chunks[i];
        const chunkDecryptedSize = chunk.size; // This is the decrypted size
        
        if (startChunkIndex === -1) {
          if (start < cumulativeSize + chunkDecryptedSize) {
            startChunkIndex = i;
            startOffsetInChunk = start - cumulativeSize;
          }
        }
        
        if (startChunkIndex !== -1 && end < cumulativeSize + chunkDecryptedSize) {
          endChunkIndex = i;
          break;
        }
        
        cumulativeSize += chunkDecryptedSize;
      }
      
      // If end is beyond all chunks, use last chunk
      if (endChunkIndex === -1) {
        endChunkIndex = file.chunks.length - 1;
      }
      
      // Safety check
      if (startChunkIndex === -1 || startChunkIndex >= file.chunks.length) {
        logger.error(`Invalid startChunkIndex: ${startChunkIndex} for start byte: ${start}`);
        return res.status(500).json({ error: 'Invalid range calculation' });
      }
      
      // Get the chunks we need
      const neededChunks = file.chunks.slice(startChunkIndex, endChunkIndex + 1);
      
      if (neededChunks.length === 0) {
        return res.status(404).json({ error: 'Chunks not found' });
      }
      
      // Download chunks in parallel for speed
      const chunkPromises = neededChunks.map(chunk => 
        downloadChunkFromDiscord(chunk.messageId, chunk.channelId)
      );
      const encryptedChunkBuffers = await Promise.all(chunkPromises);
      
      // Decrypt chunks if needed
      let decryptedChunks: Buffer[] = encryptedChunkBuffers;
      if (file.encrypted && file.user.encryptionKey) {
        try {
          decryptedChunks = [];
          const MIN_ENCRYPTED_SIZE = 16 + 12 + 16; // salt + iv + authTag minimum
          
          for (let idx = 0; idx < encryptedChunkBuffers.length; idx++) {
            const encryptedBuffer = encryptedChunkBuffers[idx];
            const expectedDecryptedSize = neededChunks[idx].size;
            
            // Check if buffer looks encrypted (has salt/iv/authTag header)
            if (encryptedBuffer.length < MIN_ENCRYPTED_SIZE) {
              logger.warn(`Chunk ${neededChunks[idx].chunkIndex} is too small to be encrypted (${encryptedBuffer.length} bytes), using as-is`);
              decryptedChunks.push(encryptedBuffer);
              continue;
            }
            
            // If encrypted size matches decrypted size exactly, chunk might not be encrypted
            if (encryptedBuffer.length === expectedDecryptedSize) {
              logger.warn(`Chunk ${neededChunks[idx].chunkIndex} size matches decrypted size, might not be encrypted`);
              // Try decryption first, if it fails use as-is
              try {
                const decrypted = decryptBuffer(encryptedBuffer, file.user.encryptionKey!);
                decryptedChunks.push(decrypted);
              } catch (decErr) {
                logger.warn(`Decryption failed for chunk ${neededChunks[idx].chunkIndex}, using as-is:`, decErr);
                decryptedChunks.push(encryptedBuffer);
              }
              continue;
            }
            
            try {
              const decrypted = decryptBuffer(encryptedBuffer, file.user.encryptionKey!);
              // Verify decrypted size matches expected
              if (decrypted.length !== expectedDecryptedSize) {
                logger.warn(`Chunk ${neededChunks[idx].chunkIndex} decrypted size mismatch: got ${decrypted.length}, expected ${expectedDecryptedSize}`);
              }
              decryptedChunks.push(decrypted);
            } catch (decErr: any) {
              logger.error(`Failed to decrypt chunk ${neededChunks[idx].chunkIndex} (encrypted: ${encryptedBuffer.length} bytes, expected decrypted: ${expectedDecryptedSize} bytes):`, decErr);
              throw new Error(`Decryption failed for chunk ${neededChunks[idx].chunkIndex}: ${decErr.message}`);
            }
          }
        } catch (decryptError: any) {
          logger.error('Decryption failed:', decryptError);
          return res.status(500).json({ error: `Failed to decrypt file: ${decryptError.message}` });
        }
      }
      
      // Concatenate decrypted chunks
      const fullData = Buffer.concat(decryptedChunks);
      
      // Calculate the range within the concatenated chunks
      // startOffsetInChunk is the offset within the first chunk
      const endOffsetInData = Math.min(end - (start - startOffsetInChunk), fullData.length - 1);
      const rangeData = fullData.slice(startOffsetInChunk, endOffsetInData + 1);
      
      // Calculate actual end byte (may be less than requested if near end of file)
      const actualEnd = Math.min(start + rangeData.length - 1, totalFileSize - 1);
      
      res.status(206); // Partial Content
      res.setHeader('Content-Range', `bytes ${start}-${actualEnd}/${totalFileSize}`);
      res.setHeader('Content-Length', rangeData.length.toString());
      
      const disposition = preferInline ? 'inline' : 'attachment';
      res.setHeader('Content-Disposition', `${disposition}; filename="${sanitizedName}"`);
      
      return res.send(rangeData);
    }
    
    // Non-range request - download all chunks (for small files or non-streaming requests)
    logger.info('Starting full file download', { 
      fileId: file.id, 
      encrypted: file.encrypted, 
      hasEncryptionKey: !!file.user.encryptionKey,
      chunkCount: file.chunks.length 
    });
    
    const chunkBuffers: Buffer[] = [];
    for (const chunk of file.chunks) {
      const buffer = await downloadChunkFromDiscord(chunk.messageId, chunk.channelId);
      logger.info(`Downloaded chunk ${chunk.chunkIndex}`, { size: buffer.length });
      chunkBuffers.push(buffer);
    }

    // Decrypt per-chunk if encrypted (file is encrypted per-chunk, not as a whole)
    let decryptedChunks: Buffer[] = chunkBuffers;
    if (file.encrypted && file.user.encryptionKey) {
      decryptedChunks = [];
      const MIN_ENCRYPTED_SIZE = 16 + 12 + 16; // salt + iv + authTag minimum
      
      for (let idx = 0; idx < chunkBuffers.length; idx++) {
        const encryptedBuffer = chunkBuffers[idx];
        const expectedDecryptedSize = file.chunks[idx].size;
        
        // Check if buffer looks encrypted (has salt/iv/authTag header)
        if (encryptedBuffer.length < MIN_ENCRYPTED_SIZE) {
          logger.warn(`Chunk ${file.chunks[idx].chunkIndex} is too small to be encrypted (${encryptedBuffer.length} bytes), using as-is`);
          decryptedChunks.push(encryptedBuffer);
          continue;
        }
        
        // If encrypted size matches decrypted size exactly, chunk might not be encrypted
        if (encryptedBuffer.length === expectedDecryptedSize) {
          logger.warn(`Chunk ${file.chunks[idx].chunkIndex} size matches decrypted size, might not be encrypted`);
          try {
            const decrypted = decryptBuffer(encryptedBuffer, file.user.encryptionKey!);
            decryptedChunks.push(decrypted);
          } catch (decErr) {
            logger.warn(`Decryption failed for chunk ${file.chunks[idx].chunkIndex}, using as-is:`, decErr);
            decryptedChunks.push(encryptedBuffer);
          }
          continue;
        }
        
        try {
          const decrypted = decryptBuffer(encryptedBuffer, file.user.encryptionKey!);
          decryptedChunks.push(decrypted);
          logger.info(`Chunk ${file.chunks[idx].chunkIndex} decrypted successfully`);
        } catch (decErr: any) {
          logger.error(`Failed to decrypt chunk ${file.chunks[idx].chunkIndex}:`, decErr);
          // Fallback: use raw buffer if decryption fails (may be legacy unencrypted data)
          decryptedChunks.push(encryptedBuffer);
        }
      }
    }
    
    // Buffer.concat may produce Buffer<ArrayBufferLike> depending on lib types; cast to plain Buffer
    let fileData = Buffer.concat(decryptedChunks) as unknown as Buffer;
    
    // Send full file
    const disposition = preferInline ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${sanitizedName}"`);
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
    const { name, parentId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Directory name is required' });
    }

    // Compute directory path server-side based on parentId to avoid client-supplied
    // path inconsistencies (clients should not provide absolute paths).
    let parentPath: string | null = null;
    if (parentId) {
      const parent = await prisma.file.findUnique({ where: { id: parentId }, select: { path: true } });
      parentPath = parent?.path || null;
    }

    // Ensure directory name is unique within the target parent. Use the
    // same numeric-suffix strategy as files ("name (1)") to avoid merging
    // uploads into existing folders unexpectedly.
    let uniqueName = await getUniqueName(userId, parentPath, name);
    const maxAttempts = 5;
    let attempt = 0;
    let directory: any = null;
    while (!directory && attempt < maxAttempts) {
      try {
        const dirPath = parentPath ? `${parentPath}/${uniqueName}` : `/${uniqueName}`;
        directory = await prisma.file.create({
          data: {
            name: uniqueName,
            path: dirPath,
            type: 'DIRECTORY',
            userId,
            parentId: parentId || null,
          },
        });
      } catch (createErr: any) {
        if (createErr?.code === 'P2002') {
          // Collision — compute another unique name and retry
          uniqueName = await getUniqueName(userId, parentPath, name);
          attempt += 1;
          continue;
        }
        throw createErr;
      }
    }

    if (!directory) {
      logger.error('Failed to create unique directory after multiple attempts');
      return res.status(500).json({ error: 'Failed to create directory' });
    }

    res.json(serializeFile(directory));
  } catch (error) {
    logger.error('Error creating directory:', error);
    res.status(500).json({ error: 'Failed to create directory' });
  }
});

// Delete file or directory (soft delete to recycle bin if enabled)
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const { recursive, permanent } = req.body as { recursive?: boolean; permanent?: boolean };

    // Check if user has recycle bin enabled
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { recycleBinEnabled: true } });
    const useRecycleBin = user?.recycleBinEnabled && !permanent;

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

    // For permanent delete without recursive flag, reject non-empty directories
    // For recycle bin, we always handle children (soft delete is implicitly recursive)
    if (file.type === 'DIRECTORY' && file.children.length > 0 && !recursive && !useRecycleBin) {
      logger.warn('Cannot delete non-empty directory without recursive flag', { 
        fileId: id, 
        fileName: file.name, 
        childCount: file.children.length 
      });
      return res.status(400).json({ error: 'Directory is not empty' });
    }

    // Collect files to delete
    const filesToDelete: string[] = [];

    // For directories, always include descendants when using recycle bin or explicit recursive flag
    if (file.type === 'DIRECTORY' && (recursive || useRecycleBin)) {
      // include the directory itself first
      filesToDelete.push(file.id);
      // include all descendants (files and directories) whose path starts with file.path/
      const descendants = await prisma.file.findMany({ where: { userId, path: { startsWith: `${file.path}/` } }, select: { id: true } });
      for (const d of descendants) filesToDelete.push(d.id);
    } else {
      filesToDelete.push(file.id);
    }

    if (useRecycleBin) {
      const now = new Date();
      
      await prisma.$transaction(async (tx) => {
        const trashId = crypto.randomUUID().slice(0, 8);
        
        for (const fileId of filesToDelete) {
          const f = await tx.file.findUnique({ where: { id: fileId }, select: { path: true, deletedAt: true, deletedWithParentId: true } });
          
          if (f?.deletedAt && f.deletedWithParentId === null) {
            continue;
          }
          
          const originalPath = f?.path || '';
          const trashedPath = `/.trash/${trashId}${originalPath}`;
          
          let deletedWithParentValue = null;
          if (fileId !== file.id) {
            deletedWithParentValue = file.id;
          }
          
          await tx.file.update({
            where: { id: fileId },
            data: {
              deletedAt: now,
              originalPath: originalPath,
              path: trashedPath,
              deletedWithParentId: deletedWithParentValue,
            },
          });
        }
      });
      
      // Log the deletion
      try {
        const { createLog } = require('./logs');
        await createLog(userId, 'DELETE', `Moved to recycle bin: ${file.name}`, true, undefined, { 
          fileName: file.name, 
          fileType: file.type,
          filesDeleted: filesToDelete.length,
          recycleBin: true
        });
      } catch (logErr) {
        logger.warn('Failed to log deletion:', logErr);
      }
      
      res.json({ message: 'Moved to recycle bin', recycleBin: true });
    } else {
      // Permanent delete: Remove DB rows. Discord messages will be cleaned up by scheduled task.
      try {
        await prisma.$transaction(async (tx) => {
          await tx.fileChunk.deleteMany({ where: { fileId: { in: filesToDelete } } });
          await tx.file.deleteMany({ where: { id: { in: filesToDelete } } });
        });
        
        // Log the deletion
        try {
          const { createLog } = require('./logs');
          await createLog(userId, 'DELETE', `Deleted ${file.type === 'DIRECTORY' ? 'folder' : 'file'}`, true, undefined, { 
            fileName: file.name, 
            fileType: file.type,
            filesDeleted: filesToDelete.length 
          });
        } catch (logErr) {
          logger.warn('Failed to log deletion:', logErr);
        }
      } catch (dbErr) {
        logger.error('Failed to delete file rows from DB:', dbErr);
        return res.status(500).json({ error: 'Failed to remove file records from database' });
      }

      res.json({ message: 'File deleted permanently' });
    }
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

    // Determine parent path for rename uniqueness checks
    let parentPath: string | null = null;
    if (file.parentId) {
      const parent = await prisma.file.findUnique({ where: { id: file.parentId }, select: { path: true } });
      parentPath = parent?.path || null;
    } else {
      parentPath = null;
    }

    // Compute the target path for the requested name and error if a different
    // file already occupies that path. We do NOT auto-number on rename; the
    // client should handle intentional renaming when a conflict exists.
    const targetPath = parentPath ? `${parentPath}/${name}` : `/${name}`;
    // ATOMIC: Try to update, catch unique constraint error (P2002) and return 409
    try {
      const updatedFile = await prisma.file.update({
        where: { id },
        data: { name, path: targetPath, updatedAt: new Date() },
      });
      // If this is a directory, update all descendant paths to keep them in sync
      if (file.type === 'DIRECTORY') {
        const oldPath = file.path;
        const newPath = targetPath;
        const descendants = await prisma.file.findMany({
          where: { userId, path: { startsWith: `${oldPath}/` } },
        });
        for (const d of descendants) {
          const relative = d.path.substring(oldPath.length + 1); // part after the oldPath/
          const updatedPath = `${newPath}/${relative}`;
          await prisma.file.update({ where: { id: d.id }, data: { path: updatedPath, updatedAt: new Date() } });
        }
      }
      return res.json(serializeFile(updatedFile));
    } catch (e: any) {
      // Prisma unique constraint error
      if (e?.code === 'P2002' || (e?.meta?.target && String(e?.meta?.target).includes('userId_path'))) {
        return res.status(409).json({ error: 'A file with that name already exists in the same directory' });
      }
      throw e;
    }
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

    // Ensure target path is not occupied. Do NOT auto-number on move — return
    // a conflict if the same name exists in the destination folder.
    const targetPath = targetParentPath ? `${targetParentPath}/${file.name}` : `/${file.name}`;
    const existingAtTarget = await prisma.file.findFirst({
      where: {
        userId,
        path: targetPath,
        NOT: { id },
      },
    });
    if (existingAtTarget) {
      return res.status(409).json({ error: 'A file with the same name already exists in the target directory' });
    }

    try {
      const updatedFile = await prisma.file.update({
        where: { id },
        data: { parentId: targetParent, name: file.name, path: targetPath, updatedAt: new Date() },
      });

        // If moving a directory, cascade path updates to all descendants so
        // stored `path` remains accurate for nested files/folders.
        if (file.type === 'DIRECTORY') {
          const oldPath = file.path;
          const newPath = targetPath;
          const descendants = await prisma.file.findMany({
            where: { userId, path: { startsWith: `${oldPath}/` } },
          });
          for (const d of descendants) {
            const relative = d.path.substring(oldPath.length + 1);
            const updatedPath = `${newPath}/${relative}`;
            await prisma.file.update({ where: { id: d.id }, data: { path: updatedPath, updatedAt: new Date() } });
          }
        }

        return res.json(serializeFile(updatedFile));
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return res.status(409).json({ error: 'A file with the same name already exists in the target directory' });
      }
      throw e;
    }
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
      where: { userId, type: 'DIRECTORY', deletedAt: null },
      select: {
        id: true,
        name: true,
        parentId: true,
        path: true,
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

// Toggle starred status for a file
router.post('/:id/star', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const { starred } = req.body;

    const file = await prisma.file.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Toggle or set starred status
    const newStarred = typeof starred === 'boolean' ? starred : !file.starred;

    const updated = await prisma.file.update({
      where: { id },
      data: { starred: newStarred },
      select: { id: true, starred: true },
    });

    res.json(updated);
  } catch (error) {
    logger.error('Error toggling starred status:', error);
    res.status(500).json({ error: 'Failed to update starred status' });
  }
});

// Make a copy of a file (creates a new File record and duplicates chunk refs)
router.post('/:id/copy', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    // Fetch node (file or directory)
    const node = await prisma.file.findFirst({
      where: { id, userId },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
    });

    if (!node) return res.status(404).json({ error: 'File not found' });

    logger.info('Copy requested', { userId, fileId: id, nodeType: node.type, parentId: node.parentId, path: node.path });

    // Helper: copy a single file by downloading each chunk and re-uploading to Discord
    const copyFile = async (tx: any, src: any, targetParentId: string | null, parentPath: string | null, renameForTopLevel: boolean) => {
      logger.info('Copying file', { srcId: src.id, srcName: src.name, targetParentId, parentPath, renameForTopLevel });
      // Determine name
      let nameToUse = src.name;
      if (renameForTopLevel) {
        nameToUse = await getUniqueName(userId, parentPath, `Copy of ${src.name}`);
      } else {
        nameToUse = await getUniqueName(userId, parentPath, src.name);
      }
      const targetPath = parentPath ? `${parentPath}/${nameToUse}` : `/${nameToUse}`;

      // Determine destination encryption policy based on user's settings
      let destEncrypt = false;
      let userEncryptionKey: string | null = null;
      try {
        const userRec = await tx.user.findUnique({ where: { id: userId } });
        destEncrypt = !!userRec?.encryptByDefault;
        if (destEncrypt) {
          if (!userRec?.encryptionKey) {
            // generate and persist an encryption key for the user
            userEncryptionKey = generateEncryptionKey();
            await tx.user.update({ where: { id: userId }, data: { encryptionKey: userEncryptionKey } });
          } else {
            userEncryptionKey = userRec.encryptionKey;
          }
        }
      } catch (e) {
        logger.warn('Failed to resolve user encryption settings for copy, defaulting to no encryption', e);
        destEncrypt = false;
        userEncryptionKey = null;
      }

      const newFile = await tx.file.create({
        data: {
          name: nameToUse,
          path: targetPath,
          size: src.size,
          mimeType: src.mimeType,
          type: src.type,
          encrypted: destEncrypt,
          parentId: targetParentId,
          userId,
        },
      });

      // Duplicate chunks by re-uploading attachments to Discord so copied file has its own messages
      if (src.chunks && src.chunks.length > 0) {
        // Create new chunk rows by re-downloading each original chunk and
        // re-uploading. If an original chunk buffer is larger than the
        // allowed Discord upload limit, split it into multiple uploads so
        // the copy can succeed instead of failing with a 413.
        let newChunkIndex = 0;
        for (const chunk of src.chunks) {
          logger.info('Copying chunk', { chunkId: chunk.id, messageId: chunk.messageId, channelId: chunk.channelId });
          // download original chunk buffer
          const buffer = await downloadChunkFromDiscord(chunk.messageId, chunk.channelId);

          // Determine plaintext and apply destination encryption policy.
          let plaintext: Buffer = buffer;
          if (src.encrypted) {
            // source is encrypted; attempt to decrypt using user's key (if available)
            try {
              // prefer the userEncryptionKey we loaded above when available, otherwise try falling back
              const keyToUse = userEncryptionKey || (await prisma.user.findUnique({ where: { id: userId } }))?.encryptionKey;
              if (!keyToUse) throw new Error('Missing encryption key to decrypt source chunk');
              plaintext = decryptBuffer(buffer, keyToUse);
            } catch (decErr) {
              logger.error('Failed to decrypt source chunk during copy:', decErr);
              throw decErr;
            }
          }

          // Prepare buffer to upload according to destEncrypt
          let toUpload: Buffer = plaintext;
          if (destEncrypt) {
            if (!userEncryptionKey) {
              // reload key from DB as fallback
              userEncryptionKey = (await prisma.user.findUnique({ where: { id: userId } }))?.encryptionKey || null;
            }
            if (!userEncryptionKey) {
              throw new Error('Missing encryption key for destination user during copy');
            }
            try {
              toUpload = encryptBuffer(plaintext, userEncryptionKey);
            } catch (encErr) {
              logger.error('Failed to encrypt chunk during copy:', encErr);
              throw encErr;
            }
          }

          // If buffer (post-encryption) fits under DISCORD_MAX, upload as a single attachment.
          if (toUpload.length <= DISCORD_MAX) {
            // Use encrypted filename format: fileId_chunk_index_dbName
            // This keeps Discord filename encrypted while DB stores readable name with " (copy)"
            const discordFilename = `${newFile.id}_chunk_${newChunkIndex}_${nameToUse}`;
            const uploaded = await uploadChunkToDiscord(discordFilename, toUpload);
            await tx.fileChunk.create({
              data: {
                fileId: newFile.id,
                chunkIndex: newChunkIndex,
                messageId: uploaded.messageId,
                channelId: uploaded.channelId,
                attachmentUrl: uploaded.attachmentUrl,
                size: plaintext.length,  // Store DECRYPTED size, not encrypted
              },
            });
            newChunkIndex += 1;
            continue;
          }

          // Otherwise split into multiple parts and upload each part
          // NOTE: When splitting encrypted data, we split the plaintext first, 
          // then encrypt each part separately to maintain proper decryption
          const plaintextParts = splitBuffer(plaintext, CHUNK_SIZE);
          for (let i = 0; i < plaintextParts.length; i++) {
            const plaintextPart = plaintextParts[i];
            let partToUpload = plaintextPart;
            if (destEncrypt && userEncryptionKey) {
              partToUpload = encryptBuffer(plaintextPart, userEncryptionKey);
            }
            // Use encrypted filename format for Discord
            const discordFilename = `${newFile.id}_chunk_${newChunkIndex}_part${i}_${nameToUse}`;
            const uploaded = await uploadChunkToDiscord(discordFilename, partToUpload);
            await tx.fileChunk.create({
              data: {
                fileId: newFile.id,
                chunkIndex: newChunkIndex,
                messageId: uploaded.messageId,
                channelId: uploaded.channelId,
                attachmentUrl: uploaded.attachmentUrl,
                size: plaintextPart.length,  // Store DECRYPTED size
              },
            });
            newChunkIndex += 1;
          }
        }
      }

      return newFile;
    };

    // Recursive directory copy
    const copyDirectory = async (tx: any, srcDirId: string, targetParentId: string | null, parentPath: string | null, renameForTopLevel = true) => {
      logger.info('Copying directory', { srcDirId, targetParentId, parentPath, renameForTopLevel });
      const srcDir = await prisma.file.findUnique({ where: { id: srcDirId }, include: { children: true } });
      if (!srcDir) throw new Error('Source directory not found');
      // For the top-level directory copy, prefix with "Copy of ...". For nested
      // directories, preserve original names but ensure uniqueness within the
      // new parent path.
      const dirBaseName = renameForTopLevel ? `Copy of ${srcDir.name}` : srcDir.name;
      const dirName = await getUniqueName(userId, parentPath, dirBaseName);
      const dirPath = parentPath ? `${parentPath}/${dirName}` : `/${dirName}`;

      const newDir = await tx.file.create({
        data: {
          name: dirName,
          path: dirPath,
          type: 'DIRECTORY',
          userId,
          parentId: targetParentId,
        },
      });

      // Copy children
      const children = await prisma.file.findMany({ where: { parentId: srcDirId } });
      for (const child of children) {
        if (child.type === 'DIRECTORY') {
          await copyDirectory(tx, child.id, newDir.id, dirPath, false);
        } else {
          // file: copy without renaming inner files (preserve filenames,
          // uniquify within target directory)
          const srcWithChunks = await prisma.file.findUnique({ where: { id: child.id }, include: { chunks: { orderBy: { chunkIndex: 'asc' } } } });
          if (!srcWithChunks) continue;
          await copyFile(tx, srcWithChunks, newDir.id, dirPath, false);
        }
      }

      return newDir;
    };

    // Perform copy inside transaction; external uploads will occur but DB changes are transactional
    // Increase transaction timeout because copying re-uploads chunks and may take longer than the
    // default interactive transaction timeout (5s). Keep network I/O minimal where possible.
    const created = await prisma.$transaction(async (tx) => {
      if (node.type === 'DIRECTORY') {
        // Copy directory and its contents
        return await copyDirectory(tx, node.id, node.parentId || null, node.parentId ? (await prisma.file.findUnique({ where: { id: node.parentId }, select: { path: true } }))?.path || null : null);
      } else {
        // Copy a single file (rename to 'Copy of ...')
        const parentPath = node.parentId ? (await prisma.file.findUnique({ where: { id: node.parentId }, select: { path: true } }))?.path || null : null;
        return await copyFile(tx, node, node.parentId || null, parentPath, true);
      }
    }, { timeout: 120000 });

    return res.status(201).json(serializeFile(created));
  } catch (error) {
    logger.error('Error copying file:', error);
    res.status(500).json({ error: 'Failed to copy file' });
  }
});

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

    // Track if client closes the connection prematurely
    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
      logger.warn('Client connection closed (req "close") during streaming upload');
    });
    req.on('aborted', () => {
      clientClosed = true;
      logger.warn('Client connection aborted (req "aborted") during streaming upload');
    });

    // gather fields
    bb.on('field', async (fieldname: string, val: string) => {
      if (fieldname === 'parentId') parentId = val || null;
      if (fieldname === 'path') parentPath = val || null;
      if (fieldname === 'encrypt') shouldEncrypt = val === 'true';
    });

    bb.on('file', (fieldname: string, fileStream: any, filename: any, encoding: string, mimetype: string) => {
      (async () => {
        try {
                // Resolve parentPath from DB if parentId provided (server authoritative).
                // Do NOT honor a client-supplied `path` when `parentId` is absent.
                if (parentId) {
                  const parent = await prisma.file.findUnique({ where: { id: parentId }, select: { path: true } });
                  parentPath = parent?.path || null;
                } else {
                  parentPath = null;
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

              // Post-create verification: handle rare race where another concurrent
              // create inserted the same path between our existence check and the
              // create call. If that happened, generate a new unique name and
              // update this record so final stored paths remain unique.
              try {
                const conflict = await prisma.file.findFirst({
                  where: { userId, path: fileRecord.path, NOT: { id: fileRecord.id } },
                });
                if (conflict) {
                  const fallbackName = await getUniqueName(userId, parentPath, originalName, fileRecord.id);
                  const fallbackPath = parentPath ? `${parentPath}/${fallbackName}` : `/${fallbackName}`;
                  await prisma.file.update({ where: { id: fileRecord.id }, data: { name: fallbackName, path: fallbackPath } });
                  // mutate in-memory record for downstream processing
                  fileRecord.name = fallbackName;
                  fileRecord.path = fallbackPath;
                }
              } catch (e) {
                // best-effort: if this check fails, proceed; uniqueness will be
                // enforced by DB (and will be handled elsewhere)
                logger.warn('Post-create uniqueness verification failed:', e);
              }
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

              // Stream processing: accumulate until CHUNK_SIZE (or smaller when
              // encryption is enabled to account for per-chunk encryption overhead), then send
              let bufferQueue: Buffer[] = [];
              let bufferedBytes = 0;
              let chunkCounter = 0;
              let totalBytes = 0;
              const ENCRYPTION_OVERHEAD = 16 + 12 + 16; // salt (16) + iv (12) + authTag (16) = 44 bytes
              const effectiveChunkSize = shouldEncrypt ? Math.max(1024, CHUNK_SIZE - ENCRYPTION_OVERHEAD) : CHUNK_SIZE;

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
                // Retry with exponential backoff
                const maxAttempts = 3;
                let attempt = 0;
                let lastErr: any = null;
                let uploadRes: any = null;
                const startTs = new Date().toISOString();
                logger.info(`Streaming: chunk ${chunkCounter} upload started at ${startTs}`);
                let delay = 500;
                while (attempt < maxAttempts) {
                  try {
                    uploadRes = await uploadChunkToDiscord(filenameForDiscord, toSend);
                    lastErr = null;
                    break;
                  } catch (uErr: any) {
                    lastErr = uErr;
                    attempt += 1;
                    logger.warn(`Discord upload attempt ${attempt} failed for chunk ${chunkCounter} of file ${fileRecord.id}: ${uErr?.message || uErr}`);
                    if (attempt < maxAttempts) {
                      await sleep(delay);
                      delay *= 2;
                    }
                  }
                }

                if (lastErr) {
                  logger.error(`Discord upload ultimately failed for chunk ${chunkCounter} of file ${fileRecord.id}`);
                  throw lastErr;
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
                const endTs = new Date().toISOString();
                logger.info(`Streaming: chunk ${chunkCounter} stored (messageId=${messageId}) uploadEnd=${endTs}`);

                chunkCounter += 1;
              } finally {
                fileStream.resume();
              }

            // (deduplicated) upload logic handled above with retry/backoff
          };

          fileStream.on('data', (data: Buffer) => {
            (async () => {
              try {
                bufferQueue.push(data);
                bufferedBytes += data.length;
                totalBytes += data.length;

                // while we have at least CHUNK_SIZE, extract and send
                while (bufferedBytes >= effectiveChunkSize) {
                  // build chunkBuffer of effectiveChunkSize
                  const chunkBuffer = Buffer.alloc(effectiveChunkSize);
                  let offset = 0;
                  while (offset < effectiveChunkSize) {
                    const head = bufferQueue[0];
                    const need = Math.min(head.length, effectiveChunkSize - offset);
                    head.copy(chunkBuffer, offset, 0, need);
                    if (need === head.length) {
                      bufferQueue.shift();
                    } else {
                      bufferQueue[0] = head.slice(need);
                    }
                    offset += need;
                  }
                  bufferedBytes -= effectiveChunkSize;
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

export default router;
