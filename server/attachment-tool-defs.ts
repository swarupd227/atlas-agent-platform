/**
 * Names and input schemas of the attachment tools, with no imports, so the
 * dispatcher and Astra can name them without loading the document readers.
 * The tools themselves are in server/attachment-sections.ts.
 */
export const BUILTIN_ATTACHMENT_SERVER_ID = "builtin:attachments";
export const SEARCH_ATTACHMENT_TOOL = "search_attachment";
export const READ_ATTACHMENT_SECTION_TOOL = "read_attachment_section";

export const ATTACHMENT_TOOL_GUIDE =
  `Use ${SEARCH_ATTACHMENT_TOOL} (words or an identifier to look for) to find the sections of an attached file that mention something, ` +
  `and ${READ_ATTACHMENT_SECTION_TOOL} (a section number, page, or sheet and row) to read any part in full.`;

export const SEARCH_ATTACHMENT_SCHEMA = {
  type: "object",
  properties: {
    query: { type: "string", description: "Words, a phrase or an identifier to find in the attached file(s)." },
    file: { type: "string", description: "The attached file's name; omit to search every attached file." },
    limit: { type: "number", description: "Most results to return (default 8, max 25)." },
  },
  required: ["query"],
};

export const READ_ATTACHMENT_SECTION_SCHEMA = {
  type: "object",
  properties: {
    file: { type: "string", description: "The attached file's name (optional when only one file is attached)." },
    section: { type: "number", description: "Section number to start at (1 = first), as shown in the file's map or search results." },
    count: { type: "number", description: "How many consecutive sections to read (default 1)." },
    page: { type: "number", description: "Start at this PDF page instead of a section number." },
    slide: { type: "number", description: "Start at this slide instead of a section number." },
    sheet: { type: "string", description: "With row: the sheet the row is in." },
    row: { type: "number", description: "Start at this spreadsheet/CSV row number (as in the sheet, header is row 1)." },
  },
};
