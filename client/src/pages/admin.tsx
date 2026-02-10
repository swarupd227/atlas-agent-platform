import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck, Settings, Users, Server, Key, Webhook,
  Plus, Pencil, Trash2, CheckCircle2, Clock, XCircle, AlertTriangle,
  RefreshCw, Zap, AlertCircle, Ban, UserPlus,
  Lock, Timer,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OrgSettings, AdminUser, EnvironmentConfig, SecretRotationPolicy, AdminWebhook } from "@shared/schema";

const ROLES = [
  { value: "platform_operator", label: "Platform Operator" },
  { value: "ai_engineer", label: "AI Engineer" },
  { value: "compliance_officer", label: "Compliance Officer" },
  { value: "finance_lead", label: "Finance Lead" },
  { value: "domain_expert", label: "Domain Expert" },
  { value: "support_engineer", label: "Support Engineer" },
  { value: "executive", label: "Executive" },
];

const REDACTION_PROFILES = [
  { value: "none", label: "None" },
  { value: "pii", label: "PII Only" },
  { value: "financial", label: "Financial" },
  { value: "full", label: "Full Redaction" },
];

function formatRole(role: string): string {
  return ROLES.find((r) => r.value === role)?.label || role.replace(/_/g, " ");
}

function formatDate(date: string | Date | null): string {
  if (!date) return "Never";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(date: string | Date | null): string {
  if (!date) return "Never";
  return new Date(date).toLocaleString();
}

function daysUntil(date: string | Date | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

interface SlaTimer { hours: number; escalateAfter: number }

function OrgSettingsTab() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<OrgSettings>({
    queryKey: ["/api/admin/org-settings"],
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<OrgSettings>) => apiRequest("PATCH", "/api/admin/org-settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/org-settings"] });
      toast({ title: "Settings updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update settings", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="flex flex-col gap-4">{[1, 2, 3].map((i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>)}</div>;
  }

  const slaTimers = (settings?.approvalSlaTimers || {}) as Record<string, SlaTimer>;

  return (
    <div className="flex flex-col gap-6">
      <Card data-testid="card-default-policies">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Default Policies
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Organization-wide default policies applied to all new agents
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(settings?.defaultPolicies || []).map((p) => (
              <Badge key={p} variant="secondary" className="text-xs" data-testid={`badge-policy-${p}`}>
                {p.replace(/-/g, " ")}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-redaction-profile">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Default Redaction Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Default data redaction level for trace viewing and log exports
          </p>
          <Select
            value={settings?.defaultRedactionProfile || "pii"}
            onValueChange={(v) => updateMutation.mutate({ defaultRedactionProfile: v })}
          >
            <SelectTrigger className="w-[240px]" data-testid="select-redaction-profile">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REDACTION_PROFILES.map((p) => (
                <SelectItem key={p.value} value={p.value} data-testid={`option-redaction-${p.value}`}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card data-testid="card-approval-sla">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Timer className="w-4 h-4" />
            Approval SLA Timers
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Maximum time allowed for each approval type before escalation
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(slaTimers).map(([key, timer]) => (
              <Card key={key} data-testid={`card-sla-${key}`}>
                <CardContent className="p-3 flex flex-col gap-2">
                  <span className="text-xs font-medium capitalize">{key.replace(/_/g, " ")}</span>
                  <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span data-testid={`text-sla-hours-${key}`}>{timer.hours}h SLA</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span data-testid={`text-sla-escalate-${key}`}>{timer.escalateAfter}h escalation</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UsersRolesTab() {
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editRole, setEditRole] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("ai_engineer");

  const { data: users, isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; email: string; role: string; status: string }) =>
      apiRequest("POST", "/api/admin/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User invited" });
      setAddDialogOpen(false);
      setNewName("");
      setNewEmail("");
      setNewRole("ai_engineer");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to invite user", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AdminUser> }) =>
      apiRequest("PATCH", `/api/admin/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
      setEditDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update user", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User removed" });
    },
  });

  if (isLoading) {
    return <div className="flex flex-col gap-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  const statusVariant = (s: string) => s === "active" ? "default" as const : s === "suspended" ? "destructive" as const : "outline" as const;
  const StatusIcon = (s: string) => s === "active" ? CheckCircle2 : s === "suspended" ? Ban : Clock;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground" data-testid="text-users-description">
          Manage platform users, roles, and access
        </p>
        <Button size="sm" onClick={() => setAddDialogOpen(true)} data-testid="button-invite-user">
          <UserPlus className="w-3.5 h-3.5 mr-1.5" />
          Invite User
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {(users || []).map((user) => {
          const SIcon = StatusIcon(user.status);
          return (
            <Card key={user.id} data-testid={`card-user-${user.id}`}>
              <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-muted shrink-0">
                    <span className="text-sm font-medium">{user.name.charAt(0)}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium truncate" data-testid={`text-user-name-${user.id}`}>
                      {user.name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate" data-testid={`text-user-email-${user.id}`}>
                      {user.email}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]" data-testid={`badge-user-role-${user.id}`}>
                    {formatRole(user.role)}
                  </Badge>
                  <Badge variant={statusVariant(user.status)} className="text-[10px]" data-testid={`badge-user-status-${user.id}`}>
                    <SIcon className="w-3 h-3 mr-1" />
                    {user.status}
                  </Badge>
                  {user.lastLoginAt && (
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap" data-testid={`text-user-login-${user.id}`}>
                      Last login: {formatDate(user.lastLoginAt)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { setEditingUser(user); setEditRole(user.role); setEditDialogOpen(true); }}
                    data-testid={`button-edit-user-${user.id}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {user.status === "active" ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => updateMutation.mutate({ id: user.id, data: { status: "suspended" } })}
                      data-testid={`button-suspend-user-${user.id}`}
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </Button>
                  ) : user.status === "suspended" ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => updateMutation.mutate({ id: user.id, data: { status: "active" } })}
                      data-testid={`button-activate-user-${user.id}`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(user.id)}
                    data-testid={`button-delete-user-${user.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) { setEditDialogOpen(false); setEditingUser(null); } }}>
        <DialogContent data-testid="dialog-edit-user">
          <DialogHeader>
            <DialogTitle>Edit User Role</DialogTitle>
            <DialogDescription>Change the role for {editingUser?.name}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger data-testid="select-edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value} data-testid={`option-role-${r.value}`}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit-user">Cancel</Button>
            <Button
              onClick={() => editingUser && updateMutation.mutate({ id: editingUser.id, data: { role: editRole } })}
              disabled={updateMutation.isPending}
              data-testid="button-save-user-role"
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) setAddDialogOpen(false); }}>
        <DialogContent data-testid="dialog-invite-user">
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>Add a new user to the platform</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-name">Name</Label>
              <Input id="invite-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" data-testid="input-invite-name" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@company.com" data-testid="input-invite-email" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger data-testid="select-invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-invite">Cancel</Button>
            <Button
              onClick={() => {
                if (!newName || !newEmail) return;
                createMutation.mutate({ name: newName, email: newEmail, role: newRole, status: "invited" });
              }}
              disabled={createMutation.isPending || !newName || !newEmail}
              data-testid="button-send-invite"
            >
              {createMutation.isPending ? "Inviting..." : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EnvironmentsTab() {
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<EnvironmentConfig | null>(null);

  const { data: environments, isLoading } = useQuery<EnvironmentConfig[]>({
    queryKey: ["/api/admin/environments"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EnvironmentConfig> }) =>
      apiRequest("PATCH", `/api/admin/environments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/environments"] });
      toast({ title: "Environment updated" });
      setEditDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update environment", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>)}</div>;
  }

  const envOrder = ["development", "staging", "pilot", "production"];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground" data-testid="text-environments-description">
        Configure deployment environments, approval requirements, and rollout settings
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(environments || [])
          .sort((a, b) => envOrder.indexOf(a.name) - envOrder.indexOf(b.name))
          .map((env) => {
            const autoPromote = (env.autoPromoteRules || {}) as { enabled?: boolean; conditions?: string[] };
            return (
              <Card key={env.id} data-testid={`card-env-${env.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="text-sm font-medium" data-testid={`text-env-name-${env.id}`}>
                      {env.displayName}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">{env.description}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {env.deploymentFreeze && (
                      <Badge variant="destructive" className="text-[10px]" data-testid={`badge-freeze-${env.id}`}>
                        <Lock className="w-3 h-3 mr-1" />
                        Frozen
                      </Badge>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { setEditingEnv(env); setEditDialogOpen(true); }}
                      data-testid={`button-edit-env-${env.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Required Approvals</span>
                      <span className="text-sm font-medium" data-testid={`text-approvals-${env.id}`}>
                        {env.requiredApprovals}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Max Canary %</span>
                      <span className="text-sm font-medium" data-testid={`text-canary-${env.id}`}>
                        {env.maxCanaryPercent}%
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Auto-Promote</span>
                    {autoPromote.enabled ? (
                      <div className="flex flex-col gap-1">
                        <Badge variant="default" className="text-[10px] w-fit" data-testid={`badge-autopromote-${env.id}`}>
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Enabled
                        </Badge>
                        {(autoPromote.conditions || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {autoPromote.conditions!.map((c, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] font-mono">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-[10px] w-fit" data-testid={`badge-autopromote-${env.id}`}>
                        <XCircle className="w-3 h-3 mr-1" />
                        Disabled
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Deployment Freeze</span>
                    <Switch
                      checked={env.deploymentFreeze ?? false}
                      onCheckedChange={(checked) => updateMutation.mutate({ id: env.id, data: { deploymentFreeze: checked } })}
                      data-testid={`switch-freeze-${env.id}`}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) { setEditDialogOpen(false); setEditingEnv(null); } }}>
        <DialogContent data-testid="dialog-edit-env">
          <DialogHeader>
            <DialogTitle>Edit {editingEnv?.displayName}</DialogTitle>
            <DialogDescription>Configure environment settings</DialogDescription>
          </DialogHeader>
          {editingEnv && (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="env-approvals">Required Approvals</Label>
                <Select
                  value={String(editingEnv.requiredApprovals ?? 0)}
                  onValueChange={(v) => setEditingEnv({ ...editingEnv, requiredApprovals: parseInt(v) })}
                >
                  <SelectTrigger data-testid="select-env-approvals">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} approval{n !== 1 ? "s" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="env-canary">Max Canary Percentage</Label>
                <Select
                  value={String(editingEnv.maxCanaryPercent ?? 25)}
                  onValueChange={(v) => setEditingEnv({ ...editingEnv, maxCanaryPercent: parseInt(v) })}
                >
                  <SelectTrigger data-testid="select-env-canary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 25, 50, 100].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit-env">Cancel</Button>
            <Button
              onClick={() => editingEnv && updateMutation.mutate({
                id: editingEnv.id,
                data: { requiredApprovals: editingEnv.requiredApprovals, maxCanaryPercent: editingEnv.maxCanaryPercent },
              })}
              disabled={updateMutation.isPending}
              data-testid="button-save-env"
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SecretRotationTab() {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newSecretName, setNewSecretName] = useState("");
  const [newInterval, setNewInterval] = useState("90");
  const [newAutoRotate, setNewAutoRotate] = useState(false);

  const { data: policies, isLoading } = useQuery<SecretRotationPolicy[]>({
    queryKey: ["/api/admin/secret-rotation"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { secretName: string; rotationIntervalDays: number; autoRotate: boolean; notificationChannels: string[]; status: string }) =>
      apiRequest("POST", "/api/admin/secret-rotation", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/secret-rotation"] });
      toast({ title: "Rotation policy created" });
      setAddDialogOpen(false);
      setNewSecretName("");
      setNewInterval("90");
      setNewAutoRotate(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create policy", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SecretRotationPolicy> }) =>
      apiRequest("PATCH", `/api/admin/secret-rotation/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/secret-rotation"] });
      toast({ title: "Policy updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update policy", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/secret-rotation/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/secret-rotation"] });
      toast({ title: "Policy deleted" });
    },
  });

  if (isLoading) {
    return <div className="flex flex-col gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground" data-testid="text-rotation-description">
          Configure automatic secret rotation schedules and notifications
        </p>
        <Button size="sm" onClick={() => setAddDialogOpen(true)} data-testid="button-add-rotation-policy">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Policy
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {(policies || []).map((policy) => {
          const days = daysUntil(policy.nextRotationAt);
          const isOverdue = policy.status === "overdue" || (days !== null && days < 0);
          return (
            <Card key={policy.id} data-testid={`card-rotation-${policy.id}`}>
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                      <Key className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium font-mono" data-testid={`text-secret-name-${policy.id}`}>
                        {policy.secretName}
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]" data-testid={`badge-interval-${policy.id}`}>
                          Every {policy.rotationIntervalDays} days
                        </Badge>
                        {policy.autoRotate ? (
                          <Badge variant="default" className="text-[10px]" data-testid={`badge-autorotate-${policy.id}`}>
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Auto-rotate
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]" data-testid={`badge-autorotate-${policy.id}`}>
                            Manual
                          </Badge>
                        )}
                        {isOverdue && (
                          <Badge variant="destructive" className="text-[10px]" data-testid={`badge-overdue-${policy.id}`}>
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => updateMutation.mutate({
                        id: policy.id,
                        data: { autoRotate: !policy.autoRotate },
                      })}
                      data-testid={`button-toggle-autorotate-${policy.id}`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(policy.id)}
                      data-testid={`button-delete-rotation-${policy.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Rotated</span>
                    <span className="text-muted-foreground" data-testid={`text-last-rotated-${policy.id}`}>
                      {formatDate(policy.lastRotatedAt)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Next Rotation</span>
                    <span className={isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"} data-testid={`text-next-rotation-${policy.id}`}>
                      {formatDate(policy.nextRotationAt)}
                      {days !== null && (
                        <span className="ml-1">
                          ({days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Notifications</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {(policy.notificationChannels || []).map((ch) => (
                        <Badge key={ch} variant="outline" className="text-[9px]" data-testid={`badge-channel-${policy.id}-${ch}`}>
                          {ch}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Rotation Progress</span>
                    {policy.lastRotatedAt && policy.nextRotationAt && (
                      <Progress
                        value={Math.max(0, Math.min(100, ((Date.now() - new Date(policy.lastRotatedAt).getTime()) / (new Date(policy.nextRotationAt).getTime() - new Date(policy.lastRotatedAt).getTime())) * 100))}
                        className="h-1.5 mt-1"
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) setAddDialogOpen(false); }}>
        <DialogContent data-testid="dialog-add-rotation">
          <DialogHeader>
            <DialogTitle>Add Secret Rotation Policy</DialogTitle>
            <DialogDescription>Configure automatic rotation for a secret</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rotation-secret">Secret Name</Label>
              <Input id="rotation-secret" value={newSecretName} onChange={(e) => setNewSecretName(e.target.value)} placeholder="API_KEY_NAME" className="font-mono" data-testid="input-rotation-secret" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Rotation Interval</Label>
              <Select value={newInterval} onValueChange={setNewInterval}>
                <SelectTrigger data-testid="select-rotation-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Every 30 days</SelectItem>
                  <SelectItem value="60">Every 60 days</SelectItem>
                  <SelectItem value="90">Every 90 days</SelectItem>
                  <SelectItem value="180">Every 180 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label>Auto-Rotate</Label>
              <Switch checked={newAutoRotate} onCheckedChange={setNewAutoRotate} data-testid="switch-new-autorotate" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-rotation">Cancel</Button>
            <Button
              onClick={() => {
                if (!newSecretName) return;
                createMutation.mutate({
                  secretName: newSecretName,
                  rotationIntervalDays: parseInt(newInterval),
                  autoRotate: newAutoRotate,
                  notificationChannels: ["email"],
                  status: "active",
                });
              }}
              disabled={createMutation.isPending || !newSecretName}
              data-testid="button-create-rotation"
            >
              {createMutation.isPending ? "Creating..." : "Create Policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WebhooksTab() {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const WEBHOOK_EVENTS = [
    "deployment.created", "deployment.promoted", "deployment.failed",
    "alert.triggered", "approval.required", "policy.violation",
    "sla.breach", "agent.created", "eval.regression",
    "outcome.event", "trace.completed", "eval.completed",
  ];
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const { data: webhooks, isLoading } = useQuery<AdminWebhook[]>({
    queryKey: ["/api/admin/webhooks"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; url: string; subscribedEvents: string[]; status: string }) =>
      apiRequest("POST", "/api/admin/webhooks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/webhooks"] });
      toast({ title: "Webhook created" });
      setAddDialogOpen(false);
      setNewName("");
      setNewUrl("");
      setSelectedEvents([]);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create webhook", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AdminWebhook> }) =>
      apiRequest("PATCH", `/api/admin/webhooks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/webhooks"] });
      toast({ title: "Webhook updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update webhook", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/webhooks/${id}/test`),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/webhooks"] });
      if (result.success) {
        toast({ title: "Webhook test passed", description: `Latency: ${result.latencyMs}ms` });
      } else {
        toast({ title: "Webhook test failed", description: result.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/webhooks"] });
      toast({ title: "Webhook deleted" });
    },
  });

  if (isLoading) {
    return <div className="flex flex-col gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground" data-testid="text-webhooks-description">
          Configure webhook endpoints for external event notifications
        </p>
        <Button size="sm" onClick={() => setAddDialogOpen(true)} data-testid="button-add-webhook">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Webhook
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {(webhooks || []).map((wh) => (
          <Card key={wh.id} data-testid={`card-webhook-${wh.id}`}>
            <CardContent className="p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                    <Webhook className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium" data-testid={`text-webhook-name-${wh.id}`}>
                      {wh.name}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-xs" data-testid={`text-webhook-url-${wh.id}`}>
                      {wh.url}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant={wh.status === "active" ? "default" : "outline"}
                    className="text-[10px]"
                    data-testid={`badge-webhook-status-${wh.id}`}
                  >
                    {wh.status === "active" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                    {wh.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testMutation.mutate(wh.id)}
                    disabled={testMutation.isPending}
                    data-testid={`button-test-webhook-${wh.id}`}
                  >
                    {testMutation.isPending ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
                    Test
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => updateMutation.mutate({
                      id: wh.id,
                      data: { status: wh.status === "active" ? "inactive" : "active" },
                    })}
                    data-testid={`button-toggle-webhook-${wh.id}`}
                  >
                    {wh.status === "active" ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(wh.id)}
                    data-testid={`button-delete-webhook-${wh.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {(wh.subscribedEvents || []).map((ev) => (
                  <Badge key={ev} variant="outline" className="text-[10px] font-mono" data-testid={`badge-event-${wh.id}-${ev}`}>
                    {ev}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                <div className="flex items-center gap-1" data-testid={`text-delivered-${wh.id}`}>
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  {wh.deliveredCount ?? 0} delivered
                </div>
                <div className="flex items-center gap-1" data-testid={`text-failed-${wh.id}`}>
                  <XCircle className="w-3 h-3 text-destructive" />
                  {wh.failedCount ?? 0} failed
                </div>
                {wh.lastDeliveryAt && (
                  <div className="flex items-center gap-1" data-testid={`text-last-delivery-${wh.id}`}>
                    <Clock className="w-3 h-3" />
                    {formatDateTime(wh.lastDeliveryAt)}
                    {wh.lastDeliveryStatus && (
                      <Badge
                        variant={wh.lastDeliveryStatus === "success" ? "default" : "destructive"}
                        className="text-[10px] ml-1"
                      >
                        {wh.lastDeliveryStatus}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) setAddDialogOpen(false); }}>
        <DialogContent className="max-w-lg" data-testid="dialog-add-webhook">
          <DialogHeader>
            <DialogTitle>Add Webhook Endpoint</DialogTitle>
            <DialogDescription>Configure a new webhook to receive event notifications</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="webhook-name">Name</Label>
              <Input id="webhook-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Webhook" data-testid="input-webhook-name" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="webhook-url">URL</Label>
              <Input id="webhook-url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://example.com/webhook" className="font-mono" data-testid="input-webhook-url" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Events</Label>
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                {WEBHOOK_EVENTS.map((ev) => (
                  <Button
                    key={ev}
                    size="sm"
                    variant={selectedEvents.includes(ev) ? "default" : "outline"}
                    onClick={() => setSelectedEvents((prev) =>
                      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
                    )}
                    className="justify-start text-[11px] font-mono"
                    data-testid={`button-event-${ev}`}
                  >
                    {ev}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-webhook">Cancel</Button>
            <Button
              onClick={() => {
                if (!newName || !newUrl || selectedEvents.length === 0) return;
                createMutation.mutate({ name: newName, url: newUrl, subscribedEvents: selectedEvents, status: "active" });
              }}
              disabled={createMutation.isPending || !newName || !newUrl || selectedEvents.length === 0}
              data-testid="button-create-webhook"
            >
              {createMutation.isPending ? "Creating..." : "Create Webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Admin() {
  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-admin">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
              Administration
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
              Platform configuration, user management, and system settings
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="org-settings" data-testid="tabs-admin">
        <TabsList data-testid="tabs-list-admin">
          <TabsTrigger value="org-settings" data-testid="tab-org-settings">
            <Settings className="w-3.5 h-3.5 mr-1.5" />
            Org Settings
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-3.5 h-3.5 mr-1.5" />
            Users & Roles
          </TabsTrigger>
          <TabsTrigger value="environments" data-testid="tab-environments">
            <Server className="w-3.5 h-3.5 mr-1.5" />
            Environments
          </TabsTrigger>
          <TabsTrigger value="secret-rotation" data-testid="tab-secret-rotation">
            <Key className="w-3.5 h-3.5 mr-1.5" />
            Secret Rotation
          </TabsTrigger>
          <TabsTrigger value="webhooks" data-testid="tab-webhooks">
            <Webhook className="w-3.5 h-3.5 mr-1.5" />
            Webhooks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="org-settings" className="mt-4">
          <OrgSettingsTab />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UsersRolesTab />
        </TabsContent>

        <TabsContent value="environments" className="mt-4">
          <EnvironmentsTab />
        </TabsContent>

        <TabsContent value="secret-rotation" className="mt-4">
          <SecretRotationTab />
        </TabsContent>

        <TabsContent value="webhooks" className="mt-4">
          <WebhooksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
