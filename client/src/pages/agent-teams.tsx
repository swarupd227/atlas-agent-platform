import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Users,
  Plus,
  Search,
  ArrowRight,
  Bot,
  Globe,
  X,
  UserPlus,
  Crown,
  Eye,
  Trash2,
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
import type { Agent, AgentTeam } from "@shared/schema";

const ROLE_CONFIG: Record<string, { label: string; icon: typeof Crown }> = {
  lead: { label: "Lead", icon: Crown },
  member: { label: "Member", icon: Users },
  observer: { label: "Observer", icon: Eye },
};

export default function AgentTeams() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showManage, setShowManage] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [addMemberId, setAddMemberId] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("member");

  const { toast } = useToast();

  const { data: agents, isLoading, error, refetch } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const teamAgents = agents?.filter(a => a.agentType === "team") || [];
  const nonTeamAgents = agents?.filter(a => a.agentType !== "team") || [];

  const { data: teamMembers, refetch: refetchMembers } = useQuery<AgentTeam[]>({
    queryKey: ["/api/agent-teams", showManage, "members"],
    queryFn: async () => {
      if (!showManage) return [];
      const res = await fetch(`/api/agent-teams/${showManage}/members`);
      return res.json();
    },
    enabled: !!showManage,
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      return apiRequest("POST", "/api/agents", {
        name: data.name,
        description: data.description,
        agentType: "team",
        status: "active",
        riskTier: "MEDIUM",
        autonomyMode: "assisted",
      });
    },
    onSuccess: () => {
      toast({ title: "Team created", description: "The agent team has been added to the registry." });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setShowCreate(false);
      setFormName("");
      setFormDescription("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create team", description: err.message, variant: "destructive" });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async (data: { teamAgentId: string; memberAgentId: string; role: string }) => {
      return apiRequest("POST", "/api/agent-teams/members", data);
    },
    onSuccess: () => {
      toast({ title: "Member added" });
      refetchMembers();
      setAddMemberId("");
      setAddMemberRole("member");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add member", description: err.message, variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/agent-teams/members/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Member removed" });
      refetchMembers();
    },
  });

  const filtered = teamAgents.filter(a => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (isLoading) {
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

  if (error) return <ErrorState message="Failed to load agents" onRetry={() => refetch()} />;

  const managedTeam = teamAgents.find(a => a.id === showManage);

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-agent-teams">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agent Registry</h1>
          <p className="text-sm text-muted-foreground">
            Agent teams for multi-agent orchestration
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-team">
          <Plus className="w-4 h-4 mr-1.5" /> Create Team
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Teams" value={teamAgents.length} icon={Users} variant="default" testId="stat-teams-total" />
        <StatCard title="Single Agents" value={agents?.filter(a => a.agentType === "single")?.length || 0} icon={Bot} variant="default" testId="stat-single" />
        <StatCard title="Remote (A2A)" value={agents?.filter(a => a.agentType === "remote")?.length || 0} icon={Globe} variant="default" testId="stat-remote" />
        <StatCard title="All Agents" value={agents?.length || 0} icon={Bot} variant="default" testId="stat-all" />
      </div>

      <div className="flex items-center gap-1 border-b" data-testid="registry-tabs">
        <Link href="/agents">
          <Button variant="ghost" size="sm" className="rounded-none border-b-2 border-transparent text-muted-foreground" data-testid="tab-agents">
            <Bot className="w-3.5 h-3.5 mr-1.5" /> All Agents
          </Button>
        </Link>
        <Link href="/agents/teams">
          <Button variant="ghost" size="sm" className="rounded-none border-b-2 border-primary" data-testid="tab-teams">
            <Users className="w-3.5 h-3.5 mr-1.5" /> Teams
          </Button>
        </Link>
        <Link href="/agents/remote">
          <Button variant="ghost" size="sm" className="rounded-none border-b-2 border-transparent text-muted-foreground" data-testid="tab-remote">
            <Globe className="w-3.5 h-3.5 mr-1.5" /> Remote Agents (A2A)
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-teams"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Manage</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((team) => (
                <TableRow key={team.id} data-testid={`row-team-${team.id}`}>
                  <TableCell>
                    <Link href={`/agents/${team.id}`}>
                      <div className="flex items-center gap-2.5 cursor-pointer" data-testid={`link-team-${team.id}`}>
                        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-500/10 shrink-0">
                          <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium hover:underline">{team.name}</span>
                          <span className="text-[11px] text-muted-foreground">{team.description?.substring(0, 50) || "No description"}</span>
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                      {team.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px]">v{team.currentVersion}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{team.riskTier}</span>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => setShowManage(team.id)} data-testid={`button-manage-team-${team.id}`}>
                      <UserPlus className="w-3.5 h-3.5 mr-1" /> Members
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Link href={`/agents/${team.id}`}>
                      <Button variant="ghost" size="icon" data-testid={`button-view-team-${team.id}`}>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Users className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No teams created yet</p>
              <Button variant="outline" size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-team-empty">
                <Plus className="w-3.5 h-3.5 mr-1" /> Create your first team
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-create-team">Create Agent Team</DialogTitle>
            <DialogDescription>
              Create a team agent that orchestrates multiple member agents for multi-agent workflows.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Team Name *</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Customer Service Team"
                data-testid="input-team-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="What does this team do?"
                className="resize-none"
                data-testid="input-team-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} data-testid="button-cancel-create-team">Cancel</Button>
            <Button
              onClick={() => {
                if (!formName.trim()) {
                  toast({ title: "Name required", variant: "destructive" });
                  return;
                }
                createTeamMutation.mutate({ name: formName, description: formDescription });
              }}
              disabled={createTeamMutation.isPending}
              data-testid="button-confirm-create-team"
            >
              {createTeamMutation.isPending ? "Creating..." : "Create Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showManage !== null} onOpenChange={(open) => { if (!open) setShowManage(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-manage-members">
              Manage Members: {managedTeam?.name}
            </DialogTitle>
            <DialogDescription>
              Add or remove agents from this team and assign roles.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Current Members</Label>
              {(!teamMembers || teamMembers.length === 0) && (
                <span className="text-sm text-muted-foreground">No members yet</span>
              )}
              {teamMembers?.map(m => {
                const memberAgent = agents?.find(a => a.id === m.memberAgentId);
                const roleConf = ROLE_CONFIG[m.role || "member"];
                const RoleIcon = roleConf?.icon || Users;
                return (
                  <div key={m.id} className="flex items-center justify-between gap-2 p-2 rounded-md border" data-testid={`member-${m.id}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 shrink-0">
                        {memberAgent?.agentType === "remote" ? <Globe className="w-3 h-3 text-primary" /> : <Bot className="w-3 h-3 text-primary" />}
                      </div>
                      <span className="text-sm">{memberAgent?.name || m.memberAgentId}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        <RoleIcon className="w-2.5 h-2.5 mr-0.5" />
                        {roleConf?.label || m.role}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMemberMutation.mutate(m.id)}
                      disabled={removeMemberMutation.isPending}
                      data-testid={`button-remove-member-${m.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="border-t pt-3 flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Add Member</Label>
              <div className="flex items-center gap-2">
                <Select value={addMemberId} onValueChange={setAddMemberId}>
                  <SelectTrigger className="flex-1" data-testid="select-add-member">
                    <SelectValue placeholder="Select agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {nonTeamAgents
                      .filter(a => !teamMembers?.some(m => m.memberAgentId === a.id))
                      .map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.agentType === "remote" ? "[A2A] " : ""}{a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select value={addMemberRole} onValueChange={setAddMemberRole}>
                  <SelectTrigger className="w-[110px]" data-testid="select-member-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="observer">Observer</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!addMemberId || !showManage) return;
                    addMemberMutation.mutate({
                      teamAgentId: showManage,
                      memberAgentId: addMemberId,
                      role: addMemberRole,
                    });
                  }}
                  disabled={!addMemberId || addMemberMutation.isPending}
                  data-testid="button-add-member"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1" /> Add
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManage(null)} data-testid="button-close-manage">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
