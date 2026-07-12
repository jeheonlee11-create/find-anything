export type SourcePlatform = "google_drive" | "microsoft_365" | "notion" | "dropbox" | "box";
export type SearchMode = "ranked" | "find_all" | "exact_evidence" | "newest_version";
export type CompletenessStatus = "complete" | "partial" | "unknown";
export type IndexStatus = "indexed" | "awaiting_index" | "failed";
export type PermissionStatus = "allowed" | "denied" | "unknown";

export interface Workspace { id: string; name: string; createdAt: string; }
export interface Connector { id: string; workspaceId: string; source: SourcePlatform; status: "connected" | "syncing" | "error" | "disconnected"; lastSyncedAt?: string; }
export interface SourceFile { id: string; workspaceId: string; source: SourcePlatform; name: string; mimeType: string; owner: string; folder: string; modifiedAt: string; versionId: string; permissionSnapshotId: string; indexStatus: IndexStatus; extractionStatus: "complete" | "partial" | "failed"; unitCount: number; prototypeUrl?: string; }
export interface FileVersion { id: string; fileId: string; sourceVersionId: string; contentHash: string; createdAt: string; isNewest: boolean; }
export interface PermissionSnapshot { id: string; fileId: string; actorId: string; status: PermissionStatus; reason: string; capturedAt: string; sourcePermissionVersion?: string; }

export type StructuralLocation =
  | { type: "document_paragraph"; paragraphStart: number; paragraphEnd: number; headingPath?: string[] }
  | { type: "slide"; slideNumber: number; includesSpeakerNotes?: boolean }
  | { type: "pdf_page"; pageNumber: number }
  | { type: "spreadsheet_range"; sheetName: string; range: string }
  | { type: "comment"; commentId: string };

export interface ExtractedUnit { id: string; fileId: string; fileVersionId: string; unitType: "paragraph" | "heading" | "table" | "comment" | "slide_title" | "slide_body" | "speaker_notes" | "chart_label" | "image_caption" | "page" | "text_block" | "figure_caption" | "cell_range" | "table_header" | "row_range"; location: StructuralLocation; text: string; metadata: Record<string, string | number | boolean>; extractionStatus: "complete" | "partial" | "failed"; checksum: string; }

export interface RetrievalFilters { source?: SourcePlatform; fileType?: string; owner?: string; folder?: string; modifiedAfter?: string; newestVersionOnly?: boolean; exactEvidenceOnly?: boolean; }
export interface RetrievalQuery { id: string; workspaceId: string; actorId: string; query: string; mode: SearchMode; filters: RetrievalFilters; page: number; pageSize: number; createdAt: string; }
export interface RetrievalCandidate { fileId: string; unitId: string; origin: "keyword" | "semantic" | "metadata"; keywordScore: number; semanticScore: number | null; finalScore: number; permissionStatus: PermissionStatus; matchedTerms: string[]; }
export interface RetrievalResult { file: SourceFile; evidence: ExtractedUnit; score: number; rank: number; whyMatched: string; permissionStatus: PermissionStatus; citation: string; openUrl: string | null; prototype: boolean; }

export interface CoverageReport { accessibleFiles: number; indexedFiles: number; searchedFiles: number; matchedFiles: number; excludedByFilter: number; permissionDenied: number; extractionFailed: number; awaitingIndex: number; complete: boolean; completenessStatus: CompletenessStatus; warnings: string[]; }
export interface RetrievalStage { name: string; status: "executed" | "simulated" | "planned"; candidateCountBefore: number; candidateCountAfter: number; latencyMs: number; detail: string; }
export interface RetrievalTrace { traceId: string; prototype: boolean; workspace: string; actor: string; originalQuery: string; interpretedQuery: string; expandedTerms: string[]; filters: RetrievalFilters; searchMode: SearchMode; keywordCandidates: number; semanticCandidates: number | null; mergedCandidates: number; permissionDecisions: { fileId: string; status: PermissionStatus; reason: string }[]; exclusions: { fileId: string; reason: string }[]; stages: RetrievalStage[]; corpusSnapshotAt: string; returnedEvidenceIds: string[]; completenessStatus: CompletenessStatus; }
export interface RetrievalReceipt { receiptId: string; traceId: string; prototype: boolean; label: "Exportable retrieval record"; query: string; searchMode: SearchMode; actor: string; workspace: string; corpusSnapshotAt: string; sourceConnectors: SourcePlatform[]; filters: RetrievalFilters; coverage: CoverageReport; failures: string[]; exclusions: { fileId: string; reason: string }[]; returnedEvidence: { fileId: string; evidenceId: string; citation: string }[]; retrievalConfiguration: { keyword: string; semantic: string; reranker: string }; createdAt: string; }
export interface RetrievalResponse { query: RetrievalQuery; results: RetrievalResult[]; totalMatches: number; page: number; pageSize: number; totalPages: number; coverage: CoverageReport; trace: RetrievalTrace; receipt: RetrievalReceipt; prototype: true; sampleCorpus: true; }

