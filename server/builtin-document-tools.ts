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

/** Synthetic server identity; `serverId` is what executeTool routes on. */
export const BUILTIN_DOCUMENT_SERVER_ID = "builtin:document";
const BUILTIN_DOCUMENT_SERVER_NAME = "Document Generation";

export const GENERATE_PPTX_TOOL = "generate_pptx";
export const GENERATE_PDF_TOOL = "generate_pdf";

/**
 * Marker the engines look for on a tool result to fold the new file into the
 * run's generatedFiles, the same list Anthropic-produced files land in.
 */
export const GENERATED_FILE_MARKER = "__generatedFile";

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

/** The built-in document tools this agent's skills grant; empty for everyone else. */
export function documentToolsForSkills(skills: Skill[]): AvailableTool[] {
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
  const format: DocumentFormat | null =
    toolName === GENERATE_PPTX_TOOL ? "pptx" : toolName === GENERATE_PDF_TOOL ? "pdf" : null;
  if (!format) throw new Error(`Unknown document tool "${toolName}"`);
  if (!ctx.agentId) throw new Error(`No agent context to generate a document for "${toolName}"`);

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

  return {
    ok: true,
    filename,
    mimeType,
    sizeBytes: content.length,
    sections: spec.sections.length,
    downloadUrl: `/api/agent-files/${row.id}/download`,
    message: `Generated ${filename} (${spec.sections.length} ${format === "pptx" ? "slides" : "sections"}). It is attached to this run and available to download.`,
    [GENERATED_FILE_MARKER]: { id: row.id, filename: row.filename, mimeType: row.mimeType },
  };
}
