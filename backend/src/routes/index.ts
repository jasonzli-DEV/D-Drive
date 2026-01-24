import { Router } from 'express';
import authRoutes from './auth';
import filesRoutes from './files';
import apiKeysRoutes from './apiKeys';
import avatarsRoutes from './avatars';
import meRoutes from './me';
import tasksRoutes from './tasks';
import logsRoutes from './logs';
import sharesRoutes from './shares';
import setupRoutes from './setup';

const router = Router();

// Setup routes (no auth required, but protected by setup-complete check)
router.use('/setup', setupRoutes);

router.use('/auth', authRoutes);
router.use('/files', filesRoutes);
router.use('/api-keys', apiKeysRoutes);
router.use('/avatars', avatarsRoutes);
router.use('/me', meRoutes);
router.use('/tasks', tasksRoutes);
router.use('/logs', logsRoutes);
router.use('/shares', sharesRoutes);

export default router;
