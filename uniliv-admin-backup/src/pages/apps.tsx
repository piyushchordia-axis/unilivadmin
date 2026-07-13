import * as React from "react";
import { Link } from "wouter";
import {
  Search, LayoutDashboard, Building2, Wrench, Users, Truck,
  ChefHat, UtensilsCrossed, TrendingUp, Landmark, Settings, LayoutGrid,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { navGroups, type NavItem } from "@/lib/nav";
import { usePermissions } from "@/lib/use-permissions";
import { cn } from "@/lib/utils";

const MODULE_ICON: Record<string, LucideIcon> = {
  Overview: LayoutDashboard,
  Properties: Building2,
  Operations: Wrench,
  People: Users,
  "Supply Chain": Truck,
  "Kitchen & Menu": ChefHat,
  Food: UtensilsCrossed,
  Audits: ClipboardCheck,
  Growth: TrendingUp,
  Finance: Landmark,
  Settings: Settings,
};

// Icon colour per module — the tile card stays white (like the reference app),
// with the module's icon carrying the colour.
const MODULE_ICON_COLOR: Record<string, string> = {
  Overview: "text-indigo-500 dark:text-indigo-400",
  Properties: "text-violet-500 dark:text-violet-400",
  Operations: "text-cyan-500 dark:text-cyan-400",
  People: "text-rose-500 dark:text-rose-400",
  "Supply Chain": "text-amber-500 dark:text-amber-400",
  "Kitchen & Menu": "text-orange-500 dark:text-orange-400",
  Food: "text-emerald-500 dark:text-emerald-400",
  Audits: "text-sky-500 dark:text-sky-400",
  Growth: "text-fuchsia-500 dark:text-fuchsia-400",
  Finance: "text-teal-500 dark:text-teal-400",
  Settings: "text-slate-500 dark:text-slate-400",
};

// Preferred landing page when a module tile is clicked (falls back to the
// module's first accessible page). Food opens its dashboard, not /home.
const MODULE_HOME: Record<string, string> = {
  Food: "/food/dashboard",
};

type ModuleCard = { title: string; items: NavItem[] };

function ModuleTile({ m }: { m: ModuleCard }) {
  const Icon = MODULE_ICON[m.title] ?? LayoutGrid;
  const href = m.items.find((i) => i.href === MODULE_HOME[m.title])?.href ?? m.items[0].href;
  return (
    <Link href={href}>
      <div className="group flex cursor-pointer flex-col items-center gap-2.5">
        <div className="flex aspect-square w-full max-w-[92px] items-center justify-center rounded-2xl bg-card shadow-sm ring-1 ring-border/60 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
          <Icon className={cn("h-9 w-9", MODULE_ICON_COLOR[m.title] ?? "text-accent")} />
        </div>
        <span className="text-center text-sm font-semibold text-foreground transition-colors group-hover:text-accent">
          {m.title}
        </span>
      </div>
    </Link>
  );
}

/** App launcher — the universal post-login landing (see homeForRole): one tile
 *  per module the signed-in role can access, shown as an icon grid (colour icon
 *  in a card, name beneath). Searching filters the modules; precise page search
 *  is the command palette (Cmd/Ctrl-K). Sourced from the same permission-
 *  filtered nav data as the sidebar. */
export default function AppLauncher() {
  const { me, can } = usePermissions();
  const [query, setQuery] = React.useState("");

  const modules = React.useMemo<ModuleCard[]>(() => {
    return navGroups
      .map((g) => ({
        title: g.title,
        items: g.items.filter((i) => i.href !== "/apps" && (!i.module || can(i.module, "view"))),
      }))
      .filter((m) => m.items.length > 0);
  }, [can]);

  const q = query.trim().toLowerCase();
  const visible = q
    ? modules.filter((m) =>
        m.title.toLowerCase().includes(q) || m.items.some((i) => i.title.toLowerCase().includes(q)))
    : modules;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        subtitle="Everything you can access, one tap away."
        action={
          <div className="relative w-full md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a module…"
              aria-label="Find a module"
              className="pl-9"
            />
          </div>
        }
      />

      {!me ? (
        <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2.5">
              <Skeleton className="aspect-square w-full max-w-[92px] rounded-2xl" />
              <Skeleton className="h-3.5 w-16 rounded" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No modules match"
          description={q
            ? `Nothing matches “${query.trim()}”. Try a different search.`
            : "Your role has no modules assigned. Contact your administrator."}
        />
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {visible.map((m) => (
            <ModuleTile key={m.title} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}
