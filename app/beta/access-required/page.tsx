import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/app/components/public-page";
import { BetaAccessForm } from "@/app/components/beta-access-form";
import { APP_BASE_PATH, CONNECT_PATH } from "@/lib/config/urls";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";

export const metadata: Metadata = { title: "Invite-only beta — Find Anything" };

/**
 * The honest fallback for anyone the invite gate denies, and the only
 * request-access surface in the product. It states plainly that access is
 * invite-only, and it deliberately says nothing that would imply anything about
 * a specific email: not whether an account exists, not whether an invitation
 * exists, and nothing at all about how the founder configures Google.
 */
export default function AccessRequired() {
  return (
    <PublicPage
      badge="Controlled design-partner beta"
      title="Find Anything is currently invite-only."
      lede="Connecting Google Drive requires an invitation from the founder. We onboard a small number of teams at a time so each one gets a guided setup and a real retrieval review."
    >
      <section className="content-section">
        <h2>Why you are seeing this</h2>
        <ul className="status-list">
          <li>You are signed in, and this account is not on the current invitation list.</li>
          <li>No Google authorization was started, and nothing was changed in your Google account.</li>
          <li>This page cannot tell you anything about a specific email address beyond the account you are signed in with.</li>
        </ul>
      </section>
      <section className="content-section">
        <h2>Request access</h2>
        <p>
          Approved testers begin with a limited, non-sensitive Google Drive
          folder. Submitting this form does not create an account, does not grant
          access, and does not start Google authorization. We only report your
          request as received once the server confirms it was stored.
        </p>
        <BetaAccessForm />
      </section>
      <section className="content-section">
        <h2>Already invited?</h2>
        <p>
          Sign in with the exact email your invitation was issued to, then start
          the connection again.
        </p>
        <div className="audit-actions">
          <Link className="button" href={chatGPTSignInPath(CONNECT_PATH)}>
            Sign in and connect Google Drive
          </Link>
          <Link href={APP_BASE_PATH}>Open my workspaces</Link>
        </div>
      </section>
    </PublicPage>
  );
}
