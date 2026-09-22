/**
 * Three approval actions that didn't do what they said:
 * - "Request changes" moved the approval out of every list (the queue, My
 *   Actions, Cowork) and nothing reopened it. It now stays open, marked as
 *   sent back, and the reviewer decides once the changes are made.
 * - "Approve with constraints" sent a duration and traffic cap the rollout
 *   never read. It now offers only the two limits the rollout applies (a
 *   largest canary share, or shadow only), and only where approving starts a
 *   rollout.
 * - "Request human labeling" set nothing anyone read. It's gone.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { isDecidable } from "../client/src/components/approval-decision-banner";
import { OPEN_APPROVAL_STATUSES } from "../server/approval-decision";
import { buildMyActions } from "../server/my-actions-build";
import { decisionRoute } from "../server/astra/needs-you";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

describe("an approval sent back for changes stays open", () => {
  it("both approval pages and the server agree it can still be decided", () => {
    expect(isDecidable("changes_requested")).toBe(true);
    expect(OPEN_APPROVAL_STATUSES.has("changes_requested")).toBe(true);
    expect(isDecidable("approved")).toBe(false);
    expect(OPEN_APPROVAL_STATUSES.has("rejected")).toBe(false);
    // A review window that closed without a decision isn't a decision: both pages offer it,
    // so the server takes it too (there are 315 of them live).
    expect(isDecidable("expired")).toBe(true);
    expect(OPEN_APPROVAL_STATUSES.has("expired")).toBe(true);
  });

  it("is still in My Actions, saying what was asked for", () => {
    const built = buildMyActions({
      approvals: [
        { id: "ap-1", status: "changes_requested", type: "launch_readiness", objectType: "deployment", objectName: "Invoice Agent v2", riskScore: 3, constraintsJson: { requestedChanges: "Add refund cases to the evals" }, createdAt: new Date(), decidedAt: new Date() } as any,
      ],
      alerts: [], recommendations: [], policyExceptions: [], elicitations: [],
    });
    expect(built.needsDecision).toHaveLength(1);
    expect(built.needsDecision[0].context).toBe("Changes requested: Add refund cases to the evals. Decide once they're made.");
  });

  it("can be decided in Cowork", () => {
    const r = decisionRoute({ source: "approval", category: "approval", sourceId: "ap-1", approval: { status: "changes_requested", objectType: "deployment", requiredReviewerRole: null }, allowed: { allowed: true, reason: "" } });
    expect(r.canDecideHere).toBe(true);
  });

  it("is in the queue's pending list", () => {
    expect(read("client", "src", "pages", "approvals.tsx")).toContain('const isOpen = (s: string) => s === "pending" || s === "changes_requested";');
  });

  it("a rejected approval is recorded as rejected, not dismissed", () => {
    expect(read("server", "my-actions-build.ts")).toContain('decision: approval.status === "approved" ? "approved" : "rejected",');
  });
});

describe("approval detail offers only what the server does", () => {
  const page = read("client", "src", "pages", "approval-detail.tsx");

  it("limits are the ones the rollout applies, and only for a rollout", () => {
    expect(page).toContain('(approval.objectType === "deployment" || approval.objectType === "patch") && (');
    expect(page).toContain("maxCanaryPercent");
    expect(page).toContain("shadowOnly");
    expect(page).not.toMatch(/maxTraffic|setDuration/);
    const server = read("server", "approval-decision.ts");
    expect(server).toContain("constraints.maxCanaryPercent");
    expect(server).toContain("constraints.shadowOnly");
  });

  it("has no human-labeling request", () => {
    expect(page).not.toMatch(/requiresHumanLabeling|Request Human Labeling/);
  });
});
