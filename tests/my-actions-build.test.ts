/**
 * buildMyActions (server/my-actions-build.ts), moved from GET /api/my-actions,
 * and list_needs_me on top of it.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {} }));
vi.mock("../server/storage", () => ({ storage: {} }));

import { buildMyActions, type MyActionsRows, APPROVAL_STATUSES_READ } from "../server/my-actions-build";
import { listNeedsMeTool } from "../server/astra/tools/list-needs-me";

const NOW = new Date("2026-09-14T15:00:00Z");
const at = (iso: string) => new Date(iso);

const rows = (): MyActionsRows => ({
  approvals: [
    { id: "a1", type: "outcome_review", objectType: "outcome_contract", objectName: "Reduce DSO", status: "pending", riskScore: 8, dueDate: at("2026-09-15T06:00:00Z"), createdAt: at("2026-09-14T09:00:00Z"), decidedAt: null } as any,
    { id: "a2", type: "hitl_gate", objectType: "pipeline_gate", objectName: "Manager Approval", status: "pending", riskScore: 0.4, createdAt: at("2026-09-14T10:00:00Z"), decidedAt: null } as any,
    { id: "a3", type: "deployment", objectType: "deployment", objectName: "AR Agent", status: "approved", riskScore: 5, createdAt: at("2026-09-13T10:00:00Z"), decidedAt: at("2026-09-14T08:00:00Z") } as any,
    { id: "a4", type: "deployment", objectType: "deployment", objectName: "Old", status: "approved", riskScore: 5, createdAt: at("2026-09-01T10:00:00Z"), decidedAt: at("2026-09-02T08:00:00Z") } as any,
  ],
  alerts: [
    { id: "al1", alertType: "success_rate_drop", agentName: "AR Agent", agentId: "ag1", message: "", severity: "critical", currentValue: 70, baselineValue: 90, triggeredAt: at("2026-09-14T11:00:00Z"), acknowledgedAt: null } as any,
    { id: "al2", alertType: "latency", agentName: "AR Agent", agentId: "ag1", message: "", severity: "medium", currentValue: null, baselineValue: null, triggeredAt: at("2026-09-14T12:00:00Z"), acknowledgedAt: null } as any,
  ],
  recommendations: [],
  policyExceptions: [{ id: "pe1", status: "pending", reason: "Needs a one-off write", requiresExpertValidation: true, agentId: "ag1", createdAt: at("2026-09-14T07:00:00Z") } as any],
  elicitations: [],
});

describe("buildMyActions", () => {
  it("puts pending approvals, urgent alerts and exceptions under needs decision, urgent first", () => {
    // a1 is urgent because it's due within a day, a2 has no due date; the risk score doesn't set urgency.
    const r = buildMyActions(rows(), NOW);
    expect(r.needsDecision.map((i) => i.id)).toEqual(["alert-al1", "approval-a1", "pe-pe1", "approval-a2"]);
    expect(r.fyi.map((i) => i.id)).toEqual(["alert-al2"]);
    expect(r.needsDecision.find((i) => i.id === "alert-al1")!.businessImpact).toBe("-22.2% vs baseline");

    expect(r.needsDecision.find((i) => i.id === "approval-a1")!.businessImpact).toBeNull();
  });

  it("counts only decisions made today as completed today", () => {
    const r = buildMyActions(rows(), NOW);
    expect(r.completedToday.map((i) => i.id)).toEqual(["approval-a3"]);
    expect(r.completedTodayCount).toBe(1);
  });

  it("translates approval types into plain titles", () => {
    const r = buildMyActions(rows(), NOW);
    expect(r.needsDecision.find((i) => i.id === "approval-a1")).toMatchObject({ title: 'Review goal contract: "Reduce DSO"', category: "governance" });
  });
});

describe("list_needs_me", () => {
  it("lists what needs a decision, with approval ids and whether each can be decided here, without derived risk impact", async () => {
    const built = buildMyActions(rows(), NOW);
    const services = {
      needsMe: async () => ({
        ...built,
        needsDecision: built.needsDecision.map((i) => ({
          ...i,
          businessImpact: i.source === "approval" ? null : i.businessImpact,
          approvalKind: i.sourceId === "a1" ? "outcome_contract" : i.sourceId === "a2" ? "pipeline_gate" : null,
          canDecideHere: i.sourceId === "a1",
        })),
        fyi: built.fyi.map((i) => ({ ...i, approvalKind: null, canDecideHere: false })),
      }),
    };
    const out = await listNeedsMeTool.run({ orgId: "org-a", userId: "u", role: "admin", threadId: "t", services } as any, {});
    const payload = out.payload as any;
    expect(payload).toMatchObject({ needsDecision: 4, decidableHere: 1 });
    expect(payload.items.find((i: any) => i.approvalId === "a1")).toMatchObject({ canDecideHere: true });
    expect(payload.items.find((i: any) => i.approvalId === "a1")).not.toHaveProperty("impact");
    expect(payload).not.toHaveProperty("fyi");
    expect(out.artifact).toMatchObject({ kind: "needsMe", fullViewHref: "/approvals" });
  });
});

/**
 * The loader reads a subset of approvals; this holds that subset to what the
 * builder can actually surface.
 *
 * Measured on the live organization 2026-09-30: 970 approvals, ~1MB, of which
 * 0 were pending and 32 decided today — 938 rows (97%) could not reach any
 * bucket, and were read on every Cowork home load. loadMyActionsRows now asks
 * only for the statuses below.
 *
 * The danger in that is one-directional and quiet: if buildMyActions starts
 * surfacing a status the query does not fetch, nothing errors — the item simply
 * never appears, and "nothing needs your decision" looks exactly like the truth.
 * So the statuses are derived from the builder here rather than trusted.
 */
describe("the approvals the loader fetches cover everything the builder can show", () => {
  const STATUSES = ["pending", "changes_requested", "approved", "rejected", "expired", "cancelled", "superseded"];

  const approvalRow = (status: string, decidedAt: Date | null) => ({
    id: `a-${status}`,
    type: "agent_deployment",
    status,
    objectName: "An agent",
    objectType: "agent",
    agentId: "agent-1",
    outcomeId: null,
    dueDate: null,
    createdAt: new Date(),
    decidedAt,
    constraintsJson: null,
    requiredReviewerRole: null,
  });

  it("surfaces nothing whose status the loader skips", () => {
    const now = new Date();
    const surfaced: string[] = [];
    for (const status of STATUSES) {
      // Decided today, the most generous case for reaching a bucket.
      const built = buildMyActions(
        { approvals: [approvalRow(status, now)] as any, alerts: [], recommendations: [], policyExceptions: [], elicitations: [] },
        now,
      );
      const appears = built.needsDecision.length + built.completedToday.length + built.fyi.length > 0;
      if (appears) surfaced.push(status);
    }
    // Every status that can reach a bucket must be one the query asks for.
    const notFetched = surfaced.filter((s) => !(APPROVAL_STATUSES_READ as readonly string[]).includes(s));
    expect(notFetched).toEqual([]);
    // And the guard must be able to fail: the builder does surface something.
    expect(surfaced.length).toBeGreaterThan(0);
  });

  it("drops an approval decided before today, which is why the date bound is safe", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 36 * 3_600_000);
    const built = buildMyActions(
      { approvals: [approvalRow("approved", yesterday)] as any, alerts: [], recommendations: [], policyExceptions: [], elicitations: [] },
      now,
    );
    expect(built.needsDecision).toHaveLength(0);
    expect(built.completedToday).toHaveLength(0);
  });
});

/**
 * What a "needs you" item is called.
 *
 * Measured on the live platform: 52 items needing a decision, 43 distinct
 * titles, and most of them read `"<agent name>" flagged something for you`.
 * In the rail that truncates to the agent's name, so seven consecutive entries
 * showed the identical "Binder Period Close Orchestr…" — while the thing that
 * told them apart (`Connector "NICE Actimize SAM (BSA/AML)" is failing its
 * health check`) sat in a field the list does not render.
 */
describe("an item is named after what happened, not who reported it", () => {
  const alert = (over: Record<string, unknown> = {}) => ({
    id: "al-1", agentId: "a1", agentName: "Binder Period Close Orchestrator",
    alertType: "anomaly", severity: "high", message: "", acknowledgedAt: null,
    triggeredAt: new Date(), currentValue: null, baselineValue: null, ...over,
  });
  const titleOf = (a: any) => {
    const built = buildMyActions({ approvals: [], alerts: [a] as any, recommendations: [], policyExceptions: [], elicitations: [] });
    return built.needsDecision[0]?.title ?? built.fyi[0]?.title ?? null;
  };

  it("uses the finding as the title when the alert carries one", () => {
    const t = titleOf(alert({ message: 'Connector "NICE Actimize SAM (BSA/AML)" is failing its health check. Nothing has reached it in 9 days.' }));
    expect(t).toBe('Connector "NICE Actimize SAM (BSA/AML)" is failing its health check.');
    expect(t).not.toContain("flagged something for you");
  });

  it("tells two items from the same agent apart", () => {
    const a = titleOf(alert({ message: "Connector A is failing its health check." }));
    const b = titleOf(alert({ message: "Connector B has not been reached in 9 days." }));
    expect(a).not.toBe(b);
  });

  it("keeps the agent's name as the fallback when there is no message", () => {
    expect(titleOf(alert({ message: "" }))).toBe('"Binder Period Close Orchestrator" flagged something for you');
  });

  it("does not take a uselessly short fragment as a title", () => {
    expect(titleOf(alert({ message: "Failed." }))).toContain("flagged something for you");
  });

  it("keeps a long finding readable", () => {
    const long = "x".repeat(400);
    const t = titleOf(alert({ message: long }))!;
    expect(t.length).toBeLessThanOrEqual(120);
    expect(t.endsWith("…")).toBe(true);
  });

  it("leaves the typed alerts alone — they already say what happened", () => {
    expect(titleOf(alert({ alertType: "success_rate_drop", message: "anything" }))).toContain("completing fewer tasks than usual");
  });
});
