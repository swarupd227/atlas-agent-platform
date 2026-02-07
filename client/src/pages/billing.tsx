import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  FileText,
  Download,
  BarChart3,
  CheckCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import type { Invoice, OutcomeContract } from "@shared/schema";

export default function Billing() {
  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });
  const { data: outcomes } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const allInvoices = invoices || [];
  const totalRevenue = allInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const paidInvoices = allInvoices.filter((inv) => inv.status === "paid");
  const pendingInvoices = allInvoices.filter((inv) => inv.status === "pending");
  const totalUnits = allInvoices.reduce((sum, inv) => sum + (inv.totalUnits || 0), 0);

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-billing">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Outcome-based metering, invoices, and revenue tracking
          </p>
        </div>
        <Button variant="outline" size="sm" data-testid="button-export-billing">
          <Download className="w-3.5 h-3.5 mr-1.5" /> Export
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value={`$${totalRevenue.toLocaleString()}`} icon={DollarSign} trend="up" trendValue="15.2%" variant="success" testId="stat-total-revenue" />
        <StatCard title="Total Units" value={totalUnits.toLocaleString()} icon={BarChart3} variant="default" testId="stat-total-units" />
        <StatCard title="Paid Invoices" value={paidInvoices.length} icon={CheckCircle} variant="success" testId="stat-paid-invoices" />
        <StatCard title="Pending" value={pendingInvoices.length} icon={Clock} variant="warning" testId="stat-pending-invoices" />
      </div>

      <Tabs defaultValue="invoices" className="flex flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
          <TabsTrigger value="metering" data-testid="tab-metering">Metering</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-0">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allInvoices.map((inv) => (
                    <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium font-mono">
                            INV-{inv.id.slice(0, 8).toUpperCase()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{inv.outcomeName || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {inv.periodStart ? new Date(inv.periodStart).toLocaleDateString() : "—"} —{" "}
                          {inv.periodEnd ? new Date(inv.periodEnd).toLocaleDateString() : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-medium">{inv.totalUnits?.toLocaleString()}</span>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {allInvoices.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <CreditCard className="w-10 h-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No invoices yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metering" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {outcomes?.map((outcome) => {
              const outcomeInvoices = allInvoices.filter((inv) => inv.outcomeId === outcome.id);
              const outcomeRevenue = outcomeInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
              const outcomeUnits = outcomeInvoices.reduce((sum, inv) => sum + (inv.totalUnits || 0), 0);
              return (
                <Card key={outcome.id} data-testid={`metering-card-${outcome.id}`}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <BarChart3 className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium">{outcome.name}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">${outcome.pricePerUnit}/unit</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-2.5 rounded-md bg-muted/50 text-center">
                        <span className="text-lg font-semibold">{outcomeUnits.toLocaleString()}</span>
                        <span className="text-[10px] text-muted-foreground block">Units</span>
                      </div>
                      <div className="p-2.5 rounded-md bg-muted/50 text-center">
                        <span className="text-lg font-semibold">${outcomeRevenue.toLocaleString()}</span>
                        <span className="text-[10px] text-muted-foreground block">Revenue</span>
                      </div>
                      <div className="p-2.5 rounded-md bg-muted/50 text-center">
                        <span className="text-lg font-semibold">{outcomeInvoices.length}</span>
                        <span className="text-[10px] text-muted-foreground block">Invoices</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
