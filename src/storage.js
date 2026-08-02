// ============================================================================
// storage.js — MongoDB-backed replacement for the old JSON file storage.
//
// Public API is intentionally identical to the old file-based version so
// the rest of the codebase (server.js, handler.js) needs minimal changes:
//
//   loadConfig()              → plain object with decrypted sensitive fields
//   saveConfig(data)          → encrypts sensitive fields, saves to MongoDB
//   loadHistory()             → array of history docs (newest first)
//   addHistoryEntry(entry)    → inserts one SyncHistory document
//   deleteHistoryEntry(id)    → deletes by UUID 'id' field
//
// Encrypted fields (stored ciphertext, returned plaintext):
//   • leetcodeCookie
//   • githubToken
//   • githubOAuthClientSecret
// ============================================================================

import Settings    from './models/Settings.js';
import SyncHistory from './models/SyncHistory.js';
import { encrypt, decrypt, isEncrypted } from './utils/crypto.js';
import logger from './utils/logger.js';

// Fields that must be encrypted before writing to the database
const ENCRYPTED_FIELDS = ['leetcodeCookie', 'githubToken', 'githubOAuthClientSecret'];

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * encryptFields — Encrypt every sensitive field in a config object.
 * Skips fields that are already encrypted (idempotent).
 */
function encryptFields(data) {
  const result = { ...data };
  for (const field of ENCRYPTED_FIELDS) {
    if (result[field] && !isEncrypted(result[field])) {
      result[field] = encrypt(result[field]);
    }
  }
  return result;
}

/**
 * decryptFields — Decrypt every sensitive field coming out of the database.
 * Leaves null/undefined fields alone.
 */
function decryptFields(data) {
  if (!data) return {};
  const result = { ...data };
  for (const field of ENCRYPTED_FIELDS) {
    if (result[field]) {
      result[field] = decrypt(result[field]);
    }
  }
  return result;
}

// ── Config (Settings singleton) ───────────────────────────────────────────────

/**
 * loadConfig — Returns the global settings as a plain object.
 * Sensitive fields are decrypted before returning.
 */
export async function loadConfig() {
  try {
    const raw = await Settings.loadGlobal();
    return decryptFields(raw);
  } catch (err) {
    logger.error('loadConfig failed:', { err: err.message });
    return {};
  }
}

/**
 * saveConfig — Merges `data` into the global settings document.
 * Sensitive fields are encrypted before writing.
 *
 * Input:  data (object) — partial or full config (plaintext values)
 * Output: void
 */
export async function saveConfig(data) {
  try {
    const encrypted = encryptFields(data);
    await Settings.saveGlobal(encrypted);
  } catch (err) {
    logger.error('saveConfig failed:', { err: err.message });
    throw err;
  }
}

// ── Sync History ──────────────────────────────────────────────────────────────

/**
 * loadHistory — Returns all sync history entries, newest first.
 * Output: Array of plain objects matching the old history.json shape.
 */
export async function loadHistory() {
  try {
    const docs = await SyncHistory
      .find({})
      .sort({ startedAt: -1 })
      .lean();
    return docs;
  } catch (err) {
    logger.error('loadHistory failed:', { err: err.message });
    return [];
  }
}

/**
 * addHistoryEntry — Inserts a new sync history record.
 *
 * Input: entry — object with at least { id, startedAt, status, repoUrl, ... }
 * Output: void
 */
export async function addHistoryEntry(entry) {
  try {
    await SyncHistory.create(entry);
  } catch (err) {
    // Duplicate key (same id re-inserted) — update instead
    if (err.code === 11000) {
      const { id, ...rest } = entry;
      await SyncHistory.findOneAndUpdate({ id }, { $set: rest }, { new: true });
    } else {
      logger.error('addHistoryEntry failed:', { err: err.message });
      throw err;
    }
  }
}

/**
 * updateHistoryEntry — Updates an existing entry by UUID id.
 * Used to mark a 'running' job as 'success' or 'error' when it completes.
 */
export async function updateHistoryEntry(id, updates) {
  try {
    await SyncHistory.findOneAndUpdate({ id }, { $set: updates });
  } catch (err) {
    logger.error('updateHistoryEntry failed:', { err: err.message });
  }
}

/**
 * deleteHistoryEntry — Deletes a sync history record by UUID id.
 */
export async function deleteHistoryEntry(id) {
  try {
    await SyncHistory.deleteOne({ id });
  } catch (err) {
    logger.error('deleteHistoryEntry failed:', { err: err.message });
    throw err;
  }
}
