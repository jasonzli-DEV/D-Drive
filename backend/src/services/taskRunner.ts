import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import SftpClient from 'ssh2-sftp-client';
import archiver from 'archiver';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { storeBufferAsFile } from './storage';
import { deleteChunkFromDiscord } from './discord';

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
        // Fetch chunks for this file so we can remove messages from Discord first
        const chunks = await prisma.fileChunk.findMany({ where: { fileId: f.id } });

        // Attempt to delete each chunk message from Discord (best-effort with abort on hard failure)
        for (const c of chunks) {
          try {
            await deleteChunkFromDiscord(c.messageId, c.channelId);
          } catch (err) {
            logger.error('Failed to delete chunk from Discord while pruning; aborting prune for this file', { fileId: f.id, chunkId: c.id, err });
            // Don't continue deleting DB rows for this file if we couldn't remove its remote storage
            throw err;
          }
        }

        // All Discord messages removed for this file; now delete DB rows in transaction
        await prisma.$transaction(async (tx) => {
          await tx.fileChunk.deleteMany({ where: { fileId: f.id } });
          await tx.file.delete({ where: { id: f.id } });
        });

        logger.info('Pruned old backup', { fileId: f.id, name: f.name });
      } catch (err) {
        logger.warn('Failed to prune backup', { fileId: f.id, err });
      }
    }
  } catch (err) {
    logger.error('Error pruning backups', err);
  }
}

async function bufferFromStream(stream: any): Promise<Buffer> {
  // If already a Buffer, return directly
  if (Buffer.isBuffer(stream)) return stream;
  if (!stream) return Buffer.alloc(0);

  // If it's a Node readable stream (has .on), collect chunks
  if (typeof stream.on === 'function') {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', (e: any) => reject(e));
    });
  }

  // Handle common non-stream return types
  if (typeof stream === 'string') return Buffer.from(stream);
  if (ArrayBuffer.isView(stream)) return Buffer.from(stream as any);
  if (stream instanceof ArrayBuffer) return Buffer.from(new Uint8Array(stream));

  // If it's a promise-like object, await and recurse
  if (stream && typeof (stream as any).then === 'function') {
    const awaited = await stream;
    return bufferFromStream(awaited);
  }
  // Try common object shapes (e.g., { data: [...] } or { content: ... })
  if (stream && typeof stream === 'object') {
    if (Array.isArray((stream as any).data)) return Buffer.from((stream as any).data);
    if ((stream as any).content) return Buffer.from((stream as any).content);
    if ((stream as any).body) return Buffer.from((stream as any).body);
    try {
      return Buffer.from(JSON.stringify(stream));
    } catch (e) {
      // fallthrough
    }
  }

  throw new Error('Unsupported stream type passed to bufferFromStream');
}

function pad(n: number) { return n.toString().padStart(2, '0'); }
function formatTimestamp(d: Date) {
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${month}-${day}-${year}.${hh}:${mm}:${ss}`;
}

function looksLikeTimestampPrefix(name: string) {
  // Matches patterns like 1-4-2026.15:59:23 or 01-04-2026.15:59:23
  return /^\d{1,2}-\d{1,2}-\d{4}\.\d{2}:\d{2}:\d{2}/.test(name);
}

// Run task now: connect to SFTP, download entries, optionally compress, encrypt, and store
export async function runTaskNow(taskId: string) {
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { user: true } });
    if (!task) throw new Error('Task not found');
    if (!task.enabled) throw new Error('Task is disabled');

    const sftp = new SftpClient();

    // Attempt connections based on task auth preferences. If both methods are allowed,
    // try password first then private key (password may be desired by some servers).
    const baseConfig: any = { host: task.sftpHost, port: task.sftpPort || 22, username: task.sftpUser };

    const tryConnectWith = async (cfg: any) => {
      try {
        await sftp.connect(cfg);
        return true;
      } catch (e) {
        logger.warn('SFTP connect attempt failed', { err: e });
        return false;
      }
    };

    let connected = false;
    // If password auth is requested and a password is provided, try it first.
    if (task.authPassword && task.sftpPassword) {
      const cfg = { ...baseConfig, password: task.sftpPassword };
      connected = await tryConnectWith(cfg);
    }

    // If not connected and private-key auth is requested, try private key.
    if (!connected && task.authPrivateKey && task.sftpPrivateKey) {
      const cfg = { ...baseConfig, privateKey: task.sftpPrivateKey };
      connected = await tryConnectWith(cfg);
    }

    // If still not connected, as a fallback try any single method present.
    if (!connected) {
      const cfg: any = { ...baseConfig };
      if (task.sftpPrivateKey) cfg.privateKey = task.sftpPrivateKey;
      if (task.sftpPassword) cfg.password = task.sftpPassword;
      await sftp.connect(cfg);
    }

    // Recursively walk remote path and collect files (preserve relative paths)
    async function walkRemote(remoteBase: string) {
      const results: { relPath: string; buffer: Buffer }[] = [];

      async function walk(dir: string, prefix: string) {
        const list = await sftp.list(dir);
        for (const it of list) {
          // skip special entries
          if (it.name === '.' || it.name === '..') continue;
          const remoteFull = path.posix.join(dir, it.name);
          const rel = prefix ? `${prefix}/${it.name}` : it.name;
          if (it.type === 'd') {
            // directory -> recurse
            await walk(remoteFull, rel);
          } else if (it.type === '-') {
            // regular file -> fetch buffer
            const streamOrBuffer = await sftp.get(remoteFull);
            let buf: Buffer;
            if (Buffer.isBuffer(streamOrBuffer)) buf = streamOrBuffer as Buffer;
            else buf = await bufferFromStream(streamOrBuffer as any);
            results.push({ relPath: rel, buffer: buf });
          } else {
            // ignore other types (links, etc.)
            logger.info('Skipping remote entry (unsupported type)', { path: remoteFull, type: it.type });
          }
        }
      }

      await walk(remoteBase, '');
      return results;
    }

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ddrive-task-'));
    const downloadedEntries = await walkRemote(task.sftpPath);

    // If compression requested, create single archive buffer
    let uploadEntries: { name: string; buffer: Buffer }[] = [];
    if (task.compress === 'NONE' || task.compress === null) {
      // non-compressed: preserve directory structure by creating folders under the
      // run folder and storing files into their relative paths
      const baseParentPath = (await prisma.file.findUnique({ where: { id: targetParentId! }, select: { path: true } }))?.path || null;
      for (const d of downloadedEntries) {
        const relDir = path.posix.dirname(d.relPath);
        let destParent = targetParentId!;
        let currentPath = baseParentPath;
        if (relDir && relDir !== '.' && relDir !== '') {
          const parts = relDir.split('/');
          for (const part of parts) {
            let child = await prisma.file.findFirst({ where: { userId: task.userId, parentId: destParent, name: part, type: 'DIRECTORY' } });
            if (!child) {
              const childPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
              child = await prisma.file.create({
                data: {
                  name: part,
                  path: childPath,
                  type: 'DIRECTORY',
                  userId: task.userId,
                  parentId: destParent,
                },
              });
            }
            destParent = child.id;
            currentPath = child.path;
          }
        }
        // store the file into the resolved destParent
        await storeBufferAsFile(task.userId, destParent, path.posix.basename(d.relPath), d.buffer, undefined, shouldEncrypt);
      }
      // nothing more to upload
      uploadEntries = [];
    } else {
      const timestamp = formatTimestamp(new Date());
      const archiveName = `${timestamp}.${(task.name || 'backup')}`;
      const archivePath = path.join(tmpDir, `${archiveName}${task.compress === 'ZIP' ? '.zip' : '.tar.gz'}`);

      const output = fs.createWriteStream(archivePath);
      const archive = archiver(task.compress === 'ZIP' ? 'zip' : 'tar', task.compress === 'TAR_GZ' ? { gzip: true } : {});
      archive.pipe(output);
      // Add files preserving relative paths under the requested remote base
      for (const d of downloadedEntries) {
        archive.append(d.buffer, { name: d.relPath });
      }
      await archive.finalize();
      // wait for stream to finish
      await new Promise<void>((res, rej) => output.on('close', () => res()).on('error', (e) => rej(e)));
      const buf = await fs.promises.readFile(archivePath);
      uploadEntries = [{ name: path.basename(archivePath), buffer: buf }];
    }

    // Determine encryption preference: task explicit OR user's default
    const shouldEncrypt = (task.encrypt === true) || (task.user?.encryptByDefault === true);

    // If not compressing, create a directory for this run and place files inside it.
    let targetParentId: string | null = task.destinationId || null;

    if (task.compress === 'NONE' || task.compress === null) {
      const baseFolderName = task.name || 'backup';
      const folderBase = task.timestampNames ? `${formatTimestamp(new Date())}.${baseFolderName}` : baseFolderName;

      const parentPath = task.destinationId ? (await prisma.file.findUnique({ where: { id: task.destinationId }, select: { path: true } }))?.path : null;
      let candidateName = folderBase;
      let candidatePath = parentPath ? `${parentPath}/${candidateName}` : `/${candidateName}`;
      let counter = 1;
      while (await prisma.file.findFirst({ where: { userId: task.userId, path: candidatePath } })) {
        candidateName = `${folderBase} (${counter++})`;
        candidatePath = parentPath ? `${parentPath}/${candidateName}` : `/${candidateName}`;
      }

      const folder = await prisma.file.create({
        data: {
          name: candidateName,
          path: candidatePath,
          type: 'DIRECTORY',
          userId: task.userId,
          parentId: task.destinationId || null,
        },
      });

      targetParentId = folder.id;
    }

    // For each upload entry, store it using storage helper into the chosen parent (folder or destination)
    for (const entry of uploadEntries) {
      let nameToUse: string;
      if (task.timestampNames) {
        // Don't double-prefix if entry already begins with a timestamp
        nameToUse = looksLikeTimestampPrefix(entry.name) ? entry.name : `${formatTimestamp(new Date())}.${entry.name}`;
      } else {
        nameToUse = entry.name;
      }
      await storeBufferAsFile(task.userId, targetParentId, nameToUse, entry.buffer, undefined, shouldEncrypt);
    }

    // Prune according to maxFiles
    if (task.maxFiles && task.destinationId) {
      await pruneOldBackups(task.userId, task.destinationId, task.maxFiles);
    }

    await sftp.end();
    await prisma.task.update({ where: { id: taskId }, data: { lastRun: new Date() } });
    logger.info('Task run complete', { taskId });
  } catch (err) {
    logger.error('Task run failed', err);
    throw err;
  }
}
