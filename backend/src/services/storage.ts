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
      size: BigInt(buffer.length),
      mimeType: mimeType || 'application/octet-stream',
      type: 'FILE',
      encrypted: shouldEncrypt,
      userId,
      parentId: parentId || null,
    },
  });

  // If encryption requested, encrypt buffer
  let processingBuffer = buffer;
  if (shouldEncrypt && encryptionKey) {
    processingBuffer = encryptBuffer(buffer, encryptionKey);
  }

  const parts = splitBuffer(processingBuffer, CHUNK_SIZE);
  const chunksCreated: any[] = [];

  try {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const filename = `${fileRecord.id}_chunk_${i}_${uniqueName}`;
      const { messageId, attachmentUrl, channelId } = await uploadChunkToDiscord(filename, part);
      const chunk = await prisma.fileChunk.create({ data: { fileId: fileRecord.id, chunkIndex: i, messageId, channelId, attachmentUrl, size: part.length } });
      chunksCreated.push(chunk);
    }

    // Update recorded size (in case encryption changed it)
    await prisma.file.update({ where: { id: fileRecord.id }, data: { size: BigInt(processingBuffer.length) } });

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
