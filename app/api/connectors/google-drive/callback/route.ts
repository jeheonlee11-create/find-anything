import { NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/lib/auth/api-authorization";
import {
  decryptSecret,
  encryptSecret,
  sha256,
} from "@/lib/google-drive/crypto";
import {
  DRIVE_SCOPE,
  exchangeAuthorizationCode,
} from "@/lib/google-drive/oauth";
import {
  consumeOAuthState,
  upsertConnector,
} from "@/lib/google-drive/repository";
import { logIndexingEvent } from "@/lib/observability/indexing-log";
export async function GET(request: Request) {
  const actor = await getAuthenticatedActor(request);
  if (!actor) return NextResponse.redirect(new URL("/sign-in", request.url));
  const url = new URL(request.url),
    code = url.searchParams.get("code"),
    state = url.searchParams.get("state"),
    oauthError = url.searchParams.get("error");
  if (oauthError) {
    logIndexingEvent("oauth_authorization_failed", {
      errorCode: "GOOGLE_OAUTH_DENIED",
    });
    return NextResponse.redirect(
      new URL(
        `/app?connector_error=${encodeURIComponent(oauthError)}`,
        request.url,
      ),
    );
  }
  if (!code || !state)
    return NextResponse.json(
      {
        error: {
          code: "INVALID_OAUTH_CALLBACK",
          message: "Missing authorization code or state.",
        },
      },
      { status: 400 },
    );
  const record = await consumeOAuthState(await sha256(state));
  if (
    !record ||
    record.actorId !== actor.actorId ||
    Date.parse(record.expiresAt) <= Date.now()
  )
    return NextResponse.json(
      {
        error: {
          code: "INVALID_OAUTH_STATE",
          message: "OAuth state is invalid or expired.",
        },
      },
      { status: 400 },
    );
  try {
    const tokens = await exchangeAuthorizationCode(
        code,
        await decryptSecret(record.pkceVerifierCiphertext),
      ),
      now = new Date().toISOString();
    if (!new Set(tokens.scope.split(/\s+/)).has(DRIVE_SCOPE))
      throw new Error("GOOGLE_REQUIRED_SCOPE_MISSING");
    await upsertConnector({
      id: `connector_${record.workspaceId}_google_drive`,
      workspaceId: record.workspaceId,
      actorId: actor.actorId,
      provider: "google_drive",
      providerAccountId: actor.actorId,
      status: "connected",
      accessTokenCiphertext: await encryptSecret(tokens.access_token),
      refreshTokenCiphertext: tokens.refresh_token
        ? await encryptSecret(tokens.refresh_token)
        : null,
      tokenExpiresAt: new Date(
        Date.now() + tokens.expires_in * 1000,
      ).toISOString(),
      grantedScopes: tokens.scope,
      createdAt: now,
      updatedAt: now,
    });
    logIndexingEvent("oauth_authorization_succeeded", {
      workspaceId: record.workspaceId,
      connectorId: `connector_${record.workspaceId}_google_drive`,
      stage: "connecting",
    });
    return NextResponse.redirect(
      new URL(
        `/app/workspaces/${encodeURIComponent(record.workspaceId)}?connector=connected`,
        request.url,
      ),
    );
  } catch {
    logIndexingEvent("oauth_authorization_failed", {
      workspaceId: record.workspaceId,
      errorCode: "GOOGLE_TOKEN_EXCHANGE_FAILED",
    });
    return NextResponse.redirect(
      new URL(
        `/app/workspaces/${encodeURIComponent(record.workspaceId)}?connector_error=token_exchange_failed`,
        request.url,
      ),
    );
  }
}
