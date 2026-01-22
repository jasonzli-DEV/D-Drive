import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { downloadChunkFromDiscord, uploadChunkToDiscord } from '../services/discord';
import { decryptBuffer, encryptBuffer } from '../utils/crypto';
import multer from 'multer';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();

// Configure multer for shared folder uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname}`;
      cb(null, unique);
    },
  }),
});

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks

// Helper to serialize file for response
function serializeFile(file: any) {
  if (!file) return null;
  return {
    ...file,
    size: file.size?.toString() || '0',
  };
}

// Check if user has share access to a file or any of its ancestors
async function checkShareAccess(userId: string, fileId: string): Promise<{ share: any; permission: string } | null> {
  // First check direct share on this file
  const directShare = await prisma.share.findFirst({
    where: { fileId, sharedWithId: userId },
    include: { file: true },
  });
  
  if (directShare) {
    return { share: directShare, permission: directShare.permission };
  }
  
  // Check if any ancestor folder is shared
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: { parent: true },
  });
  
  if (file?.parentId) {
    return checkShareAccess(userId, file.parentId);
  }
  
  return null;
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

    // Validate permission - only VIEW and EDIT
    if (!['VIEW', 'EDIT'].includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission. Must be VIEW or EDIT' });
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

    if (!['VIEW', 'EDIT'].includes(permission)) {
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

    // Check if user has access via share (direct or via ancestor)
    const access = await checkShareAccess(userId, fileId);

    if (!access) {
      return res.status(404).json({ error: 'File not found or not shared with you' });
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: {
        chunks: { orderBy: { chunkIndex: 'asc' } },
        user: { select: { encryptionKey: true } },
      },
    });

    if (!file || file.deletedAt) {
      return res.status(404).json({ error: 'File has been deleted' });
    }

    // For now, just return the file info - actual download will use the files route
    // with shared file support
    res.json({
      file: serializeFile(file),
      permission: access.permission,
    });
  } catch (error) {
    logger.error('Error downloading shared file:', error);
    res.status(500).json({ error: 'Failed to download shared file' });
  }
});

// Get contents of a shared folder
router.get('/folder/:folderId/contents', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { folderId } = req.params;

    // Check access
    const access = await checkShareAccess(userId, folderId);
    if (!access) {
      return res.status(404).json({ error: 'Folder not found or not shared with you' });
    }

    const folder = await prisma.file.findFirst({
      where: { id: folderId, type: 'DIRECTORY', deletedAt: null },
    });

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Get folder contents
    const files = await prisma.file.findMany({
      where: { parentId: folderId, deletedAt: null },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    res.json({
      folder: serializeFile(folder),
      files: files.map(serializeFile),
      permission: access.permission,
    });
  } catch (error) {
    logger.error('Error getting shared folder contents:', error);
    res.status(500).json({ error: 'Failed to get folder contents' });
  }
});

// Download file from shared folder
router.get('/file/:fileId/download', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { fileId } = req.params;

    // Check access
    const access = await checkShareAccess(userId, fileId);
    if (!access) {
      return res.status(404).json({ error: 'File not found or not shared with you' });
    }

    const file = await prisma.file.findFirst({
      where: { id: fileId, type: 'FILE', deletedAt: null },
      include: {
        chunks: { orderBy: { chunkIndex: 'asc' } },
        user: { select: { encryptionKey: true } },
      },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Download and stream file
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    
    if (file.chunks.length === 0) {
      return res.status(404).json({ error: 'File has no chunks' });
    }

    for (const chunk of file.chunks) {
      let data = await downloadChunkFromDiscord(chunk.messageId!, chunk.channelId!);
      if (file.encrypted && file.user?.encryptionKey) {
        data = decryptBuffer(data, file.user.encryptionKey);
      }
      res.write(data);
    }

    res.end();
  } catch (error) {
    logger.error('Error downloading shared file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Upload file to shared folder (requires EDIT permission)
router.post('/folder/:folderId/upload', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  const tempFile = req.file?.path;
  
  try {
    const userId = (req as any).user.userId;
    const { folderId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const access = await checkShareAccess(userId, folderId);
    if (!access || access.permission !== 'EDIT') {
      return res.status(403).json({ error: 'You do not have edit permission on this folder' });
    }

    // Get the shared folder and its owner
    const folder = await prisma.file.findFirst({
      where: { id: folderId, type: 'DIRECTORY', deletedAt: null },
      include: { user: { select: { id: true, encryptByDefault: true, encryptionKey: true } } },
    });

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const fileName = req.file.originalname;
    const filePath = `${folder.path}/${fileName}`;
    const fileSize = req.file.size;
    const mimeType = req.file.mimetype;
    const shouldEncrypt = !!(folder.user.encryptByDefault && folder.user.encryptionKey);

    // Check for existing file
    const existing = await prisma.file.findFirst({
      where: { userId: folder.userId, path: filePath, deletedAt: null },
      include: { chunks: true },
    });

    if (existing) {
      // Delete old chunks from database
      await prisma.$executeRaw`DELETE FROM "Chunk" WHERE "fileId" = ${existing.id}`;
    }

    // Read file and upload chunks
    const fileBuffer = fs.readFileSync(tempFile!);
    const chunks: { attachmentUrl: string; messageId: string; channelId: string; chunkIndex: number }[] = [];
    
    for (let i = 0; i < fileBuffer.length; i += CHUNK_SIZE) {
      let chunk: Buffer = fileBuffer.slice(i, i + CHUNK_SIZE);
      if (shouldEncrypt) {
        chunk = encryptBuffer(chunk, folder.user.encryptionKey!);
      }
      
      const result = await uploadChunkToDiscord(`${fileName}.part${Math.floor(i / CHUNK_SIZE)}`, chunk);
      chunks.push({ 
        attachmentUrl: result.attachmentUrl, 
        messageId: result.messageId,
        channelId: result.channelId,
        chunkIndex: Math.floor(i / CHUNK_SIZE) 
      });
    }

    // Create or update file record
    const fileRecord = existing
      ? await prisma.file.update({
          where: { id: existing.id },
          data: {
            size: BigInt(fileSize),
            mimeType,
            encrypted: shouldEncrypt,
            updatedAt: new Date(),
          },
        })
      : await prisma.file.create({
          data: {
            name: fileName,
            path: filePath,
            type: 'FILE',
            size: BigInt(fileSize),
            mimeType,
            userId: folder.userId,
            parentId: folderId,
            encrypted: shouldEncrypt,
          },
        });

    // Create chunk records
    for (const c of chunks) {
      await prisma.$executeRaw`
        INSERT INTO "Chunk" ("id", "fileId", "chunkIndex", "attachmentUrl", "messageId", "channelId")
        VALUES (${crypto.randomUUID()}, ${fileRecord.id}, ${c.chunkIndex}, ${c.attachmentUrl}, ${c.messageId}, ${c.channelId})
      `;
    }

    logger.info('File uploaded to shared folder', {
      fileName,
      folderId,
      uploadedBy: userId,
      folderOwner: folder.userId,
    });

    res.json(serializeFile(fileRecord));
  } catch (error) {
    logger.error('Error uploading to shared folder:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  } finally {
    // Clean up temp file
    if (tempFile) {
      try { fs.unlinkSync(tempFile); } catch {}
    }
  }
});

// Rename file/folder in shared folder (requires EDIT permission)
router.patch('/file/:fileId/rename', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { fileId } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const access = await checkShareAccess(userId, fileId);
    if (!access || access.permission !== 'EDIT') {
      return res.status(403).json({ error: 'You do not have edit permission' });
    }

    const file = await prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Update the name and path
    const oldName = file.name;
    const newPath = file.path.replace(new RegExp(`${oldName}$`), name);
    
    const updated = await prisma.file.update({
      where: { id: fileId },
      data: { name, path: newPath },
    });

    res.json(serializeFile(updated));
  } catch (error) {
    logger.error('Error renaming shared file:', error);
    res.status(500).json({ error: 'Failed to rename file' });
  }
});

// Delete file/folder in shared folder (requires EDIT permission)
router.delete('/file/:fileId', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { fileId } = req.params;

    const access = await checkShareAccess(userId, fileId);
    if (!access || access.permission !== 'EDIT') {
      return res.status(403).json({ error: 'You do not have edit permission' });
    }

    const file = await prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Move to recycle bin (soft delete)
    await prisma.file.update({
      where: { id: fileId },
      data: { 
        deletedAt: new Date(),
        originalPath: file.path,
      },
    });

    res.json({ message: 'File deleted' });
  } catch (error) {
    logger.error('Error deleting shared file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Create folder in shared folder (requires EDIT permission)
router.post('/folder/:folderId/create-folder', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { folderId } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const access = await checkShareAccess(userId, folderId);
    if (!access || access.permission !== 'EDIT') {
      return res.status(403).json({ error: 'You do not have edit permission' });
    }

    const parentFolder = await prisma.file.findFirst({
      where: { id: folderId, type: 'DIRECTORY', deletedAt: null },
    });

    if (!parentFolder) {
      return res.status(404).json({ error: 'Parent folder not found' });
    }

    const newPath = `${parentFolder.path}/${name}`;
    
    // Check if folder already exists
    const existing = await prisma.file.findFirst({
      where: { userId: parentFolder.userId, path: newPath, deletedAt: null },
    });

    if (existing) {
      return res.status(409).json({ error: 'Folder already exists' });
    }

    const folder = await prisma.file.create({
      data: {
        name,
        path: newPath,
        type: 'DIRECTORY',
        userId: parentFolder.userId,
        parentId: folderId,
      },
    });

    res.json(serializeFile(folder));
  } catch (error) {
    logger.error('Error creating folder in shared folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

export default router;
