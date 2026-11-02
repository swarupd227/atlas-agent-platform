/**
 * Policies are opt-in for agents created in the wizard (agents.policySelection
 * = "explicit"): no organization, outcome or environment policy attaches by
 * default, the wizard only recommends. Agents created before keep automatic
 * organization policies.
 *
 * MOCKED: storage. REAL: resolvePolicyBundle, recommendPolicies, the agent
 * update schema, and the startup migration text.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(),
    getPolicies: vi.fn(),
    getOntologyConcept: vi.fn(),
    getOrganization: vi.fn(),
  },
}));

import { resolvePolicyBundle } from "../server/routes/helpers";
import { storage } from "../server/storage";
import { recommendPolicies } from "../shared/policy-recommendations";
import { updateAgentSchema, insertAgentSchema } from "../shared/schema";

const m = vi.mocked(storage as any);

const policy = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: `Policy ${id}`, domain: "compliance", scopeType: "org", scopeId: null, status: "active", version: 1,
  description: "", policyJson: { enforcement: "monitor" }, ...extra,
});

const LIBRARY = [
  policy("org-wide"),
  policy("outcome", { scopeType: "outcome", scopeId: "out-1" }),
  policy("env", { scopeType: "env", scopeId: "production" }),
  policy("mine", { scopeType: "agent", scopeId: "a1" }),
  policy("picked"),
];

async function appliedIds(agent: Record<string, unknown>) {
  m.getAgent.mockResolvedValue({ id: "a1", organizationId: "o1", outcomeId: "out-1", environment: "production", policyBindings: [], ...agent });
  m.getPolicies.mockResolvedValue(LIBRARY);
  const bundle = await resolvePolicyBundle("a1", "o1");
  return bundle.appliedPolicies.map((p) => p.id).sort();
}

beforeEach(() => {
  for (const fn of Object.values(storage as any)) vi.mocked(fn as any).mockReset();
});

describe("an agent whose policies are chosen explicitly", () => {
  it("gets no organization, outcome or environment policy by default", async () => {
    expect(await appliedIds({ policySelection: "explicit" })).toEqual(["mine"]);
  });

  it("gets exactly the policies chosen for it", async () => {
    const ids = await appliedIds({ policySelection: "explicit", policyBindings: [{ policyId: "picked", enforcement: "hard" }] });
    expect(ids).toEqual(["mine", "picked"]);
  });

  it("can still choose an organization-wide policy, which then applies at the chosen enforcement", async () => {
    m.getAgent.mockResolvedValue({ id: "a1", organizationId: "o1", policySelection: "explicit", policyBindings: [{ policyId: "org-wide", enforcement: "hard" }] });
    m.getPolicies.mockResolvedValue([policy("org-wide", { policyJson: { enforcement: "monitor", blockedTools: ["send_email"] } })]);
    const bundle = await resolvePolicyBundle("a1", "o1");
    expect(bundle.appliedPolicies.map((p) => p.id)).toEqual(["org-wide"]);
    expect(bundle.blockedTools).toContain("send_email");
  });
});

describe("an agent created before opt-in (no policySelection)", () => {
  it("keeps automatic organization, outcome and environment policies", async () => {
    expect(await appliedIds({})).toEqual(["env", "mine", "org-wide", "outcome", "picked"]);
  });
});

describe("policySelection is set once, at creation", () => {
  it("is accepted when an agent is created", () => {
    expect(insertAgentSchema.parse({ name: "A", policySelection: "explicit" }).policySelection).toBe("explicit");
  });

  it("is dropped from an edit, so an existing agent cannot shed its organization policies", () => {
    expect("policySelection" in updateAgentSchema.parse({ name: "A", policySelection: "explicit" })).toBe(false);
  });

  it("has a column added at startup", () => {
    const db = readFileSync(join(__dirname, "..", "server", "db.ts"), "utf8");
    expect(db).toContain("ALTER TABLE agents ADD COLUMN IF NOT EXISTS policy_selection TEXT;");
  });
});

describe("recommendPolicies", () => {
  const lib = [
    { id: "pci", name: "PCI-DSS Card Data Handling", domain: "data_handling", description: "", status: "active" },
    { id: "bank-tag", name: "Loan explainability", domain: "output_control", description: "", status: "active", policyJson: { industry: "financial_services" } },
    { id: "universal", name: "No PII in outputs", domain: "output_control", description: "", status: "active", policyJson: { industry: "cross_industry" } },
    { id: "factory", name: "Forklift safety", domain: "tool_permissions", description: "", status: "active", policyJson: { industry: "manufacturing" } },
    { id: "plain", name: "Shipping rerouting", domain: "allowed_actions", description: "", status: "active" },
    { id: "draft", name: "GLBA privacy draft", domain: "data_handling", description: "", status: "draft" },
  ];

  it("recommends what meets a requirement, then what is written for the industry, then universal rules", () => {
    const recs = recommendPolicies("financial_services", lib, "Financial Services");
    expect(recs.map((r) => r.policy.id)).toEqual(["pci", "bank-tag", "universal"]);
    expect(recs[0].reasons).toEqual(["Meets PCI-DSS (data_handling)"]);
    expect(recs[1].reasons).toEqual(["Written for Financial Services"]);
    expect(recs[2].reasons).toEqual(["Written for every industry"]);
  });

  it("never recommends another industry's rules, untagged unrelated policies, or inactive ones", () => {
    const ids = recommendPolicies("financial_services", lib).map((r) => r.policy.id);
    expect(ids).not.toContain("factory");
    expect(ids).not.toContain("plain");
    expect(ids).not.toContain("draft");
  });

  it("with no industry, or a custom one, recommends only universal rules", () => {
    expect(recommendPolicies(null, lib).map((r) => r.policy.id)).toEqual(["universal"]);
    expect(recommendPolicies("custom", lib).map((r) => r.policy.id)).toEqual(["universal"]);
  });
});
