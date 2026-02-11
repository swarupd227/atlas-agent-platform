import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Shield, ShieldCheck, ShieldAlert, ExternalLink, X, Loader2, AppWindow } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface McpApp {
  id: string;
  name: string;
  description?: string;
  serverName?: string;
  trustLevel?: "verified" | "community" | "unknown";
  capabilities?: string[];
  consented?: boolean;
}

interface McpAppRendererProps {
  appId: string;
  contextType?: "run" | "approval";
  contextId?: string;
  className?: string;
}

interface McpAppConsentDialogProps {
  app: McpApp;
  open: boolean;
  onConsent: () => void;
  onDeny: () => void;
}

function getTrustIcon(trustLevel?: string) {
  switch (trustLevel) {
    case "verified":
      return <ShieldCheck className="h-4 w-4 text-green-500" />;
    case "community":
      return <Shield className="h-4 w-4 text-yellow-500" />;
    default:
      return <ShieldAlert className="h-4 w-4 text-red-500" />;
  }
}

function getTrustLabel(trustLevel?: string) {
  switch (trustLevel) {
    case "verified":
      return "Verified";
    case "community":
      return "Community";
    default:
      return "Unknown";
  }
}

function getTrustVariant(trustLevel?: string): "default" | "secondary" | "destructive" | "outline" {
  switch (trustLevel) {
    case "verified":
      return "default";
    case "community":
      return "secondary";
    default:
      return "destructive";
  }
}

export function McpAppConsentDialog({ app, open, onConsent, onDeny }: McpAppConsentDialogProps) {
  const { toast } = useToast();

  const consentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mcp-apps/${app.id}/consent`, {
        userId: "current-user",
        capabilities: app.capabilities || [],
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-apps", app.id] });
      toast({ title: "Access granted", description: `You allowed ${app.name} to run.` });
      onConsent();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to grant consent", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDeny(); }}>
      <DialogContent data-testid="dialog-mcp-consent">
        <DialogHeader>
          <DialogTitle data-testid="text-consent-title" className="flex items-center gap-2 flex-wrap">
            <AppWindow className="h-5 w-5" />
            Allow {app.name}?
          </DialogTitle>
          <DialogDescription data-testid="text-consent-description">
            {app.description || "This MCP app is requesting permission to run in your environment."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {app.serverName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-consent-server">
              <ExternalLink className="h-4 w-4" />
              <span>Server: {app.serverName}</span>
            </div>
          )}

          {app.capabilities && app.capabilities.length > 0 && (
            <div className="space-y-2" data-testid="container-consent-capabilities">
              <p className="text-sm font-medium">Required capabilities:</p>
              <div className="flex flex-wrap gap-1">
                {app.capabilities.map((cap) => (
                  <Badge key={cap} variant="secondary" data-testid={`badge-capability-${cap}`}>
                    {cap}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm" data-testid="text-consent-trust">
            {getTrustIcon(app.trustLevel)}
            <span>Trust level: {getTrustLabel(app.trustLevel)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onDeny}
            data-testid="button-consent-deny"
          >
            <X className="h-4 w-4" />
            Deny
          </Button>
          <Button
            onClick={() => consentMutation.mutate()}
            disabled={consentMutation.isPending}
            data-testid="button-consent-allow"
          >
            {consentMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Allow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function McpAppRenderer({ appId, contextType, contextId, className }: McpAppRendererProps) {
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const { data: app, isLoading, error } = useQuery<McpApp>({
    queryKey: ["/api/mcp-apps", appId],
  });

  useEffect(() => {
    if (app && !app.consented) {
      setShowConsent(true);
    }
  }, [app]);

  const sessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mcp-apps/${appId}/sessions`, {
        contextType,
        contextId,
      });
      return res.json();
    },
    onSuccess: (data: { id: string }) => {
      setSessionId(data.id);
    },
    onError: (err: Error) => {
      toast({ title: "Session creation failed", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (app && app.consented && !sessionId) {
      sessionMutation.mutate();
    }
  }, [app, sessionId]);

  const bridgeMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      const res = await apiRequest("POST", `/api/mcp-apps/${appId}/bridge`, {
        sessionId,
        payload,
      });
      return res.json();
    },
  });

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!event.data || event.data.type !== "mcp-app-bridge") return;
      if (!sessionId) return;

      bridgeMutation.mutate(event.data.payload, {
        onSuccess: (response) => {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "mcp-app-bridge-response", payload: response },
            "*"
          );
        },
        onError: (err: Error) => {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "mcp-app-bridge-error", error: err.message },
            "*"
          );
        },
      });
    },
    [sessionId, appId, bridgeMutation]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  if (isLoading) {
    return (
      <Card className={className} data-testid="skeleton-mcp-app">
        <CardHeader className="flex flex-row items-center gap-2 flex-wrap">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full h-[300px] rounded-md" />
        </CardContent>
      </Card>
    );
  }

  if (error || !app) {
    return (
      <Card className={className} data-testid="error-mcp-app">
        <CardHeader className="flex flex-row items-center gap-2 flex-wrap">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <CardTitle className="text-base">App Not Found</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" data-testid="text-error-message">
            {error instanceof Error ? error.message : "The requested MCP app could not be loaded."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <McpAppConsentDialog
        app={app}
        open={showConsent}
        onConsent={() => setShowConsent(false)}
        onDeny={() => setShowConsent(false)}
      />

      <Card className={className} data-testid={`card-mcp-app-${appId}`}>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <AppWindow className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base" data-testid="text-app-name">{app.name}</CardTitle>
          </div>
          <Badge variant={getTrustVariant(app.trustLevel)} data-testid="badge-trust-level">
            {getTrustIcon(app.trustLevel)}
            {getTrustLabel(app.trustLevel)}
          </Badge>
        </CardHeader>
        <CardContent>
          {app.consented ? (
            <iframe
              ref={iframeRef}
              src={`/api/mcp-apps/${appId}/resource`}
              sandbox="allow-scripts"
              title={`MCP App: ${app.name}`}
              className="w-full border border-border rounded-md"
              style={{ minHeight: "300px" }}
              data-testid="iframe-mcp-app"
            />
          ) : (
            <div
              className="w-full flex flex-col items-center justify-center gap-3 border border-border rounded-md p-6"
              style={{ minHeight: "300px" }}
              data-testid="container-consent-required"
            >
              <Shield className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                This app requires your consent before it can run.
              </p>
              <Button
                variant="outline"
                onClick={() => setShowConsent(true)}
                data-testid="button-show-consent"
              >
                Review Permissions
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default McpAppRenderer;
