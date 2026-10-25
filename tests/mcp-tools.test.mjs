import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { MCP_TOOLS, toolDefinition, validateToolArguments } from "../lib/mcp/tools.ts";

const schema = (name) => toolDefinition(name).inputSchema;

test("every advertised tool has a strict object schema", () => {
  assert.deepEqual(MCP_TOOLS.map((tool) => tool.name), [
    "search_files",
    "find_all_files",
    "get_exact_evidence",
    "get_search_coverage",
    "get_retrieval_trace",
    "compare_retrievals",
    "get_search_receipt",
    "get_file_relationships",
    "get_workspace_conflicts",
    "review_conflict",
  ]);
  for (const tool of MCP_TOOLS) {
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
  assert.equal(toolDefinition("drop_tables"), null);
});

test("valid search arguments pass", () => {
  assert.deepEqual(validateToolArguments(schema("search_files"), { query: "pricing", fileType: "pdf", pageSize: 10 }), []);
});

test("missing, mistyped, out-of-range, and unknown search arguments are rejected", () => {
  const search = schema("search_files");
  assert.deepEqual(validateToolArguments(search, {}), ["query is required"]);
  assert.deepEqual(validateToolArguments(search, { query: "" }), ["query must be at least 1 characters"]);
  assert.deepEqual(validateToolArguments(search, { query: "x".repeat(501) }), ["query must be at most 500 characters"]);
  assert.deepEqual(validateToolArguments(search, { query: 42 }), ["query must be a string"]);
  assert.deepEqual(validateToolArguments(search, { query: "a", fileType: "exe" }), ["fileType must be one of all, docs, slides, sheets, pdf"]);
  assert.deepEqual(validateToolArguments(search, { query: "a", pageSize: 0 }), ["pageSize must be at least 1"]);
  assert.deepEqual(validateToolArguments(search, { query: "a", pageSize: 1000 }), ["pageSize must be at most 100"]);
  assert.deepEqual(validateToolArguments(search, { query: "a", pageSize: 2.5 }), ["pageSize must be an integer"]);
  assert.deepEqual(validateToolArguments(search, { query: "a", mode: "all" }), ["mode is not an accepted argument"]);
});

test("non-object arguments are rejected", () => {
  for (const value of [null, "query", 3, ["query"]]) assert.deepEqual(validateToolArguments(schema("search_files"), value), ["arguments must be an object"]);
});

test("ID, boolean, and enum arguments are enforced for the other tools", () => {
  assert.deepEqual(validateToolArguments(schema("get_exact_evidence"), { fileId: "file_1" }), []);
  assert.deepEqual(validateToolArguments(schema("get_exact_evidence"), { fileId: { $ne: null } }), ["fileId must be a string"]);
  assert.deepEqual(validateToolArguments(schema("get_search_coverage"), { anything: true }), ["anything is not an accepted argument"]);
  assert.deepEqual(validateToolArguments(schema("compare_retrievals"), { beforeTraceId: "a", afterTraceId: "b", manual: "yes" }), ["manual must be a boolean"]);
  assert.deepEqual(validateToolArguments(schema("review_conflict"), { conflictId: "c", status: "winner" }), [
    "status must be one of authoritative_source, expected_difference, resolved, false_positive",
  ]);
  assert.deepEqual(validateToolArguments(schema("review_conflict"), { conflictId: "c", status: "resolved", note: "ok" }), []);
});

test("the MCP route validates before dispatch and never calls its own URL", async () => {
  const route = await readFile(new URL("../app/api/mcp/route.ts", import.meta.url), "utf8");
  assert.match(route, /validateToolArguments\(tool\.inputSchema, args\)/);
  assert.ok(route.indexOf("validateToolArguments(") < route.indexOf("runTool(tool.name"), "validation must run before the tool");
  assert.doesNotMatch(route, /fetch\(/);
  assert.doesNotMatch(route, /request\.url/);
});
