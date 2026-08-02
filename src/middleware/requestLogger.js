// ============================================================================
// middleware/requestLogger.js — HTTP request/response logger middleware.
//
// Logs method, path, status code, and response time for every request.
// Skips SSE streams (/stream) to avoid flooding the log with keep-alive noise.
//
// Usage in server.js:
//   import { requestLogger } from './middleware/requestLogger.js';
//   app.use(requestLogger);
// ============================================================================

import logger from '../utils/logger.js';

export function requestLogger(req, res, next) {
  // Skip SSE stream endpoints — they stay open for a long time and
  // would generate misleading "slow request" log entries
  if (req.path.includes('/stream')) return next();

  const start = Date.now();

  res.on('finish', () => {
    const ms     = Date.now() - start;
    const status = res.statusCode;
    const level  = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'http';

    // winston doesn't have 'http' by default — fall back to 'info'
    const logFn = logger[level] || logger.info;
    logFn.call(logger, `${req.method} ${req.path} ${status} ${ms}ms`);
  });

  next();
}
