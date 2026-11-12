/** Regression: linking an outcome must not erase explicit agent bindings. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const rows = {
  agent: null as any,
  policies: [] as any[],
};

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: async () => rows.agent,
    getPolicies: async () => rows.policies,
  },
}));

import { resolvePolicyBundle } from "../server/routes/helpers";

beforeEach(() => {
  rows.agent = {
    id: "agent-1",
    outcomeId: "outcome-1",
    policySelection: "explicit",
    policyBindings: [{ policyId: "osha", enforcement: "hard" }],
  };
  rows.policies = [
    { id: "osha", name: "OSHA QA", status: "active", scopeType: "org", scopeId: null, domain: "safety", policyJson: { enforcement: "monitor" } },
    { id: "itar", name: "ITAR", status: "active", scopeType: "outcome", scopeId: "outcome-1", domain: "export_control", policyJson: { enforcement: "hard" } },
  ];
});

describe("agent outcome policy bindings", () => {
  it("resolves both the manual binding and the linked outcome policy", async () => {
    const bundle = await resolvePolicyBundle("agent-1", "org-1");

    expect(bundle.appliedPolicies).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "osha", enforcement: "hard" }),
      expect.objectContaining({ id: "itar", scope: "outcome" }),
    ]));
  });

  it("does not rewrite canonical bindings into the legacy object shape after creation", () => {
    const source = readFileSync(join(__dirname, "..", "server", "routes", "agents.ts"), "utf8");
    const createHandler = source.slice(
      source.indexOf('router.post("/api/agents"'),
      source.indexOf('router.post("/api/agents/bulk-action"'),
    );

    expect(createHandler).not.toContain("outcomeBindings");
    expect(createHandler).not.toMatch(/updateAgent\(agent\.id,\s*\{\s*policyBindings:/);
  });
});
