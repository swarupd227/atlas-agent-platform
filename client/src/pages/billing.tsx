import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
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
  PieChart,
  ArrowLeft,
  ExternalLink,
  ShieldAlert,
  XCircle,
  Filter,
  ChevronRight,
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
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { usePermission } from "@/components/role-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Invoice, BillingDispute } from "@shared/schema";
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

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export default function Billing() {
  const [activeTab, setActiveTab] = useState("metering");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [disputeFilter, setDisputeFilter] = useState("all");
  const { toast } = useToast();
  const billingPerm = usePermission("billing_invoices");

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
                  <CardTitle className="text-sm font-medium">Units Delivered vs Billed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56" data-testid="chart-units-delivered">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d?.monthlyRevenue || []}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                        <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                        />
                        <Bar dataKey="units" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Acceptance Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-3xl font-bold" data-testid="text-acceptance-rate">{d?.summary.acceptanceRate || 0}%</span>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[10px] text-muted-foreground">{d?.summary.billableUnits.toLocaleString()} billable</span>
                        <span className="text-[10px] text-muted-foreground">{d?.summary.excludedUnits.toLocaleString()} excluded</span>
                      </div>
                    </div>
                    <Progress value={d?.summary.acceptanceRate || 0} className="h-2" data-testid="progress-acceptance" />
                    <div className="text-[10px] text-muted-foreground">
                      {d?.summary.billableUnits.toLocaleString()} of {d?.summary.totalUnitsDelivered.toLocaleString()} events accepted for billing
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Exclusion Reasons</CardTitle>
                </CardHeader>
                <CardContent>
                  {excludeReasonData.length > 0 ? (
                    <div className="h-40" data-testid="chart-exclusion-reasons">
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
                    <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No exclusions recorded</div>
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
      </Tabs>
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
          <CardTitle className="text-sm font-medium">Line Items (Outcome Events)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Billable</TableHead>
                <TableHead>Exclude Reason</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Trace</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.lineItems.map((li) => (
                <TableRow key={li.id} data-testid={`row-line-item-${li.id}`}>
                  <TableCell>
                    <span className="text-[11px] font-mono">{li.id.slice(0, 8)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">{li.agentName || "\u2014"}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">{li.type}</Badge>
                  </TableCell>
                  <TableCell>
                    {li.billable ? (
                      <Badge variant="default" className="text-[10px]">
                        <CheckCircle className="w-2.5 h-2.5 mr-0.5" /> Yes
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">
                        <XCircle className="w-2.5 h-2.5 mr-0.5" /> No
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-[11px] text-muted-foreground">{li.excludeReason || "\u2014"}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm">{li.unitCount || 1}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm">{li.unitValue != null ? `$${li.unitValue.toFixed(2)}` : "\u2014"}</span>
                  </TableCell>
                  <TableCell>
                    {li.traceId ? (
                      <Button variant="ghost" size="sm" className="text-[11px] h-auto p-0 font-mono" data-testid={`link-trace-${li.traceId}`}>
                        {li.traceId.slice(0, 8)} <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">\u2014</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-[11px] text-muted-foreground">
                      {li.createdAt ? new Date(li.createdAt).toLocaleDateString() : "\u2014"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
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
    </div>
  );
}
