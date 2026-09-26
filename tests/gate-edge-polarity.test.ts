/**
 * A checkpoint's decision has to reach its branches with the right sign.
 *
 * The engine trusts a gate's own {approved: boolean} ahead of the edge's
 * condition, because conditions authored against a description of the gate
 * routinely name a field the gate never emits. That part was right. Handing the
 * SAME boolean to every outgoing edge was not: a checkpoint drawn with an
 * approve branch and a decline branch gave both `true` on approval, so both ran.
 *
 * Live 2026-09-26, in one run: policy POL-2026-8891-CP was bound, the ledger
 * journal was posted, the bordereau was queued -- and "Notify Broker - Declined"
 * ran too and recorded {"notified": true}. The submission was bound and
 * declined at once, and the run reported completed_with_skips.
 */
import { describe, it, expect } from "vitest";
import { gateEdgePolarity, gateEdgeSatisfied } from "../shared/gate-edge-polarity";

const rule = (field: string, value: unknown, operator: "==" | "!=" = "==") =>
  ({ combinator: "AND" as const, conditions: [{ field, operator, value }] });

describe("reading which side of a checkpoint an edge is on", () => {
  it("reads a compiled rule ahead of prose", () => {
    expect(gateEdgePolarity({ rule: rule("approved", true) as any })).toBe("approve");
    expect(gateEdgePolarity({ rule: rule("approved", false) as any })).toBe("reject");
    expect(gateEdgePolarity({ rule: rule("rejected", true) as any })).toBe("reject");
    expect(gateEdgePolarity({ rule: rule("declined", false) as any })).toBe("approve");
    // Qualified by state key, as an authored gate now writes it.
    expect(gateEdgePolarity({ rule: rule("contract_certainty_review.approved", true) as any })).toBe("approve");
    // != flips it.
    expect(gateEdgePolarity({ rule: rule("approved", true, "!=") as any })).toBe("reject");
    // A rule authored by a model may carry the string, not the boolean.
    expect(gateEdgePolarity({ rule: rule("approved", "false") as any })).toBe("reject");
  });

  it("reads the author's own words when there is no rule", () => {
    // The two edges off the carrier checkpoint in the live flow.
    expect(gateEdgePolarity({ condition: "Carrier approves breach exception" })).toBe("approve");
    expect(gateEdgePolarity({ condition: "Carrier declines breach exception" })).toBe("reject");
    expect(gateEdgePolarity({ condition: "Endorsement rejected AND fewer than 2 redraft rounds used" })).toBe("reject");
    expect(gateEdgePolarity({ label: "Signed off" })).toBe("approve");
    expect(gateEdgePolarity({ condition: "Changes requested" })).toBe("reject");
  });

  it("reads a negation as rejection, not approval", () => {
    // "not approved" contains "approved": the negative test has to run first.
    expect(gateEdgePolarity({ condition: "not approved by compliance" })).toBe("reject");
    expect(gateEdgePolarity({ condition: "reviewer isn't approved" })).toBe("reject");
  });

  it("does not guess at an escalation", () => {
    // An escalation can follow either decision. Guessing would silently reroute
    // a live approval, so an unlabelled one stays unknown...
    expect(gateEdgePolarity({ condition: "Escalate to the committee" })).toBe("unknown");
    // ...while one that says why is read on the word that carries the decision.
    expect(gateEdgePolarity({ condition: "Rejected — escalate" })).toBe("reject");
  });

  it("returns unknown rather than a coin flip", () => {
    expect(gateEdgePolarity({})).toBe("unknown");
    expect(gateEdgePolarity({ condition: "" })).toBe("unknown");
    expect(gateEdgePolarity({ condition: "next" })).toBe("unknown");
    // A rule about something that is not a decision is not polarity.
    expect(gateEdgePolarity({ rule: rule("amount", 50000) as any })).toBe("unknown");
  });
});

describe("applying the decision to a branch", () => {
  const approveEdge = { condition: "Carrier approves breach exception" };
  const declineEdge = { condition: "Carrier declines breach exception" };

  it("runs exactly one branch of a two-way checkpoint", () => {
    // The defect: on approval, both of these returned true.
    expect(gateEdgeSatisfied(true, approveEdge)).toBe(true);
    expect(gateEdgeSatisfied(true, declineEdge)).toBe(false);
    // And on a decline, the decline branch is the one that runs.
    expect(gateEdgeSatisfied(false, approveEdge)).toBe(false);
    expect(gateEdgeSatisfied(false, declineEdge)).toBe(true);
  });

  it("leaves a single unlabelled onward edge following the approval", () => {
    // The common shape, and the behaviour that must not regress: a gate with
    // one plain edge onwards proceeds when approved and stops when not.
    expect(gateEdgeSatisfied(true, { condition: null, label: "handoff" })).toBe(true);
    expect(gateEdgeSatisfied(false, { condition: null, label: "handoff" })).toBe(false);
  });

  it("would have caught the live failure", () => {
    // Exactly the pair that bound and declined the same submission.
    const bound = gateEdgeSatisfied(true, { condition: "Carrier approves breach exception" });
    const declined = gateEdgeSatisfied(true, { condition: "Carrier declines breach exception" });
    expect([bound, declined]).toEqual([true, false]);
    expect(bound && declined).toBe(false);
  });
});
