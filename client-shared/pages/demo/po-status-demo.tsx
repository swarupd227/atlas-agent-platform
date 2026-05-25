import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

const INTEGRATION_COLORS: Record<string, string> = {
  sap:  "bg-sky-500/10 text-sky-400 border-sky-500/20",
  jira: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const STATUS_COLORS = {
  pending:  "text-zinc-500",
  running:  "text-yellow-400 animate-pulse",
  complete: "text-emerald-400",
  error:    "text-red-400",
};

const STATUS_ICONS = {
  pending:  "○",
  running:  "◌",
  complete: "✓",
  error:    "✗",
};

export default function PoStatusDemo() {
  const qc = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data: state } = useQuery({
    queryKey: ["/api/demo/po-status/status"],
    refetchInterval: autoRefresh ? 600 : false,
  }) as { data: any };

  const trigger = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/po-status/trigger"),
    onSuccess: () => {
      setAutoRefresh(true);
      qc.invalidateQueries({ queryKey: ["/api/demo/po-status/status"] });
    },
  });

  const reset = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/po-status/reset"),
    onSuccess: () => {
      setAutoRefresh(false);
      qc.invalidateQueries({ queryKey: ["/api/demo/po-status/status"] });
    },
  });

  if (state?.status === "complete" && autoRefresh) setAutoRefresh(false);

  const steps: any[] = state?.steps ?? [];
  const summary = state?.summary ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-white">PO Status Agent</span>
            <Badge className="bg-sky-600/20 text-sky-300 border-sky-500/30 text-xs">Wave 4 Demo</Badge>
          </div>
          <p className="text-zinc-400 text-sm">
            Procurement intelligence: SAP open POs → inventory check → vendor lookup → Jira escalation
          </p>
          <div className="flex gap-2 flex-wrap">
            {["SAP S/4HANA", "Jira"].map(s => (
              <Badge key={s} variant="outline" className="text-xs border-zinc-700 text-zinc-400">{s}</Badge>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-3">
          <Button
            data-testid="button-run-po"
            onClick={() => trigger.mutate()}
            disabled={trigger.isPending || state?.status === "running"}
            className="bg-sky-600 hover:bg-sky-700 text-white"
          >
            {state?.status === "running" ? "Running..." : "▶  Run Demo"}
          </Button>
          <Button
            data-testid="button-reset-po"
            variant="outline"
            onClick={() => reset.mutate()}
            disabled={reset.isPending}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            ↺  Reset
          </Button>
          {state?.status === "complete" && state.elapsedMs && (
            <span className="text-zinc-500 text-sm self-center">
              Completed in {state.elapsedMs}ms
            </span>
          )}
        </div>

        {/* Steps */}
        {steps.length > 0 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-zinc-300 font-mono">Execution Trace</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {steps.map((step: any) => (
                <div key={step.id} className="border border-zinc-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${STATUS_COLORS[step.status as keyof typeof STATUS_COLORS] ?? "text-zinc-400"}`}>
                        {STATUS_ICONS[step.status as keyof typeof STATUS_ICONS]}
                      </span>
                      <span className="text-sm text-zinc-200">{step.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`text-xs border ${INTEGRATION_COLORS[step.integration] ?? "border-zinc-700 text-zinc-400"}`}>
                        {step.integration}
                      </Badge>
                      <code className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{step.tool}</code>
                      {step.mode === "live" && (
                        <Badge className="bg-emerald-600/20 text-emerald-300 border-emerald-500/30 text-xs">LIVE</Badge>
                      )}
                      {step.elapsedMs != null && (
                        <span className="text-zinc-500 text-xs">{step.elapsedMs}ms</span>
                      )}
                    </div>
                  </div>
                  {step.output && step.status === "complete" && (
                    <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-2 overflow-x-auto max-h-32">
                      {JSON.stringify(step.output, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        {summary && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-zinc-300 font-mono flex items-center gap-2">
                <span>Procurement Escalation Summary</span>
                <Badge className="bg-red-600/20 text-red-300 border-red-500/30 text-xs">
                  {summary.overdueDays}d OVERDUE
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-zinc-500 text-xs mb-1">Purchase Order</div>
                  <div className="text-white font-medium">{summary.poNumber}</div>
                </div>
                <div>
                  <div className="text-zinc-500 text-xs mb-1">Vendor</div>
                  <div className="text-white font-medium">{summary.vendor}</div>
                </div>
                <div>
                  <div className="text-zinc-500 text-xs mb-1">Material / Plant</div>
                  <div className="text-white font-medium">{summary.material} @ {summary.plant}</div>
                </div>
                <div>
                  <div className="text-zinc-500 text-xs mb-1">Stock On Hand vs Ordered</div>
                  <div className="text-red-400 font-bold">
                    {summary.stockOnHand} EA on hand / {summary.orderedQty} EA ordered
                  </div>
                </div>
                {summary.jiraTicket && (
                  <div className="col-span-2">
                    <div className="text-zinc-500 text-xs mb-1">Jira Escalation Ticket</div>
                    <div className="flex items-center gap-2">
                      <code className="text-blue-400 font-medium">{summary.jiraTicket}</code>
                      {summary.jiraUrl && (
                        <a
                          href={summary.jiraUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-zinc-500 hover:text-zinc-300 underline"
                        >
                          {summary.jiraUrl}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-zinc-800 pt-3 text-xs text-zinc-500 italic">{summary.note}</div>
            </CardContent>
          </Card>
        )}

        {/* Attribution */}
        <div className="text-xs text-zinc-600 text-center border-t border-zinc-800 pt-4">
          Atlas Agent Orchestrator — PO Status Agent — Wave 4 Data &amp; ERP
        </div>
      </div>
    </div>
  );
}
