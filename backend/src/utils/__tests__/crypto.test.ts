import crypto from 'crypto';
import { encryptData, decryptData, hashPassword, verifyPassword } from '../crypto';

describe('Crypto Utils', () => {
  const testData = 'Hello World!';
  const testPassword = 'MySecurePassword123';

  describe('encryptData and decryptData', () => {
    it('should encrypt and decrypt data successfully', () => {
      const encrypted = encryptData(testData);
      expect(encrypted).not.toBe(testData);
      expect(encrypted).toContain(':'); // Should contain IV separator

      const decrypted = decryptData(encrypted);
      expect(decrypted).toBe(testData);
    });

    it('should produce different encrypted values for same data', () => {
      const encrypted1 = encryptData(testData);
      const encrypted2 = encryptData(testData);
      expect(encrypted1).not.toBe(encrypted2); // Different IVs
    });

    it('should handle empty strings', () => {
      const encrypted = encryptData('');
      const decrypted = decryptData(encrypted);
      expect(decrypted).toBe('');
    });

    it('should handle special characters', () => {
      const specialData = '!@#$%^&*()_+-={}[]|:";\'<>?,./';
      const encrypted = encryptData(specialData);
      const decrypted = decryptData(encrypted);
      expect(decrypted).toBe(specialData);
    });

    it('should handle unicode characters', () => {
      const unicodeData = '你好世界 🌍 émojis';
      const encrypted = encryptData(unicodeData);
      const decrypted = decryptData(encrypted);
      expect(decrypted).toBe(unicodeData);
    });

    it('should throw error for invalid encrypted data format', () => {
      expect(() => decryptData('invalid-format')).toThrow();
    });

    it('should throw error for tampered encrypted data', () => {
      const encrypted = encryptData(testData);
      const tampered = encrypted.replace(/[a-f]/g, '0');
      expect(() => decryptData(tampered)).toThrow();
    });
  });

  describe('hashPassword and verifyPassword', () => {
    it('should hash password and verify correctly', async () => {
      const hash = await hashPassword(testPassword);
      expect(hash).not.toBe(testPassword);
      expect(hash.length).toBeGreaterThan(50); // Bcrypt hashes are long

      const isValid = await verifyPassword(testPassword, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const hash = await hashPassword(testPassword);
      const isValid = await verifyPassword('WrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('should produce different hashes for same password', async () => {
      const hash1 = await hashPassword(testPassword);
      const hash2 = await hashPassword(testPassword);
      expect(hash1).not.toBe(hash2); // Different salts
    });

    it('should handle empty password', async () => {
      const hash = await hashPassword('');
      const isValid = await verifyPassword('', hash);
      expect(isValid).toBe(true);
    });

    it('should handle long passwords', async () => {
      const longPassword = 'a'.repeat(100);
      const hash = await hashPassword(longPassword);
      const isValid = await verifyPassword(longPassword, hash);
      expect(isValid).toBe(true);
    });
  });
});
