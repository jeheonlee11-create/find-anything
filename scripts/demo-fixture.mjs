export const DEMO_WORKSPACE_ID = "ws_yc_demo_acme";
export const DEMO_CONNECTOR_ID = "connector_yc_demo_acme";
export const DEMO_WORKSPACE_NAME = "Acme AI · Company Knowledge";
export const DEMO_AUTHORIZED_DISCOVERED = 7;
export const DEMO_REMOVED_OR_UNAUTHORIZED = 1;
export const PRIMARY_DEMO_QUERY = "What is our current enterprise pricing?";
export const BACKUP_DEMO_QUERY = "When are we launching?";

export const demoFiles = [
  file("pricing-final", "Pricing Final.pdf", "application/pdf", "pdf_page", { page: 2, section: "Approved enterprise pricing" }, `ACME AI — ENTERPRISE PRICING
Effective September 15, 2026

Enterprise subscription: $120,000 per year
Implementation: $25,000 one-time

Status: Approved
Owner: Finance & Revenue Operations
Approval: Executive pricing committee, July 16, 2026

This is the authoritative source for current enterprise pricing. It supersedes Pricing Draft.pdf.`, "2026-07-16T18:30:00.000Z"),
  file("pricing-draft", "Pricing Draft.pdf", "application/pdf", "pdf_page", { page: 2, section: "Draft enterprise pricing" }, `ACME AI — ENTERPRISE PRICING WORKING DRAFT

Enterprise subscription: $95,000 per year
Implementation: $20,000 one-time

Status: Draft — not approved
Owner: Revenue Operations
Last reviewed: May 20, 2026

Open question: validate implementation staffing assumptions before approval.`, "2026-05-20T15:30:00.000Z"),
  file("sales-playbook", "Sales Playbook.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "doc_paragraph", { heading: "Enterprise commercial terms", paragraphIndex: 18 }, `Enterprise commercial terms

Quote the approved enterprise subscription at $120,000 per year. Implementation is scoped separately at $25,000 one-time. Do not use working drafts in customer proposals.

Canonical source: Pricing Final.pdf
Internal link: /app/demo/source/demo_file_pricing-final
Escalation owner: Revenue Operations.`, "2026-07-17T13:15:00.000Z"),
  file("launch-final", "Launch Plan Final.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "doc_paragraph", { heading: "Approved launch milestone", paragraphIndex: 4 }, `ACME AI ENTERPRISE LAUNCH PLAN

When are we launching? September 15, 2026.
Launch date: September 15, 2026
Status: Approved
Decision date: July 15, 2026

Security review, support readiness, customer communications, and production API validation are launch gates. This final plan supersedes Launch Plan Draft.docx.`, "2026-07-15T20:00:00.000Z"),
  file("launch-draft", "Launch Plan Draft.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "doc_paragraph", { heading: "Proposed launch milestone", paragraphIndex: 4 }, `ACME AI ENTERPRISE LAUNCH PLAN — DRAFT

When are we launching? The working proposal is September 1, 2026.
Proposed launch date: September 1, 2026
Status: Draft
Last reviewed: June 3, 2026

This schedule assumes the security review closes by August 20. Customer communications and support coverage are still unconfirmed.`, "2026-06-03T14:00:00.000Z"),
  file("security-review", "Security Review.pdf", "application/pdf", "pdf_page", { page: 1, section: "Decision summary" }, `ACME AI SECURITY READINESS REVIEW

Decision: Approved
Reviewed: July 14, 2026
Scope: enterprise launch controls, OAuth token handling, access isolation, audit records, and incident readiness.

The review supports launch readiness for September 15, 2026, subject to the operating limits documented in the final launch plan.`, "2026-07-14T16:45:00.000Z"),
  file("api-version", "API Version.md", "text/markdown", "markdown_section", { heading: "Production API" }, `# Production API

Current production version: v1.8.0
Released: July 13, 2026

The v1 retrieval endpoint is stable. Version v1.8.0 adds deterministic receipt replay metadata and preserves the existing response contract.

Previous production version: v1.7.3.`, "2026-07-13T11:00:00.000Z"),
];

export const inaccessibleFinanceFile = {
  id: "demo_file_finance-forecast",
  sourceId: "synthetic_finance-forecast",
  name: "Finance / FY27 Operating Forecast.xlsx",
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  modifiedAt: "2026-07-16T17:00:00.000Z",
};

function file(id, name, mime, unitType, location, content, modifiedAt) {
  return { id: `demo_file_${id}`, sourceId: `synthetic_${id}`, name, mime, unitType, location, content, modifiedAt };
}
