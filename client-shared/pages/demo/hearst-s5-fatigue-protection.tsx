import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

type ViewMode = "pre-atlas" | "with-atlas";

function cellColor(value: number, mode: ViewMode) {
  if (mode === "pre-atlas") {
    if (value >= 5) return { bg: "#7F1D1D", text: "#FCA5A5" };
    if (value >= 4) return { bg: "#991B1B", text: "#FCA5A5" };
    if (value >= 3) return { bg: "#B91C1C", text: "#FECACA" };
    if (value >= 2) return { bg: "#DC2626", text: "#FEF2F2" };
    return { bg: "#EF4444", text: "#FFF1F2" };
  } else {
    if (value >= 2) return { bg: "#14532D", text: "#86EFAC" };
    if (value >= 1.5) return { bg: "#166534", text: "#86EFAC" };
    if (value >= 1) return { bg: "#15803D", text: "#DCFCE7" };
    return { bg: "#16A34A", text: "#F0FDF4" };
  }
}

const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);

export default function Screen5FatigueProtection() {
  const [viewMode, setViewMode] = useState<ViewMode>("with-atlas");
  const { data, isLoading } = useQuery<any>({ queryKey: ["/demo-api/hearst/fatigue"] });

  if (isLoading || !data) {
    return <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Loading fatigue data…</div>;
  }

  const heatmapData = viewMode === "pre-atlas" ? data.preAtlasHeatmap : data.withAtlasHeatmap;

  const unsubChartData = data.unsubTrend.map((d: any) => ({
    ...d,
    rate: d.preAtlas ?? d.withAtlas,
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* Section 1 — Portfolio Fatigue Heatmap */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Portfolio Fatigue Heatmap</CardTitle>
              <p className="text-[11px] text-muted-foreground">Avg emails received per day, by subscriber segment</p>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode("pre-atlas")}
                className={`px-3 py-1 text-[11px] rounded-md transition-colors ${viewMode === "pre-atlas" ? "bg-red-500/20 text-red-300 border border-red-500/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50"}`}>
                Before Atlas
              </button>
              <button
                onClick={() => setViewMode("with-atlas")}
                className={`px-3 py-1 text-[11px] rounded-md transition-colors ${viewMode === "with-atlas" ? "bg-green-500/20 text-green-300 border border-green-500/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50"}`}>
                With Atlas
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr>
                <th className="text-left font-medium text-muted-foreground py-1.5 pr-4 w-44">Segment</th>
                {data.days.map((d: string) => (
                  <th key={d} className="text-center font-medium text-muted-foreground py-1.5 px-3 min-w-[60px]">{d}</th>
                ))}
                <th className="text-center font-medium text-muted-foreground py-1.5 px-3">Avg/Day</th>
              </tr>
            </thead>
            <tbody>
              {data.segments.map((seg: string, si: number) => {
                const row: number[] = heatmapData[si];
                const avg = parseFloat((row.reduce((a: number, b: number) => a + b, 0) / row.length).toFixed(1));
                const { bg: avgBg, text: avgText } = cellColor(avg, viewMode);
                return (
                  <tr key={seg}>
                    <td className="py-1.5 pr-4 font-medium text-foreground/80 whitespace-nowrap">{seg}</td>
                    {row.map((val: number, di: number) => {
                      const { bg, text } = cellColor(val, viewMode);
                      return (
                        <td key={di} className="py-1.5 px-1 text-center">
                          <div className="h-8 rounded flex items-center justify-center font-medium mx-0.5"
                            style={{ background: bg, color: text }}>
                            {val.toFixed(1)}
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-1 text-center">
                      <div className="h-8 rounded flex items-center justify-center font-bold mx-0.5"
                        style={{ background: avgBg, color: avgText }}>
                        {avg}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
            {viewMode === "pre-atlas"
              ? <><span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: "#B91C1C" }} /> High (3–6 emails/day)</span><span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: "#EF4444" }} /> Medium (2–3)</span></>
              : <><span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: "#14532D" }} /> Optimal (1–2 emails/day)</span><span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: "#16A34A" }} /> Very low</span></>
            }
          </div>
        </CardContent>
      </Card>

      {/* Section 2 — HOLD Decision Impact */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">HOLD Decisions This Week</CardTitle>
            <p className="text-[11px] text-muted-foreground">{fmt(data.holdImpact.totalHolds)} sends suppressed</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.holdImpact.byReason.map((r: any) => (
              <div key={r.reason}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-muted-foreground">{r.reason}</span>
                  <span className="font-medium">{fmt(r.count)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: `${(r.count / data.holdImpact.totalHolds * 100).toFixed(0)}%`,
                    background: r.color,
                  }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">HOLD Decision Impact</CardTitle>
            <p className="text-[11px] text-muted-foreground">What happened to held subscribers?</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                <p className="text-[10px] text-muted-foreground">Held → Next Day Open Rate</p>
                <p className="text-2xl font-bold text-green-400">{data.holdImpact.heldNextDayOpenRate}%</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 text-center">
                <p className="text-[10px] text-muted-foreground">Not Held Open Rate</p>
                <p className="text-2xl font-bold text-muted-foreground">{data.holdImpact.notHeldOpenRate}%</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
                <p className="text-[10px] text-muted-foreground">Held Revenue/Subscriber</p>
                <p className="text-lg font-bold text-emerald-400">${data.holdImpact.heldRevenuePerSub}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 text-center">
                <p className="text-[10px] text-muted-foreground">Not Held Revenue/Sub</p>
                <p className="text-lg font-bold text-muted-foreground">${data.holdImpact.notHeldRevenuePerSub}</p>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-300">
              HOLD decisions maximize long-term subscriber LTV — not just today's send volume.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 3 — Unsub Prevention Tracker */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Unsubscribe Prevention Tracker</CardTitle>
              <p className="text-[11px] text-muted-foreground">12-week unsubscribe rate — Atlas activation at week 7</p>
            </div>
            <div className="flex gap-3">
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Subscribers preserved</p>
                <p className="text-sm font-bold text-green-400">{fmt(data.preservedSubscribers)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Annual revenue protected</p>
                <p className="text-sm font-bold text-emerald-400">${fmt(data.preservedAnnualRevenue)}</p>
              </div>
              <Badge className="self-center text-[10px] bg-green-500/20 text-green-300 border-green-500/30">
                -{data.unsubReduction}% unsub rate
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.unsubTrend} margin={{ top: 4, right: 24, bottom: 0, left: 0 }}>
              <XAxis dataKey="week" tick={{ fontSize: 9 }} />
              <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 9 }} domain={[0, 0.3]} width={36} />
              <Tooltip formatter={(v: any) => [`${v}%`, "Unsub Rate"]} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
              <ReferenceLine x="Wk 7" stroke="#6366F1" strokeDasharray="3 3" label={{ value: "Atlas active", position: "top", fontSize: 10, fill: "#6366F1" }} />
              <Line type="monotone" dataKey="preAtlas" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} name="Pre-Atlas unsub %" connectNulls={false} />
              <Line type="monotone" dataKey="withAtlas" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} name="With Atlas unsub %" connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
