import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { getApiHeaders } from "@/lib/queryClient";
import { useIndustry } from "@/components/industry-provider";
import type { HomeBriefing as Briefing, HomeRow } from "./types";

export function useHome() {
  const { industry } = useIndustry();
  const industryId = industry?.id ?? null;
  return useQuery<Briefing | null>({
    queryKey: ["/api/astra/home", industryId],
    queryFn: async () => {
      const qs = industryId ? `?industryId=${encodeURIComponent(industryId)}` : "";
      const res = await fetch(`/api/astra/home${qs}`, { credentials: "include", headers: getApiHeaders() });
      return res.ok ? res.json() : null;
    },
    staleTime: 30_000,
  });
}

function Count({ row }: { row: HomeRow }) {
  if (row.count === null) {
    return <span className="text-muted-foreground" aria-hidden>{row.tone === "unavailable" ? "–" : ""}</span>;
  }
  return <span className={row.tone === "attention" ? "text-primary" : "text-foreground"}>{row.count}</span>;
}

/**
 * Counted rows before the first message. A number here is only a pointer:
 * choosing a row asks Astra, and the answer comes from a tool with its proof.
 */
export function HomeBriefing({ onSend }: { onSend: (text: string) => void }) {
  const { data, isLoading } = useHome();

  if (isLoading) {
    return (
      <div className="mt-6 space-y-px overflow-hidden rounded-md border border-border" aria-busy="true" aria-label="Loading your briefing">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse bg-card" />
        ))}
      </div>
    );
  }
  if (!data || data.rows.length === 0) return null;

  return (
    <section className="mt-6" aria-label="Briefing" data-testid="astra-home">
      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
        {data.rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onSend(row.prompt)}
              className="group flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
              data-testid={`astra-home-row-${row.id}`}
              title={row.prompt}
            >
              <span className="w-10 shrink-0 text-right font-mono text-lg tabular-nums leading-none">
                <Count row={row} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{row.label}</span>
                {row.detail && (
                  <span className={`block truncate text-xs ${row.tone === "unavailable" ? "text-[hsl(var(--astra-fail))]" : "text-muted-foreground"}`}>
                    {row.detail}
                  </span>
                )}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {data.notShown.map((line) => (
        <p key={line} className="mt-2 text-xs text-muted-foreground">
          {line}
        </p>
      ))}
    </section>
  );
}
