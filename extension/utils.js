// ─── CodeSync Extension Utilities ────────────────────────────────────────────

const DEFAULT_BASE_URL = "http://localhost:3000";

/**
 * Get the configured backend base URL.
 * Falls back to localhost:3000 for development.
 */
async function getBaseUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ baseUrl: DEFAULT_BASE_URL }, (result) => {
      resolve(result.baseUrl);
    });
  });
}

/**
 * Make an authenticated API call to the CodeSync backend.
 * Uses cookie-based auth (credentials: "include") so the user
 * must be signed in on the web app in the same browser.
 */
async function apiCall(endpoint, options = {}) {
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

/**
 * Extract the problem slug from a LeetCode problem URL.
 * Example: "https://leetcode.com/problems/two-sum/description/" → "two-sum"
 */
function extractSlugFromUrl(url) {
  const match = url.match(/\/problems\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Create a debounced version of a function.
 * Useful for preventing rapid-fire submission detections.
 */
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

/**
 * Save the last sync result to local storage for the popup to display.
 */
async function saveLastSync(syncData) {
  return chrome.storage.local.set({
    lastSync: {
      ...syncData,
      timestamp: Date.now(),
    },
  });
}

/**
 * Retrieve the last sync result from local storage.
 */
async function getLastSync() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ lastSync: null }, (result) => {
      resolve(result.lastSync);
    });
  });
}

/**
 * Get the auto-sync preference (defaults to true).
 */
async function getAutoSync() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ autoSync: true }, (result) => {
      resolve(result.autoSync);
    });
  });
}

/**
 * Set the auto-sync preference.
 */
async function setAutoSync(enabled) {
  return chrome.storage.local.set({ autoSync: enabled });
}
