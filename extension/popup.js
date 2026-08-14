// ─── CodeSync Extension Popup ─────────────────────────────────────────────────

(async function () {
  "use strict";

  const DEFAULT_BASE_URL = "http://localhost:3055";

  // DOM elements
  const lcDot          = document.getElementById("lc-dot");
  const lcVal          = document.getElementById("lc-val");
  const dashDot        = document.getElementById("dash-dot");
  const dashVal        = document.getElementById("dash-val");
  const lastSyncBadge  = document.getElementById("last-sync-badge");
  const autosyncToggle = document.getElementById("autosync-toggle");
  const asSub          = document.getElementById("as-sub");
  const asPulse        = document.getElementById("as-pulse");
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

  async function getBaseUrl() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ baseUrl: DEFAULT_BASE_URL }, (r) => resolve((r.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')));
    });
  }

  function showToast(msg, isSuccess = true) {
    toastIcon.textContent = isSuccess ? "✓" : "✕";
    toastMsg.textContent  = msg;
    toast.className       = `toast show ${isSuccess ? 'success' : 'error'}`;
    setTimeout(() => { toast.className = "toast"; }, 3000);
  }

  function setDot(el, valEl, status, text) {
    if (status === 'ok') {
      el.className = "status-dot dot-ok";
      valEl.className = "status-val ok";
    } else if (status === 'err') {
      el.className = "status-dot dot-err";
      valEl.className = "status-val err";
    } else {
      el.className = "status-dot dot-loading";
      valEl.className = "status-val";
    }
    valEl.textContent = text;
  }

  const baseUrl = await getBaseUrl();

  if (openBtn) openBtn.addEventListener("click", () => chrome.tabs.create({ url: baseUrl }));
  if (lcBtn)   lcBtn.addEventListener("click",   () => chrome.tabs.create({ url: "https://leetcode.com" }));

  // Check Connection Status
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
        // Backend is not running — show specific message
        setDot(dashDot, dashVal, 'err', 'Backend offline');
        setDot(lcDot,   lcVal,   'err', 'Backend offline');
        if (syncNowBtn) syncNowBtn.disabled = true;
        if (cookieSection) cookieSection.style.display = "none";
      } else {
        // Backend responded but with an error (e.g. MongoDB down)
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

  // Load Auto-sync setting
  try {
    const autoSyncResp = await chrome.runtime.sendMessage({ type: "GET_AUTO_SYNC" });
    if (autosyncToggle) {
      autosyncToggle.checked = autoSyncResp?.autoSync !== false;
      if (asSub) asSub.className = autosyncToggle.checked ? "autosync-sub active" : "autosync-sub";
      if (asPulse) asPulse.className = autosyncToggle.checked ? "pulse-dot" : "";
    }
  } catch {}

  if (autosyncToggle) {
    autosyncToggle.addEventListener("change", async () => {
      const enabled = autosyncToggle.checked;
      await chrome.runtime.sendMessage({ type: "SET_AUTO_SYNC", enabled });
      if (asSub) asSub.className = enabled ? "autosync-sub active" : "autosync-sub";
      if (asPulse) asPulse.className = enabled ? "pulse-dot" : "";
      showToast(enabled ? "Auto-sync enabled" : "Auto-sync disabled", true);
    });
  }

  // Connect LeetCode Button (Auto-capture)
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

  // Sync Now Button
  if (syncNowBtn) {
    syncNowBtn.addEventListener("click", async () => {
      syncNowBtn.disabled = true;
      if (syncNowIcon) syncNowIcon.className = "spinner";
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
          syncNowIcon.className = "";
          syncNowIcon.textContent = "🔄";
        }
        if (syncNowLabel) syncNowLabel.textContent = "Sync Now (only new problems)";
      }
    });
  }

  // Load last sync
  try {
    const lastSync = await chrome.runtime.sendMessage({ type: "GET_LAST_SYNC" });
    if (lastSync?.problemName && lastSyncBadge) {
      lastSyncBadge.style.display = "inline-block";
      lastSyncBadge.textContent = `Last: ${lastSync.problemName}`;
    }
  } catch {}

  await checkStatus();
})();
