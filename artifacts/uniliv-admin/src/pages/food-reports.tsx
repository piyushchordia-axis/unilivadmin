import * as React from "react";
import { useLocation } from "wouter";
import { withQuery } from "@/lib/nav-helpers";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import {
  Download, CalendarRange, ClipboardList, UtensilsCrossed, Users, BarChart3,
  FileText, Trash2, Clock, TrendingDown, Scale, Timer, Check,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/lib/use-permissions";
import { apiDownload } from "@/lib/api-fetch";
import {
  foodApi, foodKeys, BRANDS, ORDER_STATUSES,
  type ReportsData, type AnalyticsData, type OrderStatus, type FoodLookups,
  type OnTimeReport, type OnTimeTolerance, type VarianceByDayData, type MealType,
} from "@/lib/food-api";

// Chart palette — keyed to the design-system CSS variables (raw hex values).
const ACCENT = "var(--accent)";
const PRIMARY = "var(--primary)";
const SUCCESS = "var(--success)";
const WARNING = "var(--warning)";
const DESTRUCTIVE = "var(--destructive)";
const INFO = "var(--info)";

// Period presets — drive both the analytics `period` param and the from/to window.
type PeriodKey = "week" | "month" | "quarter" | "year";
const PERIOD_PRESETS: { key: PeriodKey; label: string; days: number }[] = [
  { key: "week", label: "Week", days: 7 },
  { key: "month", label: "Month", days: 30 },
  { key: "quarter", label: "Quarter", days: 90 },
  { key: "year", label: "Year", days: 365 },
];

// O17 — variance-by-day meal filter badges. "All" sends no mealType.
type MealFilter = "ALL" | MealType;
const MEAL_FILTERS: { key: MealFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "BREAKFAST", label: "Breakfast" },
  { key: "LUNCH", label: "Lunch" },
  { key: "SNACKS", label: "High Tea / Evening Snacks" },
  { key: "DINNER", label: "Dinner" },
];

// O20 — export formats + the report widgets that can be downloaded.
type ExportFmt = "csv" | "xls" | "pdf";
const EXPORT_FORMATS: { key: ExportFmt; label: string }[] = [
  { key: "csv", label: "CSV" },
  { key: "xls", label: "Excel" },
  { key: "pdf", label: "PDF" },
];
type ExportReport = "orders" | "variance" | "waste" | "ontime";
const EXPORT_REPORTS: { key: ExportReport; label: string; base: string }[] = [
  { key: "orders", label: "Food Orders", base: "food-orders" },
  { key: "variance", label: "Variance", base: "food-variance" },
  { key: "waste", label: "Waste", base: "food-waste" },
  { key: "ontime", label: "On-time", base: "food-ontime" },
];

// StatusBadge-aligned colors for the status breakdown chart.
const STATUS_COLOR: Record<OrderStatus, string> = {
  PLACED: INFO,
  ACCEPTED: ACCENT,
  REJECTED: DESTRUCTIVE,
  PREPARING: WARNING,
  DISPATCHED: INFO,
  DELIVERED: SUCCESS,
  CANCELLED: DESTRUCTIVE,
};

/** Small empty state shown inside a chart card when its dataset is empty. */
function ChartEmpty({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
      <Icon className="w-8 h-8 opacity-40" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-full w-full flex items-end gap-2 px-2 pb-2">
      {[60, 80, 45, 90, 70, 55, 75].map((h, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

export default function FoodReports() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const today = format(new Date(), "yyyy-MM-dd");
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

  const [from, setFrom] = React.useState(thirtyDaysAgo);
  const [to, setTo] = React.useState(today);
  const [status, setStatus] = React.useState<string>("ALL");
  const [propertyId, setPropertyId] = React.useState<string>("ALL");
  const [brand, setBrand] = React.useState<string>("ALL");
  const [period, setPeriod] = React.useState<PeriodKey>("month");
  const [downloading, setDownloading] = React.useState(false);

  const filters: Record<string, string> = { from, to, status, propertyId, brand };

  // Apply a period preset: sets `period` and recomputes the from/to window.
  const applyPeriod = (p: PeriodKey) => {
    const preset = PERIOD_PRESETS.find((x) => x.key === p);
    if (!preset) return;
    setPeriod(p);
    setFrom(format(subDays(new Date(), preset.days), "yyyy-MM-dd"));
    setTo(format(new Date(), "yyyy-MM-dd"));
  };

  const { data: lookups } = useQuery<FoodLookups>({
    queryKey: foodKeys.lookups(),
    queryFn: () => foodApi.lookups(),
  });
  const properties = lookups?.properties ?? [];
  const propName = (id?: string | null) =>
    id ? (properties.find((p) => p.id === id)?.name || "—") : "—";

  const { data, isLoading, isError, error } = useQuery<ReportsData>({
    queryKey: foodKeys.reports(filters),
    queryFn: () => foodApi.reports(filters),
  });

  // Waste & delays analytics — reuses the same period/property/brand/date scope.
  const analyticsParams: Record<string, string> = { period, from, to };
  if (propertyId !== "ALL") analyticsParams.propertyId = propertyId;
  if (brand !== "ALL") analyticsParams.brand = brand;

  const {
    data: analytics, isLoading: analyticsLoading, isError: analyticsError, error: analyticsErr,
  } = useQuery<AnalyticsData>({
    queryKey: foodKeys.analytics(analyticsParams),
    queryFn: () => foodApi.analytics(analyticsParams),
  });

  // O15 — on-time delivery report (% on-time + per-day on-time/late trend).
  const onTimeParams: Record<string, string> = { period, from, to };
  if (propertyId !== "ALL") onTimeParams.propertyId = propertyId;
  if (brand !== "ALL") onTimeParams.brand = brand;

  const {
    data: onTime, isLoading: onTimeLoading,
  } = useQuery<OnTimeReport>({
    queryKey: foodKeys.reportsOnTime(onTimeParams),
    queryFn: () => foodApi.reportsOnTime(onTimeParams),
  });
  const onTimeByDay = onTime?.byDay ?? [];

  // O16 — global on-time tolerance (read by any food user, written by SUPER_ADMIN).
  const { role } = usePermissions();
  const isSuperAdmin = role === "SUPER_ADMIN";

  const { data: tolerance } = useQuery<OnTimeTolerance>({
    queryKey: foodKeys.ontimeTolerance(),
    queryFn: () => foodApi.ontimeTolerance(),
  });
  // Local draft for the inline tolerance editor; reseeds when the server value loads.
  const [toleranceDraft, setToleranceDraft] = React.useState<string>("");
  React.useEffect(() => {
    if (tolerance) setToleranceDraft(String(tolerance.minutes));
  }, [tolerance?.minutes]);

  const saveTolerance = useMutation({
    mutationFn: (minutes: string) => foodApi.updateOntimeTolerance(minutes),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: foodKeys.ontimeTolerance() });
      // Refetch the on-time calc so the % reflects the new tolerance.
      qc.invalidateQueries({ queryKey: ["food", "reports-ontime"] });
      setToleranceDraft(String(data.minutes));
      toast({ title: "Tolerance updated", description: `On-time within ${data.minutes} minutes` });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to save tolerance", variant: "destructive" }),
  });

  // O17 — ordered-vs-received variance per service-day, filterable by meal badge.
  const [mealFilter, setMealFilter] = React.useState<MealFilter>("ALL");
  const varianceByDayParams: Record<string, string> = { from, to, period };
  if (propertyId !== "ALL") varianceByDayParams.propertyId = propertyId;
  if (mealFilter !== "ALL") varianceByDayParams.mealType = mealFilter;

  const {
    data: varianceByDay, isLoading: varianceByDayLoading,
  } = useQuery<VarianceByDayData>({
    queryKey: foodKeys.reportsVarianceByDay(varianceByDayParams),
    queryFn: () => foodApi.reportsVarianceByDay(varianceByDayParams),
  });
  const varianceByDayRows = varianceByDay?.rows ?? [];

  const ordersPerDay = data?.ordersPerDay ?? [];
  const residentTrend = data?.residentTrend ?? [];
  const statusBreakdown = data?.statusBreakdown ?? [];

  const wastageTrend = analytics?.wastageTrend ?? [];
  const topWasteItems = analytics?.topWasteItems ?? [];
  const delays = analytics?.delays ?? [];
  const summary = analytics?.summary;

  // Shaped horizontal bar series for top-wastage items.
  const topWasteChartData = topWasteItems
    .slice(0, 8)
    .map((w) => ({
      name: w.dishName ?? "—",
      wasted: w.wasted,
      wastePct: w.wastePct,
      unit: w.unit,
    }))
    .reverse();

  // Derived headline metrics.
  const totalOrders = ordersPerDay.reduce((s, d) => s + (d.count || 0), 0);
  const peakResidents = residentTrend.reduce((m, d) => Math.max(m, d.residents || 0), 0);

  // Shaped chart series.
  const statusChartData = statusBreakdown.map((s) => ({
    name: (s.status || "").replace(/_/g, " "),
    value: s.count,
    status: s.status,
  }));
  const dayTickFmt = (v: string) => {
    try { return format(new Date(v), "dd MMM"); } catch { return v; }
  };

  React.useEffect(() => {
    if (isError) {
      toast({ title: (error as any)?.message || "Failed to load reports", variant: "destructive" });
    }
  }, [isError, error, toast]);

  React.useEffect(() => {
    if (analyticsError) {
      toast({ title: (analyticsErr as any)?.message || "Failed to load analytics", variant: "destructive" });
    }
  }, [analyticsError, analyticsErr, toast]);

  // O20 — selected export format + report widget.
  const [exportFmt, setExportFmt] = React.useState<ExportFmt>("csv");
  const [exportReport, setExportReport] = React.useState<ExportReport>("orders");

  // Clean export params — drop ALL sentinels so the API receives only real filters.
  // `status` only applies to the orders report; omit it for the others.
  const buildExportParams = (report: ExportReport): Record<string, string> => {
    const p: Record<string, string> = { report };
    for (const [k, v] of Object.entries(filters)) {
      if (!v || v === "ALL") continue;
      if (k === "status" && report !== "orders") continue;
      p[k] = v;
    }
    return p;
  };

  // Property name embedded in the export filename when a single property is in scope.
  const scopedExportPropName = propertyId !== "ALL" ? propName(propertyId) : null;
  const exportFilename = (report: ExportReport, ext: string) => {
    const base = EXPORT_REPORTS.find((r) => r.key === report)?.base ?? "food-orders";
    const prop = scopedExportPropName && scopedExportPropName !== "—"
      ? `-${scopedExportPropName.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-")}`
      : "";
    return `${base}${prop}-${format(new Date(), "yyyy-MM-dd")}.${ext}`;
  };

  const runExport = async () => {
    setDownloading(true);
    const filename = exportFilename(exportReport, exportFmt);
    try {
      await apiDownload(
        foodApi.reportsExportFmtUrl(exportFmt, buildExportParams(exportReport)),
        filename,
      );
      toast({ title: "Export ready", description: filename });
    } catch (e: any) {
      toast({ title: e?.message || "Download failed", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Reports"
        subtitle="Order volume, meal mix, resident demand, and fulfilment status"
      />

      {/* KPI summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard title="Total Orders" value={isLoading ? 0 : totalOrders} icon={ClipboardList} />
        <StatCard title="Peak Residents" value={isLoading ? 0 : peakResidents} icon={Users} />
      </div>

      {/* O15/O16 — On-time delivery widget + (admin) tolerance config */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="w-4 h-4 text-accent" /> On-Time Delivery
          </CardTitle>
          {/* O16 — SUPER_ADMIN only inline tolerance control. */}
          {isSuperAdmin && (
            <div className="flex flex-col items-end gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Preferable arrival within
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={240}
                  value={toleranceDraft}
                  onChange={(e) => setToleranceDraft(e.target.value)}
                  className="w-20 text-right tabular-nums"
                  aria-label="On-time tolerance in minutes"
                />
                <span className="text-sm text-muted-foreground">min of service time</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    saveTolerance.isPending ||
                    toleranceDraft === "" ||
                    toleranceDraft === String(tolerance?.minutes ?? "")
                  }
                  onClick={() => saveTolerance.mutate(toleranceDraft)}
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  {saveTolerance.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
            {/* Big % on-time */}
            <div className="flex flex-col gap-1">
              {onTimeLoading ? (
                <Skeleton className="h-12 w-28" />
              ) : (
                <span className="text-4xl font-bold tabular-nums text-foreground">
                  {(onTime?.onTimePct ?? 0).toFixed(1)}%
                </span>
              )}
              <p className="text-sm text-muted-foreground">
                {onTimeLoading
                  ? "Loading…"
                  : `${onTime?.onTimeCount ?? 0} on-time / ${onTime?.lateCount ?? 0} late of ${onTime?.totalDelivered ?? 0} delivered`}
              </p>
              {!isSuperAdmin && (
                <p className="text-xs text-muted-foreground">
                  Within {onTime?.toleranceMinutes ?? tolerance?.minutes ?? 45} min of service time
                </p>
              )}
            </div>
            {/* Per-day on-time/late trend */}
            <div className="lg:col-span-2" style={{ height: 180 }}>
              {onTimeLoading ? (
                <ChartSkeleton />
              ) : onTimeByDay.length === 0 ? (
                <ChartEmpty icon={Timer} label="No deliveries in this range" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={onTimeByDay} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tickFormatter={dayTickFmt} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={dayTickFmt} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="onTime" name="On-time" stackId="d" fill={SUCCESS} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="late" name="Late" stackId="d" fill={WARNING} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Period segmented control */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-lg border border-border bg-card p-1">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPeriod(p.key)}
              aria-pressed={period === p.key}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                period === p.key
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {format(new Date(from), "dd MMM yyyy")} – {format(new Date(to), "dd MMM yyyy")}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <CalendarRange className="w-3 h-3" /> From
          </Label>
          <DatePicker value={from} max={to} onChange={setFrom} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">To</Label>
          <DatePicker value={to} min={from} max={today} onChange={setTo} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Property</Label>
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Property" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Properties</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Brand</Label>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Brands</SelectItem>
              {BRANDS.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Segmented analytics — only a couple of charts render per view */}
      <Tabs defaultValue="volume" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="volume" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Volume
          </TabsTrigger>
          <TabsTrigger value="status" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" /> Status
          </TabsTrigger>
          <TabsTrigger value="waste" className="gap-1.5">
            <TrendingDown className="h-3.5 w-3.5" /> Waste &amp; Delays
          </TabsTrigger>
        </TabsList>

        {/* Volume — resident demand */}
        <TabsContent value="volume" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" /> Resident Trend
              </CardTitle>
            </CardHeader>
            <CardContent style={{ height: 300 }}>
              {isLoading ? (
                <ChartSkeleton />
              ) : residentTrend.length === 0 ? (
                <ChartEmpty icon={Users} label="No resident data in this range" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={residentTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tickFormatter={dayTickFmt} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={dayTickFmt} />
                    <Line type="monotone" dataKey="residents" name="Residents" stroke={PRIMARY} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Status — fulfilment breakdown */}
        <TabsContent value="status" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-accent" /> Status Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent style={{ height: 340 }}>
              {isLoading ? (
                <ChartSkeleton />
              ) : statusChartData.length === 0 ? (
                <ChartEmpty icon={ClipboardList} label="No status data in this range" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Orders" radius={[4, 4, 0, 0]}>
                      {statusChartData.map((d, i) => (
                        <Cell key={i} fill={STATUS_COLOR[d.status as OrderStatus] ?? PRIMARY} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Waste & Delays — analytics scope */}
        <TabsContent value="waste" className="mt-4 space-y-4">
          {/* Summary tiles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title="Total Wasted"
              value={analyticsLoading ? 0 : (summary?.totalWasted ?? 0)}
              icon={Trash2}
            />
            <StatCard
              title="Waste %"
              value={analyticsLoading ? "0%" : `${summary?.wastePct ?? 0}%`}
              icon={TrendingDown}
            />
            <StatCard
              title="Delayed Deliveries"
              value={
                analyticsLoading
                  ? "0 / 0 delivered"
                  : `${summary?.delayedOrders ?? 0} / ${summary?.deliveredOrders ?? 0} delivered`
              }
              icon={Clock}
            />
          </div>

          {/* Wastage trend + Top wastage items */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-accent" /> Wastage Trend
                </CardTitle>
              </CardHeader>
              <CardContent style={{ height: 300 }}>
                {analyticsLoading ? (
                  <ChartSkeleton />
                ) : wastageTrend.length === 0 ? (
                  <ChartEmpty icon={Trash2} label="No wastage recorded in this range" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={wastageTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="wasteGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={WARNING} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={WARNING} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tickFormatter={dayTickFmt} tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip labelFormatter={dayTickFmt} />
                      <Area type="monotone" dataKey="wasted" name="Wasted" stroke={WARNING} strokeWidth={2} fill="url(#wasteGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-accent" /> Top Wastage Items
                </CardTitle>
              </CardHeader>
              <CardContent style={{ height: 300 }}>
                {analyticsLoading ? (
                  <ChartSkeleton />
                ) : topWasteChartData.length === 0 ? (
                  <ChartEmpty icon={UtensilsCrossed} label="No wasted items in this range" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topWasteChartData}
                      layout="vertical"
                      margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={110}
                        tick={{ fontSize: 11 }}
                        interval={0}
                      />
                      <Tooltip
                        formatter={(val: any, _n: any, item: any) => [
                          `${val} ${item?.payload?.unit ?? ""}`.trim(),
                          `Wasted (${item?.payload?.wastePct ?? 0}%)`,
                        ]}
                      />
                      <Bar dataKey="wasted" name="Wasted" fill={DESTRUCTIVE} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Delivery delays */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent" /> Delivery Delays
              </CardTitle>
            </CardHeader>
            <CardContent style={{ height: 320 }}>
              {analyticsLoading ? (
                <ChartSkeleton />
              ) : delays.length === 0 ? (
                <ChartEmpty icon={Clock} label="No delivery data in this range" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={delays} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tickFormatter={dayTickFmt} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={dayTickFmt} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="total" name="Delivered" fill={INFO} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="delayed" name="Delayed" fill={WARNING} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* O17 — Ordered vs Received variance by day (bar chart + meal badges) */}
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="w-4 h-4 text-accent" /> Variance by Day
          </CardTitle>
          {/* Meal filter badges — selecting one refetches with that mealType. */}
          <div className="flex flex-wrap gap-2">
            {MEAL_FILTERS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMealFilter(m.key)}
                aria-pressed={mealFilter === m.key}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  mealFilter === m.key
                    ? "bg-accent text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent style={{ height: 340 }}>
          {varianceByDayLoading ? (
            <ChartSkeleton />
          ) : !varianceByDayRows.some((r) => r.ordered || r.received || r.wasted) ? (
            <ChartEmpty icon={Scale} label="No order data in this range" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={varianceByDayRows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tickFormatter={dayTickFmt} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={dayTickFmt} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ordered" name="Ordered" fill={INFO} radius={[4, 4, 0, 0]} />
                <Bar dataKey="received" name="Received" fill={SUCCESS} radius={[4, 4, 0, 0]} />
                <Bar dataKey="wasted" name="Wasted" fill={DESTRUCTIVE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* O20 — Export: format radios + report dropdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4 text-accent" /> Export
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-6">
          {/* Format radio row */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Format</Label>
            <div className="flex items-center gap-4" role="radiogroup" aria-label="Export format">
              {EXPORT_FORMATS.map((f) => (
                <label key={f.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="export-format"
                    value={f.key}
                    checked={exportFmt === f.key}
                    onChange={() => setExportFmt(f.key)}
                    className="accent-[var(--accent)]"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
          {/* Report dropdown */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Report</Label>
            <Select value={exportReport} onValueChange={(v) => setExportReport(v as ExportReport)}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Report" /></SelectTrigger>
              <SelectContent>
                {EXPORT_REPORTS.map((r) => (
                  <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="bg-accent hover:bg-accent/90 text-white"
            disabled={downloading}
            onClick={runExport}
          >
            <FileText className="w-4 h-4 mr-2" />
            {downloading ? "Preparing…" : "Download"}
          </Button>
        </CardContent>
      </Card>

      {/* Property filter context footnote */}
      {propertyId !== "ALL" && (
        <p className="text-xs text-muted-foreground">
          Showing data scoped to{" "}
          <button
            type="button"
            className="text-accent hover:underline font-medium"
            onClick={() => setLocation(withQuery("/food/orders", { propertyId }))}
          >
            {propName(propertyId)}
          </button>
          .
        </p>
      )}
    </div>
  );
}
