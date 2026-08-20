/**
 * Relay Agents — management UI for the outbound-only tunnel agents that let
 * the platform reach a database with no inbound network access at all
 * (the third SQL connector connection mode, alongside direct and SSH tunnel;
 * see server/relay/). The backend (WebSocket relay server, token lifecycle
 * routes) already existed with no way to drive it from the UI, so the
 * relayAgentId the SQL connector form asks for was effectively unobtainable.
 *
 * The agent id is the field the connector form needs, so it's shown as a
 * primary, copyable value on every row -- not buried as a subtitle.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, Plus, Copy, Check, Trash2, ShieldAlert, Info, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface RelayAgent {
  id: string;
  label: string;
  status: "online" | "offline";
  lastSeenAt: string | null;
  createdAt: string | null;
}

interface CreatedRelayAgent {
  id: string;
  label: string;
  token: string;
  createdAt: string | null;
  note?: string;
}

function CopyButton({ value, label, testId }: { value: string; label: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: `Could not copy ${label}`, description: "Select the text and copy it manually.", variant: "destructive" });
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={copy} aria-label={`Copy ${label}`} data-testid={testId}>
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function RelayAgentsPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [created, setCreated] = useState<CreatedRelayAgent | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RelayAgent | null>(null);

  const { data: agents, isLoading } = useQuery<RelayAgent[]>({
    queryKey: ["/api/relay-agents"],
    // Status is derived from a live WebSocket registry on the server, so a
    // stale cache would show an agent as offline well after it reconnects.
    refetchInterval: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: async (label: string) => {
      const res = await apiRequest("POST", "/api/relay-agents", { label });
      return (await res.json()) as CreatedRelayAgent;
    },
    onSuccess: (data) => {
      setCreated(data);
      setCreateOpen(false);
      setNewLabel("");
      queryClient.invalidateQueries({ queryKey: ["/api/relay-agents"] });
    },
    onError: (err: any) => {
      toast({ title: "Could not create relay agent", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/relay-agents/${id}/revoke`);
    },
    onSuccess: () => {
      toast({ title: "Relay agent revoked", description: "Its token no longer works. Any connector using it will fail until you point it at a new agent." });
      setRevokeTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/relay-agents"] });
    },
    onError: (err: any) => {
      toast({ title: "Could not revoke relay agent", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const platformWsUrl = typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
    : "wss://your-astra-host";

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <Link href="/integrations">
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" data-testid="link-back-integrations">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Integrations
          </Button>
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Radio className="w-6 h-6" /> Relay Agents
            </h1>
            <p className="text-muted-foreground mt-1">
              Reach a database that has no inbound network access — the relay agent runs inside your network and dials out to Astra, so nothing needs opening on your firewall.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} data-testid="button-new-relay-agent">
            <Plus className="w-4 h-4 mr-1" /> New Relay Agent
          </Button>
        </div>
      </div>

      <Card className="bg-muted/40">
        <CardContent className="pt-6 text-sm text-muted-foreground space-y-2">
          <div className="flex gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p>
                <span className="font-medium text-foreground">When to use this.</span>{" "}
                Pick <span className="font-mono text-xs">Direct</span> if Astra can reach the database over the network, or{" "}
                <span className="font-mono text-xs">SSH Tunnel</span> if you have a bastion host. Use a relay agent when the database is only
                reachable from inside a private network (a laptop, an on-prem server) and you can't expose it.
              </p>
              <p>
                <span className="font-medium text-foreground">How it fits together.</span>{" "}
                Create an agent below, run it on a machine that can reach the database, then in the SQL connector choose{" "}
                <span className="font-mono text-xs">Relay Agent</span> mode and paste that agent's id. The connector's{" "}
                <span className="font-mono text-xs">Host</span>/<span className="font-mono text-xs">Port</span> are the database's address{" "}
                <em>as seen from the relay agent's machine</em> — usually <span className="font-mono text-xs">localhost</span>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !agents || agents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Radio className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No relay agents yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Create one to connect a database that Astra can't reach directly.
            </p>
            <Button onClick={() => setCreateOpen(true)} data-testid="button-new-relay-agent-empty">
              <Plus className="w-4 h-4 mr-1" /> New Relay Agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <Card key={agent.id} data-testid={`card-relay-agent-${agent.id}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{agent.label}</span>
                      <Badge
                        variant={agent.status === "online" ? "default" : "outline"}
                        className={agent.status === "online" ? "bg-green-600 hover:bg-green-600" : ""}
                        data-testid={`badge-status-${agent.id}`}
                      >
                        {agent.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground w-20 shrink-0">Agent ID</Label>
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate" data-testid={`text-agent-id-${agent.id}`}>
                        {agent.id}
                      </code>
                      <CopyButton value={agent.id} label="agent ID" testId={`button-copy-id-${agent.id}`} />
                      <span className="text-xs text-muted-foreground ml-1">— paste this into the connector's Relay Agent field</span>
                    </div>
                    <div className="text-xs text-muted-foreground flex gap-4">
                      <span>Last seen: {formatWhen(agent.lastSeenAt)}</span>
                      <span>Created: {formatWhen(agent.createdAt)}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRevokeTarget(agent)}
                    data-testid={`button-revoke-${agent.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Revoke
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Relay Agent</DialogTitle>
            <DialogDescription>
              Give it a name you'll recognize — usually where it runs, e.g. "QA laptop" or "on-prem DB host".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="relay-label">Label</Label>
            <Input
              id="relay-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="QA laptop"
              data-testid="input-relay-label"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLabel.trim()) createMutation.mutate(newLabel.trim());
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(newLabel.trim() || "Relay Agent")}
              disabled={createMutation.isPending}
              data-testid="button-create-relay-agent"
            >
              {createMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Token shown once, with the exact command to start the agent */}
      <Dialog open={!!created} onOpenChange={(open) => { if (!open) setCreated(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Relay agent created — copy the token now</DialogTitle>
            <DialogDescription>
              This token is shown once and can't be recovered. If you lose it, revoke this agent and create another.
            </DialogDescription>
          </DialogHeader>

          {created && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Agent ID (for the connector's Relay Agent field)</Label>
                <div className="flex items-center gap-1">
                  <code className="text-xs bg-muted px-2 py-1.5 rounded font-mono flex-1 break-all" data-testid="text-created-id">
                    {created.id}
                  </code>
                  <CopyButton value={created.id} label="agent ID" testId="button-copy-created-id" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Token</Label>
                <div className="flex items-center gap-1">
                  <code className="text-xs bg-muted px-2 py-1.5 rounded font-mono flex-1 break-all" data-testid="text-created-token">
                    {created.token}
                  </code>
                  <CopyButton value={created.token} label="token" testId="button-copy-created-token" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Start the agent on the machine that can reach your database</Label>
                <div className="flex items-start gap-1">
                  <pre className="text-xs bg-muted px-3 py-2 rounded font-mono flex-1 overflow-x-auto whitespace-pre">
{`RELAY_PLATFORM_URL=${platformWsUrl} \\
RELAY_AGENT_TOKEN=${created.token} \\
node scripts/relay-agent.js`}
                  </pre>
                  <CopyButton
                    value={`RELAY_PLATFORM_URL=${platformWsUrl} RELAY_AGENT_TOKEN=${created.token} node scripts/relay-agent.js`}
                    label="command"
                    testId="button-copy-command"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Run from an <span className="font-mono">atlas-agent-platform</span> checkout (the script uses its <span className="font-mono">ws</span> dependency).
                  Leave it running — this row flips to <span className="font-medium">online</span> once it connects.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setCreated(null)} data-testid="button-done-created">I've copied the token</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive" /> Revoke "{revokeTarget?.label}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its token stops working immediately and the agent is disconnected. Any SQL connector set to relay through this agent will
              fail until you point it at a different one. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-revoke"
            >
              {revokeMutation.isPending ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
