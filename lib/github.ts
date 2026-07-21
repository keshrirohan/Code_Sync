import { Octokit } from "octokit";
import { createHash } from "crypto";
import { getLanguageExtension } from "@/types";

// ─── Client Factory ────────────────────────────────────────────────────────────

export function createGitHubClient(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken });
}

// ─── Repository Operations ─────────────────────────────────────────────────────

export async function listUserRepos(accessToken: string) {
  const octokit = createGitHubClient(accessToken);
  const repos = await octokit.rest.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 100,
    affiliation: "owner",
  });
  return repos.data.map((repo) => ({
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    private: repo.private,
    html_url: repo.html_url,
    description: repo.description,
    default_branch: repo.default_branch,
  }));
}

export async function createRepo(
  accessToken: string,
  name: string,
  isPrivate: boolean,
  description?: string
) {
  const octokit = createGitHubClient(accessToken);
  const response = await octokit.rest.repos.createForAuthenticatedUser({
    name,
    description: description || "LeetCode solutions synced by CodeSync",
    private: isPrivate,
    auto_init: true, // Creates initial README
  });
  return {
    id: response.data.id,
    name: response.data.name,
    full_name: response.data.full_name,
    private: response.data.private,
    html_url: response.data.html_url,
    description: response.data.description,
    default_branch: response.data.default_branch,
  };
}

export async function deleteRepo(accessToken: string, owner: string, repo: string) {
  const octokit = createGitHubClient(accessToken);
  await octokit.rest.repos.delete({ owner, repo });
}

// ─── File Operations ───────────────────────────────────────────────────────────

/**
 * Get file contents from a repo. Returns null if file doesn't exist.
 */
export async function getFileContent(
  accessToken: string,
  owner: string,
  repo: string,
  path: string
): Promise<{ sha: string; content: string } | null> {
  const octokit = createGitHubClient(accessToken);
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    });

    // getContent returns file data when path points to a file
    const data = response.data;
    if (!Array.isArray(data) && data.type === "file") {
      return {
        sha: data.sha,
        content: Buffer.from(data.content, "base64").toString("utf-8"),
      };
    }
    return null;
  } catch (error: unknown) {
    const httpError = error as { status?: number };
    if (httpError.status === 404) {
      return null; // File doesn't exist yet
    }
    throw error;
  }
}

/**
 * Create or update a file in a GitHub repo.
 * If `sha` is provided, it updates an existing file; otherwise it creates a new one.
 */
export async function commitFile(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha?: string
) {
  const octokit = createGitHubClient(accessToken);
  const response = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    sha,
  });
  return {
    commitUrl: response.data.commit.html_url ?? "",
    sha: response.data.content?.sha ?? "",
  };
}

// ─── Path & Hash Utilities ─────────────────────────────────────────────────────

/**
 * Build the file path for a solution in the repository.
 * Format: `{Category}/{Problem Name}/solution.{ext}`
 * Example: `Arrays/Two Sum/solution.cpp`
 */
export function buildFilePath(
  category: string,
  problemName: string,
  language: string
): string {
  const sanitizedCategory = sanitizePath(category || "Uncategorized");
  const sanitizedProblem = sanitizePath(problemName);
  const ext = getLanguageExtension(language);
  return `${sanitizedCategory}/${sanitizedProblem}/solution.${ext}`;
}

/**
 * Create a SHA-256 hash of the code content for deduplication.
 */
export function hashCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

/**
 * Sanitize a string for use as a directory/file name.
 * Removes or replaces characters that are invalid in file paths.
 */
function sanitizePath(input: string): string {
  return input
    .trim()
    .replace(/[<>:"/\\|?*]/g, "") // Remove invalid file name chars
    .replace(/\s+/g, " "); // Normalize whitespace
}

/**
 * Build a commit message for a solution.
 */
export function buildCommitMessage(
  problemName: string,
  language: string,
  isUpdate: boolean
): string {
  const action = isUpdate ? "Update" : "Add";
  return `${action}: ${problemName} (${language})`;
}
