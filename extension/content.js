// ============================================================================
// content.js — Injected into every leetcode.com page
//
// Watches the DOM for LeetCode's "Accepted" submission result banner.
// When it appears, sends a message to the background service worker which
// then calls the CodeSync server to sync just that problem.
//
// Detection strategy (resilient to LeetCode DOM changes):
//  1. MutationObserver on <body> watching for new nodes
//  2. Check multiple selectors and text patterns for "Accepted"
//  3. Debounce: only fire once per accepted result per problem slug
// ============================================================================

let lastFiredSlug = null;
let lastFiredTime = 0;

// Extract the problem slug from the current URL
// e.g. /problems/two-sum/  →  "two-sum"
function getProblemSlug() {
  const m = window.location.pathname.match(/\/problems\/([^/]+)/);
  return m ? m[1] : null;
}

// Check if the current page is showing an "Accepted" submission result
function isAccepted() {
  // Primary: LeetCode's data attribute
  const el1 = document.querySelector('[data-e2e-locator="submission-result"]');
  if (el1 && el1.textContent.trim().toLowerCase() === 'accepted') return true;

  // Fallback 1: Any element with class containing "accepted" and visible text
  const accepted = [...document.querySelectorAll('span, p, div')].find(el =>
    el.children.length === 0 &&
    el.textContent.trim().toLowerCase() === 'accepted' &&
    (el.className || '').toLowerCase().includes('accept')
  );
  if (accepted) return true;

  // Fallback 2: Page title says "Accepted"
  if (document.title.toLowerCase().startsWith('accepted')) return true;

  return false;
}

function tryDetect() {
  if (!isAccepted()) return;

  const slug = getProblemSlug();
  if (!slug) return;

  const now = Date.now();
  // Debounce: don't fire again for same slug within 30 seconds
  if (slug === lastFiredSlug && now - lastFiredTime < 30_000) return;

  lastFiredSlug = slug;
  lastFiredTime = now;

  console.log(`[CodeSync] Accepted detected: ${slug} — triggering auto-sync`);

  // Notify background service worker
  chrome.runtime.sendMessage({
    type: 'SUBMISSION_ACCEPTED',
    titleSlug: slug,
  });
}

// Observe DOM mutations (LeetCode is a React SPA)
const observer = new MutationObserver(() => tryDetect());
observer.observe(document.body, { childList: true, subtree: true });

// Also check on initial load (in case the result is already on the page)
tryDetect();
