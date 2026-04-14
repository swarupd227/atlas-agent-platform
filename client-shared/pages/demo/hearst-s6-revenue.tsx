import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { TrendingUp, AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";

const URGENCY_STYLES: Record<string, { border: string; bg: string; icon: any; iconColor: string }> = {
  high: { border: "border-yellow-500/30", bg: "bg-yellow-500/10", icon: AlertTriangle, iconColor: "text-yellow-400" },
  medium: { border: "border-indigo-500/30", bg: "bg-indigo-500/10", icon: Lightbulb, iconColor: "text-indigo-400" },
  low: { border: "border-green-500/30", bg: "bg-green-500/10", icon: CheckCircle2, iconColor: "text-green-400" },
};

const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
const fmtPlain = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);

function WaterfallChart({ data }: { data: any[] }) {
  const revenueItems = data.filter(d => d.type === "revenue" || d.type === "total");
  const maxVal = 240000;
  return (
    <div className="flex flex-col gap-1">
      {data.map((item, i) => {
        const isRevenue = item.type === "revenue" || item.type === "total";
        const pct = isRevenue ? (item.value / maxVal * 100) : (item.value / 8200000 * 100);
        const color = item.type === "total" ? "#6366F1" : item.type === "revenue" ? "#10B981" : "#6B7280";
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="w-28 text-[10px] text-muted-foreground text-right truncate shrink-0">{item.stage}</div>
            <div className="flex-1 flex items-center gap-2">
              <div className="h-6 rounded-r flex items-center pr-2 text-[10px] font-medium text-white relative overflow-hidden"
                style={{ width: `${Math.max(pct, 6)}%`, background: color, minWidth: 40 }}>
                <span className="relative z-10 truncate px-2">{item.label}</span>
              </div>
              {item.rate && <span className="text-[10px] text-muted-foreground shrink-0">({item.rate}%)</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Screen6Revenue() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/demo-api/hearst/revenue"] });

  if (isLoading || !data) {
    return <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Loading revenue data…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top summary bar */}
      <div className="flex gap-3 flex-wrap">
        <Card className="flex-1 min-w-0">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">This Week Revenue</p>
            <p className="text-2xl font-bold text-emerald-400">{fmt(data.thisWeekRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-0">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">Last Week (pre-full opt.)</p>
            <p className="text-2xl font-bold text-muted-foreground">{fmt(data.lastWeekRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-0 border-green-500/30 bg-green-500/[0.02]">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">Weekly Lift</p>
            <p className="text-2xl font-bold text-green-400">+{data.lift}%</p>
            <p className="text-[10px] text-muted-foreground">+{fmt(data.thisWeekRevenue - data.lastWeekRevenue)}</p>
          </CardContent>
        </Card>
        <div className="flex items-center">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-medium text-indigo-300">+43.6% vs. last week</span>
          </div>
        </div>
      </div>

      {/* Section 1 — Revenue Waterfall */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Revenue Waterfall — This Week</CardTitle>
          <p className="text-[11px] text-muted-foreground">How email decisions cascade to revenue</p>
        </CardHeader>
        <CardContent>
          <WaterfallChart data={data.waterfall} />
        </CardContent>
      </Card>

      {/* Section 2 + 3 — Revenue by Brand + AI Insights */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue by Brand This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.brandRevenue} layout="vertical" margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                <XAxis type="number" tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 9 }} />
                <YAxis type="category" dataKey="brand" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v: any) => [`$${(v / 1000).toFixed(0)}K`, "Revenue"]} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {data.brandRevenue.map((b: any, i: number) => (
                    <Cell key={i} fill={b.color} />
                  ))}
                  <LabelList dataKey="revenue" position="right" formatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} style={{ fontSize: 9 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 p-2 rounded-lg bg-muted/20 text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground">Country Living</span> generates 2.1× more revenue per email than Cosmopolitan. Atlas has automatically increased CL's share of daily sends by 15%.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">AI Intelligence Report</CardTitle>
              <Badge variant="secondary" className="text-[10px]">Agent 5 · Weekly</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">Auto-generated insights from the Performance & Learning Agent</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.aiInsights.map((insight: any, i: number) => {
              const style = URGENCY_STYLES[insight.urgency] || URGENCY_STYLES.low;
              const Icon = style.icon;
              return (
                <div key={i} className={`p-3 rounded-lg border ${style.border} ${style.bg}`}>
                  <div className="flex items-start gap-2">
                    <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${style.iconColor}`} />
                    <div>
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[11px] font-medium">{insight.title}</span>
                        <Badge variant="outline" className={`text-[9px] ${insight.urgency === "high" ? "border-yellow-500/30 text-yellow-400" : insight.urgency === "medium" ? "border-indigo-500/30 text-indigo-400" : "border-green-500/30 text-green-400"}`}>
                          {insight.metric}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{insight.body}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
