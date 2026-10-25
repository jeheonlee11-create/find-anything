import assert from "node:assert/strict";
import test from "node:test";
import { API_KEY_HASH_INFO, apiKeyHashKeys, hashApiKey } from "../lib/api/key-hash.ts";

const KEY_A = "a".repeat(64);

test("API key hashes use the pepper, or an HKDF-derived key, never the raw encryption key", async () => {
  const secret = "fa_live_example";
  const pepper = await apiKeyHashKeys({ API_KEY_PEPPER: "pepper-value", TOKEN_ENCRYPTION_KEY: KEY_A });
  assert.equal(pepper.legacy, null);
  const derived = await apiKeyHashKeys({ TOKEN_ENCRYPTION_KEY: KEY_A });
  const derivedHash = await hashApiKey(secret, derived.current), legacyHash = await hashApiKey(secret, derived.legacy);
  assert.notEqual(derivedHash, legacyHash);
  assert.notEqual(derivedHash, await hashApiKey(secret, pepper.current));
  // The legacy hash is exactly what keys created before this change stored.
  const { createHmac } = await import("node:crypto");
  assert.equal(legacyHash, createHmac("sha256", KEY_A).update(secret).digest("hex"));
  assert.equal(await hashApiKey(secret, pepper.current), createHmac("sha256", "pepper-value").update(secret).digest("hex"));
  // Deterministic, and labelled for its purpose.
  assert.equal(derivedHash, await hashApiKey(secret, (await apiKeyHashKeys({ TOKEN_ENCRYPTION_KEY: KEY_A })).current));
  assert.equal(API_KEY_HASH_INFO, "find-anything/api-key-hash/v1");
  await assert.rejects(apiKeyHashKeys({}), /API_KEY_PEPPER is not configured/);
});
