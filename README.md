# 🔄 CodeSync

Sync your LeetCode submissions into a Git repository — with the **original submission timestamps** as commit dates. Your GitHub contribution graph will show green squares on the days you actually solved the problems.

---

## 📋 Table of Contents

- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Getting Your LeetCode Cookie](#getting-your-leetcode-cookie)
- [Usage](#usage)
- [Flags](#flags)
- [Examples](#examples)
- [Project Structure](#project-structure)
- [Running Tests](#running-tests)
- [FAQ](#faq)

---

## How It Works

```
┌──────────────┐     fetch all      ┌──────────────┐     commit each     ┌──────────────┐
│   LeetCode   │ ──────────────────>│   CodeSync   │ ──────────────────> │  Your GitHub  │
│   Account    │   solved problems  │   (this CLI) │   with original     │     Repo      │
└──────────────┘                    └──────────────┘   timestamps        └──────────────┘
```

1. **Fetches** all your accepted submissions from LeetCode's GraphQL API
2. **Clones** your target Git repo locally
3. **Commits** each submission as a separate file, using the original LeetCode timestamp
4. **Pushes** all commits to your remote repo in one go

Each submission becomes a folder like `1 Two Sum/` with a file like `1-two-sum.py` inside.

---

## Prerequisites

- **Node.js** (v18 or later) — [Download here](https://nodejs.org/)
- **Git** installed and available in your terminal — [Download here](https://git-scm.com/)
- A **GitHub/GitLab repository** you can push to (HTTPS or SSH)
- A **LeetCode account** with solved problems

---

## Installation

```bash
# 1. Clone this repo
git clone https://github.com/your-username/codesync.git
cd codesync

# 2. Install dependencies
npm install
```

That's it — no global installs, no build step.

---

## Getting Your LeetCode Cookie

CodeSync needs your LeetCode session cookie to access your submissions. Here's how to get it:

### Step-by-step (Chrome)

1. Go to [leetcode.com](https://leetcode.com) and **log in**
2. Press **F12** (or right-click → Inspect) to open DevTools
3. Click the **Application** tab (or **Storage** in Firefox)
4. In the left sidebar, expand **Cookies** → click `https://leetcode.com`
5. Find these two cookies:
   - `LEETCODE_SESSION` — a long string starting with `eyJ...`
   - `csrftoken` — a shorter alphanumeric string
6. Copy both values

Your cookie string should look like:

```
LEETCODE_SESSION=eyJhbGciOiJIUzI1NiJ9...; csrftoken=abc123def456
```

> ⚠️ **Keep your cookie secret!** It gives full access to your LeetCode account. Never commit it to a repo or share it publicly.

---

## Usage

```bash
node src/index.js --cookie "<your-cookie>" --repo-url "<your-repo-url>"
```

### Minimal example

```bash
node src/index.js \
  --cookie "LEETCODE_SESSION=eyJhbG...; csrftoken=abc123" \
  --repo-url "https://github.com/yourname/leetcode-solutions.git"
```

---

## Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--cookie <string>` | ✅ Yes | Your LeetCode session cookie (see [Getting Your Cookie](#getting-your-leetcode-cookie)) |
| `--repo-url <string>` | ✅ Yes | Git repo URL to push commits to (HTTPS or SSH) |
| `--dry-run` | No | Fetch and print submissions without creating any commits |
| `--help` / `-h` | No | Show usage information |

---

## Examples

### 🔍 Dry run (preview without committing)

See what would be committed without touching your repo:

```bash
node src/index.js \
  --cookie "LEETCODE_SESSION=eyJ...; csrftoken=abc123" \
  --repo-url "https://github.com/yourname/leetcode-solutions.git" \
  --dry-run
```

Output:

```
=== Phase 1: Fetching submissions from LeetCode ===
Fetching your solved questions from LeetCode...
Found 42 solved questions.
Fetching submission 1/42: Two Sum...
...

=== DRY RUN — Showing what would be committed ===
  1. Two Sum (python3 → .py)
     Submitted: 2024-01-15T10:30:00.000Z
     Code preview: class Solution:  def twoSum(self, nums...
  ...
Total: 42 submissions.
```

### 🚀 Full sync

```bash
node src/index.js \
  --cookie "LEETCODE_SESSION=eyJ...; csrftoken=abc123" \
  --repo-url "https://github.com/yourname/leetcode-solutions.git"
```

Output:

```
=== Phase 1: Fetching submissions from LeetCode ===
Found 42 solved questions.
...

=== Phase 2: Setting up Git repository ===
Cloning https://github.com/yourname/leetcode-solutions.git into codesync_repo...

=== Phase 3: Creating commits ===
  Committed 1/42: Two Sum
  Committed 2/42: Add Two Numbers
  ...
  Committed 42/42: Median of Two Sorted Arrays

=== Phase 4: Pushing to remote ===
Push complete!

✅ CodeSync complete! All submissions have been synced.
```

### 🔑 Using SSH instead of HTTPS

```bash
node src/index.js \
  --cookie "LEETCODE_SESSION=eyJ...; csrftoken=abc123" \
  --repo-url "git@github.com:yourname/leetcode-solutions.git"
```

---

## Project Structure

```
codesync/
├── package.json              # Project config + dependencies
├── .gitignore                # Ignores node_modules/ and temp clone folder
├── README.md                 # You are here!
├── src/
│   ├── index.js              # Entry point (just wiring, ~12 lines)
│   ├── config.js             # Parses CLI flags + validates inputs
│   ├── leetcodeClient.js     # LeetCode GraphQL API calls
│   ├── gitClient.js          # Git operations (clone, commit, push)
│   └── handler.js            # Orchestrator — wires everything together
└── tests/
    ├── handler.test.js       # Tests for the orchestrator (mocked deps)
    └── config.test.js        # Tests for CLI argument parsing
```

### What each file does

| File | Responsibility |
|------|----------------|
| `index.js` | Wires config → handler. Under 15 lines. |
| `config.js` | Reads `--cookie`, `--repo-url`, `--dry-run` from the command line. Validates required flags. |
| `leetcodeClient.js` | Makes 3 types of GraphQL queries to LeetCode: solved questions list, submission IDs, and submission code. Has retry logic for flaky endpoints. |
| `gitClient.js` | Runs `git clone`, `git add`, `git commit`, `git push` as shell commands. Sets both author-date and committer-date so GitHub's green squares work. |
| `handler.js` | The "brain" — fetches all data first, then commits each submission, then pushes once at the end. |

---

## Running Tests

```bash
# Run all tests
npm test

# Run a specific test file
npx jest tests/handler.test.js
npx jest tests/config.test.js
```

> Note: Tests use mocked LeetCode and Git clients — they never make real API calls or touch git.

---

## FAQ

### Why do I need a cookie? Can't I use my username/password?

LeetCode doesn't have a public API with OAuth. The session cookie is the only way to authenticate API requests. It's the same approach used by other LeetCode tools like leetcode-cli and leetsync.

### How long does it take?

Depends on how many problems you've solved. Each submission requires 2-3 API calls, with small delays between them to avoid rate limiting. Expect roughly **1-2 seconds per submission** (e.g., ~1-2 minutes for 50 problems).

### Will it duplicate commits if I run it again?

Currently, yes — it will create new commits for all submissions each time. For a first version, it's best to run it once against an **empty repository**. Future versions could track already-synced submissions.

### My cookie expired! What do I do?

LeetCode cookies expire after a while. Just log in again and grab a fresh cookie using the same steps in [Getting Your Cookie](#getting-your-leetcode-cookie).

### Why does it clone the repo fresh each time?

To keep things simple and avoid merge conflicts. The cloned folder is automatically deleted after pushing.

### What languages are supported?

All LeetCode languages are mapped to file extensions:

| LeetCode Language | File Extension |
|-------------------|---------------|
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
