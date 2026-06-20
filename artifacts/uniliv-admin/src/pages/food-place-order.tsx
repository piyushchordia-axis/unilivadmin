import * as React from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import jsPDF from "jspdf";
import {
  UtensilsCrossed, ChefHat, Loader2, Building2, CalendarDays, Users, Minus, Plus,
  Check, ChevronsUpDown, Clock, Lock, Download, Share2, Mail, MessageCircle,
  Link2, Copy, Soup, Info, Tag, AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  foodApi, foodKeys, MEAL_LABEL, fmtQty,
  type Cutoff, type OrderPreview, type PropertyOverview,
} from "@/lib/food-api";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/store";
import { usePermissions } from "@/lib/use-permissions";
import { cn } from "@/lib/utils";

type ShareChannel = "EMAIL" | "WHATSAPP" | "LINK";
type ShareRecipientType = "GUESTS" | "CUSTOM";

// Per-item editable state, keyed `${mealType}__${dishId}`.
type ItemState = { included: boolean; persons: number; qty: number };

const todayDate = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const itemKey = (mealType: string, dishId: string) => `${mealType}__${dishId}`;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export default function FoodPlaceOrder() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { propertyId: storePropertyId } = useAppStore();
  const { can } = usePermissions();
  const canPlace = can("FOOD_PLACE_ORDER", "create");

  const [propertyId, setPropertyId] = React.useState<string>("");
  const [propertyOpen, setPropertyOpen] = React.useState(false);
  const [date, setDate] = React.useState<Date>(todayDate());
  const [dateOpen, setDateOpen] = React.useState(false);
  const [defaultPersons, setDefaultPersons] = React.useState<number>(1);

  const [items, setItems] = React.useState<Record<string, ItemState>>({});

  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareChannel, setShareChannel] = React.useState<ShareChannel>("EMAIL");
  const [shareRecipientType, setShareRecipientType] = React.useState<ShareRecipientType>("GUESTS");
  const [shareLink, setShareLink] = React.useState<string | null>(null);

  const dateStr = format(date, "yyyy-MM-dd");
  const dateLabel = format(date, "EEE, dd MMM yyyy");

  // ── Lookups (properties carry inherited brand + kitchen) ──
  const { data: lookups, isLoading: lookupsLoading } = useQuery({
    queryKey: foodKeys.lookups(),
    queryFn: () => foodApi.lookups(),
  });
  const properties = lookups?.properties ?? [];

  React.useEffect(() => {
    if (propertyId) return;
    if (storePropertyId && properties.some((p) => p.id === storePropertyId)) setPropertyId(storePropertyId);
    else if (properties.length > 0) setPropertyId(properties[0].id);
  }, [properties, storePropertyId, propertyId]);

  const selectedProperty = properties.find((p) => p.id === propertyId);
  const brand = selectedProperty?.brand ?? null;
  const configured = Boolean(selectedProperty?.brand && selectedProperty?.kitchenId);

  // Seed default persons from the property's active-guest count.
  const { data: overview } = useQuery<PropertyOverview | null>({
    queryKey: foodKeys.propertyOverview({ propertyId }),
    queryFn: () => foodApi.propertyOverview({ propertyId }),
    enabled: !!propertyId,
  });
  React.useEffect(() => {
    if (overview && overview.activeGuests > 0) setDefaultPersons(overview.activeGuests);
  }, [overview?.id]);

  // ── Cut-offs ──
  const { data: cutoffsRaw } = useQuery({
    queryKey: foodKeys.cutoffs({ brand, propertyId, date: dateStr }),
    queryFn: () => foodApi.cutoffs({ brand: brand!, propertyId, date: dateStr }),
    enabled: !!propertyId && !!brand,
  });
  const cutoffByMeal = React.useMemo(() => {
    const map: Record<string, Cutoff> = {};
    (cutoffsRaw ?? []).forEach((c) => { map[c.mealType] = c; });
    return map;
  }, [cutoffsRaw]);

  // ── Per-item order preview (editable persons + auto qty) ──
  const { data: preview, isLoading: previewLoading } = useQuery<OrderPreview>({
    queryKey: foodKeys.orderPreview({ propertyId, date: dateStr, persons: defaultPersons }),
    queryFn: () => foodApi.orderPreview({ propertyId, serviceDate: dateStr, persons: defaultPersons }),
    enabled: !!propertyId && configured,
  });

  // Seed editable item state whenever a fresh preview arrives (bulk reset).
  React.useEffect(() => {
    if (!preview?.meals) return;
    const next: Record<string, ItemState> = {};
    for (const meal of preview.meals) {
      const closed = !!cutoffByMeal[meal.mealType]?.isPastCutoff;
      for (const it of meal.items) {
        next[itemKey(meal.mealType, it.dishId)] = {
          included: !closed,
          persons: it.defaultPersons,
          qty: it.defaultOrderedQty,
        };
      }
    }
    setItems(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  // ── Live full-day menu (for download / share) ──
  const { data: fullMenu, isLoading: menuLoading } = useQuery({
    queryKey: foodKeys.fullMenu({ propertyId, date: dateStr }),
    queryFn: () => foodApi.fullMenu({ propertyId, date: dateStr }),
    enabled: !!propertyId && configured,
  });

  // ── Item mutators ──
  const setItemPersons = (mt: string, dishId: string, persons: number, qtyPerResident: number) => {
    const key = itemKey(mt, dishId);
    setItems((prev) => {
      const cur = prev[key] ?? { included: true, persons, qty: 0 };
      const p = Math.max(0, persons);
      return { ...prev, [key]: { ...cur, persons: p, qty: round3(p * qtyPerResident) } };
    });
  };
  const setItemQty = (mt: string, dishId: string, qty: number) => {
    const key = itemKey(mt, dishId);
    setItems((prev) => {
      const cur = prev[key] ?? { included: true, persons: defaultPersons, qty: 0 };
      return { ...prev, [key]: { ...cur, qty: Math.max(0, qty) } };
    });
  };
  const setItemIncluded = (mt: string, dishId: string, included: boolean) => {
    const key = itemKey(mt, dishId);
    setItems((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { persons: defaultPersons, qty: 0 }), included } }));
  };
  const toggleMeal = (mt: string, included: boolean, dishIds: string[]) => {
    setItems((prev) => {
      const next = { ...prev };
      for (const d of dishIds) {
        const key = itemKey(mt, d);
        next[key] = { ...(next[key] ?? { persons: defaultPersons, qty: 0 }), included };
      }
      return next;
    });
  };

  // ── Derived selection ──
  const selection = React.useMemo(() => {
    const meals = (preview?.meals ?? []).map((meal) => {
      const closed = !!cutoffByMeal[meal.mealType]?.isPastCutoff;
      const chosen = closed ? [] : meal.items
        .map((it) => ({ it, st: items[itemKey(meal.mealType, it.dishId)] }))
        .filter(({ st }) => st?.included && (st?.qty ?? 0) > 0)
        .map(({ it, st }) => ({ dishId: it.dishId, personsCount: st!.persons, orderedQty: st!.qty, unit: it.unit }));
      return { mealType: meal.mealType, items: chosen };
    }).filter((m) => m.items.length > 0);
    const itemCount = meals.reduce((s, m) => s + m.items.length, 0);
    return { meals, itemCount, mealCount: meals.length };
  }, [preview, items, cutoffByMeal]);

  // ── Place order ──
  const placeMutation = useMutation({
    mutationFn: () => foodApi.placeOrderBatch({
      propertyId, serviceDate: dateStr, persons: defaultPersons, meals: selection.meals,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["food"] });
      const n = res?.orders?.length ?? selection.mealCount;
      toast({ title: `${n} order${n === 1 ? "" : "s"} placed`, description: `${selectedProperty?.name ?? "Property"} • ${brand} • ${dateLabel}` });
      navigate("/food/orders");
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to place order", variant: "destructive" }),
  });

  const handlePlace = () => {
    if (!propertyId) { toast({ title: "Select a property first", variant: "destructive" }); return; }
    if (!configured) { toast({ title: "Property not configured for ordering", variant: "destructive" }); return; }
    if (selection.mealCount === 0) { toast({ title: "Add at least one item", description: "Include an item with quantity greater than 0.", variant: "destructive" }); return; }
    placeMutation.mutate();
  };

  // ── Share ──
  const shareMutation = useMutation({
    mutationFn: () => foodApi.shareMenu({ propertyId, brand, date: dateStr, channel: shareChannel, recipientType: shareRecipientType }),
    onSuccess: (res: any) => {
      if (shareChannel === "LINK" && res?.shareToken) { setShareLink(`${window.location.origin}/m/${res.shareToken}`); toast({ title: "Share link ready" }); }
      else { setShareLink(null); const count = res?.recipientCount ?? 0; toast({ title: shareRecipientType === "GUESTS" ? `Menu shared with ${count} guest${count === 1 ? "" : "s"}` : "Menu shared" }); setShareOpen(false); }
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to share menu", variant: "destructive" }),
  });

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
      toast({ title: "Menu downloaded" });
    } catch (e: any) { toast({ title: e?.message || "Couldn't generate PDF", variant: "destructive" }); }
  };

  const copyShareLink = async () => {
    if (!shareLink) return;
    try { await navigator.clipboard.writeText(shareLink); toast({ title: "Link copied" }); }
    catch { toast({ title: "Couldn't copy link", variant: "destructive" }); }
  };

  const saving = placeMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Place Order"
        subtitle="Order per-item quantities for a property's day of service"
        breadcrumbs={[{ label: "Food", href: "/food/orders" }, { label: "Place Order" }]}
        action={
          <Button onClick={handlePlace} disabled={saving || !canPlace || selection.mealCount === 0} className="bg-accent hover:bg-accent/90 text-white" size="lg">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UtensilsCrossed className="mr-2 h-4 w-4" />}
            Place order
            {selection.itemCount > 0 && <Badge variant="secondary" className="ml-2 bg-white/20 text-white border-0">{selection.itemCount}</Badge>}
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── Left: builder ── */}
        <div className="lg:col-span-7 space-y-6">
          {/* Service context */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="font-display flex items-center gap-2 text-base"><Building2 className="h-5 w-5 text-accent" /> Service details</CardTitle>
              <CardDescription>Who is being served, on which day. Brand is inherited from the property.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Property combobox */}
              <div className="space-y-1.5">
                <Label>Property</Label>
                <Popover open={propertyOpen} onOpenChange={setPropertyOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={propertyOpen} className="w-full justify-between font-normal" disabled={lookupsLoading}>
                      <span className="flex items-center gap-2 truncate">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{selectedProperty?.name ?? (lookupsLoading ? "Loading properties…" : "Select property")}</span>
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                    <Command>
                      <CommandInput placeholder="Search properties…" />
                      <CommandList>
                        <CommandEmpty>No property found.</CommandEmpty>
                        <CommandGroup>
                          {properties.map((p) => (
                            <CommandItem key={p.id} value={p.name} onSelect={() => { setPropertyId(p.id); setPropertyOpen(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", propertyId === p.id ? "opacity-100" : "opacity-0")} />
                              <span className="flex-1">{p.name}</span>
                              {p.brand && <Badge variant="outline" className="ml-2 text-[10px]">{p.brand}</Badge>}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Inherited brand chip */}
                <div className="space-y-1.5">
                  <Label>Brand (inherited)</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3">
                    {brand ? (
                      <Badge variant="secondary" className="gap-1"><Tag className="h-3 w-3" /> {brand}</Badge>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-500"><AlertTriangle className="h-3.5 w-3.5" /> Not set</span>
                    )}
                  </div>
                </div>

                {/* Service date */}
                <div className="space-y-1.5">
                  <Label>Service date</Label>
                  <Popover open={dateOpen} onOpenChange={setDateOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start font-normal">
                        <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />{dateLabel}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-auto" align="start">
                      <Calendar mode="single" selected={date} onSelect={(d) => { if (d) { const nd = new Date(d); nd.setHours(0, 0, 0, 0); setDate(nd); } setDateOpen(false); }} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Default persons stepper */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Users className="h-4 w-4 text-muted-foreground" /> Default persons</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" onClick={() => setDefaultPersons((c) => Math.max(0, c - 1))} aria-label="Decrease persons"><Minus className="h-4 w-4" /></Button>
                  <Input type="number" min={0} value={defaultPersons} onChange={(e) => setDefaultPersons(Math.max(0, Number(e.target.value) || 0))} className="w-24 text-center font-mono" />
                  <Button type="button" variant="outline" size="icon" onClick={() => setDefaultPersons((c) => c + 1)} aria-label="Increase persons"><Plus className="h-4 w-4" /></Button>
                  <p className="text-xs text-muted-foreground ml-1">Pre-fills each item's persons &amp; quantity. Override per item below.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Per-item meal grid */}
          {!configured ? (
            <Card><CardContent className="py-10">
              <EmptyState icon={AlertTriangle} title="Property not configured" description="This property has no brand or kitchen assigned, so it can't take orders. Ask an admin to configure it in the Organization console." />
            </CardContent></Card>
          ) : previewLoading ? (
            <Card><CardContent className="space-y-3 py-6">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
            </CardContent></Card>
          ) : !preview || preview.meals.length === 0 ? (
            <Card><CardContent className="py-10">
              <EmptyState icon={Soup} title="No menu for this day" description="Nothing is configured for this property's kitchen and brand on the selected date." />
            </CardContent></Card>
          ) : (
            preview.meals.map((meal) => {
              const cutoff = cutoffByMeal[meal.mealType];
              const closed = !!cutoff?.isPastCutoff;
              const dishIds = meal.items.map((i) => i.dishId);
              const allIncluded = !closed && dishIds.every((d) => items[itemKey(meal.mealType, d)]?.included);
              return (
                <Card key={meal.mealType} className={cn(closed && "opacity-70")}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="font-display flex items-center gap-2 text-base">
                        <Soup className="h-5 w-5 text-accent" /> {meal.label}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {closed ? (
                          <Badge variant="destructive" className="gap-1 text-[10px]"><Lock className="h-3 w-3" /> Closed</Badge>
                        ) : cutoff?.cutoffTime ? (
                          <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground"><Clock className="h-3 w-3" /> Cut-off {cutoff.cutoffTime}</Badge>
                        ) : null}
                        {!closed && (
                          <div className="flex items-center gap-1.5">
                            <Switch checked={allIncluded} onCheckedChange={(v) => toggleMeal(meal.mealType, v, dishIds)} aria-label={`Include all ${meal.label}`} />
                            <span className="text-xs text-muted-foreground">All</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 px-4 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      <span>Dish</span><span className="text-center">Persons</span><span className="text-center">Quantity</span>
                    </div>
                    <ul className="divide-y">
                      {meal.items.map((it) => {
                        const st = items[itemKey(meal.mealType, it.dishId)] ?? { included: !closed, persons: it.defaultPersons, qty: it.defaultOrderedQty };
                        return (
                          <li key={it.dishId} className={cn("grid grid-cols-[1fr_auto_auto] items-center gap-x-3 px-4 py-2.5", !st.included && "opacity-50")}>
                            <div className="flex min-w-0 items-center gap-2.5">
                              <Switch checked={st.included} disabled={closed} onCheckedChange={(v) => setItemIncluded(meal.mealType, it.dishId, v)} aria-label={`Include ${it.dishName}`} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{it.dishName}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {it.slotLabel ? `${it.slotLabel} · ` : ""}{fmtQty(it.qtyPerResident, it.unit)}/person
                                </p>
                              </div>
                            </div>
                            <Input type="number" min={0} disabled={closed || !st.included} value={st.persons}
                              onChange={(e) => setItemPersons(meal.mealType, it.dishId, Number(e.target.value) || 0, it.qtyPerResident)}
                              className="h-8 w-20 text-center font-mono" aria-label={`${it.dishName} persons`} />
                            <div className="flex items-center gap-1">
                              <Input type="number" min={0} step="0.001" disabled={closed || !st.included} value={st.qty}
                                onChange={(e) => setItemQty(meal.mealType, it.dishId, Number(e.target.value) || 0)}
                                className="h-8 w-24 text-center font-mono" aria-label={`${it.dishName} quantity`} />
                              <span className="w-10 text-xs lowercase text-muted-foreground">{it.unit.toLowerCase()}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* ── Right: summary + share ── */}
        <div className="lg:col-span-5">
          <Card className="lg:sticky lg:top-6">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="font-display flex items-center gap-2 text-base"><ChefHat className="h-5 w-5 text-accent" /> Order summary</CardTitle>
                  <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5">
                    {brand && <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{brand}</Badge>}
                    <span className="inline-flex items-center gap-1 text-xs"><CalendarDays className="h-3 w-3" /> {dateLabel}</span>
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" className="flex-1" onClick={downloadMenuPdf} disabled={menuLoading || !configured}><Download className="mr-2 h-4 w-4" /> Download</Button>
                <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => { setShareLink(null); setShareOpen(true); }} disabled={!propertyId || !configured}><Share2 className="mr-2 h-4 w-4" /> Share</Button>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="p-4">
              {selection.mealCount === 0 ? (
                <EmptyState icon={Info} title="Nothing selected" description="Include items and set quantities to build the order." />
              ) : (
                <div className="space-y-3">
                  {selection.meals.map((m) => (
                    <div key={m.mealType} className="rounded-lg border">
                      <div className="border-b px-3 py-2 text-sm font-semibold font-display">{MEAL_LABEL[m.mealType as keyof typeof MEAL_LABEL] ?? m.mealType}</div>
                      <ul className="divide-y">
                        {m.items.map((it) => {
                          const dish = preview?.meals.find((pm) => pm.mealType === m.mealType)?.items.find((x) => x.dishId === it.dishId);
                          return (
                            <li key={it.dishId} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                              <span className="truncate">{dish?.dishName ?? it.dishId}</span>
                              <span className="shrink-0 text-muted-foreground">{it.personsCount}p · {fmtQty(it.orderedQty, it.unit)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            {selection.mealCount > 0 && (
              <>
                <Separator />
                <div className="flex items-center justify-between p-4">
                  <div className="text-sm">
                    <span className="text-muted-foreground">{selection.mealCount} meal{selection.mealCount === 1 ? "" : "s"} · </span>
                    <span className="font-semibold">{selection.itemCount} item{selection.itemCount === 1 ? "" : "s"}</span>
                  </div>
                  <Button onClick={handlePlace} disabled={saving || !canPlace} className="bg-accent hover:bg-accent/90 text-white">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UtensilsCrossed className="mr-2 h-4 w-4" />}
                    Place order
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* ── Share drawer ── */}
      <Drawer open={shareOpen} onOpenChange={setShareOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-lg">
            <DrawerHeader>
              <DrawerTitle className="flex items-center gap-2"><Share2 className="h-5 w-5 text-accent" /> Share menu</DrawerTitle>
              <DrawerDescription>{brand} • {dateLabel}{selectedProperty ? ` • ${selectedProperty.name}` : ""}</DrawerDescription>
            </DrawerHeader>
            <div className="px-4 space-y-6">
              <div className="space-y-2">
                <Label>Channel</Label>
                <RadioGroup value={shareChannel} onValueChange={(v) => setShareChannel(v as ShareChannel)} className="grid grid-cols-3 gap-2">
                  {[{ v: "EMAIL", label: "Email", icon: Mail }, { v: "WHATSAPP", label: "WhatsApp", icon: MessageCircle }, { v: "LINK", label: "Link", icon: Link2 }].map(({ v, label, icon: Icon }) => (
                    <Label key={v} htmlFor={`channel-${v}`} className={cn("flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors", shareChannel === v ? "border-accent bg-accent/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50")}>
                      <RadioGroupItem id={`channel-${v}`} value={v} className="sr-only" />
                      <Icon className="h-5 w-5" />{label}
                    </Label>
                  ))}
                </RadioGroup>
              </div>
              {shareChannel !== "LINK" && (
                <div className="space-y-2">
                  <Label>Recipients</Label>
                  <RadioGroup value={shareRecipientType} onValueChange={(v) => setShareRecipientType(v as ShareRecipientType)} className="grid grid-cols-2 gap-2">
                    {[{ v: "GUESTS", label: "All active guests" }, { v: "CUSTOM", label: "Custom" }].map(({ v, label }) => (
                      <Label key={v} htmlFor={`rcpt-${v}`} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors", shareRecipientType === v ? "border-accent bg-accent/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50")}>
                        <RadioGroupItem id={`rcpt-${v}`} value={v} />{label}
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
              )}
              {shareChannel === "LINK" && shareLink && (
                <div className="space-y-2">
                  <Label>Shareable link</Label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={shareLink} className="font-mono text-xs" />
                    <Button type="button" variant="outline" size="icon" onClick={copyShareLink} aria-label="Copy link"><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </div>
            <DrawerFooter>
              <Button onClick={() => shareMutation.mutate()} disabled={shareMutation.isPending || !propertyId} className="bg-accent hover:bg-accent/90 text-white">
                {shareMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {shareChannel === "LINK" ? "Generate link" : "Share menu"}
              </Button>
              <DrawerClose asChild><Button variant="outline">Close</Button></DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
