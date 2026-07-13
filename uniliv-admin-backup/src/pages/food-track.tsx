import * as React from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Search, PackageSearch, Loader2, Soup, Building2, CalendarDays, Users,
  Clock, Truck, ChefHat, ExternalLink, AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { OrderTimeline } from "@/components/order-timeline";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { foodApi, foodKeys, MEAL_LABEL, fmtQty, type OrderStatus } from "@/lib/food-api";
import { useQueryParam } from "@/lib/nav-helpers";
import { cn } from "@/lib/utils";

const fmtDateTime = (s?: string | null) => (s ? format(new Date(s), "dd MMM, HH:mm") : "—");
const fmtDate = (s?: string | null) => (s ? format(new Date(s), "EEE, dd MMM yyyy") : "—");

export default function FoodTrack() {
  const [, navigate] = useLocation();
  // Pre-fill from ?order=<orderNumber> or ?id=<uuid>.
  const paramOrder = useQueryParam("order");
  const paramId = useQueryParam("id");
  const initial = paramOrder ?? paramId ?? "";

  const [input, setInput] = React.useState(initial);
  // The submitted term that actually drives the lookup (so typing doesn't refetch).
  const [term, setTerm] = React.useState(initial.trim());

  // Keep the query in sync when the URL param changes (success-page links).
  React.useEffect(() => {
    const next = (paramOrder ?? paramId ?? "").trim();
    if (next) { setInput(next); setTerm(next); }
  }, [paramOrder, paramId]);

  const { data: order, isLoading, isError, error, isFetching } = useQuery({
    queryKey: foodKeys.trackOrder(term),
    queryFn: () => foodApi.trackOrder(term),
    enabled: !!term,
    retry: false,
  });

  // The user's ACTIVE orders, offered as a quick-pick instead of typing an id.
  const { data: activeOrders = [] } = useQuery({
    queryKey: foodKeys.orders({ status: "PLACED,PREPARING,DISPATCHED", limit: 100, scope: "track-active" }),
    queryFn: () => foodApi.listOrders({ status: "PLACED,PREPARING,DISPATCHED", limit: 100 }).then((r) => r.data),
  });

  // Run the tracking lookup for a given order number (shared by the form + picker).
  const runLookup = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setInput(t);
    setTerm(t);
    // Reflect the lookup in the URL so it can be shared / refreshed.
    navigate(`/food/track?order=${encodeURIComponent(t)}`, { replace: true });
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    runLookup(input);
  };

  const events = order?.events ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Track an order"
        subtitle="Enter an order number to follow its kitchen-to-delivery status."
        breadcrumbs={[{ label: "Food", href: "/food/orders" }, { label: "Track" }]}
      />

      <Card className="mx-auto w-full max-w-3xl">
        <CardContent className="p-4">
          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="track-input" className="text-xs text-muted-foreground">Order number or ID</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="track-input" value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g. ORD-2026-000123" className="pl-9 font-mono" autoComplete="off" />
              </div>
            </div>
            <Button type="submit" disabled={!input.trim() || isFetching}>
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageSearch className="mr-2 h-4 w-4" />}
              Track
            </Button>
          </form>

          {activeOrders.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Or pick an active order</Label>
              <Select value={term || undefined} onValueChange={(v) => runLookup(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select one of your active orders…" />
                </SelectTrigger>
                <SelectContent>
                  {activeOrders.map((o) => (
                    <SelectItem key={o.id} value={o.orderNumber}>
                      <span className="font-mono">{o.orderNumber}</span>
                      {" · "}{MEAL_LABEL[o.mealType] ?? o.mealType}{" · "}{o.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mx-auto w-full max-w-3xl">
        {!term ? (
          <Card><CardContent className="py-10">
            <EmptyState icon={PackageSearch} title="Track any order" description="Paste an order number above to see its current status and timeline." />
          </CardContent></Card>
        ) : isLoading ? (
          <Card><CardContent className="space-y-3 py-6">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </CardContent></Card>
        ) : isError || !order ? (
          <Card><CardContent className="py-10">
            <EmptyState icon={AlertCircle} title="Order not found"
              description={(error as any)?.message || "No order matches that number in your accessible properties."} />
          </CardContent></Card>
        ) : (
          <div className="space-y-5">
            {/* Header card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="font-display flex items-center gap-2 text-base">
                      <Soup className="h-5 w-5 text-accent" /> {MEAL_LABEL[order.mealType] ?? order.mealType}
                    </CardTitle>
                    <CardDescription className="mt-1 font-mono text-xs">{order.orderNumber}</CardDescription>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                <Stat icon={Building2} label="Property">{order.propertyName ?? "—"}</Stat>
                <Stat icon={CalendarDays} label="Service date">{fmtDate(order.serviceDate)}</Stat>
                <Stat icon={Users} label="People">{order.residentsCount}</Stat>
                <Stat icon={ChefHat} label="Brand">{order.brand}</Stat>
              </CardContent>
            </Card>

            {/* Timeline — order journey from placement to delivery */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4 text-accent" /> Timeline</CardTitle>
                <CardDescription>Order journey from placement to delivery.</CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="p-4 sm:p-6">
                <OrderTimeline status={order.status} events={events} />
              </CardContent>
            </Card>

            {/* Items */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display">Items</CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="p-0">
                <ul className="divide-y">
                  {(order.items ?? []).map((it) => (
                    <li key={it.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span className="truncate">{it.dishName ?? it.dishId}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{fmtQty(it.orderedQty, it.unit)}</span>
                    </li>
                  ))}
                  {(order.items ?? []).length === 0 && (
                    <li className="px-4 py-4 text-sm text-muted-foreground">No items on this order.</li>
                  )}
                </ul>
              </CardContent>
            </Card>

            {/* Dispatch info (when present) */}
            {order.dispatch && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4 text-accent" /> Delivery</CardTitle>
                </CardHeader>
                <Separator />
                <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                  <Stat icon={Truck} label="Vehicle">{order.dispatch.vehicleNumber ?? "—"}</Stat>
                  <Stat icon={Users} label="Driver">{order.dispatch.driverName ?? "—"}</Stat>
                  <Stat icon={Clock} label="ETA">{fmtDateTime(order.dispatch.estimatedArrivalAt)}</Stat>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end">
              <Button asChild variant="outline" size="sm">
                <Link href={`/food/orders/${order.id}`}>
                  Open full order detail <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className="truncate text-sm font-medium">{children}</span>
    </div>
  );
}
