// ============================================================================
// gitClient.js — Handles all Git operations via shell commands.
//
// Production change:
//   init() accepts an optional `githubToken` so it can embed the token into
//   the HTTPS clone URL — required on Render which has no stored git creds.
//   URL format:  https://<token>@github.com/owner/repo.git
//
// Commit backdating:
//   We set both --date AND GIT_COMMITTER_DATE so both author and committer
//   dates match the original LeetCode submission time. GitHub's contribution
//   graph uses committer date, so both must be set.
//
// REPO_BASE_DIR resolution:
//   We use process.cwd() as the base for the temp clone directory.
//   On Render (Root Directory = server), process.cwd() = /app which is the
//   server root — a writable ephemeral directory. Using __dirname-based
//   relative paths is fragile because __dirname depth changes depending on
//   how far the root is set in Render's dashboard.
// ============================================================================

import { execSync } from 'child_process';
import fs   from 'fs';
import path from 'path';

// ── Clone directory ───────────────────────────────────────────────────────────
//
// Place the temp clone inside process.cwd() which is always the server root
// on Render (/app) and the project root locally. This is always writable.
//
// We do NOT derive this from __dirname because __dirname depth is different
// depending on where the process was started from:
//   - local Windows:  e:\codesync\server\src\git  → ../../../  = e:\codesync
//   - Render (Root Dir = server): /app/src/git     → ../../../  = /   ← WRONG
//
const REPO_DIR = 'codesync_repo';

/**
 * getRepoPath — Returns the absolute path to the cloned repo directory.
 * Always inside process.cwd() so it's writable on every platform.
 */
export function getRepoPath() {
  return path.join(process.cwd(), REPO_DIR);
}

/**
 * buildAuthUrl — Injects a GitHub token into an HTTPS clone URL.
 *
 * Only modifies https:// URLs. SSH URLs (git@github.com) are unchanged
 * because they use key-based auth and don't support token embedding.
 *
 * Also strips any existing credentials to avoid double-embedding.
 */
function buildAuthUrl(repoUrl, token) {
  if (!token || !repoUrl.startsWith('https://')) return repoUrl;
  // Remove any existing user:pass@ to avoid double-embedding
  const stripped = repoUrl.replace(/^https:\/\/[^@]+@/, 'https://');
  return stripped.replace('https://', `https://${token}@`);
}

/**
 * init — Clones the target Git repository into a local folder.
 *
 * @param {string}      repoUrl — HTTPS or SSH remote URL
 * @param {string|null} token   — GitHub PAT or OAuth token (production only)
 */
export function init(repoUrl, token = null) {
  const repoPath = getRepoPath();
  const cloneUrl = buildAuthUrl(repoUrl, token);
  const baseDir  = process.cwd();

  // Clean up any leftover folder from a previous run
  if (fs.existsSync(repoPath)) {
    console.log('Cleaning up leftover repo folder from previous run...');
    fs.rmSync(repoPath, { recursive: true, force: true });
  }

  console.log(`Cloning repository into ${REPO_DIR} (cwd: ${baseDir})...`);
  // Clone into the absolute repoPath — don't log cloneUrl (it contains the token)
  execSync(`git clone "${cloneUrl}" "${repoPath}"`, {
    stdio: 'inherit',
    cwd:   baseDir,
  });

  // Configure a local git identity so commits work on machines with no
  // global git config (Render ephemeral containers have none by default).
  execSync('git config user.email "codesync@local.dev"', { cwd: repoPath, stdio: 'pipe' });
  execSync('git config user.name "CodeSync"',            { cwd: repoPath, stdio: 'pipe' });

  // Update the remote URL so `git push` is also authenticated via the token.
  // This must happen AFTER clone because the remote is created during clone.
  if (token && repoUrl.startsWith('https://')) {
    execSync(`git remote set-url origin "${cloneUrl}"`, { cwd: repoPath, stdio: 'pipe' });
  }

  console.log('Clone complete.\n');
}

/**
 * commit — Writes a solution file and creates a backdated git commit.
 *
 * @param {string} folderName — subfolder in repo, e.g. "1 Two Sum"
 * @param {string} fileName   — filename, e.g. "1-two-sum.py"
 * @param {string} code       — source code content
 * @param {string} message    — commit message
 * @param {string} timestamp  — ISO 8601 string of original LeetCode submission
 */
export function commit(folderName, fileName, code, message, timestamp) {
  const repoPath   = getRepoPath();
  const folderPath = path.join(repoPath, folderName);

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  fs.writeFileSync(path.join(folderPath, fileName), code, 'utf-8');

  const dateString = new Date(timestamp).toISOString();

  execSync('git add .', { cwd: repoPath, stdio: 'pipe' });

  // --date sets the author date; GIT_COMMITTER_DATE sets the committer date.
  // GitHub contribution graph uses committer date — both must match.
  execSync(`git commit --allow-empty --date="${dateString}" -m "${message}"`, {
    cwd:   repoPath,
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_COMMITTER_DATE: dateString,
    },
  });
}

/**
 * commitReadme — Writes README.md to the repo root and commits it.
 */
export function commitReadme(content) {
  const repoPath   = getRepoPath();
  const readmePath = path.join(repoPath, 'README.md');

  fs.writeFileSync(readmePath, content, 'utf-8');
  execSync('git add README.md', { cwd: repoPath, stdio: 'pipe' });

  try {
    execSync('git commit -m "📚 Update README — auto-generated by CodeSync"', {
      cwd:   repoPath,
      stdio: 'pipe',
    });
  } catch (err) {
    // git exits 1 when there is nothing new to commit — that is not an error
    if (!err.message.includes('nothing to commit')) throw err;
  }
}

/**
 * push — Pushes all local commits to remote and deletes the local clone.
 *
 * The remote URL already has the token embedded (set by init via
 * `git remote set-url`), so no extra auth is needed here.
 *
 * We delete the clone after pushing because Render's filesystem is
 * ephemeral — there is no point keeping it, and it frees disk space.
 */
export function push() {
  const repoPath = getRepoPath();

  console.log('\nPushing all commits to remote...');
  execSync('git push', { cwd: repoPath, stdio: 'inherit' });
  console.log('Push complete!');

  console.log('Cleaning up local repo folder...');
  fs.rmSync(repoPath, { recursive: true, force: true });
  console.log('Cleanup done.\n');
}
