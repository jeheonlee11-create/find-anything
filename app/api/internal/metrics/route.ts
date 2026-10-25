import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/security/constant-time";

/**
 * Founder metrics, behind INTERNAL_ADMIN_TOKEN. Unauthorized callers get the
 * same 404 as a missing route. No provider is wired up, so every metric is
 * null rather than invented.
 */
export async function GET(request: Request) {
  if (!(await bearerMatches(request.headers.get("authorization"), process.env.INTERNAL_ADMIN_TOKEN)))
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  return NextResponse.json(
    {
      period: "No data yet",
      visitors: null,
      signups: null,
      activatedUsers: null,
      sourceConnectConversion: null,
      indexingCompletionRate: null,
      timeToFirstSearch: null,
      timeToFirstUsefulResult: null,
      secondSearchUsers: null,
      day1Retention: null,
      day7Retention: null,
      day30Retention: null,
      weeklyActiveUsers: null,
      monthlyActiveUsers: null,
      searchesPerActiveUser: null,
      apiActiveUsers: null,
      mcpActiveUsers: null,
      paidConversion: null,
      mrr: null,
      arr: null,
      churn: null,
      note: "Analytics and billing providers are not configured. No metrics are fabricated.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
