const DOC = "application/vnd.google-apps.document";
const SLIDES = "application/vnd.google-apps.presentation";
const SHEETS = "application/vnd.google-apps.spreadsheet";

function record(id, name, mimeType, units, overrides = {}) {
  return {
    id,
    workspaceId: "ws_demo",
    connectorId: "connector_demo",
    sourceId: `drive_${id}`,
    name,
    mimeType,
    modifiedAt: "2026-06-15T12:00:00.000Z",
    webViewLink: `https://drive.google.com/open?id=drive_${id}`,
    indexStatus: "indexed",
    extractionError: null,
    extractionMode: "structured",
    structuralFallbackReason: null,
    units: units.map((unit, index) => ({
      id: `unit_${id}_${index}`,
      contentHash: `sha256_demo_${id}_${index}`,
      ...unit,
    })),
    ...overrides,
  };
}

export const realisticWorkspace = [
  record("research_brief", "Urban Air Quality Research Brief", DOC, [
    {
      unitType: "doc_paragraph",
      text: "Princeton and JHU scholarship programs support community air-quality research.",
      structuralLocation: { heading: "Funding landscape", paragraphIndex: 4 },
    },
    {
      unitType: "doc_paragraph",
      text: "Stanford collaborators will review the field protocol.",
      structuralLocation: { heading: "Partners", paragraphIndex: 8 },
    },
  ]),
  record("project_deck", "Community Research Presentation", SLIDES, [
    {
      unitType: "slide_element",
      text: "Scholarship outreach milestones",
      structuralLocation: { slideNumber: 3, elementId: "title_3" },
    },
    {
      unitType: "slide_notes",
      text: "Mention the Princeton application deadline.",
      structuralLocation: { slideNumber: 3, elementId: "notes_3" },
    },
  ]),
  record("award_tracker", "Scholarship Application Spreadsheet", SHEETS, [
    {
      unitType: "sheet_cell",
      text: "JHU",
      structuralLocation: {
        sheetTitle: "Applications",
        range: "Applications!A2",
        rowHeader: "JHU",
        columnHeader: "School",
      },
    },
    {
      unitType: "sheet_cell",
      text: "Submitted",
      structuralLocation: {
        sheetTitle: "Applications",
        range: "Applications!D2",
        rowHeader: "JHU",
        columnHeader: "Status",
      },
    },
  ]),
  record(
    "field_report",
    "Field Sampling Report.pdf",
    "application/pdf",
    [
      {
        unitType: "pdf_block",
        text: "The presentation appendix summarizes calibration results.",
        structuralLocation: { pageNumber: 12, blockId: "p12-b2" },
      },
    ],
    {
      extractionMode: "fallback",
      structuralFallbackReason: "PDF_LAYOUT_FALLBACK",
    },
  ),
  record("pending", "Pending interview notes", DOC, [], {
    indexStatus: "pending",
  }),
  record("failed", "Failed scan.pdf", "application/pdf", [], {
    indexStatus: "failed",
    extractionError: "PDF_TEXT_UNAVAILABLE",
  }),
];
