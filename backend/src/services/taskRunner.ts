import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import SftpClient from 'ssh2-sftp-client';
import archiver from 'archiver';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { storeFileFromPath, storeBufferAsFile } from './storage';
import { deleteChunkFromDiscord } from './discord';

const prisma = new PrismaClient();

// Track running tasks and their cancellation flags
const runningTasks = new Map<string, { cancelled: boolean; tmpDir: string | null }>();

// Stop a running task
export async function stopTask(taskId: string) {
  const runInfo = runningTasks.get(taskId);
  
  // If task is not in memory but DB shows it's running, fix the DB state
  if (!runInfo) {
    const task = await prisma.task.findUnique({ 
      where: { id: taskId },
      select: { id: true, lastStarted: true, lastRun: true, userId: true, name: true }
    });
    
    if (!task) {
      throw new Error('Task not found');
    }
    
    // If DB shows task as running (lastStarted > lastRun), update it
    if (task.lastStarted && task.lastRun && task.lastStarted > task.lastRun) {
      await prisma.task.update({
        where: { id: taskId },
        data: { lastRun: new Date() }
      });
      logger.info('Fixed stale task state in DB', { taskId });
      
      const { createLog } = require('../routes/logs');
      await createLog(task.userId, 'TASK', `Task stopped: ${task.name}`, true, 'Task was not actually running (stale state fixed)');
      
      return;
    }
    
    throw new Error('Task is not currently running');
  }
  
  logger.info('Stopping task', { taskId });
  runInfo.cancelled = true;
  
  // Wait a moment for cleanup
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Force cleanup temp directory if it exists
  if (runInfo.tmpDir) {
    try {
      await fs.promises.rm(runInfo.tmpDir, { recursive: true, force: true });
      logger.info('Cleaned up temp directory', { taskId, tmpDir: runInfo.tmpDir });
    } catch (err) {
      logger.warn('Failed to cleanup temp directory', { taskId, tmpDir: runInfo.tmpDir, err });
    }
  }
  
  runningTasks.delete(taskId);
  
  // Log the stop
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (task) {
      const { createLog } = require('../routes/logs');
      await createLog(task.userId, 'TASK', `Task stopped: ${task.name}`, true, 'Manually stopped by user');
    }
  } catch (logErr) {
    logger.warn('Failed to log task stop:', logErr);
  }
}

// Helper to ensure a directory path exists, creating it recursively if needed
async function ensureDirectoryPath(userId: string, pathParts: string[]): Promise<string | null> {
  if (pathParts.length === 0) return null;
  
  let currentParentId: string | null = null;
  let currentPath = '';
  
  for (const part of pathParts) {
    currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
    
    // Check if this folder already exists
    let folder = await prisma.file.findFirst({
      where: { userId, path: currentPath, type: 'DIRECTORY' }
    });
    
    if (!folder) {
      // Create the folder
      folder = await prisma.file.create({
        data: {
          name: part,
          path: currentPath,
          type: 'DIRECTORY',
          userId,
          parentId: currentParentId,
        },
      });
      logger.info('Auto-created directory for task', { path: currentPath, folderId: folder.id });
    }
    
    currentParentId = folder.id;
  }
  
  return currentParentId;
}

// Ensure task destination folder exists, recreating the path if needed
async function ensureTaskDestination(task: any): Promise<string | null> {
  if (!task.destinationId) return null;
  
  // Check if destination folder still exists
  const dest = await prisma.file.findUnique({
    where: { id: task.destinationId },
    select: { id: true, path: true }
  });
  
  if (dest) return dest.id;
  
  // Destination was deleted/moved, try to recreate it from the stored path
  logger.warn('Task destination folder missing, attempting to recreate', { taskId: task.id, destId: task.destinationId });
  
  // Try to find the original path by looking at recent backup files created by this task
  const recentFile = await prisma.file.findFirst({
    where: {
      userId: task.userId,
      name: { contains: task.name },
      type: 'FILE',
    },
    orderBy: { createdAt: 'desc' },
    select: { path: true },
  });
  
  let targetPath: string;
  if (recentFile?.path) {
    // Extract the parent path from the file path (e.g., "/TinyFun Backups/TinyProxy/file.tar.gz" -> "/TinyFun Backups/TinyProxy")
    const pathParts = recentFile.path.split('/').filter(Boolean);
    pathParts.pop(); // Remove filename
    targetPath = '/' + pathParts.join('/');
    logger.info('Found original path from recent file', { originalPath: targetPath });
  } else {
    // Fallback: create a simple folder with task name at root
    targetPath = `/${task.name}`;
    logger.warn('No recent files found, using simple path', { fallbackPath: targetPath });
  }
  
  // Recreate the full folder structure
  const newFolder = await createFolderPath(targetPath, task.userId);
  
  // Update the task to point to new destination
  await prisma.task.update({
    where: { id: task.id },
    data: { destinationId: newFolder }
  });
  
  logger.info('Recreated task destination folder', { taskId: task.id, newDestId: newFolder, path: targetPath });
  return newFolder;
}

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
// Uses STREAMING to handle large servers (60GB+) without running out of memory
export async function runTaskNow(taskId: string) {
  const startTime = new Date();
  let tmpDir: string | null = null;
  
  // Track this task as running
  runningTasks.set(taskId, { cancelled: false, tmpDir: null });
  
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { user: true } });
    if (!task) throw new Error('Task not found');
    if (!task.enabled) throw new Error('Task is disabled');

    // Mark task as started
    await prisma.task.update({ 
      where: { id: taskId }, 
      data: { lastStarted: startTime } 
    });
    
    // Log task start
    try {
      const { createLog } = require('../routes/logs');
      await createLog(task.userId, 'TASK', `Task started: ${task.name}`, true);
    } catch (logErr) {
      logger.warn('Failed to log task start:', logErr);
    }

    // Check for cancellation
    if (runningTasks.get(taskId)?.cancelled) {
      throw new Error('Task was cancelled');
    }

    // Ensure destination folder exists (recreate if deleted)
    const destinationId = await ensureTaskDestination(task);
    
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

    // Create temp directory for this task run
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ddrive-task-'));
    runningTasks.get(taskId)!.tmpDir = tmpDir;
    logger.info('Created temp directory for task', { taskId, tmpDir });
    
    // Check for cancellation
    if (runningTasks.get(taskId)?.cancelled) {
      throw new Error('Task was cancelled');
    }

    // Determine encryption preference: task explicit OR user's default
    const shouldEncrypt = (task.encrypt === true) || (task.user?.encryptByDefault === true);

    // For compressed archives: stream download directly to archive file
    if (task.compress === 'ZIP' || task.compress === 'TAR_GZ') {
      const timestamp = formatTimestamp(new Date());
      const archiveName = `${timestamp}.${(task.name || 'backup')}${task.compress === 'ZIP' ? '.zip' : '.tar.gz'}`;
      const archivePath = path.join(tmpDir, archiveName);

      logger.info('Starting streaming archive creation', { taskId, archivePath, remotePath: task.sftpPath });

      // Create archive stream to file
      const output = fs.createWriteStream(archivePath);
      const archive = archiver(task.compress === 'ZIP' ? 'zip' : 'tar', task.compress === 'TAR_GZ' ? { gzip: true } : {});
      
      // Track progress
      let filesAdded = 0;
      let totalBytes = 0;

      // Pipe archive to file
      archive.pipe(output);

      // Recursively walk and STREAM files directly into the archive (no memory buffering)
      async function streamRemoteToArchive(remoteBase: string) {
        if (!task) throw new Error('Task not found');
        async function walk(dir: string, prefix: string) {
          let list;
          try {
            list = await sftp.list(dir);
          } catch (listErr) {
            logger.warn('Failed to list directory, skipping', { dir, err: listErr });
            return;
          }
          
          for (const it of list) {
            // Check for cancellation
            if (runningTasks.get(taskId)?.cancelled) {
              throw new Error('Task was cancelled');
            }
            
            // skip special entries
            if (it.name === '.' || it.name === '..') continue;
            const remoteFull = path.posix.join(dir, it.name);
            const rel = prefix ? `${prefix}/${it.name}` : it.name;
            
            if (it.type === 'd') {
              // directory -> recurse
              await walk(remoteFull, rel);
            } else if (it.type === '-') {
              // regular file -> stream directly to archive
              try {
                // Download to temp file first (for large files this prevents memory issues)
                const tempFilePath = path.join(tmpDir!, `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
                
                // Use sftp.fastGet for efficient streaming download
                await sftp.fastGet(remoteFull, tempFilePath);
                
                // Get file size
                const stat = await fs.promises.stat(tempFilePath);
                totalBytes += stat.size;
                
                // Stream the temp file into the archive
                const fileStream = fs.createReadStream(tempFilePath);
                archive.append(fileStream, { name: rel });
                
                filesAdded++;
                
                // Log progress every 100 files
                if (filesAdded % 100 === 0) {
                  logger.info('Archive progress', { taskId, filesAdded, totalBytes: formatBytes(totalBytes) });
                }
                
                // Clean up temp file after it's been added to archive
                // Note: archive.append is async, so we clean up after a short delay
                setTimeout(async () => {
                  try {
                    await fs.promises.unlink(tempFilePath);
                  } catch (e) {
                    // Ignore cleanup errors
                  }
                }, 5000);
                
              } catch (fileErr) {
                logger.warn('Failed to download file, skipping', { remoteFull, err: fileErr });
              }
            } else {
              // ignore other types (links, etc.)
              logger.info('Skipping remote entry (unsupported type)', { path: remoteFull, type: it.type });
            }
          }
        }

        await walk(remoteBase, '');
      }

      // Stream all files into archive
      await streamRemoteToArchive(task.sftpPath);
      
      logger.info('Finalizing archive', { taskId, filesAdded, totalBytes: formatBytes(totalBytes) });
      
      // Finalize the archive
      await archive.finalize();
      
      // Wait for output stream to finish writing
      await new Promise<void>((resolve, reject) => {
        output.on('close', () => resolve());
        output.on('error', (e) => reject(e));
      });
      
      // Get final archive size
      const archiveStat = await fs.promises.stat(archivePath);
      logger.info('Archive created', { 
        taskId, 
        archivePath, 
        archiveSize: formatBytes(archiveStat.size), 
        filesAdded,
        originalSize: formatBytes(totalBytes)
      });

      // Now stream upload the archive to Discord (using file path, not loading into memory)
      const finalName = task.timestampNames && !looksLikeTimestampPrefix(archiveName) 
        ? `${formatTimestamp(new Date())}.${archiveName}` 
        : archiveName;
      
      logger.info('Uploading archive', { finalName, shouldEncrypt, hasEncryptionKey: !!task.user?.encryptionKey });
      await storeFileFromPath(task.userId, destinationId, finalName, archivePath, undefined, shouldEncrypt);
      
      logger.info('Archive uploaded to Discord', { taskId, finalName });

    } else {
      // Non-compressed: download each file to disk, then upload individually
      // This also uses streaming to handle large individual files
      
      const baseFolderName = task.name || 'backup';
      const folderBase = task.timestampNames ? `${formatTimestamp(new Date())}.${baseFolderName}` : baseFolderName;

      const parentPath = destinationId ? (await prisma.file.findUnique({ where: { id: destinationId }, select: { path: true } }))?.path : null;
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
          parentId: destinationId || null,
        },
      });

      const targetParentId = folder.id;
      const baseParentPath = folder.path;
      
      let filesUploaded = 0;
      let totalBytes = 0;

      // Recursively walk and stream each file
      async function streamRemoteFiles(remoteBase: string) {
        if (!task) throw new Error('Task not found');
        async function walk(dir: string, prefix: string, currentParentId: string, currentPath: string) {
          let list;
          try {
            list = await sftp.list(dir);
          } catch (listErr) {
            logger.warn('Failed to list directory, skipping', { dir, err: listErr });
            return;
          }
          
          for (const it of list) {
            if (it.name === '.' || it.name === '..') continue;
            const remoteFull = path.posix.join(dir, it.name);
            const rel = prefix ? `${prefix}/${it.name}` : it.name;
            
            if (it.type === 'd') {
              // Create directory in D-Drive
              if (!task) throw new Error('Task not found');
              let child = await prisma.file.findFirst({ 
                where: { userId: task.userId, parentId: currentParentId, name: it.name, type: 'DIRECTORY' } 
              });
              if (!child) {
                const childPath = currentPath ? `${currentPath}/${it.name}` : `/${it.name}`;
                child = await prisma.file.create({
                  data: {
                    name: it.name,
                    path: childPath,
                    type: 'DIRECTORY',
                    userId: task.userId,
                    parentId: currentParentId,
                  },
                });
              }
              // Recurse into subdirectory
              await walk(remoteFull, rel, child.id, child.path);
            } else if (it.type === '-') {
              // Download file to temp, then upload
              if (!task) throw new Error('Task not found');
              try {
                const tempFilePath = path.join(tmpDir!, `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
                await sftp.fastGet(remoteFull, tempFilePath);
                
                const stat = await fs.promises.stat(tempFilePath);
                totalBytes += stat.size;
                
                // Upload to Discord using file path (streaming)
                await storeFileFromPath(task.userId, currentParentId, it.name, tempFilePath, undefined, shouldEncrypt);
                
                filesUploaded++;
                
                if (filesUploaded % 50 === 0) {
                  logger.info('Upload progress', { taskId, filesUploaded, totalBytes: formatBytes(totalBytes) });
                }
                
                // Clean up temp file
                await fs.promises.unlink(tempFilePath).catch(() => {});
                
              } catch (fileErr) {
                logger.warn('Failed to upload file, skipping', { remoteFull, err: fileErr });
              }
            }
          }
        }

        await walk(remoteBase, '', targetParentId, baseParentPath);
      }

      await streamRemoteFiles(task.sftpPath);
      logger.info('All files uploaded', { taskId, filesUploaded, totalBytes: formatBytes(totalBytes) });
    }

    // Prune according to maxFiles
    if (task.maxFiles && destinationId) {
      await pruneOldBackups(task.userId, destinationId, task.maxFiles);
    }

    await sftp.end();
    
    // Clean up temp directory
    if (tmpDir) {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
    
    // Remove from running tasks
    runningTasks.delete(taskId);
    
    // Calculate runtime in seconds
    const endTime = new Date();
    const runtimeSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    
    await prisma.task.update({ 
      where: { id: taskId }, 
      data: { 
        lastRun: endTime,
        lastRuntime: runtimeSeconds
      } 
    });
    
    // Log success
    try {
      const { createLog } = require('../routes/logs');
      await createLog(task.userId, 'TASK', `Task completed: ${task.name}`, true, undefined, { 
        runtime: runtimeSeconds,
        taskName: task.name
      });
    } catch (logErr) {
      logger.warn('Failed to log task completion:', logErr);
    }
    
    logger.info('Task run complete', { taskId, runtimeSeconds });
  } catch (err) {
    logger.error('Task run failed', err);
    
    // Clean up temp directory on error
    if (tmpDir) {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
    
    // Remove from running tasks
    runningTasks.delete(taskId);
    
    // Still update lastRun on failure to show when it was attempted
    const endTime = new Date();
    const runtimeSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    try {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      
      await prisma.task.update({
        where: { id: taskId },
        data: {
          lastRun: endTime,
          lastRuntime: runtimeSeconds
        }
      });
      
      // Log failure
      if (task) {
        const { createLog } = require('../routes/logs');
        const errMsg = err instanceof Error ? err.message : String(err);
        await createLog(task.userId, 'TASK', `Task failed: ${task.name}`, false, errMsg, { 
          runtime: runtimeSeconds,
          taskName: task.name
        });
      }
    } catch (updateErr) {
      logger.error('Failed to update task after error', updateErr);
    }
    
    throw err;
  }
}

// Helper to format bytes for logging
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
