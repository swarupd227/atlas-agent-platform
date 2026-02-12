import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Skill } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Search,
  Layers,
  Star,
  Users,
  Shield,
  Activity,
  GitBranch,
  X,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Zap,
  Building2,
  Briefcase,
  Heart,
  Factory,
  ShoppingCart,
  Sparkles,
  Loader2,
  Plus,
  AlertTriangle,
  Target,
  Plug,
  BookOpen,
  Link2,
} from "lucide-react";

const INDUSTRY_CONFIG: Record<string, { label: string; icon: typeof Building2; color: string }> = {
  financial_services: { label: "Financial Services", icon: Briefcase, color: "text-blue-600 dark:text-blue-400" },
  healthcare: { label: "Healthcare", icon: Heart, color: "text-rose-600 dark:text-rose-400" },
  manufacturing: { label: "Manufacturing", icon: Factory, color: "text-amber-600 dark:text-amber-400" },
  retail: { label: "Retail", icon: ShoppingCart, color: "text-emerald-600 dark:text-emerald-400" },
};

const TRUST_TIER_STYLES: Record<string, string> = {
  "platform-provided": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "customer-created": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  marketplace: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

const COMPLEXITY_STYLES: Record<string, string> = {
  beginner: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  intermediate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  advanced: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 90 ? "bg-green-500" : score >= 80 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-visible">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{score.toFixed(1)}</span>
    </div>
  );
}

export default function SkillCatalog() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [trustFilter, setTrustFilter] = useState("all");
  const [compatFilter, setCompatFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "performance" | "activations">("activations");
  const [collapsedIndustries, setCollapsedIndustries] = useState<Set<string>>(new Set());
  const [compareList, setCompareList] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  const [aiEnhancingSkill, setAiEnhancingSkill] = useState<string | null>(null);
  const [sheetEnrichment, setSheetEnrichment] = useState<any>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [generateIndustry, setGenerateIndustry] = useState("financial_services");
  const [generateDomain, setGenerateDomain] = useState("");
  const [showGeneratePanel, setShowGeneratePanel] = useState(false);

  const { data: skills = [], isLoading } = useQuery<Skill[]>({
    queryKey: ["/api/skills"],
  });

  async function handleAiEnhanceSkill(skill: Skill) {
    setAiEnhancingSkill(skill.id);
    try {
      const res = await apiRequest("POST", "/api/ai/enhance-skill", {
        skillName: skill.name,
        skillDescription: skill.description,
        industry: skill.industry,
        domain: skill.domain,
        dependencies: skill.dependencies,
        tags: skill.tags,
      });
      const data = await res.json();
      const enriched = data.enriched;
      const patch: Record<string, any> = { aiEnrichment: enriched };
      if (enriched.enhancedDescription && enriched.enhancedDescription !== skill.description) {
        patch.description = enriched.enhancedDescription;
      }
      if (enriched.suggestedTags && Array.isArray(enriched.suggestedTags) && enriched.suggestedTags.length > 0) {
        patch.tags = enriched.suggestedTags;
      }
      await apiRequest("PATCH", `/api/skills/${skill.id}`, patch);
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      setSheetEnrichment(enriched);
      const updates: string[] = [];
      if (patch.description) updates.push("description");
      if (patch.tags) updates.push("tags");
      const extra = updates.length > 0 ? ` Updated ${updates.join(" & ")}.` : "";
      toast({ title: `AI Enhancement saved for ${skill.name}.${extra}` });
    } catch (e: any) {
      toast({ title: "AI enhancement failed", description: e.message, variant: "destructive" });
    } finally {
      setAiEnhancingSkill(null);
    }
  }

  async function handleAiGenerateSkills() {
    if (!generateDomain) {
      toast({ title: "Please enter a domain", variant: "destructive" });
      return;
    }
    setAiGenerating(true);
    try {
      const existingSkillNames = skills
        .filter((s) => s.industry === generateIndustry && s.domain === generateDomain)
        .map((s) => s.name);
      const res = await apiRequest("POST", "/api/ai/generate-skills", {
        industry: generateIndustry,
        domain: generateDomain,
        existingSkillNames,
        count: 5,
      });
      const data = await res.json();
      const generated = data.skills || [];
      let savedCount = 0;
      for (const skill of generated) {
        try {
          await apiRequest("POST", "/api/skills", skill);
          savedCount++;
        } catch (e) {
          console.error("Failed to save generated skill:", e);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      toast({ title: `Generated ${savedCount} new skills for ${generateDomain}` });
      setShowGeneratePanel(false);
    } catch (e: any) {
      toast({ title: "AI generation failed", description: e.message, variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  }

  const domains = useMemo(() => {
    const domainSet = new Set<string>();
    skills.forEach((s) => domainSet.add(s.domain));
    return Array.from(domainSet).sort();
  }, [skills]);

  const filteredSkills = useMemo(() => {
    let result = skills;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.tags as string[] | null)?.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (industryFilter !== "all") result = result.filter((s) => s.industry === industryFilter);
    if (domainFilter !== "all") result = result.filter((s) => s.domain === domainFilter);
    if (trustFilter !== "all") result = result.filter((s) => s.trustTier === trustFilter);
    if (compatFilter !== "all")
      result = result.filter((s) => (s.agentTypeCompatibility as string[] | null)?.includes(compatFilter));

    result = [...result].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "performance") return (b.performanceScore ?? 0) - (a.performanceScore ?? 0);
      return b.activationCount - a.activationCount;
    });
    return result;
  }, [skills, search, industryFilter, domainFilter, trustFilter, compatFilter, sortBy]);

  const groupedByIndustry = useMemo(() => {
    const grouped: Record<string, Record<string, Skill[]>> = {};
    filteredSkills.forEach((s) => {
      if (!grouped[s.industry]) grouped[s.industry] = {};
      if (!grouped[s.industry][s.domain]) grouped[s.industry][s.domain] = [];
      grouped[s.industry][s.domain].push(s);
    });
    return grouped;
  }, [filteredSkills]);

  const toggleIndustry = (industry: string) => {
    setCollapsedIndustries((prev) => {
      const next = new Set(prev);
      next.has(industry) ? next.delete(industry) : next.add(industry);
      return next;
    });
  };

  const toggleCompare = (id: string) => {
    setCompareList((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev));
  };

  const compareSkills = useMemo(() => skills.filter((s) => compareList.includes(s.id)), [skills, compareList]);

  const clearFilters = () => {
    setSearch("");
    setIndustryFilter("all");
    setDomainFilter("all");
    setTrustFilter("all");
    setCompatFilter("all");
  };

  const hasFilters = search || industryFilter !== "all" || domainFilter !== "all" || trustFilter !== "all" || compatFilter !== "all";

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-skills-title">Agent Skills Library</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Portable industry expertise encoded as composable, versioned skill units
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs" data-testid="badge-total-skills">
              {skills.length} Skills
            </Badge>
            {compareList.length > 0 && (
              <Button
                size="sm"
                onClick={() => setShowCompare(true)}
                data-testid="button-open-compare"
              >
                <BarChart3 className="w-4 h-4 mr-1" />
                Compare ({compareList.length})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowGeneratePanel(!showGeneratePanel)}
              data-testid="button-toggle-generate"
            >
              <Sparkles className="w-4 h-4 mr-1" />
              Generate with AI
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search skills by name, description, or tags..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-skill-search"
                />
              </div>
              <Select value={industryFilter} onValueChange={setIndustryFilter}>
                <SelectTrigger className="w-[170px]" data-testid="select-industry-filter">
                  <SelectValue placeholder="Industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Industries</SelectItem>
                  {Object.entries(INDUSTRY_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={domainFilter} onValueChange={setDomainFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-domain-filter">
                  <SelectValue placeholder="Domain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Domains</SelectItem>
                  {domains.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={trustFilter} onValueChange={setTrustFilter}>
                <SelectTrigger className="w-[170px]" data-testid="select-trust-filter">
                  <SelectValue placeholder="Trust Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="platform-provided">Platform Provided</SelectItem>
                  <SelectItem value="customer-created">Customer Created</SelectItem>
                  <SelectItem value="marketplace">Marketplace</SelectItem>
                </SelectContent>
              </Select>
              <Select value={compatFilter} onValueChange={setCompatFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-compat-filter">
                  <SelectValue placeholder="Agent Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[150px]" data-testid="select-sort">
                  <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activations">Most Used</SelectItem>
                  <SelectItem value="performance">Top Rated</SelectItem>
                  <SelectItem value="name">Name A-Z</SelectItem>
                </SelectContent>
              </Select>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                  <X className="w-3.5 h-3.5 mr-1" /> Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {showGeneratePanel && (
          <Card data-testid="panel-generate-skills">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  AI Skill Generator
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowGeneratePanel(false)} data-testid="button-close-generate">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Generate new skills for a specific industry and domain. AI will create 5 unique, production-ready skill definitions that avoid duplicating existing skills.
              </p>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Industry</label>
                  <Select value={generateIndustry} onValueChange={setGenerateIndustry}>
                    <SelectTrigger className="w-[200px]" data-testid="select-generate-industry">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(INDUSTRY_CONFIG).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 flex-1 min-w-[200px]">
                  <label className="text-xs font-medium text-muted-foreground">Domain</label>
                  <Input
                    placeholder="e.g., Fraud Detection, Clinical Trials..."
                    value={generateDomain}
                    onChange={(e) => setGenerateDomain(e.target.value)}
                    data-testid="input-generate-domain"
                  />
                </div>
                <Button
                  onClick={handleAiGenerateSkills}
                  disabled={aiGenerating || !generateDomain}
                  data-testid="button-generate-skills"
                >
                  {aiGenerating ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Generating...</>
                  ) : (
                    <><Plus className="w-4 h-4 mr-1" /> Generate 5 Skills</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {filteredSkills.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Layers className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No skills match your filters</p>
              {hasFilters && (
                <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedByIndustry)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([industry, domainMap]) => {
                const cfg = INDUSTRY_CONFIG[industry] || {
                  label: industry.replace(/_/g, " "),
                  icon: Building2,
                  color: "text-foreground",
                };
                const IndustryIcon = cfg.icon;
                const isCollapsed = collapsedIndustries.has(industry);
                const totalInIndustry = Object.values(domainMap).flat().length;

                return (
                  <div key={industry} data-testid={`section-industry-${industry}`}>
                    <button
                      className="flex items-center gap-2 w-full text-left mb-3 group"
                      onClick={() => toggleIndustry(industry)}
                      data-testid={`button-toggle-industry-${industry}`}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                      <IndustryIcon className={`w-5 h-5 ${cfg.color}`} />
                      <span className="font-semibold text-lg">{cfg.label}</span>
                      <Badge variant="secondary" className="text-[10px] ml-1">
                        {totalInIndustry}
                      </Badge>
                    </button>

                    {!isCollapsed && (
                      <div className="space-y-5 ml-6">
                        {Object.entries(domainMap)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([domain, domainSkills]) => (
                            <div key={domain}>
                              <div className="flex items-center gap-2 mb-2">
                                <Separator className="flex-1" />
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                  {domain}
                                </span>
                                <Badge variant="outline" className="text-[10px]">
                                  {domainSkills.length}
                                </Badge>
                                <Separator className="flex-1" />
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {domainSkills.map((skill) => (
                                  <SkillCard
                                    key={skill.id}
                                    skill={skill}
                                    isComparing={compareList.includes(skill.id)}
                                    onToggleCompare={() => toggleCompare(skill.id)}
                                    onSelect={() => {
                                      setSelectedSkill(skill);
                                      setSheetEnrichment(skill.aiEnrichment || null);
                                    }}
                                    isSelected={selectedSkill?.id === skill.id}
                                    onAiEnhance={() => handleAiEnhanceSkill(skill)}
                                    isEnhancing={aiEnhancingSkill === skill.id}
                                    hasEnrichment={!!skill.aiEnrichment}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        <SkillDetailSheet
          skill={selectedSkill}
          open={!!selectedSkill}
          onClose={() => { setSelectedSkill(null); setSheetEnrichment(null); }}
          enrichment={sheetEnrichment}
          onAiEnhance={() => selectedSkill && handleAiEnhanceSkill(selectedSkill)}
          isEnhancing={!!selectedSkill && aiEnhancingSkill === selectedSkill.id}
        />

        {showCompare && compareSkills.length >= 2 && (
          <ComparePanel
            skills={compareSkills}
            onClose={() => setShowCompare(false)}
            onRemove={(id) => toggleCompare(id)}
          />
        )}
      </div>
    </ScrollArea>
  );
}

function SkillCard({
  skill,
  isComparing,
  onToggleCompare,
  onSelect,
  isSelected,
  onAiEnhance,
  isEnhancing,
  hasEnrichment,
}: {
  skill: Skill;
  isComparing: boolean;
  onToggleCompare: () => void;
  onSelect: () => void;
  isSelected: boolean;
  onAiEnhance: () => void;
  isEnhancing: boolean;
  hasEnrichment: boolean;
}) {
  const deps = (skill.dependencies as string[] | null) || [];
  const tags = (skill.tags as string[] | null) || [];
  const compat = (skill.agentTypeCompatibility as string[] | null) || [];

  return (
    <Card
      className={`cursor-pointer hover-elevate transition-all ${isSelected ? "ring-2 ring-primary" : ""}`}
      onClick={onSelect}
      data-testid={`card-skill-${skill.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-tight">{skill.name}</CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            <Badge className={`text-[10px] no-default-hover-elevate no-default-active-elevate ${TRUST_TIER_STYLES[skill.trustTier] || ""}`}>
              {skill.trustTier === "platform-provided" ? "Platform" : skill.trustTier === "customer-created" ? "Custom" : "Market"}
            </Badge>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{skill.description}</p>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {skill.activationCount}
            </span>
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3" />
              <ScoreBar score={skill.performanceScore ?? 0} />
            </span>
          </div>
          <Badge variant="outline" className={`text-[10px] ${COMPLEXITY_STYLES[skill.complexity] || ""}`}>
            {skill.complexity}
          </Badge>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="outline" className="text-[10px]">
            v{skill.version}
          </Badge>
          {compat.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {t}
            </Badge>
          ))}
        </div>

        {tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {tags.slice(0, 4).map((t) => (
              <span key={t} className="text-[10px] text-muted-foreground">#{t}</span>
            ))}
            {tags.length > 4 && <span className="text-[10px] text-muted-foreground">+{tags.length - 4}</span>}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid={`text-deps-${skill.id}`}>
            {deps.length} {deps.length === 1 ? "dependency" : "dependencies"}
            {hasEnrichment && <Sparkles className="w-3 h-3 text-amber-500" data-testid={`icon-enriched-${skill.id}`} />}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={isEnhancing}
              onClick={(e) => {
                e.stopPropagation();
                onAiEnhance();
              }}
              data-testid={`button-enhance-${skill.id}`}
            >
              {isEnhancing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {hasEnrichment ? "Re-Enhance" : "AI Enhance"}
            </Button>
            <Button
              variant={isComparing ? "default" : "outline"}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCompare();
              }}
              data-testid={`button-compare-${skill.id}`}
            >
              {isComparing ? <CheckCircle2 className="w-3 h-3" /> : <BarChart3 className="w-3 h-3" />}
              {isComparing ? "Selected" : "Compare"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkillDetailSheet({
  skill,
  open,
  onClose,
  enrichment,
  onAiEnhance,
  isEnhancing,
}: {
  skill: Skill | null;
  open: boolean;
  onClose: () => void;
  enrichment: any;
  onAiEnhance: () => void;
  isEnhancing: boolean;
}) {
  if (!skill) return null;
  const deps = (skill.dependencies as string[] | null) || [];
  const tags = (skill.tags as string[] | null) || [];
  const compat = (skill.agentTypeCompatibility as string[] | null) || [];
  const cfg = INDUSTRY_CONFIG[skill.industry];
  const hasEnrichment = !!enrichment;

  const enrichSections = [
    { key: "implementationGuidance", label: "Implementation Guidance", icon: BookOpen },
    { key: "bestPractices", label: "Best Practices", icon: CheckCircle2 },
    { key: "riskFactors", label: "Risk Factors", icon: AlertTriangle },
    { key: "optimizationTips", label: "Optimization Tips", icon: Zap },
    { key: "relatedSkills", label: "Related Skills", icon: GitBranch },
    { key: "useCases", label: "Use Cases", icon: Target },
    { key: "complianceConsiderations", label: "Compliance", icon: Shield },
    { key: "performanceBenchmarks", label: "Performance Benchmarks", icon: Activity },
    { key: "integrationPoints", label: "Integration Points", icon: Link2 },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] p-0 flex flex-col" data-testid="sheet-skill-detail">
        <SheetHeader className="p-5 pb-3 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <SheetTitle className="text-lg leading-tight" data-testid="text-sheet-skill-name">{skill.name}</SheetTitle>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className={`text-[10px] no-default-hover-elevate no-default-active-elevate ${TRUST_TIER_STYLES[skill.trustTier] || ""}`}>
                  {skill.trustTier === "platform-provided" ? "Platform" : skill.trustTier === "customer-created" ? "Custom" : "Market"}
                </Badge>
                <Badge className={`text-[10px] no-default-hover-elevate no-default-active-elevate ${COMPLEXITY_STYLES[skill.complexity] || ""}`}>
                  {skill.complexity}
                </Badge>
                <Badge variant={skill.status === "active" ? "default" : "secondary"} className="text-[10px]">
                  {skill.status}
                </Badge>
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-5">
            <div data-testid="text-sheet-description">
              {hasEnrichment && enrichment?.enhancedDescription ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">AI-Improved Description</span>
                  </div>
                  <p className="text-sm text-muted-foreground" data-testid="text-enhanced-description">{skill.description}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{skill.description}</p>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Metadata</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <span className="text-muted-foreground">Industry</span>
                <span className="font-medium text-right">{cfg?.label || skill.industry}</span>
                <span className="text-muted-foreground">Domain</span>
                <span className="font-medium text-right">{skill.domain}</span>
                <span className="text-muted-foreground">Version</span>
                <span className="font-medium text-right">v{skill.version}</span>
                <span className="text-muted-foreground">Author</span>
                <span className="font-medium text-right text-xs">{skill.author}</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Performance</h4>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Quality Score</span>
                <span className="text-sm font-semibold">{(skill.performanceScore ?? 0).toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-visible">
                <div
                  className={`h-full rounded-full ${(skill.performanceScore ?? 0) >= 90 ? "bg-green-500" : (skill.performanceScore ?? 0) >= 80 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${skill.performanceScore ?? 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Active Agents</span>
                <span className="font-semibold flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  {skill.activationCount}
                </span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Agent Compatibility</h4>
              <div className="flex items-center gap-1.5 flex-wrap">
                {compat.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">
                    {t === "single" && <Activity className="w-3 h-3 mr-1" />}
                    {t === "team" && <Users className="w-3 h-3 mr-1" />}
                    {t === "remote" && <GitBranch className="w-3 h-3 mr-1" />}
                    {t}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dependencies ({deps.length})</h4>
              <div className="space-y-1">
                {deps.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded-md bg-muted/50">
                    <Plug className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="font-mono">{d}</span>
                  </div>
                ))}
              </div>
            </div>

            {tags.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tags</h4>
                    {hasEnrichment && enrichment?.suggestedTags && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                        <Sparkles className="w-2.5 h-2.5" />
                        AI
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {tags.map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">#{t}</Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  AI Analysis
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isEnhancing}
                  onClick={onAiEnhance}
                  data-testid="button-sheet-enhance"
                >
                  {isEnhancing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  {hasEnrichment ? "Re-Enhance" : "AI Enhance"}
                </Button>
              </div>

              {hasEnrichment ? (
                <div className="space-y-4" data-testid="panel-ai-enrichment">
                  {enrichment?.overview && (
                    <p className="text-sm text-muted-foreground" data-testid="text-enrichment-overview">{enrichment.overview}</p>
                  )}
                  {enrichment?.detailedAnalysis && (
                    <p className="text-sm text-muted-foreground" data-testid="text-enrichment-analysis">{enrichment.detailedAnalysis}</p>
                  )}
                  {enrichSections.map(({ key, label, icon: Icon }) => {
                    const data = enrichment?.[key];
                    if (!data) return null;
                    let items: string[];
                    if (Array.isArray(data)) {
                      items = data.map((d: unknown) => flattenValue(d));
                    } else if (typeof data === "string") {
                      items = [data];
                    } else if (typeof data === "object" && data !== null) {
                      items = Object.entries(data).map(([k, v]) => `${k}: ${flattenValue(v)}`);
                    } else {
                      items = [String(data)];
                    }
                    if (items.length === 0) return null;
                    return (
                      <div key={key} className="space-y-1.5" data-testid={`section-enrichment-${key}`}>
                        <div className="flex items-center gap-1.5 text-xs font-medium" data-testid={`text-section-label-${key}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {label}
                        </div>
                        <ul className="space-y-1 ml-1">
                          {items.map((item: string, i: number) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5" data-testid={`text-enrichment-item-${key}-${i}`}>
                              <span className="text-muted-foreground/50 mt-0.5 shrink-0">-</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground" data-testid="text-no-enrichment">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p>No AI analysis yet.</p>
                  <p className="text-xs mt-1">Click "AI Enhance" to generate a detailed analysis of this skill.</p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function ComparePanel({
  skills,
  onClose,
  onRemove,
}: {
  skills: Skill[];
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Card className="mt-4" data-testid="panel-skill-compare">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Skill Comparison
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-compare">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wider w-36">
                  Attribute
                </th>
                {skills.map((s) => (
                  <th key={s.id} className="text-left py-2 px-3 min-w-[200px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm">{s.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => onRemove(s.id)}
                        data-testid={`button-remove-compare-${s.id}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              <CompareRow label="Industry" values={skills.map((s) => INDUSTRY_CONFIG[s.industry]?.label || s.industry)} />
              <CompareRow label="Domain" values={skills.map((s) => s.domain)} />
              <CompareRow label="Version" values={skills.map((s) => `v${s.version}`)} />
              <CompareRow label="Author" values={skills.map((s) => s.author)} />
              <CompareRow label="Trust Tier" values={skills.map((s) => s.trustTier)} />
              <CompareRow label="Complexity" values={skills.map((s) => s.complexity)} />
              <CompareRow
                label="Performance"
                values={skills.map((s) => `${(s.performanceScore ?? 0).toFixed(1)}%`)}
                highlight
              />
              <CompareRow
                label="Active Agents"
                values={skills.map((s) => String(s.activationCount))}
                highlight
              />
              <CompareRow
                label="Agent Types"
                values={skills.map((s) => ((s.agentTypeCompatibility as string[] | null) || []).join(", "))}
              />
              <CompareRow
                label="Dependencies"
                values={skills.map((s) => ((s.dependencies as string[] | null) || []).join(", "))}
              />
              <CompareRow
                label="Tags"
                values={skills.map((s) => ((s.tags as string[] | null) || []).map((t) => `#${t}`).join(", "))}
              />
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CompareRow({ label, values, highlight }: { label: string; values: string[]; highlight?: boolean }) {
  const best = highlight
    ? values.reduce((max, v, i) => {
        const num = parseFloat(v);
        return num > parseFloat(values[max]) ? i : max;
      }, 0)
    : -1;

  return (
    <tr>
      <td className="py-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`py-2 px-3 text-sm ${highlight && i === best ? "font-semibold text-green-600 dark:text-green-400" : ""}`}>
          {v}
        </td>
      ))}
    </tr>
  );
}

function flattenValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return val.map(flattenValue).join(", ");
  if (typeof val === "object") {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${flattenValue(v)}`)
      .join("; ");
  }
  return String(val);
}

