/** Small pieces shared by the artifact card renderers. */

export function StatusDot({ status }: { status?: string | null }) {
  const s = (status ?? "").toLowerCase();
  const tone =
    s === "active" || s === "deployed" || s === "completed" || s === "connected" || s === "approved" || s === "agents_assigned"
      ? "bg-[hsl(var(--astra-ok))]"
      : s === "failed" || s === "error" || s === "rejected"
        ? "bg-[hsl(var(--astra-fail))]"
        : s === "awaiting_approval" || s === "waiting_approval" || s === "running" || s === "pending_review" || s === "pending"
          ? "bg-primary"
          : "bg-muted-foreground/50";
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} />;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{children}</div>;
}

export const human = (value?: string | null) => (value ?? "").replace(/_/g, " ");
