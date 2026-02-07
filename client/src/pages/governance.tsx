import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Shield,
  Plus,
  Search,
  FileCode,
  Lock,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Policy, AuditEvent } from "@shared/schema";

const domainIcons: Record<string, typeof Shield> = {
  data_handling: Lock,
  tool_permissions: FileCode,
  logging: Eye,
  allowed_actions: CheckCircle,
  content_boundaries: AlertTriangle,
};

export default function Governance() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();

  const { data: policies, isLoading } = useQuery<Policy[]>({
    queryKey: ["/api/policies"],
  });
  const { data: auditEvents } = useQuery<AuditEvent[]>({
    queryKey: ["/api/audit-events"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/policies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      setCreateOpen(false);
      toast({ title: "Policy created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create policy", description: err.message, variant: "destructive" });
    },
  });

  const filtered = policies?.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
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

  const activePolicies = policies?.filter((p) => p.status === "active")?.length || 0;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-governance">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Governance</h1>
          <p className="text-sm text-muted-foreground">
            Policy-as-code, compliance controls, and audit trail
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-policy">
              <Plus className="w-4 h-4 mr-1.5" /> New Policy
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Policy</DialogTitle>
            </DialogHeader>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                createMutation.mutate({
                  name: fd.get("name") as string,
                  domain: fd.get("domain") as string,
                  description: fd.get("description") as string,
                  scopeType: fd.get("scopeType") as string,
                });
              }}
            >
              <div className="flex flex-col gap-2">
                <Label>Policy Name</Label>
                <Input name="name" required placeholder="e.g., No PII in Response" data-testid="input-policy-name" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Description</Label>
                <Textarea name="description" placeholder="What does this policy enforce?" data-testid="input-policy-description" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Domain</Label>
                  <select name="domain" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="data_handling">
                    <option value="data_handling">Data Handling</option>
                    <option value="tool_permissions">Tool Permissions</option>
                    <option value="logging">Logging/Redaction</option>
                    <option value="allowed_actions">Allowed Actions</option>
                    <option value="content_boundaries">Content Boundaries</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Scope</Label>
                  <select name="scopeType" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="org">
                    <option value="org">Organization</option>
                    <option value="outcome">Outcome</option>
                    <option value="agent">Agent</option>
                    <option value="env">Environment</option>
                  </select>
                </div>
              </div>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-policy">
                {createMutation.isPending ? "Creating..." : "Create Policy"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Active Policies" value={activePolicies} icon={Shield} variant="default" testId="stat-active-policies" />
        <StatCard title="Audit Events" value={auditEvents?.length || 0} icon={Eye} variant="default" testId="stat-audit-events" />
        <StatCard title="Domains Covered" value={new Set(policies?.map((p) => p.domain)).size} icon={Lock} variant="success" testId="stat-domains" />
      </div>

      <Tabs defaultValue="policies" className="flex flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="policies" data-testid="tab-policies">Policy Library</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="mt-0 flex flex-col gap-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search policies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-policies"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered?.map((policy) => {
              const DomainIcon = domainIcons[policy.domain] || Shield;
              return (
                <Card key={policy.id} className="hover-elevate" data-testid={`card-policy-${policy.id}`}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <DomainIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-semibold truncate">{policy.name}</span>
                          <span className="text-[11px] text-muted-foreground capitalize">{policy.domain.replace(/_/g, " ")} | v{policy.version}</span>
                        </div>
                      </div>
                      <StatusBadge status={policy.status} />
                    </div>
                    {policy.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{policy.description}</p>
                    )}
                    <div className="flex items-center gap-2 pt-1 border-t flex-wrap">
                      <Badge variant="outline" className="text-[10px] capitalize">{policy.scopeType}</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{policy.domain.replace(/_/g, " ")}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filtered?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Shield className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No policies found</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit" className="mt-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Audit Trail</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {auditEvents?.slice(0, 20).map((event) => (
                <div key={event.id} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`audit-row-${event.id}`}>
                  <div className="flex items-center justify-center w-2 h-2 rounded-full bg-primary shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-medium">{event.action}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {event.actorType}:{event.actorId} on {event.objectType}:{event.objectId}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {event.createdAt ? new Date(event.createdAt).toLocaleDateString() : ""}
                  </span>
                </div>
              ))}
              {(!auditEvents || auditEvents.length === 0) && (
                <p className="text-sm text-muted-foreground py-8 text-center">No audit events recorded</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
