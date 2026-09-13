/**
 * Astra thread scoping and the read tools added with the routes.
 * Pure helpers, the in-memory store, and tools against fake services -- no database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { canAccessThread } from "../server/astra/access";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { getAgentTool } from "../server/astra/tools/get-agent";
import { findConnectorsTool } from "../server/astra/tools/find-connectors";
import { getIndustryContextTool } from "../server/astra/tools/get-industry-context";
import type { AstraToolContext } from "../server/astra/types";

describe("canAccessThread", () => {
  const thread = { organizationId: "org-a", actorUserId: "user-1" };

  it("lets the user who started the thread open it", () => {
    expect(canAccessThread(thread, { orgId: "org-a", userId: "user-1" })).toBe(true);
  });

  it("refuses another organization, even with the same user id", () => {
    expect(canAccessThread(thread, { orgId: "org-b", userId: "user-1" })).toBe(false);
  });

  it("refuses another user in the same organization", () => {
    expect(canAccessThread(thread, { orgId: "org-a", userId: "user-2" })).toBe(false);
  });
});

describe("turn lock (store semantics)", () => {
  it("refuses a concurrent turn and takes over a stale one", async () => {
    let now = 1_000_000;
    const store = new MemoryThreadStore(10 * 60_000, () => now);
    const id = store.createThread("org-a");

    expect(await store.acquireTurn(id, "org-a")).toBe(true);
    expect(await store.acquireTurn(id, "org-a")).toBe(false);
    now += 11 * 60_000; // the first turn died (e.g. a restart)
    expect(await store.acquireTurn(id, "org-a")).toBe(true);
  });

  it("never acquires a thread waiting on a confirmation, or another organization's thread", async () => {
    const store = new MemoryThreadStore();
    const id = store.createThread("org-a");
    const state = (await store.loadThread(id, "org-a"))!;
    await store.saveState(id, "org-a", {
      status: "awaiting_confirmation",
      checkpoint: state.checkpoint,
      pendingAction: { id: "act", kind: "tool_confirm", toolName: "x", toolCallId: "c", input: {}, summary: "", messageId: null, createdAt: "" },
    });
    expect(await store.acquireTurn(id, "org-a")).toBe(false);
    expect(await store.acquireTurn(id, "org-b")).toBe(false);
  });
});

function toolCtx(services: Record<string, (...args: any[]) => Promise<any>>, extra: Partial<AstraToolContext> = {}): AstraToolContext {
  return { orgId: "org-a", userId: "user-1", role: "admin", threadId: "t1", services, ...extra };
}

describe("get_agent", () => {
  const agents = [
    { id: "ag-1", name: "AR Data Gathering", status: "active", policyBindings: [{ policyId: "p1" }, { policyId: "p2" }], ontologyTags: [{ conceptLabel: "Open Receivable" }], autonomyMode: "supervised", riskTier: "HIGH" },
    { id: "ag-2", name: "AR Notifications", status: "draft" },
  ];
  const services = {
    getAgent: async (_org: string, id: string) => agents.find((a) => a.id === id),
    listAgents: async () => agents,
    listAgentConnectors: async () => [{ serverId: "srv-1", name: "Dealer Operations", integrationId: "dealer-operations", riskTier: "HIGH" }],
  };

  it("returns connectors, bound policies and industry concepts, with proof", async () => {
    const out = await getAgentTool.run(toolCtx(services), { name: "AR Data Gathering" });
    expect((out.payload as any).agent).toMatchObject({ id: "ag-1", policiesBound: 2, industryConcepts: ["Open Receivable"] });
    expect((out.payload as any).agent.connectors).toEqual([{ id: "srv-1", name: "Dealer Operations", integrationId: "dealer-operations", riskTier: "HIGH" }]);
    expect(out.artifact).toMatchObject({ kind: "agent", fullViewHref: "/agents/ag-1" });
    expect(out.proof!.compliance).toMatchObject({ status: "measured", summary: expect.stringContaining("2 policies bound") });
    expect(out.proof!.industry).toMatchObject({ status: "measured", summary: "Open Receivable" });
  });

  it("asks for clarification instead of guessing when a partial name matches several agents", async () => {
    const out = await getAgentTool.run(toolCtx(services), { name: "AR " });
    expect(out.payload).toMatchObject({ found: false, ambiguous: true });
    expect((out.payload as any).candidates).toHaveLength(2);
  });

  it("says plainly when no agent matches, with industry not measured when untagged", async () => {
    expect((await getAgentTool.run(toolCtx(services), { agentId: "missing" })).payload).toMatchObject({ found: false });
    const untagged = await getAgentTool.run(toolCtx(services), { agentId: "ag-2" });
    expect(untagged.proof!.industry).toMatchObject({ status: "not_measured" });
  });
});

describe("find_connectors", () => {
  const services = {
    listConnectors: async () => [
      { id: "srv-1", name: "Dealer Operations", description: "Cash application, AR, warranty", integrationId: "dealer-operations", status: "registered", riskTier: "HIGH", connected: true, toolCount: 57, writeToolCount: 11 },
      { id: "srv-2", name: "Salesforce CRM (Enterprise)", description: "CRM", integrationId: "salesforce", status: "registered", riskTier: "MEDIUM", connected: false, toolCount: 12, writeToolCount: 6 },
    ],
    agentsLinkedToConnectors: async (_org: string, ids: string[]) =>
      ids.includes("srv-1") ? [{ serverId: "srv-1", agentId: "ag-1", agentName: "AR Data Gathering", agentStatus: "active" }] : [],
  };

  it("filters by text and reports connection, tool counts and linked agents", async () => {
    const out = await findConnectorsTool.run(toolCtx(services), { query: "dealer", includeLinkedAgents: true });
    const [row] = (out.payload as any).connectors;
    expect((out.payload as any).total).toBe(1);
    expect(row).toMatchObject({ name: "Dealer Operations", connected: true, toolCount: 57, writeToolCount: 11 });
    expect(row.linkedAgents).toEqual([{ id: "ag-1", name: "AR Data Gathering", status: "active" }]);
    expect(out.artifact).toMatchObject({ kind: "connectorList" });
  });

  it("does not query links unless asked", async () => {
    const out = await findConnectorsTool.run(toolCtx({ ...services, agentsLinkedToConnectors: async () => { throw new Error("should not be called"); } }), {});
    expect((out.payload as any).connectors[0]).not.toHaveProperty("linkedAgents");
  });
});

describe("get_industry_context", () => {
  it("says no industry is selected rather than inventing one", async () => {
    const out = await getIndustryContextTool.run(toolCtx({ getIndustryContext: async () => ({ selected: false }) }), {});
    expect(out.payload).toMatchObject({ selected: false });
    expect(out.proof!.industry).toMatchObject({ status: "not_measured" });
  });

  it("reports the pack's regulatory frameworks when there is one", async () => {
    const ctx = toolCtx(
      { getIndustryContext: async () => ({ selected: true, industryId: "equipment_dealer", pack: true, label: "Equipment Dealers & Distribution", description: "d", ontology: "AEMP", regulatoryFrameworks: ["ASC 606", "SOX"], subVerticals: [], policyPacks: ["AR"] }) },
      { industryId: "equipment_dealer" },
    );
    const out = await getIndustryContextTool.run(ctx, {});
    expect(out.proof!.industry).toMatchObject({ status: "measured", summary: expect.stringContaining("2 regulatory frameworks") });
  });
});

describe("routes (static)", () => {
  const src = readFileSync(join(__dirname, "..", "server", "routes", "astra.ts"), "utf8");

  it("guards every Astra route with use_astra and the enable flag", () => {
    const routes = src.match(/router\.(get|post|put|patch|delete)\("\/api\/astra[^"]*"[^\n]*/g) ?? [];
    expect(routes.length).toBeGreaterThanOrEqual(5);
    for (const r of routes) expect(r, r).toContain('checkPermission("use_astra")');
    expect(src).toContain('router.use("/api/astra", requireAstraEnabled)');
  });

  it("rate-limits both streaming routes", () => {
    for (const path of ["/messages/stream", "/actions/:actionId/stream"]) {
      const line = src.split("\n").find((l) => l.includes(path) && l.includes("router.post"))!;
      expect(line, path).toContain("llmInvokeRateLimiter");
    }
  });
});
