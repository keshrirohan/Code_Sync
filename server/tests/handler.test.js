// ============================================================================
// tests/handler.test.js — Unit tests for the handler/orchestrator.
//
// These tests use MOCKED versions of leetcodeClient and gitClient,
// so they never make real API calls or touch git. They verify that
// the orchestrator wires everything together correctly.
// ============================================================================

import { jest } from "@jest/globals";

// ── Mock Setup ──────────────────────────────────────────────────────────────
// We mock the modules BEFORE importing handler.js, so handler.js gets
// the fake versions instead of the real ones.

// Mock leetcodeClient — returns fake submission data
jest.unstable_mockModule("../src/leetcode/leetcodeClient.js", () => ({
  fetchAllSubmissions: jest.fn(),
}));

// Mock gitClient — records calls without doing real git operations
jest.unstable_mockModule("../src/git/gitClient.js", () => ({
  init: jest.fn(),
  getRepoPath: jest.fn(() => '__test_repo_nonexistent__'),
  commit: jest.fn(),
  commitReadme: jest.fn(),
  push: jest.fn(),
}));

// Mock readmeGenerator — so handler doesn't try to scan a non-existent repo
jest.unstable_mockModule("../src/sync/readmeGenerator.js", () => ({
  scanRepo: jest.fn(() => []),
  generateReadme: jest.fn(() => '# README'),
}));

// Import AFTER mocking (required for ESM mocks)
const { fetchAllSubmissions } = await import("../src/leetcode/leetcodeClient.js");
const gitClient = await import("../src/git/gitClient.js");
const { execute } = await import("../src/sync/handler.js");

// ── Fake Data ───────────────────────────────────────────────────────────────
// This is what a real LeetCode response would look like, but hardcoded
const FAKE_SUBMISSIONS = [
  {
    id: "1",
    title: "Two Sum",
    titleSlug: "two-sum",
    lastSubmittedAt: 1700000000, // Nov 14, 2023
    lang: "python3",
    code: 'class Solution:\n    def twoSum(self, nums, target):\n        pass',
  },
  {
    id: "2",
    title: "Add Two Numbers",
    titleSlug: "add-two-numbers",
    lastSubmittedAt: 1700100000, // Nov 15, 2023
    lang: "javascript",
    code: 'var addTwoNumbers = function(l1, l2) { return null; };',
  },
  {
    id: "3",
    title: "Longest Substring Without Repeating Characters",
    titleSlug: "longest-substring-without-repeating-characters",
    lastSubmittedAt: 1700200000, // Nov 16, 2023
    lang: "cpp",
    code: 'class Solution { public: int lengthOfLongestSubstring(string s) { return 0; } };',
  },
];

// ── Test Config ─────────────────────────────────────────────────────────────
const TEST_CONFIG = {
  cookie: "LEETCODE_SESSION=fake; csrftoken=fake",
  repoUrl: "https://github.com/testuser/leetcode.git",
  dryRun: false,
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe("handler.execute()", () => {
  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console output during tests
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  test("commits all submissions and pushes once", async () => {
    // Arrange: set up the mock to return our fake data
    fetchAllSubmissions.mockResolvedValue(FAKE_SUBMISSIONS);

    // Act: run the orchestrator
    await execute(TEST_CONFIG);

    // Assert: git.init was called once with the repo URL
    expect(gitClient.init).toHaveBeenCalledTimes(1);
    expect(gitClient.init).toHaveBeenCalledWith(TEST_CONFIG.repoUrl, null);

    // Assert: git.commit was called once per submission (3 times)
    expect(gitClient.commit).toHaveBeenCalledTimes(3);

    // Assert: git.push was called exactly once (at the end)
    expect(gitClient.push).toHaveBeenCalledTimes(1);
  });

  test("creates correct folder and file names", async () => {
    fetchAllSubmissions.mockResolvedValue(FAKE_SUBMISSIONS);

    await execute(TEST_CONFIG);

    // Check the first commit call (Two Sum, python3 → .py)
    // Submissions are sorted by timestamp, so "Two Sum" is first
    const firstCall = gitClient.commit.mock.calls[0];
    expect(firstCall[0]).toBe("1 Two Sum");          // folder name
    expect(firstCall[1]).toBe("1-two-sum.py");        // file name
    expect(firstCall[2]).toContain("class Solution"); // code
    expect(firstCall[3]).toBe("Add: 1. Two Sum");     // commit message

    // Check the second commit (Add Two Numbers, javascript → .js)
    const secondCall = gitClient.commit.mock.calls[1];
    expect(secondCall[0]).toBe("2 Add Two Numbers");
    expect(secondCall[1]).toBe("2-add-two-numbers.js");

    // Check the third commit (Longest Substring, cpp → .cpp)
    const thirdCall = gitClient.commit.mock.calls[2];
    expect(thirdCall[1]).toBe("3-longest-substring-without-repeating-characters.cpp");
  });

  test("sorts submissions by timestamp (oldest first)", async () => {
    // Give submissions in REVERSE order
    const reversed = [...FAKE_SUBMISSIONS].reverse();
    fetchAllSubmissions.mockResolvedValue(reversed);

    await execute(TEST_CONFIG);

    // Even though we passed them in reverse, commits should be oldest-first
    const timestamps = gitClient.commit.mock.calls.map((call) => call[4]);
    expect(timestamps[0]).toBeLessThan(timestamps[1]);
    expect(timestamps[1]).toBeLessThan(timestamps[2]);
  });

  test("does NOT commit or push in dry-run mode", async () => {
    fetchAllSubmissions.mockResolvedValue(FAKE_SUBMISSIONS);

    await execute({ ...TEST_CONFIG, dryRun: true });

    // In dry-run mode, we should NOT touch git at all
    expect(gitClient.init).not.toHaveBeenCalled();
    expect(gitClient.commit).not.toHaveBeenCalled();
    expect(gitClient.push).not.toHaveBeenCalled();
  });

  test("handles empty submissions list gracefully", async () => {
    fetchAllSubmissions.mockResolvedValue([]);

    await execute(TEST_CONFIG);

    // No submissions → no git operations
    expect(gitClient.init).not.toHaveBeenCalled();
    expect(gitClient.commit).not.toHaveBeenCalled();
    expect(gitClient.push).not.toHaveBeenCalled();
  });
});
