/**
 * Find Anything demo video — single source of truth for timing and copy.
 * Everything on screen and every scene length is driven from here, so the
 * video can be re-timed or re-worded without touching scene code.
 *
 * All data is SYNTHETIC (fictional "Acme AI"). No real names, emails, paths,
 * tokens, workspace IDs, queries, or document contents.
 */

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Scene durations in frames (30fps). Sum defines the total video length. */
export const SCENES = {
  hook: 210, // 0–7s
  draft: 210, // 7–14s
  final: 210, // 14–21s
  bothVisible: 180, // 21–27s
  ranking: 240, // 27–35s
  excluded: 180, // 35–41s
  coverage: 180, // 41–47s
  evidence: 240, // 47–55s
  outro: 120, // 55–59s
} as const;

export type SceneName = keyof typeof SCENES;

export const SCENE_ORDER: SceneName[] = [
  "hook",
  "draft",
  "final",
  "bothVisible",
  "ranking",
  "excluded",
  "coverage",
  "evidence",
  "outro",
];

/** Cross-fade length between scenes (frames). */
export const TRANSITION = 14;

export const TOTAL_FRAMES = SCENE_ORDER.reduce((n, s) => n + SCENES[s], 0);

/** Cumulative start frame for each scene. */
export function sceneStart(name: SceneName): number {
  let acc = 0;
  for (const s of SCENE_ORDER) {
    if (s === name) return acc;
    acc += SCENES[s];
  }
  return acc;
}

/** Copy — synthetic Acme AI pricing conflict. */
export const COPY = {
  brand: "Find Anything",
  tagline: "Trusted knowledge for AI agents.",

  hook: {
    kicker: "AN AI AGENT ASKS",
    line: "“What is Acme AI's current enterprise price?”",
    sub: "The agent finds two documents. They disagree.",
  },

  draft: {
    file: "Pricing Draft.pdf",
    tag: "DRAFT · v2 · updated Jun 09",
    annual: "$95,000 / year",
    impl: "$20,000 implementation",
    caption: "One document is an early draft.",
  },

  final: {
    file: "Pricing Final.pdf",
    tag: "FINAL · v4 · updated Jul 22",
    annual: "$120,000 / year",
    impl: "$25,000 implementation",
    caption: "The other is the approved final.",
  },

  bothVisible: {
    title: "Both stay visible.",
    sub: "Nothing is hidden. The contradiction is reported, with exact figures and citations.",
  },

  ranking: {
    title: "One source governs.",
    sub: "Pricing Final ranks higher — and Find Anything shows why:",
    reasons: ["Newer than the draft", "Approved in its status", "Explicitly marked authoritative"],
    winner: "Pricing Final.pdf",
  },

  excluded: {
    title: "One source can't be read.",
    sub: "A restricted Finance model is outside the agent's permission scope. It is excluded — its contents are never exposed.",
    file: "Finance — Model.xlsx",
    tag: "RESTRICTED · out of scope",
  },

  coverage: {
    title: "Coverage is accounted for.",
    known: 8,
    searched: 7,
    excluded: 1,
    sub: "8 sources known · 7 accessible and searched · 1 unavailable and excluded.",
  },

  evidence: {
    title: "Every answer carries its evidence.",
    answer: "$120,000 / year + $25,000 implementation",
    features: ["Citations", "Source links", "Confidence", "Coverage", "Trace", "Replay", "Receipt", "Diff"],
    confidence: "Medium",
    confidenceNote: "1 conflict resolved · 1 source excluded",
  },

  outro: {
    brand: "Find Anything",
    tagline: "Trusted knowledge for AI agents.",
    footnote: "Retrieval evidence — not factual, legal, or financial advice. Synthetic demo data.",
  },
} as const;
