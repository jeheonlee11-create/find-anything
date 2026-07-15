import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
const searchSchema={type:"object",required:["query"],additionalProperties:false,properties:{query:{type:"string",minLength:1,maxLength:500},fileType:{type:"string",enum:["all","docs","slides","sheets","pdf"]},cursor:{type:"string"},pageSize:{type:"integer",minimum:1,maximum:100}}};
const idSchema=(property:string)=>({type:"object",required:[property],additionalProperties:false,properties:{[property]:{type:"string",minLength:1}}});
const definitions = [
  {name:"search_files",description:"Rank literal matches from the authenticated workspace.",inputSchema:searchSchema},
  {name:"find_all_files",description:"Return every literal match with cursor pagination.",inputSchema:searchSchema},
  {name:"get_exact_evidence",description:"Get structural citations for one workspace file.",inputSchema:idSchema("fileId")},
  {name:"get_search_coverage",description:"Get indexing coverage for the API-key workspace.",inputSchema:{type:"object",additionalProperties:false,properties:{}}},
  {name:"get_retrieval_trace",description:"Get one durable retrieval trace.",inputSchema:idSchema("traceId")},
  {name:"get_search_receipt",description:"Get one durable search receipt.",inputSchema:idSchema("receiptId")},
  {name:"get_file_relationships",description:"Get explainable inferred relationships for one file.",inputSchema:idSchema("fileId")},
];
export async function POST(request: Request) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  const rpc = (await request.json().catch(() => null)) as {
    id?: string | number;
    method?: string;
    params?: { name?: string; arguments?: Record<string, unknown> };
  } | null;
  if (!rpc)
    return json(null, undefined, { code: -32700, message: "Parse error" });
  if (rpc.method === "initialize")
    return json(rpc.id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "find-anything", version: "1.0.0" },
    });
  if (rpc.method === "tools/list") return json(rpc.id, { tools: definitions });
  if (rpc.method !== "tools/call" || !rpc.params?.name)
    return json(rpc.id, undefined, {
      code: -32601,
      message: "Method not found",
    });
  const args = rpc.params.arguments ?? {};
  if (args.workspaceId && args.workspaceId !== principal.workspaceId)
    return json(rpc.id, undefined, {
      code: -32003,
      message: "WORKSPACE_FORBIDDEN",
    });
  const target = toolTarget(
    rpc.params.name,
    args,
    principal.workspaceId,
    request.url,
  );
  if (!target)
    return json(rpc.id, undefined, { code: -32602, message: "Unknown tool" });
  const response = await fetch(target.url, {
      method: target.method,
      headers: {
        authorization: request.headers.get("authorization") ?? "",
        "content-type": "application/json",
        "x-request-id":
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
      },
      body: target.body ? JSON.stringify(target.body) : undefined,
    }),
    result = await response
      .json()
      .catch(() => ({
        error: {
          code: "UPSTREAM_ERROR",
          message: "Tool response was not JSON.",
        },
      }));
  if (!response.ok)
    return json(rpc.id, undefined, {
      code: -32000,
      message: result.error?.code ?? "TOOL_FAILED",
      data: result,
    });
  return json(rpc.id, {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: result,
  });
}
function toolTarget(
  name: string,
  args: Record<string, unknown>,
  workspaceId: string,
  base: string,
) {
  const url = (path: string) => new URL(path, base).toString();
  if (name === "search_files" || name === "find_all_files")
    return {
      url: url("/v1/search"),
      method: "POST",
      body: {
        ...args,
        workspaceId,
        mode: name === "find_all_files" ? "all" : "best",
      },
    };
  if (name === "get_exact_evidence")
    return {
      url: url(
        `/v1/files/${encodeURIComponent(String(args.fileId ?? ""))}/citations`,
      ),
      method: "GET",
    };
  if (name === "get_search_coverage")
    return {
      url: url(`/v1/workspaces/${encodeURIComponent(workspaceId)}/coverage`),
      method: "GET",
    };
  if (name === "get_retrieval_trace")
    return {
      url: url(
        `/v1/retrieval-traces/${encodeURIComponent(String(args.traceId ?? ""))}`,
      ),
      method: "GET",
    };
  if (name === "get_search_receipt")
    return {
      url: url(
        `/v1/search-receipts/${encodeURIComponent(String(args.receiptId ?? ""))}`,
      ),
      method: "GET",
    };
  if (name === "get_file_relationships")
    return {
      url: url(
        `/v1/files/${encodeURIComponent(String(args.fileId ?? ""))}/relationships`,
      ),
      method: "GET",
    };
  return null;
}
function json(
  id: string | number | null | undefined,
  result?: unknown,
  error?: unknown,
) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, ...(error ? { error } : { result }) },
    { headers: { "cache-control": "no-store" } },
  );
}
