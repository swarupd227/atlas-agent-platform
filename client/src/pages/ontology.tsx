import { useState, useMemo, useCallback, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Search,
  BookOpen,
  Network,
  Sparkles,
  Wand2,
  Loader2,
  ChevronRight,
  Tag,
  Link2,
  Brain,
  GitBranch,
  Check,
  XCircle,
  Shield,
  AlertTriangle,
  Lightbulb,
  Plus,
  Trash2,
  BarChart3,
  Clock,
  CircleDot,
  List,
  Share2,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Database,
  X,
  CheckCircle,
  ArrowRight,
  History,
  Bot,
  Upload,
  Download,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OntologyNeighbourhood, OntologyDomainMap, domainColors, buildIncoming, type MapConcept } from "@/components/ontology-map";
import { useIndustry } from "@/components/industry-provider";
import { PermissionGate } from "@/components/role-provider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OntologyConcept as DbOntologyConcept, OntologyEnhancement } from "@shared/schema";

interface OntologyProperty {
  name: string;
  type: string;
  description: string;
}

interface OntologyRelationship {
  type: "parent" | "child" | "related" | "depends_on";
  targetId: string;
  label: string;
  exists?: boolean;
  resolvedTargetId?: string;
}

interface LinkedRegulation {
  name: string;
  url?: string;
}

interface ConceptView {
  id: string;
  label: string;
  category: string;
  /** The ontology (domain) the concept belongs to, e.g. "ISA-95 (Enterprise-Control Integration)". */
  domain: string;
  description: string;
  industryId: string;
  properties: OntologyProperty[];
  relationships: OntologyRelationship[];
  tags: string[];
  synonyms: string[];
  source: string;
  usageCount: number;
  linkedRegulations: LinkedRegulation[];
  industryRelevance: string | null;
  version: number;
  sensitivityClassification: {
    level: string;
    dataTypes: string[];
    redactionRequired: boolean;
    retentionDays: number | null;
  } | null;
}

interface VersionHistoryEntry {
  label: string;
  description: string;
  properties: unknown;
  relationships: unknown;
  synonyms: string[];
  linkedRegulations: unknown;
  version: number;
  updatedAt: string;
}

interface EnrichedConcept {
  enrichedDescription?: string;
  regulatoryRelevance?: string;
  agentUseCases?: string[];
  dataHandlingConsiderations?: string;
  relatedStandards?: string[];
  implementationGuidance?: string;
  riskFactors?: string[];
  suggestedProperties?: OntologyProperty[];
  suggestedRelationships?: OntologyRelationship[];
  suggestedTags?: string[];
  agentSkills?: string[];
  agentTypes?: string[];
}

interface KgSuggestion {
  type: string;
  targetEntity: string;
  source: string;
  confidence: number;
  context: string | null;
}

interface KgRelatedResponse {
  term: string;
  industry: string;
  kgResults: number;
  aiResults: number;
  suggestions: KgSuggestion[];
}

const AGENT_MAPPING: Record<string, { skills: string[]; agentTypes: string[] }> = {
  "Financial Instruments": { skills: ["Trade Execution", "Pricing", "Portfolio Analysis", "Risk Calculation"], agentTypes: ["Trading Agent", "Portfolio Manager Agent", "Market Analyst Agent"] },
  "Parties & Roles": { skills: ["Identity Verification", "Client Onboarding", "Due Diligence", "Relationship Management"], agentTypes: ["KYC Agent", "Onboarding Agent", "Client Service Agent"] },
  "Risk & Compliance": { skills: ["Risk Scoring", "Compliance Checking", "Alert Triage", "Report Generation"], agentTypes: ["Compliance Agent", "Risk Monitor Agent", "AML Agent"] },
  "Market Data": { skills: ["Data Aggregation", "Price Discovery", "Valuation", "Analytics"], agentTypes: ["Data Agent", "Valuation Agent", "Analytics Agent"] },
  "Payment Systems": { skills: ["Payment Processing", "Reconciliation", "Settlement Matching", "Exception Handling"], agentTypes: ["Payment Agent", "Settlement Agent", "Reconciliation Agent"] },
  "Regulatory": { skills: ["Report Filing", "Rule Interpretation", "Impact Analysis", "Change Tracking"], agentTypes: ["Regulatory Agent", "Reporting Agent", "Compliance Monitor Agent"] },
  "Clinical Findings": { skills: ["Symptom Analysis", "Pattern Detection", "Alert Generation", "Trend Monitoring"], agentTypes: ["Clinical Decision Support Agent", "Monitoring Agent", "Infection Control Agent"] },
  "Procedures": { skills: ["Scheduling", "Documentation", "Consent Tracking", "Protocol Compliance"], agentTypes: ["Surgical Coordinator Agent", "Documentation Agent", "Clinical Trial Agent"] },
  "Patient Management": { skills: ["Flow Optimization", "Capacity Planning", "Discharge Coordination", "Care Planning"], agentTypes: ["Patient Flow Agent", "Bed Management Agent", "Care Coordinator Agent"] },
  "Pharmaceutical": { skills: ["Drug Interaction Checking", "Formulary Management", "Dosage Verification", "Reconciliation"], agentTypes: ["Pharmacy Agent", "Medication Safety Agent", "Formulary Agent"] },
  "Diagnostic": { skills: ["Code Suggestion", "Result Interpretation", "Order Optimization", "Critical Value Alerting"], agentTypes: ["Coding Agent", "Lab Results Agent", "Radiology Agent"] },
  "Administrative": { skills: ["Documentation", "Billing", "Referral Processing", "Quality Reporting"], agentTypes: ["Billing Agent", "Documentation Agent", "Quality Agent"] },
  "Production Operations": { skills: ["Scheduling", "OEE Monitoring", "Recipe Control", "Waste Analysis"], agentTypes: ["Production Agent", "Scheduling Agent", "Process Control Agent"] },
  "Quality Management": { skills: ["Inspection Automation", "SPC Monitoring", "CAPA Tracking", "Standard Management"], agentTypes: ["Quality Agent", "SPC Agent", "CAPA Agent"] },
  "Maintenance": { skills: ["Failure Prediction", "Schedule Optimization", "Calibration Tracking", "Root Cause Analysis"], agentTypes: ["Predictive Maintenance Agent", "Calibration Agent", "Reliability Agent"] },
  "Inventory": { skills: ["Material Tracking", "BOM Validation", "Warehouse Optimization", "Lot Tracing"], agentTypes: ["Inventory Agent", "Warehouse Agent", "Material Agent"] },
  "Supply Chain": { skills: ["Demand Planning", "Supplier Evaluation", "Logistics Optimization", "Risk Monitoring"], agentTypes: ["Planning Agent", "Procurement Agent", "Logistics Agent"] },
  "Equipment": { skills: ["Asset Monitoring", "Sensor Analysis", "Energy Optimization", "Line Balancing"], agentTypes: ["Asset Agent", "IoT Agent", "Energy Agent"] },
  "Product Identification": { skills: ["GTIN Management", "Content Scoring", "Shelf Monitoring", "Assortment Analysis"], agentTypes: ["Product Data Agent", "Digital Shelf Agent", "Category Agent"] },
  "Customer Experience": { skills: ["Journey Analysis", "Personalization", "Loyalty Management", "Fraud Detection"], agentTypes: ["Personalization Agent", "Loyalty Agent", "Fraud Agent"] },
  "Pricing": { skills: ["Elasticity Modeling", "Competitive Monitoring", "Markdown Optimization", "Promotion Planning"], agentTypes: ["Pricing Agent", "Competitive Intel Agent", "Promotion Agent"] },
  "Fulfillment": { skills: ["Order Routing", "Pick Optimization", "Returns Processing", "Delivery Management"], agentTypes: ["Fulfillment Agent", "Returns Agent", "Last Mile Agent"] },
  "Claims Management": { skills: ["FNOL Processing", "Damage Assessment", "Fraud Detection", "Settlement Calculation"], agentTypes: ["Claims Adjuster Agent", "Fraud Detection Agent", "Settlement Agent"] },
  "Underwriting": { skills: ["Risk Scoring", "Premium Calculation", "Exposure Analysis", "Policy Binding"], agentTypes: ["Underwriting Agent", "Risk Assessment Agent", "Pricing Agent"] },
  "Policy Administration": { skills: ["Policy Issuance", "Endorsement Processing", "Renewal Management", "Cancellation Handling"], agentTypes: ["Policy Admin Agent", "Renewal Agent", "Endorsement Agent"] },
  "Reinsurance": { skills: ["Treaty Management", "Cession Calculation", "Recovery Tracking", "Retrocession Analysis"], agentTypes: ["Reinsurance Agent", "Treaty Agent", "Recovery Agent"] },
  "Actuarial": { skills: ["Loss Reserving", "Experience Rating", "Mortality Analysis", "Catastrophe Modeling"], agentTypes: ["Actuarial Agent", "Reserving Agent", "Catastrophe Model Agent"] },
  "Distribution": { skills: ["Agent Licensing", "Commission Calculation", "Quote Comparison", "Lead Scoring"], agentTypes: ["Distribution Agent", "Commission Agent", "Quote Agent"] },
};

const relationshipTypeColors: Record<string, string> = {
  parent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  child: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  related: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  depends_on: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
};

const CATEGORY_COLORS = [
  "hsl(210, 70%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(30, 80%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(0, 65%, 55%)",
  "hsl(180, 55%, 45%)",
  "hsl(60, 70%, 45%)",
  "hsl(330, 60%, 55%)",
  "hsl(240, 50%, 60%)",
  "hsl(120, 50%, 45%)",
];

function toConceptView(c: DbOntologyConcept): ConceptView {
  return {
    id: c.id,
    label: c.label,
    category: c.category,
    domain: c.ontologyName || "Ontology",
    description: c.description,
    industryId: c.industryId,
    properties: (c.properties as OntologyProperty[]) || [],
    // Concepts store links as {targetId, label} or as {target, type}; read both so
    // every link resolves and has readable text.
    relationships: ((c.relationships as Array<Record<string, any>>) || []).map((r) => ({
      ...r,
      type: r.type || "related",
      targetId: r.targetId ?? r.target,
      label: r.label || String(r.type || "related").replace(/_/g, " "),
    })) as OntologyRelationship[],
    tags: c.tags || [],
    synonyms: c.synonyms || [],
    source: c.source || "industry-standard",
    usageCount: c.usageCount || 0,
    linkedRegulations: (c.linkedRegulations as LinkedRegulation[]) || [],
    industryRelevance: c.industryRelevance,
    version: c.version || 1,
    sensitivityClassification: (c.sensitivityClassification as ConceptView["sensitivityClassification"]) || null,
  };
}

interface CsvImportRow {
  label: string;
  category: string;
  description: string;
  industryId: string;
  tags: string;
  synonyms: string;
  linkedRegulations: string;
  sensitivityLevel: string;
  isDuplicate: boolean;
}

const CSV_HEADERS = ["label", "category", "description", "industryId", "tags", "synonyms", "linkedRegulations", "sensitivityLevel"];

function parseCsvText(text: string): Omit<CsvImportRow, "isDuplicate">[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === "," && !inQuotes) {
        fields.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    return fields;
  };
  const headers = parseRow(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);
  return lines.slice(1).map((line) => {
    const f = parseRow(line);
    const get = (name: string) => (f[idx(name)] ?? "").trim();
    return {
      label: get("label"),
      category: get("category"),
      description: get("description"),
      industryId: get("industryid") || get("industryId") || get("industry_id"),
      tags: get("tags"),
      synonyms: get("synonyms"),
      linkedRegulations: get("linkedregulations") || get("linkedRegulations") || get("linked_regulations"),
      sensitivityLevel: get("sensitivitylevel") || get("sensitivityLevel") || get("sensitivity_level"),
    };
  }).filter((r) => r.label.length > 0 && r.category.length > 0);
}

function buildCsvExport(concepts: ConceptView[]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = CSV_HEADERS.join(",");
  const rows = concepts.map((c) =>
    [
      escape(c.label),
      escape(c.category),
      escape(c.description),
      escape(c.industryId),
      escape(c.tags.join(";")),
      escape(c.synonyms.join(";")),
      escape(c.linkedRegulations.map((r) => r.name).join(";")),
      escape(c.sensitivityClassification?.level ?? ""),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

const CSV_TEMPLATE = `label,category,description,industryId,tags,synonyms,linkedRegulations,sensitivityLevel\n"Order to Cash","Financial Processes","End-to-end process from customer order to payment receipt","financial-services","ar;revenue;billing","O2C;OTC","","internal"`;

type SourceFilter = "all" | "standard" | "custom" | "unused";
type ViewMode = "list" | "graph";

export default function OntologyExplorer() {
  const { industry } = useIndustry();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryCustom, setNewCategoryCustom] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSynonyms, setNewSynonyms] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newRelateTo, setNewRelateTo] = useState("");
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);
  const [reconcileResults, setReconcileResults] = useState<{ orphaned: any[]; total: number } | null>(null);
  const [kgPanelOpen, setKgPanelOpen] = useState(false);
  const [kgSuggestions, setKgSuggestions] = useState<KgSuggestion[]>([]);
  const [kgDismissed, setKgDismissed] = useState<Set<number>>(new Set());
  const [kgAccepted, setKgAccepted] = useState<Set<number>>(new Set());
  const [kgPendingIdx, setKgPendingIdx] = useState<Set<number>>(new Set());
  const [kgApplyingAll, setKgApplyingAll] = useState(false);
  const [kgBuilderOpen, setKgBuilderOpen] = useState(false);
  const [kgBuilderStep, setKgBuilderStep] = useState<"configure" | "generating" | "review">("configure");
  const [kgSubdomain, setKgSubdomain] = useState("");
  const [kgCustomSubdomain, setKgCustomSubdomain] = useState(false);
  const [kgCompanyContext, setKgCompanyContext] = useState("");
  const [kgGeneratedConcepts, setKgGeneratedConcepts] = useState<any[]>([]);
  const [kgSelectedIds, setKgSelectedIds] = useState<Set<string>>(new Set());
  const [kgImporting, setKgImporting] = useState(false);
  const [kgExpandedCategories, setKgExpandedCategories] = useState<Set<string>>(new Set());
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvImportRow[]>([]);
  const [csvSelected, setCsvSelected] = useState<Set<number>>(new Set());
  const [csvImporting, setCsvImporting] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const industryId = industry ? industry.id : null;

  const { data: rawConcepts = [], isLoading: conceptsLoading } = useQuery<DbOntologyConcept[]>({
    queryKey: ["/api/ontology/concepts", industryId],
    queryFn: async () => {
      if (!industryId) return [];
      const res = await fetch(`/api/ontology/concepts?industryId=${industryId}`);
      if (!res.ok) throw new Error("Failed to load concepts");
      return res.json();
    },
    enabled: !!industryId,
  });

  const concepts: ConceptView[] = useMemo(() => rawConcepts.map(toConceptView), [rawConcepts]);

  // Ontology roadmap Phase 4: "where is the ontology thin" -- real data,
  // computed from every agent that actually exists, not a one-time audit.
  const { data: coverage } = useQuery<{
    totalConcepts: number;
    usedCount: number;
    unusedCount: number;
    unused: Array<{ id: string; label: string; category: string; subVerticals: string[] }>;
    bySubVertical?: Array<{ subVertical: string; total: number; unused: number }>;
  } | null>({
    queryKey: ["/api/ontology/coverage", industryId],
    queryFn: async () => {
      if (!industryId) return null;
      const res = await fetch(`/api/ontology/coverage?industryId=${industryId}`);
      if (!res.ok) throw new Error("Failed to load coverage");
      return res.json();
    },
    enabled: !!industryId,
  });
  const unusedConceptIds = useMemo(() => new Set((coverage?.unused || []).map((c) => c.id)), [coverage]);

  const conceptIds = useMemo(() => concepts.map((c) => c.id), [concepts]);
  const { data: enhancements = [] } = useQuery<OntologyEnhancement[]>({
    queryKey: ["/api/ontology/enhancements", conceptIds.join(",")],
    queryFn: async () => {
      if (conceptIds.length === 0) return [];
      const res = await fetch(`/api/ontology/enhancements?conceptIds=${conceptIds.join(",")}`);
      if (!res.ok) throw new Error("Failed to load enhancements");
      return res.json();
    },
    enabled: conceptIds.length > 0,
  });

  const enhancementMap = useMemo(() => {
    const map: Record<string, OntologyEnhancement> = {};
    for (const e of enhancements) {
      map[e.conceptId] = e;
    }
    return map;
  }, [enhancements]);

  const filteredBySource = useMemo(() => {
    const inDomain = domainFilter ? concepts.filter((c) => c.domain === domainFilter) : concepts;
    if (sourceFilter === "all") return inDomain;
    if (sourceFilter === "standard") return inDomain.filter((c) => c.source !== "custom-extension");
    if (sourceFilter === "unused") return inDomain.filter((c) => unusedConceptIds.has(c.id));
    return inDomain.filter((c) => c.source === "custom-extension");
  }, [concepts, sourceFilter, unusedConceptIds, domainFilter]);

  const categories = useMemo(() => {
    const cats: Record<string, ConceptView[]> = {};
    for (const concept of filteredBySource) {
      if (!cats[concept.category]) cats[concept.category] = [];
      cats[concept.category].push(concept);
    }
    return cats;
  }, [filteredBySource]);

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const c of concepts) cats.add(c.category);
    return Array.from(cats).sort();
  }, [concepts]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase();
    const result: Record<string, ConceptView[]> = {};
    for (const [cat, catConcepts] of Object.entries(categories)) {
      const filtered = catConcepts.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)) ||
          c.synonyms.some((s) => s.toLowerCase().includes(q))
      );
      if (filtered.length > 0) result[cat] = filtered;
    }
    return result;
  }, [categories, searchQuery]);

  const selectedConcept = useMemo(() => {
    if (!selectedConceptId) return null;
    return concepts.find((c) => c.id === selectedConceptId) || null;
  }, [selectedConceptId, concepts]);

  const { data: versionData } = useQuery<{ currentVersion: number; history: VersionHistoryEntry[] }>({
    queryKey: ["/api/ontology/concepts", selectedConceptId, "versions"],
    queryFn: async () => {
      const res = await fetch(`/api/ontology/concepts/${selectedConceptId}/versions`);
      if (!res.ok) throw new Error("Failed to load version history");
      return res.json();
    },
    enabled: !!selectedConceptId,
  });

  const { data: linkedAgents } = useQuery<Array<{ id: string; name: string; status: string; requiresRevalidation: boolean; revalidationReason: string | null }>>({
    queryKey: ["/api/ontology/concepts", selectedConceptId, "linked-agents"],
    queryFn: async () => {
      const res = await fetch(`/api/ontology/concepts/${selectedConceptId}/linked-agents`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedConceptId,
  });

  const [localEnriched, setLocalEnriched] = useState<Record<string, EnrichedConcept>>({});

  const reconcileScanMutation = useMutation({
    mutationFn: async () => {
      if (!industryId) throw new Error("No industry selected");
      const res = await apiRequest("POST", "/api/ontology/reconcile-relationships", { industryId });
      return res.json();
    },
    onSuccess: (data) => {
      setReconcileResults(data);
      setReconcileDialogOpen(true);
    },
    onError: (err: Error) => {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    },
  });

  const reconcileActionMutation = useMutation({
    mutationFn: async (action: "remove" | "create_stubs") => {
      if (!industryId) throw new Error("No industry selected");
      const res = await apiRequest("POST", "/api/ontology/reconcile-relationships", { industryId, action });
      return res.json();
    },
    onSuccess: (data) => {
      setReconcileDialogOpen(false);
      setReconcileResults(null);
      queryClient.invalidateQueries({ queryKey: ["/api/ontology/concepts"] });
      if (data.action === "remove") {
        toast({ title: "Relationships cleaned", description: `Removed ${data.removed} orphaned relationship(s)` });
      } else {
        toast({ title: "Concepts created", description: `Created ${data.created?.length || 0} stub concept(s)` });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Reconciliation failed", description: err.message, variant: "destructive" });
    },
  });

  const enhanceMutation = useMutation({
    mutationFn: async (concept: ConceptView) => {
      const res = await apiRequest("POST", "/api/ai/enhance-ontology-concept", {
        conceptId: concept.id,
        label: concept.label,
        category: concept.category,
        description: concept.description,
        industry: industry?.id,
        ontologyName: industry?.ontology,
        properties: concept.properties,
        relationships: concept.relationships,
        tags: concept.tags,
      });
      return res.json();
    },
    onSuccess: (data, concept) => {
      const enriched: EnrichedConcept = data.enriched || {};
      setLocalEnriched((prev) => ({ ...prev, [concept.id]: enriched }));
      toast({ title: "Concept enriched", description: `AI generated comprehensive enhancement for ${concept.label}` });
    },
    onError: (err: Error) => {
      toast({ title: "Enhancement failed", description: err.message, variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async ({ concept, enriched }: { concept: ConceptView; enriched: EnrichedConcept }) => {
      const enhancementRes = await apiRequest("POST", "/api/ontology/enhancements", {
        conceptId: concept.id,
        enrichedDescription: enriched.enrichedDescription || null,
        agentUseCases: enriched.agentUseCases || [],
        regulatoryRelevance: enriched.regulatoryRelevance || null,
        riskFactors: enriched.riskFactors || [],
        relatedStandards: enriched.relatedStandards || [],
        dataHandlingConsiderations: enriched.dataHandlingConsiderations || null,
        implementationGuidance: enriched.implementationGuidance || null,
        suggestedProperties: enriched.suggestedProperties || [],
        suggestedRelationships: enriched.suggestedRelationships || [],
        suggestedTags: enriched.suggestedTags || [],
        agentSkills: enriched.agentSkills || [],
        agentTypes: enriched.agentTypes || [],
        applied: true,
      });

      const updatePayload: Record<string, unknown> = {};
      if (enriched.enrichedDescription) {
        updatePayload.description = enriched.enrichedDescription;
      }
      if (enriched.suggestedProperties && enriched.suggestedProperties.length > 0) {
        const existingNames = new Set(concept.properties.map((p) => p.name));
        const newProps = enriched.suggestedProperties.filter((p) => !existingNames.has(p.name));
        if (newProps.length > 0) {
          updatePayload.properties = [...concept.properties, ...newProps];
        }
      }
      if (enriched.suggestedRelationships && enriched.suggestedRelationships.length > 0) {
        const existingKeys = new Set(concept.relationships.map((r) => `${r.type}-${r.targetId}`));
        const newRels = enriched.suggestedRelationships
          .filter((r) => r.exists !== false)
          .map((r) => ({
            type: r.type,
            targetId: r.resolvedTargetId || r.targetId,
            label: r.label,
          }))
          .filter((r) => !existingKeys.has(`${r.type}-${r.targetId}`));
        if (newRels.length > 0) {
          updatePayload.relationships = [...concept.relationships, ...newRels];
        }
      }
      if (enriched.suggestedTags && enriched.suggestedTags.length > 0) {
        const existingTags = new Set(concept.tags.map((t) => t.toLowerCase()));
        const newTags = enriched.suggestedTags.filter((t) => !existingTags.has(t.toLowerCase()));
        if (newTags.length > 0) {
          updatePayload.tags = [...concept.tags, ...newTags];
        }
      }
      if (Object.keys(updatePayload).length > 0) {
        await apiRequest("PUT", `/api/ontology/concepts/${concept.id}`, updatePayload);
      }

      return enhancementRes.json();
    },
    onSuccess: (_data, { concept }) => {
      setLocalEnriched((prev) => {
        const next = { ...prev };
        delete next[concept.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ontology/concepts", industryId] });
      queryClient.invalidateQueries({ queryKey: ["/api/ontology/enhancements"] });
      toast({ title: "Enhancement applied & saved", description: `All enrichment data persisted for ${concept.label}` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to apply enhancement", description: err.message, variant: "destructive" });
    },
  });

  const createConceptMutation = useMutation({
    mutationFn: async (data: {
      label: string;
      category: string;
      description: string;
      synonyms: string[];
      tags: string[];
      relateTo: string;
    }) => {
      const id = `custom-${crypto.randomUUID()}`;
      const relationships: OntologyRelationship[] = [];
      if (data.relateTo) {
        relationships.push({ type: "related", targetId: data.relateTo, label: "Related to" });
      }
      const res = await apiRequest("POST", "/api/ontology/concepts", {
        id,
        industryId,
        ontologyName: industry?.ontology || "Custom",
        label: data.label,
        category: data.category,
        description: data.description,
        synonyms: data.synonyms,
        tags: data.tags,
        source: "custom-extension",
        properties: [],
        relationships,
        linkedRegulations: [],
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ontology/concepts", industryId] });
      toast({ title: "Custom concept created", description: `"${newLabel}" has been added to the ontology.` });
      resetDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create concept", description: err.message, variant: "destructive" });
    },
  });

  const deleteConceptMutation = useMutation({
    mutationFn: async (conceptId: string) => {
      await apiRequest("DELETE", `/api/ontology/concepts/${conceptId}`);
    },
    onSuccess: () => {
      setSelectedConceptId(null);
      setDeleteConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/ontology/concepts", industryId] });
      toast({ title: "Concept deleted", description: "The ontology concept has been removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete concept", description: err.message, variant: "destructive" });
    },
  });

  const suggestRelationshipsMutation = useMutation({
    mutationFn: async (concept: ConceptView) => {
      const res = await fetch(`/api/knowledge-graph/related?term=${encodeURIComponent(concept.label)}&industry=${encodeURIComponent(industryId || "")}`);
      if (!res.ok) throw new Error("Failed to fetch KG suggestions");
      return res.json() as Promise<KgRelatedResponse>;
    },
    onSuccess: (data) => {
      setKgSuggestions(data.suggestions);
      setKgDismissed(new Set());
      setKgAccepted(new Set());
      setKgPendingIdx(new Set());
      setKgPanelOpen(true);
      if (data.suggestions.length === 0) {
        toast({ title: "No suggestions found", description: "The Knowledge Graph did not return any related entities for this term." });
      } else {
        toast({ title: "Suggestions ready", description: `Found ${data.kgResults} from Knowledge Graph and ${data.aiResults} from AI.` });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Suggestion failed", description: err.message, variant: "destructive" });
    },
  });

  async function acceptSingleKgRelationship(concept: ConceptView, suggestion: KgSuggestion, idx: number) {
    const validTypes: OntologyRelationship["type"][] = ["parent", "child", "related", "depends_on"];
    const normalizedType: OntologyRelationship["type"] = validTypes.includes(suggestion.type as any)
      ? (suggestion.type as OntologyRelationship["type"])
      : "related";
    const newRelationship: OntologyRelationship = {
      type: normalizedType,
      targetId: suggestion.targetEntity,
      label: suggestion.context || `${suggestion.type.replace(/_/g, " ")}: ${suggestion.targetEntity}`,
    };
    const freshConcepts = await fetch(`/api/ontology/concepts?industry=${encodeURIComponent(industryId || "")}`).then(r => r.json()) as ConceptView[];
    const freshConcept = freshConcepts.find(c => c.id === concept.id);
    const currentRels = freshConcept?.relationships || concept.relationships;
    const existingKeys = new Set(currentRels.map((r: any) => `${r.type}-${r.targetId}`));
    if (existingKeys.has(`${newRelationship.type}-${newRelationship.targetId}`)) {
      throw new Error("Relationship already exists on this concept");
    }
    const updatedRelationships = [...currentRels, newRelationship];
    await apiRequest("PUT", `/api/ontology/concepts/${concept.id}`, {
      relationships: updatedRelationships,
    });
  }

  async function handleAcceptKgSuggestion(concept: ConceptView, suggestion: KgSuggestion, idx: number) {
    setKgPendingIdx(prev => new Set(Array.from(prev).concat([idx])));
    try {
      await acceptSingleKgRelationship(concept, suggestion, idx);
      setKgAccepted(prev => new Set(Array.from(prev).concat([idx])));
      queryClient.invalidateQueries({ queryKey: ["/api/ontology/concepts", industryId] });
      toast({ title: "Relationship added", description: `Added "${suggestion.targetEntity}" relationship.` });
    } catch (err: any) {
      toast({ title: "Failed to add relationship", description: err.message, variant: "destructive" });
    } finally {
      setKgPendingIdx(prev => { const next = new Set(Array.from(prev)); next.delete(idx); return next; });
    }
  }

  async function handleAcceptAllKgSuggestions(concept: ConceptView) {
    setKgApplyingAll(true);
    let added = 0;
    let skipped = 0;
    for (let idx = 0; idx < kgSuggestions.length; idx++) {
      if (kgDismissed.has(idx) || kgAccepted.has(idx)) continue;
      const suggestion = kgSuggestions[idx];
      setKgPendingIdx(prev => new Set(Array.from(prev).concat([idx])));
      try {
        await acceptSingleKgRelationship(concept, suggestion, idx);
        setKgAccepted(prev => new Set(Array.from(prev).concat([idx])));
        added++;
      } catch {
        skipped++;
      } finally {
        setKgPendingIdx(prev => { const next = new Set(Array.from(prev)); next.delete(idx); return next; });
      }
    }
    queryClient.invalidateQueries({ queryKey: ["/api/ontology/concepts", industryId] });
    toast({ title: "Bulk accept complete", description: `Added ${added} relationship${added !== 1 ? "s" : ""}${skipped > 0 ? `, ${skipped} skipped (duplicates)` : ""}.` });
    setKgApplyingAll(false);
  }

  const resetDialog = () => {
    setAddDialogOpen(false);
    setNewLabel("");
    setNewCategory("");
    setNewCategoryCustom("");
    setNewDescription("");
    setNewSynonyms("");
    setNewTags("");
    setNewRelateTo("");
  };

  const handleCreateConcept = () => {
    const category = newCategory === "__new__" ? newCategoryCustom.trim() : newCategory;
    if (!newLabel.trim() || !category || !newDescription.trim()) return;
    createConceptMutation.mutate({
      label: newLabel.trim(),
      category,
      description: newDescription.trim(),
      synonyms: newSynonyms.split(",").map((s) => s.trim()).filter(Boolean),
      tags: newTags.split(",").map((t) => t.trim()).filter(Boolean),
      relateTo: newRelateTo,
    });
  };

  const getEnrichment = (conceptId: string): EnrichedConcept | null => {
    if (localEnriched[conceptId]) return localEnriched[conceptId];
    const dbEnh = enhancementMap[conceptId];
    if (dbEnh && dbEnh.applied) {
      return {
        enrichedDescription: dbEnh.enrichedDescription || undefined,
        agentUseCases: (dbEnh.agentUseCases as string[]) || [],
        regulatoryRelevance: dbEnh.regulatoryRelevance || undefined,
        riskFactors: (dbEnh.riskFactors as string[]) || [],
        relatedStandards: (dbEnh.relatedStandards as string[]) || [],
        dataHandlingConsiderations: dbEnh.dataHandlingConsiderations || undefined,
        implementationGuidance: dbEnh.implementationGuidance || undefined,
        suggestedProperties: (dbEnh.suggestedProperties as OntologyProperty[]) || [],
        suggestedRelationships: (dbEnh.suggestedRelationships as OntologyRelationship[]) || [],
        suggestedTags: (dbEnh.suggestedTags as string[]) || [],
        agentSkills: (dbEnh.agentSkills as string[]) || [],
        agentTypes: (dbEnh.agentTypes as string[]) || [],
      };
    }
    return null;
  };

  const isApplied = (conceptId: string): boolean => {
    return !!enhancementMap[conceptId]?.applied;
  };

  const hasLocalEnrichment = (conceptId: string): boolean => {
    return !!localEnriched[conceptId];
  };

  const handleConceptClick = (conceptId: string) => {
    setSelectedConceptId(conceptId);
  };

  const handleRelationshipClick = (targetId: string) => {
    setSelectedConceptId(targetId);
  };

  const getConceptLabel = useCallback((id: string): string => {
    const c = concepts.find((concept) => concept.id === id);
    return c ? c.label : id;
  }, [concepts]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!industry) {
        throw new Error("No industry selected");
      }
      const res = await apiRequest("POST", "/api/ai/generate-ontology", {
        industryId: industry.id,
        industryName: industry.label,
        ontologyName: industry.ontology || "Cross-Industry Ontology",
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ontology/concepts", industryId] });
      toast({ title: "Ontology generated", description: `Created ${data.count} concepts for ${industry?.label}` });
    },
    onError: (err: Error) => {
      const msg = err.message.includes("409")
        ? "Ontology concepts already exist for this industry."
        : err.message || "Failed to generate ontology. Please try again.";
      toast({ title: "Generation failed", description: msg, variant: "destructive" });
    },
  });

  const kgGenerateMutation = useMutation({
    mutationFn: async () => {
      if (!industry) throw new Error("No industry selected");
      const subdomain = kgSubdomain.trim();
      if (!subdomain) throw new Error("Sub-domain is required");
      const res = await apiRequest("POST", "/api/ai/generate-subdomain-ontology", {
        industryId: industry.id,
        industryName: industry.label,
        ontologyName: industry.ontology,
        subdomain,
        companyContext: kgCompanyContext.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setKgGeneratedConcepts(data.concepts || []);
      const nonDuplicates = (data.concepts || []).filter((c: any) => !c.isDuplicate).map((c: any) => c.id);
      setKgSelectedIds(new Set(nonDuplicates));
      const cats = new Set<string>();
      (data.concepts || []).forEach((c: any) => cats.add(c.category));
      setKgExpandedCategories(cats);
      setKgBuilderStep("review");
      toast({ title: "Knowledge graph generated", description: `Generated ${data.count} concepts for ${data.subdomain}. ${data.duplicates} duplicates flagged.` });
    },
    onError: (err: Error) => {
      setKgBuilderStep("configure");
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const handleKgImport = async () => {
    const selected = kgGeneratedConcepts.filter(c => kgSelectedIds.has(c.id));
    if (selected.length === 0) return;
    setKgImporting(true);
    try {
      const conceptsToImport = selected.map(c => ({
        id: c.id,
        industryId: c.industryId,
        ontologyName: c.ontologyName,
        label: c.label,
        category: c.category,
        description: c.description,
        properties: c.properties,
        relationships: c.relationships,
        tags: c.tags,
        synonyms: c.synonyms,
        source: "ai-subdomain",
        industryRelevance: c.industryRelevance,
        linkedRegulations: [],
      }));
      const res = await apiRequest("POST", "/api/ontology/concepts/bulk", { concepts: conceptsToImport });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/ontology/concepts", industryId] });
      toast({ title: "Knowledge graph imported", description: `Successfully imported ${data.count} concepts into the ontology.${data.errors?.length > 0 ? ` ${data.errors.length} had issues.` : ""}` });
      setKgBuilderOpen(false);
      setKgBuilderStep("configure");
      setKgGeneratedConcepts([]);
      setKgSelectedIds(new Set());
      setKgSubdomain("");
      setKgCompanyContext("");
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setKgImporting(false);
    }
  };

  const isCustom = (concept: ConceptView) => concept.source === "custom-extension";

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsvText(text);
      const existingKeys = new Set(
        concepts.map((c) => `${c.label.toLowerCase().trim()}|${c.industryId.toLowerCase().trim()}`)
      );
      const rows: CsvImportRow[] = parsed.map((r) => {
        const rowIndustry = (r.industryId || industryId || "").toLowerCase().trim();
        const key = `${r.label.toLowerCase().trim()}|${rowIndustry}`;
        return { ...r, isDuplicate: existingKeys.has(key) };
      });
      setCsvRows(rows);
      const defaultSelected = new Set(
        rows.map((_, i) => i).filter((i) => !rows[i].isDuplicate)
      );
      setCsvSelected(defaultSelected);
    };
    reader.readAsText(file);
  };

  const handleCsvImport = async () => {
    const selectedRows = csvRows.filter((_, i) => csvSelected.has(i));
    const toImport = selectedRows.filter((r) => !r.isDuplicate);
    if (toImport.length === 0) return;
    setCsvImporting(true);
    try {
      const conceptsToCreate = toImport.map((r) => ({
        id: crypto.randomUUID(),
        label: r.label,
        category: r.category,
        description: r.description || r.label,
        industryId: r.industryId || industryId || "custom",
        tags: r.tags ? r.tags.split(";").map((t) => t.trim()).filter(Boolean) : [],
        synonyms: r.synonyms ? r.synonyms.split(";").map((s) => s.trim()).filter(Boolean) : [],
        linkedRegulations: r.linkedRegulations
          ? r.linkedRegulations.split(";").map((s) => ({ name: s.trim() })).filter((l) => l.name)
          : [],
        sensitivityClassification: r.sensitivityLevel
          ? { level: r.sensitivityLevel.toLowerCase(), dataTypes: [], redactionRequired: false, retentionDays: null }
          : null,
        source: "custom-extension",
        ontologyName: "Custom Import",
      }));
      const res = await apiRequest("POST", "/api/ontology/concepts/bulk", { concepts: conceptsToCreate });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/ontology/concepts", industryId] });
      const skippedDups = selectedRows.filter((r) => r.isDuplicate).length;
      toast({
        title: "Import complete",
        description: `${data.count} imported${skippedDups > 0 ? `, ${skippedDups} skipped (already exist)` : ""}${data.errors?.length > 0 ? `, ${data.errors.length} had errors` : ""}.`,
      });
      setCsvImportOpen(false);
      setCsvRows([]);
      setCsvSelected(new Set());
      if (csvFileRef.current) csvFileRef.current.value = "";
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setCsvImporting(false);
    }
  };

  const handleExportCsv = () => {
    const toExport = Object.values(filteredCategories).flat();
    const csv = buildCsvExport(toExport);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${industryId ?? "ontology"}-concepts.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ontology-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const cats = Object.keys(categories);
    cats.forEach((cat, i) => {
      map[cat] = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
    });
    return map;
  }, [categories]);

  // One colour per domain (a handful), not per category (dozens).
  const domainList = useMemo(() => Array.from(new Set(concepts.map((c) => c.domain))), [concepts]);
  const domainColorMap = useMemo(() => domainColors(domainList), [domainList]);
  const conceptIdSet = useMemo(() => new Set(concepts.map((c) => c.id)), [concepts]);
  const mapConcepts: MapConcept[] = useMemo(() => concepts.map((c) => ({
    id: c.id, label: c.label, category: c.category, domain: c.domain,
    used: !unusedConceptIds.has(c.id),
    relationships: c.relationships.map((r) => ({ targetId: r.targetId, label: r.label, type: r.type })),
  })), [concepts, unusedConceptIds]);
  const incomingMap = useMemo(() => buildIncoming(mapConcepts), [mapConcepts]);
  // The map follows the domain and source filters; search highlights rather than hides.
  const visibleMapConcepts = useMemo(() => {
    const ids = new Set(filteredBySource.map((c) => c.id));
    return mapConcepts.filter((c) => ids.has(c.id));
  }, [mapConcepts, filteredBySource]);

  if (!industry) {
    return (
      <div className="flex items-center justify-center h-full p-8" data-testid="ontology-no-industry">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold" data-testid="text-no-industry-title">No Industry Ontology Selected</h2>
            <p className="text-sm text-muted-foreground">
              Select an industry workspace using the workspace selector to explore its domain ontology and knowledge graph.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (conceptsLoading) {
    return (
      <div className="flex items-center justify-center h-full p-8" data-testid="ontology-loading">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading ontology concepts...</p>
        </div>
      </div>
    );
  }

  if (concepts.length === 0 && !generateMutation.isPending) {
    const isCustom = industry.id === "custom";
    return (
      <>
        <div className="flex items-center justify-center h-full p-8" data-testid="ontology-unavailable">
          <Card className="max-w-lg w-full">
            <CardContent className="flex flex-col items-center gap-5 pt-8 pb-8 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-foreground" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold" data-testid="text-generate-ontology-title">
                  {isCustom ? "Build Your Cross-Industry Ontology" : `Generate ${industry.ontology || industry.label} Ontology`}
                </h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {isCustom
                    ? "No ontology concepts yet. Start building your cross-industry ontology by adding concepts manually or generating a domain with AI."
                    : `No ontology concepts exist for ${industry.label} yet. Use AI to generate a comprehensive domain ontology with categories, concepts, properties, and relationships specific to this industry.`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {isCustom && (
                  <Button
                    variant="outline"
                    onClick={() => setAddDialogOpen(true)}
                    data-testid="button-add-first-concept"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Concept
                  </Button>
                )}
                <Button
                  onClick={() => generateMutation.mutate()}
                  data-testid="button-generate-ontology"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate with AI
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="astra-scope font-sans" data-testid="dialog-add-custom-concept">
            <DialogHeader>
              <DialogTitle>Add Custom Concept</DialogTitle>
              <DialogDescription>
                Extend the ontology with your own domain-specific concept.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="concept-label">Label</Label>
                <Input
                  id="concept-label"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. Order to Cash"
                  data-testid="input-concept-label"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="concept-category">Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger data-testid="select-concept-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {allCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    <SelectItem value="__new__">+ New Category</SelectItem>
                  </SelectContent>
                </Select>
                {newCategory === "__new__" && (
                  <Input
                    value={newCategoryCustom}
                    onChange={(e) => setNewCategoryCustom(e.target.value)}
                    placeholder="Enter new category name"
                    className="mt-1.5"
                    data-testid="input-new-category"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="concept-description">Description</Label>
                <Textarea
                  id="concept-description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe this concept..."
                  className="resize-none"
                  data-testid="input-concept-description"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="concept-synonyms">Synonyms (comma-separated)</Label>
                <Input
                  id="concept-synonyms"
                  value={newSynonyms}
                  onChange={(e) => setNewSynonyms(e.target.value)}
                  placeholder="e.g. O2C, order-to-cash process"
                  data-testid="input-concept-synonyms"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="concept-tags">Tags (comma-separated)</Label>
                <Input
                  id="concept-tags"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="e.g. finance, operations, cross-industry"
                  data-testid="input-concept-tags"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={resetDialog} data-testid="button-cancel-add-concept">Cancel</Button>
              <Button
                onClick={handleCreateConcept}
                disabled={createConceptMutation.isPending || !newLabel.trim() || (!newCategory || (newCategory === "__new__" && !newCategoryCustom.trim())) || !newDescription.trim()}
                data-testid="button-save-custom-concept"
              >
                {createConceptMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Add Concept
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (generateMutation.isPending) {
    return (
      <div className="flex items-center justify-center h-full p-8" data-testid="ontology-generating">
        <Card className="max-w-lg w-full">
          <CardContent className="flex flex-col items-center gap-5 pt-8 pb-8 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-foreground" />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Generating Ontology</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                AI is building a comprehensive {industry.ontology || industry.label} ontology with domain-specific categories, concepts, and relationships. This may take a moment...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ontologyName = industry.ontology || "Domain Ontology";
  const totalConcepts = concepts.length;
  const categoryNames = Object.keys(filteredCategories);
  const customCount = concepts.filter((c) => c.source === "custom-extension").length;

  const relationshipCount = mapConcepts.reduce((s, c) => s + c.relationships.filter((r) => conceptIdSet.has(r.targetId)).length, 0);
  const nice = (s: string) => { const w = s.replace(/_/g, " "); return w.charAt(0).toUpperCase() + w.slice(1); };
  const outgoingOf = (c: ConceptView) => c.relationships.filter((r) => conceptIdSet.has(r.targetId));
  const incomingOf = (id: string) => incomingMap.get(id) || [];

  return (
    <div className="astra-scope flex h-full flex-col bg-background text-foreground font-sans" data-testid="ontology-explorer">
      {/* Header: what this ontology is, then every action on it. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-5 pt-4 pb-3 shrink-0">
        <div className="min-w-[260px] flex-1">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Ontology</span>
          <h1 className="mt-0.5 font-[family-name:var(--astra-display)] text-2xl font-semibold tracking-tight" title={ontologyName} data-testid="text-ontology-name">
            {industry.label} business concepts
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
            <span><b className="font-medium text-foreground" data-testid="text-total-concepts">{totalConcepts}</b> concepts</span>
            <span><b className="font-medium text-foreground">{domainList.length}</b> domain{domainList.length !== 1 ? "s" : ""}</span>
            <span><b className="font-medium text-foreground" data-testid="text-total-categories">{allCategories.length}</b> categories</span>
            <span><b className="font-medium text-foreground">{relationshipCount}</b> relationships</span>
            {coverage && <span data-testid="text-coverage-summary"><b className="font-medium text-foreground">{coverage.usedCount}</b> used by agents</span>}
            {customCount > 0 && <span><b className="font-medium text-foreground" data-testid="text-custom-count">{customCount}</b> added by you</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" data-testid="button-import-export">
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Import or export
                <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="astra-scope font-sans">
              <DropdownMenuItem onClick={() => { setCsvImportOpen(true); setCsvRows([]); setCsvSelected(new Set()); }} data-testid="button-import-csv">
                <Upload className="w-3.5 h-3.5 mr-2" /> Import concepts from CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCsv} disabled={concepts.length === 0} data-testid="button-export-csv">
                <Download className="w-3.5 h-3.5 mr-2" /> Export all concepts as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="outline"
            onClick={() => reconcileScanMutation.mutate()}
            disabled={reconcileScanMutation.isPending}
            title="Find relationships that point at concepts that don't exist, and fix them"
            data-testid="button-reconcile-relationships"
          >
            {reconcileScanMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
            Fix broken links
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setKgBuilderOpen(true); setKgBuilderStep("configure"); }}
            data-testid="button-kg-builder"
          >
            <Database className="w-3.5 h-3.5 mr-1.5" />
            Knowledge graph builder
          </Button>
          <Button size="sm" onClick={() => setAddDialogOpen(true)} data-testid="button-add-custom-concept">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add concept
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 border-t">
      <div className="w-[300px] border-r flex flex-col shrink-0" data-testid="ontology-sidebar">
        <div className="p-3 border-b flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search concepts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card"
              data-testid="input-search-concepts"
            />
          </div>
          {/* Domains, each with how much of it agents actually use. */}
          <div>
            <p className="px-0.5 pb-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Domains · used by agents</p>
            <div className="flex flex-col gap-0.5" data-testid="domain-list">
              {[null, ...domainList].map((d) => {
                const inD = d ? concepts.filter((c) => c.domain === d) : concepts;
                const used = inD.filter((c) => !unusedConceptIds.has(c.id)).length;
                const active = domainFilter === d;
                return (
                  <button
                    key={d ?? "__all"}
                    type="button"
                    onClick={() => setDomainFilter(d)}
                    aria-pressed={active}
                    className={`grid grid-cols-[10px_1fr_auto] items-center gap-x-2 gap-y-1 rounded-[7px] border px-2 py-1.5 text-left text-[13px] transition-colors ${active ? "border-border bg-card font-medium" : "border-transparent hover:bg-accent"}`}
                    data-testid={`button-domain-${d ? d.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "all"}`}
                  >
                    <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: d ? domainColorMap[d] : "hsl(var(--foreground))" }} />
                    <span className="truncate" title={d ?? "All domains"}>{d ?? "All domains"}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{coverage ? `${used}/` : ""}{inD.length}</span>
                    {coverage && (
                      <span className="col-start-2 col-end-4 h-[3px] overflow-hidden rounded bg-muted">
                        <span className="block h-full bg-emerald-600 dark:bg-emerald-400" style={{ width: `${inD.length ? (used / inD.length) * 100 : 0}%` }} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5" data-testid="filter-source-toggle">
            {([
              ["all", "All", "filter-all"],
              ["unused", `Not used yet${coverage ? ` (${coverage.unusedCount})` : ""}`, "filter-unused"],
              ["custom", "Added by you", "filter-custom"],
              ["standard", "Industry standard", "filter-standard"],
            ] as Array<[SourceFilter, string, string]>).map(([v, text, id]) => (
              <button
                key={v}
                type="button"
                onClick={() => setSourceFilter(v)}
                aria-pressed={sourceFilter === v}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${sourceFilter === v ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/40"}`}
                data-testid={id}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-2 pb-4 pt-1">
            {categoryNames.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">No concepts match. Try another word or clear the filters.</p>
            )}
            {categoryNames
              .sort((a, b) => filteredCategories[b].length - filteredCategories[a].length)
              .map((category) => {
                const catConcepts = filteredCategories[category];
                const slug = category.toLowerCase().replace(/\s+/g, "-");
                return (
                  <div key={category} data-testid={`accordion-category-${slug}`}>
                    <div className="flex justify-between px-2 pb-1 pt-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      <span className="truncate">{nice(category)}</span>
                      <span data-testid={`badge-count-${slug}`}>{catConcepts.length}</span>
                    </div>
                    {catConcepts.map((concept) => {
                      const used = !unusedConceptIds.has(concept.id);
                      const links = outgoingOf(concept).length + incomingOf(concept.id).length;
                      return (
                        <button
                          key={concept.id}
                          type="button"
                          onClick={() => handleConceptClick(concept.id)}
                          title={concept.description}
                          className={`flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[13.5px] transition-colors ${
                            selectedConceptId === concept.id ? "bg-card font-medium shadow-[0_0_0_1px_hsl(var(--border))]" : "hover:bg-accent"
                          }`}
                          data-testid={`button-concept-${concept.id}`}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={used ? { background: domainColorMap[concept.domain] } : { boxShadow: `inset 0 0 0 1.5px ${domainColorMap[concept.domain]}` }}
                            title={used ? "Used by agents" : "Not used by any agent yet"}
                          />
                          <span className="truncate">{concept.label}</span>
                          {concept.sensitivityClassification && (
                            <Badge variant="outline" className="shrink-0 px-1 text-[9px]" data-testid={`badge-sensitivity-${concept.id}`}>
                              {concept.sensitivityClassification.level.toUpperCase()}
                            </Badge>
                          )}
                          {isApplied(concept.id) && <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" />}
                          <span className="ml-auto font-mono text-[11px] text-muted-foreground">{links || ""}</span>
                          {isCustom(concept) && <span className="sr-only" data-testid={`badge-custom-${concept.id}`}>Custom</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 min-w-0 flex flex-col" data-testid="ontology-detail">
        <div className="flex items-center gap-3 border-b px-4 py-2.5">
          <div className="inline-flex overflow-hidden rounded-[7px] border bg-card">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              className={`px-3 py-1 text-[12.5px] ${viewMode === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="button-view-list"
            >
              Concept
            </button>
            <button
              type="button"
              onClick={() => setViewMode("graph")}
              aria-pressed={viewMode === "graph"}
              className={`px-3 py-1 text-[12.5px] ${viewMode === "graph" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="button-view-graph"
            >
              Map
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            {viewMode === "list"
              ? "Pick a concept on the left, or follow a relationship"
              : selectedConcept
              ? "Focused on one concept: click another to move the focus · scroll to zoom, drag to pan"
              : "Click a concept to focus on it · scroll to zoom, drag to pan"}
          </span>
          {viewMode === "graph" && selectedConcept && (
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setViewMode("list")} data-testid="button-open-concept">Open {selectedConcept.label}</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedConceptId(null)} data-testid="button-clear-focus">Show everything</Button>
            </div>
          )}
        </div>
        {viewMode === "graph" ? (
          <div className="flex-1 min-h-0">
            <OntologyDomainMap
              concepts={visibleMapConcepts}
              colors={domainColorMap}
              focusId={selectedConceptId && visibleMapConcepts.some((c) => c.id === selectedConceptId) ? selectedConceptId : null}
              onSelect={handleConceptClick}
              searchQuery={searchQuery}
            />
          </div>
        ) : (
        <ScrollArea className="flex-1">
          {!selectedConcept ? (
            <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
              <div>
                <h2 className="font-[family-name:var(--astra-display)] text-xl font-semibold">How agents use this ontology</h2>
                <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
                  Concepts give agents a shared vocabulary for your business. A concept an agent references shapes how it reasons; one no agent uses is only vocabulary so far. Pick a concept on the left, or open the map.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="domain-coverage">
                {domainList.map((d) => {
                  const inD = concepts.filter((c) => c.domain === d);
                  const used = inD.filter((c) => !unusedConceptIds.has(c.id)).length;
                  const linked = inD.filter((c) => outgoingOf(c).length + incomingOf(c.id).length > 0).length;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDomainFilter(d)}
                      className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/40"
                      data-testid={`card-domain-${d.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium"><i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: domainColorMap[d] }} />{d}</span>
                      <span className="font-[family-name:var(--astra-display)] text-2xl font-semibold">{coverage ? `${used} of ${inD.length}` : inD.length}<span className="ml-1.5 font-sans text-xs font-normal text-muted-foreground">{coverage ? "used by agents" : "concepts"}</span></span>
                      {coverage && (
                        <span className="h-1 overflow-hidden rounded bg-muted"><span className="block h-full bg-emerald-600 dark:bg-emerald-400" style={{ width: `${inD.length ? (used / inD.length) * 100 : 0}%` }} /></span>
                      )}
                      <span className="font-mono text-[11px] text-muted-foreground">{linked} of {inD.length} linked to other concepts</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
              <div className="space-y-2">
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: domainColorMap[selectedConcept.domain] }}>
                  {selectedConcept.domain} · <span data-testid="badge-concept-category">{nice(selectedConcept.category)}</span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-[family-name:var(--astra-display)] text-[22px] font-semibold leading-tight" data-testid="text-concept-label">{selectedConcept.label}</h2>
                  {selectedConcept.sensitivityClassification && (
                    <Badge variant="outline" data-testid="badge-sensitivity-level">
                      <Shield className="w-3 h-3 mr-1" />
                      {selectedConcept.sensitivityClassification.level.toUpperCase()}
                    </Badge>
                  )}
                  {isApplied(selectedConcept.id) && (
                    <Badge variant="secondary" className="text-[10px]" data-testid="badge-ai-enhanced">
                      <Sparkles className="w-2.5 h-2.5 mr-1" /> AI enhanced
                    </Badge>
                  )}
                </div>
                <p className="max-w-[68ch] text-sm" data-testid="text-concept-description">{selectedConcept.description}</p>
                {selectedConcept.synonyms.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" data-testid="concept-synonyms">
                    {selectedConcept.synonyms.map((syn) => (
                      <span key={syn} className="rounded-full bg-muted px-2.5 py-0.5 text-xs" data-testid={`badge-synonym-${syn}`}>also: {syn}</span>
                    ))}
                  </div>
                )}
              </div>

              <section>
                <h3 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">How it connects</h3>
                <OntologyNeighbourhood
                  concept={mapConcepts.find((c) => c.id === selectedConcept.id)!}
                  concepts={mapConcepts}
                  colors={domainColorMap}
                  onSelect={handleRelationshipClick}
                />
              </section>
              <section data-testid="card-relationships">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Relationships · {outgoingOf(selectedConcept).length + incomingOf(selectedConcept.id).length}
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => suggestRelationshipsMutation.mutate(selectedConcept)}
                    disabled={suggestRelationshipsMutation.isPending}
                    data-testid="button-suggest-relationships"
                  >
                    {suggestRelationshipsMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Database className="w-3.5 h-3.5 mr-1.5" />}
                    Suggest relationships
                  </Button>
                </div>
                {selectedConcept.relationships.length === 0 && incomingOf(selectedConcept.id).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Not linked to any other concept yet. Linking it helps agents reason about it in context.</p>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {selectedConcept.relationships.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium">Points to</p>
                        {selectedConcept.relationships.map((rel, idx) => {
                          const target = concepts.find((c) => c.id === rel.targetId);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => target && handleRelationshipClick(rel.targetId)}
                              disabled={!target}
                              className="grid w-full grid-cols-[minmax(0,140px)_1fr] items-center gap-3 border-b py-1.5 text-left text-[13px] last:border-0 enabled:hover:bg-accent/50"
                              data-testid={`button-relationship-${rel.targetId}`}
                            >
                              <span className="truncate font-mono text-xs text-muted-foreground" title={rel.label}>{rel.label || rel.type.replace(/_/g, " ")}</span>
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: target ? domainColorMap[target.domain] : "hsl(var(--muted-foreground))" }} />
                                <span className="truncate">{target ? target.label : rel.targetId}</span>
                                {!target && <span className="text-[11px] text-amber-600 dark:text-amber-400">missing</span>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {incomingOf(selectedConcept.id).length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium">Pointed to by</p>
                        {incomingOf(selectedConcept.id).map((r, idx) => {
                          const from = concepts.find((c) => c.id === r.from)!;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleRelationshipClick(r.from)}
                              className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,140px)] items-center gap-3 border-b py-1.5 text-left text-[13px] last:border-0 hover:bg-accent/50"
                              data-testid={`button-incoming-${r.from}`}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: domainColorMap[from.domain] }} />
                                <span className="truncate">{from.label}</span>
                              </span>
                              <span className="truncate font-mono text-xs text-muted-foreground" title={r.label}>{r.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>

              <Card data-testid="card-properties">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <GitBranch className="w-4 h-4" />
                    Properties
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedConcept.properties.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No properties defined.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedConcept.properties.map((prop) => (
                        <div
                          key={prop.name}
                          className="flex items-start gap-3 text-xs py-1.5 border-b last:border-0"
                          data-testid={`property-${prop.name}`}
                        >
                          <code className="font-mono text-foreground shrink-0 min-w-[120px]">{prop.name}</code>
                          <Badge variant="outline" className="text-[10px] shrink-0">{prop.type}</Badge>
                          <span className="text-muted-foreground">{prop.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-tags">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Tags
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {selectedConcept.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs" data-testid={`badge-tag-${tag}`}>
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {(() => {
                const appliedEnh = isApplied(selectedConcept.id) ? getEnrichment(selectedConcept.id) : null;
                const hasAiSkills = appliedEnh?.agentSkills && appliedEnh.agentSkills.length > 0;
                const hasAiTypes = appliedEnh?.agentTypes && appliedEnh.agentTypes.length > 0;
                const hasAiAgent = hasAiSkills || hasAiTypes;
                const fallback = AGENT_MAPPING[selectedConcept.category];
                const skills = hasAiSkills ? appliedEnh!.agentSkills! : fallback?.skills || [];
                const agentTypes = hasAiTypes ? appliedEnh!.agentTypes! : fallback?.agentTypes || [];
                const hasData = skills.length > 0 || agentTypes.length > 0;

                return (
                  <Card data-testid="card-agent-mapping">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Brain className="w-4 h-4" />
                        Agent Mapping
                        {hasAiAgent && (
                          <Badge variant="secondary" className="text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-1" />AI</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {hasData ? (
                        <>
                          {skills.length > 0 && (
                            <div>
                              <div className="text-xs font-medium mb-1.5">Relevant Agent Skills</div>
                              <div className="flex flex-wrap gap-1.5">
                                {skills.map((skill) => (
                                  <Badge key={skill} variant="secondary" className="text-[10px]" data-testid={`badge-skill-${skill.toLowerCase().replace(/\s+/g, "-")}`}>
                                    {skill}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {agentTypes.length > 0 && (
                            <div>
                              <div className="text-xs font-medium mb-1.5">Applicable Agent Types</div>
                              <div className="flex flex-wrap gap-1.5">
                                {agentTypes.map((agentType) => (
                                  <Badge key={agentType} variant="outline" className="text-[10px]" data-testid={`badge-agent-${agentType.toLowerCase().replace(/\s+/g, "-")}`}>
                                    {agentType}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">No agent mapping available for this category.</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}

              {(() => {
                const appliedEnrichment = isApplied(selectedConcept.id) ? getEnrichment(selectedConcept.id) : null;
                if (!appliedEnrichment) return null;
                return (
                  <>
                    {appliedEnrichment.agentUseCases && appliedEnrichment.agentUseCases.length > 0 && (
                      <Card data-testid="card-applied-agent-use-cases">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Lightbulb className="w-4 h-4" />
                            Agent Use Cases
                            <Badge variant="secondary" className="text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-1" />AI</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {appliedEnrichment.agentUseCases.map((uc, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-2" data-testid={`text-applied-use-case-${i}`}>
                                <Lightbulb className="w-3 h-3 mt-0.5 shrink-0 text-yellow-500" />
                                <span>{uc}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {appliedEnrichment.regulatoryRelevance && (
                      <Card data-testid="card-applied-regulatory-relevance">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Regulatory Relevance
                            <Badge variant="secondary" className="text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-1" />AI</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground" data-testid="text-applied-regulatory-relevance">
                            {appliedEnrichment.regulatoryRelevance}
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    {appliedEnrichment.riskFactors && appliedEnrichment.riskFactors.length > 0 && (
                      <Card data-testid="card-applied-risk-factors">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            Risk Factors
                            <Badge variant="secondary" className="text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-1" />AI</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-1.5">
                            {appliedEnrichment.riskFactors.map((rf, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-2" data-testid={`text-applied-risk-factor-${i}`}>
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-destructive" />
                                <span>{rf}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {appliedEnrichment.relatedStandards && appliedEnrichment.relatedStandards.length > 0 && (
                      <Card data-testid="card-applied-related-standards">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            Related Standards
                            <Badge variant="secondary" className="text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-1" />AI</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-1.5">
                            {appliedEnrichment.relatedStandards.map((std, i) => (
                              <Badge key={i} variant="outline" className="text-xs" data-testid={`badge-applied-standard-${i}`}>
                                {std}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {appliedEnrichment.dataHandlingConsiderations && (
                      <Card data-testid="card-applied-data-handling">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Data Handling Considerations
                            <Badge variant="secondary" className="text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-1" />AI</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground" data-testid="text-applied-data-handling">
                            {appliedEnrichment.dataHandlingConsiderations}
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    {appliedEnrichment.implementationGuidance && (
                      <Card data-testid="card-applied-implementation-guidance">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <GitBranch className="w-4 h-4" />
                            Implementation Guidance
                            <Badge variant="secondary" className="text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-1" />AI</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground" data-testid="text-applied-implementation-guidance">
                            {appliedEnrichment.implementationGuidance}
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </>
                );
              })()}

              {(() => {
                const enrichment = getEnrichment(selectedConcept.id);
                const applied = isApplied(selectedConcept.id);
                const hasLocal = hasLocalEnrichment(selectedConcept.id);
                const showEnrichment = enrichment && hasLocal;

                return (
                  <PermissionGate action="create_modify_policies">
                    <Card data-testid="card-ai-enhance">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          AI Enhancement
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            onClick={() => enhanceMutation.mutate(selectedConcept)}
                            disabled={enhanceMutation.isPending}
                            data-testid="button-ai-enhance"
                          >
                            {enhanceMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Wand2 className="w-4 h-4 mr-2" />
                            )}
                            AI Enhance Concept
                          </Button>
                          {applied && (
                            <Badge variant="secondary" className="text-[10px]" data-testid="badge-enhancement-applied">
                              <Check className="w-3 h-3 mr-1" />
                              Saved
                            </Badge>
                          )}
                        </div>

                        {showEnrichment && enrichment && (
                          <div className="space-y-3" data-testid="enrichment-results">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="text-xs font-medium flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-foreground" />
                                AI Enrichment Results
                              </div>
                              <div className="flex items-center gap-1.5">
                                {hasLocal && !applied && (
                                  <Button
                                    size="sm"
                                    onClick={() => applyMutation.mutate({ concept: selectedConcept, enriched: enrichment })}
                                    disabled={applyMutation.isPending}
                                    data-testid="button-apply-enhancement"
                                  >
                                    {applyMutation.isPending ? (
                                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5 mr-1.5" />
                                    )}
                                    Apply & Save
                                  </Button>
                                )}
                                {hasLocal && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setLocalEnriched((prev) => {
                                        const next = { ...prev };
                                        delete next[selectedConcept.id];
                                        return next;
                                      });
                                    }}
                                    data-testid="button-dismiss-enhancement"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>

                            {enrichment.enrichedDescription && (
                              <div className="p-3 rounded-md bg-muted/50" data-testid="enriched-description">
                                <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                  <BookOpen className="w-3 h-3" />
                                  Enhanced Description
                                </div>
                                <p className="text-sm text-muted-foreground" data-testid="text-enriched-description">
                                  {enrichment.enrichedDescription}
                                </p>
                              </div>
                            )}

                            {enrichment.agentUseCases && enrichment.agentUseCases.length > 0 && (
                              <div className="p-3 rounded-md bg-muted/50" data-testid="enriched-use-cases">
                                <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                  <Brain className="w-3 h-3" />
                                  Agent Use Cases
                                </div>
                                <ul className="space-y-1.5">
                                  {enrichment.agentUseCases.map((uc, i) => (
                                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2" data-testid={`text-use-case-${i}`}>
                                      <Lightbulb className="w-3 h-3 mt-0.5 shrink-0 text-yellow-500" />
                                      <span>{uc}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {enrichment.regulatoryRelevance && (
                              <div className="p-3 rounded-md bg-muted/50" data-testid="enriched-regulatory">
                                <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                  <Shield className="w-3 h-3" />
                                  Regulatory Relevance
                                </div>
                                <p className="text-xs text-muted-foreground" data-testid="text-regulatory-relevance">
                                  {enrichment.regulatoryRelevance}
                                </p>
                              </div>
                            )}

                            {enrichment.riskFactors && enrichment.riskFactors.length > 0 && (
                              <div className="p-3 rounded-md bg-muted/50" data-testid="enriched-risk-factors">
                                <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                  <AlertTriangle className="w-3 h-3" />
                                  Risk Factors
                                </div>
                                <ul className="space-y-1">
                                  {enrichment.riskFactors.map((rf, i) => (
                                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2" data-testid={`text-risk-factor-${i}`}>
                                      <span className="text-destructive mt-0.5 shrink-0">-</span>
                                      <span>{rf}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {enrichment.relatedStandards && enrichment.relatedStandards.length > 0 && (
                              <div className="p-3 rounded-md bg-muted/50" data-testid="enriched-standards">
                                <div className="text-xs font-semibold mb-1.5">Related Standards</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {enrichment.relatedStandards.map((std, i) => (
                                    <Badge key={i} variant="outline" className="text-[10px]" data-testid={`badge-standard-${i}`}>
                                      {std}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {enrichment.dataHandlingConsiderations && (
                              <div className="p-3 rounded-md bg-muted/50" data-testid="enriched-data-handling">
                                <div className="text-xs font-semibold mb-1.5">Data Handling Considerations</div>
                                <p className="text-xs text-muted-foreground" data-testid="text-data-handling">
                                  {enrichment.dataHandlingConsiderations}
                                </p>
                              </div>
                            )}

                            {enrichment.implementationGuidance && (
                              <div className="p-3 rounded-md bg-muted/50" data-testid="enriched-implementation">
                                <div className="text-xs font-semibold mb-1.5">Implementation Guidance</div>
                                <p className="text-xs text-muted-foreground" data-testid="text-implementation-guidance">
                                  {enrichment.implementationGuidance}
                                </p>
                              </div>
                            )}

                            {enrichment.agentSkills && enrichment.agentSkills.length > 0 && (
                              <div className="p-3 rounded-md bg-muted/50" data-testid="enriched-agent-skills">
                                <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                  <Brain className="w-3 h-3" />
                                  Agent Skills (concept-specific)
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {enrichment.agentSkills.map((skill, i) => (
                                    <Badge key={i} variant="secondary" className="text-[10px]" data-testid={`badge-preview-skill-${i}`}>
                                      {skill}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {enrichment.agentTypes && enrichment.agentTypes.length > 0 && (
                              <div className="p-3 rounded-md bg-muted/50" data-testid="enriched-agent-types">
                                <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                  <Brain className="w-3 h-3" />
                                  Agent Types (concept-specific)
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {enrichment.agentTypes.map((at, i) => (
                                    <Badge key={i} variant="outline" className="text-[10px]" data-testid={`badge-preview-agent-type-${i}`}>
                                      {at}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {enrichment.suggestedProperties && enrichment.suggestedProperties.length > 0 && (
                              <div className="p-3 rounded-md bg-muted/50" data-testid="enriched-properties">
                                <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                  <GitBranch className="w-3 h-3" />
                                  Suggested Properties
                                </div>
                                <div className="space-y-2">
                                  {enrichment.suggestedProperties.map((prop, i) => (
                                    <div key={i} className="flex items-start gap-3 text-xs py-1.5 border-b last:border-0" data-testid={`preview-property-${i}`}>
                                      <code className="font-mono text-foreground shrink-0 min-w-[120px]">{prop.name}</code>
                                      <Badge variant="outline" className="text-[10px] shrink-0">{prop.type}</Badge>
                                      <span className="text-muted-foreground">{prop.description}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {enrichment.suggestedRelationships && enrichment.suggestedRelationships.length > 0 && (
                              <div className="p-3 rounded-md bg-muted/50" data-testid="enriched-relationships">
                                <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                  <Link2 className="w-3 h-3" />
                                  Suggested Relationships
                                  {enrichment.suggestedRelationships.some(r => r.exists === false) && (
                                    <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-600 dark:text-amber-400 ml-1">
                                      {enrichment.suggestedRelationships.filter(r => r.exists === false).length} unmatched
                                    </Badge>
                                  )}
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {enrichment.suggestedRelationships.map((rel, i) => (
                                    <div key={i} className={`p-3 rounded-md border ${rel.exists === false ? "border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/20" : ""}`} data-testid={`preview-relationship-${i}`}>
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <Badge className={`text-[10px] ${relationshipTypeColors[rel.type] || ""}`}>
                                          {rel.type.replace("_", " ")}
                                        </Badge>
                                        {rel.exists === false ? (
                                          <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-600 dark:text-amber-400">
                                            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                                            Not in ontology
                                          </Badge>
                                        ) : rel.exists === true ? (
                                          <Badge variant="outline" className="text-[9px] border-green-500/50 text-green-600 dark:text-green-400">
                                            <Check className="w-2.5 h-2.5 mr-0.5" />
                                            Matched
                                          </Badge>
                                        ) : null}
                                      </div>
                                      <div className="text-xs font-medium">{rel.targetId}</div>
                                      <div className="text-[11px] text-muted-foreground mt-0.5">{rel.label}</div>
                                      {rel.exists === false && (
                                        <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 italic">
                                          Will be skipped when applied — target concept doesn't exist
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {enrichment.suggestedTags && enrichment.suggestedTags.length > 0 && (
                              <div className="p-3 rounded-md bg-muted/50" data-testid="enriched-tags">
                                <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                  <Tag className="w-3 h-3" />
                                  Suggested Tags
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {enrichment.suggestedTags.map((tag, i) => (
                                    <Badge key={i} variant="outline" className="text-xs" data-testid={`badge-preview-tag-${i}`}>
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </PermissionGate>
                );
              })()}
            </div>
            <aside className="flex min-w-0 flex-col gap-4">
              <div className="rounded-xl border bg-card p-4" data-testid="card-agent-usage">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Used by agents</p>
                {unusedConceptIds.has(selectedConcept.id) ? (
                  <>
                    <p className="mt-1 font-[family-name:var(--astra-display)] text-lg font-semibold">Not used yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">No agent references this concept. It still grounds search and Ask Astra, but agents won't reason with it until one uses it.</p>
                  </>
                ) : (
                  <>
                    <p className="mt-1.5"><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/40 px-2.5 py-0.5 text-xs text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-400">● In use</span></p>
                    <p className="mt-1.5 text-xs text-muted-foreground">Referenced by at least one agent. Changing it flags those agents for re-validation.</p>
                  </>
                )}
                {selectedConcept.usageCount > 0 && (
                  <p className="mt-1.5 font-mono text-[11px] text-muted-foreground" data-testid="text-usage-count">Referenced {selectedConcept.usageCount} times in production</p>
                )}
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5 rounded-xl border bg-card p-4 text-[13px]">
                <span className="text-muted-foreground">Source</span>
                <span data-testid={isCustom(selectedConcept) ? "badge-custom-extension" : undefined}>{isCustom(selectedConcept) ? "Added by your team" : "Industry standard"}</span>
                <span className="text-muted-foreground">Version</span>
                <span data-testid="badge-concept-version">v{selectedConcept.version}</span>
                <span className="text-muted-foreground">Domain</span>
                <span>{selectedConcept.domain}</span>
                <span className="text-muted-foreground">Category</span>
                <span>{nice(selectedConcept.category)}</span>
              </div>
              {versionData && versionData.history.length > 0 && (
                <Card data-testid="card-version-history">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <History className="w-4 h-4" />
                        Version History
                        <Badge variant="secondary" className="text-[10px]">
                          {versionData.history.length} revision{versionData.history.length !== 1 ? "s" : ""}
                        </Badge>
                      </CardTitle>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setVersionHistoryOpen(!versionHistoryOpen)}
                        data-testid="button-toggle-version-history"
                      >
                        {versionHistoryOpen ? "Hide" : "Show"} History
                      </Button>
                    </div>
                  </CardHeader>
                  {versionHistoryOpen && (
                    <CardContent>
                      <div className="space-y-3">
                        {[...versionData.history].reverse().map((entry, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-md border text-xs space-y-1.5"
                            data-testid={`version-entry-${entry.version}`}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px]" data-testid={`badge-version-${entry.version}`}>
                                v{entry.version}
                              </Badge>
                              <span className="text-muted-foreground text-[10px]">
                                {new Date(entry.updatedAt).toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium">Label:</span>{" "}
                              <span className="text-muted-foreground">{entry.label}</span>
                            </div>
                            <div>
                              <span className="font-medium">Description:</span>{" "}
                              <span className="text-muted-foreground line-clamp-2">{entry.description}</span>
                            </div>
                            {Array.isArray(entry.synonyms) && entry.synonyms.length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium">Synonyms:</span>
                                {entry.synonyms.map((s: string) => (
                                  <Badge key={s} variant="outline" className="text-[9px]">{s}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              )}

              {linkedAgents !== undefined && (
                <Card data-testid="card-linked-agents">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      Linked Agents
                      <Badge variant="secondary" className="text-[10px]">
                        {linkedAgents.length}
                      </Badge>
                      {linkedAgents.some(a => a.requiresRevalidation) && (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-600 border-amber-500/20">
                          {linkedAgents.filter(a => a.requiresRevalidation).length} need re-validation
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {linkedAgents.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1">No agents tagged with this concept yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {linkedAgents.map(a => (
                          <Link key={a.id} href={`/agents/${a.id}`}>
                            <div className="flex items-center justify-between gap-2 p-2 rounded-md border hover:bg-muted/50 cursor-pointer" data-testid={`linked-agent-${a.id}`}>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium">{a.name}</span>
                                <Badge variant="outline" className="text-[9px]">{a.status}</Badge>
                              </div>
                              {a.requiresRevalidation && (
                                <Badge variant="outline" className="text-[9px] bg-amber-500/15 text-amber-600 border-amber-500/20">
                                  Re-validation needed
                                </Badge>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {selectedConcept.linkedRegulations.length > 0 && (
                <Card data-testid="card-linked-regulations">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Linked Regulations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedConcept.linkedRegulations.map((reg, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs" data-testid={`regulation-${i}`}>
                          <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          {reg.url ? (
                            <a href={reg.url} target="_blank" rel="noopener noreferrer" className="text-foreground underline" data-testid={`link-regulation-${i}`}>
                              {reg.name}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">{reg.name}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedConcept.sensitivityClassification && (
                <Card data-testid="card-sensitivity-classification">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Data Sensitivity Classification
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="text-xs">
                        <span className="text-muted-foreground">Level: </span>
                        <Badge
                          variant="outline"
                          className={
                            selectedConcept.sensitivityClassification.level === "phi" || selectedConcept.sensitivityClassification.level === "pci"
                              ? "border-red-500/50 text-red-600 dark:text-red-400"
                              : selectedConcept.sensitivityClassification.level === "restricted" || selectedConcept.sensitivityClassification.level === "confidential"
                              ? "border-orange-500/50 text-orange-600 dark:text-orange-400"
                              : selectedConcept.sensitivityClassification.level === "internal"
                              ? "border-yellow-500/50 text-yellow-600 dark:text-yellow-400"
                              : ""
                          }
                          data-testid="badge-sensitivity-detail-level"
                        >
                          {selectedConcept.sensitivityClassification.level.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Redaction: </span>
                        <Badge
                          variant={selectedConcept.sensitivityClassification.redactionRequired ? "destructive" : "secondary"}
                          data-testid="badge-sensitivity-redaction"
                        >
                          {selectedConcept.sensitivityClassification.redactionRequired ? "Required" : "Not Required"}
                        </Badge>
                      </div>
                      {selectedConcept.sensitivityClassification.retentionDays != null && (
                        <div className="text-xs" data-testid="text-sensitivity-retention">
                          <span className="text-muted-foreground">Retention: </span>
                          <span className="font-medium">{selectedConcept.sensitivityClassification.retentionDays} days</span>
                        </div>
                      )}
                    </div>
                    {selectedConcept.sensitivityClassification.dataTypes.length > 0 && (
                      <div>
                        <div className="text-xs font-medium mb-1.5">Protected Data Types</div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedConcept.sensitivityClassification.dataTypes.map((dt) => (
                            <Badge key={dt} variant="outline" className="text-[10px]" data-testid={`badge-data-type-${dt.toLowerCase().replace(/\s+/g, "-")}`}>
                              {dt}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={deleteConceptMutation.isPending}
                  data-testid="button-delete-concept"
                >
                  {deleteConceptMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                  Delete concept
                </Button>
              </div>
            </aside>
            </div>
          )}
        </ScrollArea>
        )}
      </div>

      {kgPanelOpen && selectedConcept && (
        <div className="w-80 border-l flex flex-col shrink-0" data-testid="panel-kg-suggestions">
          <div className="flex items-center justify-between gap-2 p-3 border-b">
            <div className="flex items-center gap-2 min-w-0">
              <Database className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium truncate">KG Suggestions</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setKgPanelOpen(false)}
              data-testid="button-close-kg-panel"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="px-3 py-2 border-b flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Showing relationship suggestions for <span className="font-medium text-foreground">{selectedConcept.label}</span> from Knowledge Graph and AI analysis.
            </p>
            {kgSuggestions.length > 0 && kgSuggestions.some((_, idx) => !kgDismissed.has(idx) && !kgAccepted.has(idx)) && (
              <Button
                size="sm"
                variant="default"
                onClick={() => handleAcceptAllKgSuggestions(selectedConcept)}
                disabled={kgApplyingAll || kgPendingIdx.size > 0}
                data-testid="button-accept-all-suggestions"
              >
                {kgApplyingAll ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Check className="w-3 h-3 mr-1" />
                )}
                Accept All
              </Button>
            )}
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {kgSuggestions.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <Network className="w-8 h-8 text-muted-foreground mx-auto" />
                  <p className="text-xs text-muted-foreground">No suggestions available.</p>
                </div>
              ) : (
                kgSuggestions.map((suggestion, idx) => {
                  if (kgDismissed.has(idx)) return null;
                  const isAccepted = kgAccepted.has(idx);
                  const isPending = kgPendingIdx.has(idx);
                  const existingKeys = new Set(selectedConcept.relationships.map(r => `${r.type}-${r.targetId}`));
                  const alreadyAdded = isAccepted || existingKeys.has(`${suggestion.type}-${suggestion.targetEntity}`);
                  return (
                    <Card key={idx} className={alreadyAdded ? "opacity-60" : ""} data-testid={`card-kg-suggestion-${idx}`}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                                data-testid={`badge-kg-type-${idx}`}
                              >
                                {suggestion.type.replace(/_/g, " ")}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`text-[9px] ${
                                  suggestion.source === "ai_suggestion"
                                    ? "border-purple-500/50 text-purple-600 dark:text-purple-400"
                                    : suggestion.source === "relationship_extraction"
                                    ? "border-blue-500/50 text-blue-600 dark:text-blue-400"
                                    : suggestion.source === "entity_resolution"
                                    ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
                                    : "border-amber-500/50 text-amber-600 dark:text-amber-400"
                                }`}
                                data-testid={`badge-kg-source-${idx}`}
                              >
                                {suggestion.source === "ai_suggestion" ? "AI" : suggestion.source === "relationship_extraction" ? "KG" : suggestion.source === "entity_resolution" ? "Entity" : "Temporal"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-xs font-medium" data-testid={`text-kg-target-${idx}`}>{suggestion.targetEntity}</span>
                            </div>
                          </div>
                          <div className="text-[10px] text-muted-foreground shrink-0">
                            {Math.round(suggestion.confidence * 100)}%
                          </div>
                        </div>
                        {suggestion.context && (
                          <p className="text-[11px] text-muted-foreground" data-testid={`text-kg-context-${idx}`}>{suggestion.context}</p>
                        )}
                        {alreadyAdded ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-green-600 dark:text-green-400">
                            <CheckCircle className="w-3 h-3" />
                            {isAccepted ? "Accepted" : "Already added"}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleAcceptKgSuggestion(selectedConcept, suggestion, idx)}
                              disabled={isPending || kgApplyingAll}
                              data-testid={`button-accept-suggestion-${idx}`}
                            >
                              {isPending ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Check className="w-3 h-3 mr-1" />
                              )}
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setKgDismissed(prev => { const next = new Set(Array.from(prev)); next.add(idx); return next; })}
                              disabled={isPending || kgApplyingAll}
                              data-testid={`button-reject-suggestion-${idx}`}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Dismiss
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="astra-scope font-sans" data-testid="dialog-add-custom-concept">
          <DialogHeader>
            <DialogTitle>Add Custom Concept</DialogTitle>
            <DialogDescription>
              Extend the ontology with your own domain-specific concept.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="concept-label">Label</Label>
              <Input
                id="concept-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Custom Risk Score"
                data-testid="input-concept-label"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="concept-category">Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger data-testid="select-concept-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {allCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                  <SelectItem value="__new__">+ New Category</SelectItem>
                </SelectContent>
              </Select>
              {newCategory === "__new__" && (
                <Input
                  value={newCategoryCustom}
                  onChange={(e) => setNewCategoryCustom(e.target.value)}
                  placeholder="Enter new category name"
                  className="mt-1.5"
                  data-testid="input-new-category"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="concept-description">Description</Label>
              <Textarea
                id="concept-description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Describe this concept..."
                className="resize-none"
                data-testid="input-concept-description"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="concept-synonyms">Synonyms (comma-separated)</Label>
              <Input
                id="concept-synonyms"
                value={newSynonyms}
                onChange={(e) => setNewSynonyms(e.target.value)}
                placeholder="e.g. risk index, risk metric"
                data-testid="input-concept-synonyms"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="concept-tags">Tags (comma-separated)</Label>
              <Input
                id="concept-tags"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="e.g. risk, scoring, custom"
                data-testid="input-concept-tags"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="concept-relate-to">Relate to (optional)</Label>
              <Select value={newRelateTo} onValueChange={setNewRelateTo}>
                <SelectTrigger data-testid="select-concept-relate-to">
                  <SelectValue placeholder="Link to existing concept" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {concepts.filter((c) => c.source !== "custom-extension").map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={resetDialog} data-testid="button-cancel-add-concept">Cancel</Button>
            <Button
              onClick={handleCreateConcept}
              disabled={createConceptMutation.isPending || !newLabel.trim() || (!newCategory || (newCategory === "__new__" && !newCategoryCustom.trim())) || !newDescription.trim()}
              data-testid="button-save-custom-concept"
            >
              {createConceptMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Concept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={kgBuilderOpen} onOpenChange={setKgBuilderOpen}>
        <DialogContent className="astra-scope font-sans max-w-3xl" data-testid="dialog-kg-builder">
          {kgBuilderStep === "configure" && (
            <>
              <DialogHeader>
                <DialogTitle>Knowledge Graph Builder</DialogTitle>
                <DialogDescription>
                  Generate a domain-specific knowledge graph for a sub-domain within {industry.label}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Sub-domain</Label>
                  <Select
                    value={kgCustomSubdomain ? "__custom__" : kgSubdomain}
                    onValueChange={(v) => {
                      if (v === "__custom__") {
                        setKgCustomSubdomain(true);
                        setKgSubdomain("");
                      } else {
                        setKgCustomSubdomain(false);
                        setKgSubdomain(v);
                      }
                    }}
                    data-testid="select-kg-subdomain"
                  >
                    <SelectTrigger data-testid="select-kg-subdomain">
                      <SelectValue placeholder="Select a sub-domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {(industry?.subVerticals || []).map((sv) => (
                        <SelectItem key={sv} value={sv}>{sv}</SelectItem>
                      ))}
                      <SelectItem value="__custom__">Custom...</SelectItem>
                    </SelectContent>
                  </Select>
                  {kgCustomSubdomain && (
                    <Input
                      placeholder="Enter custom sub-domain name"
                      value={kgSubdomain}
                      onChange={(e) => setKgSubdomain(e.target.value)}
                      data-testid="input-kg-custom-subdomain"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Company Context (optional)</Label>
                  <Textarea
                    value={kgCompanyContext}
                    onChange={(e) => setKgCompanyContext(e.target.value)}
                    placeholder="e.g., Fitch Ratings - global credit rating agency specializing in sovereign, corporate, and structured finance ratings"
                    className="resize-none"
                    rows={3}
                    data-testid="input-kg-company-context"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setKgBuilderStep("generating");
                    kgGenerateMutation.mutate();
                  }}
                  disabled={!kgSubdomain.trim()}
                  data-testid="button-kg-generate"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate Knowledge Graph
                </Button>
              </DialogFooter>
            </>
          )}

          {kgBuilderStep === "generating" && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-foreground" />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Generating Knowledge Graph</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  AI is building domain-specific concepts, relationships, and properties for the {kgSubdomain} sub-domain. This may take a moment...
                </p>
              </div>
            </div>
          )}

          {kgBuilderStep === "review" && (() => {
            const grouped: Record<string, any[]> = {};
            kgGeneratedConcepts.forEach((c) => {
              if (!grouped[c.category]) grouped[c.category] = [];
              grouped[c.category].push(c);
            });
            const selectedCount = kgSelectedIds.size;
            const duplicatesCount = kgGeneratedConcepts.filter((c) => c.isDuplicate).length;

            return (
              <>
                <DialogHeader>
                  <DialogTitle>{kgSubdomain} Knowledge Graph</DialogTitle>
                  <DialogDescription>Review and select concepts to import</DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{kgGeneratedConcepts.length} concepts</span>
                    <span>{selectedCount} selected</span>
                    {duplicatesCount > 0 && <span>{duplicatesCount} duplicates</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setKgSelectedIds(new Set(kgGeneratedConcepts.map((c) => c.id)))}
                      data-testid="button-kg-select-all"
                    >
                      Select All
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setKgSelectedIds(new Set())}
                      data-testid="button-kg-deselect-all"
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>
                <ScrollArea className="max-h-[400px]">
                  <Accordion
                    type="multiple"
                    value={Array.from(kgExpandedCategories)}
                    onValueChange={(v) => setKgExpandedCategories(new Set(v))}
                  >
                    {Object.entries(grouped).map(([category, conceptsInCat]) => (
                      <AccordionItem key={category} value={category}>
                        <AccordionTrigger className="text-sm font-medium">
                          {category} ({conceptsInCat.length})
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-1">
                            {conceptsInCat.map((concept, idx) => {
                              const globalIdx = kgGeneratedConcepts.indexOf(concept);
                              const isSelected = kgSelectedIds.has(concept.id);
                              return (
                                <div
                                  key={concept.id}
                                  className="flex items-start gap-2 p-2 rounded-md cursor-pointer"
                                  onClick={() => {
                                    setKgSelectedIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(concept.id)) {
                                        next.delete(concept.id);
                                      } else {
                                        next.add(concept.id);
                                      }
                                      return next;
                                    });
                                  }}
                                >
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={(checked) => {
                                      setKgSelectedIds((prev) => {
                                        const next = new Set(prev);
                                        if (checked) {
                                          next.add(concept.id);
                                        } else {
                                          next.delete(concept.id);
                                        }
                                        return next;
                                      });
                                    }}
                                    data-testid={`checkbox-kg-concept-${globalIdx}`}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-sm">{concept.label}</span>
                                      {concept.isDuplicate && (
                                        <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                                          Duplicate
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {concept.description?.length > 80
                                        ? concept.description.slice(0, 80) + "..."
                                        : concept.description}
                                    </p>
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {(concept.tags || []).slice(0, 4).map((tag: string) => (
                                        <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0">
                                          {tag}
                                        </Badge>
                                      ))}
                                      {(concept.synonyms || []).length > 0 && (
                                        <span className="text-[10px] text-muted-foreground">
                                          {concept.synonyms.length} synonym{concept.synonyms.length !== 1 ? "s" : ""}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </ScrollArea>
                <DialogFooter className="gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setKgBuilderStep("configure")}
                    data-testid="button-kg-back"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleKgImport}
                    disabled={kgImporting || selectedCount === 0}
                    data-testid="button-kg-import"
                  >
                    {kgImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Import {selectedCount} Concepts
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={reconcileDialogOpen} onOpenChange={setReconcileDialogOpen}>
        <DialogContent className="astra-scope font-sans" data-testid="dialog-reconcile-relationships">
          <DialogHeader>
            <DialogTitle>Reconcile Relationships</DialogTitle>
            <DialogDescription>
              Scan for relationships that reference concepts not present in this ontology.
            </DialogDescription>
          </DialogHeader>
          {reconcileResults && (
            <div className="space-y-4">
              {reconcileResults.total === 0 ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <CheckCircle className="w-10 h-10 text-green-500" />
                  <div>
                    <p className="font-medium text-sm">All relationships are valid</p>
                    <p className="text-xs text-muted-foreground mt-1">Every relationship points to an existing concept in this ontology.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      Found <strong>{reconcileResults.total}</strong> orphaned relationship(s) pointing to non-existent concepts.
                    </p>
                  </div>
                  <div className="max-h-[240px] overflow-y-auto space-y-2">
                    {reconcileResults.orphaned.map((o: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-md border text-xs" data-testid={`orphaned-rel-${i}`}>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <span className="font-medium">{o.conceptLabel}</span>
                          <span className="text-muted-foreground"> → </span>
                          <span className="text-amber-600 dark:text-amber-400">{o.relationship?.targetId || "unknown"}</span>
                          <span className="text-muted-foreground ml-1">({o.relationship?.type})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reconcileActionMutation.mutate("create_stubs")}
                      disabled={reconcileActionMutation.isPending}
                      data-testid="button-reconcile-create"
                    >
                      {reconcileActionMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                      Create Missing Concepts
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => reconcileActionMutation.mutate("remove")}
                      disabled={reconcileActionMutation.isPending}
                      data-testid="button-reconcile-remove"
                    >
                      {reconcileActionMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
                      Remove Orphaned
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete concept confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="astra-scope font-sans" data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Concept</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedConcept ? (
                <>
                  Are you sure you want to delete <strong>{selectedConcept.label}</strong>?
                  {selectedConcept.usageCount > 0 && (
                    <span className="block mt-2 text-amber-600 dark:text-amber-400 font-medium">
                      This concept is referenced in {selectedConcept.usageCount} agent{selectedConcept.usageCount !== 1 ? "s" : ""} — deleting it will not remove those existing references.
                    </span>
                  )}
                  {" "}This action cannot be undone.
                </>
              ) : (
                "This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedConcept && deleteConceptMutation.mutate(selectedConcept.id)}
              disabled={deleteConceptMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-confirm"
            >
              {deleteConceptMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 mr-1" />
              )}
              Delete Concept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV Import dialog */}
      <Dialog open={csvImportOpen} onOpenChange={(open) => { setCsvImportOpen(open); if (!open) { setCsvRows([]); setCsvSelected(new Set()); if (csvFileRef.current) csvFileRef.current.value = ""; } }}>
        <DialogContent className="astra-scope font-sans max-w-3xl" data-testid="dialog-csv-import">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Import Concepts from CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk-import ontology concepts. Concepts already in this workspace (matching by label) are shown as duplicates and unchecked by default.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1">
                <input
                  ref={csvFileRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCsvFileChange}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-input file:text-sm file:font-medium file:bg-background file:text-foreground hover:file:bg-accent cursor-pointer"
                  data-testid="input-csv-file"
                />
              </div>
              <button
                onClick={handleDownloadTemplate}
                className="text-xs text-foreground underline underline-offset-2 whitespace-nowrap"
                data-testid="link-download-template"
              >
                Download template
              </button>
            </div>

            {csvRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{csvSelected.size} of {csvRows.length} selected{csvRows.filter((r) => r.isDuplicate).length > 0 ? ` · ${csvRows.filter((r) => r.isDuplicate).length} duplicate(s) unchecked` : ""}</span>
                  <div className="flex gap-2">
                    <button className="underline underline-offset-2" onClick={() => setCsvSelected(new Set(csvRows.map((_, i) => i)))}>Select all</button>
                    <button className="underline underline-offset-2" onClick={() => setCsvSelected(new Set())}>Deselect all</button>
                  </div>
                </div>
                <div className="border rounded-md overflow-auto max-h-64">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="text-xs">Label</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs max-w-[160px]">Description</TableHead>
                        <TableHead className="text-xs">Industry ID</TableHead>
                        <TableHead className="text-xs">Tags</TableHead>
                        <TableHead className="w-24 text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvRows.map((row, i) => (
                        <TableRow key={i} className={row.isDuplicate ? "opacity-50" : ""} data-testid={`row-csv-import-${i}`}>
                          <TableCell>
                            <Checkbox
                              checked={csvSelected.has(i)}
                              onCheckedChange={(checked) => {
                                setCsvSelected((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(i); else next.delete(i);
                                  return next;
                                });
                              }}
                              data-testid={`checkbox-csv-row-${i}`}
                            />
                          </TableCell>
                          <TableCell className="text-xs font-medium">{row.label}</TableCell>
                          <TableCell className="text-xs">{row.category}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate" title={row.description}>{row.description || <span className="italic">—</span>}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.industryId || <span className="italic">uses current</span>}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{row.tags}</TableCell>
                          <TableCell>
                            {row.isDuplicate ? (
                              <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">Exists</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-600 dark:text-emerald-400">New</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvImportOpen(false)} data-testid="button-csv-import-cancel">Cancel</Button>
            <Button
              onClick={handleCsvImport}
              disabled={csvSelected.size === 0 || csvImporting}
              data-testid="button-csv-import-confirm"
            >
              {csvImporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Import {csvSelected.size > 0 ? csvSelected.size : ""} Concept{csvSelected.size !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

