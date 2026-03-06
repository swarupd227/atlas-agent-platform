import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import type { GoldenDataset, GoldenTestCase, GoldenDataRecord } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Database, Sparkles, Wand2, Plus, Search, Target, Layers, Tag, ChevronDown, ChevronRight, Loader2, Trash2, Edit, Zap, CheckCircle, FileJson, Upload, BarChart3, Gauge, Clock, Activity } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

const difficultyColors: Record<string, string> = {
  routine: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20",
  complex: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  edge_case: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20",
  adversarial: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
};

const categoryColors: Record<string, string> = {
  happy_path: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20",
  edge_case: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  adversarial: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",
  compliance_critical: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
};

const difficultyLabels: Record<string, string> = {
  routine: "Routine",
  complex: "Complex",
  edge_case: "Edge Case",
  adversarial: "Adversarial",
};

const categoryLabels: Record<string, string> = {
  happy_path: "Happy Path",
  edge_case: "Edge Case",
  adversarial: "Adversarial",
  compliance_critical: "Compliance Critical",
};

const dataCategoryColors: Record<string, string> = {
  general: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20",
  completeness: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  deduplication: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  urgency_classification: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  latency_benchmark: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20",
  throughput: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  accuracy: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20",
};

const benchmarkTypeIcons: Record<string, typeof Clock> = {
  latency: Clock,
  throughput: Activity,
  accuracy: Target,
  detection: CheckCircle,
  custom: Gauge,
};

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function jsonPreview(obj: any, maxLength = 120): string {
  try {
    const str = JSON.stringify(obj, null, 0);
    return truncate(str, maxLength);
  } catch { return "{}"; }
}

function DataRecordsTab({ dataset, id }: { dataset: GoldenDataset; id: string }) {
  const { toast } = useToast();
  const [dataCategoryFilter, setDataCategoryFilter] = useState("all");
  const [dataSearchQuery, setDataSearchQuery] = useState("");
  const [expandedRecordIds, setExpandedRecordIds] = useState<Set<string>>(new Set());
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [aiGenerateOpen, setAiGenerateOpen] = useState(false);
  const [newRecordCategory, setNewRecordCategory] = useState("general");
  const [newRecordInput, setNewRecordInput] = useState("{}");
  const [newRecordExpected, setNewRecordExpected] = useState("{}");
  const [newRecordMetadata, setNewRecordMetadata] = useState("{}");
  const [newRecordTags, setNewRecordTags] = useState("");
  const [bulkJson, setBulkJson] = useState("");
  const [aiCategory, setAiCategory] = useState("completeness");
  const [aiCount, setAiCount] = useState(10);
  const [aiDescription, setAiDescription] = useState("");

  const { data: dataRecords = [], isLoading: recordsLoading } = useQuery<GoldenDataRecord[]>({
    queryKey: ["/api/golden-datasets", id, "data-records"],
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets", id, "data-records"] });
    queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets"] });
  };

  const addRecordMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/golden-datasets/${id}/data-records`, data),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Data record added" });
      setAddRecordOpen(false);
      setNewRecordInput("{}");
      setNewRecordExpected("{}");
      setNewRecordMetadata("{}");
      setNewRecordTags("");
    },
    onError: (e: Error) => toast({ title: "Failed to add record", description: e.message, variant: "destructive" }),
  });

  const bulkImportMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/golden-datasets/${id}/data-records/bulk`, data),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Records imported" });
      setBulkImportOpen(false);
      setBulkJson("");
    },
    onError: (e: Error) => toast({ title: "Bulk import failed", description: e.message, variant: "destructive" }),
  });

  const aiGenerateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ai/generate-data-records", data),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Data records generated" });
      setAiGenerateOpen(false);
    },
    onError: (e: Error) => toast({ title: "AI generation failed", description: e.message, variant: "destructive" }),
  });

  const deleteRecordMutation = useMutation({
    mutationFn: (recordId: string) => apiRequest("DELETE", `/api/golden-data-records/${recordId}`),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Record deleted" });
    },
  });

  const uniqueCategories = useMemo(() => {
    const cats = new Set(dataRecords.map(r => r.category));
    return Array.from(cats).sort();
  }, [dataRecords]);

  const filteredRecords = useMemo(() => {
    return dataRecords.filter((r) => {
      if (dataCategoryFilter !== "all" && r.category !== dataCategoryFilter) return false;
      if (dataSearchQuery) {
        const q = dataSearchQuery.toLowerCase();
        const inputStr = JSON.stringify(r.inputData).toLowerCase();
        const outputStr = JSON.stringify(r.expectedOutput).toLowerCase();
        if (!inputStr.includes(q) && !outputStr.includes(q) && !r.category.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [dataRecords, dataCategoryFilter, dataSearchQuery]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    dataRecords.forEach(r => { stats[r.category] = (stats[r.category] || 0) + 1; });
    return stats;
  }, [dataRecords]);

  const toggleRecordExpand = (rid: string) => {
    setExpandedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(rid)) next.delete(rid); else next.add(rid);
      return next;
    });
  };

  if (recordsLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Dialog open={aiGenerateOpen} onOpenChange={setAiGenerateOpen}>
          <DialogTrigger asChild>
            <Button variant="default" data-testid="button-ai-generate-records">
              <Sparkles className="w-4 h-4 mr-1.5" />
              AI Generate Records
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>AI Generate Data Records</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex flex-col gap-2">
                <Label>Category</Label>
                <Input value={aiCategory} onChange={(e) => setAiCategory(e.target.value)} placeholder="e.g. completeness, deduplication" data-testid="input-ai-category" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Count (1-50)</Label>
                <Input type="number" min={1} max={50} value={aiCount} onChange={(e) => setAiCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} data-testid="input-ai-count" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Description (optional)</Label>
                <Textarea value={aiDescription} onChange={(e) => setAiDescription(e.target.value)} placeholder="Describe what these records should test..." rows={3} data-testid="input-ai-description" />
              </div>
              <Button
                disabled={aiGenerateMutation.isPending || !aiCategory.trim()}
                onClick={() => aiGenerateMutation.mutate({ datasetId: id, category: aiCategory, count: aiCount, description: aiDescription, industry: dataset.industry, useCase: dataset.useCase })}
                data-testid="button-ai-generate-submit"
              >
                {aiGenerateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Generating...</> : <><Sparkles className="w-4 h-4 mr-1.5" />Generate</>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={addRecordOpen} onOpenChange={setAddRecordOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" data-testid="button-add-record">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Record
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Data Record</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex flex-col gap-2">
                <Label>Category</Label>
                <Input value={newRecordCategory} onChange={(e) => setNewRecordCategory(e.target.value)} placeholder="e.g. completeness" data-testid="input-record-category" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Input Data (JSON)</Label>
                <Textarea value={newRecordInput} onChange={(e) => setNewRecordInput(e.target.value)} rows={4} className="font-mono text-xs" data-testid="input-record-input" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Expected Output (JSON)</Label>
                <Textarea value={newRecordExpected} onChange={(e) => setNewRecordExpected(e.target.value)} rows={4} className="font-mono text-xs" data-testid="input-record-expected" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Metadata (JSON, optional)</Label>
                <Textarea value={newRecordMetadata} onChange={(e) => setNewRecordMetadata(e.target.value)} rows={2} className="font-mono text-xs" data-testid="input-record-metadata" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Tags (comma-separated)</Label>
                <Input value={newRecordTags} onChange={(e) => setNewRecordTags(e.target.value)} placeholder="tag1, tag2" data-testid="input-record-tags" />
              </div>
              <Button
                disabled={addRecordMutation.isPending}
                onClick={() => {
                  try {
                    const inputData = JSON.parse(newRecordInput);
                    const expectedOutput = JSON.parse(newRecordExpected);
                    const metadata = JSON.parse(newRecordMetadata);
                    const tags = newRecordTags.split(",").map(t => t.trim()).filter(Boolean);
                    addRecordMutation.mutate({ category: newRecordCategory, inputData, expectedOutput, metadata, tags });
                  } catch { toast({ title: "Invalid JSON", description: "Please check your JSON fields", variant: "destructive" }); }
                }}
                data-testid="button-add-record-submit"
              >
                {addRecordMutation.isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving...</> : "Save Record"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={bulkImportOpen} onOpenChange={setBulkImportOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" data-testid="button-bulk-import">
              <Upload className="w-4 h-4 mr-1.5" />
              Bulk Import
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Bulk Import Data Records</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-2">
              <p className="text-xs text-muted-foreground">Paste a JSON array of records. Each record should have: category, inputData, expectedOutput, and optionally metadata and tags.</p>
              <Textarea
                value={bulkJson}
                onChange={(e) => setBulkJson(e.target.value)}
                rows={10}
                className="font-mono text-xs"
                placeholder={`[{"category": "completeness", "inputData": {...}, "expectedOutput": {...}, "tags": ["tag1"]}]`}
                data-testid="input-bulk-json"
              />
              <Button
                disabled={bulkImportMutation.isPending || !bulkJson.trim()}
                onClick={() => {
                  try {
                    const records = JSON.parse(bulkJson);
                    if (!Array.isArray(records)) { toast({ title: "Invalid format", description: "Expected a JSON array", variant: "destructive" }); return; }
                    bulkImportMutation.mutate({ records });
                  } catch { toast({ title: "Invalid JSON", variant: "destructive" }); }
                }}
                data-testid="button-bulk-import-submit"
              >
                {bulkImportMutation.isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Importing...</> : <><Upload className="w-4 h-4 mr-1.5" />Import Records</>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {uniqueCategories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap" data-testid="data-category-chips">
          <Badge
            variant={dataCategoryFilter === "all" ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setDataCategoryFilter("all")}
            data-testid="chip-category-all"
          >
            All ({dataRecords.length})
          </Badge>
          {uniqueCategories.map(cat => (
            <Badge
              key={cat}
              variant={dataCategoryFilter === cat ? "default" : "outline"}
              className={`cursor-pointer text-xs ${dataCategoryFilter !== cat ? (dataCategoryColors[cat] || dataCategoryColors.general) : ""}`}
              onClick={() => setDataCategoryFilter(cat)}
              data-testid={`chip-category-${cat}`}
            >
              {cat.replace(/_/g, " ")} ({categoryStats[cat] || 0})
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search data records..."
            className="pl-9"
            value={dataSearchQuery}
            onChange={(e) => setDataSearchQuery(e.target.value)}
            data-testid="input-search-data-records"
          />
        </div>
      </div>

      {filteredRecords.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <FileJson className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-data-records">No data records found</p>
            <p className="text-xs text-muted-foreground">Use AI Generate or Bulk Import to add evaluation data</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredRecords.map((record) => {
            const isExpanded = expandedRecordIds.has(record.id);
            const meta = record.metadata as Record<string, any> | null;
            return (
              <Card
                key={record.id}
                className="hover-elevate cursor-pointer"
                data-testid={`card-data-record-${record.id}`}
                onClick={() => toggleRecordExpand(record.id)}
              >
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <Badge variant="outline" className={`text-[10px] ${dataCategoryColors[record.category] || dataCategoryColors.general}`} data-testid={`badge-record-category-${record.id}`}>
                        {record.category.replace(/_/g, " ")}
                      </Badge>
                      {meta?.complexity && (
                        <Badge variant="outline" className="text-[10px]">{meta.complexity}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {record.tags && (record.tags as string[]).length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {(record.tags as string[]).slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                          ))}
                          {(record.tags as string[]).length > 3 && <Badge variant="outline" className="text-[10px]">+{(record.tags as string[]).length - 3}</Badge>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 ml-6">
                    <p className="text-xs text-muted-foreground font-mono" data-testid={`text-record-input-${record.id}`}>
                      <span className="font-medium font-sans">Input:</span> {jsonPreview(record.inputData)}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono" data-testid={`text-record-output-${record.id}`}>
                      <span className="font-medium font-sans">Expected:</span> {jsonPreview(record.expectedOutput)}
                    </p>
                  </div>

                  {isExpanded && (
                    <div className="flex flex-col gap-4 ml-6 mt-2 pt-3 border-t border-border" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium">Full Input Data</span>
                        <pre className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 overflow-auto max-h-[200px] font-mono">{JSON.stringify(record.inputData, null, 2)}</pre>
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium">Full Expected Output</span>
                        <pre className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 overflow-auto max-h-[200px] font-mono">{JSON.stringify(record.expectedOutput, null, 2)}</pre>
                      </div>
                      {meta && Object.keys(meta).length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-medium">Metadata</span>
                          <pre className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 overflow-auto max-h-[150px] font-mono">{JSON.stringify(meta, null, 2)}</pre>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deleteRecordMutation.isPending}
                          onClick={() => deleteRecordMutation.mutate(record.id)}
                          data-testid={`button-delete-record-${record.id}`}
                        >
                          {deleteRecordMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BenchmarksTab({ dataset, id }: { dataset: GoldenDataset; id: string }) {
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [benchmarkJson, setBenchmarkJson] = useState("");
  const benchmarks = (dataset.performanceBenchmarks as any[] | null) || [];

  const { data: dataRecords = [] } = useQuery<GoldenDataRecord[]>({
    queryKey: ["/api/golden-datasets", id, "data-records"],
  });

  const uniqueCategories = useMemo(() => {
    const cats = new Set(dataRecords.map(r => r.category));
    return Array.from(cats).sort();
  }, [dataRecords]);

  const updateBenchmarksMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/golden-datasets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets"] });
      toast({ title: "Benchmarks updated" });
      setEditOpen(false);
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const aiSuggestMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/suggest-benchmarks", data);
      return res.json();
    },
    onSuccess: (result: any) => {
      if (result.benchmarks) {
        setBenchmarkJson(JSON.stringify(result.benchmarks, null, 2));
        setEditOpen(true);
        toast({ title: "AI benchmarks suggested", description: "Review and save to apply" });
      }
    },
    onError: (e: Error) => toast({ title: "AI suggestion failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="default"
          disabled={aiSuggestMutation.isPending}
          onClick={() => aiSuggestMutation.mutate({ datasetId: id, industry: dataset.industry, useCase: dataset.useCase, categories: uniqueCategories })}
          data-testid="button-ai-suggest-benchmarks"
        >
          {aiSuggestMutation.isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Analyzing...</> : <><Sparkles className="w-4 h-4 mr-1.5" />AI Suggest Benchmarks</>}
        </Button>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              onClick={() => setBenchmarkJson(JSON.stringify(benchmarks, null, 2))}
              data-testid="button-edit-benchmarks"
            >
              <Edit className="w-4 h-4 mr-1.5" />
              Edit Benchmarks
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Performance Benchmarks</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-2">
              <p className="text-xs text-muted-foreground">Define benchmarks as a JSON array. Each benchmark should have: name, type (latency/throughput/accuracy/detection/custom), target, threshold, unit, category, description.</p>
              <Textarea
                value={benchmarkJson}
                onChange={(e) => setBenchmarkJson(e.target.value)}
                rows={14}
                className="font-mono text-xs"
                data-testid="input-benchmarks-json"
              />
              <Button
                disabled={updateBenchmarksMutation.isPending}
                onClick={() => {
                  try {
                    const parsed = JSON.parse(benchmarkJson);
                    updateBenchmarksMutation.mutate({ performanceBenchmarks: parsed });
                  } catch { toast({ title: "Invalid JSON", variant: "destructive" }); }
                }}
                data-testid="button-save-benchmarks"
              >
                {updateBenchmarksMutation.isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving...</> : "Save Benchmarks"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {benchmarks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <BarChart3 className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-benchmarks">No performance benchmarks defined</p>
            <p className="text-xs text-muted-foreground">Use AI Suggest or manually define benchmarks for this dataset</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {benchmarks.map((b: any, i: number) => {
            const Icon = benchmarkTypeIcons[b.type] || Gauge;
            return (
              <Card key={i} data-testid={`card-benchmark-${i}`}>
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                        <Icon className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="text-sm font-medium">{b.name}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{b.type}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-primary">{b.target}</span>
                    {b.unit && <span className="text-xs text-muted-foreground">{b.unit}</span>}
                  </div>
                  {b.category && (
                    <Badge variant="outline" className="text-[10px] w-fit">{b.category}</Badge>
                  )}
                  {b.description && (
                    <p className="text-xs text-muted-foreground">{b.description}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function GoldenDatasetDetailPage() {
  const [, params] = useRoute("/golden-datasets/:id");
  const id = params?.id;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("test-cases");
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateCount, setGenerateCount] = useState(5);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInput, setNewInput] = useState("");
  const [newExpected, setNewExpected] = useState("");
  const [newDifficulty, setNewDifficulty] = useState("routine");
  const [newCategory, setNewCategory] = useState("happy_path");
  const [newEvalCriteria, setNewEvalCriteria] = useState<any[]>([]);
  const [newRubricScoring, setNewRubricScoring] = useState<any>(null);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [enhanceType, setEnhanceType] = useState<Record<string, string>>({});

  const { data: dataset, isLoading: datasetLoading } = useQuery<GoldenDataset>({ queryKey: ["/api/golden-datasets", id] });
  const { data: testCases = [], isLoading: casesLoading } = useQuery<GoldenTestCase[]>({ queryKey: ["/api/golden-datasets", id, "test-cases"] });

  const generateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ai/generate-golden-test-cases", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets", id, "test-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets"] });
      toast({ title: "Test cases generated" });
      setGenerateOpen(false);
    },
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/golden-datasets/${id}/test-cases`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets", id, "test-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets"] });
      toast({ title: "Test case added" });
      setAddOpen(false);
      setNewName("");
      setNewInput("");
      setNewExpected("");
      setNewDifficulty("routine");
      setNewCategory("happy_path");
      setNewEvalCriteria([]);
      setNewRubricScoring(null);
      setNewTags([]);
    },
  });

  const aiEnhanceDraftMutation = useMutation({
    mutationFn: async (data: { name: string; inputScenario: string; industry: string; useCase: string }) => {
      const res = await apiRequest("POST", "/api/ai/enhance-test-case-draft", data);
      return res.json();
    },
    onSuccess: (enhanced: any) => {
      if (enhanced.inputScenario) setNewInput(enhanced.inputScenario);
      if (enhanced.expectedBehavior) setNewExpected(enhanced.expectedBehavior);
      if (enhanced.difficultyTier) setNewDifficulty(enhanced.difficultyTier);
      if (enhanced.scenarioCategory) setNewCategory(enhanced.scenarioCategory);
      if (enhanced.evaluationCriteria) setNewEvalCriteria(enhanced.evaluationCriteria);
      if (enhanced.rubricScoring) setNewRubricScoring(enhanced.rubricScoring);
      if (enhanced.tags) setNewTags(enhanced.tags);
      toast({ title: "AI Enhancement complete", description: "Fields have been auto-populated by AI" });
    },
    onError: (err: Error) => {
      toast({ title: "AI Enhancement failed", description: err.message, variant: "destructive" });
    },
  });

  const enhanceMutation = useMutation({
    mutationFn: (data: { testCaseId: string; enhanceType: string }) => apiRequest("POST", "/api/ai/enhance-golden-test-case", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets", id, "test-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets", id] });
      toast({ title: "Test case enhanced" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (testCaseId: string) => apiRequest("DELETE", `/api/golden-test-cases/${testCaseId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets", id, "test-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets"] });
      toast({ title: "Test case deleted" });
    },
  });

  const toggleExpand = (tcId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tcId)) next.delete(tcId);
      else next.add(tcId);
      return next;
    });
  };

  const filtered = useMemo(() => {
    return testCases.filter((tc) => {
      if (searchQuery && !tc.name.toLowerCase().includes(searchQuery.toLowerCase()) && !tc.inputScenario.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (difficultyFilter !== "all" && tc.difficultyTier !== difficultyFilter) return false;
      if (categoryFilter !== "all" && tc.scenarioCategory !== categoryFilter) return false;
      return true;
    });
  }, [testCases, searchQuery, difficultyFilter, categoryFilter]);

  const isLoading = datasetLoading || casesLoading;

  if (isLoading) return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-golden-dataset-detail-loading">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
        ))}
      </div>
    </div>
  );

  if (!dataset) return (
    <div className="flex flex-col items-center justify-center gap-4 p-12">
      <Database className="w-12 h-12 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">Dataset not found</p>
      <Link href="/golden-datasets">
        <Button variant="outline" data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Eval Datasets
        </Button>
      </Link>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-golden-dataset-detail">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/golden-datasets">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <Database className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-dataset-name">{dataset.name}</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-dataset-description">{dataset.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" data-testid="badge-industry">
            {({ financial_services: "Financial Services", healthcare: "Healthcare", manufacturing: "Manufacturing", retail: "Retail" } as Record<string, string>)[dataset.industry] || dataset.industry}
          </Badge>
          <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" data-testid="badge-usecase">
            {dataset.useCase}
          </Badge>
          <Badge variant="outline" className="text-[10px]" data-testid="badge-version">
            v{dataset.version}
          </Badge>
          {dataset.aiGenerated && (
            <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" data-testid="badge-ai-generated">
              <Sparkles className="w-3 h-3 mr-1" />
              AI Generated
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="stats-row">
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            <Layers className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Test Cases</span>
          </div>
          <span className="text-2xl font-semibold" data-testid="stat-test-cases">{dataset.testCaseCount}</span>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            <FileJson className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Data Records</span>
          </div>
          <span className="text-2xl font-semibold" data-testid="stat-data-records">{dataset.dataRecordCount || 0}</span>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            <Target className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Quality Coverage</span>
          </div>
          <span className="text-2xl font-semibold" data-testid="stat-coverage">{((dataset.qualityCoverage || 0) * 100).toFixed(1)}%</span>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            <Zap className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Benchmark Avg</span>
          </div>
          <span className="text-2xl font-semibold" data-testid="stat-benchmark">{((dataset.benchmarkAvg || 0) * 100).toFixed(1)}%</span>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            <BarChart3 className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Benchmarks</span>
          </div>
          <span className="text-2xl font-semibold" data-testid="stat-benchmarks-count">{((dataset.performanceBenchmarks as any[]) || []).length}</span>
        </CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-dataset">
          <TabsTrigger value="test-cases" data-testid="tab-test-cases">
            <Layers className="w-3.5 h-3.5 mr-1.5" />
            Test Cases ({dataset.testCaseCount})
          </TabsTrigger>
          <TabsTrigger value="data-records" data-testid="tab-data-records">
            <FileJson className="w-3.5 h-3.5 mr-1.5" />
            Data Records ({dataset.dataRecordCount || 0})
          </TabsTrigger>
          <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
            Benchmarks ({((dataset.performanceBenchmarks as any[]) || []).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="test-cases" className="mt-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
                <DialogTrigger asChild>
                  <Button variant="default" data-testid="button-generate-ai">
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    AI Generate Test Cases
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>AI Generate Test Cases</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4 pt-2">
                    <div className="flex flex-col gap-2">
                      <Label>Number of test cases (1-10)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={generateCount}
                        onChange={(e) => setGenerateCount(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                        data-testid="input-generate-count"
                      />
                    </div>
                    <Button
                      disabled={generateMutation.isPending}
                      onClick={() => generateMutation.mutate({ datasetId: id, industry: dataset.industry, useCase: dataset.useCase, count: generateCount })}
                      data-testid="button-generate-submit"
                    >
                      {generateMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Generating...</>
                      ) : (
                        <><Sparkles className="w-4 h-4 mr-1.5" />Generate</>
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-add-test-case">
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add Test Case
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Test Case</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4 pt-2">
                    <div className="flex flex-col gap-2">
                      <Label>Name</Label>
                      <Input value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="input-add-name" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Input Scenario</Label>
                      <Textarea value={newInput} onChange={(e) => setNewInput(e.target.value)} rows={3} data-testid="input-add-scenario" />
                    </div>
                    <Button
                      variant="outline"
                      disabled={aiEnhanceDraftMutation.isPending || !newName.trim() || !newInput.trim()}
                      onClick={() => aiEnhanceDraftMutation.mutate({
                        name: newName,
                        inputScenario: newInput,
                        industry: dataset?.industry || "general",
                        useCase: dataset?.useCase || "general",
                      })}
                      className="w-full border-dashed border-primary/40 text-primary hover:bg-primary/5"
                      data-testid="button-ai-enhance-draft"
                    >
                      {aiEnhanceDraftMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Enhancing with AI...</>
                      ) : (
                        <><Sparkles className="w-4 h-4 mr-1.5" />AI Enhance</>
                      )}
                    </Button>
                    <div className="flex flex-col gap-2">
                      <Label>Expected Behavior</Label>
                      <Textarea value={newExpected} onChange={(e) => setNewExpected(e.target.value)} rows={3} data-testid="input-add-expected" />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex flex-col gap-2 flex-1 min-w-[140px]">
                        <Label>Difficulty Tier</Label>
                        <Select value={newDifficulty} onValueChange={setNewDifficulty}>
                          <SelectTrigger data-testid="select-add-difficulty">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="routine">Routine</SelectItem>
                            <SelectItem value="complex">Complex</SelectItem>
                            <SelectItem value="edge_case">Edge Case</SelectItem>
                            <SelectItem value="adversarial">Adversarial</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-2 flex-1 min-w-[140px]">
                        <Label>Scenario Category</Label>
                        <Select value={newCategory} onValueChange={setNewCategory}>
                          <SelectTrigger data-testid="select-add-category">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="happy_path">Happy Path</SelectItem>
                            <SelectItem value="edge_case">Edge Case</SelectItem>
                            <SelectItem value="adversarial">Adversarial</SelectItem>
                            <SelectItem value="compliance_critical">Compliance Critical</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      disabled={addMutation.isPending || !newName || !newInput || !newExpected}
                      onClick={() => addMutation.mutate({
                        datasetId: id,
                        name: newName,
                        inputScenario: newInput,
                        expectedBehavior: newExpected,
                        difficultyTier: newDifficulty,
                        scenarioCategory: newCategory,
                        ...(newEvalCriteria.length > 0 && { evaluationCriteria: newEvalCriteria }),
                        ...(newRubricScoring && { rubricScoring: newRubricScoring }),
                        ...(newTags.length > 0 && { tags: newTags }),
                      })}
                      data-testid="button-add-submit"
                    >
                      {addMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving...</>
                      ) : "Save Test Case"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search test cases..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-test-cases"
                />
              </div>
              <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-difficulty-filter">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Difficulties</SelectItem>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="complex">Complex</SelectItem>
                  <SelectItem value="edge_case">Edge Case</SelectItem>
                  <SelectItem value="adversarial">Adversarial</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[170px]" data-testid="select-category-filter">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="happy_path">Happy Path</SelectItem>
                  <SelectItem value="edge_case">Edge Case</SelectItem>
                  <SelectItem value="adversarial">Adversarial</SelectItem>
                  <SelectItem value="compliance_critical">Compliance Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filtered.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                  <Layers className="w-10 h-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground" data-testid="text-empty-test-cases">No test cases found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {filtered.map((tc) => {
                  const isExpanded = expandedIds.has(tc.id);
                  const evalCriteria = tc.evaluationCriteria as Array<{ dimension?: string; weight?: number; description?: string }> | null;
                  const rubric = tc.rubricScoring as { dimensions?: Array<{ name?: string; maxScore?: number; criteria?: string }>; passingScore?: number } | null;

                  return (
                    <Card
                      key={tc.id}
                      className="hover-elevate cursor-pointer"
                      data-testid={`card-test-case-${tc.id}`}
                      onClick={() => toggleExpand(tc.id)}
                    >
                      <CardContent className="p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                            <span className="text-sm font-medium" data-testid={`text-tc-name-${tc.id}`}>{tc.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className={`text-[10px] ${difficultyColors[tc.difficultyTier] || ""}`} data-testid={`badge-difficulty-${tc.id}`}>
                              {difficultyLabels[tc.difficultyTier] || tc.difficultyTier}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] ${categoryColors[tc.scenarioCategory] || ""}`} data-testid={`badge-category-${tc.id}`}>
                              {categoryLabels[tc.scenarioCategory] || tc.scenarioCategory}
                            </Badge>
                            {tc.aiGenerated && (
                              <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                                <Sparkles className="w-3 h-3 mr-0.5" />
                                AI
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5 ml-6">
                          <p className="text-xs text-muted-foreground" data-testid={`text-tc-input-${tc.id}`}>
                            <span className="font-medium">Input:</span> {truncate(tc.inputScenario, 200)}
                          </p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-tc-expected-${tc.id}`}>
                            <span className="font-medium">Expected:</span> {truncate(tc.expectedBehavior, 200)}
                          </p>
                        </div>

                        {tc.tags && tc.tags.length > 0 && (
                          <div className="flex items-center gap-1 ml-6 flex-wrap">
                            <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
                            {tc.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                            ))}
                          </div>
                        )}

                        {isExpanded && (
                          <div className="flex flex-col gap-4 ml-6 mt-2 pt-3 border-t border-border" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-col gap-2">
                              <span className="text-xs font-medium">Full Input Scenario</span>
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{tc.inputScenario}</p>
                            </div>
                            <div className="flex flex-col gap-2">
                              <span className="text-xs font-medium">Full Expected Behavior</span>
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{tc.expectedBehavior}</p>
                            </div>

                            {evalCriteria && evalCriteria.length > 0 && (
                              <div className="flex flex-col gap-2">
                                <span className="text-xs font-medium">Evaluation Criteria</span>
                                <div className="flex flex-col gap-1.5">
                                  {evalCriteria.map((ec, i) => (
                                    <div key={i} className="flex items-start gap-2 p-2 rounded-md border border-border">
                                      <Badge variant="outline" className="text-[10px] shrink-0">{ec.dimension || "N/A"}</Badge>
                                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                        <span className="text-xs text-muted-foreground">{ec.description || ""}</span>
                                        {ec.weight !== undefined && (
                                          <span className="text-[10px] text-muted-foreground">Weight: {ec.weight}</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {rubric && rubric.dimensions && rubric.dimensions.length > 0 && (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium">Rubric Scoring</span>
                                  {rubric.passingScore !== undefined && (
                                    <Badge variant="outline" className="text-[10px]">Passing: {(rubric.passingScore * 100).toFixed(0)}%</Badge>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  {rubric.dimensions.map((dim, i) => (
                                    <div key={i} className="flex items-start gap-2 p-2 rounded-md border border-border">
                                      <Badge variant="outline" className="text-[10px] shrink-0">{dim.name || "N/A"}</Badge>
                                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                        <span className="text-xs text-muted-foreground">{dim.criteria || ""}</span>
                                        {dim.maxScore !== undefined && (
                                          <span className="text-[10px] text-muted-foreground">Max Score: {dim.maxScore}</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-2 flex-wrap pt-2">
                              <div className="flex items-center gap-1">
                                <Select
                                  value={enhanceType[tc.id] || "all"}
                                  onValueChange={(val) => setEnhanceType((prev) => ({ ...prev, [tc.id]: val }))}
                                >
                                  <SelectTrigger className="w-[130px]" data-testid={`select-enhance-type-${tc.id}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    <SelectItem value="rubric">Rubric</SelectItem>
                                    <SelectItem value="criteria">Criteria</SelectItem>
                                    <SelectItem value="adversarial">Adversarial</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={enhanceMutation.isPending}
                                  onClick={() => enhanceMutation.mutate({ testCaseId: tc.id, enhanceType: enhanceType[tc.id] || "all" })}
                                  data-testid={`button-enhance-${tc.id}`}
                                >
                                  {enhanceMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-1" />}
                                  Enhance
                                </Button>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(tc.id)}
                                data-testid={`button-delete-${tc.id}`}
                              >
                                {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                                Delete
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="data-records" className="mt-4">
          <DataRecordsTab dataset={dataset} id={id!} />
        </TabsContent>

        <TabsContent value="benchmarks" className="mt-4">
          <BenchmarksTab dataset={dataset} id={id!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
