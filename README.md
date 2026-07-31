# ⚡ CodeSync

Sync your LeetCode submissions into a GitHub repository — with the **original submission timestamps** as commit dates. Your contribution graph will show green squares on the days you actually solved the problems.

Now with a **full web dashboard** and **Chrome extension** — no more copy-pasting cookies from DevTools.

---

## 📋 Table of Contents

- [How It Works](#how-it-works)
- [What's New — Dashboard & Extension](#whats-new--dashboard--extension)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage: Web Dashboard (Recommended)](#usage-web-dashboard-recommended)
- [Usage: CLI](#usage-cli)
- [Chrome Extension](#chrome-extension)
- [Project Structure](#project-structure)
- [Running Tests](#running-tests)
- [FAQ](#faq)

---

## How It Works

```
┌──────────────┐   fetch all    ┌──────────────┐   commit each   ┌──────────────┐
│   LeetCode   │ ─────────────> │   CodeSync   │ ─────────────-> │  Your GitHub │
│   Account    │  submissions   │  (CLI / UI)  │  w/ original    │     Repo     │
└──────────────┘                └──────────────┘   timestamps    └──────────────┘
```

1. **Fetches** all your accepted submissions from LeetCode's GraphQL API
2. **Clones** your target Git repo locally
3. **Commits** each submission as a separate file, using the original LeetCode timestamp
4. **Pushes** all commits to your remote repo in one go

Each submission becomes a folder like `1 Two Sum/` containing a file like `1-two-sum.py`.

---

## What's New — Dashboard & Extension

### 🖥️ Web Dashboard (`npm run dashboard`)

A dark-mode React dashboard served at **http://localhost:3055**:

| Section | What you do |
|---------|-------------|
| **Connect** | Paste your LeetCode cookie and GitHub PAT once — they're saved locally |
| **Repository** | Browse and search all your GitHub repos, pick the target |
| **Sync** | One-click sync with a live terminal showing real-time progress |
| **History** | Full log of every sync run — date, repo, status, duration |

### 🧩 Chrome Extension (`extension/`)

Load the extension in developer mode and it:
- Reads your `LEETCODE_SESSION` + `csrftoken` cookies **automatically** (no DevTools)
- Sends them to the dashboard with one click

---

## Prerequisites

- **Node.js** v18 or later — [Download](https://nodejs.org/)
- **Git** installed and available in your terminal — [Download](https://git-scm.com/)
- A **GitHub repository** to push to (HTTPS or SSH)
- A **LeetCode account** with solved problems

---

## Installation

```bash
# 1. Clone this repo
git clone https://github.com/your-username/codesync.git
cd codesync

# 2. Install dependencies
npm install

# 3. Build the frontend (first time only)
npm run build:frontend
```

---

## Usage: Web Dashboard (Recommended)

### Step 1 — Start the server

```bash
npm run dashboard
```

Open **http://localhost:3055** in your browser.

### Step 2 — Connect LeetCode

Either:

**A) Use the Chrome Extension** (easiest — see [Chrome Extension](#chrome-extension) below)

**B) Paste the cookie manually:**
1. Go to [leetcode.com](https://leetcode.com) and log in
2. Open DevTools (F12) → **Application** → **Cookies** → `https://leetcode.com`
3. Copy `LEETCODE_SESSION` and `csrftoken` values
4. Paste into the dashboard as: `LEETCODE_SESSION=eyJ...; csrftoken=abc123`

### Step 3 — Connect GitHub

1. Go to [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens/new?description=CodeSync&scopes=repo)
2. Create a token with **`repo`** scope
3. Paste it in the **GitHub** card on the Connect page

### Step 4 — Choose a Repository

Go to the **Repository** tab, search your repos, select one, and click **Save Selection**.

### Step 5 — Sync!

Go to the **Sync** tab and click **⚡ Start Sync**.

Watch live progress in the terminal window. When done, check your **GitHub repo** for new commits and your **History** tab for a record of the run.

> **Dry Run mode**: Toggle "Dry Run" to preview what would be committed without touching your repo.

---

## Usage: CLI

The original CLI is still available and works exactly as before:

```bash
node src/index.js --cookie "<your-cookie>" --repo-url "<your-repo-url>"
```

### Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--cookie <string>` | ✅ Yes | Your LeetCode session cookie |
| `--repo-url <string>` | ✅ Yes | Git repo URL to push commits to |
| `--dry-run` | No | Preview without committing |
| `--help` / `-h` | No | Show usage info |

### Examples

```bash
# Full sync
node src/index.js \
  --cookie "LEETCODE_SESSION=eyJ...; csrftoken=abc123" \
  --repo-url "https://github.com/yourname/leetcode-solutions.git"

# Dry run (preview only)
node src/index.js \
  --cookie "LEETCODE_SESSION=eyJ...; csrftoken=abc123" \
  --repo-url "https://github.com/yourname/leetcode-solutions.git" \
  --dry-run

# SSH repo URL
node src/index.js \
  --cookie "LEETCODE_SESSION=eyJ...; csrftoken=abc123" \
  --repo-url "git@github.com:yourname/leetcode-solutions.git"
```

---

## Chrome Extension

### Loading the extension

1. Open **Chrome** → go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked** → select the `extension/` folder from this repo
4. The CodeSync ⚡ icon appears in your toolbar

### Using the extension

1. Go to [leetcode.com](https://leetcode.com) and make sure you're logged in
2. Click the **CodeSync extension icon** in your toolbar
3. The popup shows:
   - ✅ **LeetCode** — green if you're logged in to LeetCode
   - ✅ **Dashboard** — green if `npm run dashboard` is running
4. Click **"Send Cookie to Dashboard"** — done!

The dashboard's Connect page will instantly show your LeetCode account as connected.

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dashboard` | Start the web dashboard at http://localhost:3055 |
| `npm run build:frontend` | Build the React frontend (run once after install) |
| `npm run dev:frontend` | Start Vite dev server with hot reload (proxy → port 3055) |
| `npm start` | Run the CLI directly |
| `npm test` | Run unit tests |

---

## Project Structure

```
codesync/
├── package.json               # Root config + scripts
├── .gitignore
├── README.md
│
├── src/                       # Core backend
│   ├── index.js               # CLI entry point
│   ├── config.js              # CLI argument parser
│   ├── handler.js             # Orchestrator (fetch → commit → push)
│   ├── leetcodeClient.js      # LeetCode GraphQL API client
│   ├── gitClient.js           # Git operations (clone, commit, push)
│   ├── server.js              # Express API server + SSE streaming  ← NEW
│   └── storage.js             # Atomic JSON persistence             ← NEW
│
├── frontend/                  # React dashboard (Vite)              ← NEW
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css          # Dark glassmorphism design system
│   │   └── components/
│   │       ├── Sidebar.jsx
│   │       ├── ConnectSection.jsx
│   │       ├── RepoSection.jsx
│   │       ├── SyncSection.jsx
│   │       └── HistorySection.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── extension/                 # Chrome Extension (MV3)              ← NEW
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   └── icon*.png
│
├── tests/
│   ├── handler.test.js
│   └── config.test.js
│
└── data/                      # Auto-created, gitignored
    └── config.json            # Stored credentials + history
```

### What each new file does

| File | Responsibility |
|------|----------------|
| `src/server.js` | Express server — serves the React app, exposes REST API, streams sync progress via SSE |
| `src/storage.js` | Reads/writes `data/config.json` and `data/history.json` atomically |
| `frontend/` | Vite + React single-page app with 4 sections: Connect, Repository, Sync, History |
| `extension/` | Chrome MV3 extension that reads LeetCode cookies and POSTs them to the local server |

---

## Running Tests

```bash
# Run all tests
npm test

# Run a specific test file
npx jest tests/handler.test.js
npx jest tests/config.test.js
```

Tests use mocked LeetCode and Git clients — they never make real API calls.

---

## FAQ

### Why do I need a cookie? Can't I use username/password?

LeetCode doesn't have a public OAuth API. The session cookie is the only way to authenticate. The Chrome extension makes grabbing it completely painless.

### Why a Personal Access Token (PAT) for GitHub? No OAuth?

A PAT is simpler — no GitHub App registration, no callback URL, no client secrets. Generate one with `repo` scope in 30 seconds. The token is stored only in `data/config.json` on your local machine (gitignored).

### How long does a full sync take?

About **1–2 seconds per submission** due to polite delays between API calls. ~50 problems takes around 1–2 minutes.

### Will it duplicate commits if I run it again?

Currently yes — re-running creates new commits for all submissions. Best practice: run it once against an **empty repository**. Future versions will track already-synced submissions.

### My cookie expired. What do I do?

Log in to LeetCode again and either use the Chrome extension to re-send, or paste a fresh cookie in the Connect section.

### Where is my data stored? Is it secure?

Credentials are stored in `data/config.json` on your local machine. This folder is gitignored and never committed. The server only runs locally — nothing is sent to any external service by CodeSync itself.

### What languages are supported?

All LeetCode languages are mapped to file extensions:

| LeetCode Language | Extension |
|-------------------|-----------|
| python / python3 | `.py` |
| javascript | `.js` |
| typescript | `.ts` |
| java | `.java` |
| cpp | `.cpp` |
| c | `.c` |
| csharp | `.cs` |
| golang | `.go` |
| rust | `.rs` |
| ruby | `.rb` |
| swift | `.swift` |
| kotlin | `.kt` |
| dart | `.dart` |
| scala | `.scala` |
| php | `.php` |
| bash | `.sh` |
| mysql / mssql / oraclesql | `.sql` |
| erlang | `.erl` |
| elixir | `.ex` |
| racket | `.rkt` |

Any unrecognized language falls back to `.txt`.

---

## License

MIT
