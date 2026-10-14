import { z } from "zod";
import type { AstraTool, AstraToolContext } from "../types";
import { ATTACHMENTS_PACK } from "../packs";
import { READ_ATTACHMENT_SECTION_TOOL, SEARCH_ATTACHMENT_TOOL } from "../../attachment-tool-defs";

/**
 * The parts of a file attached to this conversation that were not shown in
 * the message (server/attachment-sections.ts). Only this thread's files, in
 * this organization: the same rule that stamped them onto the thread.
 */
async function threadFiles(ctx: AstraToolContext) {
  const { threadAttachments } = await import("../attachments");
  const { readAttachedFiles } = await import("../../attachment-context");
  const ids = (await threadAttachments(ctx.threadId, ctx.orgId)).map((r) => r.id);
  return ids.length ? readAttachedFiles(ids, ctx.orgId) : [];
}

export const searchAttachmentTool: AstraTool<{ query: string; file?: string; limit?: number }> = {
  name: SEARCH_ATTACHMENT_TOOL,
  description:
    "Search the full text of the files attached to this conversation, including the parts of a large file not shown in the message, and return the matching sections with their page, sheet/row or line position.",
  input: z.object({
    query: z.string().min(1).max(500).describe("Words, a phrase or an identifier to find."),
    file: z.string().max(300).optional().describe("The attached file's name; omit to search every attached file."),
    limit: z.number().int().min(1).max(25).optional().describe("Most results to return (default 8)."),
  }),
  pack: ATTACHMENTS_PACK,
  confirm: false,
  run: async (ctx, input) => {
    const files = await threadFiles(ctx);
    if (files.length === 0) return { payload: { ok: false, error: "No files are attached to this conversation." } };
    const { searchAttachments } = await import("../../attachment-sections");
    return { payload: await searchAttachments(files, input) };
  },
};

export const readAttachmentSectionTool: AstraTool<{ file?: string; section?: number; count?: number; page?: number; slide?: number; sheet?: string; row?: number }> = {
  name: READ_ATTACHMENT_SECTION_TOOL,
  description:
    "Read sections of a file attached to this conversation in full: by section number (from the file's map or search results), PDF page, slide, or sheet and row.",
  input: z.object({
    file: z.string().max(300).optional().describe("The attached file's name (optional when only one file is attached)."),
    section: z.number().int().min(1).optional().describe("Section number to start at (1 = first)."),
    count: z.number().int().min(1).max(200).optional().describe("How many consecutive sections to read (default 1)."),
    page: z.number().int().min(1).optional().describe("Start at this PDF page."),
    slide: z.number().int().min(1).optional().describe("Start at this slide."),
    sheet: z.string().max(200).optional().describe("With row: the sheet the row is in."),
    row: z.number().int().min(1).optional().describe("Start at this spreadsheet/CSV row number (header is row 1)."),
  }),
  pack: ATTACHMENTS_PACK,
  confirm: false,
  run: async (ctx, input) => {
    const files = await threadFiles(ctx);
    if (files.length === 0) return { payload: { ok: false, error: "No files are attached to this conversation." } };
    const { readAttachmentSections } = await import("../../attachment-sections");
    return { payload: await readAttachmentSections(files, input) };
  },
};

export const ATTACHMENT_TOOLS: AstraTool[] = [searchAttachmentTool, readAttachmentSectionTool];
