import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { deleteChunkFromDiscord } from './discord';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';

const prisma = new PrismaClient();

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
    
    // Fetch all messages from Discord channel
    let allMessages: any[] = [];
    let lastId: string | undefined;
    
    while (true) {
      const params: any = { limit: 100 };
      if (lastId) params.before = lastId;
      
      const response = await axios.get(
        `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`,
        {
          headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
          params,
        }
      );
      
      if (!response.data || response.data.length === 0) break;
      
      allMessages = allMessages.concat(response.data);
      lastId = response.data[response.data.length - 1].id;
      
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