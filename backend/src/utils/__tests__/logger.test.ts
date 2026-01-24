import { logger } from '../logger';

describe('Logger Utils', () => {
  let consoleSpies: {
    info: jest.SpyInstance;
    error: jest.SpyInstance;
    warn: jest.SpyInstance;
    debug: jest.SpyInstance;
  };

  beforeEach(() => {
    // Spy on console methods to avoid actual output during tests
    consoleSpies = {
      info: jest.spyOn(console, 'info').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      debug: jest.spyOn(console, 'debug').mockImplementation(),
    };
  });

  afterEach(() => {
    // Restore console methods
    Object.values(consoleSpies).forEach(spy => spy.mockRestore());
  });

  describe('logger methods', () => {
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

    it('should log info messages', () => {
      logger.info('Test info message');
      expect(consoleSpies.info).toHaveBeenCalled();
    });

    it('should log error messages', () => {
      logger.error('Test error message');
      expect(consoleSpies.error).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      logger.warn('Test warn message');
      expect(consoleSpies.warn).toHaveBeenCalled();
    });
  });

  describe('logger message handling', () => {
    it('should handle string messages', () => {
      const message = 'Simple string message';
      logger.info(message);
      expect(consoleSpies.info).toHaveBeenCalled();
    });

    it('should handle object messages', () => {
      const message = { key: 'value', nested: { data: 123 } };
      logger.info(message);
      expect(consoleSpies.info).toHaveBeenCalled();
    });

    it('should handle error objects', () => {
      const error = new Error('Test error');
      logger.error(error);
      expect(consoleSpies.error).toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      logger.info('Message', { data: 'value' }, 123);
      expect(consoleSpies.info).toHaveBeenCalled();
    });
  });
});
