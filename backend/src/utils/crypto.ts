import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  const key = `dd_${randomBytes.toString('hex')}`;
  return key;
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Derive encryption key from user's encryption key
function deriveKey(userKey: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(userKey, salt, 100000, 32, 'sha256');
}

// Encrypt a buffer
export function encryptBuffer(buffer: Buffer, userEncryptionKey: string): Buffer {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(userEncryptionKey, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Format: salt (16) + iv (12) + authTag (16) + encrypted data
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

// Decrypt a buffer
export function decryptBuffer(encryptedBuffer: Buffer, userEncryptionKey: string): Buffer {
  const salt = encryptedBuffer.slice(0, SALT_LENGTH);
  const iv = encryptedBuffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = encryptedBuffer.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = encryptedBuffer.slice(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  
  const key = deriveKey(userEncryptionKey, salt);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// Generate encryption key for sensitive data (e.g., SFTP passwords)
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Encrypt sensitive string data (e.g., SFTP passwords) using system key
// NOTE: In production, use process.env.ENCRYPTION_KEY instead of hardcoded key
export function encryptString(text: string, key?: string): string {
  const encryptionKey = key || process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derivedKey = deriveKey(encryptionKey, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Format: salt + iv + authTag + encrypted, returned as base64
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);
  return combined.toString('base64');
}

// Decrypt sensitive string data
export function decryptString(encryptedText: string, key?: string): string {
  const encryptionKey = key || process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  const combined = Buffer.from(encryptedText, 'base64');
  
  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  
  const derivedKey = deriveKey(encryptionKey, salt);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
