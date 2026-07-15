import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { syncRuns } from "@/db/schema";
import { connectorForWorkspace } from "@/lib/google-drive/repository";
import { currentlyAuthorizedWorkspaceFiles } from "./authorization";

export async function liveWorkspaceCoverage(workspaceId: string) {
  const connector = await connectorForWorkspace(workspaceId);
  if (!connector || connector.status !== "connected")
    throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");
  const { files, inventory } =
      await currentlyAuthorizedWorkspaceFiles(workspaceId),
    count = (status: string) =>
      files.filter((file) => file.indexStatus === status).length,
    db = await getDb(),
    latest = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.connectorId, connector.id))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    failed = count("failed"),
    pending = count("pending"),
    unsupported = count("unsupported"),
    reasons = [
      !inventory.paginationComplete
        ? "Drive inventory pagination did not complete."
        : null,
      failed ? `${failed} files failed indexing.` : null,
      pending ? `${pending} files are pending indexing.` : null,
      unsupported ? `${unsupported} files use unsupported formats.` : null,
      latest?.filesRemoved
        ? `${latest.filesRemoved} files were deleted or are no longer authorized.`
        : null,
    ].filter(Boolean);
  return {
    workspaceId,
    authorizedFilesDiscovered: inventory.filesDiscovered,
    indexedFiles: count("indexed"),
    skippedFiles: unsupported,
    failedFiles: failed,
    pendingFiles: pending,
    filesRemovedOrUnauthorized: latest?.filesRemoved ?? 0,
    paginationComplete: inventory.paginationComplete,
    lastSuccessfulSyncAt: connector.lastSyncAt,
    complete: reasons.length === 0,
    incompleteReasons: reasons,
  };
}
