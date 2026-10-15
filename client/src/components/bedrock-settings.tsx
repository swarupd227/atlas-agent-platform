import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Cloud, CheckCircle2, XCircle, Loader2, KeyRound, ShieldCheck, Copy, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Purpose = "embedding" | "chat" | "fast";

interface ModelRow {
  modelId: string;
  family?: "titan" | "cohere";
  dimensions?: number;
  pricePer1kInputTokens?: number;
  pricePer1kOutputTokens?: number;
}

interface BedrockConfig {
  enabled: boolean;
  awsOnly: boolean;
  useForChat: boolean;
  region: string;
  endpoint: string;
  credentialMode: "role" | "keys";
  models: Partial<Record<Purpose, ModelRow>>;
  limits: { timeoutMs: number; maxConcurrent: number };
}

interface BedrockState {
  config: BedrockConfig;
  source: "admin" | "environment" | "default";
  configured: boolean;
  effectiveRegion: string;
  credentials: { configured: boolean; preview: string | null; updatedAt: string | null; updatedBy: string | null; refusedByLockdown: boolean };
  suggestions: Array<{ purpose: Purpose; label: string; row: ModelRow; note: string }>;
}

interface TestResult {
  ok: boolean;
  purpose: Purpose;
  modelId: string;
  latencyMs: number;
  dimensions?: number;
  reply?: string;
  problem?: { code: string; message: string; hint: string };
}

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-2", "ca-central-1", "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-north-1",
  "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2", "sa-east-1", "us-gov-west-1",
];

const JOBS: Array<{ purpose: Purpose; title: string; help: string }> = [
  { purpose: "embedding", title: "Document search", help: "Turns documents and questions into numbers so the platform can find the right passage." },
  { purpose: "chat", title: "Chat and agents", help: "The Claude model agents, chat and evaluations think with once you switch chat to Bedrock below. Use a Claude id from Bedrock, Cross-region inference." },
  { purpose: "fast", title: "Quick tasks", help: "Optional. A smaller Claude model (Haiku) for light jobs; when empty the chat model answers those too." },
];

/** The text of an error thrown by apiRequest ("400: {"error":"..."}"), without the plumbing. */
export function plainApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const body = raw.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(body);
    return String(parsed.error ?? parsed.message ?? body);
  } catch {
    return body;
  }
}

/** The card on the Model Providers page. Hidden for anyone who may not manage it (another organization's admin). */
export function BedrockProviderCard() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useQuery<BedrockState>({ queryKey: ["/api/admin/bedrock"], retry: false });
  if (isLoading || isError || !data) return null;
  const jobs = JOBS.filter((j) => data.config.models[j.purpose]).length;
  return (
    <>
      <Card
        className={`cursor-pointer transition-all hover:shadow-md ${data.configured ? "border-green-200 dark:border-green-800" : ""}`}
        onClick={() => setOpen(true)}
        data-testid="card-provider-aws_bedrock"
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              <CardTitle className="text-lg">Amazon Bedrock</CardTitle>
            </div>
            {data.configured ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="badge-configured-aws_bedrock">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs" data-testid="badge-not-configured-aws_bedrock">Not Configured</Badge>
            )}
          </div>
          <CardDescription className="text-xs mt-1">
            Models that run inside your own AWS account and region. Document search and, in the next release, chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Jobs with a model</span>
            <span className="font-medium">{jobs} of {JOBS.length}</span>
          </div>
          {!data.configured && (
            <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
              <KeyRound className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Click to choose a region and models. No AWS knowledge is built into the platform; everything is set here.</span>
            </div>
          )}
        </CardContent>
      </Card>
      <BedrockDialog open={open} onOpenChange={setOpen} state={data} />
    </>
  );
}

function BedrockDialog({ open, onOpenChange, state }: { open: boolean; onOpenChange: (o: boolean) => void; state: BedrockState }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<BedrockConfig>(state.config);
  const [keys, setKeys] = useState({ accessKeyId: "", secretAccessKey: "", sessionToken: "" });
  const [results, setResults] = useState<Partial<Record<Purpose, TestResult>>>({});
  const [policy, setPolicy] = useState<string | null>(null);

  // Start from the saved settings each time the dialog opens, and after a save.
  useEffect(() => { if (open) setDraft(state.config); }, [open, state.config]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(state.config), [draft, state.config]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/bedrock"] });

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/admin/bedrock", draft)).json(),
    onSuccess: () => { refresh(); setResults({}); setPolicy(null); toast({ title: "Bedrock settings saved", description: "They apply to the next request." }); },
    onError: (e) => toast({ title: "Could not save", description: plainApiError(e), variant: "destructive" }),
  });
  const saveKeys = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/bedrock/credentials", {
      accessKeyId: keys.accessKeyId, secretAccessKey: keys.secretAccessKey, ...(keys.sessionToken ? { sessionToken: keys.sessionToken } : {}),
    })).json(),
    onSuccess: () => { setKeys({ accessKeyId: "", secretAccessKey: "", sessionToken: "" }); refresh(); toast({ title: "Access keys saved", description: "Stored encrypted. They are never shown again." }); },
    onError: (e) => toast({ title: "Could not save the keys", description: plainApiError(e), variant: "destructive" }),
  });
  const clearKeys = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", "/api/admin/bedrock/credentials")).json(),
    onSuccess: () => { refresh(); toast({ title: "Access keys removed" }); },
    onError: (e) => toast({ title: "Could not remove the keys", description: plainApiError(e), variant: "destructive" }),
  });
  const test = useMutation({
    mutationFn: async (purpose: Purpose) => (await (await apiRequest("POST", "/api/admin/bedrock/test", { purpose })).json()) as TestResult,
    onSuccess: (r) => setResults((prev) => ({ ...prev, [r.purpose]: r })),
    onError: (e) => toast({ title: "Test failed to run", description: plainApiError(e), variant: "destructive" }),
  });
  const showPolicy = useMutation({
    mutationFn: async () => (await (await apiRequest("GET", "/api/admin/bedrock/policy")).json()) as { policy: unknown; hasModels: boolean },
    onSuccess: (r) => setPolicy(r.hasModels ? JSON.stringify(r.policy, null, 2) : "Save at least one model first; the permissions are worked out from the models."),
    onError: (e) => toast({ title: "Could not build the policy", description: plainApiError(e), variant: "destructive" }),
  });

  function setModel(purpose: Purpose, patch: Partial<ModelRow>) {
    setDraft((d) => {
      const models = { ...d.models };
      const row = { ...(models[purpose] ?? { modelId: "" }), ...patch };
      // A row with nothing left in it is no row.
      if (!row.modelId && !row.family && !row.dimensions) delete models[purpose];
      else models[purpose] = row;
      return { ...d, models };
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Cloud className="h-5 w-5 text-amber-600" />Amazon Bedrock</DialogTitle>
          <DialogDescription>
            Run models inside your own AWS account. Nothing here is built into the platform: choose your region and paste the model ids from your Bedrock console.
            {state.source === "environment" && " These values came from the server's configuration until you save them here."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="bedrock-enabled" className="font-medium">Use Amazon Bedrock</Label>
              <p className="text-xs text-muted-foreground">Off means the platform behaves exactly as before.</p>
            </div>
            <Switch id="bedrock-enabled" checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} data-testid="switch-bedrock-enabled" />
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <h4 className="font-medium text-sm">Connection</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="bedrock-region">Region</Label>
                <Input id="bedrock-region" list="bedrock-regions" placeholder={state.effectiveRegion ? `${state.effectiveRegion} (the server's own region)` : "for example eu-central-1"}
                  value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value.trim() })} data-testid="input-bedrock-region" />
                <datalist id="bedrock-regions">{REGIONS.map((r) => <option key={r} value={r} />)}</datalist>
                <p className="text-xs text-muted-foreground">Where Bedrock runs. Leave empty to use the region the server runs in.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bedrock-endpoint">Private address (optional)</Label>
                <Input id="bedrock-endpoint" placeholder="https://… .amazonaws.com" value={draft.endpoint}
                  onChange={(e) => setDraft({ ...draft, endpoint: e.target.value.trim() })} data-testid="input-bedrock-endpoint" />
                <p className="text-xs text-muted-foreground">Only if Bedrock is reached through a private network path (a VPC endpoint).</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Access</Label>
              <RadioGroup value={draft.credentialMode} onValueChange={(v) => setDraft({ ...draft, credentialMode: v as "role" | "keys" })} className="gap-2">
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="role" id="bedrock-access-role" className="mt-1" />
                  <Label htmlFor="bedrock-access-role" className="font-normal">
                    Use this server's AWS role <span className="text-muted-foreground">(recommended, nothing to enter)</span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="keys" id="bedrock-access-keys" className="mt-1" />
                  <Label htmlFor="bedrock-access-keys" className="font-normal">
                    Enter access keys <span className="text-muted-foreground">(for a server that does not run in AWS)</span>
                  </Label>
                </div>
              </RadioGroup>
              {draft.credentialMode === "keys" && (
                <div className="space-y-2 rounded-md bg-muted/40 p-3">
                  {state.credentials.configured && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono">{state.credentials.preview}
                        {state.credentials.updatedAt && <span className="font-sans text-muted-foreground"> · saved {new Date(state.credentials.updatedAt).toLocaleString()}{state.credentials.updatedBy ? ` by ${state.credentials.updatedBy}` : ""}</span>}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => clearKeys.mutate()} disabled={clearKeys.isPending}>Remove</Button>
                    </div>
                  )}
                  {state.credentials.refusedByLockdown && <p className="text-xs text-amber-600">This deployment takes AI keys from its environment only, so keys cannot be entered here.</p>}
                  <Input type="password" autoComplete="off" placeholder="Access key id (AKIA…)" value={keys.accessKeyId} onChange={(e) => setKeys({ ...keys, accessKeyId: e.target.value })} data-testid="input-bedrock-access-key" />
                  <Input type="password" autoComplete="off" placeholder="Secret access key" value={keys.secretAccessKey} onChange={(e) => setKeys({ ...keys, secretAccessKey: e.target.value })} data-testid="input-bedrock-secret" />
                  <Input type="password" autoComplete="off" placeholder="Session token (only for temporary keys)" value={keys.sessionToken} onChange={(e) => setKeys({ ...keys, sessionToken: e.target.value })} />
                  <Button size="sm" disabled={!keys.accessKeyId || !keys.secretAccessKey || saveKeys.isPending || state.credentials.refusedByLockdown} onClick={() => saveKeys.mutate()} data-testid="button-save-bedrock-keys">
                    {saveKeys.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Save keys
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <h4 className="font-medium text-sm">Models</h4>
            <p className="text-xs text-muted-foreground">Paste the model id from the Bedrock console. The Test button makes one tiny real call with the <em>saved</em> settings and tells you in plain words what to fix.</p>
            {JOBS.map((job) => {
              const row = draft.models[job.purpose];
              const result = results[job.purpose];
              const suggestions = state.suggestions.filter((s) => s.purpose === job.purpose);
              return (
                <div key={job.purpose} className="space-y-2 rounded-md border p-3" data-testid={`bedrock-job-${job.purpose}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{job.title}</div>
                      <div className="text-xs text-muted-foreground">{job.help}</div>
                    </div>
                    <Button variant="outline" size="sm" disabled={dirty || !state.config.models[job.purpose] || test.isPending} onClick={() => test.mutate(job.purpose)} data-testid={`button-test-bedrock-${job.purpose}`}>
                      {test.isPending && test.variables === job.purpose ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}Test
                    </Button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                    <Input placeholder="Model id" value={row?.modelId ?? ""} onChange={(e) => setModel(job.purpose, { modelId: e.target.value.trim() })} data-testid={`input-bedrock-model-${job.purpose}`} />
                    {job.purpose === "embedding" && (
                      <>
                        <Select value={row?.family ?? "auto"} onValueChange={(v) => setModel("embedding", { family: v === "auto" ? undefined : (v as "titan" | "cohere") })}>
                          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Kind: detect</SelectItem>
                            <SelectItem value="titan">Kind: Titan</SelectItem>
                            <SelectItem value="cohere">Kind: Cohere</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input className="w-[150px]" type="number" placeholder="Vector size" value={row?.dimensions ?? ""} onChange={(e) => setModel("embedding", { dimensions: e.target.value ? Number(e.target.value) : undefined })} />
                      </>
                    )}
                  </div>
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Starting points:</span>
                      {suggestions.map((s) => (
                        <Button key={s.row.modelId} variant="ghost" size="sm" className="h-6 px-2 text-xs" title={s.note} aria-label={s.label} onClick={() => setModel(job.purpose, { ...s.row })}>{s.label}</Button>
                      ))}
                    </div>
                  )}
                  {result && (
                    <div className={`flex items-start gap-2 rounded p-2 text-xs ${result.ok ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200" : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200"}`} data-testid={`bedrock-result-${job.purpose}`}>
                      {result.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                      <div>
                        {result.ok
                          ? <>Works. {result.dimensions ? `Vectors of ${result.dimensions} numbers. ` : ""}{result.reply ? `The model answered "${result.reply}". ` : ""}{result.latencyMs} ms.</>
                          : <><div className="font-medium">{result.problem?.message}</div><div>{result.problem?.hint}</div></>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-3 rounded-lg border p-4" data-testid="bedrock-chat-panel">
            <h4 className="font-medium text-sm">Chat and agents on Bedrock</h4>
            <p className="text-xs text-muted-foreground">
              When this is on, every request that would have gone to Claude on the Anthropic API is answered by the Claude model above instead, inside your AWS account.
              Agents, the playground and evaluations keep working as they are. Requests for OpenAI models are not changed.
            </p>
            <div className="flex items-center justify-between">
              <Label htmlFor="bedrock-use-chat" className="font-normal">Answer Claude requests from Bedrock</Label>
              <Switch id="bedrock-use-chat" checked={draft.useForChat} disabled={!draft.models.chat?.modelId}
                onCheckedChange={(v) => setDraft({ ...draft, useForChat: v })} data-testid="switch-bedrock-use-chat" />
            </div>
            {!draft.models.chat?.modelId && <p className="text-xs text-muted-foreground">Choose a model for "Chat and agents" first, press Test, then switch this on.</p>}
            <div className="flex items-center justify-between">
              <Label htmlFor="bedrock-aws-only" className="font-normal">Never fall back to OpenAI</Label>
              <Switch id="bedrock-aws-only" checked={draft.awsOnly} onCheckedChange={(v) => setDraft({ ...draft, awsOnly: v })} data-testid="switch-bedrock-aws-only" />
            </div>
            <p className="text-xs text-muted-foreground">
              Normally, if Claude cannot answer, the platform tries OpenAI so work continues. With this on, a request that fails on Bedrock stays failed instead of leaving AWS.
            </p>
            <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1">
              <div className="font-medium">Not available through Bedrock</div>
              <ul className="list-disc pl-4 text-muted-foreground">
                <li>Anthropic's code-running sandbox. A step that needs it stops with a clear message.</li>
                <li>Anthropic's web search tool.</li>
              </ul>
            </div>
          </div>

          <SearchPanel />

          <div className="space-y-3 rounded-lg border p-4">
            <h4 className="font-medium text-sm">Limits</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="bedrock-timeout">Give up after (seconds)</Label>
                <Input id="bedrock-timeout" type="number" min={1} max={600} value={Math.round(draft.limits.timeoutMs / 1000)} onChange={(e) => setDraft({ ...draft, limits: { ...draft.limits, timeoutMs: Math.max(1, Number(e.target.value) || 1) * 1000 } })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bedrock-concurrent">Requests at once</Label>
                <Input id="bedrock-concurrent" type="number" min={1} max={64} value={draft.limits.maxConcurrent} onChange={(e) => setDraft({ ...draft, limits: { ...draft.limits, maxConcurrent: Math.max(1, Number(e.target.value) || 1) } })} />
                <p className="text-xs text-muted-foreground">Keeps the platform inside your account's Bedrock quota.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Permissions needed</h4>
              <Button variant="outline" size="sm" onClick={() => showPolicy.mutate()} disabled={dirty || showPolicy.isPending}>Show</Button>
            </div>
            <p className="text-xs text-muted-foreground">Worked out from the saved models. Give this to whoever manages the AWS role the server uses.</p>
            {policy && (
              <div className="relative">
                <pre className="max-h-56 overflow-auto rounded bg-muted p-3 text-xs" data-testid="bedrock-policy">{policy}</pre>
                <Button variant="ghost" size="sm" className="absolute right-1 top-1 h-6 px-2" onClick={() => navigator.clipboard?.writeText(policy)}><Copy className="h-3 w-3" /></Button>
              </div>
            )}
          </div>

          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{dirty ? "You have unsaved changes. Save before testing." : "Saved."}</span>
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} data-testid="button-save-bedrock">
              {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Save settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Coverage { total: number; covered: number }
interface SearchTarget { available: boolean; reason?: string; label?: string; active?: boolean; coverage?: Coverage | null; dimensions?: number | null }
interface SearchState {
  active: { provider: "openai" | "aws_bedrock"; label: string };
  targets: { openai: SearchTarget; bedrock: SearchTarget };
  migration: { state: "idle" | "running" | "stopping" | "stopped" | "done" | "failed" | "interrupted"; targetKey: string | null; targetLabel: string | null; total: number; covered: number; skipped: number; lastError: string | null; startedBy: string | null };
}

/** Which model document search uses, and the move to another: re-embed in the background, then switch (and switch back). */
function SearchPanel() {
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<SearchState>({
    queryKey: ["/api/admin/bedrock/search"],
    retry: false,
    refetchInterval: (q) => { const s = (q.state.data as SearchState | undefined)?.migration.state; return s === "running" || s === "stopping" ? 3000 : false; },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/bedrock/search"] });
  const act = (path: string, label: string, body?: unknown) => useMutation({
    mutationFn: async (_: void) => (await apiRequest("POST", path, body)).json(),
    onSuccess: () => { refresh(); toast({ title: label }); },
    onError: (e) => toast({ title: "Could not do that", description: plainApiError(e), variant: "destructive" }),
  });
  const reembedBedrock = act("/api/admin/bedrock/search/reembed", "Re-embedding started", { to: "bedrock" });
  const reembedOpenAi = act("/api/admin/bedrock/search/reembed", "Re-embedding started", { to: "openai" });
  const stop = act("/api/admin/bedrock/search/stop", "Stopping after this batch");
  const switchBedrock = act("/api/admin/bedrock/search/switch", "Document search now uses Amazon Bedrock", { to: "bedrock" });
  const switchOpenAi = act("/api/admin/bedrock/search/switch", "Document search now uses OpenAI", { to: "openai" });
  if (isLoading || isError || !data) return null;

  const m = data.migration;
  const running = m.state === "running" || m.state === "stopping";
  const busy = reembedBedrock.isPending || reembedOpenAi.isPending || stop.isPending || switchBedrock.isPending || switchOpenAi.isPending;

  function Row({ name, t, onReembed, onSwitch, which }: { name: string; t: SearchTarget; onReembed: () => void; onSwitch: () => void; which: "openai" | "bedrock" }) {
    const cov = t.coverage;
    const pct = cov && cov.total > 0 ? Math.round((cov.covered / cov.total) * 100) : cov ? 100 : 0;
    const complete = !!cov && cov.covered >= cov.total;
    const thisRun = running && m.targetKey && (m.targetLabel ?? "").length > 0 && ((which === "openai" && m.targetKey.startsWith("openai:")) || (which === "bedrock" && m.targetKey.startsWith("aws_bedrock:")));
    return (
      <div className="space-y-2 rounded-md border p-3" data-testid={`search-row-${which}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium flex items-center gap-2">{name}{t.active && <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">In use for search</Badge>}</div>
            <div className="text-xs text-muted-foreground">{t.available ? t.label : t.reason}</div>
          </div>
          {t.available && (!t.active || (!!cov && !complete)) && (
            <div className="flex gap-2">
              {thisRun
                ? <Button variant="outline" size="sm" disabled={busy || m.state === "stopping"} onClick={() => stop.mutate()}>Stop</Button>
                : <Button variant="outline" size="sm" disabled={busy || running || complete} onClick={onReembed} data-testid={`button-reembed-${which}`}>Re-embed</Button>}
              {!t.active && <Button size="sm" disabled={busy || running || !complete} onClick={onSwitch} data-testid={`button-switch-${which}`}>Use for search</Button>}
            </div>
          )}
        </div>
        {t.available && cov && (
          <div className="space-y-1">
            <Progress value={pct} />
            <div className="text-xs text-muted-foreground">
              {cov.covered.toLocaleString()} of {cov.total.toLocaleString()} passages have a vector for this model
              {thisRun ? " (working in the background)" : ""}
              {t.active && !complete && !thisRun ? ". New passages are missing a vector (the model could not be reached when they were added): press Re-embed to fill them in." : ""}
            </div>
          </div>
        )}
        {t.available && !cov && which === "bedrock" && <div className="text-xs text-muted-foreground">The vector size is detected when the re-embedding starts.</div>}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-4" data-testid="bedrock-search-panel">
      <h4 className="font-medium text-sm flex items-center gap-2"><Search className="h-4 w-4" />Document search</h4>
      <p className="text-xs text-muted-foreground">
        Search uses <strong>{data.active.label}</strong>. To move to another model, re-embed every passage first (search keeps working on the current model meanwhile), then switch.
        Switching back is possible at any time; the old vectors are kept. It uses the <em>saved</em> settings above.
      </p>
      <Row name="OpenAI" which="openai" t={data.targets.openai} onReembed={() => reembedOpenAi.mutate()} onSwitch={() => { if (window.confirm("Switch document search back to OpenAI?")) switchOpenAi.mutate(); }} />
      <Row name="Amazon Bedrock" which="bedrock" t={data.targets.bedrock} onReembed={() => reembedBedrock.mutate()} onSwitch={() => { if (window.confirm("Switch document search to Amazon Bedrock? Questions will be matched against the Bedrock vectors from now on.")) switchBedrock.mutate(); }} />
      {m.state !== "idle" && (
        <div className={`text-xs rounded p-2 ${m.state === "failed" ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200" : "bg-muted/50 text-muted-foreground"}`} data-testid="search-migration-status">
          {m.state === "running" && `Re-embedding for ${m.targetLabel}: ${m.covered.toLocaleString()} of ${m.total.toLocaleString()}…`}
          {m.state === "stopping" && "Stopping after the current batch…"}
          {m.state === "stopped" && "Stopped. Press Re-embed to carry on where it left off."}
          {m.state === "done" && `Finished: every passage has a vector for ${m.targetLabel}.${m.skipped ? ` (${m.skipped} empty passages were skipped.)` : ""}`}
          {m.state === "interrupted" && "The re-embedding was interrupted (the server restarted). Press Re-embed to carry on."}
          {m.state === "failed" && <>The re-embedding stopped: {m.lastError}</>}
        </div>
      )}
    </div>
  );
}
