// ─── CodeSync Background Service Worker ──────────────────────────────────────
// Handles: sync messages from content.js, auth checks, API calls to backend.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "http://localhost:3000";

// ─── Utilities (duplicated here since service workers can't share scripts
//     with content scripts the same way) ────────────────────────────────────

async function getBaseUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ baseUrl: DEFAULT_BASE_URL }, (result) => {
      resolve(result.baseUrl);
    });
  });
}

async function bgApiCall(endpoint, options = {}) {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "include",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

async function saveLastSync(syncData) {
  return chrome.storage.local.set({
    lastSync: {
      ...syncData,
      timestamp: Date.now(),
    },
  });
}

// ─── Installation ──────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  console.log("CodeSync: Extension installed", details.reason);

  // Set defaults on fresh install
  if (details.reason === "install") {
    chrome.storage.local.set({
      autoSync: true,
      lastSync: null,
    });
    chrome.storage.sync.set({
      baseUrl: DEFAULT_BASE_URL,
    });
  }
});

// ─── Message Handler ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SYNC_SOLUTION") {
    handleSyncSolution(message.payload)
      .then(sendResponse)
      .catch((error) => {
        console.error("CodeSync: Sync error in background", error);
        sendResponse({
          success: false,
          error: error.message || "Sync failed",
        });
      });
    return true; // Keep the message channel open for async response
  }

  if (message.type === "CHECK_AUTH") {
    handleCheckAuth()
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error.message || "Auth check failed",
        });
      });
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    handleGetSettings()
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error.message || "Settings fetch failed",
        });
      });
    return true;
  }

  if (message.type === "GET_LAST_SYNC") {
    chrome.storage.local.get({ lastSync: null }, (result) => {
      sendResponse(result.lastSync);
    });
    return true;
  }

  if (message.type === "SET_AUTO_SYNC") {
    chrome.storage.local.set({ autoSync: message.enabled }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_AUTO_SYNC") {
    chrome.storage.local.get({ autoSync: true }, (result) => {
      sendResponse({ autoSync: result.autoSync });
    });
    return true;
  }
});

// ─── Handlers ──────────────────────────────────────────────────────────────

/**
 * Check if the user is authenticated on the CodeSync backend.
 */
async function handleCheckAuth() {
  try {
    const result = await bgApiCall("/api/auth/extension");
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message || "Not authenticated",
    };
  }
}

/**
 * Get user settings from the backend.
 */
async function handleGetSettings() {
  try {
    const result = await bgApiCall("/api/settings");
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message || "Failed to fetch settings",
    };
  }
}

/**
 * Handle a sync solution request from the content script.
 * 1. Verify auth
 * 2. Check if auto-sync is on
 * 3. POST to /api/sync
 * 4. Save result for popup
 */
async function handleSyncSolution(payload) {
  // 1. Check auth
  const authResult = await bgApiCall("/api/auth/extension");
  if (!authResult.success) {
    return {
      success: false,
      error: "Not signed in. Please sign in at the CodeSync web app.",
    };
  }

  // 2. Submit to sync API
  const syncResult = await bgApiCall("/api/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  // 3. Save last sync info for popup display
  await saveLastSync({
    problemName: payload.problemName,
    language: payload.language,
    difficulty: payload.difficulty,
    status: syncResult.data?.status || "SUCCESS",
    commitUrl: syncResult.data?.commitUrl || null,
    message: syncResult.data?.message || "Synced successfully",
  });

  // 4. Update badge to show success
  try {
    await chrome.action.setBadgeText({ text: "✓" });
    await chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "" });
    }, 5000);
  } catch {
    // Badge API may not be available in all contexts
  }

  return syncResult;
}