import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Rocket,
  Plus,
  Search,
  ArrowRight,
  Shield,
  Clock,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Server,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Deployment, Agent } from "@shared/schema";

function EnvironmentPanel({ env, deployments }: { env: string; deployments: Deployment[] }) {
  const envDeploys = deployments.filter((d) => d.environment === env);
  const active = envDeploys.filter((d) => d.status === "deployed" || d.status === "active");

  const envColors: Record<string, string> = {
    staging: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    pilot: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    prod: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${envColors[env] || "bg-muted"}`}>
              <Server className="w-3.5 h-3.5" />
            </div>
            <CardTitle className="text-sm font-medium capitalize">{env}</CardTitle>
          </div>
          <Badge variant="outline" className="text-[11px]">{active.length} active</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {envDeploys.length > 0 ? envDeploys.slice(0, 5).map((dep) => (
          <div key={dep.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30 hover-elevate" data-testid={`deploy-env-row-${dep.id}`}>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium truncate">{dep.agentName || "Agent"}</span>
              <span className="text-[11px] text-muted-foreground">v{dep.version} | {dep.rolloutStrategy}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {dep.canaryPercent && dep.canaryPercent > 0 && (
                <Badge variant="outline" className="text-[10px]">{dep.canaryPercent}% canary</Badge>
              )}
              <StatusBadge status={dep.status} />
            </div>
          </div>
        )) : (
          <p className="text-xs text-muted-foreground py-4 text-center">No deployments</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Deployments() {
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();

  const { data: deployments, isLoading } = useQuery<Deployment[]>({
    queryKey: ["/api/deployments"],
  });
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/deployments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      setCreateOpen(false);
      toast({ title: "Deployment created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create deployment", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const allDeploys = deployments || [];
  const activeDeploys = allDeploys.filter((d) => d.status === "deployed" || d.status === "active").length;
  const pendingDeploys = allDeploys.filter((d) => d.status === "pending").length;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-deployments">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Deployments</h1>
          <p className="text-sm text-muted-foreground">
            Controlled rollout and release orchestration across environments
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-deployment">
              <Plus className="w-4 h-4 mr-1.5" /> New Release
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Release</DialogTitle>
            </DialogHeader>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const selectedAgent = agents?.find((a) => a.id === fd.get("agentId"));
                createMutation.mutate({
                  agentId: fd.get("agentId") as string,
                  agentName: selectedAgent?.name,
                  environment: fd.get("environment") as string,
                  version: fd.get("version") as string,
                  rolloutStrategy: fd.get("rolloutStrategy") as string,
                  canaryPercent: parseInt(fd.get("canaryPercent") as string) || 0,
                });
              }}
            >
              <div className="flex flex-col gap-2">
                <Label>Agent</Label>
                <select name="agentId" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" required>
                  <option value="">Select agent...</option>
                  {agents?.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} (v{a.currentVersion})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Target Environment</Label>
                  <select name="environment" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="staging">
                    <option value="staging">Staging</option>
                    <option value="pilot">Pilot</option>
                    <option value="prod">Production</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Rollout Strategy</Label>
                  <select name="rolloutStrategy" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="canary">
                    <option value="canary">Canary</option>
                    <option value="shadow">Shadow</option>
                    <option value="direct">Direct</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Version</Label>
                  <Input name="version" placeholder="1.0.0" defaultValue="1.0.0" data-testid="input-deploy-version" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Canary %</Label>
                  <Input name="canaryPercent" type="number" placeholder="10" defaultValue="10" data-testid="input-canary-percent" />
                </div>
              </div>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-deployment">
                {createMutation.isPending ? "Creating..." : "Create Release"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Releases" value={allDeploys.length} icon={Rocket} variant="default" testId="stat-total-deploys" />
        <StatCard title="Active" value={activeDeploys} icon={CheckCircle} variant="success" testId="stat-active-deploys" />
        <StatCard title="Pending" value={pendingDeploys} icon={Clock} variant="warning" testId="stat-pending-deploys" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <EnvironmentPanel env="staging" deployments={allDeploys} />
        <EnvironmentPanel env="pilot" deployments={allDeploys} />
        <EnvironmentPanel env="prod" deployments={allDeploys} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">All Releases</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {allDeploys.map((dep) => (
            <div key={dep.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30 hover-elevate" data-testid={`release-row-${dep.id}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-blue-500/10 shrink-0">
                  <Rocket className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{dep.agentName || "Agent"}</span>
                  <span className="text-[11px] text-muted-foreground">
                    v{dep.version} → {dep.environment} | {dep.rolloutStrategy}
                    {dep.canaryPercent ? ` (${dep.canaryPercent}% canary)` : ""}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {dep.approvedBy && (
                  <Badge variant="outline" className="text-[10px]">Approved by {dep.approvedBy}</Badge>
                )}
                <StatusBadge status={dep.status} />
              </div>
            </div>
          ))}
          {allDeploys.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No releases yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
