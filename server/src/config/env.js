// ============================================================================
// config/env.js — Validate required environment variables at startup.
//
// Call validateEnv() before anything else in server.js.
// This gives a clear error message instead of a cryptic crash later.
// ============================================================================

const REQUIRED = [
  'MONGODB_URI',
  'ENCRYPTION_SECRET', // 32-char hex string for AES-256
];

const OPTIONAL_WITH_DEFAULTS = {
  PORT:        '3055',
  NODE_ENV:    'development',
  FRONTEND_URL: 'http://localhost:5173',
};

export function validateEnv() {
  const missing = REQUIRED.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('\n❌  Missing required environment variables:');
    missing.forEach(k => console.error(`   • ${k}`));
    console.error('\n   Copy .env.example → .env and fill in the values.\n');
    process.exit(1);
  }

  // Apply defaults for optional vars
  for (const [key, value] of Object.entries(OPTIONAL_WITH_DEFAULTS)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
