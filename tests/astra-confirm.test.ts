/**
 * The Astra confirm loop end to end with attach_connector: the turn pauses on
 * a card carrying the policy warnings, Confirm links the connector (and the
 * read-only policy) exactly once, Not now changes nothing, and roles without
 * the permission never see the tool. In-memory store, scripted brain, fake
 * platform services.
 */
import { describe, it, expect, vi } from "vitest";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { attachConnectorTool } from "../server/astra/tools/attach-connector";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext, AstraEvent } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId, userId = "user-1"): AstraContext => ({ orgId: ORG, userId, role });

function fakePlatform() {
  const agents: Record<string, any> = {
    "ag-1": { id: "ag-1", name: "AR Data Gathering", organizationId: ORG, policyBindings: [] },
  };
  const connectors: Record<string, any> = {
    "srv-1": { id: "srv-1", name: "Dealer Operations" },
    "srv-2": { id: "srv-2", name: "Salesforce CRM" },
  };
  const tools: Record<string, any[]> = {
    "srv-1": [
      { id: "t1", name: "get_open_receivables", description: "List open AR", riskClassification: "low", annotations: null, sideEffectful: false },
      { id: "t2", name: "post_cash_receipt", description: "Create a cash receipt", riskClassification: "high", annotations: null, sideEffectful: true },
      { id: "t3", name: "void_invoice", description: "", riskClassification: "low", annotations: { destructive: true }, sideEffectful: true },
    ],
    "srv-2": [{ id: "s1", name: "update_account", description: "Update an account", riskClassification: "low", annotations: null, sideEffectful: true }],
  };
  const links: Array<{ id: string; agentId: string; serverId: string }> = [];
  const policies: any[] = [];
  const audit: any[] = [];

  const services = {
    getAgent: async (org: string, id: string) => (org === ORG ? agents[id] : undefined),
    getConnector: async (org: string, id: string) => (org === ORG ? connectors[id] : undefined),
    getConnectorTools: async (_org: string, id: string) => tools[id] ?? [],
    isConnectorLinked: async (_org: string, agentId: string, serverId: string) => links.some((l) => l.agentId === agentId && l.serverId === serverId),
    listAgentConnectors: async (_org: string, agentId: string) => links.filter((l) => l.agentId === agentId).map((l) => ({ serverId: l.serverId })),
    listPolicies: async () => policies,
    createPolicy: vi.fn(async (org: string, p: any) => {
      const row = { id: `pol-${policies.length + 1}`, organizationId: org, ...p };
      policies.push(row);
      return row;
    }),
    deletePolicy: vi.fn(async (_org: string, id: string) => {
      const i = policies.findIndex((p) => p.id === id);
      if (i >= 0) policies.splice(i, 1);
      return i >= 0;
    }),
    linkConnector: vi.fn(async (_org: string, agentId: string, serverId: string) => {
      const row = { id: `link-${links.length + 1}`, agentId, serverId };
      links.push(row);
      return row;
    }),
    recordAudit: vi.fn(async (org: string, userId: string | null, e: any) => {
      audit.push({ org, userId, ...e });
    }),
  };
  return { services, agents, tools, links, policies, audit };
}

function setup(steps: Parameters<typeof scriptedComplete>[0]) {
  const platform = fakePlatform();
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const complete = scriptedComplete(steps);
  const shellAudit = vi.fn(async () => {});
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, attachConnectorTool], hasPermission),
    complete,
    can: hasPermission,
    audit: shellAudit,
    services: platform.services,
    model: "test-model",
  };
  const events: AstraEvent[] = [];
  return { ...platform, store, threadId, complete, shellAudit, deps, events, onEvent: (e: AstraEvent) => events.push(e) };
}

const attach = (args: Record<string, unknown>) => ({ toolCalls: [{ name: "attach_connector", arguments: args }] });
const done = (text = "Attached.") => ({ reply: text, toolCalls: [{ name: "finish_turn", arguments: { suggestions: [] } }] });

async function pendingOf(t: ReturnType<typeof setup>) {
  return (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
}

describe("attach_connector through the confirm loop", () => {
  it("pauses with the policy warnings on the card and changes nothing until Confirm", async () => {
    const t = setup([attach({ agentId: "ag-1", connectorId: "srv-1", readOnly: true }), done()]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Attach Dealer Operations to AR Data Gathering, read-only", t.onEvent)).toBe("awaiting_confirmation");

    const action = await pendingOf(t);
    expect(action.summary).toBe("Attach Dealer Operations to AR Data Gathering, read-only");
    expect(action.details!.join(" ")).toContain("blocking 2 write tools");
    expect(action.warnings!.map((w) => w.title)).toEqual([
      "1 high-risk tool with no tool permissions policy",
      "1 write tool with no data handling policy",
    ]);
    expect(action.frozen).toEqual({ warningToolIds: ["t2", "t3"], blockedTools: ["post_cash_receipt", "void_invoice"] });
    expect(t.links).toHaveLength(0);
    expect(t.policies).toHaveLength(0);
    const card = t.events.find((e) => e.type === "awaiting_confirmation") as Extract<AstraEvent, { type: "awaiting_confirmation" }>;
    expect(card.message.pendingAction!.warnings).toHaveLength(2);
  });

  it("on Confirm links the connector, adds a strict agent-scoped policy blocking the write tools, and audits it", async () => {
    const t = setup([attach({ agentId: "ag-1", connectorId: "srv-1", readOnly: true }), done()]);
    await runTurn(t.deps, as("admin"), t.threadId, "Attach it read-only", t.onEvent);
    expect(await resolveAction(t.deps, as("admin"), t.threadId, (await pendingOf(t)).id, "confirm", t.onEvent)).toBe("idle");

    expect(t.links).toEqual([{ id: "link-1", agentId: "ag-1", serverId: "srv-1" }]);
    expect(t.policies).toHaveLength(1);
    expect(t.policies[0]).toMatchObject({
      organizationId: ORG,
      domain: "tool_permissions",
      scopeType: "agent",
      scopeId: "ag-1",
      status: "active",
      policyJson: { enforcement: "strict", blockedTools: ["post_cash_receipt", "void_invoice"] },
    });
    expect(t.audit.map((a) => a.action)).toEqual(["agent.mcp_policy_mismatch", "agent.mcp_policy_mismatch", "agent.mcp_server_linked"]);
    expect(t.audit.every((a) => a.org === ORG && a.userId === "user-1")).toBe(true);
    expect(t.shellAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "astra_shell.tool_executed", objectId: "attach_connector" }));

    const final = t.store.threadMessages(t.threadId).at(-1)!;
    expect(final.proof!.compliance).toMatchObject({ summary: expect.stringContaining("Confirmed by you") });
    expect(final.artifacts[0]).toMatchObject({ fullViewHref: "/agents/ag-1" });
  });

  it("does not create a policy when read-only wasn't asked for", async () => {
    const t = setup([attach({ agentId: "ag-1", connectorId: "srv-1" }), done()]);
    await runTurn(t.deps, as("admin"), t.threadId, "Attach it", t.onEvent);
    await resolveAction(t.deps, as("admin"), t.threadId, (await pendingOf(t)).id, "confirm", t.onEvent);
    expect(t.links).toHaveLength(1);
    expect(t.services.createPolicy).not.toHaveBeenCalled();
  });

  it("on Not now links nothing, tells the model, and the turn continues", async () => {
    const t = setup([
      attach({ agentId: "ag-1", connectorId: "srv-1", readOnly: true }),
      (messages) => {
        expect(JSON.parse(messages.filter((m) => m.role === "tool").at(-1)!.content)).toMatchObject({ declined: true });
        return result("Left as it was.", [call("finish_turn", { suggestions: [] })]);
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Attach it read-only", t.onEvent);
    expect(await resolveAction(t.deps, as("admin"), t.threadId, (await pendingOf(t)).id, "cancel", t.onEvent)).toBe("idle");
    expect(t.links).toHaveLength(0);
    expect(t.policies).toHaveLength(0);
    expect(t.audit).toHaveLength(0);
    expect(t.store.threadMessages(t.threadId).at(-1)!.markdown).toBe("Left as it was.");
  });

  it("runs nothing the second time Confirm arrives", async () => {
    const t = setup([attach({ agentId: "ag-1", connectorId: "srv-1", readOnly: true }), done()]);
    await runTurn(t.deps, as("admin"), t.threadId, "Attach it read-only", t.onEvent);
    const { id } = await pendingOf(t);
    await resolveAction(t.deps, as("admin"), t.threadId, id, "confirm", t.onEvent);
    await expect(resolveAction(t.deps, as("admin"), t.threadId, id, "confirm", t.onEvent)).rejects.toThrow(/already have been decided/);
    expect(t.services.linkConnector).toHaveBeenCalledTimes(1);
    expect(t.services.createPolicy).toHaveBeenCalledTimes(1);
  });

  it("refuses on Confirm if the connector gained a write tool after the card was shown", async () => {
    const t = setup([
      attach({ agentId: "ag-1", connectorId: "srv-1", readOnly: true }),
      (messages) => {
        expect(JSON.parse(messages.filter((m) => m.role === "tool").at(-1)!.content)).toMatchObject({ ok: false, error: expect.stringContaining("changed after the confirm card") });
        return result("The connector changed; here are the new warnings.", [call("finish_turn", { suggestions: [] })]);
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Attach it read-only", t.onEvent);
    t.tools["srv-1"].push({ id: "t4", name: "delete_customer", description: "", riskClassification: "low", annotations: null, sideEffectful: true });
    await resolveAction(t.deps, as("admin"), t.threadId, (await pendingOf(t)).id, "confirm", t.onEvent);
    expect(t.links).toHaveLength(0);
    expect(t.policies).toHaveLength(0);
  });

  it("removes the read-only policy again if the link can't be written", async () => {
    const t = setup([attach({ agentId: "ag-1", connectorId: "srv-1", readOnly: true }), done("It didn't work.")]);
    t.services.linkConnector.mockRejectedValueOnce(new Error("database unavailable"));
    await runTurn(t.deps, as("admin"), t.threadId, "Attach it read-only", t.onEvent);
    await resolveAction(t.deps, as("admin"), t.threadId, (await pendingOf(t)).id, "confirm", t.onEvent);
    expect(t.services.deletePolicy).toHaveBeenCalledWith(ORG, "pol-1");
    expect(t.policies).toHaveLength(0);
    expect(t.shellAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "astra_shell.tool_failed" }));
  });

  it("warns when read-only would also block a same-named tool on another connector", async () => {
    const t = setup([attach({ agentId: "ag-1", connectorId: "srv-1", readOnly: true })]);
    t.links.push({ id: "link-0", agentId: "ag-1", serverId: "srv-2" });
    t.tools["srv-2"].push({ id: "s2", name: "void_invoice", description: "", riskClassification: "low", annotations: null, sideEffectful: true });
    await runTurn(t.deps, as("admin"), t.threadId, "Attach it read-only", t.onEvent);
    const warning = (await pendingOf(t)).warnings!.find((w) => w.title.includes("another connector"));
    expect(warning?.detail).toContain("void_invoice");
  });

  it("says so without a card when there is nothing to confirm", async () => {
    const t = setup([
      attach({ agentId: "ag-1", connectorId: "srv-1" }),
      (messages) => {
        expect(JSON.parse(messages.filter((m) => m.role === "tool").at(-1)!.content).error).toContain("already attached");
        return result("It's already attached.", [call("finish_turn", { suggestions: [] })]);
      },
    ]);
    t.links.push({ id: "link-0", agentId: "ag-1", serverId: "srv-1" });
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Attach it", t.onEvent)).toBe("idle");
  });

  it("refuses read-only for a role that can link connectors but not create policies", async () => {
    expect(hasPermission("agent_engineer", "manage_mcp_servers")).toBe(true);
    expect(hasPermission("agent_engineer", "create_modify_policies")).toBe(false);
    const t = setup([
      attach({ agentId: "ag-1", connectorId: "srv-1", readOnly: true }),
      (messages) => {
        expect(JSON.parse(messages.filter((m) => m.role === "tool").at(-1)!.content).error).toContain("can't create policies");
        return result("You'll need an admin for read-only.", [call("finish_turn", { suggestions: [] })]);
      },
    ]);
    expect(await runTurn(t.deps, as("agent_engineer"), t.threadId, "Attach it read-only", t.onEvent)).toBe("idle");
    expect(t.links).toHaveLength(0);
  });

  it("never offers the tool to a role without manage_mcp_servers, and refuses a call to it", async () => {
    for (const role of ["finance", "outcome_owner", "ops_sre", "domain_expert"] as RoleId[]) {
      const t = setup([
        attach({ agentId: "ag-1", connectorId: "srv-1" }),
        (messages) => {
          expect(JSON.parse(messages.filter((m) => m.role === "tool").at(-1)!.content).error).toMatch(/No tool named "attach_connector"/);
          return result("I can't attach connectors for your role.", [call("finish_turn", { suggestions: [] })]);
        },
      ]);
      await runTurn(t.deps, as(role), t.threadId, "Attach it", t.onEvent);
      const offered = (t.complete.requests[0].options.tools ?? []).map((d) => d.name);
      expect(offered, role).not.toContain("attach_connector");
      expect(t.links, role).toHaveLength(0);
    }
  });
});
