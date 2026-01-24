import request from 'supertest';
import express from 'express';

// Create a minimal test app for API health checks
const createTestApp = () => {
  const app = express();
  
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
};

describe('Health Check Endpoints', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('GET /health', () => {
    it('should return 200 status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    it('should return JSON with ok status', async () => {
      const response = await request(app).get('/health');
      expect(response.body).toHaveProperty('status', 'ok');
    });

    it('should return timestamp', async () => {
      const response = await request(app).get('/health');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.timestamp).toBe('string');
    });

    it('should have correct content type', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('GET /api/health', () => {
    it('should return 200 status', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
    });

    it('should return JSON with ok status', async () => {
      const response = await request(app).get('/api/health');
      expect(response.body).toHaveProperty('status', 'ok');
    });

    it('should return timestamp', async () => {
      const response = await request(app).get('/api/health');
      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp).toString()).not.toBe('Invalid Date');
    });
  });

  describe('Health check response format', () => {
    it('should have consistent structure', async () => {
      const response = await request(app).get('/health');
      expect(Object.keys(response.body)).toEqual(['status', 'timestamp']);
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app).get('/health');
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);
    });

    it('should return recent timestamp', async () => {
      const before = Date.now();
      const response = await request(app).get('/health');
      const after = Date.now();
      
      const timestamp = new Date(response.body.timestamp).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(before - 1000);
      expect(timestamp).toBeLessThanOrEqual(after + 1000);
    });
  });
});
