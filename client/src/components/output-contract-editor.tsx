import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2, Play, CheckCircle2, XCircle, Loader2, ShieldCheck, RefreshCw, AlertTriangle } from "lucide-react";
import type { OutputContract } from "@shared/schema";

interface OutputContractEditorProps {
  agentId: string;
}

interface DryRunResult {
  output: Record<string, unknown>;
  validationStatus: string;
  repairAttempts: number;
  validationErrors: string[];
  qualityScore?: number;
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

function DryRunPanel({ contractId }: { contractId: string }) {
  const [sampleJson, setSampleJson] = useState<string>('{\n  "summary": "example output"\n}');
  const [result, setResult] = useState<DryRunResult | null>(null);
  const { toast } = useToast();

  const dryRun = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/output-contracts/${contractId}/dry-run`, { sampleJson });
      return res.json();
    },
    onSuccess: (data: DryRunResult) => {
      setResult(data);
    },
    onError: (err: Error) => {
      toast({ title: "Dry run failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <Label className="text-xs font-semibold">Sample JSON to validate</Label>
      <Textarea
        value={sampleJson}
        onChange={(e) => setSampleJson(e.target.value)}
        className="font-mono text-xs min-h-[120px]"
        data-testid="input-dry-run-json"
      />
      <Button
        size="sm"
        onClick={() => dryRun.mutate()}
        disabled={dryRun.isPending}
        data-testid="button-dry-run-contract"
        className="self-start"
      >
        {dryRun.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
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
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  {e}
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
  const [enforcementMode, setEnforcementMode] = useState(initial?.enforcementMode ?? "strict");
  const [schemaJson, setSchemaJson] = useState(
    initial?.schemaDefinition ? JSON.stringify(initial.schemaDefinition, null, 2) : '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}'
  );
  const [repairEnabled, setRepairEnabled] = useState(initial?.repairEnabled ?? true);
  const [maxRepairAttempts, setMaxRepairAttempts] = useState(String(initial?.maxRepairAttempts ?? 1));
  const [repairTemperature, setRepairTemperature] = useState(String(initial?.repairTemperature ?? 0.0));
  const [repairPromptSuffix, setRepairPromptSuffix] = useState(initial?.repairPromptSuffix ?? "");
  const [fallbackJson, setFallbackJson] = useState(
    initial?.fallbackOutput ? JSON.stringify(initial.fallbackOutput, null, 2) : ""
  );
  const [qualityScorerEnabled, setQualityScorerEnabled] = useState(initial?.qualityScorerEnabled ?? false);
  const [qualityThreshold, setQualityThreshold] = useState(String((initial?.qualityFailureThreshold ?? 0.68)));
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const isEdit = !!initial;

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
        try {
          parsedFallback = JSON.parse(fallbackJson);
        } catch {
          throw new Error("Invalid fallback output JSON");
        }
      }

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
    <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
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

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-semibold">JSON Schema Definition</Label>
        <Textarea
          value={schemaJson}
          onChange={(e) => setSchemaJson(e.target.value)}
          className="font-mono text-xs min-h-[140px]"
          data-testid="input-schema-definition"
        />
        {schemaError && <p className="text-[11px] text-destructive">{schemaError}</p>}
      </div>

      <Separator />
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Repair on Failure</Label>
          <Switch
            checked={repairEnabled}
            onCheckedChange={setRepairEnabled}
            data-testid="switch-repair-enabled"
          />
        </div>
        {repairEnabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Max Repair Attempts</Label>
                <Input
                  type="number"
                  min={1}
                  max={3}
                  value={maxRepairAttempts}
                  onChange={(e) => setMaxRepairAttempts(e.target.value)}
                  data-testid="input-max-repair-attempts"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Repair Temperature</Label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={repairTemperature}
                  onChange={(e) => setRepairTemperature(e.target.value)}
                  data-testid="input-repair-temperature"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Repair Prompt Suffix (optional)</Label>
              <Textarea
                value={repairPromptSuffix}
                onChange={(e) => setRepairPromptSuffix(e.target.value)}
                placeholder="Instructions appended to repair prompt..."
                className="text-xs min-h-[60px]"
                data-testid="input-repair-prompt-suffix"
              />
            </div>
          </>
        )}
      </div>

      <Separator />
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Quality Scorer</Label>
          <Switch
            checked={qualityScorerEnabled}
            onCheckedChange={setQualityScorerEnabled}
            data-testid="switch-quality-scorer"
          />
        </div>
        {qualityScorerEnabled && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Failure Threshold (0–1)</Label>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={qualityThreshold}
              onChange={(e) => setQualityThreshold(e.target.value)}
              data-testid="input-quality-threshold"
            />
            <p className="text-[11px] text-muted-foreground">Scores below this trigger deterministic repair. Default: 0.68</p>
          </div>
        )}
      </div>

      {enforcementMode === "lenient" && (
        <>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold">Fallback Output (JSON)</Label>
            <Textarea
              value={fallbackJson}
              onChange={(e) => setFallbackJson(e.target.value)}
              placeholder='{ "summary": "Unable to generate output" }'
              className="font-mono text-xs min-h-[80px]"
              data-testid="input-fallback-output"
            />
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose} data-testid="button-cancel-contract">Cancel</Button>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-contract"
        >
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
  const [dryRunTarget, setDryRunTarget] = useState<string | null>(null);
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
          <p className="text-xs text-muted-foreground">Configuration-driven JSON Schema validation with repair &amp; quality scoring</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCreateOpen(true)}
          data-testid="button-create-contract"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          New Contract
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading contracts...
        </div>
      ) : contracts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-8">
            <ShieldCheck className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No output contracts configured</p>
            <p className="text-xs text-muted-foreground/70">Create a contract to enforce JSON Schema validation on LLM outputs</p>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} data-testid="button-create-first-contract">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Create First Contract
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {contracts.map((contract) => {
            const mode = modeLabel[contract.enforcementMode ?? "strict"] ?? modeLabel.strict;
            return (
              <Card key={contract.id} data-testid={`card-contract-${contract.id}`}>
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${mode.color}`}>
                        {mode.label}
                      </Badge>
                      {contract.repairEnabled && (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Repair ×{contract.maxRepairAttempts}
                        </Badge>
                      )}
                      {contract.qualityScorerEnabled && (
                        <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 border-violet-500/20">
                          Quality ≥{((contract.qualityFailureThreshold ?? 0.68) * 100).toFixed(0)}%
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDryRunTarget(dryRunTarget === contract.id ? null : contract.id)}
                        data-testid={`button-dryrun-${contract.id}`}
                        title="Dry run validation"
                      >
                        <Play className="w-3.5 h-3.5 text-emerald-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditTarget(contract)}
                        data-testid={`button-edit-contract-${contract.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(contract.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-contract-${contract.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <pre className="text-[10px] font-mono bg-muted/30 p-2 rounded-md overflow-auto max-h-24 whitespace-pre-wrap">
                    {JSON.stringify(contract.schemaDefinition, null, 2)}
                  </pre>

                  {dryRunTarget === contract.id && (
                    <div className="mt-1 border-t pt-3">
                      <DryRunPanel contractId={contract.id} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Output Contract</DialogTitle>
            <DialogDescription>Define a JSON Schema contract to validate and repair LLM outputs</DialogDescription>
          </DialogHeader>
          <ContractForm agentId={agentId} onClose={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Output Contract</DialogTitle>
            <DialogDescription>Update the enforcement configuration</DialogDescription>
          </DialogHeader>
          {editTarget && (
            <ContractForm agentId={agentId} initial={editTarget} onClose={() => setEditTarget(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
