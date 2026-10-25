import assert from "node:assert/strict";
import test from "node:test";
import { isLegacySealed, keyId, openSecret, sealSecret, secretContext } from "../lib/security/secret-box.ts";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

/** The v1 format exactly as the pre-v2 code wrote it: AES-GCM, no AAD, no key id. */
async function legacySeal(plaintext, hexKey) {
  const key = await crypto.subtle.importKey("raw", Buffer.from(hexKey, "hex"), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(ciphertext))}`;
}

test("v2 secrets round-trip and name the key that sealed them", async () => {
  const context = secretContext.connectorRefreshToken("ws_1");
  const sealed = await sealSecret("refresh-token-value", context, { current: KEY_A });
  const [version, id] = sealed.split(".");
  assert.equal(version, "v2");
  assert.equal(id, await keyId(KEY_A));
  assert.equal(isLegacySealed(sealed), false);
  assert.equal(await openSecret(sealed, context, { current: KEY_A }), "refresh-token-value");
});
test("a v2 secret moved to another row or field fails authentication", async () => {
  const sealed = await sealSecret("token", secretContext.connectorAccessToken("ws_1"), { current: KEY_A });
  await assert.rejects(openSecret(sealed, secretContext.connectorAccessToken("ws_2"), { current: KEY_A }));
  await assert.rejects(openSecret(sealed, secretContext.connectorRefreshToken("ws_1"), { current: KEY_A }));
  // A tampered key id cannot redirect decryption either.
  const [, , iv, ciphertext] = sealed.split(".");
  await assert.rejects(openSecret(`v2.${await keyId(KEY_B)}.${iv}.${ciphertext}`, secretContext.connectorAccessToken("ws_1"), { current: KEY_A, previous: [KEY_B] }));
});
test("rotation: values sealed under a previous key still open; unknown keys are refused", async () => {
  const context = secretContext.oauthPkceVerifier("state_hash");
  const sealedWithOld = await sealSecret("verifier", context, { current: KEY_B });
  assert.equal(await openSecret(sealedWithOld, context, { current: KEY_A, previous: [KEY_B] }), "verifier");
  await assert.rejects(openSecret(sealedWithOld, context, { current: KEY_A }), /No configured key/);
});
test("legacy v1 ciphertexts written by the old code still decrypt", async () => {
  const legacy = await legacySeal("old-access-token", KEY_A);
  assert.equal(isLegacySealed(legacy), true);
  assert.equal(await openSecret(legacy, secretContext.connectorAccessToken("ws_1"), { current: KEY_A }), "old-access-token");
  // ...including after the key that wrote them was rotated out of `current`.
  assert.equal(await openSecret(legacy, "any-context", { current: KEY_B, previous: [KEY_A] }), "old-access-token");
  await assert.rejects(openSecret(legacy, "any-context", { current: KEY_B }));
  await assert.rejects(openSecret("v3.x.y", "any-context", { current: KEY_A }), /Unsupported/);
});
test("a secret cannot be sealed without a context", async () => {
  await assert.rejects(sealSecret("value", "", { current: KEY_A }));
});
