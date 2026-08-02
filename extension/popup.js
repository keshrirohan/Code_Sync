// ─── CodeSync Popup ───────────────────────────────────────────────────────────

(async function () {
  "use strict";

  const DEFAULT_BASE_URL = "http://localhost:3000";

  // ─── DOM refs ──────────────────────────────────────────────────────────

  const statusBadge      = document.getElementById("status-badge");
  const statusText       = document.getElementById("status-text");
  const userSection      = document.getElementById("user-section");
  const userAvatar       = document.getElementById("user-avatar");
  const userName         = document.getElementById("user-name");
  const userGithub       = document.getElementById("user-github");
  const authPrompt       = document.getElementById("auth-prompt");
  const signinBtn        = document.getElementById("signin-btn");
  const lastSyncSection  = document.getElementById("last-sync-section");
  const syncStatusTag    = document.getElementById("sync-status-tag");
  const syncProblemName  = document.getElementById("sync-problem-name");
  const syncDifficulty   = document.getElementById("sync-difficulty");
  const syncLanguage     = document.getElementById("sync-language");
  const syncTime         = document.getElementById("sync-time");
  const syncCommitLink   = document.getElementById("sync-commit-link");
  const controlsSection  = document.getElementById("controls-section");
  const autoSyncToggle   = document.getElementById("auto-sync-toggle");
  const linksSection     = document.getElementById("links-section");
  const dashboardLink    = document.getElementById("dashboard-link");
  const settingsLink     = document.getElementById("settings-link");
  const historyLink      = document.getElementById("history-link");
  const serverUrlInput   = document.getElementById("server-url-input");
  const saveUrlBtn       = document.getElementById("save-url-btn");
  const noRepoWarning      = document.getElementById("no-repo-warning");
  const noRepoSettingsLink = document.getElementById("no-repo-settings-link");
  const debugErrorDot    = document.getElementById("debug-error-dot");
  const debugLogList     = document.getElementById("debug-log-list");
  const debugCount       = document.getElementById("debug-count");
  const debugWebLink     = document.getElementById("debug-web-link");

  // ─── Helpers ───────────────────────────────────────────────────────────

  async function getBaseUrl() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ baseUrl: DEFAULT_BASE_URL }, (r) => resolve(r.baseUrl));
    });
  }

  function timeAgo(timestamp) {
    const s = Math.floor((Date.now() - timestamp) / 1000);
    if (s < 60)   return "Just now";
    const m = Math.floor(s / 60);
    if (m < 60)   return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)   return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function setStatus(state, text) {
    statusBadge.className = `status-badge status-${state}`;
    statusText.textContent = text;
  }

  // ─── Set up links ──────────────────────────────────────────────────────

  const baseUrl = await getBaseUrl();
  signinBtn.href        = baseUrl;
  dashboardLink.href    = `${baseUrl}/dashboard`;
  settingsLink.href     = `${baseUrl}/dashboard/settings`;
  historyLink.href      = `${baseUrl}/dashboard/history`;
  debugWebLink.href     = `${baseUrl}/dashboard/debug`;
  serverUrlInput.value  = baseUrl;

  // ─── Tab switching ─────────────────────────────────────────────────────

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab; 
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("tab-active"));
      btn.classList.add("tab-active");
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));
      document.getElementById(`tab-${tab}`).classList.remove("hidden");
      if (tab === "debug") loadDebugLogs();
    });
  });

  // ─── Auth check ────────────────────────────────────────────────────────

  try {
    const authResponse = await chrome.runtime.sendMessage({ type: "CHECK_AUTH" });

    if (authResponse?.success && authResponse?.data) {
      const user = authResponse.data;
      setStatus("connected", "Connected");

      userSection.classList.remove("hidden");
      userName.textContent   = user.name || user.email || "User";
      userGithub.textContent = user.githubUsername ? `@${user.githubUsername}` : user.email || "";
      userAvatar.src = user.image ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || "U")}&background=6366f1&color=fff&size=72`;

      controlsSection.classList.remove("hidden");
      linksSection.classList.remove("hidden");

      // ── Check repo is configured and show warning if not ──────────────
      try {
        const settingsResp = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
        const selectedRepo = settingsResp?.data?.selectedRepoFullName;
        noRepoSettingsLink.href = `${baseUrl}/dashboard/settings`;
        if (!selectedRepo) {
          noRepoWarning.classList.remove("hidden");
        } else {
          noRepoWarning.classList.add("hidden");
        }
      } catch { /* non-fatal */ }

      const syncState = await chrome.runtime.sendMessage({ type: "GET_AUTO_SYNC" });
      autoSyncToggle.checked = syncState?.autoSync !== false;

      await loadLastSync();
    } else {
      setStatus("disconnected", "Not connected");
      authPrompt.classList.remove("hidden");
    }
  } catch (err) {
    console.error("Popup auth check failed:", err);
    setStatus("disconnected", "Error");
    authPrompt.classList.remove("hidden");
  }

  // ─── Last sync card ────────────────────────────────────────────────────

  async function loadLastSync() {
    try {
      const lastSync = await chrome.runtime.sendMessage({ type: "GET_LAST_SYNC" });
      if (!lastSync?.problemName) return;

      lastSyncSection.classList.remove("hidden");
      syncProblemName.textContent = lastSync.problemName;

      const status = (lastSync.status || "SUCCESS").toUpperCase();
      syncStatusTag.textContent = status;
      syncStatusTag.className   = `tag tag-${status.toLowerCase()}`;

      const diff = lastSync.difficulty || "Unknown";
      syncDifficulty.textContent = diff;
      syncDifficulty.className   = `difficulty-tag difficulty-${diff.toLowerCase()}`;

      syncLanguage.textContent = (lastSync.language || "").toUpperCase();
      syncTime.textContent     = lastSync.timestamp ? timeAgo(lastSync.timestamp) : "";

      if (lastSync.commitUrl && status === "SUCCESS") {
        syncCommitLink.href = lastSync.commitUrl;
        syncCommitLink.classList.remove("hidden");
      } else {
        syncCommitLink.classList.add("hidden");
      }
    } catch (err) {
      console.error("loadLastSync error:", err);
    }
  }

  // ─── Auto-sync toggle ──────────────────────────────────────────────────

  autoSyncToggle.addEventListener("change", async () => {
    await chrome.runtime.sendMessage({ type: "SET_AUTO_SYNC", enabled: autoSyncToggle.checked });
  });

  // ─── Server URL save ───────────────────────────────────────────────────

  saveUrlBtn.addEventListener("click", async () => {
    const newUrl = serverUrlInput.value.trim().replace(/\/$/, "");
    if (!newUrl) return;
    await chrome.storage.sync.set({ baseUrl: newUrl });

    signinBtn.href     = newUrl;
    dashboardLink.href = `${newUrl}/dashboard`;
    settingsLink.href  = `${newUrl}/dashboard/settings`;
    historyLink.href   = `${newUrl}/dashboard/history`;
    debugWebLink.href  = `${newUrl}/dashboard/debug`;

    saveUrlBtn.textContent = "Saved ✓";
    saveUrlBtn.classList.add("saved");
    setTimeout(() => {
      saveUrlBtn.textContent = "Save";
      saveUrlBtn.classList.remove("saved");
    }, 2000);
  });

  // ─── Debug tab ─────────────────────────────────────────────────────────

  let activeFilter = "ALL";
  let allLogs = [];

  async function loadDebugLogs() {
    const resp = await chrome.runtime.sendMessage({ type: "GET_LOGS" });
    allLogs = resp?.logs ?? [];
    renderLogs();

    // Red dot on tab if any errors
    const hasErrors = allLogs.some((l) => l.level === "error");
    debugErrorDot.classList.toggle("hidden", !hasErrors);
  }

  function renderLogs() {
    const filtered = activeFilter === "ALL"
      ? allLogs
      : allLogs.filter((l) => l.level === activeFilter);

    debugCount.textContent = `${filtered.length} entr${filtered.length === 1 ? "y" : "ies"}`;

    if (filtered.length === 0) {
      debugLogList.innerHTML = '<div class="debug-empty">No log entries match this filter.</div>';
      return;
    }

    debugLogList.innerHTML = filtered.map((entry) => {
      const levelClass = `log-${entry.level}`;
      const source     = entry.source === "background" ? "bg" : entry.source === "content" ? "cs" : "??";
      const ts         = new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      // Extra detail line
      let detail = "";
      if (entry.problem) detail += entry.problem;
      if (entry.language) detail += detail ? ` · ${entry.language}` : entry.language;
      if (entry.error) detail += `\n${entry.error}`;

      return `
        <div class="log-row ${levelClass}">
          <div class="log-header">
            <span class="log-badge log-badge-${entry.level}">${entry.level.toUpperCase()}</span>
            <span class="log-source">[${source}]</span>
            <span class="log-event">${entry.event}</span>
            <span class="log-ts">${ts}</span>
          </div>
          ${detail ? `<div class="log-detail">${detail.replace(/\n/g, "<br>")}</div>` : ""}
        </div>
      `;
    }).join("");
  }

  // Filter buttons
  document.querySelectorAll(".debug-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll(".debug-filter-btn").forEach((b) => b.classList.remove("debug-filter-active"));
      btn.classList.add("debug-filter-active");
      renderLogs();
    });
  });

  // Refresh
  document.getElementById("debug-refresh-btn").addEventListener("click", loadDebugLogs);

  // Copy JSON
  document.getElementById("debug-copy-btn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(allLogs, null, 2));
    const btn = document.getElementById("debug-copy-btn");
    btn.textContent = "Copied ✓";
    setTimeout(() => { btn.innerHTML = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`; }, 2000);
  });

  // Clear
  document.getElementById("debug-clear-btn").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "CLEAR_LOGS" });
    allLogs = [];
    renderLogs();
    debugErrorDot.classList.add("hidden");
  });

  // Load logs on open if debug tab is already active somehow
  if (!document.getElementById("tab-debug").classList.contains("hidden")) {
    loadDebugLogs();
  }

})();
