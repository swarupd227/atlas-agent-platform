// Ontology diagrams: a concept's neighbourhood (what it links to, each link
// named) and the whole-ontology map, clustered by domain. Colour encodes the
// domain only (a handful of hues, not one per category); a solid dot means an
// agent uses the concept, a tinted one means none does yet.
import { useEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, forceCollide, type SimulationNodeDatum } from "d3-force";

export interface MapConcept {
  id: string;
  label: string;
  category: string;
  domain: string;
  used: boolean;
  relationships: Array<{ targetId: string; label: string; type: string }>;
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

type SimNode = MapConcept & SimulationNodeDatum & { deg: number };
type MapLink = { source: SimNode; target: SimNode; label: string; back?: string };

const radiusOf = (deg: number) => 8 + Math.min(10, deg * 1.6);

/** The whole ontology as a network, one cluster per domain. Every concept is a
 *  filled dot sized by how connected it is (tinted when no agent uses it yet),
 *  named wherever the name fits. Pointing at a concept lights up its links and
 *  their names; a click focuses it, with its neighbours brought round it. Dots
 *  can be dragged, and domains hidden from the legend. */
export function OntologyDomainMap({ concepts, colors, focusId, onSelect, searchQuery }: {
  concepts: MapConcept[];
  colors: Record<string, string>;
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

  const allDomains = useMemo(() => Array.from(new Set(concepts.map((c) => c.domain))), [concepts]);
  const shown = useMemo(() => concepts.filter((c) => !hidden.has(c.domain)), [concepts, hidden]);
  const domains = useMemo(() => allDomains.filter((d) => !hidden.has(d)), [allDomains, hidden]);
  const incoming = useMemo(() => buildIncoming(shown), [shown]);
  const byId = useMemo(() => new Map(shown.map((c) => [c.id, c])), [shown]);

  const centers = useMemo(() => {
    const cols = Math.ceil(Math.sqrt(domains.length)), rows = Math.ceil(domains.length / cols);
    return Object.fromEntries(domains.map((d, i) => [d, {
      x: size.w * ((i % cols) + 0.5) / cols,
      y: size.h * (Math.floor(i / cols) + 0.5) / rows,
    }]));
  }, [domains, size]);

  // Settle the layout once per data/size change, off screen, so the map appears still.
  // A link stored both ways (A measures B, B measured by A) is drawn once, carrying both names.
  const layout = useMemo(() => {
    const nodes: SimNode[] = shown.map((c) => ({ ...c, deg: 0 }));
    const idx = new Map(nodes.map((n) => [n.id, n]));
    const pairs = new Map<string, { source: string; target: string; label: string; back?: string }>();
    for (const c of shown) for (const r of c.relationships) {
      if (!byId.has(r.targetId) || r.targetId === c.id) continue;
      const label = r.label || r.type.replace(/_/g, " ");
      const fwd = `${c.id}|${r.targetId}`, rev = `${r.targetId}|${c.id}`;
      if (pairs.has(rev)) { const p = pairs.get(rev)!; if (!p.back) p.back = label; continue; }
      if (!pairs.has(fwd)) pairs.set(fwd, { source: c.id, target: r.targetId, label });
    }
    const links = Array.from(pairs.values());
    for (const l of links) { idx.get(l.source)!.deg++; idx.get(l.target)!.deg++; }
    const sim = forceSimulation<SimNode>(nodes)
      .force("link", forceLink<SimNode, any>(links).id((n) => n.id).distance(92).strength(0.25))
      .force("charge", forceManyBody().strength(-320))
      .force("x", forceX<SimNode>((n) => centers[n.domain]?.x ?? size.w / 2).strength(0.09))
      .force("y", forceY<SimNode>((n) => centers[n.domain]?.y ?? size.h / 2).strength(0.09))
      .force("collide", forceCollide<SimNode>((n) => radiusOf(n.deg) + 26))
      .stop();
    for (let i = 0; i < 360; i++) sim.tick();
    return { nodes, links: links as unknown as MapLink[] };
  }, [shown, byId, centers, size]);

  // Dragged dots keep their place until the data or the view is reset.
  useEffect(() => { setMoved({}); }, [layout]);

  const near = useMemo(() => {
    if (!focusId || !byId.has(focusId)) return null;
    return new Set([focusId, ...neighboursOf(focusId, byId, incoming).map((n) => n.id)]);
  }, [focusId, byId, incoming]);

  // In focus mode the neighbours are pulled into a ring around the focus so every link reads.
  const basePos = useMemo(() => {
    const p = new Map(layout.nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
    if (focusId && near && p.has(focusId)) {
      const f = { x: size.w * 0.5, y: size.h * 0.5 };
      p.set(focusId, f);
      const ring = Array.from(near).filter((id) => id !== focusId);
      const rr = 120 + Math.min(ring.length, 14) * 10;
      ring.forEach((id, i) => {
        const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
        p.set(id, { x: f.x + Math.cos(a) * rr * 1.5, y: f.y + Math.sin(a) * rr });
      });
    }
    return p;
  }, [layout, focusId, near, size]);
  const pos = useMemo(() => {
    const p = new Map(basePos);
    for (const [id, m] of Object.entries(moved)) if (p.has(id)) p.set(id, m);
    return p;
  }, [basePos, moved]);

  // Fit the drawing into the view once per layout (not while a dot is dragged), leaving room for the legend.
  const fit = useMemo(() => {
    const all = near ? Array.from(near).map((id) => basePos.get(id)!).filter(Boolean) : Array.from(basePos.values());
    if (!all.length) return { k: 1, x: 0, y: 0 };
    const pad = near ? 120 : 70, legend = 64;
    const minX = Math.min(...all.map((p) => p.x)) - pad, maxX = Math.max(...all.map((p) => p.x)) + pad;
    const minY = Math.min(...all.map((p) => p.y)) - pad - 20, maxY = Math.max(...all.map((p) => p.y)) + pad;
    const k = Math.min(1.5, size.w / (maxX - minX), (size.h - legend) / (maxY - minY));
    return { k, x: (size.w - (maxX - minX) * k) / 2 - minX * k, y: (size.h - legend - (maxY - minY) * k) / 2 - minY * k };
  }, [basePos, size, near]);
  const K = fit.k * view.k;
  // Text is drawn inside the zoomed group; divide by the zoom so it always reads at its set size.
  const ts = (px: number) => px / K;
  const toScreen = (p: { x: number; y: number }) => ({
    x: view.x + (size.w / 2) * (1 - view.k) + view.k * (fit.x + fit.k * p.x),
    y: view.y + (size.h / 2) * (1 - view.k) + view.k * (fit.y + fit.k * p.y),
  });

  const q = searchQuery.trim().toLowerCase();
  const isMatch = (n: SimNode) => !!q && (n.label.toLowerCase().includes(q) || n.category.toLowerCase().includes(q));
  const lit = hoverId ?? focusId;
  const litSet = useMemo(() => {
    if (!lit || !byId.has(lit)) return null;
    return new Set([lit, ...neighboursOf(lit, byId, incoming).map((n) => n.id)]);
  }, [lit, byId, incoming]);

  // Name every dot whose name fits without covering another, best-connected first;
  // the focus, its neighbours, the dot under the pointer and search hits always win.
  const labelled = useMemo(() => {
    const ids = new Set<string>();
    const boxes: Array<[number, number, number, number]> = [];
    const prio = (n: SimNode) => (n.id === hoverId || n.id === focusId ? 1e6 : 0) + (litSet?.has(n.id) ? 1e5 : 0) + (isMatch(n) ? 1e4 : 0) + n.deg;
    const nodes = layout.nodes.filter((n) => !near || near.has(n.id)).sort((a, b) => prio(b) - prio(a));
    for (const n of nodes) {
      const p = pos.get(n.id)!;
      const w = n.label.length * 6.9 + 6, h = 15;
      const x = p.x * K - w / 2, y = p.y * K + radiusOf(n.deg) * K + 3;
      const forced = prio(n) >= 1e4;
      if (!forced && boxes.some(([bx, by, bw, bh]) => x < bx + bw && x + w > bx && y < by + bh && y + h > by)) continue;
      boxes.push([x, y, w, h]);
      ids.add(n.id);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, pos, K, near, hoverId, focusId, litSet, q]);

  // With several domains, a soft halo behind each cluster, its name on top. The halo
  // hugs the cluster's core (median centre, 85th-percentile reach) so a concept linked
  // far into another domain doesn't stretch it over the whole map.
  const halos = useMemo(() => {
    if (domains.length < 2) return [];
    const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    return domains.map((d) => {
      const ps = layout.nodes.filter((n) => n.domain === d).map((n) => basePos.get(n.id)!);
      if (!ps.length) return null;
      const cx = median(ps.map((p) => p.x)), cy = median(ps.map((p) => p.y));
      const ds = ps.map((p) => Math.hypot(p.x - cx, p.y - cy)).sort((a, b) => a - b);
      const r = Math.max(60, ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.85))]) + 34;
      return { d, cx, cy, r };
    }).filter(Boolean) as Array<{ d: string; cx: number; cy: number; r: number }>;
  }, [domains, layout, basePos]);

  const touches = (l: MapLink, id: string | null) => !!id && (l.source.id === id || l.target.id === id);
  // Named links: all of the focus's (its neighbours sit in a ring, so the names have room);
  // for a dot under the pointer in the full map, only when few enough not to pile up.
  const litLinks = (() => {
    if (!lit) return [];
    const ls = layout.links.filter((l) => touches(l, lit) && (!near || (near.has(l.source.id) && near.has(l.target.id))));
    return near || ls.length <= 6 ? ls : [];
  })();
  const unlinked = layout.nodes.filter((n) => n.deg === 0).length;
  const hoverNode = hoverId ? layout.nodes.find((n) => n.id === hoverId) : null;

  const curve = (a: { x: number; y: number }, b: { x: number; y: number }, ra: number, rb: number) => {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const s = { x: a.x + ux * ra, y: a.y + uy * ra }, e = { x: b.x - ux * (rb + 2), y: b.y - uy * (rb + 2) };
    const bend = Math.min(40, len * 0.12);
    const c = { x: (s.x + e.x) / 2 - uy * bend, y: (s.y + e.y) / 2 + ux * bend };
    // The curve's midpoint, where the link's name sits.
    const m = { x: 0.25 * s.x + 0.5 * c.x + 0.25 * e.x, y: 0.25 * s.y + 0.5 * c.y + 0.25 * e.y };
    return { d: `M${s.x},${s.y} Q${c.x},${c.y} ${e.x},${e.y}`, m };
  };

  const onMove = (e: React.PointerEvent) => {
    const nd = nodeDrag.current;
    if (nd) {
      const dx = (e.clientX - nd.x) / K, dy = (e.clientY - nd.y) / K;
      if (Math.abs(e.clientX - nd.x) + Math.abs(e.clientY - nd.y) > 3) nd.moved = true;
      if (nd.moved) setMoved((m) => ({ ...m, [nd.id]: { x: nd.ox + dx, y: nd.oy + dy } }));
      return;
    }
    const p = pan.current;
    if (p) setView((v) => ({ ...v, x: p.vx + e.clientX - p.x, y: p.vy + e.clientY - p.y }));
  };
  // The click that ends a drag must not also select the dot; remember whether it moved.
  const endDrag = () => { draggedLast.current = !!nodeDrag.current?.moved; pan.current = null; nodeDrag.current = null; };

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-background"
      style={{ backgroundImage: "radial-gradient(hsl(var(--border)) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
      data-testid="ontology-domain-map">
      <svg
        width={size.w} height={size.h} className="block cursor-grab active:cursor-grabbing select-none touch-none"
        onWheel={(e) => { const k = Math.min(3, Math.max(0.4, view.k * (e.deltaY < 0 ? 1.1 : 0.9))); setView((v) => ({ ...v, k })); }}
        onPointerDown={(e) => { pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; }}
        onPointerMove={onMove} onPointerUp={endDrag} onPointerLeave={endDrag}
      >
        <defs>
          <filter id="omap-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodOpacity="0.22" />
          </filter>
          {allDomains.map((d, i) => (
            <marker key={d} id={`omap-arrow-${i}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill={colors[d]} />
            </marker>
          ))}
        </defs>
        <g transform={`translate(${view.x + (size.w / 2) * (1 - view.k)},${view.y + (size.h / 2) * (1 - view.k)}) scale(${view.k})`}>
        <g transform={`translate(${fit.x},${fit.y}) scale(${fit.k})`}>
          {!near && halos.map((h) => (
            <g key={h.d} opacity={lit && !(litSet && layout.nodes.some((n) => n.domain === h.d && litSet.has(n.id))) ? 0.35 : 1}>
              <circle cx={h.cx} cy={h.cy} r={h.r} fill={colors[h.d]} fillOpacity={0.06} stroke={colors[h.d]} strokeOpacity={0.3} strokeDasharray={`${ts(5)} ${ts(4)}`} strokeWidth={ts(1.2)} />
              <text x={h.cx} y={h.cy - h.r - ts(8)} textAnchor="middle" className="fill-foreground"
                style={{ fontSize: ts(14), fontWeight: 600, fontFamily: "var(--astra-display)", paintOrder: "stroke", stroke: "hsl(var(--background))", strokeWidth: ts(4) }}>{h.d}</text>
            </g>
          ))}
          {layout.links.map((l, i) => {
            const a = pos.get(l.source.id)!, b = pos.get(l.target.id)!;
            const hot = touches(l, lit);
            const hide = near && !(near.has(l.source.id) && near.has(l.target.id));
            if (hide) return null;
            const col = colors[l.source.domain];
            const di = allDomains.indexOf(l.source.domain);
            const { d } = curve(a, b, radiusOf(l.source.deg), radiusOf(l.target.deg));
            return (
              <path key={i} d={d} fill="none" stroke={col} strokeWidth={ts(hot ? 2.2 : 1.2)}
                strokeOpacity={lit ? (hot ? 0.95 : 0.1) : 0.42}
                markerEnd={hot ? `url(#omap-arrow-${di})` : undefined} markerStart={hot && l.back ? `url(#omap-arrow-${di})` : undefined} />
            );
          })}
          {layout.nodes.map((n) => {
            if (near && !near.has(n.id)) return null;
            const p = pos.get(n.id)!, r = radiusOf(n.deg) + (n.id === focusId ? 3 : 0);
            const col = colors[n.domain];
            const match = isMatch(n);
            const dim = litSet ? !litSet.has(n.id) : q ? !match : false;
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`} opacity={dim ? 0.22 : 1} style={{ transition: "opacity .15s" }}
                className="cursor-pointer"
                onPointerDown={(e) => { e.stopPropagation(); nodeDrag.current = { id: n.id, x: e.clientX, y: e.clientY, ox: p.x, oy: p.y, moved: false }; }}
                onClick={() => { if (!draggedLast.current) onSelect(n.id); draggedLast.current = false; }}
                onPointerEnter={() => setHoverId(n.id)} onPointerLeave={() => setHoverId(null)} data-testid={`map-node-${n.id}`}>
                {match && <circle r={r + ts(5)} fill="none" stroke="hsl(var(--foreground))" strokeWidth={ts(1.5)} strokeDasharray={`${ts(3)} ${ts(2)}`} />}
                <circle r={r} fill={col} fillOpacity={n.used ? 0.92 : 0.22} stroke={n.id === focusId || n.id === hoverId ? "hsl(var(--foreground))" : col}
                  strokeWidth={ts(n.id === focusId ? 2.8 : n.id === hoverId ? 2 : 1.6)} filter={n.used ? "url(#omap-shadow)" : undefined} />
                {labelled.has(n.id) && (
                  <text y={r + ts(13)} textAnchor="middle" className="fill-foreground"
                    style={{ fontSize: ts(12), fontWeight: n.id === focusId || n.id === hoverId ? 600 : 500, paintOrder: "stroke", stroke: "hsl(var(--background))", strokeWidth: ts(3.5), pointerEvents: "none" }}>{n.label}</text>
                )}
              </g>
            );
          })}
          {/* Link names for the concept in focus or under the pointer, as pills over the curve. */}
          {litLinks.slice(0, 14).map((l, i) => {
            const a = pos.get(l.source.id)!, b = pos.get(l.target.id)!;
            const { m } = curve(a, b, radiusOf(l.source.deg), radiusOf(l.target.deg));
            const text = (l.back ? `${l.label} ⇄ ${l.back}` : l.label).slice(0, 34);
            const w = ts(text.length * 6.2 + 12), h = ts(17);
            return (
              <g key={`pl-${i}`} transform={`translate(${m.x},${m.y})`} style={{ pointerEvents: "none" }}>
                <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill="hsl(var(--card))" stroke={colors[l.source.domain]} strokeOpacity={0.6} strokeWidth={ts(1)} />
                <text y={ts(3.8)} textAnchor="middle" className="fill-foreground font-mono" style={{ fontSize: ts(10.5) }}>{text}</text>
              </g>
            );
          })}
        </g>
        </g>
      </svg>
      {hoverNode && (() => {
        const s = toScreen(pos.get(hoverNode.id)!);
        const r = radiusOf(hoverNode.deg) * K;
        const left = Math.min(size.w - 236, s.x + r + 12), top = Math.max(8, Math.min(size.h - 110, s.y - 36));
        return (
          <div className="pointer-events-none absolute z-10 w-[224px] rounded-lg border bg-card px-3 py-2 shadow-md" style={{ left, top }} data-testid="map-hover-card">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold">
              <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[hoverNode.domain] }} />
              <span className="truncate">{hoverNode.label}</span>
            </div>
            <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{hoverNode.domain} · {hoverNode.category}</div>
            <div className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              {hoverNode.deg} {hoverNode.deg === 1 ? "link" : "links"} · {hoverNode.used ? "used by agents" : "not used by agents yet"}
            </div>
          </div>
        );
      })()}
      <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border bg-card px-2 py-1.5 font-mono text-[11px] text-muted-foreground" data-testid="map-legend">
        {allDomains.map((d) => {
          const off = hidden.has(d);
          return (
            <button key={d} type="button" aria-pressed={!off} title={off ? `Show ${d}` : `Hide ${d}`}
              onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(d)) n.delete(d); else if (n.size < allDomains.length - 1) n.add(d); return n; })}
              className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-accent ${off ? "line-through opacity-50" : "text-foreground"}`}
              data-testid={`map-legend-domain-${d}`}>
              <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colors[d] }} />{d}
            </button>
          );
        })}
        <span className="mx-1 inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-muted-foreground bg-muted-foreground/20" />Not used by agents yet</span>
        <span className="mx-1">Bigger = more links · drag a dot to move it</span>
        {unlinked > 0 && <span className="mx-1">{unlinked} not linked yet</span>}
      </div>
      <div className="absolute right-3 top-3 flex overflow-hidden rounded-lg border bg-card">
        <button type="button" className="px-2.5 py-1 text-sm hover:bg-accent" onClick={() => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.2) }))} aria-label="Zoom in" data-testid="button-map-zoom-in">+</button>
        <button type="button" className="border-l px-2.5 py-1 text-sm hover:bg-accent" onClick={() => setView((v) => ({ ...v, k: Math.max(0.4, v.k / 1.2) }))} aria-label="Zoom out" data-testid="button-map-zoom-out">−</button>
        <button type="button" className="border-l px-2.5 py-1 text-xs hover:bg-accent" onClick={() => { setView({ k: 1, x: 0, y: 0 }); setMoved({}); setHidden(new Set()); }} data-testid="button-map-reset">Reset</button>
      </div>
    </div>
  );
}
