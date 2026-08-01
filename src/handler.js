// ============================================================================
// handler.js — The orchestrator that wires leetcodeClient + gitClient together.
//
// This is the "brain" of the program. It:
//   1. Fetches all submissions from LeetCode (network phase)
//   2. Commits each one to the local git repo (local phase)
//   3. Pushes everything to remote once at the end (push phase)
//
// WHY we separate fetching and committing into two phases:
//   If the program crashes during fetching (e.g., network error, rate limit),
//   we haven't touched the git repo at all. The remote stays clean and
//   unchanged. This is safer than interleaving fetch + commit.
// ============================================================================

import { fetchAllSubmissions } from "./leetcodeClient.js";
import * as gitClient from "./gitClient.js";

/**
 * LANG_TO_EXTENSION — Maps LeetCode's language identifiers to file extensions.
 *
 * LeetCode uses strings like "python3", "cpp", "javascript" internally.
 * We map these to standard file extensions so the files look right in the repo.
 */
const LANG_TO_EXTENSION = {
  cpp: "cpp",
  java: "java",
  python: "py",
  python3: "py",
  c: "c",
  csharp: "cs",
  javascript: "js",
  typescript: "ts",
  php: "php",
  swift: "swift",
  kotlin: "kt",
  dart: "dart",
  golang: "go",
  ruby: "rb",
  scala: "scala",
  rust: "rs",
  racket: "rkt",
  erlang: "erl",
  elixir: "ex",
  bash: "sh",
  mysql: "sql",
  mssql: "sql",
  oraclesql: "sql",
};

/**
 * getFileExtension — Looks up the file extension for a LeetCode language.
 *
 * Input:  lang (string) — LeetCode's language identifier, e.g. "python3"
 * Output: file extension string, e.g. "py"
 *
 * Falls back to "txt" if we don't recognize the language.
 */
function getFileExtension(lang) {
  return LANG_TO_EXTENSION[lang] || "txt";
}

/**
 * sanitizeFolderName — Makes a string safe to use as a folder/file name.
 *
 * Input:  name (string) — potentially unsafe string
 * Output: sanitized string with special characters removed
 *
 * Removes characters that are illegal in file/folder names on Windows/Mac/Linux.
 */
function sanitizeFolderName(name) {
  // Replace characters not allowed in filenames: / \ : * ? " < > |
  return name.replace(/[/\\:*?"<>|]/g, "");
}

/**
 * execute — The main orchestration function. Runs the entire sync process.
 *
 * Input:  config (object) — { cookie, repoUrl, dryRun }
 * Output: none (side effects: creates commits and pushes to remote)
 *
 * Flow:
 *   1. Fetch all submissions from LeetCode
 *   2. If --dry-run, print them and stop
 *   3. Clone the target git repo
 *   4. Loop through submissions, creating one commit per submission
 *   5. Push all commits to remote at once
 */
async function execute(config) {
  const { cookie, repoUrl, dryRun } = config;

  // ── Phase 1: Fetch all data from LeetCode ──────────────────────────────
  // We do ALL fetching before ANY git operations. If this phase crashes,
  // the remote repo is completely untouched.
  console.log("=== Phase 1: Fetching submissions from LeetCode ===\n");
  const submissions = await fetchAllSubmissions(cookie);

  if (submissions.length === 0) {
    console.log("No submissions found. Nothing to sync!");
    return;
  }

  // ── Dry Run: Print and exit ────────────────────────────────────────────
  if (dryRun) {
    console.log("=== DRY RUN — Showing what would be committed ===\n");
    for (const sub of submissions) {
      const ext = getFileExtension(sub.lang);
      // lastSubmittedAt is now an ISO 8601 string (e.g. "2026-08-01T08:26:00+00:00")
      const date = new Date(sub.lastSubmittedAt).toISOString();
      console.log(`  ${sub.id}. ${sub.title} (${sub.lang} → .${ext})`);
      console.log(`     Submitted: ${date}`);
      console.log(`     Code preview: ${sub.code.substring(0, 80)}...`);
      console.log("");
    }
    console.log(`Total: ${submissions.length} submissions.`);
    console.log("Dry run complete — no commits were made.\n");
    return;
  }

  // ── Phase 2: Clone the repo ────────────────────────────────────────────
  console.log("=== Phase 2: Setting up Git repository ===\n");
  gitClient.init(repoUrl);

  // ── Phase 3: Commit each submission ────────────────────────────────────
  console.log("=== Phase 3: Creating commits ===\n");

  // Sort submissions by timestamp (oldest first) so commits appear in
  // chronological order in the git log
  submissions.sort((a, b) => new Date(a.lastSubmittedAt) - new Date(b.lastSubmittedAt));

  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i];

    // Build the folder name: "1 Two Sum"
    const folderName = sanitizeFolderName(`${sub.id} ${sub.title}`);

    // Build the file name: "1-two-sum.py"
    const ext = getFileExtension(sub.lang);
    const fileName = `${sub.id}-${sub.titleSlug}.${ext}`;

    // Build the commit message
    const commitMessage = `Add: ${sub.id}. ${sub.title}`;

    // Create the commit with the original LeetCode submission timestamp
    gitClient.commit(folderName, fileName, sub.code, commitMessage, sub.lastSubmittedAt);

    // Print progress so the user knows it's working
    console.log(`  Committed ${i + 1}/${submissions.length}: ${sub.title}`);
  }

  // ── Phase 4: Push all commits at once ──────────────────────────────────
  console.log("\n=== Phase 4: Pushing to remote ===");
  gitClient.push();

  console.log("✅ CodeSync complete! All submissions have been synced.");
}

export { execute };
