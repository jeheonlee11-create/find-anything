import { NextResponse } from "next/server";

const AUTHENTICATED_EMAIL_HEADER = "oai-authenticated-user-email";
export const DEMO_WORKSPACE_ID = "ws_synthetic_demo";

export interface AuthenticatedActor {
  actorId: string;
  email: string;
}

export async function getAuthenticatedActor(request: Request): Promise<AuthenticatedActor | null> {
  const email = request.headers.get(AUTHENTICATED_EMAIL_HEADER)?.trim().toLowerCase();
  if (!email || email.length > 320 || !email.includes("@")) return null;
  return { actorId: await pseudonymousActorId(email), email };
}

export async function requireApiActor(request: Request): Promise<AuthenticatedActor | NextResponse> {
  const actor = await getAuthenticatedActor(request);
  if (actor) return actor;
  return NextResponse.json(
    { error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in is required." } },
    { status: 401, headers: { "cache-control": "no-store", "www-authenticate": "Bearer realm=\"find-anything\"" } },
  );
}

export function authorizeDemoWorkspace(actor: AuthenticatedActor, workspaceId: string): NextResponse | null {
  void actor;
  if (workspaceId === DEMO_WORKSPACE_ID) return null;
  return NextResponse.json(
    { error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." } },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

export function isAuthFailure(value: AuthenticatedActor | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

async function pseudonymousActorId(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(`find-anything-actor-v1:${email}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `actor_${Array.from(new Uint8Array(digest)).slice(0, 12).map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
