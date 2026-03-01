import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import {
  DollarSign,
  Download,
  BarChart3,
  CheckCircle,
  Clock,
  AlertTriangle,
  FileText,
  CreditCard,
  TrendingUp,
  TrendingDown,
  PieChart,
  ArrowLeft,
  ExternalLink,
  ShieldAlert,
  XCircle,
  Filter,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Layers,
  Activity,
  X,
  Cpu,
  Wrench,
  Server,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { usePermission } from "@/components/role-provider";
import { useEnvironment } from "@/components/environment-selector";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Invoice, BillingDispute, RunTrace } from "@shared/schema";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart as RechartsPie,
  Pie,
  Legend,
  Area,
  AreaChart,
  ComposedChart,
} from "recharts";

interface MeteringDashboard {
  summary: {
    totalRevenue: number;
    pendingRevenue: number;
    projectedAnnualRevenue: number;
    revenueGrowth: number;
    totalUnitsDelivered: number;
    billableUnits: number;
    excludedUnits: number;
    acceptanceRate: number;
    totalInvoices: number;
    paidInvoices: number;
    pendingInvoices: number;
  };
  monthlyRevenue: Array<{ month: string; revenue: number; units: number }>;
  excludeReasons: Record<string, number>;
  outcomeMetering: Array<{
    outcomeId: string;
    outcomeName: string;
    totalEvents: number;
    billableEvents: number;
    excludedEvents: number;
    acceptanceRate: number;
    totalRevenue: number;
    totalUnits: number;
    invoiceCount: number;
    disputeCount: number;
    disputeAmount: number;
  }>;
  disputes: {
    total: number;
    open: number;
    resolved: number;
    rejected: number;
    totalAmount: number;
    categories: Record<string, number>;
  };
}

interface InvoiceLineItems {
  invoice: Invoice;
  lineItems: Array<{
    id: string;
    outcomeId: string;
    agentId: string | null;
    invoiceId: string | null;
    traceId: string | null;
    type: string;
    billable: boolean | null;
    excludeReason: string | null;
    unitCount: number | null;
    unitValue: number | null;
    createdAt: string | null;
    agentName: string | null;
    traceStatus: string | null;
    traceLatencyMs: number | null;
  }>;
}

interface MarginAnalysis {
  summary: {
    totalRevenue: number;
    totalCost: number;
    overallMargin: number;
    overallMarginPercent: number;
    outcomeCount: number;
    alertCount: number;
  };
  outcomes: Array<{
    outcomeId: string;
    outcomeName: string;
    revenue: number;
    costToServe: number;
    margin: number;
    marginPercent: number;
    traceCount: number;
    costBreakdown: {
      llmCost: number;
      toolCost: number;
      infraCost: number;
    };
    trend: Array<{
      month: string;
      revenue: number;
      cost: number;
      margin: number;
      marginPercent: number;
    }>;
    alerts: Array<{ type: string; severity: string; message: string }>;
  }>;
  monthlyMargin: Array<{
    month: string;
    revenue: number;
    cost: number;
    margin: number;
    marginPercent: number;
  }>;
  alerts: Array<{ type: string; severity: string; message: string }>;
}

interface MarginAlerts {
  alerts: Array<{
    outcomeId: string;
    outcomeName: string;
    type: string;
    severity: string;
    message: string;
    currentMargin: number;
    recommendedAction: string;
  }>;
  totalAlerts: number;
  criticalCount: number;
  warningCount: number;
}

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export default function Billing() {
  const [activeTab, setActiveTab] = useState("metering");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [disputeFilter, setDisputeFilter] = useState("all");
  const { toast } = useToast();
  const billingPerm = usePermission("billing_invoices");
  const { setLockedEnv } = useEnvironment();

  useEffect(() => {
    setLockedEnv("production");
    return () => setLockedEnv(null);
  }, [setLockedEnv]);


  const { data: dashboard, isLoading: dashboardLoading } = useQuery<MeteringDashboard>({
    queryKey: ["/api/billing/metering-dashboard"],
  });

  const { data: allInvoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: disputes } = useQuery<BillingDispute[]>({
    queryKey: ["/api/billing/disputes"],
  });

  const { data: invoiceDetail, isLoading: detailLoading } = useQuery<InvoiceLineItems>({
    queryKey: ["/api/invoices", selectedInvoiceId, "line-items"],
    enabled: !!selectedInvoiceId,
  });

  const [marginPeriod, setMarginPeriod] = useState("90d");

  const { data: marginData, isLoading: marginLoading } = useQuery<MarginAnalysis>({
    queryKey: [`/api/billing/margin-analysis?period=${marginPeriod}`],
    enabled: activeTab === "margins",
  });

  const { data: marginAlerts } = useQuery<MarginAlerts>({
    queryKey: [`/api/billing/margin-alerts?period=${marginPeriod}`],
    enabled: activeTab === "margins",
  });

  const isLoading = dashboardLoading || invoicesLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
          <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  const invoices = allInvoices || [];
  const d = dashboard;

  if (selectedInvoiceId) {
    return (
      <InvoiceDetailView
        invoiceId={selectedInvoiceId}
        detail={invoiceDetail}
        isLoading={detailLoading}
        onBack={() => setSelectedInvoiceId(null)}
      />
    );
  }

  const filteredDisputes = (disputes || []).filter(disp => {
    if (disputeFilter === "all") return true;
    return disp.status === disputeFilter;
  });

  const excludeReasonData = d ? Object.entries(d.excludeReasons).map(([reason, count]) => ({
    name: reason.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    value: count,
  })) : [];

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-billing">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Billing Engine</h1>
          <p className="text-sm text-muted-foreground">
            Outcome-based metering, invoicing, and revenue analytics
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {billingPerm && (
            <Button
              variant="outline"
              size="sm"
              data-testid="button-export-usage"
              onClick={() => {
                window.open("/api/billing/usage-export", "_blank");
                toast({ title: "Usage export started", description: "CSV download initiated" });
              }}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export Usage
            </Button>
          )}

        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={`$${(d?.summary.totalRevenue || 0).toLocaleString()}`}
          icon={DollarSign}
          trend={d && d.summary.revenueGrowth > 0 ? "up" : "down"}
          trendValue={`${d?.summary.revenueGrowth || 0}%`}
          variant="success"
          testId="stat-total-revenue"
        />
        <StatCard
          title="Units Delivered"
          value={(d?.summary.totalUnitsDelivered || 0).toLocaleString()}
          icon={BarChart3}
          variant="default"
          testId="stat-units-delivered"
        />
        <StatCard
          title="Acceptance Rate"
          value={`${d?.summary.acceptanceRate || 0}%`}
          icon={CheckCircle}
          variant={d && d.summary.acceptanceRate >= 90 ? "success" : "warning"}
          testId="stat-acceptance-rate"
        />
        <StatCard
          title="Open Disputes"
          value={d?.disputes.open || 0}
          icon={AlertTriangle}
          variant={d && d.disputes.open > 0 ? "warning" : "default"}
          testId="stat-open-disputes"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="metering" data-testid="tab-metering">Outcome Metering</TabsTrigger>
          <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
          <TabsTrigger value="disputes" data-testid="tab-disputes">Disputes</TabsTrigger>
          <TabsTrigger value="margins" data-testid="tab-margins">Margins</TabsTrigger>
        </TabsList>

        <TabsContent value="metering" className="mt-0">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-sm font-medium">Revenue Projection</CardTitle>
                    <Badge variant="outline" className="text-[10px]" data-testid="badge-projected-annual">
                      Projected: ${(d?.summary.projectedAnnualRevenue || 0).toLocaleString()}/yr
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-56" data-testid="chart-revenue-projection">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={d?.monthlyRevenue || []}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                        <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                          formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
                        />
                        <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Billable vs Excluded Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <div className="h-48 w-48 flex-shrink-0" data-testid="chart-billable-excluded-donut">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPie>
                          <Pie
                            data={[
                              { name: "Billable", value: d?.summary.billableUnits || 0 },
                              { name: "Excluded", value: d?.summary.excludedUnits || 0 },
                            ]}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            innerRadius={45}
                            paddingAngle={3}
                          >
                            <Cell fill="hsl(var(--chart-1))" />
                            <Cell fill="hsl(var(--chart-4))" />
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                        </RechartsPie>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-col gap-3 flex-1">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(var(--chart-1))" }} />
                          <span className="text-xs text-muted-foreground">Billable Units</span>
                        </div>
                        <span className="text-2xl font-bold" data-testid="text-billable-units">{(d?.summary.billableUnits || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(var(--chart-4))" }} />
                          <span className="text-xs text-muted-foreground">Excluded Units</span>
                        </div>
                        <span className="text-2xl font-bold text-muted-foreground" data-testid="text-excluded-units">{(d?.summary.excludedUnits || 0).toLocaleString()}</span>
                      </div>
                      <Progress value={d?.summary.acceptanceRate || 0} className="h-2" data-testid="progress-acceptance" />
                      <span className="text-[10px] text-muted-foreground">{d?.summary.acceptanceRate || 0}% acceptance rate</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Units Delivered by Outcome</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64" data-testid="chart-units-by-outcome">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d?.outcomeMetering.map(om => ({
                      name: om.outcomeName.length > 20 ? om.outcomeName.slice(0, 20) + "..." : om.outcomeName,
                      billable: om.billableEvents,
                      excluded: om.excludedEvents,
                    })) || []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} className="fill-muted-foreground" interval={0} angle={-15} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="billable" stackId="a" fill="hsl(var(--chart-1))" radius={[0, 0, 0, 0]} name="Billable" />
                      <Bar dataKey="excluded" stackId="a" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} name="Excluded" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Revenue Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-44" data-testid="chart-monthly-revenue-bar">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d?.monthlyRevenue || []}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" tick={{ fontSize: 9 }} className="fill-muted-foreground" />
                        <YAxis tick={{ fontSize: 9 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]} />
                        <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Exclusion Reasons</CardTitle>
                </CardHeader>
                <CardContent>
                  {excludeReasonData.length > 0 ? (
                    <div className="h-44" data-testid="chart-exclusion-reasons">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPie>
                          <Pie
                            data={excludeReasonData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={55}
                            innerRadius={30}
                            paddingAngle={2}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {excludeReasonData.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                        </RechartsPie>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">No exclusions recorded</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Dispute Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded-md bg-muted/50 text-center">
                        <span className="text-lg font-semibold" data-testid="text-disputes-open">{d?.disputes.open || 0}</span>
                        <span className="text-[10px] text-muted-foreground block">Open</span>
                      </div>
                      <div className="p-2 rounded-md bg-muted/50 text-center">
                        <span className="text-lg font-semibold" data-testid="text-disputes-resolved">{d?.disputes.resolved || 0}</span>
                        <span className="text-[10px] text-muted-foreground block">Resolved</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Total disputed</span>
                      <span className="font-medium">${(d?.disputes.totalAmount || 0).toLocaleString()}</span>
                    </div>
                    {d?.disputes.categories && Object.entries(d.disputes.categories).map(([cat, count]) => (
                      <div key={cat} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-muted-foreground capitalize">{cat.replace(/_/g, " ")}</span>
                        <Badge variant="secondary" className="text-[9px]">{count as number}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Outcome Metering Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="text-right">Total Events</TableHead>
                      <TableHead className="text-right">Billable</TableHead>
                      <TableHead className="text-right">Excluded</TableHead>
                      <TableHead className="text-right">Acceptance</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Disputes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d?.outcomeMetering.map((om) => (
                      <TableRow key={om.outcomeId} data-testid={`metering-row-${om.outcomeId}`}>
                        <TableCell>
                          <span className="text-xs font-medium">{om.outcomeName}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm">{om.totalEvents.toLocaleString()}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm text-emerald-600 dark:text-emerald-400">{om.billableEvents.toLocaleString()}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm text-muted-foreground">{om.excludedEvents.toLocaleString()}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={om.acceptanceRate >= 0.9 ? "default" : "secondary"} className="text-[10px]">
                            {Math.round(om.acceptanceRate * 100)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-semibold">${om.totalRevenue.toLocaleString()}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          {om.disputeCount > 0 ? (
                            <Badge variant="destructive" className="text-[10px]">{om.disputeCount}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {(!d?.outcomeMetering || d.outcomeMetering.length === 0) && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <PieChart className="w-10 h-10 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">No metering data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-0">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Total Units</TableHead>
                    <TableHead className="text-right">Billable</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`} className="cursor-pointer" onClick={() => setSelectedInvoiceId(inv.id)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium font-mono">
                            INV-{inv.id.slice(0, 8).toUpperCase()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{inv.outcomeName || "\u2014"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {inv.periodStart ? new Date(inv.periodStart).toLocaleDateString() : "\u2014"} \u2014{" "}
                          {inv.periodEnd ? new Date(inv.periodEnd).toLocaleDateString() : "\u2014"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-medium">{inv.totalUnits?.toLocaleString()}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm text-emerald-600 dark:text-emerald-400">{(inv.billableUnits || inv.totalUnits || 0).toLocaleString()}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm">${inv.unitPrice?.toFixed(2)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-semibold">${inv.amount?.toLocaleString()}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {invoices.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <CreditCard className="w-10 h-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No invoices yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="disputes" className="mt-0">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <Select value={disputeFilter} onValueChange={setDisputeFilter}>
                  <SelectTrigger className="w-32" data-testid="select-dispute-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Badge variant="outline" className="text-[10px]">{filteredDisputes.length} disputes</Badge>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dispute ID</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Filed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDisputes.map((disp) => (
                      <TableRow key={disp.id} data-testid={`row-dispute-${disp.id}`}>
                        <TableCell>
                          <span className="text-xs font-mono font-medium">DSP-{disp.id.slice(0, 8).toUpperCase()}</span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs font-mono h-auto p-0"
                            onClick={() => setSelectedInvoiceId(disp.invoiceId)}
                            data-testid={`link-dispute-invoice-${disp.id}`}
                          >
                            INV-{disp.invoiceId.slice(0, 8).toUpperCase()}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] capitalize">{disp.category.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground line-clamp-1">{disp.reason}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-medium">${(disp.amount || 0).toFixed(2)}</span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={disp.status === "open" ? "destructive" : disp.status === "resolved" ? "default" : "secondary"}
                            className="text-[10px]"
                            data-testid={`badge-dispute-status-${disp.id}`}
                          >
                            {disp.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-[11px] text-muted-foreground">
                            {disp.createdAt ? new Date(disp.createdAt).toLocaleDateString() : "\u2014"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredDisputes.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <ShieldAlert className="w-10 h-10 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">No disputes found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="margins" className="mt-0">
          {marginLoading ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
                ))}
              </div>
              <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
            </div>
          ) : (
            <MarginsTabContent
              marginData={marginData}
              marginAlerts={marginAlerts}
              marginPeriod={marginPeriod}
              setMarginPeriod={setMarginPeriod}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MarginsTabContent({
  marginData,
  marginAlerts,
  marginPeriod,
  setMarginPeriod,
}: {
  marginData: MarginAnalysis | undefined;
  marginAlerts: MarginAlerts | undefined;
  marginPeriod: string;
  setMarginPeriod: (v: string) => void;
}) {
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);

  const summary = marginData?.summary;
  const outcomes = marginData?.outcomes || [];
  const monthlyMargin = marginData?.monthlyMargin || [];
  const alerts = marginAlerts?.alerts || [];

  const momTrend = useMemo(() => {
    if (monthlyMargin.length < 2) return null;
    const prev = monthlyMargin[monthlyMargin.length - 2];
    const curr = monthlyMargin[monthlyMargin.length - 1];
    if (!prev || !curr) return null;
    const diff = curr.marginPercent - prev.marginPercent;
    return { diff: Math.round(diff * 10) / 10, direction: diff >= 0 ? "up" : "down" as const };
  }, [monthlyMargin]);

  const selectedOutcomeData = outcomes.find(o => o.outcomeId === selectedOutcome);

  const costBreakdownData = useMemo(() => {
    if (selectedOutcomeData) {
      const cb = selectedOutcomeData.costBreakdown;
      return [
        { name: "LLM Tokens", value: cb.llmCost, icon: Cpu },
        { name: "Tool Calls", value: cb.toolCost, icon: Wrench },
        { name: "Infrastructure", value: cb.infraCost, icon: Server },
      ];
    }
    const totals = outcomes.reduce(
      (acc, o) => ({
        llm: acc.llm + o.costBreakdown.llmCost,
        tool: acc.tool + o.costBreakdown.toolCost,
        infra: acc.infra + o.costBreakdown.infraCost,
      }),
      { llm: 0, tool: 0, infra: 0 }
    );
    return [
      { name: "LLM Tokens", value: Math.round(totals.llm * 100) / 100, icon: Cpu },
      { name: "Tool Calls", value: Math.round(totals.tool * 100) / 100, icon: Wrench },
      { name: "Infrastructure", value: Math.round(totals.infra * 100) / 100, icon: Server },
    ];
  }, [selectedOutcomeData, outcomes]);

  const costTotal = costBreakdownData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Margin analysis across all outcomes</span>
        <Select value={marginPeriod} onValueChange={setMarginPeriod}>
          <SelectTrigger className="w-28" data-testid="select-margin-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30d">Last 30d</SelectItem>
            <SelectItem value="90d">Last 90d</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={`$${(summary?.totalRevenue || 0).toLocaleString()}`}
          icon={DollarSign}
          variant="success"
          testId="stat-margin-revenue"
        />
        <StatCard
          title="Cost-to-Serve"
          value={`$${(summary?.totalCost || 0).toLocaleString()}`}
          icon={CreditCard}
          variant="default"
          testId="stat-margin-cost"
        />
        <StatCard
          title="Overall Margin"
          value={`${summary?.overallMarginPercent || 0}%`}
          icon={TrendingUp}
          variant={summary && summary.overallMarginPercent >= 20 ? "success" : "warning"}
          testId="stat-margin-overall"
        />
        <Card data-testid="stat-margin-mom">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">MoM Trend</span>
              {momTrend ? (
                momTrend.direction === "up"
                  ? <TrendingUp className="w-4 h-4 text-emerald-500" />
                  : <TrendingDown className="w-4 h-4 text-red-500" />
              ) : (
                <Activity className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <span className="text-2xl font-bold" data-testid="text-margin-mom-value">
              {momTrend ? `${momTrend.diff > 0 ? "+" : ""}${momTrend.diff}%` : "N/A"}
            </span>
            <span className="text-[10px] text-muted-foreground">margin change vs. prior month</span>
          </CardContent>
        </Card>
      </div>

      {alerts.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="section-margin-alerts">
          {alerts.map((alert, i) => (
            <Card key={i} data-testid={`card-margin-alert-${i}`}>
              <CardContent className="p-3 flex items-start gap-3">
                {alert.severity === "critical" ? (
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">{alert.outcomeName}</span>
                    <Badge
                      variant={alert.severity === "critical" ? "destructive" : "secondary"}
                      className="text-[9px]"
                    >
                      {alert.severity}
                    </Badge>
                    <Badge variant="outline" className="text-[9px]">
                      {alert.currentMargin}% margin
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{alert.message}</span>
                  <span className="text-[11px] text-muted-foreground">{alert.recommendedAction}</span>
                  <Link href="/improvements" data-testid={`link-optimize-${alert.outcomeId}`}>
                    <Button variant="outline" size="sm" className="mt-1 w-fit">
                      <Zap className="w-3 h-3 mr-1" /> View Optimization Patches
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monthly Margin Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56" data-testid="chart-monthly-margin-trend">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyMargin}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    formatter={(value: number, name: string) => [
                      `$${value.toLocaleString()}`,
                      name === "revenue" ? "Revenue" : name === "cost" ? "Cost" : "Margin",
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} name="Revenue" />
                  <Line type="monotone" dataKey="cost" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={{ r: 3 }} name="Cost" />
                  <Area type="monotone" dataKey="margin" fill="hsl(var(--chart-2))" fillOpacity={0.15} stroke="hsl(var(--chart-2))" strokeWidth={1.5} name="Margin" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-medium">Cost Breakdown</CardTitle>
              {selectedOutcomeData && (
                <Badge variant="outline" className="text-[10px]">{selectedOutcomeData.outcomeName}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="h-48 w-48 flex-shrink-0" data-testid="chart-cost-breakdown-donut">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={costBreakdownData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      innerRadius={45}
                      paddingAngle={3}
                    >
                      <Cell fill="hsl(var(--chart-1))" />
                      <Cell fill="hsl(var(--chart-3))" />
                      <Cell fill="hsl(var(--chart-5))" />
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} formatter={(value: number) => [`$${value.toFixed(2)}`, ""]} />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-3 flex-1">
                {costBreakdownData.map((item, i) => {
                  const pct = costTotal > 0 ? ((item.value / costTotal) * 100).toFixed(0) : "0";
                  const colors = ["hsl(var(--chart-1))", "hsl(var(--chart-3))", "hsl(var(--chart-5))"];
                  return (
                    <div key={item.name} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: colors[i] }} />
                        <item.icon className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{item.name}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{pct}%</span>
                      </div>
                      <span className="text-sm font-semibold" data-testid={`text-cost-${item.name.toLowerCase().replace(/\s/g, "-")}`}>${item.value.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-medium">Per-Outcome Margin Analysis</CardTitle>
            <Badge variant="outline" className="text-[10px]">{outcomes.length} outcomes</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Cost-to-Serve</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
                <TableHead className="text-center">Trend</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outcomes.map((o) => {
                const trendData = o.trend.filter(t => t.revenue > 0 || t.cost > 0);
                return (
                  <TableRow
                    key={o.outcomeId}
                    data-testid={`row-margin-${o.outcomeId}`}
                    className={selectedOutcome === o.outcomeId ? "bg-muted/40" : "cursor-pointer"}
                    onClick={() => setSelectedOutcome(selectedOutcome === o.outcomeId ? null : o.outcomeId)}
                  >
                    <TableCell>
                      <span className="text-xs font-medium">{o.outcomeName}</span>
                      <span className="text-[10px] text-muted-foreground block">{o.traceCount.toLocaleString()} traces</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-semibold">${o.revenue.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm text-muted-foreground">${o.costToServe.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`text-sm font-medium ${o.margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {o.margin >= 0 ? "$" : "-$"}{Math.abs(o.margin).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={o.marginPercent >= 20 ? "default" : o.marginPercent >= 0 ? "secondary" : "destructive"}
                        className="text-[10px]"
                        data-testid={`badge-margin-pct-${o.outcomeId}`}
                      >
                        {o.marginPercent}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {trendData.length >= 2 ? (
                        <div className="w-16 h-6 inline-block" data-testid={`sparkline-${o.outcomeId}`}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData}>
                              <Line
                                type="monotone"
                                dataKey="marginPercent"
                                stroke={o.marginPercent >= 20 ? "hsl(var(--chart-2))" : "hsl(var(--chart-4))"}
                                strokeWidth={1.5}
                                dot={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {o.alerts.length > 0 ? (
                        <Badge variant="destructive" className="text-[9px]">
                          <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                          {o.alerts.length}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px]">
                          <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                          OK
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {outcomes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <BarChart3 className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No margin data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedOutcomeData && (
        <Card data-testid={`card-outcome-detail-${selectedOutcomeData.outcomeId}`}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-medium">{selectedOutcomeData.outcomeName} - Margin Trend</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setSelectedOutcome(null)} data-testid="button-close-outcome-detail">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-56" data-testid="chart-outcome-margin-trend">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={selectedOutcomeData.trend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    formatter={(value: number, name: string) => [
                      `$${value.toLocaleString()}`,
                      name === "revenue" ? "Revenue" : name === "cost" ? "Cost" : "Margin",
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="revenue" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Revenue" />
                  <Bar dataKey="cost" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} name="Cost" />
                  <Line type="monotone" dataKey="margin" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} name="Margin" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const PII_PATTERNS = [/email/i, /name/i, /phone/i, /address/i, /ssn/i, /actor/i, /user/i, /vendor/i];
const FINANCIAL_PATTERNS = [/amount/i, /price/i, /cost/i, /revenue/i, /payment/i, /invoice/i, /balance/i, /fee/i];

function redactValue(key: string, value: unknown, level: "pii" | "financial" | "full"): unknown {
  if (value === null || value === undefined) return value;
  const keyStr = String(key);
  const isPii = PII_PATTERNS.some(p => p.test(keyStr));
  const isFinancial = FINANCIAL_PATTERNS.some(p => p.test(keyStr));

  if (level === "full" && (isPii || isFinancial)) return "[REDACTED]";
  if (level === "pii" && isPii) return "[PII REDACTED]";
  if (level === "financial" && isFinancial) return "[FINANCIAL REDACTED]";
  return value;
}

function redactObject(obj: unknown, level: "pii" | "financial" | "full"): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item, i) => redactObject(item, level));
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        result[key] = redactObject(value, level);
      } else {
        result[key] = redactValue(key, value, level);
      }
    }
    return result;
  }
  return obj;
}

function TraceDrawer({ traceId, open, onOpenChange }: { traceId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [redactionLevel, setRedactionLevel] = useState<"pii" | "financial" | "full">("pii");
  const { data: trace, isLoading } = useQuery<RunTrace>({
    queryKey: ["/api/traces", traceId],
    enabled: !!traceId && open,
  });

  const redactedInputSummary = useMemo(() => trace?.inputSummary ? String(redactValue("inputSummary", trace.inputSummary, redactionLevel)) : null, [trace?.inputSummary, redactionLevel]);
  const redactedOutputSummary = useMemo(() => trace?.outputSummary ? String(redactValue("outputSummary", trace.outputSummary, redactionLevel)) : null, [trace?.outputSummary, redactionLevel]);
  const redactedPromptInputs = useMemo(() => trace?.promptInputs ? redactObject(trace.promptInputs, redactionLevel) as object : null, [trace?.promptInputs, redactionLevel]);
  const redactedToolCalls = useMemo(() => trace?.toolCalls ? redactObject(trace.toolCalls, redactionLevel) as object : null, [trace?.toolCalls, redactionLevel]);
  const redactedDecisions = useMemo(() => trace?.decisions ? redactObject(trace.decisions, redactionLevel) as object : null, [trace?.decisions, redactionLevel]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="dialog-trace-drilldown">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <DialogTitle className="font-mono text-base">Trace {traceId.slice(0, 12)}</DialogTitle>
              {trace && <StatusBadge status={trace.status} />}
            </div>
            <div className="flex items-center gap-2">
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <Select value={redactionLevel} onValueChange={(v) => setRedactionLevel(v as "pii" | "financial" | "full")}>
                <SelectTrigger className="w-32" data-testid="select-redaction-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pii" data-testid="option-redact-pii">Redact PII</SelectItem>
                  <SelectItem value="financial" data-testid="option-redact-financial">Redact Financial</SelectItem>
                  <SelectItem value="full" data-testid="option-redact-full">Full Redaction</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !trace ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Activity className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Trace not found</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground uppercase">Latency</span>
                <span className="text-sm font-medium" data-testid="text-trace-latency">{trace.latencyMs}ms</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground uppercase">Cost</span>
                <span className="text-sm font-medium" data-testid="text-trace-cost">${trace.costUsd?.toFixed(4)}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground uppercase">Model</span>
                <span className="text-sm font-medium" data-testid="text-trace-model">{trace.modelId || "\u2014"}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground uppercase">Environment</span>
                <Badge variant="outline" className="text-[10px] w-fit" data-testid="badge-trace-env">{trace.environment}</Badge>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Input Summary (Redacted)</span>
              <p className="text-sm bg-muted/40 p-3 rounded-md" data-testid="text-trace-input">{redactedInputSummary || "\u2014"}</p>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Output Summary (Redacted)</span>
              <p className="text-sm bg-muted/40 p-3 rounded-md" data-testid="text-trace-output">{redactedOutputSummary || "\u2014"}</p>
            </div>

            {redactedPromptInputs != null && (
              <CollapsibleSection title="Prompt Inputs (Redacted)" testId="section-prompt-inputs">
                <pre className="text-[11px] bg-muted/40 p-3 rounded-md overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {JSON.stringify(redactedPromptInputs as object, null, 2)}
                </pre>
              </CollapsibleSection>
            )}

            {redactedToolCalls != null && (
              <CollapsibleSection title="Tool Calls (Redacted)" testId="section-tool-calls">
                <pre className="text-[11px] bg-muted/40 p-3 rounded-md overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {JSON.stringify(redactedToolCalls as object, null, 2)}
                </pre>
              </CollapsibleSection>
            )}

            {redactedDecisions != null && (
              <CollapsibleSection title="Decisions (Redacted)" testId="section-decisions">
                <pre className="text-[11px] bg-muted/40 p-3 rounded-md overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {JSON.stringify(redactedDecisions as object, null, 2)}
                </pre>
              </CollapsibleSection>
            )}

            {trace.policyChecks != null && (
              <CollapsibleSection title="Policy Checks" testId="section-policy-checks">
                <pre className="text-[11px] bg-muted/40 p-3 rounded-md overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {JSON.stringify(trace.policyChecks as object, null, 2)}
                </pre>
              </CollapsibleSection>
            )}

            {trace.tokenUsage != null && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Token Usage</span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {Object.entries(trace.tokenUsage as Record<string, number>).map(([key, val]) => (
                    <div key={key} className="p-2 rounded-md bg-muted/40">
                      <span className="text-lg font-semibold">{typeof val === "number" ? val.toLocaleString() : String(val)}</span>
                      <span className="text-[10px] text-muted-foreground block capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CollapsibleSection({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="justify-start text-xs font-medium text-muted-foreground gap-1 px-0"
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-toggle-${testId}`}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {title}
      </Button>
      {expanded && children}
    </div>
  );
}

function InvoiceDetailView({
  invoiceId,
  detail,
  isLoading,
  onBack,
}: {
  invoiceId: string;
  detail: InvoiceLineItems | undefined;
  isLoading: boolean;
  onBack: () => void;
}) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [expandedOutcome, setExpandedOutcome] = useState<string | null>(null);

  if (isLoading || !detail) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-invoices">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  const inv = detail.invoice;
  const billableItems = detail.lineItems.filter(li => li.billable);
  const excludedItems = detail.lineItems.filter(li => !li.billable);

  const outcomeSummary = detail.lineItems.reduce<Record<string, { outcomeId: string; type: string; billableUnits: number; excludedUnits: number; totalValue: number; events: typeof detail.lineItems }>>((acc, li) => {
    const key = li.type || "unknown";
    if (!acc[key]) {
      acc[key] = { outcomeId: li.outcomeId || "", type: key, billableUnits: 0, excludedUnits: 0, totalValue: 0, events: [] };
    }
    const units = li.unitCount || 1;
    if (li.billable) {
      acc[key].billableUnits += units;
    } else {
      acc[key].excludedUnits += units;
    }
    acc[key].totalValue += (li.unitValue || 0) * units;
    acc[key].events.push(li);
    return acc;
  }, {});

  const summaryRows = Object.values(outcomeSummary);

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="invoice-detail-view">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-invoices">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight font-mono">INV-{inv.id.slice(0, 8).toUpperCase()}</h1>
              <StatusBadge status={inv.status} />
            </div>
            <p className="text-xs text-muted-foreground">{inv.outcomeName}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Period</span>
            <span className="text-sm font-medium">
              {inv.periodStart ? new Date(inv.periodStart).toLocaleDateString() : "\u2014"} \u2014{" "}
              {inv.periodEnd ? new Date(inv.periodEnd).toLocaleDateString() : "\u2014"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Amount</span>
            <span className="text-lg font-bold">${inv.amount?.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground">{inv.totalUnits?.toLocaleString()} units @ ${inv.unitPrice?.toFixed(2)}/unit</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Billable / Excluded</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{billableItems.length}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-lg font-bold text-muted-foreground">{excludedItems.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Line Items</span>
            <span className="text-lg font-bold">{detail.lineItems.length}</span>
            <span className="text-[10px] text-muted-foreground">outcome events in this invoice</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-medium">Invoice Line Items</CardTitle>
            <Badge variant="outline" className="text-[10px]">
              <Layers className="w-3 h-3 mr-1" /> {summaryRows.length} outcome types
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Outcome / Type</TableHead>
                <TableHead className="text-right">Billable Units</TableHead>
                <TableHead className="text-right">Excluded Units</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryRows.map((row) => (
                <>
                  <TableRow
                    key={`summary-${row.type}`}
                    className="cursor-pointer"
                    onClick={() => setExpandedOutcome(expandedOutcome === row.type ? null : row.type)}
                    data-testid={`row-outcome-summary-${row.type}`}
                  >
                    <TableCell>
                      {expandedOutcome === row.type ? (
                        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">{row.type}</Badge>
                        <span className="text-[10px] text-muted-foreground">{row.events.length} events</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{row.billableUnits.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm text-muted-foreground">{row.excludedUnits.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm">${inv.unitPrice?.toFixed(2)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-semibold">${row.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </TableCell>
                  </TableRow>
                  {expandedOutcome === row.type && row.events.map((li) => (
                    <TableRow key={li.id} className="bg-muted/30" data-testid={`row-line-item-${li.id}`}>
                      <TableCell></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 pl-4">
                          <span className="text-[11px] font-mono text-muted-foreground">{li.id.slice(0, 8)}</span>
                          <span className="text-[11px]">{li.agentName || "\u2014"}</span>
                          {li.billable ? (
                            <Badge variant="default" className="text-[9px]">
                              <CheckCircle className="w-2 h-2 mr-0.5" /> Billable
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[9px]">
                              <XCircle className="w-2 h-2 mr-0.5" /> {li.excludeReason || "Excluded"}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs">{li.billable ? (li.unitCount || 1) : "\u2014"}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs">{!li.billable ? (li.unitCount || 1) : "\u2014"}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs">${inv.unitPrice?.toFixed(2)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs">{li.unitValue != null ? `$${((li.unitValue) * (li.unitCount || 1)).toFixed(2)}` : "\u2014"}</span>
                          {li.traceId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-[11px]"
                              onClick={(e) => { e.stopPropagation(); setSelectedTraceId(li.traceId); }}
                              data-testid={`button-trace-${li.traceId}`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ))}
              <TableRow className="font-semibold border-t-2">
                <TableCell></TableCell>
                <TableCell>
                  <span className="text-xs">Total</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm text-emerald-600 dark:text-emerald-400">{billableItems.reduce((s, li) => s + (li.unitCount || 1), 0).toLocaleString()}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm text-muted-foreground">{excludedItems.reduce((s, li) => s + (li.unitCount || 1), 0).toLocaleString()}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm">${inv.unitPrice?.toFixed(2)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm">${inv.amount?.toLocaleString()}</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {detail.lineItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <FileText className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No line items linked to this invoice</p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTraceId && (
        <TraceDrawer
          traceId={selectedTraceId}
          open={!!selectedTraceId}
          onOpenChange={(open) => { if (!open) setSelectedTraceId(null); }}
        />
      )}
    </div>
  );
}
