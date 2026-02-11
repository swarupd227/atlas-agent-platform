import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download, Star, Shield, CheckCircle2, Globe, Terminal, Package,
  ArrowLeft, Wrench, Database, BookOpen, AlertTriangle, Clock,
  ExternalLink, Tag,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MarketplaceServer } from "@shared/schema";

const RISK_VARIANT: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  LOW: "secondary",
  MEDIUM: "outline",
  HIGH: "destructive",
  CRITICAL: "destructive",
};

function formatDownloads(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function MarketplaceDetailPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/integrations/marketplace/:id");
  const serverId = params?.id;

  const { data: server, isLoading } = useQuery<MarketplaceServer>({
    queryKey: [`/api/marketplace/servers/${serverId}`],
    enabled: !!serverId,
  });

  const installMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/marketplace/servers/${serverId}/install`, { requestedBy: "current_user" });
      return res.json();
    },
    onSuccess: (data: { autoApproved?: boolean }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/marketplace/servers/${serverId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/servers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/install-requests"] });
      toast({
        title: data.autoApproved ? "Server installed" : "Install request submitted",
        description: data.autoApproved ? "Server auto-approved and ready to use" : "Awaiting Security Admin approval",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Install failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!server) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Link href="/integrations/marketplace">
          <Button variant="ghost" size="sm" data-testid="button-back-marketplace">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Marketplace
          </Button>
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Package className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Server not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const capabilities = server.capabilities as { tools?: boolean; resources?: boolean; prompts?: boolean } | null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <Link href="/integrations/marketplace">
        <Button variant="ghost" size="sm" data-testid="button-back-marketplace">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Marketplace
        </Button>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card data-testid="card-server-info">
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-md bg-muted shrink-0">
                  <Package className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-lg" data-testid="text-detail-name">
                    {server.displayName || server.name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{server.namespace}/{server.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">{server.publisher}</span>
                    {server.publisherVerified && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {server.installStatus === "installed" ? (
                  <Badge variant="default" data-testid="badge-detail-installed">Installed</Badge>
                ) : server.installStatus === "pending" ? (
                  <Badge variant="outline" data-testid="badge-detail-pending">Pending Approval</Badge>
                ) : (
                  <Button
                    onClick={() => installMutation.mutate()}
                    disabled={installMutation.isPending}
                    data-testid="button-detail-install"
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    {installMutation.isPending ? "Installing..." : "Install Server"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground" data-testid="text-detail-description">
                {server.description}
              </p>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">
                  {server.transportType === "stdio" ? (
                    <Terminal className="w-3 h-3 mr-1" />
                  ) : (
                    <Globe className="w-3 h-3 mr-1" />
                  )}
                  {server.transportType}
                </Badge>
                <Badge variant={RISK_VARIANT[server.riskTier || "MEDIUM"]} className="text-[10px]">
                  <Shield className="w-3 h-3 mr-1" />
                  {server.riskTier}
                </Badge>
                <Badge variant="outline" className="text-[10px]">v{server.version}</Badge>
                <Badge variant="outline" className="text-[10px]">{server.category}</Badge>
              </div>

              {server.url && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <ExternalLink className="w-3 h-3" />
                  <span>{server.url}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-capabilities">
            <CardHeader>
              <CardTitle className="text-sm">Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md bg-muted/50">
                  <Wrench className={`w-5 h-5 ${capabilities?.tools ? "text-blue-500" : "text-muted-foreground/30"}`} />
                  <span className="text-sm font-medium">{server.toolCount || 0}</span>
                  <span className="text-[10px] text-muted-foreground">Tools</span>
                </div>
                <div className="flex flex-col items-center gap-2 p-4 rounded-md bg-muted/50">
                  <Database className={`w-5 h-5 ${capabilities?.resources ? "text-green-500" : "text-muted-foreground/30"}`} />
                  <span className="text-sm font-medium">{server.resourceCount || 0}</span>
                  <span className="text-[10px] text-muted-foreground">Resources</span>
                </div>
                <div className="flex flex-col items-center gap-2 p-4 rounded-md bg-muted/50">
                  <BookOpen className={`w-5 h-5 ${capabilities?.prompts ? "text-violet-500" : "text-muted-foreground/30"}`} />
                  <span className="text-sm font-medium">{server.promptCount || 0}</span>
                  <span className="text-[10px] text-muted-foreground">Prompts</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {server.tags && server.tags.length > 0 && (
            <Card data-testid="card-tags">
              <CardHeader>
                <CardTitle className="text-sm">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 flex-wrap">
                  {server.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px]">
                      <Tag className="w-3 h-3 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card data-testid="card-stats">
            <CardHeader>
              <CardTitle className="text-sm">Statistics</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {server.downloads != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    Downloads
                  </span>
                  <span className="text-sm font-medium">{formatDownloads(server.downloads)}</span>
                </div>
              )}
              {server.rating != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5" />
                    Rating
                  </span>
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" />
                    <span className="text-sm font-medium">{server.rating.toFixed(1)}</span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Version
                </span>
                <span className="text-sm font-medium">{server.version}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  Risk Tier
                </span>
                <Badge variant={RISK_VARIANT[server.riskTier || "MEDIUM"]} className="text-[10px]">
                  {server.riskTier}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-trust-info">
            <CardHeader>
              <CardTitle className="text-sm">Trust Information</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Publisher</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">{server.publisher}</span>
                  {server.publisherVerified && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Namespace</span>
                <span className="text-sm font-medium">{server.namespace}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Verified</span>
                <Badge variant={server.publisherVerified ? "default" : "outline"} className="text-[10px]">
                  {server.publisherVerified ? "Verified" : "Unverified"}
                </Badge>
              </div>
              {!server.publisherVerified && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 mt-1">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                  <span className="text-[11px] text-muted-foreground">
                    This server is from an unverified publisher. Installation requires Security Admin approval.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
