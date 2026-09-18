import { z } from "zod";
import type { AstraTool, AstraToolContext, ConfirmPreview } from "../types";
import { resolveAgentRef } from "./refs";

/**
 * Skills & Knowledge studio pack: find and attach skills; create knowledge
 * bases, add text or web pages to them, search them, attach them to agents.
 * Changes are confirmed and audited; everything stays in the organization.
 */

const PACK = "knowledge";

async function resolveSkill(ctx: AstraToolContext, ref: string): Promise<{ skill: any } | { refuse: string }> {
  const byId = await ctx.services.getSkillInOrg(ctx.orgId, ref);
  if (byId) return { skill: byId };
  const { skills } = await ctx.services.findSkills(ctx.orgId, ref, null);
  const exact = skills.filter((s: any) => s.name.toLowerCase() === ref.trim().toLowerCase());
  const matches = exact.length ? exact : skills;
  if (matches.length === 1) return { skill: matches[0] };
  if (matches.length === 0) return { refuse: `No skill matching "${ref}" in this organization.` };
  return { refuse: `Several skills match "${ref}": ${matches.slice(0, 6).map((s: any) => `${s.name} (${s.id})`).join("; ")}. Say which one.` };
}

async function resolveKb(ctx: AstraToolContext, ref: string): Promise<{ kb: any } | { refuse: string }> {
  const all: any[] = await ctx.services.listKnowledgeBases(ctx.orgId);
  const byId = all.find((k) => k.id === ref);
  if (byId) return { kb: byId };
  const needle = ref.trim().toLowerCase();
  const exact = all.filter((k) => k.name.toLowerCase() === needle);
  const matches = exact.length ? exact : all.filter((k) => k.name.toLowerCase().includes(needle));
  if (matches.length === 1) return { kb: matches[0] };
  if (matches.length === 0) return { refuse: `No knowledge base named "${ref}" in this organization.` };
  return { refuse: `Several knowledge bases match "${ref}": ${matches.slice(0, 6).map((k) => `${k.name} (${k.id})`).join("; ")}. Say which one.` };
}

const actorOf = async (ctx: AstraToolContext) => (await ctx.services.getUserDisplayName(ctx.userId)) ?? ctx.role;

export const findSkillsTool: AstraTool<{ query?: string; industry?: string }> = {
  name: "find_skills",
  description: "Find the organization's skills (procedures an agent can follow) by a word in the name, description or domain; by default in the organization's industry plus cross-industry ones.",
  input: z.object({ query: z.string().max(100).optional(), industry: z.string().max(60).optional().describe("An industry id; default the one in effect.") }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const r = await ctx.services.findSkills(ctx.orgId, input.query, input.industry ?? ctx.industryId ?? null);
    return { payload: r, proof: { context: { status: "measured", summary: `${r.total} skills found` } } };
  },
};

export const attachSkillTool: AstraTool<{ agent: string; skill: string }> = {
  name: "attach_skill",
  description: "Give an agent a skill: it's listed in the agent's skill catalogue and the agent can read its procedure while working.",
  input: z.object({ agent: z.string().min(1), skill: z.string().min(1).describe("The skill's id or name.") }),
  permission: "create_modify_blueprints",
  pack: PACK,
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const agent = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in agent) return agent;
    const s = await resolveSkill(ctx, input.skill);
    if ("refuse" in s) return s;
    const needsApproval = s.skill.kind === "code_execution" && !s.skill.codeExecutionApproved;
    return {
      summary: `Attach skill ${s.skill.name} to ${agent.item.name}`,
      details: [
        `From its next run, ${agent.item.name} sees ${s.skill.name} in its skill catalogue and can read the procedure when it's relevant.`,
        ...(s.skill.status && s.skill.status !== "active" ? [`The skill is ${s.skill.status}; only active skills are offered to agents.`] : []),
        "Recorded in the audit trail.",
      ],
      ...(needsApproval ? { warnings: [{ title: "Code execution not approved", detail: "This skill runs code. Until its code-execution approval is granted, the agent can read it but can't execute it." }] } : {}),
      frozen: { agentId: agent.item.id, skillId: s.skill.id },
    };
  },
  run: async (ctx) => {
    const f = ctx.confirmation?.frozen as { agentId: string; skillId: string } | undefined;
    if (!f) throw new Error("Attaching a skill needs the confirmation card.");
    const r = await ctx.services.attachSkillAs(ctx.orgId, f.agentId, f.skillId, await actorOf(ctx));
    return { payload: r, proof: { compliance: { status: "measured", summary: r.alreadyAttached ? "Already attached; nothing changed" : "Skill attached · audit recorded" } } };
  },
};

export const listKnowledgeBasesTool: AstraTool<Record<string, never>> = {
  name: "list_knowledge_bases",
  description: "List the organization's knowledge bases with their source and passage counts.",
  input: z.object({}),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx) => {
    const kbs = await ctx.services.listKnowledgeBases(ctx.orgId);
    return { payload: { total: kbs.length, knowledgeBases: kbs.slice(0, 40) }, proof: { context: { status: "measured", summary: `${kbs.length} knowledge bases` } } };
  },
};

export const createKnowledgeBaseTool: AstraTool<{ name: string; description?: string }> = {
  name: "create_knowledge_base",
  description: "Create an empty knowledge base in the organization (in the industry in effect). Add sources with add_knowledge.",
  input: z.object({ name: z.string().min(2).max(120), description: z.string().max(500).optional() }),
  permission: "create_modify_blueprints",
  pack: PACK,
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const existing: any[] = await ctx.services.listKnowledgeBases(ctx.orgId);
    if (existing.some((k) => k.name.toLowerCase() === input.name.trim().toLowerCase())) return { refuse: `A knowledge base named "${input.name}" already exists.` };
    return {
      summary: `Create knowledge base: ${input.name}`,
      details: [`An empty knowledge base${ctx.industryId ? ` for ${ctx.industryId}` : ""}. Nothing is searchable until sources are added.`, "Recorded in the audit trail."],
      frozen: { name: input.name.trim(), description: input.description ?? null, industry: ctx.industryId ?? null },
    };
  },
  run: async (ctx) => {
    const f = ctx.confirmation?.frozen as { name: string; description: string | null; industry: string | null } | undefined;
    if (!f) throw new Error("Creating a knowledge base needs the confirmation card.");
    const kb = await ctx.services.createKnowledgeBaseAs(ctx.orgId, f.name, f.description, f.industry, await actorOf(ctx));
    return { payload: { created: true, knowledgeBase: kb }, proof: { compliance: { status: "measured", summary: "Knowledge base created · audit recorded" } } };
  },
};

type AddInput = { knowledgeBase: string; text?: string; title?: string; url?: string };

export const addKnowledgeTool: AstraTool<AddInput> = {
  name: "add_knowledge",
  description: "Add text or a web page (one URL, not crawled) to a knowledge base; it's chunked and embedded, and the result is reported when ingestion finishes. Give either text or url.",
  input: z.object({
    knowledgeBase: z.string().min(1).describe("The knowledge base's id or name."),
    text: z.string().max(50_000).optional(),
    title: z.string().max(200).optional(),
    url: z.string().url().optional(),
  }),
  permission: "create_modify_blueprints",
  pack: PACK,
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    if (!!input.text === !!input.url) return { refuse: "Give either text or a url to add." };
    const kb = await resolveKb(ctx, input.knowledgeBase);
    if ("refuse" in kb) return kb;
    return {
      summary: `Add ${input.url ? "a web page" : "text"} to ${kb.kb.name}`,
      details: [
        input.url ? `Fetches ${input.url} (a single page) and indexes it.` : `Indexes ${input.text!.length.toLocaleString()} characters${input.title ? ` as "${input.title}"` : ""}.`,
        "It's scanned for sensitive content first; agents attached to this knowledge base can use it once ingestion finishes.",
        "Recorded in the audit trail.",
      ],
      frozen: { kbId: kb.kb.id },
    };
  },
  run: async (ctx, input) => {
    const f = ctx.confirmation?.frozen as { kbId: string } | undefined;
    if (!f) throw new Error("Adding knowledge needs the confirmation card.");
    const added = await ctx.services.addKnowledgeAs(ctx.orgId, f.kbId, { text: input.text, title: input.title, url: input.url }, await actorOf(ctx));
    const watched = await ctx.services.watchKnowledgeSource(ctx.orgId, added.source.id, (label: string) => ctx.onProgress?.({ type: "working", label }));
    return {
      payload: {
        added: true,
        knowledgeBase: added.knowledgeBase,
        source: added.source,
        ingestion: watched,
        ...(added.sensitivityWarnings?.length ? { sensitivityWarnings: added.sensitivityWarnings } : {}),
        ...(watched.finished ? {} : { note: "Still ingesting; it will be searchable when it finishes." }),
      },
      proof: {
        context: watched.status === "processed"
          ? { status: "measured", summary: `${watched.chunkCount} passages indexed` }
          : { status: "not_measured", reason: watched.status === "error" ? `Ingestion failed: ${watched.error ?? "no reason recorded"}` : "Ingestion still running." },
      },
    };
  },
};

export const searchKnowledgeTool: AstraTool<{ knowledgeBase: string; query: string }> = {
  name: "search_knowledge",
  description: "Search a knowledge base and return the matching passages with their similarity. Passages above the reader's sensitivity level aren't returned.",
  input: z.object({ knowledgeBase: z.string().min(1), query: z.string().min(2).max(500) }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const kb = await resolveKb(ctx, input.knowledgeBase);
    if ("refuse" in kb) throw new Error(kb.refuse);
    const r = await ctx.services.searchKnowledge(ctx.orgId, kb.kb.id, input.query, ctx.role);
    return {
      payload: { ...r, ...(r.semantic ? {} : { note: "Vector search isn't available here, so these are the most recent passages, not matches; similarity is empty." }) },
      proof: {
        context: r.semantic
          ? { status: "measured", summary: `${r.passages.length} passages from ${r.knowledgeBase.name}` }
          : { status: "not_measured", reason: "No vector search: recent passages, not ranked matches." },
      },
    };
  },
};

export const attachKnowledgeBaseTool: AstraTool<{ agent: string; knowledgeBase: string }> = {
  name: "attach_knowledge_base",
  description: "Attach a knowledge base to an agent so the agent searches it while it works.",
  input: z.object({ agent: z.string().min(1), knowledgeBase: z.string().min(1) }),
  permission: "create_modify_blueprints",
  pack: PACK,
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const agent = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in agent) return agent;
    const kb = await resolveKb(ctx, input.knowledgeBase);
    if ("refuse" in kb) return kb;
    return {
      summary: `Attach ${kb.kb.name} to ${agent.item.name}`,
      details: [
        `From its next run, ${agent.item.name} retrieves passages from ${kb.kb.name} (${kb.kb.totalChunks} passages today), limited to what its runs may read by sensitivity.`,
        "Recorded in the audit trail.",
      ],
      frozen: { agentId: agent.item.id, kbId: kb.kb.id },
    };
  },
  run: async (ctx) => {
    const f = ctx.confirmation?.frozen as { agentId: string; kbId: string } | undefined;
    if (!f) throw new Error("Attaching a knowledge base needs the confirmation card.");
    const r = await ctx.services.attachKnowledgeBaseAs(ctx.orgId, f.agentId, f.kbId, await actorOf(ctx));
    return { payload: r, proof: { compliance: { status: "measured", summary: r.alreadyAttached ? "Already attached; nothing changed" : "Knowledge base attached · audit recorded" } } };
  },
};

export const KNOWLEDGE_TOOLS = [findSkillsTool, attachSkillTool, listKnowledgeBasesTool, createKnowledgeBaseTool, addKnowledgeTool, searchKnowledgeTool, attachKnowledgeBaseTool];
