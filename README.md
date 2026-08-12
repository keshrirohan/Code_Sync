# ⚡ CodeSync

Sync your LeetCode submissions into a GitHub repository — with the **original submission timestamps** as commit dates. Your contribution graph will show green squares on the days you actually solved the problems.

Now with a **full web dashboard**, **GitHub OAuth sign-in**, and **Chrome extension** — zero manual token copy-pasting.

---

## 📋 Table of Contents

- [How It Works](#how-it-works)
- [What's New](#whats-new)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage: Web Dashboard (Recommended)](#usage-web-dashboard-recommended)
  - [Step 1 — Start the server](#step-1--start-the-server)
  - [Step 2 — Connect LeetCode](#step-2--connect-leetcode)
  - [Step 3 — Connect GitHub (OAuth)](#step-3--connect-github-oauth)
  - [Step 4 — Choose a Repository](#step-4--choose-a-repository)
  - [Step 5 — Sync](#step-5--sync)
- [Chrome Extension](#chrome-extension)
- [Usage: CLI](#usage-cli)
- [NPM Scripts](#npm-scripts)
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

## What's New

| Feature | Description |
|---------|-------------|
| 🖥️ **Web Dashboard** | Dark-mode React UI served at `http://localhost:3055` |
| 🔐 **GitHub OAuth** | One-click "Sign in with GitHub" — no PAT copy-pasting |
| 🧩 **Chrome Extension** | Auto-captures your LeetCode cookie with one click |
| 📡 **Live Sync Terminal** | Watch real-time progress as submissions are committed |
| 📜 **Sync History** | Full log of every run — date, repo, status, duration |

---

## Prerequisites

- **Node.js** v18 or later — [Download](https://nodejs.org/)
- **Git** installed and available in your terminal — [Download](https://git-scm.com/)
- A **GitHub repository** to push to
- A **LeetCode account** with solved problems

---

## Installation

```bash
# 1. Clone this repo
git clone https://github.com/your-username/codesync.git
cd codesync

# 2. Install dependencies
npm install

# 3. Build the React frontend (one-time)
npm run build:frontend
```

---

## Usage: Web Dashboard (Recommended)

### Step 1 — Start the server

```bash
npm run dashboard
```

Open **[http://localhost:3055](http://localhost:3055)** in your browser.

---

### Step 2 — Connect LeetCode

**Option A — Chrome Extension (1-Click Recommended)**
1. Load the `extension/` folder in `chrome://extensions` (see [Chrome Extension](#chrome-extension) section below).
2. Log in to [leetcode.com](https://leetcode.com).
3. Click the CodeSync toolbar icon and click **"Connect LeetCode Account"** — session cookies are captured automatically!

**Option B — Paste Cookie or Session ID Manually**
1. Go to [leetcode.com](https://leetcode.com) and log in.
2. Open DevTools (`F12`) → **Application** → **Cookies** → `https://leetcode.com`.
3. Copy the `LEETCODE_SESSION` value (or whole cookie string).
4. Paste it into the dashboard **Connect** page:
   ```
   LEETCODE_SESSION=eyJ...; csrftoken=abc123
   ```
   *(Raw session token `eyJ...` is also supported)*

---

### Step 3 — Connect GitHub

**Option A — Personal Access Token (1-Click Instant Setup)**
1. Click **[Generate Token on GitHub](https://github.com/settings/tokens/new?description=CodeSync&scopes=repo)** (pre-selected with `repo` scope).
2. Click **Generate token** and copy the token (`ghp_...`).
3. Paste the token into the **Connect** page → **GitHub** section and click **Connect with Token**.

**Option B — GitHub OAuth App**
1. Go to **[GitHub → Developer Settings → OAuth Apps → New](https://github.com/settings/applications/new)**.
2. Set Homepage URL to `http://localhost:3055` and Authorization Callback URL to `http://localhost:3055/api/auth/github/callback`.
3. Save Client ID and Client Secret in the Dashboard → Click **Sign in with GitHub**.

---

### Step 4 — Choose a Repository

Go to the **Repository** tab → search your repos → select one → click **Save Selection**.

---

### Step 5 — Sync

Go to the **Sync** tab and click **⚡ Start Sync**.

A live terminal streams real-time progress. When done, check your GitHub repo for new commits and the **History** tab for a run record.

> **Dry Run**: Toggle "Dry Run" to preview what would be committed without touching your repo.

---

## Chrome Extension

### Load the extension

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked** → select the `extension/` folder
4. The ⚡ CodeSync icon appears in your toolbar

### Use it

1. Go to [leetcode.com](https://leetcode.com) — make sure you're logged in
2. Click the **CodeSync icon** in the toolbar
3. The popup shows:
   - 🟢 **LeetCode Account** — shows your username when connected
   - 🟢 **Dashboard** — green if `npm run dashboard` is running
4. Click **"Connect LeetCode Account"** — auto-captures and links your account!

---

## Usage: CLI

The original CLI works exactly as before:

```bash
node src/index.js --cookie "<your-cookie>" --repo-url "<your-repo-url>"
```

### Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--cookie <string>` | ✅ Yes | Your LeetCode session cookie |
| `--repo-url <string>` | ✅ Yes | Git repo URL to push to (HTTPS or SSH) |
| `--dry-run` | No | Preview without committing |
| `--help` / `-h` | No | Show usage info |

### Examples

```bash
# Full sync
node src/index.js \
  --cookie "LEETCODE_SESSION=eyJ...; csrftoken=abc123" \
  --repo-url "https://github.com/yourname/leetcode-solutions.git"

# Dry run
node src/index.js \
  --cookie "LEETCODE_SESSION=eyJ...; csrftoken=abc123" \
  --repo-url "https://github.com/yourname/leetcode-solutions.git" \
  --dry-run
```

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dashboard` | Start the web dashboard at `http://localhost:3055` |
| `npm run build:frontend` | Build the React frontend (run once after install) |
| `npm run dev:frontend` | Vite dev server with hot reload (proxies to port 3055) |
| `npm start` | Run the CLI directly |
| `npm test` | Run unit tests |

---

## Project Structure

```
codesync/
├── package.json
├── .gitignore
├── README.md
│
├── src/                        # Backend
│   ├── index.js                # CLI entry point
│   ├── config.js               # CLI argument parser
│   ├── handler.js              # Orchestrator: fetch → commit → push
│   ├── leetcodeClient.js       # LeetCode GraphQL API client
│   ├── gitClient.js            # Git operations (clone, commit, push)
│   ├── server.js               # Express API + SSE streaming server
│   └── storage.js              # Atomic JSON persistence (config + history)
│
├── frontend/                   # React dashboard (Vite)
│   ├── src/
│   │   ├── App.jsx             # Root — navigation, OAuth redirect handling
│   │   ├── index.css           # Dark glassmorphism design system
│   │   └── components/
│   │       ├── Sidebar.jsx         # Navigation + live status panel
│   │       ├── ConnectSection.jsx  # LeetCode + GitHub OAuth connect cards
│   │       ├── RepoSection.jsx     # Searchable repository picker
│   │       ├── SyncSection.jsx     # Sync trigger + live SSE terminal
│   │       └── HistorySection.jsx  # Sync history table + stats
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── extension/                  # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   └── icon*.png
│
├── tests/
│   ├── handler.test.js
│   └── config.test.js
│
└── data/                       # Auto-created, gitignored
    └── config.json             # OAuth credentials + sync history (local only)
```

---

## Running Tests

```bash
npm test
```

Tests mock both the LeetCode client and Git client — no real API calls made.

---

## FAQ

### How is GitHub OAuth different from a PAT?

With OAuth:
- You click "Sign in with GitHub", approve on GitHub, and you're done
- CodeSync never sees your password
- Token is issued automatically with the `repo` scope

With a PAT (fallback):
- You manually generate a token on GitHub and paste it in
- Still works — available via "Use a token instead"

### Where are my credentials stored?

In `data/config.json` on your local machine. This folder is **gitignored** and never committed. The dashboard server runs entirely locally — nothing is sent to any external service by CodeSync.

### Why does the OAuth app need `repo` scope?

To push commits to your repositories. The `repo` scope gives read/write access to your repos. For a public-only setup, `public_repo` scope is sufficient — you can set that when registering the OAuth App.

### Will it duplicate commits if I run it again?

Currently yes — re-running creates new commits for all submissions. Best practice: run it once against an **empty repository**. Future versions will track already-synced submissions to avoid duplication.

### My LeetCode cookie expired. What do I do?

Log in to LeetCode again and either:
- Use the **Chrome extension** to re-send the fresh cookie, or
- Paste the new cookie in the Connect page

### How long does a full sync take?

About **1–2 seconds per submission** due to polite API delays. ~50 problems ≈ 1–2 minutes.

### What languages are supported?

All LeetCode languages are mapped to file extensions:

| Language | Extension | Language | Extension |
|----------|-----------|----------|-----------|
| python / python3 | `.py` | rust | `.rs` |
| javascript | `.js` | ruby | `.rb` |
| typescript | `.ts` | swift | `.swift` |
| java | `.java` | kotlin | `.kt` |
| cpp | `.cpp` | dart | `.dart` |
| c | `.c` | scala | `.scala` |
| csharp | `.cs` | php | `.php` |
| golang | `.go` | bash | `.sh` |
| mysql / mssql / oraclesql | `.sql` | erlang | `.erl` |
| elixir | `.ex` | racket | `.rkt` |

Any unrecognized language falls back to `.txt`.

---

## License

MIT
