import type { RuleGroup } from "./schema";

/**
 * When a reviewing step has asked for the work to be redone.
 *
 * decideRevision (server/dag-execution-engine.ts) evaluates this against the
 * reviewer's structured output as well as its raw text, so it has to cover the
 * vocabularies a reviewer actually uses, not one word. Live 2026-09-24: a
 * contract-certainty step emitted {"accepted":false,"escalate":false,"redraft":true}
 * -- asking for a redraft in as many words -- and the old rule, which matched
 * only the text "fail", did not fire. Neither outgoing branch matched either, so
 * the six steps after it were skipped and the run still reported success.
 *
 * A field that is absent reads as "undefined" and matches none of these, so a
 * reviewer that approves (or says nothing about rework) never triggers a loop.
 *
 * It lives in shared/ because both paths that turn a flow's loop into a revision
 * rule need it: the build (server/team-build.ts) and the flow sync
 * (server/process-flow-sync.ts). Two copies would drift, and a loop written with
 * a weaker rule is a loop that silently never fires.
 */
export const REWORK_REQUESTED_RULE: RuleGroup = {
  combinator: "OR",
  conditions: [
    { field: "output", operator: "contains", value: "fail" },
    { field: "accepted", operator: "==", value: false },
    { field: "approved", operator: "==", value: false },
    { field: "redraft", operator: "==", value: true },
    { field: "rejected", operator: "==", value: true },
    { field: "requiresRevision", operator: "==", value: true },
  ],
};
