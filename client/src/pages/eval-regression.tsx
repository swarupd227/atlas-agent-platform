import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Agent, EvalTestRun, EvalGate, EvalDataset, EvalMetricCollection } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  GitBranch,
  Bot,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Settings2,
  Rocket,
  Code2,
  Copy,
  Check,
  Clock,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Filter,
} from "lucide-react";
import { formatDate } from "@/components/shared-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type GateStatus = "pass" | "warn" | "fail" | "unknown";

type MetricSummaryRow = {
  metric: string;
  total: number;
  passed: number;
  passRate: number | null;
  avgScore: number | null;
};

function gateThresholdFromGate(gate: EvalGate | undefined): number {
  if (!gate?.thresholdOverrides) return 0.85;
  const vals = Object.values(gate.thresholdOverrides as Record<string, number>).filter(
    (v) => typeof v === "number"
  );
  return vals.length > 0 ? Math.min(...vals) : 0.85;
}

function computeGateStatus(passRate: number, threshold: number): GateStatus {
  if (passRate >= threshold) return "pass";
  if (passRate >= 0.7) return "warn";
  return "fail";
}

function gateStatusFromTags(run: EvalTestRun): GateStatus {
  const tags = (run.tags as string[] | null) ?? [];
  if (tags.includes("gate:pass")) return "pass";
  if (tags.includes("gate:warn")) return "warn";
  if (tags.includes("gate:fail")) return "fail";
  return "unknown";
}

function effectiveGateStatus(run: EvalTestRun, gate: EvalGate | undefined): GateStatus {
  if (run.status !== "completed" || run.passRate == null) return "unknown";
  const fromTags = gateStatusFromTags(run);
  if (fromTags !== "unknown") return fromTags;
  return computeGateStatus(run.passRate, gateThresholdFromGate(gate));
}

// ── Visual utils ──────────────────────────────────────────────────────────────

const STATUS_DOT: Record<GateStatus, string> = {
  pass: "bg-emerald-500",
  warn: "bg-amber-400",
  fail: "bg-red-500",
  unknown: "bg-muted-foreground/40",
};

const STATUS_RING: Record<GateStatus, string> = {
  pass: "ring-emerald-400",
  warn: "ring-amber-400",
  fail: "ring-red-400",
  unknown: "ring-muted-foreground/30",
};

const STATUS_TEXT: Record<GateStatus, string> = {
  pass: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  fail: "text-red-600 dark:text-red-400",
  unknown: "text-muted-foreground",
};

const STATUS_LABEL: Record<GateStatus, string> = {
  pass: "Gate passed",
  warn: "Threshold warning",
  fail: "Gate failed",
  unknown: "No gate data",
};

function StatusIcon({ status, size = 4 }: { status: GateStatus; size?: number }) {
  const cls = `w-${size} h-${size}`;
  if (status === "pass") return <CheckCircle className={`${cls} text-emerald-500`} />;
  if (status === "warn") return <AlertTriangle className={`${cls} text-amber-500`} />;
  if (status === "fail") return <XCircle className={`${cls} text-red-500`} />;
  return <Clock className={`${cls} text-muted-foreground`} />;
}

// ── CI/CD Snippet Generator ───────────────────────────────────────────────────
// Uses the dedicated /trigger endpoint — no dataset/metric IDs needed in CI.
// The server resolves them from the agent's gate definition.

function buildCiSnippet(provider: string, agentId: string): string {
  const origin = window.location.origin;
  const triggerUrl = `${origin}/api/eval/gates/${agentId}/trigger`;
  const pollBase = `${origin}/api/eval/runs`;

  // Shared poll-and-gate-check shell fragment
  const checkTags = (key: string) =>
    `
          for i in $(seq 1 60); do
            STATUS=$(curl -sf "${pollBase}/$RUN_ID" \\
              -H "Authorization: Bearer ${key}" | jq -r '.status')
            [ "$STATUS" = "completed" ] && break
            [ "$STATUS" = "failed" ] && { echo "Eval run failed"; exit 1; }
            sleep 10
          done
          TAGS=$(curl -sf "${pollBase}/$RUN_ID" \\
            -H "Authorization: Bearer ${key}" | jq -r '.tags[]' 2>/dev/null || echo "")
          echo "Gate tags: $TAGS"
          echo "$TAGS" | grep -q "gate:pass" || { echo "Eval gate did not pass"; exit 1; }`;

  if (provider === "github") {
    return `name: Atlas Eval Gate
on: [push, pull_request]

jobs:
  eval-gate:
    runs-on: ubuntu-latest
    steps:
      - name: Run Atlas Eval Gate
        env:
          ATLAS_API_KEY: \${{ secrets.ATLAS_API_KEY }}
        run: |
          RUN=$(curl -sf -X POST "${triggerUrl}" \\
            -H "Authorization: Bearer $ATLAS_API_KEY" \\
            -H "Content-Type: application/json" \\
            -d '{}')
          RUN_ID=$(echo $RUN | jq -r '.id')
          echo "Eval run started: $RUN_ID"${checkTags("$ATLAS_API_KEY")}`;
  }

  if (provider === "gitlab") {
    return `atlas-eval-gate:
  stage: test
  image: python:3.11-alpine
  before_script:
    - apk add --no-cache curl jq
  script:
    - |
      RUN=$(curl -sf -X POST "${triggerUrl}" \\
        -H "Authorization: Bearer $ATLAS_API_KEY" \\
        -H "Content-Type: application/json" \\
        -d '{}')
      RUN_ID=$(echo $RUN | jq -r '.id')
      echo "Eval run started: $RUN_ID"${checkTags("$ATLAS_API_KEY")}
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"`;
  }

  if (provider === "jenkins") {
    return `pipeline {
  agent any
  environment {
    ATLAS_API_KEY = credentials('atlas-api-key')
    TRIGGER_URL   = '${triggerUrl}'
    POLL_BASE     = '${pollBase}'
  }
  stages {
    stage('Atlas Eval Gate') {
      steps {
        script {
          def run = sh(returnStdout: true, script: """
            curl -sf -X POST $TRIGGER_URL \\
              -H 'Authorization: Bearer '\$ATLAS_API_KEY \\
              -H 'Content-Type: application/json' -d '{}'
          """).trim()
          def runId = sh(returnStdout: true, script: "echo '\${run}' | jq -r '.id'").trim()
          echo "Run ID: \${runId}"
          timeout(time: 10, unit: 'MINUTES') {
            waitUntil {
              def status = sh(returnStdout: true, script: """
                curl -sf $POLL_BASE/\${runId} \\
                  -H 'Authorization: Bearer '\$ATLAS_API_KEY | jq -r '.status'
              """).trim()
              return status == 'completed' || status == 'failed'
            }
          }
          def tags = sh(returnStdout: true, script: """
            curl -sf $POLL_BASE/\${runId} \\
              -H 'Authorization: Bearer '\$ATLAS_API_KEY | jq -r '.tags[]' 2>/dev/null || echo ''
          """).trim()
          if (!tags.contains('gate:pass')) { error "Eval gate did not pass. Tags: \${tags}" }
        }
      }
    }
  }
}`;
  }

  if (provider === "circleci") {
    return `version: 2.1
jobs:
  atlas-eval-gate:
    docker:
      - image: cimg/base:stable
    steps:
      - run:
          name: Run Atlas Eval Gate
          command: |
            RUN=$(curl -sf -X POST "${triggerUrl}" \\
              -H "Authorization: Bearer $ATLAS_API_KEY" \\
              -H "Content-Type: application/json" \\
              -d '{}')
            RUN_ID=$(echo $RUN | jq -r '.id')
            echo "Eval run: $RUN_ID"${checkTags("$ATLAS_API_KEY")}

workflows:
  eval-gate:
    jobs:
      - atlas-eval-gate`;
  }

  if (provider === "azure") {
    return `trigger:
  - main
  - develop

pool:
  vmImage: ubuntu-latest

steps:
  - task: Bash@3
    displayName: 'Atlas Eval Gate'
    inputs:
      targetType: inline
      script: |
        RUN=$(curl -sf -X POST "${triggerUrl}" \\
          -H "Authorization: Bearer $(ATLAS_API_KEY)" \\
          -H "Content-Type: application/json" \\
          -d '{}')
        RUN_ID=$(echo $RUN | jq -r '.id')
        echo "Eval run: $RUN_ID"${checkTags("$(ATLAS_API_KEY)")}
    env:
      ATLAS_API_KEY: $(ATLAS_API_KEY)`;
  }

  return "";
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="h-7 px-2"
      data-testid="button-copy-snippet"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EvalRegression() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"timeline" | "gate">("timeline");
  const [cicdOpen, setCicdOpen] = useState(false);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [promoteEnv, setPromoteEnv] = useState<"staging" | "production">("staging");
  const [overrideComment, setOverrideComment] = useState("");

  // ── Gate definition form ───────────────────────────────────────────────────
  const [gateForm, setGateForm] = useState<{
    datasetId: string;
    metricCollectionId: string;
    passThreshold: string;
    regressionWindowPct: string;
  }>({ datasetId: "", metricCollectionId: "", passThreshold: "85", regressionWindowPct: "5" });

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: agents = [] } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: gates = [], isLoading: gatesLoading } = useQuery<EvalGate[]>({
    queryKey: ["/api/eval/gates"],
  });
  const { data: allRuns = [], isLoading: runsLoading } = useQuery<EvalTestRun[]>({
    queryKey: ["/api/eval/runs"],
    refetchInterval: 30_000,
  });
  const { data: datasets = [] } = useQuery<EvalDataset[]>({ queryKey: ["/api/eval/datasets"] });
  const { data: metricCollections = [] } = useQuery<EvalMetricCollection[]>({
    queryKey: ["/api/eval/metric-collections"],
  });

  // Per-metric aggregates for the selected run (from trace-level scores)
  const { data: metricSummary } = useQuery<{
    runId: string;
    metrics: MetricSummaryRow[];
    traceCount: number;
  }>({
    queryKey: ["/api/eval/runs", selectedRunId, "metric-summary"],
    queryFn: async () => {
      const res = await fetch(`/api/eval/runs/${selectedRunId}/metric-summary`);
      return res.ok ? res.json() : { runId: selectedRunId, metrics: [], traceCount: 0 };
    },
    enabled: !!selectedRunId,
  });

  // ── Derived data ───────────────────────────────────────────────────────────
  const gateMap = useMemo(() => {
    const m = new Map<string, EvalGate>();
    for (const g of gates) m.set(g.agentId, g);
    return m;
  }, [gates]);

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents) m.set(a.id, a);
    return m;
  }, [agents]);

  // All agents (including those without runs) so gates can be configured pre-run
  const allAgents = agents;

  const runsByAgent = useMemo(() => {
    const m = new Map<string, EvalTestRun[]>();
    for (const run of allRuns) {
      const list = m.get(run.agentId) ?? [];
      list.push(run);
      m.set(run.agentId, list);
    }
    for (const [id, list] of m.entries()) {
      m.set(
        id,
        [...list].sort(
          (a, b) =>
            new Date(a.startedAt!).getTime() - new Date(b.startedAt!).getTime()
        )
      );
    }
    return m;
  }, [allRuns]);

  const agentLatestStatus = useMemo((): Map<string, GateStatus> => {
    const m = new Map<string, GateStatus>();
    for (const [agentId, runs] of runsByAgent.entries()) {
      const completed = runs.filter((r) => r.status === "completed");
      if (completed.length === 0) { m.set(agentId, "unknown"); continue; }
      const latest = completed[completed.length - 1];
      m.set(agentId, effectiveGateStatus(latest, gateMap.get(agentId)));
    }
    return m;
  }, [runsByAgent, gateMap]);

  const selectedAgentRuns = useMemo(
    () => (selectedAgentId ? (runsByAgent.get(selectedAgentId) ?? []) : []),
    [runsByAgent, selectedAgentId]
  );

  const selectedRun = useMemo(
    () => (selectedRunId ? allRuns.find((r) => r.id === selectedRunId) ?? null : null),
    [allRuns, selectedRunId]
  );

  const selectedGate = useMemo(
    () => (selectedAgentId ? gateMap.get(selectedAgentId) : undefined),
    [gateMap, selectedAgentId]
  );

  const gateThreshold = useMemo(() => gateThresholdFromGate(selectedGate), [selectedGate]);

  const currentGateStatus = useMemo((): GateStatus => {
    if (!selectedAgentId) return "unknown";
    return agentLatestStatus.get(selectedAgentId) ?? "unknown";
  }, [selectedAgentId, agentLatestStatus]);

  const lastPassingRun = useMemo(() => {
    const runs = selectedAgentRuns.filter(
      (r) => r.status === "completed" && effectiveGateStatus(r, selectedGate) === "pass"
    );
    return runs.length > 0 ? runs[runs.length - 1] : null;
  }, [selectedAgentRuns, selectedGate]);

  // Sort agents: agents with gate-fail first, then warn, then pass, then unknown
  const sortedAgents = useMemo(() => {
    const order: Record<GateStatus, number> = { fail: 0, warn: 1, pass: 2, unknown: 3 };
    return [...allAgents].sort((a, b) => {
      const sa = agentLatestStatus.get(a.id) ?? "unknown";
      const sb = agentLatestStatus.get(b.id) ?? "unknown";
      return (order[sa] ?? 3) - (order[sb] ?? 3);
    });
  }, [allAgents, agentLatestStatus]);

  // Auto-select first agent
  useEffect(() => {
    if (!selectedAgentId && sortedAgents.length > 0) {
      setSelectedAgentId(sortedAgents[0].id);
    }
  }, [sortedAgents, selectedAgentId]);

  // Populate gate form when agent changes
  useEffect(() => {
    if (!selectedGate) return;
    const overrides = selectedGate.thresholdOverrides as Record<string, number> | null;
    const vals = overrides ? Object.values(overrides).filter((v) => typeof v === "number") : [];
    const threshold = vals.length > 0 ? Math.min(...vals) : 0.85;
    setGateForm({
      datasetId: selectedGate.datasetId ?? "",
      metricCollectionId: selectedGate.metricCollectionId ?? "",
      passThreshold: String(Math.round(threshold * 100)),
      regressionWindowPct: String(selectedGate.regressionWindowPct ?? 5),
    });
  }, [selectedGate]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveGateMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const pct = parseFloat(gateForm.passThreshold) / 100;
      const body: Record<string, unknown> = {
        regressionWindowPct: parseFloat(gateForm.regressionWindowPct) || 5,
        thresholdOverrides: { passRate: pct },
        isActive: true,
      };
      if (gateForm.datasetId) body.datasetId = gateForm.datasetId;
      if (gateForm.metricCollectionId) body.metricCollectionId = gateForm.metricCollectionId;
      const res = await apiRequest("PUT", `/api/eval/gates/${agentId}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/eval/gates"] });
      toast({ title: "Gate definition saved" });
    },
    onError: (err: any) =>
      toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  // Promote — server computes gate status server-side; we don't send gateStatus from client
  const promoteMutation = useMutation({
    mutationFn: async ({ env, comment }: { env: "staging" | "production"; comment?: string }) => {
      const res = await apiRequest("POST", `/api/eval/gates/${selectedAgentId}/promote`, {
        environment: env,
        overrideComment: comment,
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? "Promotion failed");
      }
      return res.json();
    },
    onSuccess: (_, { env }) => {
      setPromoteDialogOpen(false);
      setOverrideComment("");
      toast({ title: `Promoted to ${env}`, description: "Audit event recorded." });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-events"] });
    },
    onError: (err: any) =>
      toast({ title: "Promotion failed", description: err.message, variant: "destructive" }),
  });

  // ── Regression detail helpers ──────────────────────────────────────────────
  const selectedRunStatus = selectedRun
    ? effectiveGateStatus(selectedRun, selectedGate)
    : "unknown";

  const prevRun = useMemo(() => {
    if (!selectedRunId) return null;
    const idx = selectedAgentRuns.findIndex((r) => r.id === selectedRunId);
    return idx > 0 ? selectedAgentRuns[idx - 1] : null;
  }, [selectedRunId, selectedAgentRuns]);

  const passRateDelta = useMemo(() => {
    if (selectedRun?.passRate == null || prevRun?.passRate == null) return null;
    return selectedRun.passRate - prevRun.passRate;
  }, [selectedRun, prevRun]);

  // Per-metric rows with gate threshold overlaid
  const gateThresholdOverrides = (selectedGate?.thresholdOverrides as Record<string, number> | null) ?? {};

  const metricTableRows = useMemo(() => {
    const rows = metricSummary?.metrics ?? [];
    if (rows.length === 0) {
      // Fallback: single pass-rate row
      return [
        {
          metric: "passRate",
          label: "Pass Rate",
          currentRate: selectedRun?.passRate ?? null,
          baselineRate: prevRun?.passRate ?? null,
          threshold: gateThreshold,
          fromTraces: false,
        },
      ];
    }
    return rows.map((r) => ({
      metric: r.metric,
      label: r.metric.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      currentRate: r.passRate,
      baselineRate: null, // trace-level baseline requires a separate baseline run query — shown as "—"
      threshold: gateThresholdOverrides[r.metric] ?? gateThresholdOverrides["passRate"] ?? 0.5,
      fromTraces: true,
      avgScore: r.avgScore,
    }));
  }, [metricSummary, selectedRun, prevRun, gateThreshold, gateThresholdOverrides]);

  const isProductionGateRed = currentGateStatus === "fail";

  const handlePromote = (env: "staging" | "production") => {
    setPromoteEnv(env);
    setOverrideComment("");
    setPromoteDialogOpen(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* ── Left Agent Rail — all agents, sorted by gate severity ── */}
      <div className="w-64 shrink-0 border-r flex flex-col bg-muted/20 overflow-y-auto">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />
            Regression Hub
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Gate status · {sortedAgents.length} agents</p>
        </div>

        {runsLoading || gatesLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : sortedAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 p-4 text-center gap-2">
            <Bot className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No agents found.</p>
          </div>
        ) : (
          <div className="flex-1">
            {sortedAgents.map((agent) => {
              const status = agentLatestStatus.get(agent.id) ?? "unknown";
              const runs = runsByAgent.get(agent.id) ?? [];
              const completedRuns = runs.filter((r) => r.status === "completed");
              const hasGate = gateMap.has(agent.id);
              const isSelected = selectedAgentId === agent.id;
              return (
                <button
                  key={agent.id}
                  className={`w-full text-left px-4 py-3 border-b transition-colors flex items-start gap-3 ${
                    isSelected
                      ? "bg-primary/5 border-l-2 border-l-primary"
                      : "hover:bg-muted/30"
                  }`}
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    setSelectedRunId(null);
                  }}
                  data-testid={`rail-agent-${agent.id}`}
                >
                  <div className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{agent.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {completedRuns.length > 0
                        ? `${completedRuns.length} run${completedRuns.length !== 1 ? "s" : ""} · ${STATUS_LABEL[status]}`
                        : hasGate
                        ? "Gate configured · no runs yet"
                        : "No runs · gate not set"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right Content ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selectedAgentId ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
            <GitBranch className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Select an agent to view its regression timeline
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-5 max-w-5xl">
            {/* Agent header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusIcon status={currentGateStatus} size={5} />
                <div>
                  <h2 className="text-base font-semibold">
                    {agentMap.get(selectedAgentId)?.name ?? selectedAgentId.slice(0, 8)}
                  </h2>
                  <p className={`text-xs ${STATUS_TEXT[currentGateStatus]}`}>
                    {STATUS_LABEL[currentGateStatus]}
                    {selectedAgentRuns.filter((r) => r.status === "completed").length > 0 &&
                      ` · ${selectedAgentRuns.filter((r) => r.status === "completed").length} completed runs`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCicdOpen(true)}
                  data-testid="button-cicd-setup"
                >
                  <Code2 className="w-3.5 h-3.5 mr-1.5" />
                  Set up CI/CD
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setActivePanel(activePanel === "gate" ? "timeline" : "gate")
                  }
                  data-testid="button-gate-definition"
                >
                  <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                  Gate Definition
                </Button>
              </div>
            </div>

            <Tabs
              value={activePanel}
              onValueChange={(v) => setActivePanel(v as "timeline" | "gate")}
            >
              <TabsList className="h-8">
                <TabsTrigger value="timeline" className="text-xs" data-testid="tab-timeline">
                  Timeline
                </TabsTrigger>
                <TabsTrigger value="gate" className="text-xs" data-testid="tab-gate-definition">
                  Gate Definition
                </TabsTrigger>
              </TabsList>

              {/* ── Timeline Tab ── */}
              <TabsContent value="timeline" className="mt-4 space-y-5">
                {/* Gate-status timeline */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      Gate-Status Timeline
                      <Badge variant="outline" className="text-[10px]">
                        {selectedAgentRuns.length} runs
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedAgentRuns.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-2">
                        <GitBranch className="w-8 h-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground text-center">
                          No eval runs yet for this agent.
                          <br />
                          Configure the gate definition and trigger a run.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto pb-2">
                        <div className="flex items-end gap-3 min-w-max px-2 py-4">
                          {selectedAgentRuns.map((run, idx) => {
                            const status = effectiveGateStatus(run, selectedGate);
                            const isSelected = selectedRunId === run.id;
                            const pct =
                              run.passRate != null ? Math.round(run.passRate * 100) : null;
                            return (
                              <div
                                key={run.id}
                                className="flex flex-col items-center gap-1.5"
                                data-testid={`timeline-dot-${run.id}`}
                              >
                                <span className="text-[9px] text-muted-foreground/60 rotate-[-45deg] origin-bottom-left w-10 truncate">
                                  {run.startedAt
                                    ? new Date(run.startedAt).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                      })
                                    : `Run ${idx + 1}`}
                                </span>
                                <button
                                  className={`w-4 h-4 rounded-full transition-all ${STATUS_DOT[status]} ${
                                    isSelected
                                      ? `ring-2 ring-offset-1 ${STATUS_RING[status]}`
                                      : "opacity-80 hover:opacity-100 hover:scale-110"
                                  } ${run.status === "running" ? "animate-pulse" : ""}`}
                                  onClick={() =>
                                    setSelectedRunId(isSelected ? null : run.id)
                                  }
                                  title={`${STATUS_LABEL[status]}${pct != null ? ` — ${pct}% pass rate` : ""}`}
                                />
                                {pct != null && (
                                  <span className={`text-[9px] font-medium ${STATUS_TEXT[status]}`}>
                                    {pct}%
                                  </span>
                                )}
                                {run.status === "running" && (
                                  <span className="text-[9px] text-blue-500">running</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-4 px-2 pt-1 border-t">
                          {(["pass", "warn", "fail", "unknown"] as GateStatus[]).map((s) => (
                            <div key={s} className="flex items-center gap-1.5">
                              <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[s]}`} />
                              <span className="text-[10px] text-muted-foreground">
                                {STATUS_LABEL[s]}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ── Regression Detail Card ── */}
                {selectedRun && (
                  <Card
                    className={`border-2 ${
                      selectedRunStatus === "fail"
                        ? "border-red-500/30"
                        : selectedRunStatus === "warn"
                        ? "border-amber-500/30"
                        : "border-emerald-500/30"
                    }`}
                    data-testid="card-regression-detail"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <StatusIcon status={selectedRunStatus} size={4} />
                          Run Detail
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {selectedRun.id.slice(0, 8)}
                          </Badge>
                          {metricSummary && metricSummary.traceCount > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {metricSummary.traceCount} traces
                            </Badge>
                          )}
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setSelectedRunId(null)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Per-metric table derived from actual trace scores */}
                      <div className="rounded-md border overflow-hidden">
                        <div className="grid grid-cols-4 bg-muted/50 px-3 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                          <span>Metric</span>
                          <span className="text-center">Current</span>
                          <span className="text-center">Baseline</span>
                          <span className="text-center">Threshold</span>
                        </div>
                        <div className="divide-y">
                          {metricTableRows.map((row) => {
                            const rowStatus: GateStatus =
                              row.currentRate != null
                                ? computeGateStatus(row.currentRate, row.threshold)
                                : "unknown";
                            return (
                              <div
                                key={row.metric}
                                className="grid grid-cols-4 px-3 py-2.5 items-center"
                                data-testid={`metric-row-${row.metric}`}
                              >
                                <span className="text-xs font-medium flex items-center gap-1.5">
                                  {row.label}
                                  {(row as any).fromTraces && (
                                    <span className="text-[9px] text-muted-foreground/60">(traces)</span>
                                  )}
                                </span>
                                <span
                                  className={`text-xs text-center font-semibold ${STATUS_TEXT[rowStatus]}`}
                                >
                                  {row.currentRate != null
                                    ? `${Math.round(row.currentRate * 100)}%`
                                    : "—"}
                                </span>
                                <span className="text-xs text-center text-muted-foreground">
                                  {row.baselineRate != null
                                    ? `${Math.round(row.baselineRate * 100)}%`
                                    : "—"}
                                </span>
                                <span className="text-xs text-center text-muted-foreground">
                                  {Math.round(row.threshold * 100)}%
                                </span>
                              </div>
                            );
                          })}

                          {/* Δ vs previous run (pass rate) */}
                          {passRateDelta != null && (
                            <div
                              className="grid grid-cols-4 px-3 py-2.5 items-center bg-muted/20"
                              data-testid="metric-row-delta"
                            >
                              <span className="text-xs font-medium">Δ Pass Rate</span>
                              <span
                                className={`text-xs text-center font-semibold col-span-3 ${
                                  passRateDelta >= 0 ? "text-emerald-600" : "text-red-600"
                                }`}
                              >
                                {passRateDelta >= 0 ? "+" : ""}
                                {Math.round(passRateDelta * 100)}pp vs previous
                                {passRateDelta <
                                  -((selectedGate?.regressionWindowPct ?? 5) / 100) && (
                                  <span className="ml-2 text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 px-1.5 py-0.5 rounded">
                                    regression window exceeded
                                  </span>
                                )}
                              </span>
                            </div>
                          )}

                          {/* Failed goldens */}
                          <div className="grid grid-cols-4 px-3 py-2.5 items-center">
                            <span className="text-xs font-medium">Failed Goldens</span>
                            <span className="text-xs text-center font-semibold text-red-600">
                              {selectedRun.failedCount ?? "—"}
                            </span>
                            <span className="text-xs text-center text-muted-foreground">
                              {prevRun?.failedCount ?? "—"}
                            </span>
                            <span className="text-xs text-center text-muted-foreground">
                              0 target
                            </span>
                          </div>

                          {/* Cost */}
                          {selectedRun.costUsd != null && (
                            <div className="grid grid-cols-4 px-3 py-2.5 items-center">
                              <span className="text-xs font-medium">Cost</span>
                              <span className="text-xs text-center font-semibold">
                                ${selectedRun.costUsd.toFixed(4)}
                              </span>
                              <span className="text-xs text-center text-muted-foreground">
                                {prevRun?.costUsd != null
                                  ? `$${prevRun.costUsd.toFixed(4)}`
                                  : "—"}
                              </span>
                              <span className="text-xs text-center text-muted-foreground">—</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Failing goldens deep-link — one-click filter in Trace Inspector */}
                      {selectedRunStatus !== "pass" && selectedRun.failedCount != null && selectedRun.failedCount > 0 && (
                        <div className="flex items-center justify-between rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
                          <div>
                            <p className="text-xs font-medium text-red-700 dark:text-red-400">
                              {selectedRun.failedCount} failing golden{selectedRun.failedCount !== 1 ? "s" : ""}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Open the run with failing-golden filter applied
                            </p>
                          </div>
                          <Link href={`/evals/runs/${selectedRun.id}?passFail=fail`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 border-red-500/30 hover:bg-red-500/10 shrink-0"
                              data-testid="button-view-failing-traces"
                            >
                              <Filter className="w-3.5 h-3.5 mr-1.5" />
                              View Failing Goldens
                              <ExternalLink className="w-3 h-3 ml-1.5" />
                            </Button>
                          </Link>
                        </div>
                      )}

                      {/* Timestamps */}
                      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                        <span>
                          Started:{" "}
                          {selectedRun.startedAt
                            ? formatDate(selectedRun.startedAt as string)
                            : "—"}
                        </span>
                        {selectedRun.completedAt && (
                          <span>
                            Completed: {formatDate(selectedRun.completedAt as string)}
                          </span>
                        )}
                        {selectedRun.triggeredBy && (
                          <span>Triggered by: {selectedRun.triggeredBy}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ── Release Readiness Panel ── */}
                <Card data-testid="card-release-readiness">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Rocket className="w-4 h-4" />
                      Release Readiness
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Gate status widget */}
                    <div
                      className={`flex items-center gap-3 rounded-lg p-3 border ${
                        currentGateStatus === "pass"
                          ? "bg-emerald-500/5 border-emerald-500/20"
                          : currentGateStatus === "warn"
                          ? "bg-amber-500/5 border-amber-500/20"
                          : currentGateStatus === "fail"
                          ? "bg-red-500/5 border-red-500/20"
                          : "bg-muted/30 border-border"
                      }`}
                      data-testid="gate-status-widget"
                    >
                      <StatusIcon status={currentGateStatus} size={6} />
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${STATUS_TEXT[currentGateStatus]}`}>
                          {currentGateStatus === "pass"
                            ? "Gate Green — Ready to promote"
                            : currentGateStatus === "warn"
                            ? "Gate Amber — Review recommended"
                            : currentGateStatus === "fail"
                            ? "Gate Red — Production promotion locked"
                            : "No gate data yet"}
                        </p>
                        {lastPassingRun && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Last passing run:{" "}
                            {formatDate(lastPassingRun.startedAt as string)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Promote buttons */}
                    <div className="flex items-start gap-3 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePromote("staging")}
                        disabled={promoteMutation.isPending}
                        data-testid="button-promote-staging"
                      >
                        <ShieldCheck className="w-4 h-4 mr-1.5" />
                        Promote to Staging
                      </Button>

                      {isProductionGateRed ? (
                        <div className="flex flex-col gap-1.5">
                          <Button
                            size="sm"
                            disabled
                            className="opacity-40 cursor-not-allowed"
                            data-testid="button-promote-production-locked"
                          >
                            <Lock className="w-4 h-4 mr-1.5" />
                            Promote to Production
                          </Button>
                          <button
                            className="text-[11px] text-red-600 hover:underline flex items-center gap-1 ml-0.5"
                            onClick={() => handlePromote("production")}
                            disabled={promoteMutation.isPending}
                            data-testid="button-override-production"
                          >
                            <ShieldAlert className="w-3 h-3" />
                            Override with justification (audit-logged)
                          </button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handlePromote("production")}
                          disabled={promoteMutation.isPending}
                          data-testid="button-promote-production"
                        >
                          <Rocket className="w-4 h-4 mr-1.5" />
                          Promote to Production
                        </Button>
                      )}
                    </div>

                    {isProductionGateRed && (
                      <p className="text-[11px] text-red-600 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        Gate is red. Production is locked until the gate passes or an
                        override justification is provided.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Gate Definition Tab ── */}
              <TabsContent value="gate" className="mt-4">
                <Card data-testid="card-gate-definition">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Settings2 className="w-4 h-4" />
                      Gate Definition
                      {selectedGate && (
                        <Badge variant="outline" className="text-[10px]">
                          configured
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <p className="text-xs text-muted-foreground">
                      Define which dataset, metrics, and thresholds constitute a passing
                      release. Gate settings are also used by the CI/CD trigger endpoint
                      (no extra config needed in your pipeline).
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Dataset</Label>
                        <Select
                          value={gateForm.datasetId}
                          onValueChange={(v) =>
                            setGateForm((p) => ({ ...p, datasetId: v }))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid="select-gate-dataset">
                            <SelectValue placeholder="Select dataset…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Any dataset</SelectItem>
                            {datasets.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Metric Collection</Label>
                        <Select
                          value={gateForm.metricCollectionId}
                          onValueChange={(v) =>
                            setGateForm((p) => ({ ...p, metricCollectionId: v }))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid="select-gate-metrics">
                            <SelectValue placeholder="Select collection…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Any collection</SelectItem>
                            {(metricCollections as any[]).map((mc: any) => (
                              <SelectItem key={mc.id} value={mc.id}>
                                {mc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Pass Rate Threshold (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={gateForm.passThreshold}
                          onChange={(e) =>
                            setGateForm((p) => ({ ...p, passThreshold: e.target.value }))
                          }
                          className="h-8 text-xs"
                          data-testid="input-gate-threshold"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Run must achieve ≥ this pass rate to be gate-green.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Regression Window (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={50}
                          value={gateForm.regressionWindowPct}
                          onChange={(e) =>
                            setGateForm((p) => ({
                              ...p,
                              regressionWindowPct: e.target.value,
                            }))
                          }
                          className="h-8 text-xs"
                          data-testid="input-gate-regression-window"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Force gate:fail if pass rate drops more than this % vs the
                          previous run — even if still above the absolute threshold.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <Button
                        size="sm"
                        onClick={() =>
                          selectedAgentId && saveGateMutation.mutate(selectedAgentId)
                        }
                        disabled={saveGateMutation.isPending || !selectedAgentId}
                        data-testid="button-save-gate"
                      >
                        {saveGateMutation.isPending ? (
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Save Gate Definition
                      </Button>
                      {selectedGate && (
                        <p className="text-[10px] text-muted-foreground">
                          Last updated: {formatDate(selectedGate.updatedAt as string)}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* ── CI/CD Snippets Drawer ── */}
      <Sheet open={cicdOpen} onOpenChange={setCicdOpen}>
        <SheetContent side="right" className="w-[580px] max-w-[90vw] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Code2 className="w-4 h-4" />
              CI/CD Integration
            </SheetTitle>
            <SheetDescription>
              These snippets call the gate trigger endpoint — they only need your agent
              ID. Dataset and metrics come from the gate definition automatically. The
              script exits <code>0</code> when the gate passes,{" "}
              <code>1</code> when it fails.
            </SheetDescription>
          </SheetHeader>

          <Tabs defaultValue="github">
            <TabsList className="grid grid-cols-5 h-8">
              <TabsTrigger value="github" className="text-[10px]" data-testid="tab-cicd-github">
                GitHub
              </TabsTrigger>
              <TabsTrigger value="gitlab" className="text-[10px]" data-testid="tab-cicd-gitlab">
                GitLab
              </TabsTrigger>
              <TabsTrigger value="jenkins" className="text-[10px]" data-testid="tab-cicd-jenkins">
                Jenkins
              </TabsTrigger>
              <TabsTrigger value="circleci" className="text-[10px]" data-testid="tab-cicd-circleci">
                CircleCI
              </TabsTrigger>
              <TabsTrigger value="azure" className="text-[10px]" data-testid="tab-cicd-azure">
                Azure
              </TabsTrigger>
            </TabsList>

            {(["github", "gitlab", "jenkins", "circleci", "azure"] as const).map((provider) => {
              const snippet = buildCiSnippet(provider, selectedAgentId ?? "AGENT_ID");
              const labels: Record<string, string> = {
                github: "GitHub Actions",
                gitlab: "GitLab CI",
                jenkins: "Jenkins Pipeline",
                circleci: "CircleCI",
                azure: "Azure Pipelines",
              };
              return (
                <TabsContent
                  key={provider}
                  value={provider}
                  className="mt-3 space-y-3"
                  data-testid={`panel-cicd-${provider}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">{labels[provider]}</p>
                    <CopyButton text={snippet} />
                  </div>
                  <pre className="bg-muted rounded-md p-3 text-[10px] font-mono overflow-x-auto whitespace-pre leading-relaxed border">
                    {snippet}
                  </pre>
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
                    Add <code className="font-mono">ATLAS_API_KEY</code> as a CI secret.
                    Set a dataset in the Gate Definition tab before running this pipeline.
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* ── Promote Dialog ── */}
      <Dialog
        open={promoteDialogOpen}
        onOpenChange={(open) => {
          setPromoteDialogOpen(open);
          if (!open) setOverrideComment("");
        }}
      >
        <DialogContent data-testid="dialog-promote">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isProductionGateRed && promoteEnv === "production" ? (
                <ShieldAlert className="w-4 h-4 text-red-500" />
              ) : (
                <Rocket className="w-4 h-4" />
              )}
              Promote to {promoteEnv === "staging" ? "Staging" : "Production"}
            </DialogTitle>
            <DialogDescription>
              {promoteEnv === "production" && isProductionGateRed
                ? "The gate is currently failing. An override justification is required. This action will be audit-logged."
                : `Confirm promotion of ${agentMap.get(selectedAgentId ?? "")?.name ?? "this agent"} to ${promoteEnv}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div
              className={`flex items-center gap-3 rounded-lg p-3 border text-sm ${
                currentGateStatus === "pass"
                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700"
                  : currentGateStatus === "warn"
                  ? "bg-amber-500/5 border-amber-500/20 text-amber-700"
                  : "bg-red-500/5 border-red-500/20 text-red-700"
              }`}
            >
              <StatusIcon status={currentGateStatus} size={4} />
              <span className="font-medium">{STATUS_LABEL[currentGateStatus]}</span>
            </div>

            {promoteEnv === "production" && isProductionGateRed && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <ShieldAlert className="w-3 h-3" />
                  Override justification (required)
                </Label>
                <Textarea
                  placeholder="Explain why this override is justified — e.g. known test environment issue, hotfix path…"
                  value={overrideComment}
                  onChange={(e) => setOverrideComment(e.target.value)}
                  className="text-xs min-h-[80px]"
                  data-testid="textarea-override-comment"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPromoteDialogOpen(false)}
                data-testid="button-cancel-promote"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  promoteMutation.mutate({
                    env: promoteEnv,
                    comment: overrideComment.trim() || undefined,
                  })
                }
                disabled={
                  promoteMutation.isPending ||
                  (promoteEnv === "production" &&
                    isProductionGateRed &&
                    !overrideComment.trim())
                }
                className={
                  promoteEnv === "production" && isProductionGateRed
                    ? "bg-red-600 hover:bg-red-700"
                    : ""
                }
                data-testid="button-confirm-promote"
              >
                {promoteMutation.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : promoteEnv === "production" && isProductionGateRed ? (
                  <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
                ) : (
                  <Rocket className="w-3.5 h-3.5 mr-1.5" />
                )}
                {promoteMutation.isPending
                  ? "Promoting…"
                  : promoteEnv === "production" && isProductionGateRed
                  ? "Override & Promote"
                  : `Promote to ${promoteEnv}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
