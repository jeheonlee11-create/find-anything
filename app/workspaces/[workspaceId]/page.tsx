import { redirect } from "next/navigation";
import { APP_BASE_PATH } from "@/lib/config/urls";

/**
 * Compatibility redirect for links minted when the product was addressed as a
 * separate app host (`/workspaces/<id>`). Forwards to the single-origin route.
 * The target still enforces platform identity, beta access, and workspace
 * membership, so this redirect grants nothing.
 */
export default async function LegacyWorkspace({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  redirect(`${APP_BASE_PATH}/workspaces/${encodeURIComponent(workspaceId)}`);
}
