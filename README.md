# ⚡ CodeSync

Sync your LeetCode accepted submissions directly into a GitHub repository — with the **original submission timestamps** preserved as commit dates. Your contribution graph will reflect green squares on the exact dates you solved each problem.

Features a **full dark-mode web dashboard**, **1-Click Chrome Extension auto-capture**, **Personal Access Token & GitHub OAuth sign-in**, **MongoDB encrypted persistence**, **real-time terminal streaming**, and a **comprehensive health/status API**.

---

## 📋 Table of Contents

- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Connecting Accounts](#connecting-accounts)
  - [Step 1 — Connect LeetCode](#step-1--connect-leetcode)
  - [Step 2 — Connect GitHub](#step-2--connect-github)
  - [Step 3 — Pick Repository & Sync](#step-3--pick-repository--sync)
- [Chrome Extension](#chrome-extension)
- [Auto-Sync](#auto-sync)
- [API Reference](#api-reference)
- [Connection Status Flow](#connection-status-flow)
- [Testing](#testing)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [NPM Commands](#npm-commands)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Supported Languages](#supported-languages--extensions)

---

## How It Works

```
┌──────────────┐   1. Fetch solved    ┌──────────────┐   3. Commit & push   ┌──────────────┐
│   LeetCode   │ ──────────────────→ │   CodeSync   │ ──────────────────→ │  Your GitHub │
│   Account    │   submissions via    │   Backend    │   w/ original dates  │  Repository  │
└──────────────┘   GraphQL API        └──────────────┘                      └──────────────┘
```

1. **Fetches** all your accepted submissions from LeetCode's GraphQL API.
2. **Clones / Prepares** your targeted GitHub repository.
3. **Commits** each solution into structured folders (e.g. `1 Two Sum/1-two-sum.py`), backdating the commit with the **original LeetCode timestamp**.
4. **Pushes** all commits to your remote GitHub repository.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CodeSync System                              │
│                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐   ┌─────────────────┐  │
│  │   Chrome Ext.   │    │  React Dashboard │   │   Express API   │  │
│  │   (MV3 SW)      │    │  (Vite :5173)    │   │   (:3055)       │  │
│  │                  │    │                  │   │                 │  │
│  │ • Cookie capture │    │ • Connect accts  │   │ • /api/health   │  │
│  │ • Auto-sync on   │    │ • Select repo    │   │ • /api/status   │  │
│  │   accept         │◄──►│ • Start sync     │◄──►│ • /api/config   │  │
│  │ • Popup UI       │    │ • View history   │   │ • /api/auth/*   │  │
│  │ • AbortController│    │ • Backend status │   │ • /api/sync/*   │  │
│  │   timeouts       │    │ • Error banners  │   │ • /api/history  │  │
│  └─────────────────┘    └─────────────────┘   └────────┬────────┘  │
│                                                         │           │
│                           ┌─────────────────────────────┼────────┐  │
│                           │                             ▼        │  │
│                           │  ┌─────────┐   ┌───────────────────┐ │  │
│                           │  │ MongoDB │   │   LeetCode API    │ │  │
│                           │  │ Atlas   │   │   (GraphQL)       │ │  │
│                           │  │ (AES)   │   └───────────────────┘ │  │
│                           │  └─────────┘                         │  │
│                           └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Features

| Feature | Description |
|---------|-------------|
| 🖥️ **React Web Dashboard** | Sleek dark-mode interface built with Vite (`http://localhost:5173`) |
| ⚡ **1-Click Chrome Extension** | Auto-captures LeetCode session cookies without DevTools |
| 🔑 **Instant GitHub Connect** | 1-Click Personal Access Token (PAT) setup or GitHub OAuth App |
| 🔒 **MongoDB Encrypted Storage** | Credentials encrypted using AES-256-GCM |
| 📡 **Live Streaming Terminal** | Real-time SSE logs of fetching, committing, and pushing |
| 📜 **Run History & Dry Run** | Full audit log of sync runs and safe dry-run preview mode |
| 🏥 **Health & Status API** | Lightweight `/api/health` and detailed `/api/status` endpoints for monitoring |
| 🔄 **Auto-Sync on Accept** | Content script detects LeetCode "Accepted" and triggers incremental sync |
| 🛡️ **Granular Error States** | Dashboard and extension distinguish "Backend offline" from "LeetCode not connected" |
| ✅ **Comprehensive Test Suite** | 55 Jest tests covering validation, API endpoints, and extension payloads |

---

## Prerequisites

- **Node.js** v18 or later — [Download Node.js](https://nodejs.org/)
- **Git** installed and available in terminal — [Download Git](https://git-scm.com/)
- A **MongoDB Atlas database** (or local MongoDB)
- A **GitHub account** & target repository
- A **LeetCode account** with solved problems

---

## Installation & Setup

### 1. Clone & Install Dependencies

```bash
# Clone the repository
git clone https://github.com/keshrirohan/Code_Sync.git
cd Code_Sync

# Install root dependencies
npm install

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Configure Server Environment Variables

Create or edit `server/.env`:

```env
# MongoDB Connection String
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/CodeSync

# 64-character hex secret for AES-256-GCM encryption
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_SECRET=your-64-character-hex-encryption-secret

# Server Port (default: 3055)
PORT=3055

# Frontend & Backend URLs
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3055
```

### 3. Start the Servers

> **Important:** Always start the backend _before_ the frontend. The Vite dev server proxies `/api` requests to `127.0.0.1:3055` — if the backend isn't running, you'll see `ECONNREFUSED` proxy errors.

**Terminal 1 — Backend Server (`port 3055`)**:
```bash
cd server
npm run dev
```

**Terminal 2 — Frontend Dashboard (`port 5173`)**:
```bash
cd client
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## Connecting Accounts

### Step 1 — Connect LeetCode

**Option A — Chrome Extension (1-Click Recommended)**:
1. Load `extension/` in Chrome (`chrome://extensions` → enable **Developer mode** → **Load unpacked**).
2. Log in to [leetcode.com](https://leetcode.com).
3. Click the **CodeSync icon** in toolbar → click **"Connect LeetCode Account"** — cookies are captured automatically!

**Option B — Paste Session Cookie Manually**:
1. Log in to [leetcode.com](https://leetcode.com).
2. Open DevTools (`F12`) → **Application** → **Cookies** → `https://leetcode.com`.
3. Copy `LEETCODE_SESSION` value (or full cookie string) and paste into Dashboard → **Connect Accounts**.

---

### Step 2 — Connect GitHub

**Option A — Personal Access Token (Instant Setup)**:
1. Click **[Generate Token on GitHub](https://github.com/settings/tokens/new?description=CodeSync&scopes=repo)** (pre-configured with `repo` scope).
2. Copy your token (`ghp_...` or `github_pat_...`).
3. Paste into Dashboard → **Connect Accounts** → **GitHub** tab → click **Connect with Token**.

**Option B — GitHub OAuth App**:
1. Go to **[GitHub Developer Settings → OAuth Apps → New](https://github.com/settings/applications/new)**.
2. Set Homepage URL to `http://localhost:3055` and Callback URL to `http://localhost:3055/api/auth/github/callback`.
3. Save **Client ID** and **Client Secret** in Dashboard → click **Sign in with GitHub**.

---

### Step 3 — Pick Repository & Sync

1. Navigate to **Repository** in the dashboard.
2. Search and select your GitHub repository.
3. Click **Save Selection**.
4. Go to **Sync** tab → click **⚡ Start Sync**.

---

## Chrome Extension

### How to Install
1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension` folder from this repository
4. Pin the ⚡ **CodeSync** extension to your Chrome toolbar

### Features
- **1-Click Cookie Capture**: Sends active LeetCode cookies directly to local backend — the raw cookie is **never** returned to the popup UI.
- **Auto-Sync on Accept**: Content script detects when a submission status changes to "Accepted" on LeetCode and triggers an automatic incremental sync.
- **Backend Status Detection**: The popup distinguishes between "Backend offline" and "LeetCode not connected" using the `/api/health` endpoint.
- **Connection Timeout**: All fetch calls use `AbortController` with an 8-second timeout to prevent indefinite hangs in the service worker.

### Extension ↔ Backend Endpoints

| Extension Action | Backend Endpoint | Method |
|-----------------|------------------|--------|
| Check backend health | `/api/health` | GET |
| Load config/status | `/api/config` | GET |
| Capture LeetCode cookie | `/api/auth/leetcode-from-extension` | POST |
| Trigger incremental sync | `/api/sync/auto/trigger` | POST |
| Get last sync entry | `/api/history` | GET |

---

## Auto-Sync

CodeSync supports automatic incremental syncing of new submissions:

### How It Works
1. **On Accept Detection**: The content script (`content.js`) monitors LeetCode problem pages for "Accepted" results and sends a message to the background service worker.
2. **Alarm-based Polling**: A configurable Chrome alarm periodically triggers a sync check (default: every 10 minutes).
3. **Incremental Sync**: Only submissions newer than `lastAutoSyncAt` are fetched, committed, and pushed — no full re-sync needed.

### Server-side Configuration
The backend exposes auto-sync management endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync/auto/status` | GET | Current auto-sync state, interval, last run, and next scheduled run |
| `/api/sync/auto/config` | POST | Enable/disable auto-sync and set interval (`{ enabled, intervalMinutes }`) |
| `/api/sync/auto/trigger` | POST | Manually trigger an incremental sync |

---

## API Reference

### Health & Status

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Lightweight health check — returns `{ ok, timestamp, uptime }`. **Does not depend on MongoDB.** |
| `/api/status` | GET | Full dependency status — returns `{ backend, mongodb, leetcode, github }` |
| `/api/config` | GET | Safe configuration view — returns presence flags (`hasLeetcodeCookie`, `hasGithubToken`) and usernames. **Never exposes raw credentials.** |

#### `GET /api/health` — Response
```json
{
  "ok": true,
  "timestamp": "2026-08-15T00:00:00.000Z",
  "uptime": 1234.56
}
```

#### `GET /api/status` — Response
```json
{
  "backend": "online",
  "mongodb": "connected",
  "leetcode": "connected",
  "github": "connected"
}
```

Possible values:
- `mongodb`: `"connected"` | `"connecting"` | `"disconnected"`
- `leetcode`: `"connected"` | `"not_connected"` | `"session_stored"`
- `github`: `"connected"` | `"not_connected"` | `"token_stored"`

#### `GET /api/config` — Response
```json
{
  "hasLeetcodeCookie": true,
  "leetcodeUsername": "your_username",
  "hasGithubToken": true,
  "githubUsername": "your_github",
  "githubAvatar": "https://avatars.githubusercontent.com/...",
  "targetRepoUrl": "https://github.com/you/repo.git",
  "targetRepoName": "you/repo"
}
```

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/leetcode` | POST | Validate & store LeetCode session cookie — body: `{ cookie }` |
| `/api/auth/leetcode-from-extension` | POST | Same as above, used by Chrome extension |
| `/api/auth/leetcode` | DELETE | Disconnect LeetCode account |
| `/api/auth/github` | POST | Validate & store GitHub PAT — body: `{ token }` |
| `/api/auth/github` | DELETE | Disconnect GitHub account |
| `/api/auth/github/oauth-status` | GET | Check if OAuth is configured |
| `/api/auth/github/login` | GET | Initiate OAuth flow (redirects to GitHub) |
| `/api/auth/github/callback` | GET | OAuth callback handler |
| `/api/auth/github/oauth-setup` | POST | Configure OAuth credentials — body: `{ clientId, clientSecret }` |

### Structured Error Codes (LeetCode Auth)

The LeetCode auth endpoints return structured error codes for programmatic handling:

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `COOKIE_REQUIRED` | 400 | No cookie provided in request body |
| `SESSION_INVALID` | 401 | LeetCode rejected the session |
| `SESSION_EXPIRED` | 401 | Session was valid format but LeetCode says not signed in |
| `VALIDATION_ERROR` | 502 | Network error reaching LeetCode |
| `STORAGE_ERROR` | 500 | MongoDB write failed |

### Sync & History

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync/start` | POST | Start a full sync job — returns `{ jobId }` |
| `/api/sync/:jobId/stream` | GET | SSE stream of sync progress logs |
| `/api/history` | GET | List all sync history entries |
| `/api/history/:id` | DELETE | Delete a history entry |
| `/api/repos` | GET | List user's GitHub repositories |
| `/api/repos/select` | POST | Set target repository — body: `{ repoUrl, repoName }` |

---

## Connection Status Flow

The dashboard and extension use a multi-step flow to determine connection status:

```
1. GET /api/health
   ├── Fails → "Backend offline" (red banner, retry button)
   └── OK → Continue to step 2

2. GET /api/config
   ├── hasLeetcodeCookie: false → "LeetCode: Not connected"
   ├── hasLeetcodeCookie: true  → "LeetCode: @username" (green)
   ├── hasGithubToken: false    → "GitHub: Not connected"
   └── hasGithubToken: true     → "GitHub: @username" (green)

3. All connected + repo selected → "Ready to sync"
```

The extension popup shows three distinct states:
- 🔴 **Backend offline** — CodeSync server is not running
- 🔴 **Not connected** — Backend is up but LeetCode cookie is missing
- 🟢 **Connected** — LeetCode validated, shows `@username`

---

## Testing

The project includes a comprehensive Jest test suite with **55 tests** across 5 test files:

```bash
cd server
npm test
```

### Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `leetcode.test.js` | 18 | Cookie normalization, CSRF extraction, session validation, error codes |
| `api.test.js` | 17 | Health, config, status, LeetCode auth, GitHub OAuth, connection combos |
| `extension-payload.test.js` | 9 | Extension → backend communication contract, edge cases |
| `handler.test.js` | 5 | Sync orchestrator with mocked LeetCode/Git clients |
| `config.test.js` | 4 | CLI argument parsing and validation |

### What's Tested

- **`normalizeLeetcodeCookie()`** — handles bare values, existing prefixes, missing csrftoken, null/empty/non-string input
- **`extractCsrfToken()`** — extracts from cookie strings, fallback defaults
- **`validateLeetcodeCookie()`** — mocked success, expired session, HTTP errors, network failures, correct headers
- **`GET /api/health`** — returns 200 with `{ ok: true }`, works even if MongoDB is down
- **`GET /api/config`** — returns expected shape, never leaks raw credentials
- **`GET /api/status`** — returns dependency statuses for all service combinations
- **`POST /api/auth/leetcode`** — validates missing cookie (400), expired session (401), valid cookie (200), unreachable LeetCode (502)
- **`POST /api/auth/leetcode-from-extension`** — validates extension payload format, edge cases, response shape
- **Cookie security** — response never contains raw `LEETCODE_SESSION` value
- **Connection status combinations** — LeetCode + GitHub connected/disconnected matrix

### Running Tests

```bash
# Run all tests with verbose output
cd server
npm test

# The test command uses experimental VM modules for ESM support:
# npx --node-options="--experimental-vm-modules" jest
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | ✅ Yes | — | MongoDB Atlas connection string |
| `ENCRYPTION_SECRET` | ✅ Yes | — | 64-character hex key for AES-256-GCM encryption |
| `PORT` | No | `3055` | Backend server listen port |
| `FRONTEND_URL` | No | `http://localhost:5173` | Frontend URL (used for CORS and OAuth redirects) |
| `BACKEND_URL` | No | `http://localhost:3055` | Backend URL (used for OAuth callback URL) |
| `GITHUB_CLIENT_ID` | No | — | GitHub OAuth App Client ID (alternative to DB config) |
| `GITHUB_CLIENT_SECRET` | No | — | GitHub OAuth App Client Secret (alternative to DB config) |

---

## Project Structure

```
Code_Sync/
├── client/                     # Vite + React Frontend Dashboard
│   ├── src/
│   │   ├── components/         # Connect, Repo, Sync, History, Sidebar
│   │   │   ├── ConnectSection.jsx
│   │   │   ├── RepoSection.jsx
│   │   │   ├── SyncSection.jsx
│   │   │   ├── HistorySection.jsx
│   │   │   └── Sidebar.jsx     # Status footer with backend-offline detection
│   │   ├── App.jsx             # Main router, layout, backendOffline state
│   │   ├── main.jsx            # React entry point
│   │   └── index.css           # Modern dark design tokens
│   ├── vite.config.js          # Proxies /api requests to 127.0.0.1:3055
│   └── package.json
│
├── server/                     # Node.js + Express + MongoDB Backend
│   ├── src/
│   │   ├── config/
│   │   │   └── env.js          # Environment variable validation
│   │   ├── leetcode/
│   │   │   └── leetcodeClient.js  # LeetCode GraphQL API client
│   │   ├── git/
│   │   │   └── gitClient.js    # Local Git clone, commit & push engine
│   │   ├── storage/
│   │   │   └── storage.js      # MongoDB models & AES-256-GCM encryption
│   │   ├── sync/
│   │   │   ├── handler.js      # Sync orchestrator (full & incremental)
│   │   │   └── readmeGenerator.js  # Auto-generate repo README
│   │   ├── middleware/
│   │   │   ├── errorHandler.js # Centralized error handler
│   │   │   └── requestLogger.js
│   │   ├── utils/
│   │   │   └── logger.js       # Winston logger
│   │   ├── app.js              # Express app, API routes, exports
│   │   └── server.js           # Server boot entry point
│   ├── tests/                  # Jest unit & integration tests
│   │   ├── leetcode.test.js    # Cookie normalization & validation
│   │   ├── api.test.js         # API endpoint integration tests
│   │   ├── extension-payload.test.js  # Extension contract tests
│   │   ├── handler.test.js     # Sync orchestrator tests
│   │   └── config.test.js      # CLI config parser tests
│   └── package.json
│
├── extension/                  # Chrome Extension (Manifest V3)
│   ├── manifest.json           # Permissions: cookies, storage, alarms, tabs
│   ├── background.js           # Service worker, cookie capture, AbortController timeouts
│   ├── content.js              # DOM observer for Accepted submissions
│   ├── popup.html              # Extension popup UI (dark theme)
│   ├── popup.js                # Popup logic with backend-offline detection
│   └── icons/                  # Extension icons (16, 48, 128px)
│
├── .gitignore                  # Ignores node_modules, .env, server/.env, data/
└── README.md
```

---

## NPM Commands

| Location | Command | Description |
|----------|---------|-------------|
| `server/` | `npm run dev` | Start backend server on port 3055 |
| `server/` | `npm test` | Run all 55 Jest tests |
| `server/` | `npm start` | Start backend in production mode |
| `client/` | `npm run dev` | Start Vite React dev server on port 5173 |
| `client/` | `npm run build` | Build static production bundle into `dist/` |

---

## Security

### Credential Handling
- **LeetCode session cookies** and **GitHub tokens** are encrypted with **AES-256-GCM** before storage in MongoDB.
- The `GET /api/config` endpoint only returns presence flags (`hasLeetcodeCookie: true/false`) — **raw credentials are never exposed** in API responses.
- The Chrome extension **never returns the raw cookie** to the popup UI context after capture — only the success flag and username.

### Cookie Normalization
The backend normalizes incoming cookie strings to ensure consistency:
- Bare session values are automatically prefixed with `LEETCODE_SESSION=`
- Missing `csrftoken` is auto-appended with a default value
- The `extractCsrfToken()` helper extracts the CSRF token for LeetCode's GraphQL headers

### CORS Policy
The backend accepts requests from:
- The configured `FRONTEND_URL` (default: `http://localhost:5173`)
- `http://127.0.0.1:5173` and `http://localhost:3055`
- Any `chrome-extension://` origin (for the Chrome extension)

### Environment Secrets
Both `.env` and `server/.env` are git-ignored. The required environment variables (`MONGODB_URI`, `ENCRYPTION_SECRET`) are validated at startup — the server exits with a clear error message if they're missing.

---

## Troubleshooting

### Backend Must Start First
The Vite dev server proxies `/api` requests to `127.0.0.1:3055`. If the backend isn't running, you'll see:
```
[vite] http proxy error: /api/config ECONNREFUSED 127.0.0.1:3055
```
**Fix:** Start the backend first (`cd server && npm run dev`), then start the frontend.

### Dashboard Shows "Backend Unavailable"
The dashboard will show a full-page "Backend Unavailable" screen with instructions if it can't reach `/api/config`. This means the backend server isn't running or isn't reachable.

### Extension Shows "Backend offline"
The extension popup checks `/api/health` before loading config. If health check fails, it shows "Backend offline" instead of generic "Not connected" — start the backend and reopen the popup.

### Proxy `ECONNREFUSED` in Vite
If Vite shows `http proxy error: /api/... ECONNREFUSED`:
1. Ensure backend is running (`cd server && npm run dev`).
2. Verify `client/vite.config.js` proxy targets `http://127.0.0.1:3055`.

### Port `3055` Already in Use (`EADDRINUSE`)
If backend fails to start because port 3055 is in use:
- **Windows (PowerShell)**:
  ```powershell
  netstat -ano | findstr :3055
  taskkill /PID <PID> /F
  ```
- **macOS / Linux**:
  ```bash
  lsof -i :3055
  kill -9 <PID>
  ```

### LeetCode Cookie Validation Fails
- Ensure you are **logged in** to [leetcode.com](https://leetcode.com) in the same browser.
- LeetCode sessions expire — if you get `SESSION_EXPIRED`, log in again and re-capture.
- Check if LeetCode is reachable — a `VALIDATION_ERROR` code means the backend couldn't reach LeetCode's GraphQL API.

### Tests Failing
```bash
cd server
npm test
```
- Tests use `--experimental-vm-modules` for ESM mock support — this is handled automatically by the test script.
- All tests use mocked storage and network layers — no real MongoDB or LeetCode connection is needed.

---

## Supported Languages & Extensions

LeetCode code snippets are mapped to file extensions automatically:

| Language | Extension | Language | Extension |
|----------|-----------|----------|-----------|
| Python / Python3 | `.py` | Rust | `.rs` |
| JavaScript | `.js` | Ruby | `.rb` |
| TypeScript | `.ts` | Swift | `.swift` |
| Java | `.java` | Kotlin | `.kt` |
| C++ | `.cpp` | Dart | `.dart` |
| C | `.c` | Scala | `.scala` |
| C# | `.cs` | PHP | `.php` |
| Go | `.go` | Bash | `.sh` |
| SQL | `.sql` | Elixir | `.ex` |

---

## License

MIT
