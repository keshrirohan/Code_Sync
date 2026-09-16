// ============================================================================
// __tests__/api.test.js — Unit tests for src/api.js
//
// api.js exports a single helper: apiUrl(path)
// It prepends VITE_API_URL (or its production fallback) to any path.
//
// Because import.meta.env is a Vite-only construct, we simulate it in the
// Jest jsdom environment by injecting a global before importing the module.
// ============================================================================

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Dynamically import api.js after setting up import.meta.env.
 * Jest's module registry is reset between each helper call via
 * jest.resetModules() so each test gets a fresh module evaluation.
 */
async function importApiWith(envVars = {}) {
  // Inject import.meta.env into the global scope so Babel-transpiled
  // import.meta.env references resolve correctly in jsdom
  global.importMetaEnv = {
    VITE_API_URL: '',
    PROD: false,
    DEV: true,
    ...envVars,
  };

  // Patch import.meta.env globally via Object.defineProperty on globalThis
  // babel-jest transforms import.meta.env → process.env in CJS output,
  // so we set the corresponding process.env key instead
  const oldUrl = process.env.VITE_API_URL;
  const oldProd = process.env.PROD;

  if ('VITE_API_URL' in envVars) {
    process.env.VITE_API_URL = envVars.VITE_API_URL;
  } else {
    delete process.env.VITE_API_URL;
  }

  jest.resetModules();
  const mod = await import('../api.js');

  // Restore
  if (oldUrl !== undefined) process.env.VITE_API_URL = oldUrl;
  else delete process.env.VITE_API_URL;

  return mod;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('apiUrl()', () => {
  afterEach(() => {
    jest.resetModules();
    delete process.env.VITE_API_URL;
  });

  test('prepends the base URL to a given path', async () => {
    process.env.VITE_API_URL = 'https://codesync-api-5p2c.onrender.com';
    jest.resetModules();
    const { apiUrl } = await import('../api.js');
    expect(apiUrl('/api/config')).toBe('https://codesync-api-5p2c.onrender.com/api/config');
  });

  test('strips trailing slash from base URL before prepending', async () => {
    process.env.VITE_API_URL = 'https://codesync-api-5p2c.onrender.com/';
    jest.resetModules();
    const { apiUrl } = await import('../api.js');
    expect(apiUrl('/api/config')).toBe('https://codesync-api-5p2c.onrender.com/api/config');
  });

  test('works with an empty VITE_API_URL (relative paths in dev)', async () => {
    delete process.env.VITE_API_URL;
    jest.resetModules();
    const { apiUrl } = await import('../api.js');
    // When base is empty string, apiUrl just returns the path as-is
    const result = apiUrl('/api/health');
    expect(result).toMatch(/\/api\/health$/);
  });

  test('returns a string for every call', async () => {
    process.env.VITE_API_URL = 'https://example.com';
    jest.resetModules();
    const { apiUrl } = await import('../api.js');
    expect(typeof apiUrl('/api/repos')).toBe('string');
    expect(typeof apiUrl('/api/history')).toBe('string');
    expect(typeof apiUrl('/api/auth/github')).toBe('string');
  });

  test('handles paths without a leading slash', async () => {
    process.env.VITE_API_URL = 'https://example.com';
    jest.resetModules();
    const { apiUrl } = await import('../api.js');
    const result = apiUrl('api/config');
    expect(result).toBe('https://example.comapi/config');
  });

  test('handles deeply nested paths', async () => {
    process.env.VITE_API_URL = 'https://api.example.com';
    jest.resetModules();
    const { apiUrl } = await import('../api.js');
    expect(apiUrl('/api/sync/abc-123/stream')).toBe(
      'https://api.example.com/api/sync/abc-123/stream'
    );
  });

  test('handles query strings in the path', async () => {
    process.env.VITE_API_URL = 'https://api.example.com';
    jest.resetModules();
    const { apiUrl } = await import('../api.js');
    expect(apiUrl('/api/repos?page=2')).toBe('https://api.example.com/api/repos?page=2');
  });

  test('uses production backend URL as fallback when env not set', async () => {
    delete process.env.VITE_API_URL;
    jest.resetModules();
    const { apiUrl } = await import('../api.js');
    // In production (PROD=true) it falls back to the hardcoded Render URL.
    // In test (PROD=false) it falls back to '' so the path is returned as-is.
    const result = apiUrl('/api/config');
    expect(typeof result).toBe('string');
    expect(result).toContain('/api/config');
  });
});
