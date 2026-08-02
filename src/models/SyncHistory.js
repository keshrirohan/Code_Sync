// ============================================================================
// models/SyncHistory.js — One document per sync run.
//
// Replaces history.json. Each run (full or incremental) creates one entry.
// The id field mirrors the UUID used by the old JSON file so the frontend
// history table continues to work without any changes.
// ============================================================================

import mongoose from 'mongoose';

const syncHistorySchema = new mongoose.Schema(
  {
    // Human-readable UUID — matches the old history.json 'id' field
    id: { type: String, required: true, unique: true, index: true },

    startedAt:   { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },

    repoUrl:  { type: String, default: null },
    repoName: { type: String, default: null },

    // 'success' | 'error' | 'running'
    status: { type: String, enum: ['success', 'error', 'running'], default: 'running' },

    dryRun: { type: Boolean, default: false },

    // Optional: how many new submissions were committed
    newCount:     { type: Number, default: null },
    skippedCount: { type: Number, default: null },

    // Error message if status === 'error'
    errorMessage: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: 'synchistories',
  }
);

// Sort by startedAt descending by default
syncHistorySchema.index({ startedAt: -1 });

export default mongoose.model('SyncHistory', syncHistorySchema);
