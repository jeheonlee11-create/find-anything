import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { PublicPage } from "@/app/components/public-page";
import {
  INVITE_ONLY_FALLBACK_PATH,
  resolveConnectAccess,
} from "@/lib/beta/access-gate";
import { CONNECT_PATH } from "@/lib/config/urls";
import { beginGoogleDriveAuthorization } from "@/lib/google-drive/connect-flow";
import { ensureDefaultWorkspace } from "@/lib/workspaces/repository";

export const metadata: Metadata = {
  title: "Connect Google Drive — Find Anything",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The one entry point for "Connect Google Drive". A plain navigation target, so
 * it works as a link from the public site, and it runs in exactly this order:
 *
 *   1. Require platform identity (sign-in becomes an invisible step, not a
 *      marketing call to action).
 *   2. Ask the internal invite gate BEFORE any Google OAuth request exists.
 *   3. If approved: ensure the actor has a workspace, then start Drive OAuth.
 *      Google's callback lands the user inside that private workspace.
 *   4. If not approved: route to the honest invite-only fallback. No Google
 *      authorization request is ever created, and nothing about Google-side
 *      configuration is revealed.
 */
export default async function Connect() {
  const user = await requireChatGPTUser(CONNECT_PATH);
  const access = await resolveConnectAccess({ email: user.email });
  if (!access.allowed) redirect(access.fallbackPath);

  let authorizationUrl: string | null = null;
  let unavailable = false;
  try {
    const workspace = await ensureDefaultWorkspace(access.actor);
    authorizationUrl = await beginGoogleDriveAuthorization(
      access.actor,
      workspace.id,
    );
  } catch {
    unavailable = true;
  }
  if (authorizationUrl) redirect(authorizationUrl);

  return (
    <PublicPage
      badge="Connect Google Drive"
      title="We could not start the Google authorization."
      lede={
        unavailable
          ? "Your access is approved, but this deployment cannot begin a Google Drive authorization right now. Nothing was sent to Google and nothing was changed in your account."
          : "Your workspace could not be prepared for a Google Drive authorization. Nothing was sent to Google and nothing was changed in your account."
      }
    >
      <section className="content-section">
        <h2>What to do next</h2>
        <ul className="status-list">
          <li>Retry the connection from your workspace.</li>
          <li>
            If it keeps failing, the server-side Google connector configuration
            or the workspace database is unavailable; the founder is the only
            person who can correct that.
          </li>
        </ul>
        <div className="audit-actions">
          <Link className="button" href="/app">
            Open my workspaces
          </Link>
          <Link href={INVITE_ONLY_FALLBACK_PATH}>Beta access details</Link>
        </div>
      </section>
    </PublicPage>
  );
}
