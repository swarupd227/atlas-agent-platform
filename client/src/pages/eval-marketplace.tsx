import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { MarketplaceAsset, MarketplaceInstallation } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Store,
  Search,
  CheckCircle,
  Download,
  Star,
  ListChecks,
  Database,
  MessageSquare,
  ClipboardList,
  Filter,
  Stethoscope,
  Landmark,
  Shield,
  ShoppingCart,
  Scale,
  Factory,
  Globe,
  ChevronRight,
  Package,
  ArrowRight,
  Sparkles,
} from "lucide-react";

const INDUSTRY_OPTIONS = [
  { value: "all", label: "All Industries", icon: Globe },
  { value: "healthcare", label: "Healthcare", icon: Stethoscope },
  { value: "finance", label: "Finance", icon: Landmark },
  { value: "insurance", label: "Insurance", icon: Shield },
  { value: "retail", label: "Retail", icon: ShoppingCart },
  { value: "legal", label: "Legal", icon: Scale },
  { value: "manufacturing", label: "Manufacturing", icon: Factory },
  { value: "public_sector", label: "Public Sector", icon: Landmark },
  { value: "cross_industry", label: "General / Cross-Industry", icon: Globe },
];

const ASSET_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "metric_pack", label: "Metric Pack", icon: ListChecks },
  { value: "dataset_template", label: "Dataset Template", icon: Database },
  { value: "persona_library", label: "Persona Library", icon: MessageSquare },
  { value: "report_template", label: "Report Template", icon: ClipboardList },
];

const AUTHOR_OPTIONS = [
  { value: "all", label: "All Authors" },
  { value: "nous", label: "Nous" },
  { value: "partner", label: "Partner" },
  { value: "tenant", label: "Tenant" },
];

function assetTypeIcon(type: string) {
  switch (type) {
    case "metric_pack": return ListChecks;
    case "dataset_template": return Database;
    case "persona_library": return MessageSquare;
    case "report_template": return ClipboardList;
    default: return Package;
  }
}

function assetTypeBadgeClass(type: string) {
  switch (type) {
    case "metric_pack": return "bg-violet-500/10 text-violet-700 dark:text-violet-400";
    case "dataset_template": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "persona_library": return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "report_template": return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    default: return "bg-muted/50 text-muted-foreground";
  }
}

function industryBadgeClass(industry: string) {
  switch (industry) {
    case "healthcare": return "bg-pink-500/10 text-pink-700 dark:text-pink-400";
    case "finance": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "insurance": return "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400";
    case "retail": return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
    case "legal": return "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400";
    case "manufacturing": return "bg-slate-500/10 text-slate-700 dark:text-slate-400";
    default: return "bg-muted/50 text-muted-foreground";
  }
}

function authorBadgeClass(author: string) {
  switch (author) {
    case "nous": return "bg-primary/10 text-primary";
    case "partner": return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    default: return "bg-muted/50 text-muted-foreground";
  }
}

function formatAssetType(type: string): string {
  return ASSET_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
}

function contentsCount(asset: MarketplaceAsset): number {
  const c = (asset.contentsJson ?? {}) as Record<string, unknown>;
  const arr = Object.values(c).find(v => Array.isArray(v)) as unknown[] | undefined;
  return arr?.length ?? 0;
}

export default function EvalMarketplace() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [selectedAsset, setSelectedAsset] = useState<MarketplaceAsset | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: assets, isLoading } = useQuery<MarketplaceAsset[]>({
    queryKey: ["/api/eval/marketplace"],
  });

  const { data: installations } = useQuery<MarketplaceInstallation[]>({
    queryKey: ["/api/eval/marketplace-installations"],
  });

  const installedIds = useMemo(() => new Set((installations ?? []).map(i => i.assetId)), [installations]);

  const install = useMutation({
    mutationFn: async (assetId: string) => {
      return apiRequest("POST", `/api/eval/marketplace/${assetId}/install`, {});
    },
    onSuccess: (_, assetId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/eval/marketplace-installations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/marketplace"] });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/metrics"] });
      toast({ title: "Installed", description: "Asset imported into your catalog" });
    },
    onError: (e: any) => {
      if (e.message?.includes("409") || e.message?.includes("Already")) {
        toast({ title: "Already installed", description: "This asset is already in your catalog", variant: "default" });
      } else {
        toast({ title: "Install failed", description: e.message, variant: "destructive" });
      }
    },
  });

  const filtered = useMemo(() => {
    let list = assets ?? [];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.title.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q) ||
        (a.contentsSummary ?? "").toLowerCase().includes(q)
      );
    }
    if (industryFilter !== "all") {
      list = list.filter(a => (a.industryTags ?? []).includes(industryFilter));
    }
    if (typeFilter !== "all") {
      list = list.filter(a => a.assetType === typeFilter);
    }
    if (authorFilter !== "all") {
      list = list.filter(a => a.author === authorFilter);
    }
    return list;
  }, [assets, search, industryFilter, typeFilter, authorFilter]);

  const stats = useMemo(() => {
    const all = assets ?? [];
    return {
      total: all.length,
      installed: installedIds.size,
      metricPacks: all.filter(a => a.assetType === "metric_pack").length,
      industries: new Set(all.flatMap(a => a.industryTags ?? [])).size,
    };
  }, [assets, installedIds]);

  function openDetail(asset: MarketplaceAsset) {
    setSelectedAsset(asset);
    setDrawerOpen(true);
  }

  const detailContents = useMemo(() => {
    if (!selectedAsset) return [];
    const c = (selectedAsset.contentsJson ?? {}) as Record<string, unknown>;
    return Object.entries(c).flatMap(([_key, arr]) => Array.isArray(arr) ? arr : []) as Record<string, unknown>[];
  }, [selectedAsset]);

  return (
    <div className="flex h-full">
      {/* Left facet rail */}
      <div className="w-56 border-r flex flex-col shrink-0 bg-sidebar">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            Filters
          </h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-5">
            {/* Industry */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Industry</p>
              <div className="space-y-0.5">
                {INDUSTRY_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      data-testid={`filter-industry-${opt.value}`}
                      onClick={() => setIndustryFilter(opt.value)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors ${industryFilter === opt.value ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/60"}`}
                    >
                      <Icon className="w-3 h-3 shrink-0" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Asset Type */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Asset Type</p>
              <div className="space-y-0.5">
                {ASSET_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    data-testid={`filter-type-${opt.value}`}
                    onClick={() => setTypeFilter(opt.value)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors ${typeFilter === opt.value ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/60"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Author */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Author</p>
              <div className="space-y-0.5">
                {AUTHOR_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    data-testid={`filter-author-${opt.value}`}
                    onClick={() => setAuthorFilter(opt.value)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors ${authorFilter === opt.value ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/60"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2" data-testid="heading-eval-marketplace">
                <Store className="w-5 h-5 text-primary" />
                Eval Marketplace
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">Nous-curated metric packs, dataset templates, persona libraries, and report templates</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="font-semibold text-lg">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Assets</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg text-emerald-600 dark:text-emerald-400">{stats.installed}</div>
                <div className="text-xs text-muted-foreground">Installed</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg">{stats.industries}</div>
                <div className="text-xs text-muted-foreground">Industries</div>
              </div>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              data-testid="input-marketplace-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              placeholder="Search assets by name, description, or contents..."
            />
          </div>
        </div>

        {/* Asset grid */}
        <ScrollArea className="flex-1">
          <div className="p-5">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-48 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Store className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No assets match your filters</p>
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setIndustryFilter("all"); setTypeFilter("all"); setAuthorFilter("all"); }}>
                  Clear filters
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(asset => {
                  const Icon = assetTypeIcon(asset.assetType);
                  const isInstalled = installedIds.has(asset.id);
                  const count = contentsCount(asset);
                  return (
                    <Card
                      key={asset.id}
                      data-testid={`card-asset-${asset.id}`}
                      className="flex flex-col hover:shadow-md transition-shadow cursor-pointer group"
                      onClick={() => openDetail(asset)}
                    >
                      <CardContent className="p-4 flex-1 flex flex-col">
                        <div className="flex items-start gap-3 mb-3">
                          <div className={`p-2 rounded-lg ${assetTypeBadgeClass(asset.assetType)} bg-opacity-20`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${assetTypeBadgeClass(asset.assetType)}`}>
                                {formatAssetType(asset.assetType)}
                              </Badge>
                              <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${authorBadgeClass(asset.author)}`}>
                                {asset.authorDisplayName}
                              </Badge>
                              {isInstalled && (
                                <Badge className="text-[10px] py-0 px-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" data-testid={`badge-installed-${asset.id}`}>
                                  <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                                  Installed
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <h3 className="text-sm font-semibold mb-1 leading-snug group-hover:text-primary transition-colors">{asset.title}</h3>
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2 flex-1">{asset.description}</p>

                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          {(asset.industryTags ?? []).map(tag => (
                            <Badge key={tag} variant="outline" className={`text-[10px] py-0 px-1.5 ${industryBadgeClass(tag)}`}>
                              {tag}
                            </Badge>
                          ))}
                        </div>

                        {asset.contentsSummary && (
                          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded px-2 py-1 mb-3 line-clamp-1">
                            {count > 0 && <span className="font-medium">{count} items · </span>}
                            {asset.contentsSummary}
                          </p>
                        )}

                        <div className="flex items-center justify-between mt-auto pt-2 border-t">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Download className="w-3 h-3" />
                            <span>{(asset.installedCount ?? 0).toLocaleString()} installs</span>
                            <span>·</span>
                            <span>v{asset.version}</span>
                          </div>
                          <Button
                            size="sm"
                            variant={isInstalled ? "outline" : "default"}
                            className="text-xs h-7"
                            data-testid={`button-install-${asset.id}`}
                            onClick={e => { e.stopPropagation(); if (!isInstalled) install.mutate(asset.id); }}
                            disabled={isInstalled || install.isPending}
                          >
                            {isInstalled ? (
                              <><CheckCircle className="w-3 h-3 mr-1" />Installed</>
                            ) : (
                              <><Download className="w-3 h-3 mr-1" />Install</>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Asset Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedAsset && (
            <>
              <SheetHeader className="pb-4 border-b">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${assetTypeBadgeClass(selectedAsset.assetType)}`}>
                    {formatAssetType(selectedAsset.assetType)}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${authorBadgeClass(selectedAsset.author)}`}>
                    {selectedAsset.authorDisplayName}
                  </Badge>
                  <span className="text-xs text-muted-foreground">v{selectedAsset.version}</span>
                  {installedIds.has(selectedAsset.id) && (
                    <Badge className="text-[10px] py-0 px-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
                      <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                      Installed
                    </Badge>
                  )}
                </div>
                <SheetTitle className="text-base leading-snug">{selectedAsset.title}</SheetTitle>
              </SheetHeader>

              <div className="py-4 space-y-5">
                <div>
                  <p className="text-sm text-muted-foreground">{selectedAsset.description}</p>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Download className="w-4 h-4" />
                    {(selectedAsset.installedCount ?? 0).toLocaleString()} installs
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(selectedAsset.industryTags ?? []).map(tag => (
                      <Badge key={tag} variant="outline" className={`text-[10px] py-0 px-1.5 ${industryBadgeClass(tag)}`}>
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                {selectedAsset.samplePreview && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sample Preview</h4>
                    <div className="bg-muted/40 rounded-md px-3 py-2.5 text-xs text-muted-foreground italic">
                      {selectedAsset.samplePreview}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Included Contents ({detailContents.length} items)
                  </h4>
                  <div className="space-y-2">
                    {detailContents.map((item: any, i) => (
                      <div key={i} className="flex items-start gap-2.5 px-3 py-2 rounded-md bg-muted/30 border">
                        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{item.name}</span>
                            {item.category && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1">{item.category}</Badge>
                            )}
                            {item.threshold != null && (
                              <span className="text-xs text-muted-foreground">≥{item.threshold}</span>
                            )}
                          </div>
                          {item.criteria && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.criteria}</p>
                          )}
                          {item.evaluationParams && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {item.evaluationParams.map((p: string) => (
                                <span key={p} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{p}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedAsset.contentsSummary && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contents Summary</h4>
                    <p className="text-xs text-muted-foreground">{selectedAsset.contentsSummary}</p>
                  </div>
                )}

                <div className="pt-2 border-t">
                  <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-3 mb-3">
                    {selectedAsset.assetType === "metric_pack" && "Metrics will be imported into your Metric Library with a \"marketplace\" provenance badge."}
                    {selectedAsset.assetType === "persona_library" && "Personas will be available in your Conversation Simulator."}
                    {selectedAsset.assetType === "dataset_template" && "A new dataset will be created in Dataset Manager with the template's goldens."}
                    {selectedAsset.assetType === "report_template" && "Template will be registered in Compliance Reports."}
                  </div>
                  <Button
                    className="w-full"
                    size="default"
                    data-testid="button-install-detail"
                    disabled={installedIds.has(selectedAsset.id) || install.isPending}
                    onClick={() => install.mutate(selectedAsset.id)}
                  >
                    {installedIds.has(selectedAsset.id) ? (
                      <><CheckCircle className="w-4 h-4 mr-2" />Installed in Your Catalog</>
                    ) : install.isPending ? (
                      "Installing..."
                    ) : (
                      <><Download className="w-4 h-4 mr-2" />Install into Catalog</>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
