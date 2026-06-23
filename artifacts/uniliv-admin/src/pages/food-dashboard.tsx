import * as React from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import {
  ClipboardList,
  Package,
  Truck,
  PackageCheck,
  Trash2,
  ChevronRight,
  BarChart3,
  Clock,
  LayoutDashboard,
  Compass,
  Timer,
  Scale,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { GlobalPropertyScopeBanner } from "@/components/property-scope-banner";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BoundedScroll } from "@/components/ui/bounded-scroll";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  foodApi,
  foodKeys,
  BRANDS,
  MEAL_LABEL,
  type DashboardData,
  type FoodLookups,
  type Kpi,
  type Cutoff,
  type VariancePeriod,
  type WastePendingRow,
} from "@/lib/food-api";
import { useAppStore } from "@/lib/store";
import { usePermissions } from "@/lib/use-permissions";

// Status chart shows the full lifecycle distribution, scoped to the SAME
// property / brand / date filters as the KPI cards above.
const CHART_STATUSES = ["PLACED", "PREPARING", "DISPATCHED", "DELIVERED", "CANCELLED"] as const;
const STATUS_COLORS: Record<string, string> = {
  PLACED: "var(--info)",
  PREPARING: "var(--warning)",
  DISPATCHED: "var(--pop)",
  DELIVERED: "var(--success)",
  CANCELLED: "var(--destructive)",
};

const VARIANCE_PERIODS: { key: VariancePeriod; label: string }[] = [
  { key: "m1", label: "1 month" },
  { key: "m3", label: "3 months" },
  { key: "m6", label: "6 months" },
  { key: "fy", label: "This FY" },
];

function kpiValue(k?: Kpi): number {
  return k?.value ?? 0;
}
function kpiChange(k?: Kpi): number | undefined {
  return k?.changePct ?? undefined;
}

/** Re-renders consumers every `ms` so live countdowns tick. */
function useTicker(ms: number): void {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** "NN min left" (or "<1 min left" / "Expired") from an absolute ISO deadline. */
function minutesLeftLabel(untilIso: string | null): string {
  if (!untilIso) return "—";
  const diffMs = new Date(untilIso).getTime() - Date.now();
  if (diffMs <= 0) return "Expired";
  const mins = Math.floor(diffMs / 60000);
  return mins < 1 ? "<1 min left" : `${mins} min left`;
}

export default function FoodDashboard() {
  const [, setLocation] = useLocation();
  const { can } = usePermissions();

  // Selected property from the global app store (null = all properties).
  const { propertyId: storePropertyId, setPropertyId: setGlobalProperty } = useAppStore();
  const scopedPropertyId = storePropertyId ?? undefined;

  // Today's date as an ISO string, used to scope cut-offs.
  const todayIso = React.useMemo(() => new Date().toISOString(), []);

  const { data: cutoffs, isLoading: cutoffsLoading } = useQuery<Cutoff[]>({
    queryKey: foodKeys.cutoffs({ brand: "UNILIV", propertyId: scopedPropertyId, date: todayIso }),
    queryFn: () =>
      foodApi.cutoffs({ brand: "UNILIV", propertyId: scopedPropertyId, date: todayIso }),
  });

  const [propertyId, setPropertyId] = React.useState(storePropertyId ?? "ALL");
  // Keep the orders-table filter, the banner scope and the sidebar selector as
  // one: filter changes push to the global store; global changes mirror back.
  React.useEffect(() => { setPropertyId(storePropertyId ?? "ALL"); }, [storePropertyId]);
  const selectProperty = (v: string) => {
    setPropertyId(v);
    setGlobalProperty(v === "ALL" ? null : v);
  };
  const [brand, setBrand] = React.useState("ALL");
  const [from, setFrom] = React.useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = React.useState(() => format(new Date(), "yyyy-MM-dd"));
  const [variancePeriod, setVariancePeriod] = React.useState<VariancePeriod>("m1");

  const params = React.useMemo(
    () => ({ propertyId, brand, from, to }),
    [propertyId, brand, from, to],
  );

  const { data: lookups } = useQuery<FoodLookups>({
    queryKey: foodKeys.lookups(),
    queryFn: () => foodApi.lookups(),
  });
  const properties = lookups?.properties ?? [];

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: foodKeys.dashboard(params),
    queryFn: () => foodApi.dashboard(params),
  });

  const wasteParams = React.useMemo(() => ({ propertyId, brand }), [propertyId, brand]);
  const { data: wasteRows, isLoading: wasteLoading } = useQuery<WastePendingRow[]>({
    queryKey: foodKeys.wastePending(wasteParams),
    queryFn: () => foodApi.wastePending(wasteParams),
    refetchInterval: 60_000,
  });

  const { data: reports } = useQuery({
    queryKey: foodKeys.reports(params),
    queryFn: () => foodApi.reports(params),
  });

  const statusData = React.useMemo(() => {
    const rows = reports?.statusBreakdown ?? [];
    return rows
      .filter((r) => (CHART_STATUSES as readonly string[]).includes(r.status))
      .sort(
        (a, b) =>
          CHART_STATUSES.indexOf(a.status as (typeof CHART_STATUSES)[number]) -
          CHART_STATUSES.indexOf(b.status as (typeof CHART_STATUSES)[number]),
      );
  }, [reports]);

  const kpis = data?.kpis;
  const pending = data?.pendingActions;
  const varianceValue = kpis?.variance?.[variancePeriod] ?? 0;

  // Absolute deadline for placing TOMORROW's order = TODAY @ cut-off time.
  // The /cutoffs endpoint anchors cutoffAt on the day before the service date,
  // and we query it with date=today, so cutoffAt is yesterday@cut-off. Recompute
  // today@cut-off from the returned cutoffTime instead.
  const orderDeadline = React.useMemo(() => {
    const t = cutoffs?.[0]?.cutoffTime;
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    if (h == null || Number.isNaN(h)) return null;
    const d = new Date();
    d.setHours(h, m || 0, 0, 0);
    return d;
  }, [cutoffs]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Dashboard"
        subtitle="Kitchen operations at a glance — orders, dispatch, and delivery"
      />

      <GlobalPropertyScopeBanner properties={lookups?.properties} />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <Select value={propertyId} onValueChange={selectProperty}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Property" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Properties</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={brand} onValueChange={setBrand}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Brands</SelectItem>
            {BRANDS.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <DatePicker value={from} max={to} onChange={setFrom} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <DatePicker value={to} min={from} onChange={setTo} className="w-40" />
        </div>
      </div>

      {/* Sticky KPI row — stays in view as the overview scrolls */}
      <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              title="Total Orders"
              value={kpiValue(kpis?.totalOrders)}
              change={kpiChange(kpis?.totalOrders)}
              icon={ClipboardList}
            />
            <StatCard
              title="Active"
              value={kpiValue(kpis?.active)}
              change={kpiChange(kpis?.active)}
              icon={Package}
            />
            <StatCard
              title="Awaiting Confirmation"
              value={kpiValue(kpis?.awaitingConfirmation)}
              change={kpiChange(kpis?.awaitingConfirmation)}
              icon={PackageCheck}
            />
            <VarianceCard
              value={varianceValue}
              period={variancePeriod}
              onPeriodChange={setVariancePeriod}
            />
          </div>
        )}
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5">
            <Compass className="h-3.5 w-3.5" /> Insights
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW — cut-offs + pending actions */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Today's cut-offs + order-deadline countdown */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  Today's Cut-offs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cutoffsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-lg" />
                    ))}
                  </div>
                ) : !cutoffs || cutoffs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-1 py-6 text-center">
                    <Clock className="h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">No cut-offs configured</p>
                    <p className="text-xs text-muted-foreground">
                      Set meal windows in Settings to see ordering cut-offs.
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* Single cut-off applies to all meals; each meal keeps its own service time. */}
                    <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/50">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                        <div>
                          <p className="text-sm font-medium text-foreground">Cut-off — all meals</p>
                          <p className="font-mono text-xs text-muted-foreground">{cutoffs[0]?.cutoffTime ?? "Not set"}</p>
                        </div>
                      </div>
                      {cutoffs[0]?.cutoffTime ? (
                        cutoffs[0]?.isPastCutoff ? <Badge variant="destructive">Closed</Badge> : <Badge variant="success">Open</Badge>
                      ) : <Badge variant="secondary">—</Badge>}
                    </div>
                    <BoundedScroll maxHeight="220px" className="pr-2">
                      <ul className="divide-y divide-border">
                        {cutoffs.map((c) => (
                          <li key={c.mealType} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                            <span className="text-sm text-foreground">{MEAL_LABEL[c.mealType] ?? c.mealType}</span>
                            <span className="font-mono text-xs text-muted-foreground">{c.serviceTime ? `Serves ${c.serviceTime}` : "—"}</span>
                          </li>
                        ))}
                      </ul>
                    </BoundedScroll>
                  </div>
                )}
              </CardContent>
            </Card>

            <OrderDeadlineCard deadline={orderDeadline} loading={cutoffsLoading} />
          </div>

          {/* Pending Actions */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Pending Actions
            </h2>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <div className={`grid grid-cols-1 gap-4 ${can("FOOD_DISPATCH", "view") ? "md:grid-cols-2" : ""}`}>
                {/* Dispatch left the unit lead — only FnB roles (FOOD_DISPATCH) see this. */}
                {can("FOOD_DISPATCH", "view") && (
                  <PendingActionCard
                    icon={Truck}
                    label="Awaiting Dispatch"
                    count={pending?.awaitingDispatch ?? 0}
                    accent="text-info"
                    onClick={() => setLocation("/food/dispatch")}
                  />
                )}
                <WastePendingCard
                  rows={wasteRows ?? []}
                  loading={wasteLoading}
                  count={pending?.wastePending ?? 0}
                  onAct={() => setLocation("/food/waste")}
                />
              </div>
            )}
          </div>
        </TabsContent>

        {/* INSIGHTS — secondary status chart */}
        <TabsContent value="insights" className="mt-4 space-y-4">
          {/* Status overview chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                Order Status Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent style={{ height: 280 }}>
              {statusData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No active or awaiting-confirmation orders in the selected range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="status"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => v.replace(/_/g, " ")}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      formatter={(value: number) => [value, "Orders"]}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {statusData.map((d) => (
                        <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? "var(--muted)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Variance KPI card with a 1mo / 3mo / 6mo / FY period toggle. */
function VarianceCard({
  value,
  period,
  onPeriodChange,
}: {
  value: number;
  period: VariancePeriod;
  onPeriodChange: (p: VariancePeriod) => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/40">
            <Scale className="h-4 w-4 text-muted-foreground" />
          </span>
          <span className="text-sm font-medium text-foreground">Variance</span>
        </div>
      </div>
      <div className="mt-2 font-display text-3xl font-bold text-foreground">{value}</div>
      <p className="text-xs text-muted-foreground">orders with qty variance</p>
      <div className="mt-3 flex flex-wrap gap-1">
        {VARIANCE_PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPeriodChange(p.key)}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
              p.key === period
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Live "time left to place tomorrow's order" countdown card. */
function OrderDeadlineCard({ deadline, loading }: { deadline: Date | null; loading: boolean }) {
  useTicker(30_000);
  const now = Date.now();
  const diffMs = deadline ? deadline.getTime() - now : null;
  const closed = diffMs !== null && diffMs <= 0;

  let body: React.ReactNode;
  if (loading) {
    body = <Skeleton className="h-8 w-32 rounded-lg" />;
  } else if (diffMs === null) {
    body = <p className="text-sm text-muted-foreground">No cut-off configured.</p>;
  } else if (closed) {
    body = (
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm font-medium">Ordering closed for tomorrow</span>
      </div>
    );
  } else {
    const totalMin = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    body = (
      <p className="font-display text-2xl font-bold text-foreground">
        {hours > 0 ? `${hours}h ` : ""}
        {mins}m <span className="text-sm font-medium text-muted-foreground">left</span>
      </p>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Place Tomorrow's Order
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {body}
        {!loading && diffMs !== null && !closed ? (
          <p className="text-xs text-muted-foreground">
            until today's {deadline ? format(deadline, "HH:mm") : ""} cut-off
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Waste-Pending card: a table of DELIVERED orders with live "NN min left" countdowns. */
function WastePendingCard({
  rows,
  loading,
  count,
  onAct,
}: {
  rows: WastePendingRow[];
  loading: boolean;
  count: number;
  onAct: () => void;
}) {
  useTicker(30_000);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trash2 className="h-4 w-4 text-destructive" />
          Waste Pending
          {count > 0 ? <Badge variant="destructive">{count}</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-6 text-center">
            <PackageCheck className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">All caught up</p>
            <p className="text-xs text-muted-foreground">No deliveries awaiting waste entry.</p>
          </div>
        ) : (
          <BoundedScroll maxHeight="260px" className="pr-1">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Order #</th>
                  <th className="py-1.5 pr-2 font-medium">Property</th>
                  <th className="py-1.5 pr-2 font-medium">Meal</th>
                  <th className="py-1.5 pr-2 font-medium">Delivered</th>
                  <th className="py-1.5 pr-2 font-medium">Time left</th>
                  <th className="py-1.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.orderId}>
                    <td className="py-2 pr-2 font-mono text-xs text-foreground">{r.orderNumber}</td>
                    <td className="py-2 pr-2 text-foreground">{r.propertyName ?? "—"}</td>
                    <td className="py-2 pr-2 text-muted-foreground">{MEAL_LABEL[r.mealType] ?? r.mealType}</td>
                    <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">
                      {r.deliveredAt ? format(new Date(r.deliveredAt), "dd MMM HH:mm") : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      <Badge variant="warning">{minutesLeftLabel(r.wasteEditableUntil)}</Badge>
                    </td>
                    <td className="py-2 text-right">
                      <Link
                        href="/food/waste"
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:text-accent/80"
                      >
                        Log <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </BoundedScroll>
        )}
        {rows.length > 0 ? (
          <button
            type="button"
            onClick={onAct}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent/80 focus:outline-none focus:ring-2 focus:ring-accent/40 rounded-md"
          >
            Go to Waste log <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PendingActionCard({
  icon: Icon,
  label,
  count,
  accent,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left w-full rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/40">
            <Icon className={`h-4 w-4 ${count > 0 ? accent : "text-muted-foreground"}`} />
          </span>
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={`font-display text-3xl font-bold ${count > 0 ? "text-foreground" : "text-muted-foreground"}`}
        >
          {count}
        </span>
        <span className="text-xs text-muted-foreground">
          {count === 1 ? "order" : "orders"}
          {count > 0 ? " need attention" : " pending"}
        </span>
      </div>
    </button>
  );
}

