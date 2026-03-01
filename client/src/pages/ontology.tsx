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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
}

interface LinkedRegulation {
  name: string;
  url?: string;
}

interface ConceptView {
  id: string;
  label: string;
  category: string;
  description: string;
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
    description: c.description,
    properties: (c.properties as OntologyProperty[]) || [],
    relationships: (c.relationships as OntologyRelationship[]) || [],
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

type SourceFilter = "all" | "standard" | "custom";
type ViewMode = "list" | "graph";

export default function OntologyExplorer() {
  const { industry } = useIndustry();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryCustom, setNewCategoryCustom] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSynonyms, setNewSynonyms] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newRelateTo, setNewRelateTo] = useState("");
  const [kgPanelOpen, setKgPanelOpen] = useState(false);
  const [kgSuggestions, setKgSuggestions] = useState<KgSuggestion[]>([]);
  const [kgDismissed, setKgDismissed] = useState<Set<number>>(new Set());
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
    if (sourceFilter === "all") return concepts;
    if (sourceFilter === "standard") return concepts.filter((c) => c.source !== "custom-extension");
    return concepts.filter((c) => c.source === "custom-extension");
  }, [concepts, sourceFilter]);

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
        const newRels = enriched.suggestedRelationships.filter((r) => !existingKeys.has(`${r.type}-${r.targetId}`));
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
      queryClient.invalidateQueries({ queryKey: ["/api/ontology/concepts", industryId] });
      toast({ title: "Concept deleted", description: "Custom concept has been removed." });
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

  const acceptKgRelationshipMutation = useMutation({
    mutationFn: async ({ concept, suggestion }: { concept: ConceptView; suggestion: KgSuggestion }) => {
      const validTypes: OntologyRelationship["type"][] = ["parent", "child", "related", "depends_on"];
      const normalizedType: OntologyRelationship["type"] = validTypes.includes(suggestion.type as any)
        ? (suggestion.type as OntologyRelationship["type"])
        : "related";
      const newRelationship: OntologyRelationship = {
        type: normalizedType,
        targetId: suggestion.targetEntity,
        label: suggestion.context || `${suggestion.type.replace(/_/g, " ")}: ${suggestion.targetEntity}`,
      };
      const existingKeys = new Set(concept.relationships.map(r => `${r.type}-${r.targetId}`));
      if (existingKeys.has(`${newRelationship.type}-${newRelationship.targetId}`)) {
        throw new Error("Relationship already exists on this concept");
      }
      const updatedRelationships = [...concept.relationships, newRelationship];
      await apiRequest("PUT", `/api/ontology/concepts/${concept.id}`, {
        relationships: updatedRelationships,
      });
      return { conceptId: concept.id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ontology/concepts", industryId] });
      toast({ title: "Relationship added", description: "The suggested relationship was added to this concept." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add relationship", description: err.message, variant: "destructive" });
    },
  });

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
    if (viewMode === "graph") {
      setViewMode("list");
    }
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

  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const cats = Object.keys(categories);
    cats.forEach((cat, i) => {
      map[cat] = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
    });
    return map;
  }, [categories]);

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
                <Sparkles className="w-8 h-8 text-primary" />
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
          <DialogContent data-testid="dialog-add-custom-concept">
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
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
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

  return (
    <div className="flex h-full" data-testid="ontology-explorer">
      <div className="w-[300px] border-r flex flex-col shrink-0" data-testid="ontology-sidebar">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
              <h2 className="text-sm font-semibold truncate" data-testid="text-ontology-name">{ontologyName}</h2>
            </div>
            <div className="flex flex-row gap-1 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddDialogOpen(true)}
                data-testid="button-add-custom-concept"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Custom
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setKgBuilderOpen(true); setKgBuilderStep("configure"); }}
                data-testid="button-kg-builder"
              >
                <Database className="w-4 h-4 mr-1" />
                KG Builder
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search concepts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-concepts"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Tabs value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)} className="w-full">
              <TabsList className="w-full" data-testid="filter-source-toggle">
                <TabsTrigger value="all" className="flex-1 text-xs" data-testid="filter-all">All</TabsTrigger>
                <TabsTrigger value="standard" className="flex-1 text-xs" data-testid="filter-standard">Standard</TabsTrigger>
                <TabsTrigger value="custom" className="flex-1 text-xs" data-testid="filter-custom">Custom</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={viewMode === "list" ? "default" : "ghost"}
              className="flex-1"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="w-3.5 h-3.5 mr-1" />
              List
            </Button>
            <Button
              size="sm"
              variant={viewMode === "graph" ? "default" : "ghost"}
              className="flex-1"
              onClick={() => setViewMode("graph")}
              data-testid="button-view-graph"
            >
              <Share2 className="w-3.5 h-3.5 mr-1" />
              Graph
            </Button>
          </div>
        </div>
        {viewMode === "list" ? (
          <ScrollArea className="flex-1">
            <div className="p-2">
              <Accordion type="multiple" defaultValue={Object.keys(categories)} className="space-y-1">
                {categoryNames.map((category) => {
                  const catConcepts = filteredCategories[category];
                  return (
                    <AccordionItem key={category} value={category} className="border-none">
                      <AccordionTrigger
                        className="py-2 px-2 text-xs font-medium rounded-md hover:no-underline"
                        data-testid={`accordion-category-${category.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="truncate">{category}</span>
                          <Badge variant="secondary" className="text-[10px]" data-testid={`badge-count-${category.toLowerCase().replace(/\s+/g, "-")}`}>
                            {catConcepts.length}
                          </Badge>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-1 pt-0">
                        <div className="space-y-0.5 pl-1">
                          {catConcepts.map((concept) => (
                            <Tooltip key={concept.id}>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleConceptClick(concept.id)}
                                  className={`w-full text-left text-xs py-1.5 px-2 rounded-md transition-colors flex items-center gap-1.5 ${
                                    selectedConceptId === concept.id
                                      ? "bg-primary/10 text-primary font-medium"
                                      : "text-muted-foreground hover-elevate"
                                  }`}
                                  data-testid={`button-concept-${concept.id}`}
                                >
                                  <ChevronRight className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{concept.label}</span>
                                  {concept.sensitivityClassification && (
                                    <Badge
                                      variant="outline"
                                      className={`text-[9px] shrink-0 ${
                                        concept.sensitivityClassification.level === "phi" || concept.sensitivityClassification.level === "pci"
                                          ? "border-red-500/50 text-red-600 dark:text-red-400"
                                          : concept.sensitivityClassification.level === "restricted" || concept.sensitivityClassification.level === "confidential"
                                          ? "border-orange-500/50 text-orange-600 dark:text-orange-400"
                                          : "border-yellow-500/50 text-yellow-600 dark:text-yellow-400"
                                      }`}
                                      data-testid={`badge-sensitivity-${concept.id}`}
                                    >
                                      {concept.sensitivityClassification.level.toUpperCase()}
                                    </Badge>
                                  )}
                                  {isCustom(concept) && (
                                    <Badge variant="outline" className="text-[9px] ml-auto shrink-0 border-amber-500/50 text-amber-600 dark:text-amber-400" data-testid={`badge-custom-${concept.id}`}>
                                      Custom
                                    </Badge>
                                  )}
                                  {!isCustom(concept) && isApplied(concept.id) && (
                                    <Sparkles className="w-3 h-3 shrink-0 text-primary ml-auto" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-[250px]">
                                <p className="text-xs">{concept.description}</p>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 p-2 text-xs text-muted-foreground flex items-center justify-center">
            <span>Graph view shown in main panel</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden" data-testid="ontology-detail">
        <ScrollArea className="h-full">
          {viewMode === "graph" ? (
            <GraphView
              concepts={Object.values(filteredCategories).flat()}
              categoryColorMap={categoryColorMap}
              selectedConceptId={selectedConceptId}
              onSelectConcept={handleConceptClick}
              searchQuery={searchQuery}
            />
          ) : !selectedConcept ? (
            <div className="p-8 space-y-6">
              <div className="text-center space-y-4 max-w-md mx-auto">
                <Network className="w-16 h-16 text-muted-foreground mx-auto" />
                <h2 className="text-xl font-semibold" data-testid="text-ontology-title">{ontologyName}</h2>
                <p className="text-sm text-muted-foreground">{industry.description}</p>
                <div className="flex items-center justify-center gap-6 flex-wrap">
                  <div className="text-center">
                    <div className="text-2xl font-bold" data-testid="text-total-concepts">{totalConcepts}</div>
                    <div className="text-xs text-muted-foreground">Total Concepts</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold" data-testid="text-total-categories">{Object.keys(categories).length}</div>
                    <div className="text-xs text-muted-foreground">Categories</div>
                  </div>
                  {customCount > 0 && (
                    <div className="text-center">
                      <div className="text-2xl font-bold" data-testid="text-custom-count">{customCount}</div>
                      <div className="text-xs text-muted-foreground">Custom Extensions</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
                <Card data-testid="card-metric-coverage">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <BarChart3 className="w-3.5 h-3.5" />
                      Coverage
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-bold" data-testid="text-coverage-value">87%</div>
                    <Progress value={87} className="h-2" data-testid="progress-coverage" />
                    <p className="text-[11px] text-muted-foreground">of agent interactions reference ontology concepts</p>
                  </CardContent>
                </Card>

                <Card data-testid="card-metric-consistency">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <Check className="w-3.5 h-3.5" />
                      Consistency
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-bold" data-testid="text-consistency-value">94%</div>
                    <Progress value={94} className="h-2" data-testid="progress-consistency" />
                    <p className="text-[11px] text-muted-foreground">terminology alignment score</p>
                  </CardContent>
                </Card>

                <Card data-testid="card-metric-freshness">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      Freshness
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CircleDot className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-sm font-medium" data-testid="text-freshness-value">Up to date</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Last updated 2 days ago</p>
                  </CardContent>
                </Card>

                <Card data-testid="card-metric-gaps">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Gap Detection
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-bold" data-testid="text-gaps-value">12</div>
                    <p className="text-[11px] text-muted-foreground">gaps found in conversations where agents couldn't find relevant concepts</p>
                  </CardContent>
                </Card>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Select a concept from the sidebar to explore its properties, relationships, and agent mapping.
              </p>
            </div>
          ) : (
            <div className="p-6 space-y-6 max-w-4xl">
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-semibold" data-testid="text-concept-label">{selectedConcept.label}</h1>
                  <Badge variant="secondary" data-testid="badge-concept-category">{selectedConcept.category}</Badge>
                  <Badge variant="outline" data-testid="badge-concept-version">
                    v{selectedConcept.version}
                  </Badge>
                  {selectedConcept.sensitivityClassification && (
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
                      data-testid="badge-sensitivity-level"
                    >
                      <Shield className="w-3 h-3 mr-1" />
                      {selectedConcept.sensitivityClassification.level.toUpperCase()}
                    </Badge>
                  )}
                  {isCustom(selectedConcept) && (
                    <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400" data-testid="badge-custom-extension">
                      Custom Extension
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground" data-testid="text-concept-description">
                  {selectedConcept.description}
                </p>
                {selectedConcept.synonyms.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" data-testid="concept-synonyms">
                    {selectedConcept.synonyms.map((syn) => (
                      <Badge key={syn} variant="outline" className="text-[10px]" data-testid={`badge-synonym-${syn}`}>
                        {syn}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  {selectedConcept.usageCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="text-usage-count">
                      <BarChart3 className="w-3.5 h-3.5" />
                      Referenced {selectedConcept.usageCount} times in production
                    </div>
                  )}
                  {isApplied(selectedConcept.id) && (
                    <Badge variant="secondary" className="text-[10px]" data-testid="badge-ai-enhanced">
                      <Sparkles className="w-2.5 h-2.5 mr-1" /> AI Enhanced
                    </Badge>
                  )}
                </div>
                {isCustom(selectedConcept) && (
                  <div className="pt-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteConceptMutation.mutate(selectedConcept.id)}
                      disabled={deleteConceptMutation.isPending}
                      data-testid="button-delete-concept"
                    >
                      {deleteConceptMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                      )}
                      Delete Custom Concept
                    </Button>
                  </div>
                )}
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

              {linkedAgents && linkedAgents.length > 0 && (
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
                            <a href={reg.url} target="_blank" rel="noopener noreferrer" className="text-primary underline" data-testid={`link-regulation-${i}`}>
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
                          <code className="font-mono text-primary shrink-0 min-w-[120px]">{prop.name}</code>
                          <Badge variant="outline" className="text-[10px] shrink-0">{prop.type}</Badge>
                          <span className="text-muted-foreground">{prop.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-relationships">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Link2 className="w-4 h-4" />
                      Relationships
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => suggestRelationshipsMutation.mutate(selectedConcept)}
                      disabled={suggestRelationshipsMutation.isPending}
                      data-testid="button-suggest-relationships"
                    >
                      {suggestRelationshipsMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Database className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Suggest Relationships
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedConcept.relationships.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No relationships defined.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedConcept.relationships.map((rel, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleRelationshipClick(rel.targetId)}
                          className="text-left p-3 rounded-md border hover-elevate transition-colors"
                          data-testid={`button-relationship-${rel.targetId}`}
                        >
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge className={`text-[10px] ${relationshipTypeColors[rel.type] || ""}`}>
                              {rel.type.replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="text-xs font-medium">{getConceptLabel(rel.targetId)}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{rel.label}</div>
                        </button>
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
                                <Sparkles className="w-3.5 h-3.5 text-primary" />
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
                                      <code className="font-mono text-primary shrink-0 min-w-[120px]">{prop.name}</code>
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
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {enrichment.suggestedRelationships.map((rel, i) => (
                                    <div key={i} className="p-3 rounded-md border" data-testid={`preview-relationship-${i}`}>
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <Badge className={`text-[10px] ${relationshipTypeColors[rel.type] || ""}`}>
                                          {rel.type.replace("_", " ")}
                                        </Badge>
                                      </div>
                                      <div className="text-xs font-medium">{rel.targetId}</div>
                                      <div className="text-[11px] text-muted-foreground mt-0.5">{rel.label}</div>
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
          )}
        </ScrollArea>
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
          <div className="px-3 py-2 border-b">
            <p className="text-xs text-muted-foreground">
              Showing relationship suggestions for <span className="font-medium text-foreground">{selectedConcept.label}</span> from Knowledge Graph and AI analysis.
            </p>
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
                  const existingKeys = new Set(selectedConcept.relationships.map(r => `${r.type}-${r.targetId}`));
                  const alreadyAdded = existingKeys.has(`${suggestion.type}-${suggestion.targetEntity}`);
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
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <CheckCircle className="w-3 h-3" />
                            Already added
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => acceptKgRelationshipMutation.mutate({ concept: selectedConcept, suggestion })}
                              disabled={acceptKgRelationshipMutation.isPending}
                              data-testid={`button-accept-suggestion-${idx}`}
                            >
                              {acceptKgRelationshipMutation.isPending ? (
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

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent data-testid="dialog-add-custom-concept">
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
        <DialogContent className="max-w-3xl" data-testid="dialog-kg-builder">
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
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
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
    </div>
  );
}

function GraphView({
  concepts,
  categoryColorMap,
  selectedConceptId,
  onSelectConcept,
  searchQuery,
}: {
  concepts: ConceptView[];
  categoryColorMap: Record<string, string>;
  selectedConceptId: string | null;
  onSelectConcept: (id: string) => void;
  searchQuery: string;
}) {
  const width = 900;
  const height = 700;
  const centerX = width / 2;
  const centerY = height / 2;

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Record<string, { x: number; y: number }>>({});
  const didDragRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const basePositions = useMemo(() => {
    const catGroups: Record<string, ConceptView[]> = {};
    for (const c of concepts) {
      if (!catGroups[c.category]) catGroups[c.category] = [];
      catGroups[c.category].push(c);
    }
    const cats = Object.keys(catGroups);
    const pos: Record<string, { x: number; y: number }> = {};
    const baseRadius = Math.min(width, height) * 0.3;

    cats.forEach((cat, catIdx) => {
      const catAngle = (2 * Math.PI * catIdx) / cats.length - Math.PI / 2;
      const catConcepts = catGroups[cat];
      const ringRadius = baseRadius + (catIdx % 2 === 0 ? 0 : 40);

      catConcepts.forEach((concept, i) => {
        const spread = catConcepts.length > 1 ? (Math.PI * 0.3) / catConcepts.length : 0;
        const angle = catAngle + (i - (catConcepts.length - 1) / 2) * spread;
        const r = ringRadius + i * 15;
        pos[concept.id] = {
          x: centerX + r * Math.cos(angle),
          y: centerY + r * Math.sin(angle),
        };
      });
    });
    return pos;
  }, [concepts, centerX, centerY, width, height]);

  const positions = useMemo(() => {
    const merged: Record<string, { x: number; y: number }> = {};
    for (const [id, pos] of Object.entries(basePositions)) {
      const offset = dragOffset[id];
      merged[id] = offset ? { x: pos.x + offset.x, y: pos.y + offset.y } : pos;
    }
    return merged;
  }, [basePositions, dragOffset]);

  const edges = useMemo(() => {
    const conceptIds = new Set(concepts.map((c) => c.id));
    const result: { from: string; to: string; type: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const c of concepts) {
      for (const rel of c.relationships) {
        if (conceptIds.has(rel.targetId)) {
          const key = [c.id, rel.targetId].sort().join("-");
          if (!seen.has(key)) {
            seen.add(key);
            result.push({ from: c.id, to: rel.targetId, type: rel.type, label: rel.label });
          }
        }
      }
    }
    return result;
  }, [concepts]);

  const connectedIds = useMemo(() => {
    if (!hoveredNodeId) return new Set<string>();
    const ids = new Set<string>();
    ids.add(hoveredNodeId);
    for (const e of edges) {
      if (e.from === hoveredNodeId) ids.add(e.to);
      if (e.to === hoveredNodeId) ids.add(e.from);
    }
    return ids;
  }, [hoveredNodeId, edges]);

  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(
      concepts
        .filter(
          (c) =>
            c.label.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q) ||
            c.tags.some((t) => t.toLowerCase().includes(q)) ||
            c.synonyms.some((s) => s.toLowerCase().includes(q))
        )
        .map((c) => c.id)
    );
  }, [searchQuery, concepts]);

  const maxUsage = useMemo(() => Math.max(1, ...concepts.map((c) => c.usageCount || 0)), [concepts]);

  const visibleConcepts = useMemo(
    () => concepts.filter((c) => !hiddenCategories.has(c.category)),
    [concepts, hiddenCategories]
  );
  const visibleIds = useMemo(() => new Set(visibleConcepts.map((c) => c.id)), [visibleConcepts]);

  const toggleCategory = (cat: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom((prev) => Math.max(0.3, Math.min(3, prev + delta)));
  }, []);

  const getSvgPoint = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: clientX, y: clientY };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height,
    };
  }, [width, height]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest("[data-node-id]")) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggedNodeId) {
      didDragRef.current = true;
      const pt = getSvgPoint(e.clientX, e.clientY);
      const base = basePositions[draggedNodeId];
      if (base) {
        setDragOffset((prev) => ({
          ...prev,
          [draggedNodeId]: {
            x: (pt.x - pan.x) / zoom - base.x,
            y: (pt.y - pan.y) / zoom - base.y,
          },
        }));
      }
    } else if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [draggedNodeId, isPanning, panStart, getSvgPoint, basePositions, pan, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDraggedNodeId(null);
  }, []);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, conceptId: string) => {
    e.stopPropagation();
    didDragRef.current = false;
    setDraggedNodeId(conceptId);
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDragOffset({});
    setHiddenCategories(new Set());
  }, []);

  return (
    <div className="p-4 space-y-3" data-testid="graph-view">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground">
          Scroll to zoom | Drag background to pan | Drag nodes to reposition
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(3, z + 0.2))} data-testid="button-zoom-in">
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))} data-testid="button-zoom-out">
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleReset} data-testid="button-graph-reset">
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Reset
          </Button>
        </div>
      </div>
      <div className="relative">
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="border rounded-md bg-muted/20 select-none"
          style={{ cursor: isPanning ? "grabbing" : draggedNodeId ? "grabbing" : "grab" }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          data-testid="graph-svg"
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {edges.map((edge, i) => {
              const from = positions[edge.from];
              const to = positions[edge.to];
              if (!from || !to || !visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return null;
              const isHighlighted = hoveredNodeId && (connectedIds.has(edge.from) && connectedIds.has(edge.to));
              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2;
              return (
                <g key={i}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={isHighlighted ? "hsl(var(--primary))" : "currentColor"}
                    strokeOpacity={isHighlighted ? 0.6 : hoveredNodeId ? 0.06 : 0.15}
                    strokeWidth={isHighlighted ? 2 : 1}
                  />
                  {isHighlighted && (
                    <text
                      x={midX}
                      y={midY - 4}
                      textAnchor="middle"
                      className="text-[7px] fill-muted-foreground"
                      style={{ pointerEvents: "none" }}
                    >
                      {edge.type.replace("_", " ")}
                    </text>
                  )}
                </g>
              );
            })}
            {visibleConcepts.map((concept) => {
              const p = positions[concept.id];
              if (!p) return null;
              const isSelected = selectedConceptId === concept.id;
              const isHovered = hoveredNodeId === concept.id;
              const isConnected = hoveredNodeId ? connectedIds.has(concept.id) : false;
              const isSearchMatch = searchMatchIds.has(concept.id);
              const isDimmed = hoveredNodeId !== null && !isConnected;
              const color = categoryColorMap[concept.category] || "hsl(210, 50%, 50%)";
              const isCustomNode = concept.source === "custom-extension";
              const usageRatio = (concept.usageCount || 0) / maxUsage;
              const baseR = 14 + usageRatio * 10;
              const r = isSelected ? baseR + 4 : isHovered ? baseR + 2 : baseR;

              return (
                <g
                  key={concept.id}
                  data-node-id={concept.id}
                  onMouseDown={(e) => handleNodeMouseDown(e, concept.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!didDragRef.current) onSelectConcept(concept.id);
                  }}
                  onMouseEnter={() => setHoveredNodeId(concept.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  className="cursor-pointer"
                  style={{ opacity: isDimmed ? 0.2 : 1, transition: "opacity 0.2s" }}
                  data-testid={`graph-node-${concept.id}`}
                >
                  {isSearchMatch && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={r + 6}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      strokeDasharray="3 2"
                      className="animate-pulse"
                    />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill={color}
                    fillOpacity={isSelected ? 0.9 : isHovered ? 0.8 : 0.6}
                    stroke={isSelected ? "hsl(var(--primary))" : isHovered ? "hsl(var(--foreground))" : color}
                    strokeWidth={isSelected ? 3 : isHovered ? 2 : 1.5}
                    strokeDasharray={isCustomNode ? "4 2" : undefined}
                  />
                  <text
                    x={p.x}
                    y={p.y + r + 12}
                    textAnchor="middle"
                    className="text-[9px] fill-foreground"
                    style={{ pointerEvents: "none", fontWeight: isHovered || isSelected ? 600 : 400 }}
                  >
                    {concept.label.length > 18 ? concept.label.slice(0, 16) + "..." : concept.label}
                  </text>
                </g>
              );
            })}
            {hoveredNodeId && (() => {
              const concept = concepts.find((c) => c.id === hoveredNodeId);
              const p = positions[hoveredNodeId];
              if (!concept || !p) return null;
              const tooltipW = 200;
              const tooltipH = 58;
              let tx = p.x + 24;
              let ty = p.y - tooltipH / 2;
              if (tx + tooltipW > width) tx = p.x - tooltipW - 24;
              if (ty < 10) ty = 10;
              if (ty + tooltipH > height - 10) ty = height - tooltipH - 10;
              return (
                <g style={{ pointerEvents: "none" }}>
                  <rect
                    x={tx}
                    y={ty}
                    width={tooltipW}
                    height={tooltipH}
                    rx={6}
                    fill="hsl(var(--card))"
                    stroke="hsl(var(--border))"
                    strokeWidth={1}
                  />
                  <text x={tx + 8} y={ty + 16} className="text-[11px] fill-foreground" style={{ fontWeight: 600 }}>
                    {concept.label.length > 28 ? concept.label.slice(0, 26) + "..." : concept.label}
                  </text>
                  <text x={tx + 8} y={ty + 28} className="text-[9px] fill-muted-foreground">
                    {concept.category}
                  </text>
                  <text x={tx + 8} y={ty + 42} className="text-[8px] fill-muted-foreground">
                    {concept.description.length > 45 ? concept.description.slice(0, 43) + "..." : concept.description}
                  </text>
                  {concept.usageCount > 0 && (
                    <text x={tx + 8} y={ty + 53} className="text-[8px] fill-muted-foreground">
                      {concept.usageCount} references
                    </text>
                  )}
                </g>
              );
            })()}
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(categoryColorMap).map(([cat, color]) => {
          const isHidden = hiddenCategories.has(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-opacity ${
                isHidden ? "opacity-40 line-through" : "hover-elevate"
              }`}
              data-testid={`legend-toggle-${cat.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-muted-foreground">{cat}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
