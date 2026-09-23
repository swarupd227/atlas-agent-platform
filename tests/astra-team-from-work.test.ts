/**
 * Planning and building a team from a description of the work, with no
 * outcome behind it -- the path the classic Teams page offers ("no KPI
 * commitment required") and the conversation didn't have.
 *
 * A saved proposal has to belong to something (agent_proposals.outcome_id is
 * NOT NULL), so a plan made this way is owned by the conversation that
 * produced it, written as "thread:<id>". The build says plainly what having
 * no outcome costs: nothing measures whether the team works.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { isThreadOwned, threadIdOf, threadOwnerId, workTitle } from "../server/astra/team-draft";
import { proposeTeamTool } from "../server/astra/tools/propose-team";
import { buildTeamTool } from "../server/astra/tools/build-team";
import { SLASH_COMMANDS, resolveSlash } from "../client/src/astra/slash";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

describe("who owns a plan", () => {
  it("a conversation, written so nothing mistakes it for an outcome", () => {
    expect(threadOwnerId("t-1")).toBe("thread:t-1");
    expect(isThreadOwned("thread:t-1")).toBe(true);
    expect(isThreadOwned("2f0c-outcome-id")).toBe(false);
    expect(threadIdOf("thread:t-1")).toBe("t-1");
    expect(threadIdOf("2f0c-outcome-id")).toBeNull();
  });

  it("names the work from its first sentence", () => {
    expect(workTitle("Chase overdue invoices weekly. A person approves anything over 10k.")).toBe("Chase overdue invoices weekly");
    expect(workTitle("a".repeat(200))).toHaveLength(80);
    expect(workTitle("   ")).toBe("Team for this work");
  });
});

describe("propose_team", () => {
  const ctx = (services: Record<string, any>) => ({ orgId: "o", userId: "u", role: "admin", threadId: "t-1", industryId: null, services, onProgress: vi.fn() }) as any;

  it("takes an outcome or a description of the work, not both and not neither", async () => {
    const services = { proposeTeamForOutcome: vi.fn(), proposeTeamForWork: vi.fn() };
    await expect(proposeTeamTool.run(ctx(services), { outcomeId: "o-1", work: "both" } as any)).rejects.toThrow(/one of the two/);
    await expect(proposeTeamTool.run(ctx(services), {} as any)).rejects.toThrow(/one of the two/);
    expect(services.proposeTeamForOutcome).not.toHaveBeenCalled();
    expect(services.proposeTeamForWork).not.toHaveBeenCalled();
  });

  it("plans from the work, in this conversation, and says there's nothing measuring it", async () => {
    const plan = { agents: [{ name: "Chaser", role: "worker" }], orchestrator: { name: "Invoice Chasing Team" }, pipeline: { pattern: "sequential" } };
    const services = {
      proposeTeamForWork: vi.fn(async () => ({ ok: true, work: "Chase overdue invoices", plan, proposalId: "p-1", bindings: { agents: [], issues: [], connectorsChecked: 3 } })),
      proposeTeamForOutcome: vi.fn(),
    };
    const out: any = await proposeTeamTool.run(ctx(services), { work: "Chase overdue invoices weekly, a person approves over 10k" } as any);
    expect(services.proposeTeamForWork).toHaveBeenCalledWith("o", "t-1", "Chase overdue invoices weekly, a person approves over 10k", null, undefined, expect.any(Function));
    expect(out.payload.noOutcome).toContain("nothing measures whether it works");
    expect(out.payload.work).toBe("Chase overdue invoices");
    expect(out.payload.outcome).toBeUndefined();
    expect(out.artifact.props.work).toBe("Chase overdue invoices");
  });
});

describe("build_team without an outcome", () => {
  const loaded = {
    proposal: { id: "p-1", status: "draft", orchestrator: { name: "Invoice Chasing Team" }, workers: [{ name: "Chaser" }], pipeline: { edges: [] } },
    outcome: null,
    pendingReviewApprovalId: null,
    hash: "h1",
  };
  const ctx = (over: Record<string, any> = {}) =>
    ({
      orgId: "o", userId: "u", role: "admin", threadId: "t-1", industryId: null,
      services: {
        getProposalForBuild: vi.fn(async () => loaded),
        assessBindings: vi.fn(async () => ({ agents: [{ name: "Chaser", connectors: [] }], issues: [] })),
        resolvePolicyNames: vi.fn(async () => ({ resolved: [], unresolved: [] })),
        buildTeam: vi.fn(async () => ({ teamAgent: { id: "ag-1", name: "Invoice Chasing Team" }, workers: [{ id: "w-1", name: "Chaser", status: "draft" }], blueprint: { id: "bp-1" }, unconnectedBindings: [], unresolvedBindings: [] })),
        markProposalBuilt: vi.fn(async () => {}),
      },
      confirmation: { frozen: { hash: "h1", excludeWorkers: [] } },
      ...over,
    }) as any;

  it("warns that nothing measures it, and that nothing pauses for a person", async () => {
    const p: any = await buildTeamTool.preview!(ctx(), { proposalId: "p-1" });
    expect(p.summary).toContain("for the work described in this conversation");
    expect(p.warnings.map((w: any) => w.title)).toEqual(expect.arrayContaining(["No outcome behind this team", "Nothing pauses for a person"]));
    expect(p.details.join(" ")).toContain("there's no outcome to take them from");
  });

  it("builds it with no outcome attached", async () => {
    const c = ctx();
    await buildTeamTool.run(c, { proposalId: "p-1" });
    const body = c.services.buildTeam.mock.calls[0][1];
    expect(body).not.toHaveProperty("outcomeId");
    expect(body.orchestrator.name).toBe("Invoice Chasing Team");
  });
});

describe("the plan belongs to the conversation", () => {
  const services = read("server", "astra", "services.ts");

  it("is only visible to that conversation's organization", () => {
    const at = services.indexOf("async function getProposalForBuild(");
    const body = services.slice(at, at + 1400);
    expect(body).toContain("const threadId = threadIdOf(row.outcomeId);");
    expect(body).toContain("thread.organizationId !== orgId");
  });

  it("is planned with no KPIs, and replaced when the work is planned again", () => {
    const at = services.indexOf("async function proposeTeamForWork(");
    const body = services.slice(at, at + 1800);
    expect(body).toContain("kpis: []");
    expect(body).toContain("storage.getAgentProposalByOutcome(ownerId)");
  });
});

describe("the command", () => {
  it("/team-plan asks for a team from the work described", () => {
    expect(SLASH_COMMANDS.find((c) => c.name === "team-plan")?.arg?.required).toBe(true);
    expect(resolveSlash("/team-plan chase overdue invoices weekly")).toEqual({ action: "send", text: "Plan a team for this work: chase overdue invoices weekly" });
    expect(resolveSlash("/team-plan")).toMatchObject({ action: "need_arg" });
  });
});
