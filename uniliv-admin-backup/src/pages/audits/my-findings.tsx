import * as React from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, AlertTriangle, Archive, BadgeCheck, CalendarClock,
  CheckCircle2, ChevronDown, ListChecks, MapPin, RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/api-fetch";
import { fmtDate, type ApiPage, type NcRow } from "./lib";
import { NcStateBadge, SeverityBadge, SlaCountdown, useNowTick } from "./shared";

type GroupKey = "overdue" | "dueSoon" | "awaiting" | "onTrack";

const GROUPS: {
  key: GroupKey;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}[] = [
  { key: "overdue", title: "Overdue", icon: AlertTriangle, accent: "text-red-600" },
  { key: "dueSoon", title: "Due soon", icon: CalendarClock, accent: "text-amber-600" },
  { key: "awaiting", title: "Awaiting verification", icon: BadgeCheck, accent: "text-violet-600" },
  { key: "onTrack", title: "On track", icon: CheckCircle2, accent: "text-emerald-600" },
];

function groupOf(nc: NcRow): GroupKey | "terminal" {
  switch (nc.slaState) {
    case "OVERDUE": return "overdue";
    case "DUE_SOON": return "dueSoon";
    case "AWAITING_VERIFICATION": return "awaiting";
    case "ON_TRACK": return "onTrack";
    default: return "terminal"; // VERIFIED / CLOSED / WAIVED
  }
}

function FindingCard({ nc, nowMs, onOpen }: { nc: NcRow; nowMs: number; onOpen: () => void }) {
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
          <span className="font-mono text-xs text-muted-foreground">{nc.ncNo}</span>
          <SeverityBadge severity={nc.severity} />
        </div>
        <p className="line-clamp-2 font-medium leading-snug">{nc.description}</p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {nc.propertyName ?? "—"}
            <span className="font-mono text-xs"> · {nc.ticketNo}</span>
          </span>
        </p>
        <div className="flex min-h-11 items-center justify-between gap-2 pt-1">
          <SlaCountdown
            state={nc.state}
            dueAt={nc.dueAt}
            slaState={nc.slaState}
            nowMs={nowMs}
            className="text-sm"
          />
          <NcStateBadge state={nc.state} />
        </div>
      </CardContent>
    </Card>
  );
}

/** My Findings (FRD-NCM-02) — the owner's CAPA queue, grouped by SLA urgency. */
export default function MyFindings() {
  const [, navigate] = useLocation();
  const nowMs = useNowTick();
  const [terminalOpen, setTerminalOpen] = React.useState(false);

  const myQuery = useQuery({
    queryKey: ["/audit/ncs", "mine"],
    queryFn: () => apiFetch<ApiPage<NcRow>>("/audit/ncs?mine=true&limit=100"),
  });

  const ncs = React.useMemo(() => myQuery.data?.data ?? [], [myQuery.data]);
  const grouped = React.useMemo(() => {
    const g: Record<GroupKey, NcRow[]> & { terminal: NcRow[] } = {
      overdue: [], dueSoon: [], awaiting: [], onTrack: [], terminal: [],
    };
    for (const nc of ncs) g[groupOf(nc)].push(nc);
    return g;
  }, [ncs]);

  const openNc = (id: string) => navigate(`/audits/findings/${id}`);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="My Findings"
        subtitle="Non-conformances you own, grouped by SLA urgency — tap a card to act."
        breadcrumbs={[{ label: "Audits" }, { label: "My Findings" }]}
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
          <p className="text-sm">{(myQuery.error as Error)?.message || "Failed to load your findings."}</p>
          <Button variant="outline" size="sm" onClick={() => myQuery.refetch()}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : ncs.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No findings on your plate"
          description="Non-conformances raised on your properties appear here with their CAPA deadlines."
        />
      ) : (
        <>
          {GROUPS.map(({ key, title, icon: Icon, accent }) => {
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
                  {items.map((nc) => (
                    <FindingCard key={nc.id} nc={nc} nowMs={nowMs} onOpen={() => openNc(nc.id)} />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Terminal findings, collapsed to a count */}
          {grouped.terminal.length > 0 && (
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setTerminalOpen((o) => !o)}
                className="flex min-h-11 items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                <Archive className="h-4 w-4" />
                Closed / waived
                <Badge variant="secondary" className="tabular-nums">{grouped.terminal.length}</Badge>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${terminalOpen ? "rotate-180" : ""}`}
                />
              </button>
              {terminalOpen && (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {grouped.terminal.map((nc) => (
                    <FindingCard key={nc.id} nc={nc} nowMs={nowMs} onOpen={() => openNc(nc.id)} />
                  ))}
                </div>
              )}
              {!terminalOpen && (
                <p className="text-sm text-muted-foreground">
                  {grouped.terminal.length} finished finding{grouped.terminal.length === 1 ? "" : "s"} — resolved on{" "}
                  {fmtDate(grouped.terminal[0]?.closedAt ?? grouped.terminal[0]?.updatedAt)} and earlier.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
