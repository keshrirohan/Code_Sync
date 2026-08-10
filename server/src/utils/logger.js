// ============================================================================
// utils/logger.js — Centralised Winston logger.
//
// In production (NODE_ENV=production):
//   • Logs at 'info' level and above
//   • Outputs compact JSON (easy to parse in Render's log viewer)
//
// In development:
//   • Logs at 'debug' level and above
//   • Outputs colourised, human-readable text
//
// Usage:
//   import logger from './utils/logger.js';
//   logger.info('Server started');
//   logger.error('Something broke', { err: error.message });
// ============================================================================

import winston from 'winston';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const isProd = process.env.NODE_ENV === 'production';

// ── Development format ────────────────────────────────────────────────────────
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp: ts, level, message, stack, ...meta }) => {
    const extras = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} [${level}] ${stack || message}${extras}`;
  })
);

// ── Production format ─────────────────────────────────────────────────────────
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const logger = winston.createLogger({
  level:       isProd ? 'info' : 'debug',
  format:      isProd ? prodFormat : devFormat,
  transports:  [new winston.transports.Console()],
  // Don't exit on handled exceptions
  exitOnError: false,
});

export default logger;
