import assert from "node:assert/strict";
import test from "node:test";
import { exportGoogleFile, fetchStructuredGoogleFile, readBoundedBody, SHEETS_GRID_FIELDS } from "../lib/google-drive/client.ts";
import {
  extractionWeight,
  MAX_IN_FLIGHT_EXTRACTION_BYTES,
  MAX_NATIVE_EXPORT_BYTES,
  OVERSIZED_FILE_ERROR_CODE,
} from "../lib/google-drive/sync-lifecycle.ts";

function streamOf(chunks, headers = {}) {
  let index = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(new Uint8Array(chunks[index++]));
      else controller.close();
    },
  });
  return new Response(body, { headers });
}

async function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("a body under the cap is read whole", async () => {
  const body = await readBoundedBody(streamOf([10, 20, 30]), 1000);
  assert.equal(body.byteLength, 60);
});

test("a declared Content-Length over the cap is refused before reading", async () => {
  await assert.rejects(readBoundedBody(new Response("x".repeat(10), { headers: { "content-length": "5000" } }), 100), new RegExp(OVERSIZED_FILE_ERROR_CODE));
});

test("a streamed body is cut off as soon as it passes the cap", async () => {
  let pulled = 0;
  const body = new ReadableStream({
    pull(controller) {
      pulled += 1;
      controller.enqueue(new Uint8Array(64));
    },
  });
  await assert.rejects(readBoundedBody(new Response(body), 200), new RegExp(OVERSIZED_FILE_ERROR_CODE));
  assert.ok(pulled <= 5, `read ${pulled} chunks of an endless body`);
});

test("Google-native files reserve their export cap in the extraction pool, not 0 bytes", () => {
  assert.equal(extractionWeight({ mimeType: "application/vnd.google-apps.spreadsheet" }), MAX_NATIVE_EXPORT_BYTES);
  assert.equal(extractionWeight({ mimeType: "application/vnd.google-apps.document", size: undefined }), MAX_NATIVE_EXPORT_BYTES);
  assert.equal(extractionWeight({ mimeType: "application/pdf", size: "1234" }), 1234);
  // At most this many native exports are in flight at once.
  assert.equal(Math.floor(MAX_IN_FLIGHT_EXTRACTION_BYTES / MAX_NATIVE_EXPORT_BYTES), 8);
});

test("Sheets are fetched with a field mask, and an oversized export throws the oversized code", async () => {
  const requested = [];
  const sheet = { id: "s1", name: "Big", mimeType: "application/vnd.google-apps.spreadsheet", modifiedTime: "2026-01-01T00:00:00Z" };
  await withFetch(async (url) => {
    requested.push(String(url));
    return new Response(JSON.stringify({ sheets: [] }));
  }, () => fetchStructuredGoogleFile("token", sheet));
  assert.equal(new URL(requested[0]).searchParams.get("fields"), SHEETS_GRID_FIELDS);
  await withFetch(
    async () => new Response("x", { headers: { "content-length": String(MAX_NATIVE_EXPORT_BYTES + 1) } }),
    () => assert.rejects(exportGoogleFile("token", sheet), new RegExp(OVERSIZED_FILE_ERROR_CODE)),
  );
});
