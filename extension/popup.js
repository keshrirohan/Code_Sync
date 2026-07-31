// ============================================================================
// popup.js — Chrome Extension popup logic.
//
// 1. Reads LEETCODE_SESSION + csrftoken from leetcode.com via chrome.cookies
// 2. Checks if the CodeSync dashboard is reachable at localhost:3055
// 3. On button click: POSTs the cookie string to /api/auth/leetcode-from-extension
// ============================================================================

const DASHBOARD_URL = 'http://localhost:3055';

const el = (id) => document.getElementById(id);

// ── DOM refs ─────────────────────────────────────────────────────────────────

const lcDot     = el('lc-dot');
const lcStatus  = el('lc-status');
const dashDot   = el('dash-dot');
const dashStatus = el('dash-status');
const sendBtn   = el('send-btn');
const sendLabel = el('send-label');
const openBtn   = el('open-btn');
const toast     = el('toast');
const toastIcon = el('toast-icon');
const toastMsg  = el('toast-msg');

let capturedCookie = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function setDot(dotEl, state) {
  dotEl.className = 'status-dot';
  if (state === 'ok')       dotEl.classList.add('dot-connected');
  else if (state === 'err') dotEl.classList.add('dot-disconnected');
  else                      dotEl.classList.add('dot-loading');
}

function showToast(type, msg) {
  toast.className = `toast show ${type}`;
  toastIcon.textContent = type === 'success' ? '✅' : '❌';
  toastMsg.textContent  = msg;
  setTimeout(() => toast.classList.remove('show'), 4000);
}

function getCookie(name) {
  return new Promise(resolve => {
    chrome.cookies.get({ url: 'https://leetcode.com', name }, cookie => {
      resolve(cookie ? cookie.value : null);
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  // 1. Check LeetCode cookies
  const [session, csrf] = await Promise.all([
    getCookie('LEETCODE_SESSION'),
    getCookie('csrftoken'),
  ]);

  if (session && csrf) {
    capturedCookie = `LEETCODE_SESSION=${session}; csrftoken=${csrf}`;
    setDot(lcDot, 'ok');
    lcStatus.textContent = 'Logged in ✓';
    lcStatus.className   = 'status-value ok';
  } else {
    setDot(lcDot, 'err');
    lcStatus.textContent = session ? 'Missing csrftoken' : 'Not logged in';
  }

  // 2. Check dashboard reachability
  try {
    const res = await fetch(`${DASHBOARD_URL}/api/config`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      setDot(dashDot, 'ok');
      dashStatus.textContent = 'Running ✓';
      dashStatus.className   = 'status-value ok';
    } else {
      throw new Error();
    }
  } catch {
    setDot(dashDot, 'err');
    dashStatus.textContent = 'Not running';
  }

  // 3. Enable send button only if we have both cookie and dashboard
  const dashReachable = dashStatus.textContent.includes('Running');
  if (capturedCookie && dashReachable) {
    sendBtn.disabled = false;
  } else if (!capturedCookie) {
    sendLabel.textContent = 'Log in to LeetCode first';
  } else {
    sendLabel.textContent = 'Start the dashboard first';
  }
}

// ── Button handlers ───────────────────────────────────────────────────────────

sendBtn.addEventListener('click', async () => {
  if (!capturedCookie) return;

  sendBtn.disabled  = true;
  sendLabel.textContent = 'Sending...';

  try {
    const res  = await fetch(`${DASHBOARD_URL}/api/auth/leetcode-from-extension`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ cookie: capturedCookie }),
    });
    const data = await res.json();

    if (data.valid) {
      showToast('success', `Connected as ${data.username}!`);
      sendLabel.textContent = '✓ Cookie Sent!';
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    showToast('error', err.message);
    sendBtn.disabled  = false;
    sendLabel.textContent = 'Send Cookie to Dashboard';
  }
});

openBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: DASHBOARD_URL });
});

// ── Start ─────────────────────────────────────────────────────────────────────

init();
