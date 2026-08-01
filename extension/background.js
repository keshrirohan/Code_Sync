// ============================================================================
// background.js — MV3 Service Worker for CodeSync
//
// Responsibilities:
//  1. Listen for "Accepted" message from the content script
//     → trigger an immediate incremental sync on the server
//  2. Run a periodic alarm (every N minutes) as a backup trigger
//     so auto-sync works even when the popup is closed
// ============================================================================

const DASHBOARD = 'http://localhost:3055';

// ── Alarm-based periodic trigger ─────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'codesync-auto') return;
  const cfg = await chrome.storage.local.get(['autoSyncEnabled']);
  if (!cfg.autoSyncEnabled) return;
  triggerServerAutoSync('alarm');
});

// ── Messages from content script ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SUBMISSION_ACCEPTED') {
    // A new accepted submission was detected on LeetCode
    triggerServerAutoSync('extension', msg.titleSlug);
  }
  if (msg.type === 'SET_AUTO_SYNC') {
    setAutoSync(msg.enabled, msg.intervalMinutes);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function triggerServerAutoSync(source, titleSlug) {
  try {
    await fetch(`${DASHBOARD}/api/sync/auto/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, titleSlug: titleSlug || null }),
    });
    console.log(`[CodeSync] Auto-sync triggered (${source})${titleSlug ? ` for ${titleSlug}` : ''}`);
  } catch {
    // Dashboard not running — silently ignore
  }
}

async function setAutoSync(enabled, intervalMinutes = 10) {
  await chrome.storage.local.set({ autoSyncEnabled: enabled, autoSyncIntervalMinutes: intervalMinutes });

  // Clear existing alarm
  await chrome.alarms.clear('codesync-auto');

  if (enabled) {
    chrome.alarms.create('codesync-auto', {
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes,
    });
    console.log(`[CodeSync] Auto-sync alarm set: every ${intervalMinutes} min`);
  } else {
    console.log('[CodeSync] Auto-sync disabled');
  }
}

// ── On startup: restore alarm state ──────────────────────────────────────────

(async () => {
  const cfg = await chrome.storage.local.get(['autoSyncEnabled', 'autoSyncIntervalMinutes']);
  if (cfg.autoSyncEnabled) {
    const interval = cfg.autoSyncIntervalMinutes || 10;
    chrome.alarms.create('codesync-auto', {
      delayInMinutes: interval,
      periodInMinutes: interval,
    });
  }
})();
