/**
 * What the Intelligence Context layer did on one run, shown where the run is.
 *
 * Two halves, because the layer does two things and either can happen without
 * the other:
 *  - what each step was SHOWN: the prior decisions recorded against the
 *    business objects its run had reached (a submission, a policy, an account),
 *    each marked authoritative or precedent, with every omission stated -- read
 *    from the `priorContext` the engine persists on the step's result;
 *  - what the run RECORDED: the decision records it wrote against those
 *    objects when it finished, which the next run on the same object is shown.
 *
 * Until this existed the only evidence was in the API. A step that looked for
 * prior decisions and found none is reported as exactly that, not hidden: "no
 * prior decision yet" and "this step never looked" are different facts.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { History, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export interface PriorContext {
  /**
   * Whether the step looked for prior decisions. Absent on runs from before the
   * engine recorded a skip (870a17bf): then the record existed only when the
   * step had found subjects, so a missing field means it DID look.
   */
  looked?: boolean;
  skipReason?: "layer_off" | "no_subject";
  text: string;
  subjects: string[];
  items: Array<{ subject: string; subjects: string[]; tier: string; matchAxis?: string; runId: string; decidedAt: string | null }>;
  conflicts: Array<{ subject: string; field: string }>;
  omissions: Array<{ reason: string; detail: string }>;
}

export interface ContextStep { key: string; label: string; priorContext?: PriorContext }

interface DecisionRecordRow {
  id: string;
  subject: string;
  subjectType: string;
  runId: string;
  decidedAt: string;
  decision: Record<string, unknown> | null;
  evidence: Record<string, unknown> | null;
  reviewState: string;
  contextUsed?: unknown;
  recall?: { recallable: boolean; reason: string | null };
}

const DISPLAY = { fontFamily: "var(--astra-display)" } as const;

const MATCH_LABEL: Record<string, string> = {
  same_customer: "same customer",
  same_class_of_business: "same class of business",
  similar_risk: "similar risk",
};

const shortRun = (id: string) => id.slice(0, 8);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "date not recorded");

export function RunIntelligenceContext({ runId, steps, runIsTerminal }: { runId: string; steps: ContextStep[]; runIsTerminal: boolean }) {
  const looked = steps.filter((s) => s.priorContext && s.priorContext.looked !== false);
  const noSubject = steps.filter((s) => s.priorContext?.skipReason === "no_subject").length;
  const layerOff = steps.filter((s) => s.priorContext?.skipReason === "layer_off").length;
  const skippedLine = [
    noSubject ? `${noSubject} step${noSubject !== 1 ? "s" : ""} named no business object` : "",
    layerOff ? `the context layer was off for ${layerOff} step${layerOff !== 1 ? "s" : ""}` : "",
  ].filter(Boolean).join("; ");
  const subjects = Array.from(new Set(looked.flatMap((s) => s.priorContext!.subjects ?? []))).sort();

  // Records are written when the run finishes (un-awaited), so a just-finished
  // run may need a moment; poll briefly rather than report "none" too early.
  const { data: recorded, isFetching } = useQuery<DecisionRecordRow[]>({
    queryKey: ["run-intelligence-context", runId, subjects.join("|")],
    enabled: runIsTerminal && subjects.length > 0,
    queryFn: async () => {
      const rows = await Promise.all(subjects.map(async (subject) => {
        const res = await apiRequest("GET", `/api/decision-records?subject=${encodeURIComponent(subject)}&lifecycle=all&limit=50`);
        const body = await res.json() as { records?: DecisionRecordRow[] };
        return (body.records ?? []).filter((r) => r.runId === runId);
      }));
      return rows.flat();
    },
    refetchInterval: (q) => ((q.state.data?.length ?? 0) === 0 && q.state.dataUpdateCount < 6 ? 5000 : false),
  });

  if (!looked.length) {
    return (
      <div className="rounded-xl border bg-card p-4 flex flex-col gap-1.5" data-testid="card-intelligence-context">
        <h2 className="text-base font-semibold flex items-center gap-2" style={DISPLAY}><History className="w-4 h-4" /> Intelligence Context</h2>
        <p className="text-sm text-muted-foreground" data-testid="text-intelligence-context-none">
          {layerOff && !noSubject
            ? "The context layer was off for this run, so no prior decisions were looked up."
            : "No step of this run reached a business object the context layer recognises (a submission, policy, binder, account, broker or agency id), so no prior decisions were looked up."}
        </p>
        {skippedLine && <p className="text-xs text-muted-foreground" data-testid="text-intelligence-skipped">{skippedLine}.</p>}
      </div>
    );
  }

  const shownCount = looked.reduce((n, s) => n + s.priorContext!.items.length, 0);

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-4" data-testid="card-intelligence-context">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold flex items-center gap-2" style={DISPLAY}><History className="w-4 h-4" /> Intelligence Context</h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          {looked.length} step{looked.length !== 1 ? "s" : ""} looked · {shownCount} prior decision{shownCount !== 1 ? "s" : ""} shown
        </span>
      </div>

      {skippedLine && <p className="text-xs text-muted-foreground" data-testid="text-intelligence-skipped">Not looked up: {skippedLine}.</p>}

      <div className="flex flex-wrap gap-1.5" data-testid="list-intelligence-subjects">
        {subjects.map((s) => (
          <span key={s} className="rounded-full border px-2 py-0.5 font-mono text-[11px]">{s}</span>
        ))}
      </div>

      <section className="flex flex-col gap-3" aria-label="Prior decisions each step was shown">
        <h3 className="text-sm font-semibold">What each step was shown</h3>
        {looked.map((s) => {
          const pc = s.priorContext!;
          return (
            <div key={s.key} className="rounded-lg border p-3 flex flex-col gap-2" data-testid={`intelligence-step-${s.key}`}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-sm font-medium">{s.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{pc.items.length ? `${pc.items.length} shown` : "none available"}</span>
              </div>
              {pc.conflicts.length > 0 && (
                <p className="text-xs flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Conflicting records reported, not resolved: {pc.conflicts.map((c) => `${c.subject} · ${c.field}`).join("; ")}
                </p>
              )}
              {pc.items.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {pc.items.map((it, i) => (
                    <li key={i} className="text-xs flex flex-wrap items-center gap-x-2 gap-y-1" data-testid={`intelligence-item-${s.key}-${i}`}>
                      <span className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] ${it.tier === "authoritative" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-sky-500/15 text-sky-700 dark:text-sky-300"}`}>
                        {it.tier === "authoritative" ? "Authoritative" : `Precedent${it.matchAxis ? ` · ${MATCH_LABEL[it.matchAxis] ?? it.matchAxis}` : ""}`}
                      </span>
                      <span className="font-mono">{it.subject}</span>
                      <span className="text-muted-foreground">decided {when(it.decidedAt)} in run</span>
                      <Link href={`/dag-runs/${it.runId}`} className="font-mono underline underline-offset-2">{shortRun(it.runId)}</Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No prior decision is recorded yet for {pc.subjects.join(", ")} -- this step decided without precedent.</p>
              )}
              {pc.omissions.length > 0 && (
                <ul className="flex flex-col gap-0.5">
                  {pc.omissions.map((o, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground">Not shown: {o.detail || o.reason}</li>
                  ))}
                </ul>
              )}
              <details className="group">
                <summary className="cursor-pointer list-none text-[11px] font-mono text-muted-foreground hover:text-foreground">
                  <span className="group-open:hidden">Show exactly what the step was given</span>
                  <span className="hidden group-open:inline">Hide</span>
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-2.5 font-mono text-[11px] leading-normal whitespace-pre-wrap break-words" data-testid={`text-prior-context-${s.key}`}>{pc.text}</pre>
              </details>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2" aria-label="Decisions this run recorded">
        <h3 className="text-sm font-semibold">What this run recorded for the next one</h3>
        {!runIsTerminal ? (
          <p className="text-xs text-muted-foreground">Decisions are recorded when the run finishes.</p>
        ) : !recorded?.length ? (
          <p className="text-xs text-muted-foreground" data-testid="text-intelligence-recorded-none">
            {isFetching ? "Looking for the records this run wrote..." : "No decision record from this run yet. Records are written just after a run finishes; a run whose only decisions are the identifiers it started from records nothing."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="list-intelligence-recorded">
            {recorded.map((r) => {
              const fields = Object.keys(r.decision ?? {});
              return (
                <li key={r.id} className="rounded-lg border p-2.5 text-xs flex flex-col gap-1" data-testid={`intelligence-record-${r.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{r.subject}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">{r.reviewState}</span>
                    {r.recall && <span className="text-muted-foreground">{r.recall.recallable ? "offered to later runs" : `withheld: ${r.recall.reason}`}</span>}
                  </div>
                  <span className="text-muted-foreground">
                    {fields.length} decision field{fields.length !== 1 ? "s" : ""}{fields.length ? `: ${fields.slice(0, 8).join(", ")}${fields.length > 8 ? ", ..." : ""}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
