import winston from 'winston';
import path from 'path';
import fs from 'fs';

const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
let enableFileLogging = true;
try {
  if (fs.existsSync(logDir)) {
    const stat = fs.statSync(logDir);
    if (!stat.isDirectory()) {
      throw new Error('LOG_DIR exists but is not a directory');
    }
  } else {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (err) {
  enableFileLogging = false;
  // eslint-disable-next-line no-console
  console.warn(
    `WARN: Failed to initialize LOG_DIR (${logDir}); file logging disabled.`,
    err
  );
}

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }),
];

if (enableFileLogging) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 20 * 1024 * 1024,
      maxFiles: 10,
    })
  );
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports,
});
