// ============================================================================
// middleware/errorHandler.js — Centralised Express error handler.
//
// Mount this LAST in server.js (after all routes) with:
//   app.use(errorHandler);
//
// Catches errors thrown or passed via next(err) from any route handler.
// Returns a clean JSON error response and never leaks stack traces in prod.
// ============================================================================

import logger from '../utils/logger.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status  = err.status || err.statusCode || 500;
  const isProd  = process.env.NODE_ENV === 'production';
  const message = err.message || 'Internal server error';

  // Always log the full error server-side
  logger.error(`${req.method} ${req.path} → ${status}`, {
    err:    message,
    stack:  isProd ? undefined : err.stack,
  });

  res.status(status).json({
    error:   message,
    // Only include stack trace in development
    ...(isProd ? {} : { stack: err.stack }),
  });
}
