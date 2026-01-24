import { PrismaClient } from '@prisma/client';
import { getDiscordClient, deleteChunkFromDiscord } from './discord';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Scan recent messages in the storage channel and delete any message IDs
// that are not referenced by a FileChunk row. This is a safety utility to
// clean up orphaned Discord attachments created before prune logic was added.
export async function deleteOrphanedDiscordMessages(batchSize = 200, maxBatches = 5) {
  const client = getDiscordClient();
  const storageChannelId = process.env.DISCORD_CHANNEL_ID || '';
  if (!storageChannelId) throw new Error('DISCORD_CHANNEL_ID is not set');

  const channel = await client.channels.fetch(storageChannelId) as any;
  if (!channel || !channel.isTextBased || !channel.messages) {
    throw new Error('Storage channel not available for cleanup');
  }

  let before: string | undefined = undefined;
  let totalDeleted = 0;

  for (let batch = 0; batch < maxBatches; batch++) {
    const fetched = await channel.messages.fetch({ limit: batchSize, before });
    if (!fetched || fetched.size === 0) break;

    const messageIds = Array.from(fetched.keys());

    // Query DB for referenced messageIds among these
    const referenced = await prisma.fileChunk.findMany({ where: { messageId: { in: messageIds } }, select: { messageId: true } });
    const referencedSet = new Set(referenced.map(r => r.messageId));

    const orphanIds = messageIds.filter(id => !referencedSet.has(id));

    for (const mid of orphanIds) {
      try {
        await deleteChunkFromDiscord(mid, channel.id);
        totalDeleted += 1;
        logger.info('Deleted orphaned Discord message', { messageId: mid });
      } catch (err) {
        logger.warn('Failed to delete orphaned message; continuing', { messageId: mid, err });
      }
    }

    // prepare for next batch
    before = messageIds[messageIds.length - 1];
    if (fetched.size < batchSize) break;
  }

  return { totalDeleted };
}
