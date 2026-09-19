/**
 * The approval page for a workflow gate (approval.type "hitl_gate"): a team run
 * paused at a human checkpoint. Laid out in the Astra look (.astra-scope), like
 * the run view it links to.
 *
 * The approval record carries a compact pointer to the run (see
 * dag-execution-engine.ts executeGateNode's evidenceJson); everything a reviewer
 * needs to judge is read live from the run itself: every step and how it went,
 * the output(s) up for decision, the other steps' outputs and the files. The
 * record's description -- the same material flattened into one text blob for
 * lists and notifications -- is deliberately not shown here.
 *
 * A gate can only be approved (the run continues) or rejected (the run stops):
 * the engine waits for exactly those two outcomes, so "request changes" is not
 * offered -- it would leave the run waiting until the gate timed out.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Check, Download, FileText, Hand, Loader2, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "@/components/markdown";
import { PermissionGate } from "@/components/role-provider";
import type { Approval, AuditEvent } from "@shared/schema";
import { collectRunFiles, FILES_KEY_SUFFIX, type RunFile } from "@shared/run-files";
import type { GateEvidence } from "@/components/gate-evidence";
import { splitWorkingNotes } from "@/lib/agent-output";

interface WaveNode { nodeId: string; status: string; error?: string; durationMs: number; output: Record<string, any> }
interface Wave { waveNumber: number; revisionRound?: number; nodes: WaveNode[] }
interface GateRun {
  id: string;
  status: string;
  startedAt: string | null;
  waveResults: Wave[] | null;
  currentState: Record<string, any> | null;
  finalState: Record<string, any> | null;
  initialState: Record<string, any> | null;
}
interface WavePlan { nodeConfig: Record<string, { label: string; nodeType?: string; stateKey?: string }> }

type Tone = "ok" | "fail" | "warn" | "none";
const DISPLAY = { fontFamily: "var(--astra-display)" } as const;
const FAILING = /\b(FAIL|FAILED|BLOCKED|REJECTED)\b/i;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{children}</span>;
}
function Dot({ tone }: { tone: Tone }) {
  const cls = {
    ok: "bg-[hsl(var(--astra-ok))]",
    fail: "bg-[hsl(var(--astra-fail))]",
    warn: "bg-[hsl(var(--astra-warn))]",
    none: "border border-muted-foreground bg-transparent",
  }[tone];
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}
function Panel({ title, aside, children, testId }: { title: string; aside?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section className="rounded-xl border bg-card" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <h2 className="text-base font-semibold" style={DISPLAY}>{title}</h2>
        {aside}
      </div>
      <div className="px-5 pt-3 pb-4">{children}</div>
    </section>
  );
}

const when = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
function duration(ms: number | null | undefined): string {
  if (ms == null) return "";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** A step's own text output, without the platform's tool-call ledger (that lives on the run page). */
function stepText(output: Record<string, any> | undefined): string {
  if (!output) return "";
  return Object.entries(output)
    .filter(([k, v]) => !k.endsWith(FILES_KEY_SUFFIX) && !["selectedAgentName", "managerReasoning", "__meta"].includes(k) && typeof v === "string" && v.trim())
    .map(([, v]) => String(v).split(/\n-{3,}\nPLATFORM-VERIFIED TOOL CALL LOG/)[0].trim())
    .join("\n\n");
}

/** Long text shown clipped, with a toggle to read the rest. */
function Clipped({ text, maxHeight = 480, more = "Show all", testId }: { text: string; maxHeight?: number; more?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  // Tool-loop narration before the report itself is folded away, as on the run page.
  const { notes, report } = splitWorkingNotes(text);
  const long = report.length > 1500;
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {notes && (
        <details className="group rounded-md border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer list-none select-none font-mono">
            <span className="group-open:hidden">Show the agent's working notes</span>
            <span className="hidden group-open:inline">Hide the agent's working notes</span>
          </summary>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed">{notes}</p>
        </details>
      )}
      <div className={`relative ${!open && long ? "overflow-hidden" : ""}`} style={!open && long ? { maxHeight } : undefined}>
        <Markdown text={report} className="astra-md run-output text-sm" />
        {!open && long && <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-card" />}
      </div>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="self-start text-[13px] underline underline-offset-2 text-muted-foreground hover:text-foreground">
          {open ? "Show less" : more}
        </button>
      )}
    </div>
  );
}

function Files({ files }: { files: RunFile[] }) {
  const isImage = (f: RunFile) => (f.mimeType ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(f.filename ?? "");
  const images = files.filter(isImage);
  const others = files.filter((f) => !isImage(f));
  return (
    <div className="flex flex-col gap-3">
      {images.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2.5">
          {images.map((f, i) => (
            <a key={f.id} href={`/api/agent-files/${f.id}/download`} className="aspect-[4/3] overflow-hidden rounded-md border bg-muted hover:border-foreground" data-testid={`gate-file-${f.id}`}>
              <img src={`/api/agent-files/${f.id}/download`} alt={f.filename || `Image ${i + 1}`} loading="lazy" className="h-full w-full object-contain" />
            </a>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {others.map((f) => (
            <a key={f.id} href={`/api/agent-files/${f.id}/download`} className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs hover:bg-muted" data-testid={`gate-file-${f.id}`}>
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="truncate max-w-[320px]">{f.filename || "Download file"}</span>
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkflowGateApproval({
  approval,
  requirements,
  auditTrail,
  deciding,
  onApprove,
  onReject,
}: {
  approval: Approval;
  requirements: Array<{ rule: string; met: boolean; detail: string }>;
  auditTrail: AuditEvent[];
  deciding: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const evidence = (approval.evidenceJson || {}) as GateEvidence;
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const { data: run, isLoading: runLoading } = useQuery<GateRun>({
    queryKey: ["/api/dag-execution-runs", evidence.runId],
    enabled: !!evidence.runId,
  });
  const { data: plan } = useQuery<WavePlan>({
    queryKey: ["/api/team-agents", evidence.teamAgentId, "dag-waves"],
    enabled: !!evidence.teamAgentId,
  });

  const cfg = plan?.nodeConfig ?? {};
  const gateLabel = evidence.gateLabel || "Approval";
  const pending = approval.status === "pending";
  const decided = approval.status === "approved" || approval.status === "rejected";

  // Every step the run has recorded, in order. While the run waits here, this gate is not yet in the results.
  const steps = (run?.waveResults ?? []).flatMap((w) =>
    w.nodes.map((n) => ({
      key: `${n.nodeId}-${w.waveNumber}-${w.revisionRound ?? 0}`,
      stage: w.waveNumber,
      revision: w.revisionRound,
      label: cfg[n.nodeId]?.label || n.nodeId.slice(0, 8),
      isGate: cfg[n.nodeId]?.nodeType === "edge_gate",
      stateKey: cfg[n.nodeId]?.stateKey,
      status: n.status,
      error: n.error,
      durationMs: n.durationMs,
      text: stepText(n.output),
      files: collectRunFiles(n.output),
    })),
  );
  const thisGateRecorded = steps.some((s) => s.isGate && s.label === gateLabel);
  const failedSteps = steps.filter((s) => s.status === "failed" && !s.isGate);

  // What is up for decision: the steps feeding this gate, their full output read from the run.
  const upstream = (evidence.upstreamSteps ?? []).map((u) => {
    const recorded = [...steps].reverse().find((s) => s.stateKey === u.stateKey);
    return { ...u, text: recorded?.text || u.preview, files: recorded?.files?.length ? recorded.files : u.files ?? [] };
  });
  const upstreamKeys = new Set(upstream.map((u) => u.stateKey));
  const otherSteps = steps.filter((s) => !s.isGate && s.text && !upstreamKeys.has(s.stateKey ?? ""));
  const runFiles = collectRunFiles(run?.finalState ?? run?.currentState ?? {});
  const files = runFiles.length ? runFiles : evidence.files ?? [];

  // The server records a verdict only when a step's output leads with one it recognises; otherwise
  // read it from the step's own opening lines ("## Board QA: PASS"). Uppercase only, so prose such as
  // "passed to the next step" never counts.
  const verdictFromText = (text?: string) => {
    for (const raw of (text || "").split("\n").slice(0, 12)) {
      const line = raw.replace(/^[\s#>*_-]+/, "").replace(/[*_`]+/g, "").trim();
      if (line && line.length <= 120 && /\b(PASS|PASSED|FAIL|FAILED|BLOCKED)\b/.test(line)) return line;
    }
    return undefined;
  };
  const verdicts = upstream
    .map((u) => ({ label: u.label, verdict: (u.verdict || verdictFromText(u.text))?.replace(/^#+\s*/, "") }))
    .filter((v): v is { label: string; verdict: string } => !!v.verdict);
  const failing = verdicts.some((v) => FAILING.test(v.verdict)) || failedSteps.length > 0;
  const request = String(run?.initialState?.request ?? "");
  const risk = approval.riskScore ?? 0;
  const rejectionNote = (approval.constraintsJson as any)?.rejectionReason || (approval.constraintsJson as any)?.notes;

  const statusPill = pending
    ? { tone: "warn" as Tone, text: "Waiting for your decision" }
    : approval.status === "approved"
    ? { tone: "ok" as Tone, text: "Approved" }
    : approval.status === "rejected"
    ? { tone: "fail" as Tone, text: "Rejected" }
    : { tone: "none" as Tone, text: approval.status === "expired" ? "Expired" : approval.status.replace(/_/g, " ") };

  return (
    <div className="astra-scope bg-background text-foreground font-sans h-full overflow-y-auto" data-testid="approval-detail-page">
      <div className="max-w-[1320px] mx-auto px-6 pt-5 pb-16 flex flex-col gap-5">
        <Link href="/approvals" className="inline-flex items-center gap-1.5 self-start text-[13px] text-muted-foreground hover:text-foreground" data-testid="button-back">
          <ArrowLeft className="w-3.5 h-3.5" /> Approvals
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <Eyebrow>Approval · workflow gate{evidence.teamAgentName ? ` · ${evidence.teamAgentName}` : ""}</Eyebrow>
            <h1 className="text-[30px] leading-tight font-semibold tracking-tight" style={DISPLAY} data-testid="text-approval-name">{gateLabel}</h1>
            <p className="text-sm text-muted-foreground">
              {evidence.runId && <>Run <span className="font-mono">{evidence.runId.slice(0, 8)}</span> · </>}
              requested {when(approval.createdAt)} by the team
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 font-mono text-xs" data-testid="badge-approval-status">
            <Dot tone={statusPill.tone} /> {statusPill.text}
          </span>
        </div>

        {/* The decision: the verdict up front, then the two outcomes the gate supports. */}
        <section className="overflow-hidden rounded-xl border bg-card" aria-label="Decision" data-testid="section-gate-decision">
          <div className={`flex gap-3.5 px-5 py-4 border-b ${failing ? "bg-[hsl(var(--astra-fail)/0.08)]" : ""}`} data-testid="section-gate-verdict">
            <span className="mt-2"><Dot tone={failing ? "fail" : verdicts.length ? "ok" : "none"} /></span>
            <div className="flex flex-col gap-1 min-w-0">
              {verdicts.length > 0 ? (
                verdicts.map((v) => (
                  <div key={v.label} className="text-lg font-semibold" style={DISPLAY}>{v.label}: {v.verdict.replace(/^.*?:\s*/, "")}</div>
                ))
              ) : (
                <div className="text-lg font-semibold" style={DISPLAY}>
                  Review {upstream.map((u) => u.label).join(" and ") || "the run"} before deciding
                </div>
              )}
              {failedSteps.length > 0 && (
                <ul className="list-disc pl-5 text-sm">
                  {failedSteps.map((s) => <li key={s.key}>{s.label} failed earlier in this run</li>)}
                </ul>
              )}
            </div>
          </div>

          {pending && (
            <PermissionGate action="approve_changes">
              <div className="flex flex-wrap items-center gap-2 px-5 py-3.5" data-testid="action-buttons">
                <Button onClick={onApprove} disabled={deciding} data-testid="button-approve">
                  {deciding ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
                  Approve
                </Button>
                <Button variant="outline" className="text-[hsl(var(--astra-fail))]" onClick={() => setRejecting(true)} disabled={deciding} data-testid="button-reject">
                  <X className="w-4 h-4 mr-1.5" /> Reject
                </Button>
                <span className="ml-auto text-[12.5px] text-muted-foreground">Approving lets the run continue. Rejecting stops it at this step.</span>
              </div>
              {rejecting && (
                <div className="flex flex-col gap-2 px-5 pb-4" data-testid="section-reject-reason">
                  <label htmlFor="reject-reason" className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Why is this rejected?</label>
                  <Textarea
                    id="reject-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="A reason is required. It is recorded with the decision."
                    className="min-h-[76px] bg-background"
                    data-testid="textarea-reject-reason"
                  />
                  <div className="flex gap-2">
                    <Button variant="destructive" disabled={deciding || reason.trim().length < 3} onClick={() => onReject(reason.trim())} data-testid="button-submit-reject">
                      Reject and stop the run
                    </Button>
                    <Button variant="ghost" onClick={() => { setRejecting(false); setReason(""); }} data-testid="button-cancel-reject">Cancel</Button>
                  </div>
                </div>
              )}
            </PermissionGate>
          )}

          {decided && (
            <div className="flex items-start gap-3 px-5 py-3.5" data-testid={`decision-banner-${approval.id}`}>
              <Lock className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="text-sm">
                <span className="font-medium">{approval.status === "approved" ? "Approved" : "Rejected"} by {approval.decidedBy || "someone"}</span>
                {approval.decidedAt && <span className="text-muted-foreground"> · {when(approval.decidedAt)}</span>}
                {rejectionNote && <div className="text-muted-foreground">&ldquo;{String(rejectionNote)}&rdquo;</div>}
                <div className="text-[12.5px] text-muted-foreground">
                  This decision is final. {approval.status === "approved" ? "The run continued to its next step." : "The run stopped at this step."}
                </div>
              </div>
            </div>
          )}

          {approval.status === "expired" && (
            <div className="flex items-start gap-3 px-5 py-3.5 text-sm text-muted-foreground" data-testid={`expired-note-${approval.id}`}>
              <Hand className="w-4 h-4 mt-0.5 shrink-0" /> No decision was made in time, so the run stopped at this step.
            </div>
          )}
        </section>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
          <div className="flex flex-col gap-4 min-w-0">
            <Panel
              title="The run so far"
              testId="panel-gate-run"
              aside={evidence.runId && (
                <Link href={`/dag-runs/${evidence.runId}`} className="inline-flex items-center gap-1 text-[13px] underline underline-offset-2" data-testid="link-open-run">
                  Open run <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            >
              {runLoading ? (
                <Skeleton className="h-40" />
              ) : (
                <ol className="flex flex-col">
                  {steps.map((s) => {
                    const isThis = s.isGate && s.label === gateLabel;
                    const tone: Tone = isThis ? (pending ? "warn" : approval.status === "approved" ? "ok" : "fail") : s.status === "failed" ? "fail" : s.status === "skipped" ? "none" : "ok";
                    const right = isThis ? (pending ? "waiting for you" : approval.status) : s.status === "failed" ? "failed" : s.status === "skipped" ? "skipped" : duration(s.durationMs);
                    return (
                      <li key={s.key} className="grid grid-cols-[64px_10px_1fr_auto] items-center gap-2.5 border-t first:border-t-0 py-2 text-[13.5px]">
                        <Eyebrow>Stage {s.stage}{s.revision ? `·r${s.revision}` : ""}</Eyebrow>
                        <Dot tone={tone} />
                        <span className={isThis ? "font-semibold" : ""}>{s.label}{isThis ? " (this approval)" : ""}</span>
                        <span className="font-mono text-xs text-muted-foreground">{right}</span>
                        {s.error && s.status === "failed" && (
                          <span className="col-start-3 col-end-5 -mt-1 text-[12.5px] text-[hsl(var(--astra-fail))] break-words">{s.error.slice(0, 240)}</span>
                        )}
                      </li>
                    );
                  })}
                  {!thisGateRecorded && (
                    <li className="grid grid-cols-[64px_10px_1fr_auto] items-center gap-2.5 border-t py-2 text-[13.5px]">
                      <span />
                      <Dot tone={pending ? "warn" : approval.status === "approved" ? "ok" : "fail"} />
                      <span className="font-semibold">{gateLabel} (this approval)</span>
                      <span className="font-mono text-xs text-muted-foreground">{pending ? "waiting for you" : approval.status}</span>
                    </li>
                  )}
                </ol>
              )}
            </Panel>

            {upstream.map((u) => (
              <Panel key={u.stateKey} title="Up for decision" aside={<Eyebrow>{u.label}</Eyebrow>} testId={`panel-gate-subject-${u.stateKey}`}>
                <Clipped text={u.text} more="Show the full output" />
                {u.files.length > 0 && <div className="mt-3"><Files files={u.files} /></div>}
              </Panel>
            ))}

            {files.length > 0 && (
              <Panel title="Files from this run" aside={<Eyebrow>{files.length} file{files.length === 1 ? "" : "s"}</Eyebrow>} testId="panel-gate-files">
                <Files files={files} />
              </Panel>
            )}

            {otherSteps.length > 0 && (
              <Panel title="What the other steps produced" aside={<Eyebrow>{otherSteps.length} step{otherSteps.length === 1 ? "" : "s"}</Eyebrow>} testId="panel-gate-other-steps">
                <div className="flex flex-col divide-y">
                  {otherSteps.map((s) => (
                    <details key={s.key} className="group py-2.5">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
                        <span className="font-medium">{s.label}</span>
                        <span className="font-mono text-xs text-muted-foreground group-open:hidden">Show</span>
                        <span className="hidden font-mono text-xs text-muted-foreground group-open:inline">Hide</span>
                      </summary>
                      <div className="pt-3"><Clipped text={s.text} maxHeight={360} /></div>
                    </details>
                  ))}
                </div>
              </Panel>
            )}

            {request.trim() && (
              <Panel title="What the team was asked" testId="panel-gate-request">
                <Clipped text={request} maxHeight={140} more="Show the full request" />
              </Panel>
            )}
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
            <Panel title="About this approval" testId="panel-gate-facts">
              <dl className="flex flex-col text-[13.5px]">
                {([
                  ["Kind", "Workflow approval gate"],
                  ["Team", evidence.teamAgentName || "—"],
                  ["Risk", `${risk > 7 ? "High" : risk > 4 ? "Medium" : "Low"} · ${risk.toFixed(1)} of 10`],
                  ["Requested", when(approval.createdAt)],
                  ["Reviewer", approval.requiredReviewerRole ? approval.requiredReviewerRole.replace(/_/g, " ") : "Any approver"],
                  ...(approval.dueDate ? [["Due", when(approval.dueDate)]] : []),
                ] as Array<[string, string]>).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-t first:border-t-0 py-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </Panel>

            {requirements.length > 0 && (
              <Panel title="Requirements" aside={<Eyebrow>{requirements.filter((r) => r.met).length} of {requirements.length} met</Eyebrow>} testId="panel-requirements">
                <ul className="flex flex-col text-[13.5px]">
                  {requirements.map((r) => (
                    <li key={r.rule} className="flex justify-between gap-3 border-t first:border-t-0 py-2">
                      <span title={r.detail}>{r.rule}</span>
                      <span className={r.met ? "text-[hsl(var(--astra-ok))]" : "text-[hsl(var(--astra-fail))]"}>{r.met ? "Met" : "Not met"}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <Panel title="History" testId="panel-audit-trail">
              <ul className="flex flex-col text-[13px]">
                <li className="flex justify-between gap-3 py-2">
                  <span className="font-mono text-xs text-muted-foreground">{when(approval.createdAt)}</span>
                  <span>Requested by the team</span>
                </li>
                {auditTrail
                  .filter((e) => /^approval_/.test(e.action))
                  .map((e) => (
                    <li key={e.id} className="flex justify-between gap-3 border-t py-2">
                      <span className="font-mono text-xs text-muted-foreground">{when(e.createdAt)}</span>
                      <span className="text-right">{e.action.replace(/^approval_/, "").replace(/_/g, " ")}{e.actorId ? ` by ${e.actorId}` : ""}</span>
                    </li>
                  ))}
              </ul>
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  );
}
