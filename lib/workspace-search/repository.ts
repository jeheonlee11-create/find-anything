import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { extractedUnits, sourceFiles } from "@/db/schema";
import type { WorkspaceSearchFile } from "@/lib/workspace-search/core";

export async function indexedWorkspaceFiles(
  workspaceId: string,
  authorizedSourceIds?: Set<string>,
): Promise<WorkspaceSearchFile[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: sourceFiles.id,
      workspaceId: sourceFiles.workspaceId,
      connectorId: sourceFiles.connectorId,
      sourceId: sourceFiles.sourceId,
      name: sourceFiles.name,
      mimeType: sourceFiles.mimeType,
      modifiedAt: sourceFiles.modifiedAt,
      webViewLink: sourceFiles.webViewLink,
      indexStatus: sourceFiles.indexStatus,
      extractionError: sourceFiles.extractionError,
      extractionMode: sourceFiles.extractionMode,
      structuralFallbackReason: sourceFiles.structuralFallbackReason,
      unitId: extractedUnits.id,
      unitType: extractedUnits.unitType,
      textContent: extractedUnits.textContent,
      structuralLocationJson: extractedUnits.structuralLocationJson,
      contentHash: extractedUnits.contentHash,
    })
    .from(sourceFiles)
    .leftJoin(
      extractedUnits,
      and(
        eq(extractedUnits.fileId, sourceFiles.id),
        eq(extractedUnits.workspaceId, workspaceId),
      ),
    )
    .where(
      and(
        eq(sourceFiles.workspaceId, workspaceId),
        eq(sourceFiles.trashed, false),
      ),
    );
  const files = new Map<string, WorkspaceSearchFile>();
  for (const row of rows) {
    if (authorizedSourceIds && !authorizedSourceIds.has(row.sourceId)) continue;
    let file = files.get(row.id);
    if (!file) {
      file = { ...row, units: [] };
      files.set(row.id, file);
    }
    if (
      row.unitId &&
      row.unitType &&
      row.textContent !== null &&
      row.structuralLocationJson &&
      row.contentHash
    )
      file.units.push({
        id: row.unitId,
        unitType: row.unitType,
        text: row.textContent,
        structuralLocation: JSON.parse(row.structuralLocationJson) as Record<
          string,
          unknown
        >,
        contentHash: row.contentHash,
      });
  }
  return [...files.values()];
}
