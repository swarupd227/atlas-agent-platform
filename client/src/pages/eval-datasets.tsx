import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Agent, EvalDataset, EvalGolden, EvalMetric } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Database,
  Plus,
  Upload,
  ArrowLeft,
  ChevronRight,
  FlaskConical,
  Bot,
  Tag,
  Search,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle,
  GitBranch,
  ChevronLeft,
  X,
  FileJson,
  FilePlus,
  RefreshCw,
  Download,
} from "lucide-react";
import { formatDate } from "@/components/shared-utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── PII detection ────────────────────────────────────────────────────────────

const PII_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "Email", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { name: "SSN", regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "Phone", regex: /\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/ },
  { name: "Credit Card", regex: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/ },
  { name: "IP Address", regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
];

function detectPii(text: string): string[] {
  return PII_PATTERNS.filter((p) => p.regex.test(text)).map((p) => p.name);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type ParseFormat = "json" | "jsonl" | "csv";

function parseCsvRow(row: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseImportFile(content: string, format: ParseFormat): Array<{ input: string; expectedOutput?: string; tags?: string[] }> {
  try {
    if (format === "json") {
      const raw = JSON.parse(content);
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr.map((r: Record<string, string>) => ({
        input: r.input ?? r.prompt ?? r.question ?? "",
        expectedOutput: r.expectedOutput ?? r.expected_output ?? r.answer ?? "",
        tags: [],
      })).filter((r) => r.input);
    }
    if (format === "jsonl") {
      return content
        .split("\n").map((l) => l.trim()).filter(Boolean)
        .map((line) => { try { return JSON.parse(line); } catch { return null; } })
        .filter(Boolean)
        .map((r: Record<string, string>) => ({
          input: r.input ?? r.prompt ?? "",
          expectedOutput: r.expectedOutput ?? r.expected_output ?? "",
          tags: [],
        }))
        .filter((r) => r.input);
    }
    if (format === "csv") {
      const lines = content.split("\n").filter((l) => l.trim());
      if (lines.length < 2) return [];
      const headers = parseCsvRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z_]/g, ""));
      const findCol = (candidates: string[]) => {
        for (const c of candidates) {
          const idx = headers.findIndex((h) => h.includes(c));
          if (idx !== -1) return idx;
        }
        return -1;
      };
      const inputIdx = findCol(["input", "prompt", "question"]);
      const outputIdx = findCol(["expectedoutput", "expected_output", "output", "answer"]);
      if (inputIdx === -1) return [];
      return lines.slice(1).map((line) => {
        const fields = parseCsvRow(line);
        return {
          input: fields[inputIdx] ?? "",
          expectedOutput: outputIdx !== -1 ? (fields[outputIdx] ?? "") : undefined,
          tags: [],
        };
      }).filter((r) => r.input);
    }
    return [];
  } catch {
    return [];
  }
}

// ── New Dataset Dialog ────────────────────────────────────────────────────────

interface NewDatasetDialogProps {
  open: boolean;
  onClose: () => void;
  agents: Agent[];
  onCreated: (ds: EvalDataset) => void;
}

function NewDatasetDialog({ open, onClose, agents, onCreated }: NewDatasetDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState<string>("__none__");
  const [tags, setTags] = useState("");
  const [isBaseline, setIsBaseline] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/eval/datasets", {
        name: name.trim(),
        description: description.trim() || undefined,
        agentId: agentId === "__none__" ? undefined : agentId,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        isBaseline,
      });
      return res.json();
    },
    onSuccess: (data: EvalDataset) => {
      qc.invalidateQueries({ queryKey: ["/api/eval/datasets"] });
      toast({ title: "Dataset created", description: data.name });
      onCreated(data);
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus className="w-4 h-4 text-primary" /> New Dataset
          </DialogTitle>
          <DialogDescription>Create an empty golden dataset to populate with test cases.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div>
            <Label className="text-xs mb-1.5 block">Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Invoice QA v1"
              data-testid="input-dataset-name"
            />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional description"
              data-testid="input-dataset-description"
            />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Agent (optional)</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger data-testid="select-dataset-agent">
                <SelectValue placeholder="Not tied to an agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Not tied to an agent</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Tags (comma-separated)</Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. finance, regression"
              data-testid="input-dataset-tags"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              className="rounded"
              checked={isBaseline}
              onChange={(e) => setIsBaseline(e.target.checked)}
              data-testid="checkbox-dataset-baseline"
            />
            Mark as baseline dataset
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!name.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
            data-testid="button-create-dataset"
          >
            {mutation.isPending ? "Creating..." : "Create Dataset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Golden Edit Sheet ────────────────────────────────────────────────────────

interface GoldenSheetProps {
  open: boolean;
  onClose: () => void;
  golden: EvalGolden | null;
  datasetId: string;
  onSaved: () => void;
}

function GoldenSheet({ open, onClose, golden, datasetId, onSaved }: GoldenSheetProps) {
  const isEdit = !!golden;
  const [input, setInput] = useState(golden?.input ?? "");
  const [expectedOutput, setExpectedOutput] = useState(golden?.expectedOutput ?? "");
  const [retrievalContext, setRetrievalContext] = useState<string[]>(golden?.retrievalContext ?? []);
  const [newCtx, setNewCtx] = useState("");
  const [tags, setTags] = useState<string[]>(golden?.tags ?? []);
  const [newTagInput, setNewTagInput] = useState("");
  const [author, setAuthor] = useState(golden?.author ?? "");
  const [expectedToolsStr, setExpectedToolsStr] = useState(
    golden?.expectedTools ? JSON.stringify(golden.expectedTools, null, 2) : ""
  );
  const [toolsJsonError, setToolsJsonError] = useState<string | null>(null);
  const [piiAcknowledged, setPiiAcknowledged] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  // Reset when golden changes (useEffect to avoid side effects in render phase)
  useEffect(() => {
    setInput(golden?.input ?? "");
    setExpectedOutput(golden?.expectedOutput ?? "");
    setRetrievalContext(golden?.retrievalContext ?? []);
    setTags(golden?.tags ?? []);
    setNewTagInput("");
    setAuthor(golden?.author ?? "");
    setExpectedToolsStr(golden?.expectedTools ? JSON.stringify(golden.expectedTools, null, 2) : "");
    setToolsJsonError(null);
    setPiiAcknowledged(false);
  }, [golden?.id]);

  const piiFields = useMemo(() => {
    const found: string[] = [];
    const inputPii = detectPii(input);
    const outPii = detectPii(expectedOutput);
    if (inputPii.length) found.push(`Input (${inputPii.join(", ")})`);
    if (outPii.length) found.push(`Expected Output (${outPii.join(", ")})`);
    return found;
  }, [input, expectedOutput]);

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,/g, "").trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setNewTagInput("");
  };

  const validateTools = (str: string) => {
    if (!str.trim()) { setToolsJsonError(null); return; }
    try { JSON.parse(str); setToolsJsonError(null); }
    catch (e: any) { setToolsJsonError(e.message); }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      let expectedTools: unknown = undefined;
      if (expectedToolsStr.trim()) {
        try { expectedTools = JSON.parse(expectedToolsStr); }
        catch { throw new Error("Expected Tools JSON is invalid"); }
      }
      const body = {
        input,
        expectedOutput: expectedOutput || undefined,
        retrievalContext,
        tags,
        author: author || undefined,
        expectedTools,
      };
      if (isEdit) {
        const res = await apiRequest("PUT", `/api/eval/goldens/${golden!.id}`, body);
        return res.json();
      } else {
        const res = await apiRequest("POST", `/api/eval/datasets/${datasetId}/goldens`, body);
        return res.json();
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/eval/datasets", datasetId, "goldens"] });
      qc.invalidateQueries({ queryKey: ["/api/eval/datasets"] });
      toast({ title: isEdit ? "Golden updated" : "Golden created" });
      onSaved();
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[540px] sm:w-[600px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            {isEdit ? <Edit2 className="w-4 h-4 text-primary" /> : <Plus className="w-4 h-4 text-primary" />}
            {isEdit ? "Edit Golden" : "New Golden"}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? "Update this golden test case." : "Add a new golden test case to this dataset."}
          </SheetDescription>
        </SheetHeader>

        {piiFields.length > 0 && (
          <div className="mb-4 p-3 rounded-md border border-amber-500/30 bg-amber-500/10 flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-600">Possible PII detected</p>
                <p className="text-xs text-amber-600/80 mt-0.5">
                  {piiFields.join(" · ")} — review before saving.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer ml-6">
              <input
                type="checkbox"
                className="rounded"
                checked={piiAcknowledged}
                onChange={(e) => setPiiAcknowledged(e.target.checked)}
                data-testid="checkbox-pii-acknowledge"
              />
              <span className="text-xs text-amber-600 font-medium">I acknowledge this data may contain PII</span>
            </label>
          </div>
        )}

        <div className="flex flex-col gap-5">
          <div>
            <Label className="text-xs mb-1.5 block font-medium">Input *</Label>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={5}
              placeholder="The input prompt or scenario sent to the agent."
              className="font-mono text-xs"
              data-testid="textarea-golden-input"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Supports Markdown for display in reports.</p>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block font-medium">Expected Output</Label>
            <Textarea
              value={expectedOutput}
              onChange={(e) => setExpectedOutput(e.target.value)}
              rows={4}
              placeholder="Ground truth / expected agent response."
              className="font-mono text-xs"
              data-testid="textarea-golden-expected"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Supports Markdown for display in reports.</p>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block font-medium flex items-center gap-1.5">
              <FileJson className="w-3.5 h-3.5" />
              Expected Tool Calls (JSON)
            </Label>
            <Textarea
              value={expectedToolsStr}
              onChange={(e) => { setExpectedToolsStr(e.target.value); setToolsJsonError(null); }}
              onBlur={(e) => validateTools(e.target.value)}
              rows={4}
              placeholder={`[\n  { "name": "search", "args": { "query": "…" } }\n]`}
              className={`font-mono text-xs ${toolsJsonError ? "border-red-500" : ""}`}
              data-testid="textarea-golden-tools"
            />
            {toolsJsonError ? (
              <p className="text-[10px] text-red-500 mt-1">{toolsJsonError}</p>
            ) : (
              <p className="text-[10px] text-muted-foreground mt-1">Array of tool call objects, or a single object. Leave blank if not applicable.</p>
            )}
          </div>

          <div>
            <Label className="text-xs mb-1.5 block font-medium">Retrieval Context</Label>
            <div className="flex gap-2 mb-2">
              <Input
                value={newCtx}
                onChange={(e) => setNewCtx(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCtx.trim()) {
                    setRetrievalContext((c) => [...c, newCtx.trim()]);
                    setNewCtx("");
                    e.preventDefault();
                  }
                }}
                placeholder="Add context chunk, press Enter"
                className="text-xs"
                data-testid="input-golden-context"
              />
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={!newCtx.trim()}
                onClick={() => { setRetrievalContext((c) => [...c, newCtx.trim()]); setNewCtx(""); }}
                data-testid="button-add-context"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            {retrievalContext.length > 0 && (
              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                {retrievalContext.map((ctx, i) => (
                  <div key={i} className="flex items-start gap-1 rounded border bg-muted/40 px-2 py-1.5 text-xs group">
                    <span className="flex-1 font-mono truncate">{ctx}</span>
                    <button
                      type="button"
                      onClick={() => setRetrievalContext((c) => c.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs mb-1.5 block font-medium">Tags</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-medium">
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                    className="hover:text-destructive transition-colors"
                    data-testid={`button-remove-tag-${t}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <Input
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === ",") && newTagInput.trim()) {
                  e.preventDefault();
                  addTag(newTagInput);
                }
              }}
              onBlur={() => { if (newTagInput.trim()) addTag(newTagInput); }}
              placeholder="Type a tag and press Enter or comma"
              className="text-xs"
              data-testid="input-golden-tags"
            />
          </div>

          <div>
            <Label className="text-xs mb-1.5 block font-medium">Author</Label>
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Your name or identifier"
              data-testid="input-golden-author"
            />
          </div>
        </div>

        <SheetFooter className="mt-6 flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-cancel-golden">Cancel</Button>
          <Button
            size="sm"
            disabled={!input.trim() || mutation.isPending || !!toolsJsonError || (piiFields.length > 0 && !piiAcknowledged)}
            onClick={() => mutation.mutate()}
            data-testid="button-save-golden"
            title={piiFields.length > 0 && !piiAcknowledged ? "Acknowledge PII detection above before saving" : undefined}
          >
            {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Golden"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Version Diff Dialog ───────────────────────────────────────────────────────

interface VersionDiffDialogProps {
  open: boolean;
  onClose: () => void;
  currentDataset: EvalDataset;
  siblings: EvalDataset[];
}

type DiffRow = { status: "added" | "removed" | "changed" | "unchanged"; input: string; currentOut?: string | null; baselineOut?: string | null };

function VersionDiffDialog({ open, onClose, currentDataset, siblings }: VersionDiffDialogProps) {
  const otherSiblings = siblings.filter((s) => s.id !== currentDataset.id);
  const [compareId, setCompareId] = useState<string>(otherSiblings[0]?.id ?? "");

  useEffect(() => {
    if (!compareId && otherSiblings.length > 0) setCompareId(otherSiblings[0].id);
  }, [otherSiblings.length]);

  const { data: currentGoldens } = useQuery<EvalGolden[]>({
    queryKey: ["/api/eval/datasets", currentDataset.id, "goldens", 1, 1000, ""],
    queryFn: async () => {
      const res = await fetch(`/api/eval/datasets/${currentDataset.id}/goldens?limit=1000`);
      return res.json();
    },
    enabled: open,
  });

  const { data: compareGoldens } = useQuery<EvalGolden[]>({
    queryKey: ["/api/eval/datasets", compareId, "goldens", 1, 1000, ""],
    queryFn: async () => {
      if (!compareId) return [];
      const res = await fetch(`/api/eval/datasets/${compareId}/goldens?limit=1000`);
      return res.json();
    },
    enabled: open && !!compareId,
  });

  const diffRows: DiffRow[] = useMemo(() => {
    if (!currentGoldens || !compareGoldens) return [];
    const baseMap = new Map<string, EvalGolden>();
    for (const g of compareGoldens) baseMap.set(g.input, g);
    const curMap = new Map<string, EvalGolden>();
    for (const g of currentGoldens) curMap.set(g.input, g);

    const rows: DiffRow[] = [];
    for (const g of currentGoldens) {
      const base = baseMap.get(g.input);
      if (!base) {
        rows.push({ status: "added", input: g.input, currentOut: g.expectedOutput });
      } else if (base.expectedOutput !== g.expectedOutput) {
        rows.push({ status: "changed", input: g.input, currentOut: g.expectedOutput, baselineOut: base.expectedOutput });
      } else {
        rows.push({ status: "unchanged", input: g.input, currentOut: g.expectedOutput });
      }
    }
    for (const g of compareGoldens) {
      if (!curMap.has(g.input)) {
        rows.push({ status: "removed", input: g.input, baselineOut: g.expectedOutput });
      }
    }
    rows.sort((a, b) => {
      const order = { added: 0, changed: 1, removed: 2, unchanged: 3 };
      return order[a.status] - order[b.status];
    });
    return rows;
  }, [currentGoldens, compareGoldens]);

  const summary = useMemo(() => ({
    added: diffRows.filter((r) => r.status === "added").length,
    removed: diffRows.filter((r) => r.status === "removed").length,
    changed: diffRows.filter((r) => r.status === "changed").length,
    unchanged: diffRows.filter((r) => r.status === "unchanged").length,
  }), [diffRows]);

  const compareDataset = siblings.find((s) => s.id === compareId);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />
            Version Diff — {currentDataset.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 pb-2">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
              v{currentDataset.version ?? 1} (current)
            </Badge>
            <span className="text-muted-foreground">vs</span>
            <Select value={compareId} onValueChange={setCompareId}>
              <SelectTrigger className="h-7 w-32 text-xs" data-testid="select-diff-compare">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {otherSiblings.map((s) => (
                  <SelectItem key={s.id} value={s.id}>v{s.version ?? 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 ml-auto text-[10px]">
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">+{summary.added} added</span>
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">~{summary.changed} changed</span>
            <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-600 font-medium">−{summary.removed} removed</span>
            <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground">{summary.unchanged} unchanged</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto rounded border">
          {!currentGoldens || !compareGoldens ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-xs text-muted-foreground">Loading goldens…</div>
            </div>
          ) : diffRows.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-xs text-muted-foreground">No goldens to compare.</div>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b">
                <tr>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium w-16">Status</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium min-w-[200px]">Input</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium min-w-[180px]">
                    v{currentDataset.version ?? 1} Expected Output
                  </th>
                  {summary.changed > 0 && (
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium min-w-[180px]">
                      v{compareDataset?.version ?? "?"} Expected Output
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {diffRows.filter((r) => r.status !== "unchanged").map((row, i) => {
                  const rowCls = row.status === "added"
                    ? "bg-emerald-500/5 border-l-2 border-emerald-500/40"
                    : row.status === "removed"
                    ? "bg-red-500/5 border-l-2 border-red-500/40"
                    : row.status === "changed"
                    ? "bg-amber-500/5 border-l-2 border-amber-500/40"
                    : "";
                  const statusBadge = row.status === "added"
                    ? <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">+Added</span>
                    : row.status === "removed"
                    ? <span className="text-[9px] font-semibold text-red-600 bg-red-500/10 px-1.5 py-0.5 rounded">−Removed</span>
                    : <span className="text-[9px] font-semibold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">~Changed</span>;
                  return (
                    <tr key={i} className={rowCls}>
                      <td className="px-3 py-2">{statusBadge}</td>
                      <td className="px-3 py-2 max-w-[200px]">
                        <span className="font-mono line-clamp-3 text-[11px]">{row.input}</span>
                      </td>
                      <td className="px-3 py-2 max-w-[180px]">
                        <span className="font-mono line-clamp-3 text-[11px] text-muted-foreground">{row.currentOut ?? "—"}</span>
                      </td>
                      {summary.changed > 0 && (
                        <td className="px-3 py-2 max-w-[180px]">
                          {row.status === "changed" && (
                            <span className="font-mono line-clamp-3 text-[11px] text-muted-foreground line-through opacity-60">{row.baselineOut ?? "—"}</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {summary.unchanged > 0 && (
                  <tr className="bg-muted/10">
                    <td colSpan={4} className="px-3 py-2 text-[10px] text-muted-foreground italic text-center">
                      {summary.unchanged} unchanged row{summary.unchanged !== 1 ? "s" : ""} hidden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose} data-testid="button-close-diff">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk-tag Dialog ───────────────────────────────────────────────────────────

interface BulkTagDialogProps {
  open: boolean;
  onClose: () => void;
  datasetId: string;
  onTagged: () => void;
}

function BulkTagDialog({ open, onClose, datasetId, onTagged }: BulkTagDialogProps) {
  const [tagInput, setTagInput] = useState("");
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [mode, setMode] = useState<"add" | "replace">("add");
  const { toast } = useToast();

  useEffect(() => {
    if (!open) { setTagInput(""); setPendingTags([]); setMode("add"); }
  }, [open]);

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,/g, "").trim();
    if (t && !pendingTags.includes(t)) setPendingTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/eval/datasets/${datasetId}/goldens/bulk-tag`, { tags: pendingTags, mode });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (data: { updated: number }) => {
      toast({ title: `Bulk-tag applied`, description: `${data.updated} golden${data.updated !== 1 ? "s" : ""} updated.` });
      onTagged();
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary" /> Bulk-tag Goldens
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div>
            <Label className="text-xs mb-1.5 block font-medium">Tags to apply</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {pendingTags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-medium">
                  {t}
                  <button
                    type="button"
                    onClick={() => setPendingTags((prev) => prev.filter((x) => x !== t))}
                    className="hover:text-destructive"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
              placeholder="Type a tag and press Enter"
              className="text-xs"
              data-testid="input-bulk-tag"
            />
          </div>

          <div>
            <Label className="text-xs mb-1.5 block font-medium">Apply mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "add" | "replace")}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-bulk-tag-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add">Merge with existing tags</SelectItem>
                <SelectItem value="replace">Replace existing tags</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            This will update <strong>all goldens</strong> in this dataset. The operation cannot be undone.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={pendingTags.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
            data-testid="button-apply-bulk-tag"
          >
            {mutation.isPending ? "Applying…" : `Apply to All Goldens`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Import Dialog ────────────────────────────────────────────────────────────

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  datasetId: string;
  onImported: () => void;
}

function ImportDialog({ open, onClose, datasetId, onImported }: ImportDialogProps) {
  const [preview, setPreview] = useState<Array<{ input: string; expectedOutput?: string }>>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const format: ParseFormat = file.name.endsWith(".json") ? "json" : file.name.endsWith(".csv") ? "csv" : "jsonl";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const parsed = parseImportFile(content, format);
      setPreview(parsed);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!preview.length) return;
    setImporting(true);
    try {
      const res = await apiRequest("POST", `/api/eval/datasets/${datasetId}/goldens/bulk`, {
        goldens: preview.map((g) => ({
          input: g.input,
          expectedOutput: g.expectedOutput || undefined,
          retrievalContext: [],
          tags: [],
        })),
      });
      if (!res.ok) throw new Error("Import failed");
      await qc.invalidateQueries({ queryKey: ["/api/eval/datasets", datasetId, "goldens"] });
      await qc.invalidateQueries({ queryKey: ["/api/eval/datasets"] });
      toast({ title: "Import complete", description: `${preview.length} goldens imported` });
      onImported();
      onClose();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" /> Import Goldens
          </DialogTitle>
          <DialogDescription>
            Upload a <strong>.jsonl</strong>, <strong>.json</strong>, or <strong>.csv</strong> file. Each record must include an <code>input</code> field and optionally <code>expectedOutput</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            className="self-start"
            data-testid="button-choose-file"
          >
            <Upload className="w-4 h-4 mr-1.5" />
            {fileName || "Choose .jsonl, .json, or .csv file"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".jsonl,.json,.csv"
            className="hidden"
            onChange={handleFile}
          />
          {preview.length > 0 && (
            <div className="rounded-md border overflow-hidden">
              <div className="bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground font-medium">
                Preview · first 5 of {preview.length} records
              </div>
              <div className="max-h-52 overflow-y-auto divide-y">
                {preview.slice(0, 5).map((g, i) => (
                  <div key={i} className="px-3 py-2">
                    <p className="text-xs font-mono truncate text-foreground">{g.input}</p>
                    {g.expectedOutput && (
                      <p className="text-[10px] font-mono truncate text-muted-foreground mt-0.5">→ {g.expectedOutput}</p>
                    )}
                  </div>
                ))}
                {preview.length > 5 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">…and {preview.length - 5} more</div>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!preview.length || importing}
            onClick={handleImport}
            data-testid="button-import-goldens"
          >
            {importing ? "Importing..." : `Import ${preview.length} Goldens`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Fork Version Dialog ───────────────────────────────────────────────────────

interface ForkVersionDialogProps {
  open: boolean;
  onClose: () => void;
  dataset: EvalDataset;
  onForked: (ds: EvalDataset) => void;
}

function ForkVersionDialog({ open, onClose, dataset, onForked }: ForkVersionDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/eval/datasets/${dataset.id}/versions`, {});
      return res.json();
    },
    onSuccess: (data: EvalDataset) => {
      qc.invalidateQueries({ queryKey: ["/api/eval/datasets"] });
      toast({ title: "New version created", description: `${data.name} (v${data.version})` });
      onForked(data);
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" /> Fork as New Version
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will copy all {dataset.goldenCount ?? 0} goldens from <strong>{dataset.name}</strong> (v{dataset.version ?? 1}) into a new dataset at v{(dataset.version ?? 1) + 1}. The original dataset is unchanged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            data-testid="button-confirm-fork"
          >
            {mutation.isPending ? "Forking..." : "Fork Version"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function EvalDatasets() {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [dsSearch, setDsSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("__all__");
  const [goldenSearch, setGoldenSearch] = useState("");
  const [goldenPage, setGoldenPage] = useState(1);
  const [passFail, setPassFail] = useState<"all" | "pass" | "fail">("all");
  const [editGolden, setEditGolden] = useState<EvalGolden | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newDsOpen, setNewDsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [forkOpen, setForkOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [deleteGoldenId, setDeleteGoldenId] = useState<string | null>(null);

  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: datasets, isLoading: dsLoading } = useQuery<EvalDataset[]>({
    queryKey: ["/api/eval/datasets"],
  });

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of (agents ?? [])) m.set(a.id, a);
    return m;
  }, [agents]);

  const filteredDatasets = useMemo(() => {
    let ds = datasets ?? [];
    if (agentFilter !== "__all__") ds = ds.filter((d) => d.agentId === agentFilter);
    if (dsSearch.trim()) {
      const q = dsSearch.toLowerCase();
      ds = ds.filter((d) => d.name.toLowerCase().includes(q) || d.tags?.some((t) => t.toLowerCase().includes(q)));
    }
    return [...ds].sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }, [datasets, agentFilter, dsSearch]);

  const selectedDataset = useMemo(
    () => (selectedDatasetId ? (datasets ?? []).find((d) => d.id === selectedDatasetId) ?? null : null),
    [selectedDatasetId, datasets],
  );

  const goldenQueryKey = ["/api/eval/datasets", selectedDatasetId, "goldens", goldenPage, PAGE_SIZE, goldenSearch];
  const { data: goldensData, isLoading: goldensLoading } = useQuery<EvalGolden[]>({
    queryKey: goldenQueryKey,
    queryFn: async () => {
      if (!selectedDatasetId) return [];
      const params = new URLSearchParams({
        page: String(goldenPage),
        limit: String(PAGE_SIZE),
        ...(goldenSearch.trim() ? { search: goldenSearch.trim() } : {}),
      });
      const res = await fetch(`/api/eval/datasets/${selectedDatasetId}/goldens?${params}`);
      return res.json();
    },
    enabled: !!selectedDatasetId,
  });

  const goldens = useMemo(() => {
    const all = goldensData ?? [];
    if (passFail === "all") return all;
    return all.filter((g) => {
      if (g.lastScore == null) return false;
      const pass = g.lastScore >= 0.85;
      return passFail === "pass" ? pass : !pass;
    });
  }, [goldensData, passFail]);

  const versionSiblings = useMemo(() => {
    if (!selectedDataset) return [];
    return (datasets ?? [])
      .filter((d) => d.name === selectedDataset.name && d.agentId === selectedDataset.agentId)
      .sort((a, b) => (a.version ?? 1) - (b.version ?? 1));
  }, [datasets, selectedDataset]);

  const deleteMutation = useMutation({
    mutationFn: async (goldenId: string) => {
      const res = await apiRequest("DELETE", `/api/eval/goldens/${goldenId}`);
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/eval/datasets", selectedDatasetId, "goldens"] });
      qc.invalidateQueries({ queryKey: ["/api/eval/datasets"] });
      toast({ title: "Golden deleted" });
      setDeleteGoldenId(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const totalPages = selectedDataset ? Math.max(1, Math.ceil((selectedDataset.goldenCount ?? 0) / PAGE_SIZE)) : 1;

  const uniqueAgentIds = useMemo(() => {
    const ids = new Set((datasets ?? []).filter((d) => d.agentId).map((d) => d.agentId!));
    return [...ids];
  }, [datasets]);

  return (
    <div className="flex flex-col h-full p-6 gap-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/evals">
              <button className="hover:text-foreground transition-colors flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                Eval Studio
              </button>
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span>Datasets</span>
          </div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="heading-eval-datasets">
            <Database className="w-6 h-6 text-primary" />
            Golden Datasets
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage curated golden test cases for evaluation runs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/evals/runs">
            <Button variant="outline" size="sm" data-testid="button-nav-runs">
              <FlaskConical className="w-4 h-4 mr-1.5" />
              Eval Runs
            </Button>
          </Link>
          <Button size="sm" onClick={() => setNewDsOpen(true)} data-testid="button-new-dataset">
            <Plus className="w-4 h-4 mr-1.5" />
            New Dataset
          </Button>
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="flex flex-1 gap-4 min-h-0" style={{ minHeight: "calc(100vh - 200px)" }}>
        {/* Left rail — dataset list */}
        <div className="w-72 shrink-0 flex flex-col gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={dsSearch}
              onChange={(e) => setDsSearch(e.target.value)}
              placeholder="Search datasets..."
              className="pl-8 h-8 text-xs"
              data-testid="input-dataset-search"
            />
          </div>

          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-agent-filter">
              <Bot className="w-3 h-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All agents</SelectItem>
              {uniqueAgentIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {agentMap.get(id)?.name ?? id.slice(0, 12)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">
            {dsLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
            ) : filteredDatasets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <Database className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No datasets yet</p>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setNewDsOpen(true)} data-testid="button-empty-new-dataset">
                  <Plus className="w-3 h-3 mr-1" /> New Dataset
                </Button>
              </div>
            ) : (
              filteredDatasets.map((ds) => {
                const agent = ds.agentId ? agentMap.get(ds.agentId) : null;
                const isSelected = selectedDatasetId === ds.id;
                return (
                  <button
                    key={ds.id}
                    onClick={() => { setSelectedDatasetId(ds.id); setGoldenPage(1); setGoldenSearch(""); }}
                    className={`w-full text-left rounded-md border px-3 py-2.5 transition-colors text-xs hover:bg-muted/40 ${isSelected ? "border-primary/50 bg-primary/5" : "border-border"}`}
                    data-testid={`button-dataset-${ds.id}`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-medium truncate text-sm">{ds.name}</span>
                      <Badge variant="outline" className="text-[9px] shrink-0">v{ds.version ?? 1}</Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span>{ds.goldenCount ?? 0} goldens</span>
                      {ds.isBaseline && (
                        <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/20">baseline</Badge>
                      )}
                      {agent && (
                        <>
                          <span>·</span>
                          <Bot className="w-2.5 h-2.5" />
                          <span className="truncate max-w-[80px]">{agent.name}</span>
                        </>
                      )}
                    </div>
                    {(ds.tags ?? []).length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-1">
                        {(ds.tags ?? []).slice(0, 3).map((t) => (
                          <span key={t} className="bg-muted rounded px-1 py-0.5 text-[9px] text-muted-foreground">{t}</span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Center pane — goldens table */}
        {!selectedDataset ? (
          <Card className="flex-1 flex items-center justify-center">
            <CardContent className="text-center py-16">
              <Database className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">Select a dataset</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Choose a dataset from the left rail to view its golden test cases.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            {/* Dataset header */}
            <Card>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-semibold truncate">{selectedDataset.name}</h2>
                      {versionSiblings.length > 1 ? (
                        <Select
                          value={selectedDatasetId!}
                          onValueChange={(v) => { setSelectedDatasetId(v); setGoldenPage(1); setGoldenSearch(""); }}
                        >
                          <SelectTrigger className="h-6 w-20 text-[10px]" data-testid="select-dataset-version">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {versionSiblings.map((s) => (
                              <SelectItem key={s.id} value={s.id}>v{s.version ?? 1}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">v{selectedDataset.version ?? 1}</Badge>
                      )}
                      {selectedDataset.isBaseline && (
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">baseline</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{selectedDataset.goldenCount ?? 0} goldens</span>
                    </div>
                    {selectedDataset.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{selectedDataset.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {versionSiblings.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDiffOpen(true)}
                        data-testid="button-version-diff"
                      >
                        <Search className="w-3.5 h-3.5 mr-1.5" />
                        Compare Versions
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setForkOpen(true)}
                      data-testid="button-fork-version"
                    >
                      <GitBranch className="w-3.5 h-3.5 mr-1.5" />
                      Fork v{(selectedDataset.version ?? 1) + 1}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!goldens || goldens.length === 0) return;
                        const header = "id,input,expectedOutput,tags,lastScore,author,createdAt\n";
                        const rows = goldens.map(g =>
                          [g.id, JSON.stringify(g.input ?? ""), JSON.stringify(g.expectedOutput ?? ""), (g.tags ?? []).join("|"), g.lastScore ?? "", g.author ?? "", g.createdAt ? new Date(g.createdAt as unknown as string).toISOString() : ""].join(",")
                        ).join("\n");
                        const blob = new Blob([header + rows], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${selectedDataset?.name ?? "goldens"}-v${selectedDataset?.version ?? 1}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      disabled={!goldens || goldens.length === 0}
                      data-testid="button-export-goldens"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Export
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setImportOpen(true)}
                      data-testid="button-import"
                    >
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      Import
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => { setEditGolden(null); setSheetOpen(true); }}
                      data-testid="button-add-golden"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Add Golden
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={goldenSearch}
                  onChange={(e) => { setGoldenSearch(e.target.value); setGoldenPage(1); }}
                  placeholder="Search goldens..."
                  className="pl-8 h-8 text-xs"
                  data-testid="input-golden-search"
                />
              </div>
              <Select value={passFail} onValueChange={(v) => setPassFail(v as "all" | "pass" | "fail")}>
                <SelectTrigger className="h-8 w-28 text-xs" data-testid="select-passfail-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pass">Passed</SelectItem>
                  <SelectItem value="fail">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setBulkTagOpen(true)}
                data-testid="button-bulk-tag"
              >
                <Tag className="w-3.5 h-3.5 mr-1.5" />
                Bulk-tag
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => qc.invalidateQueries({ queryKey: ["/api/eval/datasets", selectedDatasetId, "goldens"] })}
                data-testid="button-refresh-goldens"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Goldens table */}
            <Card className="flex-1 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-8">#</th>
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium min-w-[220px]">Input</th>
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium min-w-[160px]">Expected Output</th>
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-28">Tags</th>
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-20">Last Score</th>
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-24">Author</th>
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-32">Last Updated</th>
                      <th className="w-16 px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {goldensLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>
                          <td colSpan={7} className="px-4 py-2">
                            <Skeleton className="h-8 w-full" />
                          </td>
                        </tr>
                      ))
                    ) : goldens.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                            <FileJson className="w-10 h-10 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground font-medium">No goldens yet</p>
                            <p className="text-xs text-muted-foreground/70">
                              Add goldens manually or import a JSONL / JSON file.
                            </p>
                            <div className="flex gap-2 mt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setEditGolden(null); setSheetOpen(true); }}
                                data-testid="button-empty-add-golden"
                              >
                                <Plus className="w-3.5 h-3.5 mr-1" /> Add Golden
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} data-testid="button-empty-import">
                                <Upload className="w-3.5 h-3.5 mr-1" /> Import File
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      goldens.map((g, idx) => {
                        const rowIdx = (goldenPage - 1) * PAGE_SIZE + idx + 1;
                        const inputPii = detectPii(g.input);
                        const hasPii = inputPii.length > 0 || detectPii(g.expectedOutput ?? "").length > 0;
                        return (
                          <tr
                            key={g.id}
                            className="hover:bg-muted/20 transition-colors group cursor-pointer"
                            onClick={() => { setEditGolden(g); setSheetOpen(true); }}
                            data-testid={`row-golden-${g.id}`}
                          >
                            <td className="px-4 py-2.5 text-muted-foreground">{rowIdx}</td>
                            <td className="px-4 py-2.5 max-w-[220px]">
                              <div className="flex items-start gap-1.5">
                                {hasPii && (
                                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" title="Possible PII" />
                                )}
                                <span className="font-mono line-clamp-2 text-[11px] leading-relaxed">{g.input}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 max-w-[160px]">
                              <span className="font-mono line-clamp-2 text-[11px] text-muted-foreground leading-relaxed">
                                {g.expectedOutput ?? <span className="italic text-muted-foreground/50">—</span>}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex gap-1 flex-wrap">
                                {(g.tags ?? []).slice(0, 2).map((t) => (
                                  <span key={t} className="bg-muted rounded px-1.5 py-0.5 text-[10px] text-muted-foreground">{t}</span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              {g.lastScore != null ? (
                                <span className={`font-semibold ${g.lastScore >= 0.85 ? "text-emerald-600" : g.lastScore >= 0.7 ? "text-amber-600" : "text-red-600"}`}>
                                  {(g.lastScore * 100).toFixed(0)}%
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground text-[11px] whitespace-nowrap">
                              {g.author ?? <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                              {g.updatedAt ? formatDate(g.updatedAt) : formatDate(g.createdAt)}
                            </td>
                            <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditGolden(g); setSheetOpen(true); }}
                                  className="p-1 hover:bg-muted rounded"
                                  title="Edit"
                                  data-testid={`button-edit-golden-${g.id}`}
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteGoldenId(g.id); }}
                                  className="p-1 hover:bg-destructive/10 rounded"
                                  title="Delete"
                                  data-testid={`button-delete-golden-${g.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/20">
                  <span className="text-xs text-muted-foreground">
                    Page {goldenPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      disabled={goldenPage <= 1}
                      onClick={() => setGoldenPage((p) => p - 1)}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      disabled={goldenPage >= totalPages}
                      onClick={() => setGoldenPage((p) => p + 1)}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Dialogs & Sheets */}
      <NewDatasetDialog
        open={newDsOpen}
        onClose={() => setNewDsOpen(false)}
        agents={agents ?? []}
        onCreated={(ds) => setSelectedDatasetId(ds.id)}
      />
      {selectedDatasetId && (
        <>
          <GoldenSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            golden={editGolden}
            datasetId={selectedDatasetId}
            onSaved={() => {}}
          />
          <ImportDialog
            open={importOpen}
            onClose={() => setImportOpen(false)}
            datasetId={selectedDatasetId}
            onImported={() => {}}
          />
          {selectedDataset && (
            <>
              <ForkVersionDialog
                open={forkOpen}
                onClose={() => setForkOpen(false)}
                dataset={selectedDataset}
                onForked={(ds) => setSelectedDatasetId(ds.id)}
              />
              {versionSiblings.length > 1 && (
                <VersionDiffDialog
                  open={diffOpen}
                  onClose={() => setDiffOpen(false)}
                  currentDataset={selectedDataset}
                  siblings={versionSiblings}
                />
              )}
              <BulkTagDialog
                open={bulkTagOpen}
                onClose={() => setBulkTagOpen(false)}
                datasetId={selectedDatasetId}
                onTagged={() => qc.invalidateQueries({ queryKey: ["/api/eval/datasets", selectedDatasetId, "goldens"] })}
              />
            </>
          )}
        </>
      )}

      {/* Delete golden confirm */}
      <AlertDialog open={!!deleteGoldenId} onOpenChange={(v) => !v && setDeleteGoldenId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Golden?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this golden test case. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteGoldenId && deleteMutation.mutate(deleteGoldenId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-golden"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
