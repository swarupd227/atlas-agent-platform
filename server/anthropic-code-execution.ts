/**
 * Wires Anthropic's code execution tool + built-in document skills
 * (pptx/docx/pdf/xlsx) into an agent run. See shared/schema.ts's `skills`
 * table (skillKind/anthropicSkillIds/codeExecutionApproved) and
 * server/llm-provider.ts's AnthropicProvider (anthropicServerTools/
 * anthropicContainer/anthropicBetas, generatedFiles/containerId).
 */

import { evaluateActionPolicy } from "./tool-dispatcher";
import type { AvailableTool } from "./tool-dispatcher";
import { getAnthropicRawClient } from "./llm-provider";
import { storage } from "./storage";
import type { Skill } from "@shared/schema";

const CODE_EXECUTION_TOOL_TYPE = "code_execution_20250825";
const CODE_EXECUTION_BETAS = ["code-execution-2025-08-25", "skills-2025-10-02"];
const MAX_SKILLS_PER_REQUEST = 8;

/** Synthetic tool name the AAR gate (evaluateActionPolicy) is keyed on for code execution. */
export const CODE_EXECUTION_TOOL_NAME = "execute_code";

export interface CodeExecutionRequestConfig {
  anthropicServerTools: Array<Record<string, unknown>>;
  anthropicContainer: { skills: Array<{ type: string; skill_id: string; version: string }>; id?: string };
  anthropicBetas: string[];
}

/**
 * Builds the request-config fragment to merge into LLMCompletionOptions when
 * this run has an approved code-execution skill attached. Returns null when
 * there's nothing to add (no code-execution skill, or not yet approved).
 */
export function buildCodeExecutionRequestConfig(
  skills: Skill[],
  containerId?: string,
): CodeExecutionRequestConfig | null {
  const approved = skills.filter((s) => s.skillKind === "code_execution" && s.codeExecutionApproved);
  if (approved.length === 0) return null;

  const skillIds = new Set<string>();
  for (const s of approved) {
    for (const id of s.anthropicSkillIds ?? []) skillIds.add(id);
  }
  if (skillIds.size === 0) return null;

  const skillsList = Array.from(skillIds)
    .slice(0, MAX_SKILLS_PER_REQUEST)
    .map((skill_id) => ({ type: "anthropic", skill_id, version: "latest" }));

  return {
    anthropicServerTools: [{ type: CODE_EXECUTION_TOOL_TYPE, name: "code_execution" }],
    anthropicContainer: { skills: skillsList, ...(containerId ? { id: containerId } : {}) },
    anthropicBetas: CODE_EXECUTION_BETAS,
  };
}

/**
 * Anthropic's code execution tool and its built-in Skills exist only on the
 * Anthropic provider -- OpenAIProvider ignores anthropicServerTools/
 * anthropicContainer/anthropicBetas entirely. Attaching the PDF/PPTX skill to a
 * GPT-model agent therefore produces no capability at all, and the agent
 * truthfully answers that it cannot generate files (it returns an outline
 * instead). Callers use this to refuse or flag the pairing rather than let it
 * fail silently at run time.
 */
export function modelSupportsCodeExecution(modelName: string | null | undefined): boolean {
  return typeof modelName === "string" && modelName.trim().toLowerCase().startsWith("claude");
}

/**
 * Describes an agent holding a code-execution skill its model cannot run.
 * Returns null when the pairing is fine.
 *
 * `coveredByPortableTools` says whether the same capability is still delivered
 * another way (server/builtin-document-tools.ts renders documents on any
 * model). When it is, this is a note about which path ran -- not a problem --
 * and must not tell anyone to switch models: they would be switching away from
 * a path that already works.
 */
export function describeCodeExecutionModelMismatch(
  skills: Skill[],
  modelName: string | null | undefined,
  coveredByPortableTools = false,
): { severity: "warning" | "info"; message: string } | null {
  const approved = skills.filter((s) => s.skillKind === "code_execution" && s.codeExecutionApproved);
  if (approved.length === 0) return null;
  if (modelSupportsCodeExecution(modelName)) return null;
  const names = approved.map((s) => s.name).join(", ");
  const cannot = `Skill(s) [${names}] include Anthropic code execution, which model "${modelName ?? "unknown"}" cannot run.`;
  return coveredByPortableTools
    ? { severity: "info", message: `${cannot} Document generation is handled by the platform renderer instead, which works on any model.` }
    : { severity: "warning", message: `${cannot} Switch the agent to a Claude model to generate real files.` };
}

/**
 * Governance gate, called before deciding whether to offer code execution
 * this turn. Fails closed: any ambiguity (no approved skill, no AAR config,
 * REQUIRE_APPROVAL) results in code execution simply not being offered,
 * mirroring how a normal tool call would pause for approval rather than
 * silently proceeding.
 */
export async function resolveCodeExecutionAccess(
  agentId: string,
  skills: Skill[],
): Promise<{ enabled: boolean; pendingApprovalId?: string }> {
  const hasCodeExecutionSkill = skills.some((s) => s.skillKind === "code_execution");
  if (!hasCodeExecutionSkill) return { enabled: false };

  const approved = skills.some((s) => s.skillKind === "code_execution" && s.codeExecutionApproved);
  if (!approved) return { enabled: false };

  const fakeTool: AvailableTool = {
    serverId: agentId,
    serverName: "code-execution",
    serverUrl: "",
    toolName: CODE_EXECUTION_TOOL_NAME,
    toolDescription: "Anthropic sandboxed code execution",
    toolInputSchema: {},
  };
  const { decision, approvalId } = await evaluateActionPolicy(agentId, fakeTool);

  if (decision === "BLOCK") return { enabled: false };
  if (decision === "REQUIRE_APPROVAL") return { enabled: false, pendingApprovalId: approvalId };
  return { enabled: true };
}

/** Downloads a file the code execution tool created, via Anthropic's Files API. */
export async function downloadGeneratedFile(fileId: string): Promise<{
  filename: string;
  mimeType: string | undefined;
  sizeBytes: number | undefined;
  body: ReadableStream<Uint8Array>;
}> {
  const client = await getAnthropicRawClient();
  const [metadata, response] = await Promise.all([
    client.beta.files.retrieveMetadata(fileId),
    client.beta.files.download(fileId),
  ]);
  const body = (response as any).body ?? (await (response as any).blob()).stream();
  return {
    filename: (metadata as any).filename ?? fileId,
    mimeType: (metadata as any).mime_type ?? (metadata as any).mimeType,
    sizeBytes: (metadata as any).size_bytes ?? (metadata as any).sizeBytes,
    body,
  };
}

/** Fetches metadata only, used right after generation to persist filename/mimeType/sizeBytes without downloading bytes. */
export async function fetchGeneratedFileMetadata(fileId: string): Promise<{
  filename: string | undefined;
  mimeType: string | undefined;
  sizeBytes: number | undefined;
}> {
  const client = await getAnthropicRawClient();
  const metadata = await client.beta.files.retrieveMetadata(fileId);
  return {
    filename: (metadata as any).filename,
    mimeType: (metadata as any).mime_type ?? (metadata as any).mimeType,
    sizeBytes: (metadata as any).size_bytes ?? (metadata as any).sizeBytes,
  };
}

/** Persists rows for files a completion produced, best-effort (never throws into the caller's turn loop). Returns the rows actually created. */
export async function persistGeneratedFiles(
  generatedFiles: Array<{ fileId: string; toolUseId: string }> | undefined,
  ctx: { organizationId: string | null; agentId: string; workspaceRunId?: string; traceId?: string },
): Promise<Array<{ id: string; filename: string | null; mimeType: string | null }>> {
  if (!generatedFiles || generatedFiles.length === 0) return [];
  const created: Array<{ id: string; filename: string | null; mimeType: string | null }> = [];
  for (const f of generatedFiles) {
    try {
      const meta = await fetchGeneratedFileMetadata(f.fileId);
      const row = await storage.createAgentGeneratedFile({
        organizationId: ctx.organizationId,
        agentId: ctx.agentId,
        workspaceRunId: ctx.workspaceRunId ?? null,
        traceId: ctx.traceId ?? null,
        filename: meta.filename ?? null,
        mimeType: meta.mimeType ?? null,
        sizeBytes: meta.sizeBytes ?? null,
        anthropicFileId: f.fileId,
      } as any);
      created.push({ id: row.id, filename: row.filename, mimeType: row.mimeType });
    } catch (err: any) {
      console.error(`[anthropic-code-execution] Failed to persist generated file ${f.fileId} (non-fatal):`, err?.message);
    }
  }
  return created;
}
