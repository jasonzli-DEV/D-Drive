import { PrismaClient } from '@prisma/client';
import { uploadChunkToDiscord, deleteChunkFromDiscord } from './discord';
import { logger } from '../utils/logger';
import fs from 'fs';
import { encryptBuffer, generateEncryptionKey } from '../utils/crypto';

const prisma = new PrismaClient();
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

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

async function getParentPath(parentId?: string | null) {
  if (!parentId) return null;
  const parent = await prisma.file.findUnique({ where: { id: parentId }, select: { path: true } });
  return parent?.path || null;
}

async function getUniqueName(userId: string, parentPath: string | null, desiredName: string) {
  const { base, ext } = (() => {
    const lastDot = desiredName.lastIndexOf('.');
    if (lastDot === -1) return { base: desiredName, ext: '' };
    return { base: desiredName.substring(0, lastDot), ext: desiredName.substring(lastDot) };
  })();

  let newName = desiredName;
  let counter = 1;
  while (true) {
    const candidatePath = parentPath ? `${parentPath}/${newName}` : `/${newName}`;
    const existing = await prisma.file.findFirst({ where: { userId, path: candidatePath } });
    if (!existing) break;
    newName = `${base} (${counter})${ext}`;
    counter += 1;
  }
  return newName;
}

export async function storeBufferAsFile(userId: string, parentId: string | null, originalName: string, buffer: Buffer, mimeType?: string, shouldEncrypt = false) {
  // Resolve parent path
  const parentPath = await getParentPath(parentId);

  // Unique name
  const uniqueName = await getUniqueName(userId, parentPath, originalName);

  // Determine encryption key if needed
  let encryptionKey: string | null = null;
  if (shouldEncrypt) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (!user.encryptionKey) {
      encryptionKey = generateEncryptionKey();
      await prisma.user.update({ where: { id: userId }, data: { encryptionKey } });
    } else {
      encryptionKey = user.encryptionKey;
    }
  }

  // Create file record
  const computedPath = parentPath ? `${parentPath}/${uniqueName}` : `/${uniqueName}`;
  const fileRecord = await prisma.file.create({
    data: {
      name: uniqueName,
      path: computedPath,
      size: BigInt(buffer.length),  // Original decrypted size
      mimeType: mimeType || 'application/octet-stream',
      type: 'FILE',
      encrypted: shouldEncrypt,
      userId,
      parentId: parentId || null,
    },
  });

  // Split into chunks FIRST (plaintext), then encrypt each chunk if needed
  const plaintextParts = splitBuffer(buffer, CHUNK_SIZE);
  const chunksCreated: any[] = [];

  try {
    for (let i = 0; i < plaintextParts.length; i++) {
      const plaintextPart = plaintextParts[i];
      
      // Encrypt per-chunk if encryption is enabled
      let toUpload = plaintextPart;
      if (shouldEncrypt && encryptionKey) {
        toUpload = encryptBuffer(plaintextPart, encryptionKey);
      }
      
      const filename = `${fileRecord.id}_chunk_${i}_${uniqueName}`;
      const { messageId, attachmentUrl, channelId } = await uploadChunkToDiscord(filename, toUpload);
      
      // Store the DECRYPTED size in chunk.size for Range calculations
      const chunk = await prisma.fileChunk.create({ 
        data: { 
          fileId: fileRecord.id, 
          chunkIndex: i, 
          messageId, 
          channelId, 
          attachmentUrl, 
          size: plaintextPart.length  // Decrypted size, NOT encrypted size
        } 
      });
      chunksCreated.push(chunk);
    }

    // File size stays as original decrypted size (already set at creation)
    const stored = await prisma.file.findUnique({ where: { id: fileRecord.id } });
    return stored;
  } catch (err) {
    logger.error('Error storing buffer as file, rolling back:', err);
    // Attempt to clean up uploaded chunks
    for (const c of chunksCreated) {
      try { await deleteChunkFromDiscord(c.messageId, c.channelId); } catch (e) { /* ignore */ }
    }
    await prisma.fileChunk.deleteMany({ where: { fileId: fileRecord.id } }).catch(() => null);
    await prisma.file.delete({ where: { id: fileRecord.id } }).catch(() => null);
    throw err;
  }
}

/**
 * Store a file from a disk path WITHOUT loading entire file into memory.
 * Reads in chunks and uploads to Discord one chunk at a time.
 * This is essential for handling large files (60GB+).
 */
export async function storeFileFromPath(
  userId: string, 
  parentId: string | null, 
  originalName: string, 
  filePath: string, 
  mimeType?: string, 
  shouldEncrypt = false
) {
  // Get file size
  const stat = await fs.promises.stat(filePath);
  const fileSize = stat.size;
  
  // Resolve parent path
  const parentPath = await getParentPath(parentId);

  // Unique name
  const uniqueName = await getUniqueName(userId, parentPath, originalName);

  // Determine encryption key if needed
  let encryptionKey: string | null = null;
  if (shouldEncrypt) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (!user.encryptionKey) {
      encryptionKey = generateEncryptionKey();
      await prisma.user.update({ where: { id: userId }, data: { encryptionKey } });
    } else {
      encryptionKey = user.encryptionKey;
    }
  }

  // Create file record
  const computedPath = parentPath ? `${parentPath}/${uniqueName}` : `/${uniqueName}`;
  const fileRecord = await prisma.file.create({
    data: {
      name: uniqueName,
      path: computedPath,
      size: BigInt(fileSize),  // Original decrypted size
      mimeType: mimeType || 'application/octet-stream',
      type: 'FILE',
      encrypted: shouldEncrypt,
      userId,
      parentId: parentId || null,
    },
  });

  const chunksCreated: any[] = [];
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
  
  logger.info('Starting streaming upload from file', { 
    filePath, 
    fileSize, 
    totalChunks, 
    encrypted: shouldEncrypt 
  });

  try {
    // Open file handle
    const fileHandle = await fs.promises.open(filePath, 'r');
    
    try {
      let chunkIndex = 0;
      let bytesRead = 0;
      
      while (bytesRead < fileSize) {
        // Read one chunk at a time
        const chunkBuffer = Buffer.alloc(Math.min(CHUNK_SIZE, fileSize - bytesRead));
        const { bytesRead: read } = await fileHandle.read(chunkBuffer, 0, chunkBuffer.length, bytesRead);
        
        if (read === 0) break; // End of file
        
        // Trim buffer if we read less than allocated
        const plaintextPart = read < chunkBuffer.length ? chunkBuffer.slice(0, read) : chunkBuffer;
        
        // Encrypt per-chunk if encryption is enabled
        let toUpload = plaintextPart;
        if (shouldEncrypt && encryptionKey) {
          toUpload = encryptBuffer(plaintextPart, encryptionKey);
        }
        
        const filename = `${fileRecord.id}_chunk_${chunkIndex}_${uniqueName}`;
        const { messageId, attachmentUrl, channelId } = await uploadChunkToDiscord(filename, toUpload);
        
        // Store the DECRYPTED size in chunk.size for Range calculations
        const chunk = await prisma.fileChunk.create({ 
          data: { 
            fileId: fileRecord.id, 
            chunkIndex, 
            messageId, 
            channelId, 
            attachmentUrl, 
            size: plaintextPart.length  // Decrypted size, NOT encrypted size
          } 
        });
        chunksCreated.push(chunk);
        
        bytesRead += read;
        chunkIndex++;
        
        // Log progress
        if (chunkIndex % 10 === 0 || chunkIndex === totalChunks) {
          const pct = Math.round((bytesRead / fileSize) * 100);
          logger.info('Upload progress', { 
            fileId: fileRecord.id, 
            progress: `${chunkIndex}/${totalChunks} chunks (${pct}%)`,
            bytesUploaded: bytesRead
          });
        }
      }
    } finally {
      await fileHandle.close();
    }

    const stored = await prisma.file.findUnique({ where: { id: fileRecord.id } });
    logger.info('Streaming upload complete', { fileId: fileRecord.id, totalChunks: chunksCreated.length });
    return stored;
    
  } catch (err) {
    logger.error('Error storing file from path, rolling back:', err);
    // Attempt to clean up uploaded chunks
    for (const c of chunksCreated) {
      try { await deleteChunkFromDiscord(c.messageId, c.channelId); } catch (e) { /* ignore */ }
    }
    await prisma.fileChunk.deleteMany({ where: { fileId: fileRecord.id } }).catch(() => null);
    await prisma.file.delete({ where: { id: fileRecord.id } }).catch(() => null);
    throw err;
  }
}
