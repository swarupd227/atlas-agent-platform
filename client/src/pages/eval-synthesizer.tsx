import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { EvalDataset } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRight,
  FlaskConical,
  Upload,
  Wand2,
  Check,
  X,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle,
  Circle,
  AlertCircle,
  Save,
  Coins,
  FileText,
  Database,
  Play,
  RefreshCcw,
  Sparkles,
  Clock,
  Layers,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeneratedGolden {
  id: string;
  input: string;
  expectedOutput: string;
  retrievalContext: string[];
  type: string;
  style: string;
  evolved: boolean;
  qualityScore: number;
}

type GoldenStatus = "accepted" | "rejected" | "edited" | "pending";

interface ProgressStageItem {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
}

interface EstimateResult {
  totalTokens: number;
  estimatedCostUsd: number;
  estimatedMinutes: number;
  count: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { id: "sources", label: "Sources" },
  { id: "generation", label: "Generation" },
  { id: "evolution", label: "Evolution" },
  { id: "style", label: "Style" },
  { id: "review", label: "Review" },
  { id: "save", label: "Save" },
];

const SYNTH_STAGES: ProgressStageItem[] = [
  { id: "chunking", label: "Chunking source text", status: "pending" },
  { id: "extracting_context", label: "Extracting context", status: "pending" },
  { id: "generating", label: "Generating goldens", status: "pending" },
  { id: "evolving", label: "Evolving complexity", status: "pending" },
  { id: "filtering", label: "Filtering & dedup", status: "pending" },
  { id: "applying_style", label: "Applying style", status: "pending" },
  { id: "done", label: "Done", status: "pending" },
];

const stageOrder = SYNTH_STAGES.map(s => s.id);

const SYNTH_MODELS = [
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 (recommended)" },
  { value: "claude-opus-4-5", label: "Claude Opus 4.5 (highest quality)" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini (fastest)" },
];

const STYLE_OPTIONS = [
  { value: "formal", label: "Formal", desc: "Professional, complete sentences" },
  { value: "casual", label: "Casual", desc: "Conversational, relaxed tone" },
  { value: "terse", label: "Terse", desc: "Brief, minimal phrasing" },
  { value: "verbose", label: "Verbose", desc: "Detailed, full context in queries" },
  { value: "with-typos", label: "With Typos", desc: "Realistic typing errors" },
  { value: "non-native", label: "Non-Native", desc: "Non-native English speaker" },
];

const TYPE_BADGE: Record<string, string> = {
  happy_path: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  variation: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  edge_case: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  adversarial: "bg-red-500/10 text-red-600 border-red-500/20",
};

const PAGE_SIZE = 10;

// ── Component ─────────────────────────────────────────────────────────────────

export default function EvalSynthesizer() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Wizard state
  const [step, setStep] = useState(0);
  const [sourceType, setSourceType] = useState<"text" | "seeds" | "file">("text");
  const [sourceText, setSourceText] = useState("");
  const [seedGoldens, setSeedGoldens] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileRef, setUploadedFileRef] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Generation settings
  const [goldenCount, setGoldenCount] = useState(50);
  const [synModel, setSynModel] = useState("claude-sonnet-4-5");
  const [distribution, setDistribution] = useState({ happy: 40, variation: 30, edge: 20, adversarial: 10 });

  // Evolution settings
  const [evolution, setEvolution] = useState({ reasoning: false, multiContext: false, hypothetical: false, comparative: false });

  // Style
  const [style, setStyle] = useState("formal");

  // Synthesis warnings / degraded mode
  const [synthWarnings, setSynthWarnings] = useState<string[]>([]);
  const [synthDegraded, setSynthDegraded] = useState(false);

  // Synthesis progress
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [stages, setStages] = useState<ProgressStageItem[]>(SYNTH_STAGES.map(s => ({ ...s })));
  const [generatedGoldens, setGeneratedGoldens] = useState<GeneratedGolden[]>([]);
  const [goldenStatuses, setGoldenStatuses] = useState<Record<string, GoldenStatus>>({});
  const [editingGolden, setEditingGolden] = useState<GeneratedGolden | null>(null);
  const [editDraft, setEditDraft] = useState({ input: "", expectedOutput: "" });
  const [reviewPage, setReviewPage] = useState(0);
  const [estimateResult, setEstimateResult] = useState<EstimateResult | null>(null);

  // Save settings
  const [datasetId, setDatasetId] = useState("");
  const [newDatasetName, setNewDatasetName] = useState("");
  const [versionLabel, setVersionLabel] = useState("v1.0");
  const [withProvenance, setWithProvenance] = useState(true);
  const [saveMode, setSaveMode] = useState<"existing" | "new">("existing");
  const [isSaving, setIsSaving] = useState(false);

  // Polling
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: datasets } = useQuery<EvalDataset[]>({
    queryKey: ["/api/eval/datasets"],
  });

  // ── File upload ────────────────────────────────────────────────────────────

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    readFile(file);
  }, []);

  const readFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 50 MB", variant: "destructive" });
      return;
    }
    setUploadedFileName(file.name);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Simulate progress ticks during upload
      const ticker = setInterval(() => setUploadProgress(p => Math.min(p + 15, 85)), 200);

      const res = await fetch("/api/eval/synthesizer/upload", { method: "POST", body: formData });
      clearInterval(ticker);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }

      const data = await res.json();
      setUploadProgress(100);
      setUploadedFileRef(data.fileRef);
      // Keep sourceType as "text" so the dropzone tab stays visible.
      // The file mode is driven solely by uploadedFileRef presence.

      // Populate the text preview with extracted content so the user can see what was parsed.
      if (data.extractedText) {
        setSourceText(data.extractedText);
      } else {
        setSourceText(`[Extracted text unavailable — server will synthesize from uploaded file]`);
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setUploadedFileName(null);
    } finally {
      setIsUploading(false);
    }
  };

  // ── Distribution helpers ───────────────────────────────────────────────────

  const updateDistribution = (key: string, newVal: number) => {
    const others = Object.entries(distribution).filter(([k]) => k !== key);
    const remaining = 100 - newVal;
    const totalOthers = others.reduce((s, [, v]) => s + v, 0);
    const adjusted = Object.fromEntries(
      others.map(([k, v]) => [k, totalOthers > 0 ? Math.round((v / totalOthers) * remaining) : Math.round(remaining / others.length)])
    ) as typeof distribution;
    setDistribution({ ...adjusted, [key]: newVal } as typeof distribution);
  };

  // ── Estimate cost ──────────────────────────────────────────────────────────

  const estimateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/eval/synthesizer/estimate", {
        count: goldenCount,
        sourceTextLength: sourceText.length,
        model: synModel,
        evolution,
      }),
    onSuccess: async (res) => {
      const data = await res.json();
      setEstimateResult(data);
    },
  });

  // ── Start synthesis ────────────────────────────────────────────────────────

  const startSynthesis = async () => {
    try {
      const res = await apiRequest("POST", "/api/eval/synthesizer/run", {
        // Derive API sourceType: if a file has been uploaded (fileRef present) and we're
        // on the "text" tab, use "file" mode in the API call. sourceType state only ever
        // holds "text" | "seeds" to keep the dropzone tab visible after upload.
        sourceType: uploadedFileRef && sourceType === "text" ? "file" : sourceType,
        sourceText: sourceType === "text" && !uploadedFileRef ? sourceText : "",
        seedGoldens: sourceType === "seeds" ? seedGoldens : "",
        fileRef: uploadedFileRef && sourceType === "text" ? uploadedFileRef : undefined,
        count: goldenCount,
        model: synModel,
        distribution,
        evolution,
        style,
      });
      const data = await res.json();
      setJobId(data.jobId);
      setJobStatus("running");
      setProgress(0);
      setStages(SYNTH_STAGES.map(s => ({ ...s, status: "pending" })));
    } catch (err: any) {
      toast({ title: "Failed to start synthesis", description: err.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!jobId || jobStatus !== "running") return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/eval/synthesizer/${jobId}/status`);
        const data = await res.json();
        setProgress(data.progress || 0);

        const currentStep: string = data.currentStep || "";
        if (currentStep) {
          const stepIdx = stageOrder.indexOf(currentStep);
          setStages(prev =>
            prev.map((s, i) => ({
              ...s,
              status: i < stepIdx ? "done" : i === stepIdx ? "active" : "pending",
            }))
          );
        }

        if (data.status === "completed") {
          setJobStatus("completed");
          setStages(prev => prev.map(s => ({ ...s, status: "done" })));
          setProgress(100);
          const goldens: GeneratedGolden[] = data.goldens || [];
          setGeneratedGoldens(goldens);
          const initStatuses: Record<string, GoldenStatus> = {};
          // Pre-mark low-fidelity items as "pending" so the user must explicitly review them
          goldens.forEach(g => {
            initStatuses[g.id] = (g as any).lowFidelity ? "pending" : "accepted";
          });
          setGoldenStatuses(initStatuses);
          // Surface generation warnings if any
          if (data.warnings?.length > 0) {
            setSynthWarnings(data.warnings as string[]);
            setSynthDegraded(true);
          }
          if (pollRef.current) clearInterval(pollRef.current);
          setStep(4);
        } else if (data.status === "failed") {
          setJobStatus("failed");
          if (pollRef.current) clearInterval(pollRef.current);
          toast({ title: "Synthesis failed", description: data.error || "Unknown error", variant: "destructive" });
        }
      } catch (err) {
        // transient error, keep polling
      }
    }, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId, jobStatus]);

  // ── Review helpers ─────────────────────────────────────────────────────────

  const pagedGoldens = generatedGoldens.slice(reviewPage * PAGE_SIZE, (reviewPage + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(generatedGoldens.length / PAGE_SIZE);

  const accepted = Object.values(goldenStatuses).filter(s => s === "accepted" || s === "edited").length;
  const rejected = Object.values(goldenStatuses).filter(s => s === "rejected").length;
  const pending = Object.values(goldenStatuses).filter(s => s === "pending").length;
  const avgQuality = generatedGoldens.length > 0
    ? Math.round(generatedGoldens.filter(g => goldenStatuses[g.id] !== "rejected").reduce((s, g) => s + g.qualityScore, 0) / Math.max(accepted, 1) * 100) / 100
    : 0;

  const startEdit = (g: GeneratedGolden) => {
    setEditingGolden(g);
    setEditDraft({ input: g.input, expectedOutput: g.expectedOutput });
  };

  const saveEdit = () => {
    if (!editingGolden) return;
    setGeneratedGoldens(prev => prev.map(g => g.id === editingGolden.id ? { ...g, ...editDraft } : g));
    setGoldenStatuses(prev => ({ ...prev, [editingGolden.id]: "edited" }));
    setEditingGolden(null);
  };

  // ── Save to dataset ────────────────────────────────────────────────────────

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let targetDatasetId = datasetId;

      if (saveMode === "new") {
        if (!newDatasetName.trim()) {
          toast({ title: "Dataset name required", variant: "destructive" });
          setIsSaving(false);
          return;
        }
        const res = await apiRequest("POST", "/api/eval/datasets", {
          name: newDatasetName,
          description: `Synthesized dataset — ${goldenCount} goldens, style: ${style}`,
          tags: ["synthesized", style],
        });
        const dataset = await res.json();
        targetDatasetId = dataset.id;
      }

      if (!targetDatasetId) {
        toast({ title: "Select a dataset", variant: "destructive" });
        setIsSaving(false);
        return;
      }

      const toSave = generatedGoldens.filter(g => goldenStatuses[g.id] !== "rejected").map(g => ({
        input: g.input,
        expectedOutput: g.expectedOutput,
        retrievalContext: g.retrievalContext,
        tags: [g.type, style, g.evolved ? "evolved" : "base"],
        provenance: withProvenance ? {
          sourceType,
          style,
          model: synModel,
          type: g.type,
          qualityScore: g.qualityScore,
          versionLabel,
          sourceRef: uploadedFileName ?? undefined,
          synthesisPrompt: `style=${style}, evolution=${Object.entries(evolution).filter(([, v]) => v).map(([k]) => k).join(",")}`,
          synthesizedAt: new Date().toISOString(),
        } : undefined,
      }));

      await apiRequest("POST", `/api/eval/datasets/${targetDatasetId}/goldens/bulk`, { goldens: toSave });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/datasets"] });
      toast({ title: "Goldens saved", description: `${toSave.length} goldens written to dataset` });
      navigate("/evals/datasets");
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const canProceedFromStep = (): boolean => {
    if (step === 0) {
      // Allow proceeding if we have pasted text, seed goldens, or an uploaded file token.
      // Block while upload is still in progress.
      const hasContent = sourceType === "seeds"
        ? seedGoldens.trim().length > 0
        : sourceText.trim().length > 0 || !!uploadedFileRef;
      return hasContent && !isUploading;
    }
    if (step === 3) return jobStatus === "idle" || jobStatus === "failed";
    return true;
  };

  const handleNext = () => {
    if (step === 3 && (jobStatus === "idle" || jobStatus === "failed")) {
      startSynthesis();
      return;
    }
    if (step < STEPS.length - 1) setStep(s => s + 1);
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/evals")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Eval Studio
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Golden Synthesizer</h1>
        </div>
      </div>

      {/* Stepper */}
      <div className="border-b px-6 py-3 bg-muted/30">
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1">
              <button
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  i === step ? "bg-primary text-primary-foreground" :
                  i < step ? "bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
                onClick={() => i < step && setStep(i)}
                data-testid={`step-${s.id}`}
              >
                {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 text-center text-[10px]">{i + 1}</span>}
                {s.label}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
          ))}
        </div>
      </div>

      {/* Body — flex row: wizard content + progress panel */}
      <div className="flex flex-1 overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="p-6 max-w-2xl mx-auto space-y-6">

            {/* ── Step 0: Sources ── */}
            {step === 0 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold mb-1">Source Material</h2>
                  <p className="text-sm text-muted-foreground">Upload a document or paste seed goldens to bootstrap synthesis.</p>
                </div>

                <div className="flex gap-2">
                  <Button variant={sourceType === "text" ? "default" : "outline"} size="sm" onClick={() => setSourceType("text")} data-testid="tab-source-text">
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    Document / Text
                  </Button>
                  <Button variant={sourceType === "seeds" ? "default" : "outline"} size="sm" onClick={() => setSourceType("seeds")} data-testid="tab-source-seeds">
                    <Layers className="w-3.5 h-3.5 mr-1.5" />
                    Seed Goldens
                  </Button>
                </div>

                {sourceType === "text" ? (
                  <div className="space-y-3">
                    {/* Drag-and-drop zone */}
                    <div
                      onDragOver={e => { e.preventDefault(); if (!isUploading) setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleFileDrop}
                      onClick={() => !isUploading && fileRef.current?.click()}
                      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : isUploading ? "border-primary/40 bg-primary/5 cursor-not-allowed" : "border-muted-foreground/20 hover:border-primary/40"}`}
                      data-testid="dropzone-file"
                    >
                      <input ref={fileRef} type="file" accept=".pdf,.txt,.docx,.md" className="hidden" onChange={e => e.target.files?.[0] && readFile(e.target.files[0])} />
                      {isUploading ? (
                        <>
                          <Loader2 className="w-8 h-8 mx-auto mb-2 text-primary animate-spin" />
                          <p className="text-sm font-medium text-primary">Uploading {uploadedFileName}...</p>
                          <div className="mt-3 max-w-[200px] mx-auto">
                            <Progress value={uploadProgress} className="h-1.5" />
                          </div>
                        </>
                      ) : uploadedFileName && uploadedFileRef ? (
                        <div className="space-y-1">
                          <CheckCircle className="w-8 h-8 mx-auto text-emerald-500" />
                          <p className="text-sm font-medium text-emerald-600">{uploadedFileName}</p>
                          <p className="text-xs text-muted-foreground">File uploaded to server — click to replace</p>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm font-medium">Drop PDF, TXT, DOCX here</p>
                          <p className="text-xs text-muted-foreground mt-1">or click to browse — up to 50 MB</p>
                        </>
                      )}
                    </div>
                    <Separator className="my-2" />
                    <div className="space-y-2">
                      <Label>Or paste document text</Label>
                      <Textarea
                        value={sourceText}
                        onChange={e => setSourceText(e.target.value)}
                        placeholder="Paste document contents here..."
                        className="min-h-[160px] font-mono text-xs"
                        data-testid="textarea-source-text"
                      />
                      <p className="text-xs text-muted-foreground">{sourceText.length.toLocaleString()} chars</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Seed Golden Examples (JSON array or CSV)</Label>
                    <Textarea
                      value={seedGoldens}
                      onChange={e => setSeedGoldens(e.target.value)}
                      placeholder={`[{"input": "How do I reset my password?", "expectedOutput": "Click Forgot Password on the login page..."}]`}
                      className="min-h-[200px] font-mono text-xs"
                      data-testid="textarea-seed-goldens"
                    />
                    <p className="text-xs text-muted-foreground">Up to 20 seed examples. The synthesizer will generate variations.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 1: Generation ── */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold mb-1">Generation Settings</h2>
                  <p className="text-sm text-muted-foreground">Configure how many goldens to generate and how to distribute them.</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Golden count</Label>
                    <span className="text-sm font-semibold text-primary" data-testid="value-golden-count">{goldenCount}</span>
                  </div>
                  <Slider min={10} max={1000} step={10} value={[goldenCount]} onValueChange={([v]) => setGoldenCount(v)} data-testid="slider-golden-count" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>10</span><span>1000</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Synthesis model</Label>
                  <Select value={synModel} onValueChange={setSynModel}>
                    <SelectTrigger data-testid="select-synth-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYNTH_MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4">
                  <Label>Distribution</Label>
                  {(["happy", "variation", "edge", "adversarial"] as const).map(key => {
                    const labels: Record<string, string> = { happy: "Happy Path", variation: "Variation", edge: "Edge Case", adversarial: "Adversarial" };
                    const colors: Record<string, string> = { happy: "text-emerald-600", variation: "text-blue-600", edge: "text-amber-600", adversarial: "text-red-600" };
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-medium ${colors[key]}`}>{labels[key]}</span>
                          <span className="text-xs font-mono" data-testid={`value-dist-${key}`}>{distribution[key]}%</span>
                        </div>
                        <Slider min={0} max={80} step={5} value={[distribution[key]]} onValueChange={([v]) => updateDistribution(key, v)} data-testid={`slider-dist-${key}`} />
                      </div>
                    );
                  })}
                  <div className="flex justify-between text-xs text-muted-foreground pt-1">
                    <span>Total: {Object.values(distribution).reduce((a, b) => a + b, 0)}%</span>
                    {Object.values(distribution).reduce((a, b) => a + b, 0) !== 100 && (
                      <span className="text-amber-500">Distribution should sum to 100%</span>
                    )}
                  </div>
                </div>

                {/* Cost estimate */}
                <Card className="bg-muted/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-amber-500" />
                        Cost estimate
                      </span>
                      <Button variant="outline" size="sm" onClick={() => estimateMutation.mutate()} disabled={estimateMutation.isPending} data-testid="button-estimate-cost">
                        {estimateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                        Estimate
                      </Button>
                    </div>
                    {estimateResult && (
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-md border p-2">
                          <div className="text-base font-bold text-primary">{estimateResult.totalTokens.toLocaleString()}</div>
                          <div className="text-[10px] text-muted-foreground">Tokens</div>
                        </div>
                        <div className="rounded-md border p-2">
                          <div className="text-base font-bold text-primary">${estimateResult.estimatedCostUsd.toFixed(2)}</div>
                          <div className="text-[10px] text-muted-foreground">Estimated cost</div>
                        </div>
                        <div className="rounded-md border p-2">
                          <div className="text-base font-bold text-primary">~{estimateResult.estimatedMinutes}m</div>
                          <div className="text-[10px] text-muted-foreground">Est. time</div>
                        </div>
                      </div>
                    )}
                    {!estimateResult && !estimateMutation.isPending && (
                      <p className="text-xs text-muted-foreground">Click Estimate to preview token usage and cost.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Step 2: Evolution ── */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold mb-1">Evolution Strategies</h2>
                  <p className="text-sm text-muted-foreground">Enable reasoning evolution to generate more challenging, nuanced goldens. Each adds ~25% more tokens.</p>
                </div>
                <div className="space-y-4">
                  {([
                    { key: "reasoning", label: "Reasoning Evolution", desc: "Requires step-by-step reasoning to answer" },
                    { key: "multiContext", label: "Multi-Context", desc: "Spans multiple source chunks or document sections" },
                    { key: "hypothetical", label: "Hypothetical Scenarios", desc: "What-if and counterfactual questions" },
                    { key: "comparative", label: "Comparative Analysis", desc: "Requires comparing two or more concepts" },
                  ] as const).map(({ key, label, desc }) => (
                    <Card key={key} className={`transition-colors ${evolution[key] ? "border-primary/30 bg-primary/5" : ""}`}>
                      <CardContent className="flex items-center justify-between p-4">
                        <div>
                          <p className="text-sm font-medium">{label}</p>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </div>
                        <Switch
                          checked={evolution[key]}
                          onCheckedChange={v => setEvolution(prev => ({ ...prev, [key]: v }))}
                          data-testid={`switch-evolution-${key}`}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {Object.values(evolution).some(Boolean) && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-md px-3 py-2 border border-amber-500/20">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {Object.values(evolution).filter(Boolean).length} evolution strategies selected. Each adds complexity and token cost.
                  </div>
                )}
              </div>
            )}

            {/* ── Step 3: Style ── */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold mb-1">Input Style</h2>
                  <p className="text-sm text-muted-foreground">Choose how user queries are phrased in generated goldens.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {STYLE_OPTIONS.map(s => (
                    <Card
                      key={s.value}
                      className={`cursor-pointer transition-colors ${style === s.value ? "border-primary bg-primary/5" : "hover:border-primary/30"}`}
                      onClick={() => setStyle(s.value)}
                      data-testid={`card-style-${s.value}`}
                    >
                      <CardContent className="p-4 flex items-start gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center ${style === s.value ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                          {style === s.value && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{s.label}</p>
                          <p className="text-xs text-muted-foreground">{s.desc}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card className="bg-muted/30">
                  <CardContent className="p-4 space-y-3">
                    <p className="text-xs font-medium">Ready to synthesize</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Count:</span><span className="font-medium">{goldenCount}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Style:</span><span className="font-medium capitalize">{style}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Model:</span><span className="font-medium">{SYNTH_MODELS.find(m => m.value === synModel)?.label.split(" ")[1] || synModel}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Evolution:</span><span className="font-medium">{Object.values(evolution).filter(Boolean).length} strategies</span></div>
                    </div>
                    {jobStatus === "running" && (
                      <div className="space-y-2">
                        <Progress value={progress} className="h-2" />
                        <p className="text-xs text-muted-foreground text-center">Synthesizing... {progress}%</p>
                      </div>
                    )}
                    {jobStatus === "failed" && (
                      <div className="text-xs text-destructive flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Synthesis failed. Click Generate to retry.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Step 4: Review ── */}
            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold mb-1">Review Generated Goldens</h2>
                  <p className="text-sm text-muted-foreground">Accept, edit, or reject each generated golden before saving.</p>
                </div>

                {/* Degraded-synthesis warning banner */}
                {synthDegraded && synthWarnings.length > 0 && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-1">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-medium">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Some goldens could not be generated — manual review required
                    </div>
                    <ul className="ml-6 list-disc space-y-0.5">
                      {synthWarnings.map((w, i) => (
                        <li key={i} className="text-xs text-amber-600 dark:text-amber-500">{w}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground ml-6">Low-fidelity items are marked and start as "Pending" — edit or reject them before saving.</p>
                  </div>
                )}

                {/* Summary banner */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Accepted", value: accepted, color: "text-emerald-600" },
                    { label: "Rejected", value: rejected, color: "text-red-600" },
                    { label: "Pending", value: pending, color: "text-amber-600" },
                    { label: "Avg Quality", value: avgQuality.toFixed(2), color: "text-primary" },
                  ].map(s => (
                    <Card key={s.label}>
                      <CardContent className="p-3 text-center">
                        <div className={`text-lg font-bold ${s.color}`} data-testid={`stat-${s.label.toLowerCase()}`}>{s.value}</div>
                        <div className="text-[10px] text-muted-foreground">{s.label}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Golden table */}
                <div className="divide-y border rounded-lg overflow-hidden">
                  {pagedGoldens.map((g) => {
                    const status = goldenStatuses[g.id] ?? "pending";
                    return (
                      <div
                        key={g.id}
                        className={`p-4 transition-colors ${status === "rejected" ? "bg-muted/30 opacity-50" : status === "edited" ? "bg-blue-500/5" : "hover:bg-muted/20"}`}
                        data-testid={`golden-row-${g.id}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={`text-[10px] ${TYPE_BADGE[g.type] || ""}`}>{g.type.replace("_", " ")}</Badge>
                              {g.evolved && <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/20">evolved</Badge>}
                              {(g as any).lowFidelity && (
                                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                                  ⚠ low-fidelity
                                </Badge>
                              )}
                              {!(g as any).lowFidelity && <span className="text-[10px] text-muted-foreground">Q: {g.qualityScore.toFixed(2)}</span>}
                              {status === "edited" && <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">edited</Badge>}
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Input</p>
                              <p className="text-sm">{g.input}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expected Output</p>
                              <p className="text-xs text-muted-foreground line-clamp-2">{g.expectedOutput}</p>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                              onClick={() => setGoldenStatuses(p => ({ ...p, [g.id]: "accepted" }))}
                              title="Accept"
                              data-testid={`button-accept-${g.id}`}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 hover:bg-blue-500/10"
                              onClick={() => startEdit(g)}
                              title="Edit"
                              data-testid={`button-edit-${g.id}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-500/10"
                              onClick={() => setGoldenStatuses(p => ({ ...p, [g.id]: "rejected" }))}
                              title="Reject"
                              data-testid={`button-reject-${g.id}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3">
                    <Button variant="outline" size="sm" disabled={reviewPage === 0} onClick={() => setReviewPage(p => p - 1)} data-testid="button-prev-page">
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground">{reviewPage + 1} / {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={reviewPage >= totalPages - 1} onClick={() => setReviewPage(p => p + 1)} data-testid="button-next-page">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 5: Save ── */}
            {step === 5 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold mb-1">Save to Dataset</h2>
                  <p className="text-sm text-muted-foreground">Write {accepted} accepted goldens to an evaluation dataset.</p>
                </div>

                <div className="flex gap-2">
                  <Button variant={saveMode === "existing" ? "default" : "outline"} size="sm" onClick={() => setSaveMode("existing")} data-testid="tab-save-existing">
                    Existing dataset
                  </Button>
                  <Button variant={saveMode === "new" ? "default" : "outline"} size="sm" onClick={() => setSaveMode("new")} data-testid="tab-save-new">
                    New dataset
                  </Button>
                </div>

                {saveMode === "existing" ? (
                  <div className="space-y-2">
                    <Label>Select dataset</Label>
                    <Select value={datasetId} onValueChange={setDatasetId}>
                      <SelectTrigger data-testid="select-dataset">
                        <SelectValue placeholder="Choose a dataset..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(datasets || []).map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>New dataset name</Label>
                    <Input
                      value={newDatasetName}
                      onChange={e => setNewDatasetName(e.target.value)}
                      placeholder="e.g., Customer Support Goldens v1"
                      data-testid="input-new-dataset-name"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Version label</Label>
                  <Input value={versionLabel} onChange={e => setVersionLabel(e.target.value)} placeholder="v1.0" data-testid="input-version-label" />
                </div>

                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Include provenance metadata</p>
                      <p className="text-xs text-muted-foreground">Store source, model, style, and quality score per golden</p>
                    </div>
                    <Switch checked={withProvenance} onCheckedChange={setWithProvenance} data-testid="switch-provenance" />
                  </CardContent>
                </Card>

                <div className="rounded-lg border p-4 space-y-2 text-sm">
                  <p className="font-medium">Summary</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span className="text-muted-foreground">Goldens to save:</span><span className="font-medium">{accepted}</span>
                    <span className="text-muted-foreground">Rejected:</span><span className="font-medium text-red-600">{rejected}</span>
                    <span className="text-muted-foreground">With provenance:</span><span className="font-medium">{withProvenance ? "Yes" : "No"}</span>
                  </div>
                </div>

                <Button className="w-full" onClick={handleSave} disabled={isSaving} data-testid="button-save-goldens">
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  {isSaving ? "Saving..." : `Save ${accepted} Goldens`}
                </Button>
              </div>
            )}

            {/* Nav buttons */}
            <div className="flex justify-between pt-4">
              <Button variant="outline" disabled={step === 0} onClick={() => setStep(s => s - 1)} data-testid="button-wizard-back">
                <ChevronLeft className="w-4 h-4 mr-1.5" />
                Back
              </Button>
              {step < 4 && (
                <Button
                  onClick={handleNext}
                  disabled={!canProceedFromStep() || jobStatus === "running"}
                  data-testid="button-wizard-next"
                >
                  {step === 3 && jobStatus === "idle" ? (
                    <><Play className="w-4 h-4 mr-1.5" />Generate</>
                  ) : step === 3 && jobStatus === "running" ? (
                    <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Synthesizing...</>
                  ) : (
                    <>Next<ArrowRight className="w-4 h-4 ml-1.5" /></>
                  )}
                </Button>
              )}
              {step === 4 && (
                <Button onClick={() => setStep(5)} data-testid="button-proceed-save">
                  Proceed to Save
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* ── Right: Progress Panel ── */}
        <div className="w-72 border-l bg-muted/20 flex flex-col">
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-primary" />
              Synthesis Progress
            </h3>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              {stages.map((stage) => (
                <div key={stage.id} className="flex items-center gap-3" data-testid={`stage-${stage.id}`}>
                  <div className="shrink-0">
                    {stage.status === "done" ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : stage.status === "active" ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <span className={`text-xs ${stage.status === "active" ? "text-primary font-medium" : stage.status === "done" ? "text-foreground" : "text-muted-foreground"}`}>
                    {stage.label}
                  </span>
                </div>
              ))}
            </div>

            {jobStatus === "running" && (
              <div className="mt-4 space-y-2">
                <Progress value={progress} className="h-1.5" />
                <p className="text-xs text-muted-foreground text-center">{progress}%</p>
              </div>
            )}

            {jobStatus === "completed" && (
              <div className="mt-4 rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 space-y-1">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Synthesis complete</p>
                <p className="text-xs text-muted-foreground">{generatedGoldens.length} goldens generated</p>
              </div>
            )}

            {jobStatus === "idle" && (
              <div className="mt-4 rounded-md border border-dashed p-3">
                <p className="text-xs text-muted-foreground">Configure settings and click Generate to start synthesis.</p>
              </div>
            )}

            {step >= 4 && generatedGoldens.length > 0 && (
              <div className="mt-4 space-y-2">
                <Separator />
                <p className="text-xs font-medium mt-2">Quality Distribution</p>
                {["happy_path", "variation", "edge_case", "adversarial"].map(t => {
                  const count = generatedGoldens.filter(g => g.type === t).length;
                  if (!count) return null;
                  return (
                    <div key={t} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground capitalize">{t.replace("_", " ")}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editingGolden} onOpenChange={open => !open && setEditingGolden(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Golden</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Input</Label>
              <Textarea value={editDraft.input} onChange={e => setEditDraft(p => ({ ...p, input: e.target.value }))} className="min-h-[80px]" data-testid="input-edit-input" />
            </div>
            <div className="space-y-2">
              <Label>Expected Output</Label>
              <Textarea value={editDraft.expectedOutput} onChange={e => setEditDraft(p => ({ ...p, expectedOutput: e.target.value }))} className="min-h-[120px]" data-testid="input-edit-output" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditingGolden(null)}>Cancel</Button>
              <Button onClick={saveEdit} data-testid="button-save-edit">Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
