/**
 * Token Encryption — AES-256-GCM for OAuth tokens at rest.
 *
 * Uses a 256-bit key derived from TOKEN_ENCRYPTION_KEY env var.
 * Each encrypted value includes a random IV and auth tag for integrity.
 *
 * Format: "enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 *
 * If TOKEN_ENCRYPTION_KEY is not set:
 *   - encrypt() returns plaintext unchanged (graceful degradation)
 *   - decrypt() returns the value as-is if not prefixed with "enc:v1:"
 *   - This allows gradual migration: old plaintext tokens still work
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const PREFIX = "enc:v1:";

// ─── Key Derivation ─────────────────────────────────────────────────────

let _derivedKey: Buffer | null = null;

function getDerivedKey(): Buffer | null {
  if (_derivedKey) return _derivedKey;

  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;

  // Derive a 256-bit key from the env var using SHA-256
  _derivedKey = createHash("sha256").update(raw).digest();
  return _derivedKey;
}

/** Check if encryption is available (key configured). */
export function isEncryptionAvailable(): boolean {
  return getDerivedKey() !== null;
}

// ─── Encrypt ────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext token. Returns encrypted string with prefix.
 * If no encryption key is configured, returns plaintext unchanged.
 */
export function encryptToken(plaintext: string | null): string | null {
  if (!plaintext) return plaintext;

  const key = getDerivedKey();
  if (!key) return plaintext; // Graceful degradation

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

// ─── Decrypt ────────────────────────────────────────────────────────────

/**
 * Decrypt an encrypted token. If the value is not encrypted (no prefix),
 * returns it as-is (backward compatible with plaintext tokens).
 */
export function decryptToken(value: string | null): string | null {
  if (!value) return value;

  // Not encrypted — return as-is (plaintext backward compat)
  if (!value.startsWith(PREFIX)) return value;

  const key = getDerivedKey();
  if (!key) {
    // eslint-disable-next-line no-console
    console.warn("[crypto] TOKEN_ENCRYPTION_KEY not set but encrypted token found. Returning null.");
    return null;
  }

  try {
    const payload = value.slice(PREFIX.length);
    const parts = payload.split(":");
    if (parts.length !== 3) return null;

    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const ciphertext = Buffer.from(parts[2], "hex");

    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[crypto] Failed to decrypt token:", (err as Error).message);
    return null;
  }
}

// ─── Testing helpers ────────────────────────────────────────────────────

/** Reset the derived key cache (for testing). */
export function _resetKeyCache(): void {
  _derivedKey = null;
}
