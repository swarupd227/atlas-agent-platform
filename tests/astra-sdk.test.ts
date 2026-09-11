import { describe, it, expect } from "vitest";
import { defineTeam, defineFlow, ManifestBuildError } from "../shared/astra-sdk";
import { validateManifest, manifestToTeam, teamToManifest, normalizeForCompare } from "../shared/manifest-v2";

// Initiative 01 P2 — the code-native builder compiles to a VALID v2 manifest
// (the same format the routes speak) and refuses to emit a broken graph.

describe("Astra SDK — team builder", () => {
  const build = () =>
    defineTeam({ name: "Claims Intake & Triage", version: 1 })
      .state("paidAmount", { type: "number", reducer: "last_wins", writableBy: ["*"] })
      .agent("intake", { label: "Claim Intake", agent: "fnol-intake-agent", stateKey: "intake", timeoutMs: 30000, retryPolicy: { maxAttempts: 2, backoffMs: [1000, 2000] } })
      .gate("adjuster", { label: "Adjuster Approval", gateType: "approval", policy: "adjuster-authority" })
      .edge("intake", "adjuster", { evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "amount", operator: ">", value: 10000 }] }, failureMode: "escalate" })
      .build();

  it("compiles to a valid v2 team manifest", () => {
    const m = build();
    expect(m.apiVersion).toBe("astra/v2");
    expect(m.kind).toBe("team");
    expect(m.metadata.slug).toBe("claims-intake-triage");
    expect(validateManifest(m)).toEqual([]);
    expect(m.spec.nodes.map(n => n.key)).toEqual(["intake", "adjuster"]);
    expect(m.spec.stateSchema?.paidAmount?.reducer).toBe("last_wins");
    const gate = m.spec.nodes.find(n => n.key === "adjuster")!;
    expect(gate.type).toBe("edge_gate");
    expect(gate.policy).toBe("adjuster-authority");
  });

  it("canonicalizes to the stable route format (SDK output is accepted and idempotent)", () => {
    const m = build();
    // The SDK emits a sparse-but-valid manifest; the route serializers accept it
    // and expand it to the canonical (fully-populated) form. Canonicalizing that
    // form again must be a no-op up to cosmetics — proving the SDK speaks the
    // exact format the routes round-trip, deterministically.
    const canonical = teamToManifest(manifestToTeam(m));
    const again = teamToManifest(manifestToTeam(canonical));
    expect(normalizeForCompare(again)).toEqual(normalizeForCompare(canonical));
    // And the SDK's own output is valid on its own terms.
    expect(canonical.spec.nodes.map(n => n.key)).toEqual(m.spec.nodes.map(n => n.key));
  });

  it("throws ManifestBuildError on a dangling edge (validate-on-compile)", () => {
    expect(() =>
      defineTeam("Broken")
        .agent("a", { label: "A" })
        .edge("a", "ghost")
        .build(),
    ).toThrow(ManifestBuildError);
  });

  it("throws on a duplicate node key", () => {
    expect(() =>
      defineTeam("Dup").agent("a", { label: "A" }).agent("a", { label: "A2" }).edge("a", "a").build(),
    ).toThrow(ManifestBuildError);
  });
});

describe("Astra SDK — flow builder", () => {
  it("compiles to a valid v2 flow manifest with a conditioned branch", () => {
    const m = defineFlow("Returns & Refunds")
      .node("t", "trigger", "Return requested")
      .node("d", "make_decision", "Within 30 days?")
      .node("e", "end", "Closed")
      .edge("t", "d")
      .edge("d", "e", { label: "Yes", condition: "days <= 30" })
      .build();
    expect(m.kind).toBe("flow");
    expect(validateManifest(m)).toEqual([]);
    expect(m.spec.edges.find(e => e.to === "e")?.condition).toBe("days <= 30");
  });

  it("refuses a flow whose edge references a missing node", () => {
    expect(() => defineFlow("Bad").node("a", "trigger", "A").edge("a", "nope").build()).toThrow(ManifestBuildError);
  });
});
