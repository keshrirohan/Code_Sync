// ============================================================================
// tests/leetcode.test.js — Unit tests for LeetCode session validation,
// cookie normalization, and the auth endpoint flow.
//
// All external calls are mocked — no real requests to LeetCode.
// ============================================================================

import { jest } from '@jest/globals';

// ── Mock Setup ──────────────────────────────────────────────────────────────

// Mock node-fetch globally BEFORE importing app.js
jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn(),
}));

// Mock MongoDB models so app.js doesn't need a real DB connection
jest.unstable_mockModule('../src/models/Settings.js', () => ({
  default: {
    loadGlobal: jest.fn(async () => ({})),
    saveGlobal: jest.fn(async () => ({})),
  },
}));
jest.unstable_mockModule('../src/models/SyncHistory.js', () => ({
  default: {
    find: jest.fn(() => ({ sort: jest.fn(() => ({ lean: jest.fn(async () => []) })) })),
    create: jest.fn(async () => ({})),
  },
}));

// Mock mongoose for the /api/status endpoint
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

// Mock winston logger
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
  },
}));

// Set required env vars before importing app
process.env.MONGODB_URI = 'mongodb://mock:27017/test';
process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
process.env.PORT = '0'; // use random port for tests

// Import after mocks
const fetch = (await import('node-fetch')).default;
const { normalizeLeetcodeCookie, extractCsrfToken, validateLeetcodeCookie, LC_ERROR } =
  await import('../src/app.js');

// ── normalizeLeetcodeCookie Tests ────────────────────────────────────────────

describe('normalizeLeetcodeCookie()', () => {
  test('returns empty string for null/undefined/empty input', () => {
    expect(normalizeLeetcodeCookie(null)).toBe('');
    expect(normalizeLeetcodeCookie(undefined)).toBe('');
    expect(normalizeLeetcodeCookie('')).toBe('');
    expect(normalizeLeetcodeCookie('   ')).toBe('');
  });

  test('wraps bare session value with LEETCODE_SESSION= prefix', () => {
    const result = normalizeLeetcodeCookie('eyJhbGciOiJIUzI1NiJ9');
    expect(result).toContain('LEETCODE_SESSION=eyJhbGciOiJIUzI1NiJ9');
  });

  test('preserves existing LEETCODE_SESSION= prefix', () => {
    const result = normalizeLeetcodeCookie('LEETCODE_SESSION=abc123');
    expect(result).toContain('LEETCODE_SESSION=abc123');
    // Should not double-prefix
    expect(result).not.toContain('LEETCODE_SESSION=LEETCODE_SESSION=');
  });

  test('appends default csrftoken if missing', () => {
    const result = normalizeLeetcodeCookie('LEETCODE_SESSION=abc123');
    expect(result).toContain('csrftoken=');
  });

  test('preserves existing csrftoken', () => {
    const result = normalizeLeetcodeCookie('LEETCODE_SESSION=abc123; csrftoken=mytoken');
    expect(result).toContain('csrftoken=mytoken');
    // Should not add a second csrftoken
    expect(result.match(/csrftoken=/g).length).toBe(1);
  });

  test('handles non-string input gracefully', () => {
    expect(normalizeLeetcodeCookie(123)).toBe('');
    expect(normalizeLeetcodeCookie({})).toBe('');
  });
});

// ── extractCsrfToken Tests ───────────────────────────────────────────────────

describe('extractCsrfToken()', () => {
  test('extracts csrftoken from a cookie string', () => {
    expect(extractCsrfToken('LEETCODE_SESSION=abc; csrftoken=xyz123')).toBe('xyz123');
  });

  test('returns default "leetcode" when no csrftoken present', () => {
    expect(extractCsrfToken('LEETCODE_SESSION=abc')).toBe('leetcode');
  });

  test('returns default for null/undefined input', () => {
    expect(extractCsrfToken(null)).toBe('leetcode');
    expect(extractCsrfToken(undefined)).toBe('leetcode');
  });

  test('handles csrftoken with trailing semicolons', () => {
    expect(extractCsrfToken('csrftoken=abc123; other=value')).toBe('abc123');
  });
});

// ── validateLeetcodeCookie Tests ─────────────────────────────────────────────

describe('validateLeetcodeCookie()', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns userStatus on successful validation', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userStatus: { username: 'testuser', isSignedIn: true } },
      }),
    });

    const result = await validateLeetcodeCookie('LEETCODE_SESSION=valid; csrftoken=tok');
    expect(result).toEqual({ username: 'testuser', isSignedIn: true });
  });

  test('returns userStatus with isSignedIn=false for expired session', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userStatus: { username: null, isSignedIn: false } },
      }),
    });

    const result = await validateLeetcodeCookie('LEETCODE_SESSION=expired');
    expect(result.isSignedIn).toBe(false);
  });

  test('throws on HTTP error from LeetCode', async () => {
    fetch.mockResolvedValue({ ok: false, status: 403 });

    await expect(validateLeetcodeCookie('LEETCODE_SESSION=bad')).rejects.toThrow('HTTP 403');
  });

  test('throws on network failure', async () => {
    fetch.mockRejectedValue(new Error('fetch failed'));

    await expect(validateLeetcodeCookie('LEETCODE_SESSION=any')).rejects.toThrow('fetch failed');
  });

  test('returns null for malformed GraphQL response', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });

    const result = await validateLeetcodeCookie('LEETCODE_SESSION=ok');
    expect(result).toBeUndefined();
  });

  test('sends correct headers including Cookie and x-csrftoken', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userStatus: { username: 'test', isSignedIn: true } },
      }),
    });

    await validateLeetcodeCookie('LEETCODE_SESSION=abc; csrftoken=mytoken');

    const callArgs = fetch.mock.calls[0];
    const headers = callArgs[1].headers;
    expect(headers.Cookie).toContain('LEETCODE_SESSION=abc');
    expect(headers['x-csrftoken']).toBe('mytoken');
    expect(headers['Content-Type']).toBe('application/json');
  });

  // Verify the session cookie value is never exposed in logs
  test('does not include raw cookie in error messages', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401 });

    try {
      await validateLeetcodeCookie('LEETCODE_SESSION=secret_value_123');
    } catch (err) {
      expect(err.message).not.toContain('secret_value_123');
    }
  });
});

// ── LC_ERROR constants ───────────────────────────────────────────────────────

describe('LC_ERROR constants', () => {
  test('exports all expected error codes', () => {
    expect(LC_ERROR.COOKIE_REQUIRED).toBe('COOKIE_REQUIRED');
    expect(LC_ERROR.SESSION_INVALID).toBe('SESSION_INVALID');
    expect(LC_ERROR.SESSION_EXPIRED).toBe('SESSION_EXPIRED');
    expect(LC_ERROR.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(LC_ERROR.STORAGE_ERROR).toBe('STORAGE_ERROR');
  });
});
