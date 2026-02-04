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
import metricsRoutes from './metrics';
import publicLinksRoutes from './publicLinks';

const router = Router();

router.use('/setup', setupRoutes);

router.use('/auth', authRoutes);
router.use('/files', filesRoutes);
router.use('/api-keys', apiKeysRoutes);
router.use('/avatars', avatarsRoutes);
router.use('/me', meRoutes);
router.use('/tasks', tasksRoutes);
router.use('/logs', logsRoutes);
router.use('/shares', sharesRoutes);
router.use('/metrics', metricsRoutes);
router.use('/public-links', publicLinksRoutes);

router.use('/link', publicLinksRoutes);

export default router;
