import { requireGoogleDriveEnvironment } from "@/lib/config/server-env";
import { openSecret, sealSecret, type KeyRing } from "@/lib/security/secret-box";

export { isLegacySealed, secretContext } from "@/lib/security/secret-box";

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return base64Url(data);
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export async function pkceChallenge(verifier: string) {
  return sha256(verifier);
}

/**
 * TOKEN_ENCRYPTION_KEY seals new values. TOKEN_ENCRYPTION_KEY_PREVIOUS
 * (optional, comma-separated) keeps values sealed under a retired key readable
 * during a rotation.
 */
function keyRing(): KeyRing {
  return {
    current: requireGoogleDriveEnvironment().tokenEncryptionKey,
    previous: (process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

/** Encrypts a secret bound to `context` (see `secretContext`). */
export async function encryptSecret(value: string, context: string) {
  return sealSecret(value, context, keyRing());
}

/** Decrypts a v2 secret bound to `context`, or a legacy v1 secret. */
export async function decryptSecret(value: string, context: string) {
  return openSecret(value, context, keyRing());
}
