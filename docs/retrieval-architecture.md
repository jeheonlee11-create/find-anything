# Retrieval architecture

## Current boundary

`lib/retrieval/core.ts` is a deterministic sample implementation. It performs local tokenization, small query expansion, pre-filtering, full-text candidate generation, deterministic ranking, structural evidence selection, coverage calculation, trace generation, and exportable record generation.

It does not use embeddings or a production reranker. The trace marks those stages as planned or simulated.

## Production adapters

`lib/retrieval/pipeline.ts` defines boundaries for:

1. query parsing;
2. actor permission resolution;
3. keyword retrieval;
4. semantic retrieval;
5. candidate merging;
6. reranking;
7. evidence selection;
8. coverage calculation;
9. receipt generation;
10. background jobs;
11. vector indexing.

The production implementation should use PostgreSQL for durable entity state, a pgvector-compatible implementation behind `VectorIndexAdapter`, and an idempotent job system behind `BackgroundJobAdapter`. These services are not introduced until live connector work requires them.

## Required persistent entities

Workspace, Connector, SourceFile, FileVersion, PermissionSnapshot, ExtractedUnit, RetrievalQuery, RetrievalCandidate, RetrievalResult, CoverageReport, RetrievalTrace, and RetrievalReceipt are typed in `lib/retrieval/types.ts`.

Before production ingestion, these contracts should become migrations with indexes on workspace ID, source ID, source file ID, MIME type, owner, modified date, permission version, content hash, extraction status, and trace ID.

