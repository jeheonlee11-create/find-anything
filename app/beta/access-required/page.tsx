import type { Metadata } from "next";
import Link from "next/link";
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
    <main className="marketing-page">
      <nav className="marketing-nav marketing-shell" aria-label="Main navigation">
        <Link className="marketing-brand" href="/" aria-label="Find Anything home"><span>F</span>Find Anything</Link>
        <div><Link href="/docs">Docs</Link><Link href="/pricing">Pricing</Link><Link href="/trust">Security</Link></div>
        <Link className="marketing-nav-action" href={chatGPTSignInPath(CONNECT_PATH)}>Sign in and connect</Link>
      </nav>

      <section className="marketing-subpage marketing-shell">
        <div>
          <div className="marketing-eyebrow">Invite-only beta</div>
          <h1>Find Anything is currently invite-only.</h1>
          <p className="marketing-lede">Connecting Google Drive requires an invitation from the founder. We onboard a small number of teams at a time so each one gets a guided setup and a real retrieval review.</p>
          <ul className="marketing-fineprint-list">
            <li>You are signed in, and this account is not on the current invitation list.</li>
            <li>No Google authorization was started, and nothing was changed in your Google account.</li>
            <li>This page cannot tell you anything about a specific email address beyond the account you are signed in with.</li>
          </ul>
          <h2>Already invited?</h2>
          <p className="marketing-lede">Sign in with the exact email your invitation was issued to, then start the connection again.</p>
          <div className="marketing-actions">
            <Link className="marketing-primary" href={chatGPTSignInPath(CONNECT_PATH)}>Sign in and connect Google Drive</Link>
            <Link className="marketing-secondary" href={APP_BASE_PATH}>Open my workspaces</Link>
          </div>
        </div>
        <div>
          <h2>Request access</h2>
          <p className="marketing-lede">Approved testers begin with a limited, non-sensitive Google Drive folder. Submitting this form does not create an account, does not grant access, and does not start Google authorization. We only report your request as received once the server confirms it was stored.</p>
          <BetaAccessForm />
        </div>
      </section>

      <footer className="marketing-footer marketing-shell">
        <div><Link className="marketing-brand" href="/"><span>F</span>Find Anything</Link><p>Trusted knowledge for AI agents. Private beta.</p></div>
        <nav aria-label="Legal and trust"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/trust">Security</Link><a href="mailto:hello@findanything.dev">Contact</a></nav>
      </footer>
    </main>
  );
}
