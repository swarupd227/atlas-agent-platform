import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, Shield, Plus, Trash2, TestTube2, Check, X } from "lucide-react";

const ALL_ENTITY_TYPES = [
  { key: "EMAIL_ADDRESS", label: "Email Address" },
  { key: "PHONE_NUMBER", label: "Phone Number" },
  { key: "US_SSN", label: "US SSN" },
  { key: "CREDIT_CARD", label: "Credit Card" },
  { key: "IP_ADDRESS", label: "IP Address" },
  { key: "URL", label: "URL" },
];

interface CustomPattern { entityType: string; pattern: string; }

interface PiiConfig {
  id: string;
  pipelineId: string;
  enabled: boolean;
  engine: string;
  entityTypes: string[];
  customPatterns: CustomPattern[];
  inputField: string;
  outputField: string;
  reportField: string;
  rehydrationEnabled: boolean;
  rehydrationFields: string[];
  failOnError: boolean;
}

export function PiiMaskingConfigPanel({ pipelineId }: { pipelineId: string }) {
  const { toast } = useToast();
  const [testText, setTestText] = useState("Contact John Doe at john.doe@acme.com or call 555-123-4567. His SSN is 123-45-6789.");
  const [testResult, setTestResult] = useState<{ maskedText: string; report: any } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [newCustomEntityType, setNewCustomEntityType] = useState("");
  const [newCustomPattern, setNewCustomPattern] = useState("");

  const { data: config, isLoading } = useQuery<PiiConfig>({
    queryKey: ["/api/pii-masking-configs/by-pipeline", pipelineId],
    queryFn: async () => {
      const res = await fetch(`/api/pii-masking-configs/by-pipeline/${pipelineId}`);
      if (res.status === 404) return null as any;
      if (!res.ok) throw new Error("Failed to fetch PII config");
      return res.json();
    },
  });

  const [draft, setDraft] = useState<Partial<PiiConfig>>({});
  const merged: Partial<PiiConfig> = {
    enabled: true,
    engine: "regex",
    entityTypes: ALL_ENTITY_TYPES.map(e => e.key),
    customPatterns: [],
    inputField: "artifact_texts",
    outputField: "masked_artifact_texts",
    reportField: "pii_masking_reports",
    rehydrationEnabled: true,
    rehydrationFields: [],
    failOnError: true,
    ...config,
    ...draft,
  };

  const saveMutation = useMutation({
    mutationFn: (body: Partial<PiiConfig>) =>
      apiRequest("PUT", `/api/pii-masking-configs/by-pipeline/${pipelineId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pii-masking-configs/by-pipeline", pipelineId] });
      setDraft({});
      toast({ title: "PII config saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  function patch(updates: Partial<PiiConfig>) {
    setDraft(prev => ({ ...prev, ...updates }));
  }

  function toggleEntityType(key: string) {
    const current = merged.entityTypes || [];
    patch({
      entityTypes: current.includes(key) ? current.filter(k => k !== key) : [...current, key],
    });
  }

  function addCustomPattern() {
    if (!newCustomEntityType.trim() || !newCustomPattern.trim()) return;
    patch({ customPatterns: [...(merged.customPatterns || []), { entityType: newCustomEntityType.trim().toUpperCase(), pattern: newCustomPattern.trim() }] });
    setNewCustomEntityType("");
    setNewCustomPattern("");
  }

  function removeCustomPattern(idx: number) {
    patch({ customPatterns: (merged.customPatterns || []).filter((_, i) => i !== idx) });
  }

  function addRehydrationField(field: string) {
    if (!field.trim()) return;
    const current = merged.rehydrationFields || [];
    if (!current.includes(field.trim())) patch({ rehydrationFields: [...current, field.trim()] });
  }

  function removeRehydrationField(idx: number) {
    patch({ rehydrationFields: (merged.rehydrationFields || []).filter((_, i) => i !== idx) });
  }

  async function handleTest() {
    if (!testText.trim()) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      let url: string;
      if (config?.id) {
        url = `/api/pii-masking-configs/${config.id}/test`;
      } else {
        // Save first, then test
        const saved = await apiRequest("PUT", `/api/pii-masking-configs/by-pipeline/${pipelineId}`, merged) as any;
        url = `/api/pii-masking-configs/${saved.id}/test`;
        await queryClient.invalidateQueries({ queryKey: ["/api/pii-masking-configs/by-pipeline", pipelineId] });
      }
      const res = await apiRequest("POST", url, { text: testText }) as any;
      setTestResult(res);
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTestLoading(false);
    }
  }

  const isDirty = Object.keys(draft).length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">PII Masking Configuration</h3>
          <Badge variant="outline" className="text-[10px]">regex engine</Badge>
          {!config && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">Not configured</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs text-muted-foreground italic">Unsaved changes</span>}
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(merged)}
            disabled={saveMutation.isPending || !isDirty}
            data-testid="button-save-pii-config"
          >
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center gap-3">
        <Switch
          checked={merged.enabled ?? true}
          onCheckedChange={v => patch({ enabled: v })}
          data-testid="switch-pii-enabled"
        />
        <Label className="text-sm">Enable PII Masking for this pipeline</Label>
      </div>

      <Separator />

      {/* Entity Types */}
      <div>
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entity Types</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {ALL_ENTITY_TYPES.map(({ key, label }) => {
            const active = (merged.entityTypes || []).includes(key);
            return (
              <button
                key={key}
                onClick={() => toggleEntityType(key)}
                data-testid={`toggle-entity-${key}`}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-transparent text-muted-foreground hover:border-primary/40"
                }`}
              >
                {active ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Custom Patterns */}
      <div>
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Custom Regex Patterns</Label>
        {(merged.customPatterns || []).length > 0 && (
          <div className="mt-2 space-y-1.5">
            {(merged.customPatterns || []).map((cp, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5">
                <Badge variant="outline" className="text-[10px] shrink-0">{cp.entityType}</Badge>
                <code className="text-xs flex-1 font-mono truncate text-muted-foreground">{cp.pattern}</code>
                <button onClick={() => removeCustomPattern(idx)} data-testid={`button-remove-pattern-${idx}`}>
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <Input
            placeholder="ENTITY_TYPE"
            value={newCustomEntityType}
            onChange={e => setNewCustomEntityType(e.target.value)}
            className="w-36 h-8 text-xs font-mono"
            data-testid="input-custom-entity-type"
          />
          <Input
            placeholder="regex pattern"
            value={newCustomPattern}
            onChange={e => setNewCustomPattern(e.target.value)}
            className="flex-1 h-8 text-xs font-mono"
            data-testid="input-custom-pattern"
          />
          <Button size="sm" variant="outline" className="h-8 px-2" onClick={addCustomPattern} data-testid="button-add-custom-pattern">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <Separator />

      {/* Field Mappings */}
      <div>
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workflow State Field Mappings</Label>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[
            { key: "inputField", label: "Input Field" },
            { key: "outputField", label: "Masked Output" },
            { key: "reportField", label: "Report Field" },
          ].map(({ key, label }) => (
            <div key={key}>
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                value={(merged as any)[key] || ""}
                onChange={e => patch({ [key]: e.target.value } as any)}
                className="h-8 text-xs font-mono mt-1"
                data-testid={`input-field-${key}`}
              />
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Rehydration */}
      <div>
        <div className="flex items-center gap-3">
          <Switch
            checked={merged.rehydrationEnabled ?? true}
            onCheckedChange={v => patch({ rehydrationEnabled: v })}
            data-testid="switch-rehydration-enabled"
          />
          <Label className="text-sm">Enable Rehydration</Label>
          <span className="text-xs text-muted-foreground">(restore original values after downstream processing)</span>
        </div>
        {merged.rehydrationEnabled && (
          <div className="mt-3">
            <Label className="text-xs text-muted-foreground">Rehydration Field Paths (dot-notation, append <code>[]</code> for arrays)</Label>
            <div className="space-y-1 mt-1.5">
              {(merged.rehydrationFields || []).map((f, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono rounded border bg-muted/40 px-2 py-1">{f}</code>
                  <button onClick={() => removeRehydrationField(idx)} data-testid={`button-remove-rehydration-field-${idx}`}>
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
              <RehydrationFieldAdder onAdd={addRehydrationField} />
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Fail on error */}
      <div className="flex items-center gap-3">
        <Switch
          checked={merged.failOnError ?? true}
          onCheckedChange={v => patch({ failOnError: v })}
          data-testid="switch-fail-on-error"
        />
        <Label className="text-sm">Fail stage on masking error</Label>
        <span className="text-xs text-muted-foreground">(if off, errors are logged and unmasked text passes through)</span>
      </div>

      <Separator />

      {/* Test Panel */}
      <div>
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Test Masking</Label>
        <Textarea
          value={testText}
          onChange={e => setTestText(e.target.value)}
          rows={3}
          className="mt-2 text-sm font-mono"
          placeholder="Enter sample text with PII..."
          data-testid="textarea-test-text"
        />
        <div className="flex justify-end mt-2">
          <Button size="sm" variant="outline" onClick={handleTest} disabled={testLoading} data-testid="button-test-masking">
            {testLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5 mr-1.5" />}
            Test Masking
          </Button>
        </div>
        {testResult && (
          <Card className="mt-3 border-primary/20">
            <CardContent className="p-3 space-y-2">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Masked Output</span>
                <pre className="text-xs font-mono mt-1 whitespace-pre-wrap bg-muted/40 rounded p-2">{testResult.maskedText}</pre>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(testResult.report?.entitiesFound || {}).map(([type, count]) => (
                  <Badge key={type} variant="outline" className="text-[10px] gap-1">
                    <span className="font-mono">{type}</span>
                    <span className="font-bold text-primary">×{count as number}</span>
                  </Badge>
                ))}
                {Object.keys(testResult.report?.entitiesFound || {}).length === 0 && (
                  <span className="text-xs text-muted-foreground">No PII detected</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function RehydrationFieldAdder({ onAdd }: { onAdd: (f: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex gap-2">
      <Input
        placeholder="e.g. documents[].content"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { onAdd(val); setVal(""); } }}
        className="h-8 text-xs font-mono"
        data-testid="input-rehydration-field"
      />
      <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => { onAdd(val); setVal(""); }} data-testid="button-add-rehydration-field">
        <Plus className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
