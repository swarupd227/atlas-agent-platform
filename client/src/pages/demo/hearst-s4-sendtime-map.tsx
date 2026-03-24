import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// Simple SVG world map paths (simplified continents for demo)
const WORLD_PATHS = {
  northAmerica: "M 80 120 Q 100 110 130 115 Q 150 112 160 120 Q 165 135 155 150 Q 148 165 135 170 Q 120 175 105 165 Q 88 155 82 140 Z",
  southAmerica: "M 125 175 Q 135 170 145 175 Q 155 185 150 210 Q 145 230 135 235 Q 122 230 118 210 Q 115 192 125 175 Z",
  europe: "M 225 110 Q 245 105 260 110 Q 265 120 258 130 Q 248 138 235 135 Q 220 128 225 110 Z",
  africa: "M 240 140 Q 260 135 270 148 Q 275 165 268 190 Q 258 210 245 212 Q 230 208 225 190 Q 220 168 230 148 Z",
  asia: "M 265 100 Q 310 95 340 105 Q 355 115 350 130 Q 340 145 310 148 Q 280 145 265 130 Z",
  australia: "M 320 195 Q 345 190 355 200 Q 358 215 345 220 Q 328 220 320 210 Z",
};

interface Hotspot {
  id: string; city: string; lat: number; lng: number;
  subscribers: number; brand: string; color: string;
}

function lngToX(lng: number): number {
  return ((lng + 180) / 360) * 400 + 10;
}
function latToY(lat: number): number {
  return ((90 - lat) / 180) * 220 + 10;
}

function WorldMap({ hotspots, animating }: { hotspots: Hotspot[]; animating: boolean }) {
  const [waveIdx, setWaveIdx] = useState(0);
  useEffect(() => {
    if (!animating) return;
    const interval = setInterval(() => setWaveIdx(v => (v + 1) % hotspots.length), 400);
    return () => clearInterval(interval);
  }, [animating, hotspots.length]);

  return (
    <svg viewBox="0 0 420 240" className="w-full h-full" style={{ background: "#0F172A", borderRadius: "0.5rem" }}>
      {/* Ocean background */}
      <rect width="420" height="240" fill="#0F172A" rx="8" />
      {/* Grid lines */}
      {[0, 1, 2, 3].map(i => (
        <line key={`h${i}`} x1="10" x2="410" y1={10 + i * 55} y2={10 + i * 55} stroke="#1E293B" strokeWidth="0.5" />
      ))}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <line key={`v${i}`} x1={10 + i * 67} x2={10 + i * 67} y1="10" y2="230" stroke="#1E293B" strokeWidth="0.5" />
      ))}
      {/* Continents */}
      {Object.values(WORLD_PATHS).map((d, i) => (
        <path key={i} d={d} fill="#1E3A5F" stroke="#2D5986" strokeWidth="0.5" opacity={0.8} />
      ))}
      {/* Hotspots */}
      {hotspots.map((h, i) => {
        const x = lngToX(h.lng);
        const y = latToY(h.lat);
        const isActive = animating && i === waveIdx;
        const r = Math.sqrt(h.subscribers / 180000) * 8 + 4;
        return (
          <g key={h.id}>
            {isActive && (
              <circle cx={x} cy={y} r={r * 2.5} fill={h.color} opacity={0.15}>
                <animate attributeName="r" from={r} to={r * 4} dur="0.8s" repeatCount="1" />
                <animate attributeName="opacity" from={0.3} to={0} dur="0.8s" repeatCount="1" />
              </circle>
            )}
            <circle cx={x} cy={y} r={r} fill={h.color} opacity={0.85} />
            <circle cx={x} cy={y} r={r * 0.4} fill="white" opacity={0.9} />
            <text x={x} y={y - r - 2} textAnchor="middle" fill="white" fontSize="7" opacity={0.8}>{h.city}</text>
          </g>
        );
      })}
      {/* Legend */}
      <text x="15" y="228" fill="#64748B" fontSize="8">XYZ subscriber density by city</text>
    </svg>
  );
}

const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);

export default function Screen4SendTimeMap() {
  const [animating, setAnimating] = useState(false);
  const { data, isLoading } = useQuery<any>({ queryKey: ["/demo-api/hearst/send-time-map"] });

  if (isLoading || !data) {
    return <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Loading send time data…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header stats */}
      <div className="flex gap-3 flex-wrap">
        <Card className="flex-1 min-w-0">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">Emails Sent</p>
            <p className="text-xl font-bold">{fmt(data.totalSent)}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-0">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">Remaining</p>
            <p className="text-xl font-bold text-muted-foreground">{fmt(data.totalRemaining)}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-0">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">Live Open Rate</p>
            <p className="text-xl font-bold text-green-400">{data.liveOpenRate}%</p>
          </CardContent>
        </Card>
        <div className="flex items-center">
          <button
            onClick={() => setAnimating(v => !v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${animating ? "bg-red-500/20 text-red-300 border border-red-500/30" : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"}`}>
            {animating ? "⏹ Stop" : "▶ Play Send Wave"}
          </button>
        </div>
      </div>

      {/* Main content: Map + Timezone panel */}
      <div className="flex gap-4">
        {/* World Map */}
        <Card className="flex-[3]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Global Send Distribution</CardTitle>
            <p className="text-[11px] text-muted-foreground">Subscriber density by city. Press Play to animate today's send wave.</p>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <WorldMap hotspots={data.hotspots} animating={animating} />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {data.hotspots.map((h: Hotspot) => (
                <div key={h.id} className="flex items-center gap-1 text-[10px]">
                  <span className="w-2 h-2 rounded-full" style={{ background: h.color }} />
                  <span className="text-muted-foreground">{h.city}</span>
                  <span className="font-medium">{fmt(h.subscribers)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Timezone Performance */}
        <Card className="flex-[2]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open Rate by Timezone</CardTitle>
            <p className="text-[11px] text-muted-foreground">Each region sent at local peak hour</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.timezonePerf} layout="vertical" margin={{ left: 8, right: 32, top: 0, bottom: 0 }}>
                <XAxis type="number" domain={[0, 45]} tickFormatter={v => `${v}%`} tick={{ fontSize: 9 }} />
                <YAxis type="category" dataKey="zone" tick={{ fontSize: 10 }} width={64} />
                <Tooltip formatter={(v: any) => [`${v}%`, "Open Rate"]} />
                <Bar dataKey="openRate" radius={[0, 4, 4, 0]}>
                  {data.timezonePerf.map((tz: any, i: number) => (
                    <Cell key={i} fill={tz.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1.5 mt-2">
              {data.timezonePerf.map((tz: any) => (
                <div key={tz.zone} className="flex items-center gap-2 text-[10px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tz.color }} />
                  <span className="text-muted-foreground flex-1">{tz.zone} ({tz.abbr})</span>
                  <span className="text-muted-foreground">Peak: {tz.peakHour} local</span>
                  {tz.liftPct != null && (
                    <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-green-500/15 text-green-400">
                      +{tz.liftPct.toFixed(1)}%
                    </span>
                  )}
                  <span className="font-bold">{tz.openRate}%</span>
                </div>
              ))}
              {(() => {
                const europe = data.timezonePerf?.find((tz: any) => tz.zone === "Europe");
                return europe ? (
                  <div className="mt-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-[10px] text-green-300">
                    Europe leads at {europe.openRate}% — +{europe.liftPct?.toFixed(1) ?? "48.3"}% lift from local timezone optimization vs. old {Math.round(europe.baselineOpenRate ?? 25.9)}% with 9am ET batch sends.
                  </div>
                ) : null;
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Before/After histograms */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Before Atlas — All sends at 9–10 AM ET</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={data.beforeAtlas} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 8 }} interval={3} />
                <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 8 }} width={28} />
                <Tooltip formatter={(v: any) => [`${(v / 1000).toFixed(0)}K`, "Sends"]} />
                <Bar dataKey="sends" fill="#6B7280" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground mt-1 text-center">Narrow spike — all subscribers receive at same time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">With Atlas — Distributed across optimal windows</CardTitle>
            <Badge className="text-[10px] bg-indigo-500/20 text-indigo-300 w-fit">AI-Personalized</Badge>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={data.withAtlas} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 8 }} interval={3} />
                <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 8 }} width={28} />
                <Tooltip formatter={(v: any) => [`${(v / 1000).toFixed(0)}K`, "Sends"]} />
                <Bar dataKey="sends" fill="#6366F1" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground mt-1 text-center">Smooth 16-hour distribution — each subscriber's personal peak</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
