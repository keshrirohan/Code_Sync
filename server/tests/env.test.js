// ============================================================================
// tests/env.test.js — Unit tests for config/env.js validateEnv()
//
// Each test manages process.env manually and restores it afterwards.
// process.exit is mocked to throw so tests don't actually terminate.
// ============================================================================

import { jest } from '@jest/globals';

// Save the original env so each test gets a clean slate
const ORIGINAL_ENV = { ...process.env };

function setRequiredEnv() {
  process.env.MONGODB_URI      = 'mongodb://localhost:27017/test';
  process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
}

function clearRequiredEnv() {
  delete process.env.MONGODB_URI;
  delete process.env.ENCRYPTION_SECRET;
}

function clearOptionalEnv() {
  delete process.env.PORT;
  delete process.env.NODE_ENV;
  delete process.env.FRONTEND_URL;
}

afterEach(() => {
  // Full env restore
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  jest.restoreAllMocks();
});

// ── validateEnv() — happy path ────────────────────────────────────────────────

describe('validateEnv() — happy path', () => {
  test('does not call process.exit when all required vars are set', async () => {
    setRequiredEnv();
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const { validateEnv } = await import('../src/config/env.js');
    validateEnv();
    expect(mockExit).not.toHaveBeenCalled();
  });

  test('returns without error when all required vars are present', async () => {
    setRequiredEnv();
    const { validateEnv } = await import('../src/config/env.js');
    expect(() => validateEnv()).not.toThrow();
  });
});

// ── validateEnv() — missing required vars ────────────────────────────────────

describe('validateEnv() — missing required vars', () => {
  test('calls process.exit(1) when MONGODB_URI is missing', async () => {
    setRequiredEnv();
    delete process.env.MONGODB_URI;

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { validateEnv } = await import('../src/config/env.js');
    expect(() => validateEnv()).toThrow('process.exit(1)');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('calls process.exit(1) when ENCRYPTION_SECRET is missing', async () => {
    setRequiredEnv();
    delete process.env.ENCRYPTION_SECRET;

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { validateEnv } = await import('../src/config/env.js');
    expect(() => validateEnv()).toThrow('process.exit(1)');
  });

  test('calls process.exit(1) when both required vars are missing', async () => {
    clearRequiredEnv();

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { validateEnv } = await import('../src/config/env.js');
    expect(() => validateEnv()).toThrow('process.exit(1)');
  });

  test('prints missing variable names to stderr', async () => {
    setRequiredEnv();
    delete process.env.MONGODB_URI;

    jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { validateEnv } = await import('../src/config/env.js');
    try { validateEnv(); } catch {}

    const allMessages = errorSpy.mock.calls.flat().join(' ');
    expect(allMessages).toContain('MONGODB_URI');
  });
});

// ── validateEnv() — optional defaults ────────────────────────────────────────

describe('validateEnv() — optional variable defaults', () => {
  test('sets PORT to 3055 when not provided', async () => {
    setRequiredEnv();
    clearOptionalEnv();

    const { validateEnv } = await import('../src/config/env.js');
    validateEnv();
    expect(process.env.PORT).toBe('3055');
  });

  test('sets NODE_ENV to development when not provided', async () => {
    setRequiredEnv();
    clearOptionalEnv();

    const { validateEnv } = await import('../src/config/env.js');
    validateEnv();
    expect(process.env.NODE_ENV).toBe('development');
  });

  test('sets FRONTEND_URL to localhost:5173 when not provided', async () => {
    setRequiredEnv();
    clearOptionalEnv();

    const { validateEnv } = await import('../src/config/env.js');
    validateEnv();
    expect(process.env.FRONTEND_URL).toContain('localhost:5173');
  });

  test('does NOT overwrite PORT if already set', async () => {
    setRequiredEnv();
    process.env.PORT = '8080';

    const { validateEnv } = await import('../src/config/env.js');
    validateEnv();
    expect(process.env.PORT).toBe('8080');
  });

  test('does NOT overwrite NODE_ENV if already set', async () => {
    setRequiredEnv();
    process.env.NODE_ENV = 'production';

    const { validateEnv } = await import('../src/config/env.js');
    validateEnv();
    expect(process.env.NODE_ENV).toBe('production');
  });
});
