export function formatStructuralLocation(unitType: string, location: Record<string, unknown>): string {
  const text = (key: string) => typeof location[key] === "string" ? location[key] as string : null;
  const number = (key: string) => typeof location[key] === "number" ? location[key] as number : null;
  if (unitType === "doc_paragraph") {
    return [text("heading"), number("paragraphIndex") !== null ? `paragraph ${number("paragraphIndex")! + 1}` : null].filter(Boolean).join(" · ") || "Google Doc paragraph";
  }
  if (unitType === "slide_element" || unitType === "slide_notes") {
    return [number("slideNumber") !== null ? `slide ${number("slideNumber")}` : null, text("elementId"), unitType === "slide_notes" ? "speaker notes" : null].filter(Boolean).join(" · ") || "Google Slides element";
  }
  if (unitType === "sheet_cell" || unitType === "sheet_rows") {
    return [text("sheetTitle"), text("range")].filter(Boolean).join(" · ") || "Google Sheets range";
  }
  if (unitType === "pdf_block") {
    return [number("pageNumber") !== null ? `page ${number("pageNumber")}` : null, text("blockId")].filter(Boolean).join(" · ") || "PDF text block";
  }
  return Object.entries(location).map(([key,value]) => `${key}: ${String(value)}`).join(" · ") || unitType.replaceAll("_", " ");
}
