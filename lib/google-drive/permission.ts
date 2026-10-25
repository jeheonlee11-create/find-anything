import { listAllDriveFiles, PERMISSION_CHECK_FIELDS } from "./client";
import { usableAccessToken, type StoredConnector } from "./sync";
import { connectorSearchAccess } from "./connector-health";

/**
 * The Drive file IDs the connected account can reach right now, fetched on
 * every search (fail closed: any error or incomplete listing throws, and the
 * caller returns no results). With the drive.file scope this is the set of
 * files the user picked, listed IDs-only.
 */
export async function currentAuthorizedDriveSourceIds(connector: StoredConnector) {
  if (!connectorSearchAccess(connector as StoredConnector & { status: string; lastErrorCode?: string | null }).allowed)
    throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");
  const accessToken = await usableAccessToken(connector);
  const inventory = await listAllDriveFiles(accessToken, undefined, { fields: PERMISSION_CHECK_FIELDS });
  if (inventory.incompleteSearch) throw new Error("GOOGLE_PERMISSION_INVENTORY_INCOMPLETE");
  return { sourceIds: new Set(inventory.files.map((file) => file.id)), filesDiscovered: inventory.files.length, paginationComplete: true };
}
