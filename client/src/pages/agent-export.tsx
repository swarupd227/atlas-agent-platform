import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react";
import {
  ArrowLeft,
  Code,
  FileCode,
  Download,
  ArrowRight,
  Check,
  Loader2,
  Sparkles,
  Wrench,
  Lock,
  Package,
  KeyRound,
  Radio,
  Hammer,
  CheckCircle,
  CheckCircle2,
  XOctagon,
  AlertCircle,
  AlertTriangle,
  Settings,
  ShieldCheck,
  Terminal,
  FlaskConical,
  GitBranch,
  Globe,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
  Copy,
  GripVertical,
  Info,
  Search,
  RefreshCw,
  GitCompare,
  Save,
  FolderOpen,
  Square,
  CheckSquare,
  Bookmark,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import type { Agent, ToolConnector } from "@shared/schema";
import { FileTree } from "@/components/file-tree";
import Editor, { DiffEditor } from "@monaco-editor/react";

interface ExportPreset {
  name: string;
  framework: string;
  format: string;
  llmProvider: string;
  pinVersions: boolean;
  otelEnabled: boolean;
  spanGranularity: string;
  maxIterations: number;
  savedAt: string;
}

function getPresets(agentId: string): ExportPreset[] {
  try {
    const raw = localStorage.getItem(`atlas-export-presets-${agentId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePreset(agentId: string, preset: ExportPreset) {
  const existing = getPresets(agentId);
  const idx = existing.findIndex(p => p.name === preset.name);
  if (idx >= 0) existing[idx] = preset;
  else existing.push(preset);
  localStorage.setItem(`atlas-export-presets-${agentId}`, JSON.stringify(existing));
}

function deletePreset(agentId: string, name: string) {
  const existing = getPresets(agentId).filter(p => p.name !== name);
  localStorage.setItem(`atlas-export-presets-${agentId}`, JSON.stringify(existing));
}

export default function AgentExport() {
  const [, params] = useRoute("/agents/:id/export");
  const agentId = params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: agent, isLoading: agentLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}`);
      if (!res.ok) throw new Error("Agent not found");
      return res.json();
    },
    enabled: !!agentId,
  });

  const { data: allToolConnectors } = useQuery<ToolConnector[]>({
    queryKey: ["/api/tool-connectors"],
  });

  const [exportFormat, setExportFormat] = useState<"typescript" | "python">("typescript");
  const [exportLlmProvider, setExportLlmProvider] = useState<"openai" | "anthropic">("openai");
  const [exportMaxIterations, setExportMaxIterations] = useState(20);
  const [exportCompletionPromise, setExportCompletionPromise] = useState("TASK_COMPLETE");
  const [exportFramework, setExportFramework] = useState<string>("generic");
  const [exportPreview, setExportPreview] = useState<{ files: Record<string, string>; metadata: any } | null>(null);
  const [exportPreviewFile, setExportPreviewFile] = useState<string>("");
  const [editedFiles, setEditedFiles] = useState<Record<string, string>>({});
  const [editedFilePaths, setEditedFilePaths] = useState<string[]>([]);
  const [exportStep, setExportStep] = useState<"configure" | "preview" | "download">("configure");
  const [exportApprovalSubmitted, setExportApprovalSubmitted] = useState(false);
  const [exportApprovalId, setExportApprovalId] = useState<string | null>(null);
  const [deliveryTarget, setDeliveryTarget] = useState<"zip" | "git" | "replit">("zip");
  const [gitRepoUrl, setGitRepoUrl] = useState("");
  const [toolAdapterOverrides, setToolAdapterOverrides] = useState<Record<string, "builtin" | "customer" | "stub">>({});
  const [pinVersions, setPinVersions] = useState(true);
  const [otelEnabled, setOtelEnabled] = useState(true);
  const [spanGranularity, setSpanGranularity] = useState<"per-node" | "per-tool-call">("per-node");
  const [compileStatus, setCompileStatus] = useState<"idle" | "running" | "passed" | "failed">("idle");
  const [compileOutput, setCompileOutput] = useState<string>("");
  const [evalStatus, setEvalStatus] = useState<"idle" | "running" | "passed" | "failed">("idle");
  const [evalOutput, setEvalOutput] = useState<string>("");
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(false);
  const [fileTreeWidth, setFileTreeWidth] = useState(240);
  const [showFileSearch, setShowFileSearch] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [showDiffView, setShowDiffView] = useState(false);
  const [originalFiles, setOriginalFiles] = useState<Record<string, string>>({});
  const [regeneratingFile, setRegeneratingFile] = useState<string | null>(null);
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const fileSearchInputRef = useRef<HTMLInputElement>(null);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(240);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = fileTreeWidth;
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - startXRef.current;
      setFileTreeWidth(Math.max(160, Math.min(400, startWidthRef.current + delta)));
    };
    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [fileTreeWidth]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard", description: text.length > 60 ? text.substring(0, 60) + "..." : text });
  }, [toast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p" && exportStep === "preview") {
        e.preventDefault();
        setShowFileSearch(true);
        setFileSearchQuery("");
        setTimeout(() => fileSearchInputRef.current?.focus(), 50);
      }
      if (e.key === "Escape" && showFileSearch) {
        setShowFileSearch(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [exportStep, showFileSearch]);

  const filteredSearchFiles = useMemo(() => {
    if (!fileSearchQuery.trim()) return editedFilePaths;
    const q = fileSearchQuery.toLowerCase();
    return editedFilePaths.filter(f => {
      const name = f.toLowerCase();
      let qi = 0;
      for (let i = 0; i < name.length && qi < q.length; i++) {
        if (name[i] === q[qi]) qi++;
      }
      return qi === q.length;
    });
  }, [fileSearchQuery, editedFilePaths]);

  const handleRegenFile = useCallback(async (filePath: string) => {
    if (!agentId) return;
    setRegeneratingFile(filePath);
    try {
      const res = await apiRequest("POST", `/api/agents/${agentId}/export-code/regen-file`, {
        filePath,
        format: exportFormat,
        llmProvider: exportLlmProvider,
        framework: exportFramework,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Unknown error" }));
        toast({ title: "Regeneration failed", description: err.reason || err.message || `Could not regenerate ${filePath}`, variant: "destructive" });
        return;
      }
      const data = await res.json();
      if (data.content) {
        setEditedFiles(prev => ({ ...prev, [filePath]: data.content }));
        toast({ title: "File regenerated", description: filePath });
      }
    } catch {
      toast({ title: "Regeneration failed", description: `Could not regenerate ${filePath}`, variant: "destructive" });
    } finally {
      setRegeneratingFile(null);
    }
  }, [agentId, exportFormat, exportLlmProvider, exportFramework, toast]);

  const deploymentChecklist = useMemo(() => {
    const items: Array<{ id: string; label: string; detail: string }> = [];
    items.push({ id: "env-keys", label: "Configure API keys", detail: `Set ${exportLlmProvider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} in .env` });
    items.push({ id: "install-deps", label: "Install dependencies", detail: exportFormat === "typescript" ? "Run npm install" : "Run pip install -r requirements.txt" });

    const stubCount = Object.values(toolAdapterOverrides).filter(v => v === "stub").length;
    if (stubCount > 0) {
      items.push({ id: "impl-stubs", label: `Implement ${stubCount} tool stub${stubCount > 1 ? "s" : ""}`, detail: "Replace stub tool adapters with real implementations" });
    }

    if (otelEnabled) {
      items.push({ id: "otel-endpoint", label: "Configure OTEL endpoint", detail: "Set OTEL_EXPORTER_OTLP_ENDPOINT in .env" });
    }

    items.push({ id: "docker", label: "Docker installed", detail: "Ensure Docker is available for container builds" });
    items.push({ id: "run-tests", label: "Run test suite", detail: exportFormat === "typescript" ? "Run npm test" : "Run python -m pytest tests/" });
    items.push({ id: "review-code", label: "Review generated code", detail: "Check tool adapters and orchestrator logic for correctness" });

    if (exportFramework === "bedrock") {
      items.push({ id: "aws-creds", label: "Configure AWS credentials", detail: "Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION" });
    }
    if (exportFramework === "vertex") {
      items.push({ id: "gcp-creds", label: "Configure GCP credentials", detail: "Set GOOGLE_APPLICATION_CREDENTIALS path" });
    }
    if (exportFramework === "databricks") {
      items.push({ id: "dbx-creds", label: "Configure Databricks credentials", detail: "Set DATABRICKS_HOST and DATABRICKS_TOKEN" });
    }

    return items;
  }, [exportFormat, exportLlmProvider, exportFramework, otelEnabled, toolAdapterOverrides]);

  const exportCodeMutation = useMutation({
    mutationFn: async (params: { format: string; llmProvider: string; maxIterations: number; completionPromise: string; framework?: string; toolAdapters?: Record<string, string>; pinVersions?: boolean; otelEnabled?: boolean; spanGranularity?: string }) => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/export-code`, params);
      return res.json();
    },
    onSuccess: (data) => {
      setExportPreview(data);
      const newFiles = data.files || {};
      setEditedFiles({ ...newFiles });
      setOriginalFiles({ ...newFiles });
      setEditedFilePaths(Object.keys(newFiles));
      const fileNames = Object.keys(newFiles);
      if (fileNames.length > 0) setExportPreviewFile(fileNames.find((f: string) => f.includes("entrypoint") || f.includes("orchestrator")) || fileNames[0]);
      setExportStep("preview");
      setShowDiffView(false);
      if (data.metadata && !data.metadata.aiGenerated) {
        toast({ title: "AI generation unavailable", description: "Code was generated using templates. AI-powered generation was not available or failed.", variant: "default" });
      }
    },
    onError: () => {
      toast({ title: "Export failed", description: "Could not generate code package", variant: "destructive" });
    },
  });

  function downloadExportPackage() {
    if (!exportPreview) return;
    const files = Object.keys(editedFiles).length > 0 ? editedFiles : exportPreview.files;
    const blob = new Blob(
      [JSON.stringify({ files, metadata: exportPreview.metadata }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent?.name || "agent"}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleGenerate() {
    const agentTools = Array.isArray(agent?.toolsConfig) ? agent.toolsConfig as any[] : [];
    const connectors = allToolConnectors || [];
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const connectorMap = new Map(connectors.map(c => [normalize(c.name), c]));
    const resolvedOverrides: Record<string, "builtin" | "customer" | "stub"> = {};
    agentTools.forEach((t: any) => {
      const name = normalize(t.name || "");
      const connector = connectorMap.get(name);
      if (toolAdapterOverrides[t.name]) {
        resolvedOverrides[t.name] = toolAdapterOverrides[t.name];
      } else if (connector && connector.status === "connected") {
        resolvedOverrides[t.name] = "builtin";
      } else if (connector) {
        resolvedOverrides[t.name] = "customer";
      } else {
        resolvedOverrides[t.name] = "stub";
      }
    });
    setToolAdapterOverrides(resolvedOverrides);
    exportCodeMutation.mutate({ format: exportFormat, llmProvider: exportLlmProvider, maxIterations: exportMaxIterations, completionPromise: exportCompletionPromise, framework: exportFramework, toolAdapters: resolvedOverrides, pinVersions, otelEnabled, spanGranularity });
  }

  async function handleDeliver() {
    if (deliveryTarget === "zip") {
      downloadExportPackage();
    } else if (deliveryTarget === "git") {
      try {
        const files = Object.keys(editedFiles).length > 0 ? editedFiles : exportPreview?.files || {};
        const res = await apiRequest("POST", `/api/agents/${agentId}/export-code/git-push`, {
          files,
          repoUrl: gitRepoUrl,
          metadata: exportPreview?.metadata,
        });
        const data = await res.json();
        toast({ title: "Pushed to Git", description: `Commit: ${(data.commitSha || "").substring(0, 8)}` });
      } catch {
        toast({ title: "Git push failed", description: "Could not push code to the repository. Check your GitHub token and repo URL.", variant: "destructive" });
      }
    }
  }

  if (agentLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading agent...</span>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm text-muted-foreground">Agent not found</span>
          <Button variant="outline" size="sm" onClick={() => navigate("/agents")}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Agents
          </Button>
        </div>
      </div>
    );
  }

  const stepData = [
    { key: "configure", label: "Configure", num: 1 },
    { key: "preview", label: "Preview", num: 2 },
    { key: "download", label: "Deliver", num: 3 },
  ];
  const stepOrder = ["configure", "preview", "download"];
  const currentIdx = stepOrder.indexOf(exportStep);

  return (
    <div className="flex flex-col h-screen" data-testid="agent-export-page">
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-background shrink-0" data-testid="export-header">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/agents/${agentId}`}>
            <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" data-testid="button-back-to-agent">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-2 min-w-0">
            <Code className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-semibold truncate" data-testid="text-export-agent-name">{agent.name}</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">Export</span>
          </div>
        </div>

        <div className="flex items-center gap-0" data-testid="export-step-progress">
          {stepData.map((s, i) => {
            const thisIdx = stepOrder.indexOf(s.key);
            const isActive = exportStep === s.key;
            const isDone = thisIdx < currentIdx;
            return (
              <Fragment key={s.key}>
                {i > 0 && <div className={`w-8 h-0.5 mx-1.5 rounded ${currentIdx >= i ? "bg-primary" : "bg-muted"}`} />}
                <button
                  className="flex items-center gap-1.5 cursor-pointer"
                  onClick={() => {
                    if (isDone || isActive) {
                      if (s.key === "configure") setExportStep("configure");
                      else if (s.key === "preview" && exportPreview) setExportStep("preview");
                      else if (s.key === "download" && exportPreview) setExportStep("download");
                    }
                  }}
                  data-testid={`step-indicator-${s.key}`}
                >
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-medium transition-colors ${isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {isDone ? <Check className="w-3.5 h-3.5" /> : s.num}
                  </span>
                  <span className={`text-xs font-medium hidden sm:inline ${isActive ? "text-foreground" : isDone ? "text-primary" : "text-muted-foreground"}`}>{s.label}</span>
                </button>
              </Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {exportStep === "configure" && (
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={exportCodeMutation.isPending}
              data-testid="button-export-generate"
            >
              {exportCodeMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Generating...</> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Generate</>}
            </Button>
          )}
          {exportStep === "preview" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setExportStep("configure")} data-testid="button-export-back-to-configure">
                Back
              </Button>
              <Button variant="outline" size="sm" onClick={downloadExportPackage} data-testid="button-export-download">
                <Download className="w-3.5 h-3.5 mr-1.5" /> Download
              </Button>
              <Button size="sm" onClick={() => setExportStep("download")} data-testid="button-export-next-download">
                Next: Deliver <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </>
          )}
          {exportStep === "download" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setExportStep("preview")} data-testid="button-export-back-to-preview">
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleDeliver}
                disabled={deliveryTarget === "git" && !gitRepoUrl.trim()}
                data-testid="button-export-deliver"
              >
                {deliveryTarget === "zip" ? <><Download className="w-3.5 h-3.5 mr-1.5" />Download</> : deliveryTarget === "git" ? <><GitBranch className="w-3.5 h-3.5 mr-1.5" />Push</> : <>Done</>}
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden">
        {exportStep === "configure" && (
          <ConfigureStep
            agent={agent}
            agentId={agentId!}
            allToolConnectors={allToolConnectors || []}
            exportFormat={exportFormat}
            setExportFormat={setExportFormat}
            exportLlmProvider={exportLlmProvider}
            setExportLlmProvider={setExportLlmProvider}
            exportMaxIterations={exportMaxIterations}
            setExportMaxIterations={setExportMaxIterations}
            exportFramework={exportFramework}
            setExportFramework={setExportFramework}
            toolAdapterOverrides={toolAdapterOverrides}
            setToolAdapterOverrides={setToolAdapterOverrides}
            pinVersions={pinVersions}
            setPinVersions={setPinVersions}
            otelEnabled={otelEnabled}
            setOtelEnabled={setOtelEnabled}
            spanGranularity={spanGranularity}
            setSpanGranularity={setSpanGranularity}
            compileStatus={compileStatus}
            setCompileStatus={setCompileStatus}
            compileOutput={compileOutput}
            setCompileOutput={setCompileOutput}
            evalStatus={evalStatus}
            setEvalStatus={setEvalStatus}
            evalOutput={evalOutput}
            setEvalOutput={setEvalOutput}
            exportApprovalSubmitted={exportApprovalSubmitted}
            setExportApprovalSubmitted={setExportApprovalSubmitted}
            exportApprovalId={exportApprovalId}
            setExportApprovalId={setExportApprovalId}
            exportPreview={exportPreview}
          />
        )}

        {exportStep === "preview" && (
          <div className="flex h-full relative">
            {showFileSearch && (
              <div className="absolute inset-0 z-50 flex items-start justify-center pt-20 bg-black/40" onClick={() => setShowFileSearch(false)} data-testid="file-search-overlay">
                <div className="w-full max-w-md bg-background border rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} data-testid="file-search-palette">
                  <div className="flex items-center gap-2 px-3 py-2 border-b">
                    <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      ref={fileSearchInputRef}
                      type="text"
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      placeholder="Search files... (fuzzy)"
                      value={fileSearchQuery}
                      onChange={e => setFileSearchQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && filteredSearchFiles.length > 0) {
                          setExportPreviewFile(filteredSearchFiles[0]);
                          setShowFileSearch(false);
                        }
                      }}
                      data-testid="input-file-search"
                    />
                    <Badge variant="outline" className="text-[10px] shrink-0">{filteredSearchFiles.length}</Badge>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {filteredSearchFiles.map(fp => (
                      <button
                        key={fp}
                        className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 transition-colors ${fp === exportPreviewFile ? "bg-primary/10 text-primary" : ""}`}
                        onClick={() => { setExportPreviewFile(fp); setShowFileSearch(false); }}
                        data-testid={`file-search-result-${fp.replace(/[/.]/g, "-")}`}
                      >
                        <FileCode className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate font-mono">{fp}</span>
                      </button>
                    ))}
                    {filteredSearchFiles.length === 0 && (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">No matching files</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!fileTreeCollapsed && (
              <div className="shrink-0 border-r bg-muted/20 flex flex-col" style={{ width: fileTreeWidth }} data-testid="preview-file-tree-panel">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Files</span>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">{editedFilePaths.length}</Badge>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setFileTreeCollapsed(true)} data-testid="button-collapse-file-tree">
                      <PanelLeftClose className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {editedFilePaths.length > 0 && (
                    <FileTree
                      filePaths={editedFilePaths}
                      activeFile={exportPreviewFile}
                      onFileSelect={(path) => setExportPreviewFile(path)}
                      onRegenFile={handleRegenFile}
                      regeneratingFile={regeneratingFile}
                    />
                  )}
                </div>
              </div>
            )}

            {!fileTreeCollapsed && (
              <div
                className="w-1.5 shrink-0 cursor-col-resize bg-border/40 hover:bg-primary/30 transition-colors flex items-center justify-center"
                onMouseDown={onResizeMouseDown}
                data-testid="file-tree-resize-handle"
              >
                <GripVertical className="w-3 h-3 text-muted-foreground/50" />
              </div>
            )}

            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/10 shrink-0">
                {fileTreeCollapsed && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setFileTreeCollapsed(false)} data-testid="button-expand-file-tree">
                    <PanelLeft className="w-3.5 h-3.5" />
                  </Button>
                )}
                <code className="text-xs text-muted-foreground font-mono flex-1 truncate" data-testid="text-current-file">{exportPreviewFile || "No file selected"}</code>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => { setShowFileSearch(true); setFileSearchQuery(""); setTimeout(() => fileSearchInputRef.current?.focus(), 50); }}
                    title="Search files (Ctrl+P)"
                    data-testid="button-file-search"
                  >
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    variant={showDiffView ? "default" : "ghost"}
                    size="sm"
                    className="h-6 px-1.5 text-[10px] gap-1"
                    onClick={() => setShowDiffView(!showDiffView)}
                    disabled={!originalFiles[exportPreviewFile]}
                    title="Toggle diff view"
                    data-testid="button-toggle-diff"
                  >
                    <GitCompare className="w-3 h-3" />
                    {showDiffView ? "Editor" : "Diff"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(editedFiles[exportPreviewFile] || "")}
                    title="Copy file contents"
                    data-testid="button-copy-file"
                  >
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 min-h-0" data-testid="preview-editor-panel">
                {showDiffView && originalFiles[exportPreviewFile] ? (
                  <DiffEditor
                    key={`diff-${exportPreviewFile}`}
                    height="100%"
                    original={originalFiles[exportPreviewFile] || ""}
                    modified={editedFiles[exportPreviewFile] || ""}
                    language={(() => {
                      const ext = exportPreviewFile.split(".").pop()?.toLowerCase() || "";
                      if (["ts", "tsx"].includes(ext)) return "typescript";
                      if (["js", "jsx"].includes(ext)) return "javascript";
                      if (ext === "py") return "python";
                      if (ext === "json") return "json";
                      if (["yaml", "yml"].includes(ext)) return "yaml";
                      if (ext === "md") return "markdown";
                      return "plaintext";
                    })()}
                    theme="vs-dark"
                    options={{
                      renderSideBySide: true,
                      readOnly: false,
                      automaticLayout: true,
                      fontSize: 13,
                    }}
                    onMount={(editor) => {
                      const modifiedEditor = editor.getModifiedEditor();
                      modifiedEditor.onDidChangeModelContent(() => {
                        const val = modifiedEditor.getValue();
                        setEditedFiles(prev => ({ ...prev, [exportPreviewFile]: val }));
                      });
                    }}
                  />
                ) : (
                  <Editor
                    height="100%"
                    language={(() => {
                      const ext = exportPreviewFile.split(".").pop()?.toLowerCase() || "";
                      if (["ts", "tsx"].includes(ext)) return "typescript";
                      if (["js", "jsx"].includes(ext)) return "javascript";
                      if (ext === "py") return "python";
                      if (ext === "json") return "json";
                      if (["yaml", "yml"].includes(ext)) return "yaml";
                      if (ext === "md") return "markdown";
                      if (["sh", "bash"].includes(ext)) return "shell";
                      if (ext === "toml") return "ini";
                      if (ext === "dockerfile" || exportPreviewFile.toLowerCase().includes("dockerfile")) return "dockerfile";
                      return "plaintext";
                    })()}
                    value={editedFiles[exportPreviewFile] || ""}
                    onChange={(value) => {
                      if (value !== undefined) {
                        setEditedFiles((prev) => ({ ...prev, [exportPreviewFile]: value }));
                      }
                    }}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: editedFilePaths.length > 0 },
                      fontSize: 13,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      automaticLayout: true,
                      padding: { top: 8 },
                      readOnly: false,
                      renderLineHighlight: "all",
                    }}
                  />
                )}
              </div>
            </div>

            <div className="w-60 shrink-0 border-l bg-muted/10 flex flex-col overflow-y-auto" data-testid="preview-right-sidebar">
              <div className="px-3 py-2 border-b">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Details</span>
              </div>
              <div className="flex flex-col gap-3 p-3">
                {exportPreview?.metadata && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">Export Info</span>
                      <div className="flex flex-wrap gap-1">
                        {exportPreview.metadata.aiGenerated && (
                          <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20 gap-1">
                            <Sparkles className="w-2.5 h-2.5" />AI Generated
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">{exportPreview.metadata.pattern}</Badge>
                        <Badge variant="outline" className="text-[10px]">{exportPreview.metadata.format}</Badge>
                        <Badge variant="outline" className="text-[10px]">{exportPreview.metadata.llmProvider}</Badge>
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Files</span>
                  <div className="flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs">{editedFilePaths.length} files</span>
                  </div>
                  {exportPreview?.metadata?.fileCount && (
                    <span className="text-[10px] text-muted-foreground">{exportPreview.metadata.fileCount} total generated</span>
                  )}
                </div>

                <Separator />

                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Actions</span>
                  <div className="flex flex-col gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs gap-1.5"
                      onClick={handleGenerate}
                      disabled={exportCodeMutation.isPending}
                      data-testid="button-regenerate"
                    >
                      {exportCodeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Regenerate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs gap-1.5"
                      onClick={downloadExportPackage}
                      data-testid="button-sidebar-download"
                    >
                      <Download className="w-3 h-3" />
                      Download ZIP
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs gap-1.5"
                      onClick={() => setExportStep("download")}
                      data-testid="button-sidebar-deliver"
                    >
                      <GitBranch className="w-3 h-3" />
                      Git Push
                    </Button>
                  </div>
                </div>

                {agent && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">Agent</span>
                      <span className="text-xs font-medium truncate">{agent.name}</span>
                      {agent.industry && <Badge variant="outline" className="text-[9px] w-fit">{agent.industry}</Badge>}
                      {agent.riskTier && <Badge variant="outline" className="text-[9px] w-fit">Risk: {agent.riskTier}</Badge>}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {exportStep === "download" && (
          <div className="h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto p-6 flex flex-col gap-6" data-testid="step-download">
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">Choose Delivery Method</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card
                    className={`cursor-pointer hover:border-primary/50 transition-colors ${deliveryTarget === "zip" ? "border-primary ring-1 ring-primary/20" : ""}`}
                    onClick={() => setDeliveryTarget("zip")}
                    data-testid="card-delivery-zip"
                  >
                    <CardContent className="pt-4 pb-3">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10"><Download className="w-5 h-5 text-primary" /></div>
                        <span className="text-sm font-medium">Download ZIP</span>
                        <span className="text-[11px] text-muted-foreground">Download the complete source package.</span>
                        {deliveryTarget === "zip" && <CheckCircle className="w-4 h-4 text-primary" />}
                      </div>
                    </CardContent>
                  </Card>
                  <Card
                    className={`cursor-pointer hover:border-primary/50 transition-colors ${deliveryTarget === "git" ? "border-primary ring-1 ring-primary/20" : ""}`}
                    onClick={() => setDeliveryTarget("git")}
                    data-testid="card-delivery-git"
                  >
                    <CardContent className="pt-4 pb-3">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10"><GitBranch className="w-5 h-5 text-primary" /></div>
                        <span className="text-sm font-medium">Push to Git</span>
                        <span className="text-[11px] text-muted-foreground">Push to a Git repo for CI/CD.</span>
                        {deliveryTarget === "git" && <CheckCircle className="w-4 h-4 text-primary" />}
                      </div>
                    </CardContent>
                  </Card>
                  <Card
                    className={`cursor-pointer hover:border-primary/50 transition-colors ${deliveryTarget === "replit" ? "border-primary ring-1 ring-primary/20" : ""}`}
                    onClick={() => setDeliveryTarget("replit")}
                    data-testid="card-delivery-replit"
                  >
                    <CardContent className="pt-4 pb-3">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10"><Globe className="w-5 h-5 text-primary" /></div>
                        <span className="text-sm font-medium">Replit via GitHub</span>
                        <span className="text-[11px] text-muted-foreground">Import into Replit for instant hosting.</span>
                        {deliveryTarget === "replit" && <CheckCircle className="w-4 h-4 text-primary" />}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {deliveryTarget === "git" && (
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium">Repository URL</Label>
                  <Input placeholder="https://github.com/org/repo.git" value={gitRepoUrl} onChange={(e) => setGitRepoUrl(e.target.value)} data-testid="input-git-repo-url" />
                </div>
              )}

              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Deployment Checklist</span>
                      <Badge variant="outline" className="text-[10px]">
                        {deploymentChecklist.filter(item => checklistState[item.id]).length}/{deploymentChecklist.length} complete
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-1">
                      {deploymentChecklist.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-2.5 p-2 rounded-md hover:bg-muted/40 transition-colors group"
                          data-testid={`checklist-item-${item.id}`}
                        >
                          <Checkbox
                            checked={!!checklistState[item.id]}
                            onCheckedChange={(checked) => setChecklistState(prev => ({ ...prev, [item.id]: !!checked }))}
                            className="mt-0.5"
                            data-testid={`checkbox-${item.id}`}
                          />
                          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <span className={`text-sm ${checklistState[item.id] ? "line-through text-muted-foreground" : ""}`}>{item.label}</span>
                            <span className="text-[11px] text-muted-foreground">{item.detail}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                            onClick={() => copyToClipboard(item.detail)}
                            data-testid={`button-copy-checklist-${item.id}`}
                          >
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {deploymentChecklist.every(item => checklistState[item.id]) && deploymentChecklist.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40" data-testid="notice-export-complete">
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Ready to Deploy</span>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">All checklist items complete. Your agent source package is ready for deployment.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigureStep({
  agent,
  agentId,
  allToolConnectors,
  exportFormat, setExportFormat,
  exportLlmProvider, setExportLlmProvider,
  exportMaxIterations, setExportMaxIterations,
  exportFramework, setExportFramework,
  toolAdapterOverrides, setToolAdapterOverrides,
  pinVersions, setPinVersions,
  otelEnabled, setOtelEnabled,
  spanGranularity, setSpanGranularity,
  compileStatus, setCompileStatus,
  compileOutput, setCompileOutput,
  evalStatus, setEvalStatus,
  evalOutput, setEvalOutput,
  exportApprovalSubmitted, setExportApprovalSubmitted,
  exportApprovalId, setExportApprovalId,
  exportPreview,
}: {
  agent: Agent;
  agentId: string;
  allToolConnectors: ToolConnector[];
  exportFormat: string; setExportFormat: (v: any) => void;
  exportLlmProvider: string; setExportLlmProvider: (v: any) => void;
  exportMaxIterations: number; setExportMaxIterations: (v: number) => void;
  exportFramework: string; setExportFramework: (v: string) => void;
  toolAdapterOverrides: Record<string, "builtin" | "customer" | "stub">; setToolAdapterOverrides: (v: any) => void;
  pinVersions: boolean; setPinVersions: (v: boolean) => void;
  otelEnabled: boolean; setOtelEnabled: (v: boolean) => void;
  spanGranularity: string; setSpanGranularity: (v: any) => void;
  compileStatus: string; setCompileStatus: (v: any) => void;
  compileOutput: string; setCompileOutput: (v: string) => void;
  evalStatus: string; setEvalStatus: (v: any) => void;
  evalOutput: string; setEvalOutput: (v: string) => void;
  exportApprovalSubmitted: boolean; setExportApprovalSubmitted: (v: boolean) => void;
  exportApprovalId: string | null; setExportApprovalId: (v: string | null) => void;
  exportPreview: any;
}) {
  const { toast } = useToast();
  const agentTools = Array.isArray(agent?.toolsConfig) ? agent.toolsConfig as any[] : [];
  const connectors = allToolConnectors || [];
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const connectorMap = new Map(connectors.map(c => [normalize(c.name), c]));

  const resolvedTools = agentTools.map((t: any) => {
    const override = toolAdapterOverrides[t.name];
    const normalized = normalize(t.name || "");
    const connector = connectorMap.get(normalized);
    let status: "builtin" | "customer" | "stub" = override || "stub";
    if (!override) {
      if (connector && connector.status === "connected") status = "builtin";
      else if (connector) status = "customer";
      else status = "stub";
    }
    return { name: t.name || "Unknown Tool", description: t.description || t.type || "No description", status, connectorId: connector?.id };
  });

  const depData = (() => {
    const fw = exportFramework;
    const fmt = exportFormat;
    const llm = exportLlmProvider;
    if (fmt === "typescript") {
      const deps: Record<string, string> = {
        "typescript": pinVersions ? "5.6.3" : "^5.0.0",
        "ts-node": pinVersions ? "10.9.2" : "^10.9.0",
        "js-yaml": pinVersions ? "4.1.0" : "^4.1.0",
        "@types/js-yaml": pinVersions ? "4.0.9" : "^4.0.9",
        "@types/node": pinVersions ? "20.17.12" : "^20.0.0",
      };
      if (llm === "openai") deps["openai"] = pinVersions ? "4.77.0" : "^4.0.0";
      else deps["@anthropic-ai/sdk"] = pinVersions ? "0.30.1" : "^0.30.0";
      if (fw === "langgraph") {
        deps["@langchain/langgraph"] = pinVersions ? "0.2.36" : "^0.2.0";
        deps["@langchain/core"] = pinVersions ? "0.3.26" : "^0.3.0";
        if (llm === "openai") deps["@langchain/openai"] = pinVersions ? "0.3.16" : "^0.3.0";
        else deps["@langchain/anthropic"] = pinVersions ? "0.3.12" : "^0.3.0";
      }
      if (fw === "bedrock") deps["@aws-sdk/client-bedrock-agent-runtime"] = pinVersions ? "3.712.0" : "^3.0.0";
      if (fw === "n8n") deps["n8n-workflow"] = pinVersions ? "1.69.2" : "^1.0.0";
      if (fw === "vertex") deps["@google-cloud/aiplatform"] = pinVersions ? "3.34.0" : "^3.0.0";
      return { fileName: "package.json", deps };
    } else {
      const reqs: Array<{ name: string; pinned: string; range: string }> = [
        { name: "pyyaml", pinned: "6.0.2", range: ">=6.0" },
      ];
      if (llm === "openai") reqs.push({ name: "openai", pinned: "1.58.1", range: ">=1.0" });
      else reqs.push({ name: "anthropic", pinned: "0.30.1", range: ">=0.30" });
      if (fw === "langgraph") {
        reqs.push({ name: "langgraph", pinned: "0.2.60", range: ">=0.2.0" });
        reqs.push({ name: "langchain-core", pinned: "0.3.28", range: ">=0.3.0" });
        if (llm === "openai") reqs.push({ name: "langchain-openai", pinned: "0.2.14", range: ">=0.2.0" });
        else reqs.push({ name: "langchain-anthropic", pinned: "0.2.8", range: ">=0.2.0" });
      }
      if (fw === "crewai") reqs.push({ name: "crewai", pinned: "0.80.0", range: ">=0.80.0" });
      if (fw === "bedrock") reqs.push({ name: "boto3", pinned: "1.34.162", range: ">=1.34.0" });
      if (fw === "vertex") reqs.push({ name: "google-cloud-aiplatform", pinned: "1.60.0", range: ">=1.60.0" });
      if (fw === "databricks") {
        reqs.push({ name: "mlflow", pinned: "2.18.0", range: ">=2.18.0" });
        reqs.push({ name: "databricks-sdk", pinned: "0.36.0", range: ">=0.36.0" });
        reqs.push({ name: "databricks-langchain", pinned: "0.3.0", range: ">=0.3.0" });
        reqs.push({ name: "langchain-core", pinned: "0.3.28", range: ">=0.3.0" });
      }
      const depsMap: Record<string, string> = {};
      reqs.forEach(r => { depsMap[r.name] = pinVersions ? r.pinned : r.range; });
      return { fileName: "requirements.txt", deps: depsMap };
    }
  })();

  const envVars: Array<{ key: string; description: string; required: boolean }> = [];
  if (exportLlmProvider === "openai") envVars.push({ key: "OPENAI_API_KEY", description: "OpenAI API key", required: true });
  else envVars.push({ key: "ANTHROPIC_API_KEY", description: "Anthropic API key", required: true });
  if (exportFramework === "bedrock") {
    envVars.push({ key: "AWS_ACCESS_KEY_ID", description: "AWS access key", required: true });
    envVars.push({ key: "AWS_SECRET_ACCESS_KEY", description: "AWS secret key", required: true });
    envVars.push({ key: "AWS_REGION", description: "AWS region", required: true });
  }
  if (exportFramework === "vertex") envVars.push({ key: "GOOGLE_APPLICATION_CREDENTIALS", description: "GCP credentials path", required: true });
  if (exportFramework === "databricks") {
    envVars.push({ key: "DATABRICKS_HOST", description: "Databricks workspace URL", required: true });
    envVars.push({ key: "DATABRICKS_TOKEN", description: "Databricks access token", required: true });
  }
  if (otelEnabled) envVars.push({ key: "OTEL_EXPORTER_OTLP_ENDPOINT", description: "OpenTelemetry collector endpoint", required: false });
  envVars.push({ key: "ATLAS_AGENT_ID", description: "Agent identifier for trace correlation", required: false });

  const stubCount = resolvedTools.filter(t => t.status === "stub").length;
  const builtinCount = resolvedTools.filter(t => t.status === "builtin").length;
  const customerCount = resolvedTools.filter(t => t.status === "customer").length;
  const depCount = depData.deps ? Object.keys(depData.deps).length : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 flex flex-col gap-6" data-testid="step-configure">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Configure Source Export</h2>
            <p className="text-sm text-muted-foreground">Configure source files for standalone deployment via your CI/CD pipeline.</p>
          </div>
          <PresetControls
            agentId={agentId}
            currentConfig={{ framework: exportFramework, format: exportFormat, llmProvider: exportLlmProvider, pinVersions, otelEnabled, spanGranularity, maxIterations: exportMaxIterations }}
            onLoadPreset={(preset) => {
              setExportFramework(preset.framework);
              setExportFormat(preset.format);
              setExportLlmProvider(preset.llmProvider);
              setPinVersions(preset.pinVersions);
              setOtelEnabled(preset.otelEnabled);
              setSpanGranularity(preset.spanGranularity);
              setExportMaxIterations(preset.maxIterations);
              toast({ title: "Preset loaded", description: `"${preset.name}" configuration applied` });
            }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium">Framework / Pattern</Label>
            <Select value={exportFramework} onValueChange={setExportFramework}>
              <SelectTrigger data-testid="select-framework">
                <SelectValue placeholder="Select framework" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="generic">Generic (Ralph Loop)</SelectItem>
                <SelectItem value="langgraph">LangGraph</SelectItem>
                <SelectItem value="crewai">CrewAI</SelectItem>
                <SelectItem value="bedrock">AWS Bedrock Agents</SelectItem>
                <SelectItem value="n8n">n8n Workflow</SelectItem>
                <SelectItem value="vertex">Vertex AI Agent Builder</SelectItem>
                <SelectItem value="databricks">Databricks AgentBricks</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium">Language</Label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger data-testid="select-format">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="typescript">TypeScript</SelectItem>
                <SelectItem value="python">Python</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium">LLM Provider</Label>
            <Select value={exportLlmProvider} onValueChange={setExportLlmProvider}>
              <SelectTrigger data-testid="select-llm-provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium">Max Iterations</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={exportMaxIterations}
              onChange={(e) => setExportMaxIterations(parseInt(e.target.value) || 10)}
              data-testid="input-max-iterations"
            />
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Tool Adapters</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {builtinCount > 0 && <Badge variant="outline" className="text-[10px]"><CheckCircle className="w-3 h-3 mr-1 text-emerald-500" />{builtinCount} Built-in</Badge>}
                {customerCount > 0 && <Badge variant="outline" className="text-[10px]"><AlertCircle className="w-3 h-3 mr-1 text-amber-500" />{customerCount} Customer</Badge>}
                {stubCount > 0 && <Badge variant="outline" className="text-[10px]"><FileCode className="w-3 h-3 mr-1 text-muted-foreground" />{stubCount} Stubs</Badge>}
              </div>
            </div>
            {resolvedTools.length === 0 ? (
              <span className="text-xs text-muted-foreground">No tools referenced by this agent.</span>
            ) : (
              <div className="flex flex-col gap-1.5">
                {resolvedTools.map((tool, idx) => {
                  const cfg = tool.status === "builtin" ? { color: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle, label: "Built-in" }
                    : tool.status === "customer" ? { color: "text-amber-600 dark:text-amber-400", icon: AlertTriangle, label: "Customer" }
                    : { color: "text-muted-foreground", icon: FileCode, label: "Stub" };
                  const StatusIcon = cfg.icon;
                  return (
                    <div key={tool.name} className="flex items-center justify-between gap-2 p-2 rounded-md border" data-testid={`tool-adapter-row-${idx}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate" data-testid={`tool-name-${idx}`}>{tool.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className={`text-[9px] ${cfg.color}`} data-testid={`tool-status-${idx}`}>
                          <StatusIcon className="w-2.5 h-2.5 mr-1" />{cfg.label}
                        </Badge>
                        {tool.status !== "stub" && (
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => setToolAdapterOverrides((prev: any) => ({ ...prev, [tool.name]: "stub" }))} data-testid={`button-switch-to-stub-${idx}`}>
                            Use Stub
                          </Button>
                        )}
                        {tool.status === "stub" && tool.connectorId && (
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => setToolAdapterOverrides((prev: any) => ({ ...prev, [tool.name]: "builtin" }))} data-testid={`button-attach-adapter-${idx}`}>
                            Attach
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Dependencies</span>
                <Badge variant="outline" className="text-[10px]">{depCount} packages</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(depData.deps || {}).map(([name, ver]) => {
                  const isPython = exportFormat === "python";
                  const sep = isPython ? (ver.startsWith(">=") || ver.startsWith("~=") ? "" : "==") : "@";
                  return (
                    <Badge key={name} variant="secondary" className="text-[10px] font-mono" data-testid={`dep-badge-${name}`}>{name}{sep}{ver}</Badge>
                  );
                })}
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Environment Variables</span>
                <Badge variant="outline" className="text-[10px]">{envVars.length} vars</Badge>
              </div>
              <div className="flex flex-col gap-1">
                {envVars.map(v => (
                  <div key={v.key} className="flex items-center gap-2 text-xs" data-testid={`env-var-${v.key}`}>
                    <code className="font-mono text-[11px] font-medium">{v.key}</code>
                    <span className="text-muted-foreground flex-1">{v.description}</span>
                    {v.required && <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-600 dark:text-red-400">required</Badge>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <Accordion type="single" collapsible className="border rounded-md">
          <AccordionItem value="advanced" className="border-0">
            <AccordionTrigger className="px-4 py-3 text-sm hover:no-underline" data-testid="accordion-advanced-settings">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-muted-foreground" />
                <span>Advanced Settings</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Pin Dependency Versions</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground ml-6">Pin packages to exact versions for reproducible builds across environments.</span>
                  </div>
                  <Switch id="pin-versions-toggle" checked={pinVersions} onCheckedChange={setPinVersions} data-testid="toggle-pin-versions" />
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">OpenTelemetry Traces</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground ml-6">Emit OTLP-compatible trace data for production observability.</span>
                  </div>
                  <Switch checked={otelEnabled} onCheckedChange={setOtelEnabled} data-testid="switch-otel-enabled" />
                </div>

                {otelEnabled && (
                  <div className="flex flex-col gap-2 pl-6 border-l-2 border-primary/20">
                    <Label className="text-xs font-medium">Span Granularity</Label>
                    <div className="flex gap-2">
                      <Button size="sm" variant={spanGranularity === "per-node" ? "default" : "outline"} onClick={() => setSpanGranularity("per-node")} data-testid="option-granularity-per-node" className="text-xs">Per Node</Button>
                      <Button size="sm" variant={spanGranularity === "per-tool-call" ? "default" : "outline"} onClick={() => setSpanGranularity("per-tool-call")} data-testid="option-granularity-per-tool-call" className="text-xs">Per Tool Call</Button>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Hammer className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Build & Test Gate</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant={compileStatus === "passed" ? "outline" : "default"}
                      disabled={compileStatus === "running"}
                      onClick={async () => {
                        setCompileStatus("running");
                        setCompileOutput("");
                        try {
                          const res = await apiRequest("POST", `/api/agents/${agentId}/export-validate`, { type: "compile", format: exportFormat, framework: exportFramework, llmProvider: exportLlmProvider });
                          const data = await res.json();
                          setCompileStatus(data.passed ? "passed" : "failed");
                          setCompileOutput(data.output || (data.passed ? "All checks passed." : "Errors detected."));
                        } catch { setCompileStatus("failed"); setCompileOutput("Check failed."); }
                      }}
                      data-testid="button-run-compile"
                    >
                      {compileStatus === "running" ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Compiling...</> : compileStatus === "passed" ? <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />Compile Passed</> : compileStatus === "failed" ? <><XOctagon className="w-3.5 h-3.5 mr-1.5" />Re-run Compile</> : <><Terminal className="w-3.5 h-3.5 mr-1.5" />Run Compile</>}
                    </Button>
                    <Button
                      size="sm"
                      variant={evalStatus === "passed" ? "outline" : "default"}
                      disabled={evalStatus === "running"}
                      onClick={async () => {
                        setEvalStatus("running");
                        setEvalOutput("");
                        try {
                          const res = await apiRequest("POST", `/api/agents/${agentId}/export-validate`, { type: "eval", format: exportFormat, framework: exportFramework, llmProvider: exportLlmProvider });
                          const data = await res.json();
                          setEvalStatus(data.passed ? "passed" : "failed");
                          setEvalOutput(data.output || (data.passed ? "All evals passed." : "Some evals failed."));
                        } catch { setEvalStatus("failed"); setEvalOutput("Eval failed."); }
                      }}
                      data-testid="button-run-eval"
                    >
                      {evalStatus === "running" ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Evaluating...</> : evalStatus === "passed" ? <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />Eval Passed</> : evalStatus === "failed" ? <><XOctagon className="w-3.5 h-3.5 mr-1.5" />Re-run Eval</> : <><FlaskConical className="w-3.5 h-3.5 mr-1.5" />Run Eval</>}
                    </Button>
                  </div>
                  {compileOutput && (
                    <div className={`rounded-md p-2 text-xs font-mono whitespace-pre-wrap ${compileStatus === "passed" ? "bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-red-500/5 border border-red-500/20 text-red-700 dark:text-red-400"}`} data-testid="output-compile">{compileOutput}</div>
                  )}
                  {evalOutput && (
                    <div className={`rounded-md p-2 text-xs font-mono whitespace-pre-wrap ${evalStatus === "passed" ? "bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-red-500/5 border border-red-500/20 text-red-700 dark:text-red-400"}`} data-testid="output-eval">{evalOutput}</div>
                  )}
                </div>

                <Separator />

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Export Approval</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={exportApprovalSubmitted}
                    onClick={async () => {
                      try {
                        const sc = Object.values(toolAdapterOverrides).filter(v => v === "stub").length;
                        const riskTier = sc >= 3 ? "critical" : sc > 0 || compileStatus !== "passed" || evalStatus !== "passed" ? "high" : Object.values(toolAdapterOverrides).some(v => v === "customer") || !otelEnabled ? "medium" : "low";
                        const riskScore = riskTier === "critical" ? 9 : riskTier === "high" ? 7 : riskTier === "medium" ? 4 : 1;
                        const res = await apiRequest("POST", "/api/approvals", {
                          type: "export_review", objectType: "export_package", objectId: agentId,
                          objectName: `Export: ${agent?.name || "Agent"} (${exportFramework})`,
                          riskScore, status: "pending", requestedBy: "System", requesterType: "system", agentId,
                          description: `Code export for ${agent?.name} using ${exportFramework}, ${exportFormat}, ${exportLlmProvider}`,
                          changeType: "export", toolPermissionClass: sc > 0 ? "elevated" : "standard",
                          diffSummary: `${exportPreview ? Object.keys(exportPreview.files).length : 0} files, ${sc} stubs`,
                          evidenceJson: { exportConfig: { framework: exportFramework, format: exportFormat, llmProvider: exportLlmProvider, pinVersions, otelEnabled, spanGranularity, maxIterations: exportMaxIterations }, toolAdapters: toolAdapterOverrides, gateResults: { compileStatus, evalStatus } },
                        });
                        const data = await res.json();
                        setExportApprovalSubmitted(true);
                        setExportApprovalId(data.id);
                        queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
                        toast({ title: "Export approval requested", description: "An expert validator will review the export package." });
                      } catch { toast({ title: "Failed to request approval", variant: "destructive" }); }
                    }}
                    data-testid="button-request-export-approval"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                    {exportApprovalSubmitted ? "Approval Requested" : "Request Export Approval"}
                  </Button>
                  {exportApprovalSubmitted && exportApprovalId && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="text-xs text-emerald-700 dark:text-emerald-400">Approval created.</span>
                      <Link href={`/approvals/${exportApprovalId}`}>
                        <Button variant="link" size="sm" className="h-auto p-0 text-xs" data-testid="button-view-approval">View</Button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

function PresetControls({
  agentId,
  currentConfig,
  onLoadPreset,
}: {
  agentId: string;
  currentConfig: { framework: string; format: string; llmProvider: string; pinVersions: boolean; otelEnabled: boolean; spanGranularity: string; maxIterations: number };
  onLoadPreset: (preset: ExportPreset) => void;
}) {
  const { toast } = useToast();
  const [presets, setPresets] = useState<ExportPreset[]>(() => getPresets(agentId));
  const [showSave, setShowSave] = useState(false);
  const [presetName, setPresetName] = useState("");

  useEffect(() => { setPresets(getPresets(agentId)); }, [agentId]);

  const refreshPresets = () => setPresets(getPresets(agentId));

  const handleSave = () => {
    if (!presetName.trim()) return;
    const preset: ExportPreset = {
      name: presetName.trim(),
      ...currentConfig,
      savedAt: new Date().toISOString(),
    };
    savePreset(agentId, preset);
    refreshPresets();
    setShowSave(false);
    setPresetName("");
    toast({ title: "Preset saved", description: `"${preset.name}" saved` });
  };

  const handleDelete = (name: string) => {
    deletePreset(agentId, name);
    refreshPresets();
    toast({ title: "Preset deleted" });
  };

  return (
    <div className="flex items-center gap-2 shrink-0" data-testid="preset-controls">
      {presets.length > 0 && (
        <Select
          onValueChange={(name) => {
            const preset = presets.find(p => p.name === name);
            if (preset) onLoadPreset(preset);
          }}
        >
          <SelectTrigger className="h-8 w-[160px] text-xs" data-testid="select-preset">
            <Bookmark className="w-3 h-3 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Load preset..." />
          </SelectTrigger>
          <SelectContent>
            {presets.map(p => (
              <SelectItem key={p.name} value={p.name} className="text-xs">{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {showSave ? (
        <div className="flex items-center gap-1">
          <Input
            className="h-8 w-[140px] text-xs"
            placeholder="Preset name..."
            value={presetName}
            onChange={e => setPresetName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setShowSave(false); }}
            autoFocus
            data-testid="input-preset-name"
          />
          <Button variant="default" size="sm" className="h-8 px-2" onClick={handleSave} disabled={!presetName.trim()} data-testid="button-save-preset-confirm">
            <Check className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setShowSave(false)} data-testid="button-save-preset-cancel">
            <XOctagon className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setShowSave(true)} data-testid="button-save-preset">
          <Save className="w-3 h-3" />
          Save Preset
        </Button>
      )}
    </div>
  );
}
