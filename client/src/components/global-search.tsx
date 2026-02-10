import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Search, Bot, Target, Shield, FileText, CheckCircle, Rocket,
  CreditCard, Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";

interface Agent {
  id: number;
  name: string;
  status: string;
  owner?: string;
}

interface OutcomeContract {
  id: number;
  name: string;
  status: string;
}

interface Policy {
  id: number;
  name: string;
  type: string;
}

interface RunTrace {
  id: number;
  agentId: number;
  status: string;
  triggeredBy: string;
}

interface Approval {
  id: string;
  type: string;
  objectName: string;
  status: string;
  requestedBy: string;
}

interface Deployment {
  id: string;
  agentId: string;
  agentName?: string;
  version: string;
  environment: string;
  status: string;
}

interface Invoice {
  id: string;
  outcomeName: string;
  status: string;
  amount: number;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();

  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: outcomes } = useQuery<OutcomeContract[]>({ queryKey: ["/api/outcomes"] });
  const { data: policies } = useQuery<Policy[]>({ queryKey: ["/api/policies"] });
  const { data: traces } = useQuery<RunTrace[]>({ queryKey: ["/api/traces"] });
  const { data: approvals } = useQuery<Approval[]>({ queryKey: ["/api/approvals"] });
  const { data: deployments } = useQuery<Deployment[]>({ queryKey: ["/api/deployments"] });
  const { data: invoices } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });

  const go = useCallback((path: string) => {
    navigate(path);
    setOpen(false);
    setSearch("");
  }, [navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const q = search.trim().toLowerCase();

  const filteredAgents = (agents || []).filter(a => a.name.toLowerCase().includes(q));
  const filteredOutcomes = (outcomes || []).filter(o => o.name.toLowerCase().includes(q));
  const filteredPolicies = (policies || []).filter(p => p.name.toLowerCase().includes(q));
  const filteredTraces = (traces || []).filter(t =>
    String(t.id).includes(q) || (t.triggeredBy || "").toLowerCase().includes(q)
  );
  const filteredApprovals = (approvals || []).filter(a =>
    (a.objectName || "").toLowerCase().includes(q) || a.type.toLowerCase().includes(q)
  );
  const filteredDeployments = (deployments || []).filter(d =>
    (d.version || "").toLowerCase().includes(q) ||
    (d.agentName || "").toLowerCase().includes(q) ||
    (d.environment || "").toLowerCase().includes(q)
  );
  const filteredInvoices = (invoices || []).filter(i =>
    (i.outcomeName || "").toLowerCase().includes(q)
  );

  const statusColor = (status: string) => {
    const s = status.toLowerCase();
    if (["active", "healthy", "paid", "approved", "success", "completed"].includes(s)) return "default";
    if (["pending", "draft", "staging", "sent"].includes(s)) return "secondary";
    if (["critical", "failed", "rejected", "overdue"].includes(s)) return "destructive";
    return "outline";
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex gap-2 text-muted-foreground"
        data-testid="button-open-search"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="text-xs">Search...</span>
        <kbd className="ml-1 text-[10px] border rounded px-1 py-0.5 bg-muted text-muted-foreground">
          {typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "\u2318K" : "Ctrl K"}
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }} data-testid="dialog-global-search">
        <CommandInput placeholder="Search agents, outcomes, policies, approvals, deployments..." value={search} onValueChange={setSearch} data-testid="input-global-search" />
        <CommandList className="max-h-[400px]" data-testid="panel-search-results">
          {!q ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Search className="w-6 h-6 mb-2 opacity-30" />
              <p className="text-xs">Start typing to search across the platform</p>
              <p className="text-[10px] mt-1 opacity-60">Agents, outcomes, policies, runs, approvals, deployments, invoices</p>
            </div>
          ) : (
            <CommandEmpty>
              <div className="flex flex-col items-center py-4 text-muted-foreground">
                <p className="text-sm">No results found</p>
                <p className="text-xs mt-1">Try a different search term</p>
              </div>
            </CommandEmpty>
          )}

          {q && (
            <>
              {filteredAgents.length > 0 && (
                <CommandGroup heading="Agents">
                  {filteredAgents.slice(0, 5).map((a) => (
                    <CommandItem key={`agent-${a.id}`} value={`agent ${a.name}`} onSelect={() => go(`/agents/${a.id}`)} data-testid={`search-result-agent-${a.id}`}>
                      <Bot className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm truncate block">{a.name}</span>
                        {a.owner && <span className="text-[10px] text-muted-foreground">{a.owner}</span>}
                      </div>
                      <Badge variant={statusColor(a.status)} className="text-[10px] shrink-0">{a.status}</Badge>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-data-[selected=true]:opacity-100" onClick={(e) => { e.stopPropagation(); go(`/agents/${a.id}`); }} data-testid={`action-view-agent-${a.id}`}>
                        <Eye className="w-3 h-3" />
                      </Button>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {filteredOutcomes.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Outcomes">
                    {filteredOutcomes.slice(0, 5).map((o) => (
                      <CommandItem key={`outcome-${o.id}`} value={`outcome ${o.name}`} onSelect={() => go(`/outcomes/${o.id}`)} data-testid={`search-result-outcome-${o.id}`}>
                        <Target className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm truncate block">{o.name}</span>
                        </div>
                        <Badge variant={statusColor(o.status)} className="text-[10px] shrink-0">{o.status}</Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {filteredApprovals.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Approvals">
                    {filteredApprovals.slice(0, 5).map((a) => (
                      <CommandItem key={`approval-${a.id}`} value={`approval ${a.objectName} ${a.type}`} onSelect={() => go(`/approvals/${a.id}`)} data-testid={`search-result-approval-${a.id}`}>
                        <CheckCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm truncate block">{a.objectName || a.type.replace(/_/g, " ")}</span>
                          <span className="text-[10px] text-muted-foreground">{a.type.replace(/_/g, " ")}</span>
                        </div>
                        <Badge variant={statusColor(a.status)} className="text-[10px] shrink-0">{a.status}</Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {filteredDeployments.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Deployments / Versions">
                    {filteredDeployments.slice(0, 5).map((d) => (
                      <CommandItem key={`deploy-${d.id}`} value={`deployment ${d.version} ${d.agentName || ""} ${d.environment}`} onSelect={() => go(`/deployments/${d.id}`)} data-testid={`search-result-deploy-${d.id}`}>
                        <Rocket className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm truncate block">{d.agentName || "Release"} {d.version}</span>
                          <span className="text-[10px] text-muted-foreground">{d.environment}</span>
                        </div>
                        <Badge variant={statusColor(d.status)} className="text-[10px] shrink-0">{d.status}</Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {filteredPolicies.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Policies">
                    {filteredPolicies.slice(0, 5).map((p) => (
                      <CommandItem key={`policy-${p.id}`} value={`policy ${p.name}`} onSelect={() => go(`/governance`)} data-testid={`search-result-policy-${p.id}`}>
                        <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm truncate block">{p.name}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">{p.type}</Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {filteredTraces.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Runs / Traces">
                    {filteredTraces.slice(0, 5).map((t) => (
                      <CommandItem key={`trace-${t.id}`} value={`run ${t.id} ${t.triggeredBy || ""}`} onSelect={() => go(`/traces/${t.id}`)} data-testid={`search-result-trace-${t.id}`}>
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm truncate block">Run #{t.id}</span>
                          <span className="text-[10px] text-muted-foreground">{t.triggeredBy}</span>
                        </div>
                        <Badge variant={statusColor(t.status)} className="text-[10px] shrink-0">{t.status}</Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {filteredInvoices.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Invoices">
                    {filteredInvoices.slice(0, 5).map((i) => (
                      <CommandItem key={`invoice-${i.id}`} value={`invoice ${i.outcomeName}`} onSelect={() => go(`/billing`)} data-testid={`search-result-invoice-${i.id}`}>
                        <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm truncate block">{i.outcomeName}</span>
                          <span className="text-[10px] text-muted-foreground">${i.amount?.toLocaleString()}</span>
                        </div>
                        <Badge variant={statusColor(i.status)} className="text-[10px] shrink-0">{i.status}</Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </>
          )}
        </CommandList>

        <div className="flex items-center gap-3 px-3 py-2 border-t text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><kbd className="border rounded px-1 py-0.5 bg-muted">&#8593;&#8595;</kbd> Navigate</span>
          <span className="flex items-center gap-1"><kbd className="border rounded px-1 py-0.5 bg-muted">&#8629;</kbd> Open</span>
          <span className="flex items-center gap-1"><kbd className="border rounded px-1 py-0.5 bg-muted">Esc</kbd> Close</span>
        </div>
      </CommandDialog>
    </>
  );
}
