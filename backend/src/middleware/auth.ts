import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// JWT_SECRET must be set in environment - no fallback for security
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('CRITICAL: JWT_SECRET environment variable is not set. Application cannot start.');
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');

    // Check if it's a JWT token or API key
    if (token.startsWith('dd_')) {
      // API Key authentication
      const apiKey = await prisma.apiKey.findUnique({
        where: { key: token },
        include: { user: true },
      });

      if (!apiKey) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      // Update last used
      await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsed: new Date() },
      });

      (req as any).user = {
        userId: apiKey.userId,
        discordId: apiKey.user.discordId,
      };
    } else {
      // JWT authentication
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; discordId: string };

      // Check if session exists
      const session = await prisma.session.findUnique({
        where: { token },
      });

      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      (req as any).user = decoded;
    }

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid authentication' });
  }
}
