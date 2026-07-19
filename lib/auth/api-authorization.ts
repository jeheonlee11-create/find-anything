import { NextResponse } from "next/server";
import {betaAccess} from "@/lib/beta/repository";

const AUTHENTICATED_EMAIL_HEADER = "oai-authenticated-user-email";
const LOCAL_DEVELOPMENT_EMAIL = "local-oauth-tester@localhost.invalid";
export const DEMO_WORKSPACE_ID = "ws_synthetic_demo";
export const YC_DEMO_WORKSPACE_ID = "ws_yc_demo_acme";
export function isDemoWorkspace(workspaceId: string) {
  return workspaceId === YC_DEMO_WORKSPACE_ID;
}

export interface AuthenticatedActor {
  actorId: string;
  email: string;
}

export async function getAuthenticatedActor(
  request: Request,
): Promise<AuthenticatedActor | null> {
  const forwardedEmail = request.headers
    .get(AUTHENTICATED_EMAIL_HEADER)
    ?.trim()
    .toLowerCase();
  const email =
    forwardedEmail ||
    (isLocalDevelopmentRequest(request) ? LOCAL_DEVELOPMENT_EMAIL : "");
  if (!email || email.length > 320 || !email.includes("@")) return null;
  return { actorId: await pseudonymousActorId(email), email };
}

export async function requireApiActor(
  request: Request,
): Promise<AuthenticatedActor | NextResponse> {
  const actor = await getAuthenticatedActor(request);
  if (actor) {const access=await betaAccess(actor);if(access.allowed)return actor;return NextResponse.json({error:{code:"BETA_ACCESS_REQUIRED",message:"This private beta is available only to invited testers."}},{status:403,headers:{"cache-control":"no-store"}})}
  return NextResponse.json(
    {
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Sign in is required.",
      },
    },
    {
      status: 401,
      headers: {
        "cache-control": "no-store",
        "www-authenticate": 'Bearer realm="find-anything"',
      },
    },
  );
}

export function authorizeDemoWorkspace(
  actor: AuthenticatedActor,
  workspaceId: string,
): NextResponse | null {
  void actor;
  if (workspaceId === DEMO_WORKSPACE_ID) return null;
  return NextResponse.json(
    { error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." } },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

export function isAuthFailure(
  value: AuthenticatedActor | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}

function isLocalDevelopmentRequest(request: Request): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  const hostname = new URL(request.url).hostname;
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

export async function pseudonymousActorId(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(`find-anything-actor-v1:${email}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `actor_${Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}
