import { listAllDriveFiles } from "./client";
import { usableAccessToken, type StoredConnector } from "./sync";
import { connectorSearchAccess } from "./connector-health";

export async function currentAuthorizedDriveSourceIds(connector: StoredConnector) {
  if (!connectorSearchAccess(connector as StoredConnector & {status:string;lastErrorCode?:string|null}).allowed) throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");
  const accessToken = await usableAccessToken(connector);
  const inventory = await listAllDriveFiles(accessToken);
  if (inventory.incompleteSearch) throw new Error("GOOGLE_PERMISSION_INVENTORY_INCOMPLETE");
  return {sourceIds:new Set(inventory.files.map((file)=>file.id)),filesDiscovered:inventory.files.length,paginationComplete:true};
}
