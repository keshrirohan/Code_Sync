#!/usr/bin/env node
// ============================================================================
// index.js — Entry point for CodeSync. Just wiring, no logic.
// ============================================================================

import { parseArgs } from "./config.js";
import { execute } from "./handler.js";

// Parse CLI args, run the sync, catch any top-level errors
const config = parseArgs();
execute(config).catch((error) => {
  console.error(`\nFATAL ERROR: ${error.message}`);
  process.exit(1);
});
