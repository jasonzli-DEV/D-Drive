import { Router } from 'express';
import authRoutes from './auth';
import filesRoutes from './files';
import apiKeysRoutes from './apiKeys';
import avatarsRoutes from './avatars';

const router = Router();

router.use('/auth', authRoutes);
router.use('/files', filesRoutes);
router.use('/api-keys', apiKeysRoutes);
router.use('/avatars', avatarsRoutes);

export default router;
