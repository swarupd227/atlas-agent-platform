import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft,
  Terminal,
  Clock,
  Cpu,
  Wrench,
  GitBranch,
  Shield,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronDown,
  Brain,
  MessageSquare,
  Timer,
  Bot,
  Play,
  Square,
  Users,
  Network,
  Layers,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Table2,
  ChevronLeft,
  GitFork,
  Fingerprint,
  FileCheck,
  AlertTriangle,
  Database,
  BookOpen,
  Lock,
  Unlock,
  ExternalLink,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatMs } from "@/components/shared-utils";
import type { RunTrace } from "@shared/schema";

interface ToolCall {
  name?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  input?: Record<string, unknown>;
  result?: unknown;
  output?: unknown;
  latencyMs?: number;
  status?: string;
  server?: string;
}


interface Decision {
  step: string;
  reasoning: string;
  confidence: number;
  outcome: string;
}

interface PolicyCheck {
  policyName: string;
  passed: boolean;
  details: string;
  checkedAt: string;
}


interface PromptInputs {
  systemPrompt: string;
  userMessage: string;
  contextVariables: Record<string, unknown>;
}

interface PipelineStepData {
  name: string;
  status: string;
  output?: any;
  error?: string;
  workerSteps?: any[];
  startedAt?: string;
  completedAt?: string;
}

type TimelineStep =
  | { type: "prompt"; data: PromptInputs | null }
  | { type: "decision"; data: Decision; originalIndex: number }
  | { type: "toolcall"; data: ToolCall; originalIndex: number }
  | { type: "policycheck"; data: PolicyCheck; originalIndex: number }
  | { type: "output"; data: string | null }
  | { type: "orchestration"; data: PipelineStepData }
  | { type: "worker_execution"; data: PipelineStepData }
  | { type: "orchestration_summary"; data: PipelineStepData }
  | { type: "parallel_group"; data: PipelineStepData[] }
  | { type: "parallel_fork"; data: PipelineStepData }
  | { type: "parallel_join"; data: PipelineStepData };

const DECISION_COLORS: Record<string, string> = {
  approve: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  approved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  mql: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  sal: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  qualified: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  escalate: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  escalation: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  review: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "needs review": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  reject: "bg-red-500/15 text-red-600 dark:text-red-400",
  rejected: "bg-red-500/15 text-red-600 dark:text-red-400",
  fail: "bg-red-500/15 text-red-600 dark:text-red-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  disqualified: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function getScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function getSeverityStyle(severity: string): string {
  switch (severity?.toLowerCase()) {
    case "low": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "medium": return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20";
    case "high": return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function extractEmbeddedRecords(text: string): { textContent: string; records: any[] | null } {
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  const jsonBlocks: any[] = [];
  let cleaned = text;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    try {
      const blockParsed = JSON.parse(match[1].trim());
      jsonBlocks.push(blockParsed);
      cleaned = cleaned.replace(match[0], "");
    } catch {}
  }

  if (jsonBlocks.length === 0) {
    const inlineJsonRegex = /(\{[\s\S]*"processedRecords"\s*:\s*\[[\s\S]*\][\s\S]*\})/;
    const inlineMatch = text.match(inlineJsonRegex);
    if (inlineMatch) {
      try {
        const inlineParsed = JSON.parse(inlineMatch[1]);
        jsonBlocks.push(inlineParsed);
        cleaned = cleaned.replace(inlineMatch[0], "");
      } catch {}
    }
  }

  let records: any[] | null = null;
  let hasAnalysisFields = false;
  for (const block of jsonBlocks) {
    const recs = block.processedRecords || block.structuredOutput || (Array.isArray(block) ? block : null);
    if (Array.isArray(recs) && recs.length > 0) {
      records = recs;
    }
    if (block.summary || block.analysis || block.severity || block.findings || block.recommendedActions) {
      hasAnalysisFields = true;
    }
  }

  if (jsonBlocks.length > 0 && !records && !hasAnalysisFields) {
    cleaned = text;
  }

  return { textContent: cleaned.trim(), records };
}

function FormattedAnalysisOutput({ data, compact = false }: { data: any; compact?: boolean }) {
  let parsed: any = null;

  if (typeof data === "string") {
    const trimmed = data.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { parsed = JSON.parse(trimmed); } catch {}
    }
    if (!parsed) {
      const { textContent, records } = extractEmbeddedRecords(data);
      if (records && records.length > 0) {
        return (
          <div className="flex flex-col gap-3" data-testid="formatted-analysis-output">
            {textContent && (
              <div className="p-3 rounded-md bg-muted/40 text-xs leading-relaxed whitespace-pre-wrap" data-testid="output-text">
                {textContent}
              </div>
            )}
            <StructuredOutputTable records={records} />
          </div>
        );
      }
      return (
        <div className="p-3 rounded-md bg-muted/40 text-xs leading-relaxed whitespace-pre-wrap" data-testid="output-text">
          {data}
        </div>
      );
    }
  } else if (typeof data === "object" && data !== null) {
    parsed = data;
  } else {
    return <p className="text-xs text-muted-foreground">No output recorded</p>;
  }

  const rawAnalysis = parsed.summary || parsed.analysis;
  const severity = parsed.severity;
  const riskFactors = Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [];
  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const recommendedActions = Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [];
  let structuredRecords = parsed.structuredOutput || parsed.processedRecords;
  const citations = parsed.citations;

  let analysisText = rawAnalysis;
  let inlineRecords: any[] | null = null;
  if (typeof rawAnalysis === "string" && (rawAnalysis.includes("```") || rawAnalysis.includes('"processedRecords"'))) {
    const { textContent, records } = extractEmbeddedRecords(rawAnalysis);
    analysisText = textContent || rawAnalysis;
    if (records && records.length > 0) inlineRecords = records;
  }

  const allRecords = Array.isArray(structuredRecords) && structuredRecords.length > 0 ? structuredRecords : inlineRecords;

  const hasStructuredFields = severity || riskFactors.length > 0 || findings.length > 0 || recommendedActions.length > 0;

  if (!analysisText && !hasStructuredFields && !allRecords) {
    return (
      <div className="p-3 rounded-md bg-muted/40 text-xs leading-relaxed whitespace-pre-wrap" data-testid="output-text">
        {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`} data-testid="formatted-analysis-output">
      {analysisText && (
        <div className="flex flex-col gap-1.5">
          {!compact && <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Analysis Summary</span>}
          <div className="p-3 rounded-md bg-muted/40 text-xs leading-relaxed whitespace-pre-wrap" data-testid="output-analysis-summary">
            {typeof analysisText === "string" ? analysisText : JSON.stringify(analysisText, null, 2)}
          </div>
        </div>
      )}

      {(severity || riskFactors.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {severity && (
            <Badge variant="outline" className={`text-[10px] ${getSeverityStyle(severity)}`} data-testid="output-severity">
              <Shield className="w-3 h-3 mr-0.5" />
              Severity: {severity.charAt(0).toUpperCase() + severity.slice(1)}
            </Badge>
          )}
          {riskFactors.map((rf: string, i: number) => (
            <Badge key={i} variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" data-testid={`output-risk-factor-${i}`}>
              {rf}
            </Badge>
          ))}
        </div>
      )}

      {findings.length > 0 && !compact && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Key Findings</span>
          <ul className="flex flex-col gap-1 pl-1">
            {findings.map((f: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs" data-testid={`output-finding-${i}`}>
                <CheckCircle className="w-3 h-3 mt-0.5 text-cyan-500 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommendedActions.length > 0 && !compact && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Recommended Actions</span>
          <ul className="flex flex-col gap-1 pl-1">
            {recommendedActions.map((a: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs" data-testid={`output-action-${i}`}>
                <ChevronRight className="w-3 h-3 mt-0.5 text-emerald-500 shrink-0" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {citations && !compact && (
        <div className="p-2 rounded-md bg-muted/30 text-[11px] text-muted-foreground" data-testid="output-citations">
          <span className="font-medium">Citations: </span>{typeof citations === "string" ? citations : JSON.stringify(citations)}
        </div>
      )}

      {Array.isArray(allRecords) && allRecords.length > 0 && (
        <StructuredOutputTable records={allRecords} />
      )}
    </div>
  );
}

function StructuredOutputTable({ records }: { records: any[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const perPage = 25;

  if (!records || records.length === 0) return null;

  const columnSet = new Set<string>();
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      if (key !== "__meta") columnSet.add(key);
    }
  }
  const columns = Array.from(columnSet);

  const toDisplayString = (val: any): string => {
    if (val == null) return "";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  const decisionCols = new Set<string>();
  const scoreCols = new Set<string>();
  const boolCols = new Set<string>();

  for (const col of columns) {
    const sampleVals = records.slice(0, 10).map(r => r[col]);
    const colLower = col.toLowerCase();
    if (colLower.includes("decision") || colLower.includes("classification") || colLower.includes("status") || colLower.includes("action")) {
      decisionCols.add(col);
    }
    if (colLower.includes("score") || colLower.includes("rating")) {
      if (sampleVals.some(v => typeof v === "number")) scoreCols.add(col);
    }
    if (sampleVals.every(v => typeof v === "boolean")) boolCols.add(col);
  }

  let filtered = records;
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = records.filter(r =>
      columns.some(c => toDisplayString(r[c]).toLowerCase().includes(term))
    );
  }

  if (sortCol) {
    filtered = [...filtered].sort((a, b) => {
      const va = a[sortCol!];
      const vb = b[sortCol!];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }

  const totalPages = Math.ceil(filtered.length / perPage);
  const pageRecords = filtered.slice(page * perPage, (page + 1) * perPage);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
    setPage(0);
  };

  const exportCsv = () => {
    const header = columns.join(",");
    const rows = filtered.map(r => columns.map(c => {
      const str = toDisplayString(r[c]);
      return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "structured_output.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatColName = (col: string) => {
    return col.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()).trim();
  };

  const renderCell = (col: string, val: any) => {
    if (val == null) return <span className="text-muted-foreground">—</span>;
    if (boolCols.has(col)) {
      return val ? (
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Yes</span>
      ) : (
        <span className="text-muted-foreground">No</span>
      );
    }
    if (decisionCols.has(col)) {
      const key = String(val).toLowerCase();
      const colorClass = DECISION_COLORS[key] || "bg-muted text-muted-foreground";
      return <Badge className={`text-[10px] font-medium ${colorClass}`} data-testid={`badge-decision-${key}`}>{String(val)}</Badge>;
    }
    if (scoreCols.has(col) && typeof val === "number") {
      return <span className={`font-mono font-semibold ${getScoreColor(val)}`}>{val}</span>;
    }
    const str = toDisplayString(val);
    if (str.length > 80) return <span title={str}>{str.slice(0, 77)}...</span>;
    return <span>{str}</span>;
  };

  return (
    <div className="flex flex-col gap-2" data-testid="structured-output-table">
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <div className="flex items-center gap-2">
          <Table2 className="w-3.5 h-3.5 text-cyan-500" />
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Structured Output</span>
          <Badge variant="outline" className="text-[10px]" data-testid="badge-record-count">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              className="h-7 pl-7 text-xs w-48"
              placeholder="Filter records..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
              data-testid="input-structured-search"
            />
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={exportCsv} data-testid="button-export-csv">
            <Download className="w-3 h-3 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border/50">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/40 border-b border-border/50">
              {columns.map(col => (
                <th
                  key={col}
                  className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                  onClick={() => handleSort(col)}
                  data-testid={`header-${col}`}
                >
                  <div className="flex items-center gap-1">
                    {formatColName(col)}
                    {sortCol === col ? (
                      sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRecords.map((record, idx) => (
              <tr key={idx} className="border-b border-border/30 hover:bg-muted/20 transition-colors" data-testid={`row-record-${idx}`}>
                {columns.map(col => (
                  <td key={col} className="px-3 py-1.5 whitespace-nowrap max-w-[300px] overflow-hidden text-ellipsis">
                    {renderCell(col, record[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-muted-foreground">
            Showing {page * perPage + 1}–{Math.min((page + 1) * perPage, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} data-testid="button-prev-page">
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-[10px] text-muted-foreground px-2">Page {page + 1} of {totalPages}</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} data-testid="button-next-page">
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function buildTimelineSteps(
  promptInputs: PromptInputs | null,
  decisions: Decision[],
  toolCalls: ToolCall[],
  policyChecks: PolicyCheck[],
  outputSummary: string | null | undefined,
  stepsJson?: any[],
): TimelineStep[] {
  const steps: TimelineStep[] = [];

  const isTeamPipeline = stepsJson?.some(s => s.type === "orchestration" || s.type === "worker_execution" || s.type === "orchestration_summary");

  steps.push({ type: "prompt", data: promptInputs });

  if (isTeamPipeline && stepsJson) {
    const relevantSteps = stepsJson.filter(s =>
      s.type === "orchestration" || s.type === "worker_execution" ||
      s.type === "orchestration_summary" || s.type === "approval_gate" ||
      s.type === "parallel_fork" || s.type === "parallel_join"
    );

    let i = 0;
    while (i < relevantSteps.length) {
      const s = relevantSteps[i];
      if (s.type === "worker_execution") {
        const parallelGroup: PipelineStepData[] = [s];
        let j = i + 1;
        while (j < relevantSteps.length && relevantSteps[j].type === "worker_execution") {
          const current = relevantSteps[j];
          const prevInGroup = parallelGroup[parallelGroup.length - 1];
          const prevEnd = prevInGroup.completedAt ? new Date(prevInGroup.completedAt).getTime() : Infinity;
          const currStart = current.startedAt ? new Date(current.startedAt).getTime() : 0;
          if (currStart < prevEnd) {
            parallelGroup.push(current);
            j++;
          } else {
            break;
          }
        }
        if (parallelGroup.length > 1) {
          steps.push({ type: "parallel_group", data: parallelGroup });
        } else {
          steps.push({ type: "worker_execution", data: s });
        }
        i = j;
      } else if (s.type === "orchestration") {
        steps.push({ type: "orchestration", data: s });
        i++;
      } else if (s.type === "orchestration_summary") {
        steps.push({ type: "orchestration_summary", data: s });
        i++;
      } else if (s.type === "approval_gate") {
        steps.push({ type: "orchestration", data: { ...s, name: s.name || "Approval Gate" } });
        i++;
      } else if (s.type === "parallel_fork") {
        steps.push({ type: "parallel_fork", data: s });
        i++;
      } else if (s.type === "parallel_join") {
        steps.push({ type: "parallel_join", data: s });
        i++;
      } else {
        i++;
      }
    }
  } else {
    const maxInterleave = Math.max(decisions.length, toolCalls.length);
    for (let i = 0; i < maxInterleave; i++) {
      if (i < decisions.length) {
        steps.push({ type: "decision", data: decisions[i], originalIndex: i });
      }
      if (i < toolCalls.length) {
        steps.push({ type: "toolcall", data: toolCalls[i], originalIndex: i });
      }
    }

    policyChecks.forEach((pc, i) => {
      steps.push({ type: "policycheck", data: pc, originalIndex: i });
    });
  }

  steps.push({ type: "output", data: outputSummary || null });

  return steps;
}

function getStepDotColor(type: TimelineStep["type"]) {
  switch (type) {
    case "prompt":
    case "output":
      return "bg-emerald-500";
    case "decision":
      return "bg-purple-500";
    case "toolcall":
      return "bg-blue-500";
    case "policycheck":
      return "bg-amber-500";
    case "orchestration":
    case "orchestration_summary":
      return "bg-indigo-500";
    case "worker_execution":
      return "bg-cyan-500";
    case "parallel_group":
      return "bg-violet-500";
    case "parallel_fork":
    case "parallel_join":
      return "bg-violet-400";
  }
}

function getStepLineColor(type: TimelineStep["type"]) {
  switch (type) {
    case "prompt":
    case "output":
      return "border-emerald-500/30";
    case "decision":
      return "border-purple-500/30";
    case "toolcall":
      return "border-blue-500/30";
    case "policycheck":
      return "border-amber-500/30";
    case "orchestration":
    case "orchestration_summary":
      return "border-indigo-500/30";
    case "worker_execution":
      return "border-cyan-500/30";
    case "parallel_group":
      return "border-violet-500/30";
    case "parallel_fork":
    case "parallel_join":
      return "border-violet-400/30";
  }
}

function getStepTypeBadge(type: TimelineStep["type"]) {
  switch (type) {
    case "prompt":
      return (
        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
          <MessageSquare className="w-3 h-3 mr-0.5" />
          Prompt Input
        </Badge>
      );
    case "decision":
      return (
        <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
          <Brain className="w-3 h-3 mr-0.5" />
          Decision
        </Badge>
      );
    case "toolcall":
      return (
        <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
          <Wrench className="w-3 h-3 mr-0.5" />
          Tool Call
        </Badge>
      );
    case "policycheck":
      return (
        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
          <Shield className="w-3 h-3 mr-0.5" />
          Policy Check
        </Badge>
      );
    case "output":
      return (
        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
          <Square className="w-3 h-3 mr-0.5" />
          Output
        </Badge>
      );
    case "orchestration":
      return (
        <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20">
          <Network className="w-3 h-3 mr-0.5" />
          Pipeline
        </Badge>
      );
    case "worker_execution":
      return (
        <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20">
          <Bot className="w-3 h-3 mr-0.5" />
          Worker Agent
        </Badge>
      );
    case "orchestration_summary":
      return (
        <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20">
          <Layers className="w-3 h-3 mr-0.5" />
          Pipeline Summary
        </Badge>
      );
    case "parallel_group":
      return (
        <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20">
          <GitFork className="w-3 h-3 mr-0.5" />
          Parallel Execution
        </Badge>
      );
    case "parallel_fork":
      return (
        <Badge variant="outline" className="text-[10px] bg-violet-400/10 text-violet-600 dark:text-violet-400 border-violet-400/20">
          <GitFork className="w-3 h-3 mr-0.5" />
          Fork
        </Badge>
      );
    case "parallel_join":
      return (
        <Badge variant="outline" className="text-[10px] bg-violet-400/10 text-violet-600 dark:text-violet-400 border-violet-400/20">
          <GitFork className="w-3 h-3 mr-0.5 rotate-180" />
          Join
        </Badge>
      );
  }
}

function getStepTitle(step: TimelineStep): string {
  switch (step.type) {
    case "prompt":
      return "System prompt & user message configured";
    case "decision":
      return step.data.step;
    case "toolcall":
      return step.data.name || step.data.tool || "Tool Call";
    case "policycheck":
      return step.data.policyName;
    case "output":
      return "Final output generated";
    case "orchestration":
    case "worker_execution":
    case "orchestration_summary":
      return step.data.name;
    case "parallel_group":
      return `${step.data.length} agents running in parallel`;
    case "parallel_fork":
      return step.data.name || "Parallel Fork";
    case "parallel_join":
      return step.data.name || "Parallel Join";
  }
}

function getStepStatus(step: TimelineStep): "success" | "fail" | "neutral" {
  switch (step.type) {
    case "prompt":
      return step.data ? "success" : "neutral";
    case "decision":
      return "success";
    case "toolcall": {
      const s = step.data.status;
      if (!s || s === "success" || s === "completed") return "success";
      return "fail";
    }
    case "policycheck":
      return step.data.passed ? "success" : "fail";
    case "output":
      return step.data ? "success" : "neutral";
    case "orchestration":
    case "worker_execution":
    case "orchestration_summary":
      return step.data.status === "completed" ? "success" : step.data.status === "failed" ? "fail" : "neutral";
    case "parallel_group": {
      const allCompleted = step.data.every(d => d.status === "completed");
      const anyFailed = step.data.some(d => d.status === "failed");
      return anyFailed ? "fail" : allCompleted ? "success" : "neutral";
    }
    case "parallel_fork":
    case "parallel_join":
      return step.data.status === "completed" ? "success" : "neutral";
  }
}

function ParallelTimingBar({ workers }: { workers: PipelineStepData[] }) {
  const times = workers.map(w => ({
    name: w.name,
    start: w.startedAt ? new Date(w.startedAt).getTime() : 0,
    end: w.completedAt ? new Date(w.completedAt).getTime() : 0,
    status: w.status,
  })).filter(t => t.start > 0 && t.end > 0);

  if (times.length === 0) return null;

  const globalStart = Math.min(...times.map(t => t.start));
  const globalEnd = Math.max(...times.map(t => t.end));
  const totalDuration = globalEnd - globalStart;

  if (totalDuration <= 0) return null;

  return (
    <div className="flex flex-col gap-1.5 mt-2" data-testid="parallel-timing-chart">
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Concurrent Timing</span>
      <div className="flex flex-col gap-1">
        {times.map((t, idx) => {
          const leftPct = ((t.start - globalStart) / totalDuration) * 100;
          const widthPct = ((t.end - t.start) / totalDuration) * 100;
          const durationMs = t.end - t.start;
          return (
            <div key={idx} className="flex items-center gap-2" data-testid={`timing-bar-${idx}`}>
              <span className="text-[10px] text-muted-foreground w-24 truncate text-right shrink-0">{t.name}</span>
              <div className="flex-1 h-5 bg-muted/30 rounded-md relative overflow-hidden">
                <div
                  className={`absolute top-0 h-full rounded-md ${t.status === "failed" ? "bg-red-500/60" : "bg-cyan-500/60"}`}
                  style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 1)}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-foreground/70">
                  {(durationMs / 1000).toFixed(1)}s
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <span className="text-[10px] text-muted-foreground text-right">
        Total wall time: {(totalDuration / 1000).toFixed(1)}s
      </span>
    </div>
  );
}

function TimelineStepContent({ step }: { step: TimelineStep }) {
  switch (step.type) {
    case "prompt": {
      const pi = step.data;
      if (!pi) return <p className="text-xs text-muted-foreground">No prompt data recorded</p>;
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">System Prompt</span>
            <div className="p-3 rounded-md bg-muted/40 text-xs leading-relaxed font-mono whitespace-pre-wrap" data-testid="prompt-system">
              {pi.systemPrompt}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">User Message</span>
            <div className="p-3 rounded-md bg-muted/40 text-xs leading-relaxed" data-testid="prompt-user">
              {pi.userMessage}
            </div>
          </div>
          {pi.contextVariables && Object.keys(pi.contextVariables).length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Context Variables</span>
              <div className="flex flex-col gap-1">
                {Object.entries(pi.contextVariables).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30">
                    <span className="text-[11px] font-mono text-muted-foreground">{key}</span>
                    <span className="text-xs font-medium truncate max-w-[60%] text-right">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    case "decision": {
      const dec = step.data;
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Confidence</span>
            <div className="w-16">
              <Progress value={dec.confidence * 100} className="h-1.5" />
            </div>
            <span className="text-[10px] font-medium">{(dec.confidence * 100).toFixed(0)}%</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{dec.reasoning}</p>
          <div className="flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-medium">{dec.outcome}</span>
          </div>
        </div>
      );
    }
    case "toolcall": {
      const tc = step.data;
      const args = tc.arguments || tc.input;
      const res = tc.result || tc.output;
      return (
        <div className="flex flex-col gap-2">
          {tc.server && (
            <span className="text-[10px] text-muted-foreground">Server: {tc.server}</span>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Arguments</span>
              <div className="p-2 rounded bg-background/50 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(args, null, 2)}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Result</span>
              <div className="p-2 rounded bg-background/50 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {typeof res === "string" ? res : JSON.stringify(res, null, 2)}
              </div>
            </div>
          </div>
        </div>
      );
    }
    case "policycheck": {
      const pc = step.data;
      return (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-muted-foreground leading-relaxed">{pc.details}</p>
          {pc.checkedAt && (
            <span className="text-[10px] text-muted-foreground">Checked at: {formatDate(pc.checkedAt)}</span>
          )}
        </div>
      );
    }
    case "output": {
      return step.data ? (
        <FormattedAnalysisOutput data={step.data} />
      ) : (
        <p className="text-xs text-muted-foreground">No output recorded</p>
      );
    }
    case "orchestration": {
      const d = step.data;
      return (
        <div className="flex flex-col gap-2">
          {d.output?.pattern && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Pattern:</span>
              <Badge variant="outline" className="text-[10px]">{d.output.pattern}</Badge>
              <span className="text-[11px] text-muted-foreground">Workers:</span>
              <Badge variant="outline" className="text-[10px]">{d.output.workerCount}</Badge>
              {d.output.errorHandling && (
                <>
                  <span className="text-[11px] text-muted-foreground">Error Handling:</span>
                  <Badge variant="outline" className="text-[10px]">{d.output.errorHandling}</Badge>
                </>
              )}
            </div>
          )}
          {d.output?.gateType && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                <Shield className="w-3 h-3 mr-0.5" />
                {d.output.autoApproved ? "Auto-approved" : "Manual Approval"}
              </Badge>
              {d.output.reason && <span className="text-[11px] text-muted-foreground">{d.output.reason}</span>}
            </div>
          )}
        </div>
      );
    }
    case "worker_execution": {
      const d = step.data;
      const workerSteps = d.workerSteps || [];
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Steps:</span>
              <Badge variant="outline" className="text-[10px]">{d.output?.passedSteps || 0}/{d.output?.stepsCount || 0}</Badge>
            </div>
            {d.output?.latencyMs != null && (
              <div className="flex items-center gap-1.5">
                <Timer className="w-3 h-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">{(d.output.latencyMs / 1000).toFixed(1)}s</span>
              </div>
            )}
            {d.output?.toolsUsed?.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Wrench className="w-3 h-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">{d.output.toolsUsed.map((t: any) => `${t.server}/${t.tool}`).join(", ")}</span>
              </div>
            )}
          </div>
          {d.output?.analysis && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">AI Analysis</span>
              <FormattedAnalysisOutput data={d.output.analysis} />
            </div>
          )}
          {workerSteps.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Execution Steps</span>
              <div className="flex flex-col gap-1 pl-3 border-l-2 border-cyan-500/20">
                {workerSteps.map((ws: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 py-1">
                    <div className={`w-2 h-2 rounded-full ${ws.status === "completed" ? "bg-emerald-500" : ws.status === "failed" ? "bg-red-500" : "bg-muted-foreground"}`} />
                    <span className="text-[11px] font-medium">{ws.name}</span>
                    <Badge variant="outline" className="text-[9px]">{ws.type}</Badge>
                    {ws.mcpTool && <span className="text-[10px] text-muted-foreground">{ws.mcpServer}/{ws.mcpTool}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {d.error && (
            <div className="p-2 rounded-md bg-red-500/10 text-xs text-red-600 dark:text-red-400">{d.error}</div>
          )}
        </div>
      );
    }
    case "orchestration_summary": {
      const d = step.data;
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Workers Executed:</span>
              <span className="text-xs font-medium">{d.output?.workersExecuted || 0}</span>
            </div>
            <Badge variant={d.output?.allSuccess ? "default" : "destructive"} className="text-[10px]">
              {d.output?.allSuccess ? "All Passed" : "Has Failures"}
            </Badge>
          </div>
          {d.output?.finalOutput && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Final Pipeline Output</span>
              <FormattedAnalysisOutput data={d.output.finalOutput} />
            </div>
          )}
        </div>
      );
    }
    case "parallel_group": {
      const workers = step.data;
      return (
        <div className="flex flex-col gap-4" data-testid="parallel-group-content">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {workers.map((w, idx) => {
              const workerSteps = w.workerSteps || [];
              const wStatus = w.status === "completed" ? "success" : w.status === "failed" ? "fail" : "neutral";
              const durationMs = w.startedAt && w.completedAt
                ? new Date(w.completedAt).getTime() - new Date(w.startedAt).getTime()
                : w.output?.latencyMs;
              return (
                <Card key={idx} data-testid={`parallel-worker-card-${idx}`}>
                  <CardContent className="p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5 text-cyan-500" />
                        <span className="text-xs font-medium">{w.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20">
                          <GitFork className="w-3 h-3 mr-0.5" />
                          Parallel
                        </Badge>
                        {wStatus === "success" && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                            <CheckCircle className="w-3 h-3 mr-0.5" />
                            Success
                          </Badge>
                        )}
                        {wStatus === "fail" && (
                          <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                            <XCircle className="w-3 h-3 mr-0.5" />
                            Failed
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">Steps:</span>
                        <Badge variant="outline" className="text-[10px]">{w.output?.passedSteps || 0}/{w.output?.stepsCount || 0}</Badge>
                      </div>
                      {durationMs != null && (
                        <div className="flex items-center gap-1.5">
                          <Timer className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">{(durationMs / 1000).toFixed(1)}s</span>
                        </div>
                      )}
                      {w.output?.toolsUsed?.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Wrench className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{w.output.toolsUsed.map((t: any) => `${t.server}/${t.tool}`).join(", ")}</span>
                        </div>
                      )}
                    </div>
                    {w.output?.analysis && (
                      <div className="max-h-[200px] overflow-y-auto">
                        <FormattedAnalysisOutput data={w.output.analysis} compact />
                      </div>
                    )}
                    {workerSteps.length > 0 && (
                      <div className="flex flex-col gap-1 pl-2 border-l-2 border-cyan-500/20">
                        {workerSteps.map((ws: any, wsIdx: number) => (
                          <div key={wsIdx} className="flex items-center gap-2 py-0.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${ws.status === "completed" ? "bg-emerald-500" : ws.status === "failed" ? "bg-red-500" : "bg-muted-foreground"}`} />
                            <span className="text-[10px] font-medium">{ws.name}</span>
                            <Badge variant="outline" className="text-[9px]">{ws.type}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                    {w.error && (
                      <div className="p-2 rounded-md bg-red-500/10 text-[11px] text-red-600 dark:text-red-400">{w.error}</div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <ParallelTimingBar workers={workers} />
        </div>
      );
    }
    case "parallel_fork":
    case "parallel_join": {
      const forkData = step.data;
      const agents = forkData.output?.agents || forkData.output?.mergedAgents || [];
      const isFork = step.type === "parallel_fork";
      return (
        <div className="flex items-center gap-2 flex-wrap" data-testid={`${step.type}-content`}>
          <GitFork className={`w-4 h-4 text-violet-500 ${isFork ? "" : "rotate-180"}`} />
          <span className="text-xs text-muted-foreground">
            {isFork ? "Forking execution to" : "Joining results from"}{" "}
            <span className="font-medium text-foreground">{Array.isArray(agents) ? agents.join(", ") : `${forkData.output?.agentCount || "multiple"} agents`}</span>
          </span>
        </div>
      );
    }
  }
}

function ProvenanceExplorer({ traceId }: { traceId: string }) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const { data: provenance, isLoading: provLoading } = useQuery<any>({
    queryKey: ["/api/provenance", traceId],
    enabled: !!traceId,
  });

  const { data: diff, isLoading: diffLoading } = useQuery<any>({
    queryKey: ["/api/provenance", traceId, "diff"],
    enabled: !!traceId,
  });

  const { data: reconstruction } = useQuery<any>({
    queryKey: ["/api/provenance", traceId, "reconstruct"],
    enabled: !!traceId && expandedSections.has("reconstruction"),
  });

  if (provLoading) {
    return (
      <Card data-testid="provenance-loading">
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Fingerprint className="w-4 h-4" /> Provenance</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32" /></CardContent>
      </Card>
    );
  }

  if (!provenance) return null;

  const snapshot = provenance.provenanceSnapshot || {};
  const integrity = provenance.integrity || { valid: false, checks: {} };
  const kbRetrievals = snapshot.kbRetrievals || [];
  const policySnap = snapshot.policySnapshot || [];
  const mcpFingerprints = snapshot.mcpToolFingerprints || {};
  const mcpServers = snapshot.mcpServerVersions || {};
  const memoryIds = snapshot.memoryIdsLoaded || [];
  const driftDetected = diff?.driftDetected || false;
  const diffs = diff?.diffs || [];

  return (
    <Card data-testid="provenance-explorer">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Fingerprint className="w-4 h-4" />
            Provenance Graph
          </CardTitle>
          <div className="flex items-center gap-2">
            {integrity.valid ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20" data-testid="badge-provenance-valid">
                <CheckCircle className="w-3 h-3 mr-1" /> Verified
              </Badge>
            ) : provenance.provenanceHash ? (
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20" data-testid="badge-provenance-warning">
                <AlertTriangle className="w-3 h-3 mr-1" /> Unverified
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground" data-testid="badge-provenance-none">
                <Info className="w-3 h-3 mr-1" /> No Provenance
              </Badge>
            )}
            {driftDetected && (
              <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20" data-testid="badge-drift-detected">
                <AlertTriangle className="w-3 h-3 mr-1" /> Drift Detected
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {provenance.provenanceHash && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="provenance-summary-cards">
            <div className="rounded-lg border p-3 bg-muted/30">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">KB Sources</div>
              <div className="text-lg font-semibold" data-testid="text-kb-count">{kbRetrievals.length}</div>
              <div className="text-[10px] text-muted-foreground">
                {kbRetrievals.reduce((s: number, k: any) => s + (k.chunks?.length || 0), 0)} chunks retrieved
              </div>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">MCP Tools</div>
              <div className="text-lg font-semibold" data-testid="text-tool-count">{Object.keys(mcpFingerprints).length}</div>
              <div className="text-[10px] text-muted-foreground">{Object.keys(mcpServers).length} server(s)</div>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Policies</div>
              <div className="text-lg font-semibold" data-testid="text-policy-count">{policySnap.length}</div>
              <div className="text-[10px] text-muted-foreground">active at execution</div>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Memories</div>
              <div className="text-lg font-semibold" data-testid="text-memory-count">{memoryIds.length}</div>
              <div className="text-[10px] text-muted-foreground">episodic loaded</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="provenance-integrity-section">
          <div className="rounded-lg border p-3">
            <div className="text-xs font-medium mb-2 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Integrity Checks
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Snapshot Hash</span>
                {integrity.checks?.snapshotHashMatch ? (
                  <Badge className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20" data-testid="check-hash-match">Match</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px]" data-testid="check-hash-mismatch">
                    {provenance.provenanceHash ? "Mismatch" : "N/A"}
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Audit Event Linked</span>
                {integrity.checks?.auditEventFound ? (
                  <Badge className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20" data-testid="check-audit-found">Found</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px]" data-testid="check-audit-missing">
                    {provenance.auditEventId ? "Missing" : "N/A"}
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Audit Chain Valid</span>
                {integrity.checks?.auditChainValid ? (
                  <Badge className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20" data-testid="check-chain-valid">Valid</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px]" data-testid="check-chain-invalid">
                    {provenance.auditEventId ? "Invalid" : "N/A"}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="text-xs font-medium mb-2 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Environment Snapshot
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Industry</span>
                <Badge variant="outline" className="text-[9px]" data-testid="text-industry">{snapshot.industryContext || "general"}</Badge>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Autonomy Level</span>
                <Badge variant="outline" className="text-[9px]" data-testid="text-autonomy-level">{snapshot.autonomyLevel || "unknown"}</Badge>
              </div>
              {snapshot.contextProfileId && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Context Profile</span>
                  <span className="text-[10px] font-mono text-foreground" data-testid="text-context-profile">v{snapshot.contextProfileVersion || 1}</span>
                </div>
              )}
              {snapshot.blueprintId && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Blueprint</span>
                  <span className="text-[10px] font-mono text-foreground" data-testid="text-blueprint-hash">{snapshot.blueprintVersionHash?.substring(0, 12)}...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {kbRetrievals.length > 0 && (
          <div className="rounded-lg border p-3" data-testid="provenance-kb-section">
            <button
              className="w-full flex items-center justify-between text-xs font-medium"
              onClick={() => toggleSection("kb")}
              data-testid="button-toggle-kb"
            >
              <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> Knowledge Base Retrievals ({kbRetrievals.length})</span>
              {expandedSections.has("kb") ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {expandedSections.has("kb") && (
              <div className="mt-3 flex flex-col gap-2">
                {kbRetrievals.map((kbr: any, idx: number) => (
                  <div key={idx} className="rounded border p-2 bg-muted/20" data-testid={`kb-retrieval-${idx}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium">{kbr.kbName || kbr.kbId}</span>
                      <Badge variant="outline" className="text-[9px]">{kbr.embeddingModel}</Badge>
                    </div>
                    <div className="flex flex-col gap-1">
                      {(kbr.chunks || []).map((chunk: any, ci: number) => (
                        <div key={ci} className="flex items-center gap-2 text-[10px]" data-testid={`kb-chunk-${idx}-${ci}`}>
                          <span className="font-mono text-muted-foreground w-16 shrink-0">{chunk.chunkId?.substring(0, 8)}...</span>
                          <Progress value={chunk.similarityScore * 100} className="h-1.5 flex-1" />
                          <span className="text-muted-foreground w-10 text-right">{(chunk.similarityScore * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {Object.keys(mcpFingerprints).length > 0 && (
          <div className="rounded-lg border p-3" data-testid="provenance-tools-section">
            <button
              className="w-full flex items-center justify-between text-xs font-medium"
              onClick={() => toggleSection("tools")}
              data-testid="button-toggle-tools"
            >
              <span className="flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5" /> MCP Tools ({Object.keys(mcpFingerprints).length})</span>
              {expandedSections.has("tools") ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {expandedSections.has("tools") && (
              <div className="mt-3 flex flex-col gap-1">
                {Object.entries(mcpFingerprints).map(([toolName, fp]) => {
                  const toolDiff = diffs.find((d: any) => d.component === `mcpTool:${toolName}`);
                  return (
                    <div key={toolName} className="flex items-center justify-between py-1 text-[11px] border-b last:border-0" data-testid={`tool-fingerprint-${toolName}`}>
                      <span className="font-medium">{toolName}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[9px] text-muted-foreground">{(fp as string)?.substring(0, 12) || "—"}...</span>
                        {toolDiff?.changed ? (
                          <Badge className="text-[8px] bg-orange-500/10 text-orange-600 border-orange-500/20">Drifted</Badge>
                        ) : toolDiff ? (
                          <Badge className="text-[8px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Stable</Badge>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {policySnap.length > 0 && (
          <div className="rounded-lg border p-3" data-testid="provenance-policies-section">
            <button
              className="w-full flex items-center justify-between text-xs font-medium"
              onClick={() => toggleSection("policies")}
              data-testid="button-toggle-policies"
            >
              <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Policies ({policySnap.length})</span>
              {expandedSections.has("policies") ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {expandedSections.has("policies") && (
              <div className="mt-3 flex flex-col gap-1">
                {policySnap.map((p: any, idx: number) => {
                  const policyDiff = diffs.find((d: any) => d.component === `policy:${p.policyName}`);
                  return (
                    <div key={idx} className="flex items-center justify-between py-1 text-[11px] border-b last:border-0" data-testid={`policy-snapshot-${idx}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{p.policyName}</span>
                        <Badge variant="outline" className="text-[8px]">{p.domain}</Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge className={`text-[8px] ${p.status === "active" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-muted text-muted-foreground"}`}>
                          {p.status}
                        </Badge>
                        {policyDiff?.changed && (
                          <Badge className="text-[8px] bg-orange-500/10 text-orange-600 border-orange-500/20">Changed</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {memoryIds.length > 0 && (
          <div className="rounded-lg border p-3" data-testid="provenance-memories-section">
            <button
              className="w-full flex items-center justify-between text-xs font-medium"
              onClick={() => toggleSection("memories")}
              data-testid="button-toggle-memories"
            >
              <span className="flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> Loaded Memories ({memoryIds.length})</span>
              {expandedSections.has("memories") ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {expandedSections.has("memories") && (
              <div className="mt-3 flex flex-col gap-1">
                {memoryIds.map((mid: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 py-1 text-[11px] border-b last:border-0" data-testid={`memory-id-${idx}`}>
                    <Database className="w-3 h-3 text-muted-foreground" />
                    <span className="font-mono text-muted-foreground">{mid.substring(0, 16)}...</span>
                  </div>
                ))}
                {snapshot.memorySummaryHash && (
                  <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1" data-testid="text-memory-hash">
                    <Lock className="w-3 h-3" /> Content hash: {snapshot.memorySummaryHash.substring(0, 16)}...
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border p-3" data-testid="provenance-reconstruction-section">
          <button
            className="w-full flex items-center justify-between text-xs font-medium"
            onClick={() => toggleSection("reconstruction")}
            data-testid="button-toggle-reconstruction"
          >
            <span className="flex items-center gap-1.5"><FileCheck className="w-3.5 h-3.5" /> Full Reconstruction</span>
            {expandedSections.has("reconstruction") ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {expandedSections.has("reconstruction") && reconstruction && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[11px]">
                <Badge variant={reconstruction.completeness === "full" ? "default" : "outline"} className="text-[9px]" data-testid="badge-reconstruction-completeness">
                  {reconstruction.completeness === "full" ? "Full Reconstruction Available" : "Partial Reconstruction"}
                </Badge>
                {reconstruction.unavailable?.length > 0 && (
                  <span className="text-muted-foreground">{reconstruction.unavailable.length} component(s) unavailable</span>
                )}
              </div>
              {reconstruction.available?.blueprint && (
                <div className="rounded border p-2 bg-muted/20" data-testid="reconstruction-blueprint">
                  <div className="text-[10px] font-medium mb-1">Blueprint: {reconstruction.available.blueprint.name}</div>
                  <pre className="text-[9px] text-muted-foreground max-h-32 overflow-auto">
                    {JSON.stringify(reconstruction.available.blueprint.workflowJson, null, 2)?.substring(0, 500)}
                  </pre>
                </div>
              )}
              {reconstruction.available?.knowledgeBases?.length > 0 && (
                <div className="rounded border p-2 bg-muted/20" data-testid="reconstruction-kb">
                  <div className="text-[10px] font-medium mb-1">Retrieved Knowledge ({reconstruction.available.knowledgeBases.length} KB)</div>
                  {reconstruction.available.knowledgeBases.map((kb: any, i: number) => (
                    <div key={i} className="mb-1">
                      <div className="text-[10px] text-muted-foreground">{kb.kbName} - {kb.chunks?.filter((c: any) => c.stillAvailable).length}/{kb.chunks?.length} chunks available</div>
                    </div>
                  ))}
                </div>
              )}
              {reconstruction.available?.policies?.length > 0 && (
                <div className="rounded border p-2 bg-muted/20" data-testid="reconstruction-policies">
                  <div className="text-[10px] font-medium mb-1">Policies ({reconstruction.available.policies.length})</div>
                  {reconstruction.available.policies.map((p: any, i: number) => (
                    <div key={i} className="text-[10px] text-muted-foreground">
                      {p.policyName} ({p.status}) {p.currentStatus !== p.status ? `→ now ${p.currentStatus}` : ""}
                    </div>
                  ))}
                </div>
              )}
              {reconstruction.available?.memories?.length > 0 && (
                <div className="rounded border p-2 bg-muted/20" data-testid="reconstruction-memories">
                  <div className="text-[10px] font-medium mb-1">Memories ({reconstruction.available.memories.length})</div>
                  {reconstruction.available.memories.map((m: any, i: number) => (
                    <div key={i} className="text-[10px] text-muted-foreground">
                      {m.memoryId?.substring(0, 12)}... - {m.stillAvailable ? "Available" : "Expired/Deleted"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {expandedSections.has("reconstruction") && !reconstruction && (
            <div className="mt-3"><Skeleton className="h-20" /></div>
          )}
        </div>

        {diffs.length > 0 && (
          <div className="rounded-lg border p-3" data-testid="provenance-drift-section">
            <button
              className="w-full flex items-center justify-between text-xs font-medium"
              onClick={() => toggleSection("drift")}
              data-testid="button-toggle-drift"
            >
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                State Drift ({diff?.changedComponents || 0} of {diffs.length} changed)
              </span>
              {expandedSections.has("drift") ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {expandedSections.has("drift") && (
              <div className="mt-3 flex flex-col gap-1">
                {diffs.map((d: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-1 text-[11px] border-b last:border-0" data-testid={`drift-item-${idx}`}>
                    <span className="font-medium">{d.component}</span>
                    <div className="flex items-center gap-1.5">
                      {d.changed ? (
                        <Badge className="text-[8px] bg-orange-500/10 text-orange-600 border-orange-500/20">{d.changeDetails || "Changed"}</Badge>
                      ) : (
                        <Badge className="text-[8px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Unchanged</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {provenance.auditEventId && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground" data-testid="provenance-audit-link">
            <ExternalLink className="w-3 h-3" />
            <span>Audit Event:</span>
            <Link href="/governance" className="text-primary hover:underline font-mono" data-testid="link-audit-event">
              {provenance.auditEventId.substring(0, 12)}...
            </Link>
          </div>
        )}

        {provenance.provenanceHash && (
          <div className="text-[10px] text-muted-foreground font-mono bg-muted/30 rounded px-2 py-1 break-all" data-testid="text-provenance-hash">
            SHA-256: {provenance.provenanceHash}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TraceDetail() {
  const [, params] = useRoute("/traces/:id");
  const traceId = params?.id;
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const { data: trace, isLoading } = useQuery<RunTrace>({
    queryKey: ["/api/traces", traceId],
    enabled: !!traceId,
  });

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col gap-4" data-testid="page-trace-detail-loading">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="p-6 flex flex-col items-center gap-4 py-20">
        <Terminal className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">Trace not found</p>
        <Link href="/agents">
          <Button variant="outline" data-testid="button-back-agents">Back to Agents</Button>
        </Link>
      </div>
    );
  }

  const promptInputs = trace.promptInputs as PromptInputs | null;
  const rawToolCalls = (trace.toolCalls as ToolCall[] | null) || [];
  const stepsJson = (trace.stepsJson as Array<{ type?: string; output?: unknown; mcpTool?: string; mcpServer?: string; input?: Record<string, unknown>; startedAt?: string; completedAt?: string; name?: string; status?: string; workerSteps?: any[] }> | null) || [];
  const apiSteps = stepsJson.filter(s => s.type === "api_call");
  const toolCalls = rawToolCalls.map((tc, i) => {
    if (tc.output || tc.result) return tc;
    const matchStep = apiSteps[i];
    if (matchStep?.output) {
      return { ...tc, output: matchStep.output };
    }
    return tc;
  });
  const decisions = (trace.decisions as Decision[] | null) || [];
  const policyChecks = (trace.policyChecks as PolicyCheck[] | null) || [];

  const mcpCallSteps = stepsJson.filter(s => s.type === "api_call" && s.mcpTool);
  const mcpCallCount = mcpCallSteps.length;
  const isTeamPipeline = stepsJson.some(s => s.type === "orchestration" || s.type === "worker_execution");
  const workerSteps = stepsJson.filter(s => s.type === "worker_execution");

  const computedDuration = (() => {
    if (trace.latencyMs && trace.latencyMs > 0) return trace.latencyMs;
    if (stepsJson.length > 0) {
      const first = stepsJson[0];
      const last = stepsJson[stepsJson.length - 1];
      if (first?.startedAt && last?.completedAt) {
        return new Date(last.completedAt).getTime() - new Date(first.startedAt).getTime();
      }
    }
    if (trace.startedAt && trace.endedAt) {
      return new Date(trace.endedAt).getTime() - new Date(trace.startedAt).getTime();
    }
    return 0;
  })();

  const completedSteps = stepsJson.filter(s => s.status === "completed").length;
  const totalSteps = stepsJson.length;

  const mcpServers = Array.from(new Set(mcpCallSteps.map(s => s.mcpServer).filter(Boolean))) as string[];

  const timelineSteps = buildTimelineSteps(promptInputs, decisions, toolCalls, policyChecks, trace.outputSummary, stepsJson);

  return (
    <div className="p-6 flex flex-col gap-6 max-w-7xl mx-auto overflow-y-auto h-full" data-testid="page-trace-detail">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href={`/agents/${trace.agentId}`}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <Terminal className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold" data-testid="text-trace-title">
              {trace.inputSummary || "Run Trace"}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono" data-testid="text-trace-id">{trace.id.substring(0, 8)}...</span>
              {trace.modelId && (
                <Badge variant="outline" className="text-[10px]" data-testid="badge-model">
                  <Cpu className="w-3 h-3 mr-0.5" />
                  {trace.modelId}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]" data-testid="badge-env">{trace.environment}</Badge>
              <StatusBadge status={trace.status} />
              {trace.costUsd != null && trace.costUsd > 0 && (
                <Badge variant="outline" className="text-[10px]" data-testid="badge-cost">
                  ${trace.costUsd.toFixed(4)}
                </Badge>
              )}
              {(trace.tokenUsage as any)?.totalTokens > 0 && (
                <Badge variant="outline" className="text-[10px]" data-testid="badge-tokens">
                  {((trace.tokenUsage as any).totalTokens as number).toLocaleString()} tokens
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[11px]">Duration</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-duration">{computedDuration > 0 ? formatMs(computedDuration) : "\u2014"}</span>
            {trace.startedAt && (
              <span className="text-[10px] text-muted-foreground">{formatDate(trace.startedAt)}</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Wrench className="w-3.5 h-3.5" />
              <span className="text-[11px]">MCP Tool Calls</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-tool-calls">{mcpCallCount}</span>
            {mcpServers.length > 0 && (
              <span className="text-[10px] text-muted-foreground truncate">{mcpServers.join(", ")}</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Play className="w-3.5 h-3.5" />
              <span className="text-[11px]">Execution Steps</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-steps">
              {totalSteps > 0 ? `${completedSteps}/${totalSteps}` : "\u2014"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {totalSteps === 0 ? "No steps recorded" : completedSteps === totalSteps ? "All passed" : `${totalSteps - completedSteps} pending/failed`}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {isTeamPipeline ? <Users className="w-3.5 h-3.5" /> : <Brain className="w-3.5 h-3.5" />}
              <span className="text-[11px]">{isTeamPipeline ? "Pipeline" : "Execution Type"}</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-type">
              {isTeamPipeline ? `${workerSteps.length} Workers` : "Single Agent"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {isTeamPipeline ? "Team orchestration" : trace.modelId || "AI-powered"}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="execution-timeline">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Execution Timeline</CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px]">{timelineSteps.length} steps</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-0 pl-6">
          {timelineSteps.map((step, index) => {
            const isExpanded = expandedSteps.has(index);
            const isLast = index === timelineSteps.length - 1;
            const status = getStepStatus(step);
            const dotColor = getStepDotColor(step.type);
            const lineColor = getStepLineColor(step.type);

            return (
              <div
                key={index}
                className={`relative pl-8 pb-6 ${!isLast ? `border-l-2 ${lineColor}` : ""}`}
                data-testid={`timeline-step-${index}`}
              >
                <div className={`absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full ${dotColor} ring-2 ring-background`} />

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="flex items-start justify-between gap-3 text-left w-full group"
                    onClick={() => toggleStep(index)}
                    data-testid={`button-toggle-step-${index}`}
                  >
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium shrink-0">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium truncate">{getStepTitle(step)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getStepTypeBadge(step.type)}
                        {step.type === "toolcall" && (
                          <>
                            {step.data.server && (
                              <Badge variant="outline" className="text-[10px]">
                                <Cpu className="w-3 h-3 mr-0.5" />
                                {step.data.server}
                              </Badge>
                            )}
                            {step.data.latencyMs != null && (
                              <Badge variant="outline" className="text-[10px]">
                                <Timer className="w-3 h-3 mr-0.5" />
                                {formatMs(step.data.latencyMs)}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                              Proxied
                            </Badge>
                          </>
                        )}
                        {status === "success" && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                            <CheckCircle className="w-3 h-3 mr-0.5" />
                            Success
                          </Badge>
                        )}
                        {status === "fail" && (
                          <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                            <XCircle className="w-3 h-3 mr-0.5" />
                            Failed
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-0.5 shrink-0 text-muted-foreground">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-1 p-3 rounded-md bg-muted/30">
                      <TimelineStepContent step={step} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {traceId && <ProvenanceExplorer traceId={traceId} />}

    </div>
  );
}
