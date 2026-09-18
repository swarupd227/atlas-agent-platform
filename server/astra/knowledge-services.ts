/**
 * Astra services for the Skills & Knowledge pack. Every read and change is
 * checked against the caller's organization here -- including attaching a
 * knowledge base to an agent, which the classic route doesn't check.
 */
import { storage } from "../storage";
import { addTextSource, addUrlSource } from "../kb-routes";
import { isPgvectorAvailable, searchKnowledgeBaseChunks } from "../embeddings";
import { filterByIndustry } from "@shared/industry-filter";
import type { RoleId } from "../permissions";

async function agentInOrg(orgId: string, agentId: string) {
  const a = await storage.getAgent(agentId, orgId);
  return a && a.organizationId === orgId ? a : null;
}

async function kbInOrg(orgId: string, kbId: string) {
  const kb = await storage.getKnowledgeBase(kbId, orgId);
  return kb && kb.organizationId === orgId ? kb : null;
}

const skillView = (s: any) => ({
  id: s.id,
  name: s.name,
  description: s.description ?? null,
  industry: s.industry ?? null,
  domain: s.domain ?? null,
  status: s.status ?? null,
  kind: s.skillKind ?? "prompt",
  codeExecutionApproved: !!s.codeExecutionApproved,
});

async function findSkills(orgId: string, query?: string, industryId?: string | null) {
  const all = (await storage.getSkills(orgId)).filter((s: any) => s.organizationId === orgId);
  const q = query?.trim().toLowerCase();
  const rows = filterByIndustry(all, industryId ?? null, (s: any) => s.industry).filter((s: any) => !q || `${s.name} ${s.description ?? ""} ${s.domain ?? ""}`.toLowerCase().includes(q));
  return { total: rows.length, skills: rows.slice(0, 30).map(skillView) };
}

async function getSkillInOrg(orgId: string, skillId: string) {
  const s = await storage.getSkill(skillId, orgId);
  return s && (s as any).organizationId === orgId ? skillView(s) : null;
}

async function attachSkillAs(orgId: string, agentId: string, skillId: string, actor: string) {
  const [agent, skill] = await Promise.all([agentInOrg(orgId, agentId), storage.getSkill(skillId, orgId)]);
  if (!agent) throw new Error("No agent with that id in this organization.");
  if (!skill || (skill as any).organizationId !== orgId) throw new Error("No skill with that id in this organization.");
  const current = Array.isArray(agent.preloadedSkills) ? (agent.preloadedSkills as Array<{ skillId?: string }>) : [];
  if (current.some((p) => p.skillId === skill.id)) return { agent: { id: agent.id, name: agent.name }, skill: skillView(skill), alreadyAttached: true };
  await storage.updateAgent(agent.id, { preloadedSkills: [...current, { skillId: skill.id }] } as any);
  await storage.createAuditEvent({
    organizationId: orgId,
    actorType: "user",
    actorId: actor,
    action: "skill_attached",
    objectType: "agent",
    objectId: agent.id,
    details: `Skill "${skill.name}" attached to ${agent.name} by ${actor} (via Astra Workspace)`,
  });
  return { agent: { id: agent.id, name: agent.name }, skill: skillView(skill), alreadyAttached: false };
}

const kbView = (kb: any) => ({ id: kb.id, name: kb.name, description: kb.description ?? null, industry: kb.industry, totalSources: kb.totalSources ?? 0, totalChunks: kb.totalChunks ?? 0 });

async function listKnowledgeBases(orgId: string) {
  return (await storage.getKnowledgeBases(orgId)).filter((kb) => kb.organizationId === orgId).map(kbView);
}

async function createKnowledgeBaseAs(orgId: string, name: string, description: string | null, industry: string | null, actor: string) {
  const kb = await storage.createKnowledgeBase({ name, description: description ?? undefined, industry: industry || "general", organizationId: orgId } as any);
  await storage.createAuditEvent({
    organizationId: orgId,
    actorType: "user",
    actorId: actor,
    action: "knowledge_base_created",
    objectType: "knowledge_base",
    objectId: kb.id,
    details: `Knowledge base "${name}" created by ${actor} (via Astra Workspace)`,
  });
  return kbView(kb);
}

async function addKnowledgeAs(orgId: string, kbId: string, source: { text?: string; title?: string; url?: string }, actor: string) {
  const kb = await kbInOrg(orgId, kbId);
  if (!kb) throw new Error("No knowledge base with that id in this organization.");
  let created: { id: string; name: string };
  let sensitivityWarnings: unknown[] = [];
  if (source.url) {
    created = await addUrlSource({ kb, url: source.url, name: source.title });
  } else {
    const r = await addTextSource({ kb, orgId, title: source.title, content: source.text ?? "" });
    created = r.source;
    sensitivityWarnings = r.sensitivityWarnings;
  }
  await storage.createAuditEvent({
    organizationId: orgId,
    actorType: "user",
    actorId: actor,
    action: "knowledge_source_added",
    objectType: "knowledge_base",
    objectId: kb.id,
    details: `${source.url ? `URL ${source.url}` : `Text "${source.title || "Manual Entry"}"`} added to ${kb.name} by ${actor} (via Astra Workspace)`,
  });
  return { knowledgeBase: kbView(kb), source: { id: created.id, name: created.name }, sensitivityWarnings };
}

/** Follow a source until it's processed or failed (or the cap passes). */
async function watchKnowledgeSource(orgId: string, sourceId: string, onProgress: (label: string) => void, capMs = 90_000, everyMs = 3_000) {
  const until = Date.now() + capMs;
  let last = "";
  while (true) {
    const s = await storage.getKnowledgeSource(sourceId, orgId);
    if (!s) throw new Error("That source isn't in this organization.");
    const label = s.status === "processed" ? `Processed: ${s.chunkCount ?? 0} passages` : s.status === "error" ? "Ingestion failed" : `Ingesting (${s.status})`;
    if (label !== last) {
      onProgress(label);
      last = label;
    }
    if (s.status === "processed" || s.status === "error") return { status: s.status, chunkCount: s.chunkCount ?? 0, error: s.errorMessage ?? null, finished: true };
    if (Date.now() >= until) return { status: s.status, chunkCount: s.chunkCount ?? 0, error: null, finished: false };
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

async function searchKnowledge(orgId: string, kbId: string, query: string, role: RoleId, topK = 5) {
  const kb = await kbInOrg(orgId, kbId);
  if (!kb) throw new Error("No knowledge base with that id in this organization.");
  const rows = await searchKnowledgeBaseChunks(kb.id, query, topK, 0.3, role);
  return {
    knowledgeBase: kbView(kb),
    semantic: isPgvectorAvailable(),
    passages: rows.map((r) => ({ id: r.id, content: String(r.content ?? "").slice(0, 800), similarity: r.similarity })),
  };
}

async function attachKnowledgeBaseAs(orgId: string, agentId: string, kbId: string, actor: string) {
  const [agent, kb] = await Promise.all([agentInOrg(orgId, agentId), kbInOrg(orgId, kbId)]);
  if (!agent) throw new Error("No agent with that id in this organization.");
  if (!kb) throw new Error("No knowledge base with that id in this organization.");
  const links = await storage.getAgentKnowledgeBases(agent.id);
  if (links.some((l) => l.knowledgeBaseId === kb.id)) return { agent: { id: agent.id, name: agent.name }, knowledgeBase: kbView(kb), alreadyAttached: true };
  await storage.createAgentKnowledgeBase({ agentId: agent.id, knowledgeBaseId: kb.id } as any);
  await storage.createAuditEvent({
    organizationId: orgId,
    actorType: "user",
    actorId: actor,
    action: "knowledge_base_attached",
    objectType: "agent",
    objectId: agent.id,
    details: `Knowledge base "${kb.name}" attached to ${agent.name} by ${actor} (via Astra Workspace)`,
  });
  return { agent: { id: agent.id, name: agent.name }, knowledgeBase: kbView(kb), alreadyAttached: false };
}

export const knowledgeServices = {
  findSkills,
  getSkillInOrg,
  attachSkillAs,
  listKnowledgeBases,
  createKnowledgeBaseAs,
  addKnowledgeAs,
  watchKnowledgeSource,
  searchKnowledge,
  attachKnowledgeBaseAs,
};
