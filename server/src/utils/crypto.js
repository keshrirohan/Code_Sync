// ============================================================================
// utils/crypto.js — AES-256-GCM encryption for sensitive stored values.
//
// Why GCM instead of CBC?
//   GCM is an authenticated encryption mode — it detects tampering in addition
//   to providing confidentiality. It's the current best-practice for symmetric
//   encryption of data at rest.
//
// Key derivation:
//   ENCRYPTION_SECRET must be a 64-char hex string (32 bytes).
//   Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// Storage format (pipe-delimited):
//   <iv_hex>|<authTag_hex>|<ciphertext_hex>
//
// All three parts are needed for decryption — if any part is missing the
// ciphertext is treated as corrupted and decryption returns null.
// ============================================================================

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES   = 16;  // 128-bit IV
const TAG_BYTES  = 16;  // 128-bit GCM auth tag

function getKey() {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length !== 64) {
    throw new Error(
      'ENCRYPTION_SECRET must be a 64-character hex string (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(secret, 'hex');
}

/**
 * encrypt — Encrypts a plaintext string.
 *
 * Input:  plaintext (string)
 * Output: "<iv_hex>|<authTag_hex>|<ciphertext_hex>"
 *         Returns null if plaintext is null/undefined/empty.
 */
export function encrypt(plaintext) {
  if (!plaintext) return null;

  const key    = getKey();
  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}|${authTag.toString('hex')}|${encrypted.toString('hex')}`;
}

/**
 * decrypt — Decrypts a ciphertext produced by encrypt().
 *
 * Input:  ciphertext (string) — "<iv_hex>|<authTag_hex>|<ciphertext_hex>"
 * Output: plaintext string, or null on any failure (missing, wrong key, tampered)
 */
export function decrypt(ciphertext) {
  if (!ciphertext) return null;

  try {
    const parts = ciphertext.split('|');
    if (parts.length !== 3) return null;

    const [ivHex, tagHex, encHex] = parts;
    const key     = getKey();
    const iv      = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const enc     = Buffer.from(encHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(enc),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    // Wrong key, tampered data, or malformed input — return null silently
    return null;
  }
}

/**
 * isEncrypted — Quick heuristic to check whether a value looks encrypted.
 * Used to avoid double-encrypting values that are already in the DB.
 *
 * An encrypted value has exactly 2 pipe characters separating 3 hex segments.
 */
export function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split('|');
  return parts.length === 3 && parts.every(p => /^[0-9a-f]+$/i.test(p));
}
