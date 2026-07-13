import type { CoverageReport, ExtractedUnit, PermissionSnapshot, RetrievalCandidate, RetrievalFilters, RetrievalQuery, RetrievalReceipt, RetrievalResult, SourceFile } from "./types";

export interface RetrievalPipeline {
  parseQuery(input:string):Promise<Pick<RetrievalQuery,"query"|"filters"|"mode">>;
  resolveActorPermissions(actorId:string,files:SourceFile[]):Promise<PermissionSnapshot[]>;
  retrieveKeywordCandidates(query:RetrievalQuery,units:ExtractedUnit[]):Promise<RetrievalCandidate[]>;
  retrieveSemanticCandidates(query:RetrievalQuery,units:ExtractedUnit[]):Promise<RetrievalCandidate[]>;
  mergeCandidates(keyword:RetrievalCandidate[],semantic:RetrievalCandidate[]):Promise<RetrievalCandidate[]>;
  rerankCandidates(query:RetrievalQuery,candidates:RetrievalCandidate[]):Promise<RetrievalCandidate[]>;
  selectEvidence(candidates:RetrievalCandidate[],units:ExtractedUnit[]):Promise<RetrievalResult[]>;
  calculateCoverage(files:SourceFile[],filters:RetrievalFilters,results:RetrievalResult[]):Promise<CoverageReport>;
  createReceipt(query:RetrievalQuery,results:RetrievalResult[],coverage:CoverageReport):Promise<RetrievalReceipt>;
}

export interface BackgroundJobAdapter { enqueueIndex(fileId:string):Promise<{jobId:string}>; enqueueFullReconciliation(connectorId:string):Promise<{jobId:string}>; }
export interface VectorIndexAdapter { upsert(units:ExtractedUnit[]):Promise<void>; search(query:string,filters:RetrievalFilters,limit:number):Promise<RetrievalCandidate[]>; }

