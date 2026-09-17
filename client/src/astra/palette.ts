/**
 * Rows for the Astra command palette (⌘K). Pure.
 *
 * The first row always sends what was typed to Astra as a message -- no intent
 * parsing. Then conversations and library items to go to, then suggested prompts.
 * Library items come from the server's search once typing pauses (sections are capped
 * at 50, so a local filter would miss most agents); this ranks what comes back.
 */

export type PaletteRow =
  | { kind: "ask"; key: string; label: string; text: string }
  | { kind: "conversation"; key: string; label: string; detail: string | null; href: string }
  | { kind: "item"; key: string; label: string; detail: string | null; section: string; href: string; inShell: boolean; duplicate?: boolean }
  | { kind: "prompt"; key: string; label: string; text: string };

export interface PaletteSources {
  threads: Array<{ id: string; title: string; status?: string }>;
  library: Array<{ id: string; label: string; items: Array<{ id: string; name: string; detail: string | null; href: string; inShell?: boolean }> }> | null;
  prompts: Array<{ label: string; prompt: string }>;
}

const PER_GROUP = 6;

/** 0: starts with the query, 1: a word starts with it, 2: contains it, -1: no match. */
export function rank(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return 2;
  if (t.startsWith(q)) return 0;
  if (t.split(/[\s\-_/·]+/).some((w) => w.startsWith(q))) return 1;
  return t.includes(q) ? 2 : -1;
}

function best<T>(rows: T[], text: (r: T) => string, query: string, limit = PER_GROUP): T[] {
  return rows
    .map((r, i) => ({ r, s: rank(text(r), query), i }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.r);
}

export function buildPaletteRows(query: string, sources: PaletteSources): PaletteRow[] {
  const q = query.trim();
  const rows: PaletteRow[] = [];
  if (q) rows.push({ kind: "ask", key: "ask", label: `Ask Astra "${q}"`, text: q });

  for (const t of best(sources.threads, (t) => t.title, q)) {
    rows.push({ kind: "conversation", key: `t:${t.id}`, label: t.title, detail: t.status === "awaiting_confirmation" ? "waiting on you" : null, href: `/t/${encodeURIComponent(t.id)}` });
  }

  // Library items only once something is typed: the index is long, and "go to" needs a name.
  if (q && sources.library) {
    const items = sources.library
      .filter((s) => s.id !== "conversations")
      .flatMap((s) => s.items.map((i) => ({ ...i, section: s.label })));
    const picked = best(items, (i) => i.name, q, PER_GROUP * 2);
    const count = new Map<string, number>();
    for (const i of picked) count.set(`${i.section}:${i.name.toLowerCase()}`, (count.get(`${i.section}:${i.name.toLowerCase()}`) ?? 0) + 1);
    for (const i of picked) {
      const duplicate = (count.get(`${i.section}:${i.name.toLowerCase()}`) ?? 0) > 1;
      rows.push({ kind: "item", key: `i:${i.section}:${i.id}`, label: i.name, detail: i.detail, section: i.section, href: i.href, inShell: !!i.inShell, ...(duplicate ? { duplicate } : {}) });
    }
  }

  for (const p of best(sources.prompts, (p) => p.label, q, 4)) {
    rows.push({ kind: "prompt", key: `p:${p.label}`, label: p.label, text: p.prompt });
  }
  return rows;
}
