/**
 * Rating one of Astra's answers, where the answer is.
 *
 * A thumb down opens a line for why, because "wrong" without "wrong how" is
 * almost impossible to act on — but the note is optional, since some people
 * will only ever click the thumb and that is still worth knowing.
 *
 * It says where it goes before it sends: the platform's Feedback page, with
 * the question and the start of the answer attached. Somebody rating an answer
 * about their own agents deserves to know their words travel with it.
 */
import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type Rating = "up" | "down";

/** What the toast says once it has gone. */
export function sentLine(rating: Rating): string {
  return rating === "up"
    ? "Noted on the Feedback page, with this exchange."
    : "Sent to the Feedback page, with this exchange, so someone can look at it.";
}

export function MessageFeedback({ threadId, messageId }: { threadId: string; messageId: string }) {
  const { toast } = useToast();
  const [sent, setSent] = useState<Rating | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (rating: Rating, why?: string) => {
    setBusy(true);
    try {
      const res = await apiRequest("POST", `/api/astra/threads/${threadId}/messages/${messageId}/feedback`, {
        rating,
        ...(why?.trim() ? { note: why.trim() } : {}),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "That couldn't be sent.");
      setSent(rating);
      setAsking(false);
      setNote("");
      toast({ title: rating === "up" ? "Thanks" : "Thanks — passed on", description: sentLine(rating) });
    } catch (e) {
      toast({ title: "Not sent", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <span className="text-[11px] text-muted-foreground" data-testid="astra-feedback-sent">
        {sent === "up" ? "Marked helpful" : "Marked not helpful"}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void send("up")}
        disabled={busy}
        className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="This answer was helpful"
        title="Helpful"
        data-testid="astra-feedback-up"
      >
        <ThumbsUp className="h-3 w-3" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setAsking((open) => !open)}
        disabled={busy}
        className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="This answer was not helpful"
        aria-expanded={asking}
        title="Not helpful"
        data-testid="astra-feedback-down"
      >
        <ThumbsDown className="h-3 w-3" aria-hidden />
      </button>

      {asking && (
        <form
          className="absolute right-0 top-6 z-10 flex w-80 flex-col gap-1.5 rounded-md border border-border bg-popover p-2 shadow-md"
          onSubmit={(e) => {
            e.preventDefault();
            void send("down", note);
          }}
          data-testid="astra-feedback-note"
        >
          <label className="text-[11px] text-muted-foreground" htmlFor={`why-${messageId}`}>
            What was wrong with it? (optional)
          </label>
          <input
            id={`why-${messageId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
            maxLength={2000}
            className="h-7 rounded border border-input bg-background px-2 text-xs outline-none focus:border-ring"
            placeholder="It missed the agents bound to the outcome"
          />
          <p className="text-[10px] leading-snug text-muted-foreground">
            Goes to the Feedback page with your question and the start of this answer.
          </p>
          <div className="flex justify-end gap-1">
            <button type="button" className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setAsking(false)}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground disabled:opacity-60" data-testid="astra-feedback-send">
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
