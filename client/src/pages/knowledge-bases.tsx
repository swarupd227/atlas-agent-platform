import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import type { KnowledgeBase } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Search, Plus, Database, FileText, Globe, Layers,
  BookOpen, Brain, ChevronRight, Loader2, Trash2,
  Building2, Briefcase, Heart, Factory, Shield, ShoppingCart,
} from "lucide-react";

const INDUSTRY_CONFIG: Record<string, { label: string; icon: typeof Building2; color: string }> = {
  general: { label: "General", icon: Building2, color: "text-gray-600 dark:text-gray-400" },
  financial_services: { label: "Financial Services", icon: Briefcase, color: "text-blue-600 dark:text-blue-400" },
  healthcare: { label: "Healthcare", icon: Heart, color: "text-rose-600 dark:text-rose-400" },
  manufacturing: { label: "Manufacturing", icon: Factory, color: "text-amber-600 dark:text-amber-400" },
  insurance: { label: "Insurance", icon: Shield, color: "text-indigo-600 dark:text-indigo-400" },
  retail: { label: "Retail", icon: ShoppingCart, color: "text-emerald-600 dark:text-emerald-400" },
  technology: { label: "Technology/SaaS", icon: Brain, color: "text-purple-600 dark:text-purple-400" },
};

const VECTOR_DB_LABELS: Record<string, string> = {
  pgvector: "PostgreSQL (pgvector)",
  pinecone: "Pinecone",
  weaviate: "Weaviate",
  qdrant: "Qdrant",
  chroma: "Chroma",
};

export default function KnowledgeBases() {
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [newKb, setNewKb] = useState({ name: "", description: "", industry: "general", vectorDbType: "pgvector", embeddingModel: "text-embedding-3-small", chunkSize: 512, chunkOverlap: 50 });
  const { toast } = useToast();

  const { data: knowledgeBases = [], isLoading } = useQuery<KnowledgeBase[]>({
    queryKey: ["/api/knowledge-bases"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newKb) => {
      const res = await apiRequest("POST", "/api/knowledge-bases", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases"] });
      setCreateOpen(false);
      setNewKb({ name: "", description: "", industry: "general", vectorDbType: "pgvector", embeddingModel: "text-embedding-3-small", chunkSize: 512, chunkOverlap: 50 });
      toast({ title: "Knowledge Base created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/knowledge-bases/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases"] });
      toast({ title: "Knowledge Base deleted" });
    },
  });

  const filtered = knowledgeBases.filter((kb) => {
    const matchSearch = kb.name.toLowerCase().includes(search.toLowerCase()) || (kb.description || "").toLowerCase().includes(search.toLowerCase());
    const matchIndustry = industryFilter === "all" || kb.industry === industryFilter;
    return matchSearch && matchIndustry;
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Knowledge Bases</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage document collections for agent RAG grounding</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-kb">
              <Plus className="w-4 h-4 mr-2" /> New Knowledge Base
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Knowledge Base</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input data-testid="input-kb-name" value={newKb.name} onChange={(e) => setNewKb({ ...newKb, name: e.target.value })} placeholder="e.g., Product Documentation" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea data-testid="input-kb-description" value={newKb.description} onChange={(e) => setNewKb({ ...newKb, description: e.target.value })} placeholder="What knowledge does this base contain?" rows={3} />
              </div>
              <div>
                <Label>Industry</Label>
                <Select value={newKb.industry} onValueChange={(v) => setNewKb({ ...newKb, industry: v })}>
                  <SelectTrigger data-testid="select-kb-industry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(INDUSTRY_CONFIG).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vector Database</Label>
                <Select value={newKb.vectorDbType} onValueChange={(v) => setNewKb({ ...newKb, vectorDbType: v })}>
                  <SelectTrigger data-testid="select-kb-vectordb">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(VECTOR_DB_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">pgvector is built-in and requires no setup</p>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button data-testid="button-submit-kb" onClick={() => createMutation.mutate(newKb)} disabled={!newKb.name || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input data-testid="input-search-kb" className="pl-9" placeholder="Search knowledge bases..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={industryFilter} onValueChange={setIndustryFilter}>
          <SelectTrigger className="w-48" data-testid="select-filter-industry">
            <SelectValue placeholder="All Industries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Industries</SelectItem>
            {Object.entries(INDUSTRY_CONFIG).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Knowledge Bases Yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create a knowledge base to store documents, web content, and structured data for agent RAG grounding.
            </p>
            <Button onClick={() => setCreateOpen(true)} data-testid="button-create-kb-empty">
              <Plus className="w-4 h-4 mr-2" /> Create Your First Knowledge Base
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((kb) => {
            const ind = INDUSTRY_CONFIG[kb.industry] || INDUSTRY_CONFIG.general;
            const IndustryIcon = ind.icon;
            return (
              <Link key={kb.id} href={`/knowledge-bases/${kb.id}`}>
                <Card className="cursor-pointer hover:border-primary/50 transition-colors group" data-testid={`card-kb-${kb.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-2 rounded-md bg-primary/10 shrink-0">
                          <BookOpen className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-medium truncate" data-testid={`text-kb-name-${kb.id}`}>{kb.name}</CardTitle>
                          <div className="flex items-center gap-1 mt-0.5">
                            <IndustryIcon className={`w-3 h-3 ${ind.color}`} />
                            <span className="text-xs text-muted-foreground">{ind.label}</span>
                          </div>
                        </div>
                      </div>
                      <Badge variant={kb.status === "active" ? "default" : "secondary"} className="text-[10px] shrink-0">
                        {kb.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {kb.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{kb.description}</p>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center p-2 rounded-md bg-muted/50">
                        <FileText className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
                        <div className="text-sm font-medium" data-testid={`text-kb-sources-${kb.id}`}>{kb.totalSources}</div>
                        <div className="text-[10px] text-muted-foreground">Sources</div>
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/50">
                        <Layers className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
                        <div className="text-sm font-medium" data-testid={`text-kb-chunks-${kb.id}`}>{kb.totalChunks}</div>
                        <div className="text-[10px] text-muted-foreground">Chunks</div>
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/50">
                        <Database className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
                        <div className="text-[10px] font-medium">{kb.vectorDbType}</div>
                        <div className="text-[10px] text-muted-foreground">Vector DB</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                      <span>{kb.embeddingModel}</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
