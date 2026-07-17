import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  connectors,
  memberships,
  retrievalTraces,
  searchReceipts,
  sourceFiles,
  syncRuns,
} from "@/db/schema";
import {
  isAuthFailure,
  requireApiActor,
  type AuthenticatedActor,
} from "@/lib/auth/api-authorization";

export type AuthorizedRequest = {
  actor: AuthenticatedActor;
  membership: typeof memberships.$inferSelect;
};

export async function requireAuthenticatedUser(request: Request) {
  return requireApiActor(request);
}

export async function requireWorkspaceMember(
  actor: AuthenticatedActor,
  workspaceId: string,
): Promise<AuthorizedRequest | NextResponse> {
  const db = await getDb();
  const membership = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, actor.actorId),
        eq(memberships.workspaceId, workspaceId),
      ),
    )
    .get();
  return membership
    ? { actor, membership }
    : hidden("WORKSPACE_NOT_FOUND", "Workspace not found.");
}

export async function requireWorkspaceOwner(
  actor: AuthenticatedActor,
  workspaceId: string,
): Promise<AuthorizedRequest | NextResponse> {
  const authorized = await requireWorkspaceMember(actor, workspaceId);
  if (authorized instanceof NextResponse) return authorized;
  return authorized.membership.role === "owner"
    ? authorized
    : hidden("WORKSPACE_NOT_FOUND", "Workspace not found.");
}

export async function requireConnectorAccess(
  actor: AuthenticatedActor,
  workspaceId: string,
  connectorId?: string,
) {
  const authorized = await requireWorkspaceMember(actor, workspaceId);
  if (authorized instanceof NextResponse) return authorized;
  const db = await getDb();
  const connector = await db
    .select()
    .from(connectors)
    .where(
      and(
        eq(connectors.workspaceId, workspaceId),
        eq(connectors.provider, "google_drive"),
        ...(connectorId ? [eq(connectors.id, connectorId)] : []),
      ),
    )
    .get();
  return connector ?? hidden("CONNECTOR_NOT_FOUND", "Connector not found.");
}

export async function requireRunAccess(
  actor: AuthenticatedActor,
  workspaceId: string,
  runId: string,
) {
  const authorized = await requireWorkspaceMember(actor, workspaceId);
  if (authorized instanceof NextResponse) return authorized;
  const db = await getDb();
  const run = await db
    .select({ run: syncRuns })
    .from(syncRuns)
    .innerJoin(connectors, eq(syncRuns.connectorId, connectors.id))
    .where(
      and(eq(syncRuns.id, runId), eq(connectors.workspaceId, workspaceId)),
    )
    .get();
  return run?.run ?? hidden("RUN_NOT_FOUND", "Indexing run not found.");
}

export async function requireIndexedFileAccess(
  actor: AuthenticatedActor,
  workspaceId: string,
  fileId: string,
) {
  const authorized = await requireWorkspaceMember(actor, workspaceId);
  if (authorized instanceof NextResponse) return authorized;
  const db = await getDb();
  const file = await db
    .select()
    .from(sourceFiles)
    .where(
      and(
        eq(sourceFiles.id, fileId),
        eq(sourceFiles.workspaceId, workspaceId),
        eq(sourceFiles.trashed, false),
      ),
    )
    .get();
  return file ?? hidden("FILE_NOT_FOUND", "File not found.");
}

export async function requireReceiptAccess(
  actor: AuthenticatedActor,
  receiptId: string,
) {
  const db = await getDb();
  const row = await db
    .select({ receipt: searchReceipts })
    .from(searchReceipts)
    .innerJoin(
      memberships,
      and(
        eq(memberships.workspaceId, searchReceipts.workspaceId),
        eq(memberships.userId, actor.actorId),
      ),
    )
    .where(eq(searchReceipts.id, receiptId))
    .get();
  return row?.receipt ?? hidden("RECEIPT_NOT_FOUND", "Receipt not found.");
}

export async function requireTraceAccess(
  actor: AuthenticatedActor,
  traceId: string,
) {
  const db = await getDb();
  const row = await db
    .select({ trace: retrievalTraces })
    .from(retrievalTraces)
    .innerJoin(
      memberships,
      and(
        eq(memberships.workspaceId, retrievalTraces.workspaceId),
        eq(memberships.userId, actor.actorId),
      ),
    )
    .where(eq(retrievalTraces.id, traceId))
    .get();
  return row?.trace ?? hidden("TRACE_NOT_FOUND", "Trace not found.");
}

export function isAuthorizationFailure(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export { isAuthFailure };

function hidden(code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}
