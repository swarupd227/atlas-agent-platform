/**
 * Tool risk classification: the reconcile rule, and a ratchet tying the Dealer
 * Operations catalog's declarations to the handlers that actually write.
 *
 * MEASURED ON AZURE 2026-10-27. Both Dealer Operations connectors returned 57
 * tools, every one `riskClassification: "low"` -- `post_allocation`, which posts
 * journal entries to branch ledgers, classified exactly like a lookup. Nothing
 * was wrong with the data entry: `RealMcpToolDef` carried no risk field, so a
 * connector could not say which of its tools write, and both registrars stamped
 * one blanket value on everything they created.
 *
 * The cost was a control that could not fire. `assessConnectorLinkWarnings`
 * demands a `tool_permissions` policy only for a high/critical tool, so for this
 * connector that branch was unreachable and granting it asked only for the
 * `data_handling` policy its write-word branch accepts.
 *
 * So the declarations are the fix, and these tests are what keeps them true.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { TOOL_CATALOG } from "../server/integrations/dealer-operations/catalog";
import { reconcileToolRisk, toolRiskRank, isMcpToolRisk, TOOL_RISK_ORDER } from "../server/tool-risk";
import { assessConnectorLinkWarnings } from "../server/connector-link";

const DEALER_DIR = path.join(__dirname, "..", "server", "integrations", "dealer-operations");
const src = (f: string) => readFileSync(path.join(DEALER_DIR, f), "utf8").replace(/\r\n/g, "\n");

/**
 * NO TRAILING \b. With one, `UPDATE\s+\w\b` matches only a ONE-LETTER table
 * name, so the first run of this scan reported 7 writers instead of 11 and
 * called `submit_claim` -- `UPDATE dealer.warranty_claims SET status =
 * 'submitted'` -- a read. The empty-scan guard below is what makes a repeat of
 * that fail loudly instead of passing quietly.
 */
const WRITE_SQL = /\b(?:INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM)/i;

/** tool name -> the handler body that implements it, read from the source. */
function handlerBodies(): Map<string, { file: string; body: string }> {
  const out = new Map<string, { file: string; body: string }>();
  for (const file of readdirSync(DEALER_DIR).filter((f) => f.startsWith("tools-") && f.endsWith(".ts"))) {
    const text = src(file);
    // Each exported handler's body runs to the start of the next one. Boundaries
    // are found, never assumed from a fixed offset -- a slice(at, at + N) window
    // over this file would shift with every edit above it.
    const marks = [...text.matchAll(/^export async function (\w+)\s*\(/gm)].map((m) => ({ at: m.index ?? 0, name: m[1] }));
    marks.forEach((m, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].at : text.length;
      out.set(m.name, { file, body: text.slice(m.at, end) });
    });
  }
  return out;
}

const writers = (() => {
  const bodies = handlerBodies();
  return TOOL_CATALOG.filter((t) => WRITE_SQL.test(bodies.get(t.name)?.body ?? "")).map((t) => t.name).sort();
})();

const declared = TOOL_CATALOG.filter((t) => t.riskClassification && t.riskClassification !== "low")
  .map((t) => t.name).sort();

describe("dealer-operations catalog declares what its handlers do", () => {
  it("found the catalog and a handler for every tool in it", () => {
    // Nothing below means anything if the scan read nothing: an empty source
    // list satisfies every set comparison here. Four instruments in two days
    // reported clean having read nothing.
    const bodies = handlerBodies();
    expect(TOOL_CATALOG.length).toBeGreaterThanOrEqual(50);
    const unmatched = TOOL_CATALOG.filter((t) => !bodies.has(t.name)).map((t) => t.name);
    expect(unmatched).toEqual([]);
    expect(writers.length).toBeGreaterThanOrEqual(8);
  });

  it("classifies exactly the handlers that write, no more and no fewer", () => {
    // Both directions matter. Missing one is an unclassified write; an extra one
    // is a read dressed as dangerous, which trains people to ignore the field.
    expect(declared).toEqual(writers);
  });

  it("keeps post_allocation high, with the ledger writes beside it", () => {
    const risk = (name: string) => TOOL_CATALOG.find((t) => t.name === name)?.riskClassification;
    expect(risk("post_allocation")).toBe("high");
    expect(risk("post_warranty_receivable")).toBe("high");
    expect(risk("release_invoice")).toBe("high");
    expect(risk("apply_credit_hold")).toBe("high");
    expect(risk("submit_claim")).toBe("high");
    expect(risk("prepare_credit_memo")).toBe("high");
    // A read stays undeclared rather than being given a value that means "low".
    expect(risk("get_open_ar")).toBeUndefined();
    expect(risk("propose_allocation")).toBeUndefined();
  });

  it("classifies get_claim_status, which reads like a read and writes", () => {
    // The OEM adjudication simulator stands in for the manufacturer portal and
    // persists the verdict it computes. `isSideEffectful` keys on the method and
    // the name, so a get_* that writes is invisible to it -- the declaration is
    // the only place this is recorded.
    expect(TOOL_CATALOG.find((t) => t.name === "get_claim_status")?.riskClassification).toBe("medium");
  });
});

describe("the declaration reaches the control that reads it", () => {
  const toolRows = TOOL_CATALOG.map((t, i) => ({
    id: `t-${i}`,
    name: t.name,
    description: t.description,
    riskClassification: t.riskClassification ?? "low",
  }));
  const policies = [
    { id: "pol-data", domain: "data_handling", status: "active" },
    { id: "pol-tools", domain: "tool_permissions", status: "active" },
  ];

  it("asks for a tool_permissions policy for post_allocation when only data_handling is bound", () => {
    // This is the warning that could not exist before: with every tool at "low",
    // the high-risk branch never selected anything, and a bound data_handling
    // policy silenced the write-word branch.
    const warnings = assessConnectorLinkWarnings(
      { policyBindings: [{ policyId: "pol-data", domain: "data_handling" }] },
      toolRows,
      policies,
    );
    const onPost = warnings.filter((w) => w.toolName === "post_allocation");
    expect(onPost).toHaveLength(1);
    expect(onPost[0].requiredPolicyDomain).toBe("tool_permissions");
    expect(onPost[0].riskClassification).toBe("high");
  });

  it("is silent once a tool_permissions policy is bound", () => {
    // The discriminating half. Without it, a rule that warns about everything
    // passes the test above exactly as well as a correct one.
    const warnings = assessConnectorLinkWarnings(
      { policyBindings: [{ policyId: "pol-tools", domain: "tool_permissions" }] },
      toolRows,
      policies,
    );
    expect(warnings).toEqual([]);
  });

  it("warned about nothing high before the declarations existed", () => {
    // Proves the change is what moved the outcome, by re-running the same rule
    // over the same tools with the classifications stripped.
    const asBefore = toolRows.map((t) => ({ ...t, riskClassification: "low" }));
    const warnings = assessConnectorLinkWarnings(
      { policyBindings: [{ policyId: "pol-data", domain: "data_handling" }] },
      asBefore,
      policies,
    );
    expect(warnings.filter((w) => w.requiredPolicyDomain === "tool_permissions")).toEqual([]);
  });
});

describe("reconcileToolRisk: a declaration is a floor, never a ceiling", () => {
  it("leaves a row alone when nothing is declared", () => {
    expect(reconcileToolRisk(undefined, "low")).toBeNull();
    expect(reconcileToolRisk(null, null)).toBeNull();
    // Not one of ours is not a declaration either.
    expect(reconcileToolRisk("severe", "low")).toBeNull();
  });

  it("raises a stored value to the declared one", () => {
    expect(reconcileToolRisk("high", "low")).toBe("high");
    expect(reconcileToolRisk("medium", "low")).toBe("medium");
    expect(reconcileToolRisk("critical", "high")).toBe("critical");
  });

  it("never lowers one, so an operator's own classification survives", () => {
    // riskClassification is operator-settable (PATCH in routes/runtime.ts). A
    // sync that wrote the declaration outright would undo that decision; one
    // that only raises cannot.
    expect(reconcileToolRisk("medium", "high")).toBeNull();
    expect(reconcileToolRisk("low", "critical")).toBeNull();
  });

  it("makes no change when the row already matches", () => {
    for (const r of TOOL_RISK_ORDER) expect(reconcileToolRisk(r, r)).toBeNull();
  });

  it("takes the declaration when the row holds nothing usable", () => {
    expect(reconcileToolRisk("high", null)).toBe("high");
    expect(reconcileToolRisk("high", undefined)).toBe("high");
    expect(reconcileToolRisk("high", "")).toBe("high");
    expect(reconcileToolRisk("high", "unknown-value")).toBe("high");
    // Case is not significance: a stored value differing only in case is the
    // same value, and a lower one in capitals still raises.
    expect(reconcileToolRisk("high", "HIGH")).toBeNull();
    expect(reconcileToolRisk("HIGH", "high")).toBeNull();
    expect(reconcileToolRisk("high", "LOW")).toBe("high");
  });

  it("ranks and recognises the vocabulary", () => {
    expect(TOOL_RISK_ORDER).toEqual(["low", "medium", "high", "critical"]);
    expect(toolRiskRank("HIGH")).toBe(2);
    expect(toolRiskRank("nonsense")).toBe(-1);
    expect(toolRiskRank(null)).toBe(-1);
    expect(isMcpToolRisk("critical")).toBe(true);
    expect(isMcpToolRisk("severe")).toBe(false);
  });
});

describe("the registrars honour a declaration", () => {
  const registrar = (f: string) => readFileSync(path.join(__dirname, "..", "server", f), "utf8").replace(/\r\n/g, "\n");

  it("has no blanket riskClassification left at a createMcpServerTool site", () => {
    // The defect was a hardcoded value at the point of insert: "medium" in the
    // enterprise registrar, "low" in the mock one, on every tool. Asserted on
    // the source because the alternative is a database to stand up.
    for (const f of ["integrations/register.ts", "mock-mcp/register.ts"]) {
      const text = registrar(f);
      expect(text).toMatch(/riskClassification: toolDef\.riskClassification \?\? "(low|medium)"/);
      expect(text).not.toMatch(/riskClassification: "(low|medium)",/);
    }
  });

  it("reconciles rows that already exist, not only new ones", () => {
    // A declaration alone changes nothing live: createMcpServerTool runs once per
    // tool, and every Dealer Operations row already existed -- at "low", below
    // even that registrar's own default.
    const text = registrar("integrations/register.ts");
    expect(text).toContain("reconcileDeclaredToolRisk");
    expect(text).toContain("reconcileToolRisk");
    // Sibling rows are governed by their own row, so they must be in scope.
    expect(text).toMatch(/integrationId === def\.server\.integrationId/);
    // And the correction is on the record.
    expect(text).toContain("tool_catalog.tool_risk_reclassified");
  });
});
