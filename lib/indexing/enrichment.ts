/**
 * Optional AI enrichment stage (stage 6 of docs/indexer-v2-pipeline.md).
 *
 * Strictly flag-gated: the stage is a no-op unless BOTH
 * `INDEXING_AI_ENRICHMENT === "claude"` and `ANTHROPIC_API_KEY` are present in
 * the environment. With the flag off (the default), no document content ever
 * leaves the deterministic local pipeline and no network call is made.
 * Results, when produced, are stored with `extraction_mode: "ai_enriched"`.
 */
export interface EnrichmentEnv {
  INDEXING_AI_ENRICHMENT?: string;
  ANTHROPIC_API_KEY?: string;
}

export function enrichmentEnabled(env: EnrichmentEnv | undefined) {
  return (
    env?.INDEXING_AI_ENRICHMENT === "claude" && Boolean(env?.ANTHROPIC_API_KEY)
  );
}

/** Formats we could export from Drive but never extract deterministically. */
export const EXPORTABLE_UNSUPPORTED_MIME_TYPES = new Set([
  "application/vnd.google-apps.drawing",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/rtf",
]);

export interface EnrichmentCandidateFile {
  id: string;
  name: string;
  mimeType: string;
  /** Deterministic text units the local parsers produced for this file. */
  unitCount: number;
}

/**
 * Candidates are files the deterministic parsers could not read: files that
 * produced zero text units (scanned PDFs), images, and exportable formats we
 * do not parse locally. Pure + deterministic so ordering is testable.
 */
export function selectEnrichmentCandidates<T extends EnrichmentCandidateFile>(
  files: T[],
): T[] {
  return files.filter(
    (file) =>
      file.mimeType.startsWith("image/") ||
      (file.mimeType === "application/pdf" && file.unitCount === 0) ||
      (file.unitCount === 0 &&
        EXPORTABLE_UNSUPPORTED_MIME_TYPES.has(file.mimeType)),
  );
}

export const ENRICHMENT_MODEL = "claude-sonnet-5";
export const ENRICHMENT_API_URL = "https://api.anthropic.com/v1/messages";
const ENRICHMENT_MAX_TOKENS = 2048;

export interface EnrichedUnit {
  unitType: string;
  location: Record<string, unknown>;
  text: string;
  contentHash: string;
}

/**
 * Describe the file to Claude and return searchable text units.
 *
 * The DEFAULT path is a clean no-op: when `enrichmentEnabled(env)` is false
 * this returns `null` without touching the network. When enabled it POSTs the
 * exported bytes (PDF as a document block, images as an image block; metadata
 * only otherwise) to the Claude API and converts the reply into extracted
 * units the caller persists with `extraction_mode: "ai_enriched"`. Tests must
 * always inject `fetchImpl`; the flag stays off in every test environment so
 * no test can hit the network.
 */
export async function enrichFile(input: {
  file: { id: string; name: string; mimeType: string };
  data?: ArrayBuffer;
  env: EnrichmentEnv;
  fetchImpl?: typeof fetch;
}): Promise<EnrichedUnit[] | null> {
  if (!enrichmentEnabled(input.env)) return null;
  const fetchImpl = input.fetchImpl ?? fetch,
    content: Record<string, unknown>[] = [];
  if (input.data && input.file.mimeType === "application/pdf")
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64(input.data),
      },
    });
  else if (input.data && input.file.mimeType.startsWith("image/"))
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: input.file.mimeType,
        data: base64(input.data),
      },
    });
  content.push({
    type: "text",
    text: `Extract the searchable text content of the file "${input.file.name}" (${input.file.mimeType}). Reply with plain text only: one line per distinct passage, no commentary. Reply with NONE if there is no legible text.`,
  });
  const response = await fetchImpl(ENRICHMENT_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ENRICHMENT_MODEL,
      max_tokens: ENRICHMENT_MAX_TOKENS,
      messages: [{ role: "user", content }],
    }),
  });
  if (!response.ok) throw new Error(`ENRICHMENT_HTTP_${response.status}`);
  const body = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = (body.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text || text === "NONE") return [];
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return Promise.all(
    lines.map(async (line, index) => ({
      unitType: "ai_enriched_text",
      location: { source: "ai_enrichment", model: ENRICHMENT_MODEL, line: index },
      text: line,
      contentHash: await sha256Hex(line),
    })),
  );
}

function base64(data: ArrayBuffer) {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1)
    binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
