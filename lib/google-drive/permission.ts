import { listAllDriveFiles } from "./client";
import { usableAccessToken, type StoredConnector } from "./sync";

export async function currentAuthorizedDriveSourceIds(connector: StoredConnector) {
  if ((connector as StoredConnector & {status?:string}).status !== "connected") throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");
  const accessToken = await usableAccessToken(connector);
  const inventory = await listAllDriveFiles(accessToken);
  if (inventory.incompleteSearch) throw new Error("GOOGLE_PERMISSION_INVENTORY_INCOMPLETE");
  return {sourceIds:new Set(inventory.files.map((file)=>file.id)),filesDiscovered:inventory.files.length,paginationComplete:true};
}
