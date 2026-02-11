import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, Link } from "wouter";
import type { AgentTemplate } from "@shared/schema";
import { useIndustry } from "@/components/industry-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Headphones,
  FileText,
  TrendingUp,
  Shield,
  BookOpen,
  Scale,
  Bot,
  Search,
  ArrowRight,
  Layers,
  Sparkles,
  AlertTriangle,
  Activity,
  BarChart3,
  Brain,
  Briefcase,
  Calculator,
  Camera,
  CheckCircle,
  ClipboardList,
  Clock,
  Cloud,
  Code,
  Cog,
  CreditCard,
  Database,
  Eye,
  Factory,
  Film,
  FlaskConical,
  FolderSearch,
  GraduationCap,
  Heart,
  HelpCircle,
  Image,
  LineChart,
  List,
  Lock,
  Mail,
  Map,
  MessageSquare,
  Microscope,
  Monitor,
  Package,
  Pill,
  Receipt,
  RefreshCw,
  Rocket,
  Route,
  ScanLine,
  ScrollText,
  Server,
  ShieldCheck,
  ShoppingCart,
  Stethoscope,
  Tag,
  Target,
  TestTube,
  ThumbsUp,
  Truck,
  UserCheck,
  Users,
  Wrench,
  Zap,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  headphones: Headphones,
  "file-text": FileText,
  "trending-up": TrendingUp,
  shield: Shield,
  "book-open": BookOpen,
  scale: Scale,
  bot: Bot,
  "alert-triangle": AlertTriangle,
  activity: Activity,
  "bar-chart": BarChart3,
  brain: Brain,
  briefcase: Briefcase,
  calculator: Calculator,
  camera: Camera,
  "check-circle": CheckCircle,
  "clipboard-list": ClipboardList,
  clock: Clock,
  cloud: Cloud,
  code: Code,
  cog: Cog,
  "credit-card": CreditCard,
  database: Database,
  eye: Eye,
  factory: Factory,
  film: Film,
  flask: FlaskConical,
  "folder-search": FolderSearch,
  "graduation-cap": GraduationCap,
  heart: Heart,
  "help-circle": HelpCircle,
  image: Image,
  "line-chart": LineChart,
  list: List,
  lock: Lock,
  mail: Mail,
  map: Map,
  "message-square": MessageSquare,
  microscope: Microscope,
  monitor: Monitor,
  package: Package,
  pill: Pill,
  receipt: Receipt,
  "refresh-cw": RefreshCw,
  rocket: Rocket,
  route: Route,
  "scan-line": ScanLine,
  "scroll-text": ScrollText,
  server: Server,
  "shield-check": ShieldCheck,
  "shopping-cart": ShoppingCart,
  stethoscope: Stethoscope,
  tag: Tag,
  target: Target,
  "test-tube": TestTube,
  "thumbs-up": ThumbsUp,
  truck: Truck,
  "user-check": UserCheck,
  users: Users,
  wrench: Wrench,
  zap: Zap,
};

const categoryLabels: Record<string, string> = {
  support: "Customer Support",
  data_processing: "Data Processing",
  sales: "Sales & Marketing",
  trust_safety: "Trust & Safety",
  knowledge_management: "Knowledge Management",
  governance: "Governance & Compliance",
  operations: "Operations",
  analytics: "Analytics & Insights",
  clinical: "Clinical & Care",
  research: "Research & Development",
  engineering: "Engineering",
  creative: "Creative & Content",
  risk: "Risk & Compliance",
  supply_chain: "Supply Chain",
  quality: "Quality Assurance",
  general: "General",
};

const industryLabels: Record<string, string> = {
  cross_industry: "Cross-Industry",
  technology: "Technology",
  financial_services: "Financial Services",
  healthcare: "Healthcare",
  manufacturing: "Manufacturing",
  retail: "Retail & E-Commerce",
  education: "Education",
  pharma: "Pharmaceuticals",
  media_entertainment: "Media & Entertainment",
};

const complexityColors: Record<string, string> = {
  low: "text-green-600 dark:text-green-400",
  medium: "text-amber-600 dark:text-amber-400",
  high: "text-red-600 dark:text-red-400",
};

export default function Templates() {
  const { industry } = useIndustry();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [industryFilter, setIndustryFilter] = useState(() => {
    if (industry && industry.id !== "custom") return industry.id;
    return "all";
  });
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [, navigate] = useLocation();

  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<AgentTemplate | null>(null);

  const { data: templates, isLoading } = useQuery<AgentTemplate[]>({
    queryKey: ["/api/agent-templates"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/agent-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-templates"] });
      toast({ title: "Template deleted" });
      setDeleteTarget(null);
      if (selectedTemplate?.id === deleteTarget?.id) setSelectedTemplate(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete template", description: err.message, variant: "destructive" });
    },
  });

  const filteredTemplates = templates?.filter((t) => {
    const matchesSearch =
      !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.tags || []).some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter;
    const matchesIndustry = industryFilter === "all" || t.industry === industryFilter;
    return matchesSearch && matchesCategory && matchesIndustry;
  });

  const recommendedTemplates = templates?.filter((t) => {
    if (!industry || industry.id === "custom") return false;
    return t.industry === industry.id || t.industry === "cross_industry";
  }) || [];

  const showRecommended = industry && industry.id !== "custom" && recommendedTemplates.length > 0 && industryFilter === "all" && !searchQuery;

  const categories = Array.from(new Set(templates?.map((t) => t.category) || []));
  const industries = Array.from(new Set(templates?.map((t) => t.industry || "cross_industry") || []));

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-templates">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agent Templates</h1>
          <p className="text-sm text-muted-foreground">
            {industry && industry.id !== "custom" ? `Templates for ${industry.label} and cross-industry use` : "Industry-wide pre-built agent configurations ready to deploy"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {templates?.length || 0} templates
          </Badge>
          <Button size="sm" onClick={() => navigate("/templates/new")} data-testid="button-new-template">
            <Plus className="w-4 h-4 mr-1" />
            New Template
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search templates, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-templates"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48" data-testid="select-category-filter">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {categoryLabels[c] || c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={industryFilter} onValueChange={setIndustryFilter}>
          <SelectTrigger className="w-48" data-testid="select-industry-filter">
            <SelectValue placeholder="All Industries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Industries</SelectItem>
            {industries.map((i) => (
              <SelectItem key={i} value={i}>
                {industryLabels[i] || i}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {industry && industry.id !== "custom" && industryFilter !== industry.id && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIndustryFilter(industry.id)}
            data-testid="button-filter-my-industry"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Show {industry.shortLabel} only
          </Button>
        )}
      </div>

      {showRecommended && (
        <div className="space-y-3" data-testid="section-recommended-templates">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Recommended for {industry?.label}</h2>
            <Badge variant="secondary" className="text-[10px]">{recommendedTemplates.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {recommendedTemplates.slice(0, 4).map((template) => {
              const IconComponent = iconMap[template.icon || "bot"] || Bot;
              return (
                <Card
                  key={template.id}
                  className="hover-elevate cursor-pointer ring-1 ring-primary/20"
                  onClick={() => setSelectedTemplate(template)}
                  data-testid={`recommended-template-${template.id}`}
                >
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <IconComponent className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-xs leading-tight">{template.name}</h3>
                        <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                          {template.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {categoryLabels[template.category] || template.category}
                      </Badge>
                      <Badge variant="default" className="text-[10px]">
                        {template.industry === industry?.id ? industry.shortLabel : "Cross-Industry"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${selectedTemplate ? "lg:col-span-2" : "lg:col-span-3"}`}>
          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <div className="animate-pulse flex flex-col gap-3">
                      <div className="flex gap-3">
                        <div className="w-11 h-11 rounded-md bg-muted" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-muted rounded w-3/4" />
                          <div className="h-3 bg-muted rounded w-1/2" />
                        </div>
                      </div>
                      <div className="h-3 bg-muted rounded w-full" />
                      <div className="h-8 bg-muted rounded" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!isLoading && filteredTemplates?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Layers className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No templates match your filters</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setCategoryFilter("all");
                  setIndustryFilter("all");
                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            </div>
          )}

          <div className={`grid grid-cols-1 ${selectedTemplate ? "md:grid-cols-1 xl:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"} gap-4`}>
            {filteredTemplates?.map((template) => {
              const IconComponent = iconMap[template.icon || "bot"] || Bot;
              const isSelected = selectedTemplate?.id === template.id;
              return (
                <Card
                  key={template.id}
                  className={`hover-elevate cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setSelectedTemplate(isSelected ? null : template)}
                  data-testid={`template-card-${template.id}`}
                >
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <IconComponent className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-sm">{template.name}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {template.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {categoryLabels[template.category] || template.category}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {industryLabels[template.industry || "cross_industry"] || template.industry}
                      </Badge>
                      <span className={`text-[10px] font-medium ml-auto ${complexityColors[template.complexity || "medium"]}`}>
                        {(template.complexity || "medium").toUpperCase()}
                      </span>
                    </div>
                    {(template.tags || []).length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {(template.tags || []).slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                        {(template.tags || []).length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{(template.tags || []).length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-1 border-t pt-2 mt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs flex-1"
                        onClick={(e) => { e.stopPropagation(); navigate(`/templates/${template.id}`); }}
                        data-testid={`button-view-template-${template.id}`}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs flex-1"
                        onClick={(e) => { e.stopPropagation(); navigate(`/templates/${template.id}?edit=true`); }}
                        data-testid={`button-edit-template-${template.id}`}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs flex-1 text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(template); }}
                        data-testid={`button-delete-template-${template.id}`}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {selectedTemplate && (
          <div className="lg:col-span-1">
            <TemplateDetail
              template={selectedTemplate}
              onUseTemplate={() => navigate(`/agents/wizard?templateId=${selectedTemplate.id}`)}
              onClose={() => setSelectedTemplate(null)}
            />
          </div>
        )}
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateDetail({
  template,
  onUseTemplate,
  onClose,
}: {
  template: AgentTemplate;
  onUseTemplate: () => void;
  onClose: () => void;
}) {
  const IconComponent = iconMap[template.icon || "bot"] || Bot;
  const tools = Array.isArray(template.toolsConfig) ? (template.toolsConfig as { name: string; description: string }[]) : [];
  const permissions = template.permissionsConfig as { dataAccess?: string[]; apiAccess?: string[]; writeAccess?: string[] } | null;
  const workflow = template.blueprintJson as { nodes?: { id: string; type: string; label: string }[] } | null;
  const policyBindings = Array.isArray(template.policyBindings) ? (template.policyBindings as { policyName: string; enforcement: string }[]) : [];

  return (
    <div className="sticky top-4 flex flex-col gap-4">
      <Card>
        <CardContent className="p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <IconComponent className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-base" data-testid="text-template-detail-name">{template.name}</h2>
              <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px]">
              {categoryLabels[template.category] || template.category}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {industryLabels[template.industry || "cross_industry"] || template.industry}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {(template.complexity || "medium").toUpperCase()}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {template.defaultRiskTier} Risk
            </Badge>
          </div>

          {(template.tags || []).length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {(template.tags || []).map((tag) => (
                <span key={tag} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="border-t pt-3 flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Model</h3>
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{template.modelProvider} / {template.modelName}</span>
            </div>
          </div>

          {tools.length > 0 && (
            <div className="border-t pt-3 flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tools ({tools.length})
              </h3>
              <div className="flex flex-col gap-1.5">
                {tools.map((tool) => (
                  <div key={tool.name} className="text-sm">
                    <span className="font-medium">{tool.name}</span>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {workflow?.nodes && workflow.nodes.length > 0 && (
            <div className="border-t pt-3 flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Workflow ({workflow.nodes.length} steps)
              </h3>
              <div className="flex flex-col gap-1">
                {workflow.nodes.map((node, idx) => (
                  <div key={node.id} className="flex items-center gap-2 text-sm">
                    <span className="text-[10px] text-muted-foreground w-4 shrink-0">{idx + 1}.</span>
                    <Badge variant="outline" className="text-[9px] shrink-0">{node.type}</Badge>
                    <span className="text-muted-foreground">{node.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {permissions && (
            <div className="border-t pt-3 flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Permissions</h3>
              {(permissions.dataAccess || []).length > 0 && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Data: </span>
                  <span>{(permissions.dataAccess || []).join(", ")}</span>
                </div>
              )}
              {(permissions.apiAccess || []).length > 0 && (
                <div className="text-xs">
                  <span className="text-muted-foreground">API: </span>
                  <span>{(permissions.apiAccess || []).join(", ")}</span>
                </div>
              )}
              {(permissions.writeAccess || []).length > 0 && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Write: </span>
                  <span>{(permissions.writeAccess || []).join(", ")}</span>
                </div>
              )}
            </div>
          )}

          {policyBindings.length > 0 && (
            <div className="border-t pt-3 flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Policy Bindings</h3>
              {policyBindings.map((p) => (
                <div key={p.policyName} className="flex items-center gap-2 text-xs">
                  <span>{p.policyName}</span>
                  <Badge variant={p.enforcement === "hard" ? "destructive" : "secondary"} className="text-[9px]">
                    {p.enforcement}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4 flex flex-col gap-2">
            <Button
              onClick={onUseTemplate}
              className="w-full"
              data-testid="button-use-template"
            >
              Use This Template
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              className="w-full"
              data-testid="button-close-detail"
            >
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
