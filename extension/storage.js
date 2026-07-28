// ─── CodeSync Storage Module ──────────────────────────────────────────────────
// Shared chrome.storage.local wrappers.
// Loaded by manifest content_scripts (for content.js) AND importScripts in background.js.
// All functions are plain globals — no IIFE — so they're visible in both contexts.
// NEVER use chrome.storage.sync for the token: it would replicate the PAT across devices.
// ─────────────────────────────────────────────────────────────────────────────

var CS_KEYS = {
  TOKEN:     'gh_token',      // string | null
  REPO:      'gh_repo',       // { owner, name, fullName, defaultBranch, private, htmlUrl }
  SHA_CACHE: 'sha_cache',     // { [filePath]: sha }  ← avoids GET before every PUT
  STATS:     'stats',         // { solved, easy, medium, hard, lastSynced, recentSolves[] }
  QUEUE:     'sync_queue',    // SyncJob[]
  SETTINGS:  'settings',      // { onlyFirstSolve, autoSync, commitReadme }
  LAST_SYNC: 'last_sync',     // { problemName, lang, difficulty, status, commitUrl, ts }
  PROCESSED: 'processed_ids', // string[]  ← submission IDs already synced (dedup)
};

// ─── Token ────────────────────────────────────────────────────────────────────

function cs_getToken() {
  return new Promise(function(r) {
    chrome.storage.local.get({ [CS_KEYS.TOKEN]: null }, function(d) { r(d[CS_KEYS.TOKEN]); });
  });
}

function cs_setToken(token) {
  return new Promise(function(r) {
    chrome.storage.local.set({ [CS_KEYS.TOKEN]: token }, r);
  });
}

function cs_clearToken() {
  return new Promise(function(r) {
    chrome.storage.local.remove(CS_KEYS.TOKEN, r);
  });
}

// ─── Repo ─────────────────────────────────────────────────────────────────────

function cs_getRepo() {
  return new Promise(function(r) {
    chrome.storage.local.get({ [CS_KEYS.REPO]: null }, function(d) { r(d[CS_KEYS.REPO]); });
  });
}

function cs_setRepo(repo) {
  return new Promise(function(r) {
    chrome.storage.local.set({ [CS_KEYS.REPO]: repo }, r);
  });
}

// ─── SHA Cache ────────────────────────────────────────────────────────────────
// We cache path→sha so we can skip the GET request before every PUT.
// A 409 from GitHub means our cached sha is stale; the caller must re-GET then retry.

function cs_getShaCache() {
  return new Promise(function(r) {
    chrome.storage.local.get({ [CS_KEYS.SHA_CACHE]: {} }, function(d) { r(d[CS_KEYS.SHA_CACHE]); });
  });
}

async function cs_getSha(filePath) {
  var cache = await cs_getShaCache();
  return cache[filePath] || null;
}

async function cs_updateSha(filePath, sha) {
  var cache = await cs_getShaCache();
  cache[filePath] = sha;
  return new Promise(function(r) {
    chrome.storage.local.set({ [CS_KEYS.SHA_CACHE]: cache }, r);
  });
}

async function cs_removeSha(filePath) {
  var cache = await cs_getShaCache();
  delete cache[filePath];
  return new Promise(function(r) {
    chrome.storage.local.set({ [CS_KEYS.SHA_CACHE]: cache }, r);
  });
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function cs_getStats() {
  var defaults = { solved: 0, easy: 0, medium: 0, hard: 0, lastSynced: null, recentSolves: [] };
  return new Promise(function(r) {
    chrome.storage.local.get({ [CS_KEYS.STATS]: defaults }, function(d) { r(d[CS_KEYS.STATS]); });
  });
}

async function cs_incrementStats(difficulty, solveData) {
  var stats = await cs_getStats();
  stats.solved = (stats.solved || 0) + 1;
  var d = (difficulty || '').toLowerCase();
  if (d === 'easy')   stats.easy   = (stats.easy   || 0) + 1;
  if (d === 'medium') stats.medium = (stats.medium || 0) + 1;
  if (d === 'hard')   stats.hard   = (stats.hard   || 0) + 1;
  stats.lastSynced = new Date().toISOString();
  if (solveData) {
    stats.recentSolves = [solveData].concat(stats.recentSolves || []).slice(0, 10);
  }
  return new Promise(function(r) {
    chrome.storage.local.set({ [CS_KEYS.STATS]: stats }, r);
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function cs_getSettings() {
  var defaults = { onlyFirstSolve: false, autoSync: true, commitReadme: true };
  return new Promise(function(r) {
    chrome.storage.local.get({ [CS_KEYS.SETTINGS]: defaults }, function(d) { r(d[CS_KEYS.SETTINGS]); });
  });
}

async function cs_updateSettings(patch) {
  var current = await cs_getSettings();
  var next = Object.assign({}, current, patch);
  return new Promise(function(r) {
    chrome.storage.local.set({ [CS_KEYS.SETTINGS]: next }, r);
  });
}

// ─── Last Sync ────────────────────────────────────────────────────────────────

function cs_getLastSync() {
  return new Promise(function(r) {
    chrome.storage.local.get({ [CS_KEYS.LAST_SYNC]: null }, function(d) { r(d[CS_KEYS.LAST_SYNC]); });
  });
}

function cs_setLastSync(data) {
  var record = Object.assign({}, data, { ts: Date.now() });
  return new Promise(function(r) {
    chrome.storage.local.set({ [CS_KEYS.LAST_SYNC]: record }, r);
  });
}

// ─── Sync Queue ───────────────────────────────────────────────────────────────

function cs_getQueue() {
  return new Promise(function(r) {
    chrome.storage.local.get({ [CS_KEYS.QUEUE]: [] }, function(d) { r(d[CS_KEYS.QUEUE]); });
  });
}

async function cs_enqueue(job) {
  var queue = await cs_getQueue();
  if (queue.some(function(j) { return j.id === job.id; })) return; // dedup by job id
  queue.push(Object.assign({}, job, { retries: 0, addedAt: Date.now() }));
  return new Promise(function(r) {
    chrome.storage.local.set({ [CS_KEYS.QUEUE]: queue }, r);
  });
}

async function cs_dequeue(jobId) {
  var queue = await cs_getQueue();
  var next = queue.filter(function(j) { return j.id !== jobId; });
  return new Promise(function(r) {
    chrome.storage.local.set({ [CS_KEYS.QUEUE]: next }, r);
  });
}

async function cs_updateQueueJob(jobId, patch) {
  var queue = await cs_getQueue();
  var next = queue.map(function(j) {
    return j.id === jobId ? Object.assign({}, j, patch) : j;
  });
  return new Promise(function(r) {
    chrome.storage.local.set({ [CS_KEYS.QUEUE]: next }, r);
  });
}

// ─── Processed submission IDs (dedup) ─────────────────────────────────────────

async function cs_isProcessed(submissionId) {
  var ids = await new Promise(function(r) {
    chrome.storage.local.get({ [CS_KEYS.PROCESSED]: [] }, function(d) { r(d[CS_KEYS.PROCESSED]); });
  });
  return ids.indexOf(String(submissionId)) !== -1;
}

async function cs_markProcessed(submissionId) {
  var ids = await new Promise(function(r) {
    chrome.storage.local.get({ [CS_KEYS.PROCESSED]: [] }, function(d) { r(d[CS_KEYS.PROCESSED]); });
  });
  var sid = String(submissionId);
  if (ids.indexOf(sid) !== -1) return;
  var next = [sid].concat(ids).slice(0, 1000);
  return new Promise(function(r) {
    chrome.storage.local.set({ [CS_KEYS.PROCESSED]: next }, r);
  });
}

// ─── Full clear (disconnect) ──────────────────────────────────────────────────

function cs_clearAll() {
  return new Promise(function(r) { chrome.storage.local.clear(r); });
}
