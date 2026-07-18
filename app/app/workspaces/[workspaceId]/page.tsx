import type { Metadata } from "next";
import { PublicPage } from "@/app/components/public-page";
import { WorkspaceDashboard } from "@/app/components/workspace-dashboard";
import { requireBetaChatGPTUser } from "@/app/chatgpt-auth";
export const metadata: Metadata = { title: "Workspace — Find Anything" };
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  await requireBetaChatGPTUser("/app");
  const { workspaceId } = await params;
  return (
    <PublicPage
      badge={workspaceId === "ws_yc_demo_acme" ? "Investor demo · Synthetic data" : "Private-beta workspace"}
      title={workspaceId === "ws_yc_demo_acme" ? "Know when an agent should not answer." : "Connect and index Google Drive."}
      lede={workspaceId === "ws_yc_demo_acme" ? "Find Anything shows AI agents what they found, what they missed, and when they should not answer." : "Workspace membership is checked server-side for every workspace and connector request."}
    >
      <WorkspaceDashboard workspaceId={workspaceId} />
    </PublicPage>
  );
}
