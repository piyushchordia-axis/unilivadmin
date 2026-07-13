import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Archive, ArchiveRestore, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FormModal } from "@/components/ui/form-modal";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import {
  EVIDENCE_RULES, NON_SCORED_TYPES, QUESTION_TYPES, apiFetchAll, fmtDate, titleCase,
  type ApiList, type BankItem, type ApiOne, type EvidenceRule, type QuestionType,
} from "./lib";
import { DuplicateWarning, useDuplicatePrompts } from "./shared";

interface BankForm {
  prompt: string;
  helpText: string;
  type: QuestionType;
  defaultWeight: number;
  defaultEvidenceRule: EvidenceRule;
  tags: string;
  numericUnit: string;
}

const EMPTY_FORM: BankForm = {
  prompt: "",
  helpText: "",
  type: "RATING",
  defaultWeight: 5,
  defaultEvidenceRule: "NONE",
  tags: "",
  numericUnit: "",
};

/** Question bank (FA-02): curated reusable questions with copy-on-insert.
 *  The whole bank (≈456 rows) fits in one fetch — filtering is client-side. */
export default function QuestionBank() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = React.useState("ALL");
  const [tagFilter, setTagFilter] = React.useState("ALL");
  const [showArchived, setShowArchived] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BankItem | null>(null);
  const [form, setForm] = React.useState<BankForm>(EMPTY_FORM);

  const bankQuery = useQuery({
    queryKey: ["/audit/bank", "register"],
    queryFn: () => apiFetchAll<BankItem>("/audit/bank?includeArchived=1"),
  });
  const tagsQuery = useQuery({
    queryKey: ["/audit/bank/tags"],
    queryFn: () => apiFetch<ApiOne<string[]>>("/audit/bank/tags"),
  });

  const rows = React.useMemo(() => {
    return (bankQuery.data ?? []).filter(
      (i: BankItem) =>
        (showArchived || !i.archivedAt) &&
        (typeFilter === "ALL" || i.type === typeFilter) &&
        (tagFilter === "ALL" || i.tags.includes(tagFilter)),
    );
  }, [bankQuery.data, typeFilter, tagFilter, showArchived]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/audit/bank"] });

  // Near-duplicate detection on the prompt field (only while the modal is open).
  const duplicateMatches = useDuplicatePrompts(modalOpen ? form.prompt : "", editing?.id);

  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        prompt: form.prompt.trim(),
        helpText: form.helpText.trim() || null,
        type: form.type,
        defaultWeight: Math.max(0, Math.trunc(form.defaultWeight || 0)),
        defaultEvidenceRule: form.defaultEvidenceRule,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        numericUnit: form.type === "NUMERIC" ? form.numericUnit.trim() || null : null,
      };
      return editing
        ? apiFetch(`/audit/bank/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : apiFetch("/audit/bank", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast({ title: editing ? "Bank item updated" : "Bank item created" });
      setModalOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message || "Save failed", variant: "destructive" }),
  });

  const archiveMut = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      apiFetch(`/audit/bank/${id}/archive`, {
        method: "POST",
        body: JSON.stringify(restore ? { restore: true } : {}),
      }),
    onSuccess: (_r, vars) => {
      toast({ title: vars.restore ? "Item restored" : "Item archived" });
      setModalOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message || "Action failed", variant: "destructive" }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (item: BankItem) => {
    setEditing(item);
    setForm({
      prompt: item.prompt,
      helpText: item.helpText ?? "",
      type: item.type,
      defaultWeight: item.defaultWeight,
      defaultEvidenceRule: item.defaultEvidenceRule,
      tags: item.tags.join(", "),
      numericUnit: item.numericUnit ?? "",
    });
    setModalOpen(true);
  };

  const columns: ColumnDef<BankItem>[] = [
    {
      accessorKey: "prompt",
      header: "Prompt",
      cell: ({ row }) => (
        <div className="max-w-[380px]">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{row.original.prompt}</span>
            {row.original.archivedAt && <Badge variant="outline">Archived</Badge>}
          </div>
          {row.original.helpText && (
            <p className="truncate text-xs text-muted-foreground">{row.original.helpText}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <Badge variant="outline">{titleCase(row.original.type)}</Badge>,
    },
    {
      accessorKey: "defaultWeight",
      header: "Default weight",
      cell: ({ row }) =>
        NON_SCORED_TYPES.has(row.original.type) ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums">{row.original.defaultWeight}</span>
        ),
    },
    {
      accessorKey: "tags",
      header: "Tags",
      cell: ({ row }) => {
        const tags = row.original.tags;
        return (
          <div className="flex max-w-[220px] flex-wrap gap-1">
            {tags.slice(0, 3).map((t) => (
              <Badge key={t} variant="secondary">{t}</Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="outline" className="tabular-nums">+{tags.length - 3}</Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "usageCount",
      header: "Used in",
      cell: ({ row }) => <span className="tabular-nums">{row.original.usageCount}</span>,
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
        title="Question Bank"
        subtitle="Curated reusable questions — inserting into a template copies the item, so drafts stay independent."
        breadcrumbs={[{ label: "Audits" }, { label: "Question Bank" }]}
      />

      <DataTable
        columns={columns}
        data={rows}
        searchKey="prompt"
        searchPlaceholder="Search prompts..."
        isLoading={bankQuery.isLoading}
        onRowClick={openEdit}
        exportFilename="audit-question-bank"
        columnsStorageKey="audit-question-bank"
        toolbarActions={
          <>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                {QUESTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All tags</SelectItem>
                {(tagsQuery.data?.data ?? []).map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
              Archived
            </label>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> New question
            </Button>
          </>
        }
      />

      <FormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? "Edit bank question" : "New bank question"}
        onSave={() => {
          if (!form.prompt.trim()) {
            toast({ title: "Prompt is required", variant: "destructive" });
            return;
          }
          saveMut.mutate();
        }}
        isSaving={saveMut.isPending}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Prompt</Label>
            <Textarea
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              rows={3}
            />
            <DuplicateWarning matches={duplicateMatches} />
          </div>
          <div className="space-y-2">
            <Label>Help text</Label>
            <Input
              value={form.helpText}
              onChange={(e) => setForm((f) => ({ ...f, helpText: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as QuestionType }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default weight</Label>
              <Input
                type="number"
                min={0}
                value={form.defaultWeight}
                onChange={(e) => setForm((f) => ({ ...f, defaultWeight: Number(e.target.value) }))}
                disabled={NON_SCORED_TYPES.has(form.type)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Default evidence rule</Label>
            <Select
              value={form.defaultEvidenceRule}
              onValueChange={(v) => setForm((f) => ({ ...f, defaultEvidenceRule: v as EvidenceRule }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVIDENCE_RULES.map((r) => (
                  <SelectItem key={r} value={r}>{titleCase(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.type === "NUMERIC" && (
            <div className="space-y-2">
              <Label>Numeric unit</Label>
              <Input
                value={form.numericUnit}
                onChange={(e) => setForm((f) => ({ ...f, numericUnit: e.target.value }))}
                placeholder="e.g. °C"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Tags</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="hygiene, kitchen, safety"
            />
            <p className="text-xs text-muted-foreground">Comma-separated.</p>
          </div>

          {editing && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">
                  {editing.archivedAt ? "Archived item" : "Archive this item"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Archived items are hidden from the builder's bank picker.
                  Copies already inserted into templates are unaffected.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={archiveMut.isPending}
                onClick={() =>
                  archiveMut.mutate({ id: editing.id, restore: Boolean(editing.archivedAt) })
                }
              >
                {editing.archivedAt ? (
                  <><ArchiveRestore className="mr-1 h-4 w-4" /> Restore</>
                ) : (
                  <><Archive className="mr-1 h-4 w-4" /> Archive</>
                )}
              </Button>
            </div>
          )}
        </div>
      </FormModal>
    </div>
  );
}
