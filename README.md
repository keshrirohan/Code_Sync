# CodeSync — LeetCode → GitHub Auto-Sync Extension

**CodeSync** is a Manifest V3 Chrome extension that automatically commits your accepted LeetCode solutions directly to a GitHub repository — no web app or OAuth flow required. Just paste a GitHub Personal Access Token and choose a repo.

---

## ✨ Features

| Feature | Detail |
|---|---|
| **Instant sync** | Commits on every accepted submission automatically |
| **PAT auth** | Fine-grained GitHub Personal Access Token — no OAuth server needed |
| **MV3 service worker** | Proper Manifest V3 architecture; no deprecated persistent background pages |
| **GraphQL + REST** | Intercepts LeetCode's both submission check APIs for maximum reliability |
| **Retry queue** | Failed syncs are queued and retried via `chrome.alarms` with exponential backoff |
| **SHA cache** | Caches file SHAs locally to skip an extra GET before every PUT |
| **Problem README** | Creates `README.md` per problem with difficulty, runtime, and memory |
| **Root README** | Maintains a root `README.md` with solved count (Easy/Medium/Hard breakdown) |
| **First-solve toggle** | Optionally skip if problem was already synced |
| **Toast notifications** | In-page toasts with progress bar and GitHub commit link |
| **Badge feedback** | Extension icon badge shows ✓ / ⏳ / ✗ sync status |

---

## 📁 Repository File Layout

```
leetcode-solutions/
├── README.md              ← auto-updated stats + recent solves
│
├── Easy/
│   └── two-sum/
│       ├── solution.py    ← your submission code
│       └── README.md      ← problem info (difficulty, runtime, link)
│
├── Medium/
│   └── add-two-numbers/
│       ├── solution.java
│       └── README.md
│
└── Hard/
    └── median-of-two-sorted-arrays/
        ├── solution.cpp
        └── README.md
```

---

## 🚀 Setup Guide

### Step 1 — Create a GitHub Personal Access Token

1. Go to **GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens**
   (or use the classic token page for simplicity)
2. Click **Generate new token**
3. Set a note: `CodeSync`
4. Set expiration: 90 days (or longer)
5. Under **Repository permissions**, grant:
   - **Contents** → `Read and write`
6. Click **Generate token** and copy it — you'll only see it once

**Direct link:** https://github.com/settings/tokens/new?scopes=repo&description=CodeSync

> 💡 A fine-grained token with `Contents: Read & Write` on a specific repo is the safest option.

---

### Step 2 — Install the extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder inside this project

The CodeSync icon will appear in your Chrome toolbar.

---

### Step 3 — Connect GitHub

1. Click the **CodeSync** icon in the toolbar
2. Paste your Personal Access Token
3. Click **Connect GitHub** — your GitHub username will appear if valid
4. Select an existing repository from the dropdown, **or** type a name and click **Create Repository**

---

### Step 4 — Submit on LeetCode 🎉

1. Open any LeetCode problem: `https://leetcode.com/problems/...`
2. Write your solution and hit **Submit**
3. When the result shows **Accepted**, CodeSync automatically:
   - Extracts the code from LeetCode's API response (not DOM scraping)
   - Commits `solution.{ext}` to your repo
   - Creates/updates `README.md` for that problem
   - Updates the root `README.md` with your stats
4. A toast notification confirms the sync with a link to the commit

---

## 🔧 Extension Architecture

```
extension/
├── manifest.json          MV3 config — permissions, content scripts, service worker
├── background.js          Service worker — sync orchestration, retry queue, badge
├── content.js             Content script — injects interceptor, shows toasts, relays events
├── injected.js            Page-world script — patches fetch/XHR to intercept LeetCode's API calls
├── storage.js             chrome.storage helpers (shared by content + background)
├── leetcode-parser.js     Language map, file path builders, README generators
├── github-api.js          GitHub REST API wrapper with retry/backoff
├── popup.html             Extension popup — 3-view UI
├── popup.css              Dark-mode premium styles
└── popup.js               Popup controller — auth, repo, dashboard
```

### How detection works

```
LeetCode UI
  │
  │  submits code → polls /submissions/detail/{id}/check/ every ~2s
  │
  └─► injected.js  [page world]
        ├── patches fetch + XHR
        ├── watches all /check/ responses until state === "SUCCESS"
        ├── also watches GraphQL submissionDetails
        └── window.postMessage("SUBMISSION_ACCEPTED", {...})
              │
              └─► content.js  [isolated world]
                    ├── deduplicates by submission ID
                    ├── enriches with DOM-extracted metadata
                    ├── shows "Syncing…" toast
                    └── chrome.runtime.sendMessage("ACCEPTED_SUBMISSION", {...})
                              │
                              └─► background.js  [service worker]
                                    ├── validates token + repo
                                    ├── calls github-api.js to commit
                                    ├── on failure → adds to queue
                                    ├── chrome.alarms flushes queue every 5 min
                                    └── updates badge + notifies content script
```

---

## ⚙️ Popup Settings

| Setting | Default | Description |
|---|---|---|
| **Auto-Sync** | ✓ On | Sync every accepted submission automatically |
| **First Solve Only** | ✗ Off | Skip problems you've already synced |
| **Commit README** | ✓ On | Create a per-problem `README.md` file |

---

## 🐛 Troubleshooting

### Sync not triggering
- Open DevTools on leetcode.com (F12 → Console) and filter for `[CodeSync]`
- You should see `INJECTED_READY` and `SUBMISSION_ACCEPTED` logs when submitting
- If missing: check that the extension is loaded and enabled in `chrome://extensions`

### "No code to commit" error
- This means the check API didn't return source code
- Try refreshing the submission result page — the GraphQL path will re-trigger the interceptor

### Token "invalid or expired"
- Click the `✕` (disconnect) button in the popup and reconnect with a fresh token

### Queue not clearing
- Open the popup — if items are shown in the queue, click **Retry now**
- The queue auto-retries every 5 minutes with exponential backoff (up to 5 retries)

### Duplicate commits
- The extension deduplicates by `submissionId` stored in `chrome.storage.local`
- Identical code is further deduplicated by the SHA cache (same SHA = no new commit)

---

## 🔐 Security

- Your GitHub PAT is stored in **`chrome.storage.local`** (never `sync` — not replicated across devices)
- The token is only sent to `api.github.com` — never to any third-party server
- The extension has no web-app backend dependency

---

## 🗺️ Roadmap

- [ ] LeetCode CN support (`leetcode.cn`)
- [ ] Bulk sync past submissions
- [ ] Custom folder structure (configurable per language/difficulty)
- [ ] Firefox / Edge support
