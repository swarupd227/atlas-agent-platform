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

export interface RemovalPlan {
  id: string;
  name: string;
  goes: string[];
  stays: string[];
  warning: string | null;
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
  invalidate,
  onDeleted,
  buttonLabel = "Delete",
  testId,
}: {
  /** "outcome", "agent" — used in the title and the toast. */
  noun: string;
  name: string;
  /** Where to ask what the delete would take. */
  planUrl: string;
  deleteUrl: string;
  /** Query keys to refresh afterwards. */
  invalidate: string[];
  onDeleted?: () => void;
  buttonLabel?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const plan = useQuery<RemovalPlan>({ queryKey: [planUrl], enabled: open });

  const remove = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", deleteUrl);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || (await res.text().catch(() => "")) || `That ${noun} could not be deleted.`);
      return res.json().catch(() => ({}));
    },
    onSuccess: () => {
      for (const key of invalidate) queryClient.invalidateQueries({ queryKey: [key] });
      setOpen(false);
      toast({ title: `${noun[0].toUpperCase()}${noun.slice(1)} deleted`, description: `${name} is gone.` });
      onDeleted?.();
    },
    onError: (e: Error) => toast({ title: "Not deleted", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
        data-testid={testId ?? `button-remove-${noun}`}
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />{buttonLabel}
      </Button>

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
                    <p className="text-muted-foreground">This can't be undone.</p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending || !plan.data}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
              data-testid="button-confirm-remove"
            >
              {remove.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Deleting…</> : `Delete ${noun}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
