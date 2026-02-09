import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, Bot, Target, Shield, FileText } from "lucide-react";
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

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();

  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: outcomes } = useQuery<OutcomeContract[]>({ queryKey: ["/api/outcomes"] });
  const { data: policies } = useQuery<Policy[]>({ queryKey: ["/api/policies"] });
  const { data: traces } = useQuery<RunTrace[]>({ queryKey: ["/api/traces"] });

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

  const agentList = agents || [];
  const outcomeList = outcomes || [];
  const policyList = policies || [];
  const traceList = traces || [];

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

      <CommandDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }} data-testid="dialog-command-palette">
        <CommandInput placeholder="Search agents, outcomes, policies, runs..." value={search} onValueChange={setSearch} data-testid="input-command-search" />
        <CommandList data-testid="panel-search-results">
          {!search.trim() ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Search className="w-6 h-6 mb-2 opacity-30" />
              <p className="text-xs">Start typing to search across the platform</p>
            </div>
          ) : (
            <CommandEmpty>
              <div className="flex flex-col items-center py-4 text-muted-foreground">
                <p className="text-sm">No results found</p>
                <p className="text-xs mt-1">Try a different search term</p>
              </div>
            </CommandEmpty>
          )}

          {search.trim() && (
            <>
              {agentList.length > 0 && (
                <CommandGroup heading="Agents">
                  {agentList.slice(0, 6).map((a) => (
                    <CommandItem key={`agent-${a.id}`} value={`agent ${a.name}`} onSelect={() => go(`/agents/${a.id}`)} data-testid={`search-result-agent-${a.id}`}>
                      <Bot className="text-muted-foreground" />
                      <span className="flex-1 truncate">{a.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{a.status}</Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {outcomeList.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Outcomes">
                    {outcomeList.slice(0, 6).map((o) => (
                      <CommandItem key={`outcome-${o.id}`} value={`outcome ${o.name}`} onSelect={() => go(`/outcomes/${o.id}`)} data-testid={`search-result-outcome-${o.id}`}>
                        <Target className="text-muted-foreground" />
                        <span className="flex-1 truncate">{o.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{o.status}</Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {policyList.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Policies">
                    {policyList.slice(0, 6).map((p) => (
                      <CommandItem key={`policy-${p.id}`} value={`policy ${p.name}`} onSelect={() => go(`/governance`)} data-testid={`search-result-policy-${p.id}`}>
                        <Shield className="text-muted-foreground" />
                        <span className="flex-1 truncate">{p.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{p.type}</Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {traceList.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Runs">
                    {traceList.slice(0, 6).map((t) => (
                      <CommandItem key={`trace-${t.id}`} value={`run ${t.id} ${t.triggeredBy || ""}`} onSelect={() => go(`/traces/${t.id}`)} data-testid={`search-result-trace-${t.id}`}>
                        <FileText className="text-muted-foreground" />
                        <span className="flex-1 truncate">Run #{t.id}</span>
                        <Badge variant="secondary" className="text-[10px]">{t.status}</Badge>
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
