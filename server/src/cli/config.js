// ============================================================================
// config.js — Parses command-line arguments into a simple config object.
//
// This is the FIRST thing that runs. We validate inputs here so the program
// fails fast with a clear error message instead of crashing later during
// an API call or git operation.
// ============================================================================

/**
 * parseArgs — Reads process.argv and extracts CLI flags.
 *
 * Input:  none (reads from process.argv directly)
 * Output: { cookie: string, repoUrl: string, dryRun: boolean }
 *
 * Supported flags:
 *   --cookie <value>    Your LeetCode session cookie (required)
 *   --repo-url <value>  The Git repo URL to push to (required)
 *   --dry-run           Fetch & print without committing (optional)
 *   --help              Show usage info
 */
function parseArgs() {
  const args = process.argv.slice(2); // Remove "node" and script path

  // If user asks for help, print usage and exit
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  let cookie = "";
  let repoUrl = "";
  let dryRun = false;

  // Walk through args one by one, looking for our flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--cookie" && args[i + 1]) {
      cookie = args[i + 1];
      i++; // Skip the next arg since we already consumed it as the value
    } else if (args[i] === "--repo-url" && args[i + 1]) {
      repoUrl = args[i + 1];
      i++; // Skip the next arg since we already consumed it as the value
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  // --- Validation ---
  // We validate BEFORE doing any work (API calls, git clones) so the user
  // gets instant feedback if they forgot a required flag. Without this,
  // the program might run for minutes fetching data, only to crash when
  // it tries to push to a repo URL that was never provided.
  if (!cookie) {
    console.error("ERROR: --cookie is required.");
    console.error('  Example: --cookie "LEETCODE_SESSION=abc123; csrftoken=xyz789"');
    console.error("");
    console.error("To get your cookie:");
    console.error("  1. Log into leetcode.com in your browser");
    console.error("  2. Open DevTools (F12) → Application → Cookies");
    console.error("  3. Copy the LEETCODE_SESSION and csrftoken values");
    process.exit(1);
  }

  if (!repoUrl) {
    console.error("ERROR: --repo-url is required.");
    console.error("  Example: --repo-url https://github.com/yourname/leetcode-solutions.git");
    process.exit(1);
  }

  return { cookie, repoUrl, dryRun };
}

/**
 * printUsage — Prints a help message showing how to use the CLI.
 *
 * Input:  none
 * Output: none (prints to stdout)
 */
function printUsage() {
  console.log(`
CodeSync — Sync your LeetCode submissions to a Git repo

USAGE:
  node src/index.js --cookie <cookie> --repo-url <repo-url> [--dry-run]

FLAGS:
  --cookie <cookie>      Your LeetCode session cookie (required)
                         Format: "LEETCODE_SESSION=abc; csrftoken=xyz"

  --repo-url <repo-url>  Git repo URL to push commits to (required)
                         Example: https://github.com/you/leetcode.git

  --dry-run              Fetch submissions and print them, but don't
                         create any git commits or push anything

  --help, -h             Show this help message

EXAMPLE:
  node src/index.js \\
    --cookie "LEETCODE_SESSION=eyJ...; csrftoken=abc123" \\
    --repo-url "https://github.com/yourname/leetcode-solutions.git"
  `);
}

export { parseArgs };
