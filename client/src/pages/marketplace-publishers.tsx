import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ShieldCheck, Plus, ArrowLeft, Building2, Globe2, CheckCircle2,
  AlertTriangle, Package, Shield, Users,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TrustedPublisher } from "@shared/schema";

const TRUST_VARIANT: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  trusted: "default",
  verified: "secondary",
  unverified: "outline",
};

export default function MarketplacePublishersPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [namespace, setNamespace] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [trustLevel, setTrustLevel] = useState("verified");
  const [isInternal, setIsInternal] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);

  const { data: publishers, isLoading } = useQuery<TrustedPublisher[]>({
    queryKey: ["/api/marketplace/trusted-publishers"],
  });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/marketplace/trusted-publishers", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/trusted-publishers"] });
      toast({ title: "Publisher added" });
      resetForm();
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add publisher", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/marketplace/trusted-publishers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/trusted-publishers"] });
      toast({ title: "Publisher removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove publisher", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setNamespace("");
    setDisplayName("");
    setDescription("");
    setTrustLevel("verified");
    setIsInternal(false);
    setAutoApprove(false);
  }

  function handleSubmit() {
    createMutation.mutate({
      namespace,
      displayName,
      description: description || undefined,
      trustLevel,
      isInternal,
      autoApprove,
      serverCount: 0,
      status: "active",
    });
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const trusted = publishers?.filter((p) => p.trustLevel === "trusted") || [];
  const verified = publishers?.filter((p) => p.trustLevel === "verified") || [];
  const unverified = publishers?.filter((p) => p.trustLevel === "unverified") || [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <Link href="/integrations/marketplace">
        <Button variant="ghost" size="sm" data-testid="button-back-marketplace">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Marketplace
        </Button>
      </Link>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-publishers-title">Trusted Publishers</h1>
          <p className="text-sm text-muted-foreground">Manage publisher trust levels and auto-approval policies</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-add-publisher">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Publisher
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card data-testid="stat-trusted">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Trusted</span>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              <span className="text-xl font-semibold">{trusted.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-verified">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Verified</span>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-500" />
              <span className="text-xl font-semibold">{verified.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-unverified">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Unverified</span>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <span className="text-xl font-semibold">{unverified.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {(!publishers || publishers.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Users className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-publishers">No trusted publishers configured</p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-add-publisher-empty">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Publisher
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {publishers.map((pub) => (
            <Card key={pub.id} data-testid={`card-publisher-${pub.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                    {pub.isInternal ? (
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Globe2 className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <CardTitle className="text-sm font-medium" data-testid={`text-publisher-name-${pub.id}`}>
                      {pub.displayName}
                    </CardTitle>
                    <span className="text-[10px] text-muted-foreground font-mono">{pub.namespace}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant={TRUST_VARIANT[pub.trustLevel] || "outline"} className="text-[10px]" data-testid={`badge-trust-${pub.id}`}>
                    <Shield className="w-3 h-3 mr-1" />
                    {pub.trustLevel}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {pub.description && (
                  <p className="text-[11px] text-muted-foreground">{pub.description}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {pub.isInternal && (
                    <Badge variant="outline" className="text-[10px]">
                      <Building2 className="w-3 h-3 mr-1" />
                      Internal
                    </Badge>
                  )}
                  {pub.autoApprove && (
                    <Badge variant="secondary" className="text-[10px]">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Auto-Approve
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    <Package className="w-3 h-3 mr-1" />
                    {pub.serverCount} servers
                  </Badge>
                  <Badge variant={pub.status === "active" ? "default" : "outline"} className="text-[10px]">
                    {pub.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMutation.mutate(pub.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-remove-publisher-${pub.id}`}
                  >
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-add-publisher">
          <DialogHeader>
            <DialogTitle>Add Trusted Publisher</DialogTitle>
            <DialogDescription>Register a new publisher namespace for the marketplace</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pub-namespace">Namespace *</Label>
              <Input
                id="pub-namespace"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                placeholder="my-org"
                data-testid="input-publisher-namespace"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pub-name">Display Name *</Label>
              <Input
                id="pub-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="My Organization"
                data-testid="input-publisher-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pub-desc">Description</Label>
              <Textarea
                id="pub-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Publisher description..."
                data-testid="input-publisher-description"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Trust Level</Label>
              <Select value={trustLevel} onValueChange={setTrustLevel}>
                <SelectTrigger data-testid="select-trust-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trusted" data-testid="option-trust-trusted">Trusted (auto-approve eligible)</SelectItem>
                  <SelectItem value="verified" data-testid="option-trust-verified">Verified (requires approval)</SelectItem>
                  <SelectItem value="unverified" data-testid="option-trust-unverified">Unverified (requires approval)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="pub-internal">Internal Publisher</Label>
              <Switch
                id="pub-internal"
                checked={isInternal}
                onCheckedChange={setIsInternal}
                data-testid="switch-internal"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="pub-auto-approve">Auto-Approve Installs</Label>
              <Switch
                id="pub-auto-approve"
                checked={autoApprove}
                onCheckedChange={setAutoApprove}
                data-testid="switch-auto-approve"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleSubmit}
              disabled={!namespace || !displayName || createMutation.isPending}
              data-testid="button-submit-publisher"
            >
              {createMutation.isPending ? "Adding..." : "Add Publisher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
