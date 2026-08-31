/**
 * Journey Library (ontology roadmap Phase 3) — a browsable shelf of curated,
 * pre-built industry journeys (real, already-executable multi-agent Teams
 * generated via propose-agents -> create-team-from-proposals, grounded in
 * real ontology concepts). Before this page existed, a curated journey was
 * indistinguishable from any other team in the Agent Registry — findable
 * only by knowing its exact name.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useIndustry } from "@/components/industry-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Compass, Users, BookOpen, Copy, ArrowRight, Loader2 } from "lucide-react";

interface JourneyWorker {
  id: string;
  name: string;
  description: string | null;
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
  createdAt: string | null;
}

export default function Journeys() {
  const { industry } = useIndustry();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [subVerticalFilter, setSubVerticalFilter] = useState("all");
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

  const subVerticals = industry?.subVerticals?.length
    ? industry.subVerticals
    : Array.from(new Set(journeys.map((j) => j.subVertical).filter((s): s is string => !!s)));

  const filtered = journeys.filter((j) => subVerticalFilter === "all" || j.subVertical === subVerticalFilter);

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-journeys">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Journey Library</h1>
          <p className="text-sm text-muted-foreground">
            {industry && industry.id !== "custom"
              ? `Real, ontology-grounded ${industry.label} teams, ready to run or clone`
              : "Real, ontology-grounded multi-agent teams, ready to run or clone"}
          </p>
        </div>
        <Badge variant="outline" className="text-xs" data-testid="badge-journey-count">
          {journeys.length} journey{journeys.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {subVerticals.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={subVerticalFilter} onValueChange={setSubVerticalFilter}>
            <SelectTrigger className="w-56" data-testid="select-subvertical-filter">
              <SelectValue placeholder="All sub-verticals" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sub-verticals</SelectItem>
              {subVerticals.map((sv) => (
                <SelectItem key={sv} value={sv}>{sv}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="animate-pulse flex flex-col gap-3">
                  <div className="h-4 w-2/3 bg-muted rounded" />
                  <div className="h-3 w-full bg-muted rounded" />
                  <div className="h-3 w-4/5 bg-muted rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="p-10 flex flex-col items-center gap-2 text-center">
            <Compass className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium">No curated journeys yet{subVerticalFilter !== "all" ? ` for ${subVerticalFilter}` : industryId ? ` for ${industry?.label}` : ""}</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Generate one via the AI team proposal flow and mark it as a curated journey, or switch industry above.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((journey) => (
            <Card key={journey.teamAgentId} className="flex flex-col" data-testid={`card-journey-${journey.teamAgentId}`}>
              <CardContent className="p-5 flex flex-col gap-3 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-sm leading-tight" data-testid={`text-journey-name-${journey.teamAgentId}`}>
                    {journey.name}
                  </h3>
                  {journey.subVertical && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">{journey.subVertical}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{journey.description}</p>

                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {journey.orchestrator.name} + {journey.workers.length} worker{journey.workers.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {journey.workers.slice(0, 4).map((w) => (
                    <Badge key={w.id} variant="outline" className="text-[9px]" data-testid={`badge-worker-${w.id}`}>
                      {w.name}
                    </Badge>
                  ))}
                  {journey.workers.length > 4 && (
                    <Badge variant="outline" className="text-[9px]">+{journey.workers.length - 4} more</Badge>
                  )}
                </div>

                {journey.ontologyConcepts.length > 0 && (
                  <div className="flex items-start gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-1">
                      {journey.ontologyConcepts.slice(0, 4).map((c) => (
                        <Badge key={c.conceptId} variant="outline" className="text-[9px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30" data-testid={`badge-concept-${c.conceptId}`}>
                          {c.conceptLabel}
                        </Badge>
                      ))}
                      {journey.ontologyConcepts.length > 4 && (
                        <Badge variant="outline" className="text-[9px]">+{journey.ontologyConcepts.length - 4} more</Badge>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-auto pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate(`/agents/${journey.teamAgentId}`)}
                    data-testid={`button-view-journey-${journey.teamAgentId}`}
                  >
                    View Team <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={cloningId === journey.teamAgentId}
                    onClick={() => cloneMutation.mutate(journey.teamAgentId)}
                    data-testid={`button-clone-journey-${journey.teamAgentId}`}
                  >
                    {cloningId === journey.teamAgentId ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Cloning...</>
                    ) : (
                      <><Copy className="w-3.5 h-3.5 mr-1.5" /> Clone & Customize</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
