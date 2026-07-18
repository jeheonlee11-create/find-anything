export const DEMO_WORKSPACE_ID = "ws_yc_demo_acme";
export const DEMO_CONNECTOR_ID = "connector_yc_demo_acme";
export const DEMO_WORKSPACE_NAME = "Northstar · Enterprise Decision";
export const DEMO_AUTHORIZED_DISCOVERED = 5;
export const PRIMARY_DEMO_QUERY = "What is our current enterprise pricing and launch date?";
export const BACKUP_DEMO_QUERY = "enterprise pricing launch date";

export const demoFiles = [
  file("pricing-approved", "Enterprise Pricing — Approved", "sheet", "sheet_rows", { sheetTitle: "Approved pricing", range: "B4:F7" }, "Approved enterprise pricing: $120,000 annual platform fee plus a one-time $25,000 implementation fee. Finance approved this schedule on July 10, 2026. This is the authoritative pricing source.", "2026-07-10T15:00:00.000Z"),
  file("pricing-outdated", "Enterprise Pricing — Outdated Draft", "sheet", "sheet_rows", { sheetTitle: "Draft pricing", range: "B4:F7" }, "Outdated draft enterprise pricing: $95,000 annual platform fee plus a one-time $20,000 implementation fee. This version was never approved and was superseded.", "2026-05-20T15:30:00.000Z"),
  file("launch-final", "Enterprise Launch Plan — Final", "doc", "doc_paragraph", { heading: "Approved launch date", paragraphIndex: 3 }, "Final enterprise launch date: September 15, 2026. Product, security, and customer success approved this date on July 12, 2026. This final plan supersedes earlier launch drafts.", "2026-07-12T17:00:00.000Z"),
  file("launch-draft", "Enterprise Launch Plan — Draft", "doc", "doc_paragraph", { heading: "Proposed timeline", paragraphIndex: 5 }, "Draft enterprise launch date: September 1, 2026. This proposal was not approved and was superseded by the final launch plan.", "2026-06-03T14:00:00.000Z"),
];

function file(id, name, kind, unitType, location, content, modifiedAt) {
  const mime = { doc: "application/vnd.google-apps.document", sheet: "application/vnd.google-apps.spreadsheet" }[kind];
  return { id: `demo_file_${id}`, sourceId: `synthetic_${id}`, name, kind, mime, unitType, location, content, modifiedAt };
}
