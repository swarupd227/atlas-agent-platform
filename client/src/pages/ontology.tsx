import { useState, useMemo } from "react";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface ConceptView {
  id: string;
  label: string;
  category: string;
  description: string;
  properties: OntologyProperty[];
  relationships: OntologyRelationship[];
  tags: string[];
  industryRelevance: string | null;
}

interface EnrichedConcept {
  enrichedDescription?: string;
  regulatoryRelevance?: string;
  agentUseCases?: string[];
  dataHandlingConsiderations?: string;
  relatedStandards?: string[];
  implementationGuidance?: string;
  riskFactors?: string[];
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
};

const relationshipTypeColors: Record<string, string> = {
  parent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  child: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  related: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  depends_on: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
};

function toConceptView(c: DbOntologyConcept): ConceptView {
  return {
    id: c.id,
    label: c.label,
    category: c.category,
    description: c.description,
    properties: (c.properties as OntologyProperty[]) || [],
    relationships: (c.relationships as OntologyRelationship[]) || [],
    tags: c.tags || [],
    industryRelevance: c.industryRelevance,
  };
}

export default function OntologyExplorer() {
  const { industry } = useIndustry();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);

  const industryId = industry && industry.id !== "custom" ? industry.id : null;

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

  const categories = useMemo(() => {
    const cats: Record<string, ConceptView[]> = {};
    for (const concept of concepts) {
      if (!cats[concept.category]) cats[concept.category] = [];
      cats[concept.category].push(concept);
    }
    return cats;
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
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
      if (filtered.length > 0) result[cat] = filtered;
    }
    return result;
  }, [categories, searchQuery]);

  const selectedConcept = useMemo(() => {
    if (!selectedConceptId) return null;
    return concepts.find((c) => c.id === selectedConceptId) || null;
  }, [selectedConceptId, concepts]);

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
        applied: true,
      });

      const updatePayload: Record<string, unknown> = {};
      if (enriched.enrichedDescription) {
        updatePayload.description = enriched.enrichedDescription;
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

  const getConceptLabel = (id: string): string => {
    const c = concepts.find((concept) => concept.id === id);
    return c ? c.label : id;
  };

  if (!industry || industry.id === "custom") {
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

  if (concepts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8" data-testid="ontology-unavailable">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
            <Network className="w-12 h-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Ontology Unavailable</h2>
            <p className="text-sm text-muted-foreground">
              No ontology data is available for the selected industry.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ontologyName = industry.ontology || "Domain Ontology";
  const totalConcepts = concepts.length;
  const categoryNames = Object.keys(filteredCategories);

  return (
    <div className="flex h-full" data-testid="ontology-explorer">
      <div className="w-[300px] border-r flex flex-col shrink-0" data-testid="ontology-sidebar">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
            <h2 className="text-sm font-semibold truncate" data-testid="text-ontology-name">{ontologyName}</h2>
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
        </div>
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
                                {isApplied(concept.id) && (
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
      </div>

      <div className="flex-1 overflow-hidden" data-testid="ontology-detail">
        <ScrollArea className="h-full">
          {!selectedConcept ? (
            <div className="flex items-center justify-center h-full min-h-[400px] p-8">
              <div className="text-center space-y-4 max-w-md">
                <Network className="w-16 h-16 text-muted-foreground mx-auto" />
                <h2 className="text-xl font-semibold" data-testid="text-ontology-title">{ontologyName}</h2>
                <p className="text-sm text-muted-foreground">{industry.description}</p>
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  <div className="text-center">
                    <div className="text-2xl font-bold" data-testid="text-total-concepts">{totalConcepts}</div>
                    <div className="text-xs text-muted-foreground">Total Concepts</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold" data-testid="text-total-categories">{Object.keys(categories).length}</div>
                    <div className="text-xs text-muted-foreground">Categories</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Select a concept from the sidebar to explore its properties, relationships, and agent mapping.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6 max-w-4xl">
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-semibold" data-testid="text-concept-label">{selectedConcept.label}</h1>
                  <Badge variant="secondary" data-testid="badge-concept-category">{selectedConcept.category}</Badge>
                </div>
                <p className="text-sm text-muted-foreground" data-testid="text-concept-description">
                  {selectedConcept.description}
                </p>
                {isApplied(selectedConcept.id) && (
                  <Badge variant="secondary" className="text-[10px] mt-1" data-testid="badge-ai-enhanced">
                    <Sparkles className="w-2.5 h-2.5 mr-1" /> AI Enhanced
                  </Badge>
                )}
              </div>

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
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    Relationships
                  </CardTitle>
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

              <Card data-testid="card-agent-mapping">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Agent Mapping
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {AGENT_MAPPING[selectedConcept.category] ? (
                    <>
                      <div>
                        <div className="text-xs font-medium mb-1.5">Relevant Agent Skills</div>
                        <div className="flex flex-wrap gap-1.5">
                          {AGENT_MAPPING[selectedConcept.category].skills.map((skill) => (
                            <Badge key={skill} variant="secondary" className="text-[10px]" data-testid={`badge-skill-${skill.toLowerCase().replace(/\s+/g, "-")}`}>
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium mb-1.5">Applicable Agent Types</div>
                        <div className="flex flex-wrap gap-1.5">
                          {AGENT_MAPPING[selectedConcept.category].agentTypes.map((agentType) => (
                            <Badge key={agentType} variant="outline" className="text-[10px]" data-testid={`badge-agent-${agentType.toLowerCase().replace(/\s+/g, "-")}`}>
                              {agentType}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No agent mapping available for this category.</p>
                  )}
                </CardContent>
              </Card>

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
                const showEnrichment = enrichment && (hasLocal || applied);

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
                              <Card className="bg-muted/50" data-testid="card-enriched-description">
                                <CardContent className="pt-4">
                                  <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                    <BookOpen className="w-3 h-3" />
                                    Enhanced Description
                                  </div>
                                  <p className="text-sm text-muted-foreground" data-testid="text-enriched-description">
                                    {enrichment.enrichedDescription}
                                  </p>
                                </CardContent>
                              </Card>
                            )}

                            {enrichment.agentUseCases && enrichment.agentUseCases.length > 0 && (
                              <Card className="bg-muted/50" data-testid="card-agent-use-cases">
                                <CardContent className="pt-4">
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
                                </CardContent>
                              </Card>
                            )}

                            {enrichment.regulatoryRelevance && (
                              <Card className="bg-muted/50" data-testid="card-regulatory-relevance">
                                <CardContent className="pt-4">
                                  <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                    <Shield className="w-3 h-3" />
                                    Regulatory Relevance
                                  </div>
                                  <p className="text-xs text-muted-foreground" data-testid="text-regulatory-relevance">
                                    {enrichment.regulatoryRelevance}
                                  </p>
                                </CardContent>
                              </Card>
                            )}

                            {enrichment.riskFactors && enrichment.riskFactors.length > 0 && (
                              <Card className="bg-muted/50" data-testid="card-risk-factors">
                                <CardContent className="pt-4">
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
                                </CardContent>
                              </Card>
                            )}

                            {enrichment.relatedStandards && enrichment.relatedStandards.length > 0 && (
                              <Card className="bg-muted/50" data-testid="card-related-standards">
                                <CardContent className="pt-4">
                                  <div className="text-xs font-semibold mb-1.5">Related Standards</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {enrichment.relatedStandards.map((std, i) => (
                                      <Badge key={i} variant="outline" className="text-[10px]" data-testid={`badge-standard-${i}`}>
                                        {std}
                                      </Badge>
                                    ))}
                                  </div>
                                </CardContent>
                              </Card>
                            )}

                            {enrichment.dataHandlingConsiderations && (
                              <Card className="bg-muted/50" data-testid="card-data-handling">
                                <CardContent className="pt-4">
                                  <div className="text-xs font-semibold mb-1.5">Data Handling Considerations</div>
                                  <p className="text-xs text-muted-foreground" data-testid="text-data-handling">
                                    {enrichment.dataHandlingConsiderations}
                                  </p>
                                </CardContent>
                              </Card>
                            )}

                            {enrichment.implementationGuidance && (
                              <Card className="bg-muted/50" data-testid="card-implementation-guidance">
                                <CardContent className="pt-4">
                                  <div className="text-xs font-semibold mb-1.5">Implementation Guidance</div>
                                  <p className="text-xs text-muted-foreground" data-testid="text-implementation-guidance">
                                    {enrichment.implementationGuidance}
                                  </p>
                                </CardContent>
                              </Card>
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
    </div>
  );
}
