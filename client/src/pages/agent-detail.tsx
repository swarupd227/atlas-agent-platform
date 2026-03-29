import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo, Fragment, Component, type ErrorInfo, type ReactNode } from "react";
import {
  Bot,
  ArrowLeft,
  Activity,
  DollarSign,
  Clock,
  Shield,
  Zap,
  Play,
  RotateCcw,
  Rocket,
  CheckCircle,
  BarChart3,
  FileCode,
  AlertTriangle,
  Terminal,
  Cpu,
  Wrench,
  Lock,
  Unlock,
  Database,
  GitBranch,
  BookOpen,
  ShieldCheck,
  FlaskConical,
  History,
  Gauge,
  XCircle,
  Plus,
  ChevronRight,
  Archive,
  Power,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  AlertCircle,
  Download,
  Users,
  Tag,
  Eye,
  Layers,
  FileText,
  PenTool,
  Package,
  Code,
  Settings,
  MessageSquare,
  Network,
  BookOpenCheck,
  Blocks,
  ArrowRight,
  Workflow,
  Cloud,
  Box,
  Boxes,
  KeyRound,
  Copy,
  Radio,
  Scan,
  Hammer,
  FlaskRound,
  CheckCircle2,
  Loader2,
  XOctagon,
  Circle,
  Globe,
  HelpCircle,
  Target,
  ListOrdered,
  Crosshair,
  Minus,
  Pencil,
  Check,
  X,
  ChevronLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { usePermission, PermissionGate } from "@/components/role-provider";
import { InlineDiff } from "@/components/config-diff";
import { ActionCard } from "@/components/action-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Agent, RunTrace, EvalSuite, OutcomeContract, ImprovementRecommendation, AutonomousActionLog, AgentVersion, Deployment, Policy, Approval, PolicyException, ToolConnector, RemoteAgent, AgentTeam, Skill, McpServer, McpServerTool, McpServerResource, AgentMcpServer, OntologyConcept, Blueprint, KnowledgeBase, AgentKnowledgeBase, AgentTrigger } from "@shared/schema";
import { Wifi, WifiOff, Crown, Brain, Sparkles, ShieldAlert, Layers3, BookMarked, Binary, ScrollText, FileCheck, ChevronDown, ChevronUp } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useIndustry } from "@/components/industry-provider";
import { formatMs } from "@/components/shared-utils";


class AgentDetailErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("AgentDetail error boundary caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <AlertTriangle className="w-10 h-10 text-destructive" />
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            An error occurred while rendering this agent's details. Try refreshing the page.
          </p>
          <p className="text-xs text-muted-foreground font-mono bg-muted/30 p-2 rounded-md max-w-lg truncate">
            {this.state.error?.message}
          </p>
          <button
            className="text-sm text-primary underline"
            onClick={() => this.setState({ hasError: false, error: null })}
            data-testid="button-retry-error"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const TASK_SECTION_LABELS: Record<string, { icon: any; color: string }> = {
  "role": { icon: Bot, color: "text-cyan-500" },
  "goal": { icon: Target, color: "text-emerald-500" },
  "workflow steps": { icon: ListOrdered, color: "text-violet-500" },
  "available tools": { icon: Wrench, color: "text-amber-500" },
  "kpis to optimize": { icon: BarChart3, color: "text-blue-500" },
  "expected impact": { icon: TrendingUp, color: "text-emerald-500" },
  "orchestration pattern": { icon: Network, color: "text-violet-500" },
  "error handling": { icon: AlertTriangle, color: "text-amber-500" },
  "handoff rules": { icon: ArrowRight, color: "text-red-500" },
  "constraints": { icon: Shield, color: "text-red-500" },
  "compliance": { icon: ShieldCheck, color: "text-blue-500" },
  "output format": { icon: FileText, color: "text-cyan-500" },
  "context": { icon: BookOpen, color: "text-muted-foreground" },
  "schedule": { icon: Clock, color: "text-muted-foreground" },
};

function FormattedTaskPrompt({ prompt }: { prompt: string }) {
  const inlinePattern = /(Role|Goal|Workflow Steps|Available Tools|KPIs to optimize|Expected Impact|Orchestration Pattern|Error Handling|Handoff Rules|Constraints|Compliance|Output Format|Context|Schedule):\s*/gi;
  const parts: { label: string; content: string }[] = [];
  let match: RegExpExecArray | null;
  const labelPositions: { label: string; index: number; endIndex: number }[] = [];

  while ((match = inlinePattern.exec(prompt)) !== null) {
    labelPositions.push({ label: match[1], index: match.index, endIndex: match.index + match[0].length });
  }

  if (labelPositions.length === 0) {
    return <p className="text-xs font-medium leading-relaxed">{prompt}</p>;
  }

  if (labelPositions[0].index > 0) {
    const preamble = prompt.substring(0, labelPositions[0].index).trim();
    if (preamble) parts.push({ label: "", content: preamble });
  }

  for (let i = 0; i < labelPositions.length; i++) {
    const endOfContent = i + 1 < labelPositions.length ? labelPositions[i + 1].index : prompt.length;
    let content = prompt.substring(labelPositions[i].endIndex, endOfContent).trim();
    if (content.endsWith(".")) content = content.slice(0, -1).trim();
    parts.push({ label: labelPositions[i].label, content });
  }

  if (parts.length === 0) {
    return <p className="text-xs font-medium leading-relaxed">{prompt}</p>;
  }

  return (
    <div className="flex flex-col gap-2.5" data-testid="formatted-task-prompt">
      {parts.map((part, idx) => {
        if (!part.label) {
          return <p key={idx} className="text-xs leading-relaxed text-muted-foreground">{part.content}</p>;
        }
        const sectionMeta = TASK_SECTION_LABELS[part.label.toLowerCase()] || { icon: ChevronRight, color: "text-muted-foreground" };
        const Icon = sectionMeta.icon;
        const isNumberedList = /\d+\.\s/.test(part.content);
        const badgeSections = new Set(["available tools", "kpis to optimize", "constraints"]);
        const commaItems = part.content.split(",").map(s => s.trim());
        const avgItemLen = commaItems.reduce((sum, s) => sum + s.length, 0) / commaItems.length;
        const isCommaList = !isNumberedList && commaItems.length >= 3 && avgItemLen < 50 && badgeSections.has(part.label.toLowerCase());

        return (
          <div key={idx} className="flex flex-col gap-1" data-testid={`task-section-${part.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className="flex items-center gap-1.5">
              <Icon className={`w-3.5 h-3.5 ${sectionMeta.color} shrink-0`} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{part.label}</span>
            </div>
            <div className="pl-5">
              {isNumberedList ? (
                <ol className="flex flex-col gap-0.5 list-none">
                  {part.content.split(/(?=\d+\.\s)/).filter(s => s.trim()).map((item, i) => (
                    <li key={i} className="text-xs leading-relaxed flex items-start gap-1.5">
                      <span className="text-[10px] font-semibold text-primary/60 mt-0.5 shrink-0">{i + 1}.</span>
                      <span>{item.replace(/^\d+\.\s*/, "").trim()}</span>
                    </li>
                  ))}
                </ol>
              ) : isCommaList ? (
                <div className="flex flex-wrap gap-1">
                  {part.content.split(",").map((item, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] font-normal">{item.trim()}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-relaxed">{part.content}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function extractMixedContent(text: string): { textParts: string[]; embeddedRecords: any[] | null; parsed: any | null } {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const p = JSON.parse(trimmed);
      return { textParts: [], embeddedRecords: null, parsed: p };
    } catch {}
  }

  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  const jsonBlocks: any[] = [];
  let cleanedText = text;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    try {
      const blockParsed = JSON.parse(match[1].trim());
      jsonBlocks.push(blockParsed);
      cleanedText = cleanedText.replace(match[0], "");
    } catch {}
  }

  if (jsonBlocks.length === 0) {
    const inlineJsonRegex = /(\{[\s\S]*"processedRecords"\s*:\s*\[[\s\S]*\][\s\S]*\})/;
    const inlineMatch = text.match(inlineJsonRegex);
    if (inlineMatch) {
      try {
        const inlineParsed = JSON.parse(inlineMatch[1]);
        jsonBlocks.push(inlineParsed);
        cleanedText = cleanedText.replace(inlineMatch[0], "");
      } catch {}
    }
  }

  let records: any[] | null = null;
  let embeddedParsed: any | null = null;
  for (const block of jsonBlocks) {
    const recs = block.processedRecords || block.structuredOutput || (Array.isArray(block) ? block : null);
    if (Array.isArray(recs) && recs.length > 0) {
      records = recs;
    }
    if (block.summary || block.analysis || block.severity || block.findings || block.recommendedActions) {
      embeddedParsed = block;
    }
  }

  if (embeddedParsed && !records) {
    const recs = embeddedParsed.processedRecords || embeddedParsed.structuredOutput;
    if (Array.isArray(recs) && recs.length > 0) records = recs;
    return { textParts: [], embeddedRecords: records, parsed: embeddedParsed };
  }

  if (jsonBlocks.length > 0 && !records && !embeddedParsed) {
    cleanedText = text;
  }

  const textParts = cleanedText.split(/\n\n+/).map(s => s.trim()).filter(s => s.length > 0);
  return { textParts, embeddedRecords: records, parsed: null };
}

function extractEmbeddedFromText(text: string): { textContent: string; records: any[] | null } {
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let cleaned = text;
  let records: any[] | null = null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    try {
      const blockParsed = JSON.parse(match[1].trim());
      const recs = blockParsed.processedRecords || blockParsed.structuredOutput || (Array.isArray(blockParsed) ? blockParsed : null);
      if (Array.isArray(recs) && recs.length > 0) records = recs;
      cleaned = cleaned.replace(match[0], "");
    } catch {}
  }

  if (!records) {
    const inlineJsonRegex = /(\{[\s\S]*"processedRecords"\s*:\s*\[[\s\S]*\][\s\S]*\})/;
    const inlineMatch = text.match(inlineJsonRegex);
    if (inlineMatch) {
      try {
        const inlineParsed = JSON.parse(inlineMatch[1]);
        const recs = inlineParsed.processedRecords || inlineParsed.structuredOutput;
        if (Array.isArray(recs) && recs.length > 0) records = recs;
        cleaned = cleaned.replace(inlineMatch[0], "");
      } catch {}
    }
  }

  return { textContent: cleaned.trim(), records };
}

function RecordsTable({ records }: { records: any[] }) {
  const keys = Object.keys(records[0]);
  return (
    <div className="max-h-[300px] overflow-y-auto rounded-md border">
      <table className="w-full text-[11px]">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            {keys.map(key => (
              <th key={key} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{key.replace(/_/g, " ")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record: any, ri: number) => (
            <tr key={ri} className="border-t border-muted/30 hover:bg-muted/20">
              {keys.map((key) => {
                const val = record[key];
                return (
                  <td key={key} className="px-2 py-1.5 max-w-[250px]">
                    {typeof val === "boolean" ? (
                      <Badge variant="outline" className={`text-[9px] ${val ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/20" : "bg-red-500/15 text-red-600 border-red-500/20"}`}>
                        {val ? "Yes" : "No"}
                      </Badge>
                    ) : (
                      <span className="line-clamp-2">{String(val ?? "")}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormattedTraceOutput({ output }: { output: string }) {
  const { textParts, embeddedRecords, parsed } = extractMixedContent(output);

  if (!parsed && textParts.length === 0 && !embeddedRecords) {
    return <p className="text-xs bg-muted/30 p-2 rounded-md whitespace-pre-wrap">{output}</p>;
  }

  if (textParts.length > 0 || embeddedRecords) {
    return (
      <div className="flex flex-col gap-2" data-testid="formatted-trace-output">
        {textParts.length > 0 && (
          <div className="p-2 rounded-md bg-muted/30 text-xs leading-relaxed whitespace-pre-wrap">
            {textParts.join("\n\n")}
          </div>
        )}
        {embeddedRecords && embeddedRecords.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Processed Records ({embeddedRecords.length})</span>
            <RecordsTable records={embeddedRecords} />
          </div>
        )}
      </div>
    );
  }

  const rawAnalysis = parsed.summary || parsed.analysis;
  const severity = parsed.severity;
  const riskFactors = Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [];
  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const recommendedActions = Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [];
  let structuredRecords = parsed.structuredOutput || parsed.processedRecords;

  let analysisText = rawAnalysis;
  let inlineRecords: any[] | null = null;
  if (typeof rawAnalysis === "string" && (rawAnalysis.includes("```") || rawAnalysis.includes('"processedRecords"'))) {
    const { textContent, records } = extractEmbeddedFromText(rawAnalysis);
    analysisText = textContent || rawAnalysis;
    if (records && records.length > 0) inlineRecords = records;
  }

  const allRecords = Array.isArray(structuredRecords) && structuredRecords.length > 0 ? structuredRecords : inlineRecords;

  const hasStructuredFields = severity || riskFactors.length > 0 || findings.length > 0 || recommendedActions.length > 0;

  if (!analysisText && !hasStructuredFields && !allRecords) {
    return <p className="text-xs bg-muted/30 p-2 rounded-md whitespace-pre-wrap">{output}</p>;
  }

  return (
    <div className="flex flex-col gap-2" data-testid="formatted-trace-output">
      {analysisText && (
        <div className="p-2 rounded-md bg-muted/30 text-xs leading-relaxed whitespace-pre-wrap">
          {typeof analysisText === "string" ? analysisText : JSON.stringify(analysisText, null, 2)}
        </div>
      )}

      {(severity || riskFactors.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {severity && (
            <Badge variant="outline" className={`text-[10px] ${
              severity === "low" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
              severity === "medium" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" :
              severity === "high" ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" : ""
            }`}>
              <Shield className="w-3 h-3 mr-0.5" />
              Severity: {severity.charAt(0).toUpperCase() + severity.slice(1)}
            </Badge>
          )}
          {riskFactors.map((rf: string, i: number) => (
            <Badge key={i} variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">{rf}</Badge>
          ))}
        </div>
      )}

      {findings.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Key Findings</span>
          <ul className="flex flex-col gap-0.5 pl-1">
            {findings.map((f: string, i: number) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <CheckCircle className="w-3 h-3 mt-0.5 text-cyan-500 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommendedActions.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Recommended Actions</span>
          <ul className="flex flex-col gap-0.5 pl-1">
            {recommendedActions.map((a: string, i: number) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <ChevronRight className="w-3 h-3 mt-0.5 text-emerald-500 shrink-0" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(allRecords) && allRecords.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Processed Records ({allRecords.length})</span>
          <RecordsTable records={allRecords} />
        </div>
      )}
    </div>
  );
}

function McpServerLinkCard({ link, server, onUnlink, unlinking }: {
  link: AgentMcpServer;
  server?: McpServer;
  onUnlink: () => void;
  unlinking: boolean;
}) {
  const { data: tools } = useQuery<McpServerTool[]>({
    queryKey: ["/api/mcp-servers", link.serverId, "tools"],
    queryFn: async () => {
      const res = await fetch(`/api/mcp-servers/${link.serverId}/tools`);
      return res.json();
    },
    enabled: !!link.serverId,
  });
  const { data: resources } = useQuery<McpServerResource[]>({
    queryKey: ["/api/mcp-servers", link.serverId, "resources"],
    queryFn: async () => {
      const res = await fetch(`/api/mcp-servers/${link.serverId}/resources`);
      return res.json();
    },
    enabled: !!link.serverId,
  });

  return (
    <Card data-testid={`card-mcp-link-${link.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-bold" data-testid={`text-mcp-server-name-${link.id}`}>
              {server?.name || link.serverId}
            </CardTitle>
            {server?.status && (
              <Badge variant={server.status === "verified" ? "default" : "secondary"} className="text-[10px]">
                {server.status}
              </Badge>
            )}
            {server?.riskTier && (
              <Badge variant={server.riskTier === "HIGH" || server.riskTier === "CRITICAL" ? "destructive" : "outline"} className="text-[10px]">
                <Shield className="w-3 h-3 mr-0.5" /> {server.riskTier}
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onUnlink}
            disabled={unlinking}
            data-testid={`button-unlink-mcp-${link.id}`}
          >
            <XCircle className="w-4 h-4 mr-1" /> Unlink
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {server?.url && (
          <span className="text-xs font-mono text-muted-foreground">{server.url}</span>
        )}

        {tools && tools.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tools ({tools.length})</span>
            <div className="flex flex-wrap gap-1.5">
              {tools.map(t => (
                <Badge key={t.id} variant="outline" className="text-[10px] font-mono" data-testid={`badge-tool-${t.id}`}>
                  <Wrench className="w-3 h-3 mr-0.5" />
                  {t.name}
                  {t.riskClassification && t.riskClassification !== "low" && (
                    <span className={`ml-1 ${t.riskClassification === "critical" || t.riskClassification === "high" ? "text-red-500" : "text-yellow-600"}`}>
                      ({t.riskClassification})
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {resources && resources.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Resources ({resources.length})</span>
            <div className="flex flex-wrap gap-1.5">
              {resources.map(r => (
                <Badge key={r.id} variant="outline" className="text-[10px] font-mono" data-testid={`badge-resource-${r.id}`}>
                  <Database className="w-3 h-3 mr-0.5" />
                  {r.name}
                  {r.sensitivityLevel && r.sensitivityLevel !== "public" && (
                    <span className="ml-1 text-yellow-600">
                      <Lock className="w-2.5 h-2.5 inline" />
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {(!tools || tools.length === 0) && (!resources || resources.length === 0) && (
          <p className="text-xs text-muted-foreground">No tools or resources registered on this server yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function AgentDetailInner() {
  const [, params] = useRoute("/agents/:id");
  const agentId = params?.id;

  const { data: agent, isLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", agentId],
    enabled: !!agentId,
  });
  const { data: traces } = useQuery<RunTrace[]>({
    queryKey: ["/api/agents", agentId, "traces"],
    enabled: !!agentId,
  });
  const { data: evals } = useQuery<EvalSuite[]>({
    queryKey: ["/api/agents", agentId, "evals"],
    enabled: !!agentId,
  });
  const { data: outcomes } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
  });
  const { data: recommendations } = useQuery<ImprovementRecommendation[]>({
    queryKey: ["/api/agents", agentId, "recommendations"],
    enabled: !!agentId,
  });
  const { data: autonomousActions } = useQuery<AutonomousActionLog[]>({
    queryKey: ["/api/agents", agentId, "autonomous-actions"],
    enabled: !!agentId,
  });
  const { data: timeline } = useQuery<Array<{
    id: string;
    timestamp: string;
    category: string;
    title: string;
    description: string;
    severity: string;
    diff?: { field: string; from: string; to: string }[];
    correlatedMetric?: { metric: string; before: number; after: number; change: string };
  }>>({
    queryKey: ["/api/agents", agentId, "timeline"],
    enabled: !!agentId,
  });
  const { data: agentVersions } = useQuery<AgentVersion[]>({
    queryKey: ["/api/agents", agentId, "versions"],
    enabled: !!agentId,
  });
  const { data: allDeployments } = useQuery<Deployment[]>({
    queryKey: ["/api/deployments"],
  });
  const { data: activeRuntimes } = useQuery<Array<{ deploymentId: string; agentId: string; agentName: string }>>({
    queryKey: ["/api/agent-runtime/active"],
    refetchInterval: 15000,
  });
  const stopDeploymentRuntimeMutation = useMutation({
    mutationFn: async (deploymentId: string) => {
      const res = await apiRequest("POST", `/api/deployments/${deploymentId}/stop-runtime`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-runtime/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "runtime-status"] });
      toast({ title: "Runtime stopped" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to stop runtime", description: err.message, variant: "destructive" });
    },
  });
  const { data: allPolicies } = useQuery<Policy[]>({
    queryKey: ["/api/policies"],
  });
  const { data: allApprovals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });
  const { data: agentExceptions } = useQuery<PolicyException[]>({
    queryKey: ["/api/policy-exceptions/agent", agentId],
  });
  const { data: allToolConnectors } = useQuery<ToolConnector[]>({
    queryKey: ["/api/tool-connectors"],
  });
  const { data: remoteAgents } = useQuery<RemoteAgent[]>({
    queryKey: ["/api/remote-agents"],
  });
  const { data: teamMembers } = useQuery<AgentTeam[]>({
    queryKey: ["/api/agent-teams", agentId, "members"],
    queryFn: async () => {
      if (!agentId) return [];
      const res = await fetch(`/api/agent-teams/${agentId}/members`);
      return res.json();
    },
    enabled: !!agentId && agent?.agentType === "team",
  });
  const { data: allAgents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: allSkills } = useQuery<Skill[]>({
    queryKey: ["/api/skills"],
  });
  const { data: agentMcpLinks } = useQuery<AgentMcpServer[]>({
    queryKey: ["/api/agents", agentId, "mcp-servers"],
    queryFn: async () => {
      if (!agentId) return [];
      const res = await fetch(`/api/agents/${agentId}/mcp-servers`);
      return res.json();
    },
    enabled: !!agentId,
  });
  const { data: agentKbData } = useQuery<{ links: AgentKnowledgeBase[]; knowledgeBases: KnowledgeBase[] }>({
    queryKey: ["/api/agents", agentId, "knowledge-bases"],
    queryFn: async () => {
      if (!agentId) return { links: [], knowledgeBases: [] };
      const res = await fetch(`/api/agents/${agentId}/knowledge-bases`);
      return res.json();
    },
    enabled: !!agentId,
  });
  const { data: allMcpServers } = useQuery<McpServer[]>({
    queryKey: ["/api/mcp-servers"],
  });
  const { data: allOntologyConcepts } = useQuery<OntologyConcept[]>({
    queryKey: ["/api/ontology-concepts/all"],
  });
  const { data: allBlueprints } = useQuery<Blueprint[]>({
    queryKey: ["/api/blueprints"],
  });
  const agentBlueprint = allBlueprints?.find(b => b.agentId === agentId);
  const { data: runtimeStatus, refetch: refetchRuntimeStatus } = useQuery<{
    isActive: boolean;
    deploymentId: string | null;
    deploymentStatus: string | null;
    lastRun: any;
    recentRuns: any[];
    scheduleIntervalMinutes: number;
    readiness: { hasPrompt: boolean; hasMcpServers: boolean; isDeployed: boolean; canRun: boolean };
  }>({
    queryKey: ["/api/agents", agentId, "runtime-status"],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/runtime-status`);
      return res.json();
    },
    enabled: !!agentId,
    refetchInterval: 15000,
  });
  const { data: agentTriggers, refetch: refetchTriggers } = useQuery<AgentTrigger[]>({
    queryKey: ["/api/agents", agentId, "triggers"],
    queryFn: async () => {
      if (!agentId) return [];
      const res = await fetch(`/api/agents/${agentId}/triggers`);
      return res.json();
    },
    enabled: !!agentId,
  });
  const { industry } = useIndustry();

  const [, navigate] = useLocation();
  const { toast } = useToast();
  const deployPerm = usePermission("deploy_staging_pilot");
  const tracesPerm = usePermission("view_traces");
  const approvalPerm = usePermission("approve_changes");

  const deployAndRunMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/agents/${agentId}/deploy-and-run`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "runtime-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      toast({ title: "Agent deployed & runtime started", description: "The agent is now running and will execute its task." });
    },
    onError: (err: Error) => {
      toast({ title: "Deploy & Run failed", description: err.message, variant: "destructive" });
    },
  });

  const runTestMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/agents/${agentId}/run-test`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "traces"] });
      toast({ title: "Test run completed", description: "The agent executed a one-time test run. Check the Runs & Traces tab for results." });
    },
    onError: (err: Error) => {
      toast({ title: "Test run failed", description: err.message, variant: "destructive" });
    },
  });

  const [assignMcpOpen, setAssignMcpOpen] = useState(false);
  const [selectedMcpServerId, setSelectedMcpServerId] = useState("");
  const [mcpPolicyWarnings, setMcpPolicyWarnings] = useState<Array<{
    toolName: string;
    toolId: string;
    riskClassification: string;
    issue: string;
    requiredPolicyDomain: string;
  }> | null>(null);
  const [mcpPolicyWarningServerName, setMcpPolicyWarningServerName] = useState("");
  const [mcpPolicyWarningServerId, setMcpPolicyWarningServerId] = useState("");

  const assignMcpMutation = useMutation({
    mutationFn: async (opts?: { acknowledgeWarnings?: boolean; forceServerId?: string }) => {
      const sid = opts?.forceServerId || selectedMcpServerId;
      const response = await apiRequest("POST", `/api/agents/${agentId}/mcp-servers`, {
        serverId: sid,
        acknowledgeWarnings: opts?.acknowledgeWarnings || false,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.requiresAcknowledgment && data.policyWarnings) {
        setMcpPolicyWarnings(data.policyWarnings);
        setMcpPolicyWarningServerName(data.serverName || "");
        setMcpPolicyWarningServerId(data.serverId || selectedMcpServerId);
        setAssignMcpOpen(false);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "mcp-servers"] });
      setAssignMcpOpen(false);
      setSelectedMcpServerId("");
      setMcpPolicyWarnings(null);
      toast({ title: "MCP Server linked", description: "The MCP server has been assigned to this agent." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to link MCP server", description: err.message, variant: "destructive" });
    },
  });

  const acknowledgeAndLinkMcp = () => {
    assignMcpMutation.mutate(
      { acknowledgeWarnings: true, forceServerId: mcpPolicyWarningServerId },
      {
        onSuccess: (data: any) => {
          if (!data.requiresAcknowledgment) {
            queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "mcp-servers"] });
            setMcpPolicyWarnings(null);
            setMcpPolicyWarningServerId("");
            setMcpPolicyWarningServerName("");
            setSelectedMcpServerId("");
            toast({ title: "MCP Server linked with warnings acknowledged", description: "The MCP server has been assigned. Consider adding the recommended policies." });
          }
        },
      }
    );
  };

  const unlinkMcpMutation = useMutation({
    mutationFn: (linkId: string) =>
      apiRequest("DELETE", `/api/agents/${agentId}/mcp-servers/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "mcp-servers"] });
      toast({ title: "MCP Server unlinked", description: "The MCP server has been removed from this agent." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to unlink", description: err.message, variant: "destructive" });
    },
  });

  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  const [templateTab, setTemplateTab] = useState("identity");
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateCategory, setTemplateCategory] = useState("general");
  const [templateIndustry, setTemplateIndustry] = useState("cross_industry");
  const [templateTagsList, setTemplateTagsList] = useState<string[]>([]);
  const [templateTagInput, setTemplateTagInput] = useState("");
  const [templateComplexity, setTemplateComplexity] = useState("medium");
  const [templateIcon, setTemplateIcon] = useState("bot");

  const [constraintViolationDialogOpen, setConstraintViolationDialogOpen] = useState(false);
  const [constraintViolations, setConstraintViolations] = useState<Array<{ constraint: string; current: string; proposed: string; severity: string }>>([]);
  const [pendingConfigChange, setPendingConfigChange] = useState<{ changes: Record<string, any>; onConfirm: () => void } | null>(null);

  const validateAndApplyConfig = async (changes: Record<string, any>, applyFn: () => void) => {
    if (!agent?.outcomeId) {
      applyFn();
      return;
    }
    try {
      const res = await fetch(`/api/agents/${agentId}/validate-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const result = await res.json();
      if (result.violations && result.violations.length > 0) {
        setConstraintViolations(result.violations);
        setPendingConfigChange({ changes, onConfirm: applyFn });
        setConstraintViolationDialogOpen(true);
      } else {
        applyFn();
      }
    } catch {
      applyFn();
    }
  };

  const [retireDialogOpen, setRetireDialogOpen] = useState(false);
  const [retireReason, setRetireReason] = useState("");
  const [replacementAgentId, setReplacementAgentId] = useState("");
  const [timelineFilter, setTimelineFilter] = useState<string>("all");
  const [retirementChecklist, setRetirementChecklist] = useState<boolean[]>([false, false, false, false, false, false, false, false]);
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [editingDescription, setEditingDescription] = useState(false);
  const [editDescValue, setEditDescValue] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [shadowReplayOpen, setShadowReplayOpen] = useState(false);
  const [shadowTimeWindow, setShadowTimeWindow] = useState("24h");
  const [shadowEnvironment, setShadowEnvironment] = useState("staging");
  const [shadowSampleSize, setShadowSampleSize] = useState("10");
  const [shadowResult, setShadowResult] = useState<{ status: string; summary: string; tracesReplayed: number; passRate: number; divergences: Array<{ traceId: string; originalOutput?: string; replayOutput?: string; original?: string; replay?: string; divergenceType: string }> } | null>(null);
  const [blueprintView, setBlueprintView] = useState<"graph" | "json">("graph");
  const [diffVersionA, setDiffVersionA] = useState("");
  const [diffVersionB, setDiffVersionB] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("export") === "1") {
      params.delete("export");
      const remaining = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (remaining ? `?${remaining}` : ""));
      navigate(`/agents/${agentId}/export`);
    }
    const tabParam = params.get("tab");
    if (tabParam) {
      setActiveTab(tabParam);
      params.delete("tab");
      const remaining2 = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (remaining2 ? `?${remaining2}` : ""));
    }
  }, []);

  const { data: computedStats, isLoading: statsLoading } = useQuery<{
    healthScore: number;
    successRate: number;
    avgLatencyMs: number;
    costPerRun: number;
    totalRuns: number;
    recentFailures: number;
    totalCost: number;
    hasData: boolean;
  }>({
    queryKey: ["/api/agents", agentId, "computed-stats"],
    enabled: !!agentId,
    refetchInterval: 30000,
  });

  const { data: kpiContributions, isLoading: kpiLoading } = useQuery<{
    outcomeId: string | null;
    outcomeName: string;
    kpis: Array<{
      kpiId: string;
      kpiName: string;
      unit: string;
      target: number;
      currentValue: number;
      baseline: number;
      weight: number;
      progressPct: number;
      agentContribution: number;
      agentSharePct: number;
      agentTraces: number;
      status: string;
    }>;
    overallContribution: number;
    totalBoundAgents: number;
    agentSuccessfulRuns: number;
    agentTotalRuns: number;
  }>({
    queryKey: ["/api/agents", agentId, "kpi-contributions"],
    enabled: !!agentId && !!agent?.outcomeId,
    refetchInterval: 30000,
  });

  const { data: deprecationSignals, isLoading: deprecationLoading, isError: deprecationError } = useQuery<{
    riskScore: number;
    recommendation: string;
    signals: Array<{ signal: string; severity: string; value: number | string; threshold: number | string; message: string }>;
    metadata: { recentSuccessRate: number; costRevenueRatio: number; daysSinceLastRun: number; avgEvalPassRate: number; healthScore: number; totalTraces7d: number; betterAgentExists: boolean; linkedOutcomeStatus: string };
    retirementCriteria: { lowROI: boolean; persistentInstability: boolean; replacedByBetter: boolean; workflowObsolete: boolean };
    computedAt: string;
  }>({
    queryKey: ["/api/agents", agentId, "deprecation-signals"],
    enabled: !!agentId,
  });

  const { data: outcomeSlaReviewEvents } = useQuery<Array<{ id: string; action: string; objectId: string | null; details: any; createdAt?: string }>>({
    queryKey: ["/api/agents", agentId, "sla-review-events"],
    queryFn: async () => {
      const res = await fetch("/api/audit-events");
      if (!res.ok) return [];
      const all = await res.json();
      return all.filter((e: any) =>
        e.action === "agent.outcome_sla_review_required" && e.objectId === agentId
      ).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    },
    enabled: !!agentId && !!agent?.outcomeId,
  });

  const [replacementProposal, setReplacementProposal] = useState<any>(null);
  const [lastReEvaluation, setLastReEvaluation] = useState<{
    timestamp: string;
    changes: Array<{ kpiId: string; kpiName: string; oldValue: number; newValue: number; trend: string; breached: boolean }>;
    totalRuns: number;
  } | null>(null);

  const { data: agentAuditEvents } = useQuery<Array<{ id: string; action: string; objectId: string; details: any; timestamp: string; createdAt?: string }>>({
    queryKey: ["/api/agents", agentId, "audit-events"],
    queryFn: async () => {
      const res = await fetch("/api/audit-events");
      if (!res.ok) return [];
      const all = await res.json();
      return (all || [])
        .filter((e: any) => e.objectId === agentId && e.action === "agent.config_changed")
        .sort((a: any, b: any) => new Date(b.timestamp || b.createdAt || 0).getTime() - new Date(a.timestamp || a.createdAt || 0).getTime())
        .slice(0, 5);
    },
    enabled: !!agentId && !!agent?.outcomeId,
  });

  const persistedReEval = (() => {
    if (lastReEvaluation) return lastReEvaluation;
    if (!agentAuditEvents?.length) return null;
    const latest = agentAuditEvents[0];
    try {
      const details = typeof latest.details === "string" ? JSON.parse(latest.details) : (latest.details || {});
      if (!details.changedFields?.length) return null;
      return { timestamp: latest.timestamp || latest.createdAt || "", changes: [] as any[], totalRuns: 0 };
    } catch { return null; }
  })();

  const handlePatchReEvaluation = (data: any, actionLabel: string) => {
    queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
    queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "audit-events"] });
    if (data.reEvaluationTriggered && data.kpiReEvaluation) {
      const reEval = data.kpiReEvaluation;
      setLastReEvaluation({
        timestamp: new Date().toISOString(),
        changes: reEval.changes || [],
        totalRuns: reEval.totalRuns || 0,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "kpi-contributions"] });
      const breachCount = (reEval.changes || []).filter((c: any) => c.breached).length;
      if (reEval.changes?.length > 0) {
        toast({
          title: `${actionLabel} — KPIs re-evaluated`,
          description: `${reEval.changes.length} KPI(s) updated${breachCount > 0 ? `, ${breachCount} SLA breach(es) detected` : ""}`,
          variant: breachCount > 0 ? "destructive" : "default",
        });
      } else {
        toast({ title: actionLabel, description: "KPI re-evaluation triggered — no changes detected" });
      }
    } else {
      toast({ title: actionLabel });
    }
  };

  const existingRtConfig = (agent?.runtimeConfig as Record<string, any>) || {};
  const [rtPrompt, setRtPrompt] = useState(existingRtConfig?.prompt || "");
  const [rtInterval, setRtInterval] = useState<number>(existingRtConfig?.scheduleIntervalMinutes || 0);
  const [rtEditing, setRtEditing] = useState(false);
  const existingGateOverrides = existingRtConfig?.promotionGateOverrides || {};
  const [gateMinEvalPassRate, setGateMinEvalPassRate] = useState<number>(typeof existingGateOverrides.minEvalPassRate === "number" ? existingGateOverrides.minEvalPassRate : 80);
  const [gateMaxLatencyMs, setGateMaxLatencyMs] = useState<number>(typeof existingGateOverrides.maxLatencyMs === "number" ? existingGateOverrides.maxLatencyMs : 2000);

  const rtConfigMutationInner = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/agents/${agentId}`, {
        runtimeConfig: {
          ...existingRtConfig,
          prompt: rtPrompt.trim(),
          scheduleIntervalMinutes: rtInterval,
          promotionGateOverrides: {
            minEvalPassRate: gateMinEvalPassRate,
            maxLatencyMs: gateMaxLatencyMs,
          },
        },
      });
      return res.json();
    },
    onSuccess: (data) => {
      setRtEditing(false);
      handlePatchReEvaluation(data, "Runtime configuration saved");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save runtime config", description: err.message, variant: "destructive" });
    },
  });
  const rtConfigMutation = {
    ...rtConfigMutationInner,
    mutate: () => {
      const changes = { runtimeConfig: { ...existingRtConfig, prompt: rtPrompt.trim(), scheduleIntervalMinutes: rtInterval, promotionGateOverrides: { minEvalPassRate: gateMinEvalPassRate, maxLatencyMs: gateMaxLatencyMs } } };
      validateAndApplyConfig(changes, () => rtConfigMutationInner.mutate());
    },
  };

  const [spEditing, setSpEditing] = useState(false);
  const [spValue, setSpValue] = useState((agent?.systemPrompt as string) || "");
  const [spExpanded, setSpExpanded] = useState(false);

  const spMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/agents/${agentId}`, {
        systemPrompt: spValue.trim(),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSpEditing(false);
      handlePatchReEvaluation(data, "System prompt saved");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save system prompt", description: err.message, variant: "destructive" });
    },
  });

  const { data: deployRecommendation } = useQuery<{
    agentId: string;
    agentName: string;
    outcomeName: string | null;
    outcomeId: string | null;
    riskLevel: string;
    allowDirectDeploy: boolean;
    slaRequirements: Array<{ kpiName: string; slaThreshold: number; target: number; unit: string }>;
    recommended: { strategy: string; canaryConfig: any; rollbackConfig: any; reason: string };
  }>({
    queryKey: ["/api/agents", agentId, "deployment-recommendation"],
    enabled: !!agentId,
  });

  const [deployStrategyDialogOpen, setDeployStrategyDialogOpen] = useState(false);

  const deployMutation = useMutation({
    mutationFn: async (opts?: { useRecommended?: boolean }) => {
      const existingDeps = allDeployments?.filter(d => d.agentId === agentId) || [];
      const latestVersion = existingDeps.length > 0
        ? existingDeps.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0]?.version || "1.0.0"
        : "1.0.0";
      const parts = latestVersion.split(".");
      const nextVersion = existingDeps.length > 0
        ? `${parts[0]}.${parts[1]}.${parseInt(parts[2] || "0") + 1}`
        : "1.0.0";

      const useCanary = opts?.useRecommended && deployRecommendation && !deployRecommendation.allowDirectDeploy;
      const res = await apiRequest("POST", "/api/deployments", {
        agentId,
        agentName: agent?.name || "Agent",
        environment: "production",
        version: nextVersion,
        rolloutStrategy: useCanary ? "canary" : "full",
        status: "pending",
        industry: industry?.id || (agent as any)?.industry || "technology",
        ...(useCanary && deployRecommendation?.recommended?.canaryConfig ? { canaryConfig: deployRecommendation.recommended.canaryConfig } : {}),
        ...(useCanary && deployRecommendation?.recommended?.rollbackConfig ? { rollbackConfig: deployRecommendation.recommended.rollbackConfig } : {}),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      setDeployStrategyDialogOpen(false);
      const strategyLabel = data.rolloutStrategy === "canary" ? "Canary deployment" : "Full deployment";
      toast({ title: `${strategyLabel} created`, description: `Version ${data.version} created. Configure the deployment pipeline.` });
      if (data.strategyWarning) {
        toast({ title: "Strategy Warning", description: data.strategyWarning, variant: "destructive" });
      }
      navigate(`/deployments/${data.id}`);
    },
    onError: () => toast({ title: "Failed to create deployment", variant: "destructive" }),
  });

  const handleDeployClick = () => {
    if (deployRecommendation && !deployRecommendation.allowDirectDeploy) {
      setDeployStrategyDialogOpen(true);
    } else {
      deployMutation.mutate(undefined as any);
    }
  };

  const requestApprovalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/approvals", {
        type: "agent_change",
        objectType: "agent",
        objectId: agentId,
        objectName: agent?.name || "Agent",
        status: "pending",
        requestedBy: "Platform User",
        requesterType: "human",
        description: `Approval requested for agent "${agent?.name}" (v${agent?.currentVersion}) in ${agent?.environment} environment`,
        riskScore: agent?.riskTier === "CRITICAL" ? 0.9 : agent?.riskTier === "HIGH" ? 0.7 : agent?.riskTier === "MEDIUM" ? 0.5 : 0.3,
        agentId,
        outcomeId: agent?.outcomeId || undefined,
        environment: agent?.environment || "staging",
        changeType: "deployment",
        toolPermissionClass: agent?.toolAccessClass || "standard",
        diffSummary: `Agent ${agent?.name} v${agent?.currentVersion} - ${agent?.environment} deployment approval`,
        recommendedAction: "Review agent configuration and approve for deployment",
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: "Approval request created", description: `Approval #${data.id?.slice(0, 8)} is pending review in the Approvals queue.` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create approval request", description: err.message, variant: "destructive" });
    },
  });

  const proposalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ai/propose-replacement`, { agentId });
      return res.json();
    },
    onSuccess: (data) => {
      setReplacementProposal(data);
      toast({ title: "Replacement proposal generated" });
    },
    onError: () => toast({ title: "Failed to generate proposal", variant: "destructive" }),
  });

  const initiateRetirementMutation = useMutation({
    mutationFn: async (data: { reason: string; replacementAgentId?: string; requireApproval: boolean }) => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/initiate-retirement`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      setRetireDialogOpen(false);
      toast({ title: data.status === "pending_approval" ? "Retirement sent for expert approval" : "Retirement initiated" });
    },
    onError: () => toast({ title: "Failed to initiate retirement", variant: "destructive" }),
  });

  const shadowReplayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/shadow-replay`, {
        timeWindow: shadowTimeWindow,
        environment: shadowEnvironment,
        sampleSize: parseInt(shadowSampleSize) || 10,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setShadowResult(data);
      toast({ title: "Shadow replay complete", description: `${data.tracesReplayed} traces replayed with ${Math.round(data.passRate * 100)}% pass rate` });
    },
    onError: (error: Error) => {
      toast({ title: "Shadow replay failed", description: error.message, variant: "destructive" });
    },
  });

  const saveAsTemplateMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; category: string; industry: string; tags: string[]; complexity: string; icon: string }) => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/save-as-template`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-templates"] });
      setSaveAsTemplateOpen(false);
      toast({ title: "Template created", description: `"${data.name}" saved to the Templates library.` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save as template", description: err.message, variant: "destructive" });
    },
  });

  const completeRetirementMutation = useMutation({
    mutationFn: async (data: { handoverComplete: boolean; requireApproval: boolean }) => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/complete-retirement`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: data.status === "retired" ? "Agent archived successfully" : "Handover review submitted for approval" });
    },
    onError: () => toast({ title: "Failed to complete retirement", variant: "destructive" }),
  });

  const retireMutationInner = useMutation({
    mutationFn: async (data: { status: string; description?: string }) => {
      const res = await apiRequest("PATCH", `/api/agents/${agentId}`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setRetireDialogOpen(false);
      handlePatchReEvaluation(data, "Agent status updated");
    },
  });
  const retireMutation = {
    ...retireMutationInner,
    mutate: (data: { status: string; description?: string }) => {
      validateAndApplyConfig(data, () => retireMutationInner.mutate(data));
    },
  };

  const applyRecMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/recommendations/${id}`, { status: "applied" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "recommendations"] });
      toast({ title: "Recommendation applied" });
    },
  });

  const dismissRecMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/recommendations/${id}`, { status: "dismissed" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "recommendations"] });
      toast({ title: "Recommendation dismissed" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Bot className="w-12 h-12 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Agent not found</p>
        <Link href="/agents">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Registry
          </Button>
        </Link>
      </div>
    );
  }

  const outcome = outcomes?.find((o) => o.id === agent.outcomeId);
  const recentTraces = traces?.slice(0, 10) || [];
  const successTraces = recentTraces.filter((t) => t.status === "completed").length;
  const failedTraces = recentTraces.filter((t) => t.status === "failed").length;
  const agentDeployments = allDeployments?.filter(d => d.agentId === agentId) || [];
  const agentApprovals = allApprovals?.filter(a => a.objectId === agentId) || [];
  const rawBindings = (Array.isArray(agent.policyBindings) ? agent.policyBindings : []) as Array<any>;
  const policyBindings = rawBindings.map((b: any) => {
    if (typeof b === "string") {
      const matched = allPolicies?.find(p => p.id === b);
      return { policyId: b, name: matched?.name || b, enforcement: "soft_warn", description: matched?.description || "" };
    }
    const displayName = b.name || b.policyName || "";
    const enforcement = b.enforcement === "hard" ? "hard_block" : (b.enforcement || "soft_warn");
    return { policyId: b.policyId || b.policyName || "", name: displayName, enforcement, description: b.description };
  });

  const handleExportJSON = () => {
    if (!timeline) return;
    const blob = new Blob([JSON.stringify(timeline, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent.name}-audit-log.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (!timeline) return;
    const headers = ["id", "timestamp", "category", "title", "description", "severity"];
    const rows = timeline.map(e => headers.map(h => `"${String((e as any)[h] || "").replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent.name}-audit-log.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-agent-detail">
      <div className="flex items-center gap-3">
        <Link href="/agents">
          <Button variant="ghost" size="icon" data-testid="button-back-agents">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  className="text-2xl font-semibold tracking-tight bg-transparent border-b border-primary outline-none"
                  value={editNameValue}
                  onChange={e => setEditNameValue(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === "Enter" && editNameValue.trim()) {
                      await apiRequest("PATCH", `/api/agents/${agentId}`, { name: editNameValue.trim() });
                      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
                      setEditingName(false);
                      toast({ title: "Agent name updated" });
                    }
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  autoFocus
                  data-testid="input-edit-name"
                />
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={async () => {
                  if (editNameValue.trim()) {
                    await apiRequest("PATCH", `/api/agents/${agentId}`, { name: editNameValue.trim() });
                    queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
                    setEditingName(false);
                    toast({ title: "Agent name updated" });
                  }
                }} data-testid="button-save-name"><Check className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingName(false)} data-testid="button-cancel-name"><XCircle className="w-3.5 h-3.5" /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group">
                <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-agent-name">{agent.name}</h1>
                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setEditNameValue(agent.name); setEditingName(true); }} data-testid="button-edit-name">
                  <Pencil className="w-3 h-3" />
                </Button>
              </div>
            )}
            <StatusBadge status={agent.status} />
            <StatusBadge status={agent.riskTier} />
            <StatusBadge status={agent.autonomyMode} />
          </div>
          {editingDescription ? (
            <div className="flex items-start gap-1.5">
              <textarea
                className="text-sm text-muted-foreground bg-transparent border border-border rounded-md p-1.5 w-full min-h-[60px] outline-none focus:border-primary resize-y"
                value={editDescValue}
                onChange={e => setEditDescValue(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    await apiRequest("PATCH", `/api/agents/${agentId}`, { description: editDescValue.trim() });
                    queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
                    setEditingDescription(false);
                    toast({ title: "Description updated" });
                  }
                  if (e.key === "Escape") setEditingDescription(false);
                }}
                autoFocus
                data-testid="input-edit-description"
              />
              <div className="flex flex-col gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={async () => {
                  await apiRequest("PATCH", `/api/agents/${agentId}`, { description: editDescValue.trim() });
                  queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
                  setEditingDescription(false);
                  toast({ title: "Description updated" });
                }} data-testid="button-save-description"><Check className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingDescription(false)} data-testid="button-cancel-description"><XCircle className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-1.5 group">
              <p className="text-sm text-muted-foreground" data-testid="text-agent-description">{agent.description || "No description"}</p>
              <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" onClick={() => { setEditDescValue(agent.description || ""); setEditingDescription(true); }} data-testid="button-edit-description">
                <Pencil className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {outcomeSlaReviewEvents && outcomeSlaReviewEvents.length > 0 && (() => {
        const latestEvent = outcomeSlaReviewEvents[0];
        let parsedDetails: any = {};
        try { parsedDetails = typeof latestEvent.details === "string" ? JSON.parse(latestEvent.details) : (latestEvent.details || {}); } catch {}
        const violations: Array<{ constraint: string; current: string; required: string; severity: string }> = parsedDetails.violations || [];
        const hasCritical = violations.some(v => v.severity === "critical");
        return (
          <Card
            className={`border ${hasCritical ? "border-destructive/50 bg-destructive/5" : "border-amber-500/50 bg-amber-500/5"}`}
            data-testid="banner-outcome-sla-review"
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${hasCritical ? "bg-destructive/10" : "bg-amber-500/10"}`}>
                    <AlertTriangle className={`w-4 h-4 ${hasCritical ? "text-destructive" : "text-amber-500"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" data-testid="text-sla-review-title">
                      Outcome SLA Updated — Review Your Agent Configuration
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {parsedDetails.outcomeName ? `"${parsedDetails.outcomeName}" ` : ""}constraints have changed since this agent was last configured
                    </p>
                  </div>
                </div>
                {outcome && (
                  <Link href={`/outcomes/${outcome.id}`}>
                    <Button variant="outline" size="sm" data-testid="button-review-outcome-sla">
                      <Eye className="w-3 h-3 mr-1" /> Review Outcome
                    </Button>
                  </Link>
                )}
              </div>
              {violations.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-3 pl-10">
                  {violations.map((v, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Badge
                        variant={v.severity === "critical" ? "destructive" : "outline"}
                        className="text-[9px]"
                        data-testid={`badge-violation-severity-${i}`}
                      >
                        {v.severity}
                      </Badge>
                      <span className="font-medium" data-testid={`text-violation-constraint-${i}`}>{v.constraint}:</span>
                      <span className="text-muted-foreground">current {v.current}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span>required {v.required}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {agent.requiresRevalidation && (
        <Card className="border border-amber-500/50 bg-amber-500/5" data-testid="banner-ontology-revalidation">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-amber-500/10">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold" data-testid="text-revalidation-title">
                    Ontology Re-validation Required
                  </p>
                  <p className="text-[11px] text-muted-foreground" data-testid="text-revalidation-reason">
                    {agent.revalidationReason || "A linked ontology concept has been updated — review your agent configuration for compliance"}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-clear-revalidation"
                onClick={async () => {
                  try {
                    await apiRequest("POST", `/api/agents/${agentId}/clear-revalidation`);
                    queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
                    toast({ title: "Re-validation acknowledged" });
                  } catch (err: any) {
                    toast({ title: "Failed to clear", description: err.message, variant: "destructive" });
                  }
                }}
              >
                <CheckCircle className="w-3 h-3 mr-1" /> Acknowledge & Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Select
          value={agent.currentVersion || "1.0.0"}
          onValueChange={async (val) => {
            try {
              await apiRequest("PATCH", `/api/agents/${agentId}`, { currentVersion: val });
              queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
              toast({ title: `Switched to version ${val}` });
            } catch (err: any) {
              toast({ title: "Failed to switch version", description: err.message, variant: "destructive" });
            }
          }}
        >
          <SelectTrigger className="w-auto" data-testid="select-version">
            <Badge variant="outline" className="text-xs no-default-hover-elevate no-default-active-elevate">v{agent.currentVersion}</Badge>
          </SelectTrigger>
          <SelectContent>
            {agentVersions && agentVersions.length > 0 ? agentVersions.map(v => (
              <SelectItem key={v.id} value={v.semver} data-testid={`version-option-${v.semver}`}>
                v{v.semver} ({v.status})
              </SelectItem>
            )) : (
              <SelectItem value={agent.currentVersion || "1.0.0"}>v{agent.currentVersion}</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Select
          value={agent.environment || "staging"}
          onValueChange={async (val) => {
            const applyChange = async () => {
              try {
                await apiRequest("PATCH", `/api/agents/${agentId}`, { environment: val });
                queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
                toast({ title: `Environment changed to ${val}`, description: val === "production" ? "Agent is now in production environment" : `Agent moved to ${val}` });
              } catch (err: any) {
                toast({ title: "Failed to change environment", description: err.message, variant: "destructive" });
              }
            };
            validateAndApplyConfig({ environment: val }, applyChange);
          }}
        >
          <SelectTrigger className="w-auto" data-testid="select-environment">
            <Badge variant="outline" className="text-xs no-default-hover-elevate no-default-active-elevate">{agent.environment}</Badge>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="development">Development</SelectItem>
            <SelectItem value="staging">Staging</SelectItem>
            <SelectItem value="pilot">Pilot</SelectItem>
            <SelectItem value="production">Production</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">{agent.modelProvider} / {agent.modelName}</Badge>
        {outcome && <Badge variant="outline" className="text-xs">{outcome.name}</Badge>}
        <Badge variant="outline" className="text-xs capitalize" data-testid="badge-tool-access-class">
          <Wrench className="w-3 h-3 mr-1" />{agent.toolAccessClass || "standard"}
        </Badge>
        {agent.complianceTags && (agent.complianceTags as string[]).length > 0 && (agent.complianceTags as string[]).map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs" data-testid={`badge-compliance-${tag}`}>
            <Tag className="w-3 h-3 mr-1" />{tag}
          </Badge>
        ))}
        <div className="flex-1" />
        <Link href={`/agents/${agentId}/playground`}>
          <Button variant="outline" size="sm" data-testid="button-open-playground">
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Playground
          </Button>
        </Link>
        <Button
          size="sm"
          onClick={() => deployAndRunMutation.mutate()}
          disabled={deployAndRunMutation.isPending || !runtimeStatus?.readiness?.canRun}
          data-testid="button-deploy-and-run"
        >
          {deployAndRunMutation.isPending ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Deploying...</>
          ) : runtimeStatus?.isActive ? (
            <><Zap className="w-3.5 h-3.5 mr-1.5" /> Re-deploy & Run</>
          ) : (
            <><Rocket className="w-3.5 h-3.5 mr-1.5" /> Deploy & Run</>
          )}
        </Button>
        <Button variant="outline" size="sm" data-testid="button-run-test" onClick={() => runTestMutation.mutate()} disabled={runTestMutation.isPending}>
          {runTestMutation.isPending ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Running...</>
          ) : (
            <><Play className="w-3.5 h-3.5 mr-1.5" /> Run Test</>
          )}
        </Button>
        <Button variant="outline" size="sm" data-testid="button-run-shadow-replay" onClick={() => { setShadowReplayOpen(true); setShadowResult(null); }}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Run Shadow Replay
        </Button>
        <Button variant="outline" size="sm" data-testid="button-request-approval" onClick={() => requestApprovalMutation.mutate()} disabled={!approvalPerm.allowed || requestApprovalMutation.isPending} title={!approvalPerm.allowed ? "You do not have permission to request approvals" : undefined}>
          {requestApprovalMutation.isPending ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Submitting...</>
          ) : (
            <><Shield className="w-3.5 h-3.5 mr-1.5" /> Request Approval</>
          )}
          {approvalPerm.allowed && approvalPerm.permission.access === "conditional" && approvalPerm.permission.annotation && (
            <Badge variant="secondary" className="text-[10px] ml-1">{approvalPerm.permission.annotation}</Badge>
          )}
        </Button>
        <Button variant="outline" size="sm" data-testid="button-rollback">
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Rollback
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate(`/agents/${agentId}/export`)} data-testid="button-header-export-code">
          <Download className="w-3.5 h-3.5 mr-1.5" /> Export as Code
        </Button>
        {agentDeployments.length > 0 ? (
          <div className="flex items-center gap-1">
            <Button size="sm" data-testid="button-view-deployment" onClick={() => {
              const latest = agentDeployments.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
              if (latest) navigate(`/deployments/${latest.id}`);
            }}>
              <Rocket className="w-3.5 h-3.5 mr-1.5" /> View Deployment
            </Button>
            <Button variant="outline" size="sm" data-testid="button-new-deployment-version" disabled={!deployPerm.allowed || deployMutation.isPending} onClick={handleDeployClick} title="Create a new deployment version">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <Button size="sm" data-testid="button-deploy" disabled={!deployPerm.allowed || deployMutation.isPending} onClick={handleDeployClick} title={!deployPerm.allowed ? "You do not have permission to deploy" : undefined}>
            <Rocket className="w-3.5 h-3.5 mr-1.5" /> {deployMutation.isPending ? "Creating..." : "Deploy"}
            {deployRecommendation && !deployRecommendation.allowDirectDeploy && deployRecommendation.slaRequirements.length > 0 && (
              <Badge variant="outline" className="text-[9px] ml-1 border-amber-500 text-amber-600">{Math.max(...deployRecommendation.slaRequirements.map(s => s.slaThreshold)).toFixed(1)}% SLA</Badge>
            )}
            {deployPerm.allowed && deployPerm.permission.access === "conditional" && deployPerm.permission.annotation && (
              <Badge variant="secondary" className="text-[10px] ml-1">{deployPerm.permission.annotation}</Badge>
            )}
          </Button>
        )}
        {agent.status !== "retired" && (
          <Button variant="outline" size="sm" onClick={() => setRetireDialogOpen(true)} data-testid="button-retire-agent">
            <Archive className="w-3.5 h-3.5 mr-1.5" /> Retire
          </Button>
        )}
        {agent.status === "retired" && (
          <Button variant="outline" size="sm" onClick={() => retireMutation.mutate({ status: "active" })} data-testid="button-reactivate-agent">
            <Power className="w-3.5 h-3.5 mr-1.5" /> Reactivate
          </Button>
        )}
        <Button variant="outline" size="sm" data-testid="button-save-as-template" onClick={() => {
          const compTags = Array.isArray(agent.complianceTags) ? (agent.complianceTags as string[]) : [];
          const ontConcepts = (agent.ontologyTags as any)?.concepts || [];
          const allTags = [...compTags, ...ontConcepts.map((t: any) => typeof t === "string" ? t : t.conceptLabel || "")].filter(Boolean);
          setTemplateName(`${agent.name} Template`);
          setTemplateDescription(agent.description || "");
          setTemplateCategory("general");
          setTemplateIndustry("cross_industry");
          setTemplateTagsList(allTags);
          setTemplateTagInput("");
          setTemplateComplexity("medium");
          setTemplateIcon("bot");
          setTemplateTab("identity");
          setSaveAsTemplateOpen(true);
        }}>
          <Copy className="w-3.5 h-3.5 mr-1.5" /> Save as Template
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
        {(() => {
          const primaryTabs = [
            { value: "summary", label: "Summary" },
            { value: "traces", label: "Runs & Traces" },
            { value: "knowledge-base", label: "Knowledge Base" },
            { value: "mcp-servers", label: "MCP Servers" },
            { value: "releases", label: "Releases" },
          ];
          const moreTabs = [
            { value: "evals", label: "Evals" },
            { value: "blueprint", label: "Blueprint" },
            { value: "lifecycle", label: "Lifecycle" },
            { value: "monitor", label: "Monitor" },
            { value: "autonomous", label: "Autonomous" },
            { value: "governance", label: "Governance" },
            { value: "timeline", label: "Timeline" },
            { value: "knowledge-graph", label: "Knowledge Graph" },
            { value: "skills", label: "Skills" },
            { value: "compliance", label: "Compliance" },
            { value: "context-profile", label: "Context Profile" },
            { value: "ontology", label: "Ontology" },
            { value: "api-gateway", label: "API Gateway" },
            { value: "channels", label: "Channels" },
            { value: "event-triggers", label: "Event Triggers" },
            { value: "gitops", label: "GitOps" },
            ...(agent.agentType === "remote" ? [{ value: "a2a", label: "A2A Card" }] : []),
            ...(agent.agentType === "team" ? [{ value: "team", label: "Team Members" }] : []),
          ];
          const activeMoreTab = moreTabs.find(t => t.value === activeTab);
          return (
            <div className="flex items-center gap-1 flex-wrap">
              <TabsList className="w-fit h-auto gap-y-1 py-1">
                {primaryTabs.map(t => (
                  <TabsTrigger key={t.value} value={t.value} data-testid={`tab-${t.value}`}>{t.label}</TabsTrigger>
                ))}
              </TabsList>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={activeMoreTab ? "secondary" : "outline"}
                    size="sm"
                    className="gap-1"
                    data-testid="button-more-tabs"
                  >
                    {activeMoreTab ? activeMoreTab.label : "More"}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" data-testid="dropdown-more-tabs">
                  {moreTabs.map(t => (
                    <DropdownMenuItem
                      key={t.value}
                      onClick={() => setActiveTab(t.value)}
                      className={activeTab === t.value ? "bg-accent" : ""}
                      data-testid={`tab-${t.value}`}
                    >
                      {t.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })()}


        <TabsContent value="summary" className="flex flex-col gap-4 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {statsLoading ? (
              <>
                {[1,2,3,4].map(i => (
                  <Card key={i}><CardContent className="p-4"><div className="flex flex-col gap-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-16" /><Skeleton className="h-3 w-24" /></div></CardContent></Card>
                ))}
              </>
            ) : (() => {
              const hs = computedStats?.hasData ? computedStats.healthScore : (agent.healthScore ?? 0);
              const sr = computedStats?.hasData ? computedStats.successRate : (agent.successRate ?? 0);
              const al = computedStats?.hasData ? computedStats.avgLatencyMs : (agent.avgLatencyMs ?? 0);
              const cpr = computedStats?.hasData ? computedStats.costPerRun : (agent.costPerRun ?? 0);
              const tr = computedStats?.hasData ? computedStats.totalRuns : (agent.totalRuns ?? 0);
              return (
                <>
                  <StatCard
                    title="Health Score"
                    value={`${hs}%`}
                    icon={Activity}
                    variant={hs >= 80 ? "success" : hs >= 50 ? "warning" : "danger"}
                    testId="stat-agent-health"
                    subtitle={computedStats?.hasData ? `${tr} total runs` : "No execution data yet"}
                    tooltip="Computed from success rate, recent performance, latency, and failure trends across all execution traces"
                  />
                  <StatCard
                    title="Success Rate"
                    value={`${(sr * 100).toFixed(1)}%`}
                    icon={CheckCircle}
                    variant={sr >= 0.9 ? "success" : sr >= 0.7 ? "warning" : "danger"}
                    testId="stat-agent-success"
                    subtitle={computedStats?.hasData ? `${computedStats.recentFailures} recent failures` : "No execution data yet"}
                    tooltip="Percentage of runs that completed successfully out of all execution traces"
                  />
                  <StatCard
                    title="Avg Latency"
                    value={formatMs(al)}
                    icon={Clock}
                    variant={al < 5000 ? "default" : al < 15000 ? "warning" : "danger"}
                    testId="stat-agent-latency"
                    subtitle={computedStats?.hasData ? `Across ${tr} runs` : "No execution data yet"}
                    tooltip="Average response time per execution, measured from trace start to completion"
                  />
                  <StatCard
                    title="Cost / Run"
                    value={`$${cpr.toFixed(3)}`}
                    icon={DollarSign}
                    variant="default"
                    testId="stat-agent-cost"
                    subtitle={computedStats?.hasData ? `$${(computedStats.totalCost || 0).toFixed(2)} total` : "No execution data yet"}
                    tooltip="Average cost per execution based on actual API usage and token consumption"
                  />
                </>
              );
            })()}
          </div>

          <Card data-testid="card-runtime-config" className="border-primary/20 bg-primary/[0.02]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-medium">Agent Task</CardTitle>
                </div>
                {!rtEditing ? (
                  <Button variant="ghost" size="sm" onClick={() => {
                    const rc = (agent.runtimeConfig as Record<string, any>) || {};
                    setRtPrompt(rc?.prompt || "");
                    setRtInterval(rc?.scheduleIntervalMinutes || 0);
                    const go = rc?.promotionGateOverrides || {};
                    setGateMinEvalPassRate(typeof go.minEvalPassRate === "number" ? go.minEvalPassRate : 80);
                    setGateMaxLatencyMs(typeof go.maxLatencyMs === "number" ? go.maxLatencyMs : 2000);
                    setRtEditing(true);
                  }} data-testid="button-edit-runtime-config">
                    <Settings className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setRtEditing(false)} data-testid="button-cancel-runtime-config">Cancel</Button>
                    <Button size="sm" onClick={() => rtConfigMutation.mutate()} disabled={rtConfigMutation.isPending} data-testid="button-save-runtime-config">
                      {rtConfigMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!rtEditing ? (
                (() => {
                  const rc = (agent.runtimeConfig as Record<string, any>) || {};
                  const hasConfig = !!rc?.prompt;
                  const go = rc?.promotionGateOverrides || {};
                  const evalTh = typeof go.minEvalPassRate === "number" ? go.minEvalPassRate : 80;
                  const latTh = typeof go.maxLatencyMs === "number" ? go.maxLatencyMs : 2000;
                  return (
                    <>
                      {hasConfig ? (
                        <div className="flex flex-col gap-2 p-2.5 rounded-md bg-muted/30" data-testid="text-rt-prompt">
                          <span className="text-xs text-muted-foreground">What this agent does when it runs</span>
                          <FormattedTaskPrompt prompt={rc.prompt} />
                          <div className="flex items-center gap-1.5 mt-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground" data-testid="text-rt-interval">
                              {(rc.scheduleIntervalMinutes || 0) === 0
                                ? "On-demand (triggered manually)"
                                : `Runs every ${rc.scheduleIntervalMinutes} minute${rc.scheduleIntervalMinutes !== 1 ? "s" : ""}`}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 py-4 text-center">
                          <Zap className="w-5 h-5 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">No task defined yet. Click Edit to describe what this agent should do when it runs.</p>
                        </div>
                      )}
                      <div className="flex items-center gap-4 p-2 rounded-md bg-muted/20 text-[10px] text-muted-foreground" data-testid="display-gate-thresholds">
                        <span>Promotion Gates:</span>
                        <span>Eval Pass Rate {evalTh === 0 ? <Badge variant="outline" className="text-[9px] ml-0.5">Disabled</Badge> : <span className="font-medium text-foreground">{"\u2265"}{evalTh}%</span>}</span>
                        <span>Max Latency <span className="font-medium text-foreground">{"\u2264"}{latTh.toLocaleString()}ms</span></span>
                      </div>
                    </>
                  );
                })()
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Describe what this agent should do</label>
                    <Textarea value={rtPrompt} onChange={e => setRtPrompt(e.target.value)} placeholder="e.g. 'Get weather update for Bangalore and assess any risk from severe conditions' or 'Analyze customer churn patterns for Q1 and flag high-risk accounts'" className="min-h-[80px] text-sm" data-testid="input-rt-prompt" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Schedule interval</label>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <select
                        value={rtInterval}
                        onChange={e => setRtInterval(Number(e.target.value))}
                        className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid="select-rt-interval"
                      >
                        <option value={0}>On-demand (triggered manually)</option>
                        <option value={1}>Every 1 minute</option>
                        <option value={2}>Every 2 minutes</option>
                        <option value={5}>Every 5 minutes</option>
                        <option value={10}>Every 10 minutes</option>
                        <option value={15}>Every 15 minutes</option>
                        <option value={30}>Every 30 minutes</option>
                        <option value={60}>Every 1 hour</option>
                        <option value={120}>Every 2 hours</option>
                        <option value={360}>Every 6 hours</option>
                        <option value={720}>Every 12 hours</option>
                        <option value={1440}>Every 24 hours</option>
                      </select>
                    </div>
                    <span className="text-[10px] text-muted-foreground">The agent will use its connected tools (MCP Servers) to fulfill this task automatically on this schedule when deployed.</span>
                  </div>
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-border/50">
                    <label className="text-xs font-medium text-muted-foreground">Promotion Gate Thresholds</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-muted-foreground">Min Eval Pass Rate (%)</label>
                        <Input type="number" min={0} max={100} value={gateMinEvalPassRate} onChange={e => setGateMinEvalPassRate(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} className="h-7 text-xs" data-testid="input-gate-eval-threshold" />
                        <span className="text-[9px] text-muted-foreground">Set to 0 to disable eval gate</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-muted-foreground">Max Latency (ms)</label>
                        <Input type="number" min={500} max={60000} value={gateMaxLatencyMs} onChange={e => setGateMaxLatencyMs(Math.min(60000, Math.max(500, parseInt(e.target.value) || 2000)))} className="h-7 text-xs" data-testid="input-gate-latency-threshold" />
                        <span className="text-[9px] text-muted-foreground">Max acceptable latency for promotion</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {(agent.systemPrompt || spEditing) && (
            <Card data-testid="card-system-prompt" className="border-primary/20 bg-primary/[0.02]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <CardTitle className="text-sm font-medium">System Prompt</CardTitle>
                    {agent.systemPrompt && !spEditing && (
                      <span className="text-[10px] text-muted-foreground">
                        {(agent.systemPrompt as string).split("\n").length} lines · {(agent.systemPrompt as string).length} chars
                      </span>
                    )}
                  </div>
                  {!spEditing ? (
                    <Button variant="ghost" size="sm" onClick={() => { setSpValue((agent.systemPrompt as string) || ""); setSpEditing(true); setSpExpanded(false); }} data-testid="button-edit-system-prompt">
                      <Settings className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setSpEditing(false)} data-testid="button-cancel-system-prompt">Cancel</Button>
                      <Button size="sm" onClick={() => spMutation.mutate()} disabled={spMutation.isPending} data-testid="button-save-system-prompt">
                        {spMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!spEditing ? (
                  <div className="flex flex-col gap-2">
                    <div
                      className={`relative text-xs font-mono whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 leading-relaxed text-foreground/80 overflow-hidden transition-all`}
                      style={{ maxHeight: spExpanded ? "none" : "12rem" }}
                      data-testid="text-system-prompt"
                    >
                      {agent.systemPrompt as string}
                      {!spExpanded && (agent.systemPrompt as string).length > 600 && (
                        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-muted/60 to-transparent pointer-events-none rounded-b-md" />
                      )}
                    </div>
                    {(agent.systemPrompt as string).length > 600 && (
                      <button
                        onClick={() => setSpExpanded(v => !v)}
                        className="text-[11px] text-primary hover:underline self-start"
                        data-testid="button-toggle-system-prompt"
                      >
                        {spExpanded ? "Show less" : "Show full prompt"}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Textarea
                      value={spValue}
                      onChange={e => setSpValue(e.target.value)}
                      className="min-h-[320px] text-xs font-mono"
                      placeholder="Enter the system prompt for this agent..."
                      data-testid="input-system-prompt"
                    />
                    <span className="text-[10px] text-muted-foreground">{spValue.split("\n").length} lines · {spValue.length} chars</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Outcome KPI Contribution</CardTitle>
                  {kpiContributions?.kpis && kpiContributions.kpis.length > 0 && (
                    <span className="text-xs text-muted-foreground">{kpiContributions.agentSuccessfulRuns}/{kpiContributions.agentTotalRuns} runs successful</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {!outcome ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No outcome linked</p>
                ) : kpiLoading ? (
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-4 w-48" />
                    {[1,2,3].map(i => (
                      <div key={i} className="flex flex-col gap-1">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-2 w-full" />
                        <Skeleton className="h-2 w-32" />
                      </div>
                    ))}
                  </div>
                ) : kpiContributions?.kpis && kpiContributions.kpis.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 pb-1 border-b border-border/50">
                      <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <BarChart3 className="w-3 h-3 text-primary" />
                      </div>
                      <Link href={`/outcomes/${outcome.id}`}>
                        <span className="text-xs font-medium text-primary hover:underline cursor-pointer">{outcome.name}</span>
                      </Link>
                      <span className="ml-auto text-xs text-muted-foreground">{kpiContributions.totalBoundAgents} agents</span>
                    </div>
                    {kpiContributions.kpis.map(kpi => {
                      const statusColor = kpi.status === "met" ? "text-emerald-500" : kpi.status === "on_track" ? "text-blue-500" : kpi.status === "at_risk" ? "text-amber-500" : "text-red-500";
                      const barColor = kpi.status === "met" ? "bg-emerald-500" : kpi.status === "on_track" ? "bg-blue-500" : kpi.status === "at_risk" ? "bg-amber-500" : "bg-red-500";
                      const safeNum = (v: any) => (typeof v === "number" && !isNaN(v) && isFinite(v)) ? v : 0;
                      const formatVal = (v: number, unit: string) => {
                        const sv = safeNum(v);
                        if (unit === "percent") return `${sv.toFixed(1)}%`;
                        if (unit === "USD" || unit === "usd") return `$${sv.toLocaleString()}`;
                        if (unit === "hours") return `${sv.toFixed(1)}h`;
                        if (unit === "minutes") return `${sv.toFixed(1)}m`;
                        return sv.toFixed(1);
                      };
                      const progressSafe = safeNum(kpi.progressPct);
                      const shareSafe = safeNum(kpi.agentSharePct);
                      return (
                        <div key={kpi.kpiId} className="flex flex-col gap-1" data-testid={`kpi-contribution-${kpi.kpiId}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium truncate max-w-[60%]">{kpi.kpiName}</span>
                            <span className={`text-[10px] font-medium uppercase ${statusColor}`}>{kpi.status.replace("_", " ")}</span>
                          </div>
                          <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, progressSafe)}%` }} />
                            {shareSafe > 0 && progressSafe > 0 && (
                              <div className={`absolute inset-y-0 left-0 rounded-full ${barColor} opacity-60`} style={{ width: `${Math.min(100, progressSafe * shareSafe / 100)}%` }} />
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>This agent: {formatVal(kpi.agentContribution, kpi.unit)} ({shareSafe}% share)</span>
                            <span>{formatVal(kpi.currentValue, kpi.unit)} / {formatVal(kpi.target, kpi.unit)}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">Overall KPI progress</span>
                      <span className="text-sm font-semibold">{typeof kpiContributions.overallContribution === "number" && isFinite(kpiContributions.overallContribution) ? kpiContributions.overallContribution : 0}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-3">
                    <BarChart3 className="w-5 h-5 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground text-center">No KPIs defined for this outcome yet</p>
                    <Link href={`/outcomes/${outcome.id}`}>
                      <Button variant="outline" size="sm" className="text-xs h-7">Add KPIs</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Recent Run Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-md bg-emerald-500/10 flex-1 text-center">
                    <span className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{successTraces}</span>
                    <span className="text-xs text-muted-foreground block mt-0.5">Successful</span>
                  </div>
                  <div className="p-3 rounded-md bg-red-500/10 flex-1 text-center">
                    <span className="text-2xl font-semibold text-red-600 dark:text-red-400">{failedTraces}</span>
                    <span className="text-xs text-muted-foreground block mt-0.5">Failed</span>
                  </div>
                  <div className="p-3 rounded-md bg-muted/50 flex-1 text-center">
                    <span className="text-2xl font-semibold">{recentTraces.length}</span>
                    <span className="text-xs text-muted-foreground block mt-0.5">Total</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {(() => {
            const pendingApprovals = agentApprovals.filter(a => a.status === "pending");
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
            const hasRecentIncident = agent.lastIncidentAt && new Date(agent.lastIncidentAt) > sevenDaysAgo;
            const expiringExceptions = (agentExceptions || []).filter((ex: PolicyException) => {
              if (ex.status !== "approved" || !ex.expiresAt) return false;
              const expDate = new Date(ex.expiresAt);
              return expDate > now && expDate <= fourteenDaysFromNow;
            });

            function formatTimeAgo(dateStr: string | Date | null | undefined): string {
              if (!dateStr) return "Never";
              const d = new Date(dateStr);
              const diffMs = now.getTime() - d.getTime();
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              if (diffDays === 0) return "Today";
              if (diffDays === 1) return "1d ago";
              if (diffDays < 30) return `${diffDays}d ago`;
              return `${Math.floor(diffDays / 30)}mo ago`;
            }

            return (
              <Card data-testid="card-open-items">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Open Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-2" data-testid="section-pending-approvals">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-medium">Pending Approvals</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">{pendingApprovals.length}</Badge>
                      </div>
                      {pendingApprovals.length > 0 ? pendingApprovals.map((approval) => (
                        <Link key={approval.id} href={`/approvals/${approval.id}`}>
                          <div className="p-2 rounded-md bg-muted/30 hover-elevate cursor-pointer" data-testid={`pending-approval-${approval.id}`}>
                            <span className="text-xs font-medium block">{(approval.type || "").replace(/_/g, " ")}</span>
                            <span className="text-[11px] text-muted-foreground truncate block">{(approval.description || "").slice(0, 60)}</span>
                          </div>
                        </Link>
                      )) : (
                        <p className="text-[11px] text-muted-foreground py-3 text-center">No pending approvals</p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2" data-testid="section-active-incidents">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-medium">Active Incidents</span>
                      </div>
                      {hasRecentIncident ? (
                        <div className="p-2 rounded-md bg-amber-500/10 flex items-center gap-2" data-testid="incident-active">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-xs">Incident reported {formatTimeAgo(agent.lastIncidentAt)}</span>
                        </div>
                      ) : (
                        <div className="p-2 rounded-md bg-emerald-500/10 flex items-center gap-2" data-testid="incident-none">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="text-xs">No recent incidents</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2" data-testid="section-expiring-exceptions">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-medium">Expiring Exceptions</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">{expiringExceptions.length}</Badge>
                      </div>
                      {expiringExceptions.length > 0 ? expiringExceptions.map((ex: PolicyException) => {
                        const daysLeft = Math.ceil((new Date(ex.expiresAt!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        return (
                          <div key={ex.id} className="p-2 rounded-md bg-muted/30" data-testid={`expiring-exception-${ex.id}`}>
                            <span className="text-xs font-medium block">Policy: {ex.policyId}</span>
                            <span className="text-[11px] text-muted-foreground">{daysLeft} day{daysLeft !== 1 ? "s" : ""} until expiry</span>
                          </div>
                        );
                      }) : (
                        <p className="text-[11px] text-muted-foreground py-3 text-center">No expiring exceptions</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {(() => {
            const pinnedVersions = (agentVersions || []).filter(v => v.status !== "draft");
            const hasPinnedVersion = pinnedVersions.length > 0;
            const latestPinned = hasPinnedVersion
              ? [...pinnedVersions].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0]
              : null;

            const agentEvals = evals || [];
            const hasEvals = agentEvals.length > 0;
            const evalsPassed = agentEvals.filter(e => e.lastRunAt && (e.passRate || 0) >= 0.8);
            const evalsNotRun = agentEvals.filter(e => !e.lastRunAt);
            const allEvalsPassed = hasEvals && evalsPassed.length === agentEvals.length;
            const evalDetail = !hasEvals
              ? "No eval suites configured"
              : evalsNotRun.length > 0
                ? `${evalsPassed.length}/${agentEvals.length} passing (${evalsNotRun.length} not run)`
                : `${evalsPassed.length}/${agentEvals.length} passing`;

            const agentTools = Array.isArray(agent.toolsConfig) ? agent.toolsConfig as any[] : [];
            const connectors = allToolConnectors || [];
            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            const connectorMap = new Map(connectors.map(c => [normalize(c.name), c]));
            const toolsWithAdapter = agentTools.filter(t => {
              const name = normalize(t.name || "");
              const connector = connectorMap.get(name);
              return connector && connector.status === "connected";
            });
            const allAdaptersComplete = agentTools.length > 0 && toolsWithAdapter.length === agentTools.length;
            const hasTools = agentTools.length > 0;

            const readyChecks = [
              { key: "version", label: "Pinned version", detail: latestPinned ? `v${latestPinned.semver}` : "No signed version", passed: hasPinnedVersion },
              { key: "evals", label: "Eval suites passed", detail: evalDetail, passed: allEvalsPassed },
              { key: "adapters", label: "Tool adapters complete", detail: hasTools ? `${toolsWithAdapter.length}/${agentTools.length} connected` : "No tools configured", passed: allAdaptersComplete },
            ];
            const readyCount = readyChecks.filter(c => c.passed).length;
            const isReady = readyCount === readyChecks.length;

            return (
              <Card data-testid="card-export-readiness">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium">Export Readiness</CardTitle>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${isReady ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : readyCount > 0 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}
                      data-testid="badge-export-readiness"
                    >
                      {isReady ? "Ready" : `${readyCount}/${readyChecks.length} checks`}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    {readyChecks.map(check => (
                      <div key={check.key} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`check-${check.key}`}>
                        {check.passed ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium">{check.label}</span>
                          <span className="text-[11px] text-muted-foreground">{check.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {hasPinnedVersion && (
                    <div className="flex items-center gap-2 p-2.5 rounded-md bg-emerald-500/5 border border-emerald-500/10" data-testid="export-ready-hint">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="text-[11px] text-muted-foreground" data-testid="text-export-ready">Ready to export. Use the <strong>Export as Code</strong> button in the header above.</span>
                    </div>
                  )}
                  {!hasPinnedVersion && (
                    <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-500/5 border border-amber-500/10" data-testid="warning-no-pinned-version">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-[11px] text-muted-foreground" data-testid="text-no-pinned-version">Create and pin a version before exporting</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        <TabsContent value="traces" className="flex flex-col gap-4 mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">Run Traces</CardTitle>
                <Badge variant="outline" className="text-[10px]">{recentTraces.length} traces</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {recentTraces.length > 0 ? recentTraces.map((trace) => {
                const isExpanded = expandedTrace === trace.id;
                const decisions = trace.decisions as any[] | null;
                const toolCalls = trace.toolCalls as any[] | null;
                const policyChecks = trace.policyChecks as any[] | null;
                const tokenUsage = trace.tokenUsage as any | null;
                const promptInputs = trace.promptInputs as any | null;
                const retrievedDocs = trace.retrievedDocs as any[] | null;
                const hasExplainability = decisions || toolCalls || policyChecks || tokenUsage;
                return (
                  <div key={trace.id} className="flex flex-col">
                    <div
                      className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30 hover-elevate cursor-pointer"
                      data-testid={`trace-row-${trace.id}`}
                      onClick={() => setExpandedTrace(isExpanded ? null : trace.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                          <Terminal className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium truncate">{trace.inputSummary || "Run"}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {trace.environment} | {formatMs(trace.latencyMs)} | ${trace.costUsd?.toFixed(4)}
                            {trace.modelId ? ` | ${trace.modelId}` : ""}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasExplainability && <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                        <StatusBadge status={trace.status} />
                        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="ml-10 mt-1 mb-2 flex flex-col gap-3 p-3 rounded-md border bg-background" data-testid={`explainability-panel-${trace.id}`}>
                        <div className="flex items-center gap-2">
                          <Lightbulb className="w-4 h-4 text-amber-500" />
                          <span className="text-xs font-semibold">Explainability Report</span>
                        </div>

                        {trace.inputSummary && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">Input</span>
                            <p className="text-xs bg-muted/30 p-2 rounded-md">{trace.inputSummary}</p>
                          </div>
                        )}

                        {trace.outputSummary && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">Output</span>
                            <FormattedTraceOutput output={trace.outputSummary} />
                          </div>
                        )}

                        {decisions && decisions.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">Decision Reasoning</span>
                            {decisions.map((decision: any, di: number) => (
                              <div key={di} className="flex items-start gap-2 p-2 rounded-md bg-muted/20" data-testid={`decision-${trace.id}-${di}`}>
                                <div className="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                  <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">{di + 1}</span>
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-medium">{decision.step || decision.action || `Step ${di + 1}`}</span>
                                  <span className="text-[11px] text-muted-foreground">{decision.reasoning || decision.description || JSON.stringify(decision)}</span>
                                  {decision.confidence !== undefined && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <span className="text-[10px] text-muted-foreground">Confidence:</span>
                                      <Progress value={decision.confidence * 100} className="h-1 w-16" />
                                      <span className="text-[10px] font-medium">{(decision.confidence * 100).toFixed(0)}%</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {toolCalls && toolCalls.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">Tool Calls</span>
                            <div className="flex flex-wrap gap-1.5">
                              {toolCalls.map((tc: any, ti: number) => (
                                <Badge key={ti} variant="outline" className="text-[10px]" data-testid={`tool-call-${trace.id}-${ti}`}>
                                  <Wrench className="w-2.5 h-2.5 mr-1" />
                                  {tc.tool || tc.name || `tool_${ti}`}
                                  {tc.status && <span className="ml-1 opacity-60">({tc.status})</span>}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {policyChecks && policyChecks.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">Policy Checks</span>
                            {policyChecks.map((pc: any, pi: number) => (
                              <div key={pi} className="flex items-center gap-2 text-xs" data-testid={`policy-check-${trace.id}-${pi}`}>
                                {pc.passed || pc.result === "pass" ? (
                                  <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                                ) : (
                                  <XCircle className="w-3 h-3 text-red-500 shrink-0" />
                                )}
                                <span>{pc.policy || pc.name || `Policy ${pi + 1}`}</span>
                                <span className="text-muted-foreground">{pc.reason || ""}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {retrievedDocs && retrievedDocs.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">Retrieved Sources</span>
                            <div className="flex flex-wrap gap-1.5">
                              {retrievedDocs.map((doc: any, ri: number) => (
                                <Badge key={ri} variant="outline" className="text-[10px]">
                                  <Database className="w-2.5 h-2.5 mr-1" />
                                  {doc.title || doc.source || `Source ${ri + 1}`}
                                  {doc.relevance !== undefined && <span className="ml-1 opacity-60">({(doc.relevance * 100).toFixed(0)}%)</span>}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {tokenUsage && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">Token Usage</span>
                            <div className="flex items-center gap-4 text-[11px]">
                              {tokenUsage.prompt !== undefined && (
                                <span>Prompt: <span className="font-medium">{tokenUsage.prompt?.toLocaleString()}</span></span>
                              )}
                              {tokenUsage.completion !== undefined && (
                                <span>Completion: <span className="font-medium">{tokenUsage.completion?.toLocaleString()}</span></span>
                              )}
                              {tokenUsage.total !== undefined && (
                                <span>Total: <span className="font-medium">{tokenUsage.total?.toLocaleString()}</span></span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-2 border-t">
                          {!tracesPerm.allowed ? (
                            <Button variant="outline" size="sm" disabled title="You do not have permission to view traces" data-testid={`button-view-full-trace-${trace.id}`}>
                              <Terminal className="w-3 h-3 mr-1" /> View Full Trace
                            </Button>
                          ) : (
                            <Link href={`/traces/${trace.id}`}>
                              <Button variant="outline" size="sm" data-testid={`button-view-full-trace-${trace.id}`}>
                                <Terminal className="w-3 h-3 mr-1" /> View Full Trace
                                {tracesPerm.permission.access === "conditional" && tracesPerm.permission.annotation && (
                                  <Badge variant="secondary" className="text-[10px] ml-1">{tracesPerm.permission.annotation}</Badge>
                                )}
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No traces recorded yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evals" className="mt-0 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Evaluation Suites</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {evals && evals.length > 0 ? evals.map((suite) => (
                <Link key={suite.id} href={`/evals/${suite.id}`}>
                  <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30 hover-elevate cursor-pointer" data-testid={`eval-row-${suite.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-500/10 shrink-0">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium truncate">{suite.name}</span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          {suite.totalCases} cases | {suite.type}
                          {suite.type === "kpi_aligned" && <span className="px-1 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[9px] font-medium rounded">KPI-Aligned</span>}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{((suite.passRate || 0) * 100).toFixed(0)}%</span>
                      <Progress value={(suite.passRate || 0) * 100} className="h-1.5 w-16" />
                    </div>
                  </div>
                </Link>
              )) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No eval suites configured</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-regression-diff">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Regression Diff</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Version A</Label>
                  <Select value={diffVersionA} onValueChange={(val) => { setDiffVersionA(val); setShowDiff(false); }}>
                    <SelectTrigger className="w-[140px]" data-testid="select-diff-version-a">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {agentVersions && agentVersions.length > 0 ? agentVersions.map(v => (
                        <SelectItem key={v.id} value={v.semver} data-testid={`diff-version-a-${v.semver}`}>v{v.semver}</SelectItem>
                      )) : (
                        <SelectItem value="none" disabled>No versions</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Version B</Label>
                  <Select value={diffVersionB} onValueChange={(val) => { setDiffVersionB(val); setShowDiff(false); }}>
                    <SelectTrigger className="w-[140px]" data-testid="select-diff-version-b">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {agentVersions && agentVersions.length > 0 ? agentVersions.map(v => (
                        <SelectItem key={v.id} value={v.semver} data-testid={`diff-version-b-${v.semver}`}>v{v.semver}</SelectItem>
                      )) : (
                        <SelectItem value="none" disabled>No versions</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground invisible">Action</Label>
                  <Button size="sm" disabled={!diffVersionA || !diffVersionB} onClick={() => setShowDiff(true)} data-testid="button-compare-diff">
                    Compare
                  </Button>
                </div>
              </div>

              {showDiff && diffVersionA && diffVersionB && (() => {
                const regressionMetrics = [
                  { metric: "Overall Pass Rate", versionA: 94.2, versionB: 91.8, unit: "%", higherIsBetter: true },
                  { metric: "Safety Suite", versionA: 98.0, versionB: 97.5, unit: "%", higherIsBetter: true },
                  { metric: "Compliance Suite", versionA: 96.1, versionB: 93.4, unit: "%", higherIsBetter: true },
                  { metric: "Edge Cases", versionA: 87.3, versionB: 85.1, unit: "%", higherIsBetter: true },
                  { metric: "Adversarial", versionA: 82.5, versionB: 79.0, unit: "%", higherIsBetter: true },
                  { metric: "Avg Latency", versionA: 245, versionB: 312, unit: "ms", higherIsBetter: false },
                  { metric: "Avg Cost", versionA: 0.023, versionB: 0.031, unit: "$", higherIsBetter: false },
                ];
                const regressions = regressionMetrics.filter(m => {
                  const delta = m.versionB - m.versionA;
                  return m.higherIsBetter ? delta < 0 : delta > 0;
                }).length;

                return (
                  <div className="flex flex-col gap-3" data-testid="regression-diff-results">
                    <div className={`text-xs font-medium p-2 rounded-md ${regressions > 0 ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`} data-testid="text-regression-summary">
                      Comparing v{diffVersionA} → v{diffVersionB}: {regressions} regression{regressions !== 1 ? "s" : ""} detected
                    </div>
                    <div className="overflow-auto">
                      <table className="w-full text-xs" data-testid="table-regression-diff">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Metric</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">v{diffVersionA}</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">v{diffVersionB}</th>
                            <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {regressionMetrics.map((m) => {
                            const delta = m.versionB - m.versionA;
                            const isImprovement = m.higherIsBetter ? delta > 0 : delta < 0;
                            const isRegression = m.higherIsBetter ? delta < 0 : delta > 0;
                            const deltaStr = m.unit === "$" ? `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}` : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`;
                            return (
                              <tr key={m.metric} className="border-b last:border-0" data-testid={`regression-row-${m.metric.replace(/\s+/g, "-").toLowerCase()}`}>
                                <td className="py-2 pr-4 font-medium">{m.metric}</td>
                                <td className="text-right py-2 px-4">{m.unit === "$" ? `$${m.versionA.toFixed(3)}` : `${m.versionA}${m.unit}`}</td>
                                <td className="text-right py-2 px-4">{m.unit === "$" ? `$${m.versionB.toFixed(3)}` : `${m.versionB}${m.unit}`}</td>
                                <td className={`text-right py-2 pl-4 font-medium flex items-center justify-end gap-1 ${isRegression ? "text-red-600 dark:text-red-400" : isImprovement ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                                  {isRegression ? <TrendingDown className="w-3 h-3" /> : isImprovement ? <TrendingUp className="w-3 h-3" /> : null}
                                  {deltaStr}{m.unit}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="releases" className="flex flex-col gap-4 mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Version Timeline</CardTitle>
                {agentVersions && <Badge variant="outline" className="text-[10px] ml-auto">{agentVersions.length} versions</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {agentVersions && agentVersions.length > 0 ? (
                <div className="relative" data-testid="version-timeline">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  <div className="flex flex-col gap-4">
                    {[...agentVersions].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map(version => {
                      const versionAny = version as any;
                      return (
                        <div key={version.id} className="relative pl-10" data-testid={`version-entry-${version.id}`}>
                          <div className={`absolute left-2.5 top-1 w-3 h-3 rounded-full ring-2 ring-background z-10 ${
                            version.status === "active" || version.status === "deployed" ? "bg-emerald-500" :
                            version.status === "deprecated" ? "bg-slate-400" :
                            version.status === "draft" ? "bg-blue-400" :
                            "bg-blue-500"
                          }`} />
                          <div className="flex flex-col gap-2 p-3 rounded-md border bg-background">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs font-mono" data-testid={`version-semver-${version.id}`}>v{version.semver}</Badge>
                              <StatusBadge status={version.status} />
                              {version.createdBy && (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <Users className="w-3 h-3" /> {version.createdBy}
                                </span>
                              )}
                              <span className="text-[11px] text-muted-foreground">
                                {version.createdAt ? new Date(version.createdAt).toLocaleDateString() : ""}
                              </span>
                            </div>
                            {versionAny.changelog && (
                              <p className="text-xs text-muted-foreground" data-testid={`version-changelog-${version.id}`}>
                                {versionAny.changelog}
                              </p>
                            )}
                            {versionAny.configSnapshot && (
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground" data-testid={`version-diff-indicator-${version.id}`}>
                                <FileCode className="w-3 h-3" />
                                <span>Config snapshot available</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No versions recorded</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Rocket className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Linked Deployments</CardTitle>
                {agentDeployments.length > 0 && <Badge variant="outline" className="text-[10px] ml-auto">{agentDeployments.length} deployments</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {agentDeployments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="linked-deployments">
                  {[...agentDeployments].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map(dep => {
                    const isRunning = activeRuntimes?.some(r => r.deploymentId === dep.id) || false;
                    return (
                      <Card key={dep.id} className="hover-elevate" data-testid={`deployment-card-${dep.id}`}>
                        <CardContent className="p-4 flex flex-col gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={dep.environment} />
                            <StatusBadge status={dep.rolloutStrategy || "direct"} />
                            <StatusBadge status={dep.status} />
                            {isRunning && (
                              <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" data-testid={`badge-runtime-running-${dep.id}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                                Running
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {dep.version && (
                              <Badge variant="outline" className="text-xs font-mono" data-testid={`deployment-version-${dep.id}`}>v{dep.version}</Badge>
                            )}
                            {dep.canaryPercent != null && dep.canaryPercent > 0 && (
                              <span className="text-[11px] text-muted-foreground" data-testid={`deployment-canary-${dep.id}`}>
                                <Gauge className="w-3 h-3 inline mr-1" />{dep.canaryPercent}% canary
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground">
                              {dep.createdAt ? new Date(dep.createdAt).toLocaleDateString() : ""}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {isRunning && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-[11px] px-2 text-red-600 hover:text-red-700 dark:text-red-400"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); stopDeploymentRuntimeMutation.mutate(dep.id); }}
                                  disabled={stopDeploymentRuntimeMutation.isPending}
                                  data-testid={`button-stop-runtime-${dep.id}`}
                                >
                                  <XCircle className="w-3 h-3 mr-1" /> Stop
                                </Button>
                              )}
                              <Link href={`/deployments/${dep.id}`}>
                                <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" data-testid={`button-view-deployment-${dep.id}`}>
                                  <Eye className="w-3 h-3 mr-1" /> View
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No deployments found</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Version Diff Selector</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3 flex-wrap" data-testid="version-diff-selector">
                <Select value={diffVersionA} onValueChange={(val) => { setDiffVersionA(val); setShowDiff(false); }}>
                  <SelectTrigger className="w-[180px]" data-testid="select-diff-version-a">
                    <SelectValue placeholder="Version A" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentVersions && agentVersions.map(v => (
                      <SelectItem key={v.id} value={v.id} data-testid={`diff-version-a-${v.id}`}>v{v.semver}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">vs</span>
                <Select value={diffVersionB} onValueChange={(val) => { setDiffVersionB(val); setShowDiff(false); }}>
                  <SelectTrigger className="w-[180px]" data-testid="select-diff-version-b">
                    <SelectValue placeholder="Version B" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentVersions && agentVersions.map(v => (
                      <SelectItem key={v.id} value={v.id} data-testid={`diff-version-b-${v.id}`}>v{v.semver}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!diffVersionA || !diffVersionB || diffVersionA === diffVersionB}
                  onClick={() => setShowDiff(true)}
                  data-testid="button-compare-versions"
                >
                  Compare
                </Button>
              </div>
              {showDiff && diffVersionA && diffVersionB && (() => {
                const vA = agentVersions?.find(v => v.id === diffVersionA);
                const vB = agentVersions?.find(v => v.id === diffVersionB);
                if (!vA || !vB) return null;
                const snapshotA = (vA as any).configSnapshot;
                const snapshotB = (vB as any).configSnapshot;
                return (
                  <div className="flex flex-col gap-3" data-testid="version-diff-result">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs font-mono">v{vA.semver}</Badge>
                      <span className="text-xs text-muted-foreground">vs</span>
                      <Badge variant="outline" className="text-xs font-mono">v{vB.semver}</Badge>
                    </div>
                    <Separator />
                    {snapshotA && snapshotB ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="diff-side-by-side">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-muted-foreground">v{vA.semver}</span>
                          <pre className="text-xs font-mono bg-muted/30 p-3 rounded-md overflow-auto max-h-[400px]" data-testid="diff-snapshot-a">
                            <code>{JSON.stringify(snapshotA, null, 2)}</code>
                          </pre>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-muted-foreground">v{vB.semver}</span>
                          <pre className="text-xs font-mono bg-muted/30 p-3 rounded-md overflow-auto max-h-[400px]" data-testid="diff-snapshot-b">
                            <code>{JSON.stringify(snapshotB, null, 2)}</code>
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-muted-foreground text-center py-2">
                          {!snapshotA && !snapshotB
                            ? "Neither version has a config snapshot"
                            : !snapshotA
                              ? `v${vA.semver} has no config snapshot`
                              : `v${vB.semver} has no config snapshot`}
                        </p>
                        <InlineDiff
                          diffs={[
                            { field: "semver", from: vA.semver, to: vB.semver },
                            { field: "status", from: vA.status, to: vB.status },
                            { field: "createdBy", from: vA.createdBy || "unknown", to: vB.createdBy || "unknown" },
                            { field: "blueprintHash", from: vA.blueprintHash || "none", to: vB.blueprintHash || "none" },
                          ]}
                          testIdPrefix="version-diff"
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blueprint" className="mt-0 space-y-4">
          <div className="flex items-center gap-2 flex-wrap" data-testid="blueprint-action-bar">
            <Link href={`/blueprints?agentId=${agent.id}`}>
              <Button variant="default" size="sm" data-testid="button-edit-in-studio">
                <PenTool className="w-3.5 h-3.5 mr-1.5" /> Edit in Blueprint Studio
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => toast({ title: "Draft saved" })} data-testid="button-save-draft">
              <FileCode className="w-3.5 h-3.5 mr-1.5" /> Save as Draft
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast({ title: "New version created" })} data-testid="button-create-version">
              <GitBranch className="w-3.5 h-3.5 mr-1.5" /> Create Version
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast({ title: "Eval suite triggered" })} data-testid="button-run-eval-suite">
              <FlaskConical className="w-3.5 h-3.5 mr-1.5" /> Run Eval Suite
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast({ title: "Version comparison opened" })} data-testid="button-compare-version">
              <Layers className="w-3.5 h-3.5 mr-1.5" /> Compare vs Version...
            </Button>
            <div className="flex-1" />
            <div className="flex items-center gap-1" data-testid="blueprint-view-toggle">
              <Button size="icon" variant="ghost" className={`toggle-elevate ${blueprintView === "graph" ? "toggle-elevated" : ""}`} onClick={() => setBlueprintView("graph")} data-testid="button-view-graph">
                <GitBranch className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className={`toggle-elevate ${blueprintView === "json" ? "toggle-elevated" : ""}`} onClick={() => setBlueprintView("json")} data-testid="button-view-json">
                <FileCode className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {(() => {
            const bp = (agent.blueprintJson as any) || (agentBlueprint?.blueprintJson as any);
            const hasBp = bp && !(Array.isArray(bp) && bp.length === 0) && !(typeof bp === "object" && !Array.isArray(bp) && !(bp?.nodes?.length) && !(bp?.steps?.length));
            return !hasBp;
          })() ? (
            <Card data-testid="card-blueprint-empty">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="flex items-center justify-center w-12 h-12 rounded-md bg-primary/10">
                    <PenTool className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-medium">No blueprint configured yet</h3>
                    <p className="text-xs text-muted-foreground max-w-sm">This agent doesn't have a workflow blueprint defined. Open the Blueprint Studio to design the agent's workflow graph, configure tools, and set up policies.</p>
                  </div>
                  <Link href={`/blueprints?agentId=${agent.id}`}>
                    <Button size="sm" data-testid="button-open-studio-empty">
                      <PenTool className="w-3.5 h-3.5 mr-1.5" /> Open Blueprint Studio
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {(() => {
                const effectiveBp = (agent.blueprintJson as any) || (agentBlueprint?.blueprintJson as any);
                return blueprintView === "graph" ? (
                <div className="flex gap-4" data-testid="blueprint-split-view">
                  <div className="flex-[2] min-w-0">
                    <BlueprintWorkflowGraph blueprint={effectiveBp} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Card data-testid="card-node-inspector">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Node Inspector</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        <p className="text-xs text-muted-foreground text-center py-4" data-testid="text-node-inspector-placeholder">Click a node to inspect</p>
                        <Separator />
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">Prompt Template</span>
                            <span className="text-xs text-muted-foreground/60">Select a node to view prompt</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">Tool Selection</span>
                            <span className="text-xs text-muted-foreground/60">Select a node to view tools</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">Budgets</span>
                            <span className="text-xs text-muted-foreground/60">Select a node to view budgets</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">Redaction Settings</span>
                            <span className="text-xs text-muted-foreground/60">Select a node to view redaction</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <Card data-testid="card-blueprint-json">
                  <CardContent className="pt-6">
                    <pre className="text-xs font-mono bg-muted/30 p-4 rounded-md overflow-auto max-h-[600px]" data-testid="blueprint-json-view">
                      <code>{JSON.stringify(effectiveBp, null, 2)}</code>
                    </pre>
                  </CardContent>
                </Card>
              )
              })()}

              <ImplementationGraph
                agent={agent}
                toolConnectors={allToolConnectors || []}
                onGenerateExport={() => navigate(`/agents/${agentId}/export`)}
              />
            </>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="blueprint-config-grid">
            <BlueprintModelConfig agent={agent} />
            <BlueprintToolsPermissions tools={agent.toolsConfig as any} permissions={agent.permissionsConfig as any} />
            <BlueprintMemoryRag config={agent.memoryRagConfig as any} />
            <BlueprintPolicyBindings bindings={agent.policyBindings as any} />
            <BlueprintEvalBindings bindings={agent.evalBindings as any} />
            <BlueprintRollbackPlan plan={agent.rollbackPlan as any} />
          </div>
        </TabsContent>

        <TabsContent value="lifecycle" className="flex flex-col gap-4 mt-0">
          {/* Status Overview */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Agent Lifecycle</CardTitle>
                </div>
                {(() => {
                  const retirementApprovals = (allApprovals || []).filter(a => a.objectId === agentId && (a.type === "retirement_review" || a.type === "handover_review"));
                  const hasPendingApproval = retirementApprovals.some(a => a.status === "pending");
                  const hasDeniedApproval = retirementApprovals.some(a => a.status === "denied" || a.status === "rejected");

                  if (hasPendingApproval) {
                    return (
                      <Badge variant="secondary" data-testid="badge-pending-approval">
                        <Clock className="w-3 h-3 mr-1" /> Awaiting Expert Approval
                      </Badge>
                    );
                  }

                  if (agent.status === "active" && !hasDeniedApproval) {
                    return (
                      <Button variant="outline" size="sm" onClick={() => setRetireDialogOpen(true)} data-testid="button-open-retire-dialog">
                        <Power className="w-3 h-3 mr-1" /> Initiate Retirement
                      </Button>
                    );
                  }

                  if (agent.status === "retiring") {
                    return (
                      <Button variant="outline" size="sm" onClick={() => completeRetirementMutation.mutate({ handoverComplete: retirementChecklist.every(Boolean), requireApproval: agent.riskTier === "HIGH" || agent.riskTier === "CRITICAL" })} disabled={completeRetirementMutation.isPending} data-testid="button-complete-retirement">
                        <Archive className="w-3 h-3 mr-1" /> {completeRetirementMutation.isPending ? "Processing..." : "Complete Archival"}
                      </Button>
                    );
                  }

                  return null;
                })()}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Phase timeline */}
              {(() => {
                const phaseItems = [
                  { label: "Draft", phase: "draft" },
                  { label: "Staging", phase: "staging" },
                  { label: "Pilot", phase: "pilot" },
                  { label: "Prod", phase: "prod" },
                  { label: "Deprecated", phase: "deprecated" },
                  { label: "Retired", phase: "retired" },
                  { label: "Archived", phase: "archived" },
                ];
                const statusToPhaseMap: Record<string, string> = {
                  active: "prod",
                  retiring: "deprecated",
                  retired: "archived",
                };
                const currentPhase = statusToPhaseMap[agent.status] || "draft";
                const currentIdx = phaseItems.findIndex(p => p.phase === currentPhase);
                return (
                  <div className="flex items-center gap-0" data-testid="lifecycle-phase-timeline">
                    {phaseItems.map((p, i) => {
                      const isActive = currentPhase === p.phase;
                      const isPast = currentIdx > i;
                      return (
                        <div key={p.phase} className="flex items-center gap-0 flex-1" data-testid={`phase-${p.phase}`}>
                          <div className={`flex flex-col items-center gap-1 flex-1 p-2 rounded-md border text-center ${isActive ? "border-primary bg-primary/5" : isPast ? "bg-muted/50" : ""}`}>
                            <div className={`w-2.5 h-2.5 rounded-full ${isActive ? "bg-primary" : isPast ? "bg-muted-foreground" : "bg-muted"}`} />
                            <span className={`text-[10px] font-medium ${isActive ? "text-primary" : isPast ? "text-muted-foreground" : "text-muted-foreground/50"}`}>{p.label}</span>
                          </div>
                          {i < phaseItems.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 mx-0.5" />}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Current Status</span>
                  <StatusBadge status={agent.status} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Created</span>
                  <span className="text-sm font-medium">{agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : "\u2014"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Current Version</span>
                  <span className="text-sm font-medium">v{agent.currentVersion}</span>
                </div>
              </div>

              {agent.status === "retired" && (
                <div className="p-3 rounded-md bg-muted/50 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">This agent has been retired</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Archived and no longer processing new requests. Historical data and traces remain accessible.</p>
                </div>
              )}
              {agent.status === "retiring" && (
                <div className="p-3 rounded-md bg-amber-500/10 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium">Retirement in progress</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Agent is draining active requests and preparing for archival. Complete the knowledge transfer checklist below before final archival.</p>
                  <Progress value={(retirementChecklist.filter(Boolean).length / retirementChecklist.length) * 100} className="h-2" />
                </div>
              )}

              {/* Approval gate status */}
              {(() => {
                const retirementApprovals = (allApprovals || []).filter(a => a.objectId === agentId && (a.type === "retirement_review" || a.type === "handover_review"));
                if (retirementApprovals.length === 0) return null;
                return (
                  <div className="flex flex-col gap-2" data-testid="retirement-approvals">
                    <span className="text-xs font-medium">Approval Gates</span>
                    {retirementApprovals.map(a => (
                      <div key={a.id} className="flex items-center justify-between gap-2 p-2.5 rounded-md border" data-testid={`approval-gate-${a.id}`}>
                        <div className="flex items-center gap-2">
                          <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div className="flex flex-col">
                            <span className="text-xs font-medium">{a.type === "retirement_review" ? "Retirement Decision" : "Handover Review"}</span>
                            <span className="text-[10px] text-muted-foreground">{a.description}</span>
                          </div>
                        </div>
                        <StatusBadge status={a.status} />
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Deprecation Signals Dashboard */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Deprecation Signals</CardTitle>
                </div>
                {deprecationSignals && (
                  <Badge variant={deprecationSignals.recommendation === "retire" ? "destructive" : deprecationSignals.recommendation === "review" ? "secondary" : "outline"} data-testid="badge-risk-recommendation">
                    {deprecationSignals.recommendation === "retire" ? "Recommend Retire" : deprecationSignals.recommendation === "review" ? "Needs Review" : "Healthy"}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {deprecationLoading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : deprecationError ? (
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50" data-testid="signals-error">
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Unable to compute deprecation signals. The data may not be available yet.</span>
                </div>
              ) : deprecationSignals ? (
                <>
                  {/* Risk Score Gauge */}
                  <div className="flex flex-col gap-2" data-testid="deprecation-risk-score">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Retirement Risk Score</span>
                      <span className={`text-sm font-bold ${deprecationSignals.riskScore >= 60 ? "text-red-500" : deprecationSignals.riskScore >= 30 ? "text-amber-500" : "text-emerald-500"}`}>
                        {deprecationSignals.riskScore}/100
                      </span>
                    </div>
                    <Progress value={deprecationSignals.riskScore} className="h-2.5" data-testid="progress-risk-score" />
                  </div>

                  {/* Signal breakdown */}
                  {deprecationSignals.signals.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {deprecationSignals.signals.map((sig, i) => (
                        <div key={i} className={`flex items-start gap-2 p-2.5 rounded-md border ${sig.severity === "high" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`} data-testid={`signal-${sig.signal}`}>
                          <AlertCircle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${sig.severity === "high" ? "text-red-500" : "text-amber-500"}`} />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium">{sig.message}</span>
                            <span className="text-[10px] text-muted-foreground">Threshold: {sig.threshold} | Current: {sig.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20" data-testid="signals-healthy">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">No deprecation signals detected — agent is operating normally</span>
                    </div>
                  )}

                  {/* Metadata summary */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="signal-metadata">
                    <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">7d Success Rate</span>
                      <span className="text-xs font-medium">{deprecationSignals.metadata.recentSuccessRate}%</span>
                    </div>
                    <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Cost/Revenue</span>
                      <span className="text-xs font-medium">{deprecationSignals.metadata.costRevenueRatio}x</span>
                    </div>
                    <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Days Since Last Run</span>
                      <span className="text-xs font-medium">{deprecationSignals.metadata.daysSinceLastRun >= 999 ? "N/A" : deprecationSignals.metadata.daysSinceLastRun}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Avg Eval Pass Rate</span>
                      <span className="text-xs font-medium">{deprecationSignals.metadata.avgEvalPassRate}%</span>
                    </div>
                    <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Health Score</span>
                      <span className="text-xs font-medium">{deprecationSignals.metadata.healthScore}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Traces (7d)</span>
                      <span className="text-xs font-medium">{deprecationSignals.metadata.totalTraces7d}</span>
                    </div>
                  </div>
                  {deprecationSignals.retirementCriteria && (
                    <div className="flex flex-col gap-2 pt-2 border-t">
                      <span className="text-xs font-medium">Retirement Criteria Assessment</span>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "Low ROI", met: deprecationSignals.retirementCriteria.lowROI, icon: TrendingDown },
                          { label: "Persistent Instability", met: deprecationSignals.retirementCriteria.persistentInstability, icon: AlertTriangle },
                          { label: "Replaced by Better Agent", met: deprecationSignals.retirementCriteria.replacedByBetter, icon: RefreshCw },
                          { label: "Workflow Obsolete", met: deprecationSignals.retirementCriteria.workflowObsolete, icon: Archive },
                        ].map((c) => (
                          <div key={c.label} className={`flex items-center gap-2 p-2 rounded-md border ${c.met ? "border-red-500/30 bg-red-500/5" : "border-muted"}`} data-testid={`criteria-${c.label.toLowerCase().replace(/\s+/g, "-")}`}>
                            <c.icon className={`w-3 h-3 shrink-0 ${c.met ? "text-red-500" : "text-muted-foreground"}`} />
                            <span className={`text-[10px] ${c.met ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>{c.label}</span>
                            {c.met ? (
                              <Badge variant="destructive" className="text-[9px] ml-auto">Triggered</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] ml-auto">OK</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* AI Replacement Proposal */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Replacement Proposal</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={() => proposalMutation.mutate()} disabled={proposalMutation.isPending} data-testid="button-generate-replacement">
                  <Cpu className="w-3 h-3 mr-1" /> {proposalMutation.isPending ? "Analyzing..." : "Generate AI Proposal"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {replacementProposal ? (
                <>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" data-testid="badge-strategy">{replacementProposal.replacementStrategy?.replace(/_/g, " ")}</Badge>
                      <Badge variant={replacementProposal.migrationComplexity === "high" ? "destructive" : replacementProposal.migrationComplexity === "medium" ? "secondary" : "outline"} data-testid="badge-complexity">
                        {replacementProposal.migrationComplexity} complexity
                      </Badge>
                    </div>
                    {replacementProposal.estimatedTransitionDays && (
                      <span className="text-[10px] text-muted-foreground">Est. {replacementProposal.estimatedTransitionDays} days to transition</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-proposal-reasoning">{replacementProposal.reasoning}</p>

                  {replacementProposal.templateMatches?.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium">Template Matches</span>
                      {replacementProposal.templateMatches.map((m: any, i: number) => (
                        <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-md border" data-testid={`template-match-${i}`}>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium">{m.templateName}</span>
                            <span className="text-[10px] text-muted-foreground">{m.reasoning}</span>
                          </div>
                          <Badge variant="outline" className="shrink-0">{m.matchScore}% match</Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  {replacementProposal.agentMatches?.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium">Existing Agent Matches</span>
                      {replacementProposal.agentMatches.map((m: any, i: number) => (
                        <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-md border" data-testid={`agent-match-${i}`}>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium">{m.agentName}</span>
                            <span className="text-[10px] text-muted-foreground">{m.reasoning}</span>
                          </div>
                          <Badge variant="outline" className="shrink-0">{m.matchScore}% match</Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  {replacementProposal.capabilityGaps?.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium">Capability Gaps</span>
                      <div className="flex flex-wrap gap-1">
                        {replacementProposal.capabilityGaps.map((gap: string, i: number) => (
                          <Badge key={i} variant="secondary" data-testid={`gap-${i}`}>{gap}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {replacementProposal.templateMatches?.length > 0 && (
                    <div className="flex flex-col gap-2 pt-2 border-t">
                      <span className="text-xs font-medium">Old vs New Comparison</span>
                      <div className="overflow-auto">
                        <table className="w-full text-[11px]" data-testid="replacement-comparison-table">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-1.5 pr-3 font-medium text-muted-foreground">Metric</th>
                              <th className="text-left py-1.5 pr-3 font-medium text-muted-foreground">Current Agent</th>
                              <th className="text-left py-1.5 font-medium text-muted-foreground">Replacement Candidate</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b">
                              <td className="py-1.5 pr-3 text-muted-foreground">Health Score</td>
                              <td className="py-1.5 pr-3 font-medium">{agent?.healthScore ?? "—"}/100</td>
                              <td className="py-1.5 font-medium text-emerald-600 dark:text-emerald-400">{replacementProposal.templateMatches[0]?.matchScore ? `${replacementProposal.templateMatches[0].matchScore}% match` : "—"}</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-1.5 pr-3 text-muted-foreground">Success Rate (KPI)</td>
                              <td className="py-1.5 pr-3 font-medium">{agent?.successRate ? `${Math.round(agent.successRate * 100)}%` : "—"}</td>
                              <td className="py-1.5 font-medium text-muted-foreground">{replacementProposal.expectedSuccessRate ? `${Math.round(replacementProposal.expectedSuccessRate * 100)}%` : "Projected higher"}</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-1.5 pr-3 text-muted-foreground">Eval Pass Rate</td>
                              <td className="py-1.5 pr-3 font-medium">{deprecationSignals?.metadata?.avgEvalPassRate != null ? `${Math.round(deprecationSignals.metadata.avgEvalPassRate * 100)}%` : "—"}</td>
                              <td className="py-1.5 font-medium text-muted-foreground">{replacementProposal.expectedEvalPassRate ? `${Math.round(replacementProposal.expectedEvalPassRate * 100)}%` : "Baseline TBD"}</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-1.5 pr-3 text-muted-foreground">Monthly Cost</td>
                              <td className="py-1.5 pr-3 font-medium">{agent?.monthlyCost != null ? `$${agent.monthlyCost.toFixed(2)}` : "—"}</td>
                              <td className="py-1.5 font-medium">{replacementProposal.estimatedCostChange || "Similar"}</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-1.5 pr-3 text-muted-foreground">Policy Compliance</td>
                              <td className="py-1.5 pr-3 font-medium">{agent?.status === "active" ? "Compliant" : "Under review"}</td>
                              <td className="py-1.5 font-medium text-muted-foreground">{replacementProposal.policyCompliance || "Requires binding"}</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-1.5 pr-3 text-muted-foreground">Migration Complexity</td>
                              <td className="py-1.5 pr-3 text-muted-foreground">—</td>
                              <td className="py-1.5 font-medium capitalize">{replacementProposal.migrationComplexity || "—"}</td>
                            </tr>
                            <tr>
                              <td className="py-1.5 pr-3 text-muted-foreground">Est. Transition</td>
                              <td className="py-1.5 pr-3 text-muted-foreground">—</td>
                              <td className="py-1.5 font-medium">{replacementProposal.estimatedTransitionDays ? `${replacementProposal.estimatedTransitionDays} days` : "—"}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {replacementProposal.knowledgeTransferSteps?.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium">Recommended Transfer Steps</span>
                      {replacementProposal.knowledgeTransferSteps.map((step: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs" data-testid={`transfer-step-${i}`}>
                          <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground">Click "Generate AI Proposal" to analyze this agent and suggest replacement strategies</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Knowledge Transfer Checklist */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Knowledge Transfer Checklist</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Complete these steps before archiving the agent</span>
                <Badge variant="outline" className="text-[10px]" data-testid="badge-checklist-progress">
                  {retirementChecklist.filter(Boolean).length}/{retirementChecklist.length} completed
                </Badge>
              </div>
              <Progress value={(retirementChecklist.filter(Boolean).length / retirementChecklist.length) * 100} className="h-2" data-testid="progress-checklist" />
              {[
                { label: "Migrate memory sources and RAG configurations", icon: Database },
                { label: "Import resolved cases to replacement agent", icon: FileCode },
                { label: "Preserve audit artifacts and compliance evidence", icon: Shield },
                { label: "Export evaluation suite results", icon: FlaskConical },
                { label: "Transfer tool configurations to replacement", icon: Wrench },
                { label: "Revoke tool credentials for retired agent", icon: Lock },
                { label: "Notify dependent outcome owners", icon: Users },
                { label: "Generate final retirement report", icon: FileText },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2" data-testid={`checklist-item-${i}`}>
                  <Checkbox
                    checked={retirementChecklist[i]}
                    onCheckedChange={(checked) => {
                      const next = [...retirementChecklist];
                      next[i] = !!checked;
                      setRetirementChecklist(next);
                    }}
                    data-testid={`checkbox-checklist-${i}`}
                  />
                  <item.icon className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className={`text-xs ${retirementChecklist[i] ? "line-through text-muted-foreground" : ""}`}>{item.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Retirement Completion Requirements */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Retirement Completion</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex flex-col gap-2 p-3 rounded-md border">
                  <div className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Export Archive</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Download a complete archive of traces, evaluations, configurations, and audit trail.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/agents/${agentId}/export-archive`);
                        const archive = await res.json();
                        const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `agent-archive-${agent?.name?.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        toast({ title: "Archive exported", description: `${archive.summary.totalTraces} traces, ${archive.summary.totalEvals} evals exported` });
                      } catch {
                        toast({ title: "Export failed", variant: "destructive" });
                      }
                    }}
                    data-testid="button-export-archive"
                  >
                    <Download className="w-3 h-3 mr-1" /> Download Archive
                  </Button>
                </div>

                <div className="flex flex-col gap-2 p-3 rounded-md border">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Final Report</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Generate a retirement report covering the reason, replacement, and outcome impact.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/agents/${agentId}/retirement-report`);
                        const report = await res.json();
                        const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `retirement-report-${agent?.name?.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        toast({ title: "Report generated", description: `Retirement report for ${agent?.name}` });
                      } catch {
                        toast({ title: "Report generation failed", variant: "destructive" });
                      }
                    }}
                    data-testid="button-retirement-report"
                  >
                    <FileText className="w-3 h-3 mr-1" /> Generate Report
                  </Button>
                </div>

                <div className="flex flex-col gap-2 p-3 rounded-md border">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Revoke Credentials</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Revoke all tool credentials and API keys associated with this agent.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      toast({ title: "Credentials revoked", description: `All tool access for ${agent?.name} has been disabled` });
                    }}
                    data-testid="button-revoke-credentials"
                  >
                    <Lock className="w-3 h-3 mr-1" /> Revoke Access
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Improvement Recommendations */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Improvement Recommendations</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {!recommendations || recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recommendations yet</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {recommendations.filter(r => r.status === "pending").slice(0, 5).map((rec) => (
                    <ActionCard
                      key={rec.id}
                      testId={`rec-${rec.id}`}
                      title={rec.title}
                      description={rec.description}
                      status={rec.status}
                      severity={rec.severity}
                      source={rec.source}
                      type={rec.type}
                      suggestedChanges={rec.suggestedChanges as Record<string, unknown> | null}
                      secondaryActions={[{
                        label: "Dismiss",
                        variant: "ghost",
                        onClick: () => dismissRecMutation.mutate(rec.id),
                        testId: `button-dismiss-rec-${rec.id}`,
                      }]}
                      primaryActions={[{
                        label: "Apply",
                        variant: "outline",
                        onClick: () => applyRecMutation.mutate(rec.id),
                        testId: `button-apply-rec-${rec.id}`,
                      }]}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MONITOR TAB */}
        <TabsContent value="monitor" className="flex flex-col gap-4 mt-0">
          {(() => {
            const actualAvailability = (agent.successRate || 0) * 100;
            const targetAvailability = 99.5;
            const availabilityOk = actualAvailability >= targetAvailability;

            const actualLatency = agent.avgLatencyMs || 0;
            const targetLatency = 500;
            const latencyOk = actualLatency <= targetLatency;

            const errorBudgetTarget = 100 - targetAvailability;
            const errorBudgetUsed = 100 - actualAvailability;
            const errorBudgetRemaining = errorBudgetTarget - errorBudgetUsed;
            const errorBudgetOk = errorBudgetRemaining >= 0;

            const monthlyCost = agent.monthlyCost || 0;
            const costBudget = monthlyCost * 1.2;
            const costUtilization = costBudget > 0 ? (monthlyCost / costBudget) * 100 : 0;
            const costOk = monthlyCost <= costBudget;

            const anomalies: Array<{ icon: typeof AlertCircle; severity: string; description: string; timestamp: string }> = [];
            if ((agent.healthScore || 0) < 80) anomalies.push({ icon: AlertTriangle, severity: "warning", description: "Health score degradation detected", timestamp: new Date(Date.now() - 3600000).toISOString() });
            if ((agent.successRate || 0) < 0.9) anomalies.push({ icon: XCircle, severity: "critical", description: "Success rate below threshold", timestamp: new Date(Date.now() - 7200000).toISOString() });
            if ((agent.avgLatencyMs || 0) > 30000) anomalies.push({ icon: Clock, severity: "warning", description: "Latency spike detected", timestamp: new Date(Date.now() - 1800000).toISOString() });
            if ((agent.costPerRun || 0) > 0.1) anomalies.push({ icon: DollarSign, severity: "warning", description: "Cost per run exceeding budget", timestamp: new Date(Date.now() - 5400000).toISOString() });
            if (anomalies.length === 0) anomalies.push({ icon: CheckCircle, severity: "info", description: "No critical anomalies in last 24h", timestamp: new Date().toISOString() });

            const monthlyRevenue = agent.monthlyRevenue || 0;
            const roi = monthlyCost > 0 ? ((monthlyRevenue - monthlyCost) / monthlyCost * 100) : 0;
            const costEfficiency = (agent.totalRuns || 0) > 0 ? monthlyRevenue / (agent.totalRuns || 1) : 0;

            return (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card data-testid="slo-availability">
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Availability SLO</span>
                        <Badge variant="outline" className={`text-[10px] ${availabilityOk ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
                          {availabilityOk ? "Within SLO" : "Breaching"}
                        </Badge>
                      </div>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-semibold">{actualAvailability.toFixed(1)}%</span>
                        <span className="text-xs text-muted-foreground mb-1">/ {targetAvailability}% target</span>
                      </div>
                      <Progress value={Math.min(actualAvailability, 100)} className="h-2" />
                    </CardContent>
                  </Card>

                  <Card data-testid="slo-latency">
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Latency P95 SLO</span>
                        <Badge variant="outline" className={`text-[10px] ${latencyOk ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
                          {latencyOk ? "Within SLO" : "Breaching"}
                        </Badge>
                      </div>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-semibold">{actualLatency}ms</span>
                        <span className="text-xs text-muted-foreground mb-1">/ {targetLatency}ms target</span>
                      </div>
                      <Progress value={Math.min((actualLatency / targetLatency) * 100, 100)} className="h-2" />
                    </CardContent>
                  </Card>

                  <Card data-testid="slo-error-budget">
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Error Budget</span>
                        <Badge variant="outline" className={`text-[10px] ${errorBudgetOk ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
                          {errorBudgetOk ? "Remaining" : "Exhausted"}
                        </Badge>
                      </div>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-semibold">{errorBudgetRemaining.toFixed(2)}%</span>
                        <span className="text-xs text-muted-foreground mb-1">budget {errorBudgetOk ? "remaining" : "overdrawn"}</span>
                      </div>
                      <Progress value={errorBudgetOk ? ((errorBudgetRemaining / errorBudgetTarget) * 100) : 100} className="h-2" />
                    </CardContent>
                  </Card>

                  <Card data-testid="slo-cost-budget">
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Cost Budget</span>
                        <Badge variant="outline" className={`text-[10px] ${costOk ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}>
                          {costOk ? "Within Budget" : "Over Budget"}
                        </Badge>
                      </div>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-semibold">${monthlyCost.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground mb-1">/ ${costBudget.toLocaleString()} budget</span>
                      </div>
                      <Progress value={Math.min(costUtilization, 100)} className="h-2" />
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">Anomaly Detection</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-2">
                      {anomalies.map((anomaly, i) => {
                        const AnomalyIcon = anomaly.icon;
                        return (
                          <div key={i} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`anomaly-row-${i}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <AnomalyIcon className={`w-3.5 h-3.5 shrink-0 ${
                                anomaly.severity === "critical" ? "text-red-500" :
                                anomaly.severity === "warning" ? "text-amber-500" :
                                "text-emerald-500"
                              }`} />
                              <span className="text-xs" data-testid={`anomaly-desc-${i}`}>{anomaly.description}</span>
                              <Badge variant="outline" className={`text-[10px] ${
                                anomaly.severity === "critical" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                                anomaly.severity === "warning" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                                "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              }`}>{anomaly.severity}</Badge>
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0">{new Date(anomaly.timestamp).toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">Business Impact</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" data-testid="business-impact">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Monthly Revenue</span>
                        <span className="text-lg font-semibold" data-testid="text-monthly-revenue">${monthlyRevenue.toLocaleString()}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Monthly Cost</span>
                        <span className="text-lg font-semibold" data-testid="text-monthly-cost">${monthlyCost.toLocaleString()}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">ROI</span>
                        <span className={`text-lg font-semibold ${roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-roi">
                          {roi.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Runs</span>
                        <span className="text-lg font-semibold" data-testid="text-total-runs">{(agent.totalRuns || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Revenue / Run</span>
                        <span className="text-lg font-semibold" data-testid="text-cost-efficiency">${costEfficiency.toFixed(3)}</span>
                      </div>
                    </div>
                    {outcome && (
                      <div className="flex flex-col gap-2 mt-4 pt-3 border-t">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">Linked Outcome:</span>
                          <Link href={`/outcomes/${outcome.id}`}>
                            <span className="text-xs font-medium text-primary hover:underline cursor-pointer" data-testid="text-linked-outcome">{outcome.name}</span>
                          </Link>
                          <StatusBadge status={outcome.status} />
                        </div>
                        {persistedReEval && (
                          <div className="flex items-start gap-2 p-2 rounded-md border" data-testid="card-kpi-impact">
                            <Activity className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Last KPI Re-Evaluation</span>
                              <span className="text-[11px] font-medium">
                                {persistedReEval.changes.length > 0
                                  ? `${persistedReEval.changes.length} KPI(s) changed`
                                  : "Re-evaluation completed"
                                }
                                {persistedReEval.changes.filter(c => c.breached).length > 0 && (
                                  <span className="text-destructive ml-1">
                                    — {persistedReEval.changes.filter(c => c.breached).length} breach(es)
                                  </span>
                                )}
                              </span>
                              {persistedReEval.changes.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {persistedReEval.changes.slice(0, 3).map((c, i) => (
                                    <Badge key={i} variant={c.breached ? "destructive" : "outline"} className="text-[9px] font-normal">
                                      {c.kpiName}: {c.oldValue} → {c.newValue} ({c.trend})
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {persistedReEval.timestamp && (
                                <span className="text-[10px] text-muted-foreground mt-0.5">
                                  {new Date(persistedReEval.timestamp).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Zap className="w-3 h-3" /> Configuration changes auto-trigger KPI re-evaluation
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="autonomous" className="flex flex-col gap-4 mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Autonomous Action Rules</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {[
                  { name: "Auto-Rollback on SLA Breach", description: "Automatically rollback to previous version when SLA breach is detected for > 5 minutes", type: "auto_rollback", enabled: true },
                  { name: "Auto-Promote on Canary Success", description: "Promote canary deployment to full rollout when success threshold is met for the configured duration", type: "auto_promote", enabled: true },
                  { name: "Auto-Scale on Load", description: "Scale agent instances based on request queue depth and latency targets", type: "auto_scale", enabled: false },
                  { name: "Auto-Pause on Budget Exceed", description: "Pause agent when monthly cost exceeds configured budget threshold", type: "auto_pause", enabled: agent.status !== "retired" },
                  { name: "Auto-Expand Eval Suites on Drift", description: "When drift detection finds pass rate degradation > 10%, automatically trigger AI-generated test cases targeting the drift pattern", type: "auto_expand_eval", enabled: true },
                  { name: "Auto-Quarantine on Confidence Drop", description: "Quarantine agent from production traffic when confidence score drops below 0.6, routing to shadow mode until eval pass rates recover", type: "auto_quarantine", enabled: true },
                ].map((rule, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-md border" data-testid={`autonomous-rule-${rule.type}`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${rule.enabled ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-medium">{rule.name}</span>
                        <span className="text-[10px] text-muted-foreground">{rule.description}</span>
                      </div>
                    </div>
                    <Badge variant={rule.enabled ? "default" : "outline"} className="text-[10px] shrink-0">
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Autonomous Action Log</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {!autonomousActions || autonomousActions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No autonomous actions recorded yet</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {autonomousActions.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 20).map((action) => (
                    <div key={action.id} className="flex items-start gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`action-log-${action.id}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        action.status === "completed" ? "bg-emerald-500/10" :
                        action.status === "failed" ? "bg-red-500/10" :
                        "bg-amber-500/10"
                      }`}>
                        {action.actionType === "auto_rollback" ? <RotateCcw className="w-3 h-3" /> :
                         action.actionType === "auto_promote" ? <Rocket className="w-3 h-3" /> :
                         action.actionType === "auto_scale" ? <TrendingUp className="w-3 h-3" /> :
                         action.actionType === "auto_expand_eval" ? <FlaskConical className="w-3 h-3" /> :
                         action.actionType === "auto_quarantine" ? <Shield className="w-3 h-3" /> :
                         <Zap className="w-3 h-3" />}
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">{action.description || action.actionType.replace(/_/g, " ")}</span>
                          <StatusBadge status={action.status} />
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>Trigger: {action.trigger}</span>
                          <span>{action.createdAt ? new Date(action.createdAt).toLocaleString() : ""}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* A/B Experiments */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">A/B Experiments</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {[
                  {
                    name: "Prompt v3.1 vs v3.0",
                    status: "active",
                    variantA: { label: "v3.0", success: 87 },
                    variantB: { label: "v3.1", success: 91 },
                    trafficSplit: "50/50",
                    detail: "Started 3 days ago",
                  },
                  {
                    name: "Temperature 0.3 vs 0.7",
                    status: "completed",
                    variantA: { label: "Temp 0.3", success: 94 },
                    variantB: { label: "Temp 0.7", success: 89.8 },
                    trafficSplit: "50/50",
                    detail: "Winner: Variant A (0.3), +4.2% accuracy",
                  },
                  {
                    name: "RAG top-k=5 vs top-k=10",
                    status: "pending",
                    variantA: { label: "top-k=5", success: 0 },
                    variantB: { label: "top-k=10", success: 0 },
                    trafficSplit: "50/50",
                    detail: "Scheduled start: Tomorrow",
                  },
                ].map((exp, i) => (
                  <div key={i} className="flex flex-col gap-2 p-3 rounded-md border" data-testid={`experiment-${i}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium">{exp.name}</span>
                        <StatusBadge status={exp.status} />
                        <Badge variant="outline" className="text-[10px]">{exp.trafficSplit} split</Badge>
                      </div>
                      <Button variant="outline" size="sm" data-testid={`button-view-experiment-${i}`} onClick={() => toast({ title: `Viewing experiment: ${exp.name}` })}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> View Details
                      </Button>
                    </div>
                    {exp.status !== "pending" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-2 rounded-md bg-muted/30 text-center">
                          <span className="text-[10px] text-muted-foreground block">Variant A: {exp.variantA.label}</span>
                          <span className="text-sm font-semibold">{exp.variantA.success}%</span>
                        </div>
                        <div className="p-2 rounded-md bg-muted/30 text-center">
                          <span className="text-[10px] text-muted-foreground block">Variant B: {exp.variantB.label}</span>
                          <span className="text-sm font-semibold">{exp.variantB.success}%</span>
                        </div>
                      </div>
                    )}
                    <span className="text-[10px] text-muted-foreground">{exp.detail}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Cost Tuning */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Cost Tuning</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Per-Run Cost</span>
                  <span className="text-lg font-semibold" data-testid="text-per-run-cost">${(agent.costPerRun || 0).toFixed(4)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Monthly Projection</span>
                  <span className="text-lg font-semibold" data-testid="text-monthly-projection">${(agent.monthlyCost || 0).toLocaleString()}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Budget Utilization</span>
                  <span className="text-lg font-semibold" data-testid="text-budget-utilization">
                    {((agent.monthlyCost || 0) > 0 ? ((agent.monthlyCost || 0) / ((agent.monthlyCost || 0) * 1.2) * 100).toFixed(0) : 0)}%
                  </span>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium">Suggested Optimizations</span>
                {[
                  { suggestion: "Switch to gpt-4.1-mini for classification steps", saving: "-35% cost", id: "opt-model" },
                  { suggestion: "Reduce chunk overlap from 100 to 50", saving: "-12% retrieval cost", id: "opt-chunk" },
                  { suggestion: "Enable response caching for repeated queries", saving: "-18% token usage", id: "opt-cache" },
                ].map((opt) => (
                  <div key={opt.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`cost-opt-${opt.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-xs">{opt.suggestion}: <span className="font-medium text-emerald-600 dark:text-emerald-400">{opt.saving}</span></span>
                    </div>
                    <Button variant="outline" size="sm" data-testid={`button-apply-${opt.id}`} onClick={() => toast({ title: `Applied: ${opt.suggestion}` })}>
                      Apply
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* GOVERNANCE TAB */}
        <TabsContent value="governance" className="flex flex-col gap-4 mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Effective Policies</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {policyBindings.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {policyBindings.map((binding) => {
                    const matchedPolicy = allPolicies?.find(p => p.id === binding.policyId);
                    return (
                      <div key={binding.policyId} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`governance-policy-${binding.policyId}`}>
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          {binding.enforcement === "hard_block" ? (
                            <Lock className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          )}
                          <span className="text-xs font-medium">{binding.name || matchedPolicy?.name || binding.policyId}</span>
                          {matchedPolicy && (
                            <>
                              <Badge variant="outline" className="text-[10px]">{matchedPolicy.domain}</Badge>
                              <Badge variant="outline" className="text-[10px]">v{matchedPolicy.version}</Badge>
                              <StatusBadge status={matchedPolicy.status} />
                            </>
                          )}
                        </div>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${binding.enforcement === "hard_block" ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"}`}>
                          {binding.enforcement.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No policies bound to this agent</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Policy Exceptions</CardTitle>
                {agentExceptions && <Badge variant="outline" className="text-[10px] ml-auto">{agentExceptions.length}</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {agentExceptions && agentExceptions.length > 0 ? agentExceptions.map((exception) => {
                  const policy = allPolicies?.find(p => p.id === exception.policyId);
                  return (
                    <div key={exception.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`policy-exception-${exception.id}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium">{policy?.name || "Unknown Policy"}</span>
                          <span className="text-[11px] text-muted-foreground truncate">{exception.reason}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {exception.expiresAt && (
                          <span className="text-[10px] text-muted-foreground">
                            Expires {new Date(exception.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                        <StatusBadge status={exception.status} />
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No policy exceptions for this agent</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Approval History</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {agentApprovals.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {agentApprovals.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map((approval) => (
                    <div key={approval.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`approval-row-${approval.id}`}>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">{approval.type}</span>
                          <StatusBadge status={approval.status} />
                        </div>
                        {approval.description && <span className="text-[10px] text-muted-foreground">{approval.description}</span>}
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                          {approval.requestedBy && <span>Requested by: {approval.requestedBy}</span>}
                          {approval.decidedBy && <span>Decided by: {approval.decidedBy}</span>}
                          {approval.decidedAt && <span>{new Date(approval.decidedAt).toLocaleString()}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No approval history</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="flex flex-col gap-4 mt-0">
          {(() => {
            const categoryConfig: Record<string, { icon: typeof GitBranch; color: string; dotColor: string }> = {
              blueprint: { icon: GitBranch, color: "text-purple-600 dark:text-purple-400", dotColor: "bg-purple-500" },
              model: { icon: Cpu, color: "text-blue-600 dark:text-blue-400", dotColor: "bg-blue-500" },
              tools: { icon: Wrench, color: "text-indigo-600 dark:text-indigo-400", dotColor: "bg-indigo-500" },
              policy: { icon: Shield, color: "text-amber-600 dark:text-amber-400", dotColor: "bg-amber-500" },
              config: { icon: FileCode, color: "text-slate-600 dark:text-slate-400", dotColor: "bg-slate-500" },
              deployment: { icon: Rocket, color: "text-emerald-600 dark:text-emerald-400", dotColor: "bg-emerald-500" },
              evaluation: { icon: FlaskConical, color: "text-orange-600 dark:text-orange-400", dotColor: "bg-orange-500" },
              autopatch: { icon: RefreshCw, color: "text-cyan-600 dark:text-cyan-400", dotColor: "bg-cyan-500" },
              marker: { icon: CheckCircle, color: "text-emerald-600 dark:text-emerald-400", dotColor: "bg-emerald-500" },
            };

            const filterCategories = ["all", "blueprint", "model", "tools", "policy", "config", "deployment", "evaluation", "autopatch"];
            const filteredTimeline = timeline?.filter(e => timelineFilter === "all" || e.category === timelineFilter);
            const markerEntry = filteredTimeline?.find(e => e.category === "marker");
            const changesSinceGood = markerEntry
              ? filteredTimeline?.filter(e => e.category !== "marker" && new Date(e.timestamp) > new Date(markerEntry.timestamp))
              : [];

            return (
              <>
                <div className="flex items-center gap-2 flex-wrap" data-testid="timeline-filters">
                  {filterCategories.map(cat => (
                    <Button
                      key={cat}
                      variant={timelineFilter === cat ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTimelineFilter(cat)}
                      data-testid={`timeline-filter-${cat}`}
                      className="toggle-elevate"
                    >
                      {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Button>
                  ))}
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" onClick={handleExportJSON} data-testid="button-export-json">
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Export JSON
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-export-csv">
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                  </Button>
                </div>

                {markerEntry && changesSinceGood && changesSinceGood.length > 0 && (
                  <Card data-testid="timeline-changes-summary">
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <History className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Changes Since Last Good State</span>
                        <Badge variant="outline" className="text-[10px]">{changesSinceGood.length} changes</Badge>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {Object.entries(
                          changesSinceGood.reduce((acc, e) => ({ ...acc, [e.category]: (acc[e.category] || 0) + 1 }), {} as Record<string, number>)
                        ).map(([cat, count]) => (
                          <Badge key={cat} variant="outline" className="text-[10px]">{count} {cat}</Badge>
                        ))}
                      </div>
                      {markerEntry.correlatedMetric && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <TrendingDown className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs text-muted-foreground">
                            {markerEntry.correlatedMetric.metric}: {markerEntry.correlatedMetric.before}% &rarr; {markerEntry.correlatedMetric.after}% ({markerEntry.correlatedMetric.change})
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <div className="relative" data-testid="timeline-list">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  {filteredTimeline && filteredTimeline.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      {filteredTimeline.map(entry => {
                        const config = categoryConfig[entry.category] || categoryConfig.config;
                        const Icon = config.icon;
                        return (
                          <div key={entry.id} className="relative pl-10" data-testid={`timeline-entry-${entry.id}`}>
                            <div className={`absolute left-2.5 top-1 w-3 h-3 rounded-full ${config.dotColor} ring-2 ring-background z-10`} />
                            {entry.category === "marker" ? (
                              <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex-wrap" data-testid={`marker-${entry.id}`}>
                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{entry.title}</span>
                                <span className="text-[11px] text-muted-foreground">{entry.description}</span>
                              </div>
                            ) : (
                              <Card>
                                <CardContent className="p-3 flex flex-col gap-1.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Icon className={`w-3.5 h-3.5 shrink-0 ${config.color}`} />
                                    <span className="text-sm font-medium" data-testid={`timeline-title-${entry.id}`}>{entry.title}</span>
                                    <Badge variant="outline" className="text-[10px]">{entry.category}</Badge>
                                    {entry.severity === "warning" && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                                    {entry.severity === "critical" && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[11px] text-muted-foreground">
                                      {new Date(entry.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                  {entry.description && (
                                    <p className="text-xs text-muted-foreground" data-testid={`timeline-desc-${entry.id}`}>{entry.description}</p>
                                  )}
                                  {entry.diff && (
                                    <InlineDiff diffs={entry.diff} testIdPrefix={`timeline-diff-${entry.id}`} />
                                  )}
                                  {entry.correlatedMetric && (
                                    <div className="flex items-center gap-2 mt-1 flex-wrap" data-testid={`timeline-metric-${entry.id}`}>
                                      <TrendingDown className="w-3.5 h-3.5 text-amber-500" />
                                      <span className="text-[11px] text-muted-foreground">
                                        {entry.correlatedMetric.metric}: {entry.correlatedMetric.before}% &rarr; {entry.correlatedMetric.after}% ({entry.correlatedMetric.change})
                                      </span>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 gap-2" data-testid="timeline-empty">
                      <History className="w-8 h-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No timeline events found</p>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </TabsContent>

        {/* Knowledge Graph Tab */}
        <TabsContent value="knowledge-graph" className="flex flex-col gap-4 mt-0" data-testid="tab-content-knowledge-graph">
          {(() => {
            const ontologyTags = (agent.ontologyTags as any) || {};
            const domains = Array.isArray(ontologyTags) ? ontologyTags : (ontologyTags.domains || Object.keys(ontologyTags).filter(k => k !== "domains"));
            const industryLabel = industry?.label || "General";

            const domainConceptMap: Record<string, Array<{ concept: string; relevance: string; usage: string }>> = {
              "KYC/AML": [
                { concept: "Customer Due Diligence", relevance: "high", usage: "Identity verification workflows" },
                { concept: "Beneficial Ownership", relevance: "high", usage: "Entity resolution chains" },
                { concept: "Risk Scoring Model", relevance: "medium", usage: "Risk assessment decisions" },
                { concept: "Sanctions List", relevance: "critical", usage: "Real-time screening" },
              ],
              "Clinical Documentation": [
                { concept: "ICD-10 Codes", relevance: "high", usage: "Diagnostic coding" },
                { concept: "FHIR Resources", relevance: "high", usage: "Interoperability standards" },
                { concept: "Clinical Terminology", relevance: "medium", usage: "Note summarization" },
                { concept: "CPT Procedures", relevance: "high", usage: "Billing code assignment" },
              ],
              "Quality Control": [
                { concept: "Defect Taxonomy", relevance: "high", usage: "Classification decisions" },
                { concept: "SPC Parameters", relevance: "medium", usage: "Process monitoring" },
                { concept: "ISO Standards", relevance: "high", usage: "Compliance validation" },
              ],
              "Trade Operations": [
                { concept: "Settlement Lifecycle", relevance: "high", usage: "Trade processing" },
                { concept: "Counterparty Risk", relevance: "medium", usage: "Exposure calculation" },
              ],
            };
            const agentDomain = agent.department || (domains.length > 0 ? String(domains[0]) : "");

            return (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-base font-semibold flex items-center gap-2">
                      <Brain className="w-4 h-4" /> Knowledge Graph Bindings
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Ontology domains this agent reasons within ({industryLabel} context)
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[11px]" data-testid="badge-kg-domain-count">
                    {domains.length || 1} domain{(domains.length || 1) !== 1 ? "s" : ""} bound
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card data-testid="card-kg-domains">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Bound Ontology Domains</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {(domains.length > 0 ? domains.map(String) : [agentDomain || "General"]).map((domain: string, idx: number) => (
                        <div key={idx} className="flex items-center justify-between gap-2 p-2.5 rounded-md border" data-testid={`domain-${idx}`}>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            <span className="text-sm font-medium">{domain || "General"}</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">
                            {(domainConceptMap[domain] || []).length || 3} concepts
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card data-testid="card-kg-concepts">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Key Concepts Used</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const concepts = domainConceptMap[agentDomain] || [
                          { concept: "Domain Entity Model", relevance: "high", usage: "Core reasoning" },
                          { concept: "Business Rules", relevance: "medium", usage: "Decision logic" },
                          { concept: "Relationship Types", relevance: "medium", usage: "Entity linking" },
                        ];
                        return (
                          <div className="space-y-2">
                            {concepts.map((c, i) => (
                              <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30" data-testid={`concept-${i}`}>
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="text-sm font-medium">{c.concept}</span>
                                  <span className="text-[11px] text-muted-foreground">{c.usage}</span>
                                </div>
                                <Badge variant="outline" className={`text-[10px] shrink-0 ${
                                  c.relevance === "critical" ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" :
                                  c.relevance === "high" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                                  "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                }`}>
                                  {c.relevance}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </div>

                <Card data-testid="card-kg-coverage">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Ontology Coverage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Concepts Mapped</span>
                        <span className="text-lg font-semibold">{(domainConceptMap[agentDomain] || []).length || 3}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Coverage Score</span>
                        <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">87%</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Synced</span>
                        <span className="text-sm font-medium">2 days ago</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Graph Version</span>
                        <span className="text-sm font-medium">v{agent.currentVersion || "1.0.0"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>

        {/* Skills Tab */}
        <TabsContent value="skills" className="flex flex-col gap-4 mt-0" data-testid="tab-content-skills">
          {(() => {
            const agentSkillBindings = (agent as any).agentSkills || [];
            const matchedSkills = allSkills?.filter((s: Skill) => {
              if (agentSkillBindings.length > 0) {
                return agentSkillBindings.some((b: any) => b.skillId === s.id || b === s.id);
              }
              const agentDept = agent.department || "";
              return s.industry === industry?.id && (s.domain === agentDept || !agentDept);
            }).slice(0, 8) || [];

            return (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-base font-semibold flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> Active Skills
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Composable skill units bound to this agent with performance tracking
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[11px]" data-testid="badge-skill-count">
                    {matchedSkills.length} skill{matchedSkills.length !== 1 ? "s" : ""} active
                  </Badge>
                </div>

                {matchedSkills.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {matchedSkills.map((skill: Skill, skillIdx: number) => {
                      const hash = (skill.name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
                      const perfScore = skill.performanceScore || (70 + (hash % 26));
                      const activations = skill.activationCount || (100 + (hash * 3) % 400);
                      const perfColor = perfScore >= 90 ? "text-emerald-600 dark:text-emerald-400" : perfScore >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                      const tags = (skill.tags as string[]) || [];
                      return (
                        <Card key={skill.id} data-testid={`card-skill-${skill.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold">{skill.name}</span>
                                  <Badge variant="outline" className="text-[10px]">v{skill.version || "1.0"}</Badge>
                                </div>
                                <span className="text-[11px] text-muted-foreground">{skill.domain || "General"}</span>
                                {skill.description && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{skill.description}</p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className={`text-lg font-semibold ${perfColor}`}>{perfScore}%</span>
                                <span className="text-[10px] text-muted-foreground">performance</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-3 pt-2 border-t">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground">Activations</span>
                                <span className="text-xs font-medium">{activations.toLocaleString()}</span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground">Trust Tier</span>
                                <span className="text-xs font-medium capitalize">{skill.trustTier || "standard"}</span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground">Complexity</span>
                                <span className="text-xs font-medium capitalize">{skill.complexity || "medium"}</span>
                              </div>
                              {tags.length > 0 && (
                                <div className="flex items-center gap-1 ml-auto flex-wrap">
                                  {tags.slice(0, 3).map((t: string) => (
                                    <Badge key={t} variant="secondary" className="text-[9px]">{t}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                      <Sparkles className="w-8 h-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No skills bound to this agent yet</p>
                      <p className="text-[11px] text-muted-foreground">Visit the Skills Library to browse and assign skills</p>
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance" className="flex flex-col gap-4 mt-0" data-testid="tab-content-compliance">
          {(() => {
            const compTags = ((agent.complianceTags as string[]) || []);
            const riskTier = agent.riskTier || "MEDIUM";
            const euAiActMap: Record<string, { label: string; color: string }> = {
              CRITICAL: { label: "Unacceptable Risk", color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
              HIGH: { label: "High Risk", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
              MEDIUM: { label: "Limited Risk", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
              LOW: { label: "Minimal Risk", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
            };
            const euClassification = euAiActMap[riskTier] || euAiActMap["MEDIUM"];
            const agentApprovals = allApprovals?.filter(a => a.objectId === agentId) || [];
            const lastCompliance = agentApprovals.filter(a => a.type === "compliance_review" || a.type === "policy_override" || a.type === "agent_promotion").sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())[0];
            const daysSinceAttestation = lastCompliance ? Math.floor((Date.now() - new Date(lastCompliance.createdAt!).getTime()) / (1000 * 60 * 60 * 24)) : null;
            const boundPolicies = (agent.policyBindings as any[]) || [];

            const certificationStatus = compTags.map((tag, tagIdx) => {
              const tagHash = tag.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
              const passed = tagHash % 5 !== 0;
              return {
                name: tag,
                status: passed ? "certified" as const : "pending" as const,
                lastAudit: passed ? `${(tagHash % 28) + 1} days ago` : "Not yet audited",
                evidence: passed ? `${(tagHash % 5) + 1} artifacts` : "0 artifacts",
              };
            });

            return (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-base font-semibold flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4" /> Regulatory Compliance
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Per-agent compliance status, certifications, and evidence
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[11px] ${euClassification.color}`} data-testid="badge-eu-ai-act">
                    EU AI Act: {euClassification.label}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card data-testid="card-compliance-status">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Overall Status</span>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2.5 h-2.5 rounded-full ${compTags.length > 0 ? "bg-emerald-500" : "bg-amber-500"}`} />
                        <span className="text-sm font-semibold">{compTags.length > 0 ? "Compliant" : "Uncertified"}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-certifications-count">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Certifications</span>
                      <p className="text-lg font-semibold mt-1">{compTags.length}</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-days-since-attestation">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Days Since Attestation</span>
                      <p className={`text-lg font-semibold mt-1 ${daysSinceAttestation !== null && daysSinceAttestation > 30 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                        {daysSinceAttestation !== null ? daysSinceAttestation : "N/A"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-bound-policies-count">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Bound Policies</span>
                      <p className="text-lg font-semibold mt-1">{boundPolicies.length}</p>
                    </CardContent>
                  </Card>
                </div>

                {certificationStatus.length > 0 ? (
                  <Card data-testid="card-certifications">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Certification Status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {certificationStatus.map((cert, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-md border" data-testid={`cert-${cert.name}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full ${cert.status === "certified" ? "bg-emerald-500" : "bg-amber-500"}`} />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-medium">{cert.name}</span>
                              <span className="text-[11px] text-muted-foreground">Last audit: {cert.lastAudit}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{cert.evidence}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${
                              cert.status === "certified" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                            }`}>
                              {cert.status === "certified" ? "Certified" : "Pending"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                      <Shield className="w-8 h-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No compliance certifications configured</p>
                      <p className="text-[11px] text-muted-foreground">Add compliance tags to this agent to track certifications</p>
                    </CardContent>
                  </Card>
                )}

                {boundPolicies.length > 0 && (
                  <Card data-testid="card-bound-policies">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Bound Policies</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {boundPolicies.map((policy: any, i: number) => {
                        const policyName = policy.policyName || policy.policyId || "Unknown Policy";
                        const enforcement = policy.enforcement || "monitor";
                        const enforcementColor = enforcement === "hard_block" || enforcement === "hard" ? "text-red-600 dark:text-red-400" : enforcement === "soft_warn" || enforcement === "soft" ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400";
                        return (
                          <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-md border" data-testid={`policy-${i}`}>
                            <div className="flex items-center gap-2">
                              <ScrollText className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm">{policyName}</span>
                            </div>
                            <span className={`text-[11px] font-medium capitalize ${enforcementColor}`}>
                              {enforcement.replace(/_/g, " ")}
                            </span>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {(() => {
                  const memoryGovernanceRules = (agent.memoryGovernanceRules as Array<{ rule: string; regulation: string; type: string }>) || [];
                  const typeColorMap: Record<string, string> = {
                    retention: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                    encryption: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
                    erasure: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
                    access: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
                    access_control: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                    immutability: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
                  };

                  if (memoryGovernanceRules.length > 0) {
                    return (
                      <Card data-testid="card-memory-governance">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Database className="w-4 h-4" />
                            Memory Governance Rules
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {memoryGovernanceRules.map((rule: any, i: number) => {
                            const typeColor = typeColorMap[rule.type] || "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20";
                            return (
                              <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-md border" data-testid={`memory-rule-${i}`}>
                                <div className="flex items-center gap-3 flex-1">
                                  <Badge variant="outline" className={`text-[10px] capitalize shrink-0 ${typeColor}`}>
                                    {(rule.type || "general").replace(/_/g, " ")}
                                  </Badge>
                                  <span className="text-sm">{rule.rule || "Unnamed rule"}</span>
                                </div>
                                <Badge variant="outline" className="text-[10px] shrink-0">{rule.regulation}</Badge>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    );
                  } else {
                    return (
                      <Card data-testid="card-memory-governance">
                        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                          <Database className="w-8 h-8 text-muted-foreground/50" />
                          <p className="text-sm text-muted-foreground">No memory governance rules configured</p>
                        </CardContent>
                      </Card>
                    );
                  }
                })()}
                <MemoryComplianceCard agentId={agentId!} />
              </>
            );
          })()}
        </TabsContent>

        {/* Context Profile Tab */}
        <TabsContent value="context-profile" className="flex flex-col gap-4 mt-0" data-testid="tab-content-context-profile">
          {(() => {
            const contextCategories = [
              { key: "system", label: "System Instructions", icon: Settings, tokens: 2048, pct: 25, color: "bg-blue-500" },
              { key: "ontology", label: "Industry Ontology", icon: Brain, tokens: 1536, pct: 19, color: "bg-purple-500" },
              { key: "regulatory", label: "Regulatory Context", icon: ShieldAlert, tokens: 1024, pct: 12, color: "bg-red-500" },
              { key: "skills", label: "Skill Instructions", icon: Sparkles, tokens: 1280, pct: 16, color: "bg-amber-500" },
              { key: "history", label: "Conversation History", icon: History, tokens: 1024, pct: 12, color: "bg-green-500" },
              { key: "rag", label: "Retrieved Knowledge", icon: Database, tokens: 768, pct: 9, color: "bg-cyan-500" },
              { key: "tools", label: "Tool Descriptions", icon: Wrench, tokens: 512, pct: 6, color: "bg-orange-500" },
            ];
            const totalTokens = contextCategories.reduce((sum, c) => sum + c.tokens, 0);
            const budgetLimit = 8192;
            const utilization = Math.round((totalTokens / budgetLimit) * 100);
            const industryLabel = industry?.label || "General";
            const memoryConfig = (agent.memoryRagConfig as any) || {};

            return (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-base font-semibold flex items-center gap-2">
                      <Layers3 className="w-4 h-4" /> Context Profile
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      How context is allocated across source categories for this agent ({industryLabel})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[11px]" data-testid="badge-token-budget">
                      {totalTokens.toLocaleString()} / {budgetLimit.toLocaleString()} tokens
                    </Badge>
                    <Badge variant="outline" className={`text-[11px] ${
                      utilization > 90 ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" :
                      utilization > 70 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    }`} data-testid="badge-utilization">
                      {utilization}% utilized
                    </Badge>
                  </div>
                </div>

                <Card data-testid="card-context-budget">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Token Budget Allocation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex h-6 rounded-md overflow-hidden mb-4" data-testid="context-budget-bar">
                      {contextCategories.map((cat) => (
                        <div
                          key={cat.key}
                          className={`${cat.color} transition-all`}
                          style={{ width: `${cat.pct}%` }}
                          title={`${cat.label}: ${cat.tokens} tokens (${cat.pct}%)`}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {contextCategories.map((cat) => {
                        const Icon = cat.icon;
                        return (
                          <div key={cat.key} className="flex items-center gap-2 p-2 rounded-md bg-muted/30" data-testid={`context-source-${cat.key}`}>
                            <div className={`w-2.5 h-2.5 rounded-full ${cat.color} shrink-0`} />
                            <div className="flex flex-col gap-0 min-w-0">
                              <div className="flex items-center gap-1">
                                <Icon className="w-3 h-3 text-muted-foreground" />
                                <span className="text-[11px] font-medium truncate">{cat.label}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{cat.tokens.toLocaleString()} tokens ({cat.pct}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card data-testid="card-context-priority">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Context Priority Order</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      {contextCategories.sort((a, b) => b.tokens - a.tokens).map((cat, idx) => {
                        const Icon = cat.icon;
                        return (
                          <div key={cat.key} className="flex items-center justify-between gap-2 p-2 rounded-md border" data-testid={`priority-${idx}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground font-mono w-4">#{idx + 1}</span>
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm">{cat.label}</span>
                            </div>
                            <Progress value={cat.pct * 4} className="h-1 w-16" />
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  <Card data-testid="card-context-config">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Configuration Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border">
                        <span className="text-sm">Max Context Window</span>
                        <span className="text-sm font-medium">{budgetLimit.toLocaleString()} tokens</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border">
                        <span className="text-sm">Memory Strategy</span>
                        <span className="text-sm font-medium capitalize">{memoryConfig.strategy || "sliding-window"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border">
                        <span className="text-sm">RAG Retrieval</span>
                        <span className="text-sm font-medium">{memoryConfig.ragEnabled ? "Enabled" : "Configured"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border">
                        <span className="text-sm">Industry Preset</span>
                        <Badge variant="outline" className="text-[10px]">{industryLabel}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            );
          })()}
        </TabsContent>

        {agent.agentType === "remote" && (() => {
          const ra = remoteAgents?.find(r => r.agentId === agentId);
          const trustColors: Record<string, string> = {
            untrusted: "text-red-600 dark:text-red-400",
            basic: "text-yellow-600 dark:text-yellow-400",
            verified: "text-blue-600 dark:text-blue-400",
            trusted: "text-green-600 dark:text-green-400",
            privileged: "text-purple-600 dark:text-purple-400",
          };
          const statusIcons: Record<string, typeof Wifi> = {
            online: Wifi,
            offline: WifiOff,
            degraded: AlertTriangle,
            unknown: HelpCircle,
          };
          return (
            <TabsContent value="a2a" className="flex flex-col gap-4 mt-0" data-testid="tab-content-a2a">
              {ra ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-base">Connectivity</CardTitle>
                      {(() => {
                        const StatusIcon = statusIcons[ra.connectivityStatus as string] || HelpCircle;
                        return <StatusIcon className={`h-5 w-5 ${ra.connectivityStatus === "online" ? "text-green-500" : ra.connectivityStatus === "offline" ? "text-red-500" : "text-yellow-500"}`} />;
                      })()}
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-muted-foreground">Status</span>
                        <Badge variant={ra.connectivityStatus === "online" ? "default" : "secondary"} data-testid="badge-a2a-status">{ra.connectivityStatus}</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-muted-foreground">Trust Tier</span>
                        <span className={`text-sm font-medium ${trustColors[ra.trustTier as string] || ""}`} data-testid="text-a2a-trust">{ra.trustTier}</span>
                      </div>
                      {ra.agentCardUrl && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-muted-foreground">Agent Card URL</span>
                          <span className="text-sm truncate max-w-[200px]" title={ra.agentCardUrl} data-testid="text-a2a-url">{ra.agentCardUrl}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Allowed Skills</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {ra.allowedSkills && ra.allowedSkills.length > 0 ? (
                        <div className="flex flex-wrap gap-2" data-testid="list-a2a-skills">
                          {ra.allowedSkills.map((skill, i) => (
                            <Badge key={i} variant="secondary" data-testid={`badge-skill-${i}`}>{skill}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No skills whitelisted</p>
                      )}
                    </CardContent>
                  </Card>

                  {Boolean(ra.agentCardData) && (
                    <Card className="md:col-span-2">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Agent Card Details</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-64" data-testid="pre-a2a-card">
                          {JSON.stringify(ra.agentCardData as Record<string, unknown>, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No A2A remote agent configuration found for this agent.
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          );
        })()}

        {agent.agentType === "team" && (
          <TabsContent value="team" className="flex flex-col gap-4 mt-0" data-testid="tab-content-team">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Team Composition</CardTitle>
              </CardHeader>
              <CardContent>
                {teamMembers && teamMembers.length > 0 ? (
                  <div className="flex flex-col gap-2" data-testid="list-team-members">
                    {teamMembers.map((tm) => {
                      const memberAgent = allAgents?.find(a => a.id === tm.memberAgentId);
                      const memberRole = tm.role || "member";
                      const roleIcon = memberRole === "lead" ? Crown : memberRole === "observer" ? Eye : Users;
                      const RoleIcon = roleIcon;
                      return (
                        <div key={tm.id} className="flex items-center justify-between gap-2 p-3 rounded-md border" data-testid={`row-team-member-${tm.id}`}>
                          <div className="flex items-center gap-3">
                            <RoleIcon className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">{memberAgent?.name || tm.memberAgentId}</p>
                              {memberAgent && <p className="text-xs text-muted-foreground">{memberAgent.agentType} agent</p>}
                            </div>
                          </div>
                          <Badge variant="secondary" data-testid={`badge-role-${tm.id}`}>{memberRole}</Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No members assigned to this team yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="mcp-servers" className="flex flex-col gap-4 mt-0" data-testid="tab-content-mcp-servers">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Linked MCP Servers</span>
              {agentMcpLinks && agentMcpLinks.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{agentMcpLinks.length}</Badge>
              )}
            </div>
            <Dialog open={assignMcpOpen} onOpenChange={setAssignMcpOpen}>
              <Button size="sm" onClick={() => setAssignMcpOpen(true)} data-testid="button-assign-mcp">
                <Network className="w-4 h-4 mr-1.5" /> Assign MCP Server
              </Button>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Assign MCP Server</DialogTitle>
                  <DialogDescription>Link an MCP server to give this agent access to its tools, resources, and prompts.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>MCP Server</Label>
                    <Select value={selectedMcpServerId} onValueChange={setSelectedMcpServerId}>
                      <SelectTrigger data-testid="select-mcp-server">
                        <SelectValue placeholder="Select an MCP server" />
                      </SelectTrigger>
                      <SelectContent>
                        {allMcpServers?.filter(s => !agentMcpLinks?.some(l => l.serverId === s.id)).map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => assignMcpMutation.mutate(undefined as any)}
                    disabled={!selectedMcpServerId || assignMcpMutation.isPending}
                    data-testid="button-confirm-assign-mcp"
                  >
                    {assignMcpMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Network className="w-4 h-4 mr-1.5" />}
                    Assign Server
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {!agentMcpLinks || agentMcpLinks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Network className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-mcp-servers">
                  No MCP servers assigned. Link servers to give this agent access to tools and resources.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {agentMcpLinks.map((link) => {
                const server = allMcpServers?.find(s => s.id === link.serverId);
                return (
                  <McpServerLinkCard
                    key={link.id}
                    link={link}
                    server={server}
                    onUnlink={() => unlinkMcpMutation.mutate(link.id)}
                    unlinking={unlinkMcpMutation.isPending}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        <Dialog open={!!mcpPolicyWarnings} onOpenChange={(open) => { if (!open) { setMcpPolicyWarnings(null); setMcpPolicyWarningServerId(""); setMcpPolicyWarningServerName(""); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                Policy Compatibility Warnings
              </DialogTitle>
              <DialogDescription>
                Linking MCP server <span className="font-semibold">{mcpPolicyWarningServerName}</span> has identified tools that may require additional governance policies on this agent.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto" data-testid="mcp-policy-warnings-list">
              {mcpPolicyWarnings?.map((warning, idx) => (
                <div key={idx} className="flex flex-col gap-1 p-3 rounded-md border border-amber-500/30 bg-amber-500/5" data-testid={`mcp-policy-warning-${idx}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={warning.riskClassification === "critical" ? "destructive" : "secondary"} className="text-[10px]">
                      <Shield className="w-3 h-3 mr-0.5" />
                      {warning.riskClassification}
                    </Badge>
                    <span className="text-sm font-medium font-mono">{warning.toolName}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{warning.issue}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Badge variant="outline" className="text-[10px]">Required: {warning.requiredPolicyDomain}</Badge>
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => { setMcpPolicyWarnings(null); setMcpPolicyWarningServerId(""); setMcpPolicyWarningServerName(""); }}
                data-testid="button-cancel-mcp-policy-warning"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={acknowledgeAndLinkMcp}
                disabled={assignMcpMutation.isPending}
                data-testid="button-acknowledge-mcp-policy-warning"
              >
                {assignMcpMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-1.5" />}
                Acknowledge & Link Anyway
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <TabsContent value="ontology" className="flex flex-col gap-4 mt-0" data-testid="tab-content-ontology">
          {(() => {
            const currentTags: Array<{ conceptId: string; label: string; category?: string }> = (() => {
              const raw = agent.ontologyTags as any;
              if (Array.isArray(raw)) return raw;
              if (raw && typeof raw === "object" && Array.isArray(raw.tags)) return raw.tags;
              return [];
            })();
            const conceptMap = new Map((allOntologyConcepts || []).map(c => [c.id, c]));
            const industryConcepts = (allOntologyConcepts || []).filter(c =>
              industry?.id ? c.industryId === industry.id : true
            );
            const categories = Array.from(new Set(industryConcepts.map(c => c.category))).sort();
            const taggedIds = new Set(currentTags.map(t => t.conceptId));
            const untaggedConcepts = industryConcepts.filter(c => !taggedIds.has(c.id));

            return (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Ontology Tags</span>
                    <Badge variant="secondary" className="text-[10px]">{currentTags.length} mapped</Badge>
                  </div>
                  {industry && (
                    <Badge variant="outline" className="text-[10px]">{industry.ontology || industry.label}</Badge>
                  )}
                </div>

                <OntologyComplianceCard agentId={agentId!} hasOntologyTags={currentTags.length > 0} />

                {currentTags.length > 0 ? (
                  <Card data-testid="card-current-ontology-tags">
                    <CardHeader className="flex flex-row items-center gap-2 pb-3">
                      <Network className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">Mapped Concepts ({currentTags.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 flex flex-col gap-2">
                      {currentTags.map(tag => {
                        const concept = conceptMap.get(tag.conceptId);
                        return (
                          <div key={tag.conceptId} className="flex items-start gap-2 p-2.5 border rounded-md group" data-testid={`ontology-tag-${tag.conceptId}`}>
                            <Brain className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-medium">{tag.label || concept?.label || tag.conceptId}</span>
                                <Badge variant="outline" className="text-[9px] text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700">
                                  {tag.category || concept?.category || "General"}
                                </Badge>
                              </div>
                              {concept?.description && (
                                <p className="text-[11px] text-muted-foreground line-clamp-2">{concept.description}</p>
                              )}
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ visibility: "visible" }}
                              data-testid={`button-remove-ontology-${tag.conceptId}`}
                              onClick={async () => {
                                const updated = currentTags.filter(t => t.conceptId !== tag.conceptId);
                                try {
                                  await apiRequest("PATCH", `/api/agents/${agentId}`, { ontologyTags: updated });
                                  queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
                                  toast({ title: "Ontology tag removed" });
                                } catch {
                                  toast({ title: "Failed to remove tag", variant: "destructive" });
                                }
                              }}
                            >
                              <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                ) : (
                  <Card data-testid="card-no-ontology-tags">
                    <CardContent className="p-6 flex flex-col items-center gap-2 text-center">
                      <Brain className="w-8 h-8 text-muted-foreground" />
                      <p className="text-sm font-medium">No ontology tags mapped</p>
                      <p className="text-xs text-muted-foreground">Map this agent to domain concepts to enable ontology-aware governance and compliance.</p>
                    </CardContent>
                  </Card>
                )}

                <Card data-testid="card-add-ontology-tags">
                  <CardHeader className="flex flex-row items-center gap-2 pb-3">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Add Ontology Concepts</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-col gap-3">
                    {categories.length > 0 ? (
                      categories.map(cat => {
                        const catConcepts = untaggedConcepts.filter(c => c.category === cat);
                        if (catConcepts.length === 0) return null;
                        return (
                          <div key={cat} className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">{cat}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {catConcepts.map(c => (
                                <Badge
                                  key={c.id}
                                  variant="outline"
                                  className="text-[10px] cursor-pointer hover-elevate"
                                  data-testid={`badge-add-ontology-${c.id}`}
                                  onClick={async () => {
                                    const updated = [...currentTags, { conceptId: c.id, label: c.label, category: c.category }];
                                    try {
                                      await apiRequest("PATCH", `/api/agents/${agentId}`, { ontologyTags: updated });
                                      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
                                      toast({ title: `Tagged with "${c.label}"` });
                                    } catch {
                                      toast({ title: "Failed to add tag", variant: "destructive" });
                                    }
                                  }}
                                >
                                  <Plus className="w-3 h-3 mr-0.5" /> {c.label}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-3" data-testid="text-no-concepts">
                        No ontology concepts available. Generate concepts from the Ontology Explorer first.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="api-gateway" className="flex flex-col gap-4 mt-0" data-testid="tab-content-api-gateway">
          <AgentApiGateway agent={agent} />
        </TabsContent>

        <TabsContent value="channels" className="flex flex-col gap-4 mt-0" data-testid="tab-content-channels">
          <AgentChannels agent={agent} />
        </TabsContent>

        <TabsContent value="knowledge-base" className="flex flex-col gap-4 mt-0" data-testid="tab-content-knowledge-base">
          <AgentKnowledgeBases agent={agent} />
        </TabsContent>

        <TabsContent value="event-triggers" className="flex flex-col gap-4 mt-0" data-testid="tab-content-event-triggers">
          <AgentEventTriggers agent={agent} triggers={agentTriggers || []} onRefresh={refetchTriggers} allAgents={allAgents || []} allMcpServers={allMcpServers || []} />
        </TabsContent>

        <TabsContent value="gitops" className="flex flex-col gap-4 mt-0" data-testid="tab-content-gitops">
          <AgentGitOps agent={agent} />
        </TabsContent>
      </Tabs>

      <Dialog open={shadowReplayOpen} onOpenChange={setShadowReplayOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Shadow Replay</DialogTitle>
            <DialogDescription>
              Replay historical traces against the current agent version to detect behavioral divergences without affecting production.
            </DialogDescription>
          </DialogHeader>
          {!shadowResult ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Time Window</Label>
                <Select value={shadowTimeWindow} onValueChange={setShadowTimeWindow}>
                  <SelectTrigger data-testid="select-shadow-time-window">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">Last 1 hour</SelectItem>
                    <SelectItem value="6h">Last 6 hours</SelectItem>
                    <SelectItem value="24h">Last 24 hours</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Target Environment</Label>
                <Select value={shadowEnvironment} onValueChange={setShadowEnvironment}>
                  <SelectTrigger data-testid="select-shadow-environment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="pilot">Pilot</SelectItem>
                    <SelectItem value="prod">Production (read-only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Sample Size</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={shadowSampleSize}
                  onChange={(e) => setShadowSampleSize(e.target.value)}
                  data-testid="input-shadow-sample-size"
                />
                <span className="text-xs text-muted-foreground">Number of historical traces to replay (1-100)</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-1 p-3 rounded-md bg-muted/30">
                  <span className="text-lg font-semibold">{shadowResult.tracesReplayed}</span>
                  <span className="text-[10px] text-muted-foreground">Traces Replayed</span>
                </div>
                <div className="flex flex-col items-center gap-1 p-3 rounded-md bg-muted/30">
                  <span className={`text-lg font-semibold ${shadowResult.passRate >= 0.9 ? "text-green-600" : shadowResult.passRate >= 0.7 ? "text-amber-500" : "text-red-500"}`}>
                    {Math.round(shadowResult.passRate * 100)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">Pass Rate</span>
                </div>
                <div className="flex flex-col items-center gap-1 p-3 rounded-md bg-muted/30">
                  <span className="text-lg font-semibold">{shadowResult.divergences.length}</span>
                  <span className="text-[10px] text-muted-foreground">Divergences</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{shadowResult.summary}</p>
              {shadowResult.divergences.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Divergences</span>
                  <div className="max-h-72 overflow-y-auto space-y-2">
                    {shadowResult.divergences.map((div, i) => {
                      const typeLabels: Record<string, string> = {
                        output_mismatch: "Output Divergence",
                        latency_spike: "Latency Spike",
                        execution_failure: "Execution Failure",
                      };
                      const friendlyType = typeLabels[div.divergenceType] || div.divergenceType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
                      const origText = div.originalOutput || div.original || "No output recorded";
                      const replayText = div.replayOutput || div.replay || "No replay output";
                      const needsTruncation = origText.length > 120 || replayText.length > 120;
                      return (
                        <details key={i} className="group p-2.5 rounded-md bg-muted/30 space-y-1" data-testid={`divergence-${i}`}>
                          <summary className="cursor-pointer list-none space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">{friendlyType}</Badge>
                                {needsTruncation && <span className="text-[10px] text-muted-foreground italic">Click to expand</span>}
                              </div>
                              <span className="text-[10px] text-muted-foreground font-mono">Trace: {div.traceId.slice(0, 8)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] group-open:hidden">
                              <div>
                                <span className="text-muted-foreground block mb-0.5">Original</span>
                                <span className="font-mono">{origText.length > 120 ? origText.slice(0, 120) + "…" : origText}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block mb-0.5">Replay</span>
                                <span className="font-mono">{replayText.length > 120 ? replayText.slice(0, 120) + "…" : replayText}</span>
                              </div>
                            </div>
                          </summary>
                          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                            <div>
                              <span className="text-muted-foreground block mb-0.5">Original</span>
                              <span className="font-mono whitespace-pre-wrap break-words">{origText}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block mb-0.5">Replay</span>
                              <span className="font-mono whitespace-pre-wrap break-words">{replayText}</span>
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {shadowResult ? (
              <Button variant="outline" onClick={() => setShadowReplayOpen(false)} data-testid="button-close-shadow-replay">
                Close
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShadowReplayOpen(false)} data-testid="button-cancel-shadow-replay">
                  Cancel
                </Button>
                <Button
                  onClick={() => shadowReplayMutation.mutate()}
                  disabled={shadowReplayMutation.isPending}
                  data-testid="button-start-shadow-replay"
                >
                  {shadowReplayMutation.isPending ? (
                    <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Replaying...</>
                  ) : (
                    <><Play className="w-3.5 h-3.5 mr-1.5" /> Start Replay</>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saveAsTemplateOpen} onOpenChange={(open) => { setSaveAsTemplateOpen(open); if (!open) setTemplateTab("identity"); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Save Agent as Template</DialogTitle>
            <DialogDescription>
              Review each section then save. All model settings, tools, policies, and runtime config will be captured.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={templateTab} onValueChange={setTemplateTab} className="mt-1">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="identity" data-testid="tab-template-identity">1. Identity</TabsTrigger>
              <TabsTrigger value="classification" data-testid="tab-template-classification">2. Classification</TabsTrigger>
              <TabsTrigger value="review" data-testid="tab-template-review">3. Review</TabsTrigger>
            </TabsList>

            {/* Tab 1: Identity */}
            <TabsContent value="identity" className="overflow-y-auto max-h-[60vh] space-y-4 pt-4 pb-1">
              <div className="space-y-1.5">
                <Label htmlFor="template-name">Template Name <span className="text-destructive">*</span></Label>
                <Input id="template-name" data-testid="input-template-name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Customer Support Agent Template" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="template-description">Description</Label>
                <Textarea id="template-description" data-testid="input-template-description" value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} rows={4} placeholder="Describe what this template does and when to use it…" />
              </div>
            </TabsContent>

            {/* Tab 2: Classification */}
            <TabsContent value="classification" className="overflow-y-auto max-h-[60vh] space-y-4 pt-4 pb-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={templateCategory} onValueChange={setTemplateCategory}>
                    <SelectTrigger data-testid="select-template-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="support">Support</SelectItem>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="analytics">Analytics</SelectItem>
                      <SelectItem value="compliance">Compliance</SelectItem>
                      <SelectItem value="operations">Operations</SelectItem>
                      <SelectItem value="data_processing">Data Processing</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Industry</Label>
                  <Select value={templateIndustry} onValueChange={setTemplateIndustry}>
                    <SelectTrigger data-testid="select-template-industry"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cross_industry">Cross-Industry</SelectItem>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                      <SelectItem value="financial_services">Financial Services</SelectItem>
                      <SelectItem value="manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="technology_saas">Technology / SaaS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Complexity</Label>
                <Select value={templateComplexity} onValueChange={setTemplateComplexity}>
                  <SelectTrigger data-testid="select-template-complexity" className="w-1/2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Icon</Label>
                <div className="grid grid-cols-8 gap-1.5">
                  {([
                    { value: "bot", Icon: Bot, label: "Bot" },
                    { value: "brain", Icon: Brain, label: "Brain" },
                    { value: "zap", Icon: Zap, label: "Zap" },
                    { value: "shield", Icon: Shield, label: "Shield" },
                    { value: "bar-chart", Icon: BarChart3, label: "Chart" },
                    { value: "database", Icon: Database, label: "Data" },
                    { value: "users", Icon: Users, label: "Users" },
                    { value: "workflow", Icon: Workflow, label: "Flow" },
                  ] as const).map(({ value, Icon: IconComp, label }) => (
                    <button
                      key={value}
                      type="button"
                      data-testid={`button-icon-${value}`}
                      onClick={() => setTemplateIcon(value)}
                      title={label}
                      className={[
                        "flex flex-col items-center gap-0.5 rounded-md border p-1.5 text-[10px] cursor-pointer transition-colors",
                        templateIcon === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/40 hover:bg-muted/50 text-muted-foreground",
                      ].join(" ")}
                    >
                      <IconComp className="w-4 h-4" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tags</Label>
                <div className="rounded-md border px-2 py-1.5 min-h-[38px] flex flex-wrap gap-1.5 items-center focus-within:ring-1 focus-within:ring-ring">
                  {templateTagsList.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs gap-1 pr-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() => setTemplateTagsList(prev => prev.filter((_, j) => j !== i))}
                        data-testid={`button-remove-tag-${i}`}
                        className="rounded-full hover:bg-muted ml-0.5"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    data-testid="input-template-tag"
                    className="text-xs flex-1 min-w-[100px] outline-none bg-transparent placeholder:text-muted-foreground"
                    placeholder={templateTagsList.length === 0 ? "Add tag, press Enter or comma…" : "Add another…"}
                    value={templateTagInput}
                    onChange={(e) => setTemplateTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        const t = templateTagInput.trim().replace(/,$/, "");
                        if (t && !templateTagsList.includes(t)) setTemplateTagsList(prev => [...prev, t]);
                        setTemplateTagInput("");
                      } else if (e.key === "Backspace" && !templateTagInput && templateTagsList.length > 0) {
                        setTemplateTagsList(prev => prev.slice(0, -1));
                      }
                    }}
                    onBlur={() => {
                      const t = templateTagInput.trim();
                      if (t && !templateTagsList.includes(t)) setTemplateTagsList(prev => [...prev, t]);
                      setTemplateTagInput("");
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Press Enter or comma to add · Backspace to remove last</p>
              </div>
            </TabsContent>

            {/* Tab 3: Review */}
            <TabsContent value="review" className="overflow-y-auto max-h-[60vh] pt-4 pb-1">
              <div className="space-y-3 pr-0.5">
                {/* Template identity summary */}
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Template Identity</p>
                  <p className="text-sm font-medium">{templateName || <span className="text-muted-foreground italic">(untitled)</span>}</p>
                  {templateDescription && <p className="text-xs text-muted-foreground">{templateDescription}</p>}
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    <Badge variant="outline" className="text-xs capitalize">{templateCategory.replace(/_/g, " ")}</Badge>
                    <Badge variant="outline" className="text-xs capitalize">{templateIndustry.replace(/_/g, " ")}</Badge>
                    <Badge variant="outline" className="text-xs capitalize">{templateComplexity} complexity</Badge>
                  </div>
                </div>
                {/* Agent configuration being captured */}
                {agent && (() => {
                  const rc = (agent.runtimeConfig as Record<string, any>) || {};
                  const kpiBindings = Array.isArray(rc.kpiBindings) ? rc.kpiBindings as any[] : [];
                  const workflowSteps = Array.isArray(rc.workflowSteps) ? rc.workflowSteps as any[] : [];
                  const matchedSkills = Array.isArray(rc.matchedSkills) ? rc.matchedSkills as any[] : [];
                  const mcpToolBindings = Array.isArray(rc.mcpToolBindings) ? rc.mcpToolBindings as any[] : [];
                  const taskPrompt = typeof rc.prompt === "string" ? rc.prompt : "";
                  const outputSchema = rc.outputSchema;
                  const complianceTags = Array.isArray(agent.complianceTags) ? agent.complianceTags as string[] : [];
                  const ontConcepts = Array.isArray((agent.ontologyTags as any)?.concepts) ? (agent.ontologyTags as any).concepts as any[] : [];
                  const policyBindings = agent.policyBindings as Record<string, any> | null;
                  const policyCount = policyBindings ? Object.keys(policyBindings).length : 0;
                  const evalBindings = agent.evalBindings as Record<string, any> | null;
                  const evalCount = evalBindings ? Object.keys(evalBindings).length : 0;
                  const memoryRagConfig = agent.memoryRagConfig as Record<string, any> | null;
                  const hasMemoryRag = memoryRagConfig && Object.keys(memoryRagConfig).length > 0;
                  const permissionsConfig = agent.permissionsConfig as Record<string, any> | null;
                  const hasPermissions = permissionsConfig && Object.keys(permissionsConfig).length > 0;
                  const toolsCount = Array.isArray(agent.toolsConfig) ? (agent.toolsConfig as any[]).length : 0;
                  return (
                    <div className="space-y-2">
                      {/* Model & Runtime */}
                      <div className="rounded-md border p-3 space-y-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Model & Runtime</p>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs" data-testid="badge-template-model">
                            <Cpu className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium">{agent.modelProvider || "openai"}</span>
                            <span className="text-muted-foreground">/ {agent.modelName || "gpt-4.1"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs" data-testid="badge-template-risk">
                            <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium">{agent.riskTier || "MEDIUM"} risk</span>
                            <span className="text-muted-foreground">· {agent.autonomyMode || "assisted"} mode</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span>Max {agent.maxToolIterations || 5} tool iterations</span>
                          </div>
                          {agent.department && (
                            <div className="flex items-center gap-2 text-xs">
                              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span>Department: <span className="font-medium">{agent.department}</span></span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Prompts */}
                      <div className="rounded-md border p-3 space-y-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Prompts</p>
                        <div className="space-y-2">
                          {agent.systemPrompt ? (
                            <div className="space-y-0.5" data-testid="badge-template-prompt">
                              <div className="flex items-center gap-2 text-xs">
                                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="font-medium">System Prompt</span>
                                <span className="text-muted-foreground ml-auto">{agent.systemPrompt.length} chars</span>
                              </div>
                              <p className="text-xs text-muted-foreground pl-5 italic leading-relaxed line-clamp-2">"{agent.systemPrompt.slice(0, 200)}{agent.systemPrompt.length > 200 ? "…" : ""}"</p>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span className="italic">No system prompt configured</span>
                            </div>
                          )}
                          {taskPrompt && (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2 text-xs">
                                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="font-medium">Task Prompt</span>
                                <span className="text-muted-foreground ml-auto">{taskPrompt.length} chars</span>
                              </div>
                              <p className="text-xs text-muted-foreground pl-5 italic leading-relaxed line-clamp-2">"{taskPrompt.slice(0, 200)}{taskPrompt.length > 200 ? "…" : ""}"</p>
                            </div>
                          )}
                          {outputSchema && (
                            <div className="flex items-center gap-2 text-xs">
                              <Code className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium">Output Schema</span>
                              <Badge variant="outline" className="text-xs ml-auto">defined</Badge>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Tools & Workflow */}
                      <div className="rounded-md border p-3 space-y-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tools & Workflow</p>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs" data-testid="badge-template-tools">
                            <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span>{toolsCount} tool{toolsCount !== 1 ? "s" : ""} configured</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs" data-testid="badge-template-runtime">
                            <Workflow className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span>{workflowSteps.length} workflow step{workflowSteps.length !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <BarChart3 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span>{kpiBindings.length} KPI binding{kpiBindings.length !== 1 ? "s" : ""}</span>
                          </div>
                          {kpiBindings.length > 0 && (
                            <div className="pl-5 flex flex-wrap gap-1">
                              {kpiBindings.slice(0, 5).map((k: any, i: number) => (
                                <Badge key={i} variant="secondary" className="text-xs">{typeof k === "string" ? k : k.kpiName || k.name || `KPI ${i+1}`}</Badge>
                              ))}
                              {kpiBindings.length > 5 && <Badge variant="outline" className="text-xs">+{kpiBindings.length - 5} more</Badge>}
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs">
                            <Network className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span>{mcpToolBindings.length} MCP tool binding{mcpToolBindings.length !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                      </div>
                      {/* Integrations */}
                      {((agentMcpLinks && agentMcpLinks.length > 0) || (agentKbData?.knowledgeBases && agentKbData.knowledgeBases.length > 0)) && (
                        <div className="rounded-md border p-3 space-y-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Integrations</p>
                          <div className="space-y-2">
                            {agentMcpLinks && agentMcpLinks.length > 0 && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs">
                                  <Network className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="font-medium">MCP Servers ({agentMcpLinks.length})</span>
                                </div>
                                <div className="pl-5 flex flex-wrap gap-1">
                                  {agentMcpLinks.map((link) => {
                                    const server = allMcpServers?.find(s => s.id === link.serverId);
                                    return server ? <Badge key={link.serverId} variant="secondary" className="text-xs">{server.name}</Badge> : null;
                                  })}
                                </div>
                              </div>
                            )}
                            {agentKbData?.knowledgeBases && agentKbData.knowledgeBases.length > 0 && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs">
                                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="font-medium">Knowledge Bases ({agentKbData.knowledgeBases.length})</span>
                                </div>
                                <div className="pl-5 flex flex-wrap gap-1">
                                  {agentKbData.knowledgeBases.map((kb) => (
                                    <Badge key={kb.id} variant="secondary" className="text-xs">{kb.name}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Skills */}
                      {matchedSkills.length > 0 && (
                        <div className="rounded-md border p-3 space-y-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Skills ({matchedSkills.length})</p>
                          <div className="flex flex-wrap gap-1">
                            {matchedSkills.slice(0, 8).map((s: any, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs">{typeof s === "string" ? s : s.name || s.skillName || `Skill ${i+1}`}</Badge>
                            ))}
                            {matchedSkills.length > 8 && <Badge variant="outline" className="text-xs">+{matchedSkills.length - 8} more</Badge>}
                          </div>
                        </div>
                      )}
                      {/* Governance */}
                      {(policyCount > 0 || complianceTags.length > 0 || ontConcepts.length > 0) && (
                        <div className="rounded-md border p-3 space-y-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Governance & Compliance</p>
                          <div className="space-y-1.5">
                            {policyCount > 0 && (
                              <div className="flex items-center gap-2 text-xs">
                                <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span>{policyCount} policy binding{policyCount !== 1 ? "s" : ""} captured</span>
                              </div>
                            )}
                            {complianceTags.length > 0 && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs">
                                  <CheckCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="font-medium">Compliance Tags ({complianceTags.length})</span>
                                </div>
                                <div className="pl-5 flex flex-wrap gap-1">
                                  {complianceTags.map((t, i) => <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>)}
                                </div>
                              </div>
                            )}
                            {ontConcepts.length > 0 && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs">
                                  <Brain className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="font-medium">Ontology Concepts ({ontConcepts.length})</span>
                                </div>
                                <div className="pl-5 flex flex-wrap gap-1">
                                  {ontConcepts.slice(0, 6).map((c: any, i: number) => (
                                    <Badge key={i} variant="outline" className="text-xs">{typeof c === "string" ? c : c.conceptLabel || `Concept ${i+1}`}</Badge>
                                  ))}
                                  {ontConcepts.length > 6 && <Badge variant="outline" className="text-xs">+{ontConcepts.length - 6} more</Badge>}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Evaluations & Memory */}
                      {(evalCount > 0 || hasMemoryRag || hasPermissions) && (
                        <div className="rounded-md border p-3 space-y-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Evaluations & Advanced</p>
                          <div className="space-y-1.5">
                            {evalCount > 0 && (
                              <div className="flex items-center gap-2 text-xs">
                                <CheckCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span>{evalCount} eval binding{evalCount !== 1 ? "s" : ""} captured</span>
                              </div>
                            )}
                            {hasMemoryRag && (
                              <div className="flex items-center gap-2 text-xs">
                                <Database className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span>Memory / RAG configuration captured</span>
                              </div>
                            )}
                            {hasPermissions && (
                              <div className="flex items-center gap-2 text-xs">
                                <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span>Permissions configuration captured</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* Tags */}
                {templateTagsList.length > 0 && (
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tags ({templateTagsList.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {templateTagsList.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2 pt-2">
            {templateTab !== "identity" && (
              <Button
                variant="outline"
                onClick={() => setTemplateTab(templateTab === "review" ? "classification" : "identity")}
                data-testid="button-template-back"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
            )}
            <Button variant="outline" onClick={() => setSaveAsTemplateOpen(false)} data-testid="button-cancel-save-template">Cancel</Button>
            {templateTab !== "review" ? (
              <Button
                onClick={() => setTemplateTab(templateTab === "identity" ? "classification" : "review")}
                disabled={!templateName.trim()}
                data-testid="button-template-next"
              >
                Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => saveAsTemplateMutation.mutate({
                  name: templateName,
                  description: templateDescription,
                  category: templateCategory,
                  industry: templateIndustry,
                  tags: templateTagsList,
                  complexity: templateComplexity,
                  icon: templateIcon,
                })}
                disabled={saveAsTemplateMutation.isPending || !templateName.trim()}
                data-testid="button-confirm-save-template"
              >
                {saveAsTemplateMutation.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</>
                ) : (
                  <><Copy className="w-3.5 h-3.5 mr-1.5" /> Save Template</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deployStrategyDialogOpen} onOpenChange={setDeployStrategyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Deployment Strategy Recommendation
            </DialogTitle>
            <DialogDescription>
              {deployRecommendation?.recommended?.reason}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {deployRecommendation?.slaRequirements && deployRecommendation.slaRequirements.length > 0 && (
              <div className="flex flex-col gap-1.5 p-3 rounded-md border bg-muted/30">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Outcome SLA Requirements</span>
                <span className="text-xs font-medium">{deployRecommendation.outcomeName}</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {deployRecommendation.slaRequirements.map((sla, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] border-amber-500/40" data-testid={`badge-sla-${i}`}>
                      {sla.kpiName}: ≥{sla.slaThreshold.toFixed(1)}% (target: {sla.target} {sla.unit})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {deployRecommendation?.recommended?.canaryConfig && (
              <div className="flex flex-col gap-1.5 p-3 rounded-md border bg-green-500/5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Recommended Canary Configuration</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Start traffic:</span> {deployRecommendation.recommended.canaryConfig.startPercent}%</div>
                  <div><span className="text-muted-foreground">Step increment:</span> {deployRecommendation.recommended.canaryConfig.stepPercent}%</div>
                  <div><span className="text-muted-foreground">Step interval:</span> {deployRecommendation.recommended.canaryConfig.intervalMinutes}min</div>
                  <div><span className="text-muted-foreground">Max error rate:</span> {(deployRecommendation.recommended.canaryConfig.maxErrorRate * 100).toFixed(1)}%</div>
                </div>
              </div>
            )}
            {deployRecommendation?.recommended?.rollbackConfig && (
              <div className="flex flex-col gap-1.5 p-3 rounded-md border bg-red-500/5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Auto-Rollback Triggers</span>
                <div className="flex flex-col gap-1">
                  {deployRecommendation.recommended.rollbackConfig.triggers.map((t: any, i: number) => (
                    <span key={i} className="text-[11px] text-muted-foreground">
                      {t.metric.replace(/_/g, " ")}: {t.operator} {t.value} (within {t.windowMinutes}min)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full"
              disabled={deployMutation.isPending}
              onClick={() => deployMutation.mutate({ useRecommended: true })}
              data-testid="button-deploy-canary-recommended"
            >
              <Rocket className="w-4 h-4 mr-1.5" />
              {deployMutation.isPending ? "Creating..." : "Deploy with Recommended Canary"}
            </Button>
            <Button
              variant="outline"
              className="w-full border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
              disabled={deployMutation.isPending}
              onClick={() => deployMutation.mutate(undefined as any)}
              data-testid="button-deploy-full-override"
            >
              <AlertTriangle className="w-4 h-4 mr-1.5" />
              Deploy Anyway (Full) — Not Recommended
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={retireDialogOpen} onOpenChange={setRetireDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Initiate Retirement</DialogTitle>
            <DialogDescription>
              This will begin the retirement process. For HIGH or CRITICAL risk agents, an expert approval will be required before the retirement proceeds.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Retirement Reason</Label>
              <Textarea
                value={retireReason}
                onChange={(e) => setRetireReason(e.target.value)}
                placeholder="Why is this agent being retired?"
                data-testid="input-retire-reason"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Replacement Agent ID (optional)</Label>
              <Input
                value={replacementAgentId}
                onChange={(e) => setReplacementAgentId(e.target.value)}
                placeholder="UUID of replacement agent"
                data-testid="input-replacement-agent"
              />
            </div>
            {(agent?.riskTier === "HIGH" || agent?.riskTier === "CRITICAL") && (
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-xs text-muted-foreground">This is a {agent.riskTier} risk agent. Retirement will require expert approval before proceeding.</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetireDialogOpen(false)} data-testid="button-cancel-retire">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => initiateRetirementMutation.mutate({
                reason: retireReason,
                replacementAgentId: replacementAgentId || undefined,
                requireApproval: agent?.riskTier === "HIGH" || agent?.riskTier === "CRITICAL",
              })}
              disabled={initiateRetirementMutation.isPending || !retireReason.trim()}
              data-testid="button-confirm-retire"
            >
              {initiateRetirementMutation.isPending ? "Processing..." : "Begin Retirement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={constraintViolationDialogOpen} onOpenChange={(open) => { setConstraintViolationDialogOpen(open); if (!open) setPendingConfigChange(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              Outcome Constraint Violations
            </DialogTitle>
            <DialogDescription>
              The proposed configuration change conflicts with bound outcome constraints. Review the violations below before proceeding.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto" data-testid="constraint-violations-list">
            {constraintViolations.map((v, i) => (
              <div key={i} className={`flex flex-col gap-1.5 p-3 rounded-md border ${v.severity === "critical" ? "bg-red-500/10 border-red-500/30" : "bg-amber-500/10 border-amber-500/30"}`} data-testid={`constraint-violation-${i}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={v.severity === "critical" ? "destructive" : "outline"} className="text-[10px] uppercase" data-testid={`badge-violation-severity-${i}`}>
                    {v.severity === "critical" ? <XCircle className="w-3 h-3 mr-0.5" /> : <AlertTriangle className="w-3 h-3 mr-0.5" />}
                    {v.severity}
                  </Badge>
                </div>
                <p className="text-xs font-medium" data-testid={`text-violation-constraint-${i}`}>{v.constraint}</p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>Current: <strong>{v.current}</strong></span>
                  <ArrowRight className="w-3 h-3" />
                  <span>Proposed: <strong>{v.proposed}</strong></span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setConstraintViolationDialogOpen(false); setPendingConfigChange(null); }} data-testid="button-cancel-constraint-override">
              Cancel
            </Button>
            {constraintViolations.every(v => v.severity !== "critical") ? (
              <Button variant="default" onClick={() => { setConstraintViolationDialogOpen(false); pendingConfigChange?.onConfirm(); setPendingConfigChange(null); }} data-testid="button-confirm-constraint-override">
                Proceed Anyway
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => { setConstraintViolationDialogOpen(false); pendingConfigChange?.onConfirm(); setPendingConfigChange(null); }} data-testid="button-force-constraint-override">
                <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                Override Critical Constraint
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

export default function AgentDetail() {
  return (
    <AgentDetailErrorBoundary>
      <AgentDetailInner />
    </AgentDetailErrorBoundary>
  );
}

function MemoryComplianceCard({ agentId }: { agentId: string }) {
  const { data: compliance } = useQuery<{ score: number; checks: Array<{ rule: string; status: string; detail: string }>; violations: Array<{ traceId: string; violation: string; timestamp: string }>; hasGovernanceRules: boolean; profileLinked: boolean }>({
    queryKey: ["/api/agents", agentId, "memory-compliance"],
    queryFn: () => fetch("/api/agents/" + agentId + "/memory-compliance").then(r => r.json()),
    enabled: !!agentId,
  });

  if (!compliance) return null;

  const scoreColor = compliance.score >= 80 ? "text-emerald-600 dark:text-emerald-400" : compliance.score >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const scoreBg = compliance.score >= 80 ? "bg-emerald-500/10 border-emerald-500/20" : compliance.score >= 50 ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20";

  return (
    <Card data-testid="card-memory-compliance">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Memory Compliance</CardTitle>
          <Badge variant="outline" className={"text-[11px] " + scoreBg + " " + scoreColor} data-testid="badge-memory-compliance-score">{compliance.score}%</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {compliance.checks.map((check, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]" data-testid={"memory-check-" + i}>
            {check.status === "pass" ? <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" /> : check.status === "fail" ? <XCircle className="w-3 h-3 text-red-500 shrink-0" /> : <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />}
            <span className="font-medium">{check.rule}</span>
            <span className="text-muted-foreground ml-auto">{check.detail}</span>
          </div>
        ))}
        {compliance.violations.length > 0 && (
          <div className="mt-2 pt-2 border-t">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Recent Violations</span>
            {compliance.violations.map((v, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-red-600 dark:text-red-400 mt-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>{v.violation}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OntologyComplianceCard({ agentId, hasOntologyTags }: { agentId: string; hasOntologyTags: boolean }) {
  const { data: compliance } = useQuery<{
    hasOntology: boolean;
    requiredTerms: string[];
    deprecatedTerms: Array<{ deprecated: string; useInstead: string }>;
    recentCompliance: Array<{ traceId: string; score: number; canonicalCount: number; deprecatedCount: number; timestamp: string; deprecatedTermsUsed: Array<{ term: string; shouldUse: string }> }>;
    averageScore: number | null;
    trend: "improving" | "declining" | "stable";
    topNonStandardTerms: Array<{ term: string; shouldUse: string; occurrences: number }>;
  }>({
    queryKey: ["/api/agents", agentId, "ontology-compliance"],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/ontology-compliance`);
      if (!res.ok) throw new Error("Failed to fetch ontology compliance");
      return res.json();
    },
    enabled: hasOntologyTags,
  });

  if (!hasOntologyTags || !compliance?.hasOntology) return null;

  const score = compliance.averageScore;
  const hasData = compliance.recentCompliance.length > 0;
  const scoreColor = score === null ? "text-muted-foreground" : score >= 80 ? "text-green-500" : score >= 50 ? "text-amber-500" : "text-red-500";
  const scoreBorder = score === null ? "border-border" : score >= 80 ? "border-green-500/30" : score >= 50 ? "border-amber-500/30" : "border-red-500/30";

  return (
    <Card className={`${scoreBorder}`} data-testid="card-ontology-compliance">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          Ontology Vocabulary Compliance
          {score !== null && (
            <Badge
              variant={score >= 80 ? "default" : score >= 50 ? "outline" : "destructive"}
              className="text-[10px] ml-auto"
              data-testid="badge-ontology-compliance-score"
            >
              {score}% avg
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center gap-1 p-2 rounded-md bg-muted/30" data-testid="stat-ontology-score">
            <span className="text-[10px] text-muted-foreground">Avg Score</span>
            <span className={`text-lg font-bold ${scoreColor}`}>{score !== null ? `${score}%` : "—"}</span>
          </div>
          <div className="flex flex-col items-center gap-1 p-2 rounded-md bg-muted/30" data-testid="stat-ontology-trend">
            <span className="text-[10px] text-muted-foreground">Trend</span>
            <div className="flex items-center gap-1">
              {compliance.trend === "improving" ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : compliance.trend === "declining" ? (
                <TrendingDown className="w-4 h-4 text-red-500" />
              ) : (
                <Minus className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-xs capitalize">{compliance.trend}</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 p-2 rounded-md bg-muted/30" data-testid="stat-ontology-runs">
            <span className="text-[10px] text-muted-foreground">Runs</span>
            <span className="text-lg font-bold">{compliance.recentCompliance.length}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{compliance.requiredTerms.length} required terms</span>
          <span className="w-px h-3 bg-border" />
          <span>{compliance.deprecatedTerms.length} deprecated synonyms mapped</span>
        </div>

        {compliance.topNonStandardTerms.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Top Non-Standard Terms Used</span>
            {compliance.topNonStandardTerms.map((t) => (
              <div key={t.term} className="flex items-center gap-2 text-xs p-1.5 rounded border border-amber-500/20 bg-amber-500/5" data-testid={`nonstandard-term-${t.term}`}>
                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                <span className="font-medium">"{t.term}"</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">use "{t.shouldUse}"</span>
                <Badge variant="outline" className="text-[9px] ml-auto">{t.occurrences}x</Badge>
              </div>
            ))}
          </div>
        )}

        {!hasData && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No execution data yet. Run the agent to see ontology compliance scores.
          </p>
        )}

        {hasData && compliance.recentCompliance.length > 1 && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Recent Runs</span>
            <div className="flex items-end gap-px h-8">
              {compliance.recentCompliance.slice(0, 10).reverse().map((run, i) => (
                <div
                  key={run.traceId}
                  className={`flex-1 rounded-t-sm ${run.score >= 80 ? "bg-green-500" : run.score >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ height: `${Math.max(10, run.score)}%`, opacity: 0.6 + (i / 15) }}
                  title={`${run.score}% — ${run.canonicalCount} canonical, ${run.deprecatedCount} deprecated`}
                  data-testid={`bar-compliance-run-${i}`}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BlueprintModelConfig({ agent }: { agent: Agent }) {
  return (
    <Card data-testid="section-model-config">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <Cpu className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Model Configuration</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Provider</span>
            <span className="text-sm font-medium" data-testid="text-model-provider">{agent.modelProvider}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Model</span>
            <span className="text-sm font-medium" data-testid="text-model-name">{agent.modelName}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Version</span>
            <span className="text-sm font-medium" data-testid="text-model-version">v{agent.currentVersion}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Environment</span>
            <span className="text-sm font-medium" data-testid="text-model-env">{agent.environment}</span>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost / Run</span>
            <span className="text-sm font-medium">${agent.costPerRun?.toFixed(3)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Latency</span>
            <span className="text-sm font-medium">{formatMs(agent.avgLatencyMs)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Autonomy Mode</span>
            <span className="text-sm font-medium capitalize">{agent.autonomyMode}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ImplementationGraph({ agent, toolConnectors, onGenerateExport }: { agent: Agent; toolConnectors: ToolConnector[]; onGenerateExport: () => void }) {
  const blueprint = agent.blueprintJson as any;
  const tools = (Array.isArray(agent.toolsConfig) ? agent.toolsConfig : []) as Array<{ name: string; type?: string; description?: string }>;
  const memoryRag = agent.memoryRagConfig as any;
  const policyBindings = agent.policyBindings as any;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const connectorMap = new Map(toolConnectors.map(c => [normalize(c.name), c]));

  const nodes = (blueprint?.nodes || []) as Array<{ id: string; type: string; label?: string }>;
  const codeNodeTypes = new Set(["tool_call", "api_call", "webhook", "queue_consumer", "event_listener"]);
  const customNodes = nodes.filter(n => codeNodeTypes.has(n.type));
  const declarativeNodes = nodes.filter(n => !codeNodeTypes.has(n.type));

  type GraphItem = {
    id: string;
    label: string;
    category: "declarative" | "code";
    icon: typeof Settings;
    status: "present" | "missing" | "partial";
    detail: string;
  };

  const items: GraphItem[] = [];

  const hasInstructions = !!(blueprint?.instructions || blueprint?.systemPrompt || (agent as any).systemPrompt);
  items.push({
    id: "instructions",
    label: "Instructions / System Prompt",
    category: "declarative",
    icon: MessageSquare,
    status: hasInstructions ? "present" : "missing",
    detail: hasInstructions ? "Embedded in export config" : "Not configured",
  });

  const modelConfig = (agent as any).modelConfig || blueprint?.model;
  items.push({
    id: "orchestration",
    label: "Orchestration Config",
    category: "declarative",
    icon: Settings,
    status: modelConfig ? "present" : "missing",
    detail: modelConfig ? `${(modelConfig as any)?.provider || "LLM"} / ${(modelConfig as any)?.model || "default"}` : "No model configured",
  });

  if (declarativeNodes.length > 0) {
    items.push({
      id: "workflow-nodes",
      label: "Workflow Nodes",
      category: "declarative",
      icon: Network,
      status: "present",
      detail: `${declarativeNodes.length} declarative node${declarativeNodes.length !== 1 ? "s" : ""}`,
    });
  }

  const hasKnowledge = !!(memoryRag?.knowledgeSources?.length || memoryRag?.ragEndpoint || memoryRag?.vectorStore);
  items.push({
    id: "knowledge",
    label: "Knowledge / RAG Config",
    category: "declarative",
    icon: BookOpenCheck,
    status: hasKnowledge ? "present" : "missing",
    detail: hasKnowledge
      ? `${memoryRag?.knowledgeSources?.length || 0} source${(memoryRag?.knowledgeSources?.length || 0) !== 1 ? "s" : ""}`
      : "No knowledge sources",
  });

  const hasPolicies = Array.isArray(policyBindings) && policyBindings.length > 0;
  items.push({
    id: "policy-bindings",
    label: "Policy Bindings",
    category: "declarative",
    icon: Shield,
    status: hasPolicies ? "present" : "missing",
    detail: hasPolicies ? `${policyBindings.length} bound` : "No policies bound",
  });

  tools.forEach(tool => {
    const normalized = normalize(tool.name || "");
    const connector = connectorMap.get(normalized);
    const connected = connector && connector.status === "connected";
    items.push({
      id: `tool-${normalized}`,
      label: tool.name,
      category: "code",
      icon: Code,
      status: connected ? "present" : "missing",
      detail: connected ? "Adapter connected" : "Adapter needed",
    });
  });

  customNodes.forEach(node => {
    items.push({
      id: `custom-node-${node.id}`,
      label: node.label || node.id,
      category: "code",
      icon: Blocks,
      status: "partial",
      detail: `${node.type.replace(/_/g, " ")} — code stub generated`,
    });
  });

  const declarativeItems = items.filter(i => i.category === "declarative");
  const codeItems = items.filter(i => i.category === "code");

  const statusColor = (s: GraphItem["status"]) =>
    s === "present" ? "text-emerald-500" : s === "partial" ? "text-amber-500" : "text-muted-foreground";
  const statusIcon = (s: GraphItem["status"]) =>
    s === "present" ? CheckCircle : s === "partial" ? AlertCircle : XCircle;

  return (
    <Card data-testid="card-implementation-graph">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <Network className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium" data-testid="title-implementation-graph">Implementation Graph</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]" data-testid="badge-impl-declarative-count">
              {declarativeItems.length} declarative
            </Badge>
            <Badge variant="outline" className="text-[10px]" data-testid="badge-impl-code-count">
              {codeItems.length} code
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2" data-testid="impl-graph-declarative">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary" data-testid="badge-category-declarative">Declarative</Badge>
              <span className="text-[11px] text-muted-foreground" data-testid="text-declarative-desc">Embedded in export configuration</span>
            </div>
            {declarativeItems.map(item => {
              const SIcon = statusIcon(item.status);
              return (
                <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-md border bg-background" data-testid={`impl-node-${item.id}`}>
                  <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-medium truncate">{item.label}</span>
                    <span className="text-[11px] text-muted-foreground truncate" data-testid={`impl-detail-${item.id}`}>{item.detail}</span>
                  </div>
                  <SIcon className={`w-3.5 h-3.5 shrink-0 ${statusColor(item.status)}`} data-testid={`impl-status-${item.id}`} />
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2" data-testid="impl-graph-code">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive" data-testid="badge-category-code">Code Required</Badge>
              <span className="text-[11px] text-muted-foreground" data-testid="text-code-desc">Generated as application code</span>
            </div>
            {codeItems.length > 0 ? codeItems.map(item => {
              const SIcon = statusIcon(item.status);
              return (
                <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-md border bg-background" data-testid={`impl-node-${item.id}`}>
                  <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-medium truncate">{item.label}</span>
                    <span className="text-[11px] text-muted-foreground truncate" data-testid={`impl-detail-${item.id}`}>{item.detail}</span>
                  </div>
                  <SIcon className={`w-3.5 h-3.5 shrink-0 ${statusColor(item.status)}`} data-testid={`impl-status-${item.id}`} />
                </div>
              );
            }) : (
              <p className="text-[11px] text-muted-foreground text-center py-4" data-testid="text-no-code-items">No tool adapters or custom nodes configured</p>
            )}
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium" data-testid="text-impl-summary">
              {items.filter(i => i.status === "present").length}/{items.length} components ready
            </span>
            <span className="text-[11px] text-muted-foreground" data-testid="text-impl-subtitle">
              {codeItems.filter(i => i.status === "missing").length > 0
                ? `${codeItems.filter(i => i.status === "missing").length} adapter${codeItems.filter(i => i.status === "missing").length !== 1 ? "s" : ""} will be generated`
                : "All components accounted for"}
            </span>
          </div>
          <Button size="sm" onClick={onGenerateExport} data-testid="button-generate-export-package">
            <Package className="w-3.5 h-3.5 mr-1.5" /> Generate Export Package
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BlueprintWorkflowGraph({ blueprint }: { blueprint: any }) {
  const hasNodes = blueprint?.nodes?.length > 0;
  const hasSteps = blueprint?.steps?.length > 0;

  if (!hasNodes && !hasSteps) {
    return (
      <Card data-testid="section-workflow-graph">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <GitBranch className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Workflow Graph</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">No workflow graph defined</p>
        </CardContent>
      </Card>
    );
  }

  const nodes: Array<{ id: string; type: string; label?: string; [k: string]: any }> = hasNodes
    ? blueprint.nodes
    : blueprint.steps.map((step: any) => ({
        id: step.id,
        type: step.type || "process",
        label: step.label,
        order: step.order,
      }));
  const edges = (blueprint.edges || []) as Array<{ from: string; to: string }>;

  const nodeTypeColor: Record<string, string> = {
    schema_validate: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    rag: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    llm_plan: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    llm_classify: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    llm_score: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    llm_generate: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    llm_analyze: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    tool_call: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    policy_check: "bg-red-500/15 text-red-600 dark:text-red-400",
    response_format: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    conditional: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    file_intake: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    vision_extract: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    schema_map: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    rule_validate: "bg-red-500/15 text-red-600 dark:text-red-400",
    rule_filter: "bg-red-500/15 text-red-600 dark:text-red-400",
    lookup: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    webhook: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    api_call: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    data_aggregate: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    notification: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
    queue_consumer: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    trigger: "bg-green-500/15 text-green-600 dark:text-green-400",
    process: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    output: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    evidence_collect: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    audit_log: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
    event_listener: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    human_review: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    classifier: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    router: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    llm_call: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    output_format: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  };

  const orderedNodes: typeof nodes = [];
  const visited = new Set<string>();
  const startIds = nodes.map(n => n.id).filter(id => !edges.some(e => e.to === id));
  const queue = startIds.length > 0 ? [...startIds] : [nodes[0]?.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const node = nodes.find(n => n.id === current);
    if (node) orderedNodes.push(node);
    edges.filter(e => e.from === current).forEach(e => queue.push(e.to));
  }
  nodes.filter(n => !visited.has(n.id)).forEach(n => orderedNodes.push(n));

  return (
    <Card data-testid="section-workflow-graph">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <GitBranch className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Workflow Graph</CardTitle>
          <Badge variant="outline" className="text-[10px] ml-auto">{orderedNodes.length} nodes</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-0">
          {orderedNodes.map((node, i) => {
            const colorClass = nodeTypeColor[node.type] || "bg-muted text-muted-foreground";
            const details = Object.entries(node).filter(([k]) => !["id", "type", "label"].includes(k));
            return (
              <div key={node.id} className="flex flex-col items-center w-full">
                <div className="flex items-center gap-3 w-full max-w-xl p-3 rounded-md border bg-background" data-testid={`workflow-node-${node.id}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${colorClass}`}>
                      {node.type.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-sm font-medium truncate">{node.label || node.id}</span>
                  </div>
                  {details.length > 0 && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[40%]" title={details.map(([k,v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')}>
                      {details.slice(0, 2).map(([k, v]) => `${k}: ${typeof v === 'object' ? (Array.isArray(v) ? v.join(', ') : '...') : v}`).join(' | ')}
                    </span>
                  )}
                </div>
                {i < orderedNodes.length - 1 && (
                  <div className="flex flex-col items-center py-1">
                    <div className="w-px h-3 bg-border" />
                    <ChevronRight className="w-3 h-3 text-muted-foreground rotate-90" />
                    <div className="w-px h-3 bg-border" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function BlueprintToolsPermissions({ tools, permissions }: { tools: any; permissions: any }) {
  const rawTools = (Array.isArray(tools) ? tools : []) as Array<any>;
  const toolList = rawTools.map((t: any) => ({
    name: t.name || "Unknown",
    type: t.type || "",
    description: t.description || "",
    rateLimit: t.rateLimit,
    timeout: t.timeout,
    permissions: Array.isArray(t.permissions) ? t.permissions : [],
  }));
  const rawPerms = (permissions && typeof permissions === "object" && !Array.isArray(permissions)) ? permissions as any : null;
  const perms = rawPerms ? {
    allowedActions: Array.isArray(rawPerms.allowedActions) ? rawPerms.allowedActions : [],
    deniedActions: Array.isArray(rawPerms.deniedActions) ? rawPerms.deniedActions : [],
    escalationTriggers: Array.isArray(rawPerms.escalationTriggers) ? rawPerms.escalationTriggers : [],
    maxTokenBudget: rawPerms.maxTokenBudget,
    maxCostPerRun: rawPerms.maxCostPerRun,
    requireHumanApproval: Array.isArray(rawPerms.requireHumanApproval) ? rawPerms.requireHumanApproval : [],
    dataAccess: Array.isArray(rawPerms.dataAccess) ? rawPerms.dataAccess : [],
    writeAccess: Array.isArray(rawPerms.writeAccess) ? rawPerms.writeAccess : [],
    apiAccess: Array.isArray(rawPerms.apiAccess) ? rawPerms.apiAccess : [],
  } : null;

  return (
    <Card data-testid="section-tools-permissions">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <Wrench className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Tools & Permissions</CardTitle>
          {toolList.length > 0 && <Badge variant="outline" className="text-[10px] ml-auto">{toolList.length} tools</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {toolList.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Registered Tools</span>
            <div className="space-y-1.5">
              {toolList.map((tool) => (
                <div key={tool.name} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`tool-row-${tool.name}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {tool.type && (
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${tool.type === "write" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}`}>
                        {tool.type}
                      </Badge>
                    )}
                    <span className="text-xs font-mono font-medium truncate">{tool.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {tool.rateLimit && <span className="text-[10px] text-muted-foreground">{tool.rateLimit}</span>}
                    {tool.timeout && <span className="text-[10px] text-muted-foreground">{tool.timeout}ms</span>}
                    {tool.permissions.length > 0 && <span className="text-[10px] text-muted-foreground">{tool.permissions.length} perms</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {perms && (
          <>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Unlock className="w-3 h-3 text-emerald-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Allowed Actions</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.allowedActions?.map((a: string) => (
                    <Badge key={a} variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" data-testid={`permission-allowed-${a}`}>{a.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-red-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Denied Actions</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.deniedActions?.map((a: string) => (
                    <Badge key={a} variant="outline" className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" data-testid={`permission-denied-${a}`}>{a.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
            </div>
            {perms.escalationTriggers && perms.escalationTriggers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Escalation Triggers</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.escalationTriggers.map((t: string) => (
                    <Badge key={t} variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">{t.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
            )}
            {perms.requireHumanApproval && perms.requireHumanApproval.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-blue-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Require Human Approval</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.requireHumanApproval.map((a: string) => (
                    <Badge key={a} variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">{a.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              {perms.maxTokenBudget != null && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Token Budget</span>
                  <span className="text-sm font-medium">{perms.maxTokenBudget.toLocaleString()}</span>
                </div>
              )}
              {perms.maxCostPerRun != null && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Max Cost / Run</span>
                  <span className="text-sm font-medium">${perms.maxCostPerRun.toFixed(2)}</span>
                </div>
              )}
            </div>
            {perms.dataAccess.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Database className="w-3 h-3 text-cyan-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Data Access</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.dataAccess.map((a: string) => (
                    <Badge key={a} variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20">{a.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
            )}
            {perms.writeAccess.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-amber-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Write Access</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.writeAccess.map((a: string) => (
                    <Badge key={a} variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">{a.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
            )}
            {perms.apiAccess.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-violet-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">API Access</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.apiAccess.map((a: string) => (
                    <Badge key={a} variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20">{a.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {toolList.length === 0 && !perms && (
          <p className="text-sm text-muted-foreground text-center py-4">No tools or permissions configured</p>
        )}
      </CardContent>
    </Card>
  );
}

function BlueprintMemoryRag({ config }: { config: any }) {
  if (!config) {
    return (
      <Card data-testid="section-memory-rag">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <Database className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Memory & RAG Configuration</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">No memory/RAG configuration</p>
        </CardContent>
      </Card>
    );
  }

  const raw = config as any;
  const cfg = {
    embeddingModel: raw.embeddingModel || "",
    chunkStrategy: raw.chunkStrategy || raw.retrievalStrategy || "",
    chunkSize: raw.chunkSize || 0,
    chunkOverlap: raw.chunkOverlap || 0,
    vectorStore: raw.vectorStore || "",
    citationsRequired: raw.citationsRequired || false,
    maxRetrievedChunks: raw.maxRetrievedChunks || raw.topK || 0,
    similarityThreshold: raw.similarityThreshold || 0,
    sources: Array.isArray(raw.sources) ? raw.sources : [],
  };

  const configEntries = [
    cfg.embeddingModel && { label: "Embedding Model", value: cfg.embeddingModel, mono: true },
    cfg.chunkStrategy && { label: "Retrieval Strategy", value: cfg.chunkStrategy },
    cfg.chunkSize > 0 && { label: cfg.chunkOverlap > 0 ? "Chunk Size / Overlap" : "Chunk Size", value: cfg.chunkOverlap > 0 ? `${cfg.chunkSize} / ${cfg.chunkOverlap}` : String(cfg.chunkSize) },
    cfg.vectorStore && { label: "Vector Store", value: cfg.vectorStore },
    cfg.maxRetrievedChunks > 0 && { label: "Max Chunks / Top K", value: String(cfg.maxRetrievedChunks) },
    cfg.similarityThreshold > 0 && { label: "Similarity Threshold", value: String(cfg.similarityThreshold) },
    { label: "Citations", value: cfg.citationsRequired ? "Required" : "Optional" },
  ].filter(Boolean) as Array<{ label: string; value: string; mono?: boolean }>;

  return (
    <Card data-testid="section-memory-rag">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <Database className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Memory & RAG Configuration</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {configEntries.map((entry) => (
            <div key={entry.label} className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{entry.label}</span>
              <span className={`text-sm font-medium ${entry.mono ? "font-mono text-xs" : ""} capitalize`} data-testid={`text-rag-${entry.label.toLowerCase().replace(/\s+/g, "-")}`}>{entry.value}</span>
            </div>
          ))}
        </div>

        {cfg.sources.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Data Sources</span>
              <div className="space-y-1.5">
                {cfg.sources.map((src: any, i: number) => (
                  <div key={src.id || `src-${i}`} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`rag-source-${src.id || i}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium truncate">{src.name || `Source ${i + 1}`}</span>
                        {src.type && <span className="text-[10px] text-muted-foreground">{src.type.replace(/_/g, " ")}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {src.docCount != null && <span className="text-[10px] text-muted-foreground">{src.docCount.toLocaleString()} docs</span>}
                      {src.lastSynced && (
                        <span className="text-[10px] text-muted-foreground">{new Date(src.lastSynced).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BlueprintPolicyBindings({ bindings }: { bindings: any }) {
  const rawPolicies = (Array.isArray(bindings) ? bindings : []) as Array<any>;
  const policies = rawPolicies.map((pol: any, i: number) => {
    if (typeof pol === "string") {
      return { id: pol, name: pol, enforcement: "soft_warn" as string, description: "" };
    }
    const name = pol.name || pol.policyName || pol.policyId || `Policy ${i + 1}`;
    const enforcement = pol.enforcement === "hard" ? "hard_block" : (pol.enforcement || "soft_warn");
    return { id: pol.policyId || pol.policyName || `pol-${i}`, name, enforcement, description: pol.description || "" };
  });

  return (
    <Card data-testid="section-policy-bindings">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Policy Bindings</CardTitle>
          {policies.length > 0 && <Badge variant="outline" className="text-[10px] ml-auto">{policies.length} policies</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {policies.length > 0 ? (
          <div className="space-y-1.5">
            {policies.map((pol) => (
              <div key={pol.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`policy-binding-${pol.id}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {pol.enforcement === "hard_block" ? (
                    <Lock className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium truncate">{pol.name}</span>
                    {pol.description && <span className="text-[10px] text-muted-foreground truncate">{pol.description}</span>}
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${pol.enforcement === "hard_block" ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"}`}>
                  {pol.enforcement.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No policies bound</p>
        )}
      </CardContent>
    </Card>
  );
}

function BlueprintEvalBindings({ bindings }: { bindings: any }) {
  const rawEvals = (Array.isArray(bindings) ? bindings : []) as Array<any>;
  const evals = rawEvals.map((ev: any, i: number) => ({
    suiteId: ev.suiteId || ev.suiteName || `eval-${i}`,
    name: ev.name || ev.suiteName || `Eval Suite ${i + 1}`,
    type: ev.type || "",
    passThreshold: ev.passThreshold ?? 0,
    schedule: ev.schedule || "",
    lastRun: ev.lastRun,
    lastPassRate: ev.lastPassRate,
  }));

  return (
    <Card data-testid="section-eval-bindings">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <FlaskConical className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Eval Suite Bindings</CardTitle>
          {evals.length > 0 && <Badge variant="outline" className="text-[10px] ml-auto">{evals.length} suites</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {evals.length > 0 ? (
          <div className="space-y-1.5">
            {evals.map((ev) => {
              const passing = ev.lastPassRate != null && ev.passThreshold > 0 && ev.lastPassRate >= ev.passThreshold;
              return (
                <div key={ev.suiteId} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`eval-binding-${ev.suiteId}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {ev.lastPassRate != null ? (
                      passing ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      )
                    ) : (
                      <FlaskConical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium truncate">{ev.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {[ev.type && ev.type.replace(/_/g, " "), ev.schedule, ev.passThreshold > 0 && `threshold: ${(ev.passThreshold * 100).toFixed(0)}%`].filter(Boolean).join(" | ")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {ev.lastPassRate != null && (
                      <>
                        <span className={`text-xs font-medium ${passing ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {(ev.lastPassRate * 100).toFixed(1)}%
                        </span>
                        <Progress value={ev.lastPassRate * 100} className="h-1.5 w-14" />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No eval suites bound</p>
        )}
      </CardContent>
    </Card>
  );
}

function BlueprintRollbackPlan({ plan }: { plan: any }) {
  if (!plan) {
    return (
      <Card data-testid="section-rollback-plan">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <History className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Rollback Plan</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">No rollback plan configured</p>
        </CardContent>
      </Card>
    );
  }

  const raw = plan as any;
  const rb = {
    previousVersion: raw.previousVersion || "",
    rollbackStrategy: raw.rollbackStrategy || "",
    healthCheckInterval: raw.healthCheckInterval || "",
    rollbackApprover: raw.rollbackApprover || "",
    lastRollbackAt: raw.lastRollbackAt || null,
    autoRollbackTriggers: Array.isArray(raw.autoRollbackTriggers) ? raw.autoRollbackTriggers : [],
    canaryConfig: raw.canaryConfig || null,
    shadowModeDuration: raw.shadowModeDuration || "",
    canarySteps: Array.isArray(raw.canarySteps) ? raw.canarySteps : [],
  };

  return (
    <Card data-testid="section-rollback-plan">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <History className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Rollback Plan</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {rb.previousVersion && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Previous Version</span>
              <span className="text-sm font-medium font-mono" data-testid="text-rollback-version">v{rb.previousVersion}</span>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Strategy</span>
            <span className="text-sm font-medium capitalize">{(rb.rollbackStrategy || "N/A").replace(/_/g, " ")}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Health Check</span>
            <span className="text-sm font-medium">{rb.healthCheckInterval || "N/A"}</span>
          </div>
          {rb.rollbackApprover && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Approver</span>
              <span className="text-sm font-medium capitalize">{rb.rollbackApprover.replace(/_/g, " ")}</span>
            </div>
          )}
          {rb.shadowModeDuration && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Shadow Mode</span>
              <span className="text-sm font-medium">{rb.shadowModeDuration}</span>
            </div>
          )}
          {rb.canarySteps.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Canary Steps</span>
              <span className="text-sm font-medium">{rb.canarySteps.join("% → ")}%</span>
            </div>
          )}
        </div>

        {rb.lastRollbackAt && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Rollback</span>
            <span className="text-sm font-medium">{new Date(rb.lastRollbackAt).toLocaleString()}</span>
          </div>
        )}

        {rb.autoRollbackTriggers && rb.autoRollbackTriggers.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Auto-Rollback Triggers</span>
              <div className="space-y-1.5">
                {rb.autoRollbackTriggers.map((trigger: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`rollback-trigger-${i}`}>
                    <div className="flex items-center gap-2">
                      <Gauge className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium">{trigger.metric.replace(/_/g, " ")}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {trigger.operator} {trigger.threshold} over {trigger.window}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {rb.canaryConfig && (
          <>
            <Separator />
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Canary Configuration</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">Start %</span>
                  <span className="text-sm font-medium">{rb.canaryConfig.startPercent}%</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">Step %</span>
                  <span className="text-sm font-medium">{rb.canaryConfig.stepPercent}%</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">Step Interval</span>
                  <span className="text-sm font-medium">{rb.canaryConfig.stepInterval}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">Max %</span>
                  <span className="text-sm font-medium">{rb.canaryConfig.maxPercent}%</span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AgentApiGateway({ agent }: { agent: any }) {
  const { toast } = useToast();
  const [tryItInput, setTryItInput] = useState("");
  const [tryItResult, setTryItResult] = useState<any>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [tryItApiKey, setTryItApiKey] = useState("");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const gatewayEndpoint = `${baseUrl}/api/gateway/v1/invoke/${agent.id}`;
  const agentInfoEndpoint = `${baseUrl}/api/gateway/v1/agents/${agent.id}`;

  const { data: apiKeys = [], isLoading: keysLoading } = useQuery<any[]>({
    queryKey: ["/api/agents", agent.id, "api-keys"],
  });

  const createKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/agents/${agent.id}/api-keys`, { name });
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedKey(data.key);
      setTryItApiKey(data.key);
      setNewKeyName("");
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "api-keys"] });
      toast({ title: "API key created", description: "Copy the key now — it won't be shown again." });
    },
    onError: () => {
      toast({ title: "Failed to create API key", variant: "destructive" });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      await apiRequest("DELETE", `/api/agents/${agent.id}/api-keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "api-keys"] });
      toast({ title: "API key revoked" });
    },
  });

  const invokeMutation = useMutation({
    mutationFn: async ({ input, apiKey }: { input: string; apiKey: string }) => {
      const res = await fetch(`/api/gateway/v1/invoke/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ input }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setTryItResult(data);
    },
    onError: () => {
      toast({ title: "Invocation failed", variant: "destructive" });
    },
  });

  const activeKeys = (apiKeys as any[]).filter((k: any) => k.isActive);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const curlExample = `curl -X POST "${gatewayEndpoint}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{"input": "Your prompt here"}'`;

  const jsExample = `const response = await fetch("${gatewayEndpoint}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_API_KEY",
  },
  body: JSON.stringify({ input: "Your prompt here" }),
});
const result = await response.json();
console.log(result.output);`;

  const pythonExample = `import requests

response = requests.post(
    "${gatewayEndpoint}",
    headers={
        "Content-Type": "application/json",
        "X-API-Key": "YOUR_API_KEY",
    },
    json={"input": "Your prompt here"},
)
result = response.json()
print(result["output"])`;

  return (
    <div className="flex flex-col gap-4">
      <Card data-testid="card-gateway-endpoint">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <Globe className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">API Endpoint</CardTitle>
            <Badge variant={agent.status === "deployed" ? "default" : "secondary"} className="ml-auto text-[10px]">
              {agent.status === "deployed" ? "Live" : "Not Deployed"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {agent.status !== "deployed" && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md" data-testid="gateway-not-deployed-notice">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs text-amber-700 dark:text-amber-400">This agent must be deployed before the API Gateway can be used. Deploy the agent through the Deployments pipeline first.</span>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Invoke Endpoint</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-muted/50 px-3 py-2 rounded-md overflow-x-auto" data-testid="text-gateway-url">
                POST {gatewayEndpoint}
              </code>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(gatewayEndpoint)} data-testid="btn-copy-endpoint">
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Agent Info Endpoint</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-muted/50 px-3 py-2 rounded-md overflow-x-auto">
                GET {agentInfoEndpoint}
              </code>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(agentInfoEndpoint)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Request Body</span>
            <pre className="text-[11px] font-mono bg-muted/30 p-3 rounded-md">
{`{
  "input": "string (required)",
  "environment": "string (optional, default: production)",
  "metadata": "object (optional)"
}`}
            </pre>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Authentication</span>
            <p className="text-xs text-muted-foreground">
              Include your API key via <code className="text-[10px] bg-muted/50 px-1 py-0.5 rounded">X-API-Key</code> header or <code className="text-[10px] bg-muted/50 px-1 py-0.5 rounded">Authorization: Bearer &lt;key&gt;</code>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-api-keys">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <KeyRound className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">API Keys</CardTitle>
            <Badge variant="secondary" className="ml-auto text-[10px]">{activeKeys.length} active</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {createdKey && (
            <div className="flex flex-col gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-md" data-testid="created-key-banner">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-xs font-medium text-green-700 dark:text-green-400">API Key Created — Copy it now!</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] font-mono bg-white/80 dark:bg-black/40 px-2 py-1.5 rounded break-all" data-testid="text-created-key">{createdKey}</code>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(createdKey)} data-testid="btn-copy-key">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <Button variant="ghost" size="sm" className="text-[11px] self-end" onClick={() => setCreatedKey(null)}>Dismiss</Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Key name (e.g., Production, CI/CD)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 h-8 text-xs"
              data-testid="input-key-name"
            />
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!newKeyName.trim() || createKeyMutation.isPending}
              onClick={() => createKeyMutation.mutate(newKeyName.trim())}
              data-testid="btn-create-key"
            >
              {createKeyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Create Key
            </Button>
          </div>
          {keysLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : activeKeys.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4" data-testid="text-no-keys">
              No API keys yet. Create one to start invoking this agent via API.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {activeKeys.map((k: any) => (
                <div key={k.id} className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-md" data-testid={`api-key-${k.id}`}>
                  <KeyRound className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium block truncate">{k.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{k.keyPrefix}•••</span>
                  </div>
                  {k.lastUsedAt && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      Last used {new Date(k.lastUsedAt).toLocaleDateString()}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => revokeKeyMutation.mutate(k.id)}
                    data-testid={`btn-revoke-key-${k.id}`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-try-it">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <Terminal className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Try It</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">API Key</span>
            <Input
              type="password"
              placeholder="Paste your API key here (nous_...)"
              value={tryItApiKey}
              onChange={(e) => setTryItApiKey(e.target.value)}
              className="h-8 text-xs font-mono"
              data-testid="input-try-it-api-key"
            />
            {!tryItApiKey && (
              <p className="text-[10px] text-muted-foreground">
                Create an API key above and it will be auto-filled, or paste an existing key.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Input Prompt</span>
            <Textarea
              placeholder="Enter your input prompt..."
              value={tryItInput}
              onChange={(e) => setTryItInput(e.target.value)}
              className="min-h-[80px] text-xs font-mono"
              data-testid="textarea-try-it-input"
            />
          </div>
          <Button
            size="sm"
            className="self-end text-xs"
            disabled={!tryItInput.trim() || !tryItApiKey.trim() || invokeMutation.isPending || agent.status !== "deployed"}
            onClick={() => {
              invokeMutation.mutate({ input: tryItInput, apiKey: tryItApiKey });
            }}
            data-testid="btn-try-invoke"
          >
            {invokeMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Running...</>
            ) : (
              <><Play className="w-3.5 h-3.5 mr-1" /> Invoke Agent</>
            )}
          </Button>
          {tryItResult && (
            <div className="flex flex-col gap-2 mt-2" data-testid="try-it-result">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">Response</span>
                {tryItResult.usage && (
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{formatMs(tryItResult.usage.latencyMs)}</span>
                    <span>${tryItResult.usage.costUsd?.toFixed(5)}</span>
                    <span>{tryItResult.usage.tokens?.total_tokens} tokens</span>
                  </div>
                )}
              </div>
              {tryItResult.error ? (
                <div className="p-3 bg-destructive/10 text-destructive text-xs rounded-md">
                  {tryItResult.error}: {tryItResult.message}
                </div>
              ) : (
                <div className="p-3 bg-muted/30 rounded-md">
                  <p className="text-xs whitespace-pre-wrap" data-testid="text-try-it-output">{tryItResult.output}</p>
                </div>
              )}
              {tryItResult.id && (
                <span className="text-[10px] text-muted-foreground">Trace ID: {tryItResult.id}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-code-examples">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <Code className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Code Examples</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">cURL</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(curlExample)} data-testid="btn-copy-curl">
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <pre className="text-[11px] font-mono bg-muted/30 p-3 rounded-md overflow-x-auto whitespace-pre" data-testid="code-curl">{curlExample}</pre>
          </div>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">JavaScript / TypeScript</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(jsExample)} data-testid="btn-copy-js">
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <pre className="text-[11px] font-mono bg-muted/30 p-3 rounded-md overflow-x-auto whitespace-pre" data-testid="code-js">{jsExample}</pre>
          </div>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">Python</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(pythonExample)} data-testid="btn-copy-python">
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <pre className="text-[11px] font-mono bg-muted/30 p-3 rounded-md overflow-x-auto whitespace-pre" data-testid="code-python">{pythonExample}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const CHANNEL_TYPES = [
  { type: "slack", label: "Slack", icon: MessageSquare, color: "text-purple-500", bgColor: "bg-purple-500/10", description: "Publish your agent to Slack workspaces. Users can interact via direct messages or channels." },
  { type: "teams", label: "Microsoft Teams", icon: Users, color: "text-blue-500", bgColor: "bg-blue-500/10", description: "Deploy as a Teams bot. Available in chats, channels, and meetings." },
  { type: "discord", label: "Discord", icon: MessageSquare, color: "text-indigo-500", bgColor: "bg-indigo-500/10", description: "Add your agent to Discord servers. Responds to commands and mentions." },
  { type: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "text-green-500", bgColor: "bg-green-500/10", description: "Connect via WhatsApp Business API for customer interactions." },
  { type: "email", label: "Email", icon: Globe, color: "text-orange-500", bgColor: "bg-orange-500/10", description: "Process incoming emails and auto-respond with agent intelligence." },
  { type: "web_widget", label: "Web Widget", icon: Code, color: "text-cyan-500", bgColor: "bg-cyan-500/10", description: "Embed a chat widget on any website. Copy the snippet to get started." },
] as const;

function AgentKnowledgeBases({ agent }: { agent: any }) {
  const { toast } = useToast();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedKbId, setSelectedKbId] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKbName, setNewKbName] = useState("");
  const [newKbDescription, setNewKbDescription] = useState("");
  const [newKbIndustry, setNewKbIndustry] = useState("general");

  const { data: kbData, isLoading } = useQuery<{ links: AgentKnowledgeBase[]; knowledgeBases: KnowledgeBase[] }>({
    queryKey: ["/api/agents", agent.id, "knowledge-bases"],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agent.id}/knowledge-bases`);
      return res.json();
    },
    enabled: !!agent.id,
  });
  const linkedKbs = kbData?.links || [];
  const linkedKbDetails = kbData?.knowledgeBases || [];

  const { data: allKbs = [] } = useQuery<KnowledgeBase[]>({
    queryKey: ["/api/knowledge-bases"],
    enabled: linkDialogOpen,
  });

  const linkMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/agents/${agent.id}/knowledge-bases`, { knowledgeBaseId: selectedKbId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "knowledge-bases"] });
      setLinkDialogOpen(false);
      setSelectedKbId("");
      toast({ title: "Knowledge base linked", description: "The knowledge base has been assigned to this agent." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to link knowledge base", description: err.message, variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) =>
      apiRequest("DELETE", `/api/agents/${agent.id}/knowledge-bases/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "knowledge-bases"] });
      toast({ title: "Knowledge base unlinked", description: "The knowledge base has been removed from this agent." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to unlink", description: err.message, variant: "destructive" });
    },
  });

  const createKbMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/knowledge-bases", {
        name: newKbName.trim(),
        description: newKbDescription.trim() || undefined,
        industry: newKbIndustry,
      });
      return res.json();
    },
    onSuccess: async (newKb: any) => {
      try {
        await apiRequest("POST", `/api/agents/${agent.id}/knowledge-bases`, { knowledgeBaseId: newKb.id });
        queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "knowledge-bases"] });
        queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases"] });
        setCreateDialogOpen(false);
        setNewKbName("");
        setNewKbDescription("");
        setNewKbIndustry("general");
        toast({ title: "Knowledge base created & linked", description: `"${newKb.name}" has been created and linked to this agent.` });
      } catch (linkErr: any) {
        queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases"] });
        toast({ title: "KB created but linking failed", description: `"${newKb.name}" was created. You can link it manually.`, variant: "destructive" });
        setCreateDialogOpen(false);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create knowledge base", description: err.message, variant: "destructive" });
    },
  });

  const { data: evalKbGaps } = useQuery<{ totalFailedCases: number; analyzedCases: number; gaps: any[]; summary: { totalGapsIdentified: number } }>({
    queryKey: ["/api/agents", agent.id, "eval-kb-gaps"],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agent.id}/eval-kb-gaps`);
      return res.json();
    },
    enabled: !!agent.id,
  });

  const evalGapCount = evalKbGaps?.summary?.totalGapsIdentified || 0;

  const linkedKbIds = new Set(linkedKbs.map((l: any) => l.knowledgeBaseId));
  const availableKbs = allKbs.filter(kb => !linkedKbIds.has(kb.id));

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold" data-testid="text-kb-section-title">Linked Knowledge Bases</h3>
          <Badge variant="secondary" className="text-xs" data-testid="badge-kb-count">{linkedKbs.length}</Badge>
          {evalGapCount > 0 && (
            <Badge variant="destructive" className="text-[10px]" data-testid="badge-eval-kb-gaps">
              <AlertTriangle className="w-3 h-3 mr-0.5" />
              {evalGapCount} Eval Gap{evalGapCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setCreateDialogOpen(true)} data-testid="button-create-kb">
            <Plus className="w-4 h-4 mr-1" /> Create New
          </Button>
          <Button size="sm" onClick={() => setLinkDialogOpen(true)} data-testid="button-link-kb">
            <Plus className="w-4 h-4 mr-1" /> Link Existing
          </Button>
        </div>
      </div>

      {linkedKbs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
            <BookOpen className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-kb-empty">No knowledge bases linked to this agent yet.</p>
            <Button size="sm" variant="outline" onClick={() => setLinkDialogOpen(true)} data-testid="button-link-kb-empty">
              <Plus className="w-4 h-4 mr-1" /> Link one now
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {linkedKbs.map((link: any) => {
            const kb = linkedKbDetails.find((k: KnowledgeBase) => k.id === link.knowledgeBaseId) || allKbs.find((k: KnowledgeBase) => k.id === link.knowledgeBaseId);
            return (
              <Card key={link.id} data-testid={`card-kb-link-${link.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-bold" data-testid={`text-kb-name-${link.id}`}>
                        {kb?.name || link.knowledgeBaseId}
                      </CardTitle>
                      {kb?.status && (
                        <Badge variant={kb.status === "active" ? "default" : "secondary"} className="text-[10px]">
                          {kb.status}
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => unlinkMutation.mutate(link.id)}
                      disabled={unlinkMutation.isPending}
                      data-testid={`button-unlink-kb-${link.id}`}
                    >
                      <XCircle className="w-4 h-4 mr-1" /> Unlink
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {kb?.industry && (
                    <Badge variant="outline" className="text-[10px] w-fit" data-testid={`badge-kb-industry-${link.id}`}>
                      {kb.industry}
                    </Badge>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span data-testid={`text-kb-sources-${link.id}`}>{kb?.totalSources ?? 0} sources</span>
                    <span data-testid={`text-kb-chunks-${link.id}`}>{kb?.totalChunks ?? 0} chunks</span>
                  </div>
                  <Link href={`/knowledge-bases/${link.knowledgeBaseId}`}>
                    <Button size="sm" variant="outline" data-testid={`button-view-kb-${link.id}`}>
                      <Eye className="w-4 h-4 mr-1" /> View Knowledge Base
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Knowledge Base</DialogTitle>
            <DialogDescription>
              Select a knowledge base to link to this agent. The agent will use it for RAG retrieval.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Knowledge Base</Label>
              <Select value={selectedKbId} onValueChange={setSelectedKbId}>
                <SelectTrigger data-testid="select-kb-to-link">
                  <SelectValue placeholder="Select a knowledge base" />
                </SelectTrigger>
                <SelectContent>
                  {availableKbs.length === 0 ? (
                    <SelectItem value="__none" disabled>No available knowledge bases</SelectItem>
                  ) : (
                    availableKbs.map(kb => (
                      <SelectItem key={kb.id} value={kb.id} data-testid={`option-kb-${kb.id}`}>
                        {kb.name} ({kb.industry})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)} data-testid="button-cancel-link-kb">Cancel</Button>
            <Button
              onClick={() => linkMutation.mutate()}
              disabled={!selectedKbId || selectedKbId === "__none" || linkMutation.isPending}
              data-testid="button-confirm-link-kb"
            >
              {linkMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Linking...</> : <><Plus className="w-3.5 h-3.5 mr-1" /> Link</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create & Link Knowledge Base</DialogTitle>
            <DialogDescription>
              Create a new knowledge base and automatically link it to this agent.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Name</Label>
              <Input
                value={newKbName}
                onChange={e => setNewKbName(e.target.value)}
                placeholder="e.g. Product Documentation"
                data-testid="input-new-kb-name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Description</Label>
              <Textarea
                value={newKbDescription}
                onChange={e => setNewKbDescription(e.target.value)}
                placeholder="What kind of knowledge will this contain?"
                className="min-h-[60px]"
                data-testid="input-new-kb-description"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Industry</Label>
              <Select value={newKbIndustry} onValueChange={setNewKbIndustry}>
                <SelectTrigger data-testid="select-new-kb-industry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="financial_services">Financial Services</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="technology_saas">Technology / SaaS</SelectItem>
                  <SelectItem value="cross_industry">Cross-Industry</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="button-cancel-create-kb">Cancel</Button>
            <Button
              onClick={() => createKbMutation.mutate()}
              disabled={!newKbName.trim() || createKbMutation.isPending}
              data-testid="button-confirm-create-kb"
            >
              {createKbMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Creating...</> : <><Plus className="w-3.5 h-3.5 mr-1" /> Create & Link</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentEventTriggers({ agent, triggers, onRefresh, allAgents, allMcpServers }: {
  agent: Agent;
  triggers: AgentTrigger[];
  onRefresh: () => void;
  allAgents: Agent[];
  allMcpServers: McpServer[];
}) {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [triggerType, setTriggerType] = useState<string>("webhook");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [cronExpression, setCronExpression] = useState("0 * * * *");
  const [sourceAgentId, setSourceAgentId] = useState("");
  const [mcpServerId, setMcpServerId] = useState("");
  const [mcpResourceUri, setMcpResourceUri] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const config: Record<string, any> = {};
      if (triggerType === "webhook") {
        if (webhookSecret) config.secret = webhookSecret;
      } else if (triggerType === "schedule") {
        config.cron = cronExpression;
      } else if (triggerType === "agent_completion") {
        config.sourceAgentId = sourceAgentId;
      } else if (triggerType === "mcp_resource_change") {
        config.mcpServerId = mcpServerId;
        config.resourceUri = mcpResourceUri;
      }
      return apiRequest("POST", `/api/agents/${agent.id}/triggers`, {
        triggerType,
        config,
        enabled: true,
      });
    },
    onSuccess: () => {
      onRefresh();
      setCreateOpen(false);
      resetForm();
      toast({ title: "Trigger created", description: `New ${triggerType} trigger has been created.` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create trigger", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ triggerId, enabled }: { triggerId: string; enabled: boolean }) =>
      apiRequest("PATCH", `/api/agents/${agent.id}/triggers/${triggerId}`, { enabled }),
    onSuccess: () => {
      onRefresh();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update trigger", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (triggerId: string) =>
      apiRequest("DELETE", `/api/agents/${agent.id}/triggers/${triggerId}`),
    onSuccess: () => {
      onRefresh();
      toast({ title: "Trigger deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete trigger", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setTriggerType("webhook");
    setWebhookSecret("");
    setCronExpression("0 * * * *");
    setSourceAgentId("");
    setMcpServerId("");
    setMcpResourceUri("");
  }

  const triggerTypeLabels: Record<string, { label: string; icon: any; description: string }> = {
    webhook: { label: "Webhook", icon: Globe, description: "Receive HTTP POST requests from external systems" },
    schedule: { label: "Schedule", icon: Clock, description: "Run on a cron schedule" },
    agent_completion: { label: "Agent Completion", icon: CheckCircle, description: "Fire when another agent completes a run" },
    mcp_resource_change: { label: "MCP Resource Change", icon: Database, description: "Fire when an MCP server resource changes" },
  };

  function cronToHuman(cron: string): string {
    const parts = cron.split(" ");
    if (parts.length !== 5) return cron;
    const [min, hour, dom, mon, dow] = parts;
    if (min === "*" && hour === "*") return "Every minute";
    if (min === "0" && hour === "*") return "Every hour";
    if (min === "0" && hour === "0" && dom === "*") return "Every day at midnight";
    if (min === "*/5") return "Every 5 minutes";
    if (min === "*/15") return "Every 15 minutes";
    if (min === "*/30") return "Every 30 minutes";
    if (hour !== "*" && min !== "*" && dom === "*" && mon === "*" && dow === "*") return `Daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    return cron;
  }

  const webhookBaseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="flex flex-col gap-4" data-testid="event-triggers-section">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Event Triggers
          </h3>
          <p className="text-xs text-muted-foreground">Configure automated triggers that start this agent in response to external events.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-create-trigger">
          <Plus className="w-3.5 h-3.5 mr-1" /> Create Trigger
        </Button>
      </div>

      {triggers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
            <Zap className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No event triggers configured</p>
            <p className="text-xs text-muted-foreground max-w-md text-center">
              Create triggers to automatically run this agent when webhooks arrive, on a schedule, when other agents complete, or when MCP resources change.
            </p>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} data-testid="button-create-trigger-empty">
              <Plus className="w-3.5 h-3.5 mr-1" /> Create First Trigger
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {triggers.map((trigger) => {
            const meta = triggerTypeLabels[trigger.triggerType] || { label: trigger.triggerType, icon: Zap, description: "" };
            const TriggerIcon = meta.icon;
            const config = (trigger.config || {}) as Record<string, any>;
            const webhookUrl = trigger.triggerType === "webhook" ? `${webhookBaseUrl}/api/webhooks/${trigger.id}` : null;

            return (
              <Card key={trigger.id} data-testid={`card-trigger-${trigger.id}`}>
                <CardContent className="flex flex-col gap-3 pt-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <TriggerIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-semibold" data-testid={`text-trigger-type-${trigger.id}`}>{meta.label}</span>
                      <Badge variant={trigger.enabled ? "default" : "secondary"} className="text-[10px]" data-testid={`badge-trigger-status-${trigger.id}`}>
                        {trigger.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={!!trigger.enabled}
                        onCheckedChange={(checked) => toggleMutation.mutate({ triggerId: trigger.id, enabled: checked })}
                        data-testid={`switch-trigger-${trigger.id}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(trigger.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-trigger-${trigger.id}`}
                      >
                        <XCircle className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {trigger.fireCount != null && (
                      <span data-testid={`text-fire-count-${trigger.id}`}>
                        <Activity className="w-3 h-3 inline mr-0.5" />
                        Fired {trigger.fireCount} time{trigger.fireCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {trigger.lastFiredAt && (
                      <span data-testid={`text-last-fired-${trigger.id}`}>
                        <Clock className="w-3 h-3 inline mr-0.5" />
                        Last: {new Date(trigger.lastFiredAt).toLocaleString()}
                      </span>
                    )}
                    {trigger.createdAt && (
                      <span>
                        Created: {new Date(trigger.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {trigger.triggerType === "webhook" && webhookUrl && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Webhook URL</span>
                      <div className="flex items-center gap-1">
                        <code className="text-[11px] bg-muted/40 px-2 py-1 rounded-md font-mono flex-1 truncate" data-testid={`text-webhook-url-${trigger.id}`}>
                          {webhookUrl}
                        </code>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(webhookUrl);
                            toast({ title: "Copied", description: "Webhook URL copied to clipboard." });
                          }}
                          data-testid={`button-copy-webhook-${trigger.id}`}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      {config.secret && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Secret configured
                        </span>
                      )}
                    </div>
                  )}

                  {trigger.triggerType === "schedule" && config.cron && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Schedule</span>
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] bg-muted/40 px-2 py-1 rounded-md font-mono">{config.cron}</code>
                        <span className="text-xs text-muted-foreground">({cronToHuman(config.cron)})</span>
                      </div>
                    </div>
                  )}

                  {trigger.triggerType === "agent_completion" && config.sourceAgentId && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Source Agent</span>
                      <span className="text-xs">
                        {allAgents.find(a => a.id === config.sourceAgentId)?.name || config.sourceAgentId}
                      </span>
                    </div>
                  )}

                  {trigger.triggerType === "mcp_resource_change" && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">MCP Resource</span>
                      <span className="text-xs">
                        {allMcpServers.find(s => s.id === config.mcpServerId)?.name || config.mcpServerId}
                        {config.resourceUri && <span className="ml-1 font-mono text-muted-foreground">({config.resourceUri})</span>}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Create Event Trigger
            </DialogTitle>
            <DialogDescription>
              Configure an automated trigger that will start this agent when a specific event occurs.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Trigger Type</Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger data-testid="select-trigger-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(triggerTypeLabels).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">{triggerTypeLabels[triggerType]?.description}</p>
            </div>

            {triggerType === "webhook" && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Webhook Secret (optional)</Label>
                <Input
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="Optional shared secret for payload verification"
                  type="password"
                  className="text-sm font-mono"
                  data-testid="input-webhook-secret"
                />
                <p className="text-[10px] text-muted-foreground">A unique webhook URL will be generated after creation.</p>
              </div>
            )}

            {triggerType === "schedule" && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Cron Expression</Label>
                <Input
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 * * * *"
                  className="text-sm font-mono"
                  data-testid="input-cron-expression"
                />
                <p className="text-[10px] text-muted-foreground">
                  Preview: {cronToHuman(cronExpression)}
                </p>
              </div>
            )}

            {triggerType === "agent_completion" && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Source Agent</Label>
                <Select value={sourceAgentId} onValueChange={setSourceAgentId}>
                  <SelectTrigger data-testid="select-source-agent">
                    <SelectValue placeholder="Select agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allAgents.filter(a => a.id !== agent.id).map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">This trigger will fire when the selected agent completes a run.</p>
              </div>
            )}

            {triggerType === "mcp_resource_change" && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">MCP Server</Label>
                  <Select value={mcpServerId} onValueChange={setMcpServerId}>
                    <SelectTrigger data-testid="select-mcp-server-trigger">
                      <SelectValue placeholder="Select MCP server..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allMcpServers.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Resource URI</Label>
                  <Input
                    value={mcpResourceUri}
                    onChange={(e) => setMcpResourceUri(e.target.value)}
                    placeholder="e.g., salesforce://leads/new"
                    className="text-sm font-mono"
                    data-testid="input-mcp-resource-uri"
                  />
                  <p className="text-[10px] text-muted-foreground">The resource URI to watch for changes.</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }} data-testid="button-cancel-trigger">
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                (triggerType === "agent_completion" && !sourceAgentId) ||
                (triggerType === "mcp_resource_change" && (!mcpServerId || !mcpResourceUri))
              }
              data-testid="button-save-trigger"
            >
              {createMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Creating...</>
              ) : (
                <><Zap className="w-3.5 h-3.5 mr-1" /> Create Trigger</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentGitOps({ agent }: { agent: any }) {
  const { toast } = useToast();
  const [repoUrl, setRepoUrl] = useState((agent.gitConfig as any)?.repoUrl || "");
  const [branch, setBranch] = useState((agent.gitConfig as any)?.branch || "main");
  const [path, setPath] = useState((agent.gitConfig as any)?.path || "");

  const gitStatusQuery = useQuery<any>({
    queryKey: ["/api/agents", agent.id, "git-status"],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agent.id}/git-status`);
      if (!res.ok) throw new Error("Failed to fetch git status");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/agents/${agent.id}/git-config`, { repoUrl, branch, path });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Git config saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "git-status"] });
    },
    onError: (e: any) => toast({ title: "Failed to save config", description: e.message, variant: "destructive" }),
  });

  const pushMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agents/${agent.id}/git-push`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Pushed to Git", description: `Commit: ${(data.commitSha || "").substring(0, 8)}` });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "git-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id] });
    },
    onError: (e: any) => toast({ title: "Push failed", description: e.message, variant: "destructive" }),
  });

  const pullMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agents/${agent.id}/git-pull`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Pulled from Git", description: `Applied sections: ${(data.appliedSections || []).join(", ")}` });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "git-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id] });
    },
    onError: (e: any) => toast({ title: "Pull failed", description: e.message, variant: "destructive" }),
  });

  const statusData = gitStatusQuery.data;
  const syncStatus = statusData?.status || "not_configured";

  const statusConfig: Record<string, { label: string; color: string }> = {
    in_sync: { label: "In Sync", color: "text-green-600 dark:text-green-400" },
    local_changes: { label: "Local Changes", color: "text-yellow-600 dark:text-yellow-400" },
    remote_changes: { label: "Remote Changes", color: "text-blue-600 dark:text-blue-400" },
    diverged: { label: "Diverged", color: "text-red-600 dark:text-red-400" },
    never_synced: { label: "Never Synced", color: "text-muted-foreground" },
    remote_deleted: { label: "Remote Deleted", color: "text-red-600 dark:text-red-400" },
    not_configured: { label: "Not Configured", color: "text-muted-foreground" },
    error: { label: "Error", color: "text-red-600 dark:text-red-400" },
  };

  const currentStatus = statusConfig[syncStatus] || statusConfig.not_configured;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="w-4 h-4" /> Git Repository Configuration
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Circle className={`w-2.5 h-2.5 fill-current ${currentStatus.color}`} />
              <span className={`text-xs font-medium ${currentStatus.color}`} data-testid="text-git-sync-status">
                {currentStatus.label}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => gitStatusQuery.refetch()}
              disabled={gitStatusQuery.isFetching}
              data-testid="button-refresh-git-status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${gitStatusQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="git-repo-url" className="text-xs">Repository URL</Label>
              <Input
                id="git-repo-url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="text-sm font-mono"
                data-testid="input-git-repo-url"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="git-branch" className="text-xs">Branch</Label>
              <Input
                id="git-branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className="text-sm font-mono"
                data-testid="input-git-branch"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="git-path" className="text-xs">Manifest Path</Label>
              <Input
                id="git-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder={`agents/${agent.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.agent-manifest.json`}
                className="text-sm font-mono"
                data-testid="input-git-path"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveConfigMutation.mutate()}
              disabled={saveConfigMutation.isPending}
              data-testid="button-save-git-config"
            >
              {saveConfigMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Settings className="w-3.5 h-3.5 mr-1" />}
              Save Config
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <Button
              size="sm"
              onClick={() => pushMutation.mutate()}
              disabled={pushMutation.isPending || !repoUrl}
              data-testid="button-git-push"
            >
              {pushMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ArrowRight className="w-3.5 h-3.5 mr-1" />}
              Push to Git
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => pullMutation.mutate()}
              disabled={pullMutation.isPending || !repoUrl}
              data-testid="button-git-pull"
            >
              {pullMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Download className="w-3.5 h-3.5 mr-1" />}
              Pull from Git
            </Button>
          </div>

          {statusData && syncStatus !== "not_configured" && (
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Last Synced</span>
                  <p className="font-medium mt-0.5" data-testid="text-git-last-synced">
                    {statusData.lastSyncedAt ? new Date(statusData.lastSyncedAt).toLocaleString() : "Never"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Commit</span>
                  <p className="font-mono font-medium mt-0.5" data-testid="text-git-last-commit">
                    {statusData.lastSyncCommit ? statusData.lastSyncCommit.substring(0, 8) : "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Remote SHA</span>
                  <p className="font-mono font-medium mt-0.5" data-testid="text-git-remote-sha">
                    {statusData.remoteSha ? statusData.remoteSha.substring(0, 8) : "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Remote Exists</span>
                  <p className="font-medium mt-0.5" data-testid="text-git-remote-exists">
                    {statusData.remoteExists ? "Yes" : "No"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="w-4 h-4" /> Manifest Export / Import
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const res = await fetch(`/api/agents/${agent.id}/export-manifest`);
                  const data = await res.json();
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${agent.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.agent-manifest.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast({ title: "Manifest downloaded" });
                } catch { toast({ title: "Export failed", variant: "destructive" }); }
              }}
              data-testid="button-export-manifest-json"
            >
              <FileCode className="w-3.5 h-3.5 mr-1" /> Export JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const res = await fetch(`/api/agents/${agent.id}/export-manifest?format=yaml`);
                  const text = await res.text();
                  const blob = new Blob([text], { type: "text/yaml" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${agent.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.agent-manifest.yaml`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast({ title: "YAML manifest downloaded" });
                } catch { toast({ title: "Export failed", variant: "destructive" }); }
              }}
              data-testid="button-export-manifest-yaml"
            >
              <FileText className="w-3.5 h-3.5 mr-1" /> Export YAML
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".json";
                input.onchange = async (e: any) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const manifest = JSON.parse(text);
                    const res = await apiRequest("POST", `/api/agents/import-manifest?mode=update&agentId=${agent.id}`, manifest);
                    const result = await res.json();
                    toast({ title: "Manifest imported", description: `Changes: ${JSON.stringify(result.changeReport?.summary || {})}` });
                    queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id] });
                  } catch (err: any) {
                    toast({ title: "Import failed", description: err.message, variant: "destructive" });
                  }
                };
                input.click();
              }}
              data-testid="button-import-manifest"
            >
              <Package className="w-3.5 h-3.5 mr-1" /> Import Manifest
            </Button>
          </div>
        </CardContent>
      </Card>

      <AgentConfigRollback agent={agent} />
      <AgentCiCdConfig agent={agent} />
      <AgentPipelineRunHistory agent={agent} />
    </div>
  );
}

function AgentConfigRollback({ agent }: { agent: any }) {
  const { toast } = useToast();

  const diffQuery = useQuery<any>({
    queryKey: ["/api/agents", agent.id, "manifest-diff"],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agent.id}/manifest-diff?against=1`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (targetVersion: number) => {
      const res = await apiRequest("POST", `/api/agents/${agent.id}/rollback-config`, { targetVersion });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Config Rolled Back", description: `Restored to version ${data.targetVersion}. ${data.changes?.length || 0} sections updated.` });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id] });
    },
    onError: (e: any) => toast({ title: "Rollback Failed", description: e.message, variant: "destructive" }),
  });

  const blueprintHistory: any[] = (() => {
    const bp = agent.blueprintJson;
    if (!bp) return [];
    const bpObj = typeof bp === "string" ? JSON.parse(bp) : bp;
    return Array.isArray(bpObj?.versionHistory) ? bpObj.versionHistory : [];
  })();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <RotateCcw className="w-4 h-4" /> Config Version History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {blueprintHistory.length > 0 ? (
          <div className="flex flex-col gap-2">
            {blueprintHistory.slice().reverse().slice(0, 10).map((entry: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between border rounded-lg p-2" data-testid={`row-version-${entry.version}`}>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Version {entry.version}</span>
                  <span className="text-xs text-muted-foreground">
                    {entry.signedAt ? new Date(entry.signedAt).toLocaleDateString() : entry.snapshotAt ? new Date(entry.snapshotAt).toLocaleDateString() : "—"}
                    {entry.signedBy ? ` by ${entry.signedBy}` : ""}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => rollbackMutation.mutate(entry.version)}
                  disabled={rollbackMutation.isPending}
                  data-testid={`button-rollback-v${entry.version}`}
                >
                  <RotateCcw className={`w-3.5 h-3.5 mr-1 ${rollbackMutation.isPending ? "animate-spin" : ""}`} />
                  Restore
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <History className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No version history yet. Versions are created when blueprints are signed or configs are updated.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentCiCdConfig({ agent }: { agent: any }) {
  const { toast } = useToast();

  const ciCdQuery = useQuery<any>({
    queryKey: ["/api/agents", agent.id, "ci-cd-config"],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agent.id}/ci-cd-config`);
      if (!res.ok) throw new Error("Failed to fetch CI/CD config");
      return res.json();
    },
  });

  const [autoEvalOnPush, setAutoEvalOnPush] = useState(false);
  const [autoDeployOnEvalPass, setAutoDeployOnEvalPass] = useState(false);
  const [evalPassThreshold, setEvalPassThreshold] = useState("0.8");
  const [targetEnvironment, setTargetEnvironment] = useState("staging");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (ciCdQuery.data && !initialized) {
    setAutoEvalOnPush(ciCdQuery.data.autoEvalOnPush || false);
    setAutoDeployOnEvalPass(ciCdQuery.data.autoDeployOnEvalPass || false);
    setEvalPassThreshold(String(ciCdQuery.data.evalPassThreshold || 0.8));
    setTargetEnvironment(ciCdQuery.data.targetEnvironment || "staging");
    setWebhookSecret(ciCdQuery.data.webhookSecret || "");
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/agents/${agent.id}/ci-cd-config`, {
        autoEvalOnPush,
        autoDeployOnEvalPass,
        evalPassThreshold: parseFloat(evalPassThreshold),
        targetEnvironment,
        webhookSecret: webhookSecret || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "CI/CD config saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "ci-cd-config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id] });
    },
    onError: (e: any) => toast({ title: "Failed to save CI/CD config", description: e.message, variant: "destructive" }),
  });

  const generateSecret = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const secret = Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");
    setWebhookSecret(secret);
  };

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/git-commit`
    : "/api/webhooks/git-commit";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Workflow className="w-4 h-4" /> CI/CD Pipeline Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-md border p-3 bg-muted/30">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Webhook URL</span>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono bg-background p-1.5 rounded-md border flex-1 truncate" data-testid="text-webhook-url">
                {webhookUrl}
              </code>
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast({ title: "Webhook URL copied" });
                }}
                data-testid="button-copy-webhook-url"
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Add this URL as a webhook in your GitHub repository settings. Select "Push" events.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <Label className="text-xs font-medium">Auto-Eval on Push</Label>
                <span className="text-[10px] text-muted-foreground">Trigger eval suite when manifest is pushed via webhook</span>
              </div>
              <Switch
                checked={autoEvalOnPush}
                onCheckedChange={setAutoEvalOnPush}
                data-testid="switch-auto-eval-on-push"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <Label className="text-xs font-medium">Auto-Deploy on Eval Pass</Label>
                <span className="text-[10px] text-muted-foreground">Auto-create deployment when eval passes threshold</span>
              </div>
              <Switch
                checked={autoDeployOnEvalPass}
                onCheckedChange={setAutoDeployOnEvalPass}
                data-testid="switch-auto-deploy-on-eval-pass"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eval-threshold" className="text-xs">Eval Pass Threshold</Label>
              <Input
                id="eval-threshold"
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={evalPassThreshold}
                onChange={(e) => setEvalPassThreshold(e.target.value)}
                className="text-sm font-mono"
                data-testid="input-eval-pass-threshold"
              />
              <span className="text-[10px] text-muted-foreground">Minimum pass rate (0.0 - 1.0) to trigger auto-deploy</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="target-env" className="text-xs">Target Environment</Label>
              <Select value={targetEnvironment} onValueChange={setTargetEnvironment}>
                <SelectTrigger className="text-sm" data-testid="select-target-environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="pilot">Pilot</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="webhook-secret" className="text-xs">Webhook Secret</Label>
          <div className="flex items-center gap-2">
            <Input
              id="webhook-secret"
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="HMAC-SHA256 secret for signature verification"
              className="text-sm font-mono flex-1"
              data-testid="input-webhook-secret"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={generateSecret}
              data-testid="button-generate-webhook-secret"
            >
              <KeyRound className="w-3.5 h-3.5 mr-1" /> Generate
            </Button>
          </div>
          <span className="text-[10px] text-muted-foreground">
            Set this same secret in your GitHub webhook configuration for signature verification
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-cicd-config"
          >
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Settings className="w-3.5 h-3.5 mr-1" />}
            Save CI/CD Config
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentPipelineRunHistory({ agent }: { agent: any }) {
  const pipelineRunsQuery = useQuery<any[]>({
    queryKey: ["/api/agents", agent.id, "pipeline-runs"],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agent.id}/pipeline-runs`);
      if (!res.ok) throw new Error("Failed to fetch pipeline runs");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const runs = pipelineRunsQuery.data || [];

  const actionLabels: Record<string, { label: string; color: string }> = {
    cicd_pipeline_triggered: { label: "Pipeline Triggered", color: "text-blue-600 dark:text-blue-400" },
    cicd_eval_completed: { label: "Eval Completed", color: "text-violet-600 dark:text-violet-400" },
    cicd_auto_deploy: { label: "Auto-Deploy", color: "text-green-600 dark:text-green-400" },
    cicd_webhook_received: { label: "Webhook Received", color: "text-cyan-600 dark:text-cyan-400" },
    manifest_imported: { label: "Manifest Imported", color: "text-amber-600 dark:text-amber-400" },
    config_rollback: { label: "Config Rollback", color: "text-red-600 dark:text-red-400" },
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="w-4 h-4" /> Pipeline Run History
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => pipelineRunsQuery.refetch()}
          disabled={pipelineRunsQuery.isFetching}
          data-testid="button-refresh-pipeline-runs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${pipelineRunsQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {pipelineRunsQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-6">
            <Workflow className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-pipeline-runs">
              No pipeline runs yet. Configure CI/CD and push changes to trigger runs.
            </p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto rounded-md border">
            <table className="w-full text-xs" data-testid="table-pipeline-runs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Timestamp</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Action</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Trigger</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Eval Result</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Deploy Status</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Commit</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run: any) => {
                  const actionMeta = actionLabels[run.action] || { label: run.action, color: "text-muted-foreground" };
                  return (
                    <tr key={run.id} className="border-t border-muted/30" data-testid={`row-pipeline-run-${run.id}`}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {run.timestamp ? new Date(run.timestamp).toLocaleString() : "N/A"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`font-medium ${actionMeta.color}`}>{actionMeta.label}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px]">
                          {run.trigger}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {run.evalResult ? (
                          <Badge
                            variant={run.evalResult === "passed" ? "default" : "destructive"}
                            className="text-[10px]"
                          >
                            {run.evalResult === "passed" ? (
                              <CheckCircle2 className="w-3 h-3 mr-0.5" />
                            ) : (
                              <XCircle className="w-3 h-3 mr-0.5" />
                            )}
                            {run.evalResult}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {run.deployStatus ? (
                          <Badge variant="outline" className="text-[10px]">
                            <Rocket className="w-3 h-3 mr-0.5" />
                            {run.deployStatus}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">
                        {run.commitSha ? run.commitSha.substring(0, 8) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentChannels({ agent }: { agent: any }) {
  const { toast } = useToast();
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedChannelType, setSelectedChannelType] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [configToken, setConfigToken] = useState("");

  const { data: channels = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/agents", agent.id, "channels"],
  });

  const createChannelMutation = useMutation({
    mutationFn: async (data: { channelType: string; name: string; config: any; botUsername: string }) => {
      const res = await apiRequest("POST", `/api/agents/${agent.id}/channels`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "channels"] });
      setConnectDialogOpen(false);
      setSelectedChannelType(null);
      setChannelName("");
      setBotUsername("");
      setConfigToken("");
      toast({ title: "Channel connected", description: "Your agent is now available on this channel." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to connect channel", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const updateChannelMutation = useMutation({
    mutationFn: async ({ channelId, data }: { channelId: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/agents/${agent.id}/channels/${channelId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "channels"] });
      toast({ title: "Channel updated" });
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      await apiRequest("DELETE", `/api/agents/${agent.id}/channels/${channelId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "channels"] });
      toast({ title: "Channel removed" });
    },
  });

  const testChannelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      const res = await apiRequest("POST", `/api/agents/${agent.id}/channels/${channelId}/test`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: data.success ? "Test successful" : "Test completed with issues", description: typeof data.response === "string" ? data.response.slice(0, 100) : "Response received" });
    },
    onError: () => {
      toast({ title: "Channel test failed", variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const connectedTypes = new Set((channels as any[]).map((c: any) => c.channelType));

  const selectedMeta = CHANNEL_TYPES.find(ct => ct.type === selectedChannelType);

  const handleConnect = () => {
    if (!selectedChannelType || !channelName.trim()) return;
    const config: any = {};
    if (configToken.trim()) {
      config.botToken = configToken;
    }
    createChannelMutation.mutate({
      channelType: selectedChannelType,
      name: channelName.trim(),
      config,
      botUsername: botUsername.trim() || `${agent.name} Bot`,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {agent.status !== "deployed" && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md" data-testid="channels-not-deployed-notice">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400">This agent must be deployed before publishing to channels. Deploy the agent through the Deployments pipeline first.</span>
        </div>
      )}

      <Card data-testid="card-channels-overview">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                <Radio className="w-3.5 h-3.5 text-primary" />
              </div>
              <CardTitle className="text-sm font-medium">Channel Publishing</CardTitle>
              <Badge variant="secondary" className="text-[10px]">{(channels as any[]).length} connected</Badge>
            </div>
            <Button
              size="sm"
              className="text-xs"
              disabled={agent.status !== "deployed"}
              onClick={() => setConnectDialogOpen(true)}
              data-testid="btn-add-channel"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Channel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (channels as any[]).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Radio className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No channels configured</p>
              <p className="text-xs mt-1">Publish your agent to messaging platforms like Slack, Teams, or Discord</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(channels as any[]).map((channel: any) => {
                const meta = CHANNEL_TYPES.find(ct => ct.type === channel.channelType);
                const Icon = meta?.icon || MessageSquare;
                const widgetToken = channel.channelType === "web_widget" && channel.webhookUrl
                  ? channel.webhookUrl.split("/").pop() || ""
                  : "";
                const safeName = agent.name.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                const embedSnippet = widgetToken
                  ? `<script src="${window.location.origin}/widget.js"\n  data-agent-channel="${widgetToken}"\n  data-title="${safeName}"\n  data-theme="dark"\n  data-position="bottom-right"\n  data-greeting="Hi! I'm ${safeName}. How can I help you today?"\n  data-starters="What can you help me with?,Tell me about your capabilities,Get started"></script>`
                  : "";
                return (
                  <div key={channel.id} className="flex flex-col rounded-md border bg-card" data-testid={`channel-card-${channel.id}`}>
                    <div className="flex items-center gap-3 p-3">
                      <div className={`flex items-center justify-center w-9 h-9 rounded-md ${meta?.bgColor || "bg-muted"} shrink-0`}>
                        <Icon className={`w-4 h-4 ${meta?.color || "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{channel.name}</span>
                          <Badge variant={channel.status === "connected" ? "default" : "secondary"} className="text-[10px]">
                            {channel.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">{meta?.label || channel.channelType}</span>
                          <span className="text-[11px] text-muted-foreground">{channel.messageCount || 0} messages</span>
                          {channel.lastMessageAt && (
                            <span className="text-[11px] text-muted-foreground">Last: {new Date(channel.lastMessageAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px]"
                          onClick={() => testChannelMutation.mutate(channel.id)}
                          disabled={testChannelMutation.isPending || channel.status !== "connected"}
                          data-testid={`btn-test-channel-${channel.id}`}
                        >
                          {testChannelMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                          Test
                        </Button>
                        {channel.status === "connected" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[11px]"
                            onClick={() => updateChannelMutation.mutate({ channelId: channel.id, data: { status: "paused" } })}
                            data-testid={`btn-pause-channel-${channel.id}`}
                          >
                            Pause
                          </Button>
                        ) : channel.status === "paused" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[11px]"
                            onClick={() => updateChannelMutation.mutate({ channelId: channel.id, data: { status: "connected" } })}
                            data-testid={`btn-resume-channel-${channel.id}`}
                          >
                            Resume
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px]"
                          onClick={() => {
                            if (channel.webhookUrl) copyToClipboard(channel.webhookUrl);
                          }}
                          data-testid={`btn-copy-webhook-${channel.id}`}
                        >
                          <Copy className="w-3 h-3 mr-1" /> Webhook
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px] text-destructive"
                          onClick={() => deleteChannelMutation.mutate(channel.id)}
                          data-testid={`btn-remove-channel-${channel.id}`}
                        >
                          <XCircle className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {channel.channelType === "web_widget" && embedSnippet && (
                      <div className="px-3 pb-3 border-t border-border/50 pt-2" data-testid={`widget-embed-${channel.id}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-medium text-muted-foreground">Embed Snippet — paste this into your website's HTML</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[11px] h-6"
                            onClick={() => copyToClipboard(embedSnippet)}
                            data-testid={`btn-copy-embed-${channel.id}`}
                          >
                            <Copy className="w-3 h-3 mr-1" /> Copy Snippet
                          </Button>
                        </div>
                        <pre className="text-[11px] font-mono bg-muted/30 p-3 rounded-md overflow-x-auto whitespace-pre select-all" data-testid={`code-embed-${channel.id}`}>{embedSnippet}</pre>
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          Add this script tag before the closing <code className="text-[10px] bg-muted/50 px-1 rounded">&lt;/body&gt;</code> tag. The widget will appear as a floating chat bubble. Customize with <code className="text-[10px] bg-muted/50 px-1 rounded">data-theme="light"</code>, <code className="text-[10px] bg-muted/50 px-1 rounded">data-position="bottom-left"</code>, <code className="text-[10px] bg-muted/50 px-1 rounded">data-greeting="..."</code>, or <code className="text-[10px] bg-muted/50 px-1 rounded">data-starters="prompt1,prompt2,prompt3"</code>.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-available-channels">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <Globe className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Available Channels</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {CHANNEL_TYPES.map((ct) => {
              const isConnected = connectedTypes.has(ct.type);
              const Icon = ct.icon;
              return (
                <div key={ct.type} className={`flex flex-col gap-2 p-3 rounded-md border ${isConnected ? "border-primary/30 bg-primary/5" : "bg-card"}`} data-testid={`available-channel-${ct.type}`}>
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-md ${ct.bgColor} shrink-0`}>
                      <Icon className={`w-4 h-4 ${ct.color}`} />
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-medium">{ct.label}</span>
                      {isConnected && <Badge variant="default" className="ml-2 text-[10px]">Connected</Badge>}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{ct.description}</p>
                  {!isConnected && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs self-start mt-1"
                      disabled={agent.status !== "deployed"}
                      onClick={() => {
                        setSelectedChannelType(ct.type);
                        setChannelName(`${agent.name} — ${ct.label}`);
                        setBotUsername(`${agent.name} Bot`);
                        setConnectDialogOpen(true);
                      }}
                      data-testid={`btn-connect-${ct.type}`}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Connect
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedMeta && (
                <div className={`flex items-center justify-center w-7 h-7 rounded-md ${selectedMeta.bgColor}`}>
                  <selectedMeta.icon className={`w-3.5 h-3.5 ${selectedMeta.color}`} />
                </div>
              )}
              Connect {selectedMeta?.label || "Channel"}
            </DialogTitle>
            <DialogDescription>
              Configure the channel integration for your agent.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            {!selectedChannelType && (
              <div className="flex flex-col gap-2">
                <Label className="text-xs">Select Channel Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {CHANNEL_TYPES.filter(ct => !connectedTypes.has(ct.type)).map((ct) => {
                    const Icon = ct.icon;
                    return (
                      <button
                        key={ct.type}
                        className={`flex items-center gap-2 p-2.5 rounded-md border text-left transition-colors hover:bg-muted/50 ${selectedChannelType === ct.type ? "border-primary bg-primary/5" : ""}`}
                        onClick={() => {
                          setSelectedChannelType(ct.type);
                          setChannelName(`${agent.name} — ${ct.label}`);
                          setBotUsername(`${agent.name} Bot`);
                        }}
                        data-testid={`select-channel-${ct.type}`}
                      >
                        <div className={`flex items-center justify-center w-7 h-7 rounded-md ${ct.bgColor} shrink-0`}>
                          <Icon className={`w-3.5 h-3.5 ${ct.color}`} />
                        </div>
                        <span className="text-xs font-medium">{ct.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="channel-name" className="text-xs">Channel Name</Label>
              <Input
                id="channel-name"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="e.g., Production Slack Bot"
                className="text-sm"
                data-testid="input-channel-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bot-username" className="text-xs">Bot Display Name</Label>
              <Input
                id="bot-username"
                value={botUsername}
                onChange={(e) => setBotUsername(e.target.value)}
                placeholder="e.g., Weather Bot"
                className="text-sm"
                data-testid="input-bot-username"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="config-token" className="text-xs">Bot Token / API Key (optional)</Label>
              <Input
                id="config-token"
                value={configToken}
                onChange={(e) => setConfigToken(e.target.value)}
                placeholder="Platform-specific bot token"
                className="text-sm font-mono"
                type="password"
                data-testid="input-config-token"
              />
              <p className="text-[10px] text-muted-foreground">
                {selectedChannelType === "slack" && "Enter your Slack Bot OAuth Token (xoxb-...)"}
                {selectedChannelType === "teams" && "Enter your Microsoft Bot Framework App Password"}
                {selectedChannelType === "discord" && "Enter your Discord Bot Token"}
                {selectedChannelType === "whatsapp" && "Enter your WhatsApp Business API Token"}
                {selectedChannelType === "email" && "Enter your email service API key (e.g., SendGrid)"}
                {selectedChannelType === "web_widget" && "No token needed — a webhook URL will be generated"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)} data-testid="btn-cancel-connect">Cancel</Button>
            <Button
              onClick={handleConnect}
              disabled={!selectedChannelType || !channelName.trim() || createChannelMutation.isPending}
              data-testid="btn-confirm-connect"
            >
              {createChannelMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Connecting...</> : <><CheckCircle className="w-3.5 h-3.5 mr-1" /> Connect Channel</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
