import { NextResponse } from "next/server";
import { rateLimit, recordBetaEvent, saveBetaAccessRequest } from "@/lib/beta/repository";

const sizes = new Set(["1-10", "11-50", "51-200", "201-1000", "1001+"]);
const intents = new Set(["beta", "demo"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, limit) : "";
}
async function anonymousKey(request: Request) {
  const raw = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const pepper = process.env.BETA_INVITE_PEPPER;
  if (!pepper) throw new Error("BETA_INVITE_PEPPER_MISSING");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${pepper}:public-request:${raw}`));
  return `public_${Array.from(new Uint8Array(digest)).slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 24_000)
    return NextResponse.json({ error: { code: "REQUEST_TOO_LARGE", message: "Please shorten your response and try again." } }, { status: 413 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Please check the form and try again." } }, { status: 400 });
  const startedAt = Number(body.startedAt), elapsed = Date.now() - startedAt;
  if (clean(body.website, 200) || !Number.isFinite(startedAt) || elapsed < 1500 || elapsed > 86_400_000)
    return NextResponse.json({ submitted: true }, { status: 202, headers: { "cache-control": "no-store" } });

  const fullName = clean(body.fullName, 120), email = clean(body.email, 320).toLowerCase(), company = clean(body.company, 160), jobTitle = clean(body.jobTitle, 160), companySize = clean(body.companySize, 20), knowledgeProblem = clean(body.knowledgeProblem, 2500), intent = clean(body.intent, 10);
  const knowledgeTools = Array.isArray(body.knowledgeTools) ? [...new Set(body.knowledgeTools.map((value) => clean(value, 60)).filter(Boolean))].slice(0, 12) : [];
  if (fullName.length < 2 || !emailPattern.test(email) || !company || !jobTitle || !sizes.has(companySize) || !knowledgeTools.length || knowledgeProblem.length < 20 || !intents.has(intent) || typeof body.usesAiAgents !== "boolean" || typeof body.willingLimitedFolder !== "boolean")
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Complete every required field so we can evaluate the request." } }, { status: 400 });

  try {
    const key = await anonymousKey(request);
    if (!(await rateLimit(key, "public_beta_request", 5, 3600)) || !(await rateLimit(`${key}:${email}`, "public_beta_email", 3, 86400)))
      return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests were submitted. Please try again later." } }, { status: 429, headers: { "retry-after": "3600" } });
    const result = await saveBetaAccessRequest({ email, fullName, company, jobTitle, companySize, knowledgeTools, usesAiAgents: body.usesAiAgents, knowledgeProblem, willingLimitedFolder: body.willingLimitedFolder, intent: intent as "beta" | "demo" });
    await recordBetaEvent({ actorId: key, event: "beta_request_submitted", properties: { intent, duplicate: !result.created } });
    return NextResponse.json({ submitted: true, message: "Thanks. We’ll review your request and contact you if there is a fit for the controlled beta." }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: { code: "SUBMISSION_UNAVAILABLE", message: "We couldn’t save your request. Please try again later." } }, { status: 503 });
  }
}
