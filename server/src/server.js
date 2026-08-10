// ============================================================================
// server.js — Boot sequence for the CodeSync web dashboard.
//
// Boot order:
//   1. Import app (which loads .env, validates env, sets up Express)
//   2. Connect to MongoDB
//   3. Restore auto-sync timer from persisted settings
//   4. Start listening on PORT
// ============================================================================

import { app, PORT, BACKEND_URL, FRONTEND_URL, CALLBACK_URL, resetAutoSyncTimer } from './app.js';
import { connectDB }  from './config/db.js';
import logger          from './utils/logger.js';
import { loadConfig }  from './storage/storage.js';

async function boot() {
  await connectDB();

  // Restore auto-sync timer from persisted settings
  try {
    const cfg = await loadConfig();
    if (cfg.autoSyncEnabled && cfg.autoSyncIntervalMinutes) {
      resetAutoSyncTimer(cfg.autoSyncIntervalMinutes);
      logger.info(`[Auto-sync] Restored: every ${cfg.autoSyncIntervalMinutes} min`);
    }
  } catch {
    // Non-fatal — auto-sync just won't run until manually enabled
  }

  app.listen(PORT, () => {
    logger.info(`CodeSync server running on port ${PORT}`);
    logger.info(`  Backend URL:  ${BACKEND_URL}`);
    logger.info(`  Frontend URL: ${FRONTEND_URL}`);
    logger.info(`  OAuth callback: ${CALLBACK_URL}`);
  });
}

boot().catch(err => {
  logger.error('Fatal boot error:', { err: err.message });
  process.exit(1);
});

export default app;
