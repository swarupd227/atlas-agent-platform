import { z } from "zod";
import {
  durationWords,
  effortWords,
  isProblemCause,
  runHeadline,
  skipCauseAdvice,
  skipCauseLabel,
  type SkipCause,
} from "@shared/run-words";
import type { AstraTool, ProofEnvelope } from "../types";
import { resolveTeam } from "./team-ref";

/** Loaded on demand: run_team, get_team_run and the watches stay core. */
const PACK = "runs";

/**
 * Runs, in a conversation: what actually happened.
 *
 * The platform already had list_runs, get_run and get_team_run, and all three
 * answer with a status. Measured on the live fleet (2026-09-28, the 85 most
 * recent team runs): 536 of 1,501 steps never ran, 61 of 85 runs skipped at least
 * one, only 14 completed cleanly — and the usual recorded status was
 * `completed_with_skips`, a word that reads as success on a run that executed 4
 * of its 27 steps and never reached the step that binds the policy.
 *
 * So nothing here reports a status on its own. Every answer is "completed — 4 of
 * 22 steps ran", and every skipped step carries WHICH of the causes put it there,
 * because only two of them are defects and the other two are a graph doing what
 * it was drawn to do. Telling a person to investigate a branch that routed
 * correctly wastes their afternoon; not telling them about a condition that can
 * never be satisfied costs them the step that mattered.
 *
 * The cause comes from the RUN'S OWN GRAPH — were this step's sources skipped
 * too? — not from reading the recorded message. Every run before 2026-09-29 used
 * one sentence for all the causes, and 14 of the 22 steps that had never run in
 * any recent run were cascades whose message talked about their own condition.
 * Reading those messages would have sent somebody to the wrong step 14 times.
 *
 * There is no tool here that changes anything. Re-running a finished run from a
 * step is an action, so it lives beside run_team as rerun_team_from (core, with
 * the same confirmation); these tools say what went wrong and where, so the
 * person knows which step to start from again, or what to change first.
 */

const causeWords = (cause: SkipCause) => `${skipCauseLabel(cause)}. ${skipCauseAdvice(cause)}`;

/** The one sentence that must accompany any cause read from a message rather than a graph. */
const GRAPH_CAVEAT =
  "This team's graph could not be read, so the causes come from each step's recorded message. Runs made before 2026-09-29 recorded one sentence for every cause, so a cause of \"cause not recorded\" here means exactly that and not that nothing is wrong.";

export const explainRunTool: AstraTool<{ run: string }> = {
  name: "explain_run",
  description:
    "What a team run actually did: how many of its steps ran, which were skipped and WHY each one was — its predecessor never ran, its condition was false, its condition read a field nothing produces, or its edge carries no condition at all. Only the last two are defects; the tool says which. Use this whenever a run reports completed_with_skips, which is how a run that executed 4 of its 22 steps describes itself.",
  input: z.object({ run: z.string().min(1).describe("The team run's id.") }),
  pack: PACK,
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    let r: any;
    try {
      r = await ctx.services.explainRun(ctx.orgId, input.run);
    } catch (err: any) {
      return { payload: { explained: false, message: err?.message ?? "That run couldn't be read." } };
    }

    const skipped = r.steps.filter((s: any) => s.cause);
    const problems = skipped.filter((s: any) => isProblemCause(s.cause));
    const headline = runHeadline(r.run.status, r.run.steps.ran, r.run.steps.total);
    const byCause = Object.entries(r.byCause as Record<string, number>).map(([cause, n]) => `${n} × ${skipCauseLabel(cause as SkipCause)}`);

    const proof: Partial<ProofEnvelope> = {
      context: r.planKnown
        ? { status: "measured", summary: `causes worked out from the team's graph (${r.run.steps.total} steps recorded)` }
        : { status: "not_measured", reason: "The team's graph could not be read, so the causes come from each step's recorded message." },
    };

    return {
      payload: {
        explained: true,
        run: r.run.id,
        team: r.run.team.name,
        headline,
        effort: effortWords(r.run.costUsd, r.run.steps.ran, r.run.steps.total),
        took: durationWords(r.run.durationMs),
        stepsRan: r.run.steps.ran,
        stepsTotal: r.run.steps.total,
        stepsSkipped: r.run.steps.skipped,
        ...(r.run.steps.failed > 0 ? { stepsFailed: r.run.steps.failed } : {}),
        ...(byCause.length > 0 ? { whySkipped: byCause } : {}),
        ...(problems.length > 0
          ? {
              defects: problems.map((s: any) => ({ step: s.label, cause: s.cause, why: causeWords(s.cause), recorded: s.detail })),
              whatThisMeans: "These steps cannot be reached by any run of this team as it is drawn. Nothing raises that after the fact — the run still reports completed.",
            }
          : {}),
        ...(skipped.length > problems.length
          ? { skippedByRouting: skipped.filter((s: any) => !isProblemCause(s.cause)).map((s: any) => ({ step: s.label, cause: s.cause })) }
          : {}),
        ...(r.planKnown ? {} : { causesFrom: GRAPH_CAVEAT }),
        ...(r.run.waitingOnApproval ? { waitingOn: "Somebody has to decide before it goes further." } : {}),
        ...(r.run.stuck ? { stuck: "It is still recorded as running but has shown no sign of life for over an hour." } : {}),
      },
      artifact: {
        kind: "runExplain",
        title: `Run · ${r.run.team.name}`,
        props: { run: r.run, steps: r.steps, byCause: r.byCause, planKnown: r.planKnown },
        fullViewHref: `/runs?run=${encodeURIComponent(r.run.id)}`,
      },
      proof,
    };
  },
};

export const whySkippedTool: AstraTool<{ run: string; step?: string }> = {
  name: "why_skipped",
  description:
    "Why one step of a run did not happen, and what would have to change for it to. Name the step to ask about one; omit it to get every skipped step of the run with its cause. Distinguishes a branch that routed elsewhere (nothing to fix) from a condition that can never be satisfied (the step is unreachable in every run).",
  input: z.object({
    run: z.string().min(1).describe("The team run's id."),
    step: z.string().optional().describe("The step's label or node id. Omit for every skipped step."),
  }),
  pack: PACK,
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    let r: any;
    try {
      r = await ctx.services.explainRun(ctx.orgId, input.run);
    } catch (err: any) {
      return { payload: { answered: false, message: err?.message ?? "That run couldn't be read." } };
    }

    const skipped = r.steps.filter((s: any) => s.cause);
    if (skipped.length === 0) {
      return {
        payload: {
          answered: true,
          message: `Nothing was skipped in this run — ${runHeadline(r.run.status, r.run.steps.ran, r.run.steps.total)}.`,
          run: r.run.id,
          team: r.run.team.name,
        },
      };
    }

    if (input.step) {
      const wanted = input.step.trim().toLowerCase();
      const hit =
        r.steps.find((s: any) => s.nodeId === input.step) ??
        r.steps.find((s: any) => s.label.toLowerCase() === wanted) ??
        r.steps.find((s: any) => s.label.toLowerCase().includes(wanted));
      if (!hit) {
        return {
          payload: {
            answered: false,
            message: `This run has no step matching "${input.step}".`,
            stepsInThisRun: r.steps.map((s: any) => s.label).slice(0, 40),
          },
        };
      }
      if (!hit.cause) {
        return {
          payload: {
            answered: true,
            message: `"${hit.label}" was not skipped — it is recorded as ${hit.status}.`,
            step: hit.label,
            status: hit.status,
            took: durationWords(hit.durationMs),
            ...(hit.costUsd != null ? { costUsd: hit.costUsd } : {}),
          },
        };
      }
      return {
        payload: {
          answered: true,
          step: hit.label,
          run: r.run.id,
          team: r.run.team.name,
          cause: hit.cause,
          message: causeWords(hit.cause),
          isDefect: isProblemCause(hit.cause),
          recorded: hit.detail,
          ...(hit.stateKey ? { writesTo: hit.stateKey } : {}),
          ...(r.planKnown ? {} : { causesFrom: GRAPH_CAVEAT }),
        },
        artifact: {
          kind: "text",
          title: `${hit.label} — why it was skipped`,
          props: {
            text: [
              `**${hit.label}** — ${skipCauseLabel(hit.cause)}`,
              "",
              skipCauseAdvice(hit.cause),
              ...(hit.detail ? ["", `The run recorded: _${hit.detail}_`] : []),
              ...(r.planKnown ? [] : ["", GRAPH_CAVEAT]),
            ].join("\n"),
          },
          fullViewHref: `/runs?run=${encodeURIComponent(r.run.id)}`,
        },
      };
    }

    const problems = skipped.filter((s: any) => isProblemCause(s.cause));
    return {
      payload: {
        answered: true,
        run: r.run.id,
        team: r.run.team.name,
        headline: runHeadline(r.run.status, r.run.steps.ran, r.run.steps.total),
        skipped: skipped.map((s: any) => ({ step: s.label, cause: s.cause, isDefect: isProblemCause(s.cause), recorded: s.detail })),
        ...(problems.length > 0
          ? { worthAPersonsTime: `${problems.length} of ${skipped.length} are defects: ${problems.map((s: any) => s.label).join(", ")}.` }
          : { worthAPersonsTime: "None of these are defects — every one is a branch the data routed away from." }),
        ...(r.planKnown ? {} : { causesFrom: GRAPH_CAVEAT }),
      },
      artifact: {
        kind: "runExplain",
        title: `Skipped steps · ${r.run.team.name}`,
        props: { run: r.run, steps: r.steps, byCause: r.byCause, planKnown: r.planKnown },
        fullViewHref: `/runs?run=${encodeURIComponent(r.run.id)}`,
      },
    };
  },
};

export const runsNeedingAttentionTool: AstraTool<{ limit?: number }> = {
  name: "runs_needing_attention",
  description:
    "Which recent runs a person should look at, and why each one is on the list: it failed, it has been running with no sign of life for over an hour, it is waiting for somebody to decide, or a step was skipped by a condition that can never be satisfied. Deliberately not every run with a skip — most skips are branches working as drawn.",
  input: z.object({
    limit: z.number().int().min(1).max(200).optional().describe("How many recent runs to examine. Default 40."),
  }),
  pack: PACK,
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    const r = await ctx.services.runsNeedingAttention(ctx.orgId, input.limit ?? 40);
    const runs: any[] = r.runs ?? [];

    if (runs.length === 0) {
      return {
        payload: {
          message: `Nothing needs attention in the last ${r.examined} ${r.examined === 1 ? "run" : "runs"}: none failed, none is stuck or waiting, and no step was skipped by a condition that can never be satisfied.`,
          examined: r.examined,
          needingAttention: 0,
        },
        proof: { context: { status: "measured", summary: `${r.examined} recent runs examined, causes from ${r.causesFrom}` } },
      };
    }

    return {
      payload: {
        message: `${runs.length} of the last ${r.examined} runs need somebody`,
        examined: r.examined,
        needingAttention: runs.length,
        runs: runs.slice(0, 20).map((run) => ({
          runId: run.id,
          team: run.team.name,
          headline: runHeadline(run.status, run.steps.ran, run.steps.total),
          why: run.reasons,
          ...(run.problemSteps.length > 0
            ? { unreachableSteps: run.problemSteps.map((s: any) => `${s.label} — ${skipCauseLabel(s.cause)}`) }
            : {}),
          effort: effortWords(run.costUsd, run.steps.ran, run.steps.total),
        })),
        ...(runs.length > 20 ? { note: `${runs.length - 20} more are not listed here.` } : {}),
        causesFrom: `Skip causes worked out from ${r.causesFrom}.`,
      },
      artifact: {
        kind: "runsAttention",
        title: `${runs.length} runs need attention`,
        props: { runs, examined: r.examined, causesFrom: r.causesFrom },
        fullViewHref: "/runs",
      },
      proof: { context: { status: "measured", summary: `${r.examined} recent runs examined, causes from ${r.causesFrom}` } },
    };
  },
};

export const stepsNeverRunTool: AstraTool<{ team: string; recentRuns?: number }> = {
  name: "steps_never_run",
  description:
    "Steps of a team that have not run in ANY of its recent runs. One skipped step per run reads as routing; the same step skipped in every run means that part of the team has never done anything. Twenty-two steps across six teams were in that state on 2026-09-28 and none had ever been surfaced. Needs at least three runs before it will call anything 'never'.",
  input: z.object({
    team: z.string().min(1).describe("The team's id or name."),
    recentRuns: z.number().int().min(3).max(50).optional().describe("How many of the team's recent runs to examine. Default 10."),
  }),
  pack: PACK,
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    const found = await resolveTeam(ctx, input.team);
    if ("refuse" in found) return { payload: { checked: false, message: found.refuse } };

    let r: any;
    try {
      r = await ctx.services.stepsNeverRun(ctx.orgId, found.team.id, input.recentRuns ?? 10);
    } catch (err: any) {
      return { payload: { checked: false, message: err?.message ?? "That team's runs couldn't be read." } };
    }

    if (r.runsExamined < 3) {
      return {
        payload: {
          checked: false,
          message: `${r.team.name} has ${r.runsExamined} recorded ${r.runsExamined === 1 ? "run" : "runs"}. Three are needed before a step not running means anything.`,
          runsExamined: r.runsExamined,
        },
        proof: { context: { status: "not_measured", reason: "Fewer than three runs to compare." } },
      };
    }

    const steps: any[] = r.steps ?? [];
    return {
      payload: {
        checked: true,
        team: r.team.name,
        teamAgentId: r.team.id,
        runsExamined: r.runsExamined,
        stepsNeverRun: steps.length,
        ...(steps.length > 0
          ? {
              steps: steps.map((s) => ({ step: s.label, skippedInAllOf: s.seen })),
              whatThisMeans:
                "Each of these was skipped in every run examined. Ask explain_run or why_skipped about one of those runs to find out whether the branch above it never routes this way, or its own condition can never be satisfied — verify_wiring reports the second kind for the whole team.",
            }
          : { message: `Every step of ${r.team.name} ran in at least one of its last ${r.runsExamined} runs.` }),
      },
      artifact: {
        kind: "text",
        title: `${r.team.name} — steps that never run`,
        props: {
          text: [
            `**${r.team.name}** — ${r.runsExamined} runs examined`,
            "",
            ...(steps.length > 0
              ? steps.map((s) => `- **${s.label}** — skipped in all ${s.seen} runs`)
              : ["Every step ran in at least one run."]),
          ].join("\n"),
        },
        fullViewHref: `/agents/${r.team.id}`,
      },
      proof: { context: { status: "measured", summary: `${r.runsExamined} runs of ${r.team.name} examined` } },
    };
  },
};

export const compareRunsTool: AstraTool<{ run: string; against?: string }> = {
  name: "compare_runs",
  description:
    "Two runs of the same team, step by step: which steps ran in one and not the other, and the cause on the side that skipped. This is the tool for \"it worked last week\" — that question is always about a step, not about the totals. Names the team's previous run when you don't give a second one.",
  input: z.object({
    run: z.string().min(1).describe("The team run's id."),
    against: z.string().optional().describe("A second run of the SAME team. Omit to compare with the team's previous run."),
  }),
  pack: PACK,
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    let r: any;
    try {
      r = await ctx.services.compareRuns(ctx.orgId, input.run, input.against);
    } catch (err: any) {
      return { payload: { compared: false, message: err?.message ?? "Those runs couldn't be compared." } };
    }

    const a = r.runs.a;
    const b = r.runs.b;
    const ranOnlyInA = r.differences.filter((d: any) => d.a.status !== "skipped" && d.b.status === "skipped");
    const ranOnlyInB = r.differences.filter((d: any) => d.b.status !== "skipped" && d.a.status === "skipped");

    return {
      payload: {
        compared: true,
        team: r.team.name,
        against: r.againstChosen,
        thisRun: { runId: a.id, headline: runHeadline(a.status, a.steps.ran, a.steps.total), startedAt: a.startedAt, effort: effortWords(a.costUsd, a.steps.ran, a.steps.total) },
        otherRun: { runId: b.id, headline: runHeadline(b.status, b.steps.ran, b.steps.total), startedAt: b.startedAt, effort: effortWords(b.costUsd, b.steps.ran, b.steps.total) },
        stepsTheSame: r.sameSteps,
        ...(r.differences.length === 0
          ? { message: `Both runs took the same path through ${r.sameSteps} steps.` }
          : {
              message: `${r.differences.length} ${r.differences.length === 1 ? "step" : "steps"} behaved differently`,
              ...(ranOnlyInB.length > 0
                ? {
                    stoppedRunning: ranOnlyInB.map((d: any) => ({
                      step: d.label,
                      ranInOtherRun: true,
                      nowSkippedBecause: skipCauseLabel(d.a.cause ?? "unknown"),
                      whatToDo: skipCauseAdvice(d.a.cause ?? "unknown"),
                    })),
                  }
                : {}),
              ...(ranOnlyInA.length > 0
                ? {
                    startedRunning: ranOnlyInA.map((d: any) => ({
                      step: d.label,
                      skippedInOtherRunBecause: skipCauseLabel(d.b.cause ?? "unknown"),
                    })),
                  }
                : {}),
              ...(r.differences.length > ranOnlyInA.length + ranOnlyInB.length
                ? {
                    otherDifferences: r.differences
                      .filter((d: any) => !ranOnlyInA.includes(d) && !ranOnlyInB.includes(d))
                      .map((d: any) => `${d.label}: ${d.b.status} then, ${d.a.status} now`),
                  }
                : {}),
            }),
        ...(r.stepsOnlyIn.a.length > 0 || r.stepsOnlyIn.b.length > 0
          ? {
              graphChangedBetweenThem: {
                stepsOnlyInThisRun: r.stepsOnlyIn.a,
                stepsOnlyInTheOther: r.stepsOnlyIn.b,
                note: "The team was edited between these two runs, so these steps cannot be compared.",
              },
            }
          : {}),
      },
      artifact: {
        kind: "runCompare",
        title: `${r.team.name} — two runs`,
        props: r,
        fullViewHref: `/runs?run=${encodeURIComponent(a.id)}`,
      },
      proof: {
        context: {
          status: "measured",
          summary: `${a.steps.total} steps in this run, ${b.steps.total} in the one ${r.againstChosen === "you named it" ? "you named" : "before it"}`,
        },
      },
    };
  },
};

export const RUNS_TOOLS: AstraTool[] = [
  explainRunTool,
  whySkippedTool,
  runsNeedingAttentionTool,
  stepsNeverRunTool,
  compareRunsTool,
];
