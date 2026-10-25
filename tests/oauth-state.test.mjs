import assert from "node:assert/strict";
import test from "node:test";
import * as schema from "../db/schema.ts";
import { takeOAuthState } from "../lib/google-drive/oauth-state.ts";
import { createMigratedDatabase } from "./fixtures/sqlite-d1.mjs";

test("an OAuth state can be consumed exactly once", async () => {
  const { db } = await createMigratedDatabase();
  await db.insert(schema.oauthStates).values({ stateHash: "hash_1", actorId: "actor_1", workspaceId: "ws_1", pkceVerifierCiphertext: "sealed", expiresAt: "2099-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" });
  const [first, second] = await Promise.all([takeOAuthState(db, "hash_1"), takeOAuthState(db, "hash_1")]);
  const winners = [first, second].filter(Boolean);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].actorId, "actor_1");
  assert.equal(await takeOAuthState(db, "hash_1"), undefined);
  assert.equal((await db.select().from(schema.oauthStates)).length, 0);
});
