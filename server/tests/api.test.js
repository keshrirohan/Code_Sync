// ============================================================================
// tests/api.test.js — Integration-style tests for Express API endpoints.
//
// Uses real Express app with mocked storage layer and external services.
// ============================================================================

import { jest } from '@jest/globals';
import http from 'http';

// ── Mock Setup ──────────────────────────────────────────────────────────────

const mockConfigStore = {
  leetcodeCookie: null,
  leetcodeUsername: null,
  githubToken: null,
  githubUsername: null,
  githubAvatar: null,
  targetRepoUrl: null,
  targetRepoName: null,
  githubOAuthClientId: null,
  githubOAuthClientSecret: null,
  autoSyncEnabled: false,
  autoSyncIntervalMinutes: 10,
};

// Mock the storage layer (which is what app.js actually uses)
jest.unstable_mockModule('../src/storage/storage.js', () => ({
  loadConfig: jest.fn(async () => ({ ...mockConfigStore })),
  saveConfig: jest.fn(async () => {}),
  loadHistory: jest.fn(async () => []),
  addHistoryEntry: jest.fn(async () => {}),
  updateHistoryEntry: jest.fn(async () => {}),
  deleteHistoryEntry: jest.fn(async () => {}),
}));

jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn(),
}));

jest.unstable_mockModule('mongoose', () => ({
  default: {
    connect: jest.fn(),
    connection: { readyState: 1, host: 'mock-host', on: jest.fn() },
    Schema: class {
      constructor() { this.statics = {}; }
      index() {}
    },
    model: jest.fn(() => ({})),
  },
}));

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
  },
}));

process.env.MONGODB_URI = 'mongodb://mock:27017/test';
process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
process.env.PORT = '0';

const { app } = await import('../src/app.js');
const storage = await import('../src/storage/storage.js');
const fetch = (await import('node-fetch')).default;

// ── Helper: make HTTP requests to the Express app ────────────────────────────

let server;
let baseUrl;

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function request(path, options = {}) {
  const res = await globalThis.fetch(`${baseUrl}${path}`, options);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  test('returns 200 with ok: true', async () => {
    const { status, json } = await request('/api/health');
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.timestamp).toBeDefined();
    expect(typeof json.uptime).toBe('number');
  });

  test('does not depend on MongoDB', async () => {
    // Even if storage throws, health should still work
    storage.loadConfig.mockRejectedValueOnce(new Error('DB down'));
    const { status, json } = await request('/api/health');
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    // Reset: the mockRejectedValueOnce was never consumed by /api/health
    // so clear it to avoid leaking into subsequent test suites
    storage.loadConfig.mockReset();
    storage.loadConfig.mockResolvedValue({ ...mockConfigStore });
  });
});

describe('GET /api/config', () => {
  beforeEach(() => {
    storage.loadConfig.mockResolvedValue({ ...mockConfigStore });
  });

  test('returns expected shape with presence flags', async () => {
    const { status, json } = await request('/api/config');
    expect(status).toBe(200);
    expect(json).toHaveProperty('hasLeetcodeCookie');
    expect(json).toHaveProperty('leetcodeUsername');
    expect(json).toHaveProperty('hasGithubToken');
    expect(json).toHaveProperty('githubUsername');
    expect(json).toHaveProperty('githubAvatar');
    expect(json).toHaveProperty('targetRepoUrl');
    expect(json).toHaveProperty('targetRepoName');
  });

  test('never exposes raw cookie or token', async () => {
    storage.loadConfig.mockResolvedValue({
      ...mockConfigStore,
      leetcodeCookie: 'LEETCODE_SESSION=secret',
      githubToken: 'ghp_secret',
    });

    const { json } = await request('/api/config');
    expect(json.hasLeetcodeCookie).toBe(true);
    expect(json.hasGithubToken).toBe(true);
    // Raw values must NOT be in the response
    const text = JSON.stringify(json);
    expect(text).not.toContain('LEETCODE_SESSION=secret');
    expect(text).not.toContain('ghp_secret');
  });

  test('returns hasLeetcodeCookie=false when no cookie stored', async () => {
    const { json } = await request('/api/config');
    expect(json.hasLeetcodeCookie).toBe(false);
    expect(json.leetcodeUsername).toBeNull();
  });

  test('returns 500 with structured error when storage fails', async () => {
    storage.loadConfig.mockRejectedValue(new Error('Connection lost'));
    const { status, json } = await request('/api/config');
    expect(status).toBe(500);
    expect(json.code).toBe('CONFIG_ERROR');
    expect(json.error).not.toContain('Connection lost');
  });
});

describe('GET /api/status', () => {
  test('returns backend online status', async () => {
    storage.loadConfig.mockResolvedValue({ ...mockConfigStore });
    const { status, json } = await request('/api/status');
    expect(status).toBe(200);
    expect(json.backend).toBe('online');
    expect(json.mongodb).toBeDefined();
    expect(json.leetcode).toBe('not_connected');
    expect(json.github).toBe('not_connected');
  });

  test('returns connected statuses when credentials are present', async () => {
    storage.loadConfig.mockResolvedValue({
      ...mockConfigStore,
      leetcodeCookie: 'LEETCODE_SESSION=abc',
      leetcodeUsername: 'testuser',
      githubToken: 'ghp_xxx',
      githubUsername: 'ghuser',
    });
    const { json } = await request('/api/status');
    expect(json.leetcode).toBe('connected');
    expect(json.github).toBe('connected');
  });
});

describe('POST /api/auth/leetcode', () => {
  afterEach(() => {
    jest.clearAllMocks();
    storage.loadConfig.mockResolvedValue({ ...mockConfigStore });
  });

  test('returns 400 when cookie is missing', async () => {
    const { status, json } = await request('/api/auth/leetcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
    expect(json.code).toBe('COOKIE_REQUIRED');
    expect(json.valid).toBe(false);
  });

  test('returns 401 when session is expired', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userStatus: { username: null, isSignedIn: false } },
      }),
    });

    const { status, json } = await request('/api/auth/leetcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: 'LEETCODE_SESSION=expired' }),
    });
    expect(status).toBe(401);
    expect(json.valid).toBe(false);
    expect(json.code).toBe('SESSION_EXPIRED');
  });

  test('returns success on valid cookie', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userStatus: { username: 'validuser', isSignedIn: true } },
      }),
    });

    const { status, json } = await request('/api/auth/leetcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: 'LEETCODE_SESSION=valid' }),
    });
    expect(status).toBe(200);
    expect(json.valid).toBe(true);
    expect(json.username).toBe('validuser');
    expect(JSON.stringify(json)).not.toContain('LEETCODE_SESSION');
  });

  test('returns 502 when LeetCode API is unreachable', async () => {
    fetch.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));

    const { status, json } = await request('/api/auth/leetcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: 'LEETCODE_SESSION=any' }),
    });
    expect(status).toBe(502);
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(json.valid).toBe(false);
  });
});

describe('POST /api/auth/leetcode-from-extension', () => {
  afterEach(() => {
    jest.clearAllMocks();
    storage.loadConfig.mockResolvedValue({ ...mockConfigStore });
  });

  test('accepts extension payload with correct body', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userStatus: { username: 'extuser', isSignedIn: true } },
      }),
    });

    const { status, json } = await request('/api/auth/leetcode-from-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: 'LEETCODE_SESSION=fromext; csrftoken=tok' }),
    });
    expect(status).toBe(200);
    expect(json.valid).toBe(true);
    expect(json.username).toBe('extuser');
  });

  test('rejects request with missing session', async () => {
    const { status, json } = await request('/api/auth/leetcode-from-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
    expect(json.code).toBe('COOKIE_REQUIRED');
  });
});

describe('GET /api/auth/github/oauth-status', () => {
  test('returns expected shape', async () => {
    storage.loadConfig.mockResolvedValue({ ...mockConfigStore });
    const { status, json } = await request('/api/auth/github/oauth-status');
    expect(status).toBe(200);
    expect(json).toHaveProperty('configured');
    expect(json).toHaveProperty('connected');
    expect(json.configured).toBe(false);
    expect(json.connected).toBe(false);
  });

  test('shows configured when OAuth credentials are set', async () => {
    storage.loadConfig.mockResolvedValue({
      ...mockConfigStore,
      githubOAuthClientId: 'Ov23li_test',
      githubOAuthClientSecret: 'secret_test',
    });
    const { json } = await request('/api/auth/github/oauth-status');
    expect(json.configured).toBe(true);
  });
});

describe('Connection status combinations', () => {
  test('backend online + LeetCode disconnected + GitHub disconnected', async () => {
    storage.loadConfig.mockResolvedValue({ ...mockConfigStore });
    const { json: config } = await request('/api/config');
    const { json: status } = await request('/api/status');

    expect(status.backend).toBe('online');
    expect(config.hasLeetcodeCookie).toBe(false);
    expect(config.hasGithubToken).toBe(false);
    expect(status.leetcode).toBe('not_connected');
    expect(status.github).toBe('not_connected');
  });

  test('backend online + LeetCode connected + GitHub connected', async () => {
    storage.loadConfig.mockResolvedValue({
      ...mockConfigStore,
      leetcodeCookie: 'LEETCODE_SESSION=active',
      leetcodeUsername: 'lcuser',
      githubToken: 'ghp_tok',
      githubUsername: 'ghuser',
      githubAvatar: 'https://example.com/avatar.png',
    });
    const { json: config } = await request('/api/config');
    const { json: status } = await request('/api/status');

    expect(config.hasLeetcodeCookie).toBe(true);
    expect(config.leetcodeUsername).toBe('lcuser');
    expect(config.hasGithubToken).toBe(true);
    expect(config.githubUsername).toBe('ghuser');
    expect(status.leetcode).toBe('connected');
    expect(status.github).toBe('connected');
  });

  test('backend online + LeetCode connected + GitHub disconnected', async () => {
    storage.loadConfig.mockResolvedValue({
      ...mockConfigStore,
      leetcodeCookie: 'LEETCODE_SESSION=active',
      leetcodeUsername: 'lcuser',
    });
    const { json: config } = await request('/api/config');
    expect(config.hasLeetcodeCookie).toBe(true);
    expect(config.hasGithubToken).toBe(false);
  });
});
