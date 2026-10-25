import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { retrievalTraces, searchReceipts } from "@/db/schema";
import type { AuthenticatedActor } from "@/lib/auth/api-authorization";
import type { WorkspaceSearchResponse } from "./core";
import { buildRetrievalReplay, TRACE_EVENT_SCHEMA_VERSION } from "./replay";
export async function persistSearchAudit(input: {
  actor: AuthenticatedActor;
  workspaceId: string;
  response: WorkspaceSearchResponse;
  filters: Record<string, unknown>;
  startedAt: number;
  stageLatency?: Record<string, number>;
  correlationId?: string;
}) {
  const db = await getDb(),
    searchId = `search_${crypto.randomUUID()}`,
    traceId = `trace_${crypto.randomUUID()}`,
    receiptId = `receipt_${crypto.randomUUID()}`,
    createdAt = new Date().toISOString(),
    durationMs = Math.max(0, Date.now() - input.startedAt),
    coverage = input.response.coverage,
    incompleteReasons = [
      coverage.failedFiles ? `${coverage.failedFiles} failed files` : null,
      coverage.pendingFiles ? `${coverage.pendingFiles} pending files` : null,
      coverage.unsupportedFiles
        ? `${coverage.unsupportedFiles} unsupported files`
        : null,
    ].filter(Boolean),
    configurationHash = await hash(
      JSON.stringify({
        matchingPolicyVersion: input.response.matchingPolicyVersion,
        mode: input.response.mode,
        fileType: input.response.fileType,
        pageSize: input.response.pageSize,
      }),
    ),
    citations = input.response.results.flatMap((result) => result.citations),
    indexSnapshotHash = await hash(
      JSON.stringify(input.response.diagnostics.indexSnapshot),
    ),
    resultSetHash = await hash(
      JSON.stringify(
        input.response.results.map((result) => ({
          id: result.id,
          citations: result.citations.map((citation) => citation.contentHash),
        })),
      ),
    ),
    persistedConfidence = {
      ...input.response.confidence,
      workspaceId: input.workspaceId,
      actorIdentity: input.actor.actorId,
      sourceRetrievalId: searchId,
    },
    initialReplay = buildRetrievalReplay({
      response: input.response,
      requestStartedAt: input.startedAt,
      stageLatency: input.stageLatency,
      receiptCreated: false,
    });
  await db.insert(retrievalTraces).values({
    id: traceId,
    searchId,
    workspaceId: input.workspaceId,
    actorId: input.actor.actorId,
    query: input.response.query,
    normalizedQuery: input.response.diagnostics.normalizedQuery,
    mode: input.response.mode,
    filtersJson: JSON.stringify(input.filters),
    matchingPolicyVersion: input.response.matchingPolicyVersion,
    candidateCountsJson: JSON.stringify(
      input.response.diagnostics.candidateCounts,
    ),
    duplicatesRemoved: input.response.diagnostics.duplicatesRemoved,
    permissionDecisionsJson: JSON.stringify(
      input.response.diagnostics.permissionDecisions,
    ),
    thresholdDecisionsJson: JSON.stringify(
      input.response.diagnostics.thresholdDecisions,
    ),
    excludedResultsJson: JSON.stringify(
      input.response.diagnostics.excludedResults,
    ),
    // The decision lists are bounded (results on this page, at most
    // MAX_RECORDED_DECISIONS exclusions), so a trace stays one small D1 row on
    // any workspace size. The full counts live here.
    decisionSummaryJson: JSON.stringify({
      permission: input.response.diagnostics.permissionSummary,
      threshold: input.response.diagnostics.thresholdSummary,
      recorded: {
        permissionDecisions: input.response.diagnostics.permissionDecisions.length,
        thresholdDecisions: input.response.diagnostics.thresholdDecisions.length,
        excludedResults: input.response.diagnostics.excludedResults.length,
      },
    }),
    finalResultCount: input.response.results.length,
    latencyJson: JSON.stringify({
      ...input.stageLatency,
      totalMs: durationMs,
      auditPersistenceMs: 0,
    }),
    coverageJson: JSON.stringify(coverage),
    coverageSnapshotVersion: coverage.snapshot.version,
    conflictSnapshotVersion: "deterministic-conflicts-v1",
    conflictSnapshotJson: JSON.stringify(input.response.conflicts),
    rankingSnapshotVersion: "literal-ranking-v4",
    rankingSnapshotJson: JSON.stringify(input.response.results.map((result) => ({ fileId: result.id, ...result.ranking }))),
    traceEventSchemaVersion: TRACE_EVENT_SCHEMA_VERSION,
    traceEventsJson: JSON.stringify(initialReplay),
    resultsJson: JSON.stringify(input.response.results),
    stagesJson: JSON.stringify([
      ...input.response.diagnostics.stages,
      {
        name: "Retrieval confidence",
        status: "executed",
        detail: `Calculated ${input.response.confidence.label} from ten stored evidence-quality factors using ${input.response.confidence.scoringVersion}.`,
      },
    ]),
    finalResultOrderJson: JSON.stringify(
      input.response.diagnostics.finalResultOrder,
    ),
    extractionMethodsJson: JSON.stringify(
      Object.fromEntries(
        input.response.results.map((result) => [
          result.id,
          result.extractionMethod,
        ]),
      ),
    ),
    fallbackErrorsJson: JSON.stringify(
      input.response.results
        .filter((result) => result.extractionMethod === "fallback")
        .map((result) => ({
          fileId: result.id,
          reason:
            "structured extraction unavailable; indexed export fallback searched",
        })),
    ),
    authorizedFilesConsidered: input.response.coverage.totalKnownFiles,
    confidenceScore: input.response.confidence.score,
    confidenceLabel: input.response.confidence.label,
    confidenceJson: JSON.stringify(persistedConfidence),
    confidenceScoringVersion: input.response.confidence.scoringVersion,
    confidenceCalculatedAt: input.response.confidence.calculatedAt,
    createdAt,
    correlationId: input.correlationId ?? null,
  });
  await db.insert(searchReceipts).values({
    id: receiptId,
    searchId,
    traceId,
    workspaceId: input.workspaceId,
    actorId: input.actor.actorId,
    query: input.response.query,
    mode: input.response.mode,
    filtersJson: JSON.stringify(input.filters),
    matchingPolicyVersion: input.response.matchingPolicyVersion,
    searchedAt: createdAt,
    totalIndexedFiles: coverage.indexedFiles,
    totalEligibleFiles: coverage.filesSearched,
    totalFilesSearched: coverage.filesSearched,
    totalMatches: input.response.totalMatches,
    totalReturned: input.response.results.length,
    pendingFiles: coverage.pendingFiles,
    failedFiles: coverage.failedFiles,
    excludedFiles: coverage.totalKnownFiles - coverage.filesSearched,
    completenessStatus: coverage.complete ? "complete" : "incomplete",
    incompleteReasonsJson: JSON.stringify(incompleteReasons),
    resultFileIdsJson: JSON.stringify(
      input.response.results.map((result) => result.id),
    ),
    citationsJson: JSON.stringify(citations),
    durationMs,
    configurationHash,
    indexSnapshotHash,
    resultSetHash,
    confidenceScore: input.response.confidence.score,
    confidenceLabel: input.response.confidence.label,
    confidenceJson: JSON.stringify(persistedConfidence),
    confidenceScoringVersion: input.response.confidence.scoringVersion,
    confidenceCalculatedAt: input.response.confidence.calculatedAt,
    coverageSnapshotVersion: coverage.snapshot.version,
    coverageSnapshotJson: JSON.stringify(coverage.snapshot),
    conflictSnapshotVersion: "deterministic-conflicts-v1",
    conflictSnapshotJson: JSON.stringify(input.response.conflicts),
    rankingSnapshotVersion: "literal-ranking-v4",
    rankingSnapshotJson: JSON.stringify(input.response.results.map((result) => ({ fileId: result.id, ...result.ranking }))),
    correlationId: input.correlationId ?? null,
    createdAt,
  });
  const finalDuration = Math.max(0, Date.now() - input.startedAt),
    auditPersistenceMs = Math.max(0, finalDuration - durationMs),
    finalReplay = buildRetrievalReplay({
      response: input.response,
      requestStartedAt: input.startedAt,
      stageLatency: input.stageLatency,
      receiptCreated: true,
      receiptDurationMs: auditPersistenceMs,
    });
  await db
    .update(retrievalTraces)
    .set({
      latencyJson: JSON.stringify({
        ...input.stageLatency,
        totalMs: finalDuration,
        auditPersistenceMs,
      }),
      traceEventsJson: JSON.stringify(finalReplay),
    })
    .where(eq(retrievalTraces.id, traceId));
  await db
    .update(searchReceipts)
    .set({ durationMs: finalDuration })
    .where(eq(searchReceipts.id, receiptId));
  return { searchId, traceId, receiptId, durationMs: finalDuration };
}
export async function receiptForActor(actorId: string, receiptId: string) {
  const db = await getDb();
  return db
    .select()
    .from(searchReceipts)
    .where(
      and(
        eq(searchReceipts.id, receiptId),
        eq(searchReceipts.actorId, actorId),
      ),
    )
    .get();
}
export async function traceForActor(actorId: string, traceId: string) {
  const db = await getDb();
  return db
    .select()
    .from(retrievalTraces)
    .where(
      and(
        eq(retrievalTraces.id, traceId),
        eq(retrievalTraces.actorId, actorId),
      ),
    )
    .get();
}
export async function receiptForWorkspaceSearch(
  workspaceId: string,
  searchId: string,
) {
  const db = await getDb();
  return db
    .select()
    .from(searchReceipts)
    .where(
      and(
        eq(searchReceipts.searchId, searchId),
        eq(searchReceipts.workspaceId, workspaceId),
      ),
    )
    .get();
}
export async function receiptForWorkspace(
  workspaceId: string,
  receiptId: string,
) {
  const db = await getDb();
  return db
    .select()
    .from(searchReceipts)
    .where(
      and(
        eq(searchReceipts.id, receiptId),
        eq(searchReceipts.workspaceId, workspaceId),
      ),
    )
    .get();
}
export async function traceForWorkspace(workspaceId: string, traceId: string) {
  const db = await getDb();
  return db
    .select()
    .from(retrievalTraces)
    .where(
      and(
        eq(retrievalTraces.id, traceId),
        eq(retrievalTraces.workspaceId, workspaceId),
      ),
    )
    .get();
}
async function hash(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
