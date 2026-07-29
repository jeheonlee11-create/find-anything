export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  parents?: string[];
  owners?: { displayName?: string; emailAddress?: string }[];
  permissions?: {
    id: string;
    type: string;
    role: string;
    emailAddress?: string;
    domain?: string;
    allowFileDiscovery?: boolean;
    deleted?: boolean;
  }[];
  webViewLink?: string;
  md5Checksum?: string;
  size?: string;
  trashed?: boolean;
}
const fields =
  "nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime,parents,owners(displayName,emailAddress),permissions(id,type,role,emailAddress,domain,allowFileDiscovery,deleted),webViewLink,md5Checksum,size,trashed)";
async function googleFetch(url: string, accessToken: string) {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status))
      break;
    await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
  }
  if (!response) throw new Error("GOOGLE_REQUEST_UNAVAILABLE");
  if (!response.ok) {
    const service = new URL(url).hostname
      .split(".")[0]
      .replace(/[^a-z0-9]/gi, "_")
      .toUpperCase();
    throw new Error(`GOOGLE_${service}_HTTP_${response.status}`);
  }
  return response;
}
export interface DriveInventoryProgress {
  filesDiscovered: number;
  nextPageToken: string | null;
  paginationComplete: boolean;
  incompleteSearch: boolean;
  pageFiles: DriveFileMetadata[];
}
export async function listAllDriveFiles(
  accessToken: string,
  onProgress?: (progress: DriveInventoryProgress) => void | Promise<void>,
) {
  const files: DriveFileMetadata[] = [];
  let pageToken: string | undefined;
  let incompleteSearch = false;
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.search = new URLSearchParams({
      pageSize: "1000",
      fields,
      q: "trashed = false",
      spaces: "drive",
      ...(pageToken ? { pageToken } : {}),
    }).toString();
    const page = (await googleFetch(url.toString(), accessToken).then(
      (response) => response.json(),
    )) as {
      files?: DriveFileMetadata[];
      nextPageToken?: string;
      incompleteSearch?: boolean;
    };
    files.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
    incompleteSearch ||= Boolean(page.incompleteSearch);
    await onProgress?.({
      filesDiscovered: files.length,
      nextPageToken: pageToken ?? null,
      paginationComplete: !pageToken && !incompleteSearch,
      incompleteSearch,
      pageFiles: page.files ?? [],
    });
  } while (pageToken);
  return { files, incompleteSearch };
}
export async function exportGoogleFile(
  accessToken: string,
  file: DriveFileMetadata,
) {
  let mime: string | undefined;
  if (
    file.mimeType === "application/vnd.google-apps.document" ||
    file.mimeType === "application/vnd.google-apps.presentation"
  )
    mime = "text/plain";
  else if (file.mimeType === "application/vnd.google-apps.spreadsheet")
    mime = "text/csv";
  if (mime) {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(mime)}`;
    return {
      kind: file.mimeType.includes("spreadsheet") ? "csv" : "text",
      data: await googleFetch(url, accessToken).then((response) =>
        response.arrayBuffer(),
      ),
    } as const;
  }
  if (file.mimeType === "application/pdf") {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`;
    return {
      kind: "pdf",
      data: await googleFetch(url, accessToken).then((response) =>
        response.arrayBuffer(),
      ),
    } as const;
  }
  return null;
}

export async function fetchStructuredGoogleFile(
  accessToken: string,
  file: DriveFileMetadata,
) {
  let url: string | undefined, source: "docs" | "slides" | "sheets" | undefined;
  if (file.mimeType === "application/vnd.google-apps.document") {
    url = `https://docs.googleapis.com/v1/documents/${encodeURIComponent(file.id)}`;
    source = "docs";
  } else if (file.mimeType === "application/vnd.google-apps.presentation") {
    url = `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(file.id)}`;
    source = "slides";
  } else if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
    url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(file.id)}?includeGridData=true`;
    source = "sheets";
  }
  if (!url || !source) return null;
  return {
    kind: "structured" as const,
    source,
    data: await googleFetch(url, accessToken).then((response) =>
      response.json(),
    ),
  };
}
