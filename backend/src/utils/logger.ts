import { createLogger, format, transports } from 'winston';

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'd-drive-backend' },
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Always log to console as well so container stdout/stderr capture logs
// (docker logs) in all environments. File transports remain for persistent logs.
logger.add(new transports.Console({
  format: format.combine(
    format.colorize(),
    format.simple()
  ),
}));
