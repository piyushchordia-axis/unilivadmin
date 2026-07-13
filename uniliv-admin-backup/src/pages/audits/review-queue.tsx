import * as React from "react";
import { useLocation } from "wouter";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle, BadgeCheck, ChevronLeft, ChevronRight, RefreshCw, RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api-fetch";
import {
  AUDIT_STATE_BADGE, fmtDateTime, scoreColorClass, titleCase,
  type ApiPage, type AuditRow,
} from "./lib";
import { TypeBadge } from "./shared";

const PAGE_SIZE = 20;

/** Review queue (FRD-REV-01) — submitted audits awaiting a verdict, oldest first. */
export default function ReviewQueue() {
  const [, navigate] = useLocation();
  const [page, setPage] = React.useState(0);

  const queueQuery = useQuery({
    queryKey: ["/audit/reviews/queue", page],
    queryFn: () =>
      apiFetch<ApiPage<AuditRow>>(`/audit/reviews/queue?page=${page + 1}&limit=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });

  const rows = queueQuery.data?.data ?? [];
  const total = queueQuery.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review"
        subtitle="Submitted audits awaiting a verdict — oldest submissions first."
        breadcrumbs={[{ label: "Audits" }, { label: "Review" }]}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => queueQuery.refetch()}
            disabled={queueQuery.isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${queueQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {queueQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : queueQuery.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm">{(queueQuery.error as Error)?.message || "Failed to load the queue."}</p>
          <Button variant="outline" size="sm" onClick={() => queueQuery.refetch()}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title="Queue is clear"
          description="Audits appear here when auditors submit them for review."
        />
      ) : (
        <>
          <div className="rounded-md border bg-card">
            <div className="w-full overflow-auto overscroll-contain" style={{ maxHeight: "68vh" }}>
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:border-b [&_tr]:border-border">
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Ticket</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Auditor</TableHead>
                    <TableHead className="text-right">Score %</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="whitespace-nowrap">Submitted</TableHead>
                    <TableHead className="whitespace-nowrap">Waiting</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => {
                    const pct = a.scorePct != null ? Number(a.scorePct) : null;
                    return (
                      <TableRow
                        key={a.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/audits/review/${a.id}`)}
                      >
                        <TableCell className="whitespace-nowrap font-mono text-xs">{a.ticketNo}</TableCell>
                        <TableCell>
                          <span className="block max-w-[240px] truncate font-medium">{a.title}</span>
                        </TableCell>
                        <TableCell><TypeBadge type={a.auditType} /></TableCell>
                        <TableCell>
                          <span className="block max-w-[160px] truncate text-sm">{a.propertyName ?? "—"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="block max-w-[140px] truncate text-sm">{a.assigneeName ?? "—"}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          {pct != null ? (
                            <span className={`font-medium tabular-nums ${scoreColorClass(pct)}`}>
                              {pct.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={AUDIT_STATE_BADGE[a.state] ?? "outline"}>
                            {titleCase(a.state)}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {fmtDateTime(a.submittedAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {a.submittedAt
                            ? formatDistanceToNow(new Date(a.submittedAt))
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{total}</span> awaiting review
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Page {page + 1} of {pageCount}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || queueQuery.isFetching}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page + 1 >= pageCount || queueQuery.isFetching}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
