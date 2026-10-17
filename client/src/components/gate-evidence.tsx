import { Link } from "wouter";
import { ArrowRight, CheckCircle2, CircleDashed, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RunFile } from "@shared/run-files";

/** What a workflow gate (approval.type "hitl_gate") records as evidence -- built in
 * server/dag-execution-engine.ts's executeGateNode, so a reviewer sees the run, the steps that fed this
 * decision and their verdicts/files, instead of a flattened text blob. Every field is best-effort: an older
 * approval created before this existed, or a step whose output doesn't look like a verdict, simply omits them. */
export interface GateEvidence {
  runId?: string;
  teamAgentId?: string;
  teamAgentName?: string;
  gateLabel?: string;
  upstreamSteps?: Array<{
    label: string;
    stateKey: string;
    preview: string;
    verdict?: string;
    /** A step that emitted an object: its own fields, which is where the answer usually is. */
    fields?: Record<string, string>;
    /** Whether the step's claims were backed by connector calls, and why not when they were not. */
    verified?: { captured: boolean; why?: string };
    /** Not a direct input to the gate: the nearest step behind one that computed fields. */
    indirect?: boolean;
    files?: RunFile[];
  }>;
  files?: RunFile[];
}

function isFailingVerdict(verdict: string) {
  return /\b(FAIL|BLOCKED|REJECTED)\b/i.test(verdict);
}

function FileChip({ file }: { file: RunFile }) {
  return (
    <a
      href={`/api/agent-files/${file.id}/download`}
      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
      data-testid={`gate-evidence-file-${file.id}`}
    >
      <FileText className="w-3 h-3" />
      {file.filename || "download"}
    </a>
  );
}

export function GateEvidenceCard({ evidence, testIdPrefix }: { evidence: GateEvidence; testIdPrefix: string }) {
  const hasSteps = (evidence.upstreamSteps?.length ?? 0) > 0;
  if (!hasSteps && !evidence.runId && !evidence.files?.length) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3" data-testid={`${testIdPrefix}-gate-evidence`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {evidence.teamAgentName && <span className="font-medium text-foreground">{evidence.teamAgentName}</span>}
          {evidence.runId && <span className="font-mono">run {evidence.runId.slice(0, 8)}</span>}
        </div>
        {evidence.runId && (
          <Link href={`/dag-runs/${evidence.runId}`}>
            <Button size="sm" variant="ghost" className="text-xs h-6 px-2" data-testid={`${testIdPrefix}-view-run`}>
              View run <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        )}
      </div>

      {hasSteps && (
        <ul className="flex flex-col gap-2">
          {evidence.upstreamSteps!.map((s) => (
            <li key={s.stateKey} className="flex items-start gap-2 text-xs" data-testid={`${testIdPrefix}-step-${s.stateKey}`}>
              {/* The tick used to be unconditional: every step rendered green, including
                  one whose own record said no connector call was made. A tick is a claim
                  about evidence, so it is now only drawn when there is some. */}
              {s.verified && !s.verified.captured
                ? <CircleDashed className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" data-testid={`${testIdPrefix}-unverified-${s.stateKey}`} />
                : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />}
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-medium">
                  {s.label}
                  {/* Said, not hidden: this did not feed the gate directly, it is the
                      nearest step behind one that actually computed something. Without
                      the distinction a reader would take it for a direct input. */}
                  {s.indirect && (
                    <span className="ml-1.5 font-normal text-[11px] text-muted-foreground" data-testid={`${testIdPrefix}-indirect-${s.stateKey}`}>
                      · earlier step
                    </span>
                  )}
                </span>
                {/* The fields the step actually emitted, ahead of its prose: this is
                    where a verdict like `evaluated: 0` lives. */}
                {s.fields && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
                    {Object.entries(s.fields).map(([k, v]) => (
                      <span key={k}><span className="text-foreground/70">{k}</span>: {v}</span>
                    ))}
                  </div>
                )}
                {s.verified && !s.verified.captured && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">
                    Not verified — {s.verified.why || "no connector calls were recorded for this step"}
                  </span>
                )}
                {s.verdict && (
                  <span className={isFailingVerdict(s.verdict) ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
                    {s.verdict}
                  </span>
                )}
                {!!s.files?.length && (
                  <div className="flex flex-wrap gap-2 mt-0.5">
                    {s.files.map((f) => <FileChip key={f.id} file={f} />)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!!evidence.files?.length && !hasSteps && (
        <div className="flex flex-wrap gap-2">
          {evidence.files.map((f) => <FileChip key={f.id} file={f} />)}
        </div>
      )}
    </div>
  );
}
