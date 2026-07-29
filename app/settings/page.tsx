import type { Metadata } from "next";
import Link from "next/link";
import { chatGPTSignOutPath, requireBetaChatGPTUser } from "@/app/chatgpt-auth";
import { PublicPage } from "@/app/components/public-page";
import { SettingsPanel } from "@/app/components/settings-panel";
import { CONNECT_PATH } from "@/lib/config/urls";

export const metadata: Metadata = {
  title: "Settings — Find Anything",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Authenticated account, workspace, and Google Drive settings. Guarded by the
 * same platform identity and beta-access requirements as /app.
 */
export default async function Settings() {
  const { user, access } = await requireBetaChatGPTUser("/settings");
  return (
    <PublicPage
      badge="Settings · Private beta"
      title="Account, workspace, and Google Drive."
      lede="Everything Find Anything holds for you, and how to remove it."
    >
      <section className="content-section">
        <h2>Account</h2>
        <dl className="settings-list">
          <div>
            <dt>Signed in as</dt>
            <dd>{user.email}</dd>
          </div>
          {user.fullName && (
            <div>
              <dt>Name</dt>
              <dd>{user.fullName}</dd>
            </div>
          )}
          <div>
            <dt>Beta role</dt>
            <dd>{access.role ?? "tester"}</dd>
          </div>
          <div>
            <dt>Setup</dt>
            <dd>
              {access.onboardingComplete
                ? "Onboarding complete"
                : "Onboarding not finished"}
            </dd>
          </div>
        </dl>
        <p className="disclosure">
          Sign-in is handled by the ChatGPT Sites platform. Find Anything receives
          only your verified email and display name for the request; it never
          sees or stores a password, and it cannot change your identity settings.
        </p>
        <div className="audit-actions">
          <Link className="button" href={chatGPTSignOutPath("/")}>
            Sign out
          </Link>
          <Link href={CONNECT_PATH}>Connect Google Drive</Link>
        </div>
      </section>
      <SettingsPanel />
    </PublicPage>
  );
}
