import { z } from "zod";
import type { AstraTool, ProofEnvelope } from "../types";
import type { WiringReport } from "../wiring-assess";
import { resolveTeam } from "./team-ref";

/**
 * Check a team is wired to run: its blueprint graph, the agents its steps
 * use, their connectors and tools, their policies, and where it pauses for a
 * person. Blockers mean a run won't be started; warnings don't stop it.
 */

type Input = { team: string };

export const verifyWiringTool: AstraTool<Input> = {
  name: "verify_wiring",
  description:
    "Check whether a team can actually run, and whether every path through it can ever be taken: its steps are all present and connected with no loops, its agents belong here and are runnable, the systems it needs are connected and have the tools it expects, its policies are active, where it will pause for a person, and branch conditions that can never be true — which do not stop a run but silently skip every step behind them. Anything in whatWouldStopIt means run_team won't start it. Reads only. Report the result in the user's terms: ready or not, what would stop it, and where it pauses for them.",
  input: z.object({ team: z.string().min(1).describe("The team's id or name.") }),
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    const found = await resolveTeam(ctx, input.team);
    if ("refuse" in found) return { payload: { checked: false, message: found.refuse } };
    const result: {
      team: { id: string; name: string };
      report: WiringReport;
      steps: string[];
      invariants?: { runnable: boolean; findings: Array<{ kind: string; message: string; blocksRun: boolean }>; checked: { nodes: number; edges: number } } | null;
    } | null = await ctx.services.verifyTeamWiring(ctx.orgId, found.team.id);
    if (!result) return { payload: { checked: false, message: "That team couldn't be loaded in this organization." } };
    const { report } = result;
    const invariants = result.invariants ?? null;
    // A branch that can never be taken is worth saying out loud, separately from
    // the wiring blockers: it does not stop a run starting, it quietly skips
    // everything behind it, which is why it survives for months unnoticed.
    const deadBranches = (invariants?.findings ?? []).filter((f) => f.kind === "unsatisfiable_condition" || f.kind === "unreachable_rule_field");

    const pick = (sev: string) => report.issues.filter((i) => i.severity === sev).map((i) => i.message);
    const proof: Partial<ProofEnvelope> = {
      compliance: {
        status: "measured",
        summary: [
          report.blockers === 0 ? "Ready to run" : `${report.blockers} ${report.blockers === 1 ? "thing" : "things"} would stop it`,
          `${report.agentsChecked} ${report.agentsChecked === 1 ? "agent" : "agents"} checked`,
          ...(report.warnings > 0 ? [`${report.warnings} worth knowing`] : []),
          `pauses for you ${report.gates} ${report.gates === 1 ? "time" : "times"}`,
        ].join(" · "),
      },
      context: report.totalWaves != null
        ? { status: "measured", summary: `${report.totalWaves} ${report.totalWaves === 1 ? "stage" : "stages"}, in order` }
        : { status: "not_measured", reason: "The order the steps would run in couldn't be worked out." },
    };
    return {
      payload: {
        checked: true,
        team: result.team.name,
        teamAgentId: result.team.id,
        ready: report.ready,
        // Named for what they mean to the person asking, because these keys are
        // what the model echoes: "blockers" and "warnings" came back as "wiring
        // checks out" and "it flags two warnings", which are sentences about the
        // platform. The severities they come from keep their own names in
        // wiring-assess, where they are a classification rather than a reply.
        whatWouldStopIt: pick("blocker"),
        worthKnowing: pick("warning").slice(0, 12),
        approvalGates: report.gates,
        stages: report.totalWaves,
        ...(deadBranches.length > 0
          ? {
              branchesThatCanNeverBeTaken: deadBranches.map((f) => f.message),
              whyThisMatters: "A run still starts and still reports completed; every step behind such a branch is simply skipped. Nothing raises it after the fact.",
            }
          : {}),
        ...(invariants && invariants.findings.length > deadBranches.length
          ? { otherGraphFindings: invariants.findings.filter((f) => !deadBranches.includes(f)).map((f) => f.message) }
          : {}),
      },
      // The card's title is read by the user; its `kind` is read by the client,
      // so only the title changes here.
      artifact: { kind: "wiring", title: `${report.ready ? "Ready to run" : "Not ready to run"} · ${result.team.name}`, props: { team: result.team, report, steps: result.steps, invariants }, fullViewHref: `/agents/${result.team.id}` },
      proof,
    };
  },
};
