import type { Metadata } from "next";
import { PublicPage } from "@/app/components/public-page";
import { WorkspaceDashboard } from "@/app/components/workspace-dashboard";
import { requireBetaChatGPTUser } from "@/app/chatgpt-auth";
export const metadata: Metadata = { title: "Workspace — Vrtbrate" };
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  await requireBetaChatGPTUser("/app");
  const { workspaceId } = await params;
  return (
    <PublicPage
      badge="Week 1 workspace"
      title="Connect and index Google Drive."
      lede="Workspace membership is checked server-side for every workspace and connector request."
    >
      <WorkspaceDashboard workspaceId={workspaceId} />
    </PublicPage>
  );
}
