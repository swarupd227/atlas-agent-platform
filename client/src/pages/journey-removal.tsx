/**
 * Removing a journey.
 *
 * A journey is a team wearing a library badge, so "remove it" is two different
 * acts and the dialog keeps them apart: take it out of the library and keep
 * the team, or delete the team. Before either, it names every agent that would
 * go, every worker that stays because another team uses it, and what is kept
 * regardless — the runs, because they happened, and the process flow, because
 * a flow can outlive the team that ran it.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface RemovalPlan {
  journeyId: string;
  journeyName: string;
  workers: Array<{ id: string; name: string; alsoUsedBy: string[] }>;
  deletes: string[];
  keeps: string[];
  runCount: number;
  processFlowName: string | null;
}

/** What deleting takes, in one line, for the dialog's first sentence. */
export function deletesLine(plan: Pick<RemovalPlan, "deletes">): string {
  const n = plan.deletes.length;
  return n === 1 ? "1 agent is deleted:" : `${n} agents are deleted:`;
}

/** What survives it, in the order it matters. Empty when nothing does. */
export function keepsLines(plan: Pick<RemovalPlan, "keeps" | "runCount" | "processFlowName">): string[] {
  const lines: string[] = [];
  for (const kept of plan.keeps) lines.push(`${kept} — another team uses it, so it stays`);
  if (plan.runCount > 0) lines.push(`${plan.runCount} past ${plan.runCount === 1 ? "run stays" : "runs stay"} in the run history`);
  if (plan.processFlowName) lines.push(`the process flow "${plan.processFlowName}" stays`);
  return lines;
}

export function RemoveJourney({ journeyId, journeyName, onRemoved }: { journeyId: string; journeyName: string; onRemoved?: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const plan = useQuery<RemovalPlan>({ queryKey: [`/api/journeys/${journeyId}/removal`], enabled: open });

  const done = (title: string, description: string) => {
    queryClient.invalidateQueries({ queryKey: ["/api/journeys"] });
    queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
    setOpen(false);
    toast({ title, description });
    onRemoved?.();
  };

  const unlist = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/journeys/${journeyId}/unlist`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "It could not be taken out of the library.");
      return res.json();
    },
    onSuccess: () => done("Out of the library", `${journeyName} still exists as a team, and still runs.`),
    onError: (e: Error) => toast({ title: "Not removed", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/journeys/${journeyId}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "It could not be deleted.");
      return res.json();
    },
    onSuccess: (data: { deleted?: string[]; kept?: string[] }) =>
      done("Journey deleted", `${data?.deleted?.length ?? 0} agents deleted${data?.kept?.length ? `, ${data.kept.length} kept for other teams` : ""}.`),
    onError: (e: Error) => toast({ title: "Not deleted", description: e.message, variant: "destructive" }),
  });

  const busy = unlist.isPending || remove.isPending;
  const keeps = plan.data ? keepsLines(plan.data) : [];

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
        data-testid={`button-remove-journey-${journeyId}`}
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />Remove
      </Button>

      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent data-testid="dialog-remove-journey">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {journeyName}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-3 text-sm">
                {plan.isLoading && <span className="text-muted-foreground">Working out what this would take…</span>}
                {plan.error && <span className="text-muted-foreground">Its contents couldn't be read, so deleting isn't offered.</span>}
                {plan.data && (
                  <>
                    <div>
                      <p className="font-medium text-foreground">Take it out of the library</p>
                      <p className="text-muted-foreground">It leaves the Journey Library. The team, its agents and its runs are untouched, and you can still open and run it from Agents.</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Delete the team</p>
                      <p className="text-muted-foreground">{deletesLine(plan.data)}</p>
                      <ul className="mt-1 list-disc pl-5 text-muted-foreground" data-testid="list-journey-deletes">
                        {plan.data.deletes.map((name) => <li key={name}>{name}</li>)}
                      </ul>
                      {keeps.length > 0 && (
                        <ul className="mt-1.5 list-disc pl-5 text-muted-foreground" data-testid="list-journey-keeps">
                          {keeps.map((line) => <li key={line}>{line}</li>)}
                        </ul>
                      )}
                      <p className="mt-1.5 text-muted-foreground">This can't be undone.</p>
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button variant="outline" disabled={busy || !plan.data} onClick={() => unlist.mutate()} data-testid="button-unlist-journey">
              {unlist.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Removing…</> : "Take out of the library"}
            </Button>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy || !plan.data}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
              data-testid="button-delete-journey"
            >
              {remove.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Deleting…</> : "Delete the team"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
