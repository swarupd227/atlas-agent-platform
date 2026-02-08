import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, Bot, Target, Shield, FileText, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: outcomes } = useQuery<OutcomeContract[]>({ queryKey: ["/api/outcomes"] });
  const { data: policies } = useQuery<Policy[]>({ queryKey: ["/api/policies"] });
  const { data: traces } = useQuery<RunTrace[]>({ queryKey: ["/api/traces"] });

  const lq = query.toLowerCase().trim();

  const filteredAgents = lq ? (agents || []).filter((a) => a.name?.toLowerCase().includes(lq)).slice(0, 3) : [];
  const filteredOutcomes = lq ? (outcomes || []).filter((o) => o.name?.toLowerCase().includes(lq)).slice(0, 3) : [];
  const filteredPolicies = lq ? (policies || []).filter((p) => p.name?.toLowerCase().includes(lq)).slice(0, 3) : [];
  const filteredTraces = lq ? (traces || []).filter((t) => (t.triggeredBy || "").toLowerCase().includes(lq) || String(t.id).includes(lq)).slice(0, 3) : [];

  const hasResults = filteredAgents.length + filteredOutcomes.length + filteredPolicies.length + filteredTraces.length > 0;
  const showDropdown = focused && lq.length > 0;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const go = (path: string) => {
    navigate(path);
    setQuery("");
    setFocused(false);
  };

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search agents, outcomes, policies..."
          className="w-56 h-8 pl-8 pr-8 text-xs"
          data-testid="input-global-search"
        />
        {query && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            data-testid="button-clear-search"
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] text-muted-foreground border rounded px-1 hidden lg:inline-block" style={{ display: query ? "none" : undefined }}>
          {navigator.platform.includes("Mac") ? "\u2318" : "Ctrl+"}K
        </kbd>
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-popover border rounded-md shadow-lg z-50" data-testid="panel-search-results">
          {!hasResults ? (
            <p className="p-3 text-xs text-muted-foreground text-center">No results for "{query}"</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {filteredAgents.length > 0 && (
                <div className="p-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2">Agents</span>
                  {filteredAgents.map((a) => (
                    <button key={a.id} className="w-full flex items-center gap-2 p-2 rounded-md text-left hover-elevate" onClick={() => go(`/agents/${a.id}`)} data-testid={`search-result-agent-${a.id}`}>
                      <Bot className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-xs flex-1 truncate">{a.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{a.status}</Badge>
                    </button>
                  ))}
                </div>
              )}
              {filteredOutcomes.length > 0 && (
                <div className="p-1 border-t">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2">Outcomes</span>
                  {filteredOutcomes.map((o) => (
                    <button key={o.id} className="w-full flex items-center gap-2 p-2 rounded-md text-left hover-elevate" onClick={() => go(`/outcomes/${o.id}`)} data-testid={`search-result-outcome-${o.id}`}>
                      <Target className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-xs flex-1 truncate">{o.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{o.status}</Badge>
                    </button>
                  ))}
                </div>
              )}
              {filteredPolicies.length > 0 && (
                <div className="p-1 border-t">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2">Policies</span>
                  {filteredPolicies.map((p) => (
                    <button key={p.id} className="w-full flex items-center gap-2 p-2 rounded-md text-left hover-elevate" onClick={() => go(`/governance`)} data-testid={`search-result-policy-${p.id}`}>
                      <Shield className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-xs flex-1 truncate">{p.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{p.type}</Badge>
                    </button>
                  ))}
                </div>
              )}
              {filteredTraces.length > 0 && (
                <div className="p-1 border-t">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2">Runs</span>
                  {filteredTraces.map((t) => (
                    <button key={t.id} className="w-full flex items-center gap-2 p-2 rounded-md text-left hover-elevate" onClick={() => go(`/traces/${t.id}`)} data-testid={`search-result-trace-${t.id}`}>
                      <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-xs flex-1 truncate">Run #{t.id}</span>
                      <Badge variant="secondary" className="text-[10px]">{t.status}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
