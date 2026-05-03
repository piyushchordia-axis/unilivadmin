import * as React from "react";
import {
  useGetProperties,
  getGetPropertiesQueryKey,
  type PropertyDto,
} from "@workspace/api-client-react";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Eye, Pencil, Building2, Bed, Users, Percent, Search } from "lucide-react";
import { useLocation } from "wouter";
import { PropertyFormModal } from "@/components/property-form-modal";
import { Badge } from "@/components/ui/badge";
import { PORTFOLIO_TYPES, PORTFOLIO_TYPE_LABELS, type PortfolioType } from "@/lib/portfolio-types";

export default function Properties() {
  const [, setLocation] = useLocation();
  const { data: propertiesRes, isLoading } = useGetProperties(undefined, {
    query: { queryKey: getGetPropertiesQueryKey() },
  });

  const properties = propertiesRes?.data || [];

  const [city, setCity] = React.useState<string>("ALL");
  const [status, setStatus] = React.useState<string>("ALL");
  const [portfolioType, setPortfolioType] = React.useState<string>("ALL");
  const [search, setSearch] = React.useState("");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PropertyDto | null>(null);

  const cities = React.useMemo(
    () => Array.from(new Set(properties.map((p) => p.city).filter(Boolean))),
    [properties]
  );

  const filtered = React.useMemo(() => {
    return properties.filter((p) => {
      if (city !== "ALL" && p.city !== city) return false;
      if (status !== "ALL" && p.status !== status) return false;
      if (portfolioType !== "ALL" && (p.portfolioType || "CO_LIVING") !== portfolioType) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [properties, city, status, portfolioType, search]);

  const totalBeds = properties.reduce((s, p) => s + (p.totalBeds || 0), 0);
  const totalOccupied = properties.reduce((s, p) => s + (p.occupiedBeds || 0), 0);
  const avgOcc =
    totalBeds > 0 ? Math.round((totalOccupied / totalBeds) * 100) : 0;

  const openEdit = (p: PropertyDto) => {
    setEditing(p);
    setModalOpen(true);
  };
  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const columns = [
    { accessorKey: "name", header: "Name" },
    {
      id: "portfolioType",
      header: "Type",
      cell: ({ row }: any) => {
        const t = (row.original.portfolioType || "CO_LIVING") as PortfolioType;
        return (
          <Badge variant="outline" data-testid={`badge-portfolio-${row.original.id}`}>
            {PORTFOLIO_TYPE_LABELS[t] || t}
          </Badge>
        );
      },
    },
    {
      id: "location",
      header: "Location",
      cell: ({ row }: any) => `${row.original.city}, ${row.original.state}`,
    },
    {
      accessorKey: "totalBeds",
      header: "Total Beds",
      cell: ({ row }: any) => row.original.totalBeds,
    },
    {
      id: "occupied",
      header: "Occupied",
      cell: ({ row }: any) =>
        `${row.original.occupiedBeds || 0}/${row.original.totalBeds || 0}`,
    },
    {
      id: "occupancy",
      header: "Occupancy %",
      cell: ({ row }: any) => {
        const pct = row.original.totalBeds
          ? Math.round(
              ((row.original.occupiedBeds || 0) / row.original.totalBeds) * 100
            )
          : 0;
        return (
          <div className="flex items-center gap-2 min-w-[120px]">
            <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-accent"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-medium text-primary tabular-nums">
              {pct}%
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: any) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }: any) => (
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setLocation(`/properties/${row.original.id}`);
            }}
            data-testid={`button-view-property-${row.original.id}`}
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row.original);
            }}
            data-testid={`button-edit-property-${row.original.id}`}
          >
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Properties"
        subtitle="Manage all co-living properties and buildings"
        action={
          <Button
            className="bg-accent hover:bg-accent/90 text-white"
            onClick={openCreate}
            data-testid="button-add-property"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Property
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Properties" value={properties.length} icon={Building2} />
        <StatCard title="Total Beds" value={totalBeds} icon={Bed} />
        <StatCard title="Total Occupied" value={totalOccupied} icon={Users} />
        <StatCard title="Avg Occupancy %" value={`${avgOcc}%`} icon={Percent} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={city} onValueChange={setCity}>
          <SelectTrigger className="w-40" data-testid="select-filter-city">
            <SelectValue placeholder="City" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Cities</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={portfolioType} onValueChange={setPortfolioType}>
          <SelectTrigger className="w-48" data-testid="select-filter-portfolio-type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            {PORTFOLIO_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {PORTFOLIO_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="UNDER_RENOVATION">Under Renovation</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search properties..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-properties"
          />
        </div>
      </div>

      <DataTable
        columns={columns as any}
        data={filtered}
        isLoading={isLoading}
      />

      <PropertyFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        property={editing}
      />
    </div>
  );
}
