/**
 * MCP tool definitions and the validator that enforces their input schemas.
 *
 * The schemas used to be advertised in tools/list but never checked, so any
 * argument shape reached the handlers. `validateToolArguments` implements the
 * subset of JSON Schema these definitions use (object, required,
 * additionalProperties: false, string/integer/boolean, minLength, maxLength,
 * enum, minimum, maximum) and rejects everything else before a handler runs.
 *
 * Pure: no runtime imports, so it is unit-tested directly.
 */

export type PropertySchema =
  | { type: "string"; minLength?: number; maxLength?: number; enum?: readonly string[] }
  | { type: "integer"; minimum?: number; maximum?: number }
  | { type: "boolean" };

export interface ObjectSchema {
  type: "object";
  required?: readonly string[];
  additionalProperties: false;
  properties: Record<string, PropertySchema>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ObjectSchema;
}

const FILE_TYPES = ["all", "docs", "slides", "sheets", "pdf"] as const;
const REVIEW_STATUSES = ["authoritative_source", "expected_difference", "resolved", "false_positive"] as const;

const searchSchema: ObjectSchema = {
  type: "object",
  required: ["query"],
  additionalProperties: false,
  properties: {
    query: { type: "string", minLength: 1, maxLength: 500 },
    fileType: { type: "string", enum: FILE_TYPES },
    cursor: { type: "string", maxLength: 200 },
    pageSize: { type: "integer", minimum: 1, maximum: 100 },
  },
};
const idSchema = (property: string): ObjectSchema => ({
  type: "object",
  required: [property],
  additionalProperties: false,
  properties: { [property]: { type: "string", minLength: 1, maxLength: 200 } },
});
const emptySchema: ObjectSchema = { type: "object", additionalProperties: false, properties: {} };

export const MCP_TOOLS: ToolDefinition[] = [
  { name: "search_files", description: "Rank literal matches with exact evidence, stored factor-by-factor ranking explanations, and retrieval confidence.", inputSchema: searchSchema },
  { name: "find_all_files", description: "Return every literal match in stable exhaustive order with stored ranking explanations and cursor pagination.", inputSchema: searchSchema },
  { name: "get_exact_evidence", description: "Get structural citations for one workspace file.", inputSchema: idSchema("fileId") },
  { name: "get_search_coverage", description: "Get indexing coverage for the API-key workspace.", inputSchema: emptySchema },
  { name: "get_retrieval_trace", description: "Get one authorized durable retrieval trace including versioned persisted replay events, stored ranking breakdowns, coverage, conflicts, and confidence. Older traces return replay as null.", inputSchema: idSchema("traceId") },
  {
    name: "compare_retrievals",
    description: "Deterministically compare two authorized persisted retrieval traces without rerunning search or claiming unsupported causation. Currently unauthorized prior sources are redacted as unavailable.",
    inputSchema: {
      type: "object",
      required: ["beforeTraceId", "afterTraceId"],
      additionalProperties: false,
      properties: {
        beforeTraceId: { type: "string", minLength: 1, maxLength: 200 },
        afterTraceId: { type: "string", minLength: 1, maxLength: 200 },
        manual: { type: "boolean" },
      },
    },
  },
  { name: "get_search_receipt", description: "Get one durable search receipt including its exact stored ranking breakdowns.", inputSchema: idSchema("receiptId") },
  { name: "get_file_relationships", description: "Get explainable inferred relationships for one file.", inputSchema: idSchema("fileId") },
  { name: "get_workspace_conflicts", description: "Get deterministic conflicts with both exact citations; no winner is inferred.", inputSchema: emptySchema },
  {
    name: "review_conflict",
    description: "Record an authoritative-source, expected-difference, resolved, or false-positive decision.",
    inputSchema: {
      type: "object",
      required: ["conflictId", "status"],
      additionalProperties: false,
      properties: {
        conflictId: { type: "string", minLength: 1, maxLength: 200 },
        status: { type: "string", enum: REVIEW_STATUSES },
        authoritativeFileId: { type: "string", minLength: 1, maxLength: 200 },
        note: { type: "string", maxLength: 500 },
      },
    },
  },
];

export function toolDefinition(name: string) {
  return MCP_TOOLS.find((tool) => tool.name === name) ?? null;
}

/** Returns human-readable problems; an empty list means the arguments are valid. */
export function validateToolArguments(schema: ObjectSchema, value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return ["arguments must be an object"];
  const args = value as Record<string, unknown>,
    errors: string[] = [];
  for (const name of schema.required ?? []) if (!(name in args)) errors.push(`${name} is required`);
  for (const [name, item] of Object.entries(args)) {
    const property = schema.properties[name];
    if (!property) {
      errors.push(`${name} is not an accepted argument`);
      continue;
    }
    if (property.type === "string") {
      if (typeof item !== "string") errors.push(`${name} must be a string`);
      else {
        if (property.minLength !== undefined && item.length < property.minLength) errors.push(`${name} must be at least ${property.minLength} characters`);
        if (property.maxLength !== undefined && item.length > property.maxLength) errors.push(`${name} must be at most ${property.maxLength} characters`);
        if (property.enum && !property.enum.includes(item)) errors.push(`${name} must be one of ${property.enum.join(", ")}`);
      }
    } else if (property.type === "integer") {
      if (typeof item !== "number" || !Number.isInteger(item)) errors.push(`${name} must be an integer`);
      else {
        if (property.minimum !== undefined && item < property.minimum) errors.push(`${name} must be at least ${property.minimum}`);
        if (property.maximum !== undefined && item > property.maximum) errors.push(`${name} must be at most ${property.maximum}`);
      }
    } else if (typeof item !== "boolean") errors.push(`${name} must be a boolean`);
  }
  return errors;
}
