import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AppWindow, Shield, ShieldCheck, Server, Eye, Settings, Lock, Unlock, Package,
} from "lucide-react";
import { Link } from "wouter";
import McpAppRenderer from "@/components/mcp-app-renderer";

interface McpApp {
  id: string;
  name: string;
  version?: string;
  description?: string;
  serverId?: string;
  serverName?: string;
  status?: string;
  trustTier?: string;
  appType?: string;
  capabilities?: string[];
  sandboxPolicy?: string[];
  consented?: boolean;
}

interface McpServer {
  id: string;
  name: string;
}

function getStatusVariant(status?: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "registered":
      return "secondary";
    case "disabled":
      return "destructive";
    default:
      return "outline";
  }
}

function getTrustVariant(tier?: string): "default" | "secondary" | "destructive" | "outline" {
  switch (tier) {
    case "trusted":
      return "default";
    case "verified":
      return "secondary";
    case "basic":
      return "outline";
    case "untrusted":
      return "destructive";
    default:
      return "outline";
  }
}

function getTrustIcon(tier?: string) {
  switch (tier) {
    case "trusted":
    case "verified":
      return <ShieldCheck className="h-3 w-3" />;
    default:
      return <Shield className="h-3 w-3" />;
  }
}

export default function McpAppsPage() {
  const [previewAppId, setPreviewAppId] = useState<string | null>(null);

  const { data: apps, isLoading: loadingApps } = useQuery<McpApp[]>({
    queryKey: ["/api/mcp-apps"],
  });

  const { data: servers, isLoading: loadingServers } = useQuery<McpServer[]>({
    queryKey: ["/api/mcp-servers"],
  });

  const serverMap = new Map<string, string>();
  if (servers) {
    for (const s of servers) {
      serverMap.set(s.id, s.name);
    }
  }

  const isLoading = loadingApps || loadingServers;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const appList = apps || [];
  const previewApp = appList.find((a) => a.id === previewAppId);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <AppWindow className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-mcp-apps-title">
              MCP Apps
            </h1>
            <Badge variant="secondary" data-testid="badge-app-count">
              {appList.length}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="text-mcp-apps-subtitle">
            Interactive HTML dashboards from MCP servers
          </p>
        </div>
      </div>

      {appList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <AppWindow className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-apps">
              No MCP apps registered
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {appList.map((app) => {
            const resolvedServerName = app.serverName || (app.serverId ? serverMap.get(app.serverId) : undefined);
            return (
              <Card key={app.id} data-testid={`card-mcp-app-${app.id}`} className="flex flex-col">
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm font-medium" data-testid={`text-app-name-${app.id}`}>
                        {app.name}
                      </CardTitle>
                      {app.version && (
                        <Badge variant="outline" className="text-[10px]" data-testid={`badge-version-${app.id}`}>
                          v{app.version}
                        </Badge>
                      )}
                    </div>
                    {app.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2" data-testid={`text-app-desc-${app.id}`}>
                        {app.description}
                      </p>
                    )}
                  </div>
                  <Badge variant={getStatusVariant(app.status)} className="text-[10px] shrink-0" data-testid={`badge-status-${app.id}`}>
                    {app.status || "unknown"}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 flex-1">
                  {resolvedServerName && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground" data-testid={`text-server-name-${app.id}`}>
                      <Server className="h-3 w-3 shrink-0" />
                      <span className="truncate">{resolvedServerName}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={getTrustVariant(app.trustTier)} className="text-[10px]" data-testid={`badge-trust-${app.id}`}>
                      {getTrustIcon(app.trustTier)}
                      {app.trustTier || "unknown"}
                    </Badge>
                    {app.appType && (
                      <Badge variant="outline" className="text-[10px]" data-testid={`badge-type-${app.id}`}>
                        <Settings className="h-3 w-3" />
                        {app.appType}
                      </Badge>
                    )}
                  </div>

                  {app.capabilities && app.capabilities.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap" data-testid={`container-capabilities-${app.id}`}>
                      <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                      {app.capabilities.map((cap) => (
                        <Badge key={cap} variant="secondary" className="text-[10px]" data-testid={`badge-cap-${app.id}-${cap}`}>
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {app.sandboxPolicy && app.sandboxPolicy.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap" data-testid={`container-sandbox-${app.id}`}>
                      <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                      {app.sandboxPolicy.map((policy) => (
                        <Badge key={policy} variant="outline" className="text-[10px]" data-testid={`badge-sandbox-${app.id}-${policy}`}>
                          {policy}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <Separator className="mt-auto" />

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewAppId(app.id)}
                      data-testid={`button-preview-${app.id}`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </Button>
                    <Link href={`/mcp-apps/${app.id}`}>
                      <Button variant="outline" size="sm" data-testid={`link-details-${app.id}`}>
                        Details
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!previewAppId} onOpenChange={(open) => { if (!open) setPreviewAppId(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="dialog-preview">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap" data-testid="text-preview-title">
              <AppWindow className="h-5 w-5" />
              {previewApp?.name || "App Preview"}
            </DialogTitle>
          </DialogHeader>
          {previewAppId && (
            <McpAppRenderer appId={previewAppId} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
