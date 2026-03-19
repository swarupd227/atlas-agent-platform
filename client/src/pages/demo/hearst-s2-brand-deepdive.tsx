import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

const BRANDS = [
  { id: "cosmo", name: "Cosmopolitan", color: "#E91E8C" },
  { id: "elle", name: "Elle", color: "#1A1A1A" },
  { id: "goodhousekeeping", name: "Good Housekeeping", color: "#2E7D32" },
  { id: "harpersbazaar", name: "Harper's Bazaar", color: "#C9A84C" },
  { id: "countryliving", name: "Country Living", color: "#3E6B3E" },
  { id: "runnersworld", name: "Runner's World", color: "#E65100" },
  { id: "menshealth", name: "Men's Health", color: "#1565C0" },
  { id: "esquire", name: "Esquire", color: "#1B3A6B" },
];

const INTENSITY_COLORS = ["#1E2A1E", "#2D5A2D", "#3D8B3D", "#52C652", "#7AE07A", "#A8F0A8"];

function getIntensityColor(value: number) {
  const idx = Math.min(Math.floor(value * INTENSITY_COLORS.length), INTENSITY_COLORS.length - 1);
  return INTENSITY_COLORS[idx];
}

const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);

export default function Screen2BrandDeepdive() {
  const [selectedBrand, setSelectedBrand] = useState("cosmo");
  const [showBrandMenu, setShowBrandMenu] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/demo-api/hearst/brand", selectedBrand],
    queryFn: () => fetch(`/demo-api/hearst/brand/${selectedBrand}`).then(r => r.json()),
  });

  const brand = BRANDS.find(b => b.id === selectedBrand) || BRANDS[0];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ background: brand.color }}>
          {brand.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold">{brand.name}</h2>
          {data && (
            <p className="text-xs text-muted-foreground">
              {fmt(data.metrics.totalSubscribers)} subscribers · {fmt(data.metrics.emailsScheduled)} scheduled today · {fmt(data.metrics.holdCount)} HOLD · {data.metrics.predictedOpenRate}% predicted open rate
            </p>
          )}
        </div>
        <div className="relative">
          <Button variant="outline" size="sm" onClick={() => setShowBrandMenu(v => !v)} className="gap-1">
            Switch Brand <ChevronDown className="w-3 h-3" />
          </Button>
          {showBrandMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-background border rounded-lg shadow-lg py-1 min-w-[180px]">
              {BRANDS.map(b => (
                <button key={b.id} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 text-left"
                  onClick={() => { setSelectedBrand(b.id); setShowBrandMenu(false); }}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: b.color }} />
                  {b.name}
                  {b.id === selectedBrand && <span className="ml-auto text-primary text-xs">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Loading brand data…</div>
      ) : (
        <>
          {/* Section 1 — Default vs AI Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-dashed border-muted-foreground/30">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">Brand Default Plan</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="p-3 rounded-lg bg-muted/20 border">
                  <p className="text-[10px] text-muted-foreground mb-1">Planned Email</p>
                  <p className="text-sm font-medium">{data.defaultPlan.subject}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-muted/20">
                    <p className="text-[9px] text-muted-foreground">Target</p>
                    <p className="text-sm font-bold">{fmt(data.defaultPlan.targetSize)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/20">
                    <p className="text-[9px] text-muted-foreground">Send Time</p>
                    <p className="text-sm font-bold">9 AM ET</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/20">
                    <p className="text-[9px] text-muted-foreground">Est. Open Rate</p>
                    <p className="text-sm font-bold text-muted-foreground">{data.defaultPlan.openRateEstimate}%</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground italic">Same email, same time, all {fmt(data.defaultPlan.targetSize)} subscribers.</p>
              </CardContent>
            </Card>

            <Card className="border-indigo-500/30 bg-indigo-500/[0.02]">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  <CardTitle className="text-sm font-medium">Atlas Optimized Plan</CardTitle>
                  <Badge className="text-[10px] bg-indigo-500/20 text-indigo-300 border-indigo-500/30">AI-Driven</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {data.aiGroups.map((g: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(g.count / data.metrics.totalSubscribers * 100).toFixed(0)}%`, background: g.color }} />
                      </div>
                    </div>
                    <span className="text-[10px] font-medium w-10 text-right">{fmt(g.count)}</span>
                    <span className="text-[10px] text-muted-foreground flex-1 min-w-0 truncate">{g.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-1 pt-2 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">Predicted open rate:</span>
                  <span className="text-sm font-bold text-green-400">{data.metrics.predictedOpenRate}%</span>
                  <span className="text-[10px] text-muted-foreground">vs. {data.defaultPlan.openRateEstimate}% baseline</span>
                  {data.metrics.liftPct != null && (
                    <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/15 text-green-400">
                      +{data.metrics.liftPct.toFixed(1)}% lift
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 2 — Content Affinity Heatmap */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Content Affinity Heatmap</CardTitle>
              <p className="text-[11px] text-muted-foreground">Subscriber segments vs. today's content topics — cell color = engagement intensity</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr>
                    <th className="text-left font-medium text-muted-foreground py-1 pr-3 w-32">Segment</th>
                    {data.topics.map((t: string) => (
                      <th key={t} className="text-center font-medium text-muted-foreground py-1 px-2 min-w-[80px]">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.segments.map((seg: string, si: number) => (
                    <tr key={seg}>
                      <td className="py-1 pr-3 font-medium text-foreground/80 whitespace-nowrap">{seg}</td>
                      {data.heatmap[si].map((val: number, ti: number) => (
                        <td key={ti} className="py-1 px-2 text-center">
                          <div className="w-full h-7 rounded flex items-center justify-center text-[9px] font-medium"
                            style={{ background: getIntensityColor(val), color: val > 0.5 ? "#fff" : "#ccc" }}>
                            {(val * 100).toFixed(0)}%
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                <span>Low</span>
                <div className="flex gap-0.5">
                  {INTENSITY_COLORS.map((c, i) => <div key={i} className="w-5 h-3 rounded-sm" style={{ background: c }} />)}
                </div>
                <span>High engagement</span>
              </div>
            </CardContent>
          </Card>

          {/* Section 3 — 7-Day Performance Trend */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium">7-Day Performance Trend</CardTitle>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="w-2 h-0.5 bg-indigo-400 rounded" />
                  <span>Atlas active period highlighted</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.trend7d} margin={{ top: 4, right: 24, bottom: 0, left: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="pct" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} width={36} />
                  <YAxis yAxisId="rev" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} width={44} />
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                  {data.trend7d.map((d: any, i: number) => d.atlasActive && <ReferenceLine key={i} x={d.date} stroke="#6366F1" strokeOpacity={0.15} yAxisId="pct" strokeWidth={24} />)}
                  <Line yAxisId="pct" type="monotone" dataKey="openRate" stroke="#6366F1" strokeWidth={2} dot={{ r: 3 }} name="Open Rate %" />
                  <Line yAxisId="pct" type="monotone" dataKey="clickRate" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} name="Click Rate %" />
                  <Line yAxisId="pct" type="monotone" dataKey="unsubRate" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} name="Unsub Rate %" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
