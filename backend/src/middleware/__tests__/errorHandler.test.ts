import request from 'supertest';
import express from 'express';
import { errorHandler } from '../errorHandler';

describe('Error Handler Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  it('should handle generic errors with 500 status', async () => {
    app.get('/test', (req, res, next) => {
      next(new Error('Test error'));
    });
    app.use(errorHandler);

    const response = await request(app).get('/test');
    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Test error');
  });

  it('should handle errors with custom status codes', async () => {
    app.get('/test', (req, res, next) => {
      const error: any = new Error('Not found');
      error.status = 404;
      next(error);
    });
    app.use(errorHandler);

    const response = await request(app).get('/test');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Not found');
  });

  it('should handle errors without message', async () => {
    app.get('/test', (req, res, next) => {
      const error: any = new Error();
      error.status = 400;
      next(error);
    });
    app.use(errorHandler);

    const response = await request(app).get('/test');
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  it('should handle string errors', async () => {
    app.get('/test', (req, res, next) => {
      next('String error message');
    });
    app.use(errorHandler);

    const response = await request(app).get('/test');
    expect(response.status).toBe(500);
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
    expect(response.body.error).toBe('Async error');
  });
});
