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
  Loader2,
  MousePointerClick,
  Eye,
  RotateCcw,
} from "lucide-react";
import type {
  InterruptDefinition,
  InterruptAction,
  InterruptActionStyle,
  InterruptRoutingType,
  InterruptResponseField,
  InterruptStateInjectionEntry,
  InterruptStateTransform,
  InterruptContextField,
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
const TRANSFORMS: InterruptStateTransform[] = ["passthrough", "stringify", "parse_number", "parse_bool"];
const ACTION_STYLES: InterruptActionStyle[] = ["default", "destructive", "outline", "secondary"];
const ROUTING_TYPES: InterruptRoutingType[] = ["next_stage", "loop_back", "goto_stage", "complete"];
const INTERRUPT_TYPES = ["approval", "review", "data_entry", "escalation"] as const;

function emptyField(): InterruptResponseField {
  return { key: "", type: "text", label: "", required: false };
}

function emptyInjection(): InterruptStateInjectionEntry {
  return { responseKey: "", stateKey: "", transform: "passthrough" };
}

function emptyContextField(): InterruptContextField {
  return { key: "", label: "", format: "text" };
}

function emptyAction(): InterruptAction {
  return {
    id: `action_${Date.now()}`,
    label: "New Action",
    style: "default",
    description: "",
    responseFields: [],
    routing: { type: "next_stage" },
    stateInjection: [],
  };
}

function TabBtn({ id, current, label, onClick }: { id: string; current: string; label: string; onClick: (id: string) => void }) {
  return (
    <button
      className={`px-3 py-1 text-xs rounded-sm transition-colors ${current === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
      onClick={() => onClick(id)}
    >
      {label}
    </button>
  );
}

export function InterruptDefConfigurator({
  pipelineId,
  stageId,
  stageName,
  allStages = [],
  onSaved,
}: InterruptDefConfiguratorProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"settings" | "actions" | "context">("settings");
  const [expanded, setExpanded] = useState(false);
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [expandedActionTab, setExpandedActionTab] = useState<Record<string, "fields" | "routing" | "injection">>({});

  const [name, setName] = useState("Gate Review");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [interruptType, setInterruptType] = useState<string>("approval");
  const [loopBackEnabled, setLoopBackEnabled] = useState(false);
  const [maxLoops, setMaxLoops] = useState(3);
  const [allowedActions, setAllowedActions] = useState<InterruptAction[]>([]);
  const [contextFields, setContextFields] = useState<InterruptContextField[]>([]);

  const { data: existingDef } = useQuery<InterruptDefinition | null>({
    queryKey: ["/api/interrupt-definitions", pipelineId, stageId],
    queryFn: async () => {
      const defs = await fetch(`/api/interrupt-definitions?pipelineId=${pipelineId}`).then((r) => r.json()) as InterruptDefinition[];
      return defs.find((d) => d.stageId === stageId) ?? null;
    },
    enabled: !!pipelineId && !!stageId,
  });

  useEffect(() => {
    if (existingDef) {
      setName(existingDef.name || "Gate Review");
      setTitle(existingDef.title || "");
      setDescription(existingDef.description || "");
      setInterruptType(existingDef.interruptType || "approval");
      setLoopBackEnabled(existingDef.loopBackEnabled ?? false);
      setMaxLoops(existingDef.maxLoops ?? 3);
      setAllowedActions((existingDef.allowedActions as InterruptAction[]) || []);
      setContextFields((existingDef.contextFields as InterruptContextField[]) || []);
    }
  }, [existingDef]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        pipelineId,
        stageId,
        name: name.trim() || stageName,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        interruptType,
        loopBackEnabled,
        maxLoops,
        allowedActions: allowedActions.filter((a) => a.id && a.label.trim()),
        contextFields: contextFields.filter((cf) => cf.key.trim() && cf.label.trim()),
        enabled: true,
      };
      if (existingDef) {
        const res = await apiRequest("PUT", `/api/interrupt-definitions/${existingDef.id}`, payload);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/interrupt-definitions", payload);
        return res.json();
      }
    },
    onSuccess: (saved: InterruptDefinition) => {
      queryClient.invalidateQueries({ queryKey: ["/api/interrupt-definitions", pipelineId] });
      queryClient.invalidateQueries({ queryKey: ["/api/interrupt-definitions", pipelineId, stageId] });
      toast({ title: existingDef ? "Definition updated" : "Definition created" });
      onSaved?.(saved);
    },
    onError: (e: unknown) => {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const addAction = () => {
    const a = emptyAction();
    setAllowedActions((prev) => [...prev, a]);
    setExpandedActionId(a.id);
  };

  const removeAction = (id: string) => {
    setAllowedActions((prev) => prev.filter((a) => a.id !== id));
    if (expandedActionId === id) setExpandedActionId(null);
  };

  const patchAction = (id: string, patch: Partial<InterruptAction>) => {
    setAllowedActions((prev) => prev.map((a) => a.id === id ? { ...a, ...patch } : a));
  };

  const actionTab = (id: string): "fields" | "routing" | "injection" =>
    expandedActionTab[id] ?? "fields";

  const setActionTab = (id: string, t: "fields" | "routing" | "injection") => {
    setExpandedActionTab((prev) => ({ ...prev, [id]: t }));
  };

  const updateActionField = (actionId: string, idx: number, patch: Partial<InterruptResponseField>) => {
    setAllowedActions((prev) => prev.map((a) => {
      if (a.id !== actionId) return a;
      const fields = a.responseFields.map((f, i) => i === idx ? { ...f, ...patch } : f);
      return { ...a, responseFields: fields };
    }));
  };

  const addActionField = (actionId: string) => {
    setAllowedActions((prev) => prev.map((a) =>
      a.id === actionId ? { ...a, responseFields: [...a.responseFields, emptyField()] } : a
    ));
  };

  const removeActionField = (actionId: string, idx: number) => {
    setAllowedActions((prev) => prev.map((a) =>
      a.id === actionId ? { ...a, responseFields: a.responseFields.filter((_, i) => i !== idx) } : a
    ));
  };

  const updateActionInjection = (actionId: string, idx: number, patch: Partial<InterruptStateInjectionEntry>) => {
    setAllowedActions((prev) => prev.map((a) => {
      if (a.id !== actionId) return a;
      const inj = a.stateInjection.map((e, i) => i === idx ? { ...e, ...patch } : e);
      return { ...a, stateInjection: inj };
    }));
  };

  const addActionInjection = (actionId: string) => {
    setAllowedActions((prev) => prev.map((a) =>
      a.id === actionId ? { ...a, stateInjection: [...a.stateInjection, emptyInjection()] } : a
    ));
  };

  const removeActionInjection = (actionId: string, idx: number) => {
    setAllowedActions((prev) => prev.map((a) =>
      a.id === actionId ? { ...a, stateInjection: a.stateInjection.filter((_, i) => i !== idx) } : a
    ));
  };

  const updateContextField = (idx: number, patch: Partial<InterruptContextField>) => {
    setContextFields((prev) => prev.map((cf, i) => i === idx ? { ...cf, ...patch } : cf));
  };

  const nonGateStages = allStages.filter((s) => s.id !== stageId);

  return (
    <div className="rounded-md border bg-muted/20 overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        data-testid="interrupt-def-configurator-toggle"
      >
        <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Interrupt Configuration</span>
        {existingDef ? (
          <Badge variant="outline" className="text-[9px] h-4 px-1 text-blue-600 border-blue-300 ml-1">
            configured
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[9px] h-4 px-1 ml-1">
            none
          </Badge>
        )}
        <ChevronDown className={`w-3.5 h-3.5 ml-auto text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t">
          {/* Tabs */}
          <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/10">
            <TabBtn id="settings" current={tab} label="Settings" onClick={(id) => setTab(id as typeof tab)} />
            <TabBtn
              id="actions"
              current={tab}
              label={`Actions (${allowedActions.length})`}
              onClick={(id) => setTab(id as typeof tab)}
            />
            <TabBtn
              id="context"
              current={tab}
              label={`Context Fields (${contextFields.length})`}
              onClick={(id) => setTab(id as typeof tab)}
            />
          </div>

          <ScrollArea className="max-h-[420px]">
            <div className="p-3 space-y-3">

              {/* Settings Tab */}
              {tab === "settings" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name (internal)</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Quality Review Gate"
                      className="h-7 text-xs"
                      data-testid="input-def-name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Display Title</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Shown to the operator in the review panel"
                      className="h-7 text-xs"
                      data-testid="input-def-title"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Explain what the operator needs to do"
                      className="text-xs min-h-[52px]"
                      data-testid="input-def-description"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Interrupt Type</Label>
                    <Select value={interruptType} onValueChange={setInterruptType}>
                      <SelectTrigger className="h-7 text-xs" data-testid="select-interrupt-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INTERRUPT_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs">Loop-back Enabled</Label>
                      <p className="text-[10px] text-muted-foreground">Allow actions to loop back to an earlier stage</p>
                    </div>
                    <Switch
                      checked={loopBackEnabled}
                      onCheckedChange={setLoopBackEnabled}
                      data-testid="switch-loop-back"
                    />
                  </div>
                  {loopBackEnabled && (
                    <div className="space-y-1">
                      <Label className="text-xs">Max Loop Iterations</Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={maxLoops}
                        onChange={(e) => setMaxLoops(Math.max(1, parseInt(e.target.value) || 3))}
                        className="h-7 text-xs w-24"
                        data-testid="input-max-loops"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Actions Tab */}
              {tab === "actions" && (
                <div className="space-y-2">
                  {allowedActions.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      No actions defined. Add an action to control how operators respond.
                    </p>
                  )}
                  {allowedActions.map((action) => {
                    const isExpanded = expandedActionId === action.id;
                    const at = actionTab(action.id);
                    return (
                      <div key={action.id} className="rounded border bg-background/60 overflow-hidden" data-testid={`action-row-${action.id}`}>
                        <div className="flex items-center gap-2 px-2 py-2">
                          <MousePointerClick className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <Input
                            value={action.label}
                            onChange={(e) => patchAction(action.id, { label: e.target.value })}
                            placeholder="Action label"
                            className="h-6 text-xs flex-1 border-0 bg-transparent p-0 focus-visible:ring-0"
                            data-testid={`input-action-label-${action.id}`}
                          />
                          <Select
                            value={action.style}
                            onValueChange={(v) => patchAction(action.id, { style: v as InterruptActionStyle })}
                          >
                            <SelectTrigger className="h-6 w-28 text-[11px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ACTION_STYLES.map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <button
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => setExpandedActionId(isExpanded ? null : action.id)}
                            data-testid={`toggle-action-${action.id}`}
                          >
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </button>
                          <button
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeAction(action.id)}
                            data-testid={`remove-action-${action.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="border-t bg-muted/10">
                            {/* Action sub-tabs */}
                            <div className="flex items-center gap-1 px-2 py-1.5 border-b">
                              {(["fields", "routing", "injection"] as const).map((t) => (
                                <button
                                  key={t}
                                  className={`px-2 py-0.5 text-[11px] rounded transition-colors ${at === t ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                                  onClick={() => setActionTab(action.id, t)}
                                >
                                  {t === "fields" ? `Response Fields (${action.responseFields.length})`
                                    : t === "routing" ? "Routing"
                                    : `Injection (${action.stateInjection.length})`}
                                </button>
                              ))}
                            </div>

                            <div className="p-2 space-y-2">
                              {/* Description for action */}
                              <Input
                                value={action.description ?? ""}
                                onChange={(e) => patchAction(action.id, { description: e.target.value })}
                                placeholder="Optional: describe this action to the operator"
                                className="h-6 text-[11px]"
                              />

                              {/* Fields sub-tab */}
                              {at === "fields" && (
                                <div className="space-y-1.5">
                                  {action.responseFields.map((field, fi) => (
                                    <div key={fi} className="flex items-center gap-1.5" data-testid={`action-field-${action.id}-${fi}`}>
                                      <Input
                                        value={field.key}
                                        onChange={(e) => updateActionField(action.id, fi, { key: e.target.value })}
                                        placeholder="key"
                                        className="h-6 text-[11px] w-20 font-mono"
                                      />
                                      <Input
                                        value={field.label}
                                        onChange={(e) => updateActionField(action.id, fi, { label: e.target.value })}
                                        placeholder="Label"
                                        className="h-6 text-[11px] flex-1"
                                      />
                                      <Select
                                        value={field.type}
                                        onValueChange={(v) => updateActionField(action.id, fi, { type: v as InterruptResponseField["type"] })}
                                      >
                                        <SelectTrigger className="h-6 w-24 text-[11px]">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {FIELD_TYPES.map((t) => (
                                            <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <div className="flex items-center gap-1">
                                        <Switch
                                          checked={field.required ?? false}
                                          onCheckedChange={(v) => updateActionField(action.id, fi, { required: v })}
                                          className="scale-75"
                                        />
                                        <span className="text-[10px] text-muted-foreground">req</span>
                                      </div>
                                      <button onClick={() => removeActionField(action.id, fi)} className="text-muted-foreground hover:text-destructive">
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[11px] w-full"
                                    onClick={() => addActionField(action.id)}
                                    data-testid={`add-field-${action.id}`}
                                  >
                                    <Plus className="w-3 h-3 mr-1" />
                                    Add Field
                                  </Button>
                                </div>
                              )}

                              {/* Routing sub-tab */}
                              {at === "routing" && (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Label className="text-xs w-16 shrink-0">Route to</Label>
                                    <Select
                                      value={action.routing?.type ?? "next_stage"}
                                      onValueChange={(v) =>
                                        patchAction(action.id, {
                                          routing: { ...action.routing, type: v as InterruptRoutingType },
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-7 text-xs flex-1">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {ROUTING_TYPES.map((t) => (
                                          <SelectItem key={t} value={t} className="text-xs">
                                            {t === "next_stage" ? "Continue to next stage"
                                              : t === "loop_back" ? "Loop back to earlier stage"
                                              : t === "goto_stage" ? "Go to specific stage"
                                              : "Complete pipeline"}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  {(action.routing?.type === "loop_back" || action.routing?.type === "goto_stage") && (
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs w-16 shrink-0">
                                        {action.routing.type === "loop_back" ? (
                                          <span className="flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Stage</span>
                                        ) : "Target"}
                                      </Label>
                                      <Select
                                        value={action.routing?.targetStageId ?? ""}
                                        onValueChange={(v) =>
                                          patchAction(action.id, {
                                            routing: { ...action.routing!, targetStageId: v },
                                          })
                                        }
                                      >
                                        <SelectTrigger className="h-7 text-xs flex-1">
                                          <SelectValue placeholder="Select stage" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {nonGateStages.map((s) => (
                                            <SelectItem key={s.id} value={s.id} className="text-xs">
                                              {s.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Injection sub-tab */}
                              {at === "injection" && (
                                <div className="space-y-1.5">
                                  {action.stateInjection.map((entry, ei) => (
                                    <div key={ei} className="flex items-center gap-1.5" data-testid={`injection-entry-${action.id}-${ei}`}>
                                      <Input
                                        value={entry.responseKey}
                                        onChange={(e) => updateActionInjection(action.id, ei, { responseKey: e.target.value })}
                                        placeholder="response key"
                                        className="h-6 text-[11px] w-24 font-mono"
                                      />
                                      <span className="text-[11px] text-muted-foreground">→</span>
                                      <Input
                                        value={entry.stateKey}
                                        onChange={(e) => updateActionInjection(action.id, ei, { stateKey: e.target.value })}
                                        placeholder="state key"
                                        className="h-6 text-[11px] w-24 font-mono"
                                      />
                                      <Select
                                        value={entry.transform ?? "passthrough"}
                                        onValueChange={(v) => updateActionInjection(action.id, ei, { transform: v as InterruptStateTransform })}
                                      >
                                        <SelectTrigger className="h-6 w-24 text-[11px]">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {TRANSFORMS.map((t) => (
                                            <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <button onClick={() => removeActionInjection(action.id, ei)} className="text-muted-foreground hover:text-destructive">
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[11px] w-full"
                                    onClick={() => addActionInjection(action.id)}
                                  >
                                    <Plus className="w-3 h-3 mr-1" />
                                    Add Injection
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs w-full"
                    onClick={addAction}
                    data-testid="add-action-btn"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Action
                  </Button>
                </div>
              )}

              {/* Context Fields Tab */}
              {tab === "context" && (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Context fields are readonly values from the pipeline state displayed to the operator during review.
                  </p>
                  {contextFields.map((cf, idx) => (
                    <div key={idx} className="flex items-center gap-1.5" data-testid={`context-field-row-${idx}`}>
                      <Eye className="w-3 h-3 text-muted-foreground shrink-0" />
                      <Input
                        value={cf.key}
                        onChange={(e) => updateContextField(idx, { key: e.target.value })}
                        placeholder="state key"
                        className="h-6 text-[11px] w-28 font-mono"
                      />
                      <Input
                        value={cf.label}
                        onChange={(e) => updateContextField(idx, { label: e.target.value })}
                        placeholder="Display label"
                        className="h-6 text-[11px] flex-1"
                      />
                      <Select
                        value={cf.format ?? "text"}
                        onValueChange={(v) => updateContextField(idx, { format: v as InterruptContextField["format"] })}
                      >
                        <SelectTrigger className="h-6 w-16 text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text" className="text-xs">text</SelectItem>
                          <SelectItem value="json" className="text-xs">json</SelectItem>
                          <SelectItem value="number" className="text-xs">number</SelectItem>
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => setContextFields((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs w-full"
                    onClick={() => setContextFields((prev) => [...prev, emptyContextField()])}
                    data-testid="add-context-field-btn"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Context Field
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t p-2 flex justify-end">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="save-interrupt-def-btn"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 mr-1" />
              )}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
