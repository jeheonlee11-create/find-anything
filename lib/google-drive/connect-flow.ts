/**
 * Starts a Google Drive OAuth authorization for one actor and one workspace.
 *
 * Shared by the `/connect` navigation route and the connect API so both paths
 * enforce the same invariants: workspace membership is verified server-side, the
 * OAuth state is stored only as a hash, and the PKCE verifier is encrypted at
 * rest. Neither the state nor the verifier is ever returned to the browser.
 */
import type { AuthenticatedActor } from "@/lib/auth/api-authorization";
import { encryptSecret, sha256 } from "@/lib/google-drive/crypto";
import { createAuthorizationRequest } from "@/lib/google-drive/oauth";
import { saveOAuthState } from "@/lib/google-drive/repository";
import { actorWorkspace } from "@/lib/workspaces/repository";

const STATE_LIFETIME_MS = 10 * 60_000;

/**
 * Returns the Google authorization URL, or `null` when the actor is not a member
 * of the workspace. A `null` result must be surfaced as "workspace not found" so
 * membership is never disclosed.
 */
export async function beginGoogleDriveAuthorization(
  actor: AuthenticatedActor,
  workspaceId: string,
): Promise<string | null> {
  if (!(await actorWorkspace(actor.actorId, workspaceId))) return null;
  const authorization = await createAuthorizationRequest();
  await saveOAuthState({
    stateHash: await sha256(authorization.state),
    actorId: actor.actorId,
    workspaceId,
    pkceVerifierCiphertext: await encryptSecret(authorization.verifier),
    expiresAt: new Date(Date.now() + STATE_LIFETIME_MS).toISOString(),
  });
  return authorization.url;
}
