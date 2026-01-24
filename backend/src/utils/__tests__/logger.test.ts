import { logger } from '../logger';

// Store original transports and silence them during tests
const originalTransports = logger.transports;

beforeAll(() => {
  // Silence all transports during tests
  logger.transports.forEach(transport => {
    transport.silent = true;
  });
});

afterAll(() => {
  // Restore transports after tests
  logger.transports.forEach(transport => {
    transport.silent = false;
  });
});

describe('Logger Utils', () => {
  describe('logger methods exist', () => {
    it('should have info method', () => {
      expect(logger.info).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });

    it('should have error method', () => {
      expect(logger.error).toBeDefined();
      expect(typeof logger.error).toBe('function');
    });

    it('should have warn method', () => {
      expect(logger.warn).toBeDefined();
      expect(typeof logger.warn).toBe('function');
    });

    it('should have debug method', () => {
      expect(logger.debug).toBeDefined();
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('logger execution', () => {
    it('should not throw when logging info', () => {
      expect(() => logger.info('Test info message')).not.toThrow();
    });

    it('should not throw when logging error', () => {
      expect(() => logger.error('Test error message')).not.toThrow();
    });

    it('should not throw when logging warn', () => {
      expect(() => logger.warn('Test warn message')).not.toThrow();
    });

    it('should not throw when logging debug', () => {
      expect(() => logger.debug('Test debug message')).not.toThrow();
    });

    it('should handle object messages', () => {
      expect(() => logger.info({ key: 'value', nested: { data: 123 } })).not.toThrow();
    });

    it('should handle error objects', () => {
      expect(() => logger.error(new Error('Test error'))).not.toThrow();
    });

    it('should handle multiple arguments', () => {
      expect(() => logger.info('Message', { data: 'value' })).not.toThrow();
    });

    it('should handle empty messages', () => {
      expect(() => logger.info('')).not.toThrow();
    });

    it('should handle null and undefined', () => {
      expect(() => logger.info(null as any)).not.toThrow();
      expect(() => logger.info(undefined as any)).not.toThrow();
    });

    it('should handle numbers', () => {
      expect(() => logger.info(123 as any)).not.toThrow();
    });
  });
});
