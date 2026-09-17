/**
 * Find Anything — 45s cinematic promo. Single source of truth for timing,
 * palette, and copy. All figures are the project's standard SYNTHETIC Acme AI
 * pricing conflict; nothing here is a real measurement or a real customer.
 */

export const PROMO_FPS = 30;
export const PROMO_WIDTH = 1920;
export const PROMO_HEIGHT = 1080;

/** Scene lengths in frames (30fps). 240+420+390+300 = 1350 = 45s. */
export const PROMO_SCENES = {
  hook: 240, // 0–8s   kinetic question + floating conflict
  reveal: 420, // 8–22s  isometric workspace, camera swoop, cursor click
  resolution: 390, // 22–35s resolution, receipt, coverage meter
  outro: 300, // 35–45s hero card + CTA
} as const;

export const PROMO_TOTAL_FRAMES =
  PROMO_SCENES.hook +
  PROMO_SCENES.reveal +
  PROMO_SCENES.resolution +
  PROMO_SCENES.outro;

/** Moody slate/violet system — deliberately distinct from the product UI. */
export const P = {
  // Ground
  bg: "#07080f",
  bgDeep: "#0b0d1a",
  slate: "#10131f",
  // Ambient glows
  violet: "#7c5cff",
  violetDeep: "#4630b8",
  cyan: "#4cc9f0",
  // Ink
  ink: "#f4f2ec",
  muted: "#9a9ab0",
  faint: "#5f5f78",
  // Semantics
  green: "#4ade80",
  amber: "#f4b860",
  red: "#f4645c",
  // Glass
  glass: "rgba(255,255,255,0.055)",
  glassStrong: "rgba(255,255,255,0.09)",
  glassBorder: "rgba(255,255,255,0.15)",
  glassBorderSoft: "rgba(255,255,255,0.08)",
  mono: "'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
  sans: "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif",
} as const;

export const PROMO_COPY = {
  hookA: "Your AI agent finds",
  hookB: "two conflicting answers.",
  hookC: "Which one does it trust?",
  draft: { file: "Pricing Draft.pdf", tag: "DRAFT · OLDER", price: "$95,000/yr" },
  final: { file: "Pricing Final.pdf", tag: "APPROVED · AUTHORITATIVE", price: "$120,000/yr" },
  workspaceTitle: "Find Anything — Workspace",
  traceButton: "Trace & Compare",
  resolutionTitle: "Evidence, not vibes.",
  receipt: {
    title: "Deterministic audit receipt",
    rows: [
      ["Winner", "Pricing Final.pdf — newer · approved · authoritative"],
      ["Kept visible", "Pricing Draft.pdf — cited, not hidden"],
      ["Excluded", "Finance — Model.xlsx · restricted · contents never read"],
    ],
  },
  coverage: { searched: 7, known: 8, label: "sources accounted for" },
  outroTagline: "Deterministic Retrieval Evidence for Enterprise Agents",
  outroCta: "findanything.dev",
  footnote: "Synthetic demonstration data. Not a customer workspace.",
} as const;
