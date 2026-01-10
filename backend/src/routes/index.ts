import { Router } from 'express';
import authRoutes from './auth';
import filesRoutes from './files';
import apiKeysRoutes from './apiKeys';

const router = Router();

router.use('/auth', authRoutes);
router.use('/files', filesRoutes);
router.use('/api-keys', apiKeysRoutes);

export default router;
