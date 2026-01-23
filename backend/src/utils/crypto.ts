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

// Generate a new encryption key for a user
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('base64');
}
