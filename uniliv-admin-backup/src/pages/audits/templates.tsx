import * as React from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FormModal } from "@/components/ui/form-modal";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import {
  AUDIT_TYPES, AUDIT_TYPE_LABELS, fmtDate, titleCase,
  type ApiOne, type ApiList, type AuditType, type TargetType, type TemplateRow,
} from "./lib";
import { TypeBadge, LifecycleBadge } from "./shared";

/** Template library register (FR-TM-01): every checklist with its latest
 *  version, lifecycle and usage counts. Row click opens the template detail. */
export default function AuditTemplates() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = React.useState<string>("ALL");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    auditType: "UL" as AuditType,
    targetType: "PROPERTY" as TargetType,
    category: "",
  });

  const templatesQuery = useQuery({
    queryKey: ["/audit/templates"],
    queryFn: () => apiFetch<ApiList<TemplateRow>>("/audit/templates?limit=200"),
  });

  const rows = React.useMemo(() => {
    const all = templatesQuery.data?.data ?? [];
    return typeFilter === "ALL" ? all : all.filter((t) => t.auditType === typeFilter);
  }, [templatesQuery.data, typeFilter]);

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch<ApiOne<TemplateRow>>("/audit/templates", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          auditType: form.auditType,
          targetType: form.targetType,
          ...(form.category.trim() ? { category: form.category.trim() } : {}),
        }),
      }),
    onSuccess: (res) => {
      toast({ title: "Template created — v1 draft ready" });
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["/audit/templates"] });
      navigate(`/audits/templates/${res.data.id}`);
    },
    onError: (e: Error) => toast({ title: e.message || "Create failed", variant: "destructive" }),
  });

  const columns: ColumnDef<TemplateRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="max-w-[320px]">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{row.original.name}</span>
            {row.original.archivedAt && <Badge variant="outline">Archived</Badge>}
          </div>
          {row.original.category && (
            <div className="truncate text-xs text-muted-foreground">{row.original.category}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "auditType",
      header: "Type",
      cell: ({ row }) => <TypeBadge type={row.original.auditType} />,
    },
    {
      accessorKey: "targetType",
      header: "Target",
      cell: ({ row }) => (
        <span className="text-sm">{titleCase(row.original.targetType)}</span>
      ),
    },
    {
      accessorKey: "latestVersionNo",
      header: "Version",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm tabular-nums">v{row.original.latestVersionNo}</span>
          <LifecycleBadge lifecycle={row.original.lifecycle} />
        </div>
      ),
    },
    {
      accessorKey: "activeSchedules",
      header: "Active Schedules",
      cell: ({ row }) => <span className="tabular-nums">{row.original.activeSchedules}</span>,
    },
    {
      accessorKey: "auditsGenerated",
      header: "Audits Generated",
      cell: ({ row }) => <span className="tabular-nums">{row.original.auditsGenerated}</span>,
    },
    {
      accessorKey: "updatedAt",
      header: "Updated",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{fmtDate(row.original.updatedAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        subtitle="Checklist library with versioning and the publication workflow — published versions are immutable."
        breadcrumbs={[{ label: "Audits" }, { label: "Templates" }]}
      />

      <DataTable
        columns={columns}
        data={rows}
        searchKey="name"
        searchPlaceholder="Search templates..."
        isLoading={templatesQuery.isLoading}
        onRowClick={(row) => navigate(`/audits/templates/${row.id}`)}
        exportFilename="audit-templates"
        columnsStorageKey="audit-templates"
        toolbarActions={
          <>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                {AUDIT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t} · {AUDIT_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New template
            </Button>
          </>
        }
      />

      <FormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New template"
        onSave={() => {
          if (!form.name.trim()) {
            toast({ title: "Name is required", variant: "destructive" });
            return;
          }
          createMut.mutate();
        }}
        isSaving={createMut.isPending}
        saveLabel="Create"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Monthly Property Hygiene Audit"
            />
          </div>
          <div className="space-y-2">
            <Label>Audit type</Label>
            <Select
              value={form.auditType}
              onValueChange={(v) => setForm((f) => ({ ...f, auditType: v as AuditType }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUDIT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t} · {AUDIT_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Target type</Label>
            <Select
              value={form.targetType}
              onValueChange={(v) => setForm((f) => ({ ...f, targetType: v as TargetType }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PROPERTY">Property</SelectItem>
                <SelectItem value="ROOM">Room</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Category (optional)</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Hygiene"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A v1 draft is created automatically — you land in the template to
            build sections and questions next.
          </p>
        </div>
      </FormModal>
    </div>
  );
}
