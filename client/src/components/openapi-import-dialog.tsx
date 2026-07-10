import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileCode2, CheckCircle2, KeyRound } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ParsedOperation {
  name: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[] };
  riskClassification: "low" | "medium" | "high";
}

interface ParsedSpec {
  title: string;
  version: string | null;
  baseUrl: string | null;
  operations: ParsedOperation[];
}

const RISK_BADGE_CLASS: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700",
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-300 dark:border-red-700",
};

export function OpenApiImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [specUrl, setSpecUrl] = useState("");
  const [specText, setSpecText] = useState("");
  const [inputTab, setInputTab] = useState<"url" | "paste">("url");

  const [parsed, setParsed] = useState<ParsedSpec | null>(null);
  const [connectorName, setConnectorName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [authType, setAuthType] = useState<"none" | "api_key" | "bearer" | "basic">("none");
  const [authValue, setAuthValue] = useState("");
  const [authUser, setAuthUser] = useState("");
  const [createResult, setCreateResult] = useState<{ toolCount: number } | null>(null);

  function reset() {
    setSpecUrl(""); setSpecText(""); setInputTab("url");
    setParsed(null); setConnectorName(""); setSelected(new Set());
    setAuthType("none"); setAuthValue(""); setAuthUser("");
    setCreateResult(null);
  }

  const parseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/openapi-import/parse", inputTab === "url" ? { specUrl } : { specText });
      return res.json() as Promise<ParsedSpec>;
    },
    onSuccess: (data) => {
      setParsed(data);
      setConnectorName(data.title);
      setSelected(new Set(data.operations.map(o => o.name)));
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't parse that spec", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error("No parsed spec");
      const auth = authType === "none" ? undefined
        : authType === "basic" ? { authType: "basic", config: { username: authUser, password: authValue } }
        : authType === "bearer" ? { authType: "bearer", config: { token: authValue } }
        : { authType: "api_key", config: { value: authValue } };
      const res = await apiRequest("POST", "/api/openapi-import/create", {
        name: connectorName,
        baseUrl: parsed.baseUrl,
        operations: parsed.operations.filter(o => selected.has(o.name)),
        auth,
      });
      return res.json() as Promise<{ toolCount: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers"] });
      setCreateResult(data);
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't create the connector", description: err.message, variant: "destructive" });
    },
  });

  function toggleOperation(name: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col" data-testid="dialog-openapi-import">
        {createResult ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Connector created
              </DialogTitle>
              <DialogDescription>
                "{connectorName}" is live with {createResult.toolCount} tool{createResult.toolCount === 1 ? "" : "s"} — agents can use it right away, gated by the same policy and rate-limit rules as any other connector.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} data-testid="button-close-openapi-result">Done</Button>
            </DialogFooter>
          </>
        ) : !parsed ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileCode2 className="w-4 h-4" />
                Import from OpenAPI
              </DialogTitle>
              <DialogDescription>
                Point at an OpenAPI or Swagger spec (JSON or YAML) and every operation becomes a governed, callable tool — no MCP server to write.
              </DialogDescription>
            </DialogHeader>
            <Tabs value={inputTab} onValueChange={(v) => setInputTab(v as "url" | "paste")}>
              <TabsList>
                <TabsTrigger value="url" data-testid="tab-openapi-url">Spec URL</TabsTrigger>
                <TabsTrigger value="paste" data-testid="tab-openapi-paste">Paste spec</TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="mt-3">
                <Input
                  placeholder="https://api.example.com/openapi.json"
                  value={specUrl}
                  onChange={(e) => setSpecUrl(e.target.value)}
                  data-testid="input-openapi-url"
                />
              </TabsContent>
              <TabsContent value="paste" className="mt-3">
                <Textarea
                  placeholder="Paste OpenAPI/Swagger JSON or YAML here..."
                  value={specText}
                  onChange={(e) => setSpecText(e.target.value)}
                  rows={10}
                  className="font-mono text-xs"
                  data-testid="textarea-openapi-spec"
                />
              </TabsContent>
            </Tabs>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-openapi">Cancel</Button>
              <Button
                onClick={() => parseMutation.mutate()}
                disabled={parseMutation.isPending || (inputTab === "url" ? !specUrl.trim() : !specText.trim())}
                data-testid="button-parse-openapi"
              >
                {parseMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Parse
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Review &amp; import — {parsed.operations.length} operation{parsed.operations.length === 1 ? "" : "s"} found</DialogTitle>
              <DialogDescription>
                {parsed.baseUrl ? <>Base URL: <code className="text-xs">{parsed.baseUrl}</code></> : "No base URL found in the spec — check the servers/host field."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Connector name</Label>
                <Input value={connectorName} onChange={(e) => setConnectorName(e.target.value)} data-testid="input-connector-name" />
              </div>
              <ScrollArea className="border rounded-md h-64">
                <div className="flex flex-col divide-y">
                  {parsed.operations.map((op) => (
                    <label key={op.name} className="flex items-start gap-2.5 p-2.5 cursor-pointer hover:bg-muted/50" data-testid={`row-operation-${op.name}`}>
                      <Checkbox
                        checked={selected.has(op.name)}
                        onCheckedChange={() => toggleOperation(op.name)}
                        className="mt-0.5"
                        data-testid={`checkbox-operation-${op.name}`}
                      />
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] font-mono">{op.method}</Badge>
                          <span className="text-xs font-mono text-muted-foreground truncate">{op.path}</span>
                          <Badge className={`text-[10px] ml-auto ${RISK_BADGE_CLASS[op.riskClassification]}`} variant="outline">
                            {op.riskClassification}
                          </Badge>
                        </div>
                        <span className="text-sm font-medium">{op.name}</span>
                        {op.description && <span className="text-xs text-muted-foreground line-clamp-1">{op.description}</span>}
                      </div>
                    </label>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Authentication (optional)</Label>
                <Select value={authType} onValueChange={(v) => setAuthType(v as typeof authType)}>
                  <SelectTrigger data-testid="select-openapi-auth-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="api_key">API Key</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="basic">Username / Password</SelectItem>
                  </SelectContent>
                </Select>
                {authType === "basic" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Username" value={authUser} onChange={(e) => setAuthUser(e.target.value)} data-testid="input-openapi-auth-username" />
                    <Input placeholder="Password" type="password" value={authValue} onChange={(e) => setAuthValue(e.target.value)} data-testid="input-openapi-auth-password" />
                  </div>
                ) : authType !== "none" ? (
                  <Input
                    placeholder={authType === "api_key" ? "API key" : "Bearer token"}
                    type="password"
                    value={authValue}
                    onChange={(e) => setAuthValue(e.target.value)}
                    data-testid="input-openapi-auth-value"
                  />
                ) : null}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setParsed(null)} data-testid="button-back-openapi">Back</Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || selected.size === 0 || !connectorName.trim() || !parsed.baseUrl}
                data-testid="button-create-openapi-connector"
              >
                {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5 mr-1.5" />}
                Create connector ({selected.size} tool{selected.size === 1 ? "" : "s"})
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
