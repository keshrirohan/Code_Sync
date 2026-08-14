// ============================================================================
// tests/extension-payload.test.js — Tests for the Chrome extension's expected
// communication contract with the backend.
//
// Verifies that the backend correctly handles all payload shapes the
// extension might send, including edge cases and malformed data.
// ============================================================================

import { jest } from '@jest/globals';
import http from 'http';

// ── Mock Setup ──────────────────────────────────────────────────────────────

const mockConfigStore = {};

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
const fetch = (await import('node-fetch')).default;
const storage = await import('../src/storage/storage.js');

// ── Helper ──────────────────────────────────────────────────────────────────

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

// ── Extension Payload Tests ─────────────────────────────────────────────────

describe('Extension → Backend: POST /api/auth/leetcode-from-extension', () => {
  afterEach(() => {
    jest.clearAllMocks();
    storage.loadConfig.mockResolvedValue({ ...mockConfigStore });
  });

  test('correct request body with LEETCODE_SESSION and csrftoken', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userStatus: { username: 'extuser', isSignedIn: true } },
      }),
    });

    const { status, json } = await request('/api/auth/leetcode-from-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: 'LEETCODE_SESSION=abc123; csrftoken=tok456' }),
    });

    expect(status).toBe(200);
    expect(json.valid).toBe(true);
    expect(json.username).toBe('extuser');
    // Response must NOT contain the cookie
    expect(JSON.stringify(json)).not.toContain('abc123');
  });

  test('request with only LEETCODE_SESSION (no csrftoken)', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userStatus: { username: 'user2', isSignedIn: true } },
      }),
    });

    const { status, json } = await request('/api/auth/leetcode-from-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: 'LEETCODE_SESSION=onlysession' }),
    });

    expect(status).toBe(200);
    expect(json.valid).toBe(true);
  });

  test('missing session returns 400 with COOKIE_REQUIRED', async () => {
    const { status, json } = await request('/api/auth/leetcode-from-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(status).toBe(400);
    expect(json.valid).toBe(false);
    expect(json.code).toBe('COOKIE_REQUIRED');
  });

  test('empty cookie string returns 400', async () => {
    const { status, json } = await request('/api/auth/leetcode-from-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: '' }),
    });

    expect(status).toBe(400);
    expect(json.valid).toBe(false);
    expect(json.code).toBe('COOKIE_REQUIRED');
  });

  test('backend rejection: LeetCode says not signed in', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userStatus: { username: null, isSignedIn: false } },
      }),
    });

    const { status, json } = await request('/api/auth/leetcode-from-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: 'LEETCODE_SESSION=badcookie' }),
    });

    expect(status).toBe(401);
    expect(json.valid).toBe(false);
    expect(json.error).toContain('expired');
  });

  test('successful response shape matches extension expectations', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userStatus: { username: 'myuser', isSignedIn: true } },
      }),
    });

    const { json } = await request('/api/auth/leetcode-from-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: 'LEETCODE_SESSION=validcookie' }),
    });

    // Extension popup.js checks data.valid and data.username
    expect(json).toHaveProperty('valid', true);
    expect(json).toHaveProperty('username', 'myuser');
    // Must NOT have cookie in response (security)
    expect(json).not.toHaveProperty('cookie');
  });

  test('bare session value (no LEETCODE_SESSION= prefix) is accepted', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userStatus: { username: 'bareuser', isSignedIn: true } },
      }),
    });

    const { status, json } = await request('/api/auth/leetcode-from-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: 'eyJhbGciOiJIUzI1NiJ9.rawsession' }),
    });

    expect(status).toBe(200);
    expect(json.valid).toBe(true);
    // Verify the normalization added the prefix when calling LeetCode
    const callHeaders = fetch.mock.calls[0][1].headers;
    expect(callHeaders.Cookie).toContain('LEETCODE_SESSION=');
  });
});

// ── Cookie Handling Edge Cases ───────────────────────────────────────────────

describe('Cookie handling edge cases', () => {
  afterEach(() => {
    jest.clearAllMocks();
    storage.loadConfig.mockResolvedValue({ ...mockConfigStore });
  });

  test('whitespace-only cookie is rejected', async () => {
    const { status, json } = await request('/api/auth/leetcode-from-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: '   ' }),
    });

    expect(status).toBe(400);
    expect(json.code).toBe('COOKIE_REQUIRED');
  });

  test('extremely long cookie is accepted and forwarded', async () => {
    const longValue = 'x'.repeat(5000);
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userStatus: { username: 'longuser', isSignedIn: true } },
      }),
    });

    const { status, json } = await request('/api/auth/leetcode-from-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: `LEETCODE_SESSION=${longValue}` }),
    });

    expect(status).toBe(200);
    expect(json.valid).toBe(true);
  });
});
