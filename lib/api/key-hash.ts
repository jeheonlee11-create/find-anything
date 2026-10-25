/**
 * How developer API keys are hashed for storage (only the HMAC of a key is
 * stored; the key itself is shown once).
 *
 * - API_KEY_PEPPER set: it is the HMAC key, as before.
 * - Otherwise the HMAC key is derived from TOKEN_ENCRYPTION_KEY with HKDF-SHA256
 *   under a purpose label, so the token-encryption key is never used directly
 *   for a second purpose. Keys created before this change were hashed with
 *   TOKEN_ENCRYPTION_KEY itself; that hash is still accepted (`legacy`) and the
 *   caller rewrites it to the derived hash on first use.
 *
 * Pure (no environment access) so tests can check every branch.
 */

export const API_KEY_HASH_INFO = "find-anything/api-key-hash/v1";

export interface ApiKeyHashKeys {
  current: CryptoKey;
  /** Only when falling back to TOKEN_ENCRYPTION_KEY: the pre-HKDF hash key. */
  legacy: CryptoKey | null;
}

const encoder = new TextEncoder();

function hmacKey(raw: Uint8Array<ArrayBuffer>) {
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function apiKeyHashKeys(env: { API_KEY_PEPPER?: string; TOKEN_ENCRYPTION_KEY?: string }): Promise<ApiKeyHashKeys> {
  if (env.API_KEY_PEPPER) return { current: await hmacKey(encoder.encode(env.API_KEY_PEPPER)), legacy: null };
  if (!env.TOKEN_ENCRYPTION_KEY) throw new Error("API_KEY_PEPPER is not configured");
  const material = await crypto.subtle.importKey("raw", encoder.encode(env.TOKEN_ENCRYPTION_KEY), "HKDF", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: encoder.encode(API_KEY_HASH_INFO) },
    material,
    256,
  );
  return { current: await hmacKey(new Uint8Array(derived)), legacy: await hmacKey(encoder.encode(env.TOKEN_ENCRYPTION_KEY)) };
}

export async function hashApiKey(secret: string, key: CryptoKey) {
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(secret)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
