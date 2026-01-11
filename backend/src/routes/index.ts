import { Router } from 'express';
import authRoutes from './auth';
import filesRoutes from './files';
import apiKeysRoutes from './apiKeys';
import avatarsRoutes from './avatars';
import meRoutes from './me';
import tasksRoutes from './tasks';

const router = Router();

router.use('/auth', authRoutes);
router.use('/files', filesRoutes);
router.use('/api-keys', apiKeysRoutes);
router.use('/avatars', avatarsRoutes);
router.use('/me', meRoutes);
router.use('/tasks', tasksRoutes);

export default router;
