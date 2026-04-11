import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Save,
  Settings2,
  ChevronDown,
  GitBranch,
  Shuffle,
  RotateCcw,
  Loader2,
} from "lucide-react";
import type {
  InterruptDefinition,
  InterruptResponseField,
  InterruptRoutingRule,
  InterruptStateInjectionEntry,
} from "@shared/schema";

interface PipelineStage {
  id: string;
  label: string;
  stageType: string;
}

interface InterruptDefConfiguratorProps {
  pipelineId: string;
  stageId: string;
  stageName: string;
  allStages?: PipelineStage[];
  onSaved?: (def: InterruptDefinition) => void;
}

const FIELD_TYPES = ["text", "textarea", "number", "boolean", "select", "multi_select"] as const;
const OPERATORS = ["eq", "neq", "contains", "gte", "lte", "in"] as const;
const TRANSFORMS = ["passthrough", "stringify", "parse_number", "parse_bool"] as const;

function emptyField(): InterruptResponseField {
  return { key: "", type: "text", label: "", required: false };
}

function emptyRoutingRule(stageId: string): InterruptRoutingRule {
  return { fieldKey: "", operator: "eq", value: "", targetStageId: stageId };
}

function emptyInjection(): InterruptStateInjectionEntry {
  return { responseKey: "", stateKey: "", transform: "passthrough" };
}

export function InterruptDefConfigurator({
  pipelineId,
  stageId,
  stageName,
  allStages = [],
  onSaved,
}: InterruptDefConfiguratorProps) {
  const { toast } = useToast();

  const [section, setSection] = useState<"fields" | "routing" | "injection">("fields");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [loopBackStageId, setLoopBackStageId] = useState<string>("");
  const [fields, setFields] = useState<InterruptResponseField[]>([emptyField()]);
  const [routingRules, setRoutingRules] = useState<InterruptRoutingRule[]>([]);
  const [injectionMap, setInjectionMap] = useState<InterruptStateInjectionEntry[]>([]);

  const { data: defs = [], isLoading } = useQuery<InterruptDefinition[]>({
    queryKey: ["/api/interrupt-definitions", pipelineId],
    queryFn: () => fetch(`/api/interrupt-definitions?pipelineId=${pipelineId}`).then((r) => r.json()),
    enabled: !!pipelineId,
  });

  const existingDef = defs.find((d) => d.stageId === stageId);

  useEffect(() => {
    if (existingDef) {
      setName(existingDef.name);
      setDescription(existingDef.description || "");
      setEnabled(existingDef.enabled);
      setLoopBackStageId(existingDef.loopBackStageId || "");
      const rs = existingDef.responseSchema as InterruptResponseField[];
      setFields(rs.length > 0 ? rs : [emptyField()]);
      const rr = existingDef.routingRules as InterruptRoutingRule[];
      setRoutingRules(rr);
      const im = existingDef.stateInjectionMap as InterruptStateInjectionEntry[];
      setInjectionMap(im);
    }
  }, [existingDef?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        pipelineId,
        stageId,
        name: name.trim() || stageName,
        description: description.trim() || undefined,
        enabled,
        responseSchema: fields.filter((f) => f.key.trim() !== ""),
        routingRules: routingRules.filter((r) => r.fieldKey.trim() !== "" && r.targetStageId.trim() !== ""),
        stateInjectionMap: injectionMap.filter((e) => e.responseKey.trim() !== "" && e.stateKey.trim() !== ""),
        loopBackStageId: loopBackStageId || undefined,
      };
      if (existingDef) {
        return apiRequest("PUT", `/api/interrupt-definitions/${existingDef.id}`, body);
      } else {
        return apiRequest("POST", "/api/interrupt-definitions", body);
      }
    },
    onSuccess: (data: InterruptDefinition) => {
      queryClient.invalidateQueries({ queryKey: ["/api/interrupt-definitions", pipelineId] });
      toast({ title: existingDef ? "Definition updated" : "Definition created" });
      onSaved?.(data);
    },
    onError: (e: unknown) => {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!existingDef) return;
      await apiRequest("DELETE", `/api/interrupt-definitions/${existingDef.id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interrupt-definitions", pipelineId] });
      toast({ title: "Definition deleted" });
      setName(""); setDescription(""); setFields([emptyField()]); setRoutingRules([]); setInjectionMap([]);
    },
  });

  const updateField = (i: number, patch: Partial<InterruptResponseField>) => {
    setFields((prev) => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  };

  const updateRule = (i: number, patch: Partial<InterruptRoutingRule>) => {
    setRoutingRules((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  };

  const updateInjection = (i: number, patch: Partial<InterruptStateInjectionEntry>) => {
    setInjectionMap((prev) => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  };

  const otherStages = allStages.filter((s) => s.id !== stageId);

  if (isLoading) return <div className="p-3 text-xs text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-3" data-testid={`interrupt-configurator-${stageId}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium">Interrupt Definition</span>
          {existingDef && (
            <Badge variant="outline" className="text-[10px]">
              {existingDef.enabled ? "enabled" : "disabled"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            data-testid="switch-interrupt-enabled"
          />
          <span className="text-xs text-muted-foreground">{enabled ? "Active" : "Off"}</span>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <Label className="text-xs">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={stageName}
            className="h-7 text-xs mt-0.5"
            data-testid="input-interrupt-name"
          />
        </div>
        <div>
          <Label className="text-xs">Description (optional)</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What input is needed from the operator…"
            className="text-xs min-h-[48px] mt-0.5"
            data-testid="textarea-interrupt-description"
          />
        </div>
      </div>

      <Separator />

      <div className="flex items-center gap-1 rounded-md border bg-background/60 p-0.5 w-fit">
        {(["fields", "routing", "injection"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${section === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            data-testid={`tab-interrupt-${s}`}
          >
            {s === "fields" ? `Fields (${fields.filter((f) => f.key).length})`
              : s === "routing" ? `Routing (${routingRules.length})`
              : `Injection (${injectionMap.length})`}
          </button>
        ))}
      </div>

      <ScrollArea className="max-h-[300px]">
        {section === "fields" && (
          <div className="space-y-3">
            {fields.map((field, i) => (
              <div key={i} className="rounded border p-2 space-y-2 bg-background/60" data-testid={`field-row-${i}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Field {i + 1}</span>
                  <button onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive" data-testid={`delete-field-${i}`}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <Label className="text-[10px]">Key</Label>
                    <Input value={field.key} onChange={(e) => updateField(i, { key: e.target.value })} className="h-6 text-xs mt-0.5 font-mono" placeholder="field_key" data-testid={`field-key-${i}`} />
                  </div>
                  <div>
                    <Label className="text-[10px]">Type</Label>
                    <Select value={field.type} onValueChange={(v) => updateField(i, { type: v as InterruptResponseField["type"] })}>
                      <SelectTrigger className="h-6 text-xs mt-0.5" data-testid={`field-type-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Label</Label>
                    <Input value={field.label} onChange={(e) => updateField(i, { label: e.target.value })} className="h-6 text-xs mt-0.5" placeholder="Human-readable label" data-testid={`field-label-${i}`} />
                  </div>
                  {(field.type === "select" || field.type === "multi_select") && (
                    <div className="col-span-2">
                      <Label className="text-[10px]">Options (comma-separated)</Label>
                      <Input
                        value={(field.options || []).join(", ")}
                        onChange={(e) => updateField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                        className="h-6 text-xs mt-0.5"
                        placeholder="option1, option2, option3"
                        data-testid={`field-options-${i}`}
                      />
                    </div>
                  )}
                  <div className="col-span-2">
                    <Label className="text-[10px]">Help text (optional)</Label>
                    <Input value={field.helpText || ""} onChange={(e) => updateField(i, { helpText: e.target.value })} className="h-6 text-xs mt-0.5" placeholder="Brief instruction for the operator" data-testid={`field-help-${i}`} />
                  </div>
                  <div className="flex items-center gap-2 col-span-2">
                    <Switch checked={!!field.required} onCheckedChange={(v) => updateField(i, { required: v })} data-testid={`field-required-${i}`} />
                    <span className="text-xs text-muted-foreground">Required</span>
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => setFields((prev) => [...prev, emptyField()])} data-testid="button-add-field">
              <Plus className="w-3 h-3 mr-1" /> Add Field
            </Button>
          </div>
        )}

        {section === "routing" && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">Rules are evaluated in order. First match wins.</p>
            {routingRules.map((rule, i) => (
              <div key={i} className="rounded border p-2 space-y-2 bg-background/60" data-testid={`rule-row-${i}`}>
                <div className="flex items-center justify-between">
                  <GitBranch className="w-3 h-3 text-blue-500" />
                  <button onClick={() => setRoutingRules((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive" data-testid={`delete-rule-${i}`}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <Label className="text-[10px]">Field Key</Label>
                    <Select value={rule.fieldKey} onValueChange={(v) => updateRule(i, { fieldKey: v })}>
                      <SelectTrigger className="h-6 text-xs mt-0.5" data-testid={`rule-field-${i}`}><SelectValue placeholder="Field…" /></SelectTrigger>
                      <SelectContent>{fields.filter((f) => f.key).map((f) => <SelectItem key={f.key} value={f.key}>{f.label || f.key}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px]">Operator</Label>
                    <Select value={rule.operator} onValueChange={(v) => updateRule(i, { operator: v as InterruptRoutingRule["operator"] })}>
                      <SelectTrigger className="h-6 text-xs mt-0.5" data-testid={`rule-op-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{OPERATORS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px]">Value</Label>
                    <Input value={String(rule.value ?? "")} onChange={(e) => updateRule(i, { value: e.target.value })} className="h-6 text-xs mt-0.5" data-testid={`rule-value-${i}`} />
                  </div>
                  <div>
                    <Label className="text-[10px]">Route to Stage</Label>
                    <Select value={rule.targetStageId} onValueChange={(v) => updateRule(i, { targetStageId: v })}>
                      <SelectTrigger className="h-6 text-xs mt-0.5" data-testid={`rule-target-${i}`}><SelectValue placeholder="Stage…" /></SelectTrigger>
                      <SelectContent>{allStages.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Label (optional)</Label>
                    <Input value={rule.label || ""} onChange={(e) => updateRule(i, { label: e.target.value })} className="h-6 text-xs mt-0.5" placeholder="e.g. Escalate to legal" data-testid={`rule-label-${i}`} />
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => setRoutingRules((prev) => [...prev, emptyRoutingRule(otherStages[0]?.id || stageId)])} data-testid="button-add-rule">
              <Plus className="w-3 h-3 mr-1" /> Add Rule
            </Button>

            <Separator />
            <div>
              <Label className="text-xs flex items-center gap-1.5"><RotateCcw className="w-3 h-3" /> Loop-back Stage (optional)</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5 mb-1">When the response includes _loop_back=true, route to this stage.</p>
              <Select value={loopBackStageId} onValueChange={setLoopBackStageId}>
                <SelectTrigger className="h-7 text-xs" data-testid="select-loopback-stage"><SelectValue placeholder="No loop-back" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {otherStages.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {section === "injection" && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">Map response fields into workflow state fields on resume.</p>
            {injectionMap.map((entry, i) => (
              <div key={i} className="rounded border p-2 space-y-2 bg-background/60" data-testid={`injection-row-${i}`}>
                <div className="flex items-center justify-between">
                  <Shuffle className="w-3 h-3 text-purple-500" />
                  <button onClick={() => setInjectionMap((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive" data-testid={`delete-injection-${i}`}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <Label className="text-[10px]">Response Key</Label>
                    <Select value={entry.responseKey} onValueChange={(v) => updateInjection(i, { responseKey: v })}>
                      <SelectTrigger className="h-6 text-xs mt-0.5" data-testid={`injection-resp-${i}`}><SelectValue placeholder="Response field…" /></SelectTrigger>
                      <SelectContent>{fields.filter((f) => f.key).map((f) => <SelectItem key={f.key} value={f.key}>{f.label || f.key}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px]">State Key</Label>
                    <Input value={entry.stateKey} onChange={(e) => updateInjection(i, { stateKey: e.target.value })} className="h-6 text-xs mt-0.5 font-mono" placeholder="state.field" data-testid={`injection-state-${i}`} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Transform</Label>
                    <Select value={entry.transform || "passthrough"} onValueChange={(v) => updateInjection(i, { transform: v as InterruptStateInjectionEntry["transform"] })}>
                      <SelectTrigger className="h-6 text-xs mt-0.5" data-testid={`injection-transform-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{TRANSFORMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => setInjectionMap((prev) => [...prev, emptyInjection()])} data-testid="button-add-injection">
              <Plus className="w-3 h-3 mr-1" /> Add Injection
            </Button>
          </div>
        )}
      </ScrollArea>

      <Separator />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="h-7 text-xs"
            data-testid="button-save-interrupt-def"
          >
            {saveMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
            {existingDef ? "Update" : "Create"}
          </Button>
        </div>
        {existingDef && (
          <button
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-interrupt-def"
          >
            <Trash2 className="w-3 h-3" />
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}
