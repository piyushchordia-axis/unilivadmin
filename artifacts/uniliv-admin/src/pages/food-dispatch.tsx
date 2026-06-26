import * as React from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Truck, Package, Clock, Users, Boxes, MapPin, CheckCircle2, Send, Inbox, X,
  ChefHat, User, Phone, Hash, Timer, Route, ChevronRight, PackageCheck,
  Check, ChevronsUpDown, History, Ban, AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { GlobalPropertyScopeBanner } from "@/components/property-scope-banner";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BoundedScroll } from "@/components/ui/bounded-scroll";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/store";
import {
  foodApi, foodKeys, MEAL_TYPES, BRANDS, MEAL_LABEL, fmtQty,
  type FoodOrder, type FoodBrand, type MealType,
  type Dispatch, type DispatchStatus, type DispatchDetailOrder,
} from "@/lib/food-api";

const ALL = "ALL";

// Queue rows are FoodOrders that MAY also carry the enriched delivery/contact
// fields (present on dispatch-detail orders; optional on the list endpoint).
type QueueOrder = FoodOrder & {
  deliveryAddress?: string | null;
  deliveryPincode?: string | null;
  unitLeadPhone?: string | null;
};

// Dispatch state machine — legal next states per current status. Terminal
// states (DELIVERED / CANCELLED) have none. "CANCELLED" is a server status that
// is not part of the badge-meta union, so it is keyed loosely.
const DISPATCH_TRANSITIONS: Record<string, DispatchStatus[]> = {
  LOADING: ["IN_TRANSIT", "CANCELLED" as DispatchStatus],
  IN_TRANSIT: ["DELIVERED", "PARTIAL", "CANCELLED" as DispatchStatus],
  PARTIAL: ["DELIVERED", "IN_TRANSIT"],
  DELIVERED: [],
  CANCELLED: [],
};

const DISPATCH_STATUS_META: Record<
  string,
  { label: string; variant: "secondary" | "info" | "success" | "warning" | "destructive"; icon: React.ElementType }
> = {
  LOADING: { label: "Loading", variant: "secondary", icon: Boxes },
  IN_TRANSIT: { label: "In transit", variant: "info", icon: Truck },
  DELIVERED: { label: "Delivered", variant: "success", icon: PackageCheck },
  PARTIAL: { label: "Partial", variant: "warning", icon: Timer },
  CANCELLED: { label: "Cancelled", variant: "destructive", icon: Ban },
};

function DispatchStatusBadge({ status }: { status: DispatchStatus }) {
  const meta = DISPATCH_STATUS_META[status] ?? DISPATCH_STATUS_META.LOADING;
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className="gap-1">
      <Icon className="w-3 h-3" /> {meta.label}
    </Badge>
  );
}

export default function FoodDispatch() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { propertyId: storeProperty, setPropertyId: setGlobalProperty } = useAppStore();

  const [tab, setTab] = React.useState<"queue" | "transit" | "trips">("queue");
  const [propertyId, setPropertyId] = React.useState<string>(storeProperty ?? ALL);
  // One scope: filter changes push to the global store (so the sidebar selector
  // + scope banner update); global changes mirror back into the local filter.
  React.useEffect(() => { setPropertyId(storeProperty ?? ALL); }, [storeProperty]);
  const selectProperty = (v: string) => {
    setPropertyId(v);
    setGlobalProperty(v === ALL ? null : v);
  };
  const [brand, setBrand] = React.useState<FoodBrand | typeof ALL>(ALL);
  const [meal, setMeal] = React.useState<MealType | typeof ALL>(ALL);
  const [date, setDate] = React.useState("");

  // Per-card chosen partner (single dispatch) and bulk selection
  const [cardPartner, setCardPartner] = React.useState<Record<string, string>>({});
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkPartner, setBulkPartner] = React.useState("");

  // Trip-builder drawer state
  const [tripOpen, setTripOpen] = React.useState(false);
  const [tripForm, setTripForm] = React.useState({
    kitchenId: "",
    deliveryPartnerId: "", // agency id
    vehicleId: "",
    vehicleNumber: "",
    // When a vehicle is picked from the list, vehicleNumber is auto-filled and the
    // free-text field is locked (read-only) to fix the number↔vehicle desync. The
    // user can explicitly "clear to override" to type a custom number.
    vehicleLocked: false,
    driverName: "",
    driverPhone: "",
    etaMinutes: "",
  });

  // Trip-detail sheet state
  const [openTripId, setOpenTripId] = React.useState<string | null>(null);

  // ── Lookups (properties + delivery partners) ──────────────────────────────
  const { data: lookups } = useQuery({
    queryKey: foodKeys.lookups(),
    queryFn: () => foodApi.lookups(),
  });
  const properties = lookups?.properties ?? [];
  const partners = lookups?.deliveryPartners ?? [];
  const agencies = lookups?.agencies ?? [];
  const tripAgency = agencies.find((a) => a.id === tripForm.deliveryPartnerId);
  const propName = (id?: string | null) =>
    id ? properties.find((p) => p.id === id)?.name ?? "—" : "—";
  const partnerName = (id?: string | null) =>
    id ? partners.find((p) => p.id === id)?.name ?? "—" : "—";

  // ── Kitchens (for trip builder) ───────────────────────────────────────────
  const { data: kitchens = [] } = useQuery({
    queryKey: foodKeys.kitchens(),
    queryFn: () => foodApi.listKitchens(),
  });

  // ── Vehicles already on an active (LOADING/IN_TRANSIT) trip — to disable in
  //    the vehicle picker. Refetch alongside trip mutations via invalidation.
  const { data: activeVehicleIds = [] } = useQuery({
    queryKey: foodKeys.activeVehicles(),
    queryFn: () => foodApi.getActiveVehicles(),
  });
  const activeVehicleSet = React.useMemo(() => new Set(activeVehicleIds), [activeVehicleIds]);

  // ── Effective property scope: explicit filter wins, else global store ──────
  const effectiveProperty =
    propertyId !== ALL ? propertyId : storeProperty ?? undefined;

  // ── Shared filter params ──────────────────────────────────────────────────
  const filterParams: Record<string, unknown> = {
    propertyId: effectiveProperty,
    brand: brand === ALL ? undefined : brand,
    mealType: meal === ALL ? undefined : meal,
    serviceDate: date || undefined,
  };

  const preparingParams = { ...filterParams, status: "PREPARING", limit: 100 };
  const acceptedParams = { ...filterParams, status: "ACCEPTED", limit: 100 };
  const dispatchedParams = { ...filterParams, status: "DISPATCHED", limit: 100 };

  const { data: preparingRes, isLoading: loadingPreparing } = useQuery({
    queryKey: foodKeys.orders(preparingParams),
    queryFn: () => foodApi.listOrders(preparingParams),
  });
  const { data: acceptedRes, isLoading: loadingAccepted } = useQuery({
    queryKey: foodKeys.orders(acceptedParams),
    queryFn: () => foodApi.listOrders(acceptedParams),
  });

  // Dispatchable board = PREPARING (primary) + ACCEPTED (ready to load). Rows may
  // carry the enriched delivery/unit-lead contact fields when the API provides them.
  const dispatchable = React.useMemo<QueueOrder[]>(() => {
    const prep = preparingRes?.data ?? [];
    const acc = acceptedRes?.data ?? [];
    const seen = new Set(prep.map((o) => o.id));
    return [...prep, ...acc.filter((o) => !seen.has(o.id))];
  }, [preparingRes, acceptedRes]);
  const loadingQueue = loadingPreparing || loadingAccepted;

  const { data: dispatchedRes, isLoading: loadingDispatched } = useQuery({
    queryKey: foodKeys.orders(dispatchedParams),
    queryFn: () => foodApi.listOrders(dispatchedParams),
  });
  const dispatched = dispatchedRes?.data ?? [];

  // ── Recent trips ──────────────────────────────────────────────────────────
  const { data: trips = [], isLoading: loadingTrips } = useQuery({
    queryKey: foodKeys.dispatches(),
    queryFn: () => foodApi.listDispatches(),
  });

  // ── Kitchens implied by the current selection (to filter serving agencies) ──
  const selectedKitchenIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const o of dispatchable) {
      if (selected.has(o.id) && o.kitchenId) ids.add(o.kitchenId);
    }
    return ids;
  }, [dispatchable, selected]);

  // Agencies that serve at least one of the selected orders' kitchens. When the
  // selection has no resolved kitchen (or none match), fall back to all agencies
  // so the picker is never empty.
  const servingAgencies = React.useMemo(() => {
    if (selectedKitchenIds.size === 0) return agencies;
    const matched = agencies.filter((a) =>
      (a.kitchenIds ?? []).some((kid) => selectedKitchenIds.has(kid)),
    );
    return matched.length > 0 ? matched : agencies;
  }, [agencies, selectedKitchenIds]);

  // Prune stale selection when the queue changes
  React.useEffect(() => {
    const ids = new Set(dispatchable.map((o) => o.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [dispatchable]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["food"] });
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const dispatchOne = useMutation({
    mutationFn: ({ id, deliveryPartnerId }: { id: string; deliveryPartnerId: string }) =>
      foodApi.dispatchOrder(id, { deliveryPartnerId, action: "dispatch" }),
    onSuccess: (_d, vars) => {
      toast({ title: "Order dispatched" });
      setSelected((prev) => { const n = new Set(prev); n.delete(vars.id); return n; });
      invalidate();
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to dispatch", variant: "destructive" }),
  });

  const dispatchBulk = useMutation({
    mutationFn: ({ ids, deliveryPartnerId }: { ids: string[]; deliveryPartnerId: string }) =>
      foodApi.bulkDispatch(ids, deliveryPartnerId),
    onSuccess: (_d, vars) => {
      toast({ title: `Dispatched ${vars.ids.length} order${vars.ids.length === 1 ? "" : "s"}` });
      setSelected(new Set());
      setBulkPartner("");
      invalidate();
    },
    onError: (e: any) => toast({ title: e?.message || "Bulk dispatch failed", variant: "destructive" }),
  });

  const createTrip = useMutation({
    mutationFn: (body: Record<string, unknown>) => foodApi.createDispatch(body),
    onSuccess: (trip) => {
      toast({
        title: "Dispatch trip created",
        description: trip?.dispatchNumber ? `Trip ${trip.dispatchNumber} is loading` : undefined,
      });
      setSelected(new Set());
      setTripForm({ kitchenId: "", deliveryPartnerId: "", vehicleId: "", vehicleNumber: "", vehicleLocked: false, driverName: "", driverPhone: "", etaMinutes: "" });
      setTripOpen(false);
      invalidate();
    },
    onError: (e: any) => toast({ title: e?.message || "Could not create trip", variant: "destructive" }),
  });

  const onDispatchOne = (o: FoodOrder) => {
    const dp = cardPartner[o.id];
    if (!dp) { toast({ title: "Select a delivery partner first", variant: "destructive" }); return; }
    dispatchOne.mutate({ id: o.id, deliveryPartnerId: dp });
  };

  const onBulkDispatch = () => {
    if (selected.size === 0) return;
    if (!bulkPartner) { toast({ title: "Select a delivery partner", variant: "destructive" }); return; }
    dispatchBulk.mutate({ ids: [...selected], deliveryPartnerId: bulkPartner });
  };

  const onCreateTrip = () => {
    if (selected.size === 0) {
      toast({ title: "Select at least one order", variant: "destructive" });
      return;
    }
    if (!tripForm.deliveryPartnerId) {
      toast({ title: "Choose an agency", variant: "destructive" });
      return;
    }
    const eta = tripForm.etaMinutes.trim();
    createTrip.mutate({
      orderIds: [...selected],
      kitchenId: tripForm.kitchenId || undefined,
      agencyId: tripForm.deliveryPartnerId,
      vehicleId: tripForm.vehicleId || undefined,
      vehicleNumber: tripForm.vehicleNumber.trim() || undefined,
      driverName: tripForm.driverName.trim() || undefined,
      driverPhone: tripForm.driverPhone.trim() || undefined,
      etaMinutes: eta ? Number(eta) : undefined,
    });
  };

  const toggleSelect = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id); else n.delete(id);
      return n;
    });

  const totalQ = (o: FoodOrder) => fmtQty(o.totalQuantity);
  const partnerListReady = partners.length > 0;

  // ── Stats ─────────────────────────────────────────────────────────────────
  const awaiting = dispatchable.length;
  const inTransit = dispatched.length;
  const residentsWaiting = dispatchable.reduce((s, o) => s + (o.residentsCount || 0), 0);
  const activeTrips = trips.filter((t) => t.status === "LOADING" || t.status === "IN_TRANSIT").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispatch"
        subtitle="Build trips, assign vans and drivers, and move prepared meals out the door"
        action={
          <Button variant="outline" onClick={() => setLocation("/food/orders")}>
            <Package className="w-4 h-4 mr-2" /> All Orders
          </Button>
        }
      />

      <GlobalPropertyScopeBanner properties={lookups?.properties} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Awaiting Dispatch" value={awaiting} icon={Clock} />
        <StatCard title="In Transit" value={inTransit} icon={Truck} />
        <StatCard title="Residents Waiting" value={residentsWaiting} icon={Users} />
        <StatCard title="Active Trips" value={activeTrips} icon={Route} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={propertyId} onValueChange={selectProperty}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Property" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Properties</SelectItem>
            {properties.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={brand} onValueChange={(v) => setBrand(v as FoodBrand | typeof ALL)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Brand" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Brands</SelectItem>
            {BRANDS.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={meal} onValueChange={(v) => setMeal(v as MealType | typeof ALL)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Meal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Meals</SelectItem>
            {MEAL_TYPES.map((m) => (<SelectItem key={m} value={m}>{MEAL_LABEL[m]}</SelectItem>))}
          </SelectContent>
        </Select>
        <DatePicker value={date} onChange={setDate} className="w-44" />
        {date && (
          <Button variant="ghost" size="sm" onClick={() => setDate("")} className="text-muted-foreground">
            <X className="w-4 h-4 mr-1" /> Clear date
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "queue" | "transit" | "trips")}>
        <TabsList>
          <TabsTrigger value="queue">
            Dispatch Queue
            {awaiting > 0 && <Badge variant="secondary" className="ml-2 text-[10px]">{awaiting}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="transit">
            In Transit
            {inTransit > 0 && <Badge variant="secondary" className="ml-2 text-[10px]">{inTransit}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="trips">
            Trips
            {trips.length > 0 && <Badge variant="secondary" className="ml-2 text-[10px]">{trips.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── QUEUE: dispatchable orders (PREPARING + ACCEPTED) ─────────────── */}
        <TabsContent value="queue" className="mt-4">
          {loadingQueue ? (
            <CardGridSkeleton />
          ) : dispatchable.length === 0 ? (
            <LocalEmpty
              icon={CheckCircle2}
              title="Nothing waiting to dispatch"
              hint="Prepared and accepted orders ready for a trip will appear here. Adjust the filters above to widen the view."
            />
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                  Select orders to bundle into a single dispatch trip, or dispatch one at a time.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() =>
                    setSelected((prev) =>
                      prev.size === dispatchable.length ? new Set() : new Set(dispatchable.map((o) => o.id)),
                    )
                  }
                >
                  {selected.size === dispatchable.length ? "Clear all" : "Select all"}
                </Button>
              </div>
              <BoundedScroll size="page">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 px-0.5 pt-0.5 pb-28">
                {dispatchable.map((o) => {
                  const isSel = selected.has(o.id);
                  return (
                    <Card
                      key={o.id}
                      className={`overflow-hidden transition-colors ${isSel ? "ring-2 ring-accent border-accent" : ""}`}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-3 min-w-0">
                            <Checkbox
                              checked={isSel}
                              onCheckedChange={(v) => toggleSelect(o.id, !!v)}
                              className="mt-1"
                              aria-label="Select order for dispatch trip"
                            />
                            <div className="min-w-0">
                              <p className="font-medium text-primary truncate">{o.propertyName || propName(o.propertyId)}</p>
                              <p className="font-mono text-xs text-muted-foreground">{o.orderNumber}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{o.brand}</Badge>
                            <StatusBadge status={o.status} />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-sm border-y py-3">
                          <div>
                            <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Meal</p>
                            <p className="font-medium">{MEAL_LABEL[o.mealType]}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Residents</p>
                            <p className="font-medium">{o.residentsCount}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Total Qty</p>
                            <p className="font-medium">{totalQ(o)}</p>
                          </div>
                        </div>

                        {/* Delivery destination + unit-lead contact */}
                        <div className="space-y-1 text-xs">
                          <p className="flex items-start gap-1.5 text-foreground">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-px shrink-0" />
                            <span className="min-w-0">
                              {o.deliveryAddress ? (
                                <>
                                  {o.deliveryAddress}
                                  {o.deliveryPincode ? <span className="text-muted-foreground"> · {o.deliveryPincode}</span> : null}
                                </>
                              ) : (
                                <span className="text-muted-foreground">{o.propertyName || propName(o.propertyId)}</span>
                              )}
                            </span>
                          </p>
                          <p className="flex items-center gap-1.5 text-muted-foreground">
                            <User className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{o.unitLeadName || "Unit-lead unassigned"}</span>
                            {o.unitLeadPhone && (
                              <a href={`tel:${o.unitLeadPhone}`} className="font-mono text-foreground hover:text-accent inline-flex items-center gap-1">
                                <Phone className="w-3 h-3" />{o.unitLeadPhone}
                              </a>
                            )}
                          </p>
                        </div>

                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {o.preparingAt
                            ? `Prepared ${format(new Date(o.preparingAt), "dd MMM, HH:mm")}`
                            : o.acceptedAt
                              ? `Accepted ${format(new Date(o.acceptedAt), "dd MMM, HH:mm")}`
                              : "Awaiting preparation"}
                        </p>

                        <div className="flex items-center gap-2 pt-1">
                          <Select
                            value={cardPartner[o.id] ?? ""}
                            onValueChange={(v) => setCardPartner((prev) => ({ ...prev, [o.id]: v }))}
                            disabled={!partnerListReady}
                          >
                            <SelectTrigger className="flex-1 h-9">
                              <SelectValue placeholder="Quick dispatch partner" />
                            </SelectTrigger>
                            <SelectContent>
                              {partners.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onDispatchOne(o)}
                            disabled={dispatchOne.isPending}
                          >
                            <Send className="w-4 h-4 mr-1.5" /> Send
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                </div>
              </BoundedScroll>
            </>
          )}
        </TabsContent>

        {/* ── IN TRANSIT: DISPATCHED orders, read-only tracking ───────────── */}
        <TabsContent value="transit" className="mt-4">
          {loadingDispatched ? (
            <CardGridSkeleton />
          ) : dispatched.length === 0 ? (
            <LocalEmpty
              icon={Inbox}
              title="No orders in transit"
              hint="Once you dispatch an order it will show here with its delivery partner and dispatch time until delivery is confirmed."
            />
          ) : (
            <BoundedScroll size="page">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 px-0.5 py-0.5">
              {dispatched.map((o) => (
                <Card key={o.id} className="overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-primary truncate">{o.propertyName || propName(o.propertyId)}</p>
                        <p className="font-mono text-xs text-muted-foreground">{o.orderNumber}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{o.brand}</Badge>
                        <StatusBadge status={o.status} />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm border-y py-3">
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Meal</p>
                        <p className="font-medium">{MEAL_LABEL[o.mealType]}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Residents</p>
                        <p className="font-medium">{o.residentsCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Total Qty</p>
                        <p className="font-medium">{totalQ(o)}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <p className="flex items-center gap-1.5 text-foreground">
                        <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-medium">{o.deliveryPartnerName || partnerName(o.deliveryPartnerId)}</span>
                      </p>
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        {o.dispatchedAt
                          ? `Dispatched ${format(new Date(o.dispatchedAt), "dd MMM, HH:mm")}`
                          : "Dispatch time unavailable"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              </div>
            </BoundedScroll>
          )}
        </TabsContent>

        {/* ── TRIPS: recent dispatch trips ─────────────────────────────────── */}
        <TabsContent value="trips" className="mt-4">
          {loadingTrips ? (
            <CardGridSkeleton />
          ) : trips.length === 0 ? (
            <LocalEmpty
              icon={Route}
              title="No dispatch trips yet"
              hint="Bundle prepared orders from the Dispatch Queue into a trip with a van and driver. Active and past trips will appear here."
            />
          ) : (
            <BoundedScroll size="page">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 px-0.5 py-0.5">
              {trips.map((t) => (
                <TripCard
                  key={t.id}
                  trip={t}
                  onOpen={() => setOpenTripId(t.id)}
                />
              ))}
              </div>
            </BoundedScroll>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Sticky action bar: create trip + bulk quick dispatch ──────────── */}
      {tab === "queue" && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(760px,calc(100%-2rem))]">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card shadow-lg px-4 py-3">
            <div className="flex items-center gap-2 shrink-0">
              <Boxes className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">{selected.size} selected</span>
            </div>
            <Button
              className="bg-accent hover:bg-accent/90 text-white shrink-0"
              onClick={() => setTripOpen(true)}
            >
              <Route className="w-4 h-4 mr-2" /> Create dispatch trip ({selected.size})
            </Button>
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <Select value={bulkPartner} onValueChange={setBulkPartner} disabled={!partnerListReady}>
                <SelectTrigger className="flex-1 h-9">
                  <SelectValue placeholder="Quick dispatch partner" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="shrink-0"
                onClick={onBulkDispatch}
                disabled={dispatchBulk.isPending}
              >
                <Send className="w-4 h-4 mr-2" /> Quick send
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setSelected(new Set())} aria-label="Clear selection">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Create trip drawer (bottom sheet) ─────────────────────────────── */}
      <Drawer open={tripOpen} onOpenChange={setTripOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-2xl">
            <DrawerHeader>
              <DrawerTitle className="flex items-center gap-2">
                <Route className="w-5 h-5 text-accent" /> New dispatch trip
              </DrawerTitle>
              <DrawerDescription>
                Bundling {selected.size} order{selected.size === 1 ? "" : "s"} onto one van.
              </DrawerDescription>
            </DrawerHeader>

            <div className="px-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <ChefHat className="w-3.5 h-3.5 text-muted-foreground" /> Kitchen
                </Label>
                <Select
                  value={tripForm.kitchenId}
                  onValueChange={(v) => setTripForm((f) => ({ ...f, kitchenId: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select kitchen (optional)" /></SelectTrigger>
                  <SelectContent>
                    {kitchens.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">No kitchens configured</div>
                    ) : (
                      kitchens.map((k) => (
                        <SelectItem key={k.id} value={k.id}>{k.name} ({k.code})</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-muted-foreground" /> Agency
                </Label>
                <Combobox
                  options={servingAgencies.map<ComboboxOption>((a) => ({ value: a.id, label: a.name }))}
                  value={tripForm.deliveryPartnerId || null}
                  onChange={(v) =>
                    setTripForm((f) => ({
                      ...f,
                      deliveryPartnerId: v ?? "",
                      vehicleId: "",
                      vehicleNumber: "",
                      vehicleLocked: false,
                    }))
                  }
                  placeholder="Select agency"
                  searchPlaceholder="Search agencies…"
                  emptyText="No matching agency."
                  allowClear
                />
                {selectedKitchenIds.size > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Showing agencies that serve the selected orders' kitchen{selectedKitchenIds.size === 1 ? "" : "s"}.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-muted-foreground" /> Vehicle
                </Label>
                <VehiclePicker
                  vehicles={tripAgency?.vehicles ?? []}
                  value={tripForm.vehicleId || null}
                  activeVehicleSet={activeVehicleSet}
                  disabled={!tripAgency}
                  onChange={(vehId) => {
                    const veh = tripAgency?.vehicles.find((x) => x.id === vehId);
                    setTripForm((f) =>
                      vehId
                        ? { ...f, vehicleId: vehId, vehicleNumber: veh?.vehicleNumber ?? f.vehicleNumber, vehicleLocked: true }
                        : { ...f, vehicleId: "", vehicleLocked: false },
                    );
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground" /> Vehicle number
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="e.g. DL 1A 2345"
                    value={tripForm.vehicleNumber}
                    readOnly={tripForm.vehicleLocked}
                    className={cn(tripForm.vehicleLocked && "bg-muted text-muted-foreground")}
                    onChange={(e) => setTripForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
                  />
                  {tripForm.vehicleLocked && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground"
                      onClick={() => setTripForm((f) => ({ ...f, vehicleId: "", vehicleLocked: false }))}
                    >
                      <X className="w-3.5 h-3.5 mr-1" /> Clear to override
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-muted-foreground" /> ETA (minutes)
                </Label>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="e.g. 30"
                  value={tripForm.etaMinutes}
                  onChange={(e) => setTripForm((f) => ({ ...f, etaMinutes: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" /> Driver name
                </Label>
                <Input
                  placeholder="Driver name"
                  value={tripForm.driverName}
                  onChange={(e) => setTripForm((f) => ({ ...f, driverName: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" /> Driver mobile
                </Label>
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="Driver mobile"
                  value={tripForm.driverPhone}
                  onChange={(e) => setTripForm((f) => ({ ...f, driverPhone: e.target.value }))}
                />
              </div>
            </div>

            <DrawerFooter className="flex-row justify-end gap-2">
              <DrawerClose asChild>
                <Button variant="outline">Cancel</Button>
              </DrawerClose>
              <Button
                className="bg-accent hover:bg-accent/90 text-white"
                onClick={onCreateTrip}
                disabled={createTrip.isPending}
              >
                <Route className="w-4 h-4 mr-2" />
                {createTrip.isPending ? "Creating…" : `Create trip (${selected.size})`}
              </Button>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Trip detail sheet (side) ──────────────────────────────────────── */}
      <TripDetailSheet
        tripId={openTripId}
        onClose={() => setOpenTripId(null)}
        propName={propName}
        partnerName={partnerName}
      />
    </div>
  );
}

/* ── Trip summary card ──────────────────────────────────────────────────── */
function TripCard({ trip, onOpen }: { trip: Dispatch; onOpen: () => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="overflow-hidden cursor-pointer transition-colors hover:border-accent/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-sm font-medium text-primary truncate">{trip.dispatchNumber}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Boxes className="w-3.5 h-3.5" />
              {trip.orderCount ?? 0} order{(trip.orderCount ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          <DispatchStatusBadge status={trip.status} />
        </div>

        <Separator />

        <div className="space-y-1.5 text-xs">
          <p className="flex items-center gap-1.5 text-foreground">
            <ChefHat className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{trip.kitchenName || "Kitchen unassigned"}</span>
          </p>
          <p className="flex items-center gap-1.5 text-foreground">
            <Truck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{trip.partnerName || "Partner unassigned"}</span>
            {trip.vehicleNumber && (
              <span className="font-mono text-muted-foreground">· {trip.vehicleNumber}</span>
            )}
          </p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{trip.driverName || "Driver unassigned"}</span>
          </p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Timer className="w-3.5 h-3.5 shrink-0" />
            {trip.estimatedArrivalAt
              ? `ETA ${format(new Date(trip.estimatedArrivalAt), "dd MMM, HH:mm")}`
              : "ETA not set"}
          </p>
        </div>

        <div className="flex items-center justify-end text-xs text-accent font-medium pt-1">
          View trip <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Trip detail sheet (loads full dispatch) ────────────────────────────── */
function TripDetailSheet({
  tripId, onClose, propName, partnerName,
}: {
  tripId: string | null;
  onClose: () => void;
  propName: (id?: string | null) => string;
  partnerName: (id?: string | null) => string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: detail, isLoading } = useQuery({
    queryKey: foodKeys.dispatch(tripId ?? ""),
    queryFn: () => foodApi.getDispatch(tripId as string),
    enabled: !!tripId,
  });

  // Audit trail (newest-first).
  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: foodKeys.dispatchEvents(tripId ?? ""),
    queryFn: () => foodApi.getDispatchEvents(tripId as string),
    enabled: !!tripId,
  });

  // Invalidate this trip + the boards (orders/queue/list all live under ["food"]).
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["food"] });
    if (tripId) {
      qc.invalidateQueries({ queryKey: foodKeys.dispatch(tripId) });
      qc.invalidateQueries({ queryKey: foodKeys.dispatchEvents(tripId) });
    }
  };
  const onErr = (e: any) => toast({ title: e?.message || "Action failed", variant: "destructive" });

  // ── Trip-action mutations ──────────────────────────────────────────────
  const depart = useMutation({
    mutationFn: (id: string) => foodApi.departDispatch(id),
    onSuccess: () => { toast({ title: "Trip departed" }); invalidate(); },
    onError: onErr,
  });
  const transition = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DispatchStatus }) =>
      foodApi.updateDispatchStatus(id, status),
    onSuccess: (_d, vars) => { toast({ title: `Trip marked ${DISPATCH_STATUS_META[vars.status]?.label ?? vars.status}` }); invalidate(); },
    onError: onErr,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => foodApi.cancelDispatch(id),
    onSuccess: () => { toast({ title: "Trip cancelled" }); invalidate(); },
    onError: onErr,
  });
  const setDelivered = useMutation({
    mutationFn: ({ id, orderId, delivered }: { id: string; orderId: string; delivered: boolean }) =>
      foodApi.setOrderDelivered(id, orderId, { delivered, markTripDelivered: true }),
    onSuccess: () => { invalidate(); },
    onError: onErr,
  });

  const busy = depart.isPending || transition.isPending || cancel.isPending || setDelivered.isPending;
  const nextStates = detail ? (DISPATCH_TRANSITIONS[detail.status] ?? []) : [];

  // Dispatch one of the legal transitions through the right method.
  const go = (status: DispatchStatus | "CANCELLED") => {
    if (!detail) return;
    if (status === "CANCELLED") { cancel.mutate(detail.id); return; }
    if (detail.status === "LOADING" && status === "IN_TRANSIT") { depart.mutate(detail.id); return; }
    transition.mutate({ id: detail.id, status });
  };

  return (
    <Sheet open={!!tripId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2 font-mono">
            <Route className="w-5 h-5 text-accent" />
            {detail?.dispatchNumber ?? "Dispatch trip"}
          </SheetTitle>
          <SheetDescription>
            {detail ? (
              <span className="flex items-center gap-2">
                <DispatchStatusBadge status={detail.status} />
                <span>{detail.orders?.length ?? detail.orderCount ?? 0} orders on this trip</span>
              </span>
            ) : (
              "Loading trip details"
            )}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {isLoading || !detail ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <>
                {/* Trip header: van / driver / kitchen / ETA */}
                <div className="grid grid-cols-2 gap-4">
                  <InfoTile icon={ChefHat} label="Kitchen" value={detail.kitchen?.name || detail.kitchenName || "Unassigned"} />
                  <InfoTile icon={Truck} label="Partner" value={detail.partnerName || partnerName(detail.deliveryPartnerId)} />
                  <InfoTile icon={Hash} label="Vehicle" value={detail.vehicleNumber || "—"} mono />
                  <InfoTile icon={Timer} label="ETA" value={detail.estimatedArrivalAt ? format(new Date(detail.estimatedArrivalAt), "dd MMM, HH:mm") : "Not set"} />
                  <InfoTile icon={User} label="Driver" value={detail.driverName || "—"} />
                  <InfoTile icon={Phone} label="Driver mobile" value={detail.driverPhone || "—"} mono />
                </div>

                {/* Kitchen pickup address + contact tiles */}
                {detail.kitchen && (detail.kitchen.address || detail.kitchen.pincode || detail.kitchen.contactName || detail.kitchen.contactPhone) && (
                  <div className="grid grid-cols-2 gap-4">
                    <InfoTile
                      icon={MapPin}
                      label="Kitchen address"
                      value={[detail.kitchen.address, detail.kitchen.city, detail.kitchen.pincode].filter(Boolean).join(", ") || "—"}
                    />
                    <InfoTile icon={Hash} label="Kitchen pincode" value={detail.kitchen.pincode || "—"} mono />
                    <InfoTile icon={User} label="Kitchen contact" value={detail.kitchen.contactName || "—"} />
                    <InfoTile icon={Phone} label="Kitchen phone" value={detail.kitchen.contactPhone || "—"} mono />
                  </div>
                )}

                {detail.dispatchedAt && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" />
                    Dispatched {format(new Date(detail.dispatchedAt), "dd MMM yyyy, HH:mm")}
                  </p>
                )}

                {/* State-aware status control: only legal next states are offered. */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Trip actions</Label>
                  {nextStates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      This trip is {DISPATCH_STATUS_META[detail.status]?.label.toLowerCase() ?? "closed"} — no further actions.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {nextStates.map((s) => (
                        <TransitionButton key={s} status={s} disabled={busy} onClick={() => go(s)} />
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Orders on this trip (enriched: address + unit-lead + residents + delivered) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium flex items-center gap-1.5">
                      <Boxes className="w-4 h-4 text-muted-foreground" /> Orders on this trip
                    </h4>
                    <Badge variant="secondary">{detail.orders?.length ?? 0}</Badge>
                  </div>
                  {!detail.orders || detail.orders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No orders attached to this trip.</p>
                  ) : (
                    <div className="rounded-lg border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">Done</TableHead>
                            <TableHead>Order</TableHead>
                            <TableHead>Address</TableHead>
                            <TableHead>Unit-lead</TableHead>
                            <TableHead className="text-right">Residents</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.orders.map((o) => (
                            <OrderRow
                              key={o.id}
                              order={o}
                              propName={propName}
                              tripCancelled={detail.status === "CANCELLED"}
                              disabled={busy}
                              onToggle={(delivered) =>
                                setDelivered.mutate({ id: detail.id, orderId: o.id, delivered })
                              }
                              pending={setDelivered.isPending && setDelivered.variables?.orderId === o.id}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Audit timeline */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-1.5">
                    <History className="w-4 h-4 text-muted-foreground" /> Activity timeline
                  </h4>
                  {loadingEvents ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-3/4" />
                    </div>
                  ) : events.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                  ) : (
                    <ol className="space-y-3">
                      {events.map((ev) => {
                        const meta = DISPATCH_STATUS_META[ev.status as string];
                        const Icon = meta?.icon ?? Clock;
                        return (
                          <li key={ev.id} className="flex gap-3">
                            <div className="mt-0.5 w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium flex items-center gap-2">
                                {meta?.label ?? ev.status}
                                <span className="text-xs font-normal text-muted-foreground">
                                  {format(new Date(ev.createdAt), "dd MMM, HH:mm")}
                                </span>
                              </p>
                              {ev.note && <p className="text-xs text-muted-foreground">{ev.note}</p>}
                              {ev.actorName && (
                                <p className="text-[11px] text-muted-foreground/80 flex items-center gap-1">
                                  <User className="w-3 h-3" /> {ev.actorName}
                                </p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

/* ── One trip-action button, styled per target state ────────────────────── */
function TransitionButton({
  status, disabled, onClick,
}: { status: DispatchStatus | "CANCELLED"; disabled?: boolean; onClick: () => void }) {
  const cfg: Record<string, { label: string; icon: React.ElementType; className: string; variant?: "outline" | "destructive" }> = {
    IN_TRANSIT: { label: "Depart", icon: Truck, className: "bg-accent hover:bg-accent/90 text-white" },
    DELIVERED: { label: "Mark delivered", icon: PackageCheck, className: "bg-success hover:bg-success/90 text-white" },
    PARTIAL: { label: "Mark partial", icon: Timer, className: "", variant: "outline" },
    CANCELLED: { label: "Cancel trip", icon: Ban, className: "", variant: "destructive" },
  };
  const c = cfg[status] ?? { label: status, icon: ChevronRight, className: "", variant: "outline" as const };
  const Icon = c.icon;
  return (
    <Button size="sm" variant={c.variant} className={c.className} disabled={disabled} onClick={onClick}>
      <Icon className="w-4 h-4 mr-1.5" /> {c.label}
    </Button>
  );
}

/* ── One order row in the trip detail table, with delivered checkbox ────── */
function OrderRow({
  order: o, propName, tripCancelled, disabled, pending, onToggle,
}: {
  order: DispatchDetailOrder;
  propName: (id?: string | null) => string;
  tripCancelled: boolean;
  disabled?: boolean;
  pending?: boolean;
  onToggle: (delivered: boolean) => void;
}) {
  const delivered = o.status === "DELIVERED";
  const terminal = delivered || o.status === "CANCELLED" || tripCancelled;
  const addr = [o.deliveryAddress, o.deliveryCity, o.deliveryPincode].filter(Boolean).join(", ");
  return (
    <TableRow className={delivered ? "bg-success/5" : undefined}>
      <TableCell>
        <Checkbox
          checked={delivered}
          disabled={disabled || pending || terminal}
          onCheckedChange={(v) => onToggle(!!v)}
          aria-label={`Mark ${o.orderNumber} delivered`}
        />
      </TableCell>
      <TableCell className="font-mono text-xs align-top">
        <div>{o.orderNumber}</div>
        <div className="text-muted-foreground font-sans">{o.propertyName || propName(o.propertyId)}</div>
      </TableCell>
      <TableCell className="text-xs align-top max-w-[180px]">
        {addr ? <span className="text-foreground">{addr}</span> : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-xs align-top">
        <div className="truncate">{o.unitLeadName || "—"}</div>
        {o.unitLeadPhone && (
          <a href={`tel:${o.unitLeadPhone}`} className="font-mono text-muted-foreground hover:text-accent inline-flex items-center gap-1">
            <Phone className="w-3 h-3" />{o.unitLeadPhone}
          </a>
        )}
      </TableCell>
      <TableCell className="text-right text-sm align-top">{o.residentsCount ?? "—"}</TableCell>
      <TableCell className="text-right align-top"><StatusBadge status={o.status} /></TableCell>
    </TableRow>
  );
}

/* ── Searchable vehicle picker (disables vehicles already on an active trip) ── */
function VehiclePicker({
  vehicles, value, activeVehicleSet, disabled, onChange,
}: {
  vehicles: { id: string; vehicleNumber: string; vehicleType: string }[];
  value: string | null;
  activeVehicleSet: Set<string>;
  disabled?: boolean;
  onChange: (vehicleId: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = vehicles.find((v) => v.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground")}
        >
          <span className="truncate">
            {selected ? `${selected.vehicleNumber} · ${selected.vehicleType}` : disabled ? "Pick an agency first" : "Select vehicle"}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search, keywords) => {
            const hay = [itemValue, ...(keywords ?? [])].join(" ").toLowerCase();
            return hay.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search by vehicle number…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No matching vehicle.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none"
                keywords={["none", "no vehicle"]}
                onSelect={() => { onChange(null); setOpen(false); }}
              >
                <Check className={cn("size-4", !value ? "opacity-100" : "opacity-0")} />
                <span className="text-muted-foreground">— No vehicle —</span>
              </CommandItem>
              {vehicles.map((veh) => {
                const isActive = activeVehicleSet.has(veh.id);
                const isSel = veh.id === value;
                return (
                  <CommandItem
                    key={veh.id}
                    value={veh.vehicleNumber}
                    keywords={[veh.vehicleType, veh.id]}
                    disabled={isActive && !isSel}
                    onSelect={() => { onChange(veh.id); setOpen(false); }}
                  >
                    <Check className={cn("size-4", isSel ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{veh.vehicleNumber}</span>
                    <span className="ml-1 text-xs text-muted-foreground">· {veh.vehicleType}</span>
                    {isActive && !isSel && (
                      <Badge variant="secondary" className="ml-auto text-[10px] gap-1">
                        <AlertCircle className="w-3 h-3" /> On trip
                      </Badge>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function InfoTile({ icon: Icon, label, value, mono }: { icon: React.ElementType; label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border bg-surface p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </p>
      <p className={`text-sm font-medium mt-0.5 truncate ${mono ? "font-mono" : ""}`} title={value}>{value}</p>
    </div>
  );
}

function LocalEmpty({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center border border-dashed rounded-lg py-16 px-6 bg-card">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">{hint}</p>
    </div>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-4 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
