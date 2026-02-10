import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Shield,
  Search,
  Download,
  CheckCircle,
  AlertTriangle,
  Filter,
  ChevronLeft,
  ChevronRight,
  Hash,
  X,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditEvent } from "@shared/schema";

function buildFilterParams(filters: {
  search: string;
  actorType: string;
  action: string;
  objectType: string;
  startDate: string;
  endDate: string;
  page: number;
  limit: number;
}) {
  const params = new URLSearchParams();
  if (filters.actorType && filters.actorType !== "all") params.set("actorType", filters.actorType);
  if (filters.action && filters.action !== "all") params.set("action", filters.action);
  if (filters.objectType && filters.objectType !== "all") params.set("objectType", filters.objectType);
  if (filters.search) params.set("search", filters.search);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));
  return params.toString();
}

function getActionBadgeClass(action: string): string {
  const a = action.toLowerCase();
  if (a === "created") return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
  if (a === "deleted" || a === "blocked") return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20";
  if (a === "deployed" || a === "promoted") return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20";
  if (a === "approved") return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
  if (a === "rejected") return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20";
  if (a === "updated") return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20";
  if (a === "rollback") return "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20";
  return "bg-muted text-muted-foreground";
}

function truncate(str: string | null | undefined, max: number): string {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "..." : str;
}

export default function AuditTrail() {
  const [search, setSearch] = useState("");
  const [actorType, setActorType] = useState("all");
  const [action, setAction] = useState("all");
  const [objectType, setObjectType] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [verifyOpen, setVerifyOpen] = useState(false);

  const limit = 50;

  const queryString = buildFilterParams({ search, actorType, action, objectType, startDate, endDate, page, limit });

  const { data, isLoading } = useQuery<{
    events: AuditEvent[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: [`/api/audit-events/filtered?${queryString}`],
  });

  const { data: integrityData, isLoading: integrityLoading, refetch: refetchIntegrity } = useQuery<{
    valid: boolean;
    totalEvents: number;
    verifiedEvents: number;
    brokenAt?: number;
  }>({
    queryKey: ["/api/audit-events/verify-integrity"],
    enabled: false,
  });

  const handleVerifyIntegrity = () => {
    setVerifyOpen(true);
    refetchIntegrity();
  };

  const handleExportCsv = () => {
    const exportParams = new URLSearchParams();
    if (actorType && actorType !== "all") exportParams.set("actorType", actorType);
    if (action && action !== "all") exportParams.set("action", action);
    if (objectType && objectType !== "all") exportParams.set("objectType", objectType);
    if (search) exportParams.set("search", search);
    if (startDate) exportParams.set("startDate", startDate);
    if (endDate) exportParams.set("endDate", endDate);
    const url = `/api/audit-events/export?${exportParams.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-events.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleClearFilters = () => {
    setSearch("");
    setActorType("all");
    setAction("all");
    setObjectType("all");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const hasActiveFilters = search || actorType !== "all" || action !== "all" || objectType !== "all" || startDate || endDate;

  const events = data?.events || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-audit-trail">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-audit-title">Audit Trail</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-audit-subtitle">
            Comprehensive record of all agent actions and platform events
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={handleVerifyIntegrity} data-testid="button-verify-integrity">
            <Shield className="w-4 h-4 mr-1.5" /> Verify Integrity
          </Button>
          <Button variant="outline" onClick={handleExportCsv} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search details..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8"
                data-testid="input-search"
              />
            </div>

            <Select value={actorType} onValueChange={(v) => { setActorType(v); setPage(1); }}>
              <SelectTrigger data-testid="select-actor-type">
                <SelectValue placeholder="Actor Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actors</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="scheduler">Scheduler</SelectItem>
              </SelectContent>
            </Select>

            <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
              <SelectTrigger data-testid="select-action">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="created">Created</SelectItem>
                <SelectItem value="updated">Updated</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="deployed">Deployed</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="promoted">Promoted</SelectItem>
                <SelectItem value="rollback">Rollback</SelectItem>
              </SelectContent>
            </Select>

            <Select value={objectType} onValueChange={(v) => { setObjectType(v); setPage(1); }}>
              <SelectTrigger data-testid="select-object-type">
                <SelectValue placeholder="Object Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Objects</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="policy">Policy</SelectItem>
                <SelectItem value="deployment">Deployment</SelectItem>
                <SelectItem value="outcome">Outcome</SelectItem>
                <SelectItem value="trace">Trace</SelectItem>
                <SelectItem value="approval">Approval</SelectItem>
                <SelectItem value="blueprint">Blueprint</SelectItem>
                <SelectItem value="eval_suite">Eval Suite</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              data-testid="input-start-date"
            />

            <Input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              data-testid="input-end-date"
            />
          </div>

          {hasActiveFilters && (
            <div className="mt-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={handleClearFilters} data-testid="button-clear-filters">
                <X className="w-3.5 h-3.5 mr-1" /> Clear Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4 flex-wrap text-sm text-muted-foreground">
        <span data-testid="text-total-events">
          {total} total event{total !== 1 ? "s" : ""}
        </span>
        <span data-testid="text-page-info">
          Page {page} of {totalPages}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 flex flex-col gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground" data-testid="text-no-events">
              No audit events found matching the current filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Object</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Seq#</TableHead>
                  <TableHead>Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event, index) => (
                  <TableRow key={event.id} data-testid={`row-event-${index}`}>
                    <TableCell className="whitespace-nowrap text-xs" data-testid={`text-timestamp-${index}`}>
                      {event.createdAt
                        ? new Date(event.createdAt).toLocaleString()
                        : "\u2014"}
                    </TableCell>
                    <TableCell data-testid={`text-actor-${index}`}>
                      <Badge variant="secondary" className="text-xs">
                        {event.actorType}{event.actorId ? `:${truncate(event.actorId, 8)}` : ""}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`text-action-${index}`}>
                      <Badge variant="outline" className={`text-xs ${getActionBadgeClass(event.action)}`}>
                        {event.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs" data-testid={`text-object-${index}`}>
                      <span className="text-muted-foreground">{event.objectType}</span>
                      {event.objectId && (
                        <span className="ml-1">{truncate(event.objectId, 8)}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px]" data-testid={`text-details-${index}`}>
                      {event.details ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs cursor-default truncate block">
                              {truncate(event.details, 40)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-sm">
                            <p className="text-xs whitespace-pre-wrap">{event.details}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">{"\u2014"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono" data-testid={`text-seq-${index}`}>
                      {event.sequenceNum ?? "\u2014"}
                    </TableCell>
                    <TableCell data-testid={`text-hash-${index}`}>
                      {event.eventHash ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs font-mono cursor-default flex items-center gap-1">
                              <Hash className="w-3 h-3 text-muted-foreground" />
                              {truncate(event.eventHash, 8)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p className="text-xs font-mono">{event.eventHash}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">{"\u2014"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            data-testid="button-prev-page"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 7) {
              pageNum = i + 1;
            } else if (page <= 4) {
              pageNum = i + 1;
            } else if (page >= totalPages - 3) {
              pageNum = totalPages - 6 + i;
            } else {
              pageNum = page - 3 + i;
            }
            return (
              <Button
                key={pageNum}
                variant={pageNum === page ? "default" : "outline"}
                size="sm"
                onClick={() => setPage(pageNum)}
                data-testid={`button-page-${pageNum}`}
              >
                {pageNum}
              </Button>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            data-testid="button-next-page"
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" /> Hash-Chain Integrity Verification
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {integrityLoading ? (
              <div className="flex flex-col items-center gap-3 py-6" data-testid="verify-loading">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Verifying audit chain integrity...</p>
              </div>
            ) : integrityData ? (
              <div className="flex flex-col gap-4" data-testid="verify-results">
                <div className="flex items-center gap-3">
                  {integrityData.valid ? (
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                  )}
                  <div>
                    <p className="font-semibold text-lg" data-testid="text-integrity-status">
                      {integrityData.valid ? "Chain Valid" : "Chain Broken"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {integrityData.valid
                        ? "All audit events have valid hash-chain links."
                        : "Integrity verification failed. The audit chain has been compromised."}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Total Events</span>
                    <span className="text-xl font-semibold" data-testid="text-total-verified-events">
                      {integrityData.totalEvents}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Verified Events</span>
                    <span className="text-xl font-semibold" data-testid="text-verified-count">
                      {integrityData.verifiedEvents}
                    </span>
                  </div>
                </div>
                {integrityData.brokenAt !== undefined && integrityData.brokenAt !== null && (
                  <div className="mt-2 p-3 rounded-md bg-red-500/10 border border-red-500/20">
                    <p className="text-sm text-red-600 dark:text-red-400" data-testid="text-broken-at">
                      Chain broken at sequence number: <span className="font-mono font-semibold">{integrityData.brokenAt}</span>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                Click "Verify Integrity" to start verification.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
