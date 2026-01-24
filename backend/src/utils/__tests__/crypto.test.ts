import { encryptBuffer, decryptBuffer, hashPassword, generateApiKey, generateEncryptionKey } from '../crypto';

describe('Crypto Utils', () => {
  const testData = Buffer.from('Hello World!');
  const testEncryptionKey = 'test-encryption-key-12345';

  describe('encryptBuffer and decryptBuffer', () => {
    it('should encrypt and decrypt data successfully', () => {
      const encrypted = encryptBuffer(testData, testEncryptionKey);
      expect(encrypted).not.toEqual(testData);
      expect(encrypted.length).toBeGreaterThan(testData.length);

      const decrypted = decryptBuffer(encrypted, testEncryptionKey);
      expect(decrypted.toString()).toBe(testData.toString());
    });

    it('should produce different encrypted values for same data', () => {
      const encrypted1 = encryptBuffer(testData, testEncryptionKey);
      const encrypted2 = encryptBuffer(testData, testEncryptionKey);
      expect(encrypted1).not.toEqual(encrypted2); // Different salts/IVs
    });

    it('should handle empty buffers', () => {
      const emptyBuffer = Buffer.from('');
      const encrypted = encryptBuffer(emptyBuffer, testEncryptionKey);
      const decrypted = decryptBuffer(encrypted, testEncryptionKey);
      expect(decrypted.toString()).toBe('');
    });

    it('should handle special characters', () => {
      const specialData = Buffer.from('!@#$%^&*()_+-={}[]|:";\'<>?,./');
      const encrypted = encryptBuffer(specialData, testEncryptionKey);
      const decrypted = decryptBuffer(encrypted, testEncryptionKey);
      expect(decrypted.toString()).toBe(specialData.toString());
    });

    it('should handle unicode characters', () => {
      const unicodeData = Buffer.from('你好世界 🌍 émojis');
      const encrypted = encryptBuffer(unicodeData, testEncryptionKey);
      const decrypted = decryptBuffer(encrypted, testEncryptionKey);
      expect(decrypted.toString()).toBe(unicodeData.toString());
    });

    it('should fail with wrong encryption key', () => {
      const encrypted = encryptBuffer(testData, testEncryptionKey);
      expect(() => decryptBuffer(encrypted, 'wrong-key')).toThrow();
    });

    it('should handle large buffers', () => {
      const largeData = Buffer.alloc(1024 * 10, 'x'); // 10KB
      const encrypted = encryptBuffer(largeData, testEncryptionKey);
      const decrypted = decryptBuffer(encrypted, testEncryptionKey);
      expect(decrypted).toEqual(largeData);
    });

    it('should handle binary data', () => {
      const binaryData = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x80, 0x7f]);
      const encrypted = encryptBuffer(binaryData, testEncryptionKey);
      const decrypted = decryptBuffer(encrypted, testEncryptionKey);
      expect(decrypted).toEqual(binaryData);
    });
  });

  describe('hashPassword', () => {
    it('should hash a password', () => {
      const hash = hashPassword('MySecurePassword123');
      expect(hash).not.toBe('MySecurePassword123');
      expect(hash.length).toBe(64); // SHA256 hex is 64 chars
    });

    it('should produce consistent hashes for same input', () => {
      const hash1 = hashPassword('password');
      const hash2 = hashPassword('password');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashPassword('password1');
      const hash2 = hashPassword('password2');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = hashPassword('');
      expect(hash.length).toBe(64);
    });
  });

  describe('generateApiKey', () => {
    it('should generate a valid API key', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^dd_[a-f0-9]{64}$/);
    });

    it('should generate unique keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });

    it('should start with dd_ prefix', () => {
      const key = generateApiKey();
      expect(key.startsWith('dd_')).toBe(true);
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate a valid encryption key', () => {
      const key = generateEncryptionKey();
      expect(key.length).toBeGreaterThan(0);
    });

    it('should generate base64 encoded key', () => {
      const key = generateEncryptionKey();
      expect(() => Buffer.from(key, 'base64')).not.toThrow();
    });

    it('should generate unique keys', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      expect(key1).not.toBe(key2);
    });
  });
});
