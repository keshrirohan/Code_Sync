// ============================================================================
// storage.js — Persistent storage for config and sync history.
//
// Uses atomic file writes (.tmp → rename) to prevent corruption on crash.
// All data lives in /data/ at the project root (gitignored).
// ============================================================================

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function atomicWrite(filePath, data) {
  const tmpPath = filePath + '.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

export async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveConfig(data) {
  await ensureDataDir();
  await atomicWrite(CONFIG_PATH, data);
}

export async function loadHistory() {
  try {
    const raw = await fs.readFile(HISTORY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function addHistoryEntry(entry) {
  await ensureDataDir();
  const history = await loadHistory();
  history.unshift(entry); // newest first
  await atomicWrite(HISTORY_PATH, history);
}

export async function deleteHistoryEntry(id) {
  const history = await loadHistory();
  const updated = history.filter(h => h.id !== id);
  await ensureDataDir();
  await atomicWrite(HISTORY_PATH, updated);
}
