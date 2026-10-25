/**
 * AES-256-GCM encryption for secrets stored in D1 (OAuth tokens, the PKCE
 * verifier, beta-request emails).
 *
 * Format v2: `v2.<keyId>.<iv>.<ciphertext>` (base64url parts).
 * - `keyId` is the first 8 hex characters of SHA-256(key), so a ciphertext
 *   names the key that sealed it and keys can rotate: decryption looks the key
 *   up among the current key and any previous keys.
 * - The additional authenticated data (AAD) is `find-anything:v2:<keyId>:<context>`,
 *   where `context` names the row and field the secret belongs to (for example
 *   `connectors/<workspaceId>/google_drive/refresh_token`). A ciphertext copied
 *   into another row or field fails authentication instead of decrypting.
 *
 * Format v1 (`v1.<iv>.<ciphertext>`, no key id, no AAD) is still accepted for
 * reading, so rows written before v2 keep working. Callers re-seal a v1 value
 * as v2 when they next write it.
 *
 * Pure: keys are passed in, so tests can exercise every path without the
 * Worker environment.
 */

export interface KeyRing {
  /** 32 bytes as 64 hex characters or 43 base64url characters. Used to seal. */
  current: string;
  /** Older keys, accepted for opening only. */
  previous?: string[];
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function rawKey(encoded: string) {
  const bytes = /^[a-f0-9]{64}$/i.test(encoded)
    ? Uint8Array.from(encoded.match(/../g)!, (byte) => parseInt(byte, 16))
    : fromBase64Url(encoded);
  if (bytes.length !== 32) throw new Error("Encryption key must be exactly 32 bytes");
  return bytes;
}

export async function keyId(encoded: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", rawKey(encoded)));
  return Array.from(digest.slice(0, 4), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function importKey(encoded: string) {
  return crypto.subtle.importKey("raw", rawKey(encoded), "AES-GCM", false, ["encrypt", "decrypt"]);
}

function additionalData(id: string, context: string) {
  return new TextEncoder().encode(`find-anything:v2:${id}:${context}`);
}

export function isLegacySealed(value: string) {
  return value.startsWith("v1.");
}

export async function sealSecret(plaintext: string, context: string, keys: KeyRing): Promise<string> {
  if (!context) throw new Error("A secret must be sealed to a context");
  const id = await keyId(keys.current),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: additionalData(id, context) },
      await importKey(keys.current),
      new TextEncoder().encode(plaintext),
    );
  return `v2.${id}.${base64Url(iv)}.${base64Url(new Uint8Array(ciphertext))}`;
}

export async function openSecret(sealed: string, context: string, keys: KeyRing): Promise<string> {
  const parts = sealed.split("."),
    candidates = [keys.current, ...(keys.previous ?? [])].filter(Boolean);
  if (parts[0] === "v2" && parts.length === 4) {
    const [, id, iv, ciphertext] = parts;
    for (const candidate of candidates)
      if ((await keyId(candidate)) === id) {
        const plaintext = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: fromBase64Url(iv), additionalData: additionalData(id, context) },
          await importKey(candidate),
          fromBase64Url(ciphertext),
        );
        return new TextDecoder().decode(plaintext);
      }
    throw new Error("No configured key matches this encrypted secret");
  }
  if (parts[0] === "v1" && parts.length === 3) {
    const [, iv, ciphertext] = parts;
    for (const candidate of candidates)
      try {
        const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(iv) }, await importKey(candidate), fromBase64Url(ciphertext));
        return new TextDecoder().decode(plaintext);
      } catch {
        // Legacy values carry no key id: try the next configured key.
      }
    throw new Error("Legacy encrypted secret could not be decrypted with any configured key");
  }
  throw new Error("Unsupported encrypted secret format");
}

/** Context strings: one per stored secret field, bound to the row's stable key. */
export const secretContext = {
  connectorAccessToken: (workspaceId: string, provider = "google_drive") => `connectors/${workspaceId}/${provider}/access_token`,
  connectorRefreshToken: (workspaceId: string, provider = "google_drive") => `connectors/${workspaceId}/${provider}/refresh_token`,
  oauthPkceVerifier: (stateHash: string) => `oauth_states/${stateHash}/pkce_verifier`,
  betaRequestEmail: (emailHash: string) => `beta_access_requests/${emailHash}/email`,
};
