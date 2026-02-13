import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useIndustry } from "@/components/industry-provider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Database, Plus, Search, Settings, Zap, GitBranch, Layers, ArrowUpRight,
  ArrowDownRight, Clock, Activity, AlertTriangle, CheckCircle, RefreshCw,
  FileText, Server, Globe, BarChart3, TrendingUp, Filter,
} from "lucide-react";

type KnowledgeSource = {
  id: string;
  name: string;
  type: "Document Collection" | "Structured Database" | "Knowledge Graph" | "External API";
  description: string;
  industryTags: string[];
  freshness: string;
  updateFrequency: string;
  qualityScore: number;
  status: "active" | "syncing" | "stale";
};

type RetrievalStrategy = {
  id: string;
  name: string;
  description: string;
  accuracy: number;
  latency: string;
  steps: string[];
  active: boolean;
  recommended: boolean;
  topK: number;
  confidenceThreshold: number;
  maxLatency: number;
  rerankingEnabled: boolean;
};

type ChunkStrategy = {
  id: string;
  name: string;
  description: string;
  documentType: string;
  chunkMethod: string;
  chunkSizeRange: string;
  overlapStrategy: string;
  specialHandling: string;
  active: boolean;
};

type RecentRetrieval = {
  id: string;
  timestamp: string;
  queryPreview: string;
  strategy: string;
  relevanceScore: number;
  latency: number;
  contextUsed: number;
};

const INDUSTRY_SOURCES: Record<string, KnowledgeSource[]> = {
  insurance: [
    { id: "ins-src-1", name: "Policy Documents (ACORD)", type: "Document Collection", description: "Standardized insurance policy documents following ACORD data standards", industryTags: ["P&C", "Life", "ACORD"], freshness: "Updated 2h ago", updateFrequency: "Daily", qualityScore: 94, status: "active" },
    { id: "ins-src-2", name: "Claims Database", type: "Structured Database", description: "Historical and active claims records with adjudication outcomes", industryTags: ["Claims", "Adjudication"], freshness: "Updated 15m ago", updateFrequency: "Real-time", qualityScore: 97, status: "active" },
    { id: "ins-src-3", name: "Underwriting Knowledge Graph", type: "Knowledge Graph", description: "Risk relationships between policyholder attributes, coverage types, and loss history", industryTags: ["Underwriting", "Risk"], freshness: "Updated 6h ago", updateFrequency: "Daily", qualityScore: 91, status: "active" },
    { id: "ins-src-4", name: "Regulatory API (State DOI)", type: "External API", description: "Real-time regulatory filings and compliance requirements from state departments of insurance", industryTags: ["Regulatory", "Compliance"], freshness: "Updated 1d ago", updateFrequency: "Daily", qualityScore: 88, status: "syncing" },
    { id: "ins-src-5", name: "Actuarial Tables", type: "Document Collection", description: "Mortality, morbidity, and loss cost tables used in premium calculation", industryTags: ["Actuarial", "Pricing"], freshness: "Updated 7d ago", updateFrequency: "Weekly", qualityScore: 96, status: "active" },
    { id: "ins-src-6", name: "Reinsurance Treaties", type: "Document Collection", description: "Treaty and facultative reinsurance contract documents and terms", industryTags: ["Reinsurance", "Treaties"], freshness: "Updated 3d ago", updateFrequency: "Weekly", qualityScore: 85, status: "stale" },
  ],
  healthcare: [
    { id: "hc-src-1", name: "Clinical Guidelines (UpToDate)", type: "Document Collection", description: "Evidence-based clinical decision support guidelines and treatment protocols", industryTags: ["Clinical", "Evidence-Based"], freshness: "Updated 4h ago", updateFrequency: "Daily", qualityScore: 98, status: "active" },
    { id: "hc-src-2", name: "EHR Database", type: "Structured Database", description: "Electronic health records with patient demographics, encounters, and clinical data", industryTags: ["EHR", "Patient Data"], freshness: "Updated 5m ago", updateFrequency: "Real-time", qualityScore: 95, status: "active" },
    { id: "hc-src-3", name: "Medical Ontology Graph", type: "Knowledge Graph", description: "SNOMED CT and ICD-10 relationships mapped to clinical concepts and procedures", industryTags: ["SNOMED", "ICD-10"], freshness: "Updated 12h ago", updateFrequency: "Daily", qualityScore: 93, status: "active" },
    { id: "hc-src-4", name: "Drug Interaction API", type: "External API", description: "Real-time drug-drug and drug-allergy interaction checking service", industryTags: ["Pharmacy", "Safety"], freshness: "Updated 1h ago", updateFrequency: "Real-time", qualityScore: 97, status: "active" },
    { id: "hc-src-5", name: "Lab Reference Ranges", type: "Document Collection", description: "Laboratory test reference ranges with age, sex, and condition-specific adjustments", industryTags: ["Lab", "Diagnostics"], freshness: "Updated 2d ago", updateFrequency: "Weekly", qualityScore: 90, status: "active" },
    { id: "hc-src-6", name: "Care Pathways", type: "Document Collection", description: "Standardized care pathway documents for common conditions and procedures", industryTags: ["Pathways", "Protocols"], freshness: "Updated 5d ago", updateFrequency: "Weekly", qualityScore: 87, status: "syncing" },
  ],
  financial_services: [
    { id: "fs-src-1", name: "Regulatory Filings (SEC)", type: "Document Collection", description: "SEC filings including 10-K, 10-Q, 8-K, and proxy statements", industryTags: ["SEC", "Regulatory"], freshness: "Updated 3h ago", updateFrequency: "Daily", qualityScore: 92, status: "active" },
    { id: "fs-src-2", name: "Market Data Feed", type: "Structured Database", description: "Real-time and historical market data including equities, fixed income, and derivatives", industryTags: ["Market Data", "Trading"], freshness: "Updated 1m ago", updateFrequency: "Real-time", qualityScore: 98, status: "active" },
    { id: "fs-src-3", name: "Risk Model Knowledge Graph", type: "Knowledge Graph", description: "Interconnected risk factors, counterparty relationships, and exposure networks", industryTags: ["Risk", "Counterparty"], freshness: "Updated 8h ago", updateFrequency: "Daily", qualityScore: 89, status: "active" },
    { id: "fs-src-4", name: "Bloomberg API", type: "External API", description: "Bloomberg terminal data access for financial analytics and market intelligence", industryTags: ["Bloomberg", "Analytics"], freshness: "Updated 2m ago", updateFrequency: "Real-time", qualityScore: 96, status: "active" },
    { id: "fs-src-5", name: "Compliance Documents", type: "Document Collection", description: "Internal compliance policies, procedures, and regulatory correspondence", industryTags: ["Compliance", "Policy"], freshness: "Updated 1d ago", updateFrequency: "Daily", qualityScore: 84, status: "syncing" },
    { id: "fs-src-6", name: "Trading Algorithms", type: "Document Collection", description: "Algorithm documentation, backtesting results, and strategy parameters", industryTags: ["Algo", "Strategy"], freshness: "Updated 4d ago", updateFrequency: "Weekly", qualityScore: 78, status: "stale" },
  ],
  manufacturing: [
    { id: "mfg-src-1", name: "Standard Operating Procedures", type: "Document Collection", description: "Step-by-step manufacturing procedures for all production lines and processes", industryTags: ["SOP", "Production"], freshness: "Updated 6h ago", updateFrequency: "Daily", qualityScore: 93, status: "active" },
    { id: "mfg-src-2", name: "Equipment Manuals", type: "Document Collection", description: "Technical manuals, maintenance schedules, and troubleshooting guides for all equipment", industryTags: ["Equipment", "Maintenance"], freshness: "Updated 2d ago", updateFrequency: "Weekly", qualityScore: 90, status: "active" },
    { id: "mfg-src-3", name: "Quality Control Database", type: "Structured Database", description: "Inspection results, defect tracking, and statistical process control data", industryTags: ["QC", "Inspection"], freshness: "Updated 30m ago", updateFrequency: "Real-time", qualityScore: 95, status: "active" },
    { id: "mfg-src-4", name: "Supply Chain API", type: "External API", description: "Supplier inventory levels, lead times, and logistics tracking integration", industryTags: ["Supply Chain", "Logistics"], freshness: "Updated 1h ago", updateFrequency: "Real-time", qualityScore: 86, status: "active" },
    { id: "mfg-src-5", name: "ISO Standards", type: "Document Collection", description: "ISO 9001, ISO 14001, and industry-specific standards documentation", industryTags: ["ISO", "Standards"], freshness: "Updated 14d ago", updateFrequency: "Weekly", qualityScore: 92, status: "stale" },
    { id: "mfg-src-6", name: "Safety Protocols", type: "Document Collection", description: "OSHA compliance documents, safety data sheets, and hazard assessments", industryTags: ["Safety", "OSHA"], freshness: "Updated 3d ago", updateFrequency: "Weekly", qualityScore: 88, status: "syncing" },
  ],
  retail: [
    { id: "ret-src-1", name: "Product Catalog", type: "Document Collection", description: "Complete product information including specifications, images, and categorization", industryTags: ["Products", "Catalog"], freshness: "Updated 1h ago", updateFrequency: "Real-time", qualityScore: 94, status: "active" },
    { id: "ret-src-2", name: "Customer Behavior Database", type: "Structured Database", description: "Customer browsing, purchase history, and preference data across channels", industryTags: ["Customer", "Analytics"], freshness: "Updated 10m ago", updateFrequency: "Real-time", qualityScore: 91, status: "active" },
    { id: "ret-src-3", name: "Recommendation Graph", type: "Knowledge Graph", description: "Product affinity graph with collaborative filtering and content-based relationships", industryTags: ["Recommendations", "ML"], freshness: "Updated 4h ago", updateFrequency: "Daily", qualityScore: 87, status: "active" },
    { id: "ret-src-4", name: "Pricing API", type: "External API", description: "Dynamic pricing engine with competitor monitoring and demand-based adjustments", industryTags: ["Pricing", "Dynamic"], freshness: "Updated 5m ago", updateFrequency: "Real-time", qualityScore: 93, status: "active" },
    { id: "ret-src-5", name: "Inventory Systems", type: "Structured Database", description: "Real-time inventory levels across warehouses, stores, and fulfillment centers", industryTags: ["Inventory", "Fulfillment"], freshness: "Updated 2m ago", updateFrequency: "Real-time", qualityScore: 96, status: "active" },
    { id: "ret-src-6", name: "Loyalty Program Data", type: "Document Collection", description: "Loyalty tiers, points balances, redemption history, and program rules", industryTags: ["Loyalty", "Rewards"], freshness: "Updated 1d ago", updateFrequency: "Daily", qualityScore: 82, status: "syncing" },
  ],
};

const DEFAULT_STRATEGIES: RetrievalStrategy[] = [
  {
    id: "strat-1", name: "Vector Similarity Search", description: "Standard RAG pipeline using dense vector embeddings for semantic similarity matching",
    accuracy: 80, latency: "<100ms", steps: ["Embed Query", "Vector Search", "Top-K Selection", "Response Generation"],
    active: true, recommended: false, topK: 5, confidenceThreshold: 0.7, maxLatency: 100, rerankingEnabled: false,
  },
  {
    id: "strat-2", name: "GraphRAG", description: "Knowledge graph-enhanced retrieval combining entity relationships with vector similarity for higher accuracy",
    accuracy: 95, latency: "200-500ms", steps: ["Entity Extraction", "Graph Traversal", "Context Assembly", "Relevance Ranking", "Response Generation"],
    active: true, recommended: true, topK: 10, confidenceThreshold: 0.7, maxLatency: 500, rerankingEnabled: true,
  },
  {
    id: "strat-3", name: "Hybrid Retrieval", description: "Combines vector similarity, keyword matching, and knowledge graph traversal for balanced accuracy and speed",
    accuracy: 90, latency: "150-300ms", steps: ["Parallel Search", "Vector + Keyword + Graph", "Score Fusion", "Reranking", "Response Generation"],
    active: false, recommended: false, topK: 15, confidenceThreshold: 0.7, maxLatency: 300, rerankingEnabled: true,
  },
  {
    id: "strat-4", name: "Cascading Retrieval", description: "Fast initial retrieval with automatic escalation to deeper search when confidence is below threshold",
    accuracy: 92, latency: "Variable", steps: ["Fast Vector Search", "Confidence Check", "Escalate if Low", "Deep Search", "Response Generation"],
    active: false, recommended: false, topK: 20, confidenceThreshold: 0.7, maxLatency: 1000, rerankingEnabled: false,
  },
];

const INDUSTRY_CHUNK_STRATEGIES: Record<string, ChunkStrategy[]> = {
  insurance: [
    { id: "cs-ins-1", name: "Policy Document Chunking", description: "Chunk insurance policy documents preserving coverage sections and endorsements", documentType: "Policy Documents", chunkMethod: "By Section", chunkSizeRange: "500-2000 tokens", overlapStrategy: "10% overlap with context preservation", specialHandling: "Preserves coverage boundaries and cross-references between sections", active: true },
    { id: "cs-ins-2", name: "Regulatory Article Chunking", description: "Chunk regulatory and legal documents by article maintaining statutory references", documentType: "Legal/Regulatory", chunkMethod: "By Article", chunkSizeRange: "300-1500 tokens", overlapStrategy: "15% overlap with citation preservation", specialHandling: "Maintains cross-references to statutes and regulatory codes", active: true },
    { id: "cs-ins-3", name: "Claims Event Sequence", description: "Chunk claims data preserving the chronological event sequence and adjudication steps", documentType: "Claims Records", chunkMethod: "By Event Sequence", chunkSizeRange: "200-1000 tokens", overlapStrategy: "5% overlap with temporal context", specialHandling: "Preserves event timeline and causal relationships", active: true },
    { id: "cs-ins-4", name: "Actuarial Table Chunking", description: "Chunk actuarial tables preserving rate factors and statistical groupings", documentType: "Actuarial Documents", chunkMethod: "By Rating Factor", chunkSizeRange: "100-500 tokens", overlapStrategy: "No overlap (discrete tables)", specialHandling: "Preserves table headers and factor relationships", active: false },
  ],
  healthcare: [
    { id: "cs-hc-1", name: "H&P Section Chunking", description: "Chunk History and Physical documents by clinical section preserving medical context", documentType: "Clinical Notes", chunkMethod: "By Section (History, Assessment, Plan)", chunkSizeRange: "500-2000 tokens", overlapStrategy: "10% overlap with clinical context preservation", specialHandling: "Preserves clinical context and diagnostic reasoning flow", active: true },
    { id: "cs-hc-2", name: "Lab Results Panel Chunking", description: "Chunk laboratory results by test panel maintaining reference ranges", documentType: "Lab Results", chunkMethod: "By Panel", chunkSizeRange: "100-500 tokens", overlapStrategy: "No overlap (discrete panels)", specialHandling: "Preserves reference ranges and critical value flags", active: true },
    { id: "cs-hc-3", name: "Medication Category Chunking", description: "Chunk medication lists by therapeutic category with interaction context", documentType: "Medication Records", chunkMethod: "By Category", chunkSizeRange: "200-800 tokens", overlapStrategy: "5% overlap with interaction context", specialHandling: "Maintains drug interaction cross-references and allergy alerts", active: true },
    { id: "cs-hc-4", name: "Care Pathway Step Chunking", description: "Chunk care pathways by decision point preserving branching logic", documentType: "Care Pathways", chunkMethod: "By Decision Point", chunkSizeRange: "300-1200 tokens", overlapStrategy: "15% overlap with decision context", specialHandling: "Preserves branching logic and outcome criteria", active: false },
  ],
  financial_services: [
    { id: "cs-fs-1", name: "Regulatory Document Chunking", description: "Chunk regulatory filings by article and subsection with citation preservation", documentType: "Regulatory Filings", chunkMethod: "By Article", chunkSizeRange: "500-2000 tokens", overlapStrategy: "15% overlap with citation preservation", specialHandling: "Maintains regulatory cross-references and amendment history", active: true },
    { id: "cs-fs-2", name: "Market Data Instrument Chunking", description: "Chunk market data by instrument type preserving time series context", documentType: "Market Data", chunkMethod: "By Instrument", chunkSizeRange: "200-1000 tokens", overlapStrategy: "10% overlap with temporal context", specialHandling: "Preserves time series continuity and correlation data", active: true },
    { id: "cs-fs-3", name: "Risk Report Factor Chunking", description: "Chunk risk reports by risk factor maintaining aggregation hierarchy", documentType: "Risk Reports", chunkMethod: "By Risk Factor", chunkSizeRange: "300-1500 tokens", overlapStrategy: "10% overlap with factor relationships", specialHandling: "Preserves factor correlations and VaR calculations", active: true },
    { id: "cs-fs-4", name: "Trading Algorithm Documentation", description: "Chunk trading algorithm docs by strategy component preserving logic flow", documentType: "Algorithm Docs", chunkMethod: "By Strategy Component", chunkSizeRange: "400-1800 tokens", overlapStrategy: "20% overlap with logic preservation", specialHandling: "Preserves parameter dependencies and backtest references", active: false },
  ],
  manufacturing: [
    { id: "cs-mfg-1", name: "SOP Procedure Step Chunking", description: "Chunk standard operating procedures by procedure step with safety context", documentType: "SOPs", chunkMethod: "By Procedure Step", chunkSizeRange: "200-1000 tokens", overlapStrategy: "10% overlap with safety context", specialHandling: "Preserves step dependencies and safety warnings", active: true },
    { id: "cs-mfg-2", name: "Quality Record Inspection Chunking", description: "Chunk quality records by inspection point maintaining acceptance criteria", documentType: "Quality Records", chunkMethod: "By Inspection Point", chunkSizeRange: "100-600 tokens", overlapStrategy: "5% overlap with criteria context", specialHandling: "Preserves acceptance criteria and deviation history", active: true },
    { id: "cs-mfg-3", name: "Safety Document Hazard Chunking", description: "Chunk safety documentation by hazard category with mitigation context", documentType: "Safety Documents", chunkMethod: "By Hazard Category", chunkSizeRange: "300-1200 tokens", overlapStrategy: "15% overlap with mitigation context", specialHandling: "Preserves hazard severity ratings and mitigation procedures", active: true },
    { id: "cs-mfg-4", name: "Equipment Manual Section Chunking", description: "Chunk equipment manuals by component system preserving troubleshooting flow", documentType: "Equipment Manuals", chunkMethod: "By Component System", chunkSizeRange: "400-1500 tokens", overlapStrategy: "10% overlap with diagnostic context", specialHandling: "Preserves troubleshooting decision trees and part references", active: false },
  ],
  retail: [
    { id: "cs-ret-1", name: "Product Spec Attribute Chunking", description: "Chunk product specifications by attribute group for faceted search", documentType: "Product Specs", chunkMethod: "By Attribute Group", chunkSizeRange: "100-500 tokens", overlapStrategy: "5% overlap with category context", specialHandling: "Preserves attribute relationships and variant mappings", active: true },
    { id: "cs-ret-2", name: "Customer Journey Stage Chunking", description: "Chunk customer data by journey stage preserving behavioral context", documentType: "Customer Data", chunkMethod: "By Journey Stage", chunkSizeRange: "300-1200 tokens", overlapStrategy: "10% overlap with behavioral context", specialHandling: "Preserves funnel position and conversion signals", active: true },
    { id: "cs-ret-3", name: "Marketing Campaign Segment Chunking", description: "Chunk marketing content by campaign segment with audience targeting context", documentType: "Marketing Content", chunkMethod: "By Campaign Segment", chunkSizeRange: "400-1500 tokens", overlapStrategy: "10% overlap with audience context", specialHandling: "Preserves A/B test variants and targeting parameters", active: true },
    { id: "cs-ret-4", name: "Inventory Location Chunking", description: "Chunk inventory data by fulfillment zone preserving availability context", documentType: "Inventory Records", chunkMethod: "By Fulfillment Zone", chunkSizeRange: "200-800 tokens", overlapStrategy: "No overlap (discrete zones)", specialHandling: "Preserves cross-zone transfer availability and lead times", active: false },
  ],
};

function getMockRecentRetrievals(): RecentRetrieval[] {
  const now = new Date();
  return [
    { id: "ret-1", timestamp: new Date(now.getTime() - 120000).toISOString(), queryPreview: "What are the coverage exclusions for flood damage in commercial property policies?", strategy: "GraphRAG", relevanceScore: 0.94, latency: 245, contextUsed: 82 },
    { id: "ret-2", timestamp: new Date(now.getTime() - 480000).toISOString(), queryPreview: "Calculate the combined ratio for Q3 across all personal auto lines", strategy: "Hybrid Retrieval", relevanceScore: 0.89, latency: 178, contextUsed: 71 },
    { id: "ret-3", timestamp: new Date(now.getTime() - 900000).toISOString(), queryPreview: "Summarize recent regulatory changes affecting surplus lines requirements", strategy: "Vector Similarity Search", relevanceScore: 0.76, latency: 67, contextUsed: 58 },
    { id: "ret-4", timestamp: new Date(now.getTime() - 1800000).toISOString(), queryPreview: "Find all claims with subrogation potential exceeding $50,000", strategy: "GraphRAG", relevanceScore: 0.91, latency: 312, contextUsed: 88 },
    { id: "ret-5", timestamp: new Date(now.getTime() - 3600000).toISOString(), queryPreview: "What reinsurance treaties apply to catastrophe losses in the Southeast region?", strategy: "Cascading Retrieval", relevanceScore: 0.85, latency: 420, contextUsed: 65 },
    { id: "ret-6", timestamp: new Date(now.getTime() - 7200000).toISOString(), queryPreview: "Review underwriting guidelines for commercial general liability new business", strategy: "GraphRAG", relevanceScore: 0.97, latency: 289, contextUsed: 91 },
    { id: "ret-7", timestamp: new Date(now.getTime() - 10800000).toISOString(), queryPreview: "Compare loss development factors across accident years 2020-2024", strategy: "Hybrid Retrieval", relevanceScore: 0.83, latency: 203, contextUsed: 74 },
    { id: "ret-8", timestamp: new Date(now.getTime() - 14400000).toISOString(), queryPreview: "Identify policy forms requiring update for new state filing requirements", strategy: "Vector Similarity Search", relevanceScore: 0.72, latency: 89, contextUsed: 52 },
  ];
}

const SOURCE_TYPE_ICONS: Record<string, typeof Database> = {
  "Document Collection": FileText,
  "Structured Database": Database,
  "Knowledge Graph": GitBranch,
  "External API": Globe,
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  syncing: "secondary",
  stale: "destructive",
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function RagPipeline() {
  const [activeTab, setActiveTab] = useState("knowledge-sources");
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [strategies, setStrategies] = useState<RetrievalStrategy[]>(DEFAULT_STRATEGIES);
  const [chunkStrategies, setChunkStrategies] = useState<Record<string, ChunkStrategy[]>>({});
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceType, setNewSourceType] = useState<string>("Document Collection");
  const [newSourceDesc, setNewSourceDesc] = useState("");
  const [newSourceFrequency, setNewSourceFrequency] = useState("Daily");
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configStrategy, setConfigStrategy] = useState<RetrievalStrategy | null>(null);
  const [configTopK, setConfigTopK] = useState(10);
  const [configThreshold, setConfigThreshold] = useState(0.7);
  const [configMaxLatency, setConfigMaxLatency] = useState(500);
  const [configReranking, setConfigReranking] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const { toast } = useToast();
  const { industry: currentIndustry } = useIndustry();

  const industryId = currentIndustry?.id || "insurance";

  const { data: pipelines = [], isLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ["/api/rag-pipelines"],
  });

  const savePipelineMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/rag-pipelines", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rag-pipelines"] });
      toast({ title: "Pipeline configuration saved" });
    },
  });

  const industrySources = useMemo(() => {
    const base = INDUSTRY_SOURCES[industryId] || INDUSTRY_SOURCES.insurance;
    return [...base, ...sources];
  }, [industryId, sources]);

  const filteredSources = useMemo(() => {
    if (!searchFilter) return industrySources;
    const lower = searchFilter.toLowerCase();
    return industrySources.filter(
      (s) => s.name.toLowerCase().includes(lower) || s.type.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower)
    );
  }, [industrySources, searchFilter]);

  const industryChunks = useMemo(() => {
    const base = INDUSTRY_CHUNK_STRATEGIES[industryId] || INDUSTRY_CHUNK_STRATEGIES.insurance;
    const overrides = chunkStrategies[industryId];
    if (overrides) return overrides;
    return base;
  }, [industryId, chunkStrategies]);

  const recentRetrievals = useMemo(() => getMockRecentRetrievals(), []);

  function addSource() {
    if (!newSourceName.trim()) return;
    const src: KnowledgeSource = {
      id: `custom-${Date.now()}`,
      name: newSourceName,
      type: newSourceType as KnowledgeSource["type"],
      description: newSourceDesc,
      industryTags: ["Custom"],
      freshness: "Just added",
      updateFrequency: newSourceFrequency,
      qualityScore: 70,
      status: "syncing",
    };
    setSources((prev) => [...prev, src]);
    setAddSourceOpen(false);
    setNewSourceName("");
    setNewSourceDesc("");
    setNewSourceFrequency("Daily");
    toast({ title: "Knowledge source added", description: `${src.name} is now syncing` });
  }

  function openConfigDialog(strategy: RetrievalStrategy) {
    setConfigStrategy(strategy);
    setConfigTopK(strategy.topK);
    setConfigThreshold(strategy.confidenceThreshold);
    setConfigMaxLatency(strategy.maxLatency);
    setConfigReranking(strategy.rerankingEnabled);
    setConfigDialogOpen(true);
  }

  function saveStrategyConfig() {
    if (!configStrategy) return;
    setStrategies((prev) =>
      prev.map((s) =>
        s.id === configStrategy.id
          ? { ...s, topK: configTopK, confidenceThreshold: configThreshold, maxLatency: configMaxLatency, rerankingEnabled: configReranking }
          : s
      )
    );
    setConfigDialogOpen(false);
    toast({ title: "Strategy configured", description: `${configStrategy.name} settings updated` });
  }

  function toggleStrategyActive(strategyId: string) {
    setStrategies((prev) =>
      prev.map((s) => (s.id === strategyId ? { ...s, active: !s.active } : s))
    );
  }

  function toggleChunkActive(chunkId: string) {
    const base = INDUSTRY_CHUNK_STRATEGIES[industryId] || INDUSTRY_CHUNK_STRATEGIES.insurance;
    const current = chunkStrategies[industryId] || base;
    const updated = current.map((c) => (c.id === chunkId ? { ...c, active: !c.active } : c));
    setChunkStrategies((prev) => ({ ...prev, [industryId]: updated }));
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Database className="h-6 w-6 text-muted-foreground" />
              <h1 className="text-2xl font-bold" data-testid="text-page-title">RAG Pipeline Manager</h1>
              <Badge variant="outline" className="text-[10px]">NEW</Badge>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
              Configure knowledge sources, retrieval strategies, and chunking pipelines for industry-specific RAG
            </p>
          </div>
          {currentIndustry && (
            <Badge variant="secondary" data-testid="badge-industry">
              {currentIndustry.label}
            </Badge>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="tabs-rag-pipeline">
            <TabsTrigger value="knowledge-sources" data-testid="tab-knowledge-sources">Knowledge Sources</TabsTrigger>
            <TabsTrigger value="retrieval-strategies" data-testid="tab-retrieval-strategies">Retrieval Strategies</TabsTrigger>
            <TabsTrigger value="chunk-strategies" data-testid="tab-chunk-strategies">Chunk Strategies</TabsTrigger>
            <TabsTrigger value="quality-dashboard" data-testid="tab-quality-dashboard">Quality Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="knowledge-sources" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search sources..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="pl-9 w-64"
                    data-testid="input-search-sources"
                  />
                </div>
                <Badge variant="outline" data-testid="badge-source-count">{filteredSources.length} sources</Badge>
              </div>
              <Button onClick={() => setAddSourceOpen(true)} data-testid="button-add-source">
                <Plus className="h-4 w-4 mr-1" />
                Add Source
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSources.map((source) => {
                const TypeIcon = SOURCE_TYPE_ICONS[source.type] || FileText;
                return (
                  <Card key={source.id} className="hover-elevate" data-testid={`card-source-${source.id}`}>
                    <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <TypeIcon className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-lg font-medium" data-testid={`text-source-name-${source.id}`}>{source.name}</CardTitle>
                      </div>
                      <Badge variant={STATUS_VARIANTS[source.status] || "secondary"} data-testid={`badge-status-${source.id}`}>
                        {source.status}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground" data-testid={`text-source-desc-${source.id}`}>{source.description}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" data-testid={`badge-type-${source.id}`}>{source.type}</Badge>
                        {source.industryTags.map((tag) => (
                          <Badge key={tag} variant="outline" data-testid={`badge-tag-${source.id}-${tag}`}>{tag}</Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground" data-testid={`text-freshness-${source.id}`}>{source.freshness}</span>
                        <Badge variant="outline" data-testid={`badge-frequency-${source.id}`}>
                          <RefreshCw className="h-3 w-3 mr-1" />
                          {source.updateFrequency}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Quality Score</span>
                          <span className="text-xs font-medium" data-testid={`text-quality-${source.id}`}>{source.qualityScore}%</span>
                        </div>
                        <Progress value={source.qualityScore} className="h-1.5" data-testid={`progress-quality-${source.id}`} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="retrieval-strategies" className="space-y-4">
            <p className="text-sm text-muted-foreground">Configure retrieval strategies to optimize context quality and response accuracy for your use case.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {strategies.map((strategy) => (
                <Card key={strategy.id} className="hover-elevate" data-testid={`card-strategy-${strategy.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg font-medium" data-testid={`text-strategy-name-${strategy.id}`}>{strategy.name}</CardTitle>
                      {strategy.recommended && (
                        <Badge variant="default" data-testid={`badge-recommended-${strategy.id}`}>Recommended</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`switch-strategy-${strategy.id}`} className="text-xs text-muted-foreground">
                        {strategy.active ? "Active" : "Inactive"}
                      </Label>
                      <Switch
                        id={`switch-strategy-${strategy.id}`}
                        checked={strategy.active}
                        onCheckedChange={() => toggleStrategyActive(strategy.id)}
                        data-testid={`switch-strategy-${strategy.id}`}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground" data-testid={`text-strategy-desc-${strategy.id}`}>{strategy.description}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" data-testid={`badge-accuracy-${strategy.id}`}>
                        <Activity className="h-3 w-3 mr-1" />
                        {strategy.accuracy}% Accuracy
                      </Badge>
                      <Badge variant="outline" data-testid={`badge-latency-${strategy.id}`}>
                        <Clock className="h-3 w-3 mr-1" />
                        {strategy.latency}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {strategy.steps.map((step, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs" data-testid={`badge-step-${strategy.id}-${i}`}>{step}</Badge>
                          {i < strategy.steps.length - 1 && <ArrowUpRight className="h-3 w-3 text-muted-foreground" />}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Top-K: {strategy.topK}</span>
                        <span>Threshold: {strategy.confidenceThreshold}</span>
                        {strategy.rerankingEnabled && <Badge variant="outline" className="text-xs">Reranking</Badge>}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openConfigDialog(strategy)} data-testid={`button-configure-${strategy.id}`}>
                        <Settings className="h-3 w-3 mr-1" />
                        Configure
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="chunk-strategies" className="space-y-4">
            <p className="text-sm text-muted-foreground">Industry-optimized chunking strategies that preserve domain-specific context and relationships.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {industryChunks.map((chunk) => (
                <Card key={chunk.id} className="hover-elevate" data-testid={`card-chunk-${chunk.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-lg font-medium" data-testid={`text-chunk-name-${chunk.id}`}>{chunk.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`switch-chunk-${chunk.id}`} className="text-xs text-muted-foreground">
                        {chunk.active ? "Active" : "Inactive"}
                      </Label>
                      <Switch
                        id={`switch-chunk-${chunk.id}`}
                        checked={chunk.active}
                        onCheckedChange={() => toggleChunkActive(chunk.id)}
                        data-testid={`switch-chunk-${chunk.id}`}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground" data-testid={`text-chunk-desc-${chunk.id}`}>{chunk.description}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" data-testid={`badge-doctype-${chunk.id}`}>{chunk.documentType}</Badge>
                      <Badge variant="outline" data-testid={`badge-method-${chunk.id}`}>{chunk.chunkMethod}</Badge>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Layers className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Size:</span>
                        <span data-testid={`text-chunk-size-${chunk.id}`}>{chunk.chunkSizeRange}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Filter className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Overlap:</span>
                        <span data-testid={`text-chunk-overlap-${chunk.id}`}>{chunk.overlapStrategy}</span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground border-t pt-2" data-testid={`text-chunk-handling-${chunk.id}`}>
                      {chunk.specialHandling}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="quality-dashboard" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="hover-elevate" data-testid="card-metric-relevance">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Relevance Score</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold" data-testid="text-relevance-score">0.87</span>
                    <span className="flex items-center text-sm text-green-600 dark:text-green-400 mb-1">
                      <TrendingUp className="h-3 w-3 mr-0.5" />
                      +0.03
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Avg relevance of retrieved contexts</p>
                </CardContent>
              </Card>

              <Card className="hover-elevate" data-testid="card-metric-latency">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Retrieval Latency</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <span className="text-xs text-muted-foreground">P50</span>
                      <p className="text-lg font-bold" data-testid="text-latency-p50">142ms</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">P95</span>
                      <p className="text-lg font-bold" data-testid="text-latency-p95">387ms</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">P99</span>
                      <p className="text-lg font-bold" data-testid="text-latency-p99">612ms</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover-elevate" data-testid="card-metric-utilization">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Context Utilization</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold" data-testid="text-context-utilization">73%</span>
                    <span className="flex items-center text-sm text-green-600 dark:text-green-400 mb-1">
                      <TrendingUp className="h-3 w-3 mr-0.5" />
                      +5%
                    </span>
                  </div>
                  <Progress value={73} className="h-1.5 mt-2" data-testid="progress-context-utilization" />
                  <p className="text-xs text-muted-foreground mt-1">Context actually used by agents</p>
                </CardContent>
              </Card>

              <Card className="hover-elevate" data-testid="card-metric-hallucination">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Hallucination Correlation</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold" data-testid="text-hallucination-rate">0.12</span>
                    <span className="flex items-center text-sm text-green-600 dark:text-green-400 mb-1">
                      <ArrowDownRight className="h-3 w-3 mr-0.5" />
                      -0.04
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Lower is better (inverse correlation)</p>
                </CardContent>
              </Card>
            </div>

            <Card data-testid="card-recent-retrievals">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-medium">Recent Retrievals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pr-4 font-medium text-muted-foreground">Timestamp</th>
                        <th className="pb-2 pr-4 font-medium text-muted-foreground">Query</th>
                        <th className="pb-2 pr-4 font-medium text-muted-foreground">Strategy</th>
                        <th className="pb-2 pr-4 font-medium text-muted-foreground">Relevance</th>
                        <th className="pb-2 pr-4 font-medium text-muted-foreground">Latency</th>
                        <th className="pb-2 font-medium text-muted-foreground">Context Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRetrievals.map((r) => (
                        <tr key={r.id} className="border-b last:border-0" data-testid={`row-retrieval-${r.id}`}>
                          <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap" data-testid={`text-retrieval-time-${r.id}`}>
                            {formatTimestamp(r.timestamp)}
                          </td>
                          <td className="py-2 pr-4 max-w-xs truncate" data-testid={`text-retrieval-query-${r.id}`}>
                            {r.queryPreview}
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap">
                            <Badge variant="secondary" data-testid={`badge-retrieval-strategy-${r.id}`}>{r.strategy}</Badge>
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap" data-testid={`text-retrieval-relevance-${r.id}`}>
                            <span className={r.relevanceScore >= 0.85 ? "text-green-600 dark:text-green-400" : r.relevanceScore >= 0.75 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}>
                              {r.relevanceScore.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap" data-testid={`text-retrieval-latency-${r.id}`}>{r.latency}ms</td>
                          <td className="py-2 whitespace-nowrap" data-testid={`text-retrieval-context-${r.id}`}>{r.contextUsed}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={addSourceOpen} onOpenChange={setAddSourceOpen}>
          <DialogContent data-testid="dialog-add-source">
            <DialogHeader>
              <DialogTitle>Add Knowledge Source</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="source-name">Name</Label>
                <Input
                  id="source-name"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  placeholder="Enter source name"
                  data-testid="input-source-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source-type">Type</Label>
                <Select value={newSourceType} onValueChange={setNewSourceType}>
                  <SelectTrigger data-testid="select-source-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Document Collection">Document Collection</SelectItem>
                    <SelectItem value="Structured Database">Structured Database</SelectItem>
                    <SelectItem value="Knowledge Graph">Knowledge Graph</SelectItem>
                    <SelectItem value="External API">External API</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="source-desc">Description</Label>
                <Textarea
                  id="source-desc"
                  value={newSourceDesc}
                  onChange={(e) => setNewSourceDesc(e.target.value)}
                  placeholder="Describe this knowledge source"
                  data-testid="input-source-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source-freq">Update Frequency</Label>
                <Select value={newSourceFrequency} onValueChange={setNewSourceFrequency}>
                  <SelectTrigger data-testid="select-source-frequency">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Real-time">Real-time</SelectItem>
                    <SelectItem value="Daily">Daily</SelectItem>
                    <SelectItem value="Weekly">Weekly</SelectItem>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddSourceOpen(false)} data-testid="button-cancel-add-source">Cancel</Button>
              <Button onClick={addSource} disabled={!newSourceName.trim()} data-testid="button-confirm-add-source">Add Source</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
          <DialogContent data-testid="dialog-configure-strategy">
            <DialogHeader>
              <DialogTitle>Configure {configStrategy?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="config-topk">Top-K Results</Label>
                <Input
                  id="config-topk"
                  type="number"
                  min={1}
                  max={100}
                  value={configTopK}
                  onChange={(e) => setConfigTopK(parseInt(e.target.value, 10) || 1)}
                  data-testid="input-config-topk"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="config-threshold">Confidence Threshold (0-1)</Label>
                <Input
                  id="config-threshold"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={configThreshold}
                  onChange={(e) => setConfigThreshold(parseFloat(e.target.value) || 0)}
                  data-testid="input-config-threshold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="config-latency">Max Latency (ms)</Label>
                <Input
                  id="config-latency"
                  type="number"
                  min={10}
                  max={10000}
                  value={configMaxLatency}
                  onChange={(e) => setConfigMaxLatency(parseInt(e.target.value, 10) || 100)}
                  data-testid="input-config-max-latency"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="config-reranking">Reranking Enabled</Label>
                <Switch
                  id="config-reranking"
                  checked={configReranking}
                  onCheckedChange={setConfigReranking}
                  data-testid="switch-config-reranking"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigDialogOpen(false)} data-testid="button-cancel-config">Cancel</Button>
              <Button onClick={saveStrategyConfig} data-testid="button-save-config">Save Configuration</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ScrollArea>
  );
}