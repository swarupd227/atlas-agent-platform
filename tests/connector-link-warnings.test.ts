/**
 * Policy warnings for linking a connector to an agent (server/connector-link.ts).
 * The fixtures freeze the behaviour of POST /api/agents/:id/mcp-servers, which
 * these checks were extracted from, including its quirks.
 */
import { describe, it, expect } from "vitest";
import { assessConnectorLinkWarnings, normalizePolicyBindings, type LinkCheckTool } from "../server/connector-link";

const tool = (id: string, name: string, extra: Partial<LinkCheckTool> = {}): LinkCheckTool => ({ id, name, description: "", riskClassification: "low", annotations: null, ...extra });

const TOOLS: LinkCheckTool[] = [
  tool("t-read", "get_open_receivables", { description: "List open AR by customer" }),
  tool("t-post", "post_cash_receipt", { description: "Create a cash receipt", riskClassification: "high" }),
  tool("t-void", "void_invoice", { annotations: { destructive: true } }),
  tool("t-idem", "apply_credit", { annotations: { idempotentHint: false } }),
  tool("t-crit", "export_ledger", { riskClassification: "CRITICAL" }),
];

const POLICIES = [
  { id: "p-tools", domain: "tool_permissions", status: "active" },
  { id: "p-data", domain: "data_handling", status: "active" },
  { id: "p-old", domain: "tool_permissions", status: "archived" },
];

describe("assessConnectorLinkWarnings", () => {
  it("warns on high-risk tools and write tools when the agent has no governing policy", () => {
    const warnings = assessConnectorLinkWarnings({ policyBindings: [] }, TOOLS, POLICIES);
    expect(warnings.map((w) => [w.toolId, w.requiredPolicyDomain])).toEqual([
      ["t-post", "tool_permissions"],
      ["t-crit", "tool_permissions"],
      ["t-void", "data_handling"],
    ]);
    expect(warnings[1].riskClassification).toBe("critical");
  });

  it("gives a high-risk write tool one warning, not two", () => {
    const warnings = assessConnectorLinkWarnings({ policyBindings: [] }, TOOLS, POLICIES);
    expect(warnings.filter((w) => w.toolId === "t-post")).toHaveLength(1);
  });

  it("selects an idempotentHint:false tool but does not warn on it (as the route does)", () => {
    const warnings = assessConnectorLinkWarnings({ policyBindings: [] }, [TOOLS[3]], POLICIES);
    expect(warnings).toEqual([]);
  });

  it("a bound tool_permissions policy clears every warning", () => {
    expect(assessConnectorLinkWarnings({ policyBindings: [{ policyId: "p-tools" }] }, TOOLS, POLICIES)).toEqual([]);
  });

  it("a bound data_handling policy clears write warnings but not high-risk ones", () => {
    const warnings = assessConnectorLinkWarnings({ policyBindings: [{ policyId: "p-data" }] }, TOOLS, POLICIES);
    expect(warnings.map((w) => w.toolId)).toEqual(["t-post", "t-crit"]);
  });

  it("ignores a bound policy that isn't active", () => {
    const warnings = assessConnectorLinkWarnings({ policyBindings: [{ policyId: "p-old" }] }, TOOLS, POLICIES);
    expect(warnings.map((w) => w.toolId)).toContain("t-post");
  });

  it("accepts a domain written directly on the binding", () => {
    expect(assessConnectorLinkWarnings({ policyBindings: [{ name: "Tools", domain: "tool_permissions" }] }, TOOLS, [])).toEqual([]);
  });

  it("handles the { policies: [names] } binding shape from teams created from proposals without throwing", () => {
    const agent = { policyBindings: { policies: ["AR Collections Policy", "PII Handling"] } };
    expect(normalizePolicyBindings(agent.policyBindings)).toEqual([{ name: "AR Collections Policy" }, { name: "PII Handling" }]);
    // Names carry no id or domain, so they don't count as governing policies.
    expect(assessConnectorLinkWarnings(agent, TOOLS, POLICIES)).toHaveLength(3);
  });

  it("returns nothing for a read-only, low-risk connector", () => {
    expect(assessConnectorLinkWarnings({ policyBindings: null }, [TOOLS[0]], POLICIES)).toEqual([]);
  });
});
