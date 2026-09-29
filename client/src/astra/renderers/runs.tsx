/**
 * Run cards for the artifact pane.
 *
 * They speak the same vocabulary as the /runs page — runHeadline, the skip
 * causes, effortWords — from shared/run-words.ts, so a run described in a
 * conversation and the same run on the page cannot disagree. A status never
 * appears without how much of the run happened, and a skipped step never appears
 * without whether its cause is a defect.
 */
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, CircleCheck, SkipForward } from "lucide-react";
import {
  durationWords,
  effortWords,
  isProblemCause,
  runHeadline,
  runTone,
  skipCauseAdvice,
  skipCauseLabel,
  type SkipCause,
} from "@shared/run-words";
import { Label } from "./parts";

const TONE_TEXT: Record<string, string> = {
  good: "text-[hsl(var(--astra-ok))]",
  warn: "text-[hsl(var(--astra-warn))]",
  bad: "text-[hsl(var(--astra-fail))]",
};

const TONE_BORDER: Record<string, string> = {
  good: "border-[hsl(var(--astra-ok)/0.4)]",
  warn: "border-[hsl(var(--astra-warn)/0.4)]",
  bad: "border-[hsl(var(--astra-fail)/0.4)]",
};

function Headline({ run }: { run: any }) {
  const tone = runTone(run.status, run.steps.ran, run.steps.total);
  return (
    <div className={`rounded border p-3 ${TONE_BORDER[tone]}`}>
      <div className={`font-medium ${TONE_TEXT[tone]}`}>{runHeadline(run.status, run.steps.ran, run.steps.total)}</div>
      <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
        {effortWords(run.costUsd, run.steps.ran, run.steps.total)} · {durationWords(run.durationMs)}
      </div>
      {run.stuck && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-[hsl(var(--astra-warn))]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Still recorded as running, with no sign of life for over an hour.</span>
        </div>
      )}
    </div>
  );
}

/** One skipped step: the cause, and what to do about that particular cause. */
function SkippedStep({ step }: { step: { label: string; cause: SkipCause; detail?: string | null } }) {
  const defect = isProblemCause(step.cause);
  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        {defect ? (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--astra-fail))]" aria-hidden />
        ) : (
          <SkipForward className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="min-w-0">
          <div className="truncate font-medium">{step.label}</div>
          <div className={`text-xs ${defect ? "text-[hsl(var(--astra-fail))]" : "text-muted-foreground"}`}>{skipCauseLabel(step.cause)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{skipCauseAdvice(step.cause)}</div>
        </div>
      </div>
    </li>
  );
}

export function RunExplain({ props }: { props: Record<string, any> }) {
  const run = props.run ?? {};
  const steps: any[] = props.steps ?? [];
  const skipped = steps.filter((s) => s.cause);
  const defects = skipped.filter((s) => isProblemCause(s.cause));
  const routed = skipped.filter((s) => !isProblemCause(s.cause));
  const ran = steps.filter((s) => !s.cause);

  return (
    <div className="space-y-5 text-sm">
      <Headline run={run} />

      {props.planKnown === false && (
        <p className="rounded border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          This team's graph could not be read, so each cause comes from the step's own recorded message. Runs made before
          2026-09-29 recorded one sentence for every cause — "cause not recorded" here means exactly that.
        </p>
      )}

      {defects.length > 0 && (
        <div>
          <Label>
            {defects.length} {defects.length === 1 ? "step" : "steps"} no run can reach
          </Label>
          <ul className="divide-y divide-border">
            {defects.map((s) => (
              <SkippedStep key={s.nodeId} step={s} />
            ))}
          </ul>
        </div>
      )}

      {routed.length > 0 && (
        <div>
          <Label>{routed.length} skipped by routing</Label>
          <ul className="divide-y divide-border">
            {routed.map((s) => (
              <SkippedStep key={s.nodeId} step={s} />
            ))}
          </ul>
        </div>
      )}

      {ran.length > 0 && (
        <div>
          <Label>{ran.length} ran</Label>
          <ul className="space-y-1 font-mono text-xs">
            {ran.map((s) => (
              <li key={s.nodeId} className="flex items-center gap-2">
                <CircleCheck className="h-3 w-3 shrink-0 text-[hsl(var(--astra-ok))]" aria-hidden />
                <span className="truncate">{s.label}</span>
                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{durationWords(s.durationMs)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RunsAttention({ props }: { props: Record<string, any> }) {
  const runs: any[] = props.runs ?? [];
  return (
    <div className="space-y-4 text-sm">
      <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {runs.length} of {props.examined} recent runs · causes from {props.causesFrom}
      </div>
      {runs.length === 0 ? (
        <p className="text-muted-foreground">
          Nothing needs attention: none failed, none is stuck or waiting, and no step was skipped by a condition that can
          never be satisfied.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {runs.map((run) => {
            const tone = runTone(run.status, run.steps.ran, run.steps.total);
            return (
              <li key={run.id} className="py-3">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{run.team.name}</span>
                  <span className={`shrink-0 text-xs ${TONE_TEXT[tone]}`}>{runHeadline(run.status, run.steps.ran, run.steps.total)}</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {(run.reasons ?? []).map((why: string, i: number) => (
                    <li key={i} className="flex gap-1.5 text-xs text-muted-foreground">
                      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      <span>{why}</span>
                    </li>
                  ))}
                </ul>
                {(run.problemSteps ?? []).length > 0 && (
                  <div className="mt-1 pl-4 font-mono text-[11px] text-[hsl(var(--astra-fail))]">
                    {run.problemSteps.map((s: any) => s.label).join(" · ")}
                  </div>
                )}
                <div className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {effortWords(run.costUsd, run.steps.ran, run.steps.total)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="~/runs" className="inline-block text-xs text-primary underline">
        Every run
      </Link>
    </div>
  );
}

export function RunCompare({ props }: { props: Record<string, any> }) {
  const a = props.runs?.a ?? {};
  const b = props.runs?.b ?? {};
  const differences: any[] = props.differences ?? [];
  const onlyIn = props.stepsOnlyIn ?? { a: [], b: [] };

  return (
    <div className="space-y-5 text-sm">
      <div className="grid grid-cols-2 gap-3">
        {[
          { run: a, when: "This run" },
          { run: b, when: props.againstChosen === "you named it" ? "The one you named" : "The run before it" },
        ].map(({ run, when }) => (
          <div key={when} className={`rounded border p-2.5 ${TONE_BORDER[runTone(run.status, run.steps?.ran ?? 0, run.steps?.total ?? 0)]}`}>
            <Label>{when}</Label>
            <div className={`text-xs font-medium ${TONE_TEXT[runTone(run.status, run.steps?.ran ?? 0, run.steps?.total ?? 0)]}`}>
              {runHeadline(run.status, run.steps?.ran ?? 0, run.steps?.total ?? 0)}
            </div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">{durationWords(run.durationMs)}</div>
          </div>
        ))}
      </div>

      {differences.length === 0 ? (
        <p className="text-muted-foreground">Both runs took the same path through {props.sameSteps} steps.</p>
      ) : (
        <div>
          <Label>
            {differences.length} {differences.length === 1 ? "step behaved" : "steps behaved"} differently · {props.sameSteps} the same
          </Label>
          <ul className="divide-y divide-border">
            {differences.map((d) => (
              <li key={d.nodeId} className="py-2">
                <div className="truncate font-medium">{d.label}</div>
                <div className="mt-0.5 grid grid-cols-2 gap-2 font-mono text-[11px] text-muted-foreground">
                  <span>then: {d.b.cause ? skipCauseLabel(d.b.cause).toLowerCase() : d.b.status}</span>
                  <span>now: {d.a.cause ? skipCauseLabel(d.a.cause).toLowerCase() : d.a.status}</span>
                </div>
                {d.a.cause && (
                  <div className={`mt-0.5 text-xs ${isProblemCause(d.a.cause) ? "text-[hsl(var(--astra-fail))]" : "text-muted-foreground"}`}>
                    {skipCauseAdvice(d.a.cause)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(onlyIn.a.length > 0 || onlyIn.b.length > 0) && (
        <div>
          <Label>The team was edited between them</Label>
          <div className="space-y-1 text-xs text-muted-foreground">
            {onlyIn.a.length > 0 && <div>Only in this run: {onlyIn.a.join(", ")}</div>}
            {onlyIn.b.length > 0 && <div>Only in the other: {onlyIn.b.join(", ")}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
