// ============================================================================
// gitClient.js — Handles all Git operations via shell commands.
//
// This file runs git commands (clone, add, commit, push) using Node's
// child_process.execSync. We shell out to git rather than using a library
// because it's simpler, more transparent, and easier to debug.
//
// The key trick: we use --date and GIT_COMMITTER_DATE to set BOTH the
// author date and committer date to the original LeetCode submission time.
// This makes GitHub's contribution graph show green squares on the correct days.
// ============================================================================

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// The local folder where we clone the repo into
// We use a fixed name so it's easy to find and clean up
const REPO_DIR = "codesync_repo";

/**
 * getRepoPath — Returns the absolute path to the cloned repo directory.
 *
 * Input:  none
 * Output: absolute path string
 */
function getRepoPath() {
  return path.resolve(process.cwd(), REPO_DIR);
}

/**
 * init — Clones the target Git repository into a local folder.
 *
 * Input:  repoUrl (string) — the Git remote URL (HTTPS or SSH)
 * Output: none (creates the folder on disk)
 *
 * Why we clone fresh each run:
 *   - Avoids merge conflicts from previous runs
 *   - Guarantees we're working with the latest remote state
 *   - Keeps the logic simple (no need to handle "already cloned" cases)
 *
 * If the folder already exists from a previous interrupted run, we delete
 * it first to start clean.
 */
function init(repoUrl) {
  const repoPath = getRepoPath();

  // Clean up any leftover folder from a previous run
  if (fs.existsSync(repoPath)) {
    console.log("Cleaning up leftover repo folder from previous run...");
    fs.rmSync(repoPath, { recursive: true, force: true });
  }

  console.log(`Cloning ${repoUrl} into ${REPO_DIR}...`);
  execSync(`git clone "${repoUrl}" "${REPO_DIR}"`, {
    stdio: "inherit", // Show git's output so user can see clone progress
  });

  // Configure a local git user so commits work on machines without a global
  // user.name / user.email set up.
  execSync('git config user.email "codesync@local.dev"', { cwd: REPO_DIR, stdio: "pipe" });
  execSync('git config user.name "CodeSync"',            { cwd: REPO_DIR, stdio: "pipe" });

  console.log("Clone complete.\n");
}

/**
 * commit — Writes a code file and creates a git commit with a custom date.
 *
 * Inputs:
 *   folderName (string) — subfolder inside the repo, e.g. "1 Two Sum"
 *   fileName   (string) — the file to create, e.g. "1-two-sum.py"
 *   code       (string) — the actual source code to write
 *   message    (string) — the commit message
 *   timestamp  (number) — Unix timestamp of the original LeetCode submission
 *
 * Output: none (creates files and a git commit)
 *
 * IMPORTANT NOTE ABOUT GIT DATES:
 *   Git has TWO separate dates for every commit:
 *     1. Author Date    — when the code was originally written
 *     2. Committer Date — when the commit was actually created
 *
 *   By default, `git commit --date` only sets the AUTHOR date.
 *   But GitHub's contribution graph (the green squares) uses the
 *   COMMITTER date. So we MUST also set the GIT_COMMITTER_DATE
 *   environment variable to make the green squares appear on the
 *   correct day.
 */
function commit(folderName, fileName, code, message, timestamp) {
  const repoPath = getRepoPath();

  // Create the subfolder inside the repo (e.g., "codesync_repo/1 Two Sum/")
  const folderPath = path.join(repoPath, folderName);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  // Write the code to a file (e.g., "codesync_repo/1 Two Sum/1-two-sum.py")
  const filePath = path.join(folderPath, fileName);
  fs.writeFileSync(filePath, code, "utf-8");

  // lastSubmittedAt is now an ISO 8601 string (e.g. "2026-08-01T08:26:00+00:00").
  // new Date() accepts it directly — no * 1000 needed.
  const dateString = new Date(timestamp).toISOString();

  // Stage all changes
  execSync("git add .", { cwd: repoPath, stdio: "pipe" });

  // Create the commit with the custom date
  // We set GIT_COMMITTER_DATE as an environment variable so BOTH dates match
  execSync(`git commit --allow-empty --date="${dateString}" -m "${message}"`, {
    cwd: repoPath,
    stdio: "pipe", // Suppress git's output to keep our console clean
    env: {
      ...process.env, // Keep all existing environment variables
      GIT_COMMITTER_DATE: dateString, // Override the committer date
    },
  });
}

/**
 * push — Pushes all local commits to the remote repository, then cleans up.
 *
 * Input:  none
 * Output: none (pushes to remote and deletes local folder)
 *
 * Why we push only ONCE at the very end:
 *   - If we pushed after every single commit, it would be extremely slow
 *     (one network round-trip per submission)
 *   - If something fails mid-run, we haven't pushed any partial results
 *     to the remote — the remote stays clean
 *   - After pushing, we delete the local clone since we don't need it anymore
 */
function push() {
  const repoPath = getRepoPath();

  console.log("\nPushing all commits to remote...");
  execSync("git push", {
    cwd: repoPath,
    stdio: "inherit", // Show push progress
  });
  console.log("Push complete!");

  // Clean up the local clone — we're done with it
  console.log("Cleaning up local repo folder...");
  fs.rmSync(repoPath, { recursive: true, force: true });
  console.log("Cleanup done.\n");
}

export { init, commit, push };
