import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import SftpClient from 'ssh2-sftp-client';
import archiver from 'archiver';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { storeFileFromPath, storeBufferAsFile } from './storage';
import { deleteChunkFromDiscord } from './discord';
import { clearRunningState } from './scheduler';



// Track running tasks, their cancellation flags, and progress
interface TaskRunInfo {
  cancelled: boolean;
  tmpDir: string | null;
  progress?: {
    phase: 'connecting' | 'scanning' | 'downloading' | 'archiving' | 'uploading' | 'complete';
    filesProcessed: number;
    totalFiles: number;          // Total files to process (from pre-scan)
    totalBytes: number;          // Bytes downloaded so far
    estimatedTotalBytes: number; // Estimated total bytes (from pre-scan)
    currentDir?: string;
    reconnects: number;
    startTime: Date;
  };
}

const runningTasks = new Map<string, TaskRunInfo>();

// Check if a task is currently running
export function isTaskRunning(taskId: string): boolean {
  return runningTasks.has(taskId);
}

// Get task progress for API
export function getTaskProgress(taskId: string) {
  const info = runningTasks.get(taskId);
  if (!info?.progress) return null;
  return {
    ...info.progress,
    elapsedMs: Date.now() - info.progress.startTime.getTime(),
  };
}

// Get all running tasks with their progress
export function getAllRunningTasksProgress() {
  const result: { taskId: string; progress: any }[] = [];
  runningTasks.forEach((info, taskId) => {
    if (info.progress) {
      result.push({
        taskId,
        progress: {
          ...info.progress,
          elapsedMs: Date.now() - info.progress.startTime.getTime(),
        },
      });
    }
  });
  return result;
}

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
    // Don't update lastRuntime since the task was stopped, not completed
    if (task.lastStarted && task.lastRun && task.lastStarted > task.lastRun) {
      await prisma.task.update({
        where: { id: taskId },
        data: { lastRun: new Date() }
        // Intentionally NOT updating lastRuntime - task was stopped, not completed
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
  
  // Also clear the running state in scheduler (separate tracking system)
  clearRunningState(taskId);
  
  // Update lastRun to mark task as stopped, but DON'T update lastRuntime
  // because the task was manually stopped, not completed
  await prisma.task.update({
    where: { id: taskId },
    data: { lastRun: new Date() }
    // Intentionally NOT updating lastRuntime - task was stopped, not completed
  });
  
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
  if (!task.destinationId && !task.destinationPath) return null;
  
  // Check if destination folder still exists
  if (task.destinationId) {
    const dest = await prisma.file.findUnique({
      where: { id: task.destinationId },
      select: { id: true, path: true }
    });
    
    if (dest) {
      // Update destinationPath if not set (migration from old tasks)
      if (!task.destinationPath && dest.path) {
        await prisma.task.update({
          where: { id: task.id },
          data: { destinationPath: dest.path }
        });
      }
      return dest.id;
    }
  }
  
  // Destination was deleted, recreate it from destinationPath
  logger.warn('Task destination folder missing, attempting to recreate', { 
    taskId: task.id, 
    destId: task.destinationId,
    destPath: task.destinationPath 
  });
  
  let targetPath: string;
  if (task.destinationPath) {
    // Use the stored path
    targetPath = task.destinationPath;
    logger.info('Using stored destination path', { path: targetPath });
  } else {
    // Fallback for old tasks without destinationPath: look at recent files
    const recentFile = await prisma.file.findFirst({
      where: {
        userId: task.userId,
        name: { contains: task.name },
        type: 'FILE',
      },
      orderBy: { createdAt: 'desc' },
      select: { path: true },
    });
    
    if (recentFile?.path) {
      // Extract the parent path from the file path
      const pathParts = recentFile.path.split('/').filter(Boolean);
      pathParts.pop(); // Remove filename
      targetPath = '/' + pathParts.join('/');
      logger.info('Found original path from recent file', { originalPath: targetPath });
    } else {
      // Last resort: create folder with task name at root
      targetPath = `/${task.name}`;
      logger.warn('No stored path or recent files, using fallback path', { fallbackPath: targetPath });
    }
  }
  
  // Recreate the full folder structure
  const pathParts = targetPath.split('/').filter(Boolean);
  const newFolder = await ensureDirectoryPath(task.userId, pathParts);
  
  // Update the task with new destination ID and store the path
  await prisma.task.update({
    where: { id: task.id },
    data: { 
      destinationId: newFolder,
      destinationPath: targetPath
    }
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
  // Check if already running
  if (runningTasks.has(taskId)) {
    throw new Error('Task is already running');
  }
  
  const startTime = new Date();
  let tmpDir: string | null = null;
  
  // Track this task as running with progress
  runningTasks.set(taskId, { 
    cancelled: false, 
    tmpDir: null,
    progress: {
      phase: 'connecting',
      filesProcessed: 0,
      totalFiles: 0,
      totalBytes: 0,
      estimatedTotalBytes: 0,
      reconnects: 0,
      startTime,
    }
  });
  
  // Helper to update progress
  const updateProgress = (updates: Partial<TaskRunInfo['progress']>) => {
    const info = runningTasks.get(taskId);
    if (info?.progress) {
      Object.assign(info.progress, updates);
    }
  };
  
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
    
    let sftp = new SftpClient();
    
    // Increase max listeners to prevent warnings during parallel downloads
    // Each parallel download adds listeners, so we need more than the default 10
    sftp.client.setMaxListeners(200);

    // Attempt connections based on task auth preferences. If both methods are allowed,
    // try password first then private key (password may be desired by some servers).
    const baseConfig: any = { host: task.sftpHost, port: task.sftpPort || 22, username: task.sftpUser };

    // Build the working config for reconnections
    let workingConfig: any = { ...baseConfig };
    if (task.sftpPassword) workingConfig.password = task.sftpPassword;
    if (task.sftpPrivateKey) workingConfig.privateKey = task.sftpPrivateKey;

    const tryConnectWith = async (cfg: any) => {
      try {
        await sftp.connect(cfg);
        return true;
      } catch (e) {
        logger.warn('SFTP connect attempt failed', { err: e });
        return false;
      }
    };

    // Helper to reconnect SFTP if connection drops
    const ensureConnected = async (): Promise<boolean> => {
      try {
        // Quick test if connected - try to get current working directory
        await sftp.cwd();
        return true;
      } catch (e) {
        // Connection lost, attempt reconnect
        logger.warn('SFTP connection lost, attempting reconnect...', { taskId });
        try {
          // End old connection gracefully
          try { await sftp.end(); } catch (endErr) { /* ignore */ }
          // Create new client and connect
          sftp = new SftpClient();
          sftp.client.setMaxListeners(200); // Increase for parallel downloads
          await sftp.connect(workingConfig);
          logger.info('SFTP reconnected successfully', { taskId });
          return true;
        } catch (reconnectErr) {
          logger.error('SFTP reconnect failed', { taskId, err: reconnectErr });
          return false;
        }
      }
    };

    let connected = false;
    // If password auth is requested and a password is provided, try it first.
    if (task.authPassword && task.sftpPassword) {
      const cfg = { ...baseConfig, password: task.sftpPassword };
      connected = await tryConnectWith(cfg);
      if (connected) workingConfig = cfg;
    }

    // If not connected and private-key auth is requested, try private key.
    if (!connected && task.authPrivateKey && task.sftpPrivateKey) {
      const cfg = { ...baseConfig, privateKey: task.sftpPrivateKey };
      connected = await tryConnectWith(cfg);
      if (connected) workingConfig = cfg;
    }

    // If still not connected, as a fallback try any single method present.
    if (!connected) {
      const cfg: any = { ...baseConfig };
      if (task.sftpPrivateKey) cfg.privateKey = task.sftpPrivateKey;
      if (task.sftpPassword) cfg.password = task.sftpPassword;
      await sftp.connect(cfg);
      workingConfig = cfg;
    }

    // Create temp directory for this task run
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ddrive-task-'));
    runningTasks.get(taskId)!.tmpDir = tmpDir;
    logger.info('Created temp directory for task', { taskId, tmpDir });
    
    // Check for cancellation
    if (runningTasks.get(taskId)?.cancelled) {
      throw new Error('Task was cancelled');
    }
    
    // Build list of excluded paths for filtering
    const excludePaths = (task.excludePaths || []).map((p: string) => p.toLowerCase().trim()).filter(Boolean);
    const isExcluded = (itemPath: string) => {
      if (excludePaths.length === 0) return false;
      const lower = itemPath.toLowerCase();
      return excludePaths.some(exc => {
        // Match if the path contains the excluded pattern as a segment
        return lower.includes(`/${exc}/`) || lower.endsWith(`/${exc}`) || lower === exc;
      });
    };
    
    let scanFileCount = 0;
    let scanTotalBytes = 0;
    
    // Pre-scan to count files and estimate total size (unless skipPrescan is enabled)
    if (task.skipPrescan) {
      logger.info('Skipping pre-scan (skipPrescan enabled)', { taskId });
      updateProgress({ phase: 'downloading', totalFiles: 0, estimatedTotalBytes: 0 });
    } else {
      updateProgress({ phase: 'scanning' });
      logger.info('Pre-scanning remote directory for file count...', { taskId, remotePath: task.sftpPath });
    
    // Try SSH exec for fast scan (works on servers that allow shell commands)
    let execWorked = false;
    try {
      const sshClient = (sftp as any).client;
      const findResult = await new Promise<string>((resolve, reject) => {
        const cmd = `find "${task.sftpPath}" -type f -exec stat -c '%s' {} \\; 2>/dev/null`;
        const timeout = setTimeout(() => reject(new Error('exec timeout')), 5000);
        
        sshClient.exec(cmd, (err: Error | undefined, stream: any) => {
          if (err) {
            clearTimeout(timeout);
            reject(err);
            return;
          }
          
          let output = '';
          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });
          stream.stderr.on('data', () => {});
          stream.on('close', () => {
            clearTimeout(timeout);
            resolve(output);
          });
          stream.on('error', (e: Error) => {
            clearTimeout(timeout);
            reject(e);
          });
        });
      });
      
      const lines = findResult.trim().split('\n').filter(line => line.length > 0);
      for (const line of lines) {
        const size = parseInt(line, 10);
        if (!isNaN(size)) {
          scanFileCount++;
          scanTotalBytes += size;
        }
      }
      if (scanFileCount > 0) execWorked = true;
    } catch (execErr) {
      logger.info('SSH exec not available, using parallel SFTP scan', { taskId });
    }
    
    // Fallback: parallel SFTP directory listing (for SFTP-only servers)
    if (!execWorked) {
      const dirsToScan: string[] = [task.sftpPath];
      const PARALLEL_SCANS = 10; // Scan up to 10 directories in parallel
      
      // Increase max listeners to prevent warnings during parallel scans
      const sshClient = (sftp as any).client;
      if (sshClient && typeof sshClient.setMaxListeners === 'function') {
        sshClient.setMaxListeners(200);
      }
      
      while (dirsToScan.length > 0 && !runningTasks.get(taskId)?.cancelled) {
        // Take a batch of directories to scan in parallel
        const batch = dirsToScan.splice(0, PARALLEL_SCANS);
        
        const results = await Promise.allSettled(
          batch.map(async (dir) => {
            // Skip excluded directories
            if (isExcluded(dir)) {
              return { subdirs: [], files: 0, bytes: 0 };
            }
            try {
              const list = await sftp.list(dir);
              const subdirs: string[] = [];
              let batchFiles = 0;
              let batchBytes = 0;
              
              for (const item of list) {
                if (item.name === '.' || item.name === '..') continue;
                const itemPath = path.posix.join(dir, item.name);
                // Skip excluded paths
                if (isExcluded(itemPath)) continue;
                if (item.type === 'd') {
                  subdirs.push(itemPath);
                } else if (item.type === '-') {
                  batchFiles++;
                  batchBytes += item.size || 0;
                }
              }
              return { subdirs, files: batchFiles, bytes: batchBytes };
            } catch (err) {
              return { subdirs: [], files: 0, bytes: 0 };
            }
          })
        );
        
        for (const result of results) {
          if (result.status === 'fulfilled') {
            dirsToScan.push(...result.value.subdirs);
            scanFileCount += result.value.files;
            scanTotalBytes += result.value.bytes;
          }
        }
        
        // Update progress during scan
        updateProgress({ 
          totalFiles: scanFileCount, 
          estimatedTotalBytes: scanTotalBytes,
          currentDir: batch[0]
        });
      }
    }
    
    logger.info('Pre-scan complete', { taskId, fileCount: scanFileCount, estimatedSize: formatBytes(scanTotalBytes) });
    } // end if (!task.skipPrescan)
    
    // Update progress with totals
    updateProgress({ 
      totalFiles: scanFileCount, 
      estimatedTotalBytes: scanTotalBytes 
    });

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
      let reconnectAttempts = 0;
      const MAX_RECONNECTS = 10; // Allow up to 10 reconnections per task
      
      // Track archive errors - must be set up BEFORE piping
      let archiveError: Error | null = null;
      archive.on('error', (err) => {
        logger.error('Archive stream error', { taskId, err });
        archiveError = err;
      });
      archive.on('warning', (err) => {
        logger.warn('Archive warning', { taskId, err: err.message });
      });
      output.on('error', (err) => {
        logger.error('Output stream error', { taskId, err });
        archiveError = err;
      });

      // Pipe archive to file
      archive.pipe(output);

      // Recursively walk and STREAM files directly into the archive (no memory buffering)
      async function streamRemoteToArchive(remoteBase: string) {
        if (!task) throw new Error('Task not found');
        
        // Helper to list directory with retry on connection failure
        async function listWithRetry(dir: string, retries = 3): Promise<any[] | null> {
          for (let attempt = 1; attempt <= retries; attempt++) {
            try {
              return await sftp.list(dir);
            } catch (err: any) {
              const isConnectionError = err.code === 'ERR_NOT_CONNECTED' || 
                                        err.code === 'ECONNRESET' || 
                                        err.code === 'ERR_GENERIC_CLIENT';
              
              if (isConnectionError && attempt < retries && reconnectAttempts < MAX_RECONNECTS) {
                logger.warn('Connection lost during list, reconnecting...', { dir, attempt, taskId });
                reconnectAttempts++;
                const reconnected = await ensureConnected();
                if (reconnected) {
                  await new Promise(r => setTimeout(r, 1000)); // Brief pause after reconnect
                  continue;
                }
              }
              
              if (attempt === retries) {
                logger.warn('Failed to list directory after retries, skipping', { dir, err, taskId });
                return null;
              }
            }
          }
          return null;
        }
        
        // Helper to download file with retry on connection failure
        async function downloadWithRetry(remotePath: string, localPath: string, retries = 3): Promise<boolean> {
          for (let attempt = 1; attempt <= retries; attempt++) {
            try {
              await sftp.fastGet(remotePath, localPath);
              return true;
            } catch (err: any) {
              const isConnectionError = err.code === 'ERR_NOT_CONNECTED' || 
                                        err.code === 'ECONNRESET' || 
                                        err.code === 'ERR_GENERIC_CLIENT';
              
              if (isConnectionError && attempt < retries && reconnectAttempts < MAX_RECONNECTS) {
                logger.warn('Connection lost during download, reconnecting...', { remotePath, attempt, taskId });
                reconnectAttempts++;
                const reconnected = await ensureConnected();
                if (reconnected) {
                  await new Promise(r => setTimeout(r, 1000)); // Brief pause after reconnect
                  continue;
                }
              }
              
              if (attempt === retries) {
                logger.warn('Failed to download file after retries, skipping', { remotePath, err, taskId });
                return false;
              }
            }
          }
          return false;
        }
        
        // Helper to download small file to memory buffer with retry
        async function downloadToBufferWithRetry(remotePath: string, retries = 3): Promise<Buffer | null> {
          for (let attempt = 1; attempt <= retries; attempt++) {
            try {
              const buffer = await sftp.get(remotePath);
              return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as any);
            } catch (err: any) {
              const isConnectionError = err.code === 'ERR_NOT_CONNECTED' || 
                                        err.code === 'ECONNRESET' || 
                                        err.code === 'ERR_GENERIC_CLIENT';
              
              if (isConnectionError && attempt < retries && reconnectAttempts < MAX_RECONNECTS) {
                logger.warn('Connection lost during buffer download, reconnecting...', { remotePath, attempt, taskId });
                reconnectAttempts++;
                const reconnected = await ensureConnected();
                if (reconnected) {
                  await new Promise(r => setTimeout(r, 1000));
                  continue;
                }
              }
              
              if (attempt === retries) {
                logger.warn('Failed to download file to buffer after retries, skipping', { remotePath, err, taskId });
                return null;
              }
            }
          }
          return null;
        }
        
        async function walk(dir: string, prefix: string) {
          // Update progress when entering a new directory
          updateProgress({
            phase: 'downloading',
            filesProcessed: filesAdded,
            totalBytes,
            currentDir: dir,
            reconnects: reconnectAttempts,
          });
          
          const list = await listWithRetry(dir);
          if (!list) return;
          
          // Log large directories that might take time to process
          if (list.length > 1000) {
            logger.info('Processing large directory', { taskId, dir, fileCount: list.length });
          }
          
          // Separate files and directories
          const dirs: { name: string; remoteFull: string; rel: string }[] = [];
          const files: { name: string; remoteFull: string; rel: string; size: number }[] = [];
          
          for (const it of list) {
            // Check for cancellation
            if (runningTasks.get(taskId)?.cancelled) {
              throw new Error('Task was cancelled');
            }
            
            // skip special entries
            if (it.name === '.' || it.name === '..') continue;
            const remoteFull = path.posix.join(dir, it.name);
            const rel = prefix ? `${prefix}/${it.name}` : it.name;
            
            // Skip excluded paths
            if (isExcluded(remoteFull)) {
              logger.debug('Skipping excluded path', { taskId, path: remoteFull });
              continue;
            }
            
            if (it.type === 'd') {
              dirs.push({ name: it.name, remoteFull, rel });
            } else if (it.type === '-') {
              files.push({ name: it.name, remoteFull, rel, size: it.size || 0 });
            }
          }
          
          // Process files in batches for better throughput
          // Higher batch size for small files to reduce per-file SFTP overhead
          const BATCH_SIZE = 100; // Process 100 files concurrently (increased from 50)
          const SMALL_FILE_THRESHOLD = 2 * 1024 * 1024; // 2MB - use memory for small files (increased from 1MB)
          
          for (let i = 0; i < files.length; i += BATCH_SIZE) {
            // Check for cancellation
            if (runningTasks.get(taskId)?.cancelled) {
              throw new Error('Task was cancelled');
            }
            
            const batch = files.slice(i, i + BATCH_SIZE);
            
            // Process batch in parallel
            await Promise.all(batch.map(async (file) => {
              try {
                if (file.size < SMALL_FILE_THRESHOLD) {
                  // Small file: download to memory buffer directly
                  const buffer = await downloadToBufferWithRetry(file.remoteFull);
                  if (!buffer) return;
                  
                  totalBytes += buffer.length;
                  archive.append(buffer, { name: file.rel });
                  filesAdded++;
                } else {
                  // Large file: use temp file
                  const tempFilePath = path.join(tmpDir!, `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
                  
                  const downloaded = await downloadWithRetry(file.remoteFull, tempFilePath);
                  if (!downloaded) return;
                  
                  try {
                    const stat = await fs.promises.stat(tempFilePath);
                    totalBytes += stat.size;
                    
                    const fileStream = fs.createReadStream(tempFilePath);
                    archive.append(fileStream, { name: file.rel });
                    filesAdded++;
                    
                    // Clean up temp file after it's been added to archive
                    setTimeout(async () => {
                      try {
                        await fs.promises.unlink(tempFilePath);
                      } catch (e) { /* ignore */ }
                    }, 5000);
                  } catch (fileErr) {
                    logger.warn('Failed to process downloaded file', { remoteFull: file.remoteFull, err: fileErr });
                    try { await fs.promises.unlink(tempFilePath); } catch (e) { /* ignore */ }
                  }
                }
              } catch (err) {
                logger.warn('Failed to download file in batch', { remoteFull: file.remoteFull, err });
              }
            }));
            
            // Update progress after every batch (no logging to avoid spam, but keep UI updated)
            updateProgress({
              phase: 'downloading',
              filesProcessed: filesAdded,
              totalBytes,
              currentDir: dir,
              reconnects: reconnectAttempts,
            });
            
            // Log progress every 500 files (reduced frequency)
            if (filesAdded % 500 === 0 || i + BATCH_SIZE >= files.length) {
              logger.info('Archive progress', { taskId, filesAdded, totalBytes: formatBytes(totalBytes), reconnects: reconnectAttempts, dir });
            }
          }
          
          // Process directories - parallelize leaf directories, recurse sequentially for deep trees
          const DIR_BATCH_SIZE = 5; // Process up to 5 directories in parallel
          for (let i = 0; i < dirs.length; i += DIR_BATCH_SIZE) {
            const dirBatch = dirs.slice(i, i + DIR_BATCH_SIZE);
            await Promise.all(dirBatch.map(d => walk(d.remoteFull, d.rel)));
          }
        }

        await walk(remoteBase, '');
      }

      // Stream all files into archive
      await streamRemoteToArchive(task.sftpPath);
      
      // Check if any archive errors occurred during streaming
      if (archiveError) {
        throw new Error(`Archive creation failed: ${archiveError.message}`);
      }
      
      logger.info('Finalizing archive', { taskId, filesAdded, totalBytes: formatBytes(totalBytes) });
      updateProgress({ phase: 'archiving', filesProcessed: filesAdded, totalBytes });
      
      // Finalize the archive - create a promise that handles both completion and errors
      await new Promise<void>((resolve, reject) => {
        // Check for errors that already occurred
        if (archiveError) {
          reject(archiveError);
          return;
        }
        
        let resolved = false;
        
        output.on('close', () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        });
        
        output.on('error', (e) => {
          if (!resolved) {
            resolved = true;
            reject(e);
          }
        });
        
        archive.on('error', (e) => {
          if (!resolved) {
            resolved = true;
            reject(e);
          }
        });
        
        // Call finalize after setting up listeners
        archive.finalize().catch((e) => {
          if (!resolved) {
            resolved = true;
            reject(e);
          }
        });
      });
      
      // Verify the archive file exists and has content
      let archiveStat;
      try {
        archiveStat = await fs.promises.stat(archivePath);
      } catch (statErr) {
        throw new Error(`Archive file not found after creation: ${archivePath}`);
      }
      
      if (archiveStat.size === 0) {
        throw new Error(`Archive file is empty: ${archivePath}`);
      }
      
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
      updateProgress({ phase: 'uploading' });
      await storeFileFromPath(task.userId, destinationId, finalName, archivePath, undefined, shouldEncrypt);
      
      logger.info('Archive uploaded to Discord', { taskId, finalName });
      updateProgress({ phase: 'complete' });

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
