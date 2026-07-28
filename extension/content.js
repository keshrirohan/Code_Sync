// ─── CodeSync Content Script ──────────────────────────────────────────────────
// Runs in the ISOLATED extension world on https://leetcode.com/problems/*
// run_at: document_idle  ← DOM is ready, safe to inject <script>
//
// Responsibilities:
//   1. Inject injected.js into the PAGE's main world (so XHR/fetch patches work)
//   2. Listen for window.postMessage from injected.js
//   3. Dedup by submission ID to avoid double-syncs from multiple intercepts
//   4. Relay accepted events to the background service worker
//   5. Show toast notifications on screen
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  if (window.__csContentV2) return;
  window.__csContentV2 = true;

  // ─── Inject page-world script ──────────────────────────────────────────────
  // We can't just define fetch patches here — content scripts run in an
  // isolated world. A <script> tag runs in the PAGE's main world.
  (function inject() {
    var s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.onload = function () { s.remove(); };
    (document.head || document.documentElement).appendChild(s);
  })();

  // ─── In-tab dedup (submission IDs seen in this page session) ──────────────
  var seenThisSession = {};
  var COOLDOWN_MS = 8000; // ignore duplicate events within 8 s (slug-based fallback)
  var lastSlug = null;
  var lastSlugTime = 0;

  // ─── Listen for messages from injected.js ─────────────────────────────────
  window.addEventListener('message', function (evt) {
    if (!evt.data || !evt.data.__cs2) return;
    if (evt.data.type !== 'SUBMISSION_ACCEPTED') return;

    var detail = evt.data.data || {};
    var subId  = detail.submissionId;

    // Dedup by submission ID
    if (subId && seenThisSession[subId]) return;
    if (subId) seenThisSession[subId] = true;

    // Slug-level cooldown (fallback when subId is missing)
    var slug = detail.slug || getSlugFromUrl();
    var now  = Date.now();
    if (!subId && slug === lastSlug && now - lastSlugTime < COOLDOWN_MS) return;
    lastSlug = slug; lastSlugTime = now;

    // Enrich with page-extracted metadata (fills gaps if GraphQL didn't have it)
    var problemName = detail.problemName || getPageTitle();
    var difficulty  = detail.difficulty  || getPageDifficulty();
    var lang        = detail.lang        || getPageLang();

    var payload = {
      submissionId: subId,
      source:       detail.source,
      slug:         slug,
      problemName:  problemName,
      difficulty:   difficulty,
      lang:         lang,
      langVerbose:  detail.langVerbose || null,
      code:         detail.code || null,
      runtime:      detail.runtime || null,
      memory:       detail.memory  || null,
      problemNumber: detail.problemNumber || null,
    };

    // Tell background service worker to sync
    chrome.runtime.sendMessage({ type: 'ACCEPTED_SUBMISSION', payload: payload }, function (resp) {
      if (chrome.runtime.lastError) return; // popup closed, etc.
      // Response comes back after sync completes
    });

    // Show immediate "syncing" toast
    showToast('syncing', problemName);
  });

  // Listen for sync result from background (badge update → toast)
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg.type === 'SYNC_RESULT') {
      if (msg.status === 'SUCCESS') {
        showToast('success', msg.problemName, msg.commitUrl);
      } else if (msg.status === 'SKIPPED') {
        showToast('skipped', msg.problemName);
      } else if (msg.status === 'ERROR') {
        showToast('error', msg.problemName, null, msg.error);
      }
    }
  });

  // ─── Page metadata extraction ─────────────────────────────────────────────

  function getSlugFromUrl() {
    var m = window.location.href.match(/\/problems\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function getPageTitle() {
    // Modern LeetCode 2024+ selectors
    var selectors = [
      '[data-cypress="question-title"]',
      '.text-title-large a',
      'a[href*="/problems/"] .text-title-large',
      '[class*="title"] a',
      'div[class*="question-title"]',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent.trim()) {
        return el.textContent.trim().replace(/^\d+\.\s*/, '');
      }
    }
    // Fallback: humanize slug
    var slug = getSlugFromUrl();
    if (slug) {
      return slug.split('-').map(function (w) {
        return w.charAt(0).toUpperCase() + w.slice(1);
      }).join(' ');
    }
    return 'Unknown Problem';
  }

  function getPageDifficulty() {
    var easy   = document.querySelector('.text-difficulty-easy, [class*="difficulty-easy"]');
    var medium = document.querySelector('.text-difficulty-medium, [class*="difficulty-medium"]');
    var hard   = document.querySelector('.text-difficulty-hard, [class*="difficulty-hard"]');
    if (easy)   return 'Easy';
    if (medium) return 'Medium';
    if (hard)   return 'Hard';
    return 'Unknown';
  }

  function getPageLang() {
    // Language selector button (headlessui listbox)
    var btn = document.querySelector('button[id^="headlessui-listbox-button"] span');
    if (btn && btn.textContent.trim()) return btn.textContent.trim().toLowerCase();
    // Monaco editor data-mode-id attribute
    var monaco = document.querySelector('.monaco-editor');
    if (monaco && monaco.getAttribute('data-mode-id')) return monaco.getAttribute('data-mode-id');
    return 'python3';
  }

  // ─── Toast notification system ────────────────────────────────────────────

  var toastRoot = null;
  var TOAST_DISMISS_MS = 7000;

  var TOAST_STYLES = {
    syncing: { color: '#6366f1', label: '⟳ Syncing to GitHub…',     bar: '#6366f1' },
    success: { color: '#22c55e', label: '✓ Synced to GitHub',        bar: '#22c55e' },
    skipped: { color: '#eab308', label: '⊘ Already synced',          bar: '#eab308' },
    error:   { color: '#ef4444', label: '✗ Sync failed',             bar: '#ef4444' },
  };

  function getToastRoot() {
    if (toastRoot && document.body.contains(toastRoot)) return toastRoot;
    toastRoot = document.createElement('div');
    toastRoot.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
      'display:flex', 'flex-direction:column-reverse', 'gap:8px',
      'pointer-events:none',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    ].join(';');
    document.body.appendChild(toastRoot);
    return toastRoot;
  }

  function showToast(type, problemName, commitUrl, errorMsg) {
    var st   = TOAST_STYLES[type] || TOAST_STYLES.syncing;
    var root = getToastRoot();

    var card = document.createElement('div');
    card.style.cssText = [
      'pointer-events:all', 'position:relative', 'width:300px',
      'background:rgba(13,15,20,0.96)',
      'backdrop-filter:blur(20px)', '-webkit-backdrop-filter:blur(20px)',
      'border:1px solid ' + st.color + '44',
      'border-radius:12px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.55)',
      'overflow:hidden',
      'transform:translateX(110%)', 'opacity:0',
      'transition:transform 0.3s cubic-bezier(0.22,1,0.36,1),opacity 0.2s ease',
    ].join(';');

    // Progress bar
    var bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;bottom:0;left:0;height:2px;width:100%;background:' + st.bar + ';transform-origin:left;transition:transform ' + TOAST_DISMISS_MS + 'ms linear;';
    card.appendChild(bar);

    // Body
    var body = document.createElement('div');
    body.style.cssText = 'padding:12px 14px 14px;';

    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';

    var lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:12px;font-weight:700;color:' + st.color + ';';
    lbl.textContent = st.label;

    var close = document.createElement('button');
    close.style.cssText = 'background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:16px;line-height:1;padding:0;';
    close.textContent = '×';
    close.onclick = function () { dismiss(card); };

    header.appendChild(lbl);
    header.appendChild(close);
    body.appendChild(header);

    if (problemName) {
      var name = document.createElement('div');
      name.style.cssText = 'font-size:13px;font-weight:600;color:rgba(255,255,255,0.9);line-height:1.4;';
      name.textContent = problemName;
      body.appendChild(name);
    }

    if (errorMsg) {
      var err = document.createElement('div');
      err.style.cssText = 'margin-top:6px;padding:6px 8px;border-radius:6px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);font-size:11px;font-family:monospace;color:rgba(239,68,68,0.85);word-break:break-all;';
      err.textContent = errorMsg;
      body.appendChild(err);
    }

    if (commitUrl) {
      var link = document.createElement('a');
      link.href = commitUrl; link.target = '_blank'; link.rel = 'noopener';
      link.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-top:8px;font-size:11px;font-weight:600;color:' + st.color + ';text-decoration:none;';
      link.textContent = 'View commit on GitHub →';
      body.appendChild(link);
    }

    card.appendChild(body);
    root.appendChild(card);

    // Animate in
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        card.style.transform = 'translateX(0)';
        card.style.opacity   = '1';
        bar.style.transform  = 'scaleX(0)';
      });
    });

    var t = setTimeout(function () { dismiss(card); }, TOAST_DISMISS_MS);
    card._csTimer = t;
  }

  function dismiss(card) {
    if (!card) return;
    clearTimeout(card._csTimer);
    card.style.transform = 'translateX(110%)';
    card.style.opacity   = '0';
    setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 350);
  }

})();
