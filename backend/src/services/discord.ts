import { Client, GatewayIntentBits, TextChannel, Message, AttachmentBuilder } from 'discord.js';
import { logger } from '../utils/logger';

let discordClient: Client;
let storageChannelId: string;

export async function initDiscordBot(): Promise<Client> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ]
  });

  storageChannelId = process.env.DISCORD_CHANNEL_ID || '';

  if (!process.env.DISCORD_BOT_TOKEN) {
    throw new Error('DISCORD_BOT_TOKEN is not set');
  }

  if (!storageChannelId) {
    throw new Error('DISCORD_CHANNEL_ID is not set');
  }

  await client.login(process.env.DISCORD_BOT_TOKEN);

  client.on('ready', () => {
    logger.info(`Discord bot logged in as ${client.user?.tag}`);
  });

  client.on('error', (error) => {
    logger.error('Discord client error:', error);
  });

  discordClient = client;
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

  const DISCORD_MAX = 10 * 1024 * 1024; // Discord ~10MB limit per attachment

  if (buffer.length > DISCORD_MAX) {
    logger.error(`Attachment ${filename} too large for Discord upload: ${buffer.length} bytes`);
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

  try {
    const message = await channel.messages.fetch(messageId);
    await message.delete();
    logger.info(`Deleted message ${messageId} from Discord`);
  } catch (error) {
    logger.warn(`Failed to delete message ${messageId}:`, error);
    // Don't throw - message might already be deleted
  }
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
