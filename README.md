# ⚡ CodeSync

Sync your LeetCode accepted submissions directly into a GitHub repository — with the **original submission timestamps** preserved as commit dates. Your contribution graph will reflect green squares on the exact dates you solved each problem.

Features a **full dark-mode web dashboard**, **1-Click Chrome Extension auto-capture**, **Personal Access Token & GitHub OAuth sign-in**, **MongoDB encrypted persistence**, and **real-time terminal streaming**.

---

## 📋 Table of Contents

- [How It Works](#how-it-works)
- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Connecting Accounts](#connecting-accounts)
  - [Step 1 — Connect LeetCode](#step-1--connect-leetcode)
  - [Step 2 — Connect GitHub](#step-2--connect-github)
  - [Step 3 — Pick Repository & Sync](#step-3--pick-repository--sync)
- [Chrome Extension](#chrome-extension)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [NPM Commands](#npm-commands)
- [Troubleshooting](#troubleshooting)
- [Supported Languages](#supported-languages--extensions)

---

## How It Works

```
┌──────────────┐   1. Fetch solved    ┌──────────────┐   3. Commit & push   ┌──────────────┐
│   LeetCode   │ ───────────────────> │   CodeSync   │ ───────────────────> │  Your GitHub │
│   Account    │   submissions via    │   Backend    │   w/ original dates  │  Repository  │
└──────────────┘   GraphQL API        └──────────────┘                      └──────────────┘
```

1. **Fetches** all your accepted submissions from LeetCode's GraphQL API.
2. **Clones / Prepares** your targeted GitHub repository.
3. **Commits** each solution into structured folders (e.g. `1 Two Sum/1-two-sum.py`), backdating the commit with the **original LeetCode timestamp**.
4. **Pushes** all commits to your remote GitHub repository.

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
- **1-Click Cookie Capture**: Sends active LeetCode cookies directly to local backend.
- **Auto-Sync on Accept**: Content script detects when a submission status changes to "Accepted" on LeetCode and triggers an automatic incremental sync.

---

## Project Structure

```
Code_Sync/
├── client/                     # Vite + React Frontend Dashboard
│   ├── src/
│   │   ├── components/         # Connect, Repo, Sync, History sections
│   │   ├── App.jsx             # Main router & layout
│   │   └── index.css           # Modern dark design tokens
│   ├── vite.config.js          # Proxies /api requests to 127.0.0.1:3055
│   └── package.json
│
├── server/                     # Node.js + Express + MongoDB Backend
│   ├── src/
│   │   ├── config/             # DB connection & env validator
│   │   ├── leetcode/           # LeetCode GraphQL API client
│   │   ├── git/                # Local Git clone, commit & push engine
│   │   ├── storage/            # MongoDB models & AES encryption
│   │   ├── sync/               # Sync orchestrator
│   │   ├── app.js              # Express app & API routes
│   │   └── server.js           # Server boot entry point
│   ├── tests/                  # Unit tests (Jest)
│   └── package.json
│
├── extension/                  # Chrome Extension (MV3)
│   ├── manifest.json
│   ├── background.js           # Service worker & cookie capturer
│   ├── content.js              # DOM observer for Accepted solutions
│   └── popup.html / popup.js   # Extension UI
│
└── README.md
```

---

## NPM Commands

| Location | Command | Description |
|----------|---------|-------------|
| `server/` | `npm run dev` | Start backend server with hot reload on port 3055 |
| `server/` | `npm test` | Run backend Jest test suite |
| `client/` | `npm run dev` | Start Vite React dev server on port 5173 |
| `client/` | `npm run build` | Build static production bundle into `dist/` |

---

## Troubleshooting

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
