import request from 'supertest';
import express from 'express';
import { errorHandler } from '../errorHandler';
import { logger } from '../../utils/logger';

// Silence logger output during tests
jest.spyOn(logger, 'error').mockImplementation(() => logger);
jest.spyOn(logger, 'warn').mockImplementation(() => logger);
jest.spyOn(logger, 'info').mockImplementation(() => logger);

describe('Error Handler Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  it('should handle errors with 500 status', async () => {
    app.get('/test', (req, res, next) => {
      next(new Error('Test error'));
    });
    app.use(errorHandler);

    const response = await request(app).get('/test');
    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Internal server error');
  });

  it('should always return 500 for all errors', async () => {
    app.get('/test', (req, res, next) => {
      const error: any = new Error('Not found');
      error.status = 404;
      next(error);
    });
    app.use(errorHandler);

    const response = await request(app).get('/test');
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Internal server error');
  });

  it('should handle errors without message', async () => {
    app.get('/test', (req, res, next) => {
      const error: any = new Error();
      next(error);
    });
    app.use(errorHandler);

    const response = await request(app).get('/test');
    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Internal server error');
  });

  it('should handle string errors', async () => {
    app.get('/test', (req, res, next) => {
      next('String error message');
    });
    app.use(errorHandler);

    const response = await request(app).get('/test');
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Internal server error');
  });

  it('should set proper Content-Type header', async () => {
    app.get('/test', (req, res, next) => {
      next(new Error('Test'));
    });
    app.use(errorHandler);

    const response = await request(app).get('/test');
    expect(response.headers['content-type']).toMatch(/json/);
  });

  it('should handle errors in async routes', async () => {
    app.get('/test', async (req, res, next) => {
      try {
        throw new Error('Async error');
      } catch (err) {
        next(err);
      }
    });
    app.use(errorHandler);

    const response = await request(app).get('/test');
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Internal server error');
  });

  it('should return JSON response', async () => {
    app.get('/test', (req, res, next) => {
      next(new Error('Test'));
    });
    app.use(errorHandler);

    const response = await request(app).get('/test');
    expect(response.type).toBe('application/json');
  });

  it('should include error property in response body', async () => {
    app.get('/test', (req, res, next) => {
      next(new Error('Test'));
    });
    app.use(errorHandler);

    const response = await request(app).get('/test');
    expect(response.body).toHaveProperty('error');
  });
});
