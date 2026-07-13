import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle, Check, ChevronLeft, Info, Loader2, PackageCheck,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Textarea } from "@/components/ui/textarea";
import { useConfetti } from "@/components/ui/confetti";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/use-permissions";
import {
  foodApi, foodKeys, MEAL_TYPES, BRANDS, MEAL_LABEL, MEAL_EMOJI, fmtQty,
  type FoodOrder, type FoodOrderItem, type MealType,
} from "@/lib/food-api";

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : format(dt, "dd MMM, HH:mm");
}

const SHORT_REASONS = ["Spilled in transit", "Short from kitchen", "Counting mistake"];

// Weight units that auto-convert (mirrors NumberStepper's conversion rule exactly).
// The API delivers UPPERCASE enum units ("KG", "G") while the conversion rules
// here and in NumberStepper compare lowercase — normalise weight units once at
// the boundary (normUnit below) so kg↔gram conversion actually fires. Other
// units keep their raw casing (UNIT_LABELS knows the uppercase codes).
const WEIGHT_UNITS = new Set(["kg", "gram", "g"]);
const isKg = (u: string) => u === "kg";
const isGram = (u: string) => u === "gram" || u === "g";
const normUnit = (u: string): string => {
  const l = u.trim().toLowerCase();
  return WEIGHT_UNITS.has(l) ? l : u;
};

/** Convert `n` from `from`→`to`. kg↔gram/g scales ×/÷1000; otherwise unchanged. */
function convertQty(n: number, from: string, to: string): number {
  if (from === to) return n;
  if (!WEIGHT_UNITS.has(from) || !WEIGHT_UNITS.has(to)) return n;
  if (isKg(from) && isGram(to)) return n * 1000;
  if (isGram(from) && isKg(to)) return n / 1000;
  return n; // gram<->g, same magnitude
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Build the per-item unit options: canonical base unit + kg/gram (de-duped). */
function unitOptionsFor(baseUnit: string): string[] {
  const opts = [baseUnit, "kg", "gram"];
  return opts.filter((u, i) => opts.indexOf(u) === i);
}

/** Sensible −/+ increments per displayed unit (typing any value still works). */
function stepFor(unit: string): number {
  if (isKg(unit)) return 0.1;
  if (isGram(unit)) return 50;
  return 1;
}

export default function FoodConfirmDelivery() {
  const [propertyId, setPropertyId] = React.useState("ALL");
  const [brand, setBrand] = React.useState("ALL");
  const [mealType, setMealType] = React.useState("ALL");
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const { me } = usePermissions();
  // Property-scoped users (unit leads / wardens) only ever see their own
  // property, so its name/brand on every card is noise — hide it for them.
  const isSingleProperty = Boolean(me?.propertyId);

  const { confetti, fire } = useConfetti();
  const { data: lookups } = useQuery({
    queryKey: foodKeys.lookups(),
    queryFn: () => foodApi.lookups(),
  });
  const properties = lookups?.properties ?? [];
  const partners = lookups?.deliveryPartners ?? [];
  const propName = (id?: string | null) =>
    id ? properties.find((p) => p.id === id)?.name ?? "—" : "—";
  const partnerName = (id?: string | null): string | null =>
    id ? partners.find((p) => p.id === id)?.name ?? null : null;

  const params: Record<string, unknown> = { status: "DISPATCHED", limit: 100 };
  if (propertyId !== "ALL") params.propertyId = propertyId;
  if (brand !== "ALL") params.brand = brand;
  if (mealType !== "ALL") params.mealType = mealType;

  const { data: res, isLoading } = useQuery({
    queryKey: foodKeys.orders(params),
    queryFn: () => foodApi.listOrders(params),
  });
  const orders = res?.data ?? [];

  // "Swift Logistics · dispatched 12:38" — best-effort from list-level fields
  // (vehicle/driver only exist on the order detail's dispatch record).
  const cardMeta = (o: FoodOrder): string => {
    return [
      o.deliveryPartnerName ?? partnerName(o.deliveryPartnerId),
      o.dispatchedAt
        ? `dispatched ${fmtDateTime(o.dispatchedAt)}`
        : `placed ${fmtDateTime(o.createdAt)}`,
    ].filter(Boolean).join(" · ");
  };

  return (
    <div className="mx-auto w-full max-w-[760px] flex flex-col gap-6 animate-fade-up">
      {confetti}

      {detailId ? (
        <DeliveryDetail
          id={detailId}
          listParams={params}
          propName={propName}
          partnerName={partnerName}
          onBack={() => setDetailId(null)}
          onDone={(mismatchFree) => {
            setDetailId(null);
            if (mismatchFree) fire();
          }}
        />
      ) : (
        <>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-[-0.012em]">
              Confirm deliveries
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Check the food that arrived and confirm the amounts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger className="h-9 w-auto min-w-40 rounded-[10px] bg-card text-[13px]">
                <SelectValue placeholder="Property" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Properties</SelectItem>
                {properties.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger className="h-9 w-auto min-w-32 rounded-[10px] bg-card text-[13px]">
                <SelectValue placeholder="Brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Brands</SelectItem>
                {BRANDS.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={mealType} onValueChange={setMealType}>
              <SelectTrigger className="h-9 w-auto min-w-32 rounded-[10px] bg-card text-[13px]">
                <SelectValue placeholder="Meal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Meals</SelectItem>
                {MEAL_TYPES.map((m) => (<SelectItem key={m} value={m}>{MEAL_LABEL[m]}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[104px] animate-pulse rounded-[14px] border border-border bg-card" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center rounded-[14px] border border-dashed border-border bg-card px-6 py-14 text-center">
              <PackageCheck className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-display text-[15px] font-bold tracking-[-0.012em]">
                Nothing awaits confirmation
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                All dispatched orders have been delivered. Newly dispatched orders will appear here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setDetailId(o.id)}
                  className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-card p-5 text-left transition-colors hover:border-accent"
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="font-mono text-[13px] text-muted-foreground tabular-nums">
                        {o.orderNumber}
                      </span>
                      {!isSingleProperty && (
                        <span className="truncate text-xs text-muted-foreground">
                          {o.propertyName ?? propName(o.propertyId)} · {o.brand}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-warning-soft px-[9px] py-[3px] text-[11px] font-bold text-warning">
                      Waiting for you
                    </span>
                  </div>
                  <div className="font-display text-[17px] font-bold tracking-[-0.012em]">
                    {MEAL_EMOJI[o.mealType]} {MEAL_LABEL[o.mealType]} · {o.residentsCount} people
                  </div>
                  <div className="text-[13px] text-muted-foreground">{cardMeta(o)}</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Inline detail / proof-of-receipt view ────────────────────────────────────
interface ItemEntry {
  itemId: string;
  dishName: string;
  /** Canonical unit of the line item — `value` is submitted in this unit. */
  unit: string;
  /** Unit currently shown in the stepper; `value` is expressed in this unit. */
  displayUnit: string;
  orderedQty: number;
  /** Received quantity, expressed in `displayUnit`. */
  value: string;
}

function DeliveryDetail({
  id, listParams, propName, partnerName, onBack, onDone,
}: {
  id: string;
  listParams: Record<string, unknown>;
  propName: (id?: string | null) => string;
  partnerName: (id?: string | null) => string | null;
  onBack: () => void;
  onDone: (mismatchFree: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: order, isLoading } = useQuery({
    queryKey: foodKeys.order(id),
    queryFn: () => foodApi.getOrder(id),
  });

  const [entries, setEntries] = React.useState<ItemEntry[]>([]);
  const [remarks, setRemarks] = React.useState("");
  const [reason, setReason] = React.useState<string | null>(null);

  // Seed the receipt form whenever an order loads. Default receivedQty = orderedQty.
  React.useEffect(() => {
    if (!order) return;
    setEntries(
      (order.items ?? []).map((it: FoodOrderItem) => {
        const ordered = Number(it.orderedQty ?? 0);
        return {
          itemId: it.id,
          dishName: it.dishName ?? it.dishId,
          unit: normUnit(it.unit),
          displayUnit: normUnit(it.unit),
          orderedQty: ordered,
          value: String(ordered),
        };
      }),
    );
    setRemarks(order.deliveryRemarks ?? "");
    setReason(null);
  }, [order]);

  // Received qty in the item's canonical unit (value is entered in displayUnit).
  const receivedCanonical = (e: ItemEntry): number =>
    round3(convertQty(Number(e.value), e.displayUnit, e.unit));

  const errorFor = (e: ItemEntry): string | null => {
    if (e.value.trim() === "") return "Required";
    const n = Number(e.value);
    if (!Number.isFinite(n)) return "Must be a number";
    if (n < 0) return "Cannot be negative";
    if (receivedCanonical(e) > e.orderedQty) return `Cannot exceed ${fmtQty(e.orderedQty, e.unit)}`;
    return null;
  };
  const hasErrors = entries.some((e) => errorFor(e) !== null);

  const setValue = (itemId: string, value: string) =>
    setEntries((prev) => prev.map((e) => (e.itemId === itemId ? { ...e, value } : e)));

  // Stepper unit change: value already auto-converted via onChange; just record the unit.
  const setDisplayUnit = (itemId: string, displayUnit: string) =>
    setEntries((prev) => prev.map((e) => (e.itemId === itemId ? { ...e, displayUnit } : e)));

  // Per-item shortfall (computed in canonical units).
  const shortBy = (e: ItemEntry): number => round3(e.orderedQty - receivedCanonical(e));
  const isShort = (e: ItemEntry): boolean => errorFor(e) === null && shortBy(e) > 0;
  const shortCount = entries.filter(isShort).length;
  const hasMismatch = shortCount > 0;

  const mutation = useMutation({
    mutationFn: () => {
      // The picked shortfall reason is prepended into the delivery remarks.
      const combinedRemarks = [
        hasMismatch && reason ? reason : null,
        remarks.trim() || null,
      ].filter(Boolean).join(" — ");
      return foodApi.confirmDelivery(
        id,
        entries.map((e) => ({ itemId: e.itemId, receivedQty: receivedCanonical(e) })),
        combinedRemarks || undefined,
      );
    },
    onSuccess: () => {
      toast({ title: "Delivery confirmed", description: `${order?.orderNumber} marked as delivered.`, variant: "success" });
      qc.invalidateQueries({ queryKey: foodKeys.orders(listParams) });
      qc.invalidateQueries({ queryKey: ["food", "orders"] });
      qc.invalidateQueries({ queryKey: ["food", "dashboard"] });
      qc.invalidateQueries({ queryKey: foodKeys.order(id) });
      onDone(!hasMismatch);
    },
    onError: (e: any) => {
      toast({ title: e?.message || "Failed to confirm delivery", variant: "destructive" });
    },
  });

  const confirmDisabled =
    mutation.isPending || hasErrors || entries.length === 0 || (hasMismatch && !reason);
  const confirmLabel = hasErrors
    ? "Fix the highlighted amounts"
    : hasMismatch
      ? reason
        ? `Confirm with ${shortCount} short item${shortCount > 1 ? "s" : ""} noted`
        : "Pick a reason first"
      : "Everything arrived — confirm ✓";

  const onSubmit = () => {
    if (hasErrors) {
      toast({ title: "Fix the highlighted quantities before confirming", variant: "destructive" });
      return;
    }
    if (hasMismatch && !reason) {
      toast({ title: "Pick a reason for the shortfall first", variant: "destructive" });
      return;
    }
    mutation.mutate();
  };

  // Delivery meta: prefer the dispatch trip's vehicle/driver, fall back to the
  // delivery-partner name, then to dispatch/placed timestamps.
  const dispatch = order?.dispatch;
  const vehicle = dispatch?.vehicleNumber ?? null;
  const driver =
    dispatch?.driverName ?? order?.deliveryPartnerName ?? partnerName(order?.deliveryPartnerId);
  const driverPhone = dispatch?.driverPhone ?? null;
  const deliveryMeta = [
    vehicle ? `Van ${vehicle}` : null,
    driver ? `Driver ${driver}${driverPhone ? ` (${driverPhone})` : ""}` : null,
    order?.dispatchedAt
      ? `dispatched ${fmtDateTime(order.dispatchedAt)}`
      : `placed ${fmtDateTime(order?.createdAt)}`,
  ].filter(Boolean).join(" · ");

  const events = order?.events ?? [];
  const prettyStatus = (s: string) =>
    s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div className="flex flex-col gap-[18px] animate-fade-up">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-[15px] w-[15px]" /> All deliveries
      </button>

      {isLoading || !order ? (
        <div className="flex items-center justify-center rounded-[14px] border border-border bg-card py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-[-0.012em]">
              {MEAL_LABEL[order.mealType]} delivery ·{" "}
              <span className="font-mono tabular-nums">{order.orderNumber}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{deliveryMeta}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {order.propertyName ?? propName(order.propertyId)} · {order.brand} ·{" "}
              {/* serviceDate is a calendar day (timestamp-typed) — never show its time. */}
              {order.residentsCount} residents · service {format(new Date(order.serviceDate), "dd MMM yyyy")}
            </p>
          </div>

          <div className="flex items-start gap-2.5 rounded-[12px] bg-info-soft px-4 py-3 text-sm">
            <Info className="mt-0.5 h-[17px] w-[17px] shrink-0 text-info" />
            <span>
              Count each item as it comes off the van. If a number is different, set what you
              really received.
            </span>
          </div>

          {entries.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
              This order has no line items.
            </p>
          ) : (
            <div className="overflow-hidden rounded-[14px] border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border bg-background px-[18px] py-2.5 text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">
                <span>Item</span>
                <span>You received</span>
              </div>
              {entries.map((e) => {
                const err = errorFor(e);
                const short = isShort(e);
                // Stepper min/max expressed in the currently displayed unit.
                const dispMax = round3(convertQty(e.orderedQty, e.unit, e.displayUnit));
                return (
                  <div
                    key={e.itemId}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-[18px] py-3 last:border-b-0",
                      short && "bg-warning-soft",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{e.dishName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        sent {fmtQty(e.orderedQty, e.unit)}
                      </p>
                      {err ? (
                        <p className="mt-0.5 text-xs font-medium text-destructive">{err}</p>
                      ) : short ? (
                        <p className="mt-0.5 text-xs font-semibold text-warning">
                          short by {fmtQty(shortBy(e), e.unit)}
                        </p>
                      ) : null}
                    </div>
                    <NumberStepper
                      value={Number(e.value)}
                      min={0}
                      max={dispMax}
                      step={stepFor(e.displayUnit)}
                      unit={e.displayUnit}
                      unitOptions={unitOptionsFor(e.unit)}
                      onChange={(n) => setValue(e.itemId, String(n))}
                      onUnitChange={(u) => setDisplayUnit(e.itemId, u)}
                      aria-label={`${e.dishName} received quantity`}
                      className={cn(
                        "shrink-0",
                        err && "[&_input]:text-destructive",
                        short && "[&_input]:font-semibold [&_input]:text-warning",
                      )}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {hasMismatch && (
            <div className="rounded-[12px] bg-warning-soft p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                {shortCount} item{shortCount > 1 ? "s are" : " is"} less than what was sent
              </div>
              <p className="mb-2 mt-2 text-[13px] text-muted-foreground">
                Why is it short? Pick one:
              </p>
              <div className="flex flex-wrap gap-2">
                {SHORT_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={cn(
                      "h-10 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                      reason === r
                        ? "border-transparent bg-warning text-white"
                        : "border-border bg-card hover:border-warning",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="delivery-remarks">Remarks</Label>
            <Textarea
              id="delivery-remarks"
              rows={3}
              placeholder="Optional notes about the delivery (shortfalls, condition, etc.)"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="rounded-[12px]"
            />
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={confirmDisabled}
            className={cn(
              "h-[52px] rounded-[12px] px-6 font-display text-base font-bold tracking-[-0.012em] transition-[filter]",
              confirmDisabled
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-success text-white hover:brightness-105",
            )}
          >
            {mutation.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Confirming…
              </span>
            ) : (
              confirmLabel
            )}
          </button>

          {events.length > 0 && (
            <div className="rounded-[14px] border border-border bg-card p-5">
              <h3 className="font-display text-[15px] font-bold tracking-[-0.012em]">
                Order journey
              </h3>
              <div className="mt-3 flex flex-col">
                {events.map((ev, i) => (
                  <div key={ev.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < events.length - 1 && (
                      <span className="absolute bottom-0 left-[11px] top-6 w-[2px] bg-border" />
                    )}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success">
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {prettyStatus(ev.status)}
                        {ev.actorName && (
                          <span className="font-normal text-muted-foreground"> · {ev.actorName}</span>
                        )}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground tabular-nums">
                        {fmtDateTime(ev.createdAt)}
                      </p>
                      {ev.note && <p className="mt-0.5 text-xs text-muted-foreground">{ev.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
