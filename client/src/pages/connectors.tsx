/**
 * Connectors — one page: what the agents can reach, whether it is actually
 * working, and who uses it.
 *
 * The audit this replaces (2026-09-27, read off the live platform): the surface
 * was nine routes over three registries — a four-tab hub, a marketplace, a tool
 * catalog, publishers, apps, prompts, resources, relay agents — and answering
 * "can my agent reach ServiceNow, and is it up?" meant visiting four of them.
 *
 * Worse, its health column was not true. 113 of 131 connectors displayed
 * "healthy" while 129 of them had not been probed for over a week and 18 had
 * never been probed at all, because nothing re-probes a connector on its own. The
 * defect was the tense: "is healthy" about a measurement taken weeks ago.
 *
 * The deeper cause was that the platform had ONE check — an HTTP GET to a bespoke
 * `healthCheckPath` — and 131 of 132 connectors had no such path, so the scan
 * probed exactly one of them. There is now a check per kind (an MCP tools/list
 * handshake, the vendor's own credential test, a mock's read-only endpoint), so
 * this page also says WHICH check produced a state, and names the states that
 * predate the platform recording that at all.
 *
 * So: every health claim here is past tense and carries its age, from the same
 * functions Cowork uses (shared/connector-health-words.ts); 85 connectors that
 * point at a mock endpoint on this host are marked as such instead of looking like
 * real systems; the 115 that no agent uses are a group rather than the bulk of an
 * undifferentiated list; and the only control that writes anything is Verify,
 * which says what it costs. Everything else links to the page that owns it rather
 * than being a button that does nothing.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plug, Search, ShieldCheck, RefreshCw, AlertTriangle, FlaskConical, Sparkles, ArrowUpRight, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QueryBoundary } from "@/components/ui-vocab";
import { usePermission } from "@/components/role-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/format";
import { checkedAgo, checkOffer, checkProves, healthBadge, healthTone, healthWords, isStale, type ConnectorCheckKind, type ConnectorHealthState } from "@shared/connector-health-words";

interface ConnectorRow {
  id: string;
  name: string;
  state: ConnectorHealthState;
  checkedAt: string | null;
  ageDays: number | null;
  stale: boolean;
  detail: string | null;
  mock: boolean;
  canProbe: boolean;
  /** The check that would run now, and — when there is none — what is missing. */
  checkKind: ConnectorCheckKind;
  checkWhy: string;
  /** What produced the state on record. Null where the state predates the platform recording that. */
  measuredBy: ConnectorCheckKind | null;
  /** For an enterprise connector: whether its MCP protocol endpoint is mounted at all. */
  protocolMounted: boolean | null;
  riskTier: string | null;
  transport: string | null;
  agentsBound: number;
}

interface PlatformRow {
  id: string;
  name: string;
  category: string;
  authMethod: string | null;
  capabilities: string[];
  connected: boolean;
  connection: { status: string; lastTestedAt: string | null; lastError: string | null } | null;
  credentialFields: Array<{ key: string; label: string; required: boolean; secret: boolean }>;
}

interface Overview {
  connectors: ConnectorRow[];
  counts: {
    connectors: number;
    checkedWithinAWeek: number;
    staleOverAWeek: number;
    neverChecked: number;
    unreachableAtLastCheck: number;
    usedByNoAgent: number;
    mockEndpoints: number;
    canBeProbed: number;
    unknownProvenance: number;
    protocolMountMissing: number;
    byCheckKind: Record<string, number>;
    platforms: number;
    platformsConnected: number;
  };
  platforms: PlatformRow[];
}

type Facet = "all" | "in-use" | "unused" | "mock" | "unverified";

const TONE_TEXT: Record<"good" | "warn" | "bad", string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

/** Every risk tier gets a colour: the rows store both MEDIUM and medium. */
function riskTone(tier: string | null): string {
  switch ((tier ?? "").toUpperCase()) {
    case "HIGH":
    case "CRITICAL": return "text-red-600 dark:text-red-400";
    case "MEDIUM": return "text-amber-600 dark:text-amber-400";
    case "LOW": return "text-muted-foreground";
    default: return "text-muted-foreground";
  }
}

export function askAstraAboutConnector(name: string): string {
  return `About the connector "${name}": `;
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 min-w-[10rem]" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${tone ?? ""}`}>{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

export default function Connectors() {
  const [query, setQuery] = useState("");
  const [facet, setFacet] = useState<Facet>("in-use");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const canManage = usePermission("manage_mcp_servers");

  const overviewQ = useQuery<Overview>({ queryKey: ["/api/connectors/overview"] });
  const data = overviewQ.data;
  const counts = data?.counts;

  const verify = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/connectors/${id}/verify`, {})).json(),
    onSuccess: (r: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/connectors/overview"] });
      if (r?.probeWasPossible === false) {
        toast({ title: `Nothing could check ${r.connector?.name ?? "it"}`, description: `${r?.detail ?? ""} Nothing was recorded: a connector nothing can check is not a failing one.` });
        return;
      }
      toast({
        title: r?.healthy ? `${r.connector?.name} answered` : `${r.connector?.name} did not answer`,
        description: r?.detail ?? undefined,
        variant: r?.healthy ? undefined : "destructive",
      });
    },
    onError: (err: Error) => toast({ title: "Could not check it", description: err.message, variant: "destructive" }),
  });

  const connectors = data?.connectors ?? [];
  const inFacet = useMemo(() => {
    const byFacet = (c: ConnectorRow) => {
      switch (facet) {
        case "in-use": return c.agentsBound > 0;
        case "unused": return c.agentsBound === 0;
        case "mock": return c.mock;
        case "unverified": return c.state === "never_checked";
        default: return true;
      }
    };
    const q = query.trim().toLowerCase();
    return connectors
      .filter(byFacet)
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
      // What needs attention first: failing, then never checked, then stale.
      .sort((a, b) => rank(a) - rank(b) || b.agentsBound - a.agentsBound || a.name.localeCompare(b.name));
  }, [connectors, facet, query]);

  const selected = connectors.find((c) => c.id === selectedId) ?? inFacet[0] ?? null;
  const platform = useMemo(
    () => (selected ? (data?.platforms ?? []).find((p) => p.name.toLowerCase() === selected.name.toLowerCase()) ?? null : null),
    [selected, data?.platforms],
  );

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="page-connectors">
      <div className="border-b">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2"><Plug className="w-4 h-4" /> Connectors</h1>
            <p className="text-sm text-muted-foreground">Everything your agents can reach, and what it costs to trust it.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild data-testid="link-classic-integrations">
              <Link href="/integrations">Platforms &amp; catalog<ArrowUpRight className="w-3 h-3 ml-1" /></Link>
            </Button>
            <Button size="sm" onClick={() => navigate(`/astra?ask=${encodeURIComponent("Which of our connectors has nobody using it?")}`)} data-testid="button-ask-astra">
              <Sparkles className="w-3.5 h-3.5 mr-1" />Ask Astra
            </Button>
          </div>
        </div>

        <div className="flex items-stretch gap-1 px-2 pb-1 flex-wrap divide-x">
          <Stat label="Platforms connected" value={counts ? `${counts.platformsConnected} of ${counts.platforms}` : "—"} hint={counts ? `${counts.platforms - counts.platformsConnected} never connected` : undefined} />
          <Stat label="Used by an agent" value={counts ? `${counts.connectors - counts.usedByNoAgent} of ${counts.connectors}` : "—"} hint={counts ? `${counts.usedByNoAgent} bound by nobody` : undefined} />
          <Stat
            label="Verified this week"
            value={counts ? `${counts.checkedWithinAWeek} of ${counts.connectors}` : "—"}
            hint={counts ? `${counts.neverChecked} never checked at all` : undefined}
            tone={counts && counts.checkedWithinAWeek < counts.connectors / 2 ? TONE_TEXT.warn : undefined}
          />
          <Stat label="Failing at last check" value={counts ? String(counts.unreachableAtLastCheck) : "—"} tone={counts && counts.unreachableAtLastCheck > 0 ? TONE_TEXT.bad : undefined} />
          <Stat
            label="Can be checked at all"
            value={counts ? `${counts.canBeProbed} of ${counts.connectors}` : "—"}
            hint={counts ? `${counts.connectors - counts.canBeProbed} nothing can check` : undefined}
            tone={counts && counts.canBeProbed < counts.connectors ? TONE_TEXT.warn : undefined}
          />
          <Stat label="Mock endpoints" value={counts ? String(counts.mockEndpoints) : "—"} hint="on this host, not a real system" />
          {/* Both of these exist only while the fleet has the problem they name. */}
          {!!counts?.unknownProvenance && (
            <Stat
              label="State of unknown origin"
              value={`${counts.unknownProvenance} of ${counts.connectors}`}
              hint="names no check that produced it"
              tone={TONE_TEXT.warn}
            />
          )}
          {!!counts?.protocolMountMissing && (
            <Stat
              label="No protocol endpoint"
              value={String(counts.protocolMountMissing)}
              hint="no agent can call these over MCP"
              tone={TONE_TEXT.bad}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 py-2 border-b flex-wrap">
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search connectors" className="pl-8 h-8" data-testid="input-search-connectors" />
        </div>
        {([
          ["in-use", `In use${counts ? ` · ${counts.connectors - counts.usedByNoAgent}` : ""}`],
          ["unused", `Unused${counts ? ` · ${counts.usedByNoAgent}` : ""}`],
          ["unverified", `Never verified${counts ? ` · ${counts.neverChecked}` : ""}`],
          ["mock", `Mock${counts ? ` · ${counts.mockEndpoints}` : ""}`],
          ["all", `All${counts ? ` · ${counts.connectors}` : ""}`],
        ] as Array<[Facet, string]>).map(([id, label]) => (
          <Button key={id} size="sm" variant={facet === id ? "default" : "outline"} className="h-8" onClick={() => setFacet(id)} data-testid={`facet-${id}`}>
            {label}
          </Button>
        ))}
      </div>

      <QueryBoundary isLoading={overviewQ.isLoading} isError={overviewQ.isError} error={overviewQ.error} onRetry={() => overviewQ.refetch()}>
        <div className="flex-1 flex min-h-0">
          <ScrollArea className="flex-1 min-w-0">
            <div className="divide-y" data-testid="list-connectors">
              {inFacet.map((c) => {
                const tone = healthTone(c.state, c.ageDays, c.canProbe);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-6 py-3 grid grid-cols-[2fr_1fr_1.4fr] gap-4 items-center hover:bg-muted/40 ${selected?.id === c.id ? "bg-muted/60" : ""}`}
                    data-testid={`row-connector-${c.id}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{c.name}</span>
                        {c.mock && <Badge variant="outline" className="text-[10px]" data-testid={`badge-mock-${c.id}`}><FlaskConical className="w-2.5 h-2.5 mr-1" />Mock</Badge>}
                        {c.riskTier && <span className={`font-mono text-[10px] uppercase ${riskTone(c.riskTier)}`}>{c.riskTier}</span>}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground truncate">{c.transport ?? "—"}</div>
                    </div>
                    <div className="text-sm text-muted-foreground tabular-nums">
                      {c.agentsBound === 0 ? "no agent" : `${c.agentsBound} ${c.agentsBound === 1 ? "agent" : "agents"}`}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-sm font-medium ${TONE_TEXT[tone]}`}>{healthBadge(c.state, c.canProbe)}</span>
                      <span className={`font-mono text-[11px] ${isStale(c.ageDays) || c.state === "never_checked" ? TONE_TEXT.warn : "text-muted-foreground"}`}>{checkedAgo(c.ageDays)}</span>
                    </div>
                  </button>
                );
              })}
              {inFacet.length === 0 && <div className="px-6 py-8 text-sm text-muted-foreground">Nothing in this group.</div>}
            </div>
          </ScrollArea>

          {selected && (
            <div className="w-[26rem] shrink-0 border-l flex flex-col min-h-0" data-testid="detail-connector">
              <ScrollArea className="flex-1">
                <div className="p-5 flex flex-col gap-5">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-base font-semibold">{selected.name}</h2>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {selected.transport ?? "—"}{selected.riskTier ? ` · ${selected.riskTier} risk` : ""}{selected.mock ? " · mock endpoint on this host" : ""}
                    </div>
                  </div>

                  {/* The claim, with its age, and the one control that changes it. */}
                  <div className={`rounded-md border p-3 flex flex-col gap-2 ${healthTone(selected.state, selected.ageDays, selected.canProbe) === "good" ? "" : "border-amber-500/40 bg-amber-500/5"}`}>
                    <div className={`text-sm font-medium flex items-start gap-2 ${TONE_TEXT[healthTone(selected.state, selected.ageDays, selected.canProbe)]}`} data-testid="text-health-claim">
                      {healthTone(selected.state, selected.ageDays, selected.canProbe) === "good" ? <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                      <span>{healthWords(selected.state, selected.ageDays, selected.canProbe, { measuredBy: selected.measuredBy, why: selected.checkWhy })}</span>
                    </div>
                    {selected.detail && <p className="text-xs text-muted-foreground">Last check said: {selected.detail}</p>}
                    {selected.checkedAt && <p className="font-mono text-[11px] text-muted-foreground">{formatDateTime(selected.checkedAt)}</p>}
                    <p className="text-xs text-muted-foreground">
                      {selected.state === "never_checked"
                        ? "The checks run on a schedule, and how often depends on what the check costs."
                        : selected.measuredBy
                          ? `That is the age of the answer rather than the state now, and it proves ${checkProves(selected.measuredBy)}.`
                          : "That state names no check that produced it, so it is a record of something, not evidence of anything. The next scheduled check replaces it."}
                    </p>
                    {selected.protocolMounted === false && (
                      <p className="text-xs text-red-600 dark:text-red-400" data-testid="text-protocol-gap">
                        No MCP protocol endpoint is mounted for this connector, so no agent can call it over the protocol — whatever its health says. Its REST routes answering does not cover that.
                      </p>
                    )}
                    {canManage && selected.canProbe && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="self-start"
                        disabled={verify.isPending}
                        onClick={() => verify.mutate(selected.id)}
                        data-testid="button-verify-connector"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${verify.isPending ? "animate-spin" : ""}`} />
                        {verify.isPending ? "Checking…" : "Verify now"}
                      </Button>
                    )}
                    {selected.canProbe ? (
                      <p className="text-[11px] text-muted-foreground">
                        Verifying would {checkOffer(selected.checkKind)} — {selected.mock ? "the mock this host serves, not a real system" : "which calls that system for real, with the credentials stored for it"}.
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Nothing can check it: {selected.checkWhy}. Whatever state it shows cannot be refreshed.</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Used by</span>
                    {selected.agentsBound === 0 ? (
                      <p className="text-sm text-muted-foreground">No agent is bound to it, so nothing in the platform calls it.</p>
                    ) : (
                      <p className="text-sm">{selected.agentsBound} {selected.agentsBound === 1 ? "agent" : "agents"} can call it. <Link href="/agents" className="underline">Agents</Link></p>
                    )}
                  </div>

                  {platform && (
                    <div className="flex flex-col gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Credentials</span>
                      <div className="rounded-md border p-3 flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-sm"><Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />{platform.connected ? "Held in the vault" : "Not connected"}</div>
                        <p className="text-xs text-muted-foreground">
                          {platform.credentialFields.length > 0
                            ? platform.credentialFields.map((f) => f.label).join(" · ")
                            : "This connector carries no credential fields."}
                        </p>
                        <p className="text-[11px] text-muted-foreground">A value is never shown here or in a conversation. {platform.connection?.lastTestedAt ? `Connection last tested ${formatDateTime(platform.connection.lastTestedAt)}.` : ""}</p>
                        <Button size="sm" variant="outline" className="self-start mt-1" asChild>
                          <Link href="/integrations">{platform.connected ? "Rotate on the platform page" : "Connect it"}<ArrowUpRight className="w-3 h-3 ml-1" /></Link>
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 border-t pt-4">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/astra?ask=${encodeURIComponent(askAstraAboutConnector(selected.name) + "which agents use it and is it reachable?")}`)} data-testid="button-ask-about-connector">
                      <Sparkles className="w-3.5 h-3.5 mr-1" />Ask Astra about it
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/integrations/mcp-servers/${selected.id}`}>Open its full record<ArrowUpRight className="w-3 h-3 ml-1" /></Link>
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </QueryBoundary>
    </div>
  );
}

/** Failing first, then never checked, then stale, then the rest. */
function rank(c: ConnectorRow): number {
  if (c.state === "unreachable") return 0;
  if (c.state === "never_checked") return 1;
  if (c.stale) return 2;
  return 3;
}
