import SftpClient from 'ssh2-sftp-client';
import { logger } from '../utils/logger';

type TestCfg = {
  host?: string;
  port?: number | string;
  username?: string;
  password?: string | null;
  privateKey?: string | null;
  authPassword?: boolean;
  authPrivateKey?: boolean;
};

export async function testSftpConnection(cfg: TestCfg) {
  const sftp = new SftpClient();
  const baseConfig: any = { host: cfg.host, port: cfg.port || 22, username: cfg.username };

  const tryConnectWith = async (c: any) => {
    try {
      await sftp.connect(c);
      return true;
    } catch (e) {
      logger.warn('SFTP test connect failed', { err: e });
      return false;
    }
  };

  let connected = false;

  if (cfg.authPassword && cfg.password) {
    connected = await tryConnectWith({ ...baseConfig, password: cfg.password });
  }

  if (!connected && cfg.authPrivateKey && cfg.privateKey) {
    connected = await tryConnectWith({ ...baseConfig, privateKey: cfg.privateKey });
  }

  // Fallback: try any provided credential if flags weren't explicit
  if (!connected) {
    const fallback: any = { ...baseConfig };
    if (cfg.privateKey) fallback.privateKey = cfg.privateKey;
    if (cfg.password) fallback.password = cfg.password;
    try {
      await sftp.connect(fallback);
      connected = true;
    } catch (e) {
      logger.warn('SFTP fallback connect failed', { err: e });
    }
  }

  if (connected) {
    try { await sftp.end(); } catch (_) { /* ignore */ }
    return true;
  }

  try { await sftp.end(); } catch (_) { /* ignore */ }
  throw new Error('SFTP authentication failed');
}
