import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Target,
  Plus,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Search,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { OutcomeContract, KpiDefinition } from "@shared/schema";

export default function Outcomes() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();

  const { data: outcomes, isLoading } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
  });
  const { data: kpis } = useQuery<KpiDefinition[]>({
    queryKey: ["/api/kpis"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; riskTier: string; pricingModel: string; pricePerUnit: number }) => {
      const res = await apiRequest("POST", "/api/outcomes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      setCreateOpen(false);
      toast({ title: "Outcome contract created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create outcome", description: err.message, variant: "destructive" });
    },
  });

  const filtered = outcomes?.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = outcomes?.reduce((sum, o) => sum + (o.pricePerUnit || 0) * 500, 0) || 0;
  const activeContracts = outcomes?.filter((o) => o.status === "active")?.length || 0;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-outcomes">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Outcome Contracts</h1>
          <p className="text-sm text-muted-foreground">
            Define, track, and deliver measurable business outcomes
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-outcome">
              <Plus className="w-4 h-4 mr-1.5" /> New Contract
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Outcome Contract</DialogTitle>
            </DialogHeader>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                createMutation.mutate({
                  name: fd.get("name") as string,
                  description: fd.get("description") as string,
                  riskTier: fd.get("riskTier") as string,
                  pricingModel: fd.get("pricingModel") as string,
                  pricePerUnit: parseFloat(fd.get("pricePerUnit") as string) || 0,
                });
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Contract Name</Label>
                <Input id="name" name="name" required placeholder="e.g., Reduce Support Load" data-testid="input-outcome-name" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" placeholder="Describe the business outcome..." data-testid="input-outcome-description" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Risk Tier</Label>
                  <select name="riskTier" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="MEDIUM">
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Pricing Model</Label>
                  <select name="pricingModel" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="PER_OUTCOME_EVENT">
                    <option value="PER_OUTCOME_EVENT">Per Outcome Event</option>
                    <option value="FIXED_MONTHLY">Fixed Monthly</option>
                    <option value="TIERED">Tiered</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pricePerUnit">Price per Unit ($)</Label>
                <Input id="pricePerUnit" name="pricePerUnit" type="number" step="0.01" placeholder="2.50" data-testid="input-outcome-price" />
              </div>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-outcome">
                {createMutation.isPending ? "Creating..." : "Create Contract"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Active Contracts"
          value={activeContracts}
          icon={Target}
          variant="default"
          testId="stat-active-contracts"
        />
        <StatCard
          title="Projected Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          icon={DollarSign}
          trend="up"
          trendValue="8.3%"
          variant="success"
          testId="stat-projected-revenue"
        />
        <StatCard
          title="KPIs Tracked"
          value={kpis?.length || 0}
          icon={BarChart3}
          subtitle="across all contracts"
          variant="default"
          testId="stat-kpis-tracked"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search contracts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-outcomes"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered?.map((outcome) => {
          const outcomeKpis = kpis?.filter((k) => k.outcomeId === outcome.id) || [];
          const avgProgress = outcomeKpis.length
            ? outcomeKpis.reduce((sum, k) => sum + (k.target ? ((k.currentValue || 0) / k.target) * 100 : 0), 0) / outcomeKpis.length
            : 0;
          return (
            <Card key={outcome.id} className="hover-elevate cursor-pointer" data-testid={`card-outcome-${outcome.id}`}>
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 shrink-0">
                      <Target className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold truncate">{outcome.name}</span>
                      <span className="text-[11px] text-muted-foreground">v{outcome.version}</span>
                    </div>
                  </div>
                  <StatusBadge status={outcome.riskTier} />
                </div>
                {outcome.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{outcome.description}</p>
                )}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Overall Progress</span>
                    <span className="text-xs font-medium">{Math.round(avgProgress)}%</span>
                  </div>
                  <Progress value={avgProgress} className="h-1.5" />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t">
                  <div className="flex items-center gap-1">
                    <BarChart3 className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">{outcomeKpis.length} KPIs</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">
                      ${outcome.pricePerUnit}/unit
                    </span>
                  </div>
                  <StatusBadge status={outcome.status} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Target className="w-10 h-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No outcome contracts found</p>
        </div>
      )}
    </div>
  );
}
