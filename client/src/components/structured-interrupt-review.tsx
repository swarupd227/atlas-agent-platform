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
  AlertTriangle,
  MousePointerClick,
} from "lucide-react";
import { ResponseFieldForm } from "./response-field-form";
import type {
  InterruptAction,
  InterruptContextField,
  InterruptResponseField,
  InterruptInstance,
  InterruptDefinition,
} from "@shared/schema";

interface ActiveInterruptResponse {
  instance: InterruptInstance | null;
  definition: InterruptDefinition | null;
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

function formatContextValue(value: unknown, format?: InterruptContextField["format"]): string {
  if (value === undefined || value === null) return "—";
  if (format === "json" || typeof value === "object") {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return String(value);
}

function routingLabel(action: InterruptAction): string {
  if (!action.routing) return "Continue to next stage";
  switch (action.routing.type) {
    case "complete":   return "Complete pipeline";
    case "loop_back":  return `Loop back`;
    case "goto_stage": return `Go to stage`;
    case "next_stage": return "Continue to next stage";
    default:           return "Continue to next stage";
  }
}

export function StructuredInterruptReview({
  runId,
  pipelineId: _pipelineId,
  stageId,
  stageName,
  stageOutput,
  stateSnapshot,
  onResolved,
  onReject,
  isRejecting = false,
}: StructuredInterruptReviewProps) {
  const { toast } = useToast();
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [responseValues, setResponseValues] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showSnapshot, setShowSnapshot] = useState(false);

  const { data: activeData } = useQuery<ActiveInterruptResponse>({
    queryKey: ["/api/pipeline-runs", runId, "interrupt", "active"],
    queryFn: () => fetch(`/api/pipeline-runs/${runId}/interrupt/active`).then((r) => r.json()),
    refetchInterval: 5000,
  });

  const instance = activeData?.instance ?? null;
  const definition = activeData?.definition ?? null;
  const allowedActions: InterruptAction[] = (definition?.allowedActions as InterruptAction[]) ?? [];
  const contextFields: InterruptContextField[] = (definition?.contextFields as InterruptContextField[]) ?? [];

  const selectedAction = allowedActions.find((a) => a.id === selectedActionId) ?? null;
  const actionFields: InterruptResponseField[] = selectedAction?.responseFields ?? [];

  const resumeMutation = useMutation({
    mutationFn: async () => {
      if (!instance) throw new Error("No open interrupt instance");
      if (!selectedActionId) throw new Error("Please select an action");
      const res = await apiRequest("POST", `/api/pipeline-runs/${runId}/resume`, {
        interruptInstanceId: instance.id,
        action: selectedActionId,
        data: responseValues,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-runs", runId, "interrupt", "active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-runs", runId, "interrupts"] });
      toast({ title: "Interrupt resolved", description: "Pipeline is resuming." });
      onResolved();
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message.includes("validationErrors")) {
        toast({ title: "Validation failed", description: err.message, variant: "destructive" });
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

  const selectAction = (id: string) => {
    setSelectedActionId(id === selectedActionId ? null : id);
    setResponseValues({});
    setFieldErrors({});
  };

  const isStructured = !!definition && !!instance;

  return (
    <div
      className="mt-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700/40 p-3 space-y-3"
      data-testid={`structured-interrupt-panel-${stageId}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-medium">
            {definition?.title || definition?.name || stageName}
          </span>
          {isStructured && (
            <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">
              structured
            </Badge>
          )}
          {instance && instance.loopIteration > 0 && (
            <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300">
              <RotateCcw className="w-2.5 h-2.5 mr-1" />
              Loop #{instance.loopIteration}
            </Badge>
          )}
        </div>
        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
          awaiting response
        </Badge>
      </div>

      {/* Stage output */}
      {stageOutput && (
        <p className="text-xs text-muted-foreground italic">
          {stageOutput.substring(0, 300)}{stageOutput.length > 300 ? "…" : ""}
        </p>
      )}

      {/* Description */}
      {definition?.description && (
        <p className="text-xs text-muted-foreground">{definition.description}</p>
      )}

      {/* Context fields (readonly display from state snapshot) */}
      {contextFields.length > 0 && stateSnapshot && (
        <div className="rounded border bg-background/70 divide-y text-xs">
          {contextFields.map((cf) => (
            <div key={cf.key} className="flex items-start gap-2 px-2 py-1.5" data-testid={`context-field-${cf.key}`}>
              <span className="text-muted-foreground shrink-0 w-24 truncate">{cf.label}</span>
              <span className="font-mono text-[11px] break-all">
                {formatContextValue(stateSnapshot[cf.key], cf.format)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* State snapshot fallback (when no context fields defined) */}
      {contextFields.length === 0 && stateSnapshot && Object.keys(stateSnapshot).length > 0 && (
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

      {/* Action buttons */}
      {isStructured && allowedActions.length > 0 && (
        <>
          <Separator />
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <MousePointerClick className="w-3 h-3" />
              Select Action
            </p>
            <div className="flex flex-wrap gap-2">
              {allowedActions.map((action) => {
                const isSelected = selectedActionId === action.id;
                return (
                  <button
                    key={action.id}
                    onClick={() => selectAction(action.id)}
                    data-testid={`action-btn-${action.id}`}
                    className={[
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      isSelected
                        ? action.style === "destructive"
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-primary text-primary-foreground border-primary"
                        : action.style === "destructive"
                        ? "border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        : action.style === "outline"
                        ? "border-border text-foreground hover:bg-muted"
                        : "border-border text-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Action-specific response fields */}
      {selectedAction && (
        <div className="space-y-2">
          {selectedAction.description && (
            <p className="text-[11px] text-muted-foreground">{selectedAction.description}</p>
          )}

          {actionFields.length > 0 && (
            <ScrollArea className="max-h-[280px]">
              <ResponseFieldForm
                fields={actionFields}
                values={responseValues}
                onChange={handleFieldChange}
                errors={fieldErrors}
                disabled={resumeMutation.isPending}
              />
            </ScrollArea>
          )}

          {/* Routing preview for this action */}
          {selectedAction.routing && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground bg-background/60 border rounded px-2 py-1" data-testid="routing-preview">
              <GitBranch className="w-3 h-3 shrink-0" />
              <span>{routingLabel(selectedAction)}</span>
            </div>
          )}
        </div>
      )}

      {/* Validation errors */}
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

      {/* Submit + Reject row */}
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          onClick={() => resumeMutation.mutate()}
          disabled={resumeMutation.isPending || isRejecting || !selectedActionId}
          className={selectedAction?.style === "destructive" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
          data-testid={`button-submit-interrupt-${stageId}`}
        >
          {resumeMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : null}
          {selectedAction ? selectedAction.label : "Submit"}
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
