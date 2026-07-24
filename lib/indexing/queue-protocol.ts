export const INDEXING_QUEUE_PROTOCOL_VERSION = 1;
export const INDEXING_SERVICE_SIGNATURE_VERSION = "fa-hmac-v1";
export const INDEXING_SERVICE_MAX_CLOCK_SKEW_MS = 5 * 60_000;

export type IndexingQueueMessage = {
  version: typeof INDEXING_QUEUE_PROTOCOL_VERSION;
  jobId: string;
  continuationId: string;
  sequence: number;
  attemptEpoch: number;
  requestedAt: string;
};

export type IndexingContinuationResult = {
  jobId: string;
  continuationId: string;
  status: string;
  terminal: boolean;
  next: IndexingQueueMessage | null;
};

export function isIndexingQueueMessage(
  value: unknown,
): value is IndexingQueueMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    message.version === INDEXING_QUEUE_PROTOCOL_VERSION &&
    typeof message.jobId === "string" &&
    /^job_[a-zA-Z0-9_-]+$/.test(message.jobId) &&
    typeof message.continuationId === "string" &&
    /^continuation_job_[a-zA-Z0-9_-]+_\d+$/.test(message.continuationId) &&
    Number.isSafeInteger(message.sequence) &&
    Number(message.sequence) > 0 &&
    Number.isSafeInteger(message.attemptEpoch) &&
    Number(message.attemptEpoch) > 0 &&
    typeof message.requestedAt === "string" &&
    Number.isFinite(Date.parse(message.requestedAt))
  );
}

export function continuationMessage(input: {
  jobId: string;
  continuationId: string;
  sequence: number;
  attemptEpoch: number;
  requestedAt?: string;
}): IndexingQueueMessage {
  return {
    version: INDEXING_QUEUE_PROTOCOL_VERSION,
    jobId: input.jobId,
    continuationId: input.continuationId,
    sequence: input.sequence,
    attemptEpoch: input.attemptEpoch,
    requestedAt: input.requestedAt ?? new Date().toISOString(),
  };
}

export async function signedServiceHeaders(input: {
  secret: string;
  method: string;
  url: string;
  body: string;
  timestamp?: string;
  nonce?: string;
}) {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const nonce = input.nonce ?? crypto.randomUUID();
  const bodyHash = await sha256(input.body);
  const canonical = canonicalServiceRequest({
    method: input.method,
    url: input.url,
    timestamp,
    nonce,
    bodyHash,
  });
  const signature = await hmacSha256(input.secret, canonical);
  return {
    "content-type": "application/json",
    "x-find-anything-service-version": INDEXING_SERVICE_SIGNATURE_VERSION,
    "x-find-anything-service-timestamp": timestamp,
    "x-find-anything-service-nonce": nonce,
    "x-find-anything-service-body-sha256": bodyHash,
    "x-find-anything-service-signature": signature,
  };
}

export async function verifyServiceRequest(
  request: Request,
  secret: string | undefined,
  now = Date.now(),
) {
  if (!secret) return { ok: false as const, code: "SERVICE_AUTH_UNCONFIGURED" };
  const timestamp = request.headers.get(
      "x-find-anything-service-timestamp",
    ),
    nonce = request.headers.get("x-find-anything-service-nonce"),
    bodyHash = request.headers.get("x-find-anything-service-body-sha256"),
    signature = request.headers.get("x-find-anything-service-signature"),
    version = request.headers.get("x-find-anything-service-version");
  if (
    version !== INDEXING_SERVICE_SIGNATURE_VERSION ||
    !timestamp ||
    !nonce ||
    !bodyHash ||
    !signature
  )
    return { ok: false as const, code: "SERVICE_AUTH_MISSING" };
  const timestampMs = Date.parse(timestamp);
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(now - timestampMs) > INDEXING_SERVICE_MAX_CLOCK_SKEW_MS
  )
    return { ok: false as const, code: "SERVICE_AUTH_EXPIRED" };
  const body = await request.clone().text();
  if (!(await timingSafeHexEqual(await sha256(body), bodyHash)))
    return { ok: false as const, code: "SERVICE_BODY_MISMATCH" };
  const canonical = canonicalServiceRequest({
      method: request.method,
      url: request.url,
      timestamp,
      nonce,
      bodyHash,
    }),
    expected = await hmacSha256(secret, canonical);
  if (!(await timingSafeHexEqual(expected, signature)))
    return { ok: false as const, code: "SERVICE_AUTH_INVALID" };
  return { ok: true as const, body, nonce, timestamp };
}

function canonicalServiceRequest(input: {
  method: string;
  url: string;
  timestamp: string;
  nonce: string;
  bodyHash: string;
}) {
  const url = new URL(input.url);
  return [
    INDEXING_SERVICE_SIGNATURE_VERSION,
    input.method.toUpperCase(),
    url.pathname,
    url.search,
    input.timestamp,
    input.nonce,
    input.bodyHash,
  ].join("\n");
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    result = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(value),
    );
  return bytesToHex(new Uint8Array(result));
}

async function sha256(value: string) {
  const result = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(result));
}

async function timingSafeHexEqual(left: string, right: string) {
  if (
    left.length !== right.length ||
    left.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(left + right)
  )
    return false;
  const a = Uint8Array.from(left.match(/../g) ?? [], (byte) =>
      Number.parseInt(byte, 16),
    ),
    b = Uint8Array.from(right.match(/../g) ?? [], (byte) =>
      Number.parseInt(byte, 16),
    );
  let difference = 0;
  for (let index = 0; index < a.length; index += 1)
    difference |= a[index] ^ b[index];
  return difference === 0;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
