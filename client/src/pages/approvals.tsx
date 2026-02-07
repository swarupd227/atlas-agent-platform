import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  AlertTriangle,
  Eye,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Approval } from "@shared/schema";

export default function Approvals() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const { data: approvals, isLoading } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });

  const decideMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/approvals/${id}`, { status, decidedBy: "Expert Validator" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: "Approval updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update approval", description: err.message, variant: "destructive" });
    },
  });

  const filtered = approvals?.filter((a) =>
    (a.objectName || a.type || "").toLowerCase().includes(search.toLowerCase())
  );

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

  const pending = approvals?.filter((a) => a.status === "pending")?.length || 0;
  const approved = approvals?.filter((a) => a.status === "approved")?.length || 0;
  const rejected = approvals?.filter((a) => a.status === "rejected")?.length || 0;

  const riskColors: Record<string, string> = {
    low: "bg-emerald-500/10",
    medium: "bg-amber-500/10",
    high: "bg-red-500/10",
  };

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-approvals">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Approval Queue</h1>
        <p className="text-sm text-muted-foreground">
          Expert validation console - the 20% supervision layer
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Pending" value={pending} icon={Clock} variant="warning" testId="stat-pending-approvals" />
        <StatCard title="Approved" value={approved} icon={CheckCircle} variant="success" testId="stat-approved" />
        <StatCard title="Rejected" value={rejected} icon={XCircle} variant="danger" testId="stat-rejected" />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search approvals..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-approvals"
        />
      </div>

      <Tabs defaultValue="pending" className="flex flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending {pending > 0 && <Badge variant="outline" className="ml-1.5 text-[10px]">{pending}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-0 flex flex-col gap-3">
          {filtered?.filter((a) => a.status === "pending").map((approval) => {
            const riskLevel = (approval.riskScore || 0) > 7 ? "high" : (approval.riskScore || 0) > 4 ? "medium" : "low";
            return (
              <Card key={approval.id} data-testid={`card-approval-${approval.id}`}>
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex items-center justify-center w-9 h-9 rounded-md shrink-0 ${riskColors[riskLevel]}`}>
                        <Shield className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold truncate">{approval.objectName || approval.type}</span>
                        <span className="text-xs text-muted-foreground">
                          {approval.type} | {approval.objectType} | Risk: {approval.riskScore}/10
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={approval.status} />
                  </div>
                  {approval.description && (
                    <p className="text-xs text-muted-foreground">{approval.description}</p>
                  )}
                  <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                    <span className="text-[11px] text-muted-foreground">Requested by {approval.requestedBy || "System"}</span>
                    <div className="flex-1" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => decideMutation.mutate({ id: approval.id, status: "rejected" })}
                      disabled={decideMutation.isPending}
                      data-testid={`button-reject-${approval.id}`}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => decideMutation.mutate({ id: approval.id, status: "approved" })}
                      disabled={decideMutation.isPending}
                      data-testid={`button-approve-${approval.id}`}
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered?.filter((a) => a.status === "pending").length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <CheckCircle className="w-10 h-10 text-emerald-500/50" />
              <p className="text-sm text-muted-foreground">All clear - no pending approvals</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-0 flex flex-col gap-2">
          {filtered?.map((approval) => (
            <div key={approval.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30 hover-elevate" data-testid={`approval-all-row-${approval.id}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium truncate">{approval.objectName || approval.type}</span>
                  <span className="text-[11px] text-muted-foreground">{approval.type} | Risk: {approval.riskScore}/10</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {approval.decidedBy && (
                  <span className="text-[11px] text-muted-foreground">by {approval.decidedBy}</span>
                )}
                <StatusBadge status={approval.status} />
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
