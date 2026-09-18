/**
 * Skills & Knowledge pack: services checked in the organization (including
 * attaching a knowledge base, which the classic route doesn't check), and
 * the tools through the Astra loop.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  agents: new Map<string, any>(),
  skills: new Map<string, any>(),
  kbs: new Map<string, any>(),
  sources: new Map<string, any>(),
  links: [] as any[],
  audit: [] as any[],
  added: [] as any[],
}));

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(async (id: string, orgId?: string) => { const a = db.agents.get(id); return a && (!orgId || a.organizationId === orgId) ? { ...a } : undefined; }),
    updateAgent: vi.fn(async (id: string, data: any) => { db.agents.set(id, { ...db.agents.get(id), ...data }); return {}; }),
    getSkills: vi.fn(async (orgId: string) => Array.from(db.skills.values()).filter((s) => s.organizationId === orgId)),
    getSkill: vi.fn(async (id: string, orgId: string) => { const s = db.skills.get(id); return s && s.organizationId === orgId ? s : undefined; }),
    getKnowledgeBases: vi.fn(async (orgId: string) => Array.from(db.kbs.values()).filter((k) => k.organizationId === orgId)),
    getKnowledgeBase: vi.fn(async (id: string, orgId: string) => { const k = db.kbs.get(id); return k && k.organizationId === orgId ? k : undefined; }),
    createKnowledgeBase: vi.fn(async (k: any) => { const row = { id: "kb-new", totalSources: 0, totalChunks: 0, ...k }; db.kbs.set(row.id, row); return row; }),
    getKnowledgeSource: vi.fn(async (id: string) => db.sources.get(id)),
    getAgentKnowledgeBases: vi.fn(async (agentId: string) => db.links.filter((l) => l.agentId === agentId)),
    createAgentKnowledgeBase: vi.fn(async (l: any) => { db.links.push(l); return l; }),
    createAuditEvent: vi.fn(async (e: any) => { db.audit.push(e); return e; }),
  },
}));

vi.mock("../server/kb-routes", () => ({
  addTextSource: vi.fn(async (input: any) => { db.added.push(input); db.sources.set("src-1", { id: "src-1", status: "processed", chunkCount: 4 }); return { source: { id: "src-1", name: input.title ?? "Manual Entry" }, sensitivityWarnings: [] }; }),
  addUrlSource: vi.fn(async (input: any) => { db.added.push(input); return { id: "src-2", name: input.url }; }),
}));

vi.mock("../server/embeddings", () => ({
  isPgvectorAvailable: () => false,
  searchKnowledgeBaseChunks: vi.fn(async () => [{ id: "c1", content: "Invoices over $10k need a second approver.", similarity: null }]),
}));

import { knowledgeServices as svc } from "../server/astra/knowledge-services";

beforeEach(() => {
  for (const m of [db.agents, db.skills, db.kbs, db.sources]) m.clear();
  db.links.length = 0; db.audit.length = 0; db.added.length = 0;
  db.agents.set("ag-1", { id: "ag-1", name: "Invoice Agent", organizationId: "org-a", preloadedSkills: [] });
  db.agents.set("ag-x", { id: "ag-x", name: "Other", organizationId: "org-b" });
  db.skills.set("sk-1", { id: "sk-1", name: "Three-way match", description: "Match invoice, PO and receipt", industry: "manufacturing", organizationId: "org-a", status: "active" });
  db.skills.set("sk-2", { id: "sk-2", name: "Claims triage", industry: "insurance", organizationId: "org-a", status: "active" });
  db.kbs.set("kb-1", { id: "kb-1", name: "AP policies", organizationId: "org-a", industry: "general", totalSources: 1, totalChunks: 4 });
  db.kbs.set("kb-b", { id: "kb-b", name: "Other org KB", organizationId: "org-b" });
});

describe("skills", () => {
  it("find skills in the industry plus cross-industry ones, by a word", async () => {
    expect((await svc.findSkills("org-a", undefined, "manufacturing")).skills.map((s) => s.id)).toEqual(["sk-1"]);
    expect((await svc.findSkills("org-a", "claims", null)).skills.map((s) => s.id)).toEqual(["sk-2"]);
  });

  it("attach a skill once, audited; attaching again changes nothing", async () => {
    expect(await svc.attachSkillAs("org-a", "ag-1", "sk-1", "admin")).toMatchObject({ alreadyAttached: false });
    expect(db.agents.get("ag-1").preloadedSkills).toEqual([{ skillId: "sk-1" }]);
    expect(await svc.attachSkillAs("org-a", "ag-1", "sk-1", "admin")).toMatchObject({ alreadyAttached: true });
    expect(db.audit.map((e) => e.action)).toEqual(["skill_attached"]);
  });
});

describe("knowledge bases", () => {
  it("attach a knowledge base only when both are in the organization", async () => {
    await expect(svc.attachKnowledgeBaseAs("org-a", "ag-1", "kb-b", "admin")).rejects.toThrow("No knowledge base");
    await expect(svc.attachKnowledgeBaseAs("org-a", "ag-x", "kb-1", "admin")).rejects.toThrow("No agent");
    expect(await svc.attachKnowledgeBaseAs("org-a", "ag-1", "kb-1", "admin")).toMatchObject({ alreadyAttached: false });
    expect(db.links).toEqual([{ agentId: "ag-1", knowledgeBaseId: "kb-1" }]);
    expect(db.audit[0]).toMatchObject({ organizationId: "org-a", action: "knowledge_base_attached" });
  });

  it("add text through the shared source code, audited, and follow ingestion", async () => {
    const r = await svc.addKnowledgeAs("org-a", "kb-1", { text: "Invoices over $10k need a second approver.", title: "AP rule" }, "admin");
    expect(db.added[0]).toMatchObject({ orgId: "org-a", title: "AP rule", kb: { id: "kb-1" } });
    expect(r.source.id).toBe("src-1");
    const w = await svc.watchKnowledgeSource("org-a", "src-1", () => {}, 1000, 1);
    expect(w).toMatchObject({ finished: true, status: "processed", chunkCount: 4 });
    await expect(svc.addKnowledgeAs("org-a", "kb-b", { text: "x" }, "admin")).rejects.toThrow("No knowledge base");
  });

  it("search says when there's no vector search behind the results", async () => {
    const r = await svc.searchKnowledge("org-a", "kb-1", "approval threshold", "admin");
    expect(r).toMatchObject({ semantic: false, passages: [{ id: "c1", similarity: null }] });
  });
});

describe("knowledge tools", () => {
  it("add_knowledge refuses without exactly one of text or url, and attach_skill warns about unapproved code execution", async () => {
    const { runTurn } = await import("../server/astra/engine");
    const { ToolRegistry } = await import("../server/astra/registry");
    const { MemoryThreadStore } = await import("../server/astra/memory-store");
    const { scriptedComplete, result, call } = await import("../server/astra/scripted-brain");
    const { finishTurnTool } = await import("../server/astra/tools/finish-turn");
    const { loadToolsTool } = await import("../server/astra/tools/load-tools");
    const { KNOWLEDGE_TOOLS } = await import("../server/astra/tools/knowledge");
    const { hasPermission } = await import("../server/permissions");

    const store = new MemoryThreadStore();
    const threadId = store.createThread("org-a");
    const services = {
      listAgents: vi.fn(async () => [{ id: "ag-1", name: "Invoice Agent", organizationId: "org-a" }]),
      listKnowledgeBases: vi.fn(async () => [{ id: "kb-1", name: "AP policies", totalChunks: 4 }]),
      getSkillInOrg: vi.fn(async () => null),
      findSkills: vi.fn(async () => ({ total: 1, skills: [{ id: "sk-9", name: "Run reconciliation script", kind: "code_execution", codeExecutionApproved: false, status: "active" }] })),
      getUserDisplayName: vi.fn(async () => "admin"),
    };
    const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
    const deps: any = {
      store,
      registry: new ToolRegistry([finishTurnTool, loadToolsTool, ...KNOWLEDGE_TOOLS], hasPermission),
      complete: scriptedComplete([
        { toolCalls: [{ name: "load_tools", arguments: { pack: "knowledge" } }] },
        { toolCalls: [{ name: "add_knowledge", arguments: { knowledgeBase: "AP policies" } }] },
        (m: any[]) => {
          expect(JSON.parse(m.filter((x) => x.role === "tool").at(-1).content).error).toContain("either text or a url");
          return { toolCalls: [call("attach_skill", { agent: "Invoice Agent", skill: "reconciliation" })] } as any;
        },
      ]),
      can: hasPermission,
      audit: vi.fn(async () => {}),
      services,
      model: "test",
    };
    expect(await runTurn(deps, { orgId: "org-a", userId: "u1", role: "admin" }, threadId, "Add it", () => {})).toBe("awaiting_confirmation");
    const action = (await store.loadThread(threadId, "org-a"))!.pendingAction!;
    expect(action.summary).toBe("Attach skill Run reconciliation script to Invoice Agent");
    expect(action.warnings).toEqual([expect.objectContaining({ title: "Code execution not approved" })]);
  });
});
