import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, MessageSquare, Search } from "lucide-react";
import { getApiHeaders } from "@/lib/queryClient";
import type { Library as LibraryData, LibraryItem, LibrarySection } from "./types";

function useLibrary(q: string) {
  return useQuery<LibraryData>({
    queryKey: ["/api/astra/library", q],
    queryFn: async () => {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await fetch(`/api/astra/library${qs}`, { credentials: "include", headers: getApiHeaders() });
      if (!res.ok) throw new Error(`Couldn't load the library (${res.status}).`);
      return res.json();
    },
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

/** For the command palette: the library index, loaded only when asked for. */
export { useLibrary };

function Row({ item, onAsk }: { item: LibraryItem; onAsk: (text: string) => void }) {
  const href = item.inShell ? item.href : `~${item.href}`;
  return (
    <li className="group flex items-center gap-3 px-3 py-2" data-testid="astra-library-item">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <Link href={href} className="truncate text-sm hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            {item.name}
          </Link>
          {item.status && <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{item.status.replace(/_/g, " ")}</span>}
        </div>
        {item.detail && <div className="truncate text-xs text-muted-foreground">{item.detail}</div>}
      </div>
      {item.ask && (
        <button
          type="button"
          onClick={() => onAsk(item.ask!)}
          className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title={item.ask}
          data-testid="astra-library-ask"
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Ask
        </button>
      )}
      {!item.inShell && (
        <Link
          href={href}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Open ${item.name} in the classic app`}
          title="Open in the classic app"
        >
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </li>
  );
}

function Section({ section, query, onAsk }: { section: LibrarySection & { error?: string }; query: string; onAsk: (text: string) => void }) {
  return (
    <section aria-labelledby={`lib-${section.id}`} data-testid={`astra-library-section-${section.id}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
        <h2 id={`lib-${section.id}`} className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {section.label}
        </h2>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {section.items.length < section.total ? `${section.items.length} of ${section.total}` : section.total}
        </span>
      </div>
      {section.error ? (
        <p className="rounded-md border border-border px-3 py-2 text-xs text-[hsl(var(--astra-fail))]">{section.error}</p>
      ) : section.items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">{query ? "No matches." : "None yet."}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
          {section.items.map((item) => (
            <Row key={item.id} item={item} onAsk={onAsk} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** /astra/library: everything the organization has that this role can see. */
export function Library({ onAsk }: { onAsk: (text: string) => void }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input]);
  const { data, isLoading, error } = useLibrary(query);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight [font-family:var(--astra-display)]">Library</h1>
          <label className="flex items-center gap-2 rounded-md border border-input bg-card px-3 py-2 focus-within:border-ring">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Filter by name or description"
              aria-label="Filter the library"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              data-testid="astra-library-filter"
            />
          </label>
        </div>

        {isLoading && !data ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-card" />
            ))}
          </div>
        ) : error && !data ? (
          <p role="alert" className="text-sm text-[hsl(var(--astra-fail))]">{(error as Error).message}</p>
        ) : data ? (
          <>
            {data.sections.map((s) => (
              <Section key={s.id} section={s} query={query} onAsk={onAsk} />
            ))}
            {data.elsewhere.map((line) => (
              <p key={line} className="text-xs text-muted-foreground">
                {line}
              </p>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
