// ============================================================================
// app.js — Express application setup for the CodeSync web dashboard.
//
// This module creates and configures the Express app with all middleware
// and routes, then exports it. The actual server startup (boot + listen)
// is in server.js.
//
// Environment variables used:
//   PORT            — listen port (default 3055)
//   MONGODB_URI     — Atlas connection string (required)
//   ENCRYPTION_SECRET — 64-char hex key for AES-256 (required)
//   BACKEND_URL     — public URL of this server (used for OAuth callback)
//   FRONTEND_URL    — public URL of the React app (used for CORS + redirects)
//   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET — optional if using env-level OAuth
// ============================================================================

import 'dotenv/config';                    // must be first
import { validateEnv } from './config/env.js';
validateEnv();                              // exits if required vars missing

import express  from 'express';
import cors     from 'cors';
import { spawn }      from 'child_process';
import path           from 'path';
import { fileURLToPath } from 'url';
import fetch          from 'node-fetch';
import crypto         from 'crypto';

import logger               from './utils/logger.js';
import { errorHandler }     from './middleware/errorHandler.js';
import { requestLogger }    from './middleware/requestLogger.js';
import {
  loadConfig, saveConfig,
  loadHistory, addHistoryEntry, updateHistoryEntry, deleteHistoryEntry,
} from './storage/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = parseInt(process.env.PORT || '3055', 10);

// ── Derived URLs ─────────────────────────────────────────────────────────────
// BACKEND_URL is the public URL of this deployed service (no trailing slash).
// Falls back to localhost for local dev.
const BACKEND_URL  = (process.env.BACKEND_URL  || `http://localhost:${PORT}`).replace(/\/$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
const CALLBACK_URL = `${BACKEND_URL}/api/auth/github/callback`;

// In-memory job store — Map<jobId, { status, logs, sseClients, startedAt }>
const jobs = new Map();

// In-memory OAuth state store — Map<state, { createdAt }> (CSRF protection)
const oauthStates = new Map();

// Purge OAuth states older than 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of oauthStates) {
    if (v.createdAt < cutoff) oauthStates.delete(k);
  }
}, 5 * 60 * 1000);

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());

// CORS — allow the React frontend and Chrome extension to reach the API
const allowedOrigins = new Set([
  FRONTEND_URL,
  'https://code-sync-3sld.onrender.com',   // production frontend (explicit)
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3055',
  'http://127.0.0.1:3055',
  'chrome-extension://', // Chrome extension (prefix match below)
]);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, same-origin)
    if (!origin) return cb(null, true);
    // Allow any chrome-extension:// origin
    if (origin.startsWith('chrome-extension://')) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request logger (skip for SSE streams — they'd flood the log)
app.use(requestLogger);

// ── Static frontend ───────────────────────────────────────────────────────────

const FRONTEND_DIST = path.join(__dirname, '../../client/dist');
app.use(express.static(FRONTEND_DIST));

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeLeetcodeCookie(cookieStr) {
  if (!cookieStr || typeof cookieStr !== 'string') return '';
  let trimmed = cookieStr.trim();
  if (!trimmed) return '';

  if (!trimmed.includes('=')) {
    trimmed = `LEETCODE_SESSION=${trimmed}`;
  }
  if (!trimmed.toLowerCase().includes('leetcode_session')) {
    trimmed = `LEETCODE_SESSION=${trimmed}`;
  }
  if (!trimmed.includes('csrftoken=')) {
    trimmed = `${trimmed}; csrftoken=leetcode`;
  }
  return trimmed;
}

// ── Error codes for structured LeetCode auth responses ───────────────────────
const LC_ERROR = {
  COOKIE_REQUIRED:  'COOKIE_REQUIRED',
  SESSION_INVALID:  'SESSION_INVALID',
  SESSION_EXPIRED:  'SESSION_EXPIRED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  STORAGE_ERROR:    'STORAGE_ERROR',
};

function extractCsrfToken(cookie) {
  if (!cookie) return 'leetcode';
  const match = cookie.match(/csrftoken=([^;]+)/);
  return (match && match[1].trim()) ? match[1].trim() : 'leetcode';
}

async function validateLeetcodeCookie(cookie) {
  const normalized = normalizeLeetcodeCookie(cookie);
  const res = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: normalized,
      'x-csrftoken': extractCsrfToken(normalized),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://leetcode.com',
      Origin:  'https://leetcode.com',
    },
    body: JSON.stringify({ query: 'query { userStatus { username isSignedIn } }' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.data?.userStatus;
}

// ── API: Health (no MongoDB dependency — pure connectivity check) ─────────────

app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ── API: Status (backend + dependency + connection status) ────────────────────

import mongoose from 'mongoose';

app.get('/api/status', async (req, res) => {
  const mongoState = mongoose.connection.readyState;
  // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const mongoStatus = mongoState === 1 ? 'connected' : mongoState === 2 ? 'connecting' : 'disconnected';

  let leetcodeStatus = 'not_connected';
  let githubStatus   = 'not_connected';

  try {
    const cfg = await loadConfig();
    if (cfg.leetcodeCookie) {
      leetcodeStatus = cfg.leetcodeUsername ? 'connected' : 'session_stored';
    }
    if (cfg.githubToken) {
      githubStatus = cfg.githubUsername ? 'connected' : 'token_stored';
    }
  } catch {
    // MongoDB might be down — statuses stay as defaults
  }

  res.json({
    backend:  'online',
    mongodb:  mongoStatus,
    leetcode: leetcodeStatus,
    github:   githubStatus,
  });
});

// ── API: Config ───────────────────────────────────────────────────────────────

app.get('/api/config', async (req, res) => {
  try {
    const cfg = await loadConfig();
    // Never expose raw credentials — only presence flags and safe values
    res.json({
      hasLeetcodeCookie: !!cfg.leetcodeCookie,
      leetcodeUsername:  cfg.leetcodeUsername  || null,
      hasGithubToken:    !!cfg.githubToken,
      githubUsername:    cfg.githubUsername    || null,
      githubAvatar:      cfg.githubAvatar      || null,
      targetRepoUrl:     cfg.targetRepoUrl     || null,
      targetRepoName:    cfg.targetRepoName    || null,
    });
  } catch (err) {
    logger.error('GET /api/config', { err: err.message });
    res.status(500).json({ error: 'Unable to load configuration', code: 'CONFIG_ERROR' });
  }
});

// ── API: LeetCode Auth ────────────────────────────────────────────────────────

async function handleLeetcodeAuth(req, res) {
  const { cookie } = req.body;
  if (!cookie || (typeof cookie === 'string' && !cookie.trim())) {
    return res.status(400).json({ valid: false, error: 'Cookie is required', code: LC_ERROR.COOKIE_REQUIRED });
  }
  const normalized = normalizeLeetcodeCookie(cookie);
  try {
    const userStatus = await validateLeetcodeCookie(normalized);
    if (!userStatus?.isSignedIn) {
      return res.status(401).json({
        valid: false,
        error: 'LeetCode session is invalid or expired. Please log in again at leetcode.com.',
        code:  userStatus ? LC_ERROR.SESSION_EXPIRED : LC_ERROR.SESSION_INVALID,
      });
    }

    const cfg = await loadConfig();
    cfg.leetcodeCookie   = normalized;
    cfg.leetcodeUsername = userStatus.username;
    await saveConfig(cfg);

    res.json({ valid: true, username: userStatus.username });
  } catch (err) {
    logger.error('LeetCode auth', { err: err.message });
    // Distinguish network/validation errors from storage errors
    const isNetworkError = err.message.includes('HTTP') || err.message.includes('fetch') || err.message.includes('ECONNREFUSED');
    res.status(isNetworkError ? 502 : 500).json({
      valid: false,
      error: isNetworkError
        ? 'Unable to validate session with LeetCode. Please try again.'
        : 'Internal error while saving session.',
      code: isNetworkError ? LC_ERROR.VALIDATION_ERROR : LC_ERROR.STORAGE_ERROR,
    });
  }
}

app.post('/api/auth/leetcode',                handleLeetcodeAuth);
app.post('/api/auth/leetcode-from-extension', handleLeetcodeAuth);

app.delete('/api/auth/leetcode', async (req, res) => {
  try {
    const cfg = await loadConfig();
    delete cfg.leetcodeCookie;
    delete cfg.leetcodeUsername;
    await saveConfig(cfg);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: GitHub PAT Auth ──────────────────────────────────────────────────────

app.post('/api/auth/github', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!r.ok) return res.status(401).json({ valid: false, error: 'Invalid or expired token' });

    const user = await r.json();
    const cfg  = await loadConfig();
    cfg.githubToken    = token;
    cfg.githubUsername = user.login;
    cfg.githubAvatar   = user.avatar_url;
    await saveConfig(cfg);

    res.json({ valid: true, username: user.login, avatar: user.avatar_url });
  } catch (err) {
    logger.error('GitHub PAT auth', { err: err.message });
    res.status(500).json({ valid: false, error: err.message });
  }
});

app.delete('/api/auth/github', async (req, res) => {
  try {
    const cfg = await loadConfig();
    delete cfg.githubToken;
    delete cfg.githubUsername;
    delete cfg.githubAvatar;
    await saveConfig(cfg);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: GitHub OAuth ─────────────────────────────────────────────────────────

app.get('/api/auth/github/oauth-status', async (req, res) => {
  try {
    const cfg = await loadConfig();
    // Support credentials from DB or from env vars (Render env)
    const clientId     = cfg.githubOAuthClientId     || process.env.GITHUB_CLIENT_ID;
    const clientSecret = cfg.githubOAuthClientSecret || process.env.GITHUB_CLIENT_SECRET;
    res.json({
      configured: !!(clientId && clientSecret),
      connected:  !!cfg.githubToken,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/github/oauth-setup', async (req, res) => {
  const { clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret)
    return res.status(400).json({ error: 'Both clientId and clientSecret are required' });
  try {
    const cfg = await loadConfig();
    cfg.githubOAuthClientId     = clientId.trim();
    cfg.githubOAuthClientSecret = clientSecret.trim();
    await saveConfig(cfg);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/github/login', async (req, res) => {
  try {
    const cfg = await loadConfig();
    const clientId = cfg.githubOAuthClientId || process.env.GITHUB_CLIENT_ID;
    const clientSecret = cfg.githubOAuthClientSecret || process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret)
      return res.status(400).send('GitHub OAuth is not configured. Set up Client ID + Secret first.');

    const state = crypto.randomUUID();
    oauthStates.set(state, { createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id:    clientId,
      redirect_uri: CALLBACK_URL,
      scope:        'repo',
      state,
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/auth/github/callback', async (req, res) => {
  const { code, state, error: ghError } = req.query;

  if (ghError) return res.redirect(`${FRONTEND_URL}/?gh_error=${encodeURIComponent(ghError)}`);

  if (!state || !oauthStates.has(state))
    return res.redirect(`${FRONTEND_URL}/?gh_error=invalid_state`);
  oauthStates.delete(state);

  try {
    const cfg = await loadConfig();
    const clientId     = cfg.githubOAuthClientId     || process.env.GITHUB_CLIENT_ID;
    const clientSecret = cfg.githubOAuthClientSecret || process.env.GITHUB_CLIENT_SECRET;

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: CALLBACK_URL }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!userRes.ok) throw new Error('Failed to fetch GitHub user info');
    const user = await userRes.json();

    cfg.githubToken    = tokenData.access_token;
    cfg.githubUsername = user.login;
    cfg.githubAvatar   = user.avatar_url;
    await saveConfig(cfg);

    res.redirect(`${FRONTEND_URL}/?gh_connected=1`);
  } catch (err) {
    logger.error('GitHub OAuth callback', { err: err.message });
    res.redirect(`${FRONTEND_URL}/?gh_error=${encodeURIComponent(err.message)}`);
  }
});

// ── API: Repositories ─────────────────────────────────────────────────────────

app.get('/api/repos', async (req, res) => {
  try {
    const cfg = await loadConfig();
    if (!cfg.githubToken) return res.status(401).json({ error: 'GitHub not connected' });

    const repos = [];
    let page = 1;
    while (true) {
      const r = await fetch(
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated`,
        {
          headers: {
            Authorization: `Bearer ${cfg.githubToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );
      if (!r.ok) break;
      const batch = await r.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      repos.push(...batch.map(repo => ({
        name:        repo.full_name,
        url:         repo.clone_url,
        private:     repo.private,
        description: repo.description || '',
        updatedAt:   repo.updated_at,
        stars:       repo.stargazers_count,
      })));
      if (batch.length < 100) break;
      page++;
    }
    res.json(repos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/repos/select', async (req, res) => {
  try {
    const { repoUrl, repoName } = req.body;
    const cfg = await loadConfig();
    cfg.targetRepoUrl  = repoUrl;
    cfg.targetRepoName = repoName;
    await saveConfig(cfg);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Sync History ─────────────────────────────────────────────────────────

app.get('/api/history', async (req, res) => {
  try {
    const history = await loadHistory();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/history/:id', async (req, res) => {
  try {
    await deleteHistoryEntry(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Manual Sync (with SSE progress stream) ───────────────────────────────

app.post('/api/sync/start', async (req, res) => {
  try {
    const cfg = await loadConfig();
    if (!cfg.leetcodeCookie || !cfg.githubToken || !cfg.targetRepoUrl) {
      return res.status(400).json({ error: 'Not fully configured. Connect LeetCode, GitHub, and select a repo first.' });
    }

    const { dryRun = false } = req.body;
    const { v4: uuidv4 } = await import('uuid');
    const jobId = uuidv4();

    jobs.set(jobId, { status: 'running', logs: [], sseClients: [], startedAt: new Date().toISOString() });

    // Record the start of this sync run in history
    await addHistoryEntry({
      id:        jobId,
      startedAt: new Date().toISOString(),
      repoUrl:   cfg.targetRepoUrl,
      repoName:  cfg.targetRepoName || null,
      status:    'running',
      dryRun,
    });

    res.json({ jobId });

    // Load previously-synced slugs for incremental sync
    const knownSlugs = cfg.lastSyncedSlugs || [];

    // ── Run sync in a child process so it doesn't block the event loop ──
    // Pass config via env vars — never via CLI args (would be visible in `ps`)
    // Resolve the handler path relative to the project root
    const projectRoot = path.join(__dirname, '../..');
    const child = spawn(process.execPath, ['server/src/sync/handler.js'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        CODESYNC_COOKIE:      cfg.leetcodeCookie,
        CODESYNC_REPO_URL:    cfg.targetRepoUrl,
        CODESYNC_TOKEN:       cfg.githubToken,
        CODESYNC_DRY_RUN:     dryRun ? '1' : '0',
        CODESYNC_KNOWN_SLUGS: JSON.stringify(knownSlugs),
      },
    });

    // Track synced slugs output from the child process
    let updatedSlugs = null;

    function broadcast(event) {
      const job = jobs.get(jobId);
      if (!job) return;
      const data = `data: ${JSON.stringify(event)}\n\n`;
      job.sseClients.forEach(c => { try { c.write(data); } catch {} });
      if (event.type === 'log') job.logs.push(event.message);
    }

    function handleChildOutput(rawData) {
      const text = rawData.toString();
      // Check for the synced slugs marker in the output
      const slugsPrefix = 'CODESYNC_SYNCED_SLUGS:';
      for (const line of text.split('\n')) {
        if (line.startsWith(slugsPrefix)) {
          try {
            updatedSlugs = JSON.parse(line.slice(slugsPrefix.length));
          } catch {
            logger.warn('Failed to parse CODESYNC_SYNCED_SLUGS output');
          }
          // Don't broadcast this internal marker line to the frontend
          continue;
        }
      }
      broadcast({ type: 'log', message: text });
    }

    child.stdout.on('data', handleChildOutput);
    child.stderr.on('data', d => broadcast({ type: 'log', message: d.toString() }));

    child.on('close', async (code) => {
      const success = code === 0;
      broadcast({ type: 'complete', success });

      const job = jobs.get(jobId);
      if (job) {
        job.status = success ? 'success' : 'error';
        job.sseClients.forEach(c => { try { c.end(); } catch {} });
      }

      await updateHistoryEntry(jobId, {
        completedAt:  new Date().toISOString(),
        status:       success ? 'success' : 'error',
        errorMessage: success ? null : `Process exited with code ${code}`,
      });

      // Persist the updated set of synced slugs on success
      if (success && updatedSlugs && Array.isArray(updatedSlugs)) {
        try {
          await saveConfig({
            lastSyncedSlugs: updatedSlugs,
            lastFullSyncAt:  new Date().toISOString(),
          });
          logger.info(`[Sync] Saved ${updatedSlugs.length} synced slugs to config`);
        } catch (err) {
          logger.error('[Sync] Failed to save synced slugs:', { err: err.message });
        }
      }
    });

  } catch (err) {
    logger.error('POST /api/sync/start', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sync/:jobId/stream', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  // Replay buffered logs for late-joining clients
  job.logs.forEach(msg => {
    res.write(`data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`);
  });

  if (job.status !== 'running') {
    res.write(`data: ${JSON.stringify({ type: 'complete', success: job.status === 'success' })}\n\n`);
    return res.end();
  }

  job.sseClients.push(res);
  req.on('close', () => {
    const j = jobs.get(req.params.jobId);
    if (j) j.sseClients = j.sseClients.filter(c => c !== res);
  });
});

// ── Auto-sync infrastructure ──────────────────────────────────────────────────

let autoSyncTimer   = null;
const autoSyncState = { running: false, lastRunAt: null, lastResult: null };

function buildLCHeaders(cookie) {
  const m    = cookie.match(/csrftoken=([^;]+)/);
  const csrf = m ? m[1].trim() : '';
  return {
    'Content-Type': 'application/json',
    Cookie: cookie,
    'x-csrftoken': csrf,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://leetcode.com',
    Origin:  'https://leetcode.com',
  };
}

async function performIncrementalSync(cfg) {
  const { leetcodeCookie, leetcodeUsername, githubToken, targetRepoUrl, lastAutoSyncAt } = cfg;

  // ── Step 1: Fetch recent accepted submissions ─────────────────────────────
  // We use recentAcSubmissionList which takes a username. If the username is
  // somehow missing from the stored config, fall back to a direct submissionList
  // query via the full leetcodeClient pipeline instead.
  let newSubs = [];

  if (!leetcodeUsername) {
    // Username missing — can't use recentAcSubmissionList.
    // Fall back to full sync via the child-process handler path.
    logger.warn('[Auto-sync] leetcodeUsername not set in config — skipping auto-sync. Run a manual full sync first to populate it.');
    return { synced: 0 };
  }

  const r = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: buildLCHeaders(leetcodeCookie),
    body: JSON.stringify({
      query: `query($u:String!,$l:Int!){recentAcSubmissionList(username:$u,limit:$l){id title titleSlug timestamp}}`,
      variables: { u: leetcodeUsername, l: 20 },
    }),
  });

  if (!r.ok) {
    throw new Error(`LeetCode API returned HTTP ${r.status} — cookie may be expired`);
  }

  const data   = await r.json();
  const recent = data.data?.recentAcSubmissionList ?? [];

  logger.info(`[Auto-sync] recentAcSubmissionList returned ${recent.length} items for user "${leetcodeUsername}"`);

  if (recent.length === 0) {
    logger.warn('[Auto-sync] Empty recentAcSubmissionList — either no recent ACs or the LeetCode cookie is expired.');
    return { synced: 0 };
  }

  // ── Step 2: Filter to submissions newer than last sync ─────────────────────
  // LeetCode's timestamp field has returned both Unix-integer seconds AND
  // ISO-8601 strings at different times. Handle both formats safely.
  const sinceMs = lastAutoSyncAt ? new Date(lastAutoSyncAt).getTime() : 0;

  newSubs = recent.filter(s => {
    const ts = s.timestamp;
    // If it looks like a number (Unix seconds), multiply by 1000
    const ms = typeof ts === 'number' || /^\d{9,13}$/.test(String(ts))
      ? Number(ts) * (String(ts).length <= 10 ? 1000 : 1)  // 10-digit = seconds, 13-digit = ms
      : new Date(ts).getTime();
    return ms > sinceMs;
  });

  logger.info(`[Auto-sync] ${newSubs.length} new submission(s) since last sync (sinceMs=${sinceMs})`);

  // ── If nothing new, return without touching git or updating lastAutoSyncAt ─
  // We deliberately do NOT update lastAutoSyncAt here so the next trigger
  // re-checks the same window rather than sliding the window forward.
  if (newSubs.length === 0) return { synced: 0 };

  // Deduplicate by titleSlug (keep most recent per problem)
  const bySlug = new Map();
  for (const s of newSubs) if (!bySlug.has(s.titleSlug)) bySlug.set(s.titleSlug, s);

  // ── Step 3: Fetch full code for each new slug ──────────────────────────────
  const { fetchLatestSubmissionId, fetchSubmissionDetails } = await import('./leetcode/leetcodeClient.js');
  const gitClient = await import('./git/gitClient.js');
  const { getFileExtension, sanitizeFolderName } = await import('./sync/handler.js');

  // ── Step 4: Clone the repo with token auth ─────────────────────────────────
  gitClient.init(targetRepoUrl, githubToken);

  let committedCount = 0;

  for (const [slug] of bySlug) {
    try {
      const subInfo = await fetchLatestSubmissionId(leetcodeCookie, slug);
      if (!subInfo) {
        logger.warn(`[Auto-sync] No accepted submission found for slug "${slug}" — skipping`);
        continue;
      }

      const details = await fetchSubmissionDetails(leetcodeCookie, subInfo.submissionId);
      if (!details) {
        logger.warn(`[Auto-sync] fetchSubmissionDetails returned null for submission ${subInfo.submissionId} — skipping`);
        continue;
      }

      // Guard against missing questionId or title (would cause bad folder names)
      const questionId = details.questionId || 'unknown';
      const title      = details.title      || slug;

      const folderName = sanitizeFolderName(`${questionId} ${title}`);
      const ext        = getFileExtension(details.lang);
      const fileName   = `${questionId}-${slug}.${ext}`;
      const commitMsg  = `Add: ${questionId}. ${title}`;

      gitClient.commit(folderName, fileName, details.code, commitMsg, details.lastSubmittedAt);
      committedCount++;
      logger.info(`[Auto-sync] Committed: ${title}`);
    } catch (err) {
      // Log per-problem failures but continue with remaining problems
      logger.error(`[Auto-sync] Failed to process slug "${slug}": ${err.message}`);
    }
  }

  // ── Step 5: Regenerate README ──────────────────────────────────────────────
  try {
    const { scanRepo, generateReadme } = await import('./sync/readmeGenerator.js');
    const repoPath  = gitClient.getRepoPath();
    const ghRepoUrl = cfg.targetRepoUrl.replace(/\.git$/, '').replace(/\/\/[^@]+@/, '//');
    const entries   = scanRepo(repoPath);
    const readmeTxt = generateReadme(entries, ghRepoUrl);
    gitClient.commitReadme(readmeTxt);
  } catch (err) {
    logger.warn('[Auto-sync] README generation skipped:', { err: err.message });
  }

  // ── Step 6: Push ───────────────────────────────────────────────────────────
  // If nothing was actually committed (all slugs failed/skipped), skip the push
  // to avoid an empty `git push` that could still fail on auth issues.
  if (committedCount === 0) {
    logger.warn('[Auto-sync] No commits made — skipping push');
    // Clean up the cloned repo
    try {
      const repoPath = gitClient.getRepoPath();
      const { rmSync, existsSync } = await import('fs');
      if (existsSync(repoPath)) rmSync(repoPath, { recursive: true, force: true });
    } catch {}
    return { synced: 0 };
  }

  gitClient.push();

  // Update the lastSyncedSlugs with the newly synced slugs
  const existingSlugs = cfg.lastSyncedSlugs || [];
  const allSlugs = [...new Set([...existingSlugs, ...[...bySlug.keys()]])];

  return { synced: committedCount, updatedSlugs: allSlugs };
}

async function runAutoSync() {
  if (autoSyncState.running) return;
  autoSyncState.running = true;
  try {
    const cfg = await loadConfig();
    if (!cfg.leetcodeCookie || !cfg.githubToken || !cfg.targetRepoUrl) {
      logger.warn('[Auto-sync] Skipped — missing cookie, token, or repoUrl in config');
      return;
    }
    const result = await performIncrementalSync(cfg);
    autoSyncState.lastResult = result;

    // Only advance the lastAutoSyncAt window when something was actually synced.
    // If we update it on every trigger (including no-ops), future triggers compare
    // against "just now" and will never find anything.
    if (result.synced > 0) {
      const updates = { lastAutoSyncAt: new Date().toISOString() };
      if (result.updatedSlugs) updates.lastSyncedSlugs = result.updatedSlugs;
      await saveConfig(updates);
    }

    logger.info(`[Auto-sync] Done — ${result.synced} new submission(s) pushed`);
  } catch (err) {
    logger.error('[Auto-sync] Error:', { err: err.message });
    autoSyncState.lastResult = { error: err.message };
  } finally {
    autoSyncState.running   = false;
    autoSyncState.lastRunAt = new Date().toISOString();
  }
}

function resetAutoSyncTimer(intervalMinutes) {
  if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null; }
  if (intervalMinutes > 0) {
    autoSyncTimer = setInterval(runAutoSync, intervalMinutes * 60 * 1000);
  }
}

app.get('/api/sync/auto/status', async (req, res) => {
  const cfg      = await loadConfig().catch(() => ({}));
  const interval = cfg.autoSyncIntervalMinutes || 10;
  res.json({
    enabled:         !!cfg.autoSyncEnabled,
    intervalMinutes: interval,
    running:         autoSyncState.running,
    lastRunAt:       autoSyncState.lastRunAt,
    lastResult:      autoSyncState.lastResult,
    lastAutoSyncAt:  cfg.lastAutoSyncAt || null,
    nextRunAt: autoSyncTimer && autoSyncState.lastRunAt
      ? new Date(new Date(autoSyncState.lastRunAt).getTime() + interval * 60_000).toISOString()
      : null,
  });
});

app.post('/api/sync/auto/config', async (req, res) => {
  const { enabled, intervalMinutes = 10 } = req.body;
  try {
    const cfg = await loadConfig();
    cfg.autoSyncEnabled         = !!enabled;
    cfg.autoSyncIntervalMinutes = parseInt(intervalMinutes, 10);
    await saveConfig(cfg);
    resetAutoSyncTimer(enabled ? cfg.autoSyncIntervalMinutes : 0);
    res.json({ ok: true, enabled: cfg.autoSyncEnabled, intervalMinutes: cfg.autoSyncIntervalMinutes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync/auto/trigger', async (req, res) => {
  // Respond immediately — the actual sync runs async
  res.json({ ok: true, message: 'Auto-sync triggered' });
  runAutoSync().catch(err => logger.error('[Trigger] Auto-sync failed:', { err: err.message }));
});

// ── API: Reset last-sync timestamp (useful for testing / re-syncing) ─────────
// POST /api/sync/reset — clears lastAutoSyncAt so the next trigger re-checks
// all recent submissions from the beginning. Also clears lastSyncedSlugs.
app.post('/api/sync/reset', async (req, res) => {
  try {
    await saveConfig({
      lastAutoSyncAt:  null,
      lastSyncedSlugs: [],
      lastFullSyncAt:  null,
    });
    autoSyncState.lastRunAt  = null;
    autoSyncState.lastResult = null;
    res.json({ ok: true, message: 'Sync state reset — next trigger will re-check all recent submissions' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Sync debug — see exactly why a sync succeeded or failed ──────────────
// GET /api/sync/debug — returns the live autoSyncState plus key config flags
// (no credentials exposed). Use this to diagnose "syncs silently do nothing".
app.get('/api/sync/debug', async (req, res) => {
  try {
    const cfg = await loadConfig();
    res.json({
      autoSyncState,
      config: {
        hasLeetcodeCookie:   !!cfg.leetcodeCookie,
        leetcodeUsername:    cfg.leetcodeUsername    || null,
        hasGithubToken:      !!cfg.githubToken,
        githubUsername:      cfg.githubUsername      || null,
        targetRepoUrl:       cfg.targetRepoUrl       || null,
        autoSyncEnabled:     !!cfg.autoSyncEnabled,
        lastAutoSyncAt:      cfg.lastAutoSyncAt      || null,
        lastSyncedSlugCount: (cfg.lastSyncedSlugs || []).length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
// Must be LAST — send index.html for all non-API routes so React Router works.

app.get('*', (req, res) => {
  const index = path.join(FRONTEND_DIST, 'index.html');
  res.sendFile(index, err => {
    if (err) res.status(404).send('Not found');
  });
});

// ── Centralised error handler (must be after all routes) ─────────────────────
app.use(errorHandler);

// Export for use by server.js and tests
export {
  app, PORT, BACKEND_URL, FRONTEND_URL, CALLBACK_URL, resetAutoSyncTimer,
  normalizeLeetcodeCookie, extractCsrfToken, validateLeetcodeCookie,
  LC_ERROR,
};
export default app;
