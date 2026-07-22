// ─── CodeSync Popup Logic ─────────────────────────────────────────────────────
// Runs when the user clicks the extension icon.
// Fetches auth status, displays user info, last sync, and controls.
// ──────────────────────────────────────────────────────────────────────────────

(async function () {
  "use strict";

  const DEFAULT_BASE_URL = "http://localhost:3000";

  // ─── DOM References ────────────────────────────────────────────────────

  const statusBadge = document.getElementById("status-badge");
  const statusText = document.getElementById("status-text");
  const userSection = document.getElementById("user-section");
  const userAvatar = document.getElementById("user-avatar");
  const userName = document.getElementById("user-name");
  const userGithub = document.getElementById("user-github");
  const authPrompt = document.getElementById("auth-prompt");
  const signinBtn = document.getElementById("signin-btn");
  const lastSyncSection = document.getElementById("last-sync-section");
  const syncStatusTag = document.getElementById("sync-status-tag");
  const syncProblemName = document.getElementById("sync-problem-name");
  const syncDifficulty = document.getElementById("sync-difficulty");
  const syncLanguage = document.getElementById("sync-language");
  const syncTime = document.getElementById("sync-time");
  const syncCommitLink = document.getElementById("sync-commit-link");
  const controlsSection = document.getElementById("controls-section");
  const autoSyncToggle = document.getElementById("auto-sync-toggle");
  const linksSection = document.getElementById("links-section");
  const dashboardLink = document.getElementById("dashboard-link");
  const settingsLink = document.getElementById("settings-link");
  const historyLink = document.getElementById("history-link");

  // ─── Helpers ───────────────────────────────────────────────────────────

  async function getBaseUrl() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ baseUrl: DEFAULT_BASE_URL }, (result) => {
        resolve(result.baseUrl);
      });
    });
  }

  function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function setStatus(state, text) {
    statusBadge.className = `status-badge status-${state}`;
    statusText.textContent = text;
  }

  // ─── Setup Links ───────────────────────────────────────────────────────

  const baseUrl = await getBaseUrl();
  signinBtn.href = baseUrl;
  dashboardLink.href = `${baseUrl}/dashboard`;
  settingsLink.href = `${baseUrl}/dashboard/settings`;
  historyLink.href = `${baseUrl}/dashboard/history`;

  // ─── Check Authentication ──────────────────────────────────────────────

  try {
    const authResponse = await chrome.runtime.sendMessage({ type: "CHECK_AUTH" });

    if (authResponse?.success && authResponse?.data) {
      const user = authResponse.data;

      // Show connected state
      setStatus("connected", "Connected");

      // Populate user info
      userSection.classList.remove("hidden");
      userName.textContent = user.name || user.email || "User";
      userGithub.textContent = user.githubUsername
        ? `@${user.githubUsername}`
        : user.email || "";

      if (user.image) {
        userAvatar.src = user.image;
      } else {
        // Generate a placeholder avatar
        userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
          user.name || "U"
        )}&background=6366f1&color=fff&size=72`;
      }

      // Show controls and links
      controlsSection.classList.remove("hidden");
      linksSection.classList.remove("hidden");

      // Load auto-sync state
      const syncState = await chrome.runtime.sendMessage({
        type: "GET_AUTO_SYNC",
      });
      autoSyncToggle.checked = syncState?.autoSync !== false;

      // Load last sync
      await loadLastSync();
    } else {
      // Not authenticated
      setStatus("disconnected", "Not connected");
      authPrompt.classList.remove("hidden");
    }
  } catch (error) {
    console.error("CodeSync Popup: Auth check failed", error);
    setStatus("disconnected", "Error");
    authPrompt.classList.remove("hidden");
  }

  // ─── Load Last Sync ────────────────────────────────────────────────────

  async function loadLastSync() {
    try {
      const lastSync = await chrome.runtime.sendMessage({
        type: "GET_LAST_SYNC",
      });

      if (lastSync && lastSync.problemName) {
        lastSyncSection.classList.remove("hidden");

        // Problem name
        syncProblemName.textContent = lastSync.problemName;

        // Status tag
        const status = (lastSync.status || "SUCCESS").toUpperCase();
        syncStatusTag.textContent = status;
        syncStatusTag.className = `tag tag-${status.toLowerCase()}`;

        // Difficulty
        const diff = lastSync.difficulty || "Unknown";
        syncDifficulty.textContent = diff;
        syncDifficulty.className = `difficulty-tag difficulty-${diff.toLowerCase()}`;

        // Language
        syncLanguage.textContent = (lastSync.language || "").toUpperCase();

        // Time
        syncTime.textContent = lastSync.timestamp
          ? timeAgo(lastSync.timestamp)
          : "";

        // Commit link
        if (lastSync.commitUrl && status === "SUCCESS") {
          syncCommitLink.href = lastSync.commitUrl;
          syncCommitLink.classList.remove("hidden");
        } else {
          syncCommitLink.classList.add("hidden");
        }
      }
    } catch (error) {
      console.error("CodeSync Popup: Failed to load last sync", error);
    }
  }

  // ─── Event Listeners ──────────────────────────────────────────────────

  autoSyncToggle.addEventListener("change", async () => {
    const enabled = autoSyncToggle.checked;
    await chrome.runtime.sendMessage({
      type: "SET_AUTO_SYNC",
      enabled,
    });
  });
})();