/**
 * "Delete this?" — with what that actually takes.
 *
 * A confirm that only says "this can't be undone" makes the person guess what
 * they're losing. This one asks the server what the delete would take, and
 * shows it: what goes, what stays and why, and the one thing worth saying last
 * (an agent that leads a team leaves its workers behind).
 *
 * Deleting stays disabled until the plan has loaded, so nobody confirms a
 * list they haven't seen.
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

export interface TeamPlan {
  teamName: string;
  deletes: string[];
  keeps: string[];
  runCount: number;
  processFlowName: string | null;
}

export interface RemovalPlan {
  id: string;
  name: string;
  goes: string[];
  stays: string[];
  warning: string | null;
  /** Present when this agent leads a team: deleting it alone strands the workers. */
  team?: TeamPlan | null;
}

/** The team option's label — deleting 5 agents shouldn't read as deleting one. */
export function teamButtonLabel(team: Pick<TeamPlan, "deletes">): string {
  return `Delete the team (${team.deletes.length} agents)`;
}

/** The dialog's first line: what is being deleted, named. */
export function removeTitle(noun: string, name: string): string {
  return `Delete ${noun} "${name}"?`;
}

export function RemoveDialog({
  noun,
  name,
  planUrl,
  deleteUrl,
  teamDeleteUrl,
  invalidate,
  onDeleted,
  buttonLabel = "Delete",
  iconOnly = false,
  testId,
}: {
  /** "outcome", "agent" — used in the title and the toast. */
  noun: string;
  name: string;
  /** Where to ask what the delete would take. */
  planUrl: string;
  deleteUrl: string;
  /** Where to delete the whole team, when this thing leads one. */
  teamDeleteUrl?: string;
  /** Query keys to refresh afterwards. */
  invalidate: string[];
  onDeleted?: () => void;
  buttonLabel?: string;
  /** A bare ✕ instead of a labelled button, for a row in a list. */
  iconOnly?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const plan = useQuery<RemovalPlan>({ queryKey: [planUrl], enabled: open });

  const [target, setTarget] = useState<"one" | "team">("one");

  const remove = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("DELETE", url);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || (await res.text().catch(() => "")) || `That ${noun} could not be deleted.`);
      return res.json().catch(() => ({}));
    },
    onSuccess: (data: { deleted?: string[]; kept?: string[] }) => {
      for (const key of invalidate) queryClient.invalidateQueries({ queryKey: [key] });
      setOpen(false);
      const deletedTeam = target === "team" && Array.isArray(data?.deleted);
      toast({
        title: target === "team" ? "Team deleted" : `${noun[0].toUpperCase()}${noun.slice(1)} deleted`,
        description: deletedTeam
          ? `${data.deleted!.length} agents gone${data.kept?.length ? `, ${data.kept.length} kept for other teams` : ""}.`
          : `${name} is gone.`,
      });
      onDeleted?.();
    },
    onError: (e: Error) => toast({ title: "Not deleted", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      {iconOnly ? (
        <button
          type="button"
          // Shown on hover or keyboard focus, so a list of rows stays quiet.
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100"
          onClick={() => setOpen(true)}
          aria-label={`Delete ${noun} ${name}`}
          title={`Delete this ${noun}`}
          data-testid={testId ?? `button-remove-${noun}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setOpen(true)}
          data-testid={testId ?? `button-remove-${noun}`}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />{buttonLabel}
        </Button>
      )}

      <AlertDialog open={open} onOpenChange={(next) => !remove.isPending && setOpen(next)}>
        <AlertDialogContent data-testid="dialog-remove">
          <AlertDialogHeader>
            <AlertDialogTitle>{removeTitle(noun, name)}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-3 text-sm">
                {plan.isLoading && <span className="text-muted-foreground">Working out what this would take…</span>}
                {plan.error && <span className="text-muted-foreground">What this would take couldn't be read, so deleting isn't offered.</span>}
                {plan.data && (
                  <>
                    {plan.data.goes.length > 0 && (
                      <div>
                        <p className="font-medium text-foreground">Deleted with it</p>
                        <ul className="mt-1 list-disc pl-5 text-muted-foreground" data-testid="list-removal-goes">
                          {plan.data.goes.map((line) => <li key={line}>{line}</li>)}
                        </ul>
                      </div>
                    )}
                    {plan.data.stays.length > 0 && (
                      <div>
                        <p className="font-medium text-foreground">Kept</p>
                        <ul className="mt-1 list-disc pl-5 text-muted-foreground" data-testid="list-removal-stays">
                          {plan.data.stays.map((line) => <li key={line}>{line}</li>)}
                        </ul>
                      </div>
                    )}
                    {plan.data.warning && <p className="text-foreground" data-testid="text-removal-warning">{plan.data.warning}</p>}
                    {plan.data.team && (
                      <div data-testid="section-removal-team">
                        <p className="font-medium text-foreground">Or delete the whole team</p>
                        <ul className="mt-1 list-disc pl-5 text-muted-foreground" data-testid="list-team-deletes">
                          {plan.data.team.deletes.map((n) => <li key={n}>{n}</li>)}
                        </ul>
                        {plan.data.team.keeps.length > 0 && (
                          <ul className="mt-1.5 list-disc pl-5 text-muted-foreground" data-testid="list-team-keeps">
                            {plan.data.team.keeps.map((line) => <li key={line}>{line} — another team uses it, so it stays</li>)}
                          </ul>
                        )}
                        {plan.data.team.runCount > 0 && (
                          <p className="mt-1.5 text-muted-foreground">
                            Its {plan.data.team.runCount === 1 ? "past run stays" : `${plan.data.team.runCount} past runs stay`} in the run history
                            {plan.data.team.processFlowName ? `, and the process flow "${plan.data.team.processFlowName}" stays` : ""}.
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-muted-foreground">This can't be undone.</p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant={plan.data?.team ? "outline" : "destructive"}
              disabled={remove.isPending || !plan.data}
              onClick={() => {
                setTarget("one");
                remove.mutate(deleteUrl);
              }}
              data-testid="button-confirm-remove"
            >
              {remove.isPending && target === "one"
                ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Deleting…</>
                : plan.data?.team ? `Delete ${noun} only` : `Delete ${noun}`}
            </Button>
            {plan.data?.team && teamDeleteUrl && (
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={remove.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  setTarget("team");
                  remove.mutate(teamDeleteUrl);
                }}
                data-testid="button-delete-team"
              >
                {remove.isPending && target === "team" ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Deleting…</> : teamButtonLabel(plan.data.team)}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
