import crypto from 'crypto';

export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  const key = `dd_${randomBytes.toString('hex')}`;
  return key;
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}
