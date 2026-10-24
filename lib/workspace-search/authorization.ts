import { connectorForWorkspace } from "@/lib/google-drive/repository";
import { currentAuthorizedDriveSourceIds } from "@/lib/google-drive/permission";
import { connectorSearchAccess } from "@/lib/google-drive/connector-health";
import { indexedWorkspaceFiles } from "./repository";

export async function currentlyAuthorizedWorkspaceFiles(workspaceId: string) {
  const connector = await connectorForWorkspace(workspaceId);
  if (!connector || !connectorSearchAccess(connector).allowed)
    throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");
  const inventory = await currentAuthorizedDriveSourceIds(connector);
  return {
    files: await indexedWorkspaceFiles(workspaceId, inventory.sourceIds),
    inventory,
  };
}
export async function currentlyAuthorizedWorkspaceFile(
  workspaceId: string,
  fileId: string,
) {
  const authorized = await currentlyAuthorizedWorkspaceFiles(workspaceId);
  return {
    file: authorized.files.find((file) => file.id === fileId) ?? null,
    ...authorized,
  };
}
