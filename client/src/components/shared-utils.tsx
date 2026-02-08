export function InfoRow({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right" data-testid={testId}>{value}</span>
    </div>
  );
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return "\u2014";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMs(ms: number | null | undefined) {
  if (!ms) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatHash(hash: string | null | undefined) {
  if (!hash) return "\u2014";
  const parts = hash.split(":");
  if (parts.length === 2) return `${parts[0]}:${parts[1].substring(0, 12)}...`;
  return hash.substring(0, 16) + "...";
}
