import * as React from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, isSameDay } from "date-fns";
import {
  AlertCircle, AlertTriangle, CalendarClock, CalendarDays, ClipboardCheck,
  MapPin, Plus, RotateCcw, Undo2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/api-fetch";
import { usePermissions } from "@/lib/use-permissions";
import {
  AUDIT_STATE_BADGE, fmtDateTime, titleCase,
  type ApiList, type AuditRow,
} from "./lib";
import { TypeBadge } from "./shared";

type GroupKey = "overdue" | "today" | "upcoming" | "rework";

const GROUPS: {
  key: GroupKey;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}[] = [
  { key: "rework", title: "Rework", icon: Undo2, accent: "text-red-600" },
  { key: "overdue", title: "Overdue", icon: AlertTriangle, accent: "text-red-600" },
  { key: "today", title: "Today", icon: CalendarClock, accent: "text-amber-600" },
  { key: "upcoming", title: "Upcoming", icon: CalendarDays, accent: "text-muted-foreground" },
];

function groupOf(a: AuditRow): GroupKey {
  if (a.state === "REJECTED") return "rework";
  if (a.isOverdue) return "overdue";
  if (a.dueAt && isSameDay(new Date(a.dueAt), new Date())) return "today";
  return "upcoming";
}

/** "Overdue by 2 hours" / "Due in 3 days" / "No due date". */
function dueText(a: AuditRow): { text: string; urgent: boolean } {
  if (!a.dueAt) return { text: "No due date", urgent: false };
  const due = new Date(a.dueAt);
  const distance = formatDistanceToNow(due);
  if (due.getTime() < Date.now()) return { text: `Overdue by ${distance}`, urgent: true };
  return { text: `Due in ${distance}`, urgent: false };
}

function AuditCard({ audit, onOpen }: { audit: AuditRow; onOpen: () => void }) {
  const due = dueText(audit);
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground">{audit.ticketNo}</span>
          <TypeBadge type={audit.auditType} />
        </div>
        <p className="line-clamp-2 font-medium leading-snug">{audit.title}</p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {audit.propertyName ?? "—"}
            {audit.roomNumber ? ` · Room ${audit.roomNumber}` : ""}
            {audit.propertyCity ? `, ${audit.propertyCity}` : ""}
          </span>
        </p>
        <div className="flex min-h-11 items-center justify-between gap-2 pt-1">
          <span
            className={`text-sm ${due.urgent ? "font-medium text-red-600" : "text-muted-foreground"}`}
            title={fmtDateTime(audit.dueAt)}
          >
            {due.text}
          </span>
          <Badge variant={AUDIT_STATE_BADGE[audit.state] ?? "outline"}>
            {titleCase(audit.state)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

/** My Audits (FRD-REG-05) — the assignee's mobile-first field queue. */
export default function MyAudits() {
  const [, navigate] = useLocation();
  const { can } = usePermissions();
  const canCreate = can("AUDIT_EXECUTION", "create");

  const myQuery = useQuery({
    queryKey: ["/audits/my"],
    queryFn: () => apiFetch<ApiList<AuditRow>>("/audits/my"),
  });

  const audits = myQuery.data?.data ?? [];
  const grouped = React.useMemo(() => {
    const g: Record<GroupKey, AuditRow[]> = { overdue: [], today: [], upcoming: [], rework: [] };
    for (const a of audits) g[groupOf(a)].push(a);
    return g;
  }, [audits]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="My Audits"
        subtitle="Your assigned queue, sorted by due date — tap a card to open."
        breadcrumbs={[{ label: "Audits" }, { label: "My Audits" }]}
        action={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/audits/new">
                <Plus className="mr-1 h-4 w-4" /> New Audit
              </Link>
            </Button>
          ) : undefined
        }
      />

      {myQuery.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : myQuery.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm">{(myQuery.error as Error)?.message || "Failed to load your queue."}</p>
          <Button variant="outline" size="sm" onClick={() => myQuery.refetch()}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : audits.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="All clear"
          description="No audits are assigned to you right now. New assignments will appear here."
        />
      ) : (
        GROUPS.map(({ key, title, icon: Icon, accent }) => {
          const items = grouped[key];
          if (items.length === 0) return null;
          return (
            <section key={key} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Icon className={`h-4 w-4 ${accent}`} />
                {title}
                <Badge variant="secondary" className="tabular-nums">{items.length}</Badge>
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {items.map((a) => (
                  <AuditCard key={a.id} audit={a} onOpen={() => navigate(`/audits/${a.id}`)} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
