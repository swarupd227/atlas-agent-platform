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
    "Check whether a team is wired to run: blueprint graph (missing steps, loops, disconnected steps), agents in the right organization and runnable, connectors linked and connected, expected tools present, policies active, and the approval gates where the run pauses. Blockers mean run_team won't start it. Reads only.",
  input: z.object({ team: z.string().min(1).describe("The team's id or name.") }),
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    const found = await resolveTeam(ctx, input.team);
    if ("refuse" in found) return { payload: { checked: false, message: found.refuse } };
    const result: { team: { id: string; name: string }; report: WiringReport; steps: string[] } | null =
      await ctx.services.verifyTeamWiring(ctx.orgId, found.team.id);
    if (!result) return { payload: { checked: false, message: "That team couldn't be loaded in this organization." } };
    const { report } = result;

    const pick = (sev: string) => report.issues.filter((i) => i.severity === sev).map((i) => i.message);
    const proof: Partial<ProofEnvelope> = {
      compliance: {
        status: "measured",
        summary: `${report.agentsChecked} agents checked · ${report.blockers} ${report.blockers === 1 ? "blocker" : "blockers"} · ${report.warnings} ${report.warnings === 1 ? "warning" : "warnings"} · ${report.gates} approval ${report.gates === 1 ? "gate" : "gates"}`,
      },
      context: report.totalWaves != null
        ? { status: "measured", summary: `${report.totalWaves} ${report.totalWaves === 1 ? "stage" : "stages"} in run order` }
        : { status: "not_measured", reason: "The run order couldn't be worked out." },
    };
    return {
      payload: {
        checked: true,
        team: result.team.name,
        teamAgentId: result.team.id,
        ready: report.ready,
        blockers: pick("blocker"),
        warnings: pick("warning").slice(0, 12),
        approvalGates: report.gates,
        stages: report.totalWaves,
      },
      artifact: { kind: "wiring", title: `Wiring · ${result.team.name}`, props: { team: result.team, report, steps: result.steps }, fullViewHref: `/agents/${result.team.id}` },
      proof,
    };
  },
};
