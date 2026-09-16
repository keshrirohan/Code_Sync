// ============================================================================
// models/Settings.js — Single-document store for all app configuration.
//
// We use a singleton pattern: there is always exactly ONE Settings document
// in the collection (identified by key: 'global'). All reads/writes go
// through the static helpers loadGlobal() and saveGlobal().
//
// Sensitive fields (leetcodeCookie, githubToken, githubOAuthClientSecret)
// are stored AES-256 encrypted. The encryption/decryption is handled in
// storage.js — the model itself just holds the raw (encrypted) strings.
// ============================================================================

import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    // Singleton key — always 'global'
    key: { type: String, default: 'global', unique: true, index: true },

    // ── LeetCode ─────────────────────────────────────────────────────────
    leetcodeCookie:   { type: String, default: null }, // AES-encrypted
    leetcodeUsername: { type: String, default: null },

    // ── GitHub OAuth App credentials ──────────────────────────────────────
    githubOAuthClientId:     { type: String, default: null },
    githubOAuthClientSecret: { type: String, default: null }, // AES-encrypted

    // ── GitHub user (set after OAuth / PAT connect) ───────────────────────
    githubToken:    { type: String, default: null }, // AES-encrypted
    githubUsername: { type: String, default: null },
    githubAvatar:   { type: String, default: null },

    // ── Target repository ─────────────────────────────────────────────────
    targetRepoUrl:  { type: String, default: null },
    targetRepoName: { type: String, default: null },

    // ── Sync state ───────────────────────────────────────────────────────
    autoSyncEnabled:         { type: Boolean, default: false },
    autoSyncIntervalMinutes: { type: Number,  default: 10 },
    lastAutoSyncAt:          { type: Date,    default: null },

    // ── Incremental sync state ─────────────────────────────────────────────
    lastSyncedSlugs: { type: [String], default: [] },
    lastFullSyncAt:  { type: Date,     default: null },
  },
  {
    timestamps: true,
    collection: 'settings',
  }
);

// ── Static helpers ────────────────────────────────────────────────────────────

/**
 * loadGlobal — Returns the singleton settings document as a plain object.
 * Creates it with defaults if it doesn't exist yet.
 */
settingsSchema.statics.loadGlobal = async function () {
  let doc = await this.findOne({ key: 'global' }).lean();
  if (!doc) {
    doc = await this.create({ key: 'global' });
    doc = doc.toObject();
  }
  return doc;
};

/**
 * saveGlobal — Merges `data` into the singleton document.
 *
 * @param {object} data        — fields to $set (present keys only)
 * @param {string[]} clearFields — field names to $unset (explicitly null them in DB)
 *
 * WHY clearFields exists:
 *   JavaScript `delete obj.key` removes the key from the object — it does NOT
 *   appear in the `$set` payload, so MongoDB ignores it and the old value
 *   persists. To actually remove a value from the document we must use $unset.
 *   This is the root cause of "Disconnect doesn't work" in production.
 */
settingsSchema.statics.saveGlobal = async function (data, clearFields = []) {
  // Never allow overwriting the singleton key or internal Mongoose fields
  const { key: _key, _id, __v, createdAt, updatedAt, ...fields } = data;

  // Build the update operation
  const update = {};

  // $set any fields that are present in the payload
  if (Object.keys(fields).length > 0) {
    update.$set = fields;
  }

  // $unset any fields that should be explicitly cleared in MongoDB
  if (clearFields.length > 0) {
    update.$unset = {};
    for (const f of clearFields) {
      update.$unset[f] = '';   // MongoDB $unset value is irrelevant — '' is conventional
    }
  }

  // If nothing to do, return current doc
  if (!update.$set && !update.$unset) {
    return this.findOne({ key: 'global' }).lean();
  }

  const doc = await this.findOneAndUpdate(
    { key: 'global' },
    update,
    { upsert: true, new: true, lean: true }
  );
  return doc;
};

export default mongoose.model('Settings', settingsSchema);
