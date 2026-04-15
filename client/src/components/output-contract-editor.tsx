import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Pencil, Trash2, Play, CheckCircle2, XCircle, Loader2,
  ShieldCheck, RefreshCw, AlertTriangle, X,
} from "lucide-react";
import type { OutputContract } from "@shared/schema";

interface OutputContractEditorProps {
  agentId: string;
}

interface ValidateResult {
  output: Record<string, unknown>;
  validationStatus: string;
  repairAttempts: number;
  validationErrors: string[];
  qualityScore?: number;
}

interface NormalizerRule {
  field: string;
  type: "clamp_numeric" | "map_aliases" | "coerce_to_string";
  min?: number;
  max?: number;
  default?: string | number;
  aliases?: Record<string, string>;
  handle_null?: "empty_string" | "null";
  handle_array?: "join_comma" | "first";
  handle_dict?: "join_values" | "stringify";
  trim?: boolean;
}

interface ExpectedSection {
  section_id: string;
  mandatory_phrases?: string[];
  required_slots?: string[];
  target_word_min?: number;
  target_word_max?: number;
  prefer_bullets?: boolean;
}

interface QualityScorerConfig {
  expected_sections?: ExpectedSection[];
  failure_threshold?: number;
}

interface TypedOutputContract extends OutputContract {
  normalizers: NormalizerRule[] | null;
  qualityScorerConfig: QualityScorerConfig | null;
}

const ENFORCEMENT_MODES = [
  { value: "strict", label: "Strict", description: "Throw on failure — execution halts" },
  { value: "strict_with_interrupt", label: "Strict with Interrupt", description: "Return failed status without throwing" },
  { value: "lenient", label: "Lenient", description: "Use fallback output on failure" },
  { value: "monitor", label: "Monitor", description: "Log failure and continue" },
];

const STATUS_COLOR: Record<string, string> = {
  passed: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20",
  repaired: "bg-amber-500/15 text-amber-600 border-amber-500/20",
  fallback: "bg-blue-500/15 text-blue-600 border-blue-500/20",
  failed: "bg-red-500/15 text-red-600 border-red-500/20",
};

function ValidatePanel({ contractId }: { contractId: string }) {
  const [sampleJson, setSampleJson] = useState<string>('{\n  "summary": "example output"\n}');
  const [result, setResult] = useState<ValidateResult | null>(null);
  const { toast } = useToast();

  const validateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/output-contracts/${contractId}/validate`, { sampleJson });
      return res.json() as Promise<ValidateResult>;
    },
    onSuccess: (data) => setResult(data),
    onError: (err: Error) => toast({ title: "Validation failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-3">
      <Label className="text-xs font-semibold">Sample JSON to validate</Label>
      <Textarea
        value={sampleJson}
        onChange={(e) => setSampleJson(e.target.value)}
        className="font-mono text-xs min-h-[120px]"
        data-testid="input-validate-json"
      />
      <Button
        size="sm"
        onClick={() => validateMutation.mutate()}
        disabled={validateMutation.isPending}
        data-testid="button-validate-contract"
        className="self-start"
      >
        {validateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
        Run Validation
      </Button>
      {result && (
        <div className="flex flex-col gap-2 rounded-md border p-3 bg-muted/20">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] ${STATUS_COLOR[result.validationStatus] ?? ""}`}>
              {result.validationStatus === "passed" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
              {result.validationStatus.toUpperCase()}
            </Badge>
            {result.repairAttempts > 0 && (
              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                <RefreshCw className="w-3 h-3 mr-1" />
                {result.repairAttempts} repair{result.repairAttempts !== 1 ? "s" : ""}
              </Badge>
            )}
            {result.qualityScore !== undefined && (
              <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 border-violet-500/20">
                Quality: {(result.qualityScore * 100).toFixed(1)}%
              </Badge>
            )}
          </div>
          {result.validationErrors.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {result.validationErrors.map((e, i) => (
                <p key={i} className="text-[11px] text-destructive flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> {e}
                </p>
              ))}
            </div>
          )}
          {result.validationStatus === "passed" && Object.keys(result.output).length > 0 && (
            <pre className="text-[10px] font-mono bg-muted/40 p-2 rounded-md overflow-auto max-h-32 whitespace-pre-wrap">
              {JSON.stringify(result.output, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function NormalizerRuleBuilder({
  rules,
  onChange,
}: {
  rules: NormalizerRule[];
  onChange: (rules: NormalizerRule[]) => void;
}) {
  const addRule = () => {
    onChange([...rules, { field: "", type: "coerce_to_string" }]);
  };

  const removeRule = (idx: number) => {
    onChange(rules.filter((_, i) => i !== idx));
  };

  const updateRule = (idx: number, patch: Partial<NormalizerRule>) => {
    onChange(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  return (
    <div className="flex flex-col gap-3">
      {rules.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center">No normalizer rules. Add rules to coerce or transform fields before validation.</p>
      )}
      {rules.map((rule, idx) => (
        <div key={idx} className="flex flex-col gap-2 p-3 rounded-md border bg-muted/20" data-testid={`normalizer-rule-${idx}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rule {idx + 1}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRule(idx)} data-testid={`button-remove-rule-${idx}`}>
              <X className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">Field path (e.g. field.* or name)</Label>
              <Input
                value={rule.field}
                onChange={(e) => updateRule(idx, { field: e.target.value })}
                placeholder="field_name or field.*"
                className="text-xs h-7"
                data-testid={`input-rule-field-${idx}`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">Type</Label>
              <Select value={rule.type} onValueChange={(v) => updateRule(idx, { type: v as NormalizerRule["type"] })}>
                <SelectTrigger className="h-7 text-xs" data-testid={`select-rule-type-${idx}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coerce_to_string">coerce_to_string</SelectItem>
                  <SelectItem value="clamp_numeric">clamp_numeric</SelectItem>
                  <SelectItem value="map_aliases">map_aliases</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {rule.type === "clamp_numeric" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-[10px]">Min</Label>
                <Input type="number" value={rule.min ?? ""} onChange={(e) => updateRule(idx, { min: e.target.value ? parseFloat(e.target.value) : undefined })} className="text-xs h-7" data-testid={`input-rule-min-${idx}`} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px]">Max</Label>
                <Input type="number" value={rule.max ?? ""} onChange={(e) => updateRule(idx, { max: e.target.value ? parseFloat(e.target.value) : undefined })} className="text-xs h-7" data-testid={`input-rule-max-${idx}`} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px]">Default</Label>
                <Input type="number" value={rule.default ?? ""} onChange={(e) => updateRule(idx, { default: e.target.value ? parseFloat(e.target.value) : undefined })} className="text-xs h-7" data-testid={`input-rule-default-${idx}`} />
              </div>
            </div>
          )}

          {rule.type === "map_aliases" && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">Alias mapping (JSON object, e.g. &#123;"yes":"true","no":"false"&#125;)</Label>
              <Textarea
                value={rule.aliases ? JSON.stringify(rule.aliases) : ""}
                onChange={(e) => {
                  try { updateRule(idx, { aliases: JSON.parse(e.target.value) }); } catch { /* editing */ }
                }}
                className="text-xs min-h-[48px] font-mono"
                data-testid={`input-rule-aliases-${idx}`}
              />
            </div>
          )}

          {rule.type === "coerce_to_string" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-[10px]">Array handling</Label>
                <Select value={rule.handle_array ?? "join_comma"} onValueChange={(v) => updateRule(idx, { handle_array: v as NormalizerRule["handle_array"] })}>
                  <SelectTrigger className="h-7 text-xs" data-testid={`select-rule-handle-array-${idx}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="join_comma">join_comma</SelectItem>
                    <SelectItem value="first">first element</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px]">Dict handling</Label>
                <Select value={rule.handle_dict ?? "join_values"} onValueChange={(v) => updateRule(idx, { handle_dict: v as NormalizerRule["handle_dict"] })}>
                  <SelectTrigger className="h-7 text-xs" data-testid={`select-rule-handle-dict-${idx}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="join_values">join_values</SelectItem>
                    <SelectItem value="stringify">stringify</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      ))}
      <Button size="sm" variant="outline" className="self-start" onClick={addRule} data-testid="button-add-normalizer-rule">
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Add Rule
      </Button>
    </div>
  );
}

function ExpectedSectionsBuilder({
  sections,
  onChange,
}: {
  sections: ExpectedSection[];
  onChange: (sections: ExpectedSection[]) => void;
}) {
  const addSection = () => {
    onChange([...sections, { section_id: "", mandatory_phrases: [], required_slots: [], prefer_bullets: undefined, target_word_min: undefined, target_word_max: undefined }]);
  };

  const removeSection = (idx: number) => onChange(sections.filter((_, i) => i !== idx));

  const updateSection = (idx: number, patch: Partial<ExpectedSection>) => {
    onChange(sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  return (
    <div className="flex flex-col gap-3">
      {sections.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center">No expected sections configured. Add sections to enable quality scoring (structure 35% / style 25% / tone 20% / completeness 20%).</p>
      )}
      {sections.map((sec, idx) => (
        <div key={idx} className="flex flex-col gap-2 p-3 rounded-md border bg-muted/20" data-testid={`section-${idx}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Section {idx + 1}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeSection(idx)} data-testid={`button-remove-section-${idx}`}>
              <X className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">Section ID (key in output)</Label>
              <Input value={sec.section_id} onChange={(e) => updateSection(idx, { section_id: e.target.value })} placeholder="summary" className="text-xs h-7" data-testid={`input-section-id-${idx}`} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">Prefer bullets</Label>
              <div className="flex items-center gap-2 h-7">
                <Switch
                  checked={sec.prefer_bullets ?? false}
                  onCheckedChange={(v) => updateSection(idx, { prefer_bullets: v })}
                  data-testid={`switch-prefer-bullets-${idx}`}
                />
                <span className="text-[11px] text-muted-foreground">{sec.prefer_bullets ? "Required" : "Not required"}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">Min words</Label>
              <Input type="number" min={1} value={sec.target_word_min ?? ""} onChange={(e) => updateSection(idx, { target_word_min: e.target.value ? parseInt(e.target.value) : undefined })} className="text-xs h-7" data-testid={`input-section-word-min-${idx}`} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">Max words</Label>
              <Input type="number" min={1} value={sec.target_word_max ?? ""} onChange={(e) => updateSection(idx, { target_word_max: e.target.value ? parseInt(e.target.value) : undefined })} className="text-xs h-7" data-testid={`input-section-word-max-${idx}`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">Mandatory phrases (comma-separated)</Label>
              <Input
                value={(sec.mandatory_phrases ?? []).join(", ")}
                onChange={(e) => updateSection(idx, { mandatory_phrases: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                placeholder="must include, key phrase"
                className="text-xs h-7"
                data-testid={`input-section-phrases-${idx}`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">Required slots (comma-separated)</Label>
              <Input
                value={(sec.required_slots ?? []).join(", ")}
                onChange={(e) => updateSection(idx, { required_slots: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                placeholder="slot1, slot2"
                className="text-xs h-7"
                data-testid={`input-section-slots-${idx}`}
              />
            </div>
          </div>
        </div>
      ))}
      <Button size="sm" variant="outline" className="self-start" onClick={addSection} data-testid="button-add-section">
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Add Section
      </Button>
    </div>
  );
}

function ContractForm({
  initial,
  agentId,
  onClose,
}: {
  initial?: OutputContract;
  agentId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("schema");

  const [enforcementMode, setEnforcementMode] = useState(initial?.enforcementMode ?? "strict");
  const [schemaJson, setSchemaJson] = useState(
    initial?.schemaDefinition ? JSON.stringify(initial.schemaDefinition, null, 2) : '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
  );
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [repairEnabled, setRepairEnabled] = useState(initial?.repairEnabled ?? true);
  const [maxRepairAttempts, setMaxRepairAttempts] = useState(String(initial?.maxRepairAttempts ?? 1));
  const [repairTemperature, setRepairTemperature] = useState(String(initial?.repairTemperature ?? 0.0));
  const [repairPromptSuffix, setRepairPromptSuffix] = useState(initial?.repairPromptSuffix ?? "");
  const [fallbackJson, setFallbackJson] = useState(
    initial?.fallbackOutput ? JSON.stringify(initial.fallbackOutput, null, 2) : "",
  );
  const [qualityScorerEnabled, setQualityScorerEnabled] = useState(initial?.qualityScorerEnabled ?? false);
  const [qualityThreshold, setQualityThreshold] = useState(String(initial?.qualityFailureThreshold ?? 0.68));

  const typedInitial = initial as TypedOutputContract | undefined;

  const initNormalizers = (): NormalizerRule[] => {
    const raw = typedInitial?.normalizers;
    if (Array.isArray(raw)) return raw as NormalizerRule[];
    return [];
  };

  const initExpectedSections = (): ExpectedSection[] => {
    const cfg = typedInitial?.qualityScorerConfig;
    if (cfg?.expected_sections && Array.isArray(cfg.expected_sections)) return cfg.expected_sections;
    return [];
  };

  const [normalizers, setNormalizers] = useState<NormalizerRule[]>(initNormalizers);
  const [expectedSections, setExpectedSections] = useState<ExpectedSection[]>(initExpectedSections);

  const isEdit = !!initial;
  const savedId = initial?.id;

  const saveMutation = useMutation({
    mutationFn: async () => {
      let parsedSchema: Record<string, unknown>;
      try {
        parsedSchema = JSON.parse(schemaJson);
        setSchemaError(null);
      } catch {
        setSchemaError("Invalid JSON schema");
        throw new Error("Invalid JSON schema");
      }
      let parsedFallback: Record<string, unknown> | null = null;
      if (fallbackJson.trim()) {
        try { parsedFallback = JSON.parse(fallbackJson); } catch { throw new Error("Invalid fallback output JSON"); }
      }
      const qualityScorerConfig: QualityScorerConfig = {
        expected_sections: expectedSections.length > 0 ? expectedSections : undefined,
        failure_threshold: parseFloat(qualityThreshold) || 0.68,
      };
      const body = {
        agentId,
        schemaType: "json_schema",
        schemaDefinition: parsedSchema,
        enforcementMode,
        repairEnabled,
        maxRepairAttempts: parseInt(maxRepairAttempts) || 1,
        repairTemperature: parseFloat(repairTemperature) || 0.0,
        repairPromptSuffix: repairPromptSuffix || null,
        fallbackOutput: parsedFallback,
        qualityScorerEnabled,
        qualityFailureThreshold: parseFloat(qualityThreshold) || 0.68,
        normalizers,
        qualityScorerConfig: qualityScorerEnabled ? qualityScorerConfig : null,
      };
      if (isEdit) {
        const res = await apiRequest("PATCH", `/api/output-contracts/${initial!.id}`, body);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/output-contracts", body);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/output-contracts"] });
      toast({ title: isEdit ? "Contract updated" : "Contract created" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex flex-col gap-4" style={{ maxHeight: "72vh", overflowY: "auto" }}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-5 h-auto">
          <TabsTrigger value="schema" className="text-[10px] py-1.5" data-testid="tab-schema">Schema</TabsTrigger>
          <TabsTrigger value="normalizers" className="text-[10px] py-1.5" data-testid="tab-normalizers">Normalizers</TabsTrigger>
          <TabsTrigger value="quality" className="text-[10px] py-1.5" data-testid="tab-quality">Quality</TabsTrigger>
          <TabsTrigger value="enforcement" className="text-[10px] py-1.5" data-testid="tab-enforcement">Enforcement</TabsTrigger>
          <TabsTrigger value="validate" className="text-[10px] py-1.5" data-testid="tab-validate" disabled={!savedId}>Validate</TabsTrigger>
        </TabsList>

        <TabsContent value="schema" className="mt-3 flex flex-col gap-2">
          <Label className="text-xs font-semibold">JSON Schema Definition (draft-2020-12)</Label>
          <p className="text-[11px] text-muted-foreground">Define the required structure for LLM outputs. Validation uses AJV with strict type coercion.</p>
          <Textarea
            value={schemaJson}
            onChange={(e) => setSchemaJson(e.target.value)}
            className="font-mono text-xs min-h-[200px]"
            data-testid="input-schema-definition"
          />
          {schemaError && <p className="text-[11px] text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {schemaError}</p>}
        </TabsContent>

        <TabsContent value="normalizers" className="mt-3">
          <p className="text-[11px] text-muted-foreground mb-3">Normalizer rules run before validation. They coerce, clamp, or alias fields to match the expected schema.</p>
          <NormalizerRuleBuilder rules={normalizers} onChange={setNormalizers} />
        </TabsContent>

        <TabsContent value="quality" className="mt-3 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-semibold">Quality Scorer</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">Score 35% structure / 25% style / 20% tone / 20% completeness</p>
            </div>
            <Switch checked={qualityScorerEnabled} onCheckedChange={setQualityScorerEnabled} data-testid="switch-quality-scorer" />
          </div>
          {qualityScorerEnabled && (
            <>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Failure Threshold (0–1)</Label>
                <Input
                  type="number" min={0} max={1} step={0.01}
                  value={qualityThreshold}
                  onChange={(e) => setQualityThreshold(e.target.value)}
                  data-testid="input-quality-threshold"
                  className="w-36"
                />
                <p className="text-[11px] text-muted-foreground">Scores below this trigger deterministic repair. Default: 0.68</p>
              </div>
              <Separator />
              <div>
                <Label className="text-xs font-semibold">Expected Sections</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">Define output sections and their quality requirements.</p>
                <ExpectedSectionsBuilder sections={expectedSections} onChange={setExpectedSections} />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="enforcement" className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold">Enforcement Mode</Label>
            <Select value={enforcementMode} onValueChange={setEnforcementMode}>
              <SelectTrigger data-testid="select-enforcement-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENFORCEMENT_MODES.map(m => (
                  <SelectItem key={m.value} value={m.value}>
                    <span className="font-medium">{m.label}</span>
                    <span className="text-muted-foreground text-[11px] ml-2">— {m.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Repair on Failure</Label>
              <Switch checked={repairEnabled} onCheckedChange={setRepairEnabled} data-testid="switch-repair-enabled" />
            </div>
            {repairEnabled && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Max Repair Attempts</Label>
                    <Input type="number" min={1} max={3} value={maxRepairAttempts} onChange={(e) => setMaxRepairAttempts(e.target.value)} data-testid="input-max-repair-attempts" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Repair Temperature</Label>
                    <Input type="number" min={0} max={1} step={0.1} value={repairTemperature} onChange={(e) => setRepairTemperature(e.target.value)} data-testid="input-repair-temperature" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Repair Prompt Suffix (optional)</Label>
                  <Textarea value={repairPromptSuffix} onChange={(e) => setRepairPromptSuffix(e.target.value)} placeholder="Instructions appended to repair prompt..." className="text-xs min-h-[60px]" data-testid="input-repair-prompt-suffix" />
                </div>
              </>
            )}
          </div>

          {enforcementMode === "lenient" && (
            <>
              <Separator />
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold">Fallback Output (JSON)</Label>
                <Textarea value={fallbackJson} onChange={(e) => setFallbackJson(e.target.value)} placeholder='{ "summary": "Unable to generate output" }' className="font-mono text-xs min-h-[80px]" data-testid="input-fallback-output" />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="validate" className="mt-3">
          {savedId ? (
            <ValidatePanel contractId={savedId} />
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">Save the contract first to run validation tests.</p>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" size="sm" onClick={onClose} data-testid="button-cancel-contract">Cancel</Button>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-contract">
          {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
          {isEdit ? "Save Changes" : "Create Contract"}
        </Button>
      </div>
    </div>
  );
}

export function OutputContractEditor({ agentId }: OutputContractEditorProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OutputContract | null>(null);
  const [validateTarget, setValidateTarget] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: contracts = [], isLoading } = useQuery<OutputContract[]>({
    queryKey: ["/api/output-contracts", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/output-contracts?agentId=${agentId}`);
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/output-contracts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/output-contracts"] });
      toast({ title: "Contract deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const modeLabel: Record<string, { color: string; label: string }> = {
    strict: { color: "bg-red-500/15 text-red-600 border-red-500/20", label: "Strict" },
    strict_with_interrupt: { color: "bg-orange-500/15 text-orange-600 border-orange-500/20", label: "Interrupt" },
    lenient: { color: "bg-blue-500/15 text-blue-600 border-blue-500/20", label: "Lenient" },
    monitor: { color: "bg-muted text-muted-foreground border-border", label: "Monitor" },
  };

  return (
    <div className="flex flex-col gap-4" data-testid="output-contract-editor">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-violet-500" />
            Output Contracts
          </h3>
          <p className="text-xs text-muted-foreground">AJV 2020-12 validation · normalizer pipeline · LLM repair loop · quality scoring</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} data-testid="button-create-contract">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          New Contract
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading contracts...
        </div>
      ) : contracts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-8">
            <ShieldCheck className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No output contracts configured</p>
            <p className="text-xs text-muted-foreground/70">Create a contract to enforce JSON Schema validation on LLM outputs</p>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} data-testid="button-create-first-contract">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Create First Contract
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {contracts.map((contract) => {
            const mode = modeLabel[contract.enforcementMode ?? "strict"] ?? modeLabel.strict;
            const typedContract = contract as TypedOutputContract;
            const normalizerCount = Array.isArray(typedContract.normalizers) ? typedContract.normalizers.length : 0;
            const sectionCount = Array.isArray(typedContract.qualityScorerConfig?.expected_sections) ? typedContract.qualityScorerConfig!.expected_sections!.length : 0;
            return (
              <Card key={contract.id} data-testid={`card-contract-${contract.id}`}>
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${mode.color}`}>{mode.label}</Badge>
                      {contract.repairEnabled && (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                          <RefreshCw className="w-3 h-3 mr-1" /> Repair ×{contract.maxRepairAttempts}
                        </Badge>
                      )}
                      {normalizerCount > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-600 border-sky-500/20">
                          {normalizerCount} normalizer{normalizerCount !== 1 ? "s" : ""}
                        </Badge>
                      )}
                      {contract.qualityScorerEnabled && (
                        <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 border-violet-500/20">
                          Quality ≥{((contract.qualityFailureThreshold ?? 0.68) * 100).toFixed(0)}%
                          {sectionCount > 0 && ` · ${sectionCount} section${sectionCount !== 1 ? "s" : ""}`}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setValidateTarget(validateTarget === contract.id ? null : contract.id)}
                        data-testid={`button-validate-${contract.id}`}
                        title="Validate"
                      >
                        <Play className="w-3.5 h-3.5 text-emerald-500" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditTarget(contract)} data-testid={`button-edit-contract-${contract.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(contract.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-contract-${contract.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <pre className="text-[10px] font-mono bg-muted/30 p-2 rounded-md overflow-auto max-h-20 whitespace-pre-wrap">
                    {JSON.stringify(contract.schemaDefinition, null, 2)}
                  </pre>

                  {validateTarget === contract.id && (
                    <div className="mt-1 border-t pt-3">
                      <ValidatePanel contractId={contract.id} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New Output Contract</DialogTitle>
            <DialogDescription>Define a JSON Schema contract to validate and repair LLM outputs</DialogDescription>
          </DialogHeader>
          <ContractForm agentId={agentId} onClose={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Output Contract</DialogTitle>
            <DialogDescription>Update the enforcement configuration</DialogDescription>
          </DialogHeader>
          {editTarget && <ContractForm agentId={agentId} initial={editTarget} onClose={() => setEditTarget(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
