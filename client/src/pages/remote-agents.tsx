import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Globe,
  Plus,
  Search,
  ArrowRight,
  Shield,
  Wifi,
  WifiOff,
  AlertTriangle,
  Bot,
  Users,
  X,
  Network,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/stat-card";
import { ErrorState } from "@/components/error-state";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Agent, RemoteAgent } from "@shared/schema";

const TRUST_TIER_CONFIG: Record<string, { label: string; className: string }> = {
  untrusted: { label: "Untrusted", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
  basic: { label: "Basic", className: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20" },
  verified: { label: "Verified", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  trusted: { label: "Trusted", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  privileged: { label: "Privileged", className: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20" },
};

const CONNECTIVITY_CONFIG: Record<string, { label: string; icon: typeof Wifi; className: string }> = {
  online: { label: "Online", icon: Wifi, className: "text-emerald-600 dark:text-emerald-400" },
  offline: { label: "Offline", icon: WifiOff, className: "text-red-600 dark:text-red-400" },
  degraded: { label: "Degraded", icon: AlertTriangle, className: "text-amber-600 dark:text-amber-400" },
  unknown: { label: "Unknown", icon: WifiOff, className: "text-muted-foreground" },
};

export default function RemoteAgents() {
  const [search, setSearch] = useState("");
  const [filterTrust, setFilterTrust] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showRegister, setShowRegister] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCardUrl, setFormCardUrl] = useState("");
  const [formTrustTier, setFormTrustTier] = useState("basic");
  const [formAllowedSkills, setFormAllowedSkills] = useState("");
  const [formProviderName, setFormProviderName] = useState("");
  const [formProviderOrg, setFormProviderOrg] = useState("");

  const { toast } = useToast();

  const { data: remoteAgents, isLoading: loadingRemotes, error: errorRemotes, refetch } = useQuery<RemoteAgent[]>({
    queryKey: ["/api/remote-agents"],
  });
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { agent: any; remote: any }) => {
      const agentRes = await apiRequest("POST", "/api/agents", data.agent);
      const agent = await agentRes.json();
      await apiRequest("POST", "/api/remote-agents", { ...data.remote, agentId: agent.id });
      return agent;
    },
    onSuccess: () => {
      toast({ title: "Remote agent registered", description: "The A2A remote agent has been added to the registry." });
      queryClient.invalidateQueries({ queryKey: ["/api/remote-agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setShowRegister(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormCardUrl("");
    setFormTrustTier("basic");
    setFormAllowedSkills("");
    setFormProviderName("");
    setFormProviderOrg("");
  }

  function handleRegister() {
    if (!formName.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    const skillsList = formAllowedSkills.split(",").map(s => s.trim()).filter(Boolean);
    createMutation.mutate({
      agent: {
        name: formName,
        description: formDescription,
        agentType: "remote",
        status: "active",
        riskTier: "MEDIUM",
        autonomyMode: "assisted",
      },
      remote: {
        agentCardUrl: formCardUrl || null,
        agentCardData: {
          name: formName,
          description: formDescription,
          capabilities: {},
          skills: skillsList.map(s => ({ id: s, name: s })),
          provider: { name: formProviderName, organization: formProviderOrg },
        },
        trustTier: formTrustTier,
        connectivityStatus: "unknown",
        allowedSkills: skillsList,
        securityRequirements: {},
        defaultInputModes: ["text/plain"],
        defaultOutputModes: ["text/plain"],
        providerInfo: { name: formProviderName, organization: formProviderOrg },
      },
    });
  }

  const agentMap = new Map((agents || []).map(a => [a.id, a]));

  const filtered = remoteAgents?.filter(r => {
    const agent = agentMap.get(r.agentId || "");
    const name = agent?.name || "";
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTrust !== "all" && r.trustTier !== filterTrust) return false;
    if (filterStatus !== "all" && r.connectivityStatus !== filterStatus) return false;
    return true;
  });

  const onlineCount = remoteAgents?.filter(r => r.connectivityStatus === "online").length || 0;
  const trustedCount = remoteAgents?.filter(r => r.trustTier === "trusted" || r.trustTier === "privileged").length || 0;

  if (loadingRemotes) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (errorRemotes) return <ErrorState message="Failed to load remote agents" onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-remote-agents">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agent Registry</h1>
          <p className="text-sm text-muted-foreground">
            Remote agents connected via Google A2A protocol
          </p>
        </div>
        <Button onClick={() => setShowRegister(true)} data-testid="button-register-remote">
          <Plus className="w-4 h-4 mr-1.5" /> Register Remote Agent
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Remote Agents" value={remoteAgents?.length || 0} icon={Globe} variant="default" testId="stat-remote-total" />
        <StatCard title="Online" value={onlineCount} icon={Wifi} variant="success" testId="stat-remote-online" />
        <StatCard title="Trusted+" value={trustedCount} icon={Shield} variant="default" testId="stat-remote-trusted" />
        <StatCard title="All Agents" value={agents?.length || 0} icon={Bot} variant="default" testId="stat-all-agents" />
      </div>

      <div className="flex items-center gap-1 border-b" data-testid="registry-tabs">
        <Link href="/agents">
          <Button variant="ghost" size="sm" className="rounded-none border-b-2 border-transparent text-muted-foreground" data-testid="tab-agents">
            <Bot className="w-3.5 h-3.5 mr-1.5" /> All Agents
          </Button>
        </Link>
        <Link href="/agents/teams">
          <Button variant="ghost" size="sm" className="rounded-none border-b-2 border-transparent text-muted-foreground" data-testid="tab-teams">
            <Users className="w-3.5 h-3.5 mr-1.5" /> Teams
          </Button>
        </Link>
        <Link href="/agents/remote">
          <Button variant="ghost" size="sm" className="rounded-none border-b-2 border-primary" data-testid="tab-remote">
            <Globe className="w-3.5 h-3.5 mr-1.5" /> Remote Agents (A2A)
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search remote agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-remote"
          />
        </div>

        <Select value={filterTrust} onValueChange={setFilterTrust}>
          <SelectTrigger className="w-[150px]" data-testid="filter-trust">
            <SelectValue placeholder="Trust Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="untrusted">Untrusted</SelectItem>
            <SelectItem value="basic">Basic</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="trusted">Trusted</SelectItem>
            <SelectItem value="privileged">Privileged</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]" data-testid="filter-connectivity">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="degraded">Degraded</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>

        {(filterTrust !== "all" || filterStatus !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterTrust("all"); setFilterStatus("all"); }} data-testid="button-clear-filters">
            <X className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Trust Tier</TableHead>
                <TableHead>Connectivity</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead>AgentCard</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map((remote) => {
                const agent = agentMap.get(remote.agentId || "");
                const trustConfig = TRUST_TIER_CONFIG[remote.trustTier || "basic"];
                const connConfig = CONNECTIVITY_CONFIG[remote.connectivityStatus || "unknown"] || CONNECTIVITY_CONFIG["unknown"];
                const ConnIcon = connConfig.icon;
                const cardData = remote.agentCardData as any;
                const provider = remote.providerInfo as any;
                const skills = (remote.allowedSkills as string[]) || [];

                return (
                  <TableRow key={remote.id} data-testid={`row-remote-${remote.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2.5" data-testid={`link-remote-${remote.id}`}>
                        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-cyan-500/10 shrink-0">
                          <Globe className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{agent?.name || cardData?.name || "Unknown"}</span>
                          <span className="text-[11px] text-muted-foreground">{agent?.description?.substring(0, 60) || cardData?.description?.substring(0, 60) || "No description"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{provider?.organization || provider?.name || "\u2014"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[11px] ${trustConfig?.className || ""}`}>
                        {trustConfig?.label || remote.trustTier}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <ConnIcon className={`w-3.5 h-3.5 ${connConfig.className}`} />
                        <span className={`text-xs ${connConfig.className}`}>{connConfig.label}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {skills.slice(0, 3).map(s => (
                          <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                        ))}
                        {skills.length > 3 && (
                          <Badge variant="secondary" className="text-[10px]">+{skills.length - 3}</Badge>
                        )}
                        {skills.length === 0 && <span className="text-[11px] text-muted-foreground">No skills</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {remote.agentCardUrl ? (
                        <a href={remote.agentCardUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1" data-testid={`link-card-${remote.id}`}>
                          <ExternalLink className="w-3 h-3" /> Card
                        </a>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Manual</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {agent && (
                        <Link href={`/agents/${agent.id}`}>
                          <Button variant="ghost" size="icon" data-testid={`button-view-remote-${remote.id}`}>
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Globe className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No remote agents found</p>
              <Button variant="outline" size="sm" onClick={() => setShowRegister(true)} data-testid="button-register-remote-empty">
                <Plus className="w-3.5 h-3.5 mr-1" /> Register your first remote agent
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-register">Register Remote Agent (A2A)</DialogTitle>
            <DialogDescription>
              Add an external agent via the Google Agent-to-Agent protocol. Provide the AgentCard URL or enter details manually.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Agent Name *</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Travel Booking Agent"
                data-testid="input-remote-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="What does this remote agent do?"
                className="resize-none"
                data-testid="input-remote-description"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>AgentCard URL</Label>
              <Input
                value={formCardUrl}
                onChange={e => setFormCardUrl(e.target.value)}
                placeholder="https://example.com/.well-known/agent.json"
                data-testid="input-remote-card-url"
              />
              <span className="text-[11px] text-muted-foreground">URL where the A2A AgentCard is hosted. Leave empty for manual entry.</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Provider Name</Label>
                <Input
                  value={formProviderName}
                  onChange={e => setFormProviderName(e.target.value)}
                  placeholder="Provider name"
                  data-testid="input-remote-provider"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Organization</Label>
                <Input
                  value={formProviderOrg}
                  onChange={e => setFormProviderOrg(e.target.value)}
                  placeholder="Organization"
                  data-testid="input-remote-org"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Trust Tier</Label>
              <Select value={formTrustTier} onValueChange={setFormTrustTier}>
                <SelectTrigger data-testid="select-trust-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="untrusted">Untrusted</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="trusted">Trusted</SelectItem>
                  <SelectItem value="privileged">Privileged</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[11px] text-muted-foreground">Determines what actions this remote agent can perform in your platform.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Allowed Skills</Label>
              <Input
                value={formAllowedSkills}
                onChange={e => setFormAllowedSkills(e.target.value)}
                placeholder="search, booking, analysis (comma-separated)"
                data-testid="input-remote-skills"
              />
              <span className="text-[11px] text-muted-foreground">Whitelist of skill IDs this agent may execute. Leave empty for unrestricted.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRegister(false); resetForm(); }} data-testid="button-cancel-register">Cancel</Button>
            <Button
              onClick={handleRegister}
              disabled={createMutation.isPending}
              data-testid="button-confirm-register"
            >
              {createMutation.isPending ? "Registering..." : "Register Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
