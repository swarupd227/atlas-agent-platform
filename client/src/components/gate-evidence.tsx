import { Link } from "wouter";
import { ArrowRight, CheckCircle2, FileText } from "lucide-react";
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
  upstreamSteps?: Array<{ label: string; stateKey: string; preview: string; verdict?: string; files?: RunFile[] }>;
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
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-medium">{s.label}</span>
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
