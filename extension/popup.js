// ============================================================================
// popup.js — CodeSync Extension popup logic (v1.1 redesign)
//
// On open:
//  1. Check LeetCode login status via chrome.cookies
//  2. Check if CodeSync dashboard is running at localhost:3055
//  3. Load auto-sync state from chrome.storage
//  4. Fetch last-sync time from /api/sync/auto/status
// ============================================================================

const DASHBOARD = 'http://localhost:3055';
const el = (id) => document.getElementById(id);

// ── DOM refs ──────────────────────────────────────────────────────────────────

const lcDot        = el('lc-dot');
const lcVal        = el('lc-val');
const dashDot      = el('dash-dot');
const dashVal      = el('dash-val');
const lastSyncBadge= el('last-sync-badge');

const asPulse      = el('as-pulse');
const asSub        = el('as-sub');
const autoToggle   = el('autosync-toggle');
const intervalRow  = el('interval-row');
const intervalSel  = el('interval-select');

const syncNowBtn   = el('sync-now-btn');
const syncNowIcon  = el('sync-now-icon');
const syncNowLabel = el('sync-now-label');

const openBtn      = el('open-btn');
const lcBtn        = el('lc-btn');

const cookieSection= el('cookie-section');
const sendBtn      = el('send-btn');
const sendLabel    = el('send-label');

const toast        = el('toast');
const toastIcon    = el('toast-icon');
const toastMsg     = el('toast-msg');

let capturedCookie  = null;
let dashReachable   = false;
let syncNowRunning  = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function setDot(dotEl, state) {
  dotEl.className = 'status-dot';
  if (state === 'ok')  dotEl.classList.add('dot-ok');
  else if (state === 'err') dotEl.classList.add('dot-err');
  else dotEl.classList.add('dot-loading');
}

function showToast(type, msg) {
  toast.className = `toast show ${type}`;
  toastIcon.textContent = type === 'success' ? '✅' : '❌';
  toastMsg.textContent  = msg;
  setTimeout(() => toast.classList.remove('show'), 4000);
}

function timeAgo(isoStr) {
  if (!isoStr) return null;
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getCookie(name) {
  return new Promise(resolve => {
    chrome.cookies.get({ url: 'https://leetcode.com', name }, c => resolve(c?.value || null));
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  // 1. LeetCode login check
  const [session, csrf] = await Promise.all([
    getCookie('LEETCODE_SESSION'),
    getCookie('csrftoken'),
  ]);

  if (session && csrf) {
    capturedCookie = `LEETCODE_SESSION=${session}; csrftoken=${csrf}`;
    setDot(lcDot, 'ok');
    lcVal.textContent  = 'Logged in ✓';
    lcVal.className    = 'status-val ok';
    cookieSection.style.display = 'none';
  } else {
    setDot(lcDot, 'err');
    lcVal.textContent = session ? 'Missing csrftoken — re-login' : 'Not logged in to LeetCode';
    lcVal.className   = 'status-val err';
    cookieSection.style.display = 'block';
    sendBtn.disabled  = !session; // can only send if we at least have session
  }

  // 2. Dashboard reachability + config check
  try {
    const [cfgRes, autoRes] = await Promise.all([
      fetch(`${DASHBOARD}/api/config`,           { signal: AbortSignal.timeout(2500) }),
      fetch(`${DASHBOARD}/api/sync/auto/status`, { signal: AbortSignal.timeout(2500) }),
    ]);

    if (cfgRes.ok) {
      dashReachable = true;
      const cfg = await cfgRes.json();
      setDot(dashDot, 'ok');

      // Show connected username or generic "Running"
      const who = cfg.leetcodeUsername || (cfg.hasLeetcodeCookie ? 'Connected' : null);
      dashVal.textContent = who ? `Running · ${who}` : 'Running ✓';
      dashVal.className   = 'status-val ok';

      // Last sync badge
      if (autoRes.ok) {
        const auto = await autoRes.json();
        const ago  = timeAgo(auto.lastAutoSyncAt || auto.lastRunAt);
        if (ago) {
          lastSyncBadge.textContent  = `🔄 ${ago}`;
          lastSyncBadge.style.display = '';
        }
      }

      // Enable Sync Now
      if (cfg.hasLeetcodeCookie && cfg.hasGithubToken && cfg.targetRepoUrl) {
        syncNowBtn.disabled = false;
      } else {
        syncNowLabel.textContent = 'Sync Now (finish setup in Dashboard)';
      }

    } else {
      throw new Error();
    }
  } catch {
    setDot(dashDot, 'err');
    dashVal.textContent = 'Dashboard not running';
    dashVal.className   = 'status-val err';
  }

  // 3. Auto-sync state
  await loadAutoSyncState();
}

// ── Auto-sync ─────────────────────────────────────────────────────────────────

function renderAutoSyncUI(enabled, intervalMinutes) {
  autoToggle.checked = enabled;
  intervalRow.style.display = enabled ? 'flex' : 'none';

  if (enabled) {
    asPulse.innerHTML   = '<span class="pulse-dot"></span>';
    asSub.textContent   = `ON · instant on Accept + polls every ${intervalMinutes} min`;
    asSub.className     = 'autosync-sub active';
  } else {
    asPulse.innerHTML   = '';
    asSub.textContent   = 'Push to GitHub the moment LeetCode says Accepted';
    asSub.className     = 'autosync-sub';
  }
}

async function loadAutoSyncState() {
  const cfg      = await chrome.storage.local.get(['autoSyncEnabled', 'autoSyncIntervalMinutes']);
  const enabled  = cfg.autoSyncEnabled ?? false;
  const interval = cfg.autoSyncIntervalMinutes ?? 10;
  intervalSel.value = String(interval);
  renderAutoSyncUI(enabled, interval);
}

function applyAutoSyncChange(enabled, intervalMinutes) {
  renderAutoSyncUI(enabled, intervalMinutes);
  chrome.runtime.sendMessage({ type: 'SET_AUTO_SYNC', enabled, intervalMinutes });
  fetch(`${DASHBOARD}/api/sync/auto/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, intervalMinutes }),
  }).catch(() => {});
}

autoToggle.addEventListener('change', () => {
  applyAutoSyncChange(autoToggle.checked, parseInt(intervalSel.value, 10));
});
intervalSel.addEventListener('change', () => {
  if (!autoToggle.checked) return;
  applyAutoSyncChange(true, parseInt(intervalSel.value, 10));
});

// ── Sync Now ──────────────────────────────────────────────────────────────────

syncNowBtn.addEventListener('click', async () => {
  if (syncNowRunning || !dashReachable) return;
  syncNowRunning = true;
  syncNowIcon.innerHTML = '<span class="spinner"></span>';
  syncNowLabel.textContent = 'Checking for new problems...';
  syncNowBtn.disabled = true;

  try {
    const res  = await fetch(`${DASHBOARD}/api/sync/auto/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'extension-popup' }),
    });
    if (res.ok) {
      showToast('success', 'Sync started! New problems will be pushed.');
      syncNowIcon.textContent  = '✅';
      syncNowLabel.textContent = 'Sync triggered!';
    } else {
      throw new Error('Server error');
    }
  } catch {
    showToast('error', 'Could not reach dashboard. Is it running?');
    syncNowIcon.textContent  = '🔄';
    syncNowLabel.textContent = 'Sync Now (only new problems)';
  } finally {
    syncNowRunning = false;
    syncNowBtn.disabled = false;
  }
});

// ── Connect cookie ─────────────────────────────────────────────────────────────

sendBtn.addEventListener('click', async () => {
  if (!capturedCookie) return;
  sendBtn.disabled = true;
  sendLabel.textContent = 'Connecting...';

  try {
    const res  = await fetch(`${DASHBOARD}/api/auth/leetcode-from-extension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: capturedCookie }),
    });
    const data = await res.json();
    if (data.valid) {
      showToast('success', `Connected as ${data.username}!`);
      sendLabel.textContent = '✓ Connected!';
      cookieSection.style.display = 'none';
      lcVal.textContent = `${data.username} ✓`;
      lcVal.className   = 'status-val ok';
      setDot(lcDot, 'ok');
    } else {
      throw new Error(data.error || 'Cookie rejected');
    }
  } catch (err) {
    showToast('error', err.message);
    sendBtn.disabled = false;
    sendLabel.textContent = 'Connect LeetCode Account';
  }
});

// ── Nav buttons ────────────────────────────────────────────────────────────────

openBtn.addEventListener('click', () => chrome.tabs.create({ url: DASHBOARD }));
lcBtn.addEventListener('click',   () => chrome.tabs.create({ url: 'https://leetcode.com' }));

// ── Start ─────────────────────────────────────────────────────────────────────

init();
