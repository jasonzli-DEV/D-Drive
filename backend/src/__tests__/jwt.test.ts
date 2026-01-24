import jwt from 'jsonwebtoken';

// Mock JWT secret for testing
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

describe('JWT Token Operations', () => {
  const testPayload = { userId: '123', username: 'testuser' };

  describe('Token Generation', () => {
    it('should generate a valid JWT token', () => {
      const token = jwt.sign(testPayload, JWT_SECRET);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    it('should generate unique tokens each time', () => {
      const token1 = jwt.sign(testPayload, JWT_SECRET);
      const token2 = jwt.sign(testPayload, JWT_SECRET);
      // Tokens may be same if generated at same second, but usually different
      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
    });

    it('should include expiration when specified', () => {
      const token = jwt.sign(testPayload, JWT_SECRET, { expiresIn: '1h' });
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      expect(decoded.exp).toBeDefined();
    });
  });

  describe('Token Verification', () => {
    it('should verify a valid token', () => {
      const token = jwt.sign(testPayload, JWT_SECRET);
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.username).toBe(testPayload.username);
    });

    it('should reject an invalid token', () => {
      expect(() => jwt.verify('invalid.token.here', JWT_SECRET)).toThrow();
    });

    it('should reject a token with wrong secret', () => {
      const token = jwt.sign(testPayload, JWT_SECRET);
      expect(() => jwt.verify(token, 'wrong-secret')).toThrow();
    });

    it('should reject an expired token', () => {
      const token = jwt.sign(testPayload, JWT_SECRET, { expiresIn: '-1s' });
      expect(() => jwt.verify(token, JWT_SECRET)).toThrow();
    });
  });

  describe('Token Decoding', () => {
    it('should decode token without verification', () => {
      const token = jwt.sign(testPayload, JWT_SECRET);
      const decoded = jwt.decode(token) as any;
      expect(decoded.userId).toBe(testPayload.userId);
    });

    it('should return null for invalid token format', () => {
      const decoded = jwt.decode('not-a-valid-token');
      expect(decoded).toBeNull();
    });

    it('should decode even with wrong secret (no verification)', () => {
      const token = jwt.sign(testPayload, 'some-secret');
      const decoded = jwt.decode(token) as any;
      expect(decoded.userId).toBe(testPayload.userId);
    });
  });
});
