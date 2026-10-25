import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { oauthStates } from "../../db/schema.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts the D1 driver and the sqlite-proxy test driver alike.
type StateDb = Pick<BaseSQLiteDatabase<"async", any>, "delete">;

/**
 * Consumes an OAuth state exactly once. The row is deleted and returned by a
 * single `DELETE ... RETURNING` statement, so two callbacks racing with the
 * same state cannot both read it before either deletes it: one gets the row,
 * the other gets nothing. Expiry and actor checks happen on the returned row.
 */
export async function takeOAuthState(db: StateDb, stateHash: string) {
  return db.delete(oauthStates).where(eq(oauthStates.stateHash, stateHash)).returning().get();
}
