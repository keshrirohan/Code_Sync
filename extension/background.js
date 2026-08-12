// ============================================================================
// background.js — MV3 Service Worker for CodeSync
// ============================================================================

const DEFAULT_SERVER = 'http://localhost:3055';

async function getServerUrl() {
  const cfg = await chrome.storage.sync.get({ baseUrl: DEFAULT_SERVER });
  return (cfg.baseUrl || DEFAULT_SERVER).replace(/\/$/, '');
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
    const res = await fetch(`${serverUrl}/api/auth/leetcode-from-extension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: cookieStr }),
    });

    const data = await res.json();
    if (data.valid) {
      await addLog('info', 'Cookie captured & synced', { username: data.username });
      return { success: true, username: data.username, cookie: cookieStr };
    } else {
      await addLog('error', 'Cookie validation failed', { error: data.error });
      return { success: false, error: data.error || 'Cookie validation failed' };
    }
  } catch (err) {
    await addLog('error', 'Cookie capture exception', { error: err.message });
    return { success: false, error: err.message };
  }
}

// ── Message Listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      const serverUrl = await getServerUrl();

      if (msg.type === 'CHECK_AUTH') {
        const res = await fetch(`${serverUrl}/api/config`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        sendResponse({ success: true, data });
      }

      else if (msg.type === 'CAPTURE_LEETCODE_COOKIE') {
        const result = await captureLeetCodeCookie();
        sendResponse(result);
      }

      else if (msg.type === 'GET_SETTINGS') {
        const res = await fetch(`${serverUrl}/api/config`);
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
        const res = await fetch(`${serverUrl}/api/sync/history`);
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
        const res = await fetch(`${serverUrl}/api/sync/trigger`, { method: 'POST' });
        const data = await res.json();
        sendResponse({ success: res.ok, data });
      }

      else if (msg.type === 'SUBMISSION_ACCEPTED') {
        await triggerServerAutoSync('extension', msg.titleSlug);
        sendResponse({ success: true });
      }
    } catch (err) {
      sendResponse({ success: false, error: err.message });
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
    await fetch(`${serverUrl}/api/sync/auto/trigger`, {
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
