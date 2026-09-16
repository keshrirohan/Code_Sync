// ============================================================================
// tests/crypto.test.js — Unit tests for AES-256-GCM encrypt/decrypt/isEncrypted
//
// All tests run purely in-process with no I/O or network calls.
// We set ENCRYPTION_SECRET to a deterministic 64-char hex string so every
// test run produces consistent behaviour.
// ============================================================================

import { encrypt, decrypt, isEncrypted } from '../src/utils/crypto.js';

// A fixed 64-char hex key used for all tests
const TEST_SECRET = 'a'.repeat(64);

beforeAll(() => {
  process.env.ENCRYPTION_SECRET = TEST_SECRET;
});

afterAll(() => {
  delete process.env.ENCRYPTION_SECRET;
});

// ── encrypt() ────────────────────────────────────────────────────────────────

describe('encrypt()', () => {
  test('returns a pipe-delimited string with 3 hex segments', () => {
    const result = encrypt('hello');
    expect(typeof result).toBe('string');
    const parts = result.split('|');
    expect(parts).toHaveLength(3);
    parts.forEach(p => expect(p).toMatch(/^[0-9a-f]+$/i));
  });

  test('returns null for null input', () => {
    expect(encrypt(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(encrypt(undefined)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(encrypt('')).toBeNull();
  });

  test('produces different ciphertext each call (random IV)', () => {
    const a = encrypt('same value');
    const b = encrypt('same value');
    expect(a).not.toBe(b); // different IVs → different output
  });

  test('encrypts long strings correctly', () => {
    const long = 'x'.repeat(5000);
    const result = encrypt(long);
    expect(result).not.toBeNull();
    expect(result.split('|')).toHaveLength(3);
  });

  test('encrypts strings with special characters', () => {
    const special = 'LEETCODE_SESSION=eyJhbGci; csrftoken=abc/+==\n\t"<>';
    const result = encrypt(special);
    expect(result).not.toBeNull();
    // ciphertext must NOT contain the plaintext
    expect(result).not.toContain('LEETCODE_SESSION');
  });

  test('throws when ENCRYPTION_SECRET is missing', () => {
    const original = process.env.ENCRYPTION_SECRET;
    delete process.env.ENCRYPTION_SECRET;
    expect(() => encrypt('test')).toThrow('ENCRYPTION_SECRET');
    process.env.ENCRYPTION_SECRET = original;
  });

  test('throws when ENCRYPTION_SECRET has wrong length', () => {
    const original = process.env.ENCRYPTION_SECRET;
    process.env.ENCRYPTION_SECRET = 'tooshort';
    expect(() => encrypt('test')).toThrow('ENCRYPTION_SECRET');
    process.env.ENCRYPTION_SECRET = original;
  });
});

// ── decrypt() ────────────────────────────────────────────────────────────────

describe('decrypt()', () => {
  test('round-trips plaintext through encrypt → decrypt', () => {
    const plaintext = 'my-secret-github-token';
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  test('round-trips a LeetCode session cookie', () => {
    const cookie = 'LEETCODE_SESSION=eyJhbGciOiJIUzI1NiJ9.test; csrftoken=abc123';
    expect(decrypt(encrypt(cookie))).toBe(cookie);
  });

  test('round-trips an empty-ish but truthy string', () => {
    const val = ' ';
    expect(decrypt(encrypt(val))).toBe(val);
  });

  test('returns null for null input', () => {
    expect(decrypt(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(decrypt(undefined)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(decrypt('')).toBeNull();
  });

  test('returns null for a plain string (not encrypted format)', () => {
    expect(decrypt('not-encrypted-at-all')).toBeNull();
  });

  test('returns null for a 2-segment pipe string (missing auth tag)', () => {
    expect(decrypt('aabbcc|ddeeff')).toBeNull();
  });

  test('returns null for tampered ciphertext (auth tag mismatch)', () => {
    const ct = encrypt('original');
    const parts = ct.split('|');
    // Flip the last byte of the ciphertext
    const tampered = parts[0] + '|' + parts[1] + '|' + parts[2].slice(0, -2) + '00';
    expect(decrypt(tampered)).toBeNull();
  });

  test('returns null when decrypting with wrong key', () => {
    const ciphertext = encrypt('secret');
    // Switch to different key
    process.env.ENCRYPTION_SECRET = 'b'.repeat(64);
    expect(decrypt(ciphertext)).toBeNull();
    // Restore correct key
    process.env.ENCRYPTION_SECRET = TEST_SECRET;
  });

  test('handles multi-pipe strings (4 parts) gracefully', () => {
    expect(decrypt('aa|bb|cc|dd')).toBeNull();
  });
});

// ── isEncrypted() ─────────────────────────────────────────────────────────────

describe('isEncrypted()', () => {
  test('returns true for a string produced by encrypt()', () => {
    const ct = encrypt('test-value');
    expect(isEncrypted(ct)).toBe(true);
  });

  test('returns false for a plaintext string', () => {
    expect(isEncrypted('LEETCODE_SESSION=abc')).toBe(false);
  });

  test('returns false for null', () => {
    expect(isEncrypted(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isEncrypted(undefined)).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isEncrypted('')).toBe(false);
  });

  test('returns false for a 2-segment pipe string', () => {
    expect(isEncrypted('aabb|ccdd')).toBe(false);
  });

  test('returns false when a segment contains non-hex chars', () => {
    expect(isEncrypted('aabb|ccdd|ggzz')).toBe(false);
  });

  test('returns true for 3 valid lowercase hex segments', () => {
    expect(isEncrypted('0011aabb|ccddee|ff1234')).toBe(true);
  });

  test('returns true for 3 valid uppercase hex segments', () => {
    expect(isEncrypted('AABB|CCDD|EEFF')).toBe(true);
  });

  test('idempotency guard — double-encrypting is detectable', () => {
    const ct = encrypt('value');
    // Because ct is already "encrypted format", isEncrypted returns true
    // so encryptFields() would skip re-encrypting it
    expect(isEncrypted(ct)).toBe(true);
    // A second encrypt call on a plaintext that happens to look like
    // a hex triple would still be guarded
    expect(isEncrypted('plaintext-github-token')).toBe(false);
  });
});
