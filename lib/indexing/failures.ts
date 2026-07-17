export type IndexingFailureCategory =
  | "permission_denied"
  | "unsupported_mime_type"
  | "export_not_supported"
  | "file_too_large"
  | "malformed_document"
  | "provider_rate_limit"
  | "provider_timeout"
  | "temporary_network_error"
  | "token_expired"
  | "reauthorization_required"
  | "parser_error"
  | "database_error"
  | "unknown";

export function classifyIndexingFailure(code: string): {
  category: IndexingFailureCategory;
  retryable: boolean;
  explanation: string;
} {
  const normalized = code.toUpperCase();
  if (normalized.includes("403") || normalized.includes("PERMISSION"))
    return result("permission_denied", false, "Google no longer permits this file to be read.");
  if (normalized.includes("UNSUPPORTED"))
    return result("unsupported_mime_type", false, "This file type is not searchable yet.");
  if (normalized.includes("EXPORT"))
    return result("export_not_supported", false, "Google cannot export this file in a supported format.");
  if (normalized.includes("TOO_LARGE") || normalized.includes("SIZE"))
    return result("file_too_large", false, "This file exceeds the current indexing size limit.");
  if (normalized.includes("429") || normalized.includes("RATE_LIMIT"))
    return result("provider_rate_limit", true, "Google temporarily rate-limited indexing; it can be retried.");
  if (normalized.includes("TIMEOUT") || normalized.includes("INTERRUPTED"))
    return result("provider_timeout", true, "Indexing was interrupted and can be retried safely.");
  if (normalized.includes("NETWORK") || normalized.includes("FETCH"))
    return result("temporary_network_error", true, "A temporary network error interrupted indexing.");
  if (normalized.includes("REFRESH_TOKEN") || normalized.includes("TOKEN_EXPIRED"))
    return result("token_expired", false, "Google Drive must be reconnected before this file can be indexed.");
  if (normalized.includes("REAUTHORIZATION") || normalized.includes("INVALID_GRANT"))
    return result("reauthorization_required", false, "Google Drive access was revoked or expired; reconnect it.");
  if (normalized.includes("PARSE") || normalized.includes("MALFORMED"))
    return result("parser_error", false, "The file could not be parsed safely.");
  if (normalized.includes("DATABASE") || normalized.includes("D1"))
    return result("database_error", true, "A temporary storage error interrupted indexing.");
  return result("unknown", false, "The file could not be indexed. No private error details were exposed.");
}

function result(
  category: IndexingFailureCategory,
  retryable: boolean,
  explanation: string,
) {
  return { category, retryable, explanation };
}
