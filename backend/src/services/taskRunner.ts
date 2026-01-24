import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import SftpClient from 'ssh2-sftp-client';
import archiver from 'archiver';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { storeBufferAsFile } from './storage';

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

async function bufferFromStream(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (e: any) => reject(e));
  });
}

// Run task now: connect to SFTP, download entries, optionally compress, encrypt, and store
export async function runTaskNow(taskId: string) {
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { user: true } });
    if (!task) throw new Error('Task not found');
    if (!task.enabled) throw new Error('Task is disabled');

    const sftp = new SftpClient();
    const connectConfig: any = { host: task.sftpHost, port: task.sftpPort || 22, username: task.sftpUser };
    if (task.sftpPrivateKey) connectConfig.privateKey = task.sftpPrivateKey;

    await sftp.connect(connectConfig);

    // List files in remote path
    const list = await sftp.list(task.sftpPath);
    const filesToDownload = list.filter((it: any) => it.type === '-'); // '-' is file

    // Temporary storage
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ddrive-task-'));

    const downloaded: { name: string; buffer: Buffer }[] = [];
    for (const f of filesToDownload) {
      const remotePath = path.posix.join(task.sftpPath, f.name);
      const streamOrBuffer = await sftp.get(remotePath);
      let buf: Buffer;
      if (Buffer.isBuffer(streamOrBuffer)) buf = streamOrBuffer as Buffer;
      else buf = await bufferFromStream(streamOrBuffer as any);
      downloaded.push({ name: f.name, buffer: buf });
    }

    // If compression requested, create single archive buffer
    let uploadEntries: { name: string; buffer: Buffer }[] = [];
    if (task.compress === 'NONE' || task.compress === null) {
      uploadEntries = downloaded;
    } else {
      const archiveName = `${task.name || 'backup'}_${new Date().toISOString()}`;
      const archivePath = path.join(tmpDir, `${archiveName}${task.compress === 'ZIP' ? '.zip' : '.tar.gz'}`);

      const output = fs.createWriteStream(archivePath);
      const archive = archiver(task.compress === 'ZIP' ? 'zip' : 'tar', task.compress === 'TAR_GZ' ? { gzip: true } : {});
      archive.pipe(output);
      for (const d of downloaded) {
        archive.append(d.buffer, { name: d.name });
      }
      await archive.finalize();
      // wait for stream to finish
      await new Promise<void>((res, rej) => output.on('close', () => res()).on('error', (e) => rej(e)));
      const buf = await fs.promises.readFile(archivePath);
      uploadEntries = [{ name: path.basename(archivePath), buffer: buf }];
    }

    // Determine encryption preference: task explicit OR user's default
    const shouldEncrypt = (task.encrypt === true) || (task.user?.encryptByDefault === true);

    // For each upload entry, store it using storage helper
    for (const entry of uploadEntries) {
      const timestampedName = task.timestampNames ? `${new Date().toISOString()}_${entry.name}` : entry.name;
      await storeBufferAsFile(task.userId, task.destinationId || null, timestampedName, entry.buffer, undefined, shouldEncrypt);
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
