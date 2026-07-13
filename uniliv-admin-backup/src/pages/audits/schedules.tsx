import * as React from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  CalendarDays, ChevronDown, ChevronRight, Gauge, MoreHorizontal,
  Pause, Play, Plus, Square,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import {
  SCHEDULE_STATUS_BADGE, fmtDate, humanFrequency, titleCase,
  type ApiList, type ApiOne, type LoadPreview, type ScheduleRow,
} from "./lib";
import { TypeBadge } from "./shared";

/** Auditor workload for the next 30 days (GET load-preview). Collapsible. */
function LoadPreviewCard() {
  const [open, setOpen] = React.useState(false);
  const { from, to } = React.useMemo(() => {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return { from: now.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }, []);

  const query = useQuery({
    queryKey: ["/audit/schedules/view/load-preview", from, to],
    queryFn: () =>
      apiFetch<ApiOne<LoadPreview>>(`/audit/schedules/view/load-preview?from=${from}&to=${to}`),
    enabled: open,
  });
  const d = query.data?.data;
  const rows = [...(d?.byAuditor ?? [])].sort((a, b) => b.count - a.count);
  const maxCount = rows.reduce((m, r) => Math.max(m, r.count), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setOpen((o) => !o)}
        >
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-muted-foreground" /> Load preview
            </CardTitle>
            <CardDescription>Projected audits per auditor over the next 30 days.</CardDescription>
          </div>
          {open ? <ChevronDown className="h-5 w-5 shrink-0" /> : <ChevronRight className="h-5 w-5 shrink-0" />}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {query.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : query.isError ? (
            <p className="py-6 text-center text-sm text-destructive">
              {(query.error as Error)?.message || "Could not load the preview."}
            </p>
          ) : (
            <>
              {rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No assigned audits projected in this window.
                </p>
              ) : (
                <ul className="space-y-3">
                  {rows.map((r) => (
                    <li key={r.assigneeId} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{r.assigneeName}</span>
                          <span className="text-xs text-muted-foreground">{titleCase(r.assigneeRole)}</span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">{r.count}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]"
                          style={{ width: `${maxCount > 0 ? (r.count / maxCount) * 100 : 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {(d?.unassignedByRule ?? 0) > 0 && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {d!.unassignedByRule} occurrence{d!.unassignedByRule === 1 ? "" : "s"} rely on a
                  role-at-target rule and aren't attributed to a specific auditor yet.
                </p>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/** Recurring audit programs (FRD-SCH). Row click opens the edit form;
 *  pause/resume/end act on future occurrences only. */
export default function AuditSchedules() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [endTarget, setEndTarget] = React.useState<ScheduleRow | null>(null);

  const schedulesQuery = useQuery({
    queryKey: ["/audit/schedules"],
    queryFn: () => apiFetch<ApiList<ScheduleRow>>("/audit/schedules?limit=200"),
  });

  const rows = React.useMemo(() => {
    const all = schedulesQuery.data?.data ?? [];
    return statusFilter === "ALL" ? all : all.filter((s) => s.status === statusFilter);
  }, [schedulesQuery.data, statusFilter]);

  const actionMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "resume" | "end" }) =>
      apiFetch(`/audit/schedules/${id}/${action}`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (_r, vars) => {
      toast({ title: `Schedule ${vars.action}${vars.action === "end" ? "ed" : "d"}` });
      setEndTarget(null);
      qc.invalidateQueries({ queryKey: ["/audit/schedules"] });
    },
    onError: (e: Error) => {
      setEndTarget(null);
      toast({ title: e.message || "Action failed", variant: "destructive" });
    },
  });

  const columns: ColumnDef<ScheduleRow>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="block max-w-[260px] truncate font-medium">{row.original.title}</span>
      ),
    },
    {
      accessorKey: "templateName",
      header: "Template",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.templateName}{" "}
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            v{row.original.templateVersionNo}
          </span>
        </span>
      ),
    },
    {
      accessorKey: "auditType",
      header: "Type",
      cell: ({ row }) => <TypeBadge type={row.original.auditType} />,
    },
    {
      accessorKey: "frequency",
      header: "Frequency",
      cell: ({ row }) => <span className="text-sm">{humanFrequency(row.original)}</span>,
    },
    {
      accessorKey: "timeOfDay",
      header: "Time",
      cell: ({ row }) => <span className="font-mono text-sm tabular-nums">{row.original.timeOfDay}</span>,
    },
    {
      accessorKey: "windowStart",
      header: "Window",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {fmtDate(row.original.windowStart)} → {row.original.windowEnd ? fmtDate(row.original.windowEnd) : "∞"}
        </span>
      ),
    },
    {
      accessorKey: "targetCount",
      header: "Targets",
      cell: ({ row }) => <span className="tabular-nums">{row.original.targetCount}</span>,
    },
    {
      accessorKey: "auditsGenerated",
      header: "Generated",
      cell: ({ row }) => <span className="tabular-nums">{row.original.auditsGenerated}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={SCHEDULE_STATUS_BADGE[row.original.status] ?? "outline"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const s = row.original;
        if (s.status === "ENDED") return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {s.status === "ACTIVE" && (
                <DropdownMenuItem onClick={() => actionMut.mutate({ id: s.id, action: "pause" })}>
                  <Pause className="mr-2 h-4 w-4" /> Pause
                </DropdownMenuItem>
              )}
              {s.status === "PAUSED" && (
                <DropdownMenuItem onClick={() => actionMut.mutate({ id: s.id, action: "resume" })}>
                  <Play className="mr-2 h-4 w-4" /> Resume
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setEndTarget(s)}>
                <Square className="mr-2 h-4 w-4" /> End schedule
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedules"
        subtitle="Recurring audit programs — occurrences materialize ahead of time and appear on the calendar."
        breadcrumbs={[{ label: "Audits" }, { label: "Schedules" }]}
      />

      <LoadPreviewCard />

      <DataTable
        columns={columns}
        data={rows}
        searchKey="title"
        searchPlaceholder="Search schedules..."
        isLoading={schedulesQuery.isLoading}
        onRowClick={(row) => navigate(`/audits/schedules/${row.id}`)}
        exportFilename="audit-schedules"
        columnsStorageKey="audit-schedules"
        toolbarActions={
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PAUSED">Paused</SelectItem>
                <SelectItem value="ENDED">Ended</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => navigate("/audits/schedules/calendar")}>
              <CalendarDays className="mr-1 h-4 w-4" /> Calendar
            </Button>
            <Button size="sm" onClick={() => navigate("/audits/schedules/new")}>
              <Plus className="mr-1 h-4 w-4" /> New schedule
            </Button>
          </>
        }
      />

      <ConfirmDialog
        open={endTarget != null}
        onOpenChange={(o) => { if (!o) setEndTarget(null); }}
        title="End schedule?"
        description={`"${endTarget?.title ?? ""}" stops generating audits permanently. Existing audits are untouched. This cannot be undone.`}
        onConfirm={() => actionMut.mutate({ id: endTarget!.id, action: "end" })}
        isConfirming={actionMut.isPending}
        confirmLabel="End schedule"
      />
    </div>
  );
}
