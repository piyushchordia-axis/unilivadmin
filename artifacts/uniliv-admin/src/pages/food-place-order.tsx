import * as React from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import jsPDF from "jspdf";
import {
  Loader2, Building2, Users, Check, Clock, Lock, Download, Share2, Link2, Copy,
  Soup, AlertTriangle, CheckCircle2, Truck, ArrowRight, Image as ImageIcon,
  FileText, Mail, ChevronDown, ChevronLeft, Plus, RotateCcw, History, Pencil,
  X, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { useConfetti } from "@/components/ui/confetti";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  foodApi, foodKeys, MEAL_LABEL, MEAL_EMOJI, dishEmoji, fmtQty,
  type FoodOrder, type OrderBatch, type OrderPreview, type PropertyOverview,
  type NextOrderProperty, type NextOrderStatus, type MealType,
} from "@/lib/food-api";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/store";
import { usePermissions } from "@/lib/use-permissions";
import { isSuperAdminRole } from "@/lib/permissions";
import { useQueryParam } from "@/lib/nav-helpers";
import {
  orderDraftKey, loadOrderDraft, saveOrderDraft, removeOrderDraft, pruneOrderDrafts,
} from "@/lib/order-draft";
import { cn } from "@/lib/utils";

/** Per-item override, keyed `${mealType}__${dishId}`. `excluded` drops the dish;
 *  `persons` pins a per-dish headcount; `qty` pins an absolute quantity. Persons
 *  cascades dish → meal → global headcount when not overridden. */
type Override = { excluded?: boolean; persons?: number; qty?: number };

const todayDate = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const itemKey = (mealType: string, dishId: string) => `${mealType}__${dishId}`;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** Sensible +/− increment per unit: whole numbers for countables, 0.1 for weights/volumes. */
const qtyStep = (unit: string) => (["PCS", "PLATE", "SERVING", "UNIT"].includes(unit.toUpperCase()) ? 1 : 0.1);


/** Soft status pill from the style kit. */
function Pill({ tone, children }: { tone: "success" | "warning" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "success" ? "bg-success-soft text-success" :
    tone === "warning" ? "bg-warning-soft text-warning" :
    "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-[9px] py-[3px] text-[11px] font-bold", cls)}>
      {children}
    </span>
  );
}

/** Live countdown to a deadline, formatted "Hh Mm Ss" (or "Mm Ss" under an hour). */
function useCountdown(deadline: Date | null): { text: string; passed: boolean } {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline?.getTime()]);
  if (!deadline) return { text: "", passed: false };
  const ms = deadline.getTime() - now;
  if (ms <= 0) return { text: "0s", passed: true };
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const text = h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  return { text, passed: false };
}

export default function FoodPlaceOrder() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { propertyId: scopeProperty, setPropertyId } = useAppStore();
  const { can, role, me } = usePermissions();
  const canPlace = can("FOOD_PLACE_ORDER", "create");
  // Download menu stays for Unit Lead + FnB roles (only on the success state).
  const canDownload = role === "UNIT_LEAD" || isSuperAdminRole(role) || (role ?? "").startsWith("FNB_");
  const { confetti, fire } = useConfetti();

  // The single lever: how many people we're serving. Drives every quantity.
  const [persons, setPersons] = React.useState<number>(1);

  // Per-dish overrides (exclude / custom persons / custom qty) + per-meal headcount.
  const [overrides, setOverrides] = React.useState<Record<string, Override>>({});
  const [mealPersons, setMealPersons] = React.useState<Record<string, number>>({});
  // Which meal card is open (single-open; first meal opens by default).
  const [openMeal, setOpenMeal] = React.useState<string>("");
  const openMealInit = React.useRef(false);

  // Success state (shown after a batch is placed).
  const [placed, setPlaced] = React.useState<{ batch: OrderBatch; orders: FoodOrder[] } | null>(null);

  // When a property already has order(s) for the date we lead with a status view.
  // "Add the missing meal(s)" reveals the builder, scoped to un-ordered meals only.
  const [showBuilder, setShowBuilder] = React.useState(false);

  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareLink, setShareLink] = React.useState<string | null>(null);

  // ── Browser-local draft (localStorage only): edits autosave silently and are
  //    restored on the next visit to the same (user, property, service date). ──
  const draftRestoreDone = React.useRef(false);     // restore attempted for the current scope
  const draftJustRestored = React.useRef(false);    // skip the autosave pass queued before restored state commits
  const draftOwnsPersons = React.useRef(false);     // a restored draft holds `persons` — don't reseed from active guests
  const seedPersons = React.useRef(1);              // pristine headcount baseline for dirty-checking
  const [draftSavedAt, setDraftSavedAt] = React.useState<Date | null>(null);
  const [draftRestoredAt, setDraftRestoredAt] = React.useState<Date | null>(null);

  // ── Lookups (properties carry inherited brand + kitchen) ──
  const { data: lookups } = useQuery({
    queryKey: foodKeys.lookups(),
    queryFn: () => foodApi.lookups(),
  });
  const properties = lookups?.properties ?? [];

  // ── Next-order status across every property tagged to me (powers the board AND
  //    the per-property gating: resolved service date, cut-off, ordered/missing). ──
  const { data: nextOrdersData, isPending: nextOrdersPending } = useQuery({
    queryKey: foodKeys.nextOrders(),
    queryFn: () => foodApi.nextOrders(),
  });

  // The property in focus comes from the global navbar property switcher
  // (store.propertyId): "All Properties" (null) → the multi-property board; a
  // specific property → its builder/status. A ?propertyId= deep-link (e.g. from
  // My Properties) seeds the scope once, then we strip the param so the navbar
  // switcher stays the single source of truth.
  const paramProperty = useQueryParam("propertyId");
  React.useEffect(() => {
    if (paramProperty) {
      setPropertyId(paramProperty);
      navigate("/food/place-order", { replace: true });
    }
  }, [paramProperty, setPropertyId, navigate]);
  const propertyId = scopeProperty ?? "";

  // A user tagged to exactly ONE property (the unit-lead persona) never needs
  // the multi-property board — enter that property's builder/status directly
  // instead of asking for one more click. The navbar scope follows, same as
  // the ?propertyId= deep-link above.
  const soleProperty = (nextOrdersData ?? []).length === 1 ? nextOrdersData![0]!.propertyId : null;
  React.useEffect(() => {
    if (!propertyId && soleProperty) setPropertyId(soleProperty);
  }, [propertyId, soleProperty, setPropertyId]);

  const selectedProperty = properties.find((p) => p.id === propertyId);
  const myNext = (nextOrdersData ?? []).find((n) => n.propertyId === propertyId) ?? null;
  const brand = selectedProperty?.brand ?? myNext?.brand ?? null;
  const configured = selectedProperty ? Boolean(selectedProperty.brand && selectedProperty.kitchenId) : (myNext?.configured ?? false);
  const multiProperty = (nextOrdersData?.length ?? 0) > 1;

  // Service date is the NEXT orderable IST day for this property (tomorrow, or the
  // day after if tomorrow's cut-off has passed) — resolved server-side.
  const tomorrowStr = React.useMemo(() => format(addDays(todayDate(), 1), "yyyy-MM-dd"), []);
  const dateStr = myNext?.serviceDate ?? tomorrowStr;
  const date = React.useMemo(() => { const [y, m, d] = dateStr.split("-").map(Number); return new Date(y, (m ?? 1) - 1, d ?? 1); }, [dateStr]);
  const isTomorrow = dateStr === tomorrowStr;
  const dateLabel = format(date, "EEE, dd MMM yyyy");
  const dayRelLabel = isTomorrow ? "Tomorrow" : format(date, "EEE");

  // Seed headcount from the property's active-guest count.
  const { data: overview, isPending: overviewPending } = useQuery<PropertyOverview | null>({
    queryKey: foodKeys.propertyOverview({ propertyId }),
    queryFn: () => foodApi.propertyOverview({ propertyId }),
    enabled: !!propertyId,
  });
  React.useEffect(() => {
    if (overview && overview.activeGuests > 0) {
      seedPersons.current = overview.activeGuests;
      if (!draftOwnsPersons.current) setPersons(overview.activeGuests);
    }
  }, [overview?.id]);

  // ── Cut-off (day-before-anchored cutoffAt / isPastCutoff, from next-orders) ──
  const cutoffTime = myNext?.cutoffTime ?? null;
  const cutoffDeadline = myNext?.cutoffAt ? new Date(myNext.cutoffAt) : null;
  const countdown = useCountdown(cutoffDeadline);
  const orderingClosed = Boolean(myNext?.isPastCutoff) || countdown.passed;

  // ── Ordered vs available vs still-missing meals for the resolved date ──
  const orderedMeals = myNext?.orderedMeals ?? [];
  const availableMeals = myNext?.availableMeals ?? [];
  const orderedSet = React.useMemo(() => new Set(orderedMeals.map((m) => m.mealType)), [orderedMeals]);
  const missingMeals = React.useMemo(() => availableMeals.filter((m) => !orderedSet.has(m.mealType)), [availableMeals, orderedSet]);
  const knowsStatus = !!myNext;
  const hasExistingOrders = orderedMeals.length > 0;
  const fullyOrdered = knowsStatus && hasExistingOrders && missingMeals.length === 0;

  // Show the status view when this property already has order(s) and the user
  // hasn't opted into adding more.
  const showStatus = knowsStatus && hasExistingOrders && !showBuilder;

  // ── Menu / per-resident rates (fetched ONCE per property+date) ──
  const { data: preview, isLoading: previewLoading } = useQuery<OrderPreview>({
    queryKey: foodKeys.orderPreview({ propertyId, date: dateStr }),
    queryFn: () => foodApi.orderPreview({ propertyId, serviceDate: dateStr, persons: 1 }),
    enabled: !!propertyId && configured,
  });

  // Switching property/date re-evaluates from scratch: collapse the builder +
  // clear edits, and drop the headcount back to its last-known baseline so an
  // edited value never leaks into the next scope's draft.
  React.useEffect(() => {
    setShowBuilder(false); setOverrides({}); setMealPersons({}); setOpenMeal(""); openMealInit.current = false;
    setPersons(seedPersons.current);
    draftRestoreDone.current = false; draftJustRestored.current = false; draftOwnsPersons.current = false;
    setDraftSavedAt(null); setDraftRestoredAt(null);
  }, [propertyId, dateStr]);

  // Drafts for past service days can never be restored — clear them out once.
  React.useEffect(() => { pruneOrderDrafts(format(todayDate(), "yyyy-MM-dd")); }, []);

  // Restore the saved draft for this exact (user, property, service date) scope,
  // once per scope. Declared after the reset effect above so a scope switch
  // always wipes first, then restores. Waits for next-orders (authoritative
  // service date + cut-off) and the property overview (headcount baseline) so
  // the draft is validated against real data, never the tomorrow-fallback.
  React.useEffect(() => {
    if (!me?.id || !propertyId || draftRestoreDone.current) return;
    if (nextOrdersPending || overviewPending) return;
    draftRestoreDone.current = true;
    const key = orderDraftKey(me.id, propertyId, dateStr);
    if (orderingClosed) return;
    const draft = loadOrderDraft(key);
    if (!draft) return;
    // A draft only matters while something is still orderable; once every
    // available meal is ordered (or there's no menu) it can never apply — drop
    // it instead of dead-ending the user past the order-status view.
    const ordered = new Set((myNext?.orderedMeals ?? []).map((m) => m.mealType));
    const anyOrderable = (myNext?.availableMeals ?? []).some((m) => !ordered.has(m.mealType));
    if (myNext && !anyOrderable) { removeOrderDraft(key); return; }
    setPersons(draft.persons);
    setOverrides(draft.overrides);
    setMealPersons(draft.mealPersons);
    setShowBuilder(true); // resume where the user left off, past the status view
    draftOwnsPersons.current = true;
    draftJustRestored.current = true;
    setDraftRestoredAt(new Date(draft.savedAt));
    setDraftSavedAt(new Date(draft.savedAt));
  }, [me?.id, propertyId, dateStr, orderingClosed, nextOrdersPending, overviewPending, myNext]);

  // Autosave — every edit persists immediately (a synchronous localStorage
  // write is cheap, and a debounce would lose the last edits when the user
  // navigates away before it fires). A builder returned to its pristine state
  // clears the stored draft so undone edits don't come back.
  React.useEffect(() => {
    if (!draftRestoreDone.current) return; // never touch storage before restore has run
    if (draftJustRestored.current) { draftJustRestored.current = false; return; } // restored state hasn't committed yet
    if (!me?.id || !propertyId || placed || orderingClosed) return;
    const key = orderDraftKey(me.id, propertyId, dateStr);
    const dirty =
      Object.values(overrides).some((o) => o.excluded || o.persons != null || o.qty != null) ||
      Object.keys(mealPersons).length > 0 ||
      persons !== seedPersons.current;
    if (!dirty) {
      removeOrderDraft(key);
      setDraftSavedAt(null);
      return;
    }
    const now = new Date();
    saveOrderDraft(key, { v: 1, savedAt: now.toISOString(), persons, overrides, mealPersons });
    setDraftSavedAt(now);
  }, [persons, overrides, mealPersons, me?.id, propertyId, dateStr, placed, orderingClosed]);

  // "Start fresh" — drop the stored draft and reset the builder to calculated
  // values (back to the status view when the property already has orders).
  const discardDraft = () => {
    if (me?.id && propertyId) removeOrderDraft(orderDraftKey(me.id, propertyId, dateStr));
    setOverrides({}); setMealPersons({}); setPersons(seedPersons.current);
    setShowBuilder(false);
    draftOwnsPersons.current = false;
    setDraftSavedAt(null); setDraftRestoredAt(null);
  };

  // ── Live full-day menu (for download / share on the success state) ──
  const { data: fullMenu, isLoading: menuLoading } = useQuery({
    queryKey: foodKeys.fullMenu({ propertyId, date: dateStr }),
    queryFn: () => foodApi.fullMenu({ propertyId, date: dateStr }),
    enabled: !!propertyId && configured,
  });

  /** Derived effective state for one dish: included unless excluded; persons cascade
   *  dish-override → meal-override → global headcount; quantity = pinned override or
   *  persons × per-resident rate. `edited` = this dish has a manual persons/qty. */
  const effFor = React.useCallback((mt: string, dishId: string, qtyPerResident: number) => {
    const ov = overrides[itemKey(mt, dishId)];
    const included = !(ov?.excluded ?? false);
    const p = ov?.persons ?? mealPersons[mt] ?? persons;
    const qty = ov?.qty ?? round3(p * qtyPerResident);
    const edited = ov?.persons != null || ov?.qty != null;
    return { included, persons: p, qty, edited };
  }, [overrides, mealPersons, persons]);

  // ── Per-dish / per-meal edit handlers (the original "customise" editor) ──
  const patchOverride = (key: string, patch: Override) =>
    setOverrides((p) => ({ ...p, [key]: { ...p[key], ...patch } }));
  const resetItem = (mt: string, dishId: string) =>
    setOverrides((p) => { const n = { ...p }; const cur = { ...n[itemKey(mt, dishId)] }; delete cur.persons; delete cur.qty; n[itemKey(mt, dishId)] = cur; return n; });
  const toggleAll = (mt: string, dishIds: string[], include: boolean) =>
    setOverrides((p) => { const n = { ...p }; dishIds.forEach((d) => { n[itemKey(mt, d)] = { ...n[itemKey(mt, d)], excluded: !include }; }); return n; });
  const setExcluded = (mt: string, dishId: string, excluded: boolean) =>
    setOverrides((p) => ({ ...p, [itemKey(mt, dishId)]: { ...p[itemKey(mt, dishId)], excluded } }));

  // ── Derived order (only meals that have a menu AND aren't already ordered → one
  //    order each). Excluding already-ordered meals means a partial re-order only
  //    ever places the meals still missing, never a duplicate. ──
  const previewMeals = React.useMemo(
    () => (preview?.meals ?? []).filter((m) => !orderedSet.has(m.mealType)),
    [preview, orderedSet],
  );
  const selection = React.useMemo(() => {
    const meals = previewMeals.map((meal) => {
      const items = meal.items
        .map((it) => ({ it, e: effFor(meal.mealType, it.dishId, it.qtyPerResident) }))
        .filter(({ e }) => e.included && e.qty > 0)
        .map(({ it, e }) => ({ dishId: it.dishId, dishName: it.dishName, personsCount: e.persons, orderedQty: e.qty, unit: it.unit }));
      return { mealType: meal.mealType, label: meal.label, items };
    }).filter((m) => m.items.length > 0);
    const itemCount = meals.reduce((s, m) => s + m.items.length, 0);
    const countByMeal: Record<string, number> = {};
    meals.forEach((m) => { countByMeal[m.mealType] = m.items.length; });
    return { meals, itemCount, mealCount: meals.length, countByMeal };
  }, [previewMeals, effFor]);

  // Open the first included meal once it's available (single-open cards); the
  // user controls it from there.
  React.useEffect(() => {
    if (openMealInit.current) return;
    const first = previewMeals.find((m) => (selection.countByMeal[m.mealType] ?? 0) > 0)?.mealType;
    if (first) { setOpenMeal(first); openMealInit.current = true; }
  }, [previewMeals, selection]);

  // ── Place order ──
  const placeMutation = useMutation({
    mutationFn: () => foodApi.placeOrderBatch({
      propertyId, serviceDate: dateStr, persons,
      meals: selection.meals.map((m) => ({ mealType: m.mealType, items: m.items.map(({ dishId, personsCount, orderedQty, unit }) => ({ dishId, personsCount, orderedQty, unit })) })),
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["food"] });
      const n = res?.orders?.length ?? selection.mealCount;
      toast({ title: `${n} order${n === 1 ? "" : "s"} placed`, description: `${selectedProperty?.name ?? "Property"} • ${brand} • ${dateLabel}`, variant: "success" });
      // The draft is consumed: drop it and every edit it captured — persons
      // included, so the autosave's dirty-check can't resurrect it on the next
      // render (e.g. when leaving the success screen).
      if (me?.id && propertyId) removeOrderDraft(orderDraftKey(me.id, propertyId, dateStr));
      setOverrides({}); setMealPersons({}); setPersons(seedPersons.current);
      draftOwnsPersons.current = false;
      setDraftSavedAt(null); setDraftRestoredAt(null);
      setShowBuilder(false);
      setPlaced({ batch: res.batch, orders: res.orders });
      fire();
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to place order", variant: "destructive" }),
  });

  const handlePlace = () => {
    if (!propertyId) { toast({ title: "Select a property first", variant: "destructive" }); return; }
    if (!configured) { toast({ title: "Property not configured for ordering", variant: "destructive" }); return; }
    if (orderingClosed) { toast({ title: `Ordering for ${dayRelLabel.toLowerCase()} is closed`, variant: "destructive" }); return; }
    if (selection.mealCount === 0) { toast({ title: "No meals to order", description: "There's nothing left to order for this property on this date.", variant: "destructive" }); return; }
    placeMutation.mutate();
  };

  // ── Share — copy-link (LINK) OR dispatch to active guests (EMAIL/GUESTS) ──
  // `recipientCount` may arrive on `res` or `res.data` depending on the unwrap; read both.
  const shareMutation = useMutation({
    mutationFn: (mode: "LINK" | "GUESTS") =>
      mode === "GUESTS"
        // For GUESTS the backend resolves the property's active guests and dispatches via notify().
        ? foodApi.shareMenu({ propertyId, brand, date: dateStr, channel: "EMAIL", recipientType: "GUESTS" } as Record<string, unknown>)
        : foodApi.shareMenu({ propertyId, brand, date: dateStr, channel: "LINK" }),
    onSuccess: (res: any, mode) => {
      if (mode === "GUESTS") {
        const n = res?.recipientCount ?? res?.data?.recipientCount ?? 0;
        toast({ title: `Menu shared with ${n} active guest${n === 1 ? "" : "s"}`, variant: "success" });
        setShareOpen(false);
        return;
      }
      const token = res?.shareToken ?? res?.data?.shareToken;
      if (token) { setShareLink(`${window.location.origin}/m/${token}`); toast({ title: "Share link ready", variant: "success" }); }
      else { toast({ title: "Menu shared", variant: "success" }); }
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to share menu", variant: "destructive" }),
  });
  const sharingMode = (shareMutation.variables as "LINK" | "GUESTS" | undefined);

  const downloadMenuPdf = () => {
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const marginX = 48; let y = 64;
      doc.setFont("helvetica", "bold"); doc.setFontSize(20);
      doc.text(`${brand ?? "Menu"}`, marginX, y); y += 22;
      doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(110);
      doc.text(dateLabel, marginX, y);
      if (selectedProperty?.name) doc.text(selectedProperty.name, pageW - marginX, y, { align: "right" });
      doc.setTextColor(0); y += 14; doc.setDrawColor(220); doc.line(marginX, y, pageW - marginX, y); y += 26;
      const ms = fullMenu?.meals ?? [];
      if (ms.length === 0) { doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.text("No menu configured for this day.", marginX, y); }
      ms.forEach((meal) => {
        if (y > 760) { doc.addPage(); y = 64; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(meal.label || MEAL_LABEL[meal.mealType], marginX, y); y += 18;
        doc.setFont("helvetica", "normal"); doc.setFontSize(11);
        if (meal.dishes.length === 0) { doc.setTextColor(150); doc.text("— No dishes —", marginX + 8, y); doc.setTextColor(0); y += 16; }
        else meal.dishes.slice().sort((a, b) => a.sortOrder - b.sortOrder).forEach((d) => {
          if (y > 780) { doc.addPage(); y = 64; }
          const slot = d.slotLabel ? `  (${d.slotLabel})` : "";
          doc.text(`•  ${d.dishName}`, marginX + 8, y);
          doc.setTextColor(140); doc.text(`${slot ? slot.trim() + " · " : ""}${d.unit.toLowerCase()}`, pageW - marginX, y, { align: "right" }); doc.setTextColor(0); y += 16;
        });
        y += 14;
      });
      doc.save(`uniliv-menu-${dateStr}.pdf`);
      toast({ title: "Menu downloaded", variant: "success" });
    } catch (e: any) { toast({ title: e?.message || "Couldn't generate PDF", variant: "destructive" }); }
  };

  // #14 — render the same menu content to a PNG via the canvas 2D API (no new deps).
  const downloadMenuImage = () => {
    try {
      const ms = fullMenu?.meals ?? [];
      // Layout constants (CSS px; we scale the backing store by `dpr` for crisp text).
      const W = 720, PAD = 48, dpr = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
      const titleH = 34, dateH = 22, ruleGap = 26;
      const mealHeadH = 26, dishH = 22, dishGap = 6, mealGap = 22, emptyH = 22;
      // First pass: measure height so the canvas fits all content.
      let H = PAD + titleH + dateH + 14 + ruleGap;
      if (ms.length === 0) H += emptyH;
      ms.forEach((meal) => {
        H += mealHeadH + 6;
        H += meal.dishes.length === 0 ? emptyH : meal.dishes.length * (dishH + dishGap);
        H += mealGap;
      });
      H += PAD;

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) { toast({ title: "Couldn't generate image", variant: "destructive" }); return; }
      ctx.scale(dpr, dpr);

      // Background.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      const font = (size: number, weight = "400") =>
        `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      let y = PAD;

      // Title (brand) + meta (date / property).
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#0f172a";
      ctx.font = font(24, "700");
      ctx.textAlign = "left";
      y += 24;
      ctx.fillText(brand ?? "Menu", PAD, y);
      y += dateH;
      ctx.font = font(13, "400");
      ctx.fillStyle = "#64748b";
      ctx.fillText(dateLabel, PAD, y);
      if (selectedProperty?.name) {
        ctx.textAlign = "right";
        ctx.fillText(selectedProperty.name, W - PAD, y);
        ctx.textAlign = "left";
      }

      // Divider rule.
      y += 14;
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD, y + 0.5); ctx.lineTo(W - PAD, y + 0.5); ctx.stroke();
      y += ruleGap;

      if (ms.length === 0) {
        ctx.font = font(13, "400");
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("No menu configured for this day.", PAD, y);
      }

      ms.forEach((meal) => {
        // Meal heading.
        ctx.font = font(16, "700");
        ctx.fillStyle = "#0f172a";
        y += 16;
        ctx.fillText(meal.label || MEAL_LABEL[meal.mealType], PAD, y);
        y += 10;

        if (meal.dishes.length === 0) {
          ctx.font = font(13, "400");
          ctx.fillStyle = "#94a3b8";
          y += dishH - 6;
          ctx.fillText("— No dishes —", PAD + 8, y);
          y += emptyH - (dishH - 6);
        } else {
          meal.dishes.slice().sort((a, b) => a.sortOrder - b.sortOrder).forEach((d) => {
            y += dishH - 6;
            ctx.font = font(13, "400");
            ctx.fillStyle = "#1e293b";
            ctx.textAlign = "left";
            ctx.fillText(`•  ${d.dishName}`, PAD + 8, y);
            const slot = d.slotLabel ? `${d.slotLabel} · ` : "";
            ctx.fillStyle = "#94a3b8";
            ctx.textAlign = "right";
            ctx.fillText(`${slot}${d.unit.toLowerCase()}`, W - PAD, y);
            ctx.textAlign = "left";
            y += dishGap;
          });
        }
        y += mealGap;
      });

      canvas.toBlob((blob) => {
        if (!blob) { toast({ title: "Couldn't generate image", variant: "destructive" }); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `uniliv-menu-${dateStr}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast({ title: "Menu image downloaded", variant: "success" });
      }, "image/png");
    } catch (e: any) { toast({ title: e?.message || "Couldn't generate image", variant: "destructive" }); }
  };

  // Shared download control (PDF + image) — gated by canDownload; reused on the
  // status view and the success screen.
  const hasMenu = (fullMenu?.meals?.length ?? 0) > 0;
  const MenuDownloadButton = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={menuLoading || !hasMenu} className="w-[164px] justify-start rounded-[10px]">
          <Download className="mr-2 h-4 w-4" /> Download menu
          <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        <DropdownMenuItem onClick={downloadMenuPdf}>
          <FileText className="mr-2 h-4 w-4" /> Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={downloadMenuImage}>
          <ImageIcon className="mr-2 h-4 w-4" /> Download image
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const copyShareLink = async () => {
    if (!shareLink) return;
    try { await navigator.clipboard.writeText(shareLink); toast({ title: "Link copied", variant: "success" }); }
    catch { toast({ title: "Couldn't copy link", variant: "destructive" }); }
  };

  const saving = placeMutation.isPending;

  // ════════════════════════════════════════════════════════════════════════
  // SUCCESS STATE — batch reference + per-meal orders (each links to tracking)
  // ════════════════════════════════════════════════════════════════════════
  if (placed) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] animate-fade-up flex-col gap-5">
        {confetti}
        {multiProperty && (
          <button
            type="button"
            onClick={() => { setPlaced(null); setShareLink(null); setPropertyId(null); }}
            className="flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-[15px] w-[15px]" /> All properties
          </button>
        )}

        {/* Celebration card */}
        <div className="animate-pop-in rounded-[14px] border border-border bg-success-soft px-6 py-9 text-center">
          <div className="mx-auto mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-success">
            <Check className="h-9 w-9 text-white" strokeWidth={3} />
          </div>
          <h2 className="mb-1.5 font-display text-[22px] font-bold tracking-[-0.012em]">
            Order sent to the kitchen
          </h2>
          <p className="mb-1.5 text-sm text-muted-foreground">
            For {dateLabel} · {selectedProperty?.name ?? "Property"}{brand ? ` · ${brand}` : ""} ·{" "}
            {placed.orders.length} meal order{placed.orders.length === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-muted-foreground">
            Batch <span className="font-mono font-semibold text-foreground">{placed.batch.batchNumber}</span>
          </p>
        </div>

        {/* Placed orders — each links to tracking */}
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="border-b border-border px-[18px] py-3.5">
            <h3 className="font-display text-[15px] font-bold tracking-[-0.012em]">Your orders</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Track any order to follow its kitchen-to-delivery status.</p>
          </div>
          <ul className="divide-y divide-border">
            {placed.orders.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-[18px] py-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-xl"
                  style={{ background: "color-mix(in srgb, #FF9A3D 16%, var(--card))" }}
                >
                  {MEAL_EMOJI[o.mealType] ?? "🍽️"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{MEAL_LABEL[o.mealType] ?? o.mealType}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{o.orderNumber}</p>
                </div>
                <StatusBadge status={o.status} />
                <Link
                  href={`/food/track?order=${encodeURIComponent(o.orderNumber)}`}
                  className="shrink-0 font-mono text-[13px] font-semibold text-accent-strong hover:underline"
                >
                  Track →
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Download + Share — only on the success state */}
        <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-border bg-card px-4 py-3.5">
          {canDownload && <MenuDownloadButton />}
          <Button type="button" variant="outline" size="sm" className="rounded-[10px]" onClick={() => { setShareLink(null); setShareOpen(true); }}>
            <Share2 className="mr-2 h-4 w-4" /> Share menu
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" className="rounded-[10px]" onClick={() => { setPlaced(null); setShareLink(null); }}>
              View order status <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Share drawer — copy link OR dispatch to active guests */}
        <ShareMenuDrawer
          open={shareOpen} onOpenChange={setShareOpen}
          brand={brand} dateLabel={dateLabel} propertyName={selectedProperty?.name}
          activeGuests={overview?.activeGuests ?? 0}
          shareLink={shareLink}
          onShare={(mode) => shareMutation.mutate(mode)}
          generating={shareMutation.isPending} sharingMode={sharingMode}
          onCopy={copyShareLink}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // BOARD STATE — no property selected → next-order status for every property
  // ════════════════════════════════════════════════════════════════════════
  if (!propertyId) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] animate-fade-up flex-col gap-6">
        {confetti}
        <div>
          <h1 className="mb-1 font-display text-2xl font-bold tracking-[-0.012em]">Place order</h1>
          <p className="text-sm text-muted-foreground">
            Every property tagged to you — see what still needs its next order, and place it.
          </p>
        </div>
        {/* soleProperty auto-selects in an effect — keep the skeleton up for that
            frame so the one-row board never flashes before the builder opens. */}
        <NextOrdersBoard
          properties={nextOrdersData ?? []}
          isLoading={nextOrdersData === undefined || !!soleProperty}
          canPlace={canPlace}
          onOpen={setPropertyId}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // PRE-ORDER STATE (status view / builder)
  // ════════════════════════════════════════════════════════════════════════
  const allMealsSelected = previewMeals.length > 0 && selection.mealCount === previewMeals.length;
  const sendMealsText = allMealsSelected
    ? `all ${selection.mealCount} meal${selection.mealCount === 1 ? "" : "s"}`
    : `${selection.mealCount} of ${previewMeals.length} meals`;

  return (
    <div className="mx-auto flex w-full max-w-[760px] animate-fade-up flex-col gap-5">
      {confetti}
      {multiProperty && (
        <button
          type="button"
          onClick={() => setPropertyId(null)}
          className="flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-[15px] w-[15px]" /> All properties
        </button>
      )}

      <div>
        <h1 className="mb-1 font-display text-2xl font-bold tracking-[-0.012em]">
          {isTomorrow ? "Tomorrow's food order" : `${dayRelLabel}'s food order`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {dateLabel} · {selectedProperty?.name ?? myNext?.name ?? "Property"}
          {availableMeals.length > 0 ? ` · ${availableMeals.length} meal${availableMeals.length === 1 ? "" : "s"}` : ""}
        </p>
      </div>

      {/* ── Cut-off banner ── */}
      {orderingClosed ? (
        <div className="flex items-center gap-2.5 rounded-[12px] border border-border bg-danger-soft px-4 py-3 text-sm">
          <Lock className="h-[18px] w-[18px] shrink-0 text-destructive" />
          <span>
            Ordering for {dayRelLabel.toLowerCase()} is closed
            {cutoffTime ? <> — the <strong>{cutoffTime}</strong> cut-off has passed</> : ""}.
          </span>
        </div>
      ) : cutoffDeadline ? (
        <div className="flex items-center gap-2.5 rounded-[12px] border border-border bg-warning-soft px-4 py-3 text-sm">
          <Clock className="h-[18px] w-[18px] shrink-0 text-warning" />
          <span>
            Order closes at <strong>{cutoffTime ?? format(cutoffDeadline, "HH:mm")}</strong> —{" "}
            <span className="font-mono font-semibold tabular-nums text-warning">{countdown.text}</span> left
          </span>
        </div>
      ) : null}

      {/* ── Status view — this property already has order(s) for the date. We lead
            with status (track / edit) instead of an empty builder; only the meals
            that are still un-ordered can be added. ── */}
      {showStatus && (
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-[14px] border border-border bg-card">
            <div className="flex items-start gap-3 border-b border-border px-[18px] py-4">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-success">
                <Check className="h-4 w-4 text-white" strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-base font-bold tracking-[-0.012em]">
                  {fullyOrdered ? `All set for ${dayRelLabel.toLowerCase()}` : `Order in progress for ${dayRelLabel.toLowerCase()}`}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {fullyOrdered
                    ? "Every meal on the menu is ordered — track them below."
                    : `${missingMeals.length} meal${missingMeals.length === 1 ? "" : "s"} still need ordering.`}
                </p>
              </div>
            </div>
            <ul className="divide-y divide-border">
              {orderedMeals.map((o) => {
                const editable = o.status === "PLACED" || o.status === "PREPARING";
                return (
                  <li key={o.orderId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-[18px] py-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-xl"
                      style={{ background: "color-mix(in srgb, #FF9A3D 16%, var(--card))" }}
                    >
                      {MEAL_EMOJI[o.mealType] ?? "🍽️"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{o.label ?? MEAL_LABEL[o.mealType] ?? o.mealType}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{o.orderNumber}</p>
                    </div>
                    <StatusBadge status={o.status} />
                    {editable && (
                      <Button asChild variant="ghost" size="sm" className="rounded-[9px]">
                        <Link href={`/food/orders/${o.orderId}`}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                        </Link>
                      </Button>
                    )}
                    <Button asChild variant="outline" size="sm" className="rounded-[9px]">
                      <Link href={`/food/track?order=${encodeURIComponent(o.orderNumber)}`}>
                        <Truck className="mr-1.5 h-3.5 w-3.5" /> Track
                      </Link>
                    </Button>
                  </li>
                );
              })}
              {missingMeals.map((m) => (
                <li key={m.mealType} className="flex items-center gap-3 bg-background/60 px-[18px] py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-muted text-xl opacity-70">
                    {MEAL_EMOJI[m.mealType] ?? "🍽️"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-muted-foreground">{m.label}</p>
                    <p className="truncate text-xs text-muted-foreground">Not ordered yet</p>
                  </div>
                  <Pill tone="warning">NOT ORDERED</Pill>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {canDownload ? <MenuDownloadButton /> : <span />}
            {missingMeals.length > 0 && (
              <Button type="button" size="sm" className="rounded-[10px]" onClick={() => setShowBuilder(true)} disabled={orderingClosed || !canPlace}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Order {missingMeals.map((m) => m.label).join(", ")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Builder ── */}
      <div className={cn("space-y-4", showStatus && "hidden")}>
        {/* Draft-restored notice — edits from a previous visit were applied. */}
        {draftRestoredAt && draftSavedAt && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-[12px] border border-border bg-info-soft px-4 py-2.5 text-sm">
            <History className="h-4 w-4 shrink-0 text-info" />
            <span className="text-muted-foreground">
              Resumed your saved draft from {format(draftRestoredAt, "HH:mm")}{format(draftRestoredAt, "yyyy-MM-dd") !== format(new Date(), "yyyy-MM-dd") ? ` (${format(draftRestoredAt, "dd MMM")})` : ""}.
            </span>
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={discardDraft}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Start fresh
            </Button>
          </div>
        )}

        {/* Headcount — the single lever that drives every quantity. */}
        <div className="rounded-[14px] border border-border bg-card px-5 py-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-[180px] flex-1">
              <h2 className="font-display text-[17px] font-bold tracking-[-0.012em]">
                Who's eating {dayRelLabel.toLowerCase()}?
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Every dish below adjusts automatically as you change this.
              </p>
            </div>
            <NumberStepper
              aria-label="People eating"
              value={persons}
              onChange={(n) => setPersons(Math.max(0, Math.round(n)))}
              min={0}
              step={1}
              disabled={orderingClosed}
              unit="ppl"
              className="h-[42px] overflow-hidden rounded-[10px] [&_button]:h-10 [&_button]:w-10 [&_input]:h-10 [&_input]:w-[72px] [&_input]:font-mono [&_input]:text-xl [&_input]:font-semibold"
            />
          </div>
          {overview && overview.activeGuests > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-2 border-t border-border pt-3.5">
              <button
                type="button"
                disabled={orderingClosed}
                onClick={() => setPersons(overview.activeGuests)}
                className={cn(
                  "h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-50",
                  persons === overview.activeGuests
                    ? "bg-accent text-white"
                    : "border border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                Use {overview.activeGuests} active guests
              </button>
            </div>
          )}
        </div>

        {/* Per-meal builder */}
        {!configured ? (
          <div className="rounded-[14px] border border-border bg-card py-6">
            <EmptyState icon={AlertTriangle} title="Property not configured" description="This property has no brand or kitchen assigned, so it can't take orders. Ask an admin to configure it in the Organization console." className="border-0 bg-transparent" />
          </div>
        ) : previewLoading ? (
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[76px] w-full rounded-[14px]" />)}
          </div>
        ) : !preview || previewMeals.length === 0 ? (
          <div className="rounded-[14px] border border-border bg-card py-6">
            <EmptyState icon={Soup} title={`Nothing left to order for ${dayRelLabel.toLowerCase()}`} description={hasExistingOrders ? "Every meal on this property's menu for this date is already ordered." : `No menu is configured for this property's kitchen and brand on ${dateLabel}.`} className="border-0 bg-transparent" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Meal selector — tap a meal to add/remove it from this batch. Un-picked
                meals are skipped; come back and order them anytime. Already-placed
                meals show as locked "ordered" chips. */}
            <div className="flex flex-wrap items-center gap-2">
              {previewMeals.map((meal) => {
                const dishIds = meal.items.map((i) => i.dishId);
                const included = (selection.countByMeal[meal.mealType] ?? 0) > 0;
                return (
                  <button key={meal.mealType} type="button" disabled={orderingClosed}
                    onClick={() => toggleAll(meal.mealType, dishIds, !included)}
                    aria-pressed={included}
                    className={cn("inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50",
                      included
                        ? "bg-accent text-white hover:bg-accent/90"
                        : "border border-border bg-card text-muted-foreground hover:bg-muted/60")}>
                    {included ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    {MEAL_EMOJI[meal.mealType]} {meal.label}
                  </button>
                );
              })}
              {orderedMeals
                .filter((o) => !previewMeals.some((m) => m.mealType === o.mealType))
                .map((o) => (
                  <span key={o.orderId}
                    className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3.5 py-2 text-[13px] font-semibold text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {o.label ?? MEAL_LABEL[o.mealType] ?? o.mealType} · ordered
                  </span>
                ))}
            </div>
            <p className="px-0.5 text-xs text-muted-foreground">
              {selection.mealCount} of {previewMeals.length} meal{previewMeals.length === 1 ? "" : "s"} in this order · tap to toggle — order the rest anytime.
            </p>

            {/* Meal cards — single-open; per-dish include/exclude + quantity overrides
                are edited inline in the expanded card. The order-batch endpoint accepts
                the resulting subset of dishes/quantities (each dishId is validated
                against the menu); composition rules are NOT hard-blocked on this path —
                that lives in Food Settings → Menu Rotation. */}
            <div className="flex flex-col gap-2.5">
              {previewMeals.filter((meal) => (selection.countByMeal[meal.mealType] ?? 0) > 0).map((meal) => {
                const mealHead = mealPersons[meal.mealType];
                const heads = mealHead ?? persons;
                const open = openMeal === meal.mealType;
                const toggleOpen = () => setOpenMeal((prev) => (prev === meal.mealType ? "" : meal.mealType));
                return (
                  <div
                    key={meal.mealType}
                    className="overflow-hidden rounded-[14px] border border-border bg-card transition-[border-color,box-shadow] duration-200"
                    style={open ? {
                      borderColor: "color-mix(in srgb, var(--accent) 45%, var(--border))",
                      boxShadow: "0 6px 20px rgba(242,96,60,.10)",
                    } : undefined}
                  >
                    {/* Header — tap to expand. The persons mini-stepper stops propagation. */}
                    <div
                      role="button" tabIndex={0}
                      onClick={toggleOpen}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleOpen(); } }}
                      className="flex w-full cursor-pointer select-none items-center gap-3 px-[18px] py-3.5"
                      style={open ? {
                        background: "linear-gradient(135deg, color-mix(in srgb, #FF9A3D 14%, var(--card)), color-mix(in srgb, #F2603C 6%, var(--card)))",
                      } : undefined}
                    >
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-[22px]"
                        style={{ background: "linear-gradient(135deg, color-mix(in srgb, #FF9A3D 22%, var(--card)), color-mix(in srgb, #F2603C 12%, var(--card)))" }}
                      >
                        {MEAL_EMOJI[meal.mealType]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[15px] font-bold tracking-[-0.012em]">
                          {meal.label}
                        </span>
                        <span className="mt-px block text-xs text-muted-foreground">
                          {meal.items.length} dish{meal.items.length === 1 ? "" : "es"}
                        </span>
                      </span>
                      <span
                        className="flex shrink-0 items-center gap-1.5"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <NumberStepper
                          size="sm"
                          aria-label={`People for ${meal.label}`}
                          value={heads}
                          onChange={(n) => setMealPersons((p) => ({ ...p, [meal.mealType]: Math.max(0, Math.round(n)) }))}
                          min={0}
                          step={1}
                          disabled={orderingClosed}
                          unit="ppl"
                          className="overflow-hidden rounded-[10px] bg-card [&_input]:font-mono [&_input]:font-semibold"
                        />
                        {mealHead != null && mealHead !== persons && (
                          <button
                            type="button"
                            aria-label={`Reset ${meal.label} persons`} title="Reset to global headcount"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => setMealPersons((p) => { const n = { ...p }; delete n[meal.mealType]; return n; })}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform duration-200",
                          open ? "rotate-180 text-accent-strong" : "text-muted-foreground",
                        )}
                      />
                    </div>

                    {/* Dish rows */}
                    {open && (
                      <div className="grid grid-cols-1 gap-2.5 border-t border-border bg-background p-3.5 sm:grid-cols-2">
                        {meal.items.map((it) => {
                          const e = effFor(meal.mealType, it.dishId, it.qtyPerResident);
                          const key = itemKey(meal.mealType, it.dishId);
                          const step = qtyStep(it.unit);
                          return (
                            <div
                              key={it.dishId}
                              className={cn(
                                "flex items-center gap-2.5 rounded-[12px] border border-border bg-card px-3 py-2.5",
                                !e.included && "opacity-55",
                              )}
                            >
                              <span
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-xl"
                                style={{ background: "color-mix(in srgb, #FF9A3D 16%, var(--card))" }}
                              >
                                {dishEmoji(it.dishName, meal.mealType)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-semibold">{it.dishName}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {it.slotLabel ? `${it.slotLabel} · ` : ""}
                                  {fmtQty(it.qtyPerResident, it.unit)}/person · {e.persons} ppl
                                  {e.edited && <span className="font-semibold text-accent-strong"> · edited</span>}
                                </span>
                              </span>
                              {e.included ? (
                                <NumberStepper
                                  size="sm"
                                  aria-label={`Quantity of ${it.dishName}`}
                                  value={e.qty}
                                  onChange={(n) => patchOverride(key, { qty: round3(Math.max(0, n)) })}
                                  min={0}
                                  step={step}
                                  disabled={orderingClosed}
                                  unit={it.unit.toLowerCase()}
                                  className="shrink-0 overflow-hidden rounded-[10px] [&_input]:font-mono [&_input]:font-semibold"
                                />
                              ) : (
                                <Pill tone="muted">SKIPPED</Pill>
                              )}
                              {e.edited && e.included && (
                                <button
                                  type="button" disabled={orderingClosed}
                                  aria-label={`Reset ${it.dishName} to calculated`} title="Reset to calculated"
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                                  onClick={() => resetItem(meal.mealType, it.dishId)}
                                >
                                  <RotateCcw className="h-3 w-3" />
                                </button>
                              )}
                              {e.included ? (
                                <button
                                  type="button" disabled={orderingClosed}
                                  aria-label={`Skip ${it.dishName}`} title="Skip this dish"
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                                  onClick={() => setExcluded(meal.mealType, it.dishId, true)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button" disabled={orderingClosed}
                                  aria-label={`Add ${it.dishName} back`} title="Add back"
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                                  onClick={() => setExcluded(meal.mealType, it.dishId, false)}
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sticky send bar — sits at the end of the builder column and stays
            pinned to the viewport bottom while the meal cards scroll. */}
        {selection.mealCount > 0 && (
          <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] border border-border bg-card px-4 py-3 shadow-[0_8px_24px_rgba(36,26,21,.12),0_-4px_16px_rgba(36,26,21,.06)]">
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[15px] font-bold tracking-[-0.012em]">
                <span className="font-mono tabular-nums">{persons}</span> people ·{" "}
                {selection.mealCount} meal{selection.mealCount === 1 ? "" : "s"} ·{" "}
                {selection.itemCount} item{selection.itemCount === 1 ? "" : "s"}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {dateLabel}
                {draftSavedAt && <> · Draft saved <span className="font-mono tabular-nums">{format(draftSavedAt, "HH:mm")}</span></>}
              </div>
            </div>
            <button
              type="button"
              onClick={handlePlace}
              disabled={saving || !canPlace || orderingClosed}
              className={cn(
                "flex h-[52px] shrink-0 items-center gap-2 rounded-[12px] px-6 font-display text-base font-bold tracking-[-0.012em] transition-[filter] disabled:cursor-not-allowed",
                saving || !canPlace || orderingClosed
                  ? "bg-muted text-muted-foreground"
                  : "bg-success text-white hover:brightness-105",
              )}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Send {dayRelLabel.toLowerCase()}'s order — {sendMealsText} ✓
            </button>
          </div>
        )}
      </div>

      {/* Share drawer — copy link OR dispatch to active guests (available pre-order too) */}
      <ShareMenuDrawer
        open={shareOpen} onOpenChange={setShareOpen}
        brand={brand} dateLabel={dateLabel} propertyName={selectedProperty?.name}
        activeGuests={overview?.activeGuests ?? 0}
        shareLink={shareLink}
        onShare={(mode) => shareMutation.mutate(mode)}
        generating={shareMutation.isPending} sharingMode={sharingMode}
        onCopy={copyShareLink}
      />
    </div>
  );
}

/** Multi-property "Next Orders" board — one row per property tagged to the unit
 *  lead, showing its next orderable day, what's already ordered, and the single
 *  correct action (place / view status). */
function NextOrdersBoard({
  properties, isLoading, canPlace, onOpen,
}: {
  properties: NextOrderProperty[];
  isLoading: boolean;
  canPlace: boolean;
  onOpen: (propertyId: string) => void;
}) {
  const tomorrowStr = React.useMemo(() => format(addDays(todayDate(), 1), "yyyy-MM-dd"), []);
  const fmtDay = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    return ymd === tomorrowStr ? `tomorrow · ${format(dt, "EEE, dd MMM")}` : format(dt, "EEE, dd MMM");
  };

  const rank = (s: NextOrderStatus) =>
    s === "NOT_ORDERED" ? 0 : s === "PARTIAL" ? 1 : s === "ORDERED" ? 2 : s === "NO_MENU" ? 3 : 4;
  const sorted = React.useMemo(
    () => [...properties].sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name)),
    [properties],
  );
  const orderable = properties.filter((p) => p.configured && p.availableMeals.length > 0);
  const pending = properties.filter((p) => p.status === "NOT_ORDERED" || p.status === "PARTIAL");
  const pendingCount = pending.length;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-[14px]" />)}
      </div>
    );
  }
  if (properties.length === 0) {
    return (
      <div className="rounded-[14px] border border-border bg-card py-10">
        <EmptyState icon={Building2} title="No properties tagged to you" description="Ask an administrator to assign you to one or more properties from the Organization console." className="border-0 bg-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary strip */}
      {orderable.length > 0 && (
        <div className={cn(
          "flex items-center gap-2.5 rounded-[12px] border border-border px-4 py-3 text-sm",
          pendingCount > 0 ? "bg-warning-soft" : "bg-success-soft",
        )}>
          {pendingCount > 0 ? (
            <>
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <span><span className="font-semibold">{pendingCount} of {orderable.length} propert{orderable.length === 1 ? "y" : "ies"}</span> still need their next order.</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <span>Every property has its next order placed.</span>
            </>
          )}
        </div>
      )}

      {/* Rows */}
      <div className="flex flex-col gap-2.5">
        {sorted.map((p) => (
          <NextOrderRow key={p.propertyId} p={p} canPlace={canPlace} dayLabel={fmtDay(p.serviceDate)} onOpen={() => onOpen(p.propertyId)} />
        ))}
      </div>
    </div>
  );
}

/** One property row on the Next Orders board. */
function NextOrderRow({
  p, canPlace, dayLabel, onOpen,
}: { p: NextOrderProperty; canPlace: boolean; dayLabel: string; onOpen: () => void }) {
  const ordered = p.orderedMeals;
  const missing = p.availableMeals.filter((m) => !ordered.some((o) => o.mealType === m.mealType));

  const statusMeta: Record<NextOrderStatus, { label: string; cls: string }> = {
    NOT_ORDERED: { label: "NOT ORDERED", cls: "bg-warning-soft text-warning" },
    PARTIAL: { label: `${missing.length} MEAL${missing.length === 1 ? "" : "S"} PENDING`, cls: "bg-warning-soft text-warning" },
    ORDERED: { label: "ORDERED", cls: "bg-success-soft text-success" },
    NO_MENU: { label: "NO MENU", cls: "bg-muted text-muted-foreground" },
    NOT_CONFIGURED: { label: "NOT CONFIGURED", cls: "bg-muted text-muted-foreground" },
  };
  const meta = statusMeta[p.status];
  const mutedRow = p.status === "NOT_CONFIGURED" || p.status === "NO_MENU";

  return (
    <div className={cn("rounded-[14px] border border-border bg-card px-4 py-3.5 sm:px-[18px]", mutedRow && "opacity-75")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-[180px] flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[15px] font-bold tracking-[-0.012em]">{p.name}</span>
            {p.brand && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {p.brand}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {p.city ? `${p.city} · ` : ""}{p.activeGuests} active guest{p.activeGuests === 1 ? "" : "s"}
            {p.configured && p.availableMeals.length > 0 ? ` · for ${dayLabel}` : ""}
          </p>
          {ordered.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ordered.map((o) => (
                <span key={o.orderId} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px]">
                  {o.label}
                  <StatusBadge status={o.status} className="h-4 px-1 text-[9px]" />
                </span>
              ))}
            </div>
          )}
        </div>

        <span className={cn("inline-flex shrink-0 items-center rounded-full px-[9px] py-[3px] text-[11px] font-bold", meta.cls)}>
          {meta.label}
        </span>

        {/* The single correct action for this property's state */}
        {p.status === "NOT_CONFIGURED" ? (
          <Button size="sm" variant="outline" className="rounded-[9px]" disabled>Place order</Button>
        ) : p.status === "NO_MENU" ? (
          <Button size="sm" variant="outline" className="rounded-[9px]" disabled>No menu</Button>
        ) : p.status === "NOT_ORDERED" ? (
          <Button size="sm" className="rounded-[9px]" onClick={onOpen} disabled={!canPlace}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Place order
          </Button>
        ) : p.status === "PARTIAL" ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="rounded-[9px]" onClick={onOpen}>View status</Button>
            <Button size="sm" className="rounded-[9px]" onClick={onOpen} disabled={!canPlace}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add {missing.length} meal{missing.length === 1 ? "" : "s"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="rounded-[9px]" onClick={onOpen}>
            <Truck className="mr-1.5 h-3.5 w-3.5" /> View status
          </Button>
        )}
      </div>
    </div>
  );
}

/** Share drawer — copy a menu link OR dispatch the menu to the property's active guests. */
function ShareMenuDrawer({
  open, onOpenChange, brand, dateLabel, propertyName, activeGuests, shareLink, onShare, generating, sharingMode, onCopy,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  brand: string | null; dateLabel: string; propertyName?: string;
  activeGuests: number;
  shareLink: string | null;
  onShare: (mode: "LINK" | "GUESTS") => void; generating: boolean;
  sharingMode?: "LINK" | "GUESTS"; onCopy: () => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2"><Share2 className="h-5 w-5 text-accent" /> Share menu</DrawerTitle>
            <DrawerDescription>{brand} • {dateLabel}{propertyName ? ` • ${propertyName}` : ""}</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-5 px-4">
            {/* Option 1 — copy a shareable link */}
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Link2 className="h-4 w-4 text-accent" /> Copy a shareable link
              </p>
              <p className="text-xs text-muted-foreground">Generate a public menu link anyone can open.</p>
              {shareLink ? (
                <div className="flex items-center gap-2">
                  <Input readOnly value={shareLink} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={onCopy} aria-label="Copy link"><Copy className="h-4 w-4" /></Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => onShare("LINK")} disabled={generating}>
                    {generating && sharingMode === "LINK" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Regenerate
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => onShare("LINK")} disabled={generating}>
                  {generating && sharingMode === "LINK" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Link2 className="mr-2 h-4 w-4" /> Generate link
                </Button>
              )}
            </div>

            <Separator />

            {/* Option 2 — dispatch to the property's active guests */}
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4 text-accent" /> Share with active guests
              </p>
              <p className="text-xs text-muted-foreground">
                {activeGuests > 0
                  ? `Email the menu to all ${activeGuests} active guest${activeGuests === 1 ? "" : "s"} at ${propertyName ?? "this property"}.`
                  : `Email the menu to all active guests at ${propertyName ?? "this property"}.`}
              </p>
              <Button type="button" size="sm" onClick={() => onShare("GUESTS")} disabled={generating}>
                {generating && sharingMode === "GUESTS" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Share with guests
              </Button>
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild><Button variant="outline">Close</Button></DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
