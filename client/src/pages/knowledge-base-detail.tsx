import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import type { KnowledgeBase, KnowledgeSource, KnowledgeChunk, Agent } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Upload, Globe, FileText, Layers, Database, Search,
  Plus, Loader2, Trash2, RefreshCw, CheckCircle2, XCircle,
  Clock, Bot, Link2, Unlink, Settings, MessageSquare,
  BookOpen, Brain, AlignLeft, Table2, Send, ShieldCheck,
  AlertTriangle, CircleDot, Lightbulb, Timer, BarChart3,
  Gauge, Zap, TrendingUp, Archive, Pencil,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: typeof Clock }> = {
    pending: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", icon: Clock },
    processing: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: Loader2 },
    processed: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: CheckCircle2 },
    error: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: XCircle },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={c.color}>
      <Icon className={`w-3 h-3 mr-1 ${status === "processing" ? "animate-spin" : ""}`} />
      {status}
    </Badge>
  );
}

function OntologyAlignmentBadge({ score, mismatches }: { score: number | null; mismatches?: Array<{ term: string; suggestedTerm: string }> }) {
  if (score === null) return null;
  let color: string;
  let label: string;
  if (score >= 80) {
    color = "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    label = "Good";
  } else if (score >= 50) {
    color = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    label = "Partial";
  } else {
    color = "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    label = "Poor";
  }
  const badge = (
    <Badge variant="outline" className={color} data-testid="badge-ontology-alignment">
      <ShieldCheck className="w-3 h-3 mr-1" />
      {score}% {label}
    </Badge>
  );
  if (!mismatches || mismatches.length === 0) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p className="text-xs font-medium mb-1">Non-standard terms found:</p>
        <ul className="text-xs space-y-0.5">
          {mismatches.slice(0, 5).map((m, i) => (
            <li key={i}>"{m.term}" → use "{m.suggestedTerm}"</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

const SOURCE_TYPE_CONFIG: Record<string, { label: string; icon: typeof FileText }> = {
  document: { label: "Document", icon: FileText },
  url: { label: "Web URL", icon: Globe },
  text: { label: "Manual Text", icon: AlignLeft },
  structured: { label: "Structured Data", icon: Table2 },
  api: { label: "API Connector", icon: Database },
};

function FreshnessBadge({ status }: { status: string | null }) {
  const s = status || "unknown";
  const config: Record<string, { color: string; label: string; icon: typeof CheckCircle2 }> = {
    fresh: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", label: "Fresh", icon: CheckCircle2 },
    stale: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", label: "Stale", icon: AlertTriangle },
    critical: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", label: "Critical", icon: XCircle },
    unknown: { color: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400", label: "Unknown", icon: Clock },
  };
  const c = config[s] || config.unknown;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={c.color} data-testid={`badge-freshness-${s}`}>
      <Icon className="w-3 h-3 mr-1" />
      {c.label}
    </Badge>
  );
}

function daysSinceProcessed(processedAt: Date | string | null): number | null {
  if (!processedAt) return null;
  const d = new Date(processedAt);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default function KnowledgeBaseDetail() {
  const [, params] = useRoute("/knowledge-bases/:id");
  const kbId = params?.id;
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("sources");
  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [addTextOpen, setAddTextOpen] = useState(false);
  const [addStructuredOpen, setAddStructuredOpen] = useState(false);
  const [urlForm, setUrlForm] = useState({ url: "", name: "", crawl: false, crawlDepth: 1, maxPages: 10 });
  const [textForm, setTextForm] = useState({ title: "", content: "" });
  const [structuredForm, setStructuredForm] = useState({ name: "", data: "" });
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [qaQuery, setQaQuery] = useState("");
  const [qaResult, setQaResult] = useState<{ answer: string; sources: any[] } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [configEditing, setConfigEditing] = useState(false);
  const [configForm, setConfigForm] = useState<any>(null);
  const [linkAgentOpen, setLinkAgentOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [stalenessResult, setStalenessResult] = useState<{ sourcesChecked: number; fresh: number; stale: number; critical: number } | null>(null);
  const [sensitivityWarnings, setSensitivityWarnings] = useState<Array<{
    sensitivityClass: string;
    termsFound: string[];
    agentId: string;
    agentName: string;
    missingPolicyDomain: string;
    regulation: string;
  }>>([]);
  const [sensitivityDialogOpen, setSensitivityDialogOpen] = useState(false);
  const [, navigate] = useLocation();
  const [editInfoOpen, setEditInfoOpen] = useState(false);
  const [editInfoForm, setEditInfoForm] = useState({ name: "", description: "", industry: "general" });
  const [deleteKbOpen, setDeleteKbOpen] = useState(false);

  const { data: kb, isLoading: kbLoading } = useQuery<KnowledgeBase>({
    queryKey: ["/api/knowledge-bases", kbId],
    enabled: !!kbId,
  });

  const { data: sources = [], isLoading: sourcesLoading } = useQuery<KnowledgeSource[]>({
    queryKey: ["/api/knowledge-bases", kbId, "sources"],
    queryFn: async () => {
      const res = await fetch(`/api/knowledge-bases/${kbId}/sources`);
      return res.json();
    },
    enabled: !!kbId,
    refetchInterval: 5000,
  });

  const computedChunkCount = sources.reduce((sum, s) => sum + (s.chunkCount || 0), 0);

  useEffect(() => {
    if (kbId && kb && sources.length > 0 && (kb.totalChunks !== computedChunkCount || kb.totalSources !== sources.length)) {
      apiRequest("POST", `/api/knowledge-bases/${kbId}/refresh-stats`).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      }).catch(() => {});
    }
  }, [kbId, sources.length, computedChunkCount]);

  const { data: chunks = [] } = useQuery<KnowledgeChunk[]>({
    queryKey: ["/api/knowledge-bases", kbId, "chunks"],
    queryFn: async () => {
      const res = await fetch(`/api/knowledge-bases/${kbId}/chunks`);
      return res.json();
    },
    enabled: !!kbId && activeTab === "chunks",
  });

  const { data: agentLinks = [] } = useQuery<any[]>({
    queryKey: ["/api/knowledge-bases", kbId, "agents"],
    queryFn: async () => {
      const res = await fetch(`/api/knowledge-bases/${kbId}/agents`);
      return res.json();
    },
    enabled: !!kbId && (activeTab === "agents" || activeTab === "eval-gaps"),
  });

  const { data: allAgents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    enabled: linkAgentOpen,
  });

  const { data: ontologyAlignment } = useQuery<{
    overallAlignment: number | null;
    sources: Array<{
      sourceId: string;
      ontologyAlignment: number | null;
      nonStandardTerms: Array<{ term: string; suggestedTerm: string }>;
    }>;
  }>({
    queryKey: ["/api/knowledge-bases", kbId, "ontology-alignment"],
    queryFn: async () => {
      const res = await fetch(`/api/knowledge-bases/${kbId}/ontology-alignment`);
      return res.json();
    },
    enabled: !!kbId,
    refetchInterval: 10000,
  });

  const { data: ontologyCoverage, isLoading: coverageLoading } = useQuery<{
    totalConcepts: number;
    coveredConcepts: number;
    uncoveredConcepts: number;
    coveragePercent: number;
    gaps: Array<{ conceptId: string; label: string; category: string; description: string }>;
    covered: Array<{ conceptId: string; label: string; category: string; sourceCount: number }>;
  }>({
    queryKey: ["/api/knowledge-bases", kbId, "ontology-coverage"],
    queryFn: async () => {
      const res = await fetch(`/api/knowledge-bases/${kbId}/ontology-coverage`);
      if (!res.ok) throw new Error(`Failed to fetch coverage: ${res.statusText}`);
      return res.json();
    },
    enabled: !!kbId,
  });

  const { data: embeddingStatus } = useQuery<{ total: number; withEmbeddings: number; withoutEmbeddings: number }>({
    queryKey: ["/api/knowledge-bases", kbId, "embedding-status"],
    queryFn: async () => {
      const res = await fetch(`/api/knowledge-bases/${kbId}/embedding-status`);
      return res.json();
    },
    enabled: !!kbId && (activeTab === "search" || activeTab === "chunks"),
    refetchInterval: 10000,
  });

  const embedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/knowledge-bases/${kbId}/embed`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "embedding-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "chunks"] });
      toast({ title: "Embeddings generated", description: data.message });
    },
    onError: (e: any) => toast({ title: "Embedding generation failed", description: e.message, variant: "destructive" }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/knowledge-bases/${kbId}/sources/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      if (data.sensitivityWarnings && data.sensitivityWarnings.length > 0) {
        setSensitivityWarnings(data.sensitivityWarnings);
        setSensitivityDialogOpen(true);
      } else {
        toast({ title: "File uploaded", description: "Processing will begin shortly" });
      }
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const addUrlMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/knowledge-bases/${kbId}/sources/url`, data);
      return res.json();
    },
    onSuccess: (_data: any, variables: { crawl: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      setAddUrlOpen(false);
      setUrlForm({ url: "", name: "", crawl: false, crawlDepth: 1, maxPages: 10 });
      toast({
        title: "URL added",
        description: variables.crawl ? "Content will be fetched and linked pages will be crawled" : "Content will be fetched and processed",
      });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addTextMutation = useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
      const res = await apiRequest("POST", `/api/knowledge-bases/${kbId}/sources/text`, data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      setAddTextOpen(false);
      setTextForm({ title: "", content: "" });
      if (data.sensitivityWarnings && data.sensitivityWarnings.length > 0) {
        setSensitivityWarnings(data.sensitivityWarnings);
        setSensitivityDialogOpen(true);
      } else {
        toast({ title: "Text added" });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addStructuredMutation = useMutation({
    mutationFn: async (payload: { name: string; data: any }) => {
      const res = await apiRequest("POST", `/api/knowledge-bases/${kbId}/sources/structured`, payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      setAddStructuredOpen(false);
      setStructuredForm({ name: "", data: "" });
      if (data.sensitivityWarnings && data.sensitivityWarnings.length > 0) {
        setSensitivityWarnings(data.sensitivityWarnings);
        setSensitivityDialogOpen(true);
      } else {
        toast({ title: "Structured data imported" });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      await apiRequest("DELETE", `/api/knowledge-bases/${kbId}/sources/${sourceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "chunks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      toast({ title: "Source deleted" });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      await apiRequest("POST", `/api/knowledge-bases/${kbId}/sources/${sourceId}/reprocess`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "sources"] });
      toast({ title: "Reprocessing started" });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/knowledge-bases/${kbId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      setConfigEditing(false);
      toast({ title: "Configuration updated" });
    },
  });

  const linkAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/knowledge-bases`, { knowledgeBaseId: kbId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "agents"] });
      setLinkAgentOpen(false);
      setSelectedAgentId("");
      toast({ title: "Agent linked" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unlinkAgentMutation = useMutation({
    mutationFn: async ({ agentId, linkId }: { agentId: string; linkId: string }) => {
      await apiRequest("DELETE", `/api/agents/${agentId}/knowledge-bases/${linkId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "agents"] });
      toast({ title: "Agent unlinked" });
    },
  });

  const editInfoMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; industry: string }) => {
      const res = await apiRequest("PATCH", `/api/knowledge-bases/${kbId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases"] });
      setEditInfoOpen(false);
      toast({ title: "Knowledge Base updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteKbMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/knowledge-bases/${kbId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases"] });
      toast({ title: "Knowledge Base deleted" });
      navigate("/knowledge-bases");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const checkStalenessMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/knowledge-bases/${kbId}/check-staleness`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      setStalenessResult({ sourcesChecked: data.sourcesChecked, fresh: data.fresh, stale: data.stale, critical: data.critical });
      toast({ title: "Staleness check complete", description: `${data.fresh} fresh, ${data.stale} stale, ${data.critical} critical` });
    },
    onError: (e: any) => toast({ title: "Staleness check failed", description: e.message, variant: "destructive" }),
  });

  const { data: usageAnalytics, isLoading: usageLoading } = useQuery<{
    kbId: string;
    kbName: string;
    sources: Array<{ sourceId: string; name: string; sourceType: string; status: string; retrievalCount: number; lastRetrievedAt: string | null; chunkCount: number; processedAt: string | null }>;
    deadSources: Array<{ sourceId: string; name: string; processedAt: string | null; daysSinceProcessed: number | null }>;
    summary: { totalSources: number; activeSources: number; deadSources: number; totalRetrievals: number; avgRetrievalsPerSource: number };
  }>({
    queryKey: ["/api/knowledge-bases", kbId, "usage-analytics"],
    queryFn: async () => {
      const res = await fetch(`/api/knowledge-bases/${kbId}/usage-analytics`);
      return res.json();
    },
    enabled: !!kbId && activeTab === "usage",
  });

  const [tuningResult, setTuningResult] = useState<{
    analyzedRuns: number;
    metrics: { avgSimilarity: number; retrievalUtilization: number; overflowCount: number; totalSimilarityScores: number };
    recommendations: Array<{ parameter: string; currentValue: number; recommendedValue: number; reason: string; confidence: string }>;
    autoApplyAvailable: boolean;
  } | null>(null);

  const autoTuneMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/knowledge-bases/${kbId}/auto-tune`);
      return res.json();
    },
    onSuccess: (data: any) => {
      setTuningResult(data);
      toast({ title: "Auto-tune analysis complete", description: `${data.recommendations.length} recommendation${data.recommendations.length !== 1 ? "s" : ""} from ${data.analyzedRuns} runs analyzed` });
    },
    onError: (e: any) => toast({ title: "Auto-tune failed", description: e.message, variant: "destructive" }),
  });

  const applyTuningMutation = useMutation({
    mutationFn: async (params: { chunkSize?: number; chunkOverlap?: number; retrievalTopK?: number }) => {
      const res = await apiRequest("POST", `/api/knowledge-bases/${kbId}/apply-tuning`, params);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      toast({ title: "Tuning applied", description: `${data.changes.length} parameter${data.changes.length !== 1 ? "s" : ""} updated` });
    },
    onError: (e: any) => toast({ title: "Apply failed", description: e.message, variant: "destructive" }),
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setHasSearched(false);
    try {
      const res = await apiRequest("POST", `/api/knowledge-bases/${kbId}/search`, { query: searchQuery, topK: 5, scoreThreshold: 0.3 });
      const data = await res.json();
      setSearchResults(data);
    } catch (e: any) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSearching(false);
      setHasSearched(true);
    }
  };

  const handleQA = async () => {
    if (!qaQuery.trim()) return;
    setIsAsking(true);
    try {
      const res = await apiRequest("POST", `/api/knowledge-bases/${kbId}/query`, { question: qaQuery, topK: 5 });
      const data = await res.json();
      setQaResult(data);
    } catch (e: any) {
      toast({ title: "Query failed", description: e.message, variant: "destructive" });
    } finally {
      setIsAsking(false);
    }
  };

  if (kbLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!kb) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Knowledge base not found</p>
        <Link href="/knowledge-bases"><Button variant="ghost" className="mt-2">Back to list</Button></Link>
      </div>
    );
  }

  const linkedAgentIds = agentLinks.map((l: any) => l.agentId);
  const availableAgents = allAgents.filter((a) => !linkedAgentIds.includes(a.id));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/knowledge-bases">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold truncate" data-testid="text-kb-title">{kb.name}</h1>
            <Badge variant={kb.status === "active" ? "default" : "secondary"}>{kb.status}</Badge>
          </div>
          {kb.description && <p className="text-sm text-muted-foreground mt-1">{kb.description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => { setEditInfoForm({ name: kb.name, description: kb.description || "", industry: kb.industry }); setEditInfoOpen(true); }} data-testid="button-edit-kb-info">
            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteKbOpen(true)} data-testid="button-delete-kb">
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <div className="text-center px-3">
            <div className="font-semibold text-base text-foreground" data-testid="text-total-sources">{sources.length || kb.totalSources}</div>
            <div>Sources</div>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <div className="text-center px-3">
            <div className="font-semibold text-base text-foreground" data-testid="text-total-chunks">{sources.reduce((sum, s) => sum + (s.chunkCount || 0), 0) || kb.totalChunks}</div>
            <div>Chunks</div>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <div className="text-center px-3">
            <div className="font-semibold text-xs text-foreground">{kb.vectorDbType}</div>
            <div>Vector DB</div>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkStalenessMutation.mutate()}
            disabled={checkStalenessMutation.isPending}
            data-testid="button-check-staleness"
          >
            {checkStalenessMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Timer className="w-3.5 h-3.5 mr-1.5" />}
            Check Staleness
          </Button>
        </div>
      </div>

      {stalenessResult && (stalenessResult.stale > 0 || stalenessResult.critical > 0) && (
        <Alert variant="destructive" className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300" data-testid="alert-staleness-banner">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription className="text-sm">
            {stalenessResult.stale + stalenessResult.critical} source{stalenessResult.stale + stalenessResult.critical !== 1 ? "s are" : " is"} stale (last processed {kb.stalenessThresholdDays ?? 90}+ days ago). Consider reprocessing to keep agent knowledge current.
            {stalenessResult.critical > 0 && (
              <span className="font-medium text-red-700 dark:text-red-400"> {stalenessResult.critical} source{stalenessResult.critical !== 1 ? "s are" : " is"} critically stale.</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-kb-detail">
          <TabsTrigger value="sources" data-testid="tab-sources">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Sources ({sources.length})
          </TabsTrigger>
          <TabsTrigger value="chunks" data-testid="tab-chunks">
            <Layers className="w-3.5 h-3.5 mr-1.5" /> Chunks ({sources.reduce((sum, s) => sum + (s.chunkCount || 0), 0) || kb.totalChunks})
          </TabsTrigger>
          <TabsTrigger value="search" data-testid="tab-search">
            <Search className="w-3.5 h-3.5 mr-1.5" /> Search & Query
          </TabsTrigger>
          <TabsTrigger value="coverage" data-testid="tab-coverage">
            <CircleDot className="w-3.5 h-3.5 mr-1.5" /> Concept Coverage
          </TabsTrigger>
          <TabsTrigger value="config" data-testid="tab-config">
            <Settings className="w-3.5 h-3.5 mr-1.5" /> Configuration
          </TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents">
            <Bot className="w-3.5 h-3.5 mr-1.5" /> Linked Agents
          </TabsTrigger>
          <TabsTrigger value="usage" data-testid="tab-usage">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Usage Analytics
          </TabsTrigger>
          <TabsTrigger value="eval-gaps" data-testid="tab-eval-gaps">
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> Eval KB Gaps
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sources" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.txt,.md,.csv,.json"
              onChange={(e) => { if (e.target.files?.[0]) uploadMutation.mutate(e.target.files[0]); }}
            />
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} data-testid="button-upload-file">
              {uploadMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload Document
            </Button>
            <Dialog open={addUrlOpen} onOpenChange={setAddUrlOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" data-testid="button-add-url">
                  <Globe className="w-4 h-4 mr-2" /> Add Web URL
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Web URL</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>URL</Label>
                    <Input data-testid="input-source-url" value={urlForm.url} onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })} placeholder="https://example.com/docs" />
                  </div>
                  <div>
                    <Label>Name (optional)</Label>
                    <Input value={urlForm.name} onChange={(e) => setUrlForm({ ...urlForm, name: e.target.value })} placeholder="My Documentation Page" />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <Label htmlFor="crawl-toggle" className="text-sm font-medium">Crawl linked pages</Label>
                      <p className="text-xs text-muted-foreground">Follow links on the page and ingest content from linked pages on the same domain</p>
                    </div>
                    <Switch id="crawl-toggle" checked={urlForm.crawl} onCheckedChange={(v) => setUrlForm({ ...urlForm, crawl: v })} data-testid="switch-crawl" />
                  </div>
                  {urlForm.crawl && (
                    <div className="grid grid-cols-2 gap-3 pl-1 border-l-2 border-primary/20 ml-1">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Crawl Depth</Label>
                        <Select value={String(urlForm.crawlDepth)} onValueChange={(v) => setUrlForm({ ...urlForm, crawlDepth: parseInt(v) })}>
                          <SelectTrigger data-testid="select-crawl-depth" className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 level (direct links)</SelectItem>
                            <SelectItem value="2">2 levels</SelectItem>
                            <SelectItem value="3">3 levels (deep)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">How many link hops to follow</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Max Pages</Label>
                        <Input type="number" min={1} max={50} value={urlForm.maxPages} onChange={(e) => setUrlForm({ ...urlForm, maxPages: Math.min(50, Math.max(1, parseInt(e.target.value) || 1)) })} className="h-8 text-xs" data-testid="input-max-pages" />
                        <p className="text-[10px] text-muted-foreground">Maximum linked pages to ingest (max 50)</p>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button onClick={() => addUrlMutation.mutate(urlForm)} disabled={!urlForm.url || addUrlMutation.isPending} data-testid="button-submit-url">
                    {addUrlMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} {urlForm.crawl ? "Add & Crawl" : "Add"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={addTextOpen} onOpenChange={setAddTextOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" data-testid="button-add-text">
                  <AlignLeft className="w-4 h-4 mr-2" /> Add Text
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Add Manual Text</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Title</Label>
                    <Input data-testid="input-text-title" value={textForm.title} onChange={(e) => setTextForm({ ...textForm, title: e.target.value })} placeholder="e.g., Company Policy" />
                  </div>
                  <div>
                    <Label>Content</Label>
                    <Textarea data-testid="input-text-content" value={textForm.content} onChange={(e) => setTextForm({ ...textForm, content: e.target.value })} placeholder="Paste or type your knowledge content here..." rows={10} />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button onClick={() => addTextMutation.mutate(textForm)} disabled={!textForm.content || addTextMutation.isPending} data-testid="button-submit-text">
                    {addTextMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Add
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={addStructuredOpen} onOpenChange={setAddStructuredOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" data-testid="button-add-structured">
                  <Table2 className="w-4 h-4 mr-2" /> Import Structured Data
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Import Structured Data</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Name</Label>
                    <Input value={structuredForm.name} onChange={(e) => setStructuredForm({ ...structuredForm, name: e.target.value })} placeholder="e.g., Product Catalog" data-testid="input-structured-name" />
                  </div>
                  <div>
                    <Label>JSON Data (array of objects)</Label>
                    <div className="flex items-center gap-2 mb-1.5">
                      <input
                        ref={jsonFileInputRef}
                        type="file"
                        className="hidden"
                        accept=".json"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const content = ev.target?.result as string;
                            setStructuredForm((prev) => ({
                              ...prev,
                              data: content,
                              name: prev.name || file.name.replace(/\.json$/i, ""),
                            }));
                          };
                          reader.readAsText(file);
                          e.target.value = "";
                        }}
                      />
                      <Button size="sm" variant="outline" type="button" onClick={() => jsonFileInputRef.current?.click()} data-testid="button-choose-json-file">
                        <Upload className="w-3.5 h-3.5 mr-1.5" /> Choose JSON File
                      </Button>
                      <span className="text-xs text-muted-foreground">or paste JSON below</span>
                    </div>
                    <Textarea
                      data-testid="input-structured-data"
                      value={structuredForm.data}
                      onChange={(e) => setStructuredForm({ ...structuredForm, data: e.target.value })}
                      placeholder={`[{"name": "Product A", "price": 29.99}, {"name": "Product B", "price": 49.99}]`}
                      rows={8}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(structuredForm.data);
                        addStructuredMutation.mutate({ name: structuredForm.name, data: parsed });
                      } catch { toast({ title: "Invalid JSON", variant: "destructive" }); }
                    }}
                    disabled={!structuredForm.data || addStructuredMutation.isPending}
                    data-testid="button-submit-structured"
                  >
                    {addStructuredMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Import
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {sourcesLoading ? (
            <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : sources.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-12 text-center">
                <FileText className="w-10 h-10 text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">No Sources Yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm">Upload documents, add web URLs, or paste text to build your knowledge base.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sources.map((source) => {
                const typeConfig = SOURCE_TYPE_CONFIG[source.sourceType] || SOURCE_TYPE_CONFIG.document;
                const TypeIcon = typeConfig.icon;
                return (
                  <Card key={source.id} data-testid={`card-source-${source.id}`}>
                    <CardContent className="flex items-center gap-3 py-3">
                      <div className="p-2 rounded-md bg-muted shrink-0">
                        <TypeIcon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{source.name}</span>
                          <StatusBadge status={source.status} />
                          <FreshnessBadge status={source.freshnessStatus} />
                          {(() => {
                            const meta = source.metadata as Record<string, any> | null;
                            if (meta?.crawledFrom) {
                              return <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" data-testid={`badge-crawled-${source.id}`}><Link2 className="w-2.5 h-2.5 mr-1" />via crawl</Badge>;
                            }
                            if (meta?.crawl && meta?.crawlStatus) {
                              const label = meta.crawlStatus === "complete"
                                ? `Crawled ${meta.crawledPages || 0} pages`
                                : meta.crawlStatus === "crawling"
                                  ? `Crawling... ${meta.crawledPages || 0}/${meta.maxPages || "?"}`
                                  : "Crawl pending";
                              return <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300" data-testid={`badge-crawl-status-${source.id}`}><Globe className="w-2.5 h-2.5 mr-1" />{label}</Badge>;
                            }
                            return null;
                          })()}
                          {(() => {
                            const alignment = ontologyAlignment?.sources?.find((s) => s.sourceId === source.id);
                            if (!alignment) return null;
                            return <OntologyAlignmentBadge score={alignment.ontologyAlignment} mismatches={alignment.nonStandardTerms} />;
                          })()}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{typeConfig.label}</span>
                          {source.fileSize && <span>{(source.fileSize / 1024).toFixed(1)} KB</span>}
                          {source.chunkCount > 0 && <span>{source.chunkCount} chunks</span>}
                          {source.processedAt && (
                            <span data-testid={`text-days-since-${source.id}`}>
                              {(() => {
                                const days = daysSinceProcessed(source.processedAt);
                                return days !== null ? `${days}d ago` : null;
                              })()}
                            </span>
                          )}
                          {source.errorMessage && <span className="text-destructive">{source.errorMessage}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {(source.status === "error" || source.status === "processed") && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => reprocessMutation.mutate(source.id)} disabled={reprocessMutation.isPending} data-testid={`button-reprocess-${source.id}`}>
                            <RefreshCw className={`w-3.5 h-3.5 ${reprocessMutation.isPending ? "animate-spin" : ""}`} />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteSourceMutation.mutate(source.id)} data-testid={`button-delete-source-${source.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="chunks" className="mt-4">
          {chunks.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-12 text-center">
                <Layers className="w-10 h-10 text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">No Chunks Yet</h3>
                <p className="text-sm text-muted-foreground">Add and process sources to generate chunks with embeddings.</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {chunks.slice(0, 100).map((chunk) => (
                  <Card key={chunk.id} data-testid={`card-chunk-${chunk.id}`}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-[10px]">Chunk #{chunk.chunkIndex + 1}</Badge>
                        {chunk.tokenCount && <span className="text-[10px] text-muted-foreground">{chunk.tokenCount} tokens</span>}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3">{chunk.content}</p>
                    </CardContent>
                  </Card>
                ))}
                {chunks.length > 100 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Showing first 100 of {chunks.length} chunks</p>
                )}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="search" className="mt-4 space-y-6">
          {embeddingStatus && embeddingStatus.total > 0 && embeddingStatus.withoutEmbeddings > 0 && (
            <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        {embeddingStatus.withoutEmbeddings} of {embeddingStatus.total} chunks missing vector embeddings
                      </p>
                      <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5">
                        Semantic search and RAG require embeddings to find relevant content. Click "Generate Embeddings" to enable search.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => embedMutation.mutate()}
                    disabled={embedMutation.isPending}
                    data-testid="button-generate-embeddings"
                    className="flex-shrink-0"
                  >
                    {embedMutation.isPending ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating...</>
                    ) : (
                      <><Layers className="w-3.5 h-3.5 mr-1.5" /> Generate Embeddings</>
                    )}
                  </Button>
                </div>
                {embeddingStatus.withEmbeddings > 0 && (
                  <div className="mt-2 ml-8">
                    <div className="w-full bg-amber-200 dark:bg-amber-900 rounded-full h-1.5">
                      <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${(embeddingStatus.withEmbeddings / embeddingStatus.total) * 100}%` }} />
                    </div>
                    <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">{embeddingStatus.withEmbeddings}/{embeddingStatus.total} embedded</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {embeddingStatus && embeddingStatus.total > 0 && embeddingStatus.withoutEmbeddings === 0 && (
            <Card className="border-green-500/30 bg-green-50/50 dark:bg-green-950/20">
              <CardContent className="py-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <p className="text-xs text-green-700 dark:text-green-400">
                    All {embeddingStatus.total} chunks have vector embeddings. Semantic search is ready.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Search className="w-4 h-4" /> Semantic Search
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  data-testid="input-semantic-search"
                  placeholder="Search across your knowledge base..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} data-testid="button-search">
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map((result: any, idx: number) => (
                    <Card key={idx} className="bg-muted/50">
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="outline" className="text-[10px]">Match #{idx + 1}</Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Similarity: {(parseFloat(result.similarity) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-xs">{result.content}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              {hasSearched && searchResults.length === 0 && !isSearching && (
                <Card className="bg-muted/30 border-dashed">
                  <CardContent className="py-6 text-center">
                    <Search className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No matching results found</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Try using different keywords or a more specific query</p>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Ask Questions (RAG)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  data-testid="input-qa-query"
                  placeholder="Ask a question about your knowledge base..."
                  value={qaQuery}
                  onChange={(e) => setQaQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleQA()}
                />
                <Button onClick={handleQA} disabled={isAsking || !qaQuery.trim()} data-testid="button-ask">
                  {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              {qaResult && (
                <Card className="bg-muted/50">
                  <CardContent className="py-3 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-4 h-4 text-primary" />
                      <span className="text-xs font-medium">AI Answer</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{qaResult.answer}</p>
                    {qaResult.sources.length > 0 && (
                      <>
                        <Separator className="my-2" />
                        <div className="text-[10px] text-muted-foreground">
                          Based on {qaResult.sources.length} relevant chunks
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coverage" className="mt-4 space-y-4">
          {coverageLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : !ontologyCoverage || ontologyCoverage.totalConcepts === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-12 text-center">
                <CircleDot className="w-10 h-10 text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">No Ontology Concepts Found</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  No ontology concepts are defined for this knowledge base's industry. Add concepts in the Ontology section to enable coverage analysis.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card data-testid="card-coverage-summary">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CircleDot className="w-4 h-4" /> Ontology Concept Coverage
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className={
                        ontologyCoverage.coveragePercent >= 80
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : ontologyCoverage.coveragePercent >= 50
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      }
                      data-testid="badge-coverage-level"
                    >
                      {ontologyCoverage.coveragePercent >= 80 ? (
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                      ) : ontologyCoverage.coveragePercent >= 50 ? (
                        <AlertTriangle className="w-3 h-3 mr-1" />
                      ) : (
                        <XCircle className="w-3 h-3 mr-1" />
                      )}
                      {ontologyCoverage.coveragePercent}% Coverage
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Progress
                    value={ontologyCoverage.coveragePercent}
                    className="h-2"
                    data-testid="progress-coverage"
                  />
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span data-testid="text-total-concepts">{ontologyCoverage.totalConcepts} total concepts</span>
                    <span data-testid="text-covered-concepts" className="text-green-600 dark:text-green-400">{ontologyCoverage.coveredConcepts} covered</span>
                    <span data-testid="text-uncovered-concepts" className="text-red-600 dark:text-red-400">{ontologyCoverage.uncoveredConcepts} uncovered</span>
                  </div>
                </CardContent>
              </Card>

              {ontologyCoverage.gaps.length > 0 && (
                <Card data-testid="card-coverage-gaps">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" /> Uncovered Concepts ({ontologyCoverage.gaps.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[400px]">
                      {(() => {
                        const grouped: Record<string, typeof ontologyCoverage.gaps> = {};
                        for (const gap of ontologyCoverage.gaps) {
                          if (!grouped[gap.category]) grouped[gap.category] = [];
                          grouped[gap.category].push(gap);
                        }
                        return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, items]) => (
                          <div key={category} className="mb-4 last:mb-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="secondary" className="text-[10px]">{category}</Badge>
                              <span className="text-xs text-muted-foreground">{items.length} concept{items.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="space-y-1.5 ml-1">
                              {items.map((gap) => (
                                <div key={gap.conceptId} className="flex items-start gap-2" data-testid={`gap-concept-${gap.conceptId}`}>
                                  <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                                  <div className="min-w-0">
                                    <span className="text-sm font-medium">{gap.label}</span>
                                    {gap.description && (
                                      <p className="text-xs text-muted-foreground line-clamp-2">{gap.description}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {ontologyCoverage.covered.length > 0 && (
                <Card data-testid="card-coverage-covered">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" /> Covered Concepts ({ontologyCoverage.covered.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[400px]">
                      {(() => {
                        const grouped: Record<string, typeof ontologyCoverage.covered> = {};
                        for (const item of ontologyCoverage.covered) {
                          if (!grouped[item.category]) grouped[item.category] = [];
                          grouped[item.category].push(item);
                        }
                        return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, items]) => (
                          <div key={category} className="mb-4 last:mb-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="secondary" className="text-[10px]">{category}</Badge>
                              <span className="text-xs text-muted-foreground">{items.length} concept{items.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="space-y-1.5 ml-1">
                              {items.map((item) => (
                                <div key={item.conceptId} className="flex items-center gap-2" data-testid={`covered-concept-${item.conceptId}`}>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                  <span className="text-sm font-medium">{item.label}</span>
                                  <span className="text-xs text-muted-foreground">({item.sourceCount} source{item.sourceCount !== 1 ? "s" : ""})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Knowledge Base Configuration</CardTitle>
                {!configEditing ? (
                  <Button size="sm" variant="outline" onClick={() => { setConfigForm({ vectorDbType: kb.vectorDbType, embeddingModel: kb.embeddingModel, embeddingDimensions: kb.embeddingDimensions, chunkSize: kb.chunkSize, chunkOverlap: kb.chunkOverlap, vectorDbConfig: kb.vectorDbConfig, stalenessThresholdDays: kb.stalenessThresholdDays ?? 90 }); setConfigEditing(true); }} data-testid="button-edit-config">
                    <Settings className="w-3.5 h-3.5 mr-1.5" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setConfigEditing(false)}>Cancel</Button>
                    <Button size="sm" onClick={() => updateConfigMutation.mutate(configForm)} disabled={updateConfigMutation.isPending} data-testid="button-save-config">
                      {updateConfigMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Save
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Vector Database</Label>
                  {configEditing ? (
                    <Select value={configForm.vectorDbType} onValueChange={(v) => setConfigForm({ ...configForm, vectorDbType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pgvector">PostgreSQL (pgvector) — Built-in</SelectItem>
                        <SelectItem value="pinecone">Pinecone</SelectItem>
                        <SelectItem value="weaviate">Weaviate</SelectItem>
                        <SelectItem value="qdrant">Qdrant</SelectItem>
                        <SelectItem value="chroma">Chroma</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm font-medium">{kb.vectorDbType === "pgvector" ? "PostgreSQL (pgvector) — Built-in" : kb.vectorDbType}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Embedding Model</Label>
                  {configEditing ? (
                    <Select value={configForm.embeddingModel} onValueChange={(v) => setConfigForm({ ...configForm, embeddingModel: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text-embedding-3-small">text-embedding-3-small (1536d)</SelectItem>
                        <SelectItem value="text-embedding-3-large">text-embedding-3-large (3072d)</SelectItem>
                        <SelectItem value="text-embedding-ada-002">text-embedding-ada-002 (1536d)</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm font-medium">{kb.embeddingModel}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Chunk Size (chars)</Label>
                  {configEditing ? (
                    <Input type="number" value={configForm.chunkSize} onChange={(e) => setConfigForm({ ...configForm, chunkSize: parseInt(e.target.value) || 512 })} />
                  ) : (
                    <p className="text-sm font-medium">{kb.chunkSize}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Chunk Overlap (chars)</Label>
                  {configEditing ? (
                    <Input type="number" value={configForm.chunkOverlap} onChange={(e) => setConfigForm({ ...configForm, chunkOverlap: parseInt(e.target.value) || 50 })} />
                  ) : (
                    <p className="text-sm font-medium">{kb.chunkOverlap}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Embedding Dimensions</Label>
                  <p className="text-sm font-medium">{kb.embeddingDimensions}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Staleness Threshold (days)</Label>
                  {configEditing ? (
                    <Input
                      type="number"
                      value={configForm.stalenessThresholdDays}
                      onChange={(e) => setConfigForm({ ...configForm, stalenessThresholdDays: parseInt(e.target.value) || 90 })}
                      data-testid="input-staleness-threshold"
                    />
                  ) : (
                    <p className="text-sm font-medium" data-testid="text-staleness-threshold">{kb.stalenessThresholdDays ?? 90} days</p>
                  )}
                </div>
              </div>

              {configEditing && configForm.vectorDbType !== "pgvector" && (
                <div className="mt-4 p-3 border rounded-md bg-muted/50">
                  <Label className="text-xs text-muted-foreground">External Vector DB Configuration (JSON)</Label>
                  <Textarea
                    className="font-mono text-xs mt-1"
                    rows={4}
                    value={JSON.stringify(configForm.vectorDbConfig || {}, null, 2)}
                    onChange={(e) => {
                      try { setConfigForm({ ...configForm, vectorDbConfig: JSON.parse(e.target.value) }); } catch {}
                    }}
                    placeholder='{"apiKey": "...", "environment": "...", "index": "..."}'
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Provide connection details for your external vector database</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Gauge className="w-4 h-4" /> RAG Pipeline Auto-Tuning
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => autoTuneMutation.mutate()} disabled={autoTuneMutation.isPending} data-testid="button-auto-tune">
                  {autoTuneMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                  Run Auto-Tune Analysis
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Analyzes recent retrieval quality metrics and recommends optimal chunk size, overlap, and topK settings</p>
            </CardHeader>
            <CardContent>
              {tuningResult ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-3 rounded-md bg-muted/50 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Runs Analyzed</p>
                      <p className="text-lg font-semibold" data-testid="text-analyzed-runs">{tuningResult.analyzedRuns}</p>
                    </div>
                    <div className="p-3 rounded-md bg-muted/50 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Similarity</p>
                      <p className="text-lg font-semibold" data-testid="text-avg-similarity">{tuningResult.metrics.avgSimilarity.toFixed(3)}</p>
                    </div>
                    <div className="p-3 rounded-md bg-muted/50 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Utilization</p>
                      <p className="text-lg font-semibold" data-testid="text-utilization">{tuningResult.metrics.retrievalUtilization}%</p>
                    </div>
                    <div className="p-3 rounded-md bg-muted/50 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Overflows</p>
                      <p className={`text-lg font-semibold ${tuningResult.metrics.overflowCount > 0 ? "text-red-600 dark:text-red-400" : ""}`} data-testid="text-overflow-count">{tuningResult.metrics.overflowCount}</p>
                    </div>
                  </div>

                  {tuningResult.recommendations.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium">Recommendations</p>
                      {tuningResult.recommendations.map((rec, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-md border bg-card" data-testid={`tuning-rec-${idx}`}>
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{rec.parameter}</span>
                              <Badge variant="outline" className={`text-[10px] ${rec.confidence === "high" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"}`}>
                                {rec.confidence} confidence
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{rec.reason}</p>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground">Current: <span className="font-medium text-foreground">{rec.currentValue}</span></span>
                              <TrendingUp className="w-3 h-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Recommended: <span className="font-medium text-green-700 dark:text-green-400">{rec.recommendedValue}</span></span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-3 shrink-0"
                            disabled={applyTuningMutation.isPending}
                            onClick={() => applyTuningMutation.mutate({ [rec.parameter]: rec.recommendedValue })}
                            data-testid={`button-apply-rec-${idx}`}
                          >
                            {applyTuningMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {tuningResult.analyzedRuns < 5
                          ? "Not enough runs to generate recommendations (need at least 5)"
                          : "Current configuration looks optimal — no changes recommended"}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Gauge className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Run an analysis to get RAG pipeline tuning recommendations based on recent retrieval quality metrics</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="mt-4 space-y-4">
          {usageLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : usageAnalytics ? (
            <>
              <div className="grid grid-cols-4 gap-3">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Sources</p>
                    <p className="text-2xl font-semibold" data-testid="text-total-sources">{usageAnalytics.summary.totalSources}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Sources</p>
                    <p className="text-2xl font-semibold text-green-600 dark:text-green-400" data-testid="text-active-sources">{usageAnalytics.summary.activeSources}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Dead Sources</p>
                    <p className={`text-2xl font-semibold ${usageAnalytics.summary.deadSources > 0 ? "text-amber-600 dark:text-amber-400" : ""}`} data-testid="text-dead-sources">{usageAnalytics.summary.deadSources}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Retrievals</p>
                    <p className="text-2xl font-semibold" data-testid="text-total-retrievals">{usageAnalytics.summary.totalRetrievals}</p>
                  </CardContent>
                </Card>
              </div>

              {usageAnalytics.deadSources.length > 0 && (
                <Alert variant="destructive" className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300" data-testid="alert-dead-knowledge">
                  <Archive className="w-4 h-4" />
                  <AlertDescription className="text-sm">
                    <span className="font-medium">{usageAnalytics.deadSources.length} dead knowledge source{usageAnalytics.deadSources.length !== 1 ? "s" : ""} detected</span> — processed but never retrieved by any agent. Consider reviewing or removing these sources to keep the knowledge base lean.
                  </AlertDescription>
                </Alert>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Per-Source Retrieval Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {usageAnalytics.sources.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No sources in this knowledge base</p>
                    ) : (
                      usageAnalytics.sources
                        .sort((a, b) => b.retrievalCount - a.retrievalCount)
                        .map((source) => {
                          const maxCount = Math.max(...usageAnalytics.sources.map(s => s.retrievalCount), 1);
                          const isDead = usageAnalytics.deadSources.some(d => d.sourceId === source.sourceId);
                          return (
                            <div key={source.sourceId} className={`flex items-center gap-3 p-2 rounded-md ${isDead ? "bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-800/30" : "bg-muted/30"}`} data-testid={`source-usage-${source.sourceId}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{source.name}</span>
                                  {isDead && (
                                    <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 shrink-0" data-testid={`badge-dead-${source.sourceId}`}>
                                      <Archive className="w-2.5 h-2.5 mr-1" /> Dead Knowledge
                                    </Badge>
                                  )}
                                  <StatusBadge status={source.status} />
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                                  <span>{source.chunkCount} chunks</span>
                                  {source.lastRetrievedAt && (
                                    <span>Last retrieved: {new Date(source.lastRetrievedAt).toLocaleDateString()}</span>
                                  )}
                                  {!source.lastRetrievedAt && source.processedAt && (
                                    <span>Processed {daysSinceProcessed(source.processedAt)} days ago, never retrieved</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="w-24">
                                  <Progress value={maxCount > 0 ? (source.retrievalCount / maxCount) * 100 : 0} className="h-1.5" />
                                </div>
                                <span className="text-sm font-mono font-medium w-12 text-right" data-testid={`count-${source.sourceId}`}>{source.retrievalCount}</span>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center py-8 text-center">
                <BarChart3 className="w-8 h-8 text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">Usage Analytics</h3>
                <p className="text-sm text-muted-foreground">Loading usage data...</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="agents" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Agents linked to this knowledge base will use it for RAG grounding.</p>
            <Dialog open={linkAgentOpen} onOpenChange={setLinkAgentOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-link-agent">
                  <Link2 className="w-4 h-4 mr-2" /> Link Agent
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Link an Agent</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Label>Select Agent</Label>
                  <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                    <SelectTrigger data-testid="select-link-agent">
                      <SelectValue placeholder="Choose an agent..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAgents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button onClick={() => linkAgentMutation.mutate(selectedAgentId)} disabled={!selectedAgentId || linkAgentMutation.isPending} data-testid="button-submit-link-agent">
                    {linkAgentMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Link
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {agentLinks.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-12 text-center">
                <Bot className="w-10 h-10 text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">No Linked Agents</h3>
                <p className="text-sm text-muted-foreground">Link agents to this knowledge base so they can use it for RAG grounding at runtime.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {agentLinks.map((link: any) => {
                const agent = allAgents.find((a) => a.id === link.agentId);
                return (
                  <Card key={link.id}>
                    <CardContent className="flex items-center gap-3 py-3">
                      <div className="p-2 rounded-md bg-muted shrink-0">
                        <Bot className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{agent?.name || link.agentId}</span>
                        <div className="text-xs text-muted-foreground">Priority: {link.priority}</div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => unlinkAgentMutation.mutate({ agentId: link.agentId, linkId: link.id })} data-testid={`button-unlink-${link.id}`}>
                        <Unlink className="w-3.5 h-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="eval-gaps" className="mt-4 space-y-4">
          <EvalKbGapsSection kbId={kbId!} agentLinks={agentLinks} />
        </TabsContent>
      </Tabs>

      <Dialog open={sensitivityDialogOpen} onOpenChange={setSensitivityDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Sensitivity Warnings Detected
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The uploaded content contains sensitive data that may require additional policy coverage. The following issues were detected:
            </p>
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {sensitivityWarnings.map((warning, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-md bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 space-y-1.5"
                    data-testid={`sensitivity-warning-${idx}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        {warning.sensitivityClass}
                      </Badge>
                      <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                        {warning.regulation}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Agent <span className="font-medium text-foreground">{warning.agentName}</span> is linked to this KB but lacks a <span className="font-medium text-foreground">{warning.missingPolicyDomain}</span> policy for {warning.regulation} compliance.
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {warning.termsFound.map((term, ti) => (
                        <Badge key={ti} variant="secondary" className="text-[10px]" data-testid={`sensitivity-term-${idx}-${ti}`}>
                          {term}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <Alert variant="destructive" className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription className="text-xs">
                The source has been uploaded and processing will continue. Please ensure appropriate data handling policies are in place for linked agents before deploying to production.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSensitivityDialogOpen(false);
                setSensitivityWarnings([]);
              }}
              data-testid="button-sensitivity-cancel"
            >
              Review Later
            </Button>
            <Button
              onClick={() => {
                setSensitivityDialogOpen(false);
                setSensitivityWarnings([]);
                toast({ title: "Source uploaded with acknowledgment", description: "Sensitivity warnings acknowledged. Ensure policies are updated." });
              }}
              data-testid="button-sensitivity-acknowledge"
            >
              Acknowledge & Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editInfoOpen} onOpenChange={setEditInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Knowledge Base</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <Label>Name</Label>
              <Input value={editInfoForm.name} onChange={(e) => setEditInfoForm({ ...editInfoForm, name: e.target.value })} data-testid="input-edit-kb-name" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={editInfoForm.description} onChange={(e) => setEditInfoForm({ ...editInfoForm, description: e.target.value })} rows={3} data-testid="input-edit-kb-description" />
            </div>
            <div>
              <Label>Industry</Label>
              <Select value={editInfoForm.industry} onValueChange={(v) => setEditInfoForm({ ...editInfoForm, industry: v })}>
                <SelectTrigger data-testid="select-edit-kb-industry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="financial_services">Financial Services</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="technology">Technology/SaaS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={() => editInfoMutation.mutate(editInfoForm)} disabled={editInfoMutation.isPending || !editInfoForm.name.trim()} data-testid="button-save-edit-kb">
              {editInfoMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteKbOpen} onOpenChange={setDeleteKbOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Knowledge Base</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{kb.name}" along with all its sources, chunks, and embeddings. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-kb">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteKbMutation.mutate()}
              disabled={deleteKbMutation.isPending}
              data-testid="button-confirm-delete-kb"
            >
              {deleteKbMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface EvalKbGap {
  failedCaseId: string;
  inputSummary: string;
  failingReason: string;
  severity: string;
  missingTerms: string[];
  suggestedKbAction: string;
  linkedKbIds: string[];
}

interface EvalKbGapsResponse {
  agentId: string;
  totalFailedCases: number;
  analyzedCases: number;
  gaps: EvalKbGap[];
  summary: {
    totalGapsIdentified: number;
    topMissingTopics: string[];
    recommendedActions: string[];
  };
}

function EvalKbGapsSection({ kbId, agentLinks }: { kbId: string; agentLinks: any[] }) {
  const agentIds = agentLinks.map((l: any) => l.agentId);

  const { data: gapResults = [], isLoading } = useQuery<Array<{ agentId: string; agentName: string; data: EvalKbGapsResponse }>>({
    queryKey: ["/api/knowledge-bases", kbId, "eval-kb-gaps", agentIds],
    queryFn: async () => {
      const results: Array<{ agentId: string; agentName: string; data: EvalKbGapsResponse }> = [];
      for (const agentId of agentIds) {
        try {
          const res = await fetch(`/api/agents/${agentId}/eval-kb-gaps`);
          if (res.ok) {
            const data = await res.json();
            const relevantGaps = data.gaps.filter((g: EvalKbGap) =>
              g.linkedKbIds.includes(kbId) || g.linkedKbIds.length === 0
            );
            if (relevantGaps.length > 0 || data.totalFailedCases > 0) {
              results.push({ agentId, agentName: agentId, data: { ...data, gaps: relevantGaps } });
            }
          }
        } catch {}
      }
      return results;
    },
    enabled: agentIds.length > 0,
  });

  if (agentIds.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-8 text-center">
          <Bot className="w-8 h-8 text-muted-foreground mb-3" />
          <h3 className="font-medium mb-1">No Linked Agents</h3>
          <p className="text-sm text-muted-foreground">Link agents to this knowledge base first, then eval failures will be analyzed for KB gaps.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const totalGaps = gapResults.reduce((sum, r) => sum + r.data.gaps.length, 0);

  if (totalGaps === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-green-500 mb-3" />
          <h3 className="font-medium mb-1">No KB Gaps Identified</h3>
          <p className="text-sm text-muted-foreground">
            {gapResults.length === 0
              ? "No eval failures found for linked agents."
              : "All eval failure topics appear to be covered by this knowledge base."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold" data-testid="text-eval-gaps-title">KB Gaps from Eval Failures</h3>
          <p className="text-xs text-muted-foreground">Topics from eval failures that could be addressed by enriching this knowledge base</p>
        </div>
        <Badge variant="destructive" data-testid="badge-total-gaps">{totalGaps} gap{totalGaps !== 1 ? "s" : ""}</Badge>
      </div>

      {gapResults.map((result) => (
        <Card key={result.agentId} data-testid={`card-eval-gaps-${result.agentId}`}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm">Agent: {result.agentName}</CardTitle>
                <Badge variant="outline" className="text-[10px]">{result.data.totalFailedCases} failures analyzed</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.data.summary.topMissingTopics.length > 0 && (
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">Top Missing Topics</p>
                <div className="flex flex-wrap gap-1">
                  {result.data.summary.topMissingTopics.map((topic, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" data-testid={`badge-missing-topic-${i}`}>
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {result.data.summary.recommendedActions.length > 0 && (
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Recommended Actions</p>
                <ul className="space-y-0.5">
                  {result.data.summary.recommendedActions.map((action, i) => (
                    <li key={i} className="text-xs flex items-start gap-1.5">
                      <Lightbulb className="w-3 h-3 mt-0.5 text-amber-500 shrink-0" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              {result.data.gaps.slice(0, 10).map((gap, idx) => (
                <div key={gap.failedCaseId} className="p-2 rounded-md bg-muted/30 space-y-1.5" data-testid={`gap-item-${gap.failedCaseId}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-medium truncate flex-1">{gap.inputSummary}</span>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${
                      gap.severity === "high" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" :
                      gap.severity === "medium" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" :
                      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                    }`} data-testid={`badge-gap-severity-${idx}`}>
                      {gap.severity}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{gap.failingReason}</p>
                  {gap.missingTerms.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {gap.missingTerms.slice(0, 8).map((term, ti) => (
                        <Badge key={ti} variant="secondary" className="text-[9px]">{term}</Badge>
                      ))}
                      {gap.missingTerms.length > 8 && (
                        <Badge variant="secondary" className="text-[9px]">+{gap.missingTerms.length - 8} more</Badge>
                      )}
                    </div>
                  )}
                  <p className="text-[11px] text-green-700 dark:text-green-400">{gap.suggestedKbAction}</p>
                </div>
              ))}
              {result.data.gaps.length > 10 && (
                <p className="text-xs text-muted-foreground text-center">...and {result.data.gaps.length - 10} more gaps</p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
