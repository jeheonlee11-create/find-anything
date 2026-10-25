import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiKeys, apiRateLimits } from "@/db/schema";
import { getDb } from "@/db";
import { apiKeyHashKeys, hashApiKey } from "./key-hash";

export interface ApiPrincipal {
  apiKeyId: string;
  workspaceId: string;
  actorId: string;
}

const REQUESTS_PER_MINUTE = 60;

function hashKeys() {
  return apiKeyHashKeys({ API_KEY_PEPPER: process.env.API_KEY_PEPPER, TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY });
}

/** Creates a key and returns its secret once; only its HMAC is stored. */
export async function createWorkspaceApiKey(workspaceId: string, actorId: string, name: string) {
  const secret = `fa_live_${random(32)}`,
    keyHash = await hashApiKey(secret, (await hashKeys()).current),
    id = `key_${crypto.randomUUID()}`,
    db = await getDb(),
    createdAt = new Date().toISOString();
  await db.insert(apiKeys).values({ id, workspaceId, actorId, name, keyPrefix: secret.slice(0, 16), keyHash, createdAt });
  return { id, name, prefix: secret.slice(0, 16), secret, createdAt };
}

/** Resolves a Bearer API key to its workspace, or returns the error response. */
export async function requireWorkspaceApiKey(request: Request): Promise<ApiPrincipal | NextResponse> {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID(),
    authorization = request.headers.get("authorization") ?? "",
    secret = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!secret) return error(401, "INVALID_API_KEY", "A Bearer API key is required.", requestId);
  const db = await getDb(),
    keys = await hashKeys(),
    currentHash = await hashApiKey(secret, keys.current),
    active = (keyHash: string) => db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt))).get();
  let row = await active(currentHash);
  if (!row && keys.legacy) {
    // A key created before HKDF derivation: accept it once, then store the derived hash.
    row = await active(await hashApiKey(secret, keys.legacy));
    if (row) await db.update(apiKeys).set({ keyHash: currentHash }).where(eq(apiKeys.id, row.id));
  }
  if (!row) return error(401, "INVALID_API_KEY", "The API key is invalid or revoked.", requestId);
  const now = new Date(),
    windowStart = new Date(Math.floor(now.getTime() / 60000) * 60000).toISOString(),
    rateId = `rate_${row.id}_${windowStart}`;
  await db
    .insert(apiRateLimits)
    .values({ id: rateId, apiKeyId: row.id, windowStart, requestCount: 1, updatedAt: now.toISOString() })
    .onConflictDoUpdate({
      target: [apiRateLimits.apiKeyId, apiRateLimits.windowStart],
      set: { requestCount: sql`${apiRateLimits.requestCount} + 1`, updatedAt: now.toISOString() },
    });
  if ((await currentCount(row.id, windowStart)) > REQUESTS_PER_MINUTE)
    return error(429, "RATE_LIMITED", "Rate limit exceeded; retry in the next minute.", requestId);
  await db.update(apiKeys).set({ lastUsedAt: now.toISOString() }).where(eq(apiKeys.id, row.id));
  return { apiKeyId: row.id, workspaceId: row.workspaceId, actorId: row.actorId };
}

function error(status: number, code: string, message: string, requestId: string) {
  return NextResponse.json({ error: { code, message, requestId } }, { status, headers: { "x-request-id": requestId, "cache-control": "no-store" } });
}

async function currentCount(apiKeyId: string, windowStart: string) {
  const db = await getDb();
  const row = await db
    .select({ count: apiRateLimits.requestCount })
    .from(apiRateLimits)
    .where(and(eq(apiRateLimits.apiKeyId, apiKeyId), eq(apiRateLimits.windowStart, windowStart)))
    .get();
  return row?.count ?? 0;
}

function random(length: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
