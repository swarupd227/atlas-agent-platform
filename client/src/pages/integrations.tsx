import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Database, BarChart3, GitBranch, Ticket, MessageSquare, Plug, Plus, Pencil, Trash2, Send, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LoggingIntegration } from "@shared/schema";

interface IntegrationCategory {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  count: number;
}

const integrationCategories: IntegrationCategory[] = [
  {
    id: "llm-providers",
    name: "LLM Providers",
    description: "Connect large language model providers for agent reasoning and generation capabilities",
    icon: Brain,
    count: 4,
  },
  {
    id: "vector-databases",
    name: "Vector Databases",
    description: "Integrate vector storage solutions for semantic search and retrieval-augmented generation",
    icon: Database,
    count: 3,
  },
  {
    id: "monitoring",
    name: "Monitoring",
    description: "Set up observability and monitoring tools to track agent performance and health",
    icon: BarChart3,
    count: 5,
  },
  {
    id: "ci-cd",
    name: "CI/CD",
    description: "Configure continuous integration and deployment pipelines for agent releases",
    icon: GitBranch,
    count: 3,
  },
  {
    id: "ticketing",
    name: "Ticketing",
    description: "Connect ticketing systems for issue tracking and workflow automation",
    icon: Ticket,
    count: 4,
  },
  {
    id: "communication",
    name: "Communication",
    description: "Integrate messaging and communication platforms for agent interactions",
    icon: MessageSquare,
    count: 6,
  },
];

const PROVIDERS = ["datadog", "splunk", "elastic", "webhook", "syslog"] as const;
const EVENT_TYPES = ["audit_events", "traces", "agent_actions", "policy_violations", "deployments", "eval_results"] as const;

interface LoggingFormData {
  name: string;
  provider: string;
  endpointUrl: string;
  eventTypes: string[];
}

const emptyForm: LoggingFormData = {
  name: "",
  provider: "",
  endpointUrl: "",
  eventTypes: [],
};

function maskUrl(url: string | null): string {
  if (!url) return "—";
  try {
    const u = new URL(url);
    const masked = u.hostname.length > 20 ? u.hostname.slice(0, 20) + "..." : u.hostname;
    return `${u.protocol}//${masked}`;
  } catch {
    return url.length > 30 ? url.slice(0, 30) + "..." : url;
  }
}

function formatTime(date: Date | string | null): string {
  if (!date) return "Never";
  return new Date(date).toLocaleString();
}

function LoggingSection() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<LoggingFormData>(emptyForm);

  const { data: integrations, isLoading } = useQuery<LoggingIntegration[]>({
    queryKey: ["/api/logging-integrations"],
  });

  const createMutation = useMutation({
    mutationFn: (data: LoggingFormData) => apiRequest("POST", "/api/logging-integrations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logging-integrations"] });
      toast({ title: "Integration created" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create integration", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: LoggingFormData }) => apiRequest("PATCH", `/api/logging-integrations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logging-integrations"] });
      toast({ title: "Integration updated" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update integration", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/logging-integrations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logging-integrations"] });
      toast({ title: "Integration deleted" });
      setDeleteDialogOpen(false);
      setDeletingId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete integration", description: err.message, variant: "destructive" });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(integration: LoggingIntegration) {
    setForm({
      name: integration.name,
      provider: integration.provider,
      endpointUrl: integration.endpointUrl || "",
      eventTypes: integration.eventTypes || [],
    });
    setEditingId(integration.id);
    setDialogOpen(true);
  }

  function openDelete(id: string) {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name || !form.provider || form.eventTypes.length === 0) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function toggleEventType(eventType: string) {
    setForm((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(eventType)
        ? prev.eventTypes.filter((e) => e !== eventType)
        : [...prev.eventTypes, eventType],
    }));
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground" data-testid="text-logging-description">
          Configure external logging services to forward platform events
        </p>
        <Button size="sm" onClick={openCreate} data-testid="button-add-logging-integration">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Integration
        </Button>
      </div>

      {(!integrations || integrations.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Send className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-logging-integrations">
              No logging integrations configured yet
            </p>
            <Button size="sm" variant="outline" onClick={openCreate} data-testid="button-add-first-logging">
              <Plus className="w-4 h-4 mr-1.5" />
              Add your first integration
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((integration) => (
            <Card key={integration.id} data-testid={`card-logging-integration-${integration.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="flex flex-col gap-1.5">
                  <CardTitle className="text-sm font-medium" data-testid={`text-logging-name-${integration.id}`}>
                    {integration.name}
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]" data-testid={`badge-provider-${integration.id}`}>
                      {integration.provider}
                    </Badge>
                    <Badge
                      variant={integration.status === "active" ? "default" : "outline"}
                      className="text-[10px]"
                      data-testid={`badge-status-${integration.id}`}
                    >
                      {integration.status === "active" ? (
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                      ) : (
                        <Clock className="w-3 h-3 mr-1" />
                      )}
                      {integration.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(integration)}
                    data-testid={`button-edit-logging-${integration.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openDelete(integration.id)}
                    data-testid={`button-delete-logging-${integration.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Endpoint</span>
                  <span className="text-xs font-mono text-muted-foreground" data-testid={`text-endpoint-${integration.id}`}>
                    {maskUrl(integration.endpointUrl)}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Event Types</span>
                  <div className="flex flex-wrap gap-1">
                    {(integration.eventTypes || []).map((et) => (
                      <Badge key={et} variant="outline" className="text-[10px]" data-testid={`badge-event-type-${integration.id}-${et}`}>
                        {et.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                  <div className="flex items-center gap-1" data-testid={`text-delivered-${integration.id}`}>
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    {integration.deliveredCount ?? 0} delivered
                  </div>
                  <div className="flex items-center gap-1" data-testid={`text-failed-${integration.id}`}>
                    <XCircle className="w-3 h-3 text-destructive" />
                    {integration.failedCount ?? 0} failed
                  </div>
                  {integration.lastDeliveryAt && (
                    <div className="flex items-center gap-1" data-testid={`text-last-delivery-${integration.id}`}>
                      <Clock className="w-3 h-3" />
                      {formatTime(integration.lastDeliveryAt)}
                      {integration.lastDeliveryStatus && (
                        <Badge
                          variant={integration.lastDeliveryStatus === "success" ? "default" : "destructive"}
                          className="text-[10px] ml-1"
                        >
                          {integration.lastDeliveryStatus}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent data-testid="dialog-logging-form">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingId ? "Edit Logging Integration" : "Add Logging Integration"}
            </DialogTitle>
            <DialogDescription>
              {editingId ? "Update the logging integration configuration." : "Configure a new external logging service."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="logging-name">Name</Label>
              <Input
                id="logging-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="My Datadog Integration"
                data-testid="input-logging-name"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="logging-provider">Provider</Label>
              <Select value={form.provider} onValueChange={(v) => setForm((p) => ({ ...p, provider: v }))}>
                <SelectTrigger data-testid="select-logging-provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p} data-testid={`option-provider-${p}`}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="logging-endpoint">Endpoint URL</Label>
              <Input
                id="logging-endpoint"
                value={form.endpointUrl}
                onChange={(e) => setForm((p) => ({ ...p, endpointUrl: e.target.value }))}
                placeholder="https://logs.example.com/v1/intake"
                data-testid="input-logging-endpoint"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Event Types</Label>
              <div className="grid grid-cols-2 gap-2">
                {EVENT_TYPES.map((et) => (
                  <div key={et} className="flex items-center gap-2">
                    <Checkbox
                      id={`event-${et}`}
                      checked={form.eventTypes.includes(et)}
                      onCheckedChange={() => toggleEventType(et)}
                      data-testid={`checkbox-event-${et}`}
                    />
                    <Label htmlFor={`event-${et}`} className="text-sm font-normal cursor-pointer">
                      {et.replace(/_/g, " ")}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-logging">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving} data-testid="button-save-logging">
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) { setDeleteDialogOpen(false); setDeletingId(null); } }}>
        <DialogContent data-testid="dialog-delete-confirmation">
          <DialogHeader>
            <DialogTitle>Delete Integration</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this logging integration? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 py-4">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <p className="text-sm text-muted-foreground">All delivery history will be lost.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeletingId(null); }} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
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

export default function Integrations() {
  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-integrations">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <Plug className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
              Integrations
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
              Connect external tools, APIs, and services to your agent platform
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="catalog" data-testid="tabs-integrations">
        <TabsList data-testid="tabs-list-integrations">
          <TabsTrigger value="catalog" data-testid="tab-catalog">Catalog</TabsTrigger>
          <TabsTrigger value="logging" data-testid="tab-logging">Logging</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog">
          <div className="flex items-center justify-end mb-4">
            <Badge variant="outline" className="text-xs" data-testid="badge-category-count">
              {integrationCategories.length} categories
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrationCategories.map((category) => {
              const IconComponent = category.icon;
              return (
                <Card key={category.id} data-testid={`card-integration-${category.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                        <IconComponent className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <CardTitle className="text-sm font-medium" data-testid={`text-integration-name-${category.id}`}>
                        {category.name}
                      </CardTitle>
                    </div>
                    <Badge variant="secondary" className="text-[10px]" data-testid={`badge-integration-count-${category.id}`}>
                      {category.count} available
                    </Badge>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <p className="text-xs text-muted-foreground" data-testid={`text-integration-description-${category.id}`}>
                      {category.description}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      data-testid={`button-configure-${category.id}`}
                    >
                      Configure
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="logging">
          <LoggingSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
