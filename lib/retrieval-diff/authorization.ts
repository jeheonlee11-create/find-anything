import { NextResponse } from "next/server";
import type { AuthenticatedActor } from "@/lib/auth/api-authorization";
import { isDemoWorkspace } from "@/lib/auth/api-authorization";
import { isAuthorizationFailure, requireTraceAccess } from "@/lib/auth/authorization";
import { connectorForActor, connectorForWorkspace } from "@/lib/google-drive/repository";
import { currentAuthorizedDriveSourceIds } from "@/lib/google-drive/permission";
import { indexedWorkspaceFiles } from "@/lib/workspace-search/repository";
import { publicTrace } from "@/lib/workspace-search/serialization";
import { comparePersistedRetrievals } from "./core";

export async function diffForActor(input: { actor: AuthenticatedActor; beforeTraceId: string; afterTraceId: string; manual: boolean }) {
  const before = await requireTraceAccess(input.actor, input.beforeTraceId);
  if (isAuthorizationFailure(before)) return before;
  const after = await requireTraceAccess(input.actor, input.afterTraceId);
  if (isAuthorizationFailure(after) || before.workspaceId !== after.workspaceId) return hidden();
  const connector = await connectorForActor(input.actor, before.workspaceId, isDemoWorkspace(before.workspaceId) ? "demo_fixture" : "google_drive");
  if (!connector || connector.status !== "connected") return hidden();
  return comparePersistedRetrievals({ before: publicTrace(before), after: publicTrace(after), currentlyAuthorizedFileIds: await authorizedFileIds(before.workspaceId, connector), manual: input.manual });
}

export async function diffForWorkspace(input: { workspaceId: string; beforeTraceId: string; afterTraceId: string; manual: boolean }) {
  const { traceForWorkspace } = await import("@/lib/workspace-search/audit");
  const before = await traceForWorkspace(input.workspaceId, input.beforeTraceId), after = await traceForWorkspace(input.workspaceId, input.afterTraceId);
  if (!before || !after) return hidden();
  const connector = await connectorForWorkspace(input.workspaceId, isDemoWorkspace(input.workspaceId) ? "demo_fixture" : "google_drive");
  if (!connector || connector.status !== "connected") return hidden();
  return comparePersistedRetrievals({ before: publicTrace(before), after: publicTrace(after), currentlyAuthorizedFileIds: await authorizedFileIds(input.workspaceId, connector), manual: input.manual });
}

async function authorizedFileIds(workspaceId: string, connector: NonNullable<Awaited<ReturnType<typeof connectorForWorkspace>>>) {
  const inventory = isDemoWorkspace(workspaceId) ? { sourceIds: undefined } : await currentAuthorizedDriveSourceIds(connector);
  const files = await indexedWorkspaceFiles(workspaceId, inventory.sourceIds);
  return new Set(files.map((file) => file.id));
}
function hidden() { return NextResponse.json({ error: { code: "RETRIEVAL_DIFF_NOT_FOUND", message: "Retrieval comparison not found." } }, { status: 404, headers: { "cache-control": "no-store" } }); }
