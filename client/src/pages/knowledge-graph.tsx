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

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Knowledge Graph Ingestion</h1>
          <p className="text-sm text-muted-foreground">Populate and maintain the knowledge graph with customer-specific data</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

      <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b">
        <Card data-testid="card-stat-entities">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Entities Ingested</span>
            </div>
            <p className="text-2xl font-bold mt-1">{totalEntities.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-relationships">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Relationships Mapped</span>
            </div>
            <p className="text-2xl font-bold mt-1">{totalRelationships.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-pending">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Pending Resolutions</span>
            </div>
            <p className="text-2xl font-bold mt-1">{pendingResolutions}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-verified">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Verified Extractions</span>
            </div>
            <p className="text-2xl font-bold mt-1">{verifiedExtractions}/{extractions.length}</p>
          </CardContent>
        </Card>
      </div>

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
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {pendingResolutions} need review
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
                        {(res.resolutionStatus === "pending" || res.resolutionStatus === "review") && !res.id.startsWith("seed") && (
                          <div className="flex flex-col gap-1.5 shrink-0">
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
                          </div>
                        )}
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
              <Button onClick={() => setShowAddExtraction(true)} data-testid="button-add-extraction">
                <Plus className="w-4 h-4 mr-1.5" />Add Extraction
              </Button>
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
    </div>
  );
}
