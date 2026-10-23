import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { INDUSTRIES } from "./industry-provider";
import { demoIndustryAssignmentSchema, type DemoIndustryAssignment } from "@shared/demo-industry-visibility";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DemoUser { id: string; username: string; email: string | null; role: string; active: boolean; assignment: DemoIndustryAssignment | null }
interface DemoUsers { enabled: boolean; users: DemoUser[] }
const usersKey = ["/api/admin/demo-users"];
const visibilityKey = ["/api/demo/industry-visibility"];
const labelFor = (id: string) => INDUSTRIES.find(i => i.id === id)?.label ?? id;

export function DemoUsersTab() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery<DemoUsers>({ queryKey: usersKey, staleTime: 0, refetchOnWindowFocus: true });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DemoUser | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [allowedIds, setAllowedIds] = useState<string[]>([]);
  const [defaultId, setDefaultId] = useState("");
  const invalidate = async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: usersKey }), queryClient.invalidateQueries({ queryKey: visibilityKey })]);
  };
  const failure = (error: unknown) => toast({ title: "Could not save demo settings", description: error instanceof Error ? error.message : "Please retry.", variant: "destructive" });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("PUT", "/api/admin/demo-users/settings", { enabled }),
    onSuccess: async (_response, enabled) => { await invalidate(); toast({ title: enabled ? "Per-user demo visibility enabled" : "Normal industry visibility restored" }); },
    onError: failure,
  });
  const save = useMutation({
    mutationFn: async () => {
      const assignment = demoIndustryAssignmentSchema.parse({ clientLabel, allowedIndustryIds: allowedIds, defaultIndustryId: defaultId });
      return editing ? apiRequest("PUT", `/api/admin/demo-users/${encodeURIComponent(editing.id)}/industry-visibility`, assignment)
        : apiRequest("POST", "/api/admin/demo-users", { username, ...(email ? { email } : {}), password, ...assignment });
    },
    onSuccess: async () => {
      await invalidate(); setOpen(false); setPassword("");
      toast({ title: editing ? "User industry choices saved" : "Real login account created", description: editing ? "The user can refresh their browser to load the changes." : "The user can sign in with the username and password you entered." });
    },
    onError: failure,
  });
  const edit = (user: DemoUser | null) => {
    setEditing(user); setUsername(user?.username ?? ""); setEmail(user?.email ?? ""); setPassword("");
    setClientLabel(user?.assignment?.clientLabel ?? ""); setAllowedIds(user?.assignment?.allowedIndustryIds ?? []);
    setDefaultId(user?.assignment?.defaultIndustryId ?? ""); setOpen(true);
  };
  const choose = (id: string, checked: boolean) => {
    const next = checked ? [...allowedIds, id] : allowedIds.filter(i => i !== id);
    setAllowedIds(next); if (!next.includes(defaultId)) setDefaultId(next[0] ?? "");
  };

  if (isLoading) return <p data-testid="demo-users-loading">Loading real demo accounts…</p>;
  if (isError) return <Button onClick={() => void refetch()} data-testid="button-retry-demo-users">Could not load accounts. Retry</Button>;
  return (
    <Card data-testid="card-demo-users">
      <CardHeader>
        <CardTitle>Demo Users</CardTitle>
        <p className="text-sm text-muted-foreground">Manage real login accounts and the industries each user sees. These are UI demonstration settings, not API access restrictions. Client labels do not isolate data.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Switch id="demo-visibility-enabled" checked={!!data?.enabled} disabled={toggle.isPending} onCheckedChange={value => toggle.mutate(value)} data-testid="switch-demo-visibility" />
            <Label htmlFor="demo-visibility-enabled">Use each user's selected industries</Label>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!data?.enabled || toggle.isPending} onClick={() => toggle.mutate(false)} data-testid="button-reset-demo-visibility">Reset to normal visibility</Button>
            <Button onClick={() => edit(null)} data-testid="button-create-demo-user">Create login account</Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Administrators retain all industries. When enabled, users without an assignment are prompted to contact their administrator. Reset preserves accounts and saved assignments.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-demo-users">
            <thead><tr className="border-b text-left"><th className="p-3">Username</th><th className="p-3">Client</th><th className="p-3">Industries</th><th className="p-3">Default</th><th className="p-3">Status</th><th className="p-3">Assignment</th></tr></thead>
            <tbody>{data?.users.map(user => <tr key={user.id} className="border-b" data-testid={`row-demo-user-${user.id}`}>
              <td className="p-3 font-medium">{user.username}<div className="font-normal text-xs text-muted-foreground">{user.role}</div></td>
              <td className="p-3">{user.assignment?.clientLabel ?? "—"}</td>
              <td className="p-3">{user.assignment?.allowedIndustryIds.map(labelFor).join(", ") ?? "Not configured"}</td>
              <td className="p-3">{user.assignment ? labelFor(user.assignment.defaultIndustryId) : "—"}</td>
              <td className="p-3">{!user.active ? "Inactive" : user.assignment ? "Configured" : "Needs assignment"}</td>
              <td className="p-3"><Button variant="outline" size="sm" onClick={() => edit(user)} data-testid={`button-edit-demo-user-${user.id}`}>Edit industries</Button></td>
            </tr>)}</tbody>
          </table>
          {!data?.users.length && <p className="p-3 text-muted-foreground">No non-admin login accounts yet.</p>}
        </div>
      </CardContent>
      <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) setPassword(""); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="dialog-demo-user">
          <DialogHeader><DialogTitle>{editing ? `Industries for ${editing.username}` : "Create real demo login"}</DialogTitle>
            <DialogDescription>{editing ? "Choose the industries this user sees when demo visibility is enabled." : "Creates a non-admin Agent Engineer account. Share its initial password privately."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!editing && <>
              <div className="space-y-2"><Label htmlFor="demo-username">Username</Label><Input id="demo-username" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} data-testid="input-demo-username" /></div>
              <div className="space-y-2"><Label htmlFor="demo-email">Email (optional)</Label><Input id="demo-email" type="email" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-demo-email" /></div>
              <div className="space-y-2"><Label htmlFor="demo-password">Initial password (at least 16 characters)</Label><Input id="demo-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} data-testid="input-demo-password" /></div>
            </>}
            <div className="space-y-2"><Label htmlFor="demo-client-label">Client label</Label><Input id="demo-client-label" value={clientLabel} onChange={e => setClientLabel(e.target.value)} placeholder="For example, Hilti" data-testid="input-demo-client-label" /></div>
            <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">Visible industries</legend>
              {INDUSTRIES.map(industry => <div key={industry.id} className="flex items-center gap-3">
                <Checkbox id={`demo-industry-${industry.id}`} checked={allowedIds.includes(industry.id)} onCheckedChange={value => choose(industry.id, value === true)} data-testid={`checkbox-demo-industry-${industry.id}`} />
                <Label htmlFor={`demo-industry-${industry.id}`}>{industry.label}</Label>
              </div>)}
            </fieldset>
            <div className="space-y-2"><Label htmlFor="demo-default-industry">Default industry</Label>
              <Select value={defaultId} onValueChange={setDefaultId}><SelectTrigger id="demo-default-industry" data-testid="select-demo-default-industry"><SelectValue placeholder="Select a visible industry" /></SelectTrigger>
                <SelectContent>{INDUSTRIES.filter(i => allowedIds.includes(i.id)).map(i => <SelectItem key={i.id} value={i.id} data-testid={`option-demo-default-${i.id}`}>{i.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setOpen(false); setPassword(""); }} data-testid="button-cancel-demo-user">Cancel</Button>
            <Button disabled={save.isPending || !clientLabel.trim() || !allowedIds.includes(defaultId) || (!editing && (!username.trim() || password.length < 16))} onClick={() => save.mutate()} data-testid="button-save-demo-user">{save.isPending ? "Saving…" : editing ? "Save industries" : "Create account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
