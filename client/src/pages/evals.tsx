import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FlaskConical, ArrowRight, Calendar } from "lucide-react";

interface EvalSuite {
  id: number;
  name: string;
  agentId: number;
  description: string | null;
  scoringMethod: string;
  passingThreshold: string;
  status: string;
  createdAt: string;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Evals() {
  const { data: evalSuites, isLoading } = useQuery<EvalSuite[]>({
    queryKey: ["/api/eval-suites"],
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6" data-testid="page-evals-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const suites = evalSuites || [];

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-evals">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <FlaskConical className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
              Eval Suites
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
              Manage and monitor evaluation suites for your agents
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs" data-testid="badge-suite-count">
          {suites.length} suite{suites.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {suites.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <FlaskConical className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-state">
              No eval suites found
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suites.map((suite) => (
            <Link key={suite.id} href={`/evals/${suite.id}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-eval-suite-${suite.id}`}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium" data-testid={`text-suite-name-${suite.id}`}>
                    {suite.name}
                  </CardTitle>
                  <Badge
                    variant={suite.status === "active" ? "default" : "secondary"}
                    data-testid={`badge-suite-status-${suite.id}`}
                  >
                    {suite.status}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {suite.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-suite-description-${suite.id}`}>
                      {suite.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground" data-testid={`text-suite-agent-${suite.id}`}>
                        Agent ID: {suite.agentId}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span data-testid={`text-suite-date-${suite.id}`}>{formatDate(suite.createdAt)}</span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]" data-testid={`badge-suite-scoring-${suite.id}`}>
                      {suite.scoringMethod}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]" data-testid={`badge-suite-threshold-${suite.id}`}>
                      Threshold: {suite.passingThreshold}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
