import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useRoute, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  FlaskConical,
  Play,
  ListChecks,
  History,
  Settings,
  Link2,
  Plus,
  Clock,
  DollarSign,
  BarChart3,
  Bot,
  Shield,
  Gauge,
  Pencil,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import type { EvalSuite, EvalTestCase, EvalRun, Agent } from "@shared/schema";

function formatDate(date: string | Date | null | undefined) {
  if (!date) return "\u2014";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateJson(data: unknown, maxLen = 80): string {
  if (!data) return "\u2014";
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return str.length > maxLen ? str.substring(0, maxLen) + "\u2026" : str;
}

function passRateColor(rate: number | null | undefined) {
  if (!rate && rate !== 0) return "text-muted-foreground";
  const pct = rate * 100;
  if (pct > 90) return "text-emerald-600 dark:text-emerald-400";
  if (pct > 75) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function passRateProgressColor(rate: number | null | undefined) {
  if (!rate && rate !== 0) return "";
  const pct = rate * 100;
  if (pct > 90) return "[&>div]:bg-emerald-500";
  if (pct > 75) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-red-500";
}

const typeLabels: Record<string, string> = {
  regression: "Regression",
  smoke: "Smoke",
  benchmark: "Benchmark",
  adversarial: "Adversarial",
};

const tabItems = [
  { key: "test-cases", label: "Test Cases", icon: ListChecks, testId: "tab-test-cases" },
  { key: "run-history", label: "Run History", icon: History, testId: "tab-run-history" },
  { key: "scoring-config", label: "Scoring Config", icon: Settings, testId: "tab-scoring-config" },
  { key: "agent-bindings", label: "Agent Bindings", icon: Link2, testId: "tab-agent-bindings" },
];

export default function EvalDetail() {
  const [, params] = useRoute("/evals/:id");
  const id = params?.id;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("test-cases");
  const [addTcOpen, setAddTcOpen] = useState(false);
  const [tcName, setTcName] = useState("");
  const [tcInputData, setTcInputData] = useState("");
  const [tcExpectedOutput, setTcExpectedOutput] = useState("");
  const [tcTags, setTcTags] = useState("");
  const [tcWeight, setTcWeight] = useState("1");
  const [deleteTcId, setDeleteTcId] = useState<string | null>(null);
  const [editScoring, setEditScoring] = useState(false);
  const [editPassThreshold, setEditPassThreshold] = useState("");
  const [editSchedule, setEditSchedule] = useState("");

  const { data: suite, isLoading } = useQuery<EvalSuite>({
    queryKey: ["/api/evals", id],
    enabled: !!id,
  });
  const { data: testCases } = useQuery<EvalTestCase[]>({
    queryKey: ["/api/evals", id, "test-cases"],
    enabled: !!id,
  });
  const { data: runs } = useQuery<EvalRun[]>({
    queryKey: ["/api/evals", id, "runs"],
    enabled: !!id,
  });
  const { data: agent } = useQuery<Agent>({
    queryKey: ["/api/agents", suite?.agentId],
    enabled: !!suite?.agentId,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/evals/${id}/runs`, {
        suiteId: id,
        agentId: suite?.agentId,
        status: "running",
        totalCases: testCases?.length || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id, "runs"] });
      toast({ title: "Eval run started", description: "A new evaluation run has been triggered." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start run", description: error.message, variant: "destructive" });
    },
  });

  const addTestCaseMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { name: tcName, weight: parseFloat(tcWeight) || 1 };
      if (tcInputData.trim()) body.inputData = JSON.parse(tcInputData);
      if (tcExpectedOutput.trim()) body.expectedOutput = JSON.parse(tcExpectedOutput);
      if (tcTags.trim()) body.tags = tcTags.split(",").map((t) => t.trim()).filter(Boolean);
      await apiRequest("POST", `/api/evals/${id}/test-cases`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id, "test-cases"] });
      toast({ title: "Test case added", description: "The test case has been created successfully." });
      setAddTcOpen(false);
      setTcName("");
      setTcInputData("");
      setTcExpectedOutput("");
      setTcTags("");
      setTcWeight("1");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add test case", description: error.message, variant: "destructive" });
    },
  });

  const deleteTestCaseMutation = useMutation({
    mutationFn: async (tcId: string) => {
      await apiRequest("DELETE", `/api/eval-test-cases/${tcId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id, "test-cases"] });
      toast({ title: "Test case deleted", description: "The test case has been removed." });
      setDeleteTcId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete test case", description: error.message, variant: "destructive" });
    },
  });

  const updateScoringMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/evals/${id}`, {
        thresholdConfig: {
          passThreshold: parseFloat(editPassThreshold) / 100,
          schedule: editSchedule,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id] });
      toast({ title: "Scoring config updated", description: "Threshold settings have been saved." });
      setEditScoring(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update scoring", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!suite) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <FlaskConical className="w-12 h-12 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Eval suite not found</p>
        <Link href="/agents">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Agents
          </Button>
        </Link>
      </div>
    );
  }

  const sortedRuns = [...(runs || [])].sort(
    (a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
  );
  const latestRun = sortedRuns[0];
  const thresholdConfig = suite.thresholdConfig as Record<string, unknown> | null;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-eval-detail">
      <div className="flex items-center gap-3">
        <Link href="/agents">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-suite-name">
              {suite.name}
            </h1>
            {suite.type && (
              <Badge variant="outline" className="text-[11px]" data-testid="badge-type">
                {typeLabels[suite.type] || suite.type}
              </Badge>
            )}
          </div>
        </div>
        <Button
          size="sm"
          data-testid="button-run-now"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
        >
          <Play className="w-3.5 h-3.5 mr-1.5" />
          {runMutation.isPending ? "Starting..." : "Run Now"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Test Cases"
          value={testCases?.length ?? 0}
          icon={ListChecks}
          variant="default"
          testId="stat-total-cases"
        />
        <StatCard
          title="Latest Pass Rate"
          value={latestRun ? `${((latestRun.passRate || 0) * 100).toFixed(1)}%` : "\u2014"}
          icon={BarChart3}
          variant={
            latestRun
              ? (latestRun.passRate || 0) > 0.9
                ? "success"
                : (latestRun.passRate || 0) > 0.75
                  ? "warning"
                  : "danger"
              : "default"
          }
          testId="stat-pass-rate"
        />
        <StatCard
          title="Avg Latency"
          value={latestRun ? `${latestRun.avgLatencyMs || 0}ms` : "\u2014"}
          icon={Clock}
          variant="default"
          testId="stat-avg-latency"
        />
        <StatCard
          title="Avg Cost"
          value={latestRun ? `$${(latestRun.avgCostUsd || 0).toFixed(4)}` : "\u2014"}
          icon={DollarSign}
          variant="default"
          testId="stat-avg-cost"
        />
      </div>

      <div className="flex items-center gap-1 border-b flex-wrap">
        {tabItems.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              data-testid={tab.testId}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "test-cases" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="text-sm font-medium">Test Cases</CardTitle>
            <Button variant="outline" size="sm" data-testid="button-add-test-case" onClick={() => setAddTcOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Test Case
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {!testCases || testCases.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No test cases yet
              </div>
            ) : (
              <Table data-testid="table-test-cases">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Input Data</TableHead>
                    <TableHead>Expected Output</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testCases.map((tc) => (
                    <TableRow key={tc.id} data-testid={`row-test-case-${tc.id}`}>
                      <TableCell className="font-medium text-sm">{tc.name}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {truncateJson(tc.inputData)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {truncateJson(tc.expectedOutput)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {(tc.tags || []).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">{tc.weight ?? 1}</TableCell>
                      <TableCell>
                        <StatusBadge status={tc.status || "active"} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`button-delete-tc-${tc.id}`}
                          onClick={() => setDeleteTcId(tc.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "run-history" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Run History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {sortedRuns.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No runs yet
              </div>
            ) : (
              <Table data-testid="table-run-history">
                <TableHeader>
                  <TableRow>
                    <TableHead>Run Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pass Rate</TableHead>
                    <TableHead className="text-right">Passed</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Avg Latency</TableHead>
                    <TableHead className="text-right">Avg Cost</TableHead>
                    <TableHead>Triggered By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRuns.map((run) => (
                    <TableRow key={run.id} data-testid={`row-run-${run.id}`}>
                      <TableCell className="text-sm">{formatDate(run.startedAt)}</TableCell>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Progress
                            value={(run.passRate || 0) * 100}
                            className={`h-2 flex-1 ${passRateProgressColor(run.passRate)}`}
                          />
                          <span className={`text-xs font-medium ${passRateColor(run.passRate)}`}>
                            {((run.passRate || 0) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm text-emerald-600 dark:text-emerald-400">
                        {run.passedCases ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-sm text-red-600 dark:text-red-400">
                        {run.failedCases ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {run.avgLatencyMs ?? 0}ms
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        ${(run.avgCostUsd || 0).toFixed(4)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {run.triggeredBy || "manual"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "scoring-config" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Pass Threshold</CardTitle>
              </div>
              {!editScoring && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="button-edit-scoring"
                  onClick={() => {
                    const currentThreshold = thresholdConfig && typeof thresholdConfig === "object" && "passThreshold" in thresholdConfig
                      ? Number(thresholdConfig.passThreshold) * 100
                      : (suite.passRate || 0) * 100;
                    const currentSchedule = thresholdConfig && typeof thresholdConfig === "object" && "schedule" in thresholdConfig
                      ? String(thresholdConfig.schedule)
                      : "";
                    setEditPassThreshold(String(currentThreshold));
                    setEditSchedule(currentSchedule);
                    setEditScoring(true);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {editScoring ? (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="pass-threshold" className="text-xs text-muted-foreground">Pass Threshold (%)</Label>
                    <Input
                      id="pass-threshold"
                      type="number"
                      min="0"
                      max="100"
                      value={editPassThreshold}
                      onChange={(e) => setEditPassThreshold(e.target.value)}
                      data-testid="input-pass-threshold"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="schedule" className="text-xs text-muted-foreground">Schedule</Label>
                    <Input
                      id="schedule"
                      value={editSchedule}
                      onChange={(e) => setEditSchedule(e.target.value)}
                      placeholder="e.g. daily, weekly, 0 0 * * *"
                      data-testid="input-schedule"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      size="sm"
                      data-testid="button-save-scoring"
                      onClick={() => updateScoringMutation.mutate()}
                      disabled={updateScoringMutation.isPending}
                    >
                      {updateScoringMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditScoring(false)}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold tracking-tight" data-testid="text-pass-threshold">
                      {thresholdConfig && typeof thresholdConfig === "object" && "passThreshold" in thresholdConfig
                        ? `${Number(thresholdConfig.passThreshold) * 100}%`
                        : `${(suite.passRate || 0) * 100}%`}
                    </span>
                    <span className="text-sm text-muted-foreground">required to pass</span>
                  </div>
                  <Progress
                    value={
                      thresholdConfig && typeof thresholdConfig === "object" && "passThreshold" in thresholdConfig
                        ? Number(thresholdConfig.passThreshold) * 100
                        : (suite.passRate || 0) * 100
                    }
                    className="h-2"
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Evaluation Settings</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
                <span className="text-xs text-muted-foreground">Type</span>
                <Badge variant="outline" className="text-[11px]">
                  {typeLabels[suite.type || "regression"] || suite.type}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
                <span className="text-xs text-muted-foreground">Total Cases</span>
                <span className="text-sm font-medium">{suite.totalCases || testCases?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
                <span className="text-xs text-muted-foreground">Last Run</span>
                <span className="text-sm font-medium">{formatDate(suite.lastRunAt)}</span>
              </div>
              {thresholdConfig && typeof thresholdConfig === "object" && "schedule" in thresholdConfig && (
                <div className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-xs text-muted-foreground">Schedule</span>
                  <span className="text-sm font-mono">{String(thresholdConfig.schedule)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Weights Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {!testCases || testCases.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No test cases to show weights</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {testCases.map((tc) => {
                    const totalWeight = testCases.reduce((sum, t) => sum + (t.weight ?? 1), 0);
                    const pct = totalWeight > 0 ? ((tc.weight ?? 1) / totalWeight) * 100 : 0;
                    return (
                      <div key={tc.id} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-32 truncate">{tc.name}</span>
                        <Progress value={pct} className="h-2 flex-1" />
                        <span className="text-xs font-medium w-12 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "agent-bindings" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Bound Agent</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {!agent ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {suite.agentId ? "Loading agent..." : "No agent bound to this eval suite"}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Agent Name</span>
                  <Link href={`/agents/${agent.id}`}>
                    <span className="text-sm font-medium text-primary" data-testid="text-agent-name">
                      {agent.name}
                    </span>
                  </Link>
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <StatusBadge status={agent.status} />
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Risk Tier</span>
                  <StatusBadge status={agent.riskTier} />
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Model</span>
                  <Badge variant="outline" className="text-[11px]">
                    {agent.modelProvider} / {agent.modelName}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-xs text-muted-foreground">Version</span>
                  <span className="text-sm font-medium">v{agent.currentVersion}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={addTcOpen} onOpenChange={setAddTcOpen}>
        <DialogContent data-testid="dialog-add-test-case">
          <DialogHeader>
            <DialogTitle>Add Test Case</DialogTitle>
            <DialogDescription>Create a new test case for this eval suite.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tc-name" className="text-xs text-muted-foreground">Name</Label>
              <Input
                id="tc-name"
                value={tcName}
                onChange={(e) => setTcName(e.target.value)}
                placeholder="Test case name"
                data-testid="input-tc-name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tc-input-data" className="text-xs text-muted-foreground">Input Data (JSON)</Label>
              <Textarea
                id="tc-input-data"
                value={tcInputData}
                onChange={(e) => setTcInputData(e.target.value)}
                placeholder='{"key": "value"}'
                className="font-mono text-xs"
                rows={3}
                data-testid="input-tc-input-data"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tc-expected-output" className="text-xs text-muted-foreground">Expected Output (JSON)</Label>
              <Textarea
                id="tc-expected-output"
                value={tcExpectedOutput}
                onChange={(e) => setTcExpectedOutput(e.target.value)}
                placeholder='{"result": "expected"}'
                className="font-mono text-xs"
                rows={3}
                data-testid="input-tc-expected-output"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tc-tags" className="text-xs text-muted-foreground">Tags (comma-separated)</Label>
              <Input
                id="tc-tags"
                value={tcTags}
                onChange={(e) => setTcTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
                data-testid="input-tc-tags"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tc-weight" className="text-xs text-muted-foreground">Weight</Label>
              <Input
                id="tc-weight"
                type="number"
                min="0"
                step="0.1"
                value={tcWeight}
                onChange={(e) => setTcWeight(e.target.value)}
                data-testid="input-tc-weight"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddTcOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              data-testid="button-tc-submit"
              onClick={() => addTestCaseMutation.mutate()}
              disabled={!tcName.trim() || addTestCaseMutation.isPending}
            >
              {addTestCaseMutation.isPending ? "Adding..." : "Add Test Case"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTcId} onOpenChange={(open) => { if (!open) setDeleteTcId(null); }}>
        <DialogContent data-testid="dialog-confirm-delete-tc">
          <DialogHeader>
            <DialogTitle>Delete Test Case</DialogTitle>
            <DialogDescription>Are you sure you want to delete this test case? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTcId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { if (deleteTcId) deleteTestCaseMutation.mutate(deleteTcId); }}
              disabled={deleteTestCaseMutation.isPending}
            >
              {deleteTestCaseMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
