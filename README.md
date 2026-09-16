# ⚡ CodeSync

Automatically sync your LeetCode accepted submissions to a GitHub repository — with the **original submission timestamps** preserved as commit dates, so your contribution graph shows green squares on the exact days you solved each problem.

**Live demo:**
- 🌐 Dashboard: [https://code-sync-3sld.onrender.com](https://code-sync-3sld.onrender.com)
- ⚙️ Backend API: [https://codesync-api-5p2c.onrender.com](https://codesync-api-5p2c.onrender.com)

---

## 📋 Table of Contents

- [How It Works](#how-it-works)
- [Architecture Overview](#architecture-overview)
- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Connecting Accounts](#connecting-accounts)
- [Chrome Extension](#chrome-extension)
- [Auto-Sync](#auto-sync)
- [Running a Sync](#running-a-sync)
- [API Reference](#api-reference)
- [Deployment (Render)](#deployment-render)
- [Testing](#testing)
- [NPM Commands](#npm-commands)
- [Security Model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Supported Languages](#supported-languages)

---

## How It Works

```
LeetCode Account                  CodeSync Backend                GitHub Repository
─────────────────    fetch via     ─────────────────    commit &    ──────────────────
  Accepted           GraphQL API     Express +          push with     Your solutions
  Submissions   ───────────────►    MongoDB +          original  ►   in structured
                                    git client         timestamps     folders
```

1. **Fetches** all your accepted submissions from LeetCode's GraphQL API, with pagination and retry logic.
2. **Clones** your target GitHub repository into a temporary local directory.
3. **Commits** each new solution into a structured folder (`1 Two Sum/1-two-sum.py`), with both the author date and committer date set to the **original LeetCode submission timestamp** — this is what fills your contribution graph correctly.
4. **Pushes** all commits to remote in a single push, then deletes the local clone.
5. **Incremental sync** — on subsequent runs, only submissions not already in the repo are committed. Nothing is ever overwritten.

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────────────────┐
│                             CodeSync System                                │
│                                                                            │
│  ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────────┐  │
│  │  Chrome Extension │    │  React Dashboard  │    │   Express API       │  │
│  │  (Manifest V3)    │    │  (Vite + Tailwind)│    │   (Node.js)         │  │
│  │                   │    │                   │    │                     │  │
│  │  background.js    │    │  ConnectSection   │    │  /api/health        │  │
│  │  • Cookie capture │    │  RepoSection      │◄──►│  /api/status        │  │
│  │  • Auto-sync on   │◄──►│  SyncSection      │    │  /api/config        │  │
│  │    Accept detect  │    │  HistorySection   │    │  /api/auth/*        │  │
│  │  • Alarm polling  │    │  Sidebar          │    │  /api/sync/*        │  │
│  │                   │    │                   │    │  /api/repos/*       │  │
│  │  content.js       │    │  VITE_API_URL env │    │  /api/history/*     │  │
│  │  • DOM observer   │    │  → Render backend │    │  /api/sync/debug    │  │
│  │    for Accepted   │    │                   │    │  /api/sync/reset    │  │
│  └──────────────────┘    └──────────────────┘    └──────────┬──────────┘  │
│                                                              │              │
│                           ┌──────────────────────────────────┼──────────┐  │
│                           │                                  ▼          │  │
│                           │  ┌───────────────┐   ┌───────────────────┐  │  │
│                           │  │ MongoDB Atlas │   │  LeetCode GraphQL │  │  │
│                           │  │ (AES-256-GCM) │   │       API         │  │  │
│                           │  │               │   │                   │  │  │
│                           │  │ • Settings    │   │  submissionList   │  │  │
│                           │  │   (encrypted) │   │  questionSubmit.. │  │  │
│                           │  │ • SyncHistory │   │  submissionDetail │  │  │
│                           │  └───────────────┘   └───────────────────┘  │  │
│                           └──────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Tech | Purpose |
|---|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS | Dashboard UI served as static site on Render |
| **Backend** | Node.js 18, Express 4, Mongoose 9 | REST API, sync engine, SSE streaming |
| **Database** | MongoDB Atlas | Encrypted credential storage, sync history |
| **Extension** | Chrome MV3, Service Worker | Cookie capture, submission detection |
| **Git engine** | `child_process.execSync` | Clone, commit (backdated), push via PAT-embedded URL |

---

## Key Features

| Feature | Detail |
|---|---|
| 🕐 **Backdated commits** | Both `--date` and `GIT_COMMITTER_DATE` are set to the original submission time — GitHub's contribution graph uses committer date |
| 🔒 **AES-256-GCM encryption** | LeetCode cookie, GitHub token, and OAuth secret are encrypted before writing to MongoDB |
| 🔄 **Incremental sync** | Checks existing repo folders before committing — never duplicates a problem |
| 📡 **Live SSE terminal** | Real-time streaming of sync output line-by-line in the dashboard |
| 🧩 **Chrome Extension** | 1-click cookie capture from `chrome.cookies`, no DevTools needed |
| 🏥 **Health + debug endpoints** | `/api/health` (no DB dep), `/api/status` (full deps), `/api/sync/debug` (live sync state) |
| 📜 **Sync history** | Every run is recorded in MongoDB with start/end time, status, and repo name |
| 🧪 **Dry-run mode** | Preview what would be committed without touching git |
| 🔁 **Auto-sync** | Content script fires on LeetCode "Accepted" + configurable periodic alarm |
| 📘 **README generation** | Auto-generates a problem table with language badges in the solutions repo |
| ✅ **Full test suite** | 11 server test files + 4 client test files, 150+ assertions |

---

## Prerequisites

Before you start, make sure you have:

- **Node.js v18+** — [nodejs.org](https://nodejs.org)
- **Git** — [git-scm.com](https://git-scm.com)
- **MongoDB Atlas** free cluster (or local MongoDB) — [cloud.mongodb.com](https://cloud.mongodb.com)
- A **GitHub** account with a repository to push solutions into
- A **LeetCode** account with solved problems

---

## Project Structure

```
codesync/
│
├── client/                         # React + Vite + Tailwind frontend
│   ├── src/
│   │   ├── __tests__/              # Jest + React Testing Library tests
│   │   │   ├── api.test.js
│   │   │   ├── App.test.jsx
│   │   │   ├── HistorySection.test.jsx
│   │   │   └── RepoSection.test.jsx
│   │   ├── components/
│   │   │   ├── ConnectSection.jsx  # LeetCode + GitHub auth cards
│   │   │   ├── RepoSection.jsx     # Repository browser + selector
│   │   │   ├── SyncSection.jsx     # Sync controls + SSE terminal
│   │   │   ├── HistorySection.jsx  # Sync run history table
│   │   │   └── Sidebar.jsx         # Navigation sidebar
│   │   ├── api.js                  # apiUrl() helper — reads VITE_API_URL
│   │   ├── App.jsx                 # Root component, OAuth redirect handler
│   │   ├── main.jsx                # React entry point
│   │   └── index.css               # Design tokens (dark theme)
│   ├── .env.production             # VITE_API_URL=https://codesync-api-5p2c.onrender.com
│   ├── babel.config.js             # Babel config for Jest (preset-env + preset-react)
│   ├── jest.config.js              # Jest config (jsdom, babel-jest, identity-obj-proxy)
│   ├── vite.config.js              # Dev proxy: /api → backend; build: dist/
│   └── package.json
│
├── server/                         # Node.js + Express + MongoDB backend
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js               # Mongoose connect with auto-reconnect
│   │   │   └── env.js              # Required env var validation at startup
│   │   ├── git/
│   │   │   └── gitClient.js        # init(), commit(), commitReadme(), push()
│   │   │                           # — embeds PAT into HTTPS clone URL
│   │   │                           # — sets GIT_COMMITTER_DATE for contribution graph
│   │   ├── leetcode/
│   │   │   └── leetcodeClient.js   # GraphQL API client
│   │   │                           # — fetchSolvedQuestions() (paginated)
│   │   │                           # — fetchLatestSubmissionId()
│   │   │                           # — fetchSubmissionDetails() (6-retry, exp. backoff)
│   │   ├── middleware/
│   │   │   ├── errorHandler.js     # Centralised JSON error responses
│   │   │   └── requestLogger.js    # Winston HTTP logging (skips SSE streams)
│   │   ├── models/
│   │   │   ├── Settings.js         # Singleton Mongoose model: loadGlobal/saveGlobal
│   │   │   └── SyncHistory.js      # One doc per sync run
│   │   ├── storage/
│   │   │   └── storage.js          # loadConfig/saveConfig with AES encrypt/decrypt
│   │   │                           # loadHistory/addHistoryEntry/updateHistoryEntry
│   │   ├── sync/
│   │   │   ├── handler.js          # execute() — full 5-phase sync orchestrator
│   │   │   │                       # also standalone child-process entry point
│   │   │   └── readmeGenerator.js  # scanRepo() + generateReadme() with badges
│   │   ├── utils/
│   │   │   ├── crypto.js           # encrypt()/decrypt()/isEncrypted() — AES-256-GCM
│   │   │   └── logger.js           # Winston: JSON in prod, colourised text in dev
│   │   ├── app.js                  # Express app — all routes + middleware + exports
│   │   └── server.js               # Boot: connectDB → restore auto-sync → listen
│   ├── tests/                      # Jest test suite (ESM, --experimental-vm-modules)
│   │   ├── api.test.js             # Integration: health, config, status, auth endpoints
│   │   ├── config.test.js          # CLI argument parsing
│   │   ├── crypto.test.js          # encrypt/decrypt/isEncrypted unit tests
│   │   ├── env.test.js             # validateEnv happy/fail/defaults
│   │   ├── extension-payload.test.js  # Extension → backend contract tests
│   │   ├── gitClient.test.js       # init/commit/push with mocked execSync + fs
│   │   ├── handler.test.js         # Sync orchestrator with mocked clients
│   │   ├── leetcode.test.js        # Cookie normalisation, CSRF, validation
│   │   ├── middleware.test.js      # errorHandler + requestLogger
│   │   ├── readmeGenerator.test.js # scanRepo + generateReadme with mocked fs
│   │   └── storage.test.js         # loadConfig/saveConfig encrypt round-trip + CRUD
│   ├── .env                        # Local secrets (git-ignored)
│   └── package.json
│
├── extension/                      # Chrome Extension — Manifest V3
│   ├── manifest.json               # permissions: cookies, storage, alarms, tabs
│   │                               # host_permissions: leetcode.com + Render backend
│   ├── background.js               # Service worker
│   │                               # — captureLeetCodeCookie() via chrome.cookies
│   │                               # — fetchWithTimeout() (8s AbortController)
│   │                               # — message handlers: CHECK_AUTH, CAPTURE_...,
│   │                               #   TRIGGER_SYNC, GET_LAST_SYNC, SET_AUTO_SYNC
│   │                               # — chrome.alarms periodic trigger
│   ├── content.js                  # Injected into leetcode.com/problems/*
│   │                               # — MutationObserver for "Accepted" banner
│   │                               # — debounce: 30s per problem slug
│   ├── popup.html                  # Extension popup (dark theme)
│   ├── popup.js                    # Popup logic
│   │                               # — DEFAULT_BASE_URL: backend API URL
│   │                               # — DASHBOARD_URL: frontend URL
│   │                               # — getBaseUrl() reads chrome.storage.sync
│   └── icons/                      # icon16.png, icon48.png, icon128.png
│
├── .gitignore                      # Ignores: node_modules, .env, server/.env, data/
└── README.md
```

---

## Local Development Setup

### 1. Clone and install

```bash
git clone https://github.com/keshrirohan/Code_Sync.git
cd Code_Sync

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

### 2. Create server/.env

```env
# ── Required ──────────────────────────────────────────────────────────────────

# MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/CodeSync

# 64-character hex key for AES-256-GCM encryption
# Generate one: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_SECRET=your_64_char_hex_string_here

# ── Optional (shown with defaults) ────────────────────────────────────────────

PORT=3055
NODE_ENV=development
BACKEND_URL=http://localhost:3055
FRONTEND_URL=http://localhost:5173

# GitHub OAuth App credentials (optional — can be configured in dashboard instead)
# GITHUB_CLIENT_ID=Ov23li...
# GITHUB_CLIENT_SECRET=...
```

> **Never commit `server/.env`** — it is listed in `.gitignore`.

### 3. Start the servers

> ⚠️ Start the **backend first**. The Vite dev proxy forwards `/api` to `localhost:3055`. If the backend isn't running you'll get `ECONNREFUSED` in the browser console.

**Terminal 1 — Backend** (port 3055):
```bash
cd server
npm run dev
```

Expected output:
```
info: MongoDB connected: cluster0-shard-...
info: CodeSync server running on port 3055
info:   Backend URL:  http://localhost:3055
info:   Frontend URL: http://localhost:5173
info:   OAuth callback: http://localhost:3055/api/auth/github/callback
```

**Terminal 2 — Frontend** (port 5173):
```bash
cd client
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## Environment Variables

### Server (`server/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGODB_URI` | ✅ | — | MongoDB Atlas connection string. Server exits at startup if missing. |
| `ENCRYPTION_SECRET` | ✅ | — | 64-char hex string. Used as the AES-256-GCM key. Server exits if missing or wrong length. |
| `PORT` | No | `3055` | TCP port the Express server listens on. |
| `NODE_ENV` | No | `development` | Set to `production` on Render. Controls log format (JSON vs colourised) and stack trace exposure. |
| `BACKEND_URL` | No | `http://localhost:PORT` | The public URL of this server. Used to build the GitHub OAuth callback URL. **Must be set on Render.** |
| `FRONTEND_URL` | No | `http://localhost:5173` | The public URL of the React app. Used for CORS and OAuth redirect. **Must be set on Render.** |
| `GITHUB_CLIENT_ID` | No | — | GitHub OAuth App client ID. Can be set here or via the dashboard UI. |
| `GITHUB_CLIENT_SECRET` | No | — | GitHub OAuth App client secret. Can be set here or via the dashboard UI. |

### Client (`client/.env.production`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | ✅ in prod | The base URL for all `fetch()` calls. In production this is `https://codesync-api-5p2c.onrender.com`. Baked into the static build by Vite at build time. In local dev the Vite proxy handles routing so this can be left empty. |

---

## Connecting Accounts

### Step 1 — Connect LeetCode

**Option A — Chrome Extension (Recommended)**

1. Load the extension (see [Chrome Extension](#chrome-extension)).
2. Log in to [leetcode.com](https://leetcode.com).
3. Click the **CodeSync** icon → **Connect LeetCode Account**.
4. The extension reads `LEETCODE_SESSION` and `csrftoken` directly from `chrome.cookies` and posts them to the backend. The raw cookie value is **never returned to the popup**.

**Option B — Manual Cookie Paste**

1. Log in to [leetcode.com](https://leetcode.com).
2. Open DevTools (`F12`) → **Application** → **Cookies** → `https://leetcode.com`.
3. Copy the value of `LEETCODE_SESSION`.
4. In the dashboard → **Connect Accounts** → LeetCode card → paste and click **Validate & Connect**.

The backend normalises whatever you paste:
- A bare JWT (`eyJhbGc...`) is automatically prefixed as `LEETCODE_SESSION=...`
- A missing `csrftoken` is appended with a default value
- The value is validated against LeetCode's GraphQL API before being stored

---

### Step 2 — Connect GitHub

**Option A — Personal Access Token (Simplest)**

1. [Click here](https://github.com/settings/tokens/new?description=CodeSync&scopes=repo) to generate a token with `repo` scope (pre-filled link).
2. Copy the token (`ghp_...` or `github_pat_...`).
3. Dashboard → **Connect Accounts** → GitHub card → **🔑 Personal Access Token** tab → paste and click **Connect with Token**.

**Option B — GitHub OAuth App**

1. Go to [GitHub → Settings → Developer Settings → OAuth Apps → New](https://github.com/settings/applications/new).
2. Fill in:
   - **Application name:** `CodeSync`
   - **Homepage URL:** `https://code-sync-3sld.onrender.com`
   - **Authorization callback URL:** `https://codesync-api-5p2c.onrender.com/api/auth/github/callback`
3. Click **Register application**, then generate a Client Secret.
4. Dashboard → **Connect Accounts** → GitHub card → **🌐 OAuth Login** tab → enter Client ID + Secret → **Save & Enable Sign-in** → **Sign in with GitHub**.

---

### Step 3 — Select Repository and Sync

1. Dashboard → **Repository** page.
2. Your GitHub repos are listed (fetched from `GET /api/repos`). Search by name or description.
3. Click a repo to select it → **Save Selection**.
4. Dashboard → **Sync** tab → optionally toggle **🧪 Test Mode** (dry run) → **⚡ Start Sync**.
5. Watch the live terminal output stream. Each phase is labelled:

```
=== Phase 1: Fetching submissions from LeetCode ===
=== Phase 2: Setting up Git repository ===
=== Phase 3: Creating commits (skipping already synced) ===
=== Phase 4: Generating README.md ===
=== Phase 5: Pushing to remote ===
✅ CodeSync complete!
```

---

## Chrome Extension

### Installation

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** → select the `extension/` folder from this repo.
4. Pin **⚡ CodeSync** to your toolbar.

> For production use, the extension points to `https://codesync-api-5p2c.onrender.com` (backend) and `https://code-sync-3sld.onrender.com` (dashboard). The "Open Dashboard" button opens the frontend URL — not the API URL.

### Popup UI States

| State | Indicator | Meaning |
|---|---|---|
| Backend online + LC connected | 🟢 both dots green | Fully connected, sync ready |
| Backend online + LC not connected | 🟢 dash dot, 🔴 LC dot | Need to connect LeetCode |
| Backend offline | 🔴 both dots red | Render service sleeping or API down |

### Message Protocol (extension ↔ background ↔ backend)

| Popup Message | Background Action | Backend Endpoint |
|---|---|---|
| `CHECK_AUTH` | GET `/api/health` then GET `/api/config` | Determines all dot states |
| `CAPTURE_LEETCODE_COOKIE` | `chrome.cookies.get` → POST `/api/auth/leetcode-from-extension` | Validates + stores cookie |
| `TRIGGER_SYNC` | POST `/api/sync/auto/trigger` | Fires incremental sync |
| `GET_LAST_SYNC` | GET `/api/history` | Shows last sync badge |
| `GET_AUTO_SYNC` | `chrome.storage.local.get` | Returns stored toggle state |
| `SET_AUTO_SYNC` | `chrome.storage.local.set` + `chrome.alarms.create` | Updates alarm schedule |
| `SUBMISSION_ACCEPTED` (from content.js) | POST `/api/sync/auto/trigger` | Fires sync after Accepted |

### Auto-Accept Detection (`content.js`)

The content script is injected into every `https://leetcode.com/problems/*` page. It uses a `MutationObserver` on `document.body` and checks three detection strategies:

1. `[data-e2e-locator="submission-result"]` text equals `"accepted"`
2. Any element whose className contains `"accept"` and text is exactly `"accepted"`
3. `document.title` starts with `"accepted"`

A debounce prevents firing more than once per problem slug per 30 seconds.

---

## Auto-Sync

### How the Server Handles Auto-Sync

The server's `performIncrementalSync()` function:

1. Calls `recentAcSubmissionList(username, limit:20)` on LeetCode's GraphQL API.
2. Filters results to only submissions **newer than** `lastAutoSyncAt` (stored in MongoDB). Handles both Unix timestamp integers and ISO 8601 strings from the API.
3. If nothing new → returns `{ synced: 0 }` **without** updating `lastAutoSyncAt` (so the window doesn't slide forward).
4. For each new slug: fetches latest submission ID → fetches full code with 6-retry exponential backoff → commits to git.
5. Regenerates `README.md`, commits it.
6. Pushes everything.
7. Updates `lastAutoSyncAt` and `lastSyncedSlugs` in MongoDB **only on success**.

> ⚠️ `leetcodeUsername` must be stored in the config for `recentAcSubmissionList` to work. This is populated automatically when you connect LeetCode. If auto-sync silently does nothing, run a manual full sync first.

### Auto-Sync Endpoints

| Endpoint | Method | Body / Params | Description |
|---|---|---|---|
| `/api/sync/auto/status` | GET | — | Returns `{ enabled, intervalMinutes, running, lastRunAt, lastResult, lastAutoSyncAt, nextRunAt }` |
| `/api/sync/auto/config` | POST | `{ enabled, intervalMinutes }` | Enable/disable auto-sync and set interval |
| `/api/sync/auto/trigger` | POST | — | Fires `runAutoSync()` immediately. Responds `{ ok: true }` at once (async). |
| `/api/sync/debug` | GET | — | Returns live `autoSyncState` + safe config flags. Use this to diagnose silent failures. |
| `/api/sync/reset` | POST | — | Clears `lastAutoSyncAt` and `lastSyncedSlugs`. Next trigger re-checks all recent submissions from scratch. |

---

## Running a Sync

### Full Sync (Dashboard)

The **Start Sync** button on the Sync page calls `POST /api/sync/start`, which:

1. Spawns `node server/src/sync/handler.js` as a child process.
2. Passes credentials via environment variables (never CLI args — they'd be visible in `ps`):
   - `CODESYNC_COOKIE` — decrypted LeetCode cookie
   - `CODESYNC_REPO_URL` — target repo HTTPS URL
   - `CODESYNC_TOKEN` — decrypted GitHub token
   - `CODESYNC_DRY_RUN` — `1` or `0`
   - `CODESYNC_KNOWN_SLUGS` — JSON array of already-synced slugs
3. Returns `{ jobId }` immediately.
4. Streams child process stdout/stderr to SSE clients via `GET /api/sync/:jobId/stream`.
5. On child exit: marks history entry as `success` or `error`, persists updated slug list.

### Dry Run

Toggle **🧪 Test Mode** before clicking Start Sync. The sync engine fetches all submissions and prints what it *would* commit, but makes no git operations.

---

## API Reference

### Health & Status

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Lightweight — no DB dependency. Returns `{ ok, timestamp, uptime }`. Use this for uptime monitoring. |
| `/api/status` | GET | Full dependency check. Returns `{ backend, mongodb, leetcode, github }`. |
| `/api/config` | GET | Safe config view. Returns presence flags and usernames. **Never returns raw credentials.** |

#### `GET /api/health`
```json
{ "ok": true, "timestamp": "2026-08-15T00:00:00.000Z", "uptime": 1234.56 }
```

#### `GET /api/status`
```json
{ "backend": "online", "mongodb": "connected", "leetcode": "connected", "github": "connected" }
```

- `mongodb`: `"connected"` | `"connecting"` | `"disconnected"`
- `leetcode`: `"connected"` | `"not_connected"` | `"session_stored"`
- `github`: `"connected"` | `"not_connected"` | `"token_stored"`

#### `GET /api/config`
```json
{
  "hasLeetcodeCookie": true,
  "leetcodeUsername": "your_lc_username",
  "hasGithubToken": true,
  "githubUsername": "your_gh_username",
  "githubAvatar": "https://avatars.githubusercontent.com/u/...",
  "targetRepoUrl": "https://github.com/you/leetcode.git",
  "targetRepoName": "you/leetcode"
}
```

### Authentication

| Endpoint | Method | Body | Description |
|---|---|---|---|
| `POST /api/auth/leetcode` | POST | `{ cookie }` | Validate + store LeetCode session |
| `POST /api/auth/leetcode-from-extension` | POST | `{ cookie }` | Same as above — dedicated endpoint for extension |
| `DELETE /api/auth/leetcode` | DELETE | — | Remove LeetCode credentials |
| `POST /api/auth/github` | POST | `{ token }` | Validate + store GitHub PAT |
| `DELETE /api/auth/github` | DELETE | — | Remove GitHub credentials |
| `GET /api/auth/github/oauth-status` | GET | — | `{ configured, connected }` |
| `POST /api/auth/github/oauth-setup` | POST | `{ clientId, clientSecret }` | Save OAuth App credentials |
| `GET /api/auth/github/login` | GET | — | Redirect to GitHub OAuth consent screen |
| `GET /api/auth/github/callback` | GET | query: `code`, `state` | OAuth callback — exchanges code for token |

#### LeetCode Auth Error Codes

All LeetCode auth endpoints return structured error codes:

| Code | HTTP | Meaning |
|---|---|---|
| `COOKIE_REQUIRED` | 400 | `cookie` field missing or empty in request body |
| `SESSION_INVALID` | 401 | LeetCode API rejected the session |
| `SESSION_EXPIRED` | 401 | Session was valid format but `isSignedIn: false` returned |
| `VALIDATION_ERROR` | 502 | Network error reaching LeetCode's API |
| `STORAGE_ERROR` | 500 | MongoDB write failed after successful validation |

### Repositories

| Endpoint | Method | Body | Description |
|---|---|---|---|
| `GET /api/repos` | GET | — | List all GitHub repos for the connected user (paginates 100/page) |
| `POST /api/repos/select` | POST | `{ repoUrl, repoName }` | Set the target repository |

### Sync

| Endpoint | Method | Body | Description |
|---|---|---|---|
| `POST /api/sync/start` | POST | `{ dryRun? }` | Start a full sync job. Returns `{ jobId }`. |
| `GET /api/sync/:jobId/stream` | GET | — | SSE stream. Events: `{ type: "log", message }` and `{ type: "complete", success }`. Replays buffered logs for late-joining clients. |
| `GET /api/sync/auto/status` | GET | — | Auto-sync state |
| `POST /api/sync/auto/config` | POST | `{ enabled, intervalMinutes }` | Configure auto-sync |
| `POST /api/sync/auto/trigger` | POST | — | Trigger incremental sync now |
| `GET /api/sync/debug` | GET | — | Live sync state + safe config flags. No credentials exposed. |
| `POST /api/sync/reset` | POST | — | Clear `lastAutoSyncAt` and `lastSyncedSlugs` |

#### `GET /api/sync/debug` — Response
```json
{
  "autoSyncState": {
    "running": false,
    "lastRunAt": "2026-08-15T10:00:00.000Z",
    "lastResult": { "synced": 3 }
  },
  "config": {
    "hasLeetcodeCookie": true,
    "leetcodeUsername": "your_username",
    "hasGithubToken": true,
    "githubUsername": "your_gh_username",
    "targetRepoUrl": "https://github.com/you/leetcode.git",
    "autoSyncEnabled": true,
    "lastAutoSyncAt": "2026-08-15T10:00:00.000Z",
    "lastSyncedSlugCount": 47
  }
}
```

### History

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/history` | GET | All sync history entries, newest first |
| `DELETE /api/history/:id` | DELETE | Delete a history entry by UUID |

---

## Deployment (Render)

The project is deployed to [Render](https://render.com) as two separate services:

| Service | Type | URL | Root Dir |
|---|---|---|---|
| `codesync-api` | Web Service (Node) | `https://codesync-api-5p2c.onrender.com` | `server/` |
| `codesync-frontend` | Static Site | `https://code-sync-3sld.onrender.com` | `client/` |

### Backend Service Settings

| Setting | Value |
|---|---|
| Build Command | `npm install` |
| Start Command | `npm start` |
| Node Version | 18 |

**Required environment variables on Render:**

```
MONGODB_URI          = mongodb+srv://...
ENCRYPTION_SECRET    = <64-char hex>
NODE_ENV             = production
BACKEND_URL          = https://codesync-api-5p2c.onrender.com
FRONTEND_URL         = https://code-sync-3sld.onrender.com
PORT                 = 10000   (Render sets this automatically)
GITHUB_CLIENT_ID     = (optional — if using OAuth)
GITHUB_CLIENT_SECRET = (optional — if using OAuth)
```

### Frontend Static Site Settings

| Setting | Value |
|---|---|
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |

**Environment variable:**
```
VITE_API_URL = https://codesync-api-5p2c.onrender.com
```

> This is also baked into `client/.env.production` as a fallback if the Render env var isn't set.

### GitHub OAuth Callback URL

If using OAuth, the callback URL registered in your GitHub OAuth App must be:
```
https://codesync-api-5p2c.onrender.com/api/auth/github/callback
```

---

## Testing

### Server Tests (Jest + ESM)

```bash
cd server
npm test
```

The server uses native ESM (`"type": "module"`). Jest runs with `--experimental-vm-modules` and `jest.unstable_mockModule()` for ESM-compatible mocking.

#### Test Files

| File | Scope | Tests |
|---|---|---|
| `crypto.test.js` | Unit | AES-256-GCM `encrypt()`, `decrypt()`, `isEncrypted()` — round-trips, null inputs, wrong key, tampered ciphertext, idempotency |
| `storage.test.js` | Unit | `loadConfig` decrypt-on-read, `saveConfig` encrypt-on-write, round-trip, idempotency guard, history CRUD, error handling |
| `gitClient.test.js` | Unit | `buildAuthUrl` (HTTPS/SSH), `init` (clone URL, git config, remote set-url), `commit` (file write, git add, `--date`, `GIT_COMMITTER_DATE`), `push` (order, cleanup), `commitReadme` |
| `readmeGenerator.test.js` | Unit | `scanRepo` (extensions, sorting, empty/dotfiles), `generateReadme` (table rows, badges, URL encoding, empty entries) |
| `middleware.test.js` | Unit | `errorHandler` (status codes, dev/prod stack trace, no `next()` call), `requestLogger` (log levels by status, SSE skip, ms suffix) |
| `env.test.js` | Unit | `validateEnv` (exits on missing vars, stderr messages, default values, does not overwrite existing) |
| `leetcode.test.js` | Unit | Cookie normalisation, CSRF extraction, `validateLeetcodeCookie` success/failure/network/headers |
| `api.test.js` | Integration | `/api/health`, `/api/config` (shape, credential masking), `/api/status`, `POST /api/auth/leetcode` (400/401/200/502), `POST .../leetcode-from-extension` |
| `extension-payload.test.js` | Integration | Extension → backend contract: all payload shapes, edge cases, response security |
| `handler.test.js` | Unit | `execute()` — commit count, folder/file names, chronological sort, dry-run skip, empty list |
| `config.test.js` | Unit | CLI `parseArgs()` — cookie, repo-url, dry-run flag, missing arg exits |

#### Running Specific Tests

```bash
# Single file
npx --node-options="--experimental-vm-modules" jest tests/crypto.test.js

# Pattern match
npx --node-options="--experimental-vm-modules" jest --testPathPattern="crypto|storage"

# With coverage
npx --node-options="--experimental-vm-modules" jest --coverage
```

---

### Client Tests (Jest + React Testing Library)

```bash
cd client
npm test
```

Uses `babel-jest` to transpile JSX/ESM and `jest-environment-jsdom` to simulate the browser.

#### Test Files

| File | Scope | Tests |
|---|---|---|
| `api.test.js` | Unit | `apiUrl()` — base URL prepend, trailing slash strip, empty env, query strings, deeply nested paths |
| `App.test.jsx` | Component | Loading spinner, backend offline screen, retry button, OAuth `?gh_connected=1` and `?gh_error=...` redirects, notification auto-dismiss, dismiss button |
| `HistorySection.test.jsx` | Component | Loading state, empty state, table rows, success/error/dry-run badges, stats row (total, successful), delete entry, refresh button, fetch failure |
| `RepoSection.test.jsx` | Component | GitHub gate, loading state, repo list render, public/private badges, search filter (name + description, case-insensitive), select repo, save button state, POST `/api/repos/select` call, `onUpdate` callback, saved confirmation, current repo banner, refresh |

#### Watch Mode

```bash
cd client
npm run test:watch
```

#### Coverage Report

```bash
cd client
npm run test:coverage
```

---

## NPM Commands

### Server (`server/`)

| Command | Description |
|---|---|
| `npm run dev` | Start Express server — `node src/server.js` |
| `npm start` | Same as `dev` — used by Render in production |
| `npm test` | Run all Jest tests with `--experimental-vm-modules` |
| `npm run cli` | Run the CLI sync tool directly — `node src/cli/index.js` |

### Client (`client/`)

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server on port 5173 (proxies `/api` to backend) |
| `npm run build` | Build production static bundle into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run Jest test suite once |
| `npm run test:watch` | Run Jest in interactive watch mode |
| `npm run test:coverage` | Run Jest with Istanbul coverage report |

---

## Security Model

### Encryption

Sensitive fields stored in MongoDB are encrypted with **AES-256-GCM** before being written and decrypted on read. The encrypted format is:

```
<iv_hex> | <authTag_hex> | <ciphertext_hex>
```

GCM mode provides both confidentiality and integrity — any tampering with the stored ciphertext causes decryption to return `null` rather than corrupted data.

**Encrypted fields:**
- `leetcodeCookie`
- `githubToken`
- `githubOAuthClientSecret`

The encryption key is derived from `ENCRYPTION_SECRET` (64-char hex = 32 bytes). Generate a fresh one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Credential Exposure

- `GET /api/config` returns **only presence flags** — never the raw cookie or token value.
- The Chrome extension's cookie capture never returns the raw session value to the popup — only `{ success: true, username }`.
- Credentials passed to the sync child process use environment variables, not CLI arguments (CLI args appear in `ps` output).
- GitHub tokens are embedded into clone URLs as `https://<token>@github.com/...` — these URLs are never logged.

### CORS Policy

The backend accepts cross-origin requests from:

| Origin | Why |
|---|---|
| `FRONTEND_URL` env var | Configured production/dev frontend |
| `https://code-sync-3sld.onrender.com` | Hardcoded production frontend (belt-and-suspenders) |
| `http://localhost:5173` / `http://127.0.0.1:5173` | Local dev |
| `http://localhost:3055` / `http://127.0.0.1:3055` | Local dev same-origin |
| Any `chrome-extension://` origin | Chrome extension service worker |
| No origin (null) | curl, Postman, same-origin server requests |

### OAuth CSRF Protection

The GitHub OAuth flow uses `crypto.randomUUID()` to generate a `state` parameter. States are stored in an in-memory `Map` and expire after 10 minutes. Any callback without a matching unexpired state is rejected.

---

## Troubleshooting

### Dashboard shows "Backend Unavailable"

The frontend tries `GET /api/config` on load. If it fails, a full-page error screen appears. **Start the backend first.**

### Extension shows "Backend offline"

The extension calls `GET /api/health` (3s timeout) before checking config. If health fails → "Backend offline". If health passes but config fails → per-field error states.

### Sync appears to succeed but nothing is pushed

Use the debug endpoint to see what actually happened:

```
GET https://codesync-api-5p2c.onrender.com/api/sync/debug
```

Check `autoSyncState.lastResult`. Common causes:
- `leetcodeUsername` is null — run a manual full sync first to populate it.
- `lastAutoSyncAt` has advanced past your recent submissions — reset it:

```
POST https://codesync-api-5p2c.onrender.com/api/sync/reset
```

Then trigger again:

```
POST https://codesync-api-5p2c.onrender.com/api/sync/auto/trigger
```

### LeetCode cookie validation fails

- `COOKIE_REQUIRED` — no cookie was sent in the request body.
- `SESSION_EXPIRED` — you're not logged in to LeetCode, or the session expired. Log in at [leetcode.com](https://leetcode.com) and re-capture.
- `VALIDATION_ERROR` — the backend couldn't reach LeetCode's GraphQL API. Check your internet connection or LeetCode's status page.

### Port 3055 already in use (`EADDRINUSE`)

**Windows:**
```powershell
netstat -ano | findstr :3055
taskkill /PID <PID> /F
```

**macOS / Linux:**
```bash
lsof -i :3055 | grep LISTEN
kill -9 <PID>
```

### `ECONNREFUSED` in Vite console

The Vite dev proxy (`/api → localhost:3055`) can't reach the backend.
1. Confirm `cd server && npm run dev` is running and shows the MongoDB connected message.
2. Check `client/vite.config.js` — the proxy target should be `https://codesync-api-5p2c.onrender.com` (points to Render so you don't need a local backend at all in development).

### Tests fail with `Cannot use import statement`

The server tests require `--experimental-vm-modules`. This is handled by the `npm test` script automatically:

```json
"test": "npx --node-options=\"--experimental-vm-modules\" jest"
```

If running Jest directly, add the flag manually:
```bash
npx --node-options="--experimental-vm-modules" jest
```

---

## Supported Languages

LeetCode language identifiers are mapped to file extensions automatically:

| Language | Extension | Language | Extension |
|---|---|---|---|
| Python / Python 3 | `.py` | Rust | `.rs` |
| JavaScript | `.js` | Ruby | `.rb` |
| TypeScript | `.ts` | Swift | `.swift` |
| Java | `.java` | Kotlin | `.kt` |
| C++ | `.cpp` | Dart | `.dart` |
| C | `.c` | PHP | `.php` |
| C# | `.cs` | Scala | `.scala` |
| Go | `.go` | Bash | `.sh` |
| SQL (MySQL/MSSQL/Oracle) | `.sql` | Elixir | `.ex` |
| Racket | `.rkt` | Erlang | `.erl` |

Unrecognised languages fall back to `.txt`.

---

## License

MIT
