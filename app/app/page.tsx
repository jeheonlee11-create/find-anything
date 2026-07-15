import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/app/components/public-page";
import { WorkspaceOnboarding } from "@/app/components/workspace-onboarding";
import { chatGPTSignOutPath, requireBetaChatGPTUser } from "@/app/chatgpt-auth";
export const metadata: Metadata = { title: "Workspaces — Vrtbrate" };
export default async function AppHome() {
  const {user,access} = await requireBetaChatGPTUser("/app");
  return (
    <PublicPage
      badge="Week 1 application"
      title="Create your Vrtbrate workspace."
      lede={`Signed in as ${user.displayName}. Create a workspace, connect Google Drive, and inspect only the files authorized for that connection.`}
    >
      <section className="content-section">
        <Link href={chatGPTSignOutPath("/")}>Sign out</Link>
      </section>
      <WorkspaceOnboarding onboardingComplete={access.onboardingComplete} />
    </PublicPage>
  );
}
