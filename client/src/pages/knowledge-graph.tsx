import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useIndustry } from "@/components/industry-provider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Database, Plus, Search, RefreshCw, FileText, Server, Globe,
  CheckCircle, XCircle, Clock, Activity, AlertTriangle,
  Link2, GitBranch, Users, Shield, Loader2, Trash2, Eye,
  ArrowRight, Calendar, Filter, Layers, Sparkles, Network,
  BarChart3, ArrowUpRight, ArrowDownRight, Pencil,
  Lightbulb, Wand2, BrainCircuit, Zap, Target, TrendingUp,
} from "lucide-react";

type ConnectorView = {
  id: string;
  name: string;
  sourceType: string;
  description: string | null;
  industry: string;
  connectionConfig: any;
  entitiesIngested: number;
  relationshipsMapped: number;
  lastSyncAt: string | null;
  syncStatus: string;
  qualityMetrics: any;
  errorMessage: string | null;
  status: string;
  createdAt: string;
};

type ResolutionView = {
  id: string;
  entityA: string;
  sourceA: string;
  entityB: string;
  sourceB: string;
  entityType: string;
  confidenceScore: number;
  resolutionStatus: string;
  resolvedBy: string | null;
  industry: string;
  metadata: any;
  createdAt: string;
};

type ExtractionView = {
  id: string;
  sourceDocument: string;
  sourceEntity: string;
  targetEntity: string;
  relationshipType: string;
  confidence: number;
  extractedText: string | null;
  validFrom: string | null;
  validTo: string | null;
  status: string;
  industry: string;
  metadata: any;
  createdAt: string;
};

type TemporalView = {
  id: string;
  entityName: string;
  entityType: string;
  relatedEntity: string | null;
  relationshipType: string | null;
  validFrom: string;
  validTo: string | null;
  properties: any;
  source: string | null;
  industry: string;
  createdAt: string;
};

const CONNECTOR_TYPES = [
  { value: "document_repository", label: "Document Repository", icon: FileText, desc: "PDFs, policies, procedures" },
  { value: "structured_database", label: "Structured Database", icon: Database, desc: "Via MCP resources" },
  { value: "api", label: "API", icon: Globe, desc: "Real-time entity enrichment" },
  { value: "manual_entry", label: "Manual Entry", icon: Pencil, desc: "Manual data input" },
];

const ENTITY_TYPES = ["organization", "person", "product", "regulation", "location"];

const RELATIONSHIP_TYPES = [
  "is-regulated-by", "is-subsidiary-of", "is-managed-by", "reports-to",
  "is-counterparty-to", "covers-risk", "applies-to", "is-part-of",
  "supersedes", "depends-on", "is-effective-from",
];

const SEED_CONNECTORS: Omit<ConnectorView, "id" | "createdAt">[] = [
  {
    name: "Regulatory Filing Repository",
    sourceType: "document_repository",
    description: "SEC filings, compliance documents, and regulatory correspondence auto-extracted via LLM",
    industry: "financial_services",
    connectionConfig: { path: "/data/regulatory", format: "pdf", llmExtractor: "gpt-4o" },
    entitiesIngested: 2847,
    relationshipsMapped: 1293,
    lastSyncAt: new Date(Date.now() - 3600000).toISOString(),
    syncStatus: "completed",
    qualityMetrics: { accuracy: 94.2, completeness: 87.5, freshness: 96.1 },
    errorMessage: null,
    status: "active",
  },
  {
    name: "CRM Database",
    sourceType: "structured_database",
    description: "Customer relationship management system with entity and counterparty data via MCP resources",
    industry: "financial_services",
    connectionConfig: { host: "crm.internal", protocol: "mcp", schema: "public" },
    entitiesIngested: 15420,
    relationshipsMapped: 8730,
    lastSyncAt: new Date(Date.now() - 900000).toISOString(),
    syncStatus: "completed",
    qualityMetrics: { accuracy: 98.1, completeness: 95.3, freshness: 99.2 },
    errorMessage: null,
    status: "active",
  },
  {
    name: "Market Data API",
    sourceType: "api",
    description: "Real-time entity enrichment from market data providers for counterparty and instrument data",
    industry: "financial_services",
    connectionConfig: { endpoint: "https://api.marketdata.io/v2", apiKey: "***", refreshInterval: 300 },
    entitiesIngested: 45230,
    relationshipsMapped: 12100,
    lastSyncAt: new Date(Date.now() - 300000).toISOString(),
    syncStatus: "syncing",
    qualityMetrics: { accuracy: 96.7, completeness: 82.4, freshness: 99.8 },
    errorMessage: null,
    status: "active",
  },
  {
    name: "Policy Manual Entry",
    sourceType: "manual_entry",
    description: "Manually curated internal policies and compliance procedures added by compliance team",
    industry: "financial_services",
    connectionConfig: {},
    entitiesIngested: 340,
    relationshipsMapped: 187,
    lastSyncAt: new Date(Date.now() - 86400000).toISOString(),
    syncStatus: "idle",
    qualityMetrics: { accuracy: 99.5, completeness: 78.2, freshness: 72.0 },
    errorMessage: null,
    status: "active",
  },
];

const SEED_RESOLUTIONS: Omit<ResolutionView, "id" | "createdAt">[] = [
  { entityA: "JPMorgan Chase", sourceA: "CRM Database", entityB: "JP Morgan Chase & Co.", sourceB: "Regulatory Filing Repository", entityType: "organization", confidenceScore: 0.96, resolutionStatus: "matched", resolvedBy: "auto", industry: "financial_services", metadata: { matchFields: ["name", "ein", "address"] } },
  { entityA: "Goldman Sachs Group", sourceA: "Market Data API", entityB: "The Goldman Sachs Group, Inc.", sourceB: "Regulatory Filing Repository", entityType: "organization", confidenceScore: 0.93, resolutionStatus: "matched", resolvedBy: "auto", industry: "financial_services", metadata: { matchFields: ["name", "ticker"] } },
  { entityA: "Dodd-Frank Act", sourceA: "Policy Manual Entry", entityB: "Dodd-Frank Wall Street Reform", sourceB: "Regulatory Filing Repository", entityType: "regulation", confidenceScore: 0.78, resolutionStatus: "review", resolvedBy: null, industry: "financial_services", metadata: { matchFields: ["name"] } },
  { entityA: "BlackRock Inc", sourceA: "CRM Database", entityB: "BlackRock, Inc.", sourceB: "Market Data API", entityType: "organization", confidenceScore: 0.99, resolutionStatus: "matched", resolvedBy: "auto", industry: "financial_services", metadata: { matchFields: ["name", "lei"] } },
  { entityA: "SEC Rule 15c3-1", sourceA: "Regulatory Filing Repository", entityB: "Net Capital Rule", sourceB: "Policy Manual Entry", entityType: "regulation", confidenceScore: 0.65, resolutionStatus: "pending", resolvedBy: null, industry: "financial_services", metadata: { matchFields: ["description"] } },
  { entityA: "J. Smith", sourceA: "CRM Database", entityB: "John Smith", sourceB: "Policy Manual Entry", entityType: "person", confidenceScore: 0.42, resolutionStatus: "pending", resolvedBy: null, industry: "financial_services", metadata: { matchFields: ["name"] } },
];

const SEED_EXTRACTIONS: Omit<ExtractionView, "id" | "createdAt">[] = [
  { sourceDocument: "SEC Filing 10-K FY2024", sourceEntity: "Derivative Portfolio", targetEntity: "Basel III Framework", relationshipType: "is-regulated-by", confidence: 0.92, extractedText: "The derivative portfolio is subject to margin requirements under the Basel III framework...", validFrom: new Date("2024-01-01").toISOString(), validTo: null, status: "verified", industry: "financial_services", metadata: {} },
  { sourceDocument: "Compliance Policy CP-2024-031", sourceEntity: "Product X", targetEntity: "Regulation Y (Reg Y)", relationshipType: "is-regulated-by", confidence: 0.88, extractedText: "Product X is regulated by Regulation Y with effective date January 15, 2024", validFrom: new Date("2024-01-15").toISOString(), validTo: null, status: "verified", industry: "financial_services", metadata: { effectiveDate: "2024-01-15" } },
  { sourceDocument: "Corporate Structure Doc", sourceEntity: "Chase Bank NA", targetEntity: "JPMorgan Chase & Co.", relationshipType: "is-subsidiary-of", confidence: 0.97, extractedText: "Chase Bank, National Association, is a wholly-owned subsidiary of JPMorgan Chase & Co.", validFrom: new Date("2000-01-01").toISOString(), validTo: null, status: "verified", industry: "financial_services", metadata: {} },
  { sourceDocument: "Risk Assessment Report Q4", sourceEntity: "Lehman Brothers Holdings", targetEntity: "Credit Default Swaps", relationshipType: "is-counterparty-to", confidence: 0.85, extractedText: "Lehman Brothers Holdings was a major counterparty in credit default swap transactions...", validFrom: new Date("2005-01-01").toISOString(), validTo: new Date("2008-09-15").toISOString(), status: "verified", industry: "financial_services", metadata: {} },
  { sourceDocument: "New Reg Filing 2025", sourceEntity: "Digital Assets Rule", targetEntity: "Securities Act 1933", relationshipType: "supersedes", confidence: 0.71, extractedText: "The proposed Digital Assets Rule would supersede certain provisions of the Securities Act...", validFrom: null, validTo: null, status: "extracted", industry: "financial_services", metadata: {} },
  { sourceDocument: "Org Chart Update", sourceEntity: "Risk Committee", targetEntity: "Board of Directors", relationshipType: "reports-to", confidence: 0.95, extractedText: "The Risk Committee reports directly to the Board of Directors on all material risk matters.", validFrom: new Date("2023-06-01").toISOString(), validTo: null, status: "verified", industry: "financial_services", metadata: {} },
];

const SEED_TEMPORAL: Omit<TemporalView, "id" | "createdAt">[] = [
  { entityName: "Basel III Framework", entityType: "regulation", relatedEntity: "Global Banks", relationshipType: "applies-to", validFrom: new Date("2013-01-01").toISOString(), validTo: null, properties: { version: "3.1", jurisdiction: "Global" }, source: "Regulatory Filing Repository", industry: "financial_services" },
  { entityName: "JPMorgan Chase & Co.", entityType: "organization", relatedEntity: "Bear Stearns", relationshipType: "is-subsidiary-of", validFrom: new Date("2008-05-30").toISOString(), validTo: null, properties: { acquisitionType: "merger", value: "$1.2B" }, source: "CRM Database", industry: "financial_services" },
  { entityName: "Volcker Rule", entityType: "regulation", relatedEntity: "Proprietary Trading Desks", relationshipType: "is-regulated-by", validFrom: new Date("2014-04-01").toISOString(), validTo: null, properties: { section: "619 of Dodd-Frank" }, source: "Regulatory Filing Repository", industry: "financial_services" },
  { entityName: "LIBOR", entityType: "product", relatedEntity: "SOFR", relationshipType: "supersedes", validFrom: new Date("2023-06-30").toISOString(), validTo: new Date("2023-06-30").toISOString(), properties: { transitionDate: "June 30, 2023" }, source: "Market Data API", industry: "financial_services" },
  { entityName: "Dr. Sarah Chen", entityType: "person", relatedEntity: "Risk Committee", relationshipType: "is-managed-by", validFrom: new Date("2022-03-15").toISOString(), validTo: null, properties: { role: "Chair" }, source: "Policy Manual Entry", industry: "financial_services" },
];

function getConnectorIcon(type: string) {
  const t = CONNECTOR_TYPES.find((ct) => ct.value === type);
  return t ? t.icon : Database;
}

function formatDate(d: string | null) {
  if (!d) return "Never";
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function SyncStatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle }> = {
    completed: { variant: "default", icon: CheckCircle },
    syncing: { variant: "secondary", icon: RefreshCw },
    idle: { variant: "outline", icon: Clock },
    error: { variant: "destructive", icon: XCircle },
  };
  const c = config[status] || config.idle;
  return (
    <Badge variant={c.variant} data-testid={`badge-sync-${status}`}>
      <c.icon className="w-3 h-3 mr-1" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const variant = pct >= 90 ? "default" : pct >= 70 ? "secondary" : "destructive";
  return (
    <Badge variant={variant} data-testid={`badge-confidence-${pct}`}>
      {pct}%
    </Badge>
  );
}

function ResolutionStatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline" }> = {
    matched: { variant: "default" },
    pending: { variant: "outline" },
    review: { variant: "secondary" },
    rejected: { variant: "destructive" },
  };
  const c = config[status] || config.outline;
  return (
    <Badge variant={c.variant} data-testid={`badge-resolution-${status}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function ExtractionStatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline" }> = {
    verified: { variant: "default" },
    extracted: { variant: "secondary" },
    rejected: { variant: "destructive" },
  };
  const c = config[status] || { variant: "outline" as const };
  return (
    <Badge variant={c.variant} data-testid={`badge-extraction-${status}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function QualityMetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium">{value.toFixed(1)}%</span>
      </div>
      <Progress value={value} className="h-1.5" />
    </div>
  );
}

export default function KnowledgeGraphIngestion() {
  const { toast } = useToast();
  const { industry } = useIndustry();
  const [activeTab, setActiveTab] = useState("connectors");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddConnector, setShowAddConnector] = useState(false);
  const [showAddResolution, setShowAddResolution] = useState(false);
  const [showAddExtraction, setShowAddExtraction] = useState(false);
  const [showAddTemporal, setShowAddTemporal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [selectedConnector, setSelectedConnector] = useState<ConnectorView | null>(null);

  const [newConnector, setNewConnector] = useState({
    name: "", sourceType: "document_repository", description: "",
    connectionConfig: {}, entitiesIngested: 0, relationshipsMapped: 0,
    syncStatus: "idle", qualityMetrics: { accuracy: 0, completeness: 0, freshness: 0 },
    status: "active",
  });

  const [newResolution, setNewResolution] = useState({
    entityA: "", sourceA: "", entityB: "", sourceB: "",
    entityType: "organization", confidenceScore: 0, resolutionStatus: "pending",
  });

  const [newExtraction, setNewExtraction] = useState({
    sourceDocument: "", sourceEntity: "", targetEntity: "",
    relationshipType: "is-regulated-by", confidence: 0, extractedText: "",
    status: "extracted",
  });

  const [newTemporal, setNewTemporal] = useState({
    entityName: "", entityType: "organization", relatedEntity: "",
    relationshipType: "", validFrom: "", validTo: "", source: "",
  });

  const [showAiResolve, setShowAiResolve] = useState<ResolutionView | null>(null);
  const [aiResolveResult, setAiResolveResult] = useState<any>(null);
  const [showAiExtract, setShowAiExtract] = useState(false);
  const [aiExtractText, setAiExtractText] = useState("");
  const [aiExtractDocName, setAiExtractDocName] = useState("");
  const [aiExtractResult, setAiExtractResult] = useState<any>(null);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);
  const [aiSuggestionsResult, setAiSuggestionsResult] = useState<any>(null);
  const [showOverview, setShowOverview] = useState(true);

  const connectorsQuery = useQuery<ConnectorView[]>({ queryKey: ["/api/knowledge-connectors"] });
  const resolutionsQuery = useQuery<ResolutionView[]>({ queryKey: ["/api/entity-resolutions"] });
  const extractionsQuery = useQuery<ExtractionView[]>({ queryKey: ["/api/relationship-extractions"] });
  const temporalQuery = useQuery<TemporalView[]>({ queryKey: ["/api/temporal-graph-entries"] });

  const connectors = useMemo(() => {
    const data = connectorsQuery.data || [];
    if (data.length === 0) return SEED_CONNECTORS.map((s, i) => ({ ...s, id: `seed-${i}`, createdAt: new Date().toISOString() }));
    return data;
  }, [connectorsQuery.data]);

  const resolutions = useMemo(() => {
    const data = resolutionsQuery.data || [];
    if (data.length === 0) return SEED_RESOLUTIONS.map((s, i) => ({ ...s, id: `seed-r-${i}`, createdAt: new Date().toISOString() }));
    return data;
  }, [resolutionsQuery.data]);

  const extractions = useMemo(() => {
    const data = extractionsQuery.data || [];
    if (data.length === 0) return SEED_EXTRACTIONS.map((s, i) => ({ ...s, id: `seed-e-${i}`, createdAt: new Date().toISOString() }));
    return data;
  }, [extractionsQuery.data]);

  const temporalEntries = useMemo(() => {
    const data = temporalQuery.data || [];
    if (data.length === 0) return SEED_TEMPORAL.map((s, i) => ({ ...s, id: `seed-t-${i}`, createdAt: new Date().toISOString() }));
    return data;
  }, [temporalQuery.data]);

  const createConnectorMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/knowledge-connectors", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-connectors"] });
      setShowAddConnector(false);
      toast({ title: "Connector created" });
    },
  });

  const updateResolutionMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/entity-resolutions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entity-resolutions"] });
      toast({ title: "Resolution updated" });
    },
  });

  const createExtractionMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/relationship-extractions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relationship-extractions"] });
      setShowAddExtraction(false);
      toast({ title: "Extraction created" });
    },
  });

  const createTemporalMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/temporal-graph-entries", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/temporal-graph-entries"] });
      setShowAddTemporal(false);
      toast({ title: "Temporal entry created" });
    },
  });

  const deleteConnectorMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/knowledge-connectors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-connectors"] });
      toast({ title: "Connector deleted" });
    },
  });

  const aiResolveMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ai/resolve-entities", data).then(r => r.json()),
    onSuccess: (data) => {
      setAiResolveResult(data);
      toast({ title: "AI analysis complete" });
    },
    onError: () => toast({ title: "AI analysis failed", variant: "destructive" }),
  });

  const aiExtractMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ai/extract-relationships", data).then(r => r.json()),
    onSuccess: (data) => {
      setAiExtractResult(data);
      toast({ title: `Extracted ${data.entities?.length || 0} entities and ${data.relationships?.length || 0} relationships` });
    },
    onError: () => toast({ title: "AI extraction failed", variant: "destructive" }),
  });

  const aiSuggestionsMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ai/knowledge-graph-suggestions", data).then(r => r.json()),
    onSuccess: (data) => {
      setAiSuggestionsResult(data);
      setShowAiSuggestions(true);
      toast({ title: "AI suggestions generated" });
    },
    onError: () => toast({ title: "AI analysis failed", variant: "destructive" }),
  });

  const filteredConnectors = useMemo(() => {
    let list = connectors;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q));
    }
    if (filterStatus !== "all") {
      list = list.filter((c) => c.syncStatus === filterStatus);
    }
    return list;
  }, [connectors, searchQuery, filterStatus]);

  const filteredResolutions = useMemo(() => {
    let list = resolutions;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) => r.entityA.toLowerCase().includes(q) || r.entityB.toLowerCase().includes(q));
    }
    if (filterStatus !== "all") {
      list = list.filter((r) => r.resolutionStatus === filterStatus);
    }
    return list;
  }, [resolutions, searchQuery, filterStatus]);

  const filteredExtractions = useMemo(() => {
    let list = extractions;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) =>
        e.sourceEntity.toLowerCase().includes(q) || e.targetEntity.toLowerCase().includes(q) || e.sourceDocument.toLowerCase().includes(q)
      );
    }
    if (filterStatus !== "all") {
      list = list.filter((e) => e.status === filterStatus);
    }
    return list;
  }, [extractions, searchQuery, filterStatus]);

  const filteredTemporal = useMemo(() => {
    let list = temporalEntries;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) =>
        t.entityName.toLowerCase().includes(q) || (t.relatedEntity || "").toLowerCase().includes(q)
      );
    }
    if (dateRange.from) {
      const from = new Date(dateRange.from).getTime();
      list = list.filter((t) => new Date(t.validFrom).getTime() >= from);
    }
    if (dateRange.to) {
      const to = new Date(dateRange.to).getTime();
      list = list.filter((t) => new Date(t.validFrom).getTime() <= to);
    }
    return list;
  }, [temporalEntries, searchQuery, dateRange]);

  const totalEntities = connectors.reduce((sum, c) => sum + c.entitiesIngested, 0);
  const totalRelationships = connectors.reduce((sum, c) => sum + c.relationshipsMapped, 0);
  const pendingResolutions = resolutions.filter((r) => r.resolutionStatus === "pending" || r.resolutionStatus === "review").length;
  const verifiedExtractions = extractions.filter((e) => e.status === "verified").length;

  const graphEntities = useMemo(() => {
    const fromConnectors = connectors.slice(0, 5).map(c => ({ name: c.name, type: "source" as const }));
    const fromExtractions = extractions.slice(0, 8).flatMap(e => [
      { name: e.sourceEntity, type: "entity" as const },
      { name: e.targetEntity, type: "entity" as const },
    ]);
    const unique = new Map<string, { name: string; type: "source" | "entity" }>();
    [...fromConnectors, ...fromExtractions].forEach(e => { if (!unique.has(e.name)) unique.set(e.name, e); });
    return Array.from(unique.values()).slice(0, 12);
  }, [connectors, extractions]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Knowledge Graph Ingestion</h1>
          <p className="text-sm text-muted-foreground">Populate and maintain the knowledge graph with customer-specific data</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setShowOverview(!showOverview)}
            data-testid="button-toggle-overview"
          >
            <Network className="w-4 h-4 mr-1.5" />
            {showOverview ? "Hide" : "Show"} Overview
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setAiExtractText("");
              setAiExtractDocName("");
              setAiExtractResult(null);
              setShowAiExtract(true);
            }}
            data-testid="button-ai-extract"
          >
            <Wand2 className="w-4 h-4 mr-1.5" />AI Extract
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const entityList = [
                ...extractions.map(e => ({ name: e.sourceEntity, type: "entity" })),
                ...extractions.map(e => ({ name: e.targetEntity, type: "entity" })),
                ...temporalEntries.map(t => ({ name: t.entityName, type: t.entityType })),
              ];
              const relList = extractions.map(e => ({
                sourceEntity: e.sourceEntity,
                targetEntity: e.targetEntity,
                relationshipType: e.relationshipType,
              }));
              aiSuggestionsMut.mutate({
                entities: entityList,
                relationships: relList,
                industry: industry?.id || "financial_services",
              });
            }}
            disabled={aiSuggestionsMut.isPending}
            data-testid="button-ai-suggestions"
          >
            {aiSuggestionsMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Lightbulb className="w-4 h-4 mr-1.5" />}
            AI Suggestions
          </Button>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-56"
              data-testid="input-search"
            />
          </div>
        </div>
      </div>

      {showOverview && (
        <div className="border-b px-6 py-4">
          <div className="grid grid-cols-3 gap-4">
            <Card className="col-span-2" data-testid="card-overview-graph">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Knowledge Graph Overview</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    <Zap className="w-3 h-3 mr-1" />Powers agent intelligence
                  </Badge>
                </div>
                <div className="flex gap-4">
                  <svg viewBox="0 0 320 160" className="flex-1 h-40" data-testid="svg-graph-preview">
                    {graphEntities.map((entity, i) => {
                      const angle = (i / graphEntities.length) * Math.PI * 2;
                      const cx = 160 + Math.cos(angle) * 60;
                      const cy = 80 + Math.sin(angle) * 55;
                      const nextIdx = (i + 1) % graphEntities.length;
                      const nextAngle = (nextIdx / graphEntities.length) * Math.PI * 2;
                      const nx = 160 + Math.cos(nextAngle) * 60;
                      const ny = 80 + Math.sin(nextAngle) * 55;
                      return (
                        <g key={i}>
                          {i < graphEntities.length - 1 && (
                            <line x1={cx} y1={cy} x2={nx} y2={ny} className="stroke-muted-foreground/20" strokeWidth="1" />
                          )}
                          {i % 3 === 0 && (
                            <line x1={cx} y1={cy} x2={160} y2={80} className="stroke-muted-foreground/15" strokeWidth="1" strokeDasharray="3,3" />
                          )}
                          <circle
                            cx={cx} cy={cy} r={entity.type === "source" ? 6 : 4}
                            className={entity.type === "source" ? "fill-primary/60" : "fill-muted-foreground/40"}
                          />
                          <text x={cx} y={cy + (i % 2 === 0 ? -10 : 14)} textAnchor="middle" className="fill-muted-foreground text-[7px]">
                            {entity.name.length > 16 ? entity.name.slice(0, 14) + "..." : entity.name}
                          </text>
                        </g>
                      );
                    })}
                    <circle cx={160} cy={80} r={8} className="fill-primary/30" />
                    <text x={160} y={84} textAnchor="middle" className="fill-foreground text-[6px] font-medium">KG</text>
                  </svg>
                  <div className="space-y-2 w-48 shrink-0">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Your knowledge graph connects entities, relationships, and temporal data to give AI agents deep understanding of your organization.
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Graph completeness</span>
                        <span className="text-xs font-medium">{Math.min(100, Math.round((totalEntities / 100000) * 100))}%</span>
                      </div>
                      <Progress value={Math.min(100, Math.round((totalEntities / 100000) * 100))} className="h-1.5" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Resolution rate</span>
                        <span className="text-xs font-medium">{resolutions.length > 0 ? Math.round(((resolutions.length - pendingResolutions) / resolutions.length) * 100) : 0}%</span>
                      </div>
                      <Progress value={resolutions.length > 0 ? Math.round(((resolutions.length - pendingResolutions) / resolutions.length) * 100) : 0} className="h-1.5" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Extraction verified</span>
                        <span className="text-xs font-medium">{extractions.length > 0 ? Math.round((verifiedExtractions / extractions.length) * 100) : 0}%</span>
                      </div>
                      <Progress value={extractions.length > 0 ? Math.round((verifiedExtractions / extractions.length) * 100) : 0} className="h-1.5" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="space-y-2">
              <Card data-testid="card-stat-entities">
                <CardContent className="pt-3 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Entities</span>
                    </div>
                    <p className="text-lg font-bold">{totalEntities.toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-stat-relationships">
                <CardContent className="pt-3 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Network className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Relationships</span>
                    </div>
                    <p className="text-lg font-bold">{totalRelationships.toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-stat-pending">
                <CardContent className="pt-3 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Pending</span>
                    </div>
                    <p className="text-lg font-bold">{pendingResolutions}</p>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-stat-verified">
                <CardContent className="pt-3 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Verified</span>
                    </div>
                    <p className="text-lg font-bold">{verifiedExtractions}/{extractions.length}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {!showOverview && (
        <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b">
          <Card data-testid="card-stat-entities-compact">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Entities Ingested</span>
              </div>
              <p className="text-2xl font-bold mt-1">{totalEntities.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-relationships-compact">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Relationships Mapped</span>
              </div>
              <p className="text-2xl font-bold mt-1">{totalRelationships.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-pending-compact">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Pending Resolutions</span>
              </div>
              <p className="text-2xl font-bold mt-1">{pendingResolutions}</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-verified-compact">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Verified Extractions</span>
              </div>
              <p className="text-2xl font-bold mt-1">{verifiedExtractions}/{extractions.length}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex-1 overflow-hidden px-6 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="mb-4">
            <TabsTrigger value="connectors" data-testid="tab-connectors">
              <Database className="w-4 h-4 mr-1.5" />Data Source Connectors
            </TabsTrigger>
            <TabsTrigger value="resolution" data-testid="tab-resolution">
              <Users className="w-4 h-4 mr-1.5" />Entity Resolution
            </TabsTrigger>
            <TabsTrigger value="extraction" data-testid="tab-extraction">
              <GitBranch className="w-4 h-4 mr-1.5" />Relationship Extraction
            </TabsTrigger>
            <TabsTrigger value="temporal" data-testid="tab-temporal">
              <Clock className="w-4 h-4 mr-1.5" />Temporal Graph
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connectors" className="flex-1 overflow-hidden mt-0">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-36" data-testid="select-filter-status">
                    <Filter className="w-3 h-3 mr-1.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="syncing">Syncing</SelectItem>
                    <SelectItem value="idle">Idle</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => setShowAddConnector(true)} data-testid="button-add-connector">
                <Plus className="w-4 h-4 mr-1.5" />Add Connector
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-380px)]">
              <div className="space-y-3">
                {filteredConnectors.map((connector) => {
                  const Icon = getConnectorIcon(connector.sourceType);
                  const typeInfo = CONNECTOR_TYPES.find((t) => t.value === connector.sourceType);
                  const qm = connector.qualityMetrics as any || {};
                  return (
                    <Card
                      key={connector.id}
                      className="hover-elevate cursor-pointer"
                      data-testid={`card-connector-${connector.id}`}
                      onClick={() => setSelectedConnector(connector)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="p-2 rounded-md bg-muted">
                              <Icon className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-medium" data-testid={`text-connector-name-${connector.id}`}>{connector.name}</h3>
                                <SyncStatusBadge status={connector.syncStatus} />
                                <Badge variant="outline">{typeInfo?.label || connector.sourceType}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-0.5 truncate">{connector.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Layers className="w-3 h-3" />{connector.entitiesIngested.toLocaleString()} entities
                                </span>
                                <span className="flex items-center gap-1">
                                  <Network className="w-3 h-3" />{connector.relationshipsMapped.toLocaleString()} relationships
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />Last sync: {formatDate(connector.lastSyncAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 w-36 shrink-0">
                            {qm.accuracy != null && <QualityMetricBar label="Accuracy" value={qm.accuracy} />}
                            {qm.completeness != null && <QualityMetricBar label="Completeness" value={qm.completeness} />}
                            {qm.freshness != null && <QualityMetricBar label="Freshness" value={qm.freshness} />}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {filteredConnectors.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    No connectors found matching your criteria
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="resolution" className="flex-1 overflow-hidden mt-0">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-36" data-testid="select-filter-resolution-status">
                    <Filter className="w-3 h-3 mr-1.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="matched">Matched</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {pendingResolutions} need review
                </Badge>
                <Badge variant="outline">
                  <BrainCircuit className="w-3 h-3 mr-1" />
                  AI-assisted resolution available
                </Badge>
              </div>
            </div>
            <ScrollArea className="h-[calc(100vh-380px)]">
              <div className="space-y-3">
                {filteredResolutions.map((res) => (
                  <Card key={res.id} data-testid={`card-resolution-${res.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">{res.entityType}</Badge>
                            <ResolutionStatusBadge status={res.resolutionStatus} />
                            <ConfidenceBadge score={res.confidenceScore} />
                            {res.resolvedBy && (
                              <Badge variant="outline" className="text-xs">
                                {res.resolvedBy === "auto" ? "Auto-resolved" : "Human-reviewed"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-3">
                            <div className="flex-1 min-w-0">
                              <div className="p-2.5 rounded-md bg-muted">
                                <p className="font-medium text-sm" data-testid={`text-entity-a-${res.id}`}>{res.entityA}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Source: {res.sourceA}</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-center gap-1 shrink-0 px-2">
                              <Link2 className="w-4 h-4 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">match?</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="p-2.5 rounded-md bg-muted">
                                <p className="font-medium text-sm" data-testid={`text-entity-b-${res.id}`}>{res.entityB}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Source: {res.sourceB}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Progress value={res.confidenceScore * 100} className="h-1.5 flex-1" />
                            <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(res.confidenceScore * 100)}%</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAiResolveResult(null);
                              setShowAiResolve(res);
                              aiResolveMut.mutate({
                                entityA: res.entityA,
                                sourceA: res.sourceA,
                                entityB: res.entityB,
                                sourceB: res.sourceB,
                                entityType: res.entityType,
                                industry: res.industry || industry?.id || "financial_services",
                              });
                            }}
                            disabled={aiResolveMut.isPending}
                            data-testid={`button-ai-resolve-${res.id}`}
                          >
                            {aiResolveMut.isPending && showAiResolve?.id === res.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                            AI Resolve
                          </Button>
                          {(res.resolutionStatus === "pending" || res.resolutionStatus === "review") && !res.id.startsWith("seed") && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => updateResolutionMut.mutate({ id: res.id, data: { resolutionStatus: "matched", resolvedBy: "human" } })}
                                data-testid={`button-match-${res.id}`}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />Match
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateResolutionMut.mutate({ id: res.id, data: { resolutionStatus: "rejected", resolvedBy: "human" } })}
                                data-testid={`button-reject-${res.id}`}
                              >
                                <XCircle className="w-3 h-3 mr-1" />Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {filteredResolutions.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    No entity resolutions found matching your criteria
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="extraction" className="flex-1 overflow-hidden mt-0">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-36" data-testid="select-filter-extraction-status">
                    <Filter className="w-3 h-3 mr-1.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="extracted">Extracted</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline">
                  <Sparkles className="w-3 h-3 mr-1" />LLM-powered extraction
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAiExtractText("");
                    setAiExtractDocName("");
                    setAiExtractResult(null);
                    setShowAiExtract(true);
                  }}
                  data-testid="button-ai-extract-tab"
                >
                  <Wand2 className="w-4 h-4 mr-1.5" />AI Extract from Text
                </Button>
                <Button onClick={() => setShowAddExtraction(true)} data-testid="button-add-extraction">
                  <Plus className="w-4 h-4 mr-1.5" />Add Extraction
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[calc(100vh-380px)]">
              <div className="space-y-3">
                {filteredExtractions.map((ext) => (
                  <Card key={ext.id} data-testid={`card-extraction-${ext.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <ExtractionStatusBadge status={ext.status} />
                            <ConfidenceBadge score={ext.confidence} />
                            <Badge variant="outline">{ext.relationshipType}</Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-3">
                            <div className="p-2 rounded-md bg-muted flex-1 min-w-0">
                              <p className="font-medium text-sm" data-testid={`text-source-entity-${ext.id}`}>{ext.sourceEntity}</p>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                              <ArrowRight className="w-4 h-4" />
                              <span className="font-medium">{ext.relationshipType}</span>
                              <ArrowRight className="w-4 h-4" />
                            </div>
                            <div className="p-2 rounded-md bg-muted flex-1 min-w-0">
                              <p className="font-medium text-sm" data-testid={`text-target-entity-${ext.id}`}>{ext.targetEntity}</p>
                            </div>
                          </div>
                          {ext.extractedText && (
                            <div className="mt-2 p-2 rounded-md border border-dashed text-xs text-muted-foreground italic">
                              "{ext.extractedText}"
                            </div>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{ext.sourceDocument}</span>
                            {ext.validFrom && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(ext.validFrom).toLocaleDateString()}
                                {ext.validTo ? ` - ${new Date(ext.validTo).toLocaleDateString()}` : " - Present"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {filteredExtractions.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    No relationship extractions found matching your criteria
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="temporal" className="flex-1 overflow-hidden mt-0">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">From:</Label>
                  <Input
                    type="date"
                    value={dateRange.from}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
                    className="w-36 h-9"
                    data-testid="input-date-from"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">To:</Label>
                  <Input
                    type="date"
                    value={dateRange.to}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
                    className="w-36 h-9"
                    data-testid="input-date-to"
                  />
                </div>
                {(dateRange.from || dateRange.to) && (
                  <Button size="sm" variant="outline" onClick={() => setDateRange({ from: "", to: "" })} data-testid="button-clear-dates">
                    Clear
                  </Button>
                )}
              </div>
              <Button onClick={() => setShowAddTemporal(true)} data-testid="button-add-temporal">
                <Plus className="w-4 h-4 mr-1.5" />Add Entry
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-380px)]">
              <div className="space-y-3">
                {filteredTemporal.map((entry) => {
                  const isActive = !entry.validTo || new Date(entry.validTo) > new Date();
                  return (
                    <Card key={entry.id} data-testid={`card-temporal-${entry.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={isActive ? "default" : "secondary"}>
                                {isActive ? "Active" : "Historical"}
                              </Badge>
                              <Badge variant="outline">{entry.entityType}</Badge>
                              {entry.relationshipType && <Badge variant="outline">{entry.relationshipType}</Badge>}
                            </div>
                            <div className="flex items-center gap-3 mt-3">
                              <div className="p-2 rounded-md bg-muted flex-1 min-w-0">
                                <p className="font-medium text-sm" data-testid={`text-temporal-entity-${entry.id}`}>{entry.entityName}</p>
                                <p className="text-xs text-muted-foreground">{entry.entityType}</p>
                              </div>
                              {entry.relatedEntity && (
                                <>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                                    <ArrowRight className="w-4 h-4" />
                                    <span className="font-medium">{entry.relationshipType || "relates-to"}</span>
                                    <ArrowRight className="w-4 h-4" />
                                  </div>
                                  <div className="p-2 rounded-md bg-muted flex-1 min-w-0">
                                    <p className="font-medium text-sm">{entry.relatedEntity}</p>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Valid: {new Date(entry.validFrom).toLocaleDateString()}
                                {entry.validTo ? ` - ${new Date(entry.validTo).toLocaleDateString()}` : " - Present"}
                              </span>
                              {entry.source && (
                                <span className="flex items-center gap-1">
                                  <Database className="w-3 h-3" />Source: {entry.source}
                                </span>
                              )}
                              {entry.properties && Object.keys(entry.properties as any).length > 0 && (
                                <span className="flex items-center gap-1">
                                  <BarChart3 className="w-3 h-3" />{Object.keys(entry.properties as any).length} properties
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {filteredTemporal.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    No temporal graph entries found matching your criteria
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showAddConnector} onOpenChange={setShowAddConnector}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Data Source Connector</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={newConnector.name}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Customer CRM Database"
                data-testid="input-connector-name"
              />
            </div>
            <div>
              <Label>Source Type</Label>
              <Select value={newConnector.sourceType} onValueChange={(v) => setNewConnector((prev) => ({ ...prev, sourceType: v }))}>
                <SelectTrigger data-testid="select-connector-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONNECTOR_TYPES.map((ct) => (
                    <SelectItem key={ct.value} value={ct.value}>{ct.label} - {ct.desc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newConnector.description}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the data source and what entities it provides..."
                data-testid="input-connector-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddConnector(false)} data-testid="button-cancel-connector">Cancel</Button>
            <Button
              onClick={() => {
                if (!newConnector.name.trim()) return toast({ title: "Name is required", variant: "destructive" });
                createConnectorMut.mutate({
                  ...newConnector,
                  industry: industry?.id || "financial_services",
                });
              }}
              disabled={createConnectorMut.isPending}
              data-testid="button-save-connector"
            >
              {createConnectorMut.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Add Connector
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddExtraction} onOpenChange={setShowAddExtraction}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Relationship Extraction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Source Document</Label>
              <Input
                value={newExtraction.sourceDocument}
                onChange={(e) => setNewExtraction((prev) => ({ ...prev, sourceDocument: e.target.value }))}
                placeholder="e.g., SEC Filing 10-K FY2024"
                data-testid="input-extraction-doc"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Source Entity</Label>
                <Input
                  value={newExtraction.sourceEntity}
                  onChange={(e) => setNewExtraction((prev) => ({ ...prev, sourceEntity: e.target.value }))}
                  placeholder="Entity A"
                  data-testid="input-extraction-source"
                />
              </div>
              <div>
                <Label>Target Entity</Label>
                <Input
                  value={newExtraction.targetEntity}
                  onChange={(e) => setNewExtraction((prev) => ({ ...prev, targetEntity: e.target.value }))}
                  placeholder="Entity B"
                  data-testid="input-extraction-target"
                />
              </div>
            </div>
            <div>
              <Label>Relationship Type</Label>
              <Select value={newExtraction.relationshipType} onValueChange={(v) => setNewExtraction((prev) => ({ ...prev, relationshipType: v }))}>
                <SelectTrigger data-testid="select-extraction-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_TYPES.map((rt) => (
                    <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Extracted Text</Label>
              <Textarea
                value={newExtraction.extractedText}
                onChange={(e) => setNewExtraction((prev) => ({ ...prev, extractedText: e.target.value }))}
                placeholder="Original text passage showing this relationship..."
                data-testid="input-extraction-text"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddExtraction(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!newExtraction.sourceDocument.trim() || !newExtraction.sourceEntity.trim() || !newExtraction.targetEntity.trim()) {
                  return toast({ title: "All fields required", variant: "destructive" });
                }
                createExtractionMut.mutate({
                  ...newExtraction,
                  confidence: 0.75,
                  industry: industry?.id || "financial_services",
                  metadata: {},
                });
              }}
              disabled={createExtractionMut.isPending}
              data-testid="button-save-extraction"
            >
              {createExtractionMut.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Add Extraction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddTemporal} onOpenChange={setShowAddTemporal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Temporal Graph Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Entity Name</Label>
                <Input
                  value={newTemporal.entityName}
                  onChange={(e) => setNewTemporal((prev) => ({ ...prev, entityName: e.target.value }))}
                  placeholder="Entity name"
                  data-testid="input-temporal-entity"
                />
              </div>
              <div>
                <Label>Entity Type</Label>
                <Select value={newTemporal.entityType} onValueChange={(v) => setNewTemporal((prev) => ({ ...prev, entityType: v }))}>
                  <SelectTrigger data-testid="select-temporal-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map((et) => (
                      <SelectItem key={et} value={et}>{et.charAt(0).toUpperCase() + et.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Related Entity</Label>
                <Input
                  value={newTemporal.relatedEntity}
                  onChange={(e) => setNewTemporal((prev) => ({ ...prev, relatedEntity: e.target.value }))}
                  placeholder="Related entity (optional)"
                  data-testid="input-temporal-related"
                />
              </div>
              <div>
                <Label>Relationship Type</Label>
                <Select value={newTemporal.relationshipType || "none"} onValueChange={(v) => setNewTemporal((prev) => ({ ...prev, relationshipType: v === "none" ? "" : v }))}>
                  <SelectTrigger data-testid="select-temporal-rel-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {RELATIONSHIP_TYPES.map((rt) => (
                      <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valid From</Label>
                <Input
                  type="date"
                  value={newTemporal.validFrom}
                  onChange={(e) => setNewTemporal((prev) => ({ ...prev, validFrom: e.target.value }))}
                  data-testid="input-temporal-from"
                />
              </div>
              <div>
                <Label>Valid To (optional)</Label>
                <Input
                  type="date"
                  value={newTemporal.validTo}
                  onChange={(e) => setNewTemporal((prev) => ({ ...prev, validTo: e.target.value }))}
                  data-testid="input-temporal-to"
                />
              </div>
            </div>
            <div>
              <Label>Source</Label>
              <Input
                value={newTemporal.source}
                onChange={(e) => setNewTemporal((prev) => ({ ...prev, source: e.target.value }))}
                placeholder="Data source name"
                data-testid="input-temporal-source"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddTemporal(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!newTemporal.entityName.trim() || !newTemporal.validFrom) {
                  return toast({ title: "Entity name and valid-from date required", variant: "destructive" });
                }
                createTemporalMut.mutate({
                  ...newTemporal,
                  validFrom: new Date(newTemporal.validFrom).toISOString(),
                  validTo: newTemporal.validTo ? new Date(newTemporal.validTo).toISOString() : null,
                  industry: industry?.id || "financial_services",
                  properties: {},
                });
              }}
              disabled={createTemporalMut.isPending}
              data-testid="button-save-temporal"
            >
              {createTemporalMut.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Add Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedConnector} onOpenChange={() => setSelectedConnector(null)}>
        <DialogContent className="max-w-lg">
          {selectedConnector && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => { const Icon = getConnectorIcon(selectedConnector.sourceType); return <Icon className="w-5 h-5" />; })()}
                  {selectedConnector.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <SyncStatusBadge status={selectedConnector.syncStatus} />
                  <Badge variant="outline">{CONNECTOR_TYPES.find((t) => t.value === selectedConnector.sourceType)?.label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{selectedConnector.description}</p>
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-3 pb-2">
                      <p className="text-xs text-muted-foreground">Entities Ingested</p>
                      <p className="text-lg font-bold">{selectedConnector.entitiesIngested.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-3 pb-2">
                      <p className="text-xs text-muted-foreground">Relationships Mapped</p>
                      <p className="text-lg font-bold">{selectedConnector.relationshipsMapped.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                </div>
                {selectedConnector.qualityMetrics && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Quality Metrics</h4>
                    {(selectedConnector.qualityMetrics as any).accuracy != null && (
                      <QualityMetricBar label="Accuracy" value={(selectedConnector.qualityMetrics as any).accuracy} />
                    )}
                    {(selectedConnector.qualityMetrics as any).completeness != null && (
                      <QualityMetricBar label="Completeness" value={(selectedConnector.qualityMetrics as any).completeness} />
                    )}
                    {(selectedConnector.qualityMetrics as any).freshness != null && (
                      <QualityMetricBar label="Freshness" value={(selectedConnector.qualityMetrics as any).freshness} />
                    )}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  Last sync: {formatDate(selectedConnector.lastSyncAt)}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedConnector(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!showAiResolve} onOpenChange={() => { setShowAiResolve(null); setAiResolveResult(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5" />AI Entity Resolution
            </DialogTitle>
          </DialogHeader>
          {showAiResolve && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-md bg-muted">
                  <p className="text-xs text-muted-foreground mb-1">Entity A</p>
                  <p className="font-medium text-sm">{showAiResolve.entityA}</p>
                  <p className="text-xs text-muted-foreground mt-1">Source: {showAiResolve.sourceA}</p>
                </div>
                <div className="p-3 rounded-md bg-muted">
                  <p className="text-xs text-muted-foreground mb-1">Entity B</p>
                  <p className="font-medium text-sm">{showAiResolve.entityB}</p>
                  <p className="text-xs text-muted-foreground mt-1">Source: {showAiResolve.sourceB}</p>
                </div>
              </div>

              {aiResolveMut.isPending && (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">AI is analyzing these entities...</span>
                </div>
              )}

              {aiResolveResult && (
                <div className="space-y-3" data-testid="ai-resolve-result">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={aiResolveResult.isMatch ? "default" : "destructive"}>
                      {aiResolveResult.isMatch ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                      {aiResolveResult.isMatch ? "Match" : "No Match"}
                    </Badge>
                    <Badge variant="secondary">
                      {Math.round((aiResolveResult.confidence || 0) * 100)}% confidence
                    </Badge>
                    {aiResolveResult.category && (
                      <Badge variant="outline">{aiResolveResult.category.replace(/_/g, " ")}</Badge>
                    )}
                  </div>

                  <div className="p-3 rounded-md border text-sm" data-testid="text-ai-reasoning">
                    <p className="font-medium text-xs text-muted-foreground mb-1">AI Reasoning</p>
                    {aiResolveResult.reasoning}
                  </div>

                  {aiResolveResult.canonicalName && (
                    <div className="flex items-center gap-2 text-sm">
                      <Target className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Recommended canonical name:</span>
                      <span className="font-medium">{aiResolveResult.canonicalName}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {aiResolveResult.matchingAttributes?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />Matching attributes
                        </p>
                        <div className="space-y-1">
                          {aiResolveResult.matchingAttributes.map((a: string, i: number) => (
                            <Badge key={i} variant="outline" className="mr-1 text-xs">{a}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {aiResolveResult.differentiatingAttributes?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />Differentiating factors
                        </p>
                        <div className="space-y-1">
                          {aiResolveResult.differentiatingAttributes.map((a: string, i: number) => (
                            <Badge key={i} variant="outline" className="mr-1 text-xs">{a}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAiResolve(null); setAiResolveResult(null); }} data-testid="button-close-ai-resolve">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAiExtract} onOpenChange={setShowAiExtract}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5" />AI Relationship Extraction
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!aiExtractResult ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Paste a document or text passage below and AI will automatically extract entities and relationships for your knowledge graph.
                </p>
                <div>
                  <Label>Document Name (optional)</Label>
                  <Input
                    value={aiExtractDocName}
                    onChange={(e) => setAiExtractDocName(e.target.value)}
                    placeholder="e.g., SEC Filing 10-K FY2025"
                    data-testid="input-ai-extract-doc-name"
                  />
                </div>
                <div>
                  <Label>Text to Analyze</Label>
                  <Textarea
                    value={aiExtractText}
                    onChange={(e) => setAiExtractText(e.target.value)}
                    placeholder="Paste regulatory text, corporate documents, compliance reports, or any industry-relevant content here..."
                    className="min-h-[200px]"
                    data-testid="input-ai-extract-text"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{aiExtractText.length} characters</span>
                  <Button
                    onClick={() => {
                      if (!aiExtractText.trim()) return toast({ title: "Please paste some text to analyze", variant: "destructive" });
                      aiExtractMut.mutate({
                        text: aiExtractText,
                        documentName: aiExtractDocName || "Unnamed Document",
                        industry: industry?.id || "financial_services",
                      });
                    }}
                    disabled={aiExtractMut.isPending || !aiExtractText.trim()}
                    data-testid="button-run-ai-extract"
                  >
                    {aiExtractMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                    Extract with AI
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4" data-testid="ai-extract-results">
                <p className="text-sm text-muted-foreground">{aiExtractResult.summary}</p>

                {aiExtractResult.entities?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <Layers className="w-4 h-4" />Extracted Entities ({aiExtractResult.entities.length})
                    </h4>
                    <div className="space-y-1.5">
                      {aiExtractResult.entities.map((ent: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted">
                          <Badge variant="outline" className="text-xs shrink-0">{ent.type}</Badge>
                          <span className="text-sm font-medium">{ent.name}</span>
                          <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">{ent.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiExtractResult.relationships?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <GitBranch className="w-4 h-4" />Extracted Relationships ({aiExtractResult.relationships.length})
                    </h4>
                    <div className="space-y-2">
                      {aiExtractResult.relationships.map((rel: any, i: number) => (
                        <Card key={i}>
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{rel.sourceEntity}</span>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <Badge variant="outline" className="text-xs">{rel.relationshipType}</Badge>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <span className="text-sm font-medium">{rel.targetEntity}</span>
                              <Badge variant="secondary" className="text-xs ml-auto shrink-0">
                                {Math.round((rel.confidence || 0) * 100)}%
                              </Badge>
                            </div>
                            {rel.extractedText && (
                              <p className="text-xs text-muted-foreground italic mt-1.5">"{rel.extractedText}"</p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  onClick={() => setAiExtractResult(null)}
                  data-testid="button-extract-new"
                >
                  Extract from another text
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAiExtract(false); setAiExtractResult(null); }} data-testid="button-close-ai-extract">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAiSuggestions} onOpenChange={setShowAiSuggestions}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5" />AI Knowledge Graph Suggestions
            </DialogTitle>
          </DialogHeader>
          {aiSuggestionsMut.isPending && (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">AI is analyzing your knowledge graph...</span>
            </div>
          )}
          {aiSuggestionsResult && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4" data-testid="ai-suggestions-results">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Graph Quality Score</span>
                  </div>
                  <Badge variant={
                    (aiSuggestionsResult.overallScore || 0) >= 80 ? "default" :
                    (aiSuggestionsResult.overallScore || 0) >= 50 ? "secondary" : "destructive"
                  }>
                    {aiSuggestionsResult.overallScore || 0}/100
                  </Badge>
                </div>

                {aiSuggestionsResult.summary && (
                  <p className="text-sm text-muted-foreground" data-testid="text-ai-summary">{aiSuggestionsResult.summary}</p>
                )}

                {aiSuggestionsResult.missingRelationships?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <GitBranch className="w-4 h-4" />Missing Relationships ({aiSuggestionsResult.missingRelationships.length})
                    </h4>
                    <div className="space-y-2">
                      {aiSuggestionsResult.missingRelationships.map((r: any, i: number) => (
                        <div key={i} className="p-2.5 rounded-md border">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{r.sourceEntity}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <Badge variant="outline" className="text-xs">{r.suggestedType}</Badge>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm font-medium">{r.targetEntity}</span>
                            <Badge variant="secondary" className="text-xs ml-auto shrink-0">{Math.round((r.confidence || 0) * 100)}%</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiSuggestionsResult.dataGaps?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />Data Gaps ({aiSuggestionsResult.dataGaps.length})
                    </h4>
                    <div className="space-y-2">
                      {aiSuggestionsResult.dataGaps.map((g: any, i: number) => (
                        <div key={i} className="p-2.5 rounded-md border">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">{g.area}</span>
                            <Badge variant={g.severity === "high" ? "destructive" : g.severity === "medium" ? "secondary" : "outline"} className="text-xs">
                              {g.severity}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{g.description}</p>
                          <p className="text-xs mt-1"><span className="text-muted-foreground">Action:</span> {g.suggestedAction}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiSuggestionsResult.qualityIssues?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <Shield className="w-4 h-4" />Quality Issues ({aiSuggestionsResult.qualityIssues.length})
                    </h4>
                    <div className="space-y-2">
                      {aiSuggestionsResult.qualityIssues.map((q: any, i: number) => (
                        <div key={i} className="p-2.5 rounded-md border">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">{q.issue}</span>
                            <Badge variant={q.severity === "high" ? "destructive" : q.severity === "medium" ? "secondary" : "outline"} className="text-xs">
                              {q.severity}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{q.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiSuggestionsResult.enrichmentOpportunities?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />Enrichment Opportunities ({aiSuggestionsResult.enrichmentOpportunities.length})
                    </h4>
                    <div className="space-y-2">
                      {aiSuggestionsResult.enrichmentOpportunities.map((e: any, i: number) => (
                        <div key={i} className="p-2.5 rounded-md border">
                          <p className="text-sm font-medium">{e.entity}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{e.suggestion}</p>
                          <p className="text-xs mt-0.5"><span className="text-muted-foreground">Source:</span> {e.source}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAiSuggestions(false)} data-testid="button-close-ai-suggestions">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
