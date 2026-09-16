// ============================================================================
// tests/storage.test.js — Unit tests for the MongoDB-backed storage layer.
//
// We mock the Mongoose models (Settings, SyncHistory) and the logger so
// no real database connection is needed. Tests verify:
//   • encrypt-on-write / decrypt-on-read for sensitive fields
//   • loadConfig returns decrypted values
//   • saveConfig re-encrypts only plaintext values (idempotent)
//   • history CRUD operations call the right model methods
// ============================================================================

import { jest } from '@jest/globals';

// ── Environment setup ─────────────────────────────────────────────────────────
process.env.ENCRYPTION_SECRET = 'a'.repeat(64);

// ── Mock Mongoose models ──────────────────────────────────────────────────────

const mockLoadGlobal = jest.fn();
const mockSaveGlobal = jest.fn();
const mockHistoryFind = jest.fn();
const mockHistoryCreate = jest.fn();
const mockHistoryFindOneAndUpdate = jest.fn();
const mockHistoryDeleteOne = jest.fn();

jest.unstable_mockModule('../src/models/Settings.js', () => ({
  default: {
    loadGlobal: mockLoadGlobal,
    saveGlobal: mockSaveGlobal,
  },
}));

jest.unstable_mockModule('../src/models/SyncHistory.js', () => ({
  default: {
    find: mockHistoryFind,
    create: mockHistoryCreate,
    findOneAndUpdate: mockHistoryFindOneAndUpdate,
    deleteOne: mockHistoryDeleteOne,
  },
}));

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const {
  loadConfig, saveConfig,
  loadHistory, addHistoryEntry, updateHistoryEntry, deleteHistoryEntry,
} = await import('../src/storage/storage.js');

const { encrypt, isEncrypted } = await import('../src/utils/crypto.js');

// ── loadConfig() ──────────────────────────────────────────────────────────────

describe('loadConfig()', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns an empty object when Settings.loadGlobal returns empty', async () => {
    mockLoadGlobal.mockResolvedValue({});
    const result = await loadConfig();
    expect(result).toEqual({});
  });

  test('decrypts leetcodeCookie on read', async () => {
    const plaintext = 'LEETCODE_SESSION=abc123; csrftoken=tok';
    const ciphertext = encrypt(plaintext);
    mockLoadGlobal.mockResolvedValue({ leetcodeCookie: ciphertext });
    const result = await loadConfig();
    expect(result.leetcodeCookie).toBe(plaintext);
  });

  test('decrypts githubToken on read', async () => {
    const token = 'ghp_supersecrettoken';
    mockLoadGlobal.mockResolvedValue({ githubToken: encrypt(token) });
    const result = await loadConfig();
    expect(result.githubToken).toBe(token);
  });

  test('decrypts githubOAuthClientSecret on read', async () => {
    const secret = 'oauth-client-secret-value';
    mockLoadGlobal.mockResolvedValue({ githubOAuthClientSecret: encrypt(secret) });
    const result = await loadConfig();
    expect(result.githubOAuthClientSecret).toBe(secret);
  });

  test('leaves non-sensitive fields untouched', async () => {
    mockLoadGlobal.mockResolvedValue({
      leetcodeUsername: 'johndoe',
      githubUsername: 'jsmith',
      targetRepoUrl: 'https://github.com/jsmith/repo.git',
    });
    const result = await loadConfig();
    expect(result.leetcodeUsername).toBe('johndoe');
    expect(result.githubUsername).toBe('jsmith');
    expect(result.targetRepoUrl).toBe('https://github.com/jsmith/repo.git');
  });

  test('leaves null sensitive fields as null', async () => {
    mockLoadGlobal.mockResolvedValue({ leetcodeCookie: null, githubToken: null });
    const result = await loadConfig();
    expect(result.leetcodeCookie).toBeNull();
    expect(result.githubToken).toBeNull();
  });

  test('returns empty object and does not throw when DB fails', async () => {
    mockLoadGlobal.mockRejectedValue(new Error('Atlas connection lost'));
    const result = await loadConfig();
    expect(result).toEqual({});
  });

  test('does not expose encrypted ciphertext in returned object', async () => {
    const token = 'ghp_secret_token';
    mockLoadGlobal.mockResolvedValue({ githubToken: encrypt(token) });
    const result = await loadConfig();
    // The returned value must be the plaintext, not the ciphertext
    expect(isEncrypted(result.githubToken)).toBe(false);
    expect(result.githubToken).toBe(token);
  });
});

// ── saveConfig() ──────────────────────────────────────────────────────────────

describe('saveConfig()', () => {
  afterEach(() => jest.clearAllMocks());

  test('encrypts leetcodeCookie before calling saveGlobal', async () => {
    mockSaveGlobal.mockResolvedValue({});
    await saveConfig({ leetcodeCookie: 'LEETCODE_SESSION=plain' });
    const saved = mockSaveGlobal.mock.calls[0][0];
    expect(isEncrypted(saved.leetcodeCookie)).toBe(true);
    expect(saved.leetcodeCookie).not.toContain('LEETCODE_SESSION=plain');
  });

  test('encrypts githubToken before calling saveGlobal', async () => {
    mockSaveGlobal.mockResolvedValue({});
    await saveConfig({ githubToken: 'ghp_mytoken' });
    const saved = mockSaveGlobal.mock.calls[0][0];
    expect(isEncrypted(saved.githubToken)).toBe(true);
  });

  test('encrypts githubOAuthClientSecret before calling saveGlobal', async () => {
    mockSaveGlobal.mockResolvedValue({});
    await saveConfig({ githubOAuthClientSecret: 'my-oauth-secret' });
    const saved = mockSaveGlobal.mock.calls[0][0];
    expect(isEncrypted(saved.githubOAuthClientSecret)).toBe(true);
  });

  test('does NOT double-encrypt already-encrypted values', async () => {
    mockSaveGlobal.mockResolvedValue({});
    const alreadyEncrypted = encrypt('ghp_mytoken');
    await saveConfig({ githubToken: alreadyEncrypted });
    const saved = mockSaveGlobal.mock.calls[0][0];
    // Should be exactly the same ciphertext, not re-encrypted
    expect(saved.githubToken).toBe(alreadyEncrypted);
  });

  test('passes non-sensitive fields through unmodified', async () => {
    mockSaveGlobal.mockResolvedValue({});
    await saveConfig({ leetcodeUsername: 'myuser', targetRepoUrl: 'https://github.com/x/y.git' });
    const saved = mockSaveGlobal.mock.calls[0][0];
    expect(saved.leetcodeUsername).toBe('myuser');
    expect(saved.targetRepoUrl).toBe('https://github.com/x/y.git');
  });

  test('throws and propagates when saveGlobal fails', async () => {
    mockSaveGlobal.mockRejectedValue(new Error('write failed'));
    await expect(saveConfig({ githubToken: 'tok' })).rejects.toThrow('write failed');
  });

  test('round-trip: save then load returns original plaintext', async () => {
    const plainCookie = 'LEETCODE_SESSION=roundtrip; csrftoken=xyz';
    let stored = null;

    mockSaveGlobal.mockImplementation(async (data) => { stored = data; });
    mockLoadGlobal.mockImplementation(async () => stored || {});

    await saveConfig({ leetcodeCookie: plainCookie });
    const loaded = await loadConfig();
    expect(loaded.leetcodeCookie).toBe(plainCookie);
  });
});

// ── loadHistory() ─────────────────────────────────────────────────────────────

describe('loadHistory()', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns empty array when collection is empty', async () => {
    mockHistoryFind.mockReturnValue({
      sort: () => ({ lean: async () => [] }),
    });
    expect(await loadHistory()).toEqual([]);
  });

  test('returns array of documents sorted newest first', async () => {
    const docs = [
      { id: 'b', startedAt: new Date('2024-02-01') },
      { id: 'a', startedAt: new Date('2024-01-01') },
    ];
    mockHistoryFind.mockReturnValue({
      sort: () => ({ lean: async () => docs }),
    });
    const result = await loadHistory();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('b'); // newest first
  });

  test('returns empty array and does not throw when DB fails', async () => {
    mockHistoryFind.mockReturnValue({
      sort: () => ({ lean: async () => { throw new Error('DB down'); } }),
    });
    const result = await loadHistory();
    expect(result).toEqual([]);
  });
});

// ── addHistoryEntry() ─────────────────────────────────────────────────────────

describe('addHistoryEntry()', () => {
  afterEach(() => jest.clearAllMocks());

  test('calls SyncHistory.create with the entry', async () => {
    mockHistoryCreate.mockResolvedValue({});
    const entry = { id: 'uuid-1', status: 'running', startedAt: new Date().toISOString() };
    await addHistoryEntry(entry);
    expect(mockHistoryCreate).toHaveBeenCalledWith(entry);
  });

  test('falls back to findOneAndUpdate on duplicate key error (code 11000)', async () => {
    const dupError = Object.assign(new Error('duplicate key'), { code: 11000 });
    mockHistoryCreate.mockRejectedValue(dupError);
    mockHistoryFindOneAndUpdate.mockResolvedValue({});

    const entry = { id: 'uuid-dup', status: 'success' };
    await addHistoryEntry(entry);
    expect(mockHistoryFindOneAndUpdate).toHaveBeenCalledWith(
      { id: 'uuid-dup' },
      { $set: { status: 'success' } },
      { new: true }
    );
  });

  test('throws on non-duplicate errors', async () => {
    mockHistoryCreate.mockRejectedValue(new Error('timeout'));
    await expect(addHistoryEntry({ id: 'x', status: 'running' })).rejects.toThrow('timeout');
  });
});

// ── updateHistoryEntry() ──────────────────────────────────────────────────────

describe('updateHistoryEntry()', () => {
  afterEach(() => jest.clearAllMocks());

  test('calls findOneAndUpdate with the correct id and updates', async () => {
    mockHistoryFindOneAndUpdate.mockResolvedValue({});
    await updateHistoryEntry('uuid-1', { status: 'success', completedAt: '2024-01-01T00:00:00Z' });
    expect(mockHistoryFindOneAndUpdate).toHaveBeenCalledWith(
      { id: 'uuid-1' },
      { $set: { status: 'success', completedAt: '2024-01-01T00:00:00Z' } }
    );
  });

  test('does not throw when DB fails (logs only)', async () => {
    mockHistoryFindOneAndUpdate.mockRejectedValue(new Error('timeout'));
    await expect(updateHistoryEntry('uuid-1', { status: 'error' })).resolves.toBeUndefined();
  });
});

// ── deleteHistoryEntry() ──────────────────────────────────────────────────────

describe('deleteHistoryEntry()', () => {
  afterEach(() => jest.clearAllMocks());

  test('calls SyncHistory.deleteOne with the correct id', async () => {
    mockHistoryDeleteOne.mockResolvedValue({ deletedCount: 1 });
    await deleteHistoryEntry('uuid-to-delete');
    expect(mockHistoryDeleteOne).toHaveBeenCalledWith({ id: 'uuid-to-delete' });
  });

  test('throws when deleteOne fails', async () => {
    mockHistoryDeleteOne.mockRejectedValue(new Error('write conflict'));
    await expect(deleteHistoryEntry('uuid-x')).rejects.toThrow('write conflict');
  });
});
