import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  extractGoogleDoc,
  extractGoogleSheet,
  extractGoogleSlides,
} from "../lib/google-drive/structural.ts";
import { searchWorkspaceFiles } from "../lib/workspace-search/core.ts";
import { detectRelationships } from "../lib/lineage/core.ts";
import { formatStructuralLocation } from "../lib/workspace-search/citations.ts";
import { realisticWorkspace } from "./fixtures/realistic-workspace.mjs";
const baseFile = {
  workspaceId: "ws_a",
  connectorId: "connector_a",
  sourceId: "source",
  mimeType: "application/vnd.google-apps.document",
  modifiedAt: "2026-01-01T00:00:00Z",
  webViewLink: "https://drive.google.com/file",
  indexStatus: "indexed",
  extractionError: null,
};
function file(id, name, text) {
  return {
    ...baseFile,
    id,
    name,
    units: [
      {
        id: `unit_${id}`,
        unitType: "doc_paragraph",
        text,
        structuralLocation: {
          heading: "Evidence",
          paragraphIndex: 3,
          paragraphRange: "3-3",
        },
        contentHash: `hash_${id}`,
      },
    ],
  };
}
test("Google Doc citations preserve heading and paragraph index", async () => {
  const units = await extractGoogleDoc({
    body: {
      content: [
        {
          paragraph: {
            paragraphStyle: { namedStyleType: "HEADING_1" },
            elements: [{ textRun: { content: "Methods" } }],
          },
        },
        {
          paragraph: {
            elements: [{ textRun: { content: "Detroit evidence" } }],
          },
        },
      ],
    },
  });
  assert.equal(units[1].location.heading, "Methods");
  assert.equal(units[1].location.paragraphIndex, 1);
});
test("Google Slides citations preserve slide number and speaker notes", async () => {
  const units = await extractGoogleSlides({
    slides: [
      {
        pageElements: [
          {
            objectId: "shape",
            shape: {
              shapeType: "TEXT_BOX",
              text: {
                textElements: [{ textRun: { content: "Visible text" } }],
              },
            },
          },
        ],
        slideProperties: {
          notesPage: {
            pageElements: [
              {
                objectId: "notes",
                shape: {
                  shapeType: "TEXT_BOX",
                  text: {
                    textElements: [
                      { textRun: { content: "Speaker evidence" } },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    ],
  });
  assert.equal(units[0].location.slideNumber, 1);
  assert.equal(units[1].unitType, "slide_notes");
  assert.equal(units[1].location.elementType, "speaker_notes");
});
test("Google Sheet citations preserve sheet name, cell range, and headers", async () => {
  const units = await extractGoogleSheet({
    sheets: [
      {
        properties: { title: "Data" },
        data: [
          {
            rowData: [
              {
                values: [
                  { formattedValue: "Neighborhood" },
                  { formattedValue: "PM1" },
                ],
              },
              {
                values: [{ formattedValue: "East" }, { formattedValue: "42" }],
              },
            ],
          },
        ],
      },
    ],
  });
  const cell = units.find((unit) => unit.text === "42");
  assert.equal(cell.location.cellRange, "Data!B2");
  assert.equal(cell.location.rowHeader, "East");
  assert.equal(cell.location.columnHeader, "PM1");
});
test("search citations use stored location, hash, exact excerpt, and source URL", () => {
  const result = searchWorkspaceFiles({
      workspaceId: "ws_a",
      files: [file("one", "Report", "Detroit evidence")],
      query: "Detroit",
      mode: "best",
      fileType: "all",
    }).results[0],
    citation = result.citations[0];
  assert.equal(citation.structuralLocation.paragraphIndex, 3);
  assert.equal(citation.contentHash, "hash_one");
  assert.match(citation.excerpt, /Detroit evidence/);
  assert.match(citation.sourceUrl, /drive\.google\.com/);
});
test("literal Best Matches ranks exact title evidence before content-only evidence", () => {
  const result = searchWorkspaceFiles({
    workspaceId: "ws_a",
    files: [
      file("title", "pollution", "other"),
      file("content", "urban study", "pollution"),
    ],
    query: "pollution",
    mode: "best",
    fileType: "all",
  });
  assert.deepEqual(
    result.results.map((item) => item.id),
    ["title", "content"],
  );
  assert.ok(result.results.every((item) => item.matchType === "literal"));
});
test("realistic demo corpus exercises structural citations and incomplete coverage", () => {
  const result = searchWorkspaceFiles({
    workspaceId: "ws_demo",
    files: realisticWorkspace,
    query: "scholarship",
    mode: "all",
    fileType: "all",
  });
  assert.equal(result.totalMatches, 3);
  assert.equal(result.coverage.pendingFiles, 1);
  assert.equal(result.coverage.failedFiles, 1);
  assert.equal(result.coverage.complete, false);
  assert.match(
    formatStructuralLocation("slide_notes", {
      slideNumber: 3,
      elementId: "notes_3",
    }),
    /slide 3.*speaker notes/,
  );
  assert.match(
    formatStructuralLocation("sheet_cell", {
      sheetTitle: "Applications",
      range: "Applications!D2",
    }),
    /Applications!D2/,
  );
});
test("active sync and search routes contain no embedding or OpenAI calls", async () => {
  const paths = [
    "../lib/google-drive/sync.ts",
    "../app/api/workspaces/[workspaceId]/search/route.ts",
    "../app/v1/search/route.ts",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /semanticScoresForWorkspace|indexUnitEmbeddings|api\.openai\.com/,
    );
  }
});
test("lineage detects exact, near/version/final, conflict signals, and corrections are represented", () => {
  const relationships = detectRelationships([
    {
      id: "a",
      name: "Report draft",
      modifiedAt: "2025-01-01",
      contentHashes: ["same"],
      text: "Revenue 10 pollution Detroit evidence",
    },
    {
      id: "b",
      name: "Report final",
      modifiedAt: "2025-02-01",
      contentHashes: ["same"],
      text: "Revenue 12 pollution Detroit evidence",
    },
  ]);
  assert.ok(
    relationships.some((item) => item.relationshipType === "exact_duplicate"),
  );
  assert.ok(
    relationships.some((item) => item.relationshipType === "earlier_version"),
  );
  assert.ok(
    relationships.some(
      (item) => item.relationshipType === "likely_final_version",
    ),
  );
  assert.ok(
    relationships.some(
      (item) => item.relationshipType === "conflicting_numeric_values",
    ),
  );
  assert.ok(
    relationships.every((item) => item.userCorrectable && item.inferred),
  );
});
test("every workspace search persists exactly one trace and receipt with exports and isolation", async () => {
  const [route, audit, receipt, trace, migration] = await Promise.all([
    readFile(
      new URL(
        "../app/api/workspaces/[workspaceId]/search/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../lib/workspace-search/audit.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/search-receipts/[receiptId]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/retrieval-traces/[traceId]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/0001_fast_ma_gnuci.sql", import.meta.url),
      "utf8",
    ),
  ]);
  assert.equal((route.match(/persistSearchAudit/g) ?? []).length, 2);
  assert.equal((audit.match(/insert\(retrievalTraces\)/g) ?? []).length, 1);
  assert.equal((audit.match(/insert\(searchReceipts\)/g) ?? []).length, 1);
  assert.match(audit, /totalMatches:\s*input\.response\.totalMatches/);
  assert.match(audit, /citationsJson:\s*JSON\.stringify\(citations\)/);
  assert.match(audit, /indexSnapshotHash/);
  assert.match(audit, /resultSetHash/);
  assert.match(audit, /correlationId/);
  assert.match(audit, /actorId/);
  assert.match(receipt, /format==="csv"/);
  assert.match(receipt, /format==="json"/);
  assert.match(trace, /traceForActor/);
  assert.match(migration, /UNIQUE INDEX `retrieval_traces_search_idx`/);
});
test("developer API and MCP require scoped API keys and expose every requested tool", async () => {
  const [auth, v1, mcp] = await Promise.all([
    readFile(new URL("../lib/api/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/v1/search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mcp/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /Bearer/);
  assert.match(auth, /keyHash/);
  assert.match(auth, /RATE_LIMITED/);
  assert.match(v1, /WORKSPACE_FORBIDDEN/);
  for (const tool of [
    "search_files",
    "find_all_files",
    "get_exact_evidence",
    "get_search_coverage",
    "get_retrieval_trace",
    "get_search_receipt",
    "get_file_relationships",
  ])
    assert.match(mcp, new RegExp(tool));
});
