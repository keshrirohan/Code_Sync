// ============================================================================
// background.js — MV3 Service Worker for CodeSync
// ============================================================================

const DEFAULT_SERVER = 'http://localhost:3055';
const FETCH_TIMEOUT_MS = 8000;

async function getServerUrl() {
  const cfg = await chrome.storage.sync.get({ baseUrl: DEFAULT_SERVER });
  return (cfg.baseUrl || DEFAULT_SERVER).replace(/\/$/, '');
}

/**
 * fetchWithTimeout — Wraps fetch with an AbortController timeout
 * to prevent indefinite hangs in the service worker.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function addLog(level, event, extra = {}) {
  const { debugLogs = [] } = await chrome.storage.local.get(['debugLogs']);
  debugLogs.unshift({
    ts: Date.now(),
    level,
    event,
    source: 'background',
    ...extra,
  });
  if (debugLogs.length > 100) debugLogs.length = 100;
  await chrome.storage.local.set({ debugLogs });
}

// ── Cookie Auto-Capture ───────────────────────────────────────────────────────

async function captureLeetCodeCookie() {
  try {
    const sessionCookie = await chrome.cookies.get({ url: 'https://leetcode.com', name: 'LEETCODE_SESSION' });
    const csrfCookie    = await chrome.cookies.get({ url: 'https://leetcode.com', name: 'csrftoken' });

    if (!sessionCookie || !sessionCookie.value) {
      return { success: false, error: 'LEETCODE_SESSION cookie not found. Make sure you are logged in to leetcode.com.' };
    }

    let cookieStr = `LEETCODE_SESSION=${sessionCookie.value}`;
    if (csrfCookie && csrfCookie.value) {
      cookieStr += `; csrftoken=${csrfCookie.value}`;
    }

    const serverUrl = await getServerUrl();
    const res = await fetchWithTimeout(`${serverUrl}/api/auth/leetcode-from-extension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: cookieStr }),
    });

    const data = await res.json();
    if (data.valid) {
      await addLog('info', 'Cookie captured & synced', { username: data.username });
      // Never return the raw cookie — only the success flag and username
      return { success: true, username: data.username };
    } else {
      await addLog('error', 'Cookie validation failed', { error: data.error });
      return { success: false, error: data.error || 'Cookie validation failed' };
    }
  } catch (err) {
    await addLog('error', 'Cookie capture exception', { error: err.message });
    const isTimeout = err.name === 'AbortError';
    const isNetworkError = err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || isTimeout;
    return {
      success: false,
      error: isNetworkError
        ? 'CodeSync backend is not running. Start it with: cd server && npm run dev'
        : err.message,
    };
  }
}

// ── Message Listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      const serverUrl = await getServerUrl();

      if (msg.type === 'CHECK_AUTH') {
        // First check if backend is reachable via lightweight health endpoint
        try {
          const healthRes = await fetchWithTimeout(`${serverUrl}/api/health`, {}, 3000);
          if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
        } catch (healthErr) {
          const isTimeout = healthErr.name === 'AbortError';
          sendResponse({
            success: false,
            error: isTimeout || healthErr.message.includes('Failed to fetch')
              ? 'CodeSync backend is not running. Start it with: cd server && npm run dev'
              : `Backend error: ${healthErr.message}`,
            backendOffline: true,
          });
          return;
        }

        const res = await fetchWithTimeout(`${serverUrl}/api/config`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        sendResponse({ success: true, data });
      }

      else if (msg.type === 'CAPTURE_LEETCODE_COOKIE') {
        const result = await captureLeetCodeCookie();
        sendResponse(result);
      }

      else if (msg.type === 'GET_SETTINGS') {
        const res = await fetchWithTimeout(`${serverUrl}/api/config`);
        const data = await res.json();
        sendResponse({ success: true, data });
      }

      else if (msg.type === 'GET_AUTO_SYNC') {
        const cfg = await chrome.storage.local.get(['autoSyncEnabled']);
        sendResponse({ autoSync: cfg.autoSyncEnabled !== false });
      }

      else if (msg.type === 'SET_AUTO_SYNC') {
        await setAutoSync(msg.enabled, msg.intervalMinutes);
        sendResponse({ success: true });
      }

      else if (msg.type === 'GET_LAST_SYNC') {
        const res = await fetchWithTimeout(`${serverUrl}/api/history`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const history = await res.json();
        const last = Array.isArray(history) && history.length > 0 ? history[0] : null;
        sendResponse(last || {});
      }

      else if (msg.type === 'GET_LOGS') {
        const { debugLogs = [] } = await chrome.storage.local.get(['debugLogs']);
        sendResponse({ logs: debugLogs });
      }

      else if (msg.type === 'CLEAR_LOGS') {
        await chrome.storage.local.set({ debugLogs: [] });
        sendResponse({ success: true });
      }

      else if (msg.type === 'TRIGGER_SYNC') {
        const res = await fetchWithTimeout(`${serverUrl}/api/sync/auto/trigger`, { method: 'POST' });
        const data = await res.json();
        sendResponse({ success: res.ok, data });
      }

      else if (msg.type === 'SUBMISSION_ACCEPTED') {
        await triggerServerAutoSync('extension', msg.titleSlug);
        sendResponse({ success: true });
      }
    } catch (err) {
      const isNetworkError = err.name === 'AbortError' || err.message.includes('Failed to fetch') || err.message.includes('NetworkError');
      sendResponse({
        success: false,
        error: isNetworkError
          ? 'CodeSync backend is not running. Start it with: cd server && npm run dev'
          : err.message,
        backendOffline: isNetworkError,
      });
    }
  })();
  return true;
});

// ── Alarm-based periodic trigger ─────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'codesync-auto') return;
  const cfg = await chrome.storage.local.get(['autoSyncEnabled']);
  if (cfg.autoSyncEnabled === false) return;
  triggerServerAutoSync('alarm');
});

async function triggerServerAutoSync(source, titleSlug) {
  try {
    const serverUrl = await getServerUrl();
    await fetchWithTimeout(`${serverUrl}/api/sync/auto/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, titleSlug: titleSlug || null }),
    });
    await addLog('info', `Auto-sync triggered (${source})`, { titleSlug });
  } catch (err) {
    await addLog('warn', 'Dashboard unreachable for auto-sync', { error: err.message });
  }
}

async function setAutoSync(enabled, intervalMinutes = 10) {
  await chrome.storage.local.set({ autoSyncEnabled: enabled, autoSyncIntervalMinutes: intervalMinutes });
  await chrome.alarms.clear('codesync-auto');

  if (enabled) {
    chrome.alarms.create('codesync-auto', {
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes,
    });
  }
}

// ── On startup: restore alarm state ──────────────────────────────────────────

(async () => {
  const cfg = await chrome.storage.local.get(['autoSyncEnabled', 'autoSyncIntervalMinutes']);
  if (cfg.autoSyncEnabled !== false) {
    const interval = cfg.autoSyncIntervalMinutes || 10;
    chrome.alarms.create('codesync-auto', {
      delayInMinutes: interval,
      periodInMinutes: interval,
    });
  }
})();
