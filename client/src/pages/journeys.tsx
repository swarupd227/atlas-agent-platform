/**
 * Journey Library (ontology roadmap Phase 3) — a browsable shelf of curated,
 * pre-built industry journeys (real, already-executable multi-agent Teams
 * generated via propose-agents -> create-team-from-proposals, grounded in
 * real ontology concepts). Before this page existed, a curated journey was
 * indistinguishable from any other team in the Agent Registry — findable
 * only by knowing its exact name.
 *
 * Laid out in the Astra workspace look (.astra-scope), like the run view:
 * compact cards with the facts that matter (agents, steps, approvals, how its
 * runs went) and a detail pane with the whole team, the process flow, run
 * history and the business terms it is grounded in. A journey whose team
 * members are themselves journeys is shown as a suite with its stages in order.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useIndustry } from "@/components/industry-provider";
import { Button } from "@/components/ui/button";
import { RemoveJourney } from "./journey-removal";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Compass, Copy, ArrowRight, Loader2, Workflow, Plus, Search } from "lucide-react";

interface JourneyWorker {
  id: string;
  name: string;
  description: string | null;
}

interface JourneyRuns {
  total: number;
  completed: number;
  failed: number;
  latest: { id: string; status: string; startedAt: string | null; completedAt: string | null } | null;
}

interface Journey {
  teamAgentId: string;
  name: string;
  description: string | null;
  industryId: string | null;
  subVertical: string | null;
  status: string;
  orchestrator: { id: string; name: string };
  workers: JourneyWorker[];
  ontologyConcepts: Array<{ conceptId: string; conceptLabel: string }>;
  /** The journey's own process design, when one has been authored. */
  processFlow: { id: string; name: string; nodeCount: number; approvalGates: number } | null;
  /** The team's own runs, as the run monitor records them. */
  runs?: JourneyRuns;
  createdAt: string | null;
}

const DISPLAY = { fontFamily: "var(--astra-display)" } as const;
const OTHER_AREA = "Other";

function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono text-[11px] uppercase tracking-wider text-muted-foreground ${className}`}>{children}</span>;
}

type RunTone = "ok" | "fail" | "warn" | "none";
function Dot({ tone }: { tone: RunTone }) {
  const cls = {
    ok: "bg-[hsl(var(--astra-ok))]",
    fail: "bg-[hsl(var(--astra-fail))]",
    warn: "bg-[hsl(var(--astra-warn))]",
    none: "border border-muted-foreground bg-transparent",
  }[tone];
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

const shortDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";

function runSummary(j: Journey): { tone: RunTone; text: string; detail: string } {
  const r = j.runs;
  if (!r || r.total === 0) return { tone: "none", text: "Not run yet", detail: "" };
  const st = r.latest?.status ?? "";
  const tone: RunTone = st.startsWith("completed") ? "ok" : st === "failed" ? "fail" : "warn";
  const word = st.startsWith("completed") ? "completed" : st === "failed" ? "failed" : st === "waiting_approval" ? "waiting for approval" : st.replace(/_/g, " ");
  return {
    tone,
    text: `Last run ${word}${r.latest?.startedAt ? ` · ${shortDate(r.latest.startedAt)}` : ""}`,
    detail: `${r.completed} of ${r.total} run${r.total === 1 ? "" : "s"} completed`,
  };
}

export default function Journeys() {
  const { industry } = useIndustry();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [area, setArea] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const industryId = industry && industry.id !== "custom" ? industry.id : undefined;

  const { data: journeys = [], isLoading } = useQuery<Journey[]>({
    queryKey: [`/api/journeys?industryId=${encodeURIComponent(industryId || "")}`],
  });

  const cloneMutation = useMutation({
    mutationFn: async (teamAgentId: string) => {
      setCloningId(teamAgentId);
      const res = await apiRequest("POST", `/api/journeys/${teamAgentId}/clone`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Journey cloned", description: `${data.teamAgent?.name} is ready to customize.` });
      navigate(`/agents/${data.teamAgent?.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Clone failed", description: err.message, variant: "destructive" });
    },
    onSettled: () => setCloningId(null),
  });

  // A suite is a journey whose team members are themselves journeys; its members are its stages, in member order.
  const { byId, suites, stageOf } = useMemo(() => {
    const byId = new Map(journeys.map((j) => [j.teamAgentId, j]));
    const suites = journeys.filter((j) => j.workers.length > 0 && j.workers.every((w) => byId.has(w.id)));
    const stageOf = new Map<string, { suite: Journey; n: number; of: number }>();
    for (const s of suites) s.workers.forEach((w, i) => stageOf.set(w.id, { suite: s, n: i + 1, of: s.workers.length }));
    return { byId, suites, stageOf };
  }, [journeys]);

  const areaOf = (j: Journey) => j.subVertical || OTHER_AREA;
  const areas = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of journeys) counts.set(areaOf(j), (counts.get(areaOf(j)) ?? 0) + 1);
    return Array.from(counts.entries());
  }, [journeys]);

  const matches = (j: Journey) => {
    if (area !== "all" && areaOf(j) !== area) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [j.name, j.description ?? "", ...j.workers.map((w) => w.name), ...j.ontologyConcepts.map((c) => c.conceptLabel)]
      .join(" ")
      .toLowerCase()
      .includes(q);
  };

  const inSuite = new Set(suites.flatMap((s) => [s.teamAgentId, ...s.workers.map((w) => w.id)]));
  const visibleSuites = suites.filter((s) => matches(s) || s.workers.some((w) => matches(byId.get(w.id)!)));
  const rest = journeys.filter((j) => !inSuite.has(j.teamAgentId) && matches(j));
  const anyVisible = visibleSuites.length > 0 || rest.length > 0;
  const selected = (selectedId && byId.get(selectedId)) || visibleSuites[0] || rest[0] || journeys[0];

  const facts = (j: Journey) => {
    const out = [`${j.workers.length} ${suites.includes(j) ? "stage" : "agent"}${j.workers.length === 1 ? "" : "s"}`];
    if (j.processFlow) {
      out.push(`${j.processFlow.nodeCount} steps`, `${j.processFlow.approvalGates} approval${j.processFlow.approvalGates === 1 ? "" : "s"}`);
    } else {
      out.push("no process flow yet");
    }
    return out;
  };

  const renderCard = (j: Journey, stage?: number) => {
    const r = runSummary(j);
    const isSelected = selected?.teamAgentId === j.teamAgentId;
    // Inside a suite the stage number is already shown; a description that opens by restating it is trimmed.
    const description = stage ? (j.description ?? "").replace(/^Stage \d+ of [^.]+\.\s*/, "") : j.description;
    return (
      <button
        key={j.teamAgentId}
        type="button"
        onClick={() => setSelectedId(j.teamAgentId)}
        aria-pressed={isSelected}
        className={`h-full w-full text-left rounded-[10px] border px-4 py-3.5 flex flex-col gap-2 transition-colors ${isSelected ? "bg-accent border-foreground" : "bg-card hover:border-foreground"}`}
        data-testid={`card-journey-${j.teamAgentId}`}
      >
        {stage != null && (
          <span className="flex items-center gap-2">
            <span className="rounded bg-foreground px-1.5 font-mono text-[11px] font-medium text-background">{stage}</span>
            <Eyebrow>Stage {stage}</Eyebrow>
          </span>
        )}
        <h3 className="text-[15px] font-semibold leading-snug" style={DISPLAY} data-testid={`text-journey-name-${j.teamAgentId}`}>{j.name}</h3>
        {description && <p className={`text-[13px] text-muted-foreground ${stage != null ? "line-clamp-3" : "line-clamp-2"}`}>{description}</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
          {facts(j).map((f) => <span key={f}>{f}</span>)}
        </div>
        <div className="mt-auto grid grid-cols-[8px_1fr] items-center gap-x-2 border-t pt-2 text-[12.5px]" data-testid={`text-journey-runs-${j.teamAgentId}`}>
          <Dot tone={r.tone} />
          <span>{r.text}</span>
          {r.detail && <span className="col-start-2 font-mono text-[11px] text-muted-foreground">{r.detail}</span>}
        </div>
      </button>
    );
  };

  return (
    <div className="astra-scope bg-background text-foreground font-sans h-full overflow-y-auto" data-testid="page-journeys">
      <div className="max-w-[1480px] mx-auto px-6 pt-6 pb-16 flex flex-col gap-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[30px] leading-tight font-semibold tracking-tight" style={DISPLAY} data-testid="text-page-title">Journey Library</h1>
            <p className="text-sm text-muted-foreground" data-testid="badge-journey-count">
              {journeys.length} ready-made team{journeys.length === 1 ? "" : "s"}
              {industry && industry.id !== "custom" ? ` for ${industry.label}` : ""}. Open one to see its agents, process flow and runs.
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 w-full sm:w-[300px]">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search journeys, agents or terms"
              aria-label="Search journeys"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              data-testid="input-journey-search"
            />
          </label>
        </div>

        {areas.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by area" data-testid="filter-journey-area">
            {[["all", "All", journeys.length] as const, ...areas.map(([a, n]) => [a, a, n] as const)].map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => setArea(key)}
                aria-pressed={area === key}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[13px] ${area === key ? "bg-foreground text-background border-foreground" : "bg-card hover:bg-muted"}`}
                data-testid={`chip-area-${key}`}
              >
                {label} <span className="font-mono text-[11px] opacity-70">{n}</span>
              </button>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-5">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-[10px]" />)}
            </div>
            <Skeleton className="h-96 rounded-xl" />
          </div>
        )}

        {!isLoading && journeys.length === 0 && (
          <div className="rounded-xl border bg-card p-10 flex flex-col items-center gap-2 text-center">
            <Compass className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium">No curated journeys yet{industryId ? ` for ${industry?.label}` : ""}</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Generate one via the AI team proposal flow and mark it as a curated journey, or switch industry above.
            </p>
          </div>
        )}

        {!isLoading && journeys.length > 0 && (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_440px] gap-5 items-start">
            <div className="flex flex-col gap-7 min-w-0">
              {visibleSuites.map((s) => (
                <section key={s.teamAgentId} data-testid={`section-suite-${s.teamAgentId}`}>
                  <div className="flex items-baseline justify-between gap-3 mb-2.5">
                    <h2 className="text-[17px] font-semibold" style={DISPLAY}>Suite</h2>
                    <Eyebrow>a journey that runs other journeys in order</Eyebrow>
                  </div>
                  <div className="rounded-xl border bg-card p-4 flex flex-col gap-3.5">
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.teamAgentId)}
                      aria-pressed={selected?.teamAgentId === s.teamAgentId}
                      className={`text-left rounded-lg -m-1 p-1 flex flex-wrap items-start justify-between gap-3 ${selected?.teamAgentId === s.teamAgentId ? "bg-accent" : "hover:bg-muted"}`}
                      data-testid={`card-journey-${s.teamAgentId}`}
                    >
                      <span className="flex flex-col gap-1 max-w-[80ch]">
                        <span className="text-lg font-semibold" style={DISPLAY} data-testid={`text-journey-name-${s.teamAgentId}`}>{s.name}</span>
                        {s.description && <span className="text-[13px] text-muted-foreground">{s.description}</span>}
                      </span>
                      <span className="flex flex-wrap gap-x-3 font-mono text-xs text-muted-foreground self-center">
                        {facts(s).map((f) => <span key={f}>{f}</span>)}
                      </span>
                    </button>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(148px,1fr))] gap-2.5">
                      {s.workers.map((w, i) => renderCard(byId.get(w.id)!, i + 1))}
                    </div>
                  </div>
                </section>
              ))}

              {rest.length > 0 && (
                <section>
                  <div className="flex items-baseline justify-between gap-3 mb-2.5">
                    <h2 className="text-[17px] font-semibold" style={DISPLAY}>Journeys</h2>
                    <Eyebrow>{rest.length} journey{rest.length === 1 ? "" : "s"}</Eyebrow>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                    {rest.map((j) => renderCard(j))}
                  </div>
                </section>
              )}

              {!anyVisible && (
                <p className="text-sm text-muted-foreground" data-testid="text-journeys-no-match">No journeys match. Try another search or area.</p>
              )}
            </div>

            {selected && (
              <JourneyDetail
                journey={selected}
                stage={stageOf.get(selected.teamAgentId)}
                isSuite={suites.includes(selected)}
                area={areaOf(selected)}
                cloning={cloningId === selected.teamAgentId}
                onClone={() => cloneMutation.mutate(selected.teamAgentId)}
                navigate={navigate}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function JourneyDetail({
  journey: j,
  stage,
  isSuite,
  area,
  cloning,
  onClone,
  navigate,
}: {
  journey: Journey;
  stage?: { suite: Journey; n: number; of: number };
  isSuite: boolean;
  area: string;
  cloning: boolean;
  onClone: () => void;
  navigate: (to: string) => void;
}) {
  const r = runSummary(j);
  const runs = j.runs ?? { total: 0, completed: 0, failed: 0, latest: null };
  const flowHref = j.processFlow
    ? `/process-flows?flowId=${j.processFlow.id}&teamAgentId=${j.teamAgentId}`
    : `/process-flows?teamAgentId=${j.teamAgentId}&outcomeName=${encodeURIComponent(j.name)}`;

  return (
    <aside
      className="rounded-xl border bg-card lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] overflow-y-auto"
      aria-live="polite"
      data-testid="panel-journey-detail"
    >
      <div className="px-5 pt-5 pb-4 border-b flex flex-col gap-2">
        <Eyebrow>{stage ? `Stage ${stage.n} of ${stage.of} · ${stage.suite.name}` : isSuite ? "Suite" : area}</Eyebrow>
        <h2 className="text-[21px] font-semibold leading-tight" style={DISPLAY} data-testid="text-journey-detail-name">{j.name}</h2>
        {j.description && <p className="text-[13.5px] text-muted-foreground">{j.description}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={() => navigate(`/agents/${j.teamAgentId}`)} data-testid={`button-view-journey-${j.teamAgentId}`}>
            Open team <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
          {runs.latest && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/dag-runs/${runs.latest!.id}`)} data-testid={`button-last-run-${j.teamAgentId}`}>
              View last run
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={cloning} onClick={onClone} data-testid={`button-clone-journey-${j.teamAgentId}`}>
            {cloning ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Cloning…</> : <><Copy className="w-3.5 h-3.5 mr-1.5" /> Clone to customize</>}
          </Button>
          {/* A journey is a team wearing a library badge, so removing it asks which of the two you mean. */}
          <RemoveJourney journeyId={j.teamAgentId} journeyName={j.name} />
        </div>
      </div>

      <section className="px-5 py-4 border-b flex flex-col gap-2.5">
        <Eyebrow>Process flow</Eyebrow>
        <button
          type="button"
          onClick={() => navigate(flowHref)}
          className="flex items-center gap-3 rounded-lg border bg-background p-3 text-left hover:border-foreground transition-colors"
          data-testid={j.processFlow ? `button-view-flow-${j.teamAgentId}` : `button-create-flow-${j.teamAgentId}`}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[hsl(var(--astra-volt)/0.22)]">
            {j.processFlow ? <Workflow className="w-[18px] h-[18px]" /> : <Plus className="w-[18px] h-[18px]" />}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium truncate">{j.processFlow ? j.processFlow.name : "No process flow yet"}</span>
            <span className="block text-xs text-muted-foreground">
              {j.processFlow
                ? `${j.processFlow.nodeCount} steps · ${j.processFlow.approvalGates} approval step${j.processFlow.approvalGates === 1 ? "" : "s"}`
                : "Draw how this team's work flows, or describe it in plain English."}
            </span>
          </span>
          <span className="text-sm text-muted-foreground shrink-0">{j.processFlow ? "Open" : "Add"} →</span>
        </button>
      </section>

      <section className="px-5 py-4 border-b flex flex-col gap-2.5" data-testid="section-journey-runs">
        <Eyebrow>Runs</Eyebrow>
        <div className="grid grid-cols-3 gap-2">
          {([["Runs", runs.total], ["Completed", runs.completed], ["Failed", runs.failed]] as const).map(([k, v]) => (
            <div key={k} className="rounded-lg border bg-background px-3 py-2">
              <Eyebrow>{k}</Eyebrow>
              <div className="text-lg font-semibold tabular-nums" style={DISPLAY}>{v}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          <Dot tone={r.tone} />
          <span>{r.text}</span>
          {runs.latest && (
            <button type="button" onClick={() => navigate(`/dag-runs/${runs.latest!.id}`)} className="underline underline-offset-2 hover:text-foreground text-muted-foreground">
              open run
            </button>
          )}
        </div>
      </section>

      <section className="px-5 py-4 border-b flex flex-col gap-2.5" data-testid="section-journey-team">
        <Eyebrow>{isSuite ? "Stages, in order" : `The team · ${j.workers.length + 1} agents`}</Eyebrow>
        <ol className="flex flex-col gap-2.5">
          {!isSuite && (
            <li className="grid grid-cols-[22px_1fr] gap-2">
              <span className="font-mono text-[11px] text-muted-foreground pt-0.5">★</span>
              <span>
                <span className="block text-sm font-medium">{j.orchestrator.name}</span>
                <span className="block text-[12.5px] text-muted-foreground">Coordinates the team and hands work between agents.</span>
              </span>
            </li>
          )}
          {j.workers.map((w, i) => (
            <li key={w.id} className="grid grid-cols-[22px_1fr] gap-2" data-testid={`badge-worker-${w.id}`}>
              <span className="font-mono text-[11px] text-muted-foreground pt-0.5">{i + 1}</span>
              <span>
                <span className="block text-sm font-medium">{w.name}</span>
                {w.description && <span className="block text-[12.5px] text-muted-foreground">{w.description}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {j.ontologyConcepts.length > 0 && (
        <section className="px-5 py-4 flex flex-col gap-2.5" data-testid="section-journey-terms">
          <Eyebrow>Business terms it works with</Eyebrow>
          <p className="text-[12.5px] text-muted-foreground">
            Terms from your industry ontology that this team's agents are grounded in, so they read and write the same meaning your systems use.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {j.ontologyConcepts.map((c) => (
              <span key={c.conceptId} className="rounded-full border bg-background px-2.5 py-0.5 text-[12.5px]" data-testid={`badge-concept-${c.conceptId}`}>
                {c.conceptLabel}
              </span>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
