// ============================================================================
// tests/config.test.js — Unit tests for the config/CLI argument parser.
//
// Tests that parseArgs correctly extracts flags and validates required inputs.
// ============================================================================

import { jest } from "@jest/globals";

// We need to re-import config.js for each test because it reads process.argv
// at import time. We'll use dynamic imports.

describe("config.parseArgs()", () => {
  // Save the original argv so we can restore it after each test
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  test("parses --cookie and --repo-url correctly", async () => {
    process.argv = [
      "node",
      "src/index.js",
      "--cookie",
      "LEETCODE_SESSION=abc123",
      "--repo-url",
      "https://github.com/user/repo.git",
    ];

    // Dynamic import to get fresh module
    const { parseArgs } = await import("../src/config.js");
    const config = parseArgs();

    expect(config.cookie).toBe("LEETCODE_SESSION=abc123");
    expect(config.repoUrl).toBe("https://github.com/user/repo.git");
    expect(config.dryRun).toBe(false);
  });

  test("parses --dry-run flag", async () => {
    process.argv = [
      "node",
      "src/index.js",
      "--cookie",
      "LEETCODE_SESSION=abc123",
      "--repo-url",
      "https://github.com/user/repo.git",
      "--dry-run",
    ];

    const { parseArgs } = await import("../src/config.js");
    const config = parseArgs();

    expect(config.dryRun).toBe(true);
  });

  test("exits with code 1 when --cookie is missing", async () => {
    process.argv = [
      "node",
      "src/index.js",
      "--repo-url",
      "https://github.com/user/repo.git",
    ];

    // Mock process.exit so it throws instead of actually exiting
    const mockExit = jest.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    jest.spyOn(console, "error").mockImplementation(() => {});

    const { parseArgs } = await import("../src/config.js");

    expect(() => parseArgs()).toThrow("process.exit(1)");
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    console.error.mockRestore();
  });

  test("exits with code 1 when --repo-url is missing", async () => {
    process.argv = [
      "node",
      "src/index.js",
      "--cookie",
      "LEETCODE_SESSION=abc123",
    ];

    const mockExit = jest.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    jest.spyOn(console, "error").mockImplementation(() => {});

    const { parseArgs } = await import("../src/config.js");

    expect(() => parseArgs()).toThrow("process.exit(1)");
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    console.error.mockRestore();
  });
});
