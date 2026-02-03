import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { deleteChunkFromDiscord } from './discord';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';

// Days to keep files in recycle bin before permanent deletion
const RECYCLE_BIN_RETENTION_DAYS = 30;



const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '';

/**
 * Cleanup task that runs hourly to delete untracked Discord messages
 * (messages that exist in Discord but not in our FileChunk table)
 */
export async function cleanupOrphanedDiscordFiles() {
  logger.info('Starting Discord cleanup task...');
  
  try {
    // Get all tracked message IDs from our database
    const trackedChunks = await prisma.fileChunk.findMany({
      select: { messageId: true, channelId: true },
    });
    
    const trackedMessageIds = new Set(trackedChunks.map(c => c.messageId));
    
    logger.info(`Found ${trackedMessageIds.size} tracked messages in database`);
    
    // Fetch all messages from Discord channel with rate limit handling
    let allMessages: any[] = [];
    let lastId: string | undefined;
    
    while (true) {
      const params: any = { limit: 100 };
      if (lastId) params.before = lastId;
      
      let response;
      let retries = 0;
      const maxRetries = 5;
      
      while (retries < maxRetries) {
        try {
          response = await axios.get(
            `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`,
            {
              headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
              params,
            }
          );
          break; // Success, exit retry loop
        } catch (err: any) {
          // Handle rate limiting (429)
          if (err?.response?.status === 429) {
            const retryAfter = err?.response?.data?.retry_after || err?.response?.headers?.['retry-after'] || 5;
            const waitMs = (typeof retryAfter === 'number' ? retryAfter : parseFloat(retryAfter)) * 1000 + 500;
            logger.warn(`Discord rate limited during cleanup, waiting ${waitMs}ms (attempt ${retries + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
            retries++;
          } else {
            throw err; // Re-throw non-rate-limit errors
          }
        }
      }
      
      if (!response) {
        logger.error('Failed to fetch messages after max retries due to rate limiting');
        return; // Exit cleanup gracefully instead of crashing
      }
      
      if (!response.data || response.data.length === 0) break;
      
      allMessages = allMessages.concat(response.data);
      lastId = response.data[response.data.length - 1].id;
      
      // Rate limit: small delay between pagination requests to avoid hitting limits
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Limit to prevent infinite loops
      if (allMessages.length > 10000) {
        logger.warn('Reached 10k message limit, stopping pagination');
        break;
      }
    }
    
    logger.info(`Found ${allMessages.length} total messages in Discord`);
    
    // Find orphaned messages (in Discord but not in our DB)
    const orphanedMessages = allMessages.filter(msg => !trackedMessageIds.has(msg.id));
    
    logger.info(`Found ${orphanedMessages.length} orphaned messages to delete`);
    
    // Delete orphaned messages
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const msg of orphanedMessages) {
      try {
        await deleteChunkFromDiscord(msg.id, DISCORD_CHANNEL_ID);
        deletedCount++;
        
        // Log every 10 deletions
        if (deletedCount % 10 === 0) {
          logger.info(`Cleanup progress: deleted ${deletedCount}/${orphanedMessages.length} orphaned messages`);
        }
        
        // Rate limit: wait 100ms between deletions
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        errorCount++;
        logger.warn(`Failed to delete orphaned message ${msg.id}:`, err);
      }
    }
    
    logger.info(`Cleanup complete: deleted ${deletedCount} orphaned messages (${errorCount} errors)`);
    
  } catch (err) {
    logger.error('Discord cleanup task failed:', err);
  }
}
/**
 * Cleanup old temporary files from /tmp directory
 * Files older than 1 hour will be removed
 */
export async function cleanupTempFiles() {
  logger.info('Starting temp file cleanup...');
  
  try {
    const tmpDir = '/tmp';
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    const files = await fs.readdir(tmpDir);
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
      // Only clean up ddrive-task-* directories
      if (!file.startsWith('ddrive-task-')) continue;
      
      const filePath = path.join(tmpDir, file);
      
      try {
        const stats = await fs.stat(filePath);
        
        // Check if older than 1 hour
        if (stats.mtimeMs < oneHourAgo) {
          await fs.rm(filePath, { recursive: true, force: true });
          deletedCount++;
          logger.info(`Deleted old temp directory: ${file}`);
        }
      } catch (err) {
        errorCount++;
        logger.warn(`Failed to delete temp file ${file}:`, err);
      }
    }
    
    logger.info(`Temp cleanup complete: deleted ${deletedCount} old files/dirs (${errorCount} errors)`);
    
  } catch (err) {
    logger.error('Temp file cleanup failed:', err);
  }
}

/**
 * Cleanup recycle bin - permanently delete files older than 30 days
 * This implements the standard Windows-style auto-delete for recycle bin items
 */
export async function cleanupOldRecycleBinFiles() {
  logger.info('Starting recycle bin cleanup task...');
  
  try {
    // Calculate the cutoff date (30 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RECYCLE_BIN_RETENTION_DAYS);
    
    // Find all files in recycle bin older than 30 days
    const oldDeletedFiles = await prisma.file.findMany({
      where: {
        deletedAt: {
          not: null,
          lt: cutoffDate,
        },
      },
      select: {
        id: true,
        name: true,
        type: true,
        deletedAt: true,
        userId: true,
        chunks: {
          select: {
            id: true,
            messageId: true,
            channelId: true,
          },
        },
      },
    });
    
    if (oldDeletedFiles.length === 0) {
      logger.info('No old recycle bin files to clean up');
      return;
    }
    
    logger.info(`Found ${oldDeletedFiles.length} files older than ${RECYCLE_BIN_RETENTION_DAYS} days in recycle bin`);
    
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const file of oldDeletedFiles) {
      try {
        // Delete Discord chunks for this file
        for (const chunk of file.chunks) {
          try {
            await deleteChunkFromDiscord(chunk.messageId, chunk.channelId);
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (chunkErr) {
            logger.warn(`Failed to delete Discord chunk for file ${file.name}:`, chunkErr);
          }
        }
        
        // Delete chunks and file from database
        await prisma.$transaction(async (tx) => {
          await tx.fileChunk.deleteMany({ where: { fileId: file.id } });
          await tx.file.delete({ where: { id: file.id } });
        });
        
        deletedCount++;
        
        // Log the auto-deletion
        try {
          const { createLog } = await import('../routes/logs');
          await createLog(file.userId, 'DELETE', `Auto-deleted from recycle bin after ${RECYCLE_BIN_RETENTION_DAYS} days: ${file.name}`, true, undefined, {
            fileName: file.name,
            fileType: file.type,
            deletedAt: file.deletedAt,
            retentionDays: RECYCLE_BIN_RETENTION_DAYS,
          });
        } catch (logErr) {
          // Ignore logging errors
        }
        
        if (deletedCount % 10 === 0) {
          logger.info(`Recycle bin cleanup progress: ${deletedCount}/${oldDeletedFiles.length}`);
        }
        
      } catch (err) {
        errorCount++;
        logger.warn(`Failed to permanently delete file ${file.name} (${file.id}):`, err);
      }
    }
    
    logger.info(`Recycle bin cleanup complete: permanently deleted ${deletedCount} files (${errorCount} errors)`);
    
  } catch (err) {
    logger.error('Recycle bin cleanup task failed:', err);
  }
}