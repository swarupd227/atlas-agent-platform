import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ShieldCheck,
  Loader2,
  XCircle,
  GitBranch,
  RotateCcw,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { ResponseFieldForm } from "./response-field-form";
import type { InterruptResponseField, InterruptRoutingRule } from "@shared/schema";

interface InterruptDefinition {
  id: string;
  name: string;
  description?: string | null;
  responseSchema: InterruptResponseField[];
  routingRules: InterruptRoutingRule[];
  stateInjectionMap: Array<{ responseKey: string; stateKey: string; transform?: string }>;
  loopBackStageId?: string | null;
}

interface InterruptInstance {
  id: string;
  definitionId: string;
  status: string;
  loopIteration: number;
  firedAt: string;
  responsePayload?: Record<string, unknown> | null;
  routingOutcome?: string | null;
}

interface StructuredInterruptReviewProps {
  runId: string;
  pipelineId: string;
  stageId: string;
  stageName: string;
  stageOutput?: string;
  stateSnapshot?: Record<string, unknown> | null;
  onResolved: () => void;
  onReject: () => void;
  isRejecting?: boolean;
}

export function StructuredInterruptReview({
  runId,
  pipelineId,
  stageId,
  stageName,
  stageOutput,
  stateSnapshot,
  onResolved,
  onReject,
  isRejecting = false,
}: StructuredInterruptReviewProps) {
  const { toast } = useToast();
  const [responseValues, setResponseValues] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [showRouting, setShowRouting] = useState(false);

  const { data: definitions = [] } = useQuery<InterruptDefinition[]>({
    queryKey: ["/api/interrupt-definitions", pipelineId],
    queryFn: () =>
      fetch(`/api/interrupt-definitions?pipelineId=${pipelineId}`).then((r) => r.json()),
  });

  const { data: instances = [] } = useQuery<InterruptInstance[]>({
    queryKey: ["/api/pipeline-runs", runId, "interrupt-instances"],
    queryFn: () =>
      fetch(`/api/pipeline-runs/${runId}/interrupt-instances`).then((r) => r.json()),
    refetchInterval: 5000,
  });

  const definition = definitions.find((d) => d.id === instances.find((i) => i.status === "pending")?.definitionId);
  const openInstance = instances.find((i) => i.status === "pending");
  const responseSchema: InterruptResponseField[] = definition?.responseSchema ?? [];
  const routingRules: InterruptRoutingRule[] = definition?.routingRules ?? [];

  const resumeMutation = useMutation({
    mutationFn: async () => {
      if (!openInstance) throw new Error("No open interrupt instance");
      const res = await apiRequest("POST", `/api/pipeline-runs/${runId}/resume`, {
        instanceId: openInstance.id,
        responsePayload: responseValues,
        respondedBy: "operator",
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-runs", runId, "interrupt-instances"] });
      toast({ title: "Interrupt resolved", description: "Pipeline is resuming." });
      onResolved();
    },
    onError: (err: unknown) => {
      if (err && typeof err === "object" && "validationErrors" in err) {
        const errs: string[] = (err as any).validationErrors ?? [];
        const newFieldErrors: Record<string, string> = {};
        for (const e of errs) {
          const match = e.match(/^Field "(.+)" (.+)$/);
          if (match) {
            const fld = responseSchema.find((f) => f.label === match[1] || f.key === match[1]);
            if (fld) newFieldErrors[fld.key] = e;
          }
        }
        setFieldErrors(newFieldErrors);
        toast({ title: "Validation failed", description: errs[0], variant: "destructive" });
      } else {
        toast({
          title: "Failed to resume",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
  });

  const handleFieldChange = (key: string, value: unknown) => {
    setResponseValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const matchingRule = routingRules.find((rule) => {
    const val = responseValues[rule.fieldKey];
    switch (rule.operator) {
      case "eq": return val === rule.value;
      case "neq": return val !== rule.value;
      case "contains": return typeof val === "string" && val.includes(String(rule.value));
      case "gte": return Number(val) >= Number(rule.value);
      case "lte": return Number(val) <= Number(rule.value);
      case "in": return Array.isArray(rule.value) && (rule.value as unknown[]).includes(val);
      default: return false;
    }
  });

  const wouldLoopBack =
    !matchingRule &&
    definition?.loopBackStageId &&
    (responseValues._loop_back === true || responseValues._loop_back === "true");

  const routePreview = matchingRule
    ? `→ Conditional route: ${matchingRule.label || matchingRule.targetStageId}`
    : wouldLoopBack
    ? `↩ Loop back to previous stage`
    : `→ Continue to next stage`;

  const isStructured = !!definition && !!openInstance;

  return (
    <div
      className="mt-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700/40 p-3 space-y-3"
      data-testid={`structured-interrupt-panel-${stageId}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-medium">{stageName}</span>
          {isStructured && (
            <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">
              structured
            </Badge>
          )}
        </div>
        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
          awaiting response
        </Badge>
      </div>

      {stageOutput && (
        <p className="text-xs text-muted-foreground italic">
          {stageOutput.substring(0, 300)}{stageOutput.length > 300 ? "…" : ""}
        </p>
      )}

      {stateSnapshot && Object.keys(stateSnapshot).length > 0 && (
        <div>
          <button
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowSnapshot((v) => !v)}
            data-testid="button-toggle-snapshot"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${showSnapshot ? "rotate-180" : ""}`} />
            State snapshot ({Object.keys(stateSnapshot).length} keys)
          </button>
          {showSnapshot && (
            <pre className="mt-1 text-[10px] font-mono bg-background/60 border rounded p-2 whitespace-pre-wrap overflow-x-auto max-h-36">
              {JSON.stringify(stateSnapshot, null, 2)}
            </pre>
          )}
        </div>
      )}

      {isStructured && definition && (
        <>
          <Separator />
          <div className="space-y-1">
            <p className="text-xs font-semibold">{definition.name}</p>
            {definition.description && (
              <p className="text-[11px] text-muted-foreground">{definition.description}</p>
            )}
            {openInstance.loopIteration > 0 && (
              <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300">
                <RotateCcw className="w-2.5 h-2.5 mr-1" />
                Loop #{openInstance.loopIteration}
              </Badge>
            )}
          </div>

          <ScrollArea className="max-h-[320px]">
            <ResponseFieldForm
              fields={responseSchema}
              values={responseValues}
              onChange={handleFieldChange}
              errors={fieldErrors}
              disabled={resumeMutation.isPending}
            />
          </ScrollArea>

          {routingRules.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setShowRouting((v) => !v)}
                data-testid="button-toggle-routing"
              >
                <GitBranch className="w-3 h-3" />
                {routingRules.length} routing rule{routingRules.length !== 1 ? "s" : ""}
                <ChevronDown className={`w-3 h-3 transition-transform ${showRouting ? "rotate-180" : ""}`} />
              </button>
              {showRouting && (
                <div className="mt-1 space-y-1">
                  {routingRules.map((rule, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-[11px] px-2 py-1 rounded border ${matchingRule === rule ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700/40" : "bg-background/60 border-border"}`}
                      data-testid={`routing-rule-${i}`}
                    >
                      <span className="font-mono text-muted-foreground">{rule.fieldKey}</span>
                      <span className="text-muted-foreground">{rule.operator}</span>
                      <span className="font-mono">{JSON.stringify(rule.value)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-mono text-blue-600">{rule.label || rule.targetStageId}</span>
                      {matchingRule === rule && <CheckCircle2 className="w-3 h-3 text-green-500 ml-auto" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(routingRules.length > 0 || definition.loopBackStageId) && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground bg-background/60 border rounded px-2 py-1">
              <GitBranch className="w-3 h-3 shrink-0" />
              <span>{routePreview}</span>
            </div>
          )}
        </>
      )}

      {Object.keys(fieldErrors).length > 0 && (
        <div className="flex items-start gap-1 rounded border border-red-200 bg-red-50 dark:bg-red-950/20 p-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
          <div className="text-xs text-red-600 space-y-0.5">
            {Object.values(fieldErrors).map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button
          size="sm"
          onClick={() => resumeMutation.mutate()}
          disabled={resumeMutation.isPending || isRejecting}
          className="bg-green-600 hover:bg-green-700 text-white"
          data-testid={`button-submit-interrupt-${stageId}`}
        >
          {resumeMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
          )}
          {isStructured ? "Submit Response" : "Approve"}
        </Button>
        <button
          className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
          onClick={onReject}
          disabled={isRejecting || resumeMutation.isPending}
          data-testid={`button-reject-interrupt-${stageId}`}
        >
          <XCircle className="w-3 h-3" />
          {isRejecting ? "Rejecting…" : "Reject pipeline"}
        </button>
      </div>
    </div>
  );
}
