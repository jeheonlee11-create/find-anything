import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({ emailIdx: uniqueIndex("users_email_idx").on(t.email) }),
);
export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({ ownerIdx: index("workspaces_owner_idx").on(t.ownerUserId) }),
);
export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    workspaceUserIdx: uniqueIndex("memberships_workspace_user_idx").on(
      t.workspaceId,
      t.userId,
    ),
  }),
);
export const oauthStates = sqliteTable(
  "oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    actorId: text("actor_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    pkceVerifierCiphertext: text("pkce_verifier_ciphertext").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ expiryIdx: index("oauth_states_expiry_idx").on(t.expiresAt) }),
);
export const oauthRefreshLeases = sqliteTable("oauth_refresh_leases", {
  connectorId: text("connector_id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});
export const connectors = sqliteTable(
  "connectors",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    actorId: text("actor_id").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id"),
    status: text("status", {
      enum: [
        "connected",
        "token_refreshing",
        "reauthorization_required",
        "syncing",
        "error",
        "revoked",
      ],
    }).notNull(),
    accessTokenCiphertext: text("access_token_ciphertext").notNull(),
    refreshTokenCiphertext: text("refresh_token_ciphertext"),
    tokenExpiresAt: text("token_expires_at"),
    grantedScopes: text("granted_scopes").notNull(),
    lastSyncAt: text("last_sync_at"),
    lastErrorCode: text("last_error_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    workspaceProviderIdx: uniqueIndex("connectors_workspace_provider_idx").on(
      t.workspaceId,
      t.provider,
    ),
  }),
);
export const sourceFiles = sqliteTable(
  "source_files",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    connectorId: text("connector_id").notNull(),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    ownersJson: text("owners_json").notNull(),
    permissionsJson: text("permissions_json").notNull(),
    parentsJson: text("parents_json").notNull(),
    modifiedAt: text("modified_at").notNull(),
    webViewLink: text("web_view_link"),
    md5Checksum: text("md5_checksum"),
    sizeBytes: integer("size_bytes"),
    trashed: integer("trashed", { mode: "boolean" }).notNull(),
    indexStatus: text("index_status", {
      enum: ["pending", "metadata", "indexed", "failed", "unsupported"],
    }).notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    extractionError: text("extraction_error"),
    extractionMode: text("extraction_mode"),
    structuralFallbackReason: text("structural_fallback_reason"),
    searchableStatus: text("searchable_status", {
      enum: ["hidden", "searchable", "stale", "unauthorized"],
    })
      .notNull()
      .default("hidden"),
    permissionFingerprint: text("permission_fingerprint"),
    providerRevision: text("provider_revision"),
    extractionVersion: text("extraction_version").notNull().default("legacy"),
    indexingVersion: text("indexing_version").notNull().default("legacy"),
    tombstonedAt: text("tombstoned_at"),
    lastPermissionCheckedAt: text("last_permission_checked_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    sourceUnique: uniqueIndex("source_files_connector_source_idx").on(
      t.connectorId,
      t.sourceId,
    ),
    workspaceIdx: index("source_files_workspace_idx").on(t.workspaceId),
    workspaceStatusIdx: index("source_files_workspace_status_idx").on(
      t.workspaceId,
      t.indexStatus,
    ),
  }),
);
export const fileVersions = sqliteTable(
  "file_versions",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id").notNull(),
    sourceModifiedAt: text("source_modified_at").notNull(),
    contentHash: text("content_hash").notNull(),
    extractionStatus: text("extraction_status", {
      enum: ["complete", "partial", "failed"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    fileHashIdx: uniqueIndex("file_versions_file_hash_idx").on(
      t.fileId,
      t.contentHash,
    ),
  }),
);
export const extractedUnits = sqliteTable(
  "extracted_units",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    fileId: text("file_id").notNull(),
    fileVersionId: text("file_version_id").notNull(),
    unitType: text("unit_type").notNull(),
    structuralLocationJson: text("structural_location_json").notNull(),
    textContent: text("text_content").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    fileIdx: index("extracted_units_file_idx").on(t.fileId),
    workspaceIdx: index("extracted_units_workspace_idx").on(t.workspaceId),
    workspaceFileIdx: index("extracted_units_workspace_file_idx").on(
      t.workspaceId,
      t.fileId,
    ),
  }),
);
export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    connectorId: text("connector_id").notNull(),
    status: text("status", {
      enum: ["running", "complete", "partial", "failed"],
    }).notNull(),
    filesDiscovered: integer("files_discovered").notNull(),
    filesIndexed: integer("files_indexed").notNull(),
    filesFailed: integer("files_failed").notNull(),
    structuredFiles: integer("structured_files").notNull().default(0),
    fallbackFiles: integer("fallback_files").notNull().default(0),
    fallbackReasonsJson: text("fallback_reasons_json").notNull().default("{}"),
    filesAdded: integer("files_added").notNull().default(0),
    filesUpdated: integer("files_updated").notNull().default(0),
    filesUnchanged: integer("files_unchanged").notNull().default(0),
    filesRemoved: integer("files_removed").notNull().default(0),
    paginationComplete: integer("pagination_complete", { mode: "boolean" })
      .notNull()
      .default(false),
    nextPageToken: text("next_page_token"),
    errorCode: text("error_code"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (t) => ({ connectorIdx: index("sync_runs_connector_idx").on(t.connectorId) }),
);
export const retrievalTraces = sqliteTable(
  "retrieval_traces",
  {
    id: text("id").primaryKey(),
    searchId: text("search_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    actorId: text("actor_id").notNull(),
    query: text("query").notNull(),
    normalizedQuery: text("normalized_query").notNull(),
    mode: text("mode").notNull(),
    filtersJson: text("filters_json").notNull(),
    matchingPolicyVersion: text("matching_policy_version").notNull(),
    candidateCountsJson: text("candidate_counts_json").notNull(),
    duplicatesRemoved: integer("duplicates_removed").notNull(),
    permissionDecisionsJson: text("permission_decisions_json").notNull(),
    thresholdDecisionsJson: text("threshold_decisions_json").notNull(),
    excludedResultsJson: text("excluded_results_json").notNull(),
    finalResultCount: integer("final_result_count").notNull(),
    latencyJson: text("latency_json").notNull(),
    coverageJson: text("coverage_json").notNull(),
    coverageSnapshotVersion: text("coverage_snapshot_version"),
    conflictSnapshotVersion: text("conflict_snapshot_version"),
    conflictSnapshotJson: text("conflict_snapshot_json"),
    rankingSnapshotVersion: text("ranking_snapshot_version"),
    rankingSnapshotJson: text("ranking_snapshot_json"),
    traceEventSchemaVersion: text("trace_event_schema_version"),
    traceEventsJson: text("trace_events_json"),
    resultsJson: text("results_json").notNull(),
    stagesJson: text("stages_json").notNull().default("[]"),
    finalResultOrderJson: text("final_result_order_json")
      .notNull()
      .default("[]"),
    extractionMethodsJson: text("extraction_methods_json")
      .notNull()
      .default("{}"),
    fallbackErrorsJson: text("fallback_errors_json").notNull().default("[]"),
    authorizedFilesConsidered: integer("authorized_files_considered")
      .notNull()
      .default(0),
    confidenceScore: integer("confidence_score"),
    confidenceLabel: text("confidence_label"),
    confidenceJson: text("confidence_json"),
    confidenceScoringVersion: text("confidence_scoring_version"),
    confidenceCalculatedAt: text("confidence_calculated_at"),
    createdAt: text("created_at").notNull(),
    correlationId: text("correlation_id"),
  },
  (t) => ({
    searchIdx: uniqueIndex("retrieval_traces_search_idx").on(t.searchId),
    workspaceIdx: index("retrieval_traces_workspace_idx").on(t.workspaceId),
  }),
);
export const searchReceipts = sqliteTable(
  "search_receipts",
  {
    id: text("id").primaryKey(),
    searchId: text("search_id").notNull(),
    traceId: text("trace_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    actorId: text("actor_id").notNull(),
    query: text("query").notNull(),
    mode: text("mode").notNull(),
    filtersJson: text("filters_json").notNull(),
    matchingPolicyVersion: text("matching_policy_version").notNull(),
    searchedAt: text("searched_at").notNull(),
    totalIndexedFiles: integer("total_indexed_files").notNull(),
    totalEligibleFiles: integer("total_eligible_files").notNull(),
    totalFilesSearched: integer("total_files_searched").notNull(),
    totalMatches: integer("total_matches").notNull(),
    totalReturned: integer("total_returned").notNull(),
    pendingFiles: integer("pending_files").notNull(),
    failedFiles: integer("failed_files").notNull(),
    excludedFiles: integer("excluded_files").notNull(),
    completenessStatus: text("completeness_status").notNull(),
    incompleteReasonsJson: text("incomplete_reasons_json").notNull(),
    resultFileIdsJson: text("result_file_ids_json").notNull(),
    citationsJson: text("citations_json").notNull(),
    durationMs: integer("duration_ms").notNull(),
    configurationHash: text("configuration_hash").notNull(),
    indexSnapshotHash: text("index_snapshot_hash"),
    resultSetHash: text("result_set_hash"),
    confidenceScore: integer("confidence_score"),
    confidenceLabel: text("confidence_label"),
    confidenceJson: text("confidence_json"),
    confidenceScoringVersion: text("confidence_scoring_version"),
    confidenceCalculatedAt: text("confidence_calculated_at"),
    coverageSnapshotVersion: text("coverage_snapshot_version"),
    coverageSnapshotJson: text("coverage_snapshot_json"),
    conflictSnapshotVersion: text("conflict_snapshot_version"),
    conflictSnapshotJson: text("conflict_snapshot_json"),
    rankingSnapshotVersion: text("ranking_snapshot_version"),
    rankingSnapshotJson: text("ranking_snapshot_json"),
    correlationId: text("correlation_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    searchIdx: uniqueIndex("search_receipts_search_idx").on(t.searchId),
    traceIdx: uniqueIndex("search_receipts_trace_idx").on(t.traceId),
    workspaceIdx: index("search_receipts_workspace_idx").on(t.workspaceId),
  }),
);
export const unitEmbeddings = sqliteTable(
  "unit_embeddings",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    fileId: text("file_id").notNull(),
    unitId: text("unit_id").notNull(),
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),
    vectorJson: text("vector_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    unitModelIdx: uniqueIndex("unit_embeddings_unit_model_idx").on(
      t.unitId,
      t.model,
    ),
    workspaceIdx: index("unit_embeddings_workspace_idx").on(t.workspaceId),
    fileIdx: index("unit_embeddings_file_idx").on(t.fileId),
  }),
);
export const fileRelationships = sqliteTable(
  "file_relationships",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    fromFileId: text("from_file_id").notNull(),
    toFileId: text("to_file_id").notNull(),
    relationshipType: text("relationship_type").notNull(),
    confidence: integer("confidence").notNull(),
    reasonsJson: text("reasons_json").notNull(),
    inferred: integer("inferred", { mode: "boolean" }).notNull(),
    userStatus: text("user_status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    pairTypeIdx: uniqueIndex("file_relationships_pair_type_idx").on(
      t.workspaceId,
      t.fromFileId,
      t.toFileId,
      t.relationshipType,
    ),
    workspaceIdx: index("file_relationships_workspace_idx").on(t.workspaceId),
  }),
);
export const retrievalConflicts = sqliteTable(
  "retrieval_conflicts",
  {
    id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), conflictType: text("conflict_type").notNull(), detectionVersion: text("detection_version").notNull(), detectionMethod: text("detection_method").notNull(),
    leftFileId: text("left_file_id").notNull(), rightFileId: text("right_file_id").notNull(), leftValueJson: text("left_value_json").notNull(), rightValueJson: text("right_value_json").notNull(), leftCitationJson: text("left_citation_json").notNull(), rightCitationJson: text("right_citation_json").notNull(), newerFileId: text("newer_file_id"), relationshipInference: text("relationship_inference").notNull(), reasonsJson: text("reasons_json").notNull(),
    status: text("status", { enum: ["unresolved", "authoritative_source", "expected_difference", "resolved", "false_positive"] }).notNull(), decisionJson: text("decision_json"), detectedAt: text("detected_at").notNull(), updatedAt: text("updated_at").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => ({ fingerprintIdx: uniqueIndex("retrieval_conflicts_fingerprint_idx").on(t.workspaceId, t.leftFileId, t.rightFileId, t.conflictType, t.leftValueJson, t.rightValueJson), workspaceIdx: index("retrieval_conflicts_workspace_idx").on(t.workspaceId), statusIdx: index("retrieval_conflicts_status_idx").on(t.status) }),
);
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    actorId: text("actor_id").notNull(),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
  },
  (t) => ({
    hashIdx: uniqueIndex("api_keys_hash_idx").on(t.keyHash),
    workspaceIdx: index("api_keys_workspace_idx").on(t.workspaceId),
  }),
);
export const apiRateLimits = sqliteTable(
  "api_rate_limits",
  {
    id: text("id").primaryKey(),
    apiKeyId: text("api_key_id").notNull(),
    windowStart: text("window_start").notNull(),
    requestCount: integer("request_count").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    keyWindowIdx: uniqueIndex("api_rate_limits_key_window_idx").on(
      t.apiKeyId,
      t.windowStart,
    ),
  }),
);
export const betaInvitations = sqliteTable(
  "beta_invitations",
  {
    id: text("id").primaryKey(),
    emailHash: text("email_hash").notNull(),
    status: text("status", {
      enum: ["pending", "approved", "revoked", "expired"],
    }).notNull(),
    cohort: text("cohort").notNull(),
    expiresAt: text("expires_at").notNull(),
    approvedBy: text("approved_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex("beta_invitations_email_idx").on(t.emailHash),
    statusIdx: index("beta_invitations_status_idx").on(t.status),
  }),
);
export const betaUsers = sqliteTable(
  "beta_users",
  {
    actorId: text("actor_id").primaryKey(),
    emailHash: text("email_hash").notNull(),
    status: text("status", { enum: ["pending", "active", "disabled", "revoked"] }).notNull(),
    role: text("role", { enum: ["tester", "admin"] }).notNull(),
    invitedAt: text("invited_at").notNull(),
    activatedAt: text("activated_at").notNull(),
    onboardingCompletedAt: text("onboarding_completed_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex("beta_users_email_idx").on(t.emailHash),
    statusIdx: index("beta_users_status_idx").on(t.status),
  }),
);
export const betaAccessRequests = sqliteTable(
  "beta_access_requests",
  {
    id: text("id").primaryKey(),
    emailHash: text("email_hash").notNull(),
    emailCiphertext: text("email_ciphertext").notNull(),
    fullName: text("full_name").notNull(),
    company: text("company").notNull(),
    jobTitle: text("job_title").notNull(),
    companySize: text("company_size").notNull(),
    knowledgeToolsJson: text("knowledge_tools_json").notNull(),
    usesAiAgents: integer("uses_ai_agents", { mode: "boolean" }).notNull(),
    knowledgeProblem: text("knowledge_problem").notNull(),
    willingLimitedFolder: integer("willing_limited_folder", { mode: "boolean" }).notNull(),
    intent: text("intent", { enum: ["beta", "demo"] }).notNull(),
    status: text("status", { enum: ["new", "reviewing", "approved", "declined"] }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex("beta_access_requests_email_idx").on(t.emailHash),
    statusIdx: index("beta_access_requests_status_idx").on(t.status),
    createdIdx: index("beta_access_requests_created_idx").on(t.createdAt),
  }),
);
export const betaFeedback = sqliteTable(
  "beta_feedback",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    category: text("category").notNull(),
    query: text("query").notNull(),
    searchMode: text("search_mode"),
    traceId: text("trace_id"),
    receiptId: text("receipt_id"),
    selectedResultId: text("selected_result_id"),
    resultIdsJson: text("result_ids_json").notNull(),
    evidenceExcerpt: text("evidence_excerpt"),
    includeEvidenceExcerpt: integer("include_evidence_excerpt", { mode: "boolean" }).notNull().default(false),
    applicationVersion: text("application_version").notNull().default("unknown"),
    comment: text("comment").notNull(),
    status: text("status", { enum: ["new", "triaged", "resolved"] }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    workspaceIdx: index("beta_feedback_workspace_idx").on(t.workspaceId),
    statusIdx: index("beta_feedback_status_idx").on(t.status),
  }),
);
export const betaAnalytics = sqliteTable(
  "beta_analytics",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id"),
    workspaceId: text("workspace_id"),
    event: text("event").notNull(),
    propertiesJson: text("properties_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    eventIdx: index("beta_analytics_event_idx").on(t.event),
    createdIdx: index("beta_analytics_created_idx").on(t.createdAt),
  }),
);
export const operationRateLimits = sqliteTable(
  "operation_rate_limits",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    operation: text("operation").notNull(),
    windowStart: text("window_start").notNull(),
    requestCount: integer("request_count").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    actorOperationWindowIdx: uniqueIndex(
      "operation_rate_limits_actor_operation_window_idx",
    ).on(t.actorId, t.operation, t.windowStart),
  }),
);
export const betaAccessAudit = sqliteTable(
  "beta_access_audit",
  {
    id: text("id").primaryKey(),
    adminActorId: text("admin_actor_id").notNull(),
    targetActorId: text("target_actor_id"),
    invitationId: text("invitation_id"),
    action: text("action").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ createdIdx: index("beta_access_audit_created_idx").on(t.createdAt) }),
);

export const indexingJobs = sqliteTable(
  "indexing_jobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    connectorId: text("connector_id").notNull(),
    requestedByUserId: text("requested_by_user_id").notNull(),
    jobType: text("job_type").notNull().default("full_sync"),
    status: text("status", {
      enum: [
        "queued",
        "running",
        "pausing",
        "partial",
        "completed",
        "failed",
        "cancelled",
        "stale",
        "reauthorization_required",
      ],
    }).notNull(),
    stage: text("stage").notNull().default("connecting"),
    discoveryStatus: text("discovery_status").notNull().default("not_started"),
    inventoryCursor: text("inventory_cursor"),
    continuationTokenHash: text("continuation_token_hash").notNull(),
    processedCount: integer("processed_count").notNull().default(0),
    discoveredCount: integer("discovered_count").notNull().default(0),
    indexedCount: integer("indexed_count").notNull().default(0),
    unsupportedCount: integer("unsupported_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    inaccessibleCount: integer("inaccessible_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    structuralCount: integer("structural_count").notNull().default(0),
    fallbackCount: integer("fallback_count").notNull().default(0),
    metadataIndexedCount: integer("metadata_indexed_count").notNull().default(0),
    contentIndexedCount: integer("content_indexed_count").notNull().default(0),
    unchangedCount: integer("unchanged_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    retriedCount: integer("retried_count").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    continuationCount: integer("continuation_count").notNull().default(0),
    terminalReason: text("terminal_reason"),
    lastErrorCode: text("last_error_code"),
    deploymentVersion: text("deployment_version").notNull().default("unknown"),
    startedAt: text("started_at"),
    heartbeatAt: text("heartbeat_at"),
    completedAt: text("completed_at"),
    nextAttemptAt: text("next_attempt_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    workspaceIdx: index("indexing_jobs_workspace_idx").on(t.workspaceId),
    connectorStatusIdx: index("indexing_jobs_connector_status_idx").on(
      t.connectorId,
      t.status,
    ),
  }),
);

export const indexingJobAttempts = sqliteTable(
  "indexing_job_attempts",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status").notNull(),
    startedAt: text("started_at").notNull(),
    heartbeatAt: text("heartbeat_at").notNull(),
    completedAt: text("completed_at"),
    errorCode: text("error_code"),
  },
  (t) => ({
    jobAttemptIdx: uniqueIndex("indexing_job_attempts_job_attempt_idx").on(
      t.jobId,
      t.attemptNumber,
    ),
  }),
);

export const indexingContinuations = sqliteTable(
  "indexing_continuations",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull(),
    sequence: integer("sequence").notNull(),
    attemptEpoch: integer("attempt_epoch").notNull().default(1),
    status: text("status", {
      enum: [
        "persisted",
        "dispatched",
        "acknowledged",
        "worker_started",
        "completed",
        "failed",
      ],
    }).notNull(),
    persistedAt: text("persisted_at").notNull(),
    availableAt: text("available_at").notNull(),
    dispatchedAt: text("dispatched_at"),
    lastDispatchedAt: text("last_dispatched_at"),
    dispatchCount: integer("dispatch_count").notNull().default(0),
    dispatchLeaseOwner: text("dispatch_lease_owner"),
    dispatchLeaseExpiresAt: text("dispatch_lease_expires_at"),
    acknowledgedAt: text("acknowledged_at"),
    workerStartedAt: text("worker_started_at"),
    executionLeaseOwner: text("execution_lease_owner"),
    executionLeaseExpiresAt: text("execution_lease_expires_at"),
    completedAt: text("completed_at"),
    failedAt: text("failed_at"),
    errorCode: text("error_code"),
    processedCountAtCompletion: integer("processed_count_at_completion"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    jobSequenceIdx: uniqueIndex("indexing_continuations_job_sequence_idx").on(
      t.jobId,
      t.sequence,
    ),
    statusAvailableIdx: index(
      "indexing_continuations_status_available_idx",
    ).on(t.status, t.availableAt),
    dispatchLeaseIdx: index("indexing_continuations_dispatch_lease_idx").on(
      t.dispatchLeaseExpiresAt,
    ),
    executionLeaseIdx: index("indexing_continuations_execution_lease_idx").on(
      t.executionLeaseExpiresAt,
    ),
  }),
);

export const indexingFailures = sqliteTable(
  "indexing_failures",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    connectorId: text("connector_id").notNull(),
    runId: text("run_id"),
    jobId: text("job_id"),
    providerFileId: text("provider_file_id").notNull(),
    sanitizedFileName: text("sanitized_file_name"),
    mimeType: text("mime_type").notNull(),
    category: text("category").notNull(),
    retryable: integer("retryable", { mode: "boolean" }).notNull(),
    userExplanation: text("user_explanation").notNull(),
    diagnosticCode: text("diagnostic_code").notNull(),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    attemptCount: integer("attempt_count").notNull().default(1),
    resolvedAt: text("resolved_at"),
  },
  (t) => ({
    fileCategoryIdx: uniqueIndex("indexing_failures_file_category_idx").on(
      t.connectorId,
      t.providerFileId,
      t.category,
    ),
    workspaceIdx: index("indexing_failures_workspace_idx").on(t.workspaceId),
  }),
);

export const coverageReceipts = sqliteTable(
  "coverage_receipts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    connectorId: text("connector_id").notNull(),
    runId: text("run_id"),
    jobId: text("job_id"),
    status: text("status").notNull(),
    inventoryComplete: integer("inventory_complete", { mode: "boolean" }).notNull(),
    countsJson: text("counts_json").notNull(),
    extractionVersion: text("extraction_version").notNull(),
    indexingVersion: text("indexing_version").notNull(),
    staleRecoveryJson: text("stale_recovery_json").notNull().default("{}"),
    deploymentVersion: text("deployment_version").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    workspaceIdx: index("coverage_receipts_workspace_idx").on(t.workspaceId),
    jobIdx: uniqueIndex("coverage_receipts_job_idx").on(t.jobId),
  }),
);
