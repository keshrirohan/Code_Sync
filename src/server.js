// ============================================================================
// server.js — Express server for the CodeSync web dashboard.
//
// Serves the React frontend (frontend/dist) and provides:
//   REST API  — auth, repo listing, sync control, history
//   SSE stream — live sync progress via /api/sync/:id/stream
//
// Run with: node src/server.js  (or npm run dashboard)
// Dashboard opens at: http://localhost:3055
// ============================================================================

import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import crypto from 'crypto';
import {
  loadConfig, saveConfig,
  loadHistory, addHistoryEntry, deleteHistoryEntry,
} from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = 3055;

// In-memory job store — Map<jobId, { status, logs, sseClients, startedAt }>
const jobs = new Map();

// In-memory OAuth state store — Map<state, { createdAt }> (CSRF protection)
const oauthStates = new Map();
const CALLBACK_URL = `http://localhost:${3055}/api/auth/github/callback`;

// Purge states older than 10 minutes every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of oauthStates) {
    if (v.createdAt < cutoff) oauthStates.delete(k);
  }
}, 5 * 60 * 1000);

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());

// CORS — allows the Chrome extension to call the local server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Static frontend ──────────────────────────────────────────────────────────

const FRONTEND_DIST = path.join(__dirname, '../frontend/dist');
app.use(express.static(FRONTEND_DIST));

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractCsrfToken(cookie) {
  const match = cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1].trim() : '';
}

async function validateLeetcodeCookie(cookie) {
  const res = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      'x-csrftoken': extractCsrfToken(cookie),
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://leetcode.com',
      Origin:  'https://leetcode.com',
    },
    body: JSON.stringify({ query: 'query { userStatus { username isSignedIn } }' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.data?.userStatus;
}


// ── API: Config ──────────────────────────────────────────────────────────────

app.get('/api/config', async (req, res) => {
  try {
    const cfg = await loadConfig();
    // Never send raw credentials — only presence flags and safe values
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
    res.status(500).json({ error: err.message });
  }
});

// ── API: LeetCode Auth ───────────────────────────────────────────────────────

async function handleLeetcodeAuth(req, res) {
  const { cookie } = req.body;
  if (!cookie) return res.status(400).json({ error: 'Cookie is required' });
  try {
    const userStatus = await validateLeetcodeCookie(cookie);
    if (!userStatus?.isSignedIn)
      return res.status(401).json({ valid: false, error: 'Invalid or expired cookie' });

    const cfg = await loadConfig();
    cfg.leetcodeCookie  = cookie;
    cfg.leetcodeUsername = userStatus.username;
    await saveConfig(cfg);

    res.json({ valid: true, username: userStatus.username });
  } catch (err) {
    res.status(500).json({ valid: false, error: err.message });
  }
}

app.post('/api/auth/leetcode',                handleLeetcodeAuth);
app.post('/api/auth/leetcode-from-extension', handleLeetcodeAuth); // called by the extension

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

// ── API: GitHub Auth ─────────────────────────────────────────────────────────

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
// These routes implement the GitHub OAuth Web Application Flow.
// Users register a GitHub OAuth App once, enter the Client ID + Secret in the
// dashboard, and after that just click "Sign in with GitHub".

// GET /api/auth/github/oauth-status — is OAuth configured? is user connected?
app.get('/api/auth/github/oauth-status', async (req, res) => {
  try {
    const cfg = await loadConfig();
    res.json({
      configured: !!(cfg.githubOAuthClientId && cfg.githubOAuthClientSecret),
      connected:  !!cfg.githubToken,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/github/oauth-setup — save Client ID + Secret entered by user
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

// GET /api/auth/github/login — redirect to GitHub's OAuth consent screen
app.get('/api/auth/github/login', async (req, res) => {
  try {
    const cfg = await loadConfig();
    if (!cfg.githubOAuthClientId || !cfg.githubOAuthClientSecret)
      return res.status(400).send('GitHub OAuth is not configured. Set up Client ID + Secret first.');

    const state = crypto.randomUUID();
    oauthStates.set(state, { createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id:    cfg.githubOAuthClientId,
      redirect_uri: CALLBACK_URL,
      scope:        'repo',
      state,
    });

    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /api/auth/github/callback — GitHub redirects here after user approves
app.get('/api/auth/github/callback', async (req, res) => {
  const { code, state, error: ghError } = req.query;

  // GitHub sent an error (e.g. user clicked Cancel)
  if (ghError) return res.redirect(`/?gh_error=${encodeURIComponent(ghError)}`);

  // CSRF check
  if (!state || !oauthStates.has(state))
    return res.redirect('/?gh_error=invalid_state');
  oauthStates.delete(state);

  try {
    const cfg = await loadConfig();

    // Exchange the temporary code for an access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id:     cfg.githubOAuthClientId,
        client_secret: cfg.githubOAuthClientSecret,
        code,
        redirect_uri: CALLBACK_URL,
      }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error)
      throw new Error(tokenData.error_description || tokenData.error);

    const accessToken = tokenData.access_token;

    // Fetch the user's profile
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!userRes.ok) throw new Error('Failed to fetch GitHub user info');
    const user = await userRes.json();

    // Persist the token and user info
    cfg.githubToken    = accessToken;
    cfg.githubUsername = user.login;
    cfg.githubAvatar   = user.avatar_url;
    await saveConfig(cfg);

    // Redirect back to the dashboard — the ?gh_connected param triggers a
    // success toast and auto-navigation to the Repository page
    res.redirect('/?gh_connected=1');
  } catch (err) {
    res.redirect(`/?gh_error=${encodeURIComponent(err.message)}`);
  }
});

// ── API: Repositories ────────────────────────────────────────────────────────


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
      repos.push(
        ...batch.map(repo => ({
          name:        repo.full_name,
          url:         repo.clone_url,
          private:     repo.private,
          description: repo.description || '',
          updatedAt:   repo.updated_at,
          stars:       repo.stargazers_count,
        }))
      );
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

// ── Auto-sync: server-side infrastructure ────────────────────────────────────

let autoSyncTimer   = null;
const autoSyncState = { running: false, lastRunAt: null, lastResult: null };

function buildLCHeaders(cookie) {
  const m = cookie.match(/csrftoken=([^;]+)/);
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
  const since = lastAutoSyncAt
    ? Math.floor(new Date(lastAutoSyncAt).getTime() / 1000)
    : 0;

  // 1. Get recent accepted submissions
  const r = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: buildLCHeaders(leetcodeCookie),
    body: JSON.stringify({
      query: `query($u:String!,$l:Int!){recentAcSubmissionList(username:$u,limit:$l){id title titleSlug timestamp}}`,
      variables: { u: leetcodeUsername, l: 20 },
    }),
  });
  const data = await r.json();
  const recent = data.data?.recentAcSubmissionList ?? [];

  // 2. Filter to only submissions newer than last sync
  const newSubs = recent.filter(s => parseInt(s.timestamp) > since);
  if (newSubs.length === 0) return { synced: 0 };

  // Deduplicate by titleSlug (keep first/most-recent per problem)
  const bySlug = new Map();
  for (const s of newSubs) if (!bySlug.has(s.titleSlug)) bySlug.set(s.titleSlug, s);

  // 3. Import leetcode helpers (dynamic import to avoid top-level cycle issues)
  const { fetchLatestSubmissionId, fetchSubmissionDetails } = await import('./leetcodeClient.js');
  const gitClient = await import('./gitClient.js');
  const { getFileExtension, sanitizeFolderName } = await import('./handler.js');

  // 4. Clone repo
  gitClient.init(targetRepoUrl, githubToken);

  // 5. For each new problem, commit
  for (const [slug] of bySlug) {
    const subInfo = await fetchLatestSubmissionId(leetcodeCookie, slug);
    if (!subInfo) continue;
    const details = await fetchSubmissionDetails(leetcodeCookie, subInfo.submissionId);
    const folderName  = sanitizeFolderName(`${details.questionId} ${details.title}`);
    const ext         = getFileExtension(details.lang);
    const fileName    = `${details.questionId}-${slug}.${ext}`;
    const commitMsg   = `Add: ${details.questionId}. ${details.title}`;
    gitClient.commit(folderName, fileName, details.code, commitMsg, details.lastSubmittedAt);
  }

  // 6. Regenerate README.md
  try {
    const { scanRepo, generateReadme } = await import('./readmeGenerator.js');
    const repoPath  = gitClient.getRepoPath();
    const ghRepoUrl = cfg.targetRepoUrl.replace(/\.git$/, '').replace(/\/\/[^@]+@/, '//');
    const entries   = scanRepo(repoPath);
    const readmeTxt = generateReadme(entries, ghRepoUrl);
    gitClient.commitReadme(readmeTxt);
  } catch (err) {
    console.warn('[Auto-sync] README generation skipped:', err.message);
  }

  // 7. Push once
  gitClient.push();

  return { synced: bySlug.size };
}

async function runAutoSync(titleSlug) {
  if (autoSyncState.running) return;
  autoSyncState.running = true;
  try {
    const cfg = await loadConfig();
    if (!cfg.leetcodeCookie || !cfg.githubToken || !cfg.targetRepoUrl) return;
    const result = await performIncrementalSync(cfg);
    cfg.lastAutoSyncAt = new Date().toISOString();
    await saveConfig(cfg);
    autoSyncState.lastResult = result;
    console.log(`[Auto-sync] Done — ${result.synced} new submission(s) pushed`);
  } catch (err) {
    console.error('[Auto-sync] Error:', err.message);
    autoSyncState.lastResult = { error: err.message };
  } finally {
    autoSyncState.running  = false;
    autoSyncState.lastRunAt = new Date().toISOString();
  }
}

function resetAutoSyncTimer(intervalMinutes) {
  if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null; }
  if (intervalMinutes > 0) {
    autoSyncTimer = setInterval(runAutoSync, intervalMinutes * 60 * 1000);
  }
}

// Restore auto-sync on server start
(async () => {
  try {
    const cfg = await loadConfig();
    if (cfg.autoSyncEnabled && cfg.autoSyncIntervalMinutes) {
      resetAutoSyncTimer(cfg.autoSyncIntervalMinutes);
      console.log(`[Auto-sync] Restored: every ${cfg.autoSyncIntervalMinutes} min`);
    }
  } catch {}
})();

// GET /api/sync/auto/status
app.get('/api/sync/auto/status', async (req, res) => {
  const cfg = await loadConfig().catch(() => ({}));
  const interval = cfg.autoSyncIntervalMinutes || 10;
  res.json({
    enabled:          !!cfg.autoSyncEnabled,
    intervalMinutes:  interval,
    running:          autoSyncState.running,
    lastRunAt:        autoSyncState.lastRunAt,
    lastResult:       autoSyncState.lastResult,
    lastAutoSyncAt:   cfg.lastAutoSyncAt || null,
    nextRunAt: autoSyncTimer && autoSyncState.lastRunAt
      ? new Date(new Date(autoSyncState.lastRunAt).getTime() + interval * 60_000).toISOString()
      : null,
  });
});

// POST /api/sync/auto/config  { enabled, intervalMinutes }
app.post('/api/sync/auto/config', async (req, res) => {
  const { enabled, intervalMinutes = 10 } = req.body;
  try {
    const cfg = await loadConfig();
    cfg.autoSyncEnabled        = !!enabled;
    cfg.autoSyncIntervalMinutes = Number(intervalMinutes);
    await saveConfig(cfg);
    resetAutoSyncTimer(enabled ? cfg.autoSyncIntervalMinutes : 0);
    res.json({ ok: true, enabled: cfg.autoSyncEnabled, intervalMinutes: cfg.autoSyncIntervalMinutes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/auto/trigger  — called by the extension when "Accepted" detected
app.post('/api/sync/auto/trigger', async (req, res) => {
  const { source = 'unknown', titleSlug } = req.body || {};
  console.log(`[Auto-sync] Trigger received from: ${source}${titleSlug ? ` (${titleSlug})` : ''}`);
  // Run in background — don't await
  runAutoSync(titleSlug);
  res.json({ ok: true, message: 'Auto-sync triggered' });
});

// ── API: Sync ────────────────────────────────────────────────────────────────

app.post('/api/sync/start', async (req, res) => {
  try {
    const cfg = await loadConfig();
    const { dryRun = false } = req.body;

    if (!cfg.leetcodeCookie) return res.status(400).json({ error: 'LeetCode not connected' });
    if (!cfg.githubToken)    return res.status(400).json({ error: 'GitHub not connected' });
    if (!cfg.targetRepoUrl)  return res.status(400).json({ error: 'No repository selected' });

    // Embed PAT in HTTPS URL so git push never prompts for credentials
    let repoUrl = cfg.targetRepoUrl;
    if (cfg.githubToken && repoUrl.startsWith('https://')) {
      try {
        const u = new URL(repoUrl);
        u.username = cfg.githubToken;
        repoUrl = u.toString();
      } catch { /* SSH URL — leave as-is */ }
    }

    const jobId = crypto.randomUUID();
    jobs.set(jobId, {
      status:    'running',
      logs:      [],
      sseClients: new Set(),
      startedAt: new Date().toISOString(),
    });

    // Respond immediately so the client can open the SSE stream
    res.json({ jobId });

    // Run the CLI as a subprocess — never blocks the event loop
    (async () => {
      const job = jobs.get(jobId);

      function emit(event) {
        job.logs.push(event);
        for (const client of job.sseClients) {
          client.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      }

      const indexPath = path.join(__dirname, 'index.js');
      const args = ['--cookie', cfg.leetcodeCookie, '--repo-url', repoUrl];
      if (dryRun) args.push('--dry-run');

      const child = spawn(process.execPath, [indexPath, ...args], {
        cwd: path.join(__dirname, '..'), // project root
        env: process.env,
      });

      child.stdout.on('data', data => emit({ type: 'log', message: data.toString() }));
      child.stderr.on('data', data => emit({ type: 'log', message: data.toString(), isError: true }));

      child.on('close', async code => {
        const success = code === 0;
        job.status = success ? 'success' : 'error';

        const finalEvent = { type: 'complete', success };
        emit(finalEvent);
        for (const client of job.sseClients) client.end();

        await addHistoryEntry({
          id:          jobId,
          startedAt:   job.startedAt,
          completedAt: new Date().toISOString(),
          repoUrl:     cfg.targetRepoUrl,
          repoName:    cfg.targetRepoName,
          status:      success ? 'success' : 'error',
          dryRun,
        });
      });
    })();

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SSE stream — live progress for a running sync job
app.get('/api/sync/:jobId/stream', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Replay buffered logs so a reconnecting client catches up
  for (const log of job.logs) {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  }

  if (job.status !== 'running') { res.end(); return; }

  job.sseClients.add(res);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    job.sseClients.delete(res);
  });
});

// ── API: History ─────────────────────────────────────────────────────────────

app.get('/api/history', async (req, res) => {
  try { res.json(await loadHistory()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/history/:id', async (req, res) => {
  try { await deleteHistoryEntry(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SPA fallback ─────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  const indexPath = path.join(FRONTEND_DIST, 'index.html');
  res.sendFile(indexPath, err => {
    if (err) res.status(404).send(
      '⚠️  Frontend not built yet.\n' +
      'Run: npm run build:frontend\n' +
      'Then restart the server.'
    );
  });
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 CodeSync Dashboard → \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`   Press Ctrl+C to stop.\n`);
});
