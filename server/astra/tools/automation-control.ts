import { z } from "zod";
import { resolveAgentRef } from "./refs";
import type { AstraTool, ConfirmPreview, ConfirmWarning } from "../types";

/**
 * Seeing what is running, stopping an automation, and cancelling a run.
 *
 * "What's running right now?" had no tool behind it: /status asked the question,
 * get_team_run needed an id the user doesn't have, and list_needs_me only covers
 * decisions. So the answer depended on what happened to be in that conversation.
 * And nothing could stop anything at all.
 *
 * The three acts are separate tools because they are separate promises, and the
 * cards are written to stop anyone reading one as another:
 * - cancel_run ends one run;
 * - stop_automation stops an agent firing on its schedule, and does NOT cancel a
 *   run in flight or prevent someone starting one by hand;
 * - rolling a deployment back is a different, gated thing (the Deploy pack).
 */

interface Running {
  teamRuns: Array<{ id: string; team: string | null; teamAgentId: string | null; status: string; waitingOnApprovalId: string | null; startedAt: string | null; request: string | null }>;
  agentRuns: Array<{ id: string; agent: string | null; agentId: string | null; status: string; startedAt: string | null; request: string | null }>;
}

const clip = (text: string | null, max = 90) => (!text ? null : text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const minutesSince = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : null);

export const listRunsTool: AstraTool<{}> = {
  name: "list_runs",
  description:
    "What is running right now in this organization: team runs and single-agent runs that are in flight, including which ones are paused waiting for an approval and how long each has been going. Use it for 'what's running?', or before stopping or cancelling anything.",
  input: z.object({}),
  permission: "view_agents",
  confirm: false,
  run: async (ctx) => {
    const r: Running = await ctx.services.runningWork(ctx.orgId);
    const waiting = r.teamRuns.filter((t) => t.status === "waiting_approval").length;
    const total = r.teamRuns.length + r.agentRuns.length;
    return {
      payload: {
        message: total === 0 ? "Nothing is running" : `${total} in flight${waiting ? `, ${waiting} waiting for an approval` : ""}`,
        total,
        teamRuns: r.teamRuns.map((t) => ({
          runId: t.id,
          team: t.team,
          status: t.status,
          minutesRunning: minutesSince(t.startedAt),
          ...(t.waitingOnApprovalId ? { waitingOnApprovalId: t.waitingOnApprovalId } : {}),
          request: clip(t.request),
        })),
        agentRuns: r.agentRuns.map((a) => ({ runId: a.id, agent: a.agent, status: a.status, minutesRunning: minutesSince(a.startedAt), request: clip(a.request) })),
        ...(total === 0 ? { note: "No team run or agent run is in flight. A run that finished is in the run history, not here." } : {}),
      },
      artifact: {
        kind: "text",
        title: total === 0 ? "Nothing running" : `${total} running`,
        props: {
          text: total === 0
            ? "Nothing is in flight right now."
            : [
                ...(r.teamRuns.length ? ["**Team runs**", "", ...r.teamRuns.map((t) => `- ${t.team ?? "unnamed team"} — ${t.status.replace(/_/g, " ")}${minutesSince(t.startedAt) != null ? `, ${minutesSince(t.startedAt)} min` : ""}${t.waitingOnApprovalId ? " (waiting for a decision)" : ""}`), ""] : []),
                ...(r.agentRuns.length ? ["**Agent runs**", "", ...r.agentRuns.map((a) => `- ${a.agent ?? "unnamed agent"} — ${a.status.replace(/_/g, " ")}${minutesSince(a.startedAt) != null ? `, ${minutesSince(a.startedAt)} min` : ""}`)] : []),
              ].join("\n"),
        },
        fullViewHref: "/monitor",
      },
      proof: {
        context: { status: "measured", summary: `${r.teamRuns.length} team ${r.teamRuns.length === 1 ? "run" : "runs"} · ${r.agentRuns.length} agent ${r.agentRuns.length === 1 ? "run" : "runs"} in flight` },
      },
    };
  },
};

type CancelInput = { run: string; reason: string };

export const cancelRunTool: AstraTool<CancelInput> = {
  name: "cancel_run",
  description:
    "Cancel a team run that is in flight, with a reason. Its live execution is aborted and an approval it was waiting on is rejected; what it already did stays in the run history. Get the run id from list_runs. The user confirms first.",
  input: z.object({
    run: z.string().min(1).describe("The run's id, from list_runs."),
    reason: z.string().min(3).max(500).describe("Why it is being cancelled, in the user's words. Recorded with the run."),
  }),
  permission: "manage_agents",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    let r: { run: { id: string; status: string; waitingOnApprovalId: string | null; startedAt: string | null; request: string | null }; team: { id: string; name: string }; cancellable: boolean };
    try {
      r = await ctx.services.cancellableRun(ctx.orgId, input.run);
    } catch (e) {
      return { refuse: (e as Error).message };
    }
    if (!r.cancellable) {
      return { refuse: `That run is ${r.run.status.replace(/_/g, " ")}, so there is nothing to cancel.` };
    }
    const warnings: ConfirmWarning[] = [];
    if (r.run.waitingOnApprovalId) {
      warnings.push({
        title: "The approval it is waiting on is rejected",
        detail: "Cancelling decides that pending approval as rejected, so it leaves Needs you. Nothing else about it is undone.",
      });
    }
    warnings.push({
      title: "What it already did is not undone",
      detail: "Steps that completed stay completed, and anything they wrote to another system stays written. This stops the rest.",
    });
    return {
      summary: `Cancel the ${r.team.name} run${minutesSince(r.run.startedAt) != null ? ` (${minutesSince(r.run.startedAt)} min in)` : ""}`,
      details: [
        `Status now: ${r.run.status.replace(/_/g, " ")}.`,
        ...(r.run.request ? [`It was asked: ${clip(r.run.request, 200)}`] : []),
        `Reason recorded: ${input.reason}`,
        "The run keeps its history and appears as cancelled.",
      ],
      warnings,
      frozen: { run: r.run.id, status: r.run.status },
    };
  },
  run: async (ctx, input) => {
    const actor = (await ctx.services.getUserDisplayName?.(ctx.userId)) ?? ctx.role;
    const r = await ctx.services.cancelRunAs(ctx.orgId, input.run, input.reason, actor);
    return {
      payload: {
        cancelled: true,
        runId: r.runId,
        // Whether a live executor was actually interrupted, or the run was only
        // marked cancelled (it may have been paused at an approval).
        stoppedLiveExecution: r.stoppedLiveExecution,
        next: "Nothing was undone. If the automation should also stop firing, stop_automation does that separately.",
      },
      proof: { compliance: { status: "measured", summary: "Recorded as a cancellation with the reason and who asked" } },
    };
  },
};

export const stopAutomationTool: AstraTool<{ agent: string }> = {
  name: "stop_automation",
  description:
    "Stop an automation firing: its deployments' runtimes are stopped and scheduled runs cancelled, so it no longer starts work on its own. It does NOT cancel a run already in flight (cancel_run does), and it does NOT stop someone starting it by hand. The user confirms first.",
  input: z.object({ agent: z.string().min(1).describe("The agent or team's name or id.") }),
  permission: "deploy_staging_pilot",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) return found;
    let plan: { agent: { id: string; name: string; agentType: string | null }; deployments: Array<{ id: string; environment: string; status: string; runtimeActive: boolean }>; inFlightRuns: Array<{ id: string; status: string }> };
    try {
      plan = await ctx.services.planStopAutomation(ctx.orgId, found.item.id);
    } catch (e) {
      return { refuse: (e as Error).message };
    }
    if (plan.deployments.length === 0) {
      return {
        refuse: `"${plan.agent.name}" has no live deployment, so it isn't firing on its own and there is nothing to stop.${plan.inFlightRuns.length ? ` It does have ${plan.inFlightRuns.length} run${plan.inFlightRuns.length === 1 ? "" : "s"} in flight -- cancel_run stops those.` : ""}`,
      };
    }

    const running = plan.deployments.filter((d) => d.runtimeActive);
    const warnings: ConfirmWarning[] = [
      {
        // The honest limit of the word "stop", said before anyone relies on it.
        title: "This does not prevent it being run by hand",
        detail: "Nothing in the run paths checks a paused state, so a person (or Astra) can still start it. To take it out of service, roll the deployment back instead.",
      },
    ];
    if (plan.inFlightRuns.length) {
      warnings.push({
        title: `${plan.inFlightRuns.length} run${plan.inFlightRuns.length === 1 ? "" : "s"} already in flight keep going`,
        detail: "Stopping the runtime doesn't touch a run that has started. Cancel those separately with cancel_run.",
      });
    }
    if (running.length === 0) {
      warnings.push({
        title: "No runtime is actually live right now",
        detail: `${plan.deployments.length === 1 ? "The deployment is" : "The deployments are"} marked inactive either way, and any scheduled runs are cancelled.`,
      });
    }

    return {
      summary: `Stop ${plan.agent.name} firing (${plan.deployments.map((d) => d.environment).join(", ")})`,
      details: [
        `Stops the runtime of ${plan.deployments.length} deployment${plan.deployments.length === 1 ? "" : "s"}: ${plan.deployments.map((d) => `${d.environment} (${d.runtimeActive ? "running" : "not running"})`).join(", ")}.`,
        "Scheduled and continuous runs stop being started, and queued scheduled runs are cancelled.",
        `${plan.deployments.length === 1 ? "It is" : "They are"} marked inactive, and can be started again from the Deployments page.`,
      ],
      warnings,
      frozen: { agent: plan.agent.id, deployments: plan.deployments.map((d) => d.id).sort() },
    };
  },
  run: async (ctx, input) => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) throw new Error(found.refuse);
    const actor = (await ctx.services.getUserDisplayName?.(ctx.userId)) ?? ctx.role;
    const r = await ctx.services.stopAutomationAs(ctx.orgId, found.item.id, actor);
    return {
      payload: {
        stopped: true,
        agent: r.agent.name,
        deployments: r.stopped.map((d: any) => `${d.environment}${d.wasRunning ? "" : " (no runtime was live)"}`),
        ...(r.inFlightRuns.length ? { runsStillInFlight: r.inFlightRuns } : {}),
        next: r.inFlightRuns.length
          ? "It won't start new work. The runs already in flight are still going: cancel_run stops those."
          : "It won't start new work on its own. Someone can still run it by hand.",
      },
      proof: { compliance: { status: "measured", summary: `Recorded as a runtime stop on ${r.agent.name}, with the deployments it covered` } },
    };
  },
};

export const AUTOMATION_CONTROL_TOOLS: AstraTool[] = [listRunsTool, cancelRunTool, stopAutomationTool] as AstraTool[];
