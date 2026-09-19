// Ontology diagrams: a concept's neighbourhood (what it links to, each link
// named) and the whole-ontology map, clustered by domain. Colour encodes the
// domain only (a handful of hues, not one per category); a filled dot means an
// agent uses the concept, a hollow one means none does yet.
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

/** The whole ontology, one cluster per domain. With a focus, that concept's
 *  neighbours come close and get labels; everything else fades. */
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
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(400, el.clientWidth), h: Math.max(360, el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const domains = useMemo(() => Array.from(new Set(concepts.map((c) => c.domain))), [concepts]);
  const incoming = useMemo(() => buildIncoming(concepts), [concepts]);
  const byId = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);

  const centers = useMemo(() => {
    const cols = Math.ceil(Math.sqrt(domains.length)), rows = Math.ceil(domains.length / cols);
    return Object.fromEntries(domains.map((d, i) => [d, {
      x: size.w * ((i % cols) + 0.5) / cols,
      y: size.h * (Math.floor(i / cols) + 0.5) / rows,
    }]));
  }, [domains, size]);

  // Settle the layout once per data/size change, off screen, so the map appears still.
  const layout = useMemo(() => {
    const nodes: SimNode[] = concepts.map((c) => ({ ...c, deg: c.relationships.filter((r) => byId.has(r.targetId)).length + (incoming.get(c.id)?.length || 0) }));
    const links = concepts.flatMap((c) => c.relationships.filter((r) => byId.has(r.targetId) && r.targetId !== c.id)
      .map((r) => ({ source: c.id, target: r.targetId, label: r.label || r.type.replace(/_/g, " ") })));
    const sim = forceSimulation<SimNode>(nodes)
      .force("link", forceLink<SimNode, any>(links).id((n) => n.id).distance(62).strength(0.3))
      .force("charge", forceManyBody().strength(-130))
      .force("x", forceX<SimNode>((n) => centers[n.domain]?.x ?? size.w / 2).strength(0.12))
      .force("y", forceY<SimNode>((n) => centers[n.domain]?.y ?? size.h / 2).strength(0.12))
      .force("collide", forceCollide(22))
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();
    return { nodes, links: links as unknown as Array<{ source: SimNode; target: SimNode; label: string }> };
  }, [concepts, byId, incoming, centers, size]);

  const near = useMemo(() => {
    if (!focusId) return null;
    return new Set([focusId, ...neighboursOf(focusId, byId, incoming).map((n) => n.id)]);
  }, [focusId, byId, incoming]);

  // In focus mode the neighbours are pulled into a ring around the focus so every link reads.
  const pos = useMemo(() => {
    const p = new Map(layout.nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
    if (focusId && near && p.has(focusId)) {
      const f = { x: size.w * 0.45, y: size.h * 0.5 };
      p.set(focusId, f);
      const ring = Array.from(near).filter((id) => id !== focusId);
      const rr = 90 + Math.min(ring.length, 12) * 9;
      ring.forEach((id, i) => {
        const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
        p.set(id, { x: f.x + Math.cos(a) * rr * 1.35, y: f.y + Math.sin(a) * rr });
      });
    }
    return p;
  }, [layout, focusId, near, size]);

  // Fit the whole drawing into the view, leaving room for the legend at the bottom.
  const fit = useMemo(() => {
    const all = near ? Array.from(near).map((id) => pos.get(id)!).filter(Boolean) : Array.from(pos.values());
    if (!all.length) return { k: 1, x: 0, y: 0 };
    const pad = near ? 110 : 48, legend = 56;
    const minX = Math.min(...all.map((p) => p.x)) - pad, maxX = Math.max(...all.map((p) => p.x)) + pad;
    const minY = Math.min(...all.map((p) => p.y)) - pad - 16, maxY = Math.max(...all.map((p) => p.y)) + pad;
    const k = Math.min(1.4, size.w / (maxX - minX), (size.h - legend) / (maxY - minY));
    return { k, x: (size.w - (maxX - minX) * k) / 2 - minX * k, y: (size.h - legend - (maxY - minY) * k) / 2 - minY * k };
  }, [pos, size, near]);
  // Text is drawn inside the zoomed group; divide by the zoom so it always reads at its set size.
  const ts = (px: number) => px / (fit.k * view.k);
  // Without a focus, name only the three best-connected concepts of each domain (and any search hits).
  const labelled = useMemo(() => {
    const ids = new Set<string>();
    const boxes: Array<[number, number, number, number]> = [];
    const k = fit.k * view.k;
    const candidates = domains.flatMap((d) => layout.nodes.filter((n) => n.domain === d && n.deg >= 3).sort((a, b) => b.deg - a.deg).slice(0, 4));
    for (const n of candidates.sort((a, b) => b.deg - a.deg)) {
      const p = pos.get(n.id)!;
      const w = n.label.length * 6.6 + 8, h = 16;
      const x = p.x * k - w / 2, y = p.y * k + 8;
      if (boxes.some(([bx, by, bw, bh]) => x < bx + bw && x + w > bx && y < by + bh && y + h > by)) continue;
      boxes.push([x, y, w, h]);
      ids.add(n.id);
    }
    return ids;
  }, [domains, layout, pos, fit, view.k]);
  // Each domain's name sits just above its own cluster.
  const domainLabelPos = useMemo(() => Object.fromEntries(domains.map((d) => {
    const ps = layout.nodes.filter((n) => n.domain === d).map((n) => pos.get(n.id)!);
    if (!ps.length) return [d, centers[d]];
    return [d, { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: Math.min(...ps.map((p) => p.y)) - 22 }];
  })), [domains, layout, pos, centers]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const focusLinkCount = focusId ? layout.links.filter((l) => l.source.id === focusId || l.target.id === focusId).length : 0;

  const q = searchQuery.trim().toLowerCase();
  const touchesFocus = (l: { source: SimNode; target: SimNode }) => !!focusId && (l.source.id === focusId || l.target.id === focusId);
  const unlinked = layout.nodes.filter((n) => n.deg === 0).length;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-background"
      style={{ backgroundImage: "radial-gradient(hsl(var(--border)) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
      data-testid="ontology-domain-map">
      <svg
        width={size.w} height={size.h} className="block cursor-grab active:cursor-grabbing select-none"
        onWheel={(e) => { const k = Math.min(3, Math.max(0.4, view.k * (e.deltaY < 0 ? 1.1 : 0.9))); setView((v) => ({ ...v, k })); }}
        onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; }}
        onMouseMove={(e) => { const d = drag.current; if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y })); }}
        onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; }}
      >
        <g transform={`translate(${view.x + (size.w / 2) * (1 - view.k)},${view.y + (size.h / 2) * (1 - view.k)}) scale(${view.k})`}>
        <g transform={`translate(${fit.x},${fit.y}) scale(${fit.k})`}>
          {domains.map((d) => (
            <text key={d} x={domainLabelPos[d].x} y={domainLabelPos[d].y} textAnchor="middle"
              className="fill-muted-foreground" style={{ fontSize: ts(13), fontWeight: 600, fontFamily: "var(--astra-display)", opacity: focusId ? 0.3 : 1 }}>{d}</text>
          ))}
          {layout.links.map((l, i) => {
            const a = pos.get(l.source.id)!, b = pos.get(l.target.id)!;
            const hot = touchesFocus(l);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="hsl(var(--muted-foreground))" strokeWidth={hot ? 1.8 : 1} opacity={!focusId ? 0.4 : hot ? 0.9 : 0.08} />;
          })}
          {focusId && layout.links.filter(touchesFocus)
            .filter((l) => focusLinkCount <= 8 || l.source.id === hoverId || l.target.id === hoverId)
            .map((l, i) => {
            const a = pos.get(l.source.id)!, b = pos.get(l.target.id)!;
            return <text key={`el-${i}`} x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle" className="fill-muted-foreground font-mono"
              style={{ fontSize: ts(10.5), paintOrder: "stroke", stroke: "hsl(var(--background))", strokeWidth: ts(3) }}>{l.label.slice(0, 26)}</text>;
          })}
          {layout.nodes.map((n) => {
            const p = pos.get(n.id)!, r = 5 + Math.min(6, n.deg * 1.2) + (n.id === focusId ? 3 : 0);
            const dim = near ? !near.has(n.id) : false;
            const match = q && (n.label.toLowerCase().includes(q) || n.category.toLowerCase().includes(q));
            const showLabel = near ? near.has(n.id) : labelled.has(n.id) || !!match || n.id === hoverId;
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`} opacity={dim ? 0.1 : q && !match && !near ? 0.35 : 1}
                className="cursor-pointer" onMouseDown={(e) => e.stopPropagation()} onClick={() => onSelect(n.id)}
                onMouseEnter={() => setHoverId(n.id)} onMouseLeave={() => setHoverId(null)} data-testid={`map-node-${n.id}`}>
                <title>{`${n.label} · ${n.category}${n.used ? "" : " · not used by agents yet"}`}</title>
                <circle r={r} fill={n.used ? colors[n.domain] : "hsl(var(--card))"} stroke={n.id === focusId ? "hsl(var(--foreground))" : colors[n.domain]} strokeWidth={n.id === focusId ? 2.5 : 1.8} />
                {showLabel && (
                  <text y={r + ts(13)} textAnchor="middle" className="fill-foreground" style={{ fontSize: ts(12), fontWeight: n.id === focusId ? 600 : undefined, paintOrder: "stroke", stroke: "hsl(var(--background))", strokeWidth: ts(3.5) }}>{n.label}</text>
                )}
              </g>
            );
          })}
        </g>
        </g>
      </svg>
      <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-24px)] flex-wrap gap-x-3.5 gap-y-1 rounded-lg border bg-card px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground" data-testid="map-legend">
        {domains.map((d) => (
          <span key={d} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colors[d] }} />{d}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-muted-foreground" />Not used by agents yet</span>
        <span>Bigger = more connected · point at a dot for its name</span>
        {unlinked > 0 && <span>{unlinked} not linked to anything</span>}
      </div>
      <div className="absolute right-3 top-3 flex overflow-hidden rounded-lg border bg-card">
        <button type="button" className="px-2.5 py-1 text-sm hover:bg-accent" onClick={() => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.2) }))} aria-label="Zoom in" data-testid="button-map-zoom-in">+</button>
        <button type="button" className="border-l px-2.5 py-1 text-sm hover:bg-accent" onClick={() => setView((v) => ({ ...v, k: Math.max(0.4, v.k / 1.2) }))} aria-label="Zoom out" data-testid="button-map-zoom-out">−</button>
        <button type="button" className="border-l px-2.5 py-1 text-xs hover:bg-accent" onClick={() => setView({ k: 1, x: 0, y: 0 })} data-testid="button-map-reset">Reset</button>
      </div>
    </div>
  );
}
