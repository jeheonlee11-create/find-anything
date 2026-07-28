/**
 * Find Anything WALKTHROUGH video — timing + copy single source of truth.
 * A product walkthrough (how it works, step by step), longer and more
 * literal than the 59s brand demo. All data is SYNTHETIC (fictional
 * "Acme AI"); no real names, emails, paths, tokens, workspace IDs,
 * queries, or document contents.
 */

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Scene durations in frames (30fps). Sum defines total length (~2:35). */
export const WT_SCENES = {
  title: 180, // 0:00–0:06
  connect: 480, // 0:06–0:22  connect Google Drive (read-only, permission-scoped)
  indexing: 600, // 0:22–0:42  durable indexing with honest counts
  ask: 450, // 0:42–0:57  the agent asks a question
  conflict: 600, // 0:57–1:17  two sources disagree, both kept
  ranking: 480, // 1:17–1:33  why one governs
  coverage: 540, // 1:33–1:51  excluded source + 7/8 accounting
  evidence: 600, // 1:51–2:11  trace, replay, receipt, diff
  api: 360, // 2:11–2:23  one call for developers
  outro: 360, // 2:23–2:35  brand hold
} as const;

export type WtSceneName = keyof typeof WT_SCENES;

export const WT_ORDER: WtSceneName[] = [
  "title",
  "connect",
  "indexing",
  "ask",
  "conflict",
  "ranking",
  "coverage",
  "evidence",
  "api",
  "outro",
];

export const WT_TOTAL_FRAMES = WT_ORDER.reduce((n, s) => n + WT_SCENES[s], 0);

export function wtSceneStart(name: WtSceneName): number {
  let acc = 0;
  for (const s of WT_ORDER) {
    if (s === name) return acc;
    acc += WT_SCENES[s];
  }
  return acc;
}

export const WT_COPY = {
  brand: "Find Anything",
  tagline: "Trusted knowledge for AI agents.",

  title: {
    kicker: "PRODUCT WALKTHROUGH",
    line: "How Find Anything works",
    sub: "A permission-aware retrieval control layer — in five steps.",
  },

  connect: {
    step: "STEP 1 · CONNECT",
    title: "Connect Google Drive.",
    caption: "Read-only access, granted through Google's own consent screen. Find Anything never widens its scope.",
    url: "app.findanything.dev/workspaces/acme-ai",
    button: "Connect Google Drive",
    checks: ["Read-only scope", "Permission-aware", "Revocable anytime"],
  },

  indexing: {
    step: "STEP 2 · INDEX",
    title: "Indexing is durable and honest.",
    caption: "Counts come from the database, not a spinner. Close the tab — indexing continues on the server.",
    url: "app.findanything.dev/workspaces/acme-ai",
    stages: [
      "Connecting to Google Drive",
      "Verifying authorization",
      "Discovering files",
      "Discovery complete — 1,294 files",
      "Indexing 1,294 of 1,294 files",
    ],
    discovered: 1294,
    note: "You can close this tab. Progress is saved.",
  },

  ask: {
    step: "STEP 3 · ASK",
    title: "An agent asks a question.",
    caption: "Any agent — over the API or MCP — asks in plain language, inside the permissions it already holds.",
    url: "app.findanything.dev/workspaces/acme-ai",
    query: "What is Acme AI's current enterprise price?",
  },

  conflict: {
    step: "STEP 4 · EVIDENCE",
    title: "Two sources disagree. Both stay visible.",
    caption: "The contradiction is reported with exact figures and citations — nothing is silently resolved.",
    draft: {
      file: "Pricing Draft.pdf",
      tag: "DRAFT · v2 · updated Jun 09",
      annual: "$95,000 / year",
      impl: "$20,000 implementation",
    },
    final: {
      file: "Pricing Final.pdf",
      tag: "FINAL · v4 · updated Jul 22",
      annual: "$120,000 / year",
      impl: "$25,000 implementation",
    },
    banner: "CONFLICT DETECTED · annual_price · two values preserved",
  },

  ranking: {
    title: "One source governs — and you see why.",
    caption: "Ranking is explained from observable signals, never asserted as objective truth.",
    winner: "Pricing Final.pdf",
    reasons: ["Newer — updated after the draft", "Approved in the document's status", "Explicitly marked authoritative"],
  },

  coverage: {
    step: "STEP 5 · TRUST",
    title: "Coverage counts what it could not read.",
    caption: "A restricted Finance source is excluded — acknowledged in the count, contents never exposed.",
    known: 8,
    searched: 7,
    excludedFile: "Finance — Model.xlsx",
    excludedTag: "RESTRICTED · out of scope",
    sources: [
      "Pricing Final.pdf",
      "Pricing Draft.pdf",
      "MSA — Acme & Northwind.docx",
      "Order Form Q3.pdf",
      "Discount Policy",
      "Deal Desk Notes",
      "Renewal Terms.pdf",
    ],
  },

  evidence: {
    title: "Every answer carries its receipts.",
    caption: "Trace the ranking. Replay the exact retrieval. Diff two runs when sources change.",
    answer: "$120,000 / year + $25,000 implementation",
    confidence: "Medium",
    confidenceNote: "1 conflict reported · 1 source excluded",
    trace: [
      "Scope resolved — 8 known, 7 in permission",
      "Ranked — Final above Draft (recency + approval)",
      "Conflict — both values preserved and cited",
    ],
    tools: ["Trace", "Replay", "Receipt", "Diff"],
  },

  api: {
    title: "One call. Answer and evidence together.",
    caption: "Citations, conflicts, coverage, confidence, and a replayable receipt — as structured fields.",
    code: [
      ['{', '', ''],
      ['  "answer": ', '"Enterprise: $120,000/yr + $25,000 impl."', ','],
      ['  "confidence": ', '"medium"', ','],
      ['  "conflicts": ', '[{ "field": "annual_price" }]', ','],
      ['  "coverage": ', '{ "known": 8, "searched": 7 }', ','],
      ['  "receipt_id": ', '"rcpt_9f2a…"', ''],
      ['}', '', ''],
    ] as [string, string, string][],
  },

  outro: {
    brand: "Find Anything",
    tagline: "Trusted knowledge for AI agents.",
    footnote: "Google Drive available today · other connectors planned. Synthetic demo data — not legal or financial advice.",
  },
} as const;
