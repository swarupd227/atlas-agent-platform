import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { AgentPipeline, PipelineRun, Agent } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Workflow,
  Bot,
  ShieldCheck,
  ArrowDown,
  Play,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  ChevronDown,
  Sparkles,
  ArrowLeft,
  Settings2,
  Pause,
  GitFork,
  GitMerge,
  Layers,
  Network,
  Activity,
  Database,
  Pencil,
  Save,
  ShieldAlert,
  RefreshCcw,
  FileEdit,
  Download,
  RotateCcw,
  ChevronRight,
  GitCompare,
} from "lucide-react";

interface PipelineStage {
  id: string;
  agentId: string | null;
  label: string;
  stageType: "agent" | "approval_gate" | "parallel_group" | "composite";
  order: number;
  parentGroupId?: string;
  children?: string[];
  teamAgentId?: string | null;
  config: {
    inputMapping?: string;
    outputMapping?: string;
    approvalRequired?: boolean;
    approvers?: string[];
    timeout?: number;
    errorStrategy?: "fail_fast" | "best_effort";
    waveCount?: number | null;
  };
}

interface PipelineConnection {
  id: string;
  sourceStageId: string;
  targetStageId: string;
  condition?: string;
  label?: string;
}

interface StageResult {
  stageId: string;
  status: "pending" | "running" | "completed" | "failed" | "awaiting_approval" | "approved" | "rejected";
  output?: string;
  startedAt?: string;
  completedAt?: string;
  approvedBy?: string;
  duration?: number;
  dagRunId?: string | null;
}

function getStatusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  switch (s?.toLowerCase()) {
    case "active": case "running": return "default";
    case "draft": case "pending": return "secondary";
    case "failed": return "destructive";
    case "completed": return "outline";
    default: return "outline";
  }
}

function getStatusColor(s: string) {
  switch (s?.toLowerCase()) {
    case "active": case "running": return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
    case "draft": case "pending": return "bg-gray-500/15 text-gray-700 dark:text-gray-400";
    case "completed": case "approved": return "bg-green-500/15 text-green-700 dark:text-green-400";
    case "failed": case "rejected": return "bg-red-500/15 text-red-700 dark:text-red-400";
    case "awaiting_approval": return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    default: return "";
  }
}

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

interface DAGWaveData {
  runId: string;
  status: string;
  currentWave: number | null;
  totalWaves: number | null;
  waveResults: Array<{
    waveNumber: number;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    nodes: Array<{
      nodeId: string;
      agentId: string;
      status: string;
      durationMs: number;
      promptTokens: number;
      completionTokens: number;
      error?: string;
    }>;
  }>;
  totalPromptTokens: number | null;
  totalCompletionTokens: number | null;
}

function DAGExecutionView({ dagRunId }: { dagRunId: string }) {
  const { data, isLoading } = useQuery<DAGWaveData>({
    queryKey: ["/api/dag-execution-runs", dagRunId, "waves"],
    refetchInterval: (query) => {
      const d = query.state.data as DAGWaveData | undefined;
      if (d?.status === "completed" || d?.status === "failed") return false;
      return 2000;
    },
  });

  if (isLoading) return <Skeleton className="h-16 w-full mt-3" />;
  if (!data) return null;

  const pendingWaves = (data.totalWaves ?? 0) - (data.waveResults?.length ?? 0);
  const allNodes = (data.waveResults || []).flatMap((w) => w.nodes);
  const errorCount = allNodes.filter((n) => n.status === "failed").length;
  const completedCount = allNodes.filter((n) => n.status === "completed").length;
  const totalTokens = (data.totalPromptTokens ?? 0) + (data.totalCompletionTokens ?? 0);

  return (
    <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3" data-testid={`dag-execution-view-${dagRunId}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
          <Network className="w-3.5 h-3.5" />
          DAG Execution
        </span>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${getStatusColor(data.status)}`} data-testid={`badge-dag-status-${dagRunId}`}>
            {data.status}
          </Badge>
          {data.totalWaves && (
            <span className="text-[10px] text-muted-foreground">
              Wave {data.currentWave ?? 0}/{data.totalWaves}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {(data.waveResults || []).map((wave) => (
          <div key={wave.waveNumber} className="rounded-md border bg-background px-3 py-2" data-testid={`dag-wave-${dagRunId}-${wave.waveNumber}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-muted-foreground">Wave {wave.waveNumber}</span>
              {wave.durationMs > 0 && (
                <span className="text-[10px] text-muted-foreground">{wave.durationMs}ms</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {wave.nodes.map((node) => (
                <div
                  key={node.nodeId}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${
                    node.status === "completed"
                      ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400"
                      : node.status === "failed"
                      ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
                      : node.status === "running"
                      ? "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400"
                      : "bg-muted/50 border-muted text-muted-foreground"
                  }`}
                  data-testid={`dag-node-${dagRunId}-${node.nodeId}`}
                >
                  {node.status === "running" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  {node.status === "completed" && <CheckCircle className="w-2.5 h-2.5" />}
                  {node.status === "failed" && <XCircle className="w-2.5 h-2.5" />}
                  <span className="font-mono">{node.nodeId.substring(0, 8)}</span>
                  {node.durationMs > 0 && <span className="opacity-60">{node.durationMs}ms</span>}
                  {node.promptTokens > 0 && (
                    <span className="opacity-60">{node.promptTokens + node.completionTokens}t</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {pendingWaves > 0 && (
          <div className="rounded-md border border-dashed px-3 py-2 text-[10px] text-muted-foreground" data-testid={`dag-pending-${dagRunId}`}>
            {pendingWaves} wave{pendingWaves !== 1 ? "s" : ""} pending
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground pt-1 border-t" data-testid={`dag-stats-${dagRunId}`}>
        <Activity className="w-3 h-3" />
        <span data-testid={`dag-stat-fields-${dagRunId}`}>{completedCount} field{completedCount !== 1 ? "s" : ""} populated</span>
        <span data-testid={`dag-stat-tokens-${dagRunId}`}>{totalTokens} tokens</span>
        {errorCount > 0 && (
          <span className="text-red-600 dark:text-red-400" data-testid={`dag-stat-errors-${dagRunId}`}>
            {errorCount} error{errorCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function triggerTypeStyle(trigger: string): { dot: string; label: string } {
  switch (trigger) {
    case "stage_complete": return { dot: "bg-green-500", label: "Stage" };
    case "interrupt": return { dot: "bg-amber-500", label: "Gate" };
    case "resume": return { dot: "bg-blue-500", label: "Resume" };
    case "manual": return { dot: "bg-gray-400", label: "Manual" };
    default: return { dot: "bg-gray-400", label: trigger.replace(/_/g, " ") };
  }
}

function computeStateDiff(
  prev: Record<string, unknown>,
  curr: Record<string, unknown>,
): { added: string[]; removed: string[]; changed: string[] } {
  const added = Object.keys(curr).filter((k) => !(k in prev));
  const removed = Object.keys(prev).filter((k) => !(k in curr));
  const changed = Object.keys(curr).filter(
    (k) => k in prev && JSON.stringify(prev[k]) !== JSON.stringify(curr[k]),
  );
  return { added, removed, changed };
}

function exportCheckpointJson(stateJson: Record<string, unknown>, num: number) {
  const blob = new Blob([JSON.stringify(stateJson, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `checkpoint-${num}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function CheckpointRow({ cp, stages }: {
  cp: {
    id: string;
    checkpointNumber: number;
    trigger: string;
    triggerStageId: string | null;
    stateJson: Record<string, any>;
    stateHash: string;
    createdAt: string | null;
  };
  stages: Array<{ id: string; label: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border rounded p-2 text-xs" data-testid={`checkpoint-${cp.id}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">#{cp.checkpointNumber}</Badge>
          <span className="font-medium capitalize">{cp.trigger.replace(/_/g, " ")}</span>
          {cp.triggerStageId && (
            <span className="text-muted-foreground">
              — {stages.find((s) => s.id === cp.triggerStageId)?.label || cp.triggerStageId.substring(0, 8)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {cp.createdAt && (
            <span className="text-muted-foreground text-[10px]">{new Date(cp.createdAt).toLocaleTimeString()}</span>
          )}
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
            data-testid={`button-expand-checkpoint-${cp.id}`}
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
      <div className="font-mono text-[10px] text-muted-foreground mt-0.5 truncate">
        sha: {cp.stateHash.substring(0, 16)}…
      </div>
      {expanded && (
        <div className="mt-2 bg-muted/30 rounded p-2">
          <pre className="text-[10px] font-mono whitespace-pre-wrap" data-testid={`text-checkpoint-state-${cp.id}`}>
            {JSON.stringify(cp.stateJson, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function InterruptRow({ intr, stages }: {
  intr: {
    id: string;
    checkpointNumber: number;
    interruptId: string | null;
    interruptPayload: any;
    interruptResponded: boolean;
    interruptResponse: any;
    triggerStageId: string | null;
    createdAt: string | null;
  };
  stages: Array<{ id: string; label: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border rounded p-2 text-xs" data-testid={`interrupt-${intr.id}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3 text-amber-600" />
          <span className="font-medium">
            {(intr.interruptPayload as { gateName?: string } | null)?.gateName || "Approval Gate"}
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] ${intr.interruptResponded ? "text-green-600 border-green-300" : "text-amber-600 border-amber-300"}`}
          >
            {intr.interruptResponded
              ? (intr.interruptResponse as { _gate_decision?: string; decision?: string } | null)?._gate_decision
                || (intr.interruptResponse as { _gate_decision?: string; decision?: string } | null)?.decision
                || "responded"
              : "open"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {intr.createdAt && (
            <span className="text-muted-foreground text-[10px]">{new Date(intr.createdAt).toLocaleTimeString()}</span>
          )}
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
            data-testid={`button-expand-interrupt-${intr.id}`}
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
      {(intr.interruptPayload as { context?: string } | null)?.context && (
        <div className="mt-0.5 text-muted-foreground text-[10px] truncate">
          {(intr.interruptPayload as { context?: string }).context}
        </div>
      )}
      {intr.interruptResponded && (intr.interruptResponse as { _gate_notes?: string } | null)?._gate_notes && (
        <div className="mt-0.5 text-[10px] text-muted-foreground italic truncate" data-testid={`text-gate-notes-${intr.id}`}>
          Notes: {(intr.interruptResponse as { _gate_notes?: string })._gate_notes}
        </div>
      )}
      {expanded && (
        <div className="mt-2 space-y-2">
          {intr.interruptPayload && (
            <div className="bg-muted/30 rounded p-2">
              <div className="text-[10px] font-medium text-muted-foreground mb-1">Payload</div>
              <pre className="text-[10px] font-mono whitespace-pre-wrap" data-testid={`text-interrupt-payload-${intr.id}`}>
                {JSON.stringify(intr.interruptPayload, null, 2)}
              </pre>
            </div>
          )}
          {intr.interruptResponded && intr.interruptResponse && (
            <div className="bg-muted/30 rounded p-2">
              <div className="text-[10px] font-medium text-muted-foreground mb-1">Response</div>
              {(intr.interruptResponse as { _gate_decision?: string } | null)?._gate_decision && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-muted-foreground">Decision:</span>
                  <Badge variant="outline" className="text-[10px] text-green-600 border-green-300" data-testid={`badge-gate-decision-${intr.id}`}>
                    {(intr.interruptResponse as { _gate_decision: string })._gate_decision}
                  </Badge>
                </div>
              )}
              <pre className="text-[10px] font-mono whitespace-pre-wrap" data-testid={`text-interrupt-response-${intr.id}`}>
                {JSON.stringify(intr.interruptResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Pipelines() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState("designer");
  const [createOpen, setCreateOpen] = useState(false);
  const [newPipeline, setNewPipeline] = useState({ name: "", description: "" });

  const [addStageOpen, setAddStageOpen] = useState(false);
  const [newStageLabel, setNewStageLabel] = useState("");
  const [newStageAgentId, setNewStageAgentId] = useState<string | null>(null);
  const [newStageType, setNewStageType] = useState<"agent" | "approval_gate" | "composite">("agent");
  const [newStageTeamAgentId, setNewStageTeamAgentId] = useState<string | null>(null);
  const [newStageErrorStrategy, setNewStageErrorStrategy] = useState<"fail_fast" | "best_effort">("fail_fast");

  const [addParallelGroupOpen, setAddParallelGroupOpen] = useState(false);
  const [parallelGroupLabel, setParallelGroupLabel] = useState("Parallel Group");
  const [parallelGroupAgents, setParallelGroupAgents] = useState<Array<{ label: string; agentId: string | null }>>([
    { label: "Agent 1", agentId: null },
    { label: "Agent 2", agentId: null },
  ]);
  const [addChildStageGroupId, setAddChildStageGroupId] = useState<string | null>(null);
  const [childStageLabel, setChildStageLabel] = useState("Agent Stage");
  const [childStageAgentId, setChildStageAgentId] = useState<string | null>(null);

  const [editStageId, setEditStageId] = useState<string | null>(null);
  const [editStageLabel, setEditStageLabel] = useState("");
  const [editStageAgentId, setEditStageAgentId] = useState<string | null>(null);
  const [editStageTeamAgentId, setEditStageTeamAgentId] = useState<string | null>(null);
  const [editStageErrorStrategy, setEditStageErrorStrategy] = useState<"fail_fast" | "best_effort">("fail_fast");

  const [dagRunIds, setDagRunIds] = useState<Record<string, string>>({});
  const [wfStateOpen, setWfStateOpen] = useState(false);

  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [scenarioInput, setScenarioInput] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  interface SchemaFieldRow {
    name: string;
    type: string;
    reducer: string;
    writableBy: string;
    ephemeral: boolean;
    sanitize: boolean;
    required: boolean;
  }
  const [schemaFields, setSchemaFields] = useState<SchemaFieldRow[]>([]);
  const [schemaVersion, setSchemaVersion] = useState<number | null>(null);
  const [schemaErrors, setSchemaErrors] = useState<string[]>([]);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
  const [schemaSort, setSchemaSort] = useState<{ col: "name" | "type" | "reducer" | "writableBy"; dir: "asc" | "desc" } | null>(null);
  const emptyFieldForm = { name: "", type: "string", reducer: "last_wins", writableBy: "*", ephemeral: false, sanitize: false, required: false };
  const [fieldForm, setFieldForm] = useState(emptyFieldForm);

  const [approvalDecision, setApprovalDecision] = useState<"approve" | "regenerate" | "patch">("approve");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approvalPatchKeys, setApprovalPatchKeys] = useState<Set<string>>(new Set());
  const [approvalSnapshotExpanded, setApprovalSnapshotExpanded] = useState<Record<string, boolean>>({});

  const [selectedCpId, setSelectedCpId] = useState<string | null>(null);
  const [showCpDiff, setShowCpDiff] = useState(false);
  const [cpFieldExpanded, setCpFieldExpanded] = useState<Record<string, boolean>>({});

  const { data: pipelines = [], isLoading } = useQuery<AgentPipeline[]>({
    queryKey: ["/api/pipelines"],
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const teamAgents = useMemo(
    () => agents.filter((a) => !!a.blueprintId),
    [agents]
  );

  const { data: addWavePlan } = useQuery<{
    waves: Array<{ wave_number: number; nodes: string[] }>;
    totalWaves: number;
    maxParallelism: number;
    nodeConfig: Record<string, { label: string }>;
  }>({
    queryKey: ["/api/team-agents", newStageTeamAgentId, "dag-waves"],
    enabled: !!newStageTeamAgentId && newStageType === "composite",
  });

  const { data: editWavePlan } = useQuery<{
    waves: Array<{ wave_number: number; nodes: string[] }>;
    totalWaves: number;
    maxParallelism: number;
    nodeConfig: Record<string, { label: string }>;
  }>({
    queryKey: ["/api/team-agents", editStageTeamAgentId, "dag-waves"],
    enabled: !!editStageTeamAgentId,
  });

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) || null,
    [pipelines, selectedPipelineId]
  );

  const allStages: PipelineStage[] = useMemo(
    () => (selectedPipeline?.stages as PipelineStage[] || []).sort((a, b) => a.order - b.order),
    [selectedPipeline]
  );

  const stages: PipelineStage[] = useMemo(
    () => allStages.filter((s) => !s.parentGroupId),
    [allStages]
  );

  const getChildStages = (groupId: string): PipelineStage[] =>
    allStages.filter((s) => s.parentGroupId === groupId).sort((a, b) => a.order - b.order);

  const { data: runs = [], isLoading: runsLoading } = useQuery<PipelineRun[]>({
    queryKey: ["/api/pipelines", selectedPipelineId, "runs"],
    enabled: !!selectedPipelineId,
  });

  const { data: workflowState } = useQuery<{
    runId: string;
    status: string;
    currentState: Record<string, any>;
    stateVersion: number;
    activeInterruptId: string | null;
    history: Array<{
      id: string;
      checkpointNumber: number;
      trigger: string;
      triggerStageId: string | null;
      stateJson: Record<string, any>;
      stateHash: string;
      interruptId: string | null;
      interruptPayload: any;
      interruptResponded: boolean;
      interruptResponse: any;
      createdAt: string | null;
    }>;
    interrupts: Array<{
      id: string;
      checkpointNumber: number;
      interruptId: string | null;
      interruptPayload: any;
      interruptResponded: boolean;
      interruptResponse: any;
      triggerStageId: string | null;
      createdAt: string | null;
    }>;
  }>({
    queryKey: ["/api/pipeline-runs", activeRunId, "workflow-state"],
    enabled: !!activeRunId,
    refetchInterval: activeRunId ? 3000 : false,
  });

  const { data: workflowSchema, isLoading: schemaLoading, isError: schemaIsError } = useQuery<{
    id: string;
    schemaVersion: number;
    fields: Record<string, { type: string; reducer: string; writable_by?: string[]; ephemeral?: boolean; sanitize?: boolean; required?: boolean }>;
  } | null>({
    queryKey: ["/api/pipelines", selectedPipelineId, "workflow-state-schema"],
    enabled: !!selectedPipelineId,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/pipelines/${selectedPipelineId}/workflow-state-schema`, {
        credentials: "include",
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (workflowSchema) {
      const rows = Object.entries(workflowSchema.fields).map(([name, def]) => ({
        name,
        type: def.type || "string",
        reducer: def.reducer || "last_wins",
        writableBy: (def.writable_by || ["*"]).join(", "),
        ephemeral: !!def.ephemeral,
        sanitize: !!def.sanitize,
        required: !!def.required,
      }));
      setSchemaFields(rows);
      setSchemaVersion(workflowSchema.schemaVersion);
      setSchemaErrors([]);
    } else if (!schemaLoading) {
      setSchemaFields([]);
      setSchemaVersion(null);
    }
  }, [workflowSchema, schemaLoading]);

  interface WorkflowSchemaFieldPayload {
    type: string;
    reducer: string;
    writable_by: string[];
    ephemeral?: boolean;
    sanitize?: boolean;
    required?: boolean;
  }

  const saveSchemaM = useMutation({
    mutationFn: async ({ pipelineId, fields }: { pipelineId: string; fields: Record<string, WorkflowSchemaFieldPayload> }) => {
      const res = await apiRequest("POST", `/api/pipelines/${pipelineId}/workflow-state-schema`, { fields });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipelineId, "workflow-state-schema"] });
      toast({ title: "Schema saved", description: "Workflow state schema updated successfully." });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "An unknown error occurred.";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    },
  });

  function validateSchema(): string[] {
    const errs: string[] = [];
    const validReducers = ["last_wins", "append", "max", "min"];
    const validTypes = ["string", "number", "boolean", "array", "object"];
    const names = new Set<string>();
    schemaFields.forEach((f, i) => {
      if (!f.name.trim()) errs.push(`Row ${i + 1}: field name is required.`);
      else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.name.trim())) errs.push(`Row ${i + 1}: field name "${f.name}" must be a valid identifier.`);
      else if (names.has(f.name.trim())) errs.push(`Row ${i + 1}: duplicate field name "${f.name}".`);
      else names.add(f.name.trim());
      if (!validReducers.includes(f.reducer)) errs.push(`Row ${i + 1} (${f.name}): invalid reducer "${f.reducer}".`);
      if (!validTypes.includes(f.type)) errs.push(`Row ${i + 1} (${f.name}): invalid type "${f.type}".`);
    });
    return errs;
  }

  function handleSaveSchema() {
    const errs = validateSchema();
    setSchemaErrors(errs);
    if (errs.length > 0 || !selectedPipelineId) return;
    const fields: Record<string, WorkflowSchemaFieldPayload> = {};
    schemaFields.forEach((f) => {
      const payload: WorkflowSchemaFieldPayload = {
        type: f.type,
        reducer: f.reducer,
        writable_by: f.writableBy.split(",").map((s) => s.trim()).filter(Boolean),
      };
      if (f.ephemeral) payload.ephemeral = true;
      if (f.sanitize) payload.sanitize = true;
      if (f.required) payload.required = true;
      fields[f.name.trim()] = payload;
    });
    saveSchemaM.mutate({ pipelineId: selectedPipelineId, fields });
  }

  function openAddField() {
    setEditingFieldIndex(null);
    setFieldForm(emptyFieldForm);
    setFieldDialogOpen(true);
  }

  function openEditField(index: number) {
    const f = schemaFields[index];
    setEditingFieldIndex(index);
    setFieldForm({ name: f.name, type: f.type, reducer: f.reducer, writableBy: f.writableBy, ephemeral: f.ephemeral, sanitize: f.sanitize, required: f.required });
    setFieldDialogOpen(true);
  }

  function confirmFieldDialog() {
    const trimmedName = fieldForm.name.trim();
    if (!trimmedName) return;
    const row = { ...fieldForm, name: trimmedName };
    if (editingFieldIndex !== null) {
      setSchemaFields((prev) => prev.map((f, i) => (i === editingFieldIndex ? row : f)));
    } else {
      setSchemaFields((prev) => [...prev, row]);
    }
    setFieldDialogOpen(false);
  }

  function deleteField(index: number) {
    setSchemaFields((prev) => prev.filter((_, i) => i !== index));
  }

  const activeRun = useMemo(
    () => runs.find((r) => r.id === activeRunId) || null,
    [runs, activeRunId]
  );

  const activeRunResults: StageResult[] = useMemo(
    () => (activeRun?.stageResults as StageResult[] || []),
    [activeRun]
  );

  useEffect(() => {
    setApprovalDecision("approve");
    setApprovalNotes("");
    setApprovalPatchKeys(new Set());
    setApprovalSnapshotExpanded({});
    setSelectedCpId(null);
    setShowCpDiff(false);
    setCpFieldExpanded({});
  }, [activeRunId, activeRun?.currentStageId]);

  useEffect(() => {
    if (workflowState?.history && workflowState.history.length > 0 && !selectedCpId) {
      setSelectedCpId(workflowState.history[workflowState.history.length - 1].id);
    }
  }, [workflowState?.history, selectedCpId]);

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await apiRequest("POST", "/api/pipelines", {
        ...data,
        status: "draft",
        stages: [],
        connections: [],
      });
      return res.json();
    },
    onSuccess: (created: AgentPipeline) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] });
      toast({ title: "Pipeline created", description: created.name });
      setCreateOpen(false);
      setNewPipeline({ name: "", description: "" });
      setSelectedPipelineId(created.id);
      setDetailTab("designer");
    },
    onError: (e: any) => toast({ title: "Failed to create pipeline", description: e.message, variant: "destructive" }),
  });

  const updatePipelineMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/pipelines/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] });
    },
    onError: (e: any) => toast({ title: "Failed to update pipeline", description: e.message, variant: "destructive" }),
  });

  const deletePipelineMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/pipelines/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] });
      toast({ title: "Pipeline deleted" });
      setSelectedPipelineId(null);
    },
    onError: (e: any) => toast({ title: "Failed to delete pipeline", description: e.message, variant: "destructive" }),
  });

  const startRunMutation = useMutation({
    mutationFn: async ({ pipelineId, scenarioInput }: { pipelineId: string; scenarioInput: string }) => {
      const res = await apiRequest("POST", `/api/pipelines/${pipelineId}/runs`, { scenarioInput });
      return res.json();
    },
    onSuccess: (created: PipelineRun) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipelineId, "runs"] });
      toast({ title: "Pipeline run started" });
      setRunDialogOpen(false);
      setScenarioInput("");
      setActiveRunId(created.id);
      setDetailTab("runs");
    },
    onError: (e: any) => toast({ title: "Failed to start run", description: e.message, variant: "destructive" }),
  });

  const simulateStageMutation = useMutation({
    mutationFn: async ({ runId }: { runId: string; stageId: string }) => {
      const res = await apiRequest("POST", `/api/pipeline-runs/${runId}/simulate-stage`, {});
      return res.json();
    },
    onSuccess: async (data: any, { runId, stageId }) => {
      if (data.dagRunId) {
        setDagRunIds((prev) => ({ ...prev, [`${runId}_${stageId}`]: data.dagRunId }));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipelineId, "runs"] });
      const output = data.output || data.simulatedOutput || "Stage completed";
      try {
        await apiRequest("POST", `/api/pipeline-runs/${runId}/advance`, { output });
        queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipelineId, "runs"] });
        toast({ title: "Stage simulated and advanced" });
      } catch {
        toast({ title: "Stage simulated", description: "Advance manually if needed" });
      }
    },
    onError: (e: any) => toast({ title: "Simulation failed", description: e.message, variant: "destructive" }),
  });

  interface ApprovePayload {
    runId: string;
    decision: "approved" | "regenerate" | "patch";
    notes?: string;
    stateUpdates?: Record<string, unknown> | null;
  }

  const approveMutation = useMutation({
    mutationFn: async ({ runId, decision, notes, stateUpdates }: ApprovePayload) => {
      const body: Record<string, unknown> = { approvedBy: "admin", decision };
      if (notes) body.notes = notes;
      if (stateUpdates) body.stateUpdates = stateUpdates;
      const res = await apiRequest("POST", `/api/pipeline-runs/${runId}/approve`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipelineId, "runs"] });
      setApprovalDecision("approve");
      setApprovalNotes("");
      setApprovalPatchKeys(new Set());
      toast({ title: "Decision submitted" });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "An unknown error occurred.";
      toast({ title: "Approval failed", description: message, variant: "destructive" });
    },
  });

  function handleSubmitDecision(runId: string, snapshot: Record<string, unknown> | null) {
    const decision: "approved" | "regenerate" | "patch" =
      approvalDecision === "approve" ? "approved" : approvalDecision === "regenerate" ? "regenerate" : "patch";
    const stateUpdates =
      approvalDecision === "patch" && snapshot
        ? Object.fromEntries(
            [...approvalPatchKeys].filter((k) => k in snapshot).map((k) => [k, snapshot[k]])
          )
        : null;
    approveMutation.mutate({ runId, decision, notes: approvalNotes.trim() || undefined, stateUpdates });
  }

  const rejectMutation = useMutation({
    mutationFn: async (runId: string) => {
      const res = await apiRequest("POST", `/api/pipeline-runs/${runId}/reject`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipelineId, "runs"] });
      toast({ title: "Stage rejected" });
    },
    onError: (e: unknown) => toast({ title: "Rejection failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" }),
  });

  const restoreCheckpointMutation = useMutation({
    mutationFn: async ({ runId, num }: { runId: string; num: number }) => {
      const res = await apiRequest("POST", `/api/pipeline-runs/${runId}/restore/${num}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-runs", activeRunId, "workflow-state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipelineId, "runs"] });
      toast({ title: "Checkpoint restored", description: "Run state has been rolled back to the selected checkpoint." });
    },
    onError: (e: unknown) => toast({ title: "Restore failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" }),
  });

  function handleAddStage(type: "agent" | "approval_gate" | "composite") {
    setNewStageType(type);
    setNewStageLabel(type === "agent" ? "Agent Stage" : type === "composite" ? "Composite Stage" : "Approval Gate");
    setNewStageAgentId(null);
    setNewStageTeamAgentId(null);
    setNewStageErrorStrategy("fail_fast");
    setAddStageOpen(true);
  }

  function handleOpenAddParallelGroup() {
    setParallelGroupLabel("Parallel Group");
    setParallelGroupAgents([
      { label: "Agent 1", agentId: null },
      { label: "Agent 2", agentId: null },
    ]);
    setAddParallelGroupOpen(true);
  }

  function confirmAddParallelGroup() {
    if (!selectedPipeline) return;
    const currentStages = (selectedPipeline.stages as PipelineStage[]) || [];
    const groupId = generateId();
    const childIds: string[] = [];
    const childStages: PipelineStage[] = parallelGroupAgents.map((agent, i) => {
      const childId = generateId();
      childIds.push(childId);
      return {
        id: childId,
        agentId: agent.agentId,
        label: agent.label || `Agent ${i + 1}`,
        stageType: "agent" as const,
        order: i,
        parentGroupId: groupId,
        config: {},
      };
    });

    const groupStage: PipelineStage = {
      id: groupId,
      agentId: null,
      label: parallelGroupLabel || "Parallel Group",
      stageType: "parallel_group",
      order: stages.length,
      children: childIds,
      config: {},
    };

    const updatedStages = [...currentStages, groupStage, ...childStages];

    const currentConnections = (selectedPipeline.connections as PipelineConnection[]) || [];
    const newConnections = [...currentConnections];
    const topLevelStages = currentStages.filter((s) => !s.parentGroupId);
    if (topLevelStages.length > 0) {
      const lastStage = topLevelStages[topLevelStages.length - 1];
      if (lastStage.stageType === "parallel_group" && lastStage.children) {
        lastStage.children.forEach((childId) => {
          childIds.forEach((targetChildId) => {
            newConnections.push({
              id: generateId(),
              sourceStageId: childId,
              targetStageId: targetChildId,
            });
          });
        });
      } else {
        childIds.forEach((childId) => {
          newConnections.push({
            id: generateId(),
            sourceStageId: lastStage.id,
            targetStageId: childId,
          });
        });
      }
    }

    updatePipelineMutation.mutate({
      id: selectedPipeline.id,
      data: { stages: updatedStages, connections: newConnections },
    });
    setAddParallelGroupOpen(false);
  }

  function handleAddChildToGroup(groupId: string) {
    setAddChildStageGroupId(groupId);
    setChildStageLabel("Agent Stage");
    setChildStageAgentId(null);
  }

  function confirmAddChildStage() {
    if (!selectedPipeline || !addChildStageGroupId) return;
    const currentStages = (selectedPipeline.stages as PipelineStage[]) || [];
    const group = currentStages.find((s) => s.id === addChildStageGroupId);
    if (!group) return;

    const childId = generateId();
    const existingChildren = currentStages.filter((s) => s.parentGroupId === addChildStageGroupId);
    const newChild: PipelineStage = {
      id: childId,
      agentId: childStageAgentId,
      label: childStageLabel || "Agent Stage",
      stageType: "agent",
      order: existingChildren.length,
      parentGroupId: addChildStageGroupId,
      config: {},
    };

    const updatedChildren = [...(group.children || []), childId];
    const updatedStages = currentStages.map((s) =>
      s.id === addChildStageGroupId ? { ...s, children: updatedChildren } : s
    );
    updatedStages.push(newChild);

    const currentConnections = (selectedPipeline.connections as PipelineConnection[]) || [];
    const newConnections = [...currentConnections];
    const topLevelStages = updatedStages.filter((s) => !s.parentGroupId).sort((a, b) => a.order - b.order);
    const groupIndex = topLevelStages.findIndex((s) => s.id === addChildStageGroupId);

    if (groupIndex > 0) {
      const prevStage = topLevelStages[groupIndex - 1];
      if (prevStage.stageType === "parallel_group") {
        const prevChildren = updatedStages.filter((s) => s.parentGroupId === prevStage.id);
        for (const pc of prevChildren) {
          newConnections.push({ id: generateId(), sourceStageId: pc.id, targetStageId: childId });
        }
      } else {
        newConnections.push({ id: generateId(), sourceStageId: prevStage.id, targetStageId: childId });
      }
    }

    if (groupIndex < topLevelStages.length - 1) {
      const nextStage = topLevelStages[groupIndex + 1];
      if (nextStage.stageType === "parallel_group") {
        const nextChildren = updatedStages.filter((s) => s.parentGroupId === nextStage.id);
        for (const nc of nextChildren) {
          newConnections.push({ id: generateId(), sourceStageId: childId, targetStageId: nc.id });
        }
      } else {
        newConnections.push({ id: generateId(), sourceStageId: childId, targetStageId: nextStage.id });
      }
    }

    updatePipelineMutation.mutate({
      id: selectedPipeline.id,
      data: { stages: updatedStages, connections: newConnections },
    });
    setAddChildStageGroupId(null);
  }

  function handleRemoveChildStage(groupId: string, childId: string) {
    if (!selectedPipeline) return;
    const currentStages = (selectedPipeline.stages as PipelineStage[]) || [];
    const group = currentStages.find((s) => s.id === groupId);
    if (!group) return;

    const updatedChildren = (group.children || []).filter((id) => id !== childId);
    if (updatedChildren.length < 1) {
      handleRemoveStage(groupId);
      return;
    }

    const updatedStages = currentStages
      .filter((s) => s.id !== childId)
      .map((s) => s.id === groupId ? { ...s, children: updatedChildren } : s);

    const currentConnections = (selectedPipeline.connections as PipelineConnection[]) || [];
    const updatedConnections = currentConnections.filter(
      (c) => c.sourceStageId !== childId && c.targetStageId !== childId
    );

    updatePipelineMutation.mutate({
      id: selectedPipeline.id,
      data: { stages: updatedStages, connections: updatedConnections },
    });
  }

  function confirmAddStage() {
    if (!selectedPipeline) return;
    const currentStages = (selectedPipeline.stages as PipelineStage[]) || [];
    const topLevel = currentStages.filter((s) => !s.parentGroupId);
    const defaultLabel = newStageType === "agent" ? "Agent Stage" : newStageType === "composite" ? "Composite Stage" : "Approval Gate";
    const newStage: PipelineStage = {
      id: generateId(),
      agentId: newStageType === "agent" ? newStageAgentId : null,
      teamAgentId: newStageType === "composite" ? newStageTeamAgentId : null,
      label: newStageLabel || defaultLabel,
      stageType: newStageType,
      order: topLevel.length,
      config: newStageType === "approval_gate"
        ? { approvalRequired: true }
        : newStageType === "composite"
        ? { errorStrategy: newStageErrorStrategy, waveCount: addWavePlan?.totalWaves ?? null }
        : {},
    };
    const updatedStages = [...currentStages, newStage];

    const currentConnections = (selectedPipeline.connections as PipelineConnection[]) || [];
    const newConnections = [...currentConnections];
    if (topLevel.length > 0) {
      const lastStage = topLevel[topLevel.length - 1];
      if (lastStage.stageType === "parallel_group" && lastStage.children) {
        lastStage.children.forEach((childId) => {
          newConnections.push({
            id: generateId(),
            sourceStageId: childId,
            targetStageId: newStage.id,
          });
        });
      } else {
        newConnections.push({
          id: generateId(),
          sourceStageId: lastStage.id,
          targetStageId: newStage.id,
        });
      }
    }

    updatePipelineMutation.mutate({
      id: selectedPipeline.id,
      data: { stages: updatedStages, connections: newConnections },
    });
    setAddStageOpen(false);
    setNewStageLabel("");
    setNewStageAgentId(null);
  }

  function handleRemoveStage(stageId: string) {
    if (!selectedPipeline) return;
    const currentStages = (selectedPipeline.stages as PipelineStage[]) || [];
    const stageToRemove = currentStages.find((s) => s.id === stageId);
    const idsToRemove = new Set<string>([stageId]);
    if (stageToRemove?.stageType === "parallel_group" && stageToRemove.children) {
      stageToRemove.children.forEach((childId) => idsToRemove.add(childId));
    }
    const updatedStages = currentStages
      .filter((s) => !idsToRemove.has(s.id))
      .filter((s) => s.parentGroupId !== stageId)
      .map((s, i) => ({ ...s, order: s.parentGroupId ? s.order : i }));
    const currentConnections = (selectedPipeline.connections as PipelineConnection[]) || [];
    const updatedConnections = currentConnections.filter(
      (c) => !idsToRemove.has(c.sourceStageId) && !idsToRemove.has(c.targetStageId)
    );
    updatePipelineMutation.mutate({
      id: selectedPipeline.id,
      data: { stages: updatedStages, connections: updatedConnections },
    });
  }

  function openEditStage(stage: PipelineStage) {
    setEditStageId(stage.id);
    setEditStageLabel(stage.label);
    setEditStageAgentId(stage.agentId);
    setEditStageTeamAgentId(stage.teamAgentId || null);
    setEditStageErrorStrategy(stage.config?.errorStrategy || "fail_fast");
  }

  function confirmEditStage() {
    if (!selectedPipeline || !editStageId) return;
    const currentStages = (selectedPipeline.stages as PipelineStage[]) || [];
    const updatedStages = currentStages.map((s) => {
      if (s.id !== editStageId) return s;
      if (s.stageType === "composite") {
        return { ...s, label: editStageLabel, teamAgentId: editStageTeamAgentId, config: { ...s.config, errorStrategy: editStageErrorStrategy, waveCount: editWavePlan?.totalWaves ?? s.config?.waveCount ?? null } };
      }
      return { ...s, label: editStageLabel, agentId: editStageAgentId };
    });
    updatePipelineMutation.mutate({
      id: selectedPipeline.id,
      data: { stages: updatedStages },
    });
    setEditStageId(null);
  }

  function getAgentName(agentId: string | null) {
    if (!agentId) return null;
    const agent = agents.find((a) => a.id === agentId);
    return agent?.name || null;
  }

  function getRunProgress(run: PipelineRun) {
    const results = (run.stageResults as StageResult[]) || [];
    if (results.length === 0) return 0;
    const completed = results.filter((r) => r.status === "completed" || r.status === "approved").length;
    return Math.round((completed / stages.length) * 100);
  }

  function toggleExpandStage(stageId: string) {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4" data-testid="page-pipelines-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!selectedPipelineId) {
    return (
      <div className="space-y-4 p-4" data-testid="page-pipelines">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Workflow className="w-6 h-6 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Pipeline Orchestrator</h1>
              <p className="text-sm text-muted-foreground">Design and execute multi-agent workflows with approval gates</p>
            </div>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            data-testid="button-create-pipeline"
          >
            <Plus className="w-4 h-4 mr-1" />
            Create Pipeline
          </Button>
        </div>

        {pipelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Workflow className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-lg font-medium text-muted-foreground">No pipelines yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first multi-agent pipeline to get started</p>
            <Button
              className="mt-4"
              onClick={() => setCreateOpen(true)}
              data-testid="button-create-pipeline-empty"
            >
              <Plus className="w-4 h-4 mr-1" />
              Create Pipeline
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pipelines.map((p) => {
              const pStages = (p.stages as PipelineStage[]) || [];
              return (
                <Card
                  key={p.id}
                  className="cursor-pointer hover-elevate"
                  onClick={() => {
                    setSelectedPipelineId(p.id);
                    setDetailTab("designer");
                  }}
                  data-testid={`card-pipeline-${p.id}`}
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium truncate" data-testid={`text-pipeline-name-${p.id}`}>
                        {p.name}
                      </CardTitle>
                    </div>
                    <Badge variant={getStatusVariant(p.status)} className={`text-[10px] ${getStatusColor(p.status)}`} data-testid={`badge-pipeline-status-${p.id}`}>
                      {p.status}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    {p.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3" data-testid={`text-pipeline-desc-${p.id}`}>
                        {p.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Workflow className="w-3 h-3" />
                        <span>{pStages.length} stage{pStages.length !== 1 ? "s" : ""}</span>
                      </div>
                      {p.createdAt && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>{timeAgo(p.createdAt as any)}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent data-testid="dialog-create-pipeline">
            <DialogHeader>
              <DialogTitle>Create Pipeline</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pipeline-name">Name</Label>
                <Input
                  id="pipeline-name"
                  placeholder="My Pipeline"
                  value={newPipeline.name}
                  onChange={(e) => setNewPipeline({ ...newPipeline, name: e.target.value })}
                  data-testid="input-pipeline-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pipeline-description">Description</Label>
                <Textarea
                  id="pipeline-description"
                  placeholder="Describe the pipeline workflow..."
                  value={newPipeline.description}
                  onChange={(e) => setNewPipeline({ ...newPipeline, description: e.target.value })}
                  data-testid="input-pipeline-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel-create">
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate(newPipeline)}
                disabled={!newPipeline.name.trim() || createMutation.isPending}
                data-testid="button-confirm-create"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4" data-testid="page-pipeline-detail">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSelectedPipelineId(null)}
            data-testid="button-back-to-list"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-pipeline-name">
              {selectedPipeline?.name}
            </h1>
            <p className="text-sm text-muted-foreground">{selectedPipeline?.description}</p>
          </div>
          {selectedPipeline && (
            <Badge variant={getStatusVariant(selectedPipeline.status)} className={`${getStatusColor(selectedPipeline.status)}`} data-testid="badge-pipeline-status">
              {selectedPipeline.status}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setRunDialogOpen(true)}
            disabled={stages.length === 0}
            data-testid="button-run-pipeline"
          >
            <Play className="w-4 h-4 mr-1" />
            Run Pipeline
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              if (selectedPipeline) deletePipelineMutation.mutate(selectedPipeline.id);
            }}
            disabled={deletePipelineMutation.isPending}
            data-testid="button-delete-pipeline"
          >
            {deletePipelineMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <Tabs value={detailTab} onValueChange={setDetailTab}>
        <TabsList>
          <TabsTrigger value="designer" data-testid="tab-designer">
            <Settings2 className="w-3.5 h-3.5 mr-1.5" />
            Designer
          </TabsTrigger>
          <TabsTrigger value="schema" data-testid="tab-schema">
            <Database className="w-3.5 h-3.5 mr-1.5" />
            State Schema
          </TabsTrigger>
          <TabsTrigger value="runs" data-testid="tab-runs">
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Runs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="designer" className="mt-4">
          <ScrollArea className="h-[calc(100vh-240px)]">
            <div className="flex flex-col items-center max-w-lg mx-auto">
              {stages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Workflow className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No stages yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Add agent stages and approval gates to build your pipeline</p>
                </div>
              )}
              {stages.map((stage, index) => (
                <div key={stage.id} className="w-full">
                  {index > 0 && (
                    <div className="flex flex-col items-center py-1">
                      <div className="w-px h-6 bg-border" />
                      <ArrowDown className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}

                  {stage.stageType === "parallel_group" ? (
                    <div className="w-full" data-testid={`pipeline-stage-${stage.id}`}>
                      <div className="flex flex-col items-center py-1">
                        <GitFork className="w-4 h-4 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground mt-0.5">Fork</span>
                      </div>
                      <div className="border-2 border-dashed border-muted-foreground/30 rounded-md p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-xs font-medium" data-testid={`text-stage-label-${stage.id}`}>{stage.label}</span>
                            <Badge variant="outline" className="text-[10px]">Parallel Group</Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleAddChildToGroup(stage.id)}
                              data-testid={`button-add-child-${stage.id}`}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleRemoveStage(stage.id)}
                              data-testid={`button-remove-stage-${stage.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 justify-center">
                          {getChildStages(stage.id).map((child) => (
                            <Card key={child.id} className="flex-1 min-w-[140px] max-w-[220px]" data-testid={`pipeline-stage-${child.id}`}>
                              <CardContent className="p-3">
                                <div className="flex flex-wrap items-start justify-between gap-1">
                                  <div className="flex items-start gap-2 flex-1 min-w-0">
                                    <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium truncate" data-testid={`text-stage-label-${child.id}`}>{child.label}</p>
                                      <p className="text-[10px] text-muted-foreground truncate mt-0.5" data-testid={`text-stage-agent-${child.id}`}>
                                        {getAgentName(child.agentId) || "Select Agent"}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-0.5">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => openEditStage(child)}
                                      data-testid={`button-edit-stage-${child.id}`}
                                    >
                                      <Settings2 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleRemoveChildStage(stage.id, child.id)}
                                      data-testid={`button-remove-stage-${child.id}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-center py-1">
                        <GitMerge className="w-4 h-4 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground mt-0.5">Join</span>
                      </div>
                    </div>
                  ) : stage.stageType === "composite" ? (
                    <Card data-testid={`pipeline-stage-${stage.id}`} className="border-purple-500/30">
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              <Network className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">Stage {index + 1}</span>
                                <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30">
                                  Composite
                                </Badge>
                                {stage.config?.waveCount != null && (
                                  <Badge variant="outline" className="text-[10px]" data-testid={`badge-wave-count-${stage.id}`}>
                                    {stage.config.waveCount} wave{stage.config.waveCount !== 1 ? "s" : ""}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm font-medium mt-0.5" data-testid={`text-stage-label-${stage.id}`}>
                                {stage.label}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-stage-team-agent-${stage.id}`}>
                                {getAgentName(stage.teamAgentId || null) || "Select Team Agent"}
                              </p>
                              <div className="flex items-center gap-1 mt-1.5">
                                <span className="text-[10px] text-muted-foreground mr-1">Error strategy:</span>
                                <button
                                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${stage.config?.errorStrategy !== "best_effort" ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400" : "border-muted text-muted-foreground hover:border-muted-foreground"}`}
                                  onClick={() => {
                                    if (!selectedPipeline) return;
                                    const currentStages = (selectedPipeline.stages as PipelineStage[]) || [];
                                    const updatedStages = currentStages.map((s) =>
                                      s.id === stage.id ? { ...s, config: { ...s.config, errorStrategy: "fail_fast" as const } } : s
                                    );
                                    updatePipelineMutation.mutate({ id: selectedPipeline.id, data: { stages: updatedStages } });
                                  }}
                                  data-testid={`button-fail-fast-${stage.id}`}
                                >
                                  Fail Fast
                                </button>
                                <button
                                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${stage.config?.errorStrategy === "best_effort" ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400" : "border-muted text-muted-foreground hover:border-muted-foreground"}`}
                                  onClick={() => {
                                    if (!selectedPipeline) return;
                                    const currentStages = (selectedPipeline.stages as PipelineStage[]) || [];
                                    const updatedStages = currentStages.map((s) =>
                                      s.id === stage.id ? { ...s, config: { ...s.config, errorStrategy: "best_effort" as const } } : s
                                    );
                                    updatePipelineMutation.mutate({ id: selectedPipeline.id, data: { stages: updatedStages } });
                                  }}
                                  data-testid={`button-best-effort-${stage.id}`}
                                >
                                  Best Effort
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditStage(stage)}
                              data-testid={`button-edit-stage-${stage.id}`}
                            >
                              <Settings2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleRemoveStage(stage.id)}
                              data-testid={`button-remove-stage-${stage.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card data-testid={`pipeline-stage-${stage.id}`}>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              {stage.stageType === "approval_gate" ? (
                                <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                              ) : (
                                <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Stage {index + 1}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {stage.stageType === "approval_gate" ? "Approval Gate" : "Agent"}
                                </Badge>
                              </div>
                              <p className="text-sm font-medium mt-0.5" data-testid={`text-stage-label-${stage.id}`}>
                                {stage.label}
                              </p>
                              {stage.stageType === "agent" && (
                                <p className="text-xs text-muted-foreground mt-1" data-testid={`text-stage-agent-${stage.id}`}>
                                  {getAgentName(stage.agentId) || "Select Agent"}
                                </p>
                              )}
                              {stage.stageType === "approval_gate" && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <ShieldCheck className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                  <span className="text-xs text-muted-foreground">Human Approval Required</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditStage(stage)}
                              data-testid={`button-edit-stage-${stage.id}`}
                            >
                              <Settings2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleRemoveStage(stage.id)}
                              data-testid={`button-remove-stage-${stage.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ))}

              {stages.length > 0 && (
                <div className="flex flex-col items-center py-1">
                  <div className="w-px h-6 bg-border" />
                  <ArrowDown className="w-4 h-4 text-muted-foreground" />
                </div>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="mt-2" data-testid="button-add-stage">
                    <Plus className="w-4 h-4 mr-1" />
                    Add Stage
                    <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleAddStage("agent")} data-testid="menu-add-agent-stage">
                    <Bot className="w-4 h-4 mr-2" />
                    Add Agent Stage
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddStage("approval_gate")} data-testid="menu-add-approval-gate">
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    Add Approval Gate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleOpenAddParallelGroup} data-testid="menu-add-parallel-group">
                    <Layers className="w-4 h-4 mr-2" />
                    Add Parallel Group
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddStage("composite")} data-testid="menu-add-composite-stage">
                    <Network className="w-4 h-4 mr-2" />
                    Add Composite Stage
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="schema" className="mt-4">
          <ScrollArea className="h-[calc(100vh-240px)]">
            <div className="space-y-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm font-medium">Workflow State Schema</span>
                  {schemaVersion !== null && (
                    <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-300">
                      v{schemaVersion}
                    </Badge>
                  )}
                  <Badge
                    className={`text-[10px] ${selectedPipeline?.stateEnabled ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-muted text-muted-foreground border-border"}`}
                    data-testid="badge-state-tracking"
                  >
                    {selectedPipeline?.stateEnabled ? "state tracking on" : "state tracking off"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => { const errs = validateSchema(); setSchemaErrors(errs); if (errs.length === 0) toast({ title: "Schema is valid", description: `${schemaFields.length} field(s) passed validation.` }); }} data-testid="button-validate-schema">
                    <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                    Validate Schema
                  </Button>
                  <Button size="sm" onClick={handleSaveSchema} disabled={saveSchemaM.isPending} data-testid="button-save-schema">
                    {saveSchemaM.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                    Save Schema
                  </Button>
                </div>
              </div>

              {schemaErrors.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1" data-testid="schema-validation-errors">
                  {schemaErrors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive">{err}</p>
                  ))}
                </div>
              )}

              {schemaIsError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3" data-testid="schema-fetch-error">
                  <p className="text-xs text-destructive">Failed to load the workflow state schema. Check the server logs for details.</p>
                </div>
              )}

              {schemaLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : schemaIsError ? null : (
                <div className="rounded-md border overflow-hidden" data-testid="schema-field-table">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground">
                        {(["name", "type", "reducer", "writableBy"] as const).map((col) => {
                          const labels: Record<string, string> = { name: "Field", type: "Type", reducer: "Reducer", writableBy: "Writable By" };
                          const active = schemaSort?.col === col;
                          return (
                            <th
                              key={col}
                              className="px-3 py-2 text-left font-medium cursor-pointer select-none hover:text-foreground transition-colors"
                              onClick={() => setSchemaSort((s) => s?.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" })}
                              data-testid={`sort-col-${col}`}
                            >
                              <span className="inline-flex items-center gap-1">
                                {labels[col]}
                                {active ? (schemaSort!.dir === "asc" ? " ↑" : " ↓") : " ↕"}
                              </span>
                            </th>
                          );
                        })}
                        <th className="px-3 py-2 text-left font-medium">Options</th>
                        <th className="px-3 py-2 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {schemaFields.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                            No fields defined yet. Click "Add Field" to get started.
                          </td>
                        </tr>
                      ) : (
                        schemaFields
                          .map((field, origIndex) => ({ field, origIndex }))
                          .sort((a, b) => {
                            if (!schemaSort) return 0;
                            const av = a.field[schemaSort.col] ?? "";
                            const bv = b.field[schemaSort.col] ?? "";
                            return schemaSort.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
                          })
                          .map(({ field, origIndex }, i) => (
                              <tr
                                key={origIndex}
                                className="border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                                onClick={() => openEditField(origIndex)}
                                data-testid={`schema-field-row-${i}`}
                              >
                                <td className="px-3 py-2 font-mono font-medium">{field.name}</td>
                                <td className="px-3 py-2">
                                  <Badge variant="outline" className="text-[10px] font-mono">{field.type}</Badge>
                                </td>
                                <td className="px-3 py-2">
                                  <Badge variant="outline" className={`text-[10px] ${field.reducer === "append" ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400" : ""}`}>
                                    {field.reducer === "append" ? "⊕ append" : field.reducer}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground font-mono text-[11px] max-w-32 truncate" title={field.writableBy}>
                                  {field.writableBy || "*"}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap gap-1">
                                    {field.required && <Badge variant="secondary" className="text-[10px]">required</Badge>}
                                    {field.ephemeral && <Badge variant="secondary" className="text-[10px]">ephemeral</Badge>}
                                    {field.sanitize && <Badge variant="secondary" className="text-[10px]">sanitize</Badge>}
                                  </div>
                                </td>
                                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-1">
                                    <button
                                      className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                                      onClick={(e) => { e.stopPropagation(); openEditField(origIndex); }}
                                      data-testid={`button-edit-field-${i}`}
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      className="text-muted-foreground hover:text-destructive p-0.5 rounded"
                                      onClick={(e) => { e.stopPropagation(); deleteField(origIndex); }}
                                      data-testid={`button-delete-field-${i}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <Button variant="outline" size="sm" onClick={openAddField} data-testid="button-add-field">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Field
              </Button>

              {schemaFields.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {schemaFields.length} field{schemaFields.length !== 1 ? "s" : ""} defined
                  {schemaVersion !== null ? ` · schema v${schemaVersion}` : " · unsaved"}
                  {" · "}
                  {schemaFields.filter((f) => f.reducer === "last_wins").length} last_wins
                  {", "}
                  {schemaFields.filter((f) => f.reducer === "append").length} append
                  {", "}
                  {schemaFields.filter((f) => f.reducer === "max").length} max
                  {", "}
                  {schemaFields.filter((f) => f.reducer === "min").length} min
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="runs" className="mt-4">
          {activeRun ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setActiveRunId(null)}
                    data-testid="button-back-to-runs"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <div>
                    <h3 className="text-sm font-medium">Run #{activeRun.id.substring(0, 8)}</h3>
                    <p className="text-xs text-muted-foreground">
                      {activeRun.scenarioInput ? activeRun.scenarioInput.substring(0, 80) : "No scenario"}
                      {activeRun.scenarioInput && activeRun.scenarioInput.length > 80 ? "..." : ""}
                    </p>
                  </div>
                </div>
                <Badge variant={getStatusVariant(activeRun.status)} className={`${getStatusColor(activeRun.status)}`} data-testid="badge-run-status">
                  {activeRun.status}
                </Badge>
              </div>

              <div className="flex items-center gap-3">
                <Progress value={getRunProgress(activeRun)} className="flex-1" data-testid="progress-run" />
                <span className="text-xs text-muted-foreground">{getRunProgress(activeRun)}%</span>
              </div>

              <ScrollArea className="h-[calc(100vh-340px)]">
                <div className="flex flex-col items-center max-w-lg mx-auto">
                  {stages.map((stage, index) => {
                    const result = activeRunResults.find((r) => r.stageId === stage.id);
                    const status = result?.status || "pending";
                    const isCurrent = activeRun.currentStageId === stage.id;

                    return (
                      <div key={stage.id} className="w-full">
                        {index > 0 && (
                          <div className="flex flex-col items-center py-1">
                            <div className="w-px h-6 bg-border" />
                            <ArrowDown className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <Card
                          className={
                            status === "running" ? "border-blue-500/50" :
                            status === "completed" || status === "approved" ? "border-green-500/50" :
                            status === "awaiting_approval" ? "border-amber-500/50" :
                            status === "failed" || status === "rejected" ? "border-red-500/50" : ""
                          }
                          data-testid={`run-stage-${stage.id}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5">
                                  {status === "completed" || status === "approved" ? (
                                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                                  ) : status === "running" ? (
                                    <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                                  ) : status === "awaiting_approval" ? (
                                    <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                  ) : status === "failed" || status === "rejected" ? (
                                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                                  ) : (
                                    <Clock className="w-5 h-5 text-muted-foreground" />
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Stage {index + 1}</span>
                                    <Badge variant="outline" className={`text-[10px] ${getStatusColor(status)}`}>
                                      {status.replace("_", " ")}
                                    </Badge>
                                  </div>
                                  <p className="text-sm font-medium mt-0.5">{stage.label}</p>
                                  {stage.stageType === "agent" && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {getAgentName(stage.agentId) || "Agent"}
                                    </p>
                                  )}
                                  {stage.stageType === "composite" && (
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <Network className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                                      <span className="text-xs text-muted-foreground">
                                        {getAgentName(stage.teamAgentId || null) || "Team Agent DAG"}
                                      </span>
                                      {stage.config?.errorStrategy && (
                                        <Badge variant="outline" className="text-[10px]">
                                          {stage.config.errorStrategy === "fail_fast" ? "Fail Fast" : "Best Effort"}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                  {stage.stageType === "approval_gate" && (
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <ShieldCheck className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                      <span className="text-xs text-muted-foreground">Human Approval Required</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {isCurrent && (stage.stageType === "agent" || stage.stageType === "composite") && (status === "running" || status === "pending") && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => simulateStageMutation.mutate({ runId: activeRun.id, stageId: stage.id })}
                                    disabled={simulateStageMutation.isPending}
                                    data-testid={`button-simulate-${stage.id}`}
                                  >
                                    {simulateStageMutation.isPending ? (
                                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                    ) : (
                                      <Sparkles className="w-4 h-4 mr-1" />
                                    )}
                                    Simulate
                                  </Button>
                                )}
                                {isCurrent && status === "awaiting_approval" && (() => {
                                  const activeInterrupt = workflowState?.interrupts.find((i) => !i.interruptResponded);
                                  const snapshot: Record<string, unknown> | null =
                                    (activeInterrupt?.interruptPayload?.stateSnapshot as Record<string, unknown>) || null;
                                  const snapshotKeys = snapshot ? Object.keys(snapshot) : [];
                                  const gateName: string =
                                    (activeInterrupt?.interruptPayload?.gateName as string) || stage.label;
                                  const stageOutput: string =
                                    (activeInterrupt?.interruptPayload?.stageOutput as string) || "";
                                  return (
                                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700/40 p-3 space-y-3" data-testid={`approval-panel-${stage.id}`}>
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <ShieldCheck className="w-4 h-4 text-amber-600" />
                                          <span className="text-sm font-medium">{gateName}</span>
                                        </div>
                                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                                          awaiting approval
                                        </Badge>
                                      </div>

                                      {stageOutput && (
                                        <div className="text-xs text-muted-foreground italic">{stageOutput.substring(0, 200)}{stageOutput.length > 200 ? "…" : ""}</div>
                                      )}

                                      {snapshot && snapshotKeys.length > 0 && (
                                        <div className="space-y-1">
                                          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">State Snapshot</div>
                                          <div className="bg-background/60 rounded border text-xs divide-y" data-testid={`snapshot-table-${stage.id}`}>
                                            {snapshotKeys.map((key) => {
                                              const val = snapshot[key];
                                              const isObj = val !== null && typeof val === "object";
                                              const isExpanded = !!approvalSnapshotExpanded[key];
                                              return (
                                                <div key={key} className="px-2 py-1">
                                                  <div className="flex items-center justify-between gap-2">
                                                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">{key}</span>
                                                    {isObj ? (
                                                      <button
                                                        className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800"
                                                        onClick={() => setApprovalSnapshotExpanded((s) => ({ ...s, [key]: !s[key] }))}
                                                        data-testid={`toggle-snapshot-${key}`}
                                                      >
                                                        {isExpanded ? "collapse" : "expand"}
                                                        <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                                      </button>
                                                    ) : (
                                                      <span className="font-mono text-[11px] truncate max-w-[180px]" title={String(val)}>
                                                        {val === null ? <span className="text-muted-foreground italic">null</span> : String(val)}
                                                      </span>
                                                    )}
                                                  </div>
                                                  {isObj && isExpanded && (
                                                    <pre className="mt-1 text-[10px] font-mono whitespace-pre-wrap text-muted-foreground bg-muted/30 rounded p-1 overflow-x-auto">
                                                      {JSON.stringify(val, null, 2)}
                                                    </pre>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}

                                      <div className="space-y-2">
                                        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Decision</div>
                                        <div className="flex items-center gap-1 rounded-md border bg-background/60 p-1 w-fit">
                                          <button
                                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${approvalDecision === "approve" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "text-muted-foreground hover:text-foreground"}`}
                                            onClick={() => setApprovalDecision("approve")}
                                            data-testid={`decision-approve-${stage.id}`}
                                          >
                                            <CheckCircle className="w-3.5 h-3.5" /> Approve
                                          </button>
                                          <button
                                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${approvalDecision === "regenerate" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" : "text-muted-foreground hover:text-foreground"}`}
                                            onClick={() => setApprovalDecision("regenerate")}
                                            data-testid={`decision-regenerate-${stage.id}`}
                                          >
                                            <RefreshCcw className="w-3.5 h-3.5" /> Regenerate
                                          </button>
                                          <button
                                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${approvalDecision === "patch" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400" : "text-muted-foreground hover:text-foreground"}`}
                                            onClick={() => setApprovalDecision("patch")}
                                            data-testid={`decision-patch-${stage.id}`}
                                          >
                                            <FileEdit className="w-3.5 h-3.5" /> Patch Fields
                                          </button>
                                        </div>
                                      </div>

                                      {approvalDecision === "patch" && snapshotKeys.length > 0 && (
                                        <div className="space-y-1">
                                          <div className="text-[11px] font-medium text-muted-foreground">Fields to patch (mark for regeneration)</div>
                                          <div className="space-y-1 rounded border bg-background/60 p-2" data-testid={`patch-key-list-${stage.id}`}>
                                            {snapshotKeys.map((key) => (
                                              <label key={key} className="flex items-center gap-2 text-xs cursor-pointer" data-testid={`patch-key-${key}`}>
                                                <input
                                                  type="checkbox"
                                                  checked={approvalPatchKeys.has(key)}
                                                  onChange={(e) => {
                                                    setApprovalPatchKeys((prev) => {
                                                      const next = new Set(prev);
                                                      if (e.target.checked) next.add(key);
                                                      else next.delete(key);
                                                      return next;
                                                    });
                                                  }}
                                                />
                                                <span className="font-mono">{key}</span>
                                              </label>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      <div className="space-y-1">
                                        <div className="text-[11px] font-medium text-muted-foreground">Notes / Feedback (optional)</div>
                                        <Textarea
                                          placeholder="Add context for this decision…"
                                          value={approvalNotes}
                                          onChange={(e) => setApprovalNotes(e.target.value)}
                                          className="text-xs min-h-[60px]"
                                          data-testid={`input-approval-notes-${stage.id}`}
                                        />
                                      </div>

                                      <div className="flex items-center justify-between">
                                        <Button
                                          size="sm"
                                          onClick={() => handleSubmitDecision(activeRun.id, snapshot)}
                                          disabled={approveMutation.isPending || (approvalDecision === "patch" && approvalPatchKeys.size === 0)}
                                          className={approvalDecision === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : approvalDecision === "regenerate" ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-purple-600 hover:bg-purple-700 text-white"}
                                          data-testid={`button-submit-decision-${stage.id}`}
                                        >
                                          {approveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                                          Submit Decision
                                        </Button>
                                        <button
                                          className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                                          onClick={() => rejectMutation.mutate(activeRun.id)}
                                          disabled={rejectMutation.isPending}
                                          data-testid={`button-reject-${stage.id}`}
                                        >
                                          <XCircle className="w-3 h-3" />
                                          {rejectMutation.isPending ? "Rejecting…" : "Reject pipeline"}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            {result?.output && (
                              <div className="mt-3">
                                <button
                                  className="text-xs text-muted-foreground flex items-center gap-1"
                                  onClick={() => toggleExpandStage(stage.id)}
                                  data-testid={`button-toggle-output-${stage.id}`}
                                >
                                  <ChevronDown className={`w-3 h-3 transition-transform ${expandedStages.has(stage.id) ? "rotate-180" : ""}`} />
                                  {expandedStages.has(stage.id) ? "Hide" : "Show"} output
                                </button>
                                {expandedStages.has(stage.id) && (
                                  <div className="mt-2 rounded-md bg-muted/50 p-3" data-testid={`text-stage-output-${stage.id}`}>
                                    <pre className="text-xs whitespace-pre-wrap font-mono">{result.output}</pre>
                                  </div>
                                )}
                              </div>
                            )}

                            {stage.stageType === "composite" && (dagRunIds[`${activeRun.id}_${stage.id}`] || result?.dagRunId) && (
                              <DAGExecutionView dagRunId={(dagRunIds[`${activeRun.id}_${stage.id}`] || result?.dagRunId)!} />
                            )}

                            {result?.duration != null && (
                              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                <span>{result.duration}ms</span>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {workflowState && (workflowState.stateVersion > 0 || workflowState.history.length > 0) && (
                <div className="mt-4 border rounded-lg" data-testid="panel-workflow-state">
                  <button
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
                    onClick={() => setWfStateOpen((v) => !v)}
                    data-testid="button-toggle-workflow-state"
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span>Workflow State</span>
                      {workflowState.stateVersion > 0 && (
                        <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-300">
                          v{workflowState.stateVersion}
                        </Badge>
                      )}
                      {workflowState.activeInterruptId && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                          gate open
                        </Badge>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${wfStateOpen ? "rotate-180" : ""}`} />
                  </button>
                  {wfStateOpen && (
                    <div className="border-t">
                      <Tabs defaultValue="current" className="w-full">
                        <TabsList className="w-full rounded-none border-b bg-transparent h-9 p-0">
                          <TabsTrigger value="current" className="rounded-none text-xs h-9 flex-1" data-testid="tab-wf-current">
                            Current
                          </TabsTrigger>
                          <TabsTrigger value="history" className="rounded-none text-xs h-9 flex-1" data-testid="tab-wf-history">
                            Timeline ({workflowState.history.length})
                          </TabsTrigger>
                          <TabsTrigger value="interrupts" className="rounded-none text-xs h-9 flex-1" data-testid="tab-wf-interrupts">
                            Interrupts ({workflowState.interrupts.length})
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="current" className="p-3 m-0">
                          {Object.keys(workflowState.currentState).length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">No workflow state yet</p>
                          ) : (
                            <ScrollArea className="max-h-48">
                              <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 rounded p-3" data-testid="text-wf-current-state">
                                {JSON.stringify(workflowState.currentState, null, 2)}
                              </pre>
                            </ScrollArea>
                          )}
                        </TabsContent>
                        <TabsContent value="history" className="m-0">
                          {workflowState.history.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">No checkpoints yet</p>
                          ) : (() => {
                            const histCheckpoints = workflowState.history;
                            const selectedCp = histCheckpoints.find((c) => c.id === selectedCpId) ?? null;
                            const selectedIdx = selectedCp ? histCheckpoints.indexOf(selectedCp) : -1;
                            const prevCp = selectedIdx > 0 ? histCheckpoints[selectedIdx - 1] : null;
                            const diff = showCpDiff && prevCp && selectedCp
                              ? computeStateDiff(prevCp.stateJson as Record<string, unknown>, selectedCp.stateJson as Record<string, unknown>)
                              : null;
                            const canRestore = activeRun?.status === "completed" || activeRun?.status === "failed";
                            return (
                              <div>
                                {/* ── Timeline Rail ── */}
                                <div className="border-b overflow-x-auto">
                                  <div className="flex items-center px-3 py-2 gap-0 min-w-max">
                                    {histCheckpoints.map((cp, idx) => {
                                      const ts = triggerTypeStyle(cp.trigger);
                                      const isSelected = cp.id === selectedCpId;
                                      return (
                                        <div key={cp.id} className="flex items-center">
                                          {idx > 0 && <div className="w-5 h-px bg-border flex-shrink-0" />}
                                          <button
                                            onClick={() => { setSelectedCpId(cp.id); setShowCpDiff(false); setCpFieldExpanded({}); }}
                                            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-colors max-w-[72px] ${isSelected ? "bg-muted" : "hover:bg-muted/50"}`}
                                            data-testid={`cp-node-${cp.id}`}
                                          >
                                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ts.dot} ${isSelected ? "ring-2 ring-offset-1 ring-primary" : ""}`} />
                                            <span className="text-[10px] font-mono text-muted-foreground">#{cp.checkpointNumber}</span>
                                            {cp.createdAt && (
                                              <span className="text-[9px] text-muted-foreground/70 leading-tight">
                                                {new Date(cp.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                              </span>
                                            )}
                                            {cp.triggerStageId && (
                                              <span className="text-[9px] text-muted-foreground/70 leading-tight max-w-[68px] truncate text-center">
                                                {stages.find((s) => s.id === cp.triggerStageId)?.label?.substring(0, 10) || cp.triggerStageId.substring(0, 6)}
                                              </span>
                                            )}
                                            {!cp.triggerStageId && cp.trigger === "interrupt" && (cp.interruptPayload as { gateName?: string; gateId?: string } | null)?.gateName && (
                                              <span className="text-[9px] text-amber-600/70 dark:text-amber-400/70 leading-tight max-w-[68px] truncate text-center">
                                                {(cp.interruptPayload as { gateName: string }).gateName.substring(0, 10)}
                                              </span>
                                            )}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div className="flex items-center px-4 pb-1.5 gap-3">
                                    {[
                                      { dot: "bg-green-500", label: "Stage" },
                                      { dot: "bg-amber-500", label: "Gate" },
                                      { dot: "bg-blue-500", label: "Resume" },
                                      { dot: "bg-gray-400", label: "Manual" },
                                    ].map((item) => (
                                      <div key={item.label} className="flex items-center gap-1">
                                        <div className={`w-2 h-2 rounded-full ${item.dot}`} />
                                        <span className="text-[10px] text-muted-foreground">{item.label}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* ── Detail pane ── */}
                                {selectedCp ? (
                                  <ScrollArea className="max-h-64">
                                    <div className="p-3 space-y-3">
                                      {/* Header */}
                                      <div className="flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${triggerTypeStyle(selectedCp.trigger).dot}`} />
                                          <span className="text-xs font-medium">#{selectedCp.checkpointNumber}</span>
                                          <Badge variant="outline" className="text-[10px] py-0">{triggerTypeStyle(selectedCp.trigger).label}</Badge>
                                          {selectedCp.triggerStageId && (
                                            <span className="text-[10px] text-muted-foreground">
                                              {stages.find((s) => s.id === selectedCp.triggerStageId)?.label || selectedCp.triggerStageId.substring(0, 8)}
                                            </span>
                                          )}
                                          {selectedCp.createdAt && (
                                            <span className="text-[10px] text-muted-foreground">{new Date(selectedCp.createdAt).toLocaleTimeString()}</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1 flex-wrap">
                                          {prevCp && (
                                            <Button
                                              variant="ghost" size="sm"
                                              className="h-6 text-[10px] px-2"
                                              onClick={() => setShowCpDiff((v) => !v)}
                                              data-testid={`button-diff-cp-${selectedCp.id}`}
                                            >
                                              <GitCompare className="w-3 h-3 mr-1" />
                                              {showCpDiff ? "Hide Diff" : "Diff with Previous"}
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost" size="sm"
                                            className="h-6 text-[10px] px-2"
                                            onClick={() => exportCheckpointJson(selectedCp.stateJson as Record<string, unknown>, selectedCp.checkpointNumber)}
                                            data-testid={`button-export-cp-${selectedCp.id}`}
                                          >
                                            <Download className="w-3 h-3 mr-1" />
                                            Export
                                          </Button>
                                          {canRestore && activeRun && (
                                            <Button
                                              variant="ghost" size="sm"
                                              className="h-6 text-[10px] px-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                              onClick={() => restoreCheckpointMutation.mutate({ runId: activeRun.id, num: selectedCp.checkpointNumber })}
                                              disabled={restoreCheckpointMutation.isPending}
                                              data-testid={`button-restore-cp-${selectedCp.id}`}
                                            >
                                              {restoreCheckpointMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                                              Restore
                                            </Button>
                                          )}
                                        </div>
                                      </div>

                                      {/* Diff view */}
                                      {diff && (
                                        <div className="rounded border bg-muted/20 p-2 space-y-1.5" data-testid={`panel-diff-${selectedCp.id}`}>
                                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Diff with #{prevCp!.checkpointNumber}</p>
                                          {diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 && (
                                            <p className="text-[10px] text-muted-foreground">No changes between checkpoints</p>
                                          )}
                                          {diff.added.map((k) => (
                                            <div key={k} className="flex items-center gap-1.5">
                                              <Badge className="text-[9px] py-0 px-1 bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">+ added</Badge>
                                              <span className="font-mono text-[10px]">{k}</span>
                                            </div>
                                          ))}
                                          {diff.changed.map((k) => (
                                            <div key={k} className="flex items-center gap-1.5">
                                              <Badge className="text-[9px] py-0 px-1 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">~ changed</Badge>
                                              <span className="font-mono text-[10px]">{k}</span>
                                            </div>
                                          ))}
                                          {diff.removed.map((k) => (
                                            <div key={k} className="flex items-center gap-1.5">
                                              <Badge className="text-[9px] py-0 px-1 bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700">- removed</Badge>
                                              <span className="font-mono text-[10px]">{k}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* Structured state display */}
                                      <div className="space-y-0.5" data-testid={`panel-state-${selectedCp.id}`}>
                                        {/* Schema-defined fields absent from this snapshot */}
                                        {schemaFields
                                          .filter((f) => !(f.name in (selectedCp.stateJson as Record<string, unknown>)))
                                          .map((f) => (
                                            <div key={f.name} className="flex items-center gap-2 px-1 py-0.5 rounded text-xs text-muted-foreground">
                                              <span className="font-mono text-[11px] min-w-[80px] truncate">{f.name}</span>
                                              <span className="italic text-[10px]">(not yet populated)</span>
                                            </div>
                                          ))}
                                        {/* State entries */}
                                        {Object.entries(selectedCp.stateJson as Record<string, unknown>).map(([key, val]) => {
                                          const isComplex = val !== null && typeof val === "object";
                                          const isExpanded = !!cpFieldExpanded[key];
                                          const diffHighlight = diff
                                            ? diff.added.includes(key)
                                              ? "bg-green-50 dark:bg-green-900/10"
                                              : diff.changed.includes(key)
                                              ? "bg-amber-50 dark:bg-amber-900/10"
                                              : ""
                                            : "";
                                          return (
                                            <div key={key} className={`rounded px-1 py-0.5 ${diffHighlight}`}>
                                              <div className="flex items-center gap-2 text-xs">
                                                <span className="font-mono text-[11px] text-muted-foreground min-w-[80px] truncate">{key}</span>
                                                {isComplex ? (
                                                  <>
                                                    <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                                                      {Array.isArray(val) ? `[${(val as unknown[]).length}]` : `{${Object.keys(val as object).length}}`}
                                                    </Badge>
                                                    <button
                                                      className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                                                      onClick={() => setCpFieldExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                                                      data-testid={`button-expand-field-${key}`}
                                                    >
                                                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                                      {isExpanded ? "collapse" : "expand"}
                                                    </button>
                                                  </>
                                                ) : (
                                                  <span
                                                    className="text-[11px] truncate max-w-[200px]"
                                                    title={String(val)}
                                                    data-testid={`text-field-${key}`}
                                                  >
                                                    {val === null ? "null" : val === "" ? '""' : String(val)}
                                                  </span>
                                                )}
                                              </div>
                                              {isComplex && isExpanded && (
                                                <pre className="mt-1 ml-4 text-[10px] font-mono whitespace-pre-wrap text-muted-foreground bg-muted/30 rounded p-1.5">
                                                  {JSON.stringify(val, null, 2)}
                                                </pre>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>

                                      {/* Footer: field count + hash */}
                                      <div className="flex items-center gap-2 pt-1 border-t">
                                        <span className="text-[10px] text-muted-foreground" data-testid={`text-field-count-${selectedCp.id}`}>
                                          Fields: {Object.keys(selectedCp.stateJson as Record<string, unknown>).length}
                                          {schemaFields.length > 0 ? `/${schemaFields.length}` : ""} populated
                                        </span>
                                        <Badge variant="outline" className="text-[9px] font-mono py-0 px-1">
                                          sha:{selectedCp.stateHash.substring(0, 12)}
                                        </Badge>
                                      </div>
                                    </div>
                                  </ScrollArea>
                                ) : (
                                  <div className="py-4 text-center">
                                    <p className="text-xs text-muted-foreground">Select a checkpoint on the timeline above</p>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </TabsContent>
                        <TabsContent value="interrupts" className="p-3 m-0">
                          {workflowState.interrupts.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">No interrupt gates recorded</p>
                          ) : (
                            <ScrollArea className="max-h-72">
                              <div className="space-y-2">
                                {workflowState.interrupts.map((intr) => (
                                  <InterruptRow key={intr.id} intr={intr} stages={stages} />
                                ))}
                              </div>
                            </ScrollArea>
                          )}
                        </TabsContent>
                      </Tabs>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-medium">Pipeline Runs</h3>
                <Button
                  variant="outline"
                  onClick={() => setRunDialogOpen(true)}
                  disabled={stages.length === 0}
                  data-testid="button-new-scenario"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New Scenario
                </Button>
              </div>

              {runsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : runs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Play className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No runs yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Start a new scenario to execute this pipeline</p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-300px)]">
                  <div className="space-y-2">
                    {runs.map((run) => (
                      <Card
                        key={run.id}
                        className="cursor-pointer hover-elevate"
                        onClick={() => setActiveRunId(run.id)}
                        data-testid={`card-run-${run.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                Run #{run.id.substring(0, 8)}
                              </p>
                              {run.scenarioInput && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                  {run.scenarioInput.substring(0, 100)}
                                </p>
                              )}
                            </div>
                            <Badge variant={getStatusVariant(run.status)} className={`text-[10px] ${getStatusColor(run.status)}`} data-testid={`badge-run-status-${run.id}`}>
                              {run.status}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                            <Progress value={getRunProgress(run)} className="flex-1 max-w-32" />
                            {run.createdAt && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                <span>{timeAgo(run.createdAt as any)}</span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={addStageOpen} onOpenChange={setAddStageOpen}>
        <DialogContent data-testid="dialog-add-stage">
          <DialogHeader>
            <DialogTitle>
              {newStageType === "agent" ? "Add Agent Stage" : newStageType === "composite" ? "Add Composite Stage" : "Add Approval Gate"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="stage-label">Label</Label>
              <Input
                id="stage-label"
                placeholder="Stage label"
                value={newStageLabel}
                onChange={(e) => setNewStageLabel(e.target.value)}
                data-testid="input-stage-label"
              />
            </div>
            {newStageType === "agent" && (
              <div className="space-y-2">
                <Label>Agent</Label>
                <Select
                  value={newStageAgentId || ""}
                  onValueChange={(v) => setNewStageAgentId(v || null)}
                >
                  <SelectTrigger data-testid="select-stage-agent">
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id} data-testid={`option-agent-${a.id}`}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {newStageType === "composite" && (
              <>
                <div className="space-y-2">
                  <Label>Team Agent</Label>
                  <Select
                    value={newStageTeamAgentId || ""}
                    onValueChange={(v) => setNewStageTeamAgentId(v || null)}
                  >
                    <SelectTrigger data-testid="select-stage-team-agent">
                      <SelectValue placeholder="Select a team agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamAgents.length === 0 ? (
                        <SelectItem value="_none" disabled>No team agents found</SelectItem>
                      ) : (
                        teamAgents.map((a) => (
                          <SelectItem key={a.id} value={a.id} data-testid={`option-team-agent-${a.id}`}>
                            {a.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Error Strategy</Label>
                  <Select
                    value={newStageErrorStrategy}
                    onValueChange={(v) => setNewStageErrorStrategy(v as "fail_fast" | "best_effort")}
                  >
                    <SelectTrigger data-testid="select-stage-error-strategy">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fail_fast">Fail Fast</SelectItem>
                      <SelectItem value="best_effort">Best Effort</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {addWavePlan && (
                  <div className="rounded-md border bg-muted/40 p-3 space-y-1.5" data-testid="wave-plan-preview">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Network className="w-3.5 h-3.5" />
                      Wave Plan Preview
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{addWavePlan.totalWaves} wave{addWavePlan.totalWaves !== 1 ? "s" : ""}</span>
                      <span>{addWavePlan.waves.reduce((acc, w) => acc + w.nodes.length, 0)} agents</span>
                      <span>max {addWavePlan.maxParallelism} parallel</span>
                    </div>
                    <div className="space-y-1 mt-1">
                      {addWavePlan.waves.map((wave) => (
                        <div key={wave.wave_number} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-12 shrink-0">Wave {wave.wave_number}</span>
                          <div className="flex flex-wrap gap-1">
                            {wave.nodes.map((nodeId) => (
                              <Badge key={nodeId} variant="outline" className="text-[10px] py-0">
                                {addWavePlan.nodeConfig?.[nodeId]?.label || nodeId.substring(0, 8)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStageOpen(false)} data-testid="button-cancel-add-stage">
              Cancel
            </Button>
            <Button
              onClick={confirmAddStage}
              disabled={!newStageLabel.trim() || updatePipelineMutation.isPending}
              data-testid="button-confirm-add-stage"
            >
              {updatePipelineMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Add Stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editStageId} onOpenChange={(open) => { if (!open) setEditStageId(null); }}>
        <DialogContent data-testid="dialog-edit-stage">
          <DialogHeader>
            <DialogTitle>Edit Stage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-stage-label">Label</Label>
              <Input
                id="edit-stage-label"
                value={editStageLabel}
                onChange={(e) => setEditStageLabel(e.target.value)}
                data-testid="input-edit-stage-label"
              />
            </div>
            {allStages.find((s) => s.id === editStageId)?.stageType === "agent" && (
              <div className="space-y-2">
                <Label>Agent</Label>
                <Select
                  value={editStageAgentId || ""}
                  onValueChange={(v) => setEditStageAgentId(v || null)}
                >
                  <SelectTrigger data-testid="select-edit-stage-agent">
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {allStages.find((s) => s.id === editStageId)?.stageType === "composite" && (
              <>
                <div className="space-y-2">
                  <Label>Team Agent</Label>
                  <Select
                    value={editStageTeamAgentId || ""}
                    onValueChange={(v) => setEditStageTeamAgentId(v || null)}
                  >
                    <SelectTrigger data-testid="select-edit-stage-team-agent">
                      <SelectValue placeholder="Select a team agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamAgents.length === 0 ? (
                        <SelectItem value="_none" disabled>No team agents found</SelectItem>
                      ) : (
                        teamAgents.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Error Strategy</Label>
                  <Select
                    value={editStageErrorStrategy}
                    onValueChange={(v) => setEditStageErrorStrategy(v as "fail_fast" | "best_effort")}
                  >
                    <SelectTrigger data-testid="select-edit-stage-error-strategy">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fail_fast">Fail Fast</SelectItem>
                      <SelectItem value="best_effort">Best Effort</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editWavePlan && (
                  <div className="rounded-md border bg-muted/40 p-3 space-y-1.5" data-testid="edit-wave-plan-preview">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Network className="w-3.5 h-3.5" />
                      Wave Plan Preview
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{editWavePlan.totalWaves} wave{editWavePlan.totalWaves !== 1 ? "s" : ""}</span>
                      <span>{editWavePlan.waves.reduce((acc, w) => acc + w.nodes.length, 0)} agents</span>
                      <span>max {editWavePlan.maxParallelism} parallel</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStageId(null)} data-testid="button-cancel-edit-stage">
              Cancel
            </Button>
            <Button
              onClick={confirmEditStage}
              disabled={!editStageLabel.trim() || updatePipelineMutation.isPending}
              data-testid="button-confirm-edit-stage"
            >
              {updatePipelineMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent data-testid="dialog-run-pipeline">
          <DialogHeader>
            <DialogTitle>Start Pipeline Run</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scenario-input">Scenario Input</Label>
              <Textarea
                id="scenario-input"
                placeholder="Describe the scenario for this pipeline run..."
                value={scenarioInput}
                onChange={(e) => setScenarioInput(e.target.value)}
                rows={4}
                data-testid="input-scenario"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunDialogOpen(false)} data-testid="button-cancel-run">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedPipelineId) {
                  startRunMutation.mutate({ pipelineId: selectedPipelineId, scenarioInput });
                }
              }}
              disabled={!scenarioInput.trim() || startRunMutation.isPending}
              data-testid="button-start-run"
            >
              {startRunMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              <Play className="w-4 h-4 mr-1" />
              Start Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addParallelGroupOpen} onOpenChange={setAddParallelGroupOpen}>
        <DialogContent data-testid="dialog-add-parallel-group">
          <DialogHeader>
            <DialogTitle>Add Parallel Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="parallel-group-label">Group Label</Label>
              <Input
                id="parallel-group-label"
                placeholder="Parallel Group"
                value={parallelGroupLabel}
                onChange={(e) => setParallelGroupLabel(e.target.value)}
                data-testid="input-parallel-group-label"
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Parallel Agents</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setParallelGroupAgents([...parallelGroupAgents, { label: `Agent ${parallelGroupAgents.length + 1}`, agentId: null }])}
                  data-testid="button-add-parallel-agent"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Agent
                </Button>
              </div>
              <div className="space-y-3">
                {parallelGroupAgents.map((agent, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Label</Label>
                      <Input
                        value={agent.label}
                        onChange={(e) => {
                          const updated = [...parallelGroupAgents];
                          updated[i] = { ...updated[i], label: e.target.value };
                          setParallelGroupAgents(updated);
                        }}
                        data-testid={`input-parallel-agent-label-${i}`}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Agent</Label>
                      <Select
                        value={agent.agentId || ""}
                        onValueChange={(v) => {
                          const updated = [...parallelGroupAgents];
                          updated[i] = { ...updated[i], agentId: v || null };
                          setParallelGroupAgents(updated);
                        }}
                      >
                        <SelectTrigger data-testid={`select-parallel-agent-${i}`}>
                          <SelectValue placeholder="Select agent" />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {parallelGroupAgents.length > 2 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setParallelGroupAgents(parallelGroupAgents.filter((_, j) => j !== i))}
                        data-testid={`button-remove-parallel-agent-${i}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddParallelGroupOpen(false)} data-testid="button-cancel-parallel-group">
              Cancel
            </Button>
            <Button
              onClick={confirmAddParallelGroup}
              disabled={parallelGroupAgents.length < 2 || !parallelGroupLabel.trim() || updatePipelineMutation.isPending}
              data-testid="button-confirm-parallel-group"
            >
              {updatePipelineMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              <Layers className="w-4 h-4 mr-1" />
              Add Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!addChildStageGroupId} onOpenChange={(open) => { if (!open) setAddChildStageGroupId(null); }}>
        <DialogContent data-testid="dialog-add-child-stage">
          <DialogHeader>
            <DialogTitle>Add Agent to Parallel Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="child-stage-label">Label</Label>
              <Input
                id="child-stage-label"
                placeholder="Agent Stage"
                value={childStageLabel}
                onChange={(e) => setChildStageLabel(e.target.value)}
                data-testid="input-child-stage-label"
              />
            </div>
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select
                value={childStageAgentId || ""}
                onValueChange={(v) => setChildStageAgentId(v || null)}
              >
                <SelectTrigger data-testid="select-child-stage-agent">
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddChildStageGroupId(null)} data-testid="button-cancel-child-stage">
              Cancel
            </Button>
            <Button
              onClick={confirmAddChildStage}
              disabled={!childStageLabel.trim() || updatePipelineMutation.isPending}
              data-testid="button-confirm-child-stage"
            >
              {updatePipelineMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Add Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fieldDialogOpen} onOpenChange={(open) => { if (!open) setFieldDialogOpen(false); }}>
        <DialogContent data-testid="dialog-field-editor">
          <DialogHeader>
            <DialogTitle>{editingFieldIndex !== null ? "Edit Field" : "Add Field"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="field-name">Field Name</Label>
              <Input
                id="field-name"
                placeholder="e.g. discovery_summary"
                value={fieldForm.name}
                onChange={(e) => setFieldForm((f) => ({ ...f, name: e.target.value }))}
                disabled={editingFieldIndex !== null}
                data-testid="input-field-name"
              />
              {editingFieldIndex !== null
                ? <p className="text-[11px] text-muted-foreground">Field name cannot be renamed. To rename, delete this field and add a new one.</p>
                : <p className="text-[11px] text-muted-foreground">Must be a valid identifier (letters, numbers, underscores; no spaces).</p>
              }
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={fieldForm.type} onValueChange={(v) => setFieldForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger data-testid="select-field-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">string</SelectItem>
                    <SelectItem value="number">number</SelectItem>
                    <SelectItem value="boolean">boolean</SelectItem>
                    <SelectItem value="array">array</SelectItem>
                    <SelectItem value="object">object</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reducer</Label>
                <Select value={fieldForm.reducer} onValueChange={(v) => setFieldForm((f) => ({ ...f, reducer: v }))}>
                  <SelectTrigger data-testid="select-field-reducer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last_wins">last_wins</SelectItem>
                    <SelectItem value="append">append</SelectItem>
                    <SelectItem value="max">max</SelectItem>
                    <SelectItem value="min">min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="field-writable-by">Writable By</Label>
              <Input
                id="field-writable-by"
                placeholder="* or stage-label, another-stage"
                value={fieldForm.writableBy}
                onChange={(e) => setFieldForm((f) => ({ ...f, writableBy: e.target.value }))}
                data-testid="input-field-writable-by"
              />
              <p className="text-[11px] text-muted-foreground">Use "*" for all stages, or comma-separated stage labels.</p>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm" data-testid="toggle-field-ephemeral">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={fieldForm.ephemeral}
                  onChange={(e) => setFieldForm((f) => ({ ...f, ephemeral: e.target.checked }))}
                />
                <span>Ephemeral</span>
                <span className="text-[11px] text-muted-foreground">(reset to default after each stage)</span>
              </label>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm" data-testid="toggle-field-sanitize">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={fieldForm.sanitize}
                  onChange={(e) => setFieldForm((f) => ({ ...f, sanitize: e.target.checked }))}
                />
                <span>Sanitize</span>
                <span className="text-[11px] text-muted-foreground">(strip from checkpoint snapshots)</span>
              </label>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm" data-testid="toggle-field-required">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={fieldForm.required}
                  onChange={(e) => setFieldForm((f) => ({ ...f, required: e.target.checked }))}
                />
                <span>Required</span>
                <span className="text-[11px] text-muted-foreground">(field must be present when schema is validated)</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldDialogOpen(false)} data-testid="button-cancel-field">
              Cancel
            </Button>
            <Button onClick={confirmFieldDialog} disabled={!fieldForm.name.trim()} data-testid="button-confirm-field">
              {editingFieldIndex !== null ? "Update Field" : "Add Field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
