/**
 * What a step promises to produce, asked of whichever source can answer.
 *
 * Measured across all 198 teams on 2026-09-30: of 135 deterministic rule
 * fields, 95 are BARE names — `approved`, `requiresApproval`, `isClean` — and
 * judgeConditionField bailed on every one of them. Of the 16 bare-field edges
 * examined, 10 come from an agent step and 3 from an approval gate. That is
 * where the missing output contract actually bites: not on dotted fields, but
 * on the bare ones, whose producer is the step the EDGE comes from rather than
 * anything the field names.
 *
 * Two sources can answer decisively without anyone authoring a schema: an
 * approval gate, whose shape the platform itself writes, and an agent held to a
 * STRICT output contract, which is enforced at generation. Everything else must
 * answer "I don't know", and most of these tests are about that.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ agents: new Map<string, any>(), contracts: new Map<string, any[]>(), byId: new Map<string, any>() }));

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(async (id: string) => db.agents.get(id)),
    getOutputContracts: vi.fn(async (agentId?: string) => db.contracts.get(String(agentId)) ?? []),
    getOutputContract: vi.fn(async (id: string) => db.byId.get(id)),
  },
}));

const { stepOutputSchema, GATE_OUTPUT_SCHEMA } = await import("../server/step-contract");
const { judgeConditionField, schemaProperties } = await import("../shared/rule-fields");

const contract = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  enforcementMode: "strict",
  schemaDefinition: { type: "object", properties: { revokeRecommended: {}, rationale: {} } },
  ...over,
});

beforeEach(() => {
  db.agents = new Map([["a1", { id: "a1", runtimeConfig: {} }]]);
  db.contracts = new Map([["a1", [contract()]]]);
  db.byId = new Map([["c1", contract()]]);
});

describe("an approval gate knows its own shape", () => {
  it("declares what the engine writes, with no schema authored", async () => {
    const schema = await stepOutputSchema({ nodeType: "edge_gate" });
    expect(schemaProperties(schema)).toEqual(["approved", "decidedBy", "approvalId", "reason"]);
  });

  it("makes `approved` on a gate edge decisively satisfiable", async () => {
    const verdict = judgeConditionField({ field: "approved", stateKeys: new Set(), sourceSchema: GATE_OUTPUT_SCHEMA });
    expect(verdict).toEqual({ basis: "schema", satisfiable: true });
  });

  it("catches a misspelling of it decisively, with no runs at all", async () => {
    const verdict = judgeConditionField({ field: "aproved", stateKeys: new Set(), sourceSchema: GATE_OUTPUT_SCHEMA });
    expect(verdict.satisfiable).toBe(false);
    expect(verdict.basis).toBe("schema");
  });
});

describe("an agent answers only when something holds it to an answer", () => {
  it("uses a strict output contract", async () => {
    const schema = await stepOutputSchema({ nodeType: "internal_agent", refAgentId: "a1" });
    expect(schemaProperties(schema)).toEqual(["revokeRecommended", "rationale"]);
  });

  it("refuses a lenient one, which is repaired if possible and not guaranteed", async () => {
    db.contracts = new Map([["a1", [contract({ enforcementMode: "lenient" })]]]);
    expect(await stepOutputSchema({ nodeType: "internal_agent", refAgentId: "a1" })).toBeUndefined();
  });

  it("refuses when the agent has no contract at all", async () => {
    db.contracts = new Map();
    expect(await stepOutputSchema({ nodeType: "internal_agent", refAgentId: "a1" })).toBeUndefined();
  });

  it("prefers the contract the agent's runtime config names, as the runtime does", async () => {
    db.agents = new Map([["a1", { id: "a1", runtimeConfig: { outputContractId: "c2" } }]]);
    db.byId = new Map([["c2", contract({ id: "c2", schemaDefinition: { type: "object", properties: { chosen: {} } } })]]);
    const schema = await stepOutputSchema({ nodeType: "internal_agent", refAgentId: "a1" });
    expect(schemaProperties(schema)).toEqual(["chosen"]);
  });

  it("refuses a contract whose schema declares no properties", async () => {
    db.contracts = new Map([["a1", [contract({ schemaDefinition: { type: "object" } })]]]);
    expect(await stepOutputSchema({ nodeType: "internal_agent", refAgentId: "a1" })).toBeUndefined();
  });
});

describe("what a bare field does when nobody can answer", () => {
  it("stays satisfiable, because absence of a contract is not evidence of a dead branch", () => {
    const verdict = judgeConditionField({ field: "fraudRiskScore", stateKeys: new Set(), sourceSchema: undefined });
    expect(verdict).toEqual({ basis: "unknown", satisfiable: true });
  });

  it("is never judged from run history, unlike a dotted field", () => {
    // A bare field can be satisfied from a record nested inside the source's
    // output, which the indexed state paths do not reach — so "not seen in the
    // last N runs" would be wrong here in a way it is not for a dotted field.
    const verdict = judgeConditionField({
      field: "neverSeenAnywhere",
      stateKeys: new Set(["some_step"]),
      observedPaths: new Set(["some_step.value"]),
      runsObserved: 25,
    });
    expect(verdict).toEqual({ basis: "unknown", satisfiable: true });
  });
});

describe("the order the sources are asked in", () => {
  it("prefers a schema the author declared on the node", async () => {
    const declared = { type: "object", properties: { mine: {} } };
    const schema = await stepOutputSchema({ nodeType: "edge_gate", outputSchema: declared });
    expect(schema).toBe(declared);
  });

  it("derives an expression step's keys rather than looking for a contract", async () => {
    const schema = await stepOutputSchema({ nodeType: "expression", config: { expression: '{ "passed": true }' } });
    expect(schemaProperties(schema)).toEqual(["passed"]);
  });

  it("answers nothing for a step kind whose output no one records", async () => {
    expect(await stepOutputSchema({ nodeType: "knowledge_base" })).toBeUndefined();
    expect(await stepOutputSchema(null)).toBeUndefined();
  });
});
