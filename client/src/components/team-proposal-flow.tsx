import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  const { toast } = useToast();
  const [, navigate] = useLocation();

  function reset() {
    setStep("describe");
    setProposal(null);
    setEditedConditions({});
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
      const res = await apiRequest("POST", "/api/ai/propose-agents", {
        outcomeContract: { name: description.slice(0, 60), description },
        kpis: [],
        processFlowSteps,
      });
      return (await res.json()) as ProposalResult;
    },
    onSuccess: (data) => {
      if (!data.orchestrator && (!data.agents || data.agents.length === 0)) {
        toast({
          title: "Couldn't draft a team from that description",
          description: "Try adding more detail about the steps involved.",
          variant: "destructive",
        });
        return;
      }
      setProposal(data);
      setStep("review");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to draft automation", description: err.message, variant: "destructive" });
    },
  });

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
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Automation created", description: `"${data.teamAgent?.name}" is ready.` });
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
