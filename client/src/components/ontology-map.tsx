// Ontology diagrams: a concept's neighbourhood (what it links to, each link
// named), coloured by domain, and the whole-ontology graph, coloured by category.
import { useEffect, useMemo, useRef, useState } from "react";

export interface MapConcept {
  id: string;
  label: string;
  category: string;
  domain: string;
  used: boolean;
  relationships: Array<{ targetId: string; label: string; type: string }>;
  /** How many agents reference it; sizes the circle in the graph. */
  usageCount?: number;
  description?: string;
  tags?: string[];
  synonyms?: string[];
  /** Added by the organisation rather than from the industry standard. */
  custom?: boolean;
}

const DOMAIN_COLORS = [
  "hsl(174 55% 40%)", "hsl(30 80% 50%)", "hsl(215 65% 55%)", "hsl(335 60% 55%)",
  "hsl(262 45% 58%)", "hsl(90 45% 40%)", "hsl(0 60% 55%)", "hsl(45 80% 42%)",
];

export function domainColors(domains: string[]): Record<string, string> {
  return Object.fromEntries(domains.map((d, i) => [d, DOMAIN_COLORS[i % DOMAIN_COLORS.length]]));
}

/** Every link touching a concept, outgoing and incoming, one entry per neighbour. */
export function neighboursOf(id: string, byId: Map<string, MapConcept>, incoming: Map<string, Array<{ from: string; label: string }>>) {
  const c = byId.get(id);
  const m = new Map<string, { id: string; text: string; out: boolean; in: boolean }>();
  for (const r of c?.relationships || []) {
    if (!byId.has(r.targetId) || r.targetId === id) continue;
    const e = m.get(r.targetId) || { id: r.targetId, text: r.label || r.type.replace(/_/g, " "), out: false, in: false };
    e.out = true;
    m.set(r.targetId, e);
  }
  for (const r of incoming.get(id) || []) {
    if (r.from === id) continue;
    const e = m.get(r.from) || { id: r.from, text: r.label, out: false, in: false };
    e.in = true;
    m.set(r.from, e);
  }
  return Array.from(m.values());
}

export function buildIncoming(concepts: MapConcept[]) {
  const ids = new Set(concepts.map((c) => c.id));
  const incoming = new Map<string, Array<{ from: string; label: string }>>(concepts.map((c) => [c.id, []]));
  for (const c of concepts) for (const r of c.relationships) {
    if (ids.has(r.targetId)) incoming.get(r.targetId)!.push({ from: c.id, label: r.label || r.type.replace(/_/g, " ") });
  }
  return incoming;
}

/** The selected concept in the middle, every linked concept around it. Drawn at
 *  the width it is given, so text never shrinks below its set size. */
export function OntologyNeighbourhood({ concept, concepts, colors, onSelect }: {
  concept: MapConcept;
  concepts: MapConcept[];
  colors: Record<string, string>;
  onSelect: (id: string) => void;
}) {
  const byId = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const incoming = useMemo(() => buildIncoming(concepts), [concepts]);
  const links = neighboursOf(concept.id, byId, incoming);
  const [hover, setHover] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(320, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Beyond 8 links the link names collide; then the name shows for the neighbour under the pointer.
  const allLabels = links.length <= 8;
  const n = links.length;
  const H = n <= 3 ? 200 : Math.min(420, 220 + n * 10);
  const cx = W / 2, cy = H / 2;
  const ry = H / 2 - 36, rx = Math.min(W / 2 - 110, ry * 2.1);
  const pts = links.map((l, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2 + (n === 2 ? Math.PI / 2 : 0);
    return { ...l, x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, dx: Math.cos(a), dy: Math.sin(a) };
  });
  const fill = (c: MapConcept) => (c.used ? colors[c.domain] : "hsl(var(--card))");
  const halo = { paintOrder: "stroke" as const, stroke: "hsl(var(--card))", strokeWidth: 4, strokeLinejoin: "round" as const };
  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={H} className="block" role="img" aria-label={`Concepts linked to ${concept.label}`} data-testid="ontology-neighbourhood">
        <defs>
          <marker id="onb-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="hsl(var(--muted-foreground) / 0.7)" />
          </marker>
        </defs>
        {pts.map((p) => (
          <line key={`l-${p.id}`} x1={cx} y1={cy} x2={p.x - p.dx * 9} y2={p.y - p.dy * 9}
            stroke={hover === p.id ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground) / 0.45)"} strokeWidth={1.4}
            markerEnd={p.out ? "url(#onb-arrow)" : undefined} markerStart={p.in ? "url(#onb-arrow)" : undefined} />
        ))}
        {pts.filter((p) => allLabels || p.id === hover).map((p) => (
          <text key={`t-${p.id}`} x={(cx + p.x) / 2} y={(cy + p.y) / 2 + 4} textAnchor="middle"
            className="fill-muted-foreground font-mono" style={{ fontSize: 11, ...halo }}>
            {p.text.length > 28 ? p.text.slice(0, 27) + "…" : p.text}
          </text>
        ))}
        {pts.map((p) => {
          const t = byId.get(p.id)!;
          // The name goes on the far side of the dot, away from the centre and its lines.
          const side = Math.abs(p.dx) > 0.35 ? (p.dx > 0 ? "start" : "end") : "middle";
          const lx = side === "start" ? p.x + 12 : side === "end" ? p.x - 12 : p.x;
          const ly = side === "middle" ? (p.dy < 0 ? p.y - 12 : p.y + 20) : p.y + 4;
          return (
            <g key={`n-${p.id}`} onClick={() => onSelect(p.id)} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}
              className="cursor-pointer" data-testid={`neighbour-${p.id}`}>
              <title>{`${t.label}: ${p.text}`}</title>
              <circle cx={p.x} cy={p.y} r={7} fill={fill(t)} stroke={colors[t.domain]} strokeWidth={2} />
              <text x={lx} y={ly} textAnchor={side} className="fill-foreground"
                style={{ fontSize: 12, ...halo, textDecoration: hover === p.id ? "underline" : undefined }}>{t.label}</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={12} fill={fill(concept)} stroke="hsl(var(--foreground))" strokeWidth={2} />
        <text x={cx} y={cy + 28} textAnchor="middle" className="fill-foreground"
          style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--astra-display)", ...halo }}>{concept.label}</text>
        {!allLabels && (
          <text x={W - 10} y={H - 10} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 11 }}>Point at a concept to see the link</text>
        )}
      </svg>
    </div>
  );
}

// One bright colour per category, as the ontology graph has always had.
const CATEGORY_COLORS = [
  "hsl(210, 70%, 55%)", "hsl(150, 60%, 45%)", "hsl(30, 80%, 55%)", "hsl(280, 60%, 55%)", "hsl(0, 65%, 55%)",
  "hsl(180, 55%, 45%)", "hsl(60, 70%, 45%)", "hsl(330, 60%, 55%)", "hsl(240, 50%, 60%)", "hsl(120, 50%, 45%)",
];

type Placed = { c: MapConcept; x: number; y: number; r: number; a: number; row: number };

/**
 * The whole ontology as a graph: concepts in a ring, grouped by category, one
 * colour per category, each a filled circle sized by how many agents use it
 * (dashed when added by you). Names are placed so they never overlap; pointing
 * at a concept lights up its links and names them, and a click focuses it.
 * Circles can be dragged and categories hidden from the legend.
 */
export function OntologyDomainMap({ concepts, focusId, onSelect, searchQuery }: {
  concepts: MapConcept[];
  colors?: Record<string, string>;
  focusId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 640 });
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  const [hoverId, setHoverId] = useState<string | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const nodeDrag = useRef<{ id: string; x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const draggedLast = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(400, el.clientWidth), h: Math.max(360, el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Categories in a stable order, grouped by domain so related colours sit together.
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of [...concepts].sort((a, b) => a.domain.localeCompare(b.domain) || a.category.localeCompare(b.category))) if (!seen.has(c.category)) seen.set(c.category, c.domain);
    return Array.from(seen.keys());
  }, [concepts]);
  const catColor = useMemo(() => Object.fromEntries(categories.map((c, i) => [c, CATEGORY_COLORS[i % CATEGORY_COLORS.length]])), [categories]);
  const shown = useMemo(() => concepts.filter((c) => !hidden.has(c.category)), [concepts, hidden]);
  const byId = useMemo(() => new Map(shown.map((c) => [c.id, c])), [shown]);
  const incoming = useMemo(() => buildIncoming(shown), [shown]);
  const maxUsage = useMemo(() => Math.max(1, ...shown.map((c) => c.usageCount ?? (c.used ? 1 : 0))), [shown]);
  const radius = (c: MapConcept) => 12 + ((c.usageCount ?? (c.used ? 1 : 0)) / maxUsage) * 10;

  // The ring, laid out in screen pixels as an ellipse that fills the pane (room left for names):
  // each category gets an arc in proportion to its size, in one row or, when crowded, two.
  const layout = useMemo(() => {
    const groups = categories.filter((cat) => !hidden.has(cat)).map((cat) => shown.filter((c) => c.category === cat)).filter((g) => g.length);
    const rx = Math.max(160, size.w / 2 - 150), ry = Math.max(120, (size.h - 28) / 2 - 46);
    const perimeter = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
    const slotsFor = (rows: number) => groups.reduce((sum, g) => sum + Math.ceil(g.length / rows) + 1, 0);
    const rows = slotsFor(1) * 34 <= perimeter ? 1 : 2;
    const perRow = slotsFor(rows);
    const placed: Placed[] = [];
    let slot = 0;
    for (const g of groups) {
      g.forEach((c, i) => {
        const row = rows === 2 ? i % 2 : 0;
        const col = rows === 2 ? Math.floor(i / 2) : i;
        const a = ((slot + col + 0.5) / perRow) * Math.PI * 2 - Math.PI / 2;
        const inset = row * 64;
        placed.push({ c, x: Math.cos(a) * (rx - inset), y: Math.sin(a) * (ry - inset), r: radius(c), a, row });
      });
      slot += Math.ceil(g.length / rows) + 1;
    }
    return { placed, rows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, categories, hidden, maxUsage, size]);
  useEffect(() => { setMoved({}); }, [layout]);

  // A focused concept moves to the middle with its neighbours in a ring round it, so every link
  // and its name has room; everything else stays in place, faded.
  const near = useMemo(() => {
    if (!focusId || !byId.has(focusId)) return null;
    return new Set([focusId, ...neighboursOf(focusId, byId, incoming).map((n) => n.id)]);
  }, [focusId, byId, incoming]);
  const pos = useMemo(() => {
    const p = new Map<string, { x: number; y: number; a?: number }>(layout.placed.map((n) => [n.c.id, { x: n.x, y: n.y }]));
    if (near && focusId) {
      p.set(focusId, { x: 0, y: 0 });
      const ring = Array.from(near).filter((id) => id !== focusId);
      const rx = Math.min(size.w / 2 - 190, 400), ry = Math.min((size.h - 28) / 2 - 70, 250);
      ring.forEach((id, i) => {
        const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
        p.set(id, { x: Math.cos(a) * rx, y: Math.sin(a) * ry, a });
      });
    }
    for (const [id, m] of Object.entries(moved)) if (p.has(id)) p.set(id, m);
    return p;
  }, [layout, moved, near, focusId, size]);
  const node = useMemo(() => new Map(layout.placed.map((n) => [n.c.id, n])), [layout]);

  const links = useMemo(() => {
    const pairs = new Map<string, { a: string; b: string; label: string; back?: string }>();
    for (const c of shown) for (const r of c.relationships) {
      if (!byId.has(r.targetId) || r.targetId === c.id) continue;
      const label = r.label || r.type.replace(/_/g, " ");
      const rev = `${r.targetId}|${c.id}`;
      if (pairs.has(rev)) { const p = pairs.get(rev)!; if (!p.back) p.back = label; continue; }
      if (!pairs.has(`${c.id}|${r.targetId}`)) pairs.set(`${c.id}|${r.targetId}`, { a: c.id, b: r.targetId, label });
    }
    return Array.from(pairs.values());
  }, [shown, byId]);

  // The layout is already in screen pixels; only the user's zoom scales it.
  const K = view.k;
  const ts = (px: number) => px / K;
  const toScreen = (p: { x: number; y: number }) => ({ x: size.w / 2 + view.x + p.x * K, y: 28 + (size.h - 28) / 2 + view.y + p.y * K });

  const q = searchQuery.trim().toLowerCase();
  const isMatch = (c: MapConcept) => !!q && (c.label.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q) || (c.tags ?? []).some((t) => t.toLowerCase().includes(q)) || (c.synonyms ?? []).some((t) => t.toLowerCase().includes(q)));
  const lit = hoverId ?? focusId;
  const litSet = useMemo(() => {
    if (!lit || !byId.has(lit)) return null;
    return new Set([lit, ...neighboursOf(lit, byId, incoming).map((n) => n.id)]);
  }, [lit, byId, incoming]);
  const touches = (l: { a: string; b: string }) => !!lit && (l.a === lit || l.b === lit);

  // Names: outer row outwards, inner row inwards, each only where it covers no other name.
  const labels = useMemo(() => {
    const out = new Map<string, { x: number; y: number; anchor: "start" | "end" | "middle" }>();
    const boxes: Array<[number, number, number, number]> = [];
    const prio = (n: Placed) => (n.c.id === hoverId || n.c.id === focusId ? 1e6 : 0) + (litSet?.has(n.c.id) ? 1e5 : 0) + (isMatch(n.c) ? 1e4 : 0) + (n.c.usageCount ?? 0);
    for (const n of [...layout.placed].sort((a, b) => prio(b) - prio(a))) {
      if (near && !near.has(n.c.id)) continue;
      const p = pos.get(n.c.id)!;
      const ang = p.a ?? n.a;
      const dir = p.a === undefined && n.row === 1 ? -1 : 1;
      const dx = Math.cos(ang) * dir, dy = Math.sin(ang) * dir;
      const anchor: "start" | "end" | "middle" = Math.abs(dx) < 0.3 ? "middle" : dx > 0 ? "start" : "end";
      const gap = n.r + 6 / K;
      const lx = p.x + dx * gap, ly = p.y + dy * gap + (Math.abs(dx) < 0.3 ? (dy > 0 ? 10 / K : -2 / K) : 4 / K);
      const w = (n.c.label.length * 6.8 + 6) / K, h = 15 / K;
      const x0 = anchor === "start" ? lx : anchor === "end" ? lx - w : lx - w / 2;
      const box: [number, number, number, number] = [x0, ly - 11 / K, w, h];
      const circleHit = layout.placed.some((o) => o.c.id !== n.c.id && (() => { const op = pos.get(o.c.id)!; const cx = Math.max(box[0], Math.min(op.x, box[0] + box[2])), cy = Math.max(box[1], Math.min(op.y, box[1] + box[3])); return Math.hypot(op.x - cx, op.y - cy) < o.r; })());
      const forced = prio(n) >= 1e4;
      if (!forced && (circleHit || boxes.some(([bx, by, bw, bh]) => box[0] < bx + bw && box[0] + box[2] > bx && box[1] < by + bh && box[1] + box[3] > by))) continue;
      boxes.push(box);
      out.set(n.c.id, { x: lx, y: ly, anchor });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, pos, K, hoverId, focusId, litSet, q, near]);

  const onMove = (e: React.PointerEvent) => {
    const nd = nodeDrag.current;
    if (nd) {
      if (Math.abs(e.clientX - nd.x) + Math.abs(e.clientY - nd.y) > 3) nd.moved = true;
      if (nd.moved) setMoved((m) => ({ ...m, [nd.id]: { x: nd.ox + (e.clientX - nd.x) / K, y: nd.oy + (e.clientY - nd.y) / K } }));
      return;
    }
    const p = pan.current;
    if (p) setView((v) => ({ ...v, x: p.vx + e.clientX - p.x, y: p.vy + e.clientY - p.y }));
  };
  const endDrag = () => { draggedLast.current = !!nodeDrag.current?.moved; pan.current = null; nodeDrag.current = null; };
  const hoverNode = hoverId ? node.get(hoverId) : null;
  const litLinks = lit ? links.filter(touches) : [];

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-background" data-testid="ontology-domain-map">
      {/* Legend on top, one chip per category; a click hides or shows it. */}
      <div className="absolute inset-x-0 top-0 z-10 flex h-7 items-center gap-1 overflow-x-auto border-b bg-card/90 px-2 backdrop-blur" data-testid="map-legend">
        {categories.map((cat) => {
          const off = hidden.has(cat);
          return (
            <button key={cat} type="button" aria-pressed={!off} title={off ? `Show ${cat}` : `Hide ${cat}`}
              onClick={() => setHidden((h) => { const s = new Set(h); if (s.has(cat)) s.delete(cat); else if (s.size < categories.length - 1) s.add(cat); return s; })}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-[11.5px] hover:bg-accent ${off ? "line-through opacity-40" : "text-muted-foreground"}`}
              data-testid={`legend-toggle-${cat.toLowerCase().replace(/\s+/g, "-")}`}>
              <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: catColor[cat] }} />{cat}
            </button>
          );
        })}
      </div>
      <svg
        width={size.w} height={size.h} className="block cursor-grab select-none touch-none active:cursor-grabbing"
        onWheel={(e) => { const k = Math.min(4, Math.max(0.4, view.k * (e.deltaY < 0 ? 1.1 : 0.9))); setView((v) => ({ ...v, k, x: (v.x * k) / v.k, y: (v.y * k) / v.k })); }}
        onPointerDown={(e) => { pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; }}
        onPointerMove={onMove} onPointerUp={endDrag} onPointerLeave={endDrag}
      >
        <g transform={`translate(${size.w / 2 + view.x},${28 + (size.h - 28) / 2 + view.y}) scale(${K})`} style={{ transition: nodeDrag.current || pan.current ? undefined : "transform .5s ease" }}>
          {links.map((l, i) => {
            const a = pos.get(l.a), b = pos.get(l.b);
            if (!a || !b || (near && !(near.has(l.a) && near.has(l.b)))) return null;
            const hot = touches(l);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hot ? catColor[byId.get(lit!)!.category] : "hsl(var(--foreground))"}
              strokeOpacity={hot ? 0.85 : lit ? 0.05 : 0.14} strokeWidth={ts(hot ? 2.2 : 1)} />;
          })}
          {layout.placed.map((n) => {
            const p = pos.get(n.c.id)!;
            const col = catColor[n.c.category];
            const sel = n.c.id === focusId, hov = n.c.id === hoverId;
            const dim = near ? !near.has(n.c.id) : litSet ? !litSet.has(n.c.id) : q ? !isMatch(n.c) : false;
            const r = n.r + (sel ? 4 : hov ? 2 : 0);
            return (
              <g key={n.c.id} opacity={dim ? (near ? 0.1 : 0.2) : 1} style={{ transition: "opacity .2s" }} className="cursor-pointer"
                onPointerDown={(e) => { e.stopPropagation(); nodeDrag.current = { id: n.c.id, x: e.clientX, y: e.clientY, ox: p.x, oy: p.y, moved: false }; }}
                onClick={() => { if (!draggedLast.current) onSelect(n.c.id); draggedLast.current = false; }}
                onPointerEnter={() => setHoverId(n.c.id)} onPointerLeave={() => setHoverId(null)} data-testid={`map-node-${n.c.id}`}>
                {isMatch(n.c) && <circle cx={p.x} cy={p.y} r={r + ts(6)} fill="none" stroke="hsl(var(--foreground))" strokeWidth={ts(2)} strokeDasharray={`${ts(3)} ${ts(2)}`} className="animate-pulse" />}
                <circle cx={p.x} cy={p.y} r={r} fill={col} fillOpacity={sel ? 0.95 : hov ? 0.85 : 0.72}
                  stroke={sel ? "hsl(var(--foreground))" : hov ? "hsl(var(--foreground))" : col} strokeWidth={ts(sel ? 3 : hov ? 2 : 1.5)}
                  strokeDasharray={n.c.custom ? `${ts(4)} ${ts(2)}` : undefined} />
              </g>
            );
          })}
          {layout.placed.map((n) => {
            const l = labels.get(n.c.id);
            if (!l) return null;
            const strong = n.c.id === focusId || n.c.id === hoverId;
            return (
              <text key={`t-${n.c.id}`} x={l.x} y={l.y} textAnchor={l.anchor} className="fill-foreground" style={{ fontSize: ts(strong ? 13 : 11.5), fontWeight: strong ? 600 : 500, paintOrder: "stroke", stroke: "hsl(var(--background))", strokeWidth: ts(3.5), pointerEvents: "none" }}>
                {n.c.label}
              </text>
            );
          })}
          {litLinks.slice(0, 14).map((l, i) => {
            const a = pos.get(l.a)!, b = pos.get(l.b)!;
            const text = (l.back ? `${l.label} ⇄ ${l.back}` : l.label).slice(0, 34);
            const w = ts(text.length * 6.2 + 12), h = ts(17);
            return (
              <g key={`pl-${i}`} transform={`translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2})`} style={{ pointerEvents: "none" }}>
                <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill="hsl(var(--card))" stroke={catColor[byId.get(lit!)!.category]} strokeOpacity={0.7} strokeWidth={ts(1)} />
                <text y={ts(3.8)} textAnchor="middle" className="fill-foreground font-mono" style={{ fontSize: ts(10.5) }}>{text}</text>
              </g>
            );
          })}
        </g>
      </svg>
      {hoverNode && (() => {
        const s = toScreen(pos.get(hoverNode.c.id)!);
        const left = Math.min(size.w - 256, s.x + hoverNode.r * K + 14), top = Math.max(36, Math.min(size.h - 120, s.y - 40));
        return (
          <div className="pointer-events-none absolute z-20 w-[240px] rounded-lg border bg-card px-3 py-2 shadow-md" style={{ left, top }} data-testid="map-hover-card">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold">
              <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: catColor[hoverNode.c.category] }} />
              <span className="truncate">{hoverNode.c.label}</span>
            </div>
            <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{hoverNode.c.category} · {hoverNode.c.domain}</div>
            {hoverNode.c.description && <p className="mt-1 line-clamp-2 text-[11.5px] text-muted-foreground">{hoverNode.c.description}</p>}
            <div className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              {(hoverNode.c.usageCount ?? 0) > 0 ? `${hoverNode.c.usageCount} ${hoverNode.c.usageCount === 1 ? "reference" : "references"}` : hoverNode.c.used ? "used by agents" : "not used by agents yet"}
            </div>
          </div>
        );
      })()}
      <div className="absolute bottom-3 left-3 rounded-md border bg-card/90 px-2 py-1 font-mono text-[11px] text-muted-foreground">
        Bigger = used more · dashed = added by you · drag a circle to move it
      </div>
      <div className="absolute right-3 top-10 z-10 flex overflow-hidden rounded-lg border bg-card">
        <button type="button" className="px-2.5 py-1 text-sm hover:bg-accent" onClick={() => setView((v) => ({ k: Math.min(4, v.k * 1.2), x: v.x * 1.2, y: v.y * 1.2 }))} aria-label="Zoom in" data-testid="button-map-zoom-in">+</button>
        <button type="button" className="border-l px-2.5 py-1 text-sm hover:bg-accent" onClick={() => setView((v) => ({ k: Math.max(0.4, v.k / 1.2), x: v.x / 1.2, y: v.y / 1.2 }))} aria-label="Zoom out" data-testid="button-map-zoom-out">−</button>
        <button type="button" className="border-l px-2.5 py-1 text-xs hover:bg-accent" onClick={() => { setView({ k: 1, x: 0, y: 0 }); setMoved({}); setHidden(new Set()); }} data-testid="button-map-reset">Reset</button>
      </div>
    </div>
  );
}
