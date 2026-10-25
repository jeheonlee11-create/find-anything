import { NextResponse } from "next/server";
import { requireWorkspaceApiKey, type ApiPrincipal } from "@/lib/api/auth";
import {
  apiConflicts,
  apiCoverage,
  apiFileCitations,
  apiFileRelationships,
  apiReceipt,
  apiRetrievalDiff,
  apiReviewConflict,
  apiSearch,
  apiTrace,
} from "@/lib/api/v1-handlers";
import { MCP_TOOLS, toolDefinition, validateToolArguments } from "@/lib/mcp/tools";

/**
 * MCP server (JSON-RPC 2.0 over HTTP POST), authenticated with a workspace API
 * key. Each tool's arguments are validated against its advertised input schema
 * before anything runs, then the tool calls the same in-process handler as the
 * matching /v1 route. Tools: get_search_coverage, get_retrieval_trace,
 * compare_retrievals, get_search_receipt, get_workspace_conflicts,
 * review_conflict, and the rest of MCP_TOOLS.
 */
type Rpc = { id?: string | number; method?: string; params?: { name?: string; arguments?: unknown } };

function runTool(name: string, args: Record<string, unknown>, principal: ApiPrincipal, requestId: string): Promise<Response> | null {
  const id = (key: string) => String(args[key]);
  switch (name) {
    case "search_files":
    case "find_all_files":
      return apiSearch(principal, { ...args, mode: name === "find_all_files" ? "all" : "best" }, requestId);
    case "get_exact_evidence":
      return apiFileCitations(principal, id("fileId"));
    case "get_search_coverage":
      return apiCoverage(principal, principal.workspaceId);
    case "get_retrieval_trace":
      return apiTrace(principal, id("traceId"));
    case "get_search_receipt":
      return apiReceipt(principal, id("receiptId"));
    case "compare_retrievals":
      return apiRetrievalDiff(principal, args);
    case "get_file_relationships":
      return apiFileRelationships(principal, id("fileId"));
    case "get_workspace_conflicts":
      return apiConflicts(principal, principal.workspaceId);
    case "review_conflict":
      return apiReviewConflict(principal, principal.workspaceId, args);
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  const rpc = (await request.json().catch(() => null)) as Rpc | null;
  if (!rpc) return json(null, undefined, { code: -32700, message: "Parse error" });
  if (rpc.method === "initialize")
    return json(rpc.id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "find-anything", version: "1.0.0" },
    });
  if (rpc.method === "tools/list") return json(rpc.id, { tools: MCP_TOOLS });
  if (rpc.method !== "tools/call" || !rpc.params?.name) return json(rpc.id, undefined, { code: -32601, message: "Method not found" });
  const tool = toolDefinition(rpc.params.name);
  if (!tool) return json(rpc.id, undefined, { code: -32602, message: "Unknown tool" });
  const supplied = rpc.params.arguments ?? {};
  // A workspaceId is never needed (the API key names the workspace); one that
  // names another workspace is refused, and a matching one is ignored.
  if (typeof supplied === "object" && supplied !== null && "workspaceId" in supplied) {
    const { workspaceId, ...rest } = supplied as Record<string, unknown>;
    if (workspaceId !== principal.workspaceId) return json(rpc.id, undefined, { code: -32003, message: "WORKSPACE_FORBIDDEN" });
    rpc.params.arguments = rest;
  }
  const args = rpc.params.arguments ?? {},
    problems = validateToolArguments(tool.inputSchema, args);
  if (problems.length) return json(rpc.id, undefined, { code: -32602, message: "Invalid params", data: { problems } });
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID(),
    response = await runTool(tool.name, args as Record<string, unknown>, principal, requestId);
  if (!response) return json(rpc.id, undefined, { code: -32602, message: "Unknown tool" });
  const result =
    response.status === 204
      ? { ok: true }
      : await response.json().catch(() => ({ error: { code: "TOOL_FAILED", message: "Tool response was not JSON." } }));
  if (!response.ok) return json(rpc.id, undefined, { code: -32000, message: result.error?.code ?? "TOOL_FAILED", data: result });
  return json(rpc.id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result });
}

function json(id: string | number | null | undefined, result?: unknown, error?: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, ...(error ? { error } : { result }) }, { headers: { "cache-control": "no-store" } });
}
