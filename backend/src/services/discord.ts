import { Client, GatewayIntentBits, TextChannel, Message, AttachmentBuilder, Events } from 'discord.js';
import { REST } from '@discordjs/rest';
import { logger } from '../utils/logger';

let discordClient: Client | null = null;
let storageChannelId: string;
let setupMode = false;

export const DISCORD_MAX = 8 * 1024 * 1024; // 8MB (conservative)

export function isSetupMode(): boolean {
  return setupMode;
}

export async function initDiscordBot(): Promise<Client | null> {
  // Check if Discord credentials are configured
  if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_CHANNEL_ID) {
    logger.warn('Discord credentials not configured - running in setup mode');
    logger.warn('Visit the web interface to complete setup');
    setupMode = true;
    return null;
  }

  // If client already exists, destroy it first (for re-initialization after setup)
  if (discordClient) {
    logger.info('Destroying existing Discord client for re-initialization');
    discordClient.destroy();
    discordClient = null;
  }

  // Configure REST with longer timeout for slow connections (5 minutes instead of default 60s)
  // This prevents AbortError on Pi's slow 20 Mbps upload when uploading 8MB chunks
  const rest = new REST({ timeout: 300_000 }); // 5 minutes timeout
  rest.setToken(process.env.DISCORD_BOT_TOKEN!);
  
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ],
    rest: { timeout: 300_000 }, // Also set on client options
  });

  storageChannelId = process.env.DISCORD_CHANNEL_ID || '';

  await client.login(process.env.DISCORD_BOT_TOKEN);

  // Use Events.ClientReady instead of deprecated 'ready' string (discord.js v15)
  client.once(Events.ClientReady, () => {
    logger.info(`Discord bot logged in as ${client.user?.tag}`);
  });

  client.on('error', (error) => {
    logger.error('Discord client error:', error);
  });

  discordClient = client;
  setupMode = false;
  return client;
}

export function getDiscordClient(): Client {
  if (!discordClient) {
    throw new Error('Discord client not initialized');
  }
  return discordClient;
}

export async function uploadChunkToDiscord(
  filename: string,
  buffer: Buffer
): Promise<{ messageId: string; attachmentUrl: string; channelId: string }> {
  const client = getDiscordClient();
  const channel = await client.channels.fetch(storageChannelId) as TextChannel;

  if (!channel || !channel.isTextBased()) {
    throw new Error('Invalid storage channel');
  }

  // Double-check size against conservative DISCORD_MAX to avoid 413 from API
  if (buffer.length > DISCORD_MAX) {
    logger.error(`Attachment ${filename} too large for Discord upload: ${buffer.length} bytes (limit=${DISCORD_MAX})`);
    const err: any = new Error('Attachment exceeds Discord size limit');
    err.code = 'DISCORD_SIZE_EXCEEDED';
    throw err;
  }

  const attachment = new AttachmentBuilder(buffer, { name: filename });

  try {
    const message = await channel.send({ files: [attachment] });

    if (message.attachments.size === 0) {
      throw new Error('Failed to upload file to Discord');
    }

    const discordAttachment = message.attachments.first()!;

    return {
      messageId: message.id,
      attachmentUrl: discordAttachment.url,
      channelId: channel.id
    };
  } catch (err: any) {
    logger.error(`Discord upload failed for ${filename} (${buffer.length} bytes):`, err);
    // Rethrow to let caller handle cleanup
    throw err;
  }
}

export async function downloadChunkFromDiscord(
  messageId: string,
  channelId: string
): Promise<Buffer> {
  const client = getDiscordClient();
  const channel = await client.channels.fetch(channelId) as TextChannel;

  if (!channel) {
    throw new Error('Channel not found');
  }

  const message = await channel.messages.fetch(messageId);
  
  if (message.attachments.size === 0) {
    throw new Error('No attachments found in message');
  }

  const attachment = message.attachments.first()!;
  const response = await fetch(attachment.url);
  const arrayBuffer = await response.arrayBuffer();

  // Force-assert to Node Buffer to satisfy TS typing differences between ArrayBufferLike
  return Buffer.from(arrayBuffer) as unknown as Buffer;
}

export async function deleteChunkFromDiscord(
  messageId: string,
  channelId: string
): Promise<void> {
  const client = getDiscordClient();
  const channel = await client.channels.fetch(channelId) as TextChannel;

  if (!channel) {
    throw new Error('Channel not found');
  }

  // Retry-on-rate-limit with exponential backoff. Treat Unknown Message (10008) as success.
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const message = await channel.messages.fetch(messageId);
      await message.delete();
      logger.info(`Deleted message ${messageId} from Discord`);
      return;
    } catch (error: any) {
      // If message is already gone (Discord Unknown Message), treat as success.
      const code = error?.code || (error?.message && String(error.message).includes('Unknown Message') ? 10008 : undefined);
      if (code === 10008) {
        logger.info(`Message ${messageId} already deleted on Discord, treating as success`);
        return;
      }

      // Detect rate limit responses. discord.js may expose .status or .statusCode or include retry info.
      const isRateLimit = error?.status === 429 || error?.statusCode === 429 || error?.retryAfter || error?.retry_after || String(error?.message || '').toLowerCase().includes('rate limited') || String(error?.message || '').toLowerCase().includes('too many requests');
      if (isRateLimit) {
        const retryAfterMs = (typeof error?.retryAfter === 'number' && error.retryAfter) || (typeof error?.retry_after === 'number' && error.retry_after) || 0;
        const backoff = retryAfterMs > 0 ? retryAfterMs : Math.min(1000 * Math.pow(2, attempt), 16000);
        const jitter = Math.floor(Math.random() * 200) - 100; // +/-100ms
        const wait = Math.max(100, backoff + jitter);
        logger.warn(`Rate limited deleting message ${messageId}, attempt=${attempt + 1}/${maxAttempts}, waiting ${wait}ms`);
        await new Promise(res => setTimeout(res, wait));
        continue; // retry
      }

      // For other errors, log and rethrow so callers can decide.
      logger.warn(`Failed to delete message ${messageId}:`, error);
      throw error;
    }
  }

  // If we exhausted retries, throw a generic error
  throw new Error(`Failed to delete Discord message ${messageId} after ${maxAttempts} attempts due to rate limits`);
}

export async function getMessageAttachmentUrl(
  messageId: string,
  channelId: string
): Promise<string> {
  const client = getDiscordClient();
  const channel = await client.channels.fetch(channelId) as TextChannel;

  if (!channel) {
    throw new Error('Channel not found');
  }

  const message = await channel.messages.fetch(messageId);
  
  if (message.attachments.size === 0) {
    throw new Error('No attachments found in message');
  }

  return message.attachments.first()!.url;
}
