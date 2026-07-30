import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { streamProposeAgents } from "@/lib/propose-agents-stream";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, ArrowRight, Bot, Crown } from "lucide-react";

interface ProposedEdge {
  from?: string;
  to?: string;
  label?: string;
  type?: string;
  branchCondition?: string | null;
  branchRule?: unknown;
}
interface ProposedAgent {
  name: string;
  description: string;
  role?: string;
  [key: string]: unknown;
}
interface ProposalResult {
  orchestrator: ProposedAgent | null;
  agents: ProposedAgent[];
  pipeline: ({ pattern?: string; edges?: ProposedEdge[] } & Record<string, unknown>) | null;
}

type Step = "describe" | "review" | "creating";

const EXAMPLE_PLACEHOLDER =
  "e.g. When a new supplier invoice arrives, check it against our purchase order, get manager approval for invoices over $10,000, then schedule payment and notify the supplier.";


// Business-user entry point for creating a real, running multi-agent
// automation: describe it in plain English, review the drafted steps and
// branch conditions, confirm. Wraps the existing propose-agents /
// create-team-from-proposals pipeline (normally outcome-scoped) used
// standalone -- see server/routes/improvements.ts for the optional-outcomeId
// and deterministic-edge support this relies on.
export function TeamProposalDialog({
  open,
  onOpenChange,
  initialDescription = "",
  processFlowSteps,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDescription?: string;
  processFlowSteps?: unknown[];
}) {
  const [step, setStep] = useState<Step>("describe");
  const [description, setDescription] = useState(initialDescription);
  const [proposal, setProposal] = useState<ProposalResult | null>(null);
  const [editedConditions, setEditedConditions] = useState<Record<number, string>>({});
  const [draftProgress, setDraftProgress] = useState<string | null>(null);
  const [draftElapsedSec, setDraftElapsedSec] = useState(0);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  function reset() {
    setStep("describe");
    setProposal(null);
    setEditedConditions({});
    setDraftProgress(null);
    setDraftElapsedSec(0);
  }

  // The dialog stays mounted across opens (e.g. on the Process Flows page), so
  // useState(initialDescription) only captures the value from first mount --
  // resync it every time the dialog opens so it reflects the *current* flow.
  useEffect(() => {
    if (open) {
      setDescription(initialDescription);
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const proposeMutation = useMutation({
    mutationFn: async () => {
      setDraftProgress("Starting...");
      return (await streamProposeAgents(
        {
          outcomeContract: { name: description.slice(0, 60), description },
          kpis: [],
          processFlowSteps,
        },
        setDraftProgress,
      )) as ProposalResult;
    },
    onSuccess: (data) => {
      setDraftProgress(null);
      if (!data.orchestrator && (!data.agents || data.agents.length === 0)) {
        const likelyTooLarge = (data as any).likelyTooLarge as boolean | undefined;
        toast({
          title: likelyTooLarge ? "This team is too large to draft in one go" : "Couldn't draft a team from that description",
          description: (data as any).error || "Try adding more detail about the steps involved.",
          variant: "destructive",
        });
        // Deliberately NOT calling reset() or clearing `description` here --
        // the user's typed input stays in the box so they can retry (e.g.
        // after splitting a too-large ask into stages) without retyping it.
        return;
      }
      setProposal(data);
      setStep("review");
    },
    onError: (err: Error) => {
      setDraftProgress(null);
      // Most failures now arrive as a plain message via the SSE error event
      // (see streamProposeAgents above). A pre-stream failure (e.g. auth)
      // can still surface as "<status>: <json-or-text-body>" from
      // throwIfResNotOk in queryClient.ts -- unwrap the JSON body's `error`
      // field when present so the user sees the specific, actionable
      // message instead of a raw status code.
      let description = err.message;
      const jsonStart = err.message.indexOf("{");
      if (jsonStart >= 0) {
        try {
          const parsed = JSON.parse(err.message.slice(jsonStart));
          if (parsed?.error) description = parsed.error;
        } catch {}
      }
      toast({ title: "Couldn't draft this team", description, variant: "destructive" });
      // Deliberately NOT calling reset() or clearing `description` here --
      // see the onSuccess branch above for why.
    },
  });

  // Live elapsed-time tick while drafting, purely a UI signal ("still going,
  // not stuck") -- independent of the real progress-stage text from the
  // stream, which only updates at a handful of discrete checkpoints.
  useEffect(() => {
    if (!proposeMutation.isPending) return;
    setDraftElapsedSec(0);
    const id = setInterval(() => setDraftElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposeMutation.isPending]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!proposal?.orchestrator) throw new Error("No orchestrator in proposal");
      const pipeline = proposal.pipeline
        ? {
            ...proposal.pipeline,
            edges: (proposal.pipeline.edges || []).map((e, i) =>
              editedConditions[i] !== undefined ? { ...e, branchCondition: editedConditions[i] } : e,
            ),
          }
        : null;
      const res = await apiRequest("POST", "/api/ai/create-team-from-proposals", {
        orchestrator: proposal.orchestrator,
        workers: proposal.agents,
        pipeline,
      });
      const data = await res.json();

      // Creating the team only registers it -- it has zero runs until
      // something deploys it, yet the old toast said "is ready" and dropped
      // the user on a dormant agent page with the actual run trigger buried
      // in an overflow menu. Deploy & start it immediately (same call and
      // loop outcome-detail.tsx's launchWorkersAutomatically already uses
      // for this exact "AI drafted a team, now make it live" moment), so by
      // the time the user lands on the agent page, "is ready" is literally
      // true instead of aspirational.
      const agentIds: string[] = [data.teamAgent?.id, ...((data.workers || []).map((w: any) => w.id))].filter(Boolean);
      const agentNamesById = new Map<string, string>();
      if (data.teamAgent?.id) agentNamesById.set(data.teamAgent.id, data.teamAgent.name || data.teamAgent.id);
      for (const w of data.workers || []) {
        if (w?.id) agentNamesById.set(w.id, w.name || w.id);
      }
      let deploySuccesses = 0;
      // Per-agent deploy failures used to be swallowed by an empty catch, so a
      // partial-failure team only ever showed an aggregate success/fail count
      // -- capture which agent failed and why so it can be surfaced in the UI.
      const deployErrors: { agentId: string; agentName: string; error: string }[] = [];
      for (const agentId of agentIds) {
        try {
          await apiRequest("POST", `/api/agents/${agentId}/deploy-and-run`, {});
          deploySuccesses++;
        } catch (err: any) {
          // apiRequest throws `<status>: <json-or-text-body>` on non-2xx
          // responses (see throwIfResNotOk in queryClient.ts) -- unwrap the
          // JSON body's `error`/`message` field when present, same as the
          // onError handler above, so the surfaced text is specific.
          let message = err?.message || "Unknown error";
          const jsonStart = message.indexOf("{");
          if (jsonStart >= 0) {
            try {
              const parsed = JSON.parse(message.slice(jsonStart));
              if (parsed?.error) message = parsed.error;
              else if (parsed?.message) message = parsed.message;
            } catch {}
          }
          deployErrors.push({ agentId, agentName: agentNamesById.get(agentId) || agentId, error: message });
        }
      }
      return { ...data, deploySuccesses, deployTotal: agentIds.length, deployErrors };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      const deployedAll = data.deployTotal > 0 && data.deploySuccesses === data.deployTotal;
      const deployErrors: { agentId: string; agentName: string; error: string }[] = data.deployErrors || [];
      // deploy-and-run only actually executes immediately for continuous/
      // scheduled triggers -- for the on-demand default it just registers
      // the runtime (confirmed via its own response message: "Use 'Run Now'
      // to trigger execution"), so "has started its first run" would be a
      // second instance of the exact overclaim this fix exists to remove.
      toast({
        title: deployedAll ? "Automation created and deployed" : "Automation created",
        description: deployedAll ? (
          `"${data.teamAgent?.name}" is live and ready. Use "Run Test" on its page to see it work.`
        ) : deployErrors.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span>
              {`"${data.teamAgent?.name}" was created, but ${deployErrors.length} of ${data.deployTotal} agent(s) failed to deploy:`}
            </span>
            <ul className="list-disc pl-4">
              {deployErrors.map((e, i) => (
                <li key={i}>{`${e.agentName}: ${e.error}`}</li>
              ))}
            </ul>
            <span>Deploy the failed agent(s) from its page to run it.</span>
          </div>
        ) : (
          `"${data.teamAgent?.name}" was created, but couldn't deploy automatically. Deploy it from its page to run it.`
        ),
        variant: deployedAll ? "default" : "destructive",
      });
      onOpenChange(false);
      reset();
      if (data.teamAgent?.id) navigate(`/agents/${data.teamAgent.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create automation", description: err.message, variant: "destructive" });
      setStep("review");
    },
  });

  const conditionalEdges = (proposal?.pipeline?.edges || [])
    .map((e, i) => ({ ...e, i }))
    .filter((e) => e.type === "conditional");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-team-proposal">
        {step === "describe" && (
          <>
            <DialogHeader>
              <DialogTitle>Describe your automation</DialogTitle>
              <DialogDescription>
                Plain English is fine — who's involved, what happens in order, and any approval thresholds. We'll
                draft a working team from it.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={EXAMPLE_PLACEHOLDER}
              className="min-h-[140px] resize-none"
              data-testid="textarea-automation-description"
            />
            {proposeMutation.isPending && (
              <div
                className="flex items-center gap-2 text-xs text-muted-foreground -mt-1"
                data-testid="text-draft-progress"
              >
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                <span className="truncate">{draftProgress || "Working..."}</span>
                <span className="ml-auto tabular-nums shrink-0">{draftElapsedSec}s</span>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-proposal">
                Cancel
              </Button>
              <Button
                onClick={() => proposeMutation.mutate()}
                disabled={description.trim().length < 10 || proposeMutation.isPending}
                data-testid="button-draft-automation"
              >
                {proposeMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Drafting...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-1.5" /> Draft it
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "review" && proposal && (
          <>
            <DialogHeader>
              <DialogTitle>Review your automation</DialogTitle>
              <DialogDescription>Nothing is created yet — check the steps and conditions below, then confirm.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {proposal.orchestrator && (
                <div className="flex items-center gap-2 p-2 rounded-md border" data-testid="review-orchestrator">
                  <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{proposal.orchestrator.name}</span>
                    <span className="text-[11px] text-muted-foreground">{proposal.orchestrator.description}</span>
                  </div>
                </div>
              )}
              {(proposal.agents || []).map((a, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-md border ml-4" data-testid={`review-worker-${i}`}>
                  <Bot className="w-3.5 h-3.5 text-primary shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{a.name}</span>
                    <span className="text-[11px] text-muted-foreground">{a.description}</span>
                  </div>
                </div>
              ))}
            </div>

            {conditionalEdges.length > 0 && (
              <div className="flex flex-col gap-2 pt-2 border-t">
                <span className="text-xs font-medium text-muted-foreground">Branch conditions</span>
                {conditionalEdges.map(({ i, branchCondition, to }) => (
                  <div key={i} className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">Before routing to {to}:</span>
                    <Textarea
                      value={editedConditions[i] ?? branchCondition ?? ""}
                      onChange={(e) => setEditedConditions((prev) => ({ ...prev, [i]: e.target.value }))}
                      className="min-h-[44px] resize-none text-xs"
                      data-testid={`textarea-branch-condition-${i}`}
                    />
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">
                  Fine-tune the exact comparison after creation, in the automation's advanced editor.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("describe")} data-testid="button-back-to-describe">
                Back
              </Button>
              <Button
                onClick={() => {
                  setStep("creating");
                  createMutation.mutate();
                }}
                disabled={createMutation.isPending}
                data-testid="button-confirm-create-automation"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Creating...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4 mr-1.5" /> Create automation
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "creating" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Setting up your automation...</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
