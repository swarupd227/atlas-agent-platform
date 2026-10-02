import { z } from "zod";
import { effortWords, runHeadline } from "@shared/run-words";
import type { AstraEvent, AstraTool, AstraToolContext, ConfirmPreview, ProofEnvelope, ToolRunResult } from "../types";
import type { DagRunEvent } from "../../dag-run-events";
import type { WiringReport } from "../wiring-assess";
import type { WatchResult } from "../team-run-watch";
import { resolveTeam } from "./team-ref";

/**
 * Run a team from the conversation.
 *
 * Confirm first (a team can change things through its connectors), refuse
 * when its wiring has blockers, then narrate each step as it runs. When the
 * run reaches an approval gate, the turn pauses on a card: Confirm approves
 * that step and the run continues, Not now rejects it and the run stops. A
 * long run is left running with its id, to check later with get_team_run.
 */

type Input = { team: string; request: string };

// Long enough for a multi-stage content team to reach its approval step; the stream sends a heartbeat meanwhile.
const WAIT_MS = 10 * 60_000;

interface RunView {
  id: string;
  team: { id: string; name: string };
  status: string;
  currentWave: number;
  totalWaves: number;
  error: string | null;
  costUsd: number;
  toolCalls: number;
  steps: Array<{ nodeId: string; wave: number; revision: number; label: string; status: string; error: string | null; durationMs: number | null; html: boolean }>;
  pending: { approvalId: string; label: string | null; description: string | null } | null;
  answer: string | null;
}

function narrate(ctx: AstraToolContext, teamName: string) {
  return (e: DagRunEvent) => {
    const emit = ctx.onProgress;
    if (!emit) return;
    // Scaffolding is not narrated: a `tool_set` node runs nothing, and on the
    // live CMDB team 5 of the 11 lines a person read were these.
    if ((e.type === "node_start" || e.type === "node_complete") && e.nodeType === "tool_set") return;
    // The team's name is already the heading of this run; repeating it on every
    // line pushed the only words that differ off to the right.
    const step = e.label ?? "step";
    const events: Record<string, () => AstraEvent | null> = {
      node_start: () => ({ type: "tool_start", tool: step, input: {} }),
      node_complete: () => ({
        type: "tool_result",
        tool: step,
        ok: e.status !== "failed" && e.status !== "timeout",
        preview: `${(e.status ?? "done").replace(/_/g, " ")}${e.error ? `: ${e.error.slice(0, 120)}` : ""}`,
      }),
      wave_complete: () => (e.wave && e.totalWaves ? { type: "working", label: `${e.wave} of ${e.totalWaves} stages done` } : null),
      approval_pending: () => ({ type: "working", label: `${e.label ?? "A step"} is waiting for approval` }),
      run_complete: () => ({ type: "working", label: `Run ${(e.runStatus ?? "finished").replace(/_/g, " ")}` }),
    };
    const ev = events[e.type]?.();
    if (ev) emit(ev);
  };
}

export function runArtifact(run: RunView) {
  // The pane refreshes a live run itself, so the title names the team and the status stays in the body.
  return { kind: "teamRun", title: run.team.name, props: { run }, fullViewHref: `/dag-runs/${run.id}` };
}

export function runProof(run: RunView, decided: string[] = []): Partial<ProofEnvelope> {
  const failed = run.steps.filter((s) => s.status === "failed" || s.status === "timeout").length;
  return {
    compliance: {
      status: "measured",
      summary: [
        `${run.steps.length} ${run.steps.length === 1 ? "step" : "steps"} run through each agent's policy gate`,
        failed ? `${failed} failed` : null,
        decided.length ? decided.join(" · ") : null,
      ].filter(Boolean).join(" · "),
    },
    context: { status: "not_measured", reason: "What each agent retrieved isn't recorded for team runs yet." },
  };
}

async function report(ctx: AstraToolContext, dagRunId: string, watch: WatchResult, notes: string[], decided: string[]): Promise<ToolRunResult> {
  const run: RunView | null = await ctx.services.getTeamRun(ctx.orgId, ctx.role, dagRunId);
  if (!run) throw new Error("That team run is no longer available in this organization.");

  if (watch.state === "paused") {
    const approval = await ctx.services.getApprovalForDecision(ctx.orgId, ctx.role, watch.approvalId);
    const label = watch.label ?? run.pending?.label ?? "an approval step";
    // The pane beside the conversation shows the run waiting at the gate.
    ctx.onProgress?.({ type: "artifact", artifact: runArtifact(run) });
    if (approval?.canDecide?.allowed) {
      return {
        payload: { runId: run.id, status: "waiting_approval", waitingOn: label, ...(notes.length ? { notes } : {}) },
        needsConfirmation: {
          summary: `${run.team.name} is waiting for approval: ${label}`,
          // The gate's own text is the raw step output (checklists, markup); the approval page shows it
          // properly, so the card stays short and links there.
          details: [
            ...notes,
            `${run.steps.filter((s) => s.status === "completed").length} steps done so far. Open approval shows the checks and the work in full.`,
            "Confirm approves this step and the run continues. Not now rejects it, and the run stops here.",
          ],
          frozen: { dagRunId: run.id, approvalId: watch.approvalId, teamAgentId: run.team.id, teamName: run.team.name, label },
          link: { label: "Open approval", href: `/approvals/${watch.approvalId}` },
        },
      };
    }
    return {
      payload: {
        runId: run.id,
        status: "waiting_approval",
        waitingOn: label,
        approvalId: watch.approvalId,
        message: `The run is waiting for approval at "${label}", and the ${ctx.role} role can't decide it. An approver can decide it in Needs you.`,
      },
      artifact: runArtifact(run),
      proof: runProof(run, decided),
    };
  }

  return {
    payload: {
      runId: run.id,
      team: run.team.name,
      status: watch.state === "still_running" ? "still_running" : run.status,
      // Decisions made on the approval cards are real and audited, whatever the request says about testing.
      ...(decided.length ? { decisionsMadeHere: decided } : {}),
      ...(notes.length ? { notes } : {}),
      ...(watch.state === "still_running" ? { message: "Still running, and no longer followed in this conversation: nothing will appear here by itself when it finishes or reaches an approval. The run pane beside the conversation keeps updating; the user can ask for its status (get_team_run), and an approval step shows up in Needs you." } : {}),
      // The same rule the Runs surface follows: a status never travels without
      // how much of the run happened, and what it cost to get there.
      headline: runHeadline(run.status, run.steps.filter((s) => s.status === "completed").length, run.steps.length),
      effort: effortWords(run.costUsd, run.steps.filter((s) => s.status === "completed").length, run.steps.length),
      stepsDone: run.steps.filter((s) => s.status === "completed").length,
      stepsTotal: run.steps.length,
      failedSteps: run.steps.filter((s) => s.status === "failed" || s.status === "timeout").map((s) => `${s.label}${s.error ? `: ${s.error}` : ""}`),
      skippedSteps: run.steps.filter((s) => s.status === "skipped").map((s) => s.label),
      ...(run.error ? { error: run.error } : {}),
      answer: run.answer ? (run.answer.length > 4000 ? `${run.answer.slice(0, 4000)}… (more in the run view)` : run.answer) : null,
      costUsd: run.costUsd,
    },
    artifact: runArtifact(run),
    proof: runProof(run, decided),
  };
}

type GateFrozen = { dagRunId: string; approvalId: string; teamName: string; label: string };

/**
 * Deciding an approval gate the run paused at, from its card. Shared by
 * run_team and rerun_team_from: either can leave a run waiting at a gate, and
 * the card's Confirm or Not now comes back to the tool that opened it.
 */
async function continueAfterGate(ctx: AstraToolContext, f: GateFrozen): Promise<ToolRunResult> {
  const found = await ctx.services.getTeamRunRow(ctx.orgId, f.dagRunId);
  if (!found) throw new Error("That team run is no longer available in this organization.");
  const notes: string[] = [];
  const decided: string[] = [];
  if (found.row.status !== "waiting_approval" || found.row.pendingApprovalId !== f.approvalId) {
    notes.push(`"${f.label}" was already decided elsewhere; nothing was sent from here.`);
  } else {
    const decidedBy = (await ctx.services.getUserDisplayName(ctx.userId)) ?? ctx.role;
    const decision = ctx.decision === "declined" ? "rejected" : "approved";
    await ctx.services.decideApprovalAs(ctx.orgId, ctx.role, ctx.userId, decidedBy, f.approvalId, decision);
    decided.push(`"${f.label}" ${decision} by you on its approval card · audit recorded`);
  }
  const resumed: RunView | null = await ctx.services.getTeamRun(ctx.orgId, ctx.role, f.dagRunId).catch(() => null);
  if (resumed) ctx.onProgress?.({ type: "artifact", artifact: runArtifact(resumed) });
  const watch: WatchResult = await ctx.services.followTeamRun(ctx.orgId, f.dagRunId, { onEvent: narrate(ctx, f.teamName), maxWaitMs: WAIT_MS, ignoreApprovalId: f.approvalId });
  return report(ctx, f.dagRunId, watch, notes, decided);
}

export const runTeamTool: AstraTool<Input> = {
  name: "run_team",
  description:
    "Run one of the organization's teams on a request and narrate each step. The user confirms first; a team whose wiring has blockers won't start (check with verify_wiring). When the run reaches an approval gate the user decides it right here. Long runs keep going and can be checked with get_team_run.",
  input: z.object({
    team: z.string().min(1).describe("The team's id or name."),
    request: z.string().min(1).max(4000).describe("What the team should work on, in the user's words."),
  }),
  permission: "manage_agents",
  confirm: true,
  resumesOnDecline: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const found = await resolveTeam(ctx, input.team);
    if ("refuse" in found) return found;
    const wiring: { team: { id: string; name: string }; report: WiringReport; steps: string[]; connectors: Array<{ name: string; writeTools: number; connected: boolean | null }> } | null =
      await ctx.services.verifyTeamWiring(ctx.orgId, found.team.id);
    if (!wiring) return { refuse: "That team couldn't be loaded in this organization." };
    const blockers = wiring.report.issues.filter((i) => i.severity === "blocker");
    if (blockers.length) {
      return { refuse: `${wiring.team.name} can't run yet: ${blockers.map((b) => b.message).join(" ")}` };
    }
    const writers = wiring.connectors.filter((c) => c.writeTools > 0);
    const gates = wiring.report.issues.filter((i) => i.code === "approval_gate");
    return {
      summary: `Run ${wiring.team.name}`,
      details: [
        `Request: ${input.request.length > 300 ? `${input.request.slice(0, 300)}…` : input.request}`,
        ...(wiring.steps.length ? [`Steps: ${wiring.steps.join(" → ")}.`] : []),
        gates.length ? `Pauses for a person at: ${gates.map((g) => g.message.match(/"(.+)"/)?.[1] ?? "a gate").join(", ")}.` : "Nothing in this team pauses for a person.",
        writers.length
          ? `Can change things through: ${writers.map((c) => `${c.name} (${c.writeTools} write ${c.writeTools === 1 ? "tool" : "tools"})`).join(", ")}. Each call still goes through the agent's policies and approvals.`
          : "Its connectors can't change anything (no write tools).",
      ],
      warnings: wiring.report.issues.filter((i) => i.severity === "warning").slice(0, 3).map((w) => ({ title: "Wiring warning", detail: w.message })),
      frozen: { teamAgentId: wiring.team.id },
    };
  },
  run: async (ctx, input) => {
    const confirmation = ctx.confirmation;

    // Deciding an approval gate the run paused at.
    if (confirmation?.kind === "agent_approval") return continueAfterGate(ctx, confirmation.frozen as GateFrozen);

    // The start card.
    if (ctx.decision === "declined") {
      return { payload: { started: false, message: "Not started." } };
    }
    const teamAgentId = (confirmation?.frozen as { teamAgentId?: string } | undefined)?.teamAgentId;
    if (!teamAgentId) throw new Error("Nothing to run: the confirmation is missing.");
    const wiring = await ctx.services.verifyTeamWiring(ctx.orgId, teamAgentId);
    if (!wiring) throw new Error("That team couldn't be loaded in this organization.");
    const blockers = wiring.report.issues.filter((i: any) => i.severity === "blocker");
    if (blockers.length) throw new Error(`${wiring.team.name} can't run anymore: ${blockers.map((b: any) => b.message).join(" ")}`);

    const { dagRunId } = await ctx.services.startTeamRun(ctx.orgId, teamAgentId, input.request);
    ctx.onProgress?.({ type: "working", label: `${wiring.team.name} started` });
    // Open the run beside the conversation straight away; it keeps itself up to date while the run is live.
    const started: RunView | null = await ctx.services.getTeamRun(ctx.orgId, ctx.role, dagRunId).catch(() => null);
    if (started) ctx.onProgress?.({ type: "artifact", artifact: runArtifact(started) });
    const watch: WatchResult = await ctx.services.followTeamRun(ctx.orgId, dagRunId, { onEvent: narrate(ctx, wiring.team.name), maxWaitMs: WAIT_MS });
    return report(ctx, dagRunId, watch, [], []);
  },
};

export const getTeamRunTool: AstraTool<{ runId: string }> = {
  name: "get_team_run",
  description: "Look up a team run: its status, each step's result, where it is waiting for approval, and its answer once finished.",
  input: z.object({ runId: z.string().min(1).describe("The team run id.") }),
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    const run: RunView | null = await ctx.services.getTeamRun(ctx.orgId, ctx.role, input.runId);
    if (!run) return { payload: { found: false, message: "No team run with that id in this organization." } };
    return {
      payload: {
        found: true,
        runId: run.id,
        team: run.team.name,
        status: run.status,
        stage: `${run.currentWave} of ${run.totalWaves}`,
        steps: run.steps.map((s) => `${s.label}: ${s.status}${s.error ? ` (${s.error.slice(0, 120)})` : ""}`),
        ...(run.pending ? { waitingOn: run.pending.label, approvalId: run.pending.approvalId } : {}),
        ...(run.error ? { error: run.error } : {}),
        answer: run.answer ? (run.answer.length > 4000 ? `${run.answer.slice(0, 4000)}…` : run.answer) : null,
        costUsd: run.costUsd,
      },
      artifact: runArtifact(run),
      proof: runProof(run),
    };
  },
};


const FINISHED = new Set(["completed", "completed_with_skips", "failed", "cancelled"]);

/**
 * Start a finished run again from one of its steps, keeping the ones before
 * it. An action with the same confirmation as run_team: from that step on, the
 * team can change things through its connectors again. The new run is narrated
 * and, like run_team's, can pause at a gate the user decides from its card.
 */
export const rerunTeamFromTool: AstraTool<{ runId: string; step: string }> = {
  name: "rerun_team_from",
  description:
    "Start a finished team run again from one of its steps, keeping the results of every step before it. For a run whose later step failed or was skipped, after a fix to the team or its inputs. The user confirms first; the new run is narrated like run_team and is linked to the run it came from.",
  input: z.object({
    runId: z.string().min(1).describe("The finished team run's id."),
    step: z.string().min(1).describe("The step to start from again: its label or node id."),
  }),
  permission: "manage_agents",
  confirm: true,
  resumesOnDecline: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const run: RunView | null = await ctx.services.getTeamRun(ctx.orgId, ctx.role, input.runId);
    if (!run) return { refuse: "No team run with that id in this organization." };
    if (!FINISHED.has(run.status)) return { refuse: `Only a finished run can be re-run from a step; this one is ${run.status.replace(/_/g, " ")}.` };
    const needle = input.step.trim().toLowerCase();
    const target = run.steps.find((s) => s.nodeId === input.step) ?? run.steps.find((s) => s.label.trim().toLowerCase() === needle);
    if (!target) return { refuse: `${run.team.name} has no step called "${input.step}" in that run.` };
    const kept = run.steps.filter((s) => s.wave < target.wave).map((s) => s.label);
    const again = run.steps.filter((s) => s.wave >= target.wave).map((s) => s.label);
    return {
      summary: `Re-run ${run.team.name} from "${target.label}"`,
      details: [
        kept.length ? `Kept as they were: ${kept.join(", ")}.` : "Nothing comes before it, so every step runs again.",
        `Run again: ${again.join(", ")}.`,
        "A new run, linked to this one; this run's record stays as it is. Steps that change things through connectors do so again from here.",
      ],
      frozen: { dagRunId: run.id, nodeId: target.nodeId, label: target.label, teamName: run.team.name },
    };
  },
  run: async (ctx, input) => {
    const confirmation = ctx.confirmation;
    if (confirmation?.kind === "agent_approval") return continueAfterGate(ctx, confirmation.frozen as GateFrozen);
    if (ctx.decision === "declined") return { payload: { started: false, message: "Not started." } };
    const f = confirmation?.frozen as { dagRunId?: string; nodeId?: string; label?: string; teamName?: string } | undefined;
    if (!f?.dagRunId || !f.nodeId) throw new Error("Nothing to re-run: the confirmation is missing.");
    const started: { dagRunId: string; fromLabel: string; fromWave: number; totalWaves: number; team: { id: string; name: string } } =
      await ctx.services.rerunTeamRunFrom(ctx.orgId, f.dagRunId, f.nodeId);
    ctx.onProgress?.({ type: "working", label: `${started.team.name} started again from "${started.fromLabel}"` });
    const view: RunView | null = await ctx.services.getTeamRun(ctx.orgId, ctx.role, started.dagRunId).catch(() => null);
    if (view) ctx.onProgress?.({ type: "artifact", artifact: runArtifact(view) });
    const watch: WatchResult = await ctx.services.followTeamRun(ctx.orgId, started.dagRunId, { onEvent: narrate(ctx, started.team.name), maxWaitMs: WAIT_MS });
    const kept = started.fromWave - 1;
    return report(ctx, started.dagRunId, watch, [`Started again from "${started.fromLabel}" of run ${f.dagRunId}; ${kept} ${kept === 1 ? "stage" : "stages"} before it kept from that run.`], []);
  },
};
