import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { retrievalConflicts } from "@/db/schema";
import type { WorkspaceSearchFile } from "@/lib/workspace-search/core";
import { CONFLICT_DETECTION_VERSION, detectDeterministicConflicts } from "./core";
import { filterAuthorizedConflictRows } from "./authorization";

export async function refreshWorkspaceConflicts(workspaceId: string, files: WorkspaceSearchFile[]) {
  const authorized = files.filter((file) => file.workspaceId === workspaceId), detected = detectDeterministicConflicts(authorized), db = await getDb(), now = new Date().toISOString();
  await db.update(retrievalConflicts).set({ active: false, updatedAt: now }).where(eq(retrievalConflicts.workspaceId, workspaceId));
  for (const item of detected) {
    const leftValueJson = JSON.stringify(item.leftValue), rightValueJson = JSON.stringify(item.rightValue), id = `conflict_${await hash(`${workspaceId}:${item.leftFileId}:${item.rightFileId}:${item.conflictType}:${leftValueJson}:${rightValueJson}`)}`;
    await db.insert(retrievalConflicts).values({ id, workspaceId, conflictType: item.conflictType, detectionVersion: CONFLICT_DETECTION_VERSION, detectionMethod: item.detectionMethod, leftFileId: item.leftFileId, rightFileId: item.rightFileId, leftValueJson, rightValueJson, leftCitationJson: JSON.stringify(item.leftCitation), rightCitationJson: JSON.stringify(item.rightCitation), newerFileId: item.newerFileId, relationshipInference: item.relationshipInference, reasonsJson: JSON.stringify(item.reasons), status: "unresolved", decisionJson: null, detectedAt: now, updatedAt: now, active: true }).onConflictDoUpdate({ target: [retrievalConflicts.workspaceId, retrievalConflicts.leftFileId, retrievalConflicts.rightFileId, retrievalConflicts.conflictType, retrievalConflicts.leftValueJson, retrievalConflicts.rightValueJson], set: { detectionVersion: CONFLICT_DETECTION_VERSION, detectionMethod: item.detectionMethod, leftCitationJson: JSON.stringify(item.leftCitation), rightCitationJson: JSON.stringify(item.rightCitation), newerFileId: item.newerFileId, relationshipInference: item.relationshipInference, reasonsJson: JSON.stringify(item.reasons), active: true, updatedAt: now } });
  }
  return conflictsForFiles(workspaceId, authorized.map((file) => file.id));
}

export async function conflictsForFiles(workspaceId: string, fileIds: string[]) {
  if (!fileIds.length) return [];
  const db = await getDb(), rows = await db.select().from(retrievalConflicts).where(and(eq(retrievalConflicts.workspaceId, workspaceId), eq(retrievalConflicts.active, true)));
  return filterAuthorizedConflictRows(rows, fileIds).map(publicConflict);
}

export async function decideConflict(workspaceId: string, id: string, status: "authoritative_source" | "expected_difference" | "resolved" | "false_positive", actorId: string, authorizedFileIds: Set<string>, authoritativeFileId?: string, note?: string) {
  const db = await getDb(), row = await db.select().from(retrievalConflicts).where(and(eq(retrievalConflicts.id, id), eq(retrievalConflicts.workspaceId, workspaceId))).limit(1).then((items) => items[0]);
  if (!row) return false;
  if (!authorizedFileIds.has(row.leftFileId) || !authorizedFileIds.has(row.rightFileId)) return false;
  if (status === "authoritative_source" && authoritativeFileId !== row.leftFileId && authoritativeFileId !== row.rightFileId) return false;
  await db.update(retrievalConflicts).set({ status, decisionJson: JSON.stringify({ actorId, authoritativeFileId: authoritativeFileId ?? null, note: note?.slice(0, 500) ?? null, decidedAt: new Date().toISOString() }), updatedAt: new Date().toISOString() }).where(and(eq(retrievalConflicts.id, id), eq(retrievalConflicts.workspaceId, workspaceId)));
  return true;
}

export function unresolvedConflictCount(items: Array<{ status: string }>) { return items.filter((item) => item.status === "unresolved").length; }
function publicConflict(row: typeof retrievalConflicts.$inferSelect) { return { id: row.id, conflictType: row.conflictType, detectionVersion: row.detectionVersion, detectionMethod: row.detectionMethod, leftFileId: row.leftFileId, rightFileId: row.rightFileId, leftValue: JSON.parse(row.leftValueJson), rightValue: JSON.parse(row.rightValueJson), leftCitation: JSON.parse(row.leftCitationJson), rightCitation: JSON.parse(row.rightCitationJson), newerFileId: row.newerFileId, relationshipInference: row.relationshipInference, reasons: JSON.parse(row.reasonsJson), status: row.status, decision: row.decisionJson ? JSON.parse(row.decisionJson) : null, detectedAt: row.detectedAt, updatedAt: row.updatedAt }; }
async function hash(value: string) { const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); return Array.from(bytes).slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
