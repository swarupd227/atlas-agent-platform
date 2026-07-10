/**
 * Workspace Access — Studio-side control for publishing an agent to the Agent
 * Workspace and choosing which roles may use it. "Everyone" = empty audience
 * (public to all roles); otherwise only the checked roles see it. Admins always
 * have access. Persists to agents.workspaceAudience via the agent PATCH.
 */
import { useState } from "react";
import { Sparkles, Check, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Non-admin roles that can be granted workspace access (admins always can).
const ROLE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "outcome_owner", label: "Outcome Owner" },
  { id: "agent_engineer", label: "Agent Engineer" },
  { id: "ops_sre", label: "Ops / SRE" },
  { id: "compliance_security", label: "Compliance / Security" },
  { id: "expert_validator", label: "Expert Validator" },
  { id: "finance", label: "Finance" },
  { id: "domain_expert", label: "Domain Expert" },
];

export function WorkspaceAccessCard({ agentId, initialAudience }: { agentId: string; initialAudience?: string[] | null }) {
  const { toast } = useToast();
  const audience = initialAudience ?? [];
  const [everyone, setEveryone] = useState(audience.length === 0);
  const [roles, setRoles] = useState<Set<string>>(new Set(audience));
  const [saving, setSaving] = useState(false);

  const dirty =
    (everyone && audience.length > 0) ||
    (!everyone && (roles.size !== audience.length || audience.some(r => !roles.has(r))));

  async function save() {
    const next = everyone ? [] : Array.from(roles);
    if (!everyone && next.length === 0) {
      toast({ title: "Pick at least one role", description: "Or switch on “Available to everyone”.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/agents/${agentId}`, { workspaceAudience: next });
      queryClient.invalidateQueries({ queryKey: [`/api/agents/${agentId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/agents"] });
      toast({ title: "Workspace access updated", description: everyone ? "Available to everyone." : `Limited to ${next.length} role${next.length === 1 ? "" : "s"}.` });
    } catch (e: any) {
      toast({ title: "Couldn’t save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function toggleRole(id: string, on: boolean) {
    setRoles(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });
  }

  return (
    <Card data-testid="card-workspace-access">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Workspace Access
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-[13px] text-muted-foreground">
          Who can ask this agent to do work in the Agent Workspace. Admins always have access.
        </p>

        <div className="flex items-center justify-between gap-3 p-2.5 rounded-md border">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Available to everyone</span>
            <span className="text-[11px] text-muted-foreground">Every role can use this agent</span>
          </div>
          <Switch checked={everyone} onCheckedChange={setEveryone} data-testid="switch-workspace-everyone" aria-label="Available to everyone" />
        </div>

        {!everyone && (
          <div className="flex flex-col gap-1.5 pl-1" data-testid="workspace-role-list">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Roles with access</span>
            {ROLE_OPTIONS.map(r => (
              <label key={r.id} className="flex items-center gap-2.5 text-sm cursor-pointer py-0.5">
                <Checkbox checked={roles.has(r.id)} onCheckedChange={(v) => toggleRole(r.id, v === true)} data-testid={`checkbox-role-${r.id}`} aria-label={r.label} />
                {r.label}
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted-foreground">
            {everyone
              ? <Badge variant="outline" className="text-[10px]">Public in Workspace</Badge>
              : <Badge variant="outline" className="text-[10px]">{roles.size} role{roles.size === 1 ? "" : "s"}</Badge>}
          </div>
          <Button size="sm" onClick={save} disabled={!dirty || saving} data-testid="button-save-workspace-access">
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
            Save access
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
