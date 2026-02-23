import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
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
import {
  ArrowLeft, Upload, Globe, FileText, Layers, Database, Search,
  Plus, Loader2, Trash2, RefreshCw, CheckCircle2, XCircle,
  Clock, Bot, Link2, Unlink, Settings, MessageSquare,
  BookOpen, Brain, AlignLeft, Table2, Send,
} from "lucide-react";

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

const SOURCE_TYPE_CONFIG: Record<string, { label: string; icon: typeof FileText }> = {
  document: { label: "Document", icon: FileText },
  url: { label: "Web URL", icon: Globe },
  text: { label: "Manual Text", icon: AlignLeft },
  structured: { label: "Structured Data", icon: Table2 },
  api: { label: "API Connector", icon: Database },
};

export default function KnowledgeBaseDetail() {
  const [, params] = useRoute("/knowledge-bases/:id");
  const kbId = params?.id;
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("sources");
  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [addTextOpen, setAddTextOpen] = useState(false);
  const [addStructuredOpen, setAddStructuredOpen] = useState(false);
  const [urlForm, setUrlForm] = useState({ url: "", name: "" });
  const [textForm, setTextForm] = useState({ title: "", content: "" });
  const [structuredForm, setStructuredForm] = useState({ name: "", data: "" });
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
    enabled: !!kbId && activeTab === "agents",
  });

  const { data: allAgents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    enabled: linkAgentOpen,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      toast({ title: "File uploaded", description: "Processing will begin shortly" });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const addUrlMutation = useMutation({
    mutationFn: async (data: { url: string; name: string }) => {
      const res = await apiRequest("POST", `/api/knowledge-bases/${kbId}/sources/url`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      setAddUrlOpen(false);
      setUrlForm({ url: "", name: "" });
      toast({ title: "URL added", description: "Content will be fetched and processed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addTextMutation = useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
      const res = await apiRequest("POST", `/api/knowledge-bases/${kbId}/sources/text`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      setAddTextOpen(false);
      setTextForm({ title: "", content: "" });
      toast({ title: "Text added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addStructuredMutation = useMutation({
    mutationFn: async (payload: { name: string; data: any }) => {
      const res = await apiRequest("POST", `/api/knowledge-bases/${kbId}/sources/structured`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases", kbId] });
      setAddStructuredOpen(false);
      setStructuredForm({ name: "", data: "" });
      toast({ title: "Structured data imported" });
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <div className="text-center px-3">
            <div className="font-semibold text-base text-foreground" data-testid="text-total-sources">{kb.totalSources}</div>
            <div>Sources</div>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <div className="text-center px-3">
            <div className="font-semibold text-base text-foreground" data-testid="text-total-chunks">{kb.totalChunks}</div>
            <div>Chunks</div>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <div className="text-center px-3">
            <div className="font-semibold text-xs text-foreground">{kb.vectorDbType}</div>
            <div>Vector DB</div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-kb-detail">
          <TabsTrigger value="sources" data-testid="tab-sources">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Sources ({sources.length})
          </TabsTrigger>
          <TabsTrigger value="chunks" data-testid="tab-chunks">
            <Layers className="w-3.5 h-3.5 mr-1.5" /> Chunks ({kb.totalChunks})
          </TabsTrigger>
          <TabsTrigger value="search" data-testid="tab-search">
            <Search className="w-3.5 h-3.5 mr-1.5" /> Search & Query
          </TabsTrigger>
          <TabsTrigger value="config" data-testid="tab-config">
            <Settings className="w-3.5 h-3.5 mr-1.5" /> Configuration
          </TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents">
            <Bot className="w-3.5 h-3.5 mr-1.5" /> Linked Agents
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
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button onClick={() => addUrlMutation.mutate(urlForm)} disabled={!urlForm.url || addUrlMutation.isPending} data-testid="button-submit-url">
                    {addUrlMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Add
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
                    <Input value={structuredForm.name} onChange={(e) => setStructuredForm({ ...structuredForm, name: e.target.value })} placeholder="e.g., Product Catalog" />
                  </div>
                  <div>
                    <Label>JSON Data (array of objects)</Label>
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
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{source.name}</span>
                          <StatusBadge status={source.status} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{typeConfig.label}</span>
                          {source.fileSize && <span>{(source.fileSize / 1024).toFixed(1)} KB</span>}
                          {source.chunkCount > 0 && <span>{source.chunkCount} chunks</span>}
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

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Knowledge Base Configuration</CardTitle>
                {!configEditing ? (
                  <Button size="sm" variant="outline" onClick={() => { setConfigForm({ vectorDbType: kb.vectorDbType, embeddingModel: kb.embeddingModel, embeddingDimensions: kb.embeddingDimensions, chunkSize: kb.chunkSize, chunkOverlap: kb.chunkOverlap, vectorDbConfig: kb.vectorDbConfig }); setConfigEditing(true); }} data-testid="button-edit-config">
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
      </Tabs>
    </div>
  );
}
