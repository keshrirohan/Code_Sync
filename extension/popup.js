// ─── CodeSync Extension Popup ─────────────────────────────────────────────────

(async function () {
  "use strict";

  const DEFAULT_BASE_URL = "https://codesync-api-5p2c.onrender.com"; // backend API
  const DASHBOARD_URL    = "https://code-sync-3sld.onrender.com";    // frontend dashboard

  // ── DOM refs ────────────────────────────────────────────────────────────────

  const lcDot          = document.getElementById("lc-dot");
  const lcVal          = document.getElementById("lc-val");
  const dashDot        = document.getElementById("dash-dot");
  const dashVal        = document.getElementById("dash-val");
  const lastSyncBadge  = document.getElementById("last-sync-badge");

  const autosyncToggle = document.getElementById("autosync-toggle");
  const asSub          = document.getElementById("as-sub");
  const asPulse        = document.getElementById("as-pulse");
  // interval controls — wired to persist and send interval to background
  const intervalRow    = document.getElementById("interval-row");
  const intervalSelect = document.getElementById("interval-select");

  const syncNowBtn     = document.getElementById("sync-now-btn");
  const syncNowIcon    = document.getElementById("sync-now-icon");
  const syncNowLabel   = document.getElementById("sync-now-label");
  const openBtn        = document.getElementById("open-btn");
  const lcBtn          = document.getElementById("lc-btn");
  const cookieSection  = document.getElementById("cookie-section");
  const sendBtn        = document.getElementById("send-btn");
  const sendLabel      = document.getElementById("send-label");
  const toast          = document.getElementById("toast");
  const toastIcon      = document.getElementById("toast-icon");
  const toastMsg       = document.getElementById("toast-msg");

  // ── Helpers ─────────────────────────────────────────────────────────────────

  async function getBaseUrl() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ baseUrl: DEFAULT_BASE_URL }, (r) =>
        resolve((r.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, ''))
      );
    });
  }

  function showToast(msg, isSuccess = true) {
    toastIcon.textContent = isSuccess ? "✓" : "✕";
    toastMsg.textContent  = msg;
    toast.className       = `toast show ${isSuccess ? 'success' : 'error'}`;
    setTimeout(() => { toast.className = "toast"; }, 3000);
  }

  function setDot(el, valEl, status, text) {
    el.className    = `status-dot dot-${status === 'ok' ? 'ok' : status === 'err' ? 'err' : 'loading'}`;
    valEl.className = `status-val${status === 'ok' ? ' ok' : status === 'err' ? ' err' : ''}`;
    valEl.textContent = text;
  }

  // ── Auto-sync UI helpers ─────────────────────────────────────────────────────

  /**
   * renderAutoSyncUI — updates all auto-sync visual elements atomically.
   * @param {boolean} enabled
   * @param {number}  intervalMinutes
   */
  function renderAutoSyncUI(enabled, intervalMinutes) {
    if (autosyncToggle) autosyncToggle.checked = enabled;

    // Show / hide the interval selector row based on toggle state
    if (intervalRow) intervalRow.style.display = enabled ? 'flex' : 'none';

    // Set interval selector to the stored value (clamp to available options)
    if (intervalSelect) {
      const strVal = String(intervalMinutes);
      // Only set if the option actually exists — avoids blank selection
      if ([...intervalSelect.options].some(o => o.value === strVal)) {
        intervalSelect.value = strVal;
      }
    }

    // Animated pulse dot in the title
    if (asPulse) asPulse.className = enabled ? 'pulse-dot' : '';

    // Sub-label text
    if (asSub) {
      asSub.className   = enabled ? 'autosync-sub active' : 'autosync-sub';
      asSub.textContent = enabled
        ? `ON · auto-push on Accept + polls every ${intervalMinutes} min`
        : 'Push to GitHub the moment LeetCode says Accepted';
    }
  }

  // ── Navigation buttons ───────────────────────────────────────────────────────

  if (openBtn) openBtn.addEventListener("click", () => chrome.tabs.create({ url: DASHBOARD_URL }));
  if (lcBtn)   lcBtn.addEventListener("click",   () => chrome.tabs.create({ url: "https://leetcode.com" }));

  // ── Check Connection Status ──────────────────────────────────────────────────

  async function checkStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "CHECK_AUTH" });
      if (response?.success && response?.data) {
        const config = response.data;
        setDot(dashDot, dashVal, 'ok', 'Connected');
        if (syncNowBtn) syncNowBtn.disabled = false;

        if (config.hasLeetcodeCookie) {
          setDot(lcDot, lcVal, 'ok', config.leetcodeUsername ? `@${config.leetcodeUsername}` : 'Connected');
          if (cookieSection) cookieSection.style.display = "none";
        } else {
          setDot(lcDot, lcVal, 'err', 'Not connected');
          if (cookieSection) cookieSection.style.display = "block";
        }
      } else if (response?.backendOffline) {
        setDot(dashDot, dashVal, 'err', 'Backend offline');
        setDot(lcDot,   lcVal,   'err', 'Backend offline');
        if (syncNowBtn) syncNowBtn.disabled = true;
        if (cookieSection) cookieSection.style.display = "none";
      } else {
        setDot(dashDot, dashVal, 'err', response?.error || 'Error');
        setDot(lcDot,   lcVal,   'err', 'Unknown');
        if (syncNowBtn) syncNowBtn.disabled = true;
        if (cookieSection) cookieSection.style.display = "block";
      }
    } catch {
      setDot(dashDot, dashVal, 'err', 'Offline');
      setDot(lcDot,   lcVal,   'err', 'Unknown');
      if (syncNowBtn) syncNowBtn.disabled = true;
    }
  }

  // ── Load & wire Auto-sync controls ──────────────────────────────────────────

  // Load persisted values from local storage then render the UI
  try {
    const stored = await chrome.storage.local.get(['autoSyncEnabled', 'autoSyncIntervalMinutes']);
    const enabled  = stored.autoSyncEnabled !== false;        // default true
    const interval = stored.autoSyncIntervalMinutes  || 10;   // default 10 min
    renderAutoSyncUI(enabled, interval);
  } catch {
    renderAutoSyncUI(false, 10);
  }

  // Toggle: when the user flips the switch, persist + update the alarm
  if (autosyncToggle) {
    autosyncToggle.addEventListener("change", async () => {
      const enabled  = autosyncToggle.checked;
      const interval = intervalSelect ? parseInt(intervalSelect.value, 10) : 10;

      // Persist immediately so the service worker picks it up on next wake
      await chrome.storage.local.set({
        autoSyncEnabled:          enabled,
        autoSyncIntervalMinutes:  interval,
      });

      // Tell background.js to recreate (or clear) the alarm
      await chrome.runtime.sendMessage({ type: "SET_AUTO_SYNC", enabled, intervalMinutes: interval });

      renderAutoSyncUI(enabled, interval);
      showToast(enabled ? "Auto-sync enabled" : "Auto-sync disabled", true);
    });
  }

  // Interval selector: when the user picks a new interval, persist + update alarm
  // This only matters when the toggle is ON — the row is hidden when toggle is OFF
  if (intervalSelect) {
    intervalSelect.addEventListener("change", async () => {
      const interval = parseInt(intervalSelect.value, 10);
      const enabled  = autosyncToggle ? autosyncToggle.checked : true;

      if (!enabled) return; // selector is hidden, shouldn't be reachable, but guard anyway

      // Persist the new interval
      await chrome.storage.local.set({ autoSyncIntervalMinutes: interval });

      // Tell background.js to re-schedule the alarm with the new period
      await chrome.runtime.sendMessage({ type: "SET_AUTO_SYNC", enabled: true, intervalMinutes: interval });

      // Update sub-label to reflect new interval
      if (asSub) asSub.textContent = `ON · auto-push on Accept + polls every ${interval} min`;

      showToast(`Interval set to ${interval} min`, true);
    });
  }

  // ── Connect LeetCode (auto-capture via cookies) ──────────────────────────────

  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      sendBtn.disabled = true;
      if (sendLabel) sendLabel.textContent = "Capturing cookie...";
      try {
        const result = await chrome.runtime.sendMessage({ type: "CAPTURE_LEETCODE_COOKIE" });
        if (result?.success) {
          showToast(`Connected as ${result.username}!`, true);
          await checkStatus();
        } else {
          showToast(result?.error || "Cookie capture failed. Ensure you are logged in to leetcode.com", false);
        }
      } catch (err) {
        showToast(err.message || "Failed to capture cookie", false);
      } finally {
        sendBtn.disabled = false;
        if (sendLabel) sendLabel.textContent = "Connect LeetCode Account";
      }
    });
  }

  // ── Sync Now ─────────────────────────────────────────────────────────────────

  if (syncNowBtn) {
    syncNowBtn.addEventListener("click", async () => {
      syncNowBtn.disabled = true;
      if (syncNowIcon)  syncNowIcon.className   = "spinner";
      if (syncNowLabel) syncNowLabel.textContent = "Syncing...";
      try {
        const res = await chrome.runtime.sendMessage({ type: "TRIGGER_SYNC" });
        if (res?.success) {
          showToast("Sync triggered successfully!", true);
        } else {
          showToast(res?.data?.error || "Sync failed", false);
        }
      } catch (err) {
        showToast(err.message || "Sync failed", false);
      } finally {
        syncNowBtn.disabled = false;
        if (syncNowIcon) {
          syncNowIcon.className   = "";
          syncNowIcon.textContent = "🔄";
        }
        if (syncNowLabel) syncNowLabel.textContent = "Sync Now (only new problems)";
      }
    });
  }

  // ── Last sync badge ──────────────────────────────────────────────────────────

  try {
    const lastSync = await chrome.runtime.sendMessage({ type: "GET_LAST_SYNC" });
    if (lastSync?.repoName && lastSyncBadge) {
      lastSyncBadge.style.display = "inline-block";
      lastSyncBadge.textContent   = `🔄 ${lastSync.repoName}`;
    }
  } catch {}

  // ── Initial status check ─────────────────────────────────────────────────────

  await checkStatus();

})();
