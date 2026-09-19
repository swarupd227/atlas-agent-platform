import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Bot,
  User,
  Cog,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AuditEvent, AuditChainHealthCheck } from "@shared/schema";

type Facet = { value: string; count: number };

const ACRONYMS = new Set(["sla", "mcp", "llm", "api", "kb", "csv", "ai", "e2e", "a2a", "id", "url", "kpi", "sso", "rag", "dag"]);
/** "mcp_server.initialize_failed" -> "MCP server initialize failed". */
function humanize(s: string | null | undefined): string {
  if (!s) return "";
  const words = s.replace(/[._-]+/g, " ").trim().split(/\s+/);
  return words.map((w, i) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase())).join(" ");
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Red for failures and breaches, green for approvals and successes, neutral otherwise. */
function tone(action: string): "bad" | "good" | "neutral" {
  const a = action.toLowerCase();
  if (/(fail|error|breach|violation|blocked|reject|denied|mismatch|broken|delete)/.test(a)) return "bad";
  if (/(approved|created|success|passed|verified|connected|initialized)/.test(a)) return "good";
  return "neutral";
}
const TONE_DOT = { bad: "bg-red-500", good: "bg-emerald-500", neutral: "bg-muted-foreground/40" };

function parseDetails(details: string | null | undefined): Record<string, unknown> | null {
  if (!details || details[0] !== "{") return null;
  try { return JSON.parse(details); } catch { return null; }
}

const PERIODS: Array<{ key: string; label: string; days: number | null }> = [
  { key: "1", label: "24 hours", days: 1 },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "all", label: "All time", days: null },
];

function dayLabel(d: Date): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export default function AuditTrail() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [actorType, setActorType] = useState("all");
  const [action, setAction] = useState("all");
  const [objectType, setObjectType] = useState("all");
  const [period, setPeriod] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [openEvent, setOpenEvent] = useState<AuditEvent | null>(null);
  const limit = 50;

  // A quick period sets the start date; typed dates win when present.
  const periodStart = useMemo(() => {
    const p = PERIODS.find((x) => x.key === period);
    if (!p?.days) return "";
    return new Date(Date.now() - p.days * 86400000).toISOString();
  }, [period]);
  const effectiveStart = startDate || periodStart;

  const params = new URLSearchParams();
  if (actorType !== "all") params.set("actorType", actorType);
  if (action !== "all") params.set("action", action);
  if (objectType !== "all") params.set("objectType", objectType);
  if (search) params.set("search", search);
  if (effectiveStart) params.set("startDate", effectiveStart);
  if (endDate) params.set("endDate", endDate);
  params.set("sort", "newest");
  params.set("page", String(page));
  params.set("limit", String(limit));

  const { data, isLoading, isFetching } = useQuery<{
    events: AuditEvent[];
    total: number;
    page: number;
    totalPages: number;
    facets?: { actions: Facet[]; objectTypes: Facet[]; actorTypes: Facet[] };
  }>({
    queryKey: [`/api/audit-events/filtered?${params.toString()}`],
    placeholderData: (prev) => prev,
  });

  const { data: healthData, isLoading: healthLoading } = useQuery<{
    latest: AuditChainHealthCheck | null;
    history: AuditChainHealthCheck[];
  }>({
    queryKey: ["/api/audit-chain/health"],
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: integrityData, isLoading: integrityLoading, isFetching: integrityFetching, refetch: refetchIntegrity } = useQuery<{
    valid: boolean;
    totalEvents: number;
    verifiedEvents: number;
    brokenAt?: number;
    persistenceWarning?: string;
  }>({
    queryKey: ["/api/audit-events/verify-integrity"],
    enabled: false,
  });

  // Names for the ids events carry, so rows read "Campaign Objective Strategist", not a UUID.
  const { data: agents } = useQuery<Array<{ id: string; name: string }>>({ queryKey: ["/api/agents"], staleTime: 60000 });
  const agentName = useMemo(() => new Map((agents || []).map((a) => [a.id, a.name])), [agents]);

  const handleVerifyIntegrity = () => {
    setVerifyOpen(true);
    refetchIntegrity().then(({ data }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/audit-chain/health"] });
      if (data?.persistenceWarning) {
        toast({ title: "Health record not saved", description: data.persistenceWarning, variant: "destructive" });
      }
    });
  };

  const handleExportCsv = () => {
    const exportParams = new URLSearchParams(params);
    exportParams.delete("page");
    exportParams.delete("limit");
    exportParams.delete("sort");
    const a = document.createElement("a");
    a.href = `/api/audit-events/export?${exportParams.toString()}`;
    a.download = "audit-events.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleClearFilters = () => {
    setSearch(""); setActorType("all"); setAction("all"); setObjectType("all");
    setPeriod("all"); setStartDate(""); setEndDate(""); setPage(1);
  };
  const hasActiveFilters = search || actorType !== "all" || action !== "all" || objectType !== "all" || period !== "all" || startDate || endDate;

  const events = data?.events || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, data?.totalPages || 1);
  const facets = data?.facets;

  const latest = healthData?.latest ?? null;
  const history = healthData?.history ?? [];
  const chainStatus = healthLoading ? "checking" : latest === null ? "unknown" : latest.valid ? "valid" : "broken";

  const who = (e: AuditEvent): { icon: typeof Bot; name: string; kind: string } => {
    const id = e.actorId || "";
    if (e.actorType === "agent") return { icon: Bot, name: agentName.get(id) || (id ? "Agent" : "An agent"), kind: "Agent" };
    if (e.actorType === "system" || id === "system") return { icon: Cog, name: id === "system" || !id ? "Platform" : humanize(id), kind: "Platform" };
    if (["user", "current-user", "null"].includes(id)) return { icon: User, name: "A user", kind: humanize(e.actorType) };
    if (!id || UUID.test(id)) return { icon: User, name: e.actorType === "user" ? "A user" : humanize(e.actorType), kind: humanize(e.actorType) };
    return { icon: User, name: id, kind: humanize(e.actorType) };
  };
  const onWhat = (e: AuditEvent): string => {
    const d = parseDetails(e.details);
    const named = (d?.agentName || d?.name || d?.label || d?.filename || d?.toolName || d?.serverName) as string | undefined;
    if (named) return String(named);
    if (e.objectType === "agent" && e.objectId && agentName.get(e.objectId)) return agentName.get(e.objectId)!;
    if (d?.agentId && agentName.get(String(d.agentId))) return agentName.get(String(d.agentId))!;
    return e.objectId ? (UUID.test(e.objectId) ? e.objectId.slice(0, 8) : e.objectId) : "";
  };
  const summary = (e: AuditEvent): string => {
    if (!e.details) return "";
    if (parseDetails(e.details)) {
      const d = parseDetails(e.details)!;
      const bits = ["reason", "message", "error", "status", "decision", "policyDecision", "environment"]
        .filter((k) => d[k] !== undefined && d[k] !== null && typeof d[k] !== "object")
        .map((k) => `${humanize(k)}: ${String(d[k])}`);
      return bits.join(" · ");
    }
    return e.details;
  };

  // Group the page by day, newest first.
  const groups = useMemo(() => {
    const out: Array<{ day: string; items: Array<{ e: AuditEvent; index: number }> }> = [];
    events.forEach((e, index) => {
      const day = e.createdAt ? dayLabel(new Date(e.createdAt)) : "Undated";
      if (!out.length || out[out.length - 1].day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push({ e, index });
    });
    return out;
  }, [events]);

  const facetSelect = (value: string, onChange: (v: string) => void, all: string, options: Facet[] | undefined, testId: string, fixed?: string) => (
    <Select value={value} onValueChange={(v) => { onChange(v); setPage(1); }}>
      <SelectTrigger className="h-9 w-auto min-w-[150px] max-w-[240px] bg-card text-[13px]" data-testid={testId}>
        <SelectValue placeholder={all} />
      </SelectTrigger>
      <SelectContent className="astra-scope font-sans max-h-80">
        <SelectItem value="all">{all}</SelectItem>
        {fixed && value !== "all" && !(options || []).some((o) => o.value === value) && <SelectItem value={value}>{humanize(value)}</SelectItem>}
        {(options || []).map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {humanize(o.value)} <span className="ml-1 font-mono text-[11px] text-muted-foreground">{o.count.toLocaleString()}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="astra-scope flex min-h-full flex-col gap-5 bg-background p-6 font-sans text-foreground" data-testid="page-audit-trail">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[260px]">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Review</span>
          <h1 className="font-[family-name:var(--astra-display)] text-2xl font-semibold tracking-tight" data-testid="text-audit-title">Audit trail</h1>
          <p className="mt-0.5 max-w-[68ch] text-sm text-muted-foreground" data-testid="text-audit-subtitle">
            Every action by people, agents and the platform, in one tamper-evident record.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExportCsv} data-testid="button-export-csv">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={handleVerifyIntegrity} disabled={integrityFetching} data-testid="button-verify-integrity">
            {integrityFetching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Shield className="mr-1.5 h-3.5 w-3.5" />} Verify now
          </Button>
        </div>
      </div>

      {/* Chain integrity: the one fact an auditor wants first. */}
      <section
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 ${chainStatus === "broken" ? "border-red-500/40 bg-red-500/5" : "bg-card"}`}
        data-testid="card-chain-health"
      >
        {chainStatus === "checking" ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
        ) : chainStatus === "valid" ? (
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : chainStatus === "broken" ? (
          <ShieldAlert className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
        ) : (
          <Shield className="h-5 w-5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" data-testid="text-chain-status">
            {chainStatus === "checking" ? "Checking the hash chain…"
              : chainStatus === "valid" ? "Hash chain intact: no event has been altered or removed"
              : chainStatus === "broken" ? "Hash chain broken: an event was altered or removed"
              : "Hash chain not checked yet"}
          </p>
          {latest ? (
            <p className="font-mono text-[11.5px] text-muted-foreground">
              <span data-testid="text-events-verified">{latest.verifiedEvents.toLocaleString()} of {latest.totalEvents.toLocaleString()} events verified</span>
              {" · "}<span data-testid="text-last-checked">{dayLabel(new Date(latest.checkedAt!))} {new Date(latest.checkedAt!).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
              {" · "}<span data-testid="badge-trigger-type">{latest.triggeredBy === "manual" ? "manual check" : "scheduled check"}</span>
              {" · "}{latest.durationMs}ms
            </p>
          ) : (
            !healthLoading && <p className="text-xs text-muted-foreground">The first check runs when the platform starts; use Verify now to run one.</p>
          )}
        </div>
        {history.length > 0 && (
          <div className="flex items-center gap-1.5" data-testid="chain-history-strip">
            <span className="mr-1 font-mono text-[11px] text-muted-foreground">last {Math.min(history.length, 10)} checks</span>
            {history.slice(0, 10).reverse().map((check) => (
              <Tooltip key={check.id}>
                <TooltipTrigger asChild>
                  <span className={`h-2.5 w-2.5 rounded-full ${check.valid ? "bg-emerald-500" : "bg-red-500"}`} data-testid={`dot-check-${check.id}`} />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <p>{check.valid ? "Intact" : "Broken"} · {check.triggeredBy}</p>
                  <p className="text-muted-foreground">{new Date(check.checkedAt!).toLocaleString()}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
        {chainStatus === "broken" && latest?.brokenAt != null && (
          <p className="basis-full text-sm text-red-700 dark:text-red-400" data-testid="banner-chain-broken">
            The chain breaks at event <span className="font-mono font-semibold" data-testid="text-banner-broken-at">#{latest.brokenAt}</span>. An incident has been opened; review the events from there on.
          </p>
        )}
      </section>

      {/* Filters: one row. The choices come from the events that exist, with counts. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search who, what or details..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-9 bg-card pl-8 text-[13px]"
            data-testid="input-search"
          />
        </div>
        {facetSelect(actorType, setActorType, "Anyone", facets?.actorTypes, "select-actor-type", "fixed")}
        {facetSelect(action, setAction, "Any action", facets?.actions, "select-action", "fixed")}
        {facetSelect(objectType, setObjectType, "Anything", facets?.objectTypes, "select-object-type", "fixed")}
        <div className="inline-flex overflow-hidden rounded-[7px] border bg-card" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => { setPeriod(p.key); setStartDate(""); setPage(1); }}
              aria-pressed={period === p.key && !startDate}
              className={`px-2.5 py-1.5 text-[12.5px] ${period === p.key && !startDate ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`button-period-${p.key}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          From
          <Input
            id="audit-start-date" type="date" aria-label="Start date"
            className="h-9 w-[140px] bg-card text-[13px] dark:[&::-webkit-calendar-picker-indicator]:invert"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            data-testid="input-start-date"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          to
          <Input
            id="audit-end-date" type="date" aria-label="End date"
            className="h-9 w-[140px] bg-card text-[13px] dark:[&::-webkit-calendar-picker-indicator]:invert"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            data-testid="input-end-date"
          />
        </label>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters} data-testid="button-clear-filters">
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-muted-foreground">
        <span data-testid="text-total-events">
          {total === 0 ? "No events" : `Showing ${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()} event${total !== 1 ? "s" : ""}`} · newest first
          {isFetching && !isLoading && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
        </span>
        <span data-testid="text-page-info">Page {page} of {totalPages}</span>
      </div>

      {/* The events */}
      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground" data-testid="text-no-events">
            No events match these filters.{hasActiveFilters ? " Try clearing some of them." : ""}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="border-b text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="w-[72px] px-4 py-2 font-medium">Time</th>
                  <th className="w-[22%] px-3 py-2 font-medium">Who</th>
                  <th className="w-[22%] px-3 py-2 font-medium">What</th>
                  <th className="px-3 py-2 font-medium">On</th>
                  <th className="w-[64px] px-4 py-2 text-right font-medium">#</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={`d-${g.day}`}>
                    <tr className="bg-muted/40">
                      <td colSpan={5} className="px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{g.day}</td>
                    </tr>
                    {g.items.map(({ e, index }) => {
                      const w = who(e);
                      const s = summary(e);
                      return (
                        <tr
                          key={e.id}
                          onClick={() => setOpenEvent(e)}
                          className="cursor-pointer border-t align-top hover:bg-accent/40"
                          data-testid={`row-event-${index}`}
                        >
                          <td className="whitespace-nowrap px-4 py-2 font-mono text-[12px] text-muted-foreground" data-testid={`text-timestamp-${index}`}>
                            {e.createdAt ? new Date(e.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—"}
                          </td>
                          <td className="px-3 py-2" data-testid={`text-actor-${index}`}>
                            <span className="flex min-w-0 items-center gap-1.5">
                              <w.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate" title={e.actorId || undefined}>{w.name}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2" data-testid={`text-action-${index}`}>
                            <span className="flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone(e.action)]}`} />
                              <span className={tone(e.action) === "bad" ? "text-red-700 dark:text-red-400" : ""}>{humanize(e.action)}</span>
                            </span>
                          </td>
                          <td className="min-w-0 px-3 py-2" data-testid={`text-object-${index}`}>
                            <span className="block truncate">
                              <span className="text-muted-foreground">{humanize(e.objectType)}</span>{" "}
                              <span className="font-medium">{onWhat(e)}</span>
                            </span>
                            {s && <span className="block truncate text-[12px] text-muted-foreground" data-testid={`text-details-${index}`}>{s}</span>}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[11.5px] text-muted-foreground" data-testid={`text-seq-${index}`}>
                            {e.sequenceNum ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="button-prev-page">
            <ChevronLeft className="mr-1 h-4 w-4" /> Newer
          </Button>
          <span className="px-2 font-mono text-xs text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} data-testid="button-next-page">
            Older <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* One event, in full */}
      <Sheet open={!!openEvent} onOpenChange={(o) => !o && setOpenEvent(null)}>
        <SheetContent className="astra-scope w-full overflow-y-auto font-sans sm:max-w-[520px]" data-testid="sheet-event">
          {openEvent && (() => {
            const e = openEvent;
            const w = who(e);
            const d = parseDetails(e.details);
            const agentId = e.actorType === "agent" ? e.actorId : e.objectType === "agent" ? e.objectId : (d?.agentId as string | undefined);
            return (
              <>
                <SheetHeader>
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Event #{e.sequenceNum ?? "—"}</span>
                  <SheetTitle className="font-[family-name:var(--astra-display)] text-xl">{humanize(e.action)}</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-5 text-[13px]">
                  <div className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5">
                    <span className="text-muted-foreground">When</span>
                    <span>{e.createdAt ? new Date(e.createdAt).toLocaleString() : "—"}</span>
                    <span className="text-muted-foreground">Who</span>
                    <span>{w.name} <span className="text-muted-foreground">· {w.kind}{e.actorId && e.actorId !== w.name ? ` · ${e.actorId}` : ""}</span></span>
                    <span className="text-muted-foreground">On</span>
                    <span>{humanize(e.objectType)} {onWhat(e)}{e.objectId && onWhat(e) !== e.objectId ? <span className="block font-mono text-[11.5px] text-muted-foreground">{e.objectId}</span> : null}</span>
                  </div>
                  {agentId && agentName.get(agentId) && (
                    <Link href={`/agents/${agentId}`} className="inline-flex items-center gap-1.5 text-[13px] underline underline-offset-2">
                      Open {agentName.get(agentId)} <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                  <div>
                    <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Details</p>
                    {d ? (
                      <div className="divide-y rounded-lg border">
                        {Object.entries(d).map(([k, v]) => (
                          <div key={k} className="grid grid-cols-[140px_1fr] gap-3 px-3 py-1.5">
                            <span className="text-muted-foreground">{humanize(k)}</span>
                            <span className="break-all font-mono text-[12px]">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap rounded-lg border px-3 py-2">{e.details || "No details recorded."}</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Chain</p>
                    <div className="space-y-1 rounded-lg border px-3 py-2 font-mono text-[11.5px]">
                      <p><span className="text-muted-foreground">this event  </span><span className="break-all">{e.eventHash || "—"}</span></p>
                      <p><span className="text-muted-foreground">links to    </span><span className="break-all">{e.previousHash || "—"}</span></p>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">Each event's hash covers the one before it, so changing any past event breaks every link after it.</p>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="astra-scope font-sans">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-[family-name:var(--astra-display)]">
              <Shield className="h-5 w-5" /> Verify the hash chain
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {integrityLoading || integrityFetching ? (
              <div className="flex flex-col items-center gap-3 py-6" data-testid="verify-loading">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Re-computing every event's hash and link…</p>
              </div>
            ) : integrityData ? (
              <div className="flex flex-col gap-4" data-testid="verify-results">
                <div className="flex items-center gap-3">
                  {integrityData.valid ? <ShieldCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" /> : <ShieldAlert className="h-8 w-8 text-red-600 dark:text-red-400" />}
                  <div>
                    <p className="text-lg font-semibold" data-testid="text-integrity-status">{integrityData.valid ? "Chain intact" : "Chain broken"}</p>
                    <p className="text-sm text-muted-foreground">
                      {integrityData.valid ? "Every event still matches its hash and links to the one before it." : "At least one event no longer matches its hash: the record was altered or an event removed."}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Events in the chain</p>
                    <p className="text-xl font-semibold" data-testid="text-total-verified-events">{integrityData.totalEvents.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Verified</p>
                    <p className="text-xl font-semibold" data-testid="text-verified-count">{integrityData.verifiedEvents.toLocaleString()}</p>
                  </div>
                </div>
                {integrityData.brokenAt !== undefined && integrityData.brokenAt !== null && (
                  <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400" data-testid="text-broken-at">
                    The chain breaks at event <span className="font-mono font-semibold">#{integrityData.brokenAt}</span>.
                  </p>
                )}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Verification didn't return a result. Try again.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
