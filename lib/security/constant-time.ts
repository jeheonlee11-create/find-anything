/**
 * Compares two secrets in time that does not depend on where they differ, or
 * on the secret's length: both sides are hashed to 32 bytes first, then every
 * byte is compared. Use for bearer tokens and any other shared secret.
 */
export async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < x.length; index += 1) difference |= x[index] ^ y[index];
  return difference === 0;
}

/** True when `authorization` is exactly `Bearer <expected>` and `expected` is configured. */
export async function bearerMatches(authorization: string | null, expected: string | undefined): Promise<boolean> {
  if (!expected) return false;
  return constantTimeEqual(authorization ?? "", `Bearer ${expected}`);
}
