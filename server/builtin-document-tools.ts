/**
 * The agent-facing half of provider-agnostic document generation.
 *
 * These are real tools on the ordinary tool surface, so they go through
 * dispatchToolCall like everything else and inherit the skill allowlist, policy
 * bundle, AAR gate, rate limit, shadow mode, idempotency and audit trail. They
 * are dispatched in-process (server/tool-dispatcher.ts's executeTool) rather
 * than over MCP -- there is no server to call, the bytes are rendered here.
 *
 * They are offered only to an agent that already has the document skill
 * attached, so no existing agent's tool surface changes. Crucially the gate is
 * the SKILL, not the model: the same three GPT agents the client had already
 * configured start working with no reconfiguration.
 */

import { z } from "zod";
import type { AvailableTool } from "./tool-dispatcher";
import type { Skill } from "@shared/schema";
import { storage } from "./storage";
import {
  DOCUMENT_FORMATS,
  documentSpecSchema,
  slugifyFilename,
  type DocumentFormat,
} from "./document-renderer";
import { fillPptxTemplate, templateFillSpecSchema } from "./document-template-fill";
import type { TemplateFillReport } from "./document-template-fill";
import { describePptx, inspectPptx } from "./document-inspect";
import { db } from "./db";
import { agentGeneratedFiles, uploadedFiles } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";

/** Synthetic server identity; `serverId` is what executeTool routes on. */
export const BUILTIN_DOCUMENT_SERVER_ID = "builtin:document";
const BUILTIN_DOCUMENT_SERVER_NAME = "Document Generation";

export const GENERATE_PPTX_TOOL = "generate_pptx";
export const GENERATE_PDF_TOOL = "generate_pdf";
export const FILL_TEMPLATE_TOOL = "fill_document_template";
export const INSPECT_DOCUMENT_TOOL = "inspect_document";

/**
 * Marker the engines look for on a tool result to fold the new file into the
 * run's generatedFiles, the same list Anthropic-produced files land in.
 *
 * ENGINE-INTERNAL ONLY. Every call site must read it and then strip it with
 * stripGeneratedFileMarker() before the result reaches the model -- it
 * carries the raw file id, and a model handed an id with no link will
 * happily invent one ("sandbox:/<id>") rather than leave it alone. Verified
 * live: the message field alone ("do not include a link...") was not
 * sufficient to stop this once the id was sitting right there in the JSON.
 */
export const GENERATED_FILE_MARKER = "__generatedFile";

/** Strips GENERATED_FILE_MARKER from a tool result before it becomes the
 *  content of a "tool" role message -- i.e. before the model reads it back. */
export function stripGeneratedFileMarker(result: unknown): unknown {
  if (!result || typeof result !== "object" || Array.isArray(result) || !(GENERATED_FILE_MARKER in (result as any))) {
    return result;
  }
  const { [GENERATED_FILE_MARKER]: _omit, ...rest } = result as Record<string, unknown>;
  return rest;
}

const SPEC_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Document title, shown on the title slide/page." },
    subtitle: { type: "string", description: "Optional one-line subtitle." },
    author: { type: "string", description: "Optional author or team name." },
    sections: {
      type: "array",
      description: "One entry per slide (pptx) or per section (pdf), in order.",
      items: {
        type: "object",
        properties: {
          heading: { type: "string", description: "Slide/section heading." },
          body: { type: "string", description: "Optional paragraph of prose." },
          bullets: { type: "array", items: { type: "string" }, description: "Optional bullet points." },
          notes: { type: "string", description: "Optional speaker notes (pptx only)." },
        },
        required: ["heading"],
      },
    },
  },
  required: ["title", "sections"],
} as const;

const TEMPLATE_FILL_JSON_SCHEMA = {
  type: "object",
  properties: {
    templateFilename: {
      type: "string",
      description: "Filename of the template to fill, as shown in the template's description (e.g. the brand asset you were given).",
    },
    templateFileId: { type: "string", description: "Id of the template file, if known. Either this or templateFilename." },
    outputTitle: { type: "string", description: "Title for the produced file." },
    footer: { type: "string", description: "Optional text for every slide's footer placeholder." },
    slides: {
      type: "array",
      description: "One entry per template slide you are filling or dropping, addressed by the template's own slide numbers.",
      items: {
        type: "object",
        properties: {
          slide: { type: "number", description: "1-based slide number in the template." },
          drop: { type: "boolean", description: "Remove this slide from the output." },
          shapes: {
            type: "array",
            description: "Text replacements for this slide's shapes.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Shape name as it appears in the template." },
                was: { type: "string", description: "Start of the shape's current text; only needed when shapes share a name." },
                text: {
                  type: "string",
                  description: "Replacement text; use a newline to separate paragraphs and **double asterisks** for bold.",
                },
              },
              required: ["name", "text"],
            },
          },
          table: {
            type: "object",
            description: "Cell text for a table on this slide. Row and column counts stay as the template has them.",
            properties: {
              name: { type: "string" },
              rows: { type: "array", items: { type: "array", items: { type: "string" } } },
            },
            required: ["rows"],
          },
          notes: { type: "string", description: "Speaker notes for this slide." },
        },
        required: ["slide"],
      },
    },
  },
  required: ["outputTitle", "slides"],
} as const;

const INSPECT_JSON_SCHEMA = {
  type: "object",
  properties: {
    documentFileId: { type: "string", description: "Id of the deck to inspect, e.g. as listed under UPSTREAM DELIVERABLES." },
    documentFilename: {
      type: "string",
      description: "Filename of the deck to inspect when its id is not known; the most recent file with that name is used.",
    },
    templateFilename: {
      type: "string",
      description: "The template the deck was filled from; enables the comparison checks. Given alone, the template itself is described.",
    },
    templateFileId: { type: "string", description: "Id of the template, if known. Either this or templateFilename." },
  },
} as const;

function toolDef(toolName: string, format: DocumentFormat, description: string): AvailableTool {
  return {
    serverId: BUILTIN_DOCUMENT_SERVER_ID,
    serverName: BUILTIN_DOCUMENT_SERVER_NAME,
    serverUrl: "",
    toolName,
    toolDescription: description,
    toolInputSchema: SPEC_JSON_SCHEMA,
  };
}

/**
 * True when this skill grants document generation. Matches the "PDF & PPTX
 * Generator" skill already attached to the client's agents -- reusing the
 * existing attachment rather than requiring every agent to be reconfigured.
 */
export function skillGrantsDocumentGeneration(skill: Skill): boolean {
  if (skill.status !== "active") return false;
  const ids = (skill.anthropicSkillIds ?? []).map((s) => s.toLowerCase());
  return ids.includes("pptx") || ids.includes("pdf");
}

/**
 * Which route an agent takes to produce a document. Mirrors
 * agents.documentGenerationMode; anything unrecognised (including null on rows
 * predating the column) means "auto", the behaviour that existed before.
 */
export type DocumentGenerationMode = "auto" | "platform" | "sandbox";

export function resolveDocumentMode(raw: string | null | undefined): DocumentGenerationMode {
  return raw === "platform" || raw === "sandbox" ? raw : "auto";
}

/** The built-in document tools this agent's skills grant; empty for everyone else. */
export function documentToolsForSkills(skills: Skill[], mode: DocumentGenerationMode = "auto"): AvailableTool[] {
  // Sandbox-only agents must not see the portable tools, or the model will
  // reach for the cheaper one and the setting becomes advisory.
  if (mode === "sandbox") return [];
  if (!skills.some(skillGrantsDocumentGeneration)) return [];
  return [
    toolDef(
      GENERATE_PPTX_TOOL,
      "pptx",
      "Generate a real PowerPoint (.pptx) file from a structured outline and attach it to this run. " +
        "Use this whenever the user asks for a deck, slides or a presentation. Supply the full content; " +
        "the file is rendered and returned to the user, so do not also paste the outline into your reply.",
    ),
    toolDef(
      GENERATE_PDF_TOOL,
      "pdf",
      "Generate a real PDF (.pdf) file from a structured outline and attach it to this run. " +
        "Use this whenever the user asks for a PDF, report or document. Supply the full content; " +
        "the file is rendered and returned to the user, so do not also paste the outline into your reply.",
    ),
    {
      serverId: BUILTIN_DOCUMENT_SERVER_ID,
      serverName: BUILTIN_DOCUMENT_SERVER_NAME,
      serverUrl: "",
      toolName: FILL_TEMPLATE_TOOL,
      toolDescription:
        "Fill an EXISTING PowerPoint template with new text and attach the result to this run. " +
        "Use this instead of generate_pptx whenever a template or branded master is available and the deck " +
        "should keep that design: every picture, diagram, layout, colour and font stays exactly as the template " +
        "has it, and only the text of the shapes you name changes. Address slides by the template's own slide " +
        "numbers and shapes by the template's own shape names. The result reports any shape that did not match, " +
        "so check that report rather than assuming the fill worked.",
      toolInputSchema: TEMPLATE_FILL_JSON_SCHEMA,
    },
    {
      serverId: BUILTIN_DOCUMENT_SERVER_ID,
      serverName: BUILTIN_DOCUMENT_SERVER_NAME,
      serverUrl: "",
      toolName: INSPECT_DOCUMENT_TOOL,
      toolDescription:
        "Inspect a PowerPoint deck and get the facts back in one call -- no sandbox, no code. Two uses. " +
        "(1) Review a produced deck: pass documentFileId (or documentFilename) and, when it was filled from a template, " +
        "templateFilename. Returns whether every part is well-formed, package problems, and per slide: structure versus " +
        "the template slide, text still identical to the template, text needing more room than the template's own text " +
        "had (overflow, after any shrink-to-fit), shapes shrunk to fit, empty placeholders, prompt text, open markers, " +
        "notes and footers. (2) Describe a template before writing for it: pass only templateFilename to get every " +
        "slide's text shapes with their current text and maxChars, the text that fits there. Judge from these facts.",
      toolInputSchema: INSPECT_JSON_SCHEMA,
    },
  ];
}

export function isBuiltinDocumentTool(tool: AvailableTool): boolean {
  return tool.serverId === BUILTIN_DOCUMENT_SERVER_ID;
}

/**
 * Renders the document and persists it. Returns the tool result the model sees,
 * carrying GENERATED_FILE_MARKER so the calling engine can surface a download.
 */
export async function executeBuiltinDocumentTool(
  toolName: string,
  args: Record<string, any>,
  ctx: { orgId?: string | null; agentId?: string; workspaceRunId?: string; traceId?: string },
): Promise<any> {
  // Inspection reads documents and produces none, so it needs no agent to attribute a file to.
  if (toolName === INSPECT_DOCUMENT_TOOL) return executeInspect(args, ctx);
  if (!ctx.agentId) throw new Error(`No agent context to generate a document for "${toolName}"`);
  if (toolName === FILL_TEMPLATE_TOOL) return executeTemplateFill(args, ctx);

  const format: DocumentFormat | null =
    toolName === GENERATE_PPTX_TOOL ? "pptx" : toolName === GENERATE_PDF_TOOL ? "pdf" : null;
  if (!format) throw new Error(`Unknown document tool "${toolName}"`);

  const parsed = documentSpecSchema.safeParse(args);
  if (!parsed.success) {
    // Returned, not thrown: the model can read this and retry with a valid spec,
    // which is a better outcome than failing the whole run.
    return {
      ok: false,
      error: "Invalid document spec.",
      details: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }

  const spec = parsed.data;
  const { render, extension, mimeType } = DOCUMENT_FORMATS[format];
  const content = await render(spec);
  const filename = `${slugifyFilename(spec.title, format === "pptx" ? "presentation" : "document")}.${extension}`;

  const row = await storage.createAgentGeneratedFile({
    organizationId: ctx.orgId ?? null,
    agentId: ctx.agentId,
    workspaceRunId: ctx.workspaceRunId ?? null,
    traceId: ctx.traceId ?? null,
    filename,
    mimeType,
    sizeBytes: content.length,
    source: "platform",
    anthropicFileId: null,
    content,
  } as any);

  // Deliberately no URL in the model-visible result. The run surfaces the file
  // as a download card of its own, and given a path a model will helpfully
  // render it as a link -- gpt-4o emitted "sandbox:/api/agent-files/..." , a
  // dead link the user would click first. The id travels on the marker instead,
  // which the engines read and the model never sees.
  return {
    ok: true,
    filename,
    mimeType,
    sizeBytes: content.length,
    sections: spec.sections.length,
    message:
      `Generated ${filename} (${spec.sections.length} ${format === "pptx" ? "slides" : "sections"}). ` +
      `It is already attached to this run and shown to the user as a download. ` +
      `Do not include a link, URL or file path in your reply, and do not repeat the document's contents.`,
    [GENERATED_FILE_MARKER]: { id: row.id, filename: row.filename, mimeType: row.mimeType },
  };
}


const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * Resolve the template the caller named. Files are looked up inside the
 * caller's own organisation only, and by id or filename -- an agent knows the
 * template by the name it was given, not by an id it never sees.
 */
async function loadTemplateBytes(
  spec: { templateFileId?: string; templateFilename?: string },
  orgId?: string | null,
): Promise<{ content: Buffer; filename: string } | { error: string }> {
  const scope = (extra: any) => (orgId ? and(extra, eq(uploadedFiles.organizationId, orgId)) : extra);

  const rows = spec.templateFileId
    ? await db.select().from(uploadedFiles).where(scope(eq(uploadedFiles.id, spec.templateFileId)))
    : spec.templateFilename
      ? await db
          .select()
          .from(uploadedFiles)
          .where(scope(eq(uploadedFiles.filename, spec.templateFilename)))
          .orderBy(desc(uploadedFiles.createdAt))
          .limit(1)
      : [];

  const row = rows[0];
  if (!row) {
    return {
      error: spec.templateFileId || spec.templateFilename
        ? `No template file found matching ${spec.templateFileId ?? spec.templateFilename}.`
        : "Supply templateFilename (or templateFileId) naming the template to fill.",
    };
  }
  if (!row.content) return { error: `Template "${row.filename}" has no stored bytes to fill.` };
  return { content: Buffer.from(row.content as any), filename: row.filename };
}

/** Fills a stored template and persists the result, same as the generators do. */
async function executeTemplateFill(
  args: Record<string, any>,
  ctx: { orgId?: string | null; agentId?: string; workspaceRunId?: string; traceId?: string },
): Promise<any> {
  const parsed = templateFillSpecSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid template fill spec.",
      details: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const spec = parsed.data;

  const loaded = await loadTemplateBytes(spec, ctx.orgId);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  let filled: Awaited<ReturnType<typeof fillPptxTemplate>>;
  try {
    filled = await fillPptxTemplate(loaded.content, spec);
  } catch (err: any) {
    // Returned rather than thrown: a malformed template is something the model
    // can report to the user, and failing the whole run helps nobody.
    return { ok: false, error: `Could not fill template "${loaded.filename}": ${err?.message ?? err}` };
  }

  const filename = `${slugifyFilename(spec.outputTitle, "presentation")}.pptx`;
  const row = await storage.createAgentGeneratedFile({
    organizationId: ctx.orgId ?? null,
    agentId: ctx.agentId!,
    workspaceRunId: ctx.workspaceRunId ?? null,
    traceId: ctx.traceId ?? null,
    filename,
    mimeType: PPTX_MIME,
    sizeBytes: filled.content.length,
    source: "platform",
    anthropicFileId: null,
    content: filled.content,
  } as any);

  const { report } = filled;
  return {
    ok: true,
    filename,
    mimeType: PPTX_MIME,
    sizeBytes: filled.content.length,
    template: loaded.filename,
    slidesInOutput: report.slidesInOutput,
    slidesDropped: report.slidesDropped,
    shapesFilled: report.shapesFilled,
    tablesFilled: report.tablesFilled,
    notesWritten: report.notesWritten,
    unmatched: report.unmatched,
    overflow: report.overflow,
    message:
      `Filled ${loaded.filename} into ${filename}: ${report.shapesFilled} shape(s), ` +
      `${report.tablesFilled} table(s), ${report.notesWritten} note(s), ${report.slidesInOutput} slide(s)` +
      (report.unmatched.length > 0
        ? `. ${report.unmatched.length} shape(s) did not match the template and were NOT filled -- report these.`
        : ", every named shape matched.") +
      overflowNote(report.overflow) +
      ` The file is attached to this run and shown to the user as a download. Do not include a link, URL or file path in your reply.`,
    [GENERATED_FILE_MARKER]: { id: row.id, filename: row.filename, mimeType: row.mimeType },
  };
}

/** What the fill's overflow report means, in words the calling model will act on. */
function overflowNote(overflow: TemplateFillReport["overflow"]): string {
  if (overflow.length === 0) return " All text fits the room the template gave it.";
  const tooLong = overflow.filter((o) => !o.resolved);
  return (
    ` ${overflow.length - tooLong.length} shape(s) had more text than the template's and were shrunk to fit.` +
    (tooLong.length > 0
      ? ` ${tooLong.length} shape(s) are still too long even shrunk and will overflow -- list them ` +
        `(the overflow entries with resolved=false) so their text can be shortened.`
      : "")
  );
}

/**
 * The deck to inspect: a file an agent produced (by id, or the most recent with
 * that filename) or an uploaded one -- always inside the caller's organisation.
 */
async function loadDocumentBytes(
  spec: { documentFileId?: string; documentFilename?: string },
  orgId?: string | null,
): Promise<{ content: Buffer; filename: string } | { error: string }> {
  const generatedScope = (extra: any) => (orgId ? and(extra, eq(agentGeneratedFiles.organizationId, orgId)) : extra);
  const uploadedScope = (extra: any) => (orgId ? and(extra, eq(uploadedFiles.organizationId, orgId)) : extra);

  let row: { filename: string | null; content: unknown } | undefined;
  if (spec.documentFileId) {
    [row] = await db.select().from(agentGeneratedFiles).where(generatedScope(eq(agentGeneratedFiles.id, spec.documentFileId)));
    if (!row) [row] = await db.select().from(uploadedFiles).where(uploadedScope(eq(uploadedFiles.id, spec.documentFileId)));
  } else if (spec.documentFilename) {
    [row] = await db
      .select()
      .from(agentGeneratedFiles)
      .where(generatedScope(eq(agentGeneratedFiles.filename, spec.documentFilename)))
      .orderBy(desc(agentGeneratedFiles.createdAt))
      .limit(1);
    if (!row) {
      [row] = await db
        .select()
        .from(uploadedFiles)
        .where(uploadedScope(eq(uploadedFiles.filename, spec.documentFilename)))
        .orderBy(desc(uploadedFiles.createdAt))
        .limit(1);
    }
  }

  const ref = spec.documentFileId ?? spec.documentFilename ?? "";
  if (!row) return { error: `No document found matching ${ref}.` };
  if (!row.content) {
    return { error: `"${row.filename ?? ref}" was produced in a code-execution sandbox and its bytes are not stored here, so it cannot be inspected.` };
  }
  return { content: Buffer.from(row.content as any), filename: row.filename ?? ref };
}

/**
 * inspect_document. Every check a reviewer would run is computed here in one
 * pass, so the reviewer reads facts instead of opening the file in a sandbox a
 * command at a time. With only a template, it describes the template instead.
 */
async function executeInspect(args: Record<string, any>, ctx: { orgId?: string | null }): Promise<any> {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const documentFileId = str(args.documentFileId);
  const documentFilename = str(args.documentFilename);
  const templateFileId = str(args.templateFileId);
  const templateFilename = str(args.templateFilename);
  const wantsDocument = !!(documentFileId || documentFilename);
  const wantsTemplate = !!(templateFileId || templateFilename);
  if (!wantsDocument && !wantsTemplate) {
    return { ok: false, error: "Name the deck to inspect (documentFileId or documentFilename), the template it came from, or both." };
  }

  let template: { content: Buffer; filename: string } | null = null;
  if (wantsTemplate) {
    const loaded = await loadTemplateBytes({ templateFileId, templateFilename }, ctx.orgId);
    if ("error" in loaded) return { ok: false, error: loaded.error };
    template = loaded;
  }

  try {
    if (!wantsDocument && template) {
      return { ok: true, template: template.filename, ...(await describePptx(template.content)) };
    }
    const doc = await loadDocumentBytes({ documentFileId, documentFilename }, ctx.orgId);
    if ("error" in doc) return { ok: false, error: doc.error };
    const report = await inspectPptx(doc.content, template?.content);
    return { ok: true, document: doc.filename, template: template?.filename ?? null, ...report };
  } catch (err: any) {
    // Returned, not thrown: an unreadable file is a finding the reviewer reports.
    return { ok: false, error: `Could not inspect the document: ${err?.message ?? err}` };
  }
}
