import assert from "node:assert/strict";
import test from "node:test";
import { bearerMatches, constantTimeEqual } from "../lib/security/constant-time.ts";

test("constant-time comparison accepts only identical secrets, of any length", async () => {
  assert.equal(await constantTimeEqual("secret-token", "secret-token"), true);
  assert.equal(await constantTimeEqual("secret-token", "secret-tokeN"), false);
  assert.equal(await constantTimeEqual("short", "a much longer value"), false);
  assert.equal(await constantTimeEqual("", ""), true);
  assert.equal(await bearerMatches("Bearer abc", "abc"), true);
  assert.equal(await bearerMatches("Bearer abd", "abc"), false);
  assert.equal(await bearerMatches("abc", "abc"), false);
  assert.equal(await bearerMatches(null, "abc"), false);
  // An unset expected token never authorizes, even an empty header.
  assert.equal(await bearerMatches("Bearer ", undefined), false);
  assert.equal(await bearerMatches("Bearer ", ""), false);
});
