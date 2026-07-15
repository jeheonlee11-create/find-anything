import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { fileRelationships } from "@/db/schema";
import { indexedWorkspaceFiles } from "@/lib/workspace-search/repository";
import { detectRelationships } from "./core";
export async function refreshWorkspaceRelationships(
  workspaceId: string,
  authorizedFiles?: Awaited<ReturnType<typeof indexedWorkspaceFiles>>,
) {
  const files = authorizedFiles ?? (await indexedWorkspaceFiles(workspaceId)),
    detected = detectRelationships(
      files.map((file) => ({
        id: file.id,
        name: file.name,
        modifiedAt: file.modifiedAt,
        contentHashes: file.units.map((unit) => unit.contentHash),
        text: file.units.map((unit) => unit.text).join("\n"),
      })),
    ),
    db = await getDb(),
    now = new Date().toISOString();
  for (const relation of detected) {
    const id = `relationship_${await hash(`${workspaceId}:${relation.fromFileId}:${relation.toFileId}:${relation.relationshipType}`)}`;
    await db
      .insert(fileRelationships)
      .values({
        id,
        workspaceId,
        fromFileId: relation.fromFileId,
        toFileId: relation.toFileId,
        relationshipType: relation.relationshipType,
        confidence: Math.round(relation.confidence * 10000),
        reasonsJson: JSON.stringify(relation.reasons),
        inferred: true,
        userStatus: "unreviewed",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          fileRelationships.workspaceId,
          fileRelationships.fromFileId,
          fileRelationships.toFileId,
          fileRelationships.relationshipType,
        ],
        set: {
          confidence: Math.round(relation.confidence * 10000),
          reasonsJson: JSON.stringify(relation.reasons),
          updatedAt: now,
        },
      });
  }
  return detected.length;
}
export async function relationshipsForFile(
  workspaceId: string,
  fileId: string,
  authorizedFileIds?: Set<string>,
) {
  const db = await getDb(),
    rows = await db
      .select()
      .from(fileRelationships)
      .where(
        and(
          eq(fileRelationships.workspaceId, workspaceId),
          or(
            eq(fileRelationships.fromFileId, fileId),
            eq(fileRelationships.toFileId, fileId),
          ),
        ),
      );
  return rows
    .filter(
      (row) =>
        !authorizedFileIds ||
        (authorizedFileIds.has(row.fromFileId) &&
          authorizedFileIds.has(row.toFileId)),
    )
    .map((row) => ({
      ...row,
      confidence: row.confidence / 10000,
      reasons: JSON.parse(row.reasonsJson),
      userCorrectable: true,
      disclosure: "Inferred relationship; not a verified fact.",
    }));
}
export async function correctRelationship(
  workspaceId: string,
  id: string,
  status: "confirmed" | "rejected" | "unreviewed",
) {
  const db = await getDb();
  await db
    .update(fileRelationships)
    .set({ userStatus: status, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(fileRelationships.id, id),
        eq(fileRelationships.workspaceId, workspaceId),
      ),
    );
}
async function hash(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes)
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
