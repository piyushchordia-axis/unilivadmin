import * as React from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown, ArrowUp, Check, ChevronRight, Eye, Library, Loader2, Lock,
  Plus, Star, Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";
import {
  EVIDENCE_RULES, NC_SEVERITIES, NON_SCORED_TYPES, QUESTION_TYPES,
  sectionPoints, titleCase,
  type ApiError, type ApiList, type ApiOne, type AutoNcRule, type BankItem,
  type BuilderQuestion, type BuilderSection, type NcSeverity, type RatingScale,
  type TemplateDetail, type VersionDetail,
} from "./lib";
import { DuplicateWarning, LifecycleBadge, PublishDialog, useDuplicatePrompts } from "./shared";

/**
 * Prompt editor for a builder question with debounced near-duplicate detection.
 * Own component so the useDuplicatePrompts hook obeys the rules of hooks
 * (the Inspector early-returns before the question block).
 */
function QuestionPromptField({
  questionId,
  prompt,
  readOnly,
  onChange,
}: {
  questionId: string;
  prompt: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  // Only warn for genuinely new prompts, not while reviewing a published version.
  const matches = useDuplicatePrompts(readOnly ? "" : prompt, questionId);
  return (
    <div className="space-y-2">
      <Label>Prompt</Label>
      <Textarea
        value={prompt}
        disabled={readOnly}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
      />
      {!readOnly && <DuplicateWarning matches={matches} />}
    </div>
  );
}

/* ── Trigger-answer options for the auto-NC editor ───────────────────────── */

function triggerOptions(
  q: BuilderQuestion,
  scales: RatingScale[] | undefined,
): { id: string; label: string }[] | null {
  switch (q.type) {
    case "YES_NO_NA":
      return [
        { id: "NO", label: "No" },
        { id: "NA", label: "N/A" },
      ];
    case "PASS_FAIL":
      return [{ id: "FAIL", label: "Fail" }];
    case "RATING": {
      const scale =
        (q.ratingScaleId && scales?.find((s) => s.id === q.ratingScaleId)) ||
        scales?.find((s) => s.active) ||
        scales?.[0];
      if (!scale) return null;
      return [...scale.options]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((o) => ({ id: o.id, label: `${o.label} (${Number(o.multiplierPct)}%)` }));
    }
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
      return (q.optionsJson ?? []).map((o) => ({ id: o.id, label: o.label }));
    default:
      return null;
  }
}

/* ── Inspector (right pane / mobile sheet) — fully controlled ────────────── */

function Inspector({
  section,
  question,
  scales,
  readOnly,
  onQuestionChange,
  onSectionChange,
}: {
  section: BuilderSection | undefined;
  question: BuilderQuestion | undefined;
  scales: RatingScale[] | undefined;
  readOnly: boolean;
  onQuestionChange: (qid: string, patch: Record<string, unknown>) => void;
  onSectionChange: (sid: string, patch: Record<string, unknown>) => void;
}) {
  if (!section) {
    return <p className="p-4 text-sm text-muted-foreground">Pick a section to begin.</p>;
  }

  if (!question) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Section</p>
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={section.title}
            disabled={readOnly}
            onChange={(e) => onSectionChange(section.id, { title: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={section.description ?? ""}
            disabled={readOnly}
            rows={3}
            onChange={(e) => onSectionChange(section.id, { description: e.target.value || null })}
          />
        </div>
        <div className="space-y-2">
          <Label>Audience</Label>
          <Input
            value={section.audience ?? ""}
            disabled={readOnly}
            placeholder="e.g. AUDITOR"
            onChange={(e) => onSectionChange(section.id, { audience: e.target.value || null })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Select a question card to edit its details here.
        </p>
      </div>
    );
  }

  const q = question;
  const autoNc = q.autoNcJson;
  const options = triggerOptions(q, scales);
  const setQ = (patch: Record<string, unknown>) => onQuestionChange(q.id, patch);

  return (
    <div className="space-y-4 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Question</p>
      <QuestionPromptField
        questionId={q.id}
        prompt={q.prompt}
        readOnly={readOnly}
        onChange={(value) => setQ({ prompt: value })}
      />
      <div className="space-y-2">
        <Label>Help text</Label>
        <Input
          value={q.helpText ?? ""}
          disabled={readOnly}
          placeholder="Shown to the auditor under the prompt"
          onChange={(e) => setQ({ helpText: e.target.value || null })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={q.type}
            disabled={readOnly}
            onValueChange={(v) => setQ({ type: v })}
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
          <Label>Weight</Label>
          <Input
            type="number"
            min={0}
            value={q.weight}
            disabled={readOnly || NON_SCORED_TYPES.has(q.type)}
            onChange={(e) => setQ({ weight: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
          />
          {NON_SCORED_TYPES.has(q.type) && (
            <p className="text-xs text-muted-foreground">Not scored.</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Mandatory</p>
          <p className="text-xs text-muted-foreground">Must be answered before submit.</p>
        </div>
        <Switch
          checked={q.mandatory}
          disabled={readOnly}
          onCheckedChange={(c) => setQ({ mandatory: c })}
        />
      </div>
      <div className="space-y-2">
        <Label>Evidence rule</Label>
        <Select
          value={q.evidenceRule}
          disabled={readOnly}
          onValueChange={(v) => setQ({ evidenceRule: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {EVIDENCE_RULES.map((r) => (
              <SelectItem key={r} value={r}>{titleCase(r)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {q.type === "NUMERIC" && (
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Unit</Label>
            <Input
              value={q.numericUnit ?? ""}
              disabled={readOnly}
              placeholder="°C"
              onChange={(e) => setQ({ numericUnit: e.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label>Min</Label>
            <Input
              type="number"
              value={q.numericMin ?? ""}
              disabled={readOnly}
              onChange={(e) => setQ({ numericMin: e.target.value === "" ? null : e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Max</Label>
            <Input
              type="number"
              value={q.numericMax ?? ""}
              disabled={readOnly}
              onChange={(e) => setQ({ numericMax: e.target.value === "" ? null : e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Auto-NC</p>
            <p className="text-xs text-muted-foreground">
              Raise a non-conformance automatically on trigger answers.
            </p>
          </div>
          <Switch
            checked={autoNc != null}
            disabled={readOnly}
            onCheckedChange={(c) =>
              setQ({
                autoNcJson: c
                  ? ({ onAnswers: [], severity: "MAJOR", ownerRule: "AUDITEE_OF_TARGET" } satisfies AutoNcRule)
                  : null,
              })
            }
          />
        </div>
        {autoNc && (
          <>
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select
                value={autoNc.severity}
                disabled={readOnly}
                onValueChange={(v) => setQ({ autoNcJson: { ...autoNc, severity: v as NcSeverity } })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NC_SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Trigger answers</Label>
              {options ? (
                options.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Define answer options first — nothing to trigger on yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {options.map((o) => (
                      <label key={o.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={autoNc.onAnswers.includes(o.id)}
                          disabled={readOnly}
                          onCheckedChange={(checked) =>
                            setQ({
                              autoNcJson: {
                                ...autoNc,
                                onAnswers: checked
                                  ? [...autoNc.onAnswers, o.id]
                                  : autoNc.onAnswers.filter((a) => a !== o.id),
                              },
                            })
                          }
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                )
              ) : (
                <Input
                  value={autoNc.onAnswers.join(", ")}
                  disabled={readOnly}
                  placeholder="Comma-separated trigger values"
                  onChange={(e) =>
                    setQ({
                      autoNcJson: {
                        ...autoNc,
                        onAnswers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      },
                    })
                  }
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">Owner: auditee of target.</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Insert-from-bank dialog ─────────────────────────────────────────────── */

function BankDialog({
  open,
  onOpenChange,
  onInsert,
  inserting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (item: BankItem) => void;
  inserting: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [tag, setTag] = React.useState("ALL");

  const bankQuery = useQuery({
    queryKey: ["/audit/bank", "picker"],
    queryFn: () => apiFetch<ApiList<BankItem>>("/audit/bank?limit=500"),
    enabled: open,
  });
  const tagsQuery = useQuery({
    queryKey: ["/audit/bank/tags"],
    queryFn: () => apiFetch<ApiOne<string[]>>("/audit/bank/tags"),
    enabled: open,
  });

  const items = React.useMemo(() => {
    const all = bankQuery.data?.data ?? [];
    const q = search.trim().toLowerCase();
    return all.filter(
      (i) =>
        (tag === "ALL" || i.tags.includes(tag)) &&
        (!q || i.prompt.toLowerCase().includes(q)),
    );
  }, [bankQuery.data, search, tag]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Insert from question bank</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="Search prompts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All tags</SelectItem>
              {(tagsQuery.data?.data ?? []).map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1 py-2">
          {bankQuery.isLoading && <Skeleton className="h-32 w-full" />}
          {items.slice(0, 100).map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.prompt}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline">{titleCase(item.type)}</Badge>
                  {!NON_SCORED_TYPES.has(item.type) && (
                    <span className="tabular-nums">{item.defaultWeight} pts</span>
                  )}
                  <span>· used in {item.usageCount}</span>
                  {item.tags.slice(0, 3).map((t) => (
                    <Badge key={t} variant="secondary">{t}</Badge>
                  ))}
                </div>
              </div>
              <Button size="sm" variant="outline" disabled={inserting} onClick={() => onInsert(item)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Insert
              </Button>
            </div>
          ))}
          {!bankQuery.isLoading && items.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No matching bank items.</p>
          )}
          {items.length > 100 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Showing first 100 of {items.length} — refine your search.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function TemplateBuilder() {
  const params = useParams<{ id: string; vid: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();

  const versionKey = React.useMemo(
    () => ["/audit/templates/versions", params.vid] as const,
    [params.vid],
  );

  const versionQuery = useQuery({
    queryKey: versionKey,
    queryFn: () => apiFetch<ApiOne<VersionDetail>>(`/audit/templates/versions/${params.vid}`),
    enabled: Boolean(params.vid),
  });
  const templateQuery = useQuery({
    queryKey: ["/audit/templates", params.id],
    queryFn: () => apiFetch<ApiOne<TemplateDetail>>(`/audit/templates/${params.id}`),
    enabled: Boolean(params.id),
  });
  const scalesQuery = useQuery({
    queryKey: ["/audit/admin/rating-scales"],
    queryFn: () => apiFetch<ApiList<RatingScale>>("/audit/admin/rating-scales"),
    retry: false,
  });

  const version = versionQuery.data?.data;
  const template = templateQuery.data?.data;

  const [forcedReadOnly, setForcedReadOnly] = React.useState(false);
  const readOnly = forcedReadOnly || (version != null && version.lifecycle !== "DRAFT");

  const [selectedSectionId, setSelectedSectionId] = React.useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [addSectionTitle, setAddSectionTitle] = React.useState("");
  const [bankOpen, setBankOpen] = React.useState(false);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  // The desktop inspector pane appears at lg (1024px+); below that the
  // inspector opens as a Sheet. Gate opening so the Sheet's overlay never
  // dims a desktop viewport where the pane is already visible.
  const openInspectorSheet = () => {
    if (window.matchMedia("(max-width: 1023px)").matches) setSheetOpen(true);
  };
  const [deleteQuestionId, setDeleteQuestionId] = React.useState<string | null>(null);
  const [deleteSectionId, setDeleteSectionId] = React.useState<string | null>(null);

  const sections = React.useMemo(() => {
    const list = [...(version?.sections ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
    return list.map((s) => ({
      ...s,
      questions: [...s.questions].sort((a, b) => a.orderIndex - b.orderIndex),
    }));
  }, [version]);

  const activeSection =
    sections.find((s) => s.id === selectedSectionId) ?? sections[0];
  const selectedQuestion = activeSection?.questions.find((q) => q.id === selectedQuestionId);

  React.useEffect(() => {
    if (!selectedSectionId && sections.length > 0) setSelectedSectionId(sections[0]!.id);
  }, [sections, selectedSectionId]);

  /* ── Debounced autosave (600ms) with optimistic cache patching ─────────── */

  const pendingRef = React.useRef<{
    kind: "question" | "section";
    id: string;
    patch: Record<string, unknown>;
  } | null>(null);
  const timerRef = React.useRef<number | null>(null);

  const flush = React.useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!pending) return;
    setSaveState("saving");
    const path =
      pending.kind === "question"
        ? `/audit/questions/${pending.id}`
        : `/audit/sections/${pending.id}`;
    apiFetch(path, { method: "PATCH", body: JSON.stringify(pending.patch) })
      .then(() => setSaveState("saved"))
      .catch((e: ApiError) => {
        setSaveState("error");
        toast({ title: e.message || "Save failed", variant: "destructive" });
        if (e.status === 409) setForcedReadOnly(true);
        qc.invalidateQueries({ queryKey: versionKey });
      });
  }, [qc, toast, versionKey]);

  const queueSave = React.useCallback(
    (kind: "question" | "section", id: string, patch: Record<string, unknown>) => {
      if (pendingRef.current && (pendingRef.current.id !== id || pendingRef.current.kind !== kind)) {
        flush();
      }
      pendingRef.current = pendingRef.current
        ? { ...pendingRef.current, patch: { ...pendingRef.current.patch, ...patch } }
        : { kind, id, patch };
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, 600);
    },
    [flush],
  );

  // Flush any pending edit when leaving the page.
  React.useEffect(() => () => flush(), [flush]);

  const patchCache = React.useCallback(
    (fn: (v: VersionDetail) => VersionDetail) => {
      qc.setQueryData<ApiOne<VersionDetail>>(versionKey, (old) =>
        old ? { ...old, data: fn(old.data) } : old,
      );
    },
    [qc, versionKey],
  );

  const onQuestionChange = React.useCallback(
    (qid: string, patch: Record<string, unknown>) => {
      if (readOnly) return;
      patchCache((v) => ({
        ...v,
        sections: v.sections.map((s) => ({
          ...s,
          questions: s.questions.map((q) =>
            q.id === qid ? ({ ...q, ...patch } as BuilderQuestion) : q,
          ),
        })),
      }));
      queueSave("question", qid, patch);
    },
    [patchCache, queueSave, readOnly],
  );

  const onSectionChange = React.useCallback(
    (sid: string, patch: Record<string, unknown>) => {
      if (readOnly) return;
      patchCache((v) => ({
        ...v,
        sections: v.sections.map((s) =>
          s.id === sid ? ({ ...s, ...patch } as BuilderSection) : s,
        ),
      }));
      queueSave("section", sid, patch);
    },
    [patchCache, queueSave, readOnly],
  );

  /* ── Structural mutations (immediate) ──────────────────────────────────── */

  const onStructuralError = (e: ApiError) => {
    toast({ title: e.message || "Action failed", variant: "destructive" });
    if (e.status === 409) setForcedReadOnly(true);
    qc.invalidateQueries({ queryKey: versionKey });
  };
  const invalidateVersion = () => qc.invalidateQueries({ queryKey: versionKey });

  const addSectionMut = useMutation({
    mutationFn: (title: string) =>
      apiFetch<ApiOne<BuilderSection>>("/audit/sections", {
        method: "POST",
        body: JSON.stringify({ templateVersionId: params.vid, title }),
      }),
    onSuccess: (res) => {
      setAddSectionTitle("");
      setSelectedSectionId(res.data.id);
      setSelectedQuestionId(null);
      invalidateVersion();
    },
    onError: onStructuralError,
  });

  const deleteSectionMut = useMutation({
    mutationFn: (sid: string) => apiFetch(`/audit/sections/${sid}`, { method: "DELETE" }),
    onSuccess: (_r, sid) => {
      setDeleteSectionId(null);
      if (selectedSectionId === sid) {
        setSelectedSectionId(null);
        setSelectedQuestionId(null);
      }
      invalidateVersion();
    },
    onError: onStructuralError,
  });

  const reorderSectionsMut = useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiFetch("/audit/sections/reorder", {
        method: "POST",
        body: JSON.stringify({ templateVersionId: params.vid, orderedIds }),
      }),
    onSuccess: invalidateVersion,
    onError: onStructuralError,
  });

  const addQuestionMut = useMutation({
    mutationFn: ({ sid, body }: { sid: string; body: Record<string, unknown> }) =>
      apiFetch<ApiOne<BuilderQuestion>>(`/audit/sections/${sid}/questions`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (res, vars) => {
      if (!vars.body["bankItemId"]) {
        setSelectedQuestionId(res.data.id);
        openInspectorSheet();
      } else {
        toast({ title: "Question inserted" });
      }
      invalidateVersion();
    },
    onError: onStructuralError,
  });

  const deleteQuestionMut = useMutation({
    mutationFn: (qid: string) => apiFetch(`/audit/questions/${qid}`, { method: "DELETE" }),
    onSuccess: (_r, qid) => {
      setDeleteQuestionId(null);
      if (selectedQuestionId === qid) setSelectedQuestionId(null);
      invalidateVersion();
    },
    onError: onStructuralError,
  });

  const reorderQuestionsMut = useMutation({
    mutationFn: ({ sid, orderedIds }: { sid: string; orderedIds: string[] }) =>
      apiFetch(`/audit/sections/${sid}/questions/reorder`, {
        method: "POST",
        body: JSON.stringify({ orderedIds }),
      }),
    onSuccess: invalidateVersion,
    onError: onStructuralError,
  });

  const moveSection = (sid: string, dir: -1 | 1) => {
    const ids = sections.map((s) => s.id);
    const i = ids.indexOf(sid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    patchCache((v) => ({
      ...v,
      sections: v.sections.map((s) => ({ ...s, orderIndex: ids.indexOf(s.id) })),
    }));
    reorderSectionsMut.mutate(ids);
  };

  const moveQuestion = (qid: string, dir: -1 | 1) => {
    if (!activeSection) return;
    const ids = activeSection.questions.map((q) => q.id);
    const i = ids.indexOf(qid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    patchCache((v) => ({
      ...v,
      sections: v.sections.map((s) =>
        s.id !== activeSection.id
          ? s
          : { ...s, questions: s.questions.map((q) => ({ ...q, orderIndex: ids.indexOf(q.id) })) },
      ),
    }));
    reorderQuestionsMut.mutate({ sid: activeSection.id, orderedIds: ids });
  };

  /* ── Render ────────────────────────────────────────────────────────────── */

  if (versionQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 lg:grid-cols-[280px_1fr_340px]">
          <Skeleton className="h-96" /><Skeleton className="h-96" /><Skeleton className="h-96" />
        </div>
      </div>
    );
  }
  if (!version) {
    return (
      <PageHeader
        title="Version not found"
        breadcrumbs={[{ label: "Audits" }, { label: "Templates", href: "/audits/templates" }]}
      />
    );
  }

  const totalPoints = sections.reduce((sum, s) => sum + sectionPoints(s.questions), 0);

  const inspector = (
    <Inspector
      section={activeSection}
      question={selectedQuestion}
      scales={scalesQuery.data?.data}
      readOnly={readOnly}
      onQuestionChange={onQuestionChange}
      onSectionChange={onSectionChange}
    />
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={template ? `${template.name} — v${version.versionNo}` : `v${version.versionNo}`}
        breadcrumbs={[
          { label: "Audits" },
          { label: "Templates", href: "/audits/templates" },
          { label: template?.name ?? "Template", href: `/audits/templates/${params.id}` },
          { label: `v${version.versionNo} builder` },
        ]}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              {saveState === "saving" && (<><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>)}
              {saveState === "saved" && (<><Check className="h-3 w-3 text-emerald-600" /> Saved</>)}
              {saveState === "error" && <span className="text-destructive">Save failed</span>}
            </span>
            <LifecycleBadge lifecycle={version.lifecycle} />
            <Button variant="outline" size="sm" onClick={() => setBankOpen(true)} disabled={readOnly || !activeSection}>
              <Library className="mr-1 h-4 w-4" /> Insert from bank
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/audits/templates/${params.id}/versions/${params.vid}/preview`}>
                <Eye className="mr-1 h-4 w-4" /> Preview
              </Link>
            </Button>
            {version.lifecycle === "DRAFT" && !forcedReadOnly && (
              <Button size="sm" onClick={() => setPublishOpen(true)}>Publish</Button>
            )}
          </div>
        }
      />

      {readOnly && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <Lock className="h-4 w-4 shrink-0" />
          v{version.versionNo} — {titleCase(version.lifecycle)}, immutable. Create a
          new draft from the template's Versions tab to make changes.
        </div>
      )}

      {/* Mobile: section picker */}
      <div className="lg:hidden">
        <Select
          value={activeSection?.id ?? ""}
          onValueChange={(v) => { setSelectedSectionId(v); setSelectedQuestionId(null); }}
        >
          <SelectTrigger><SelectValue placeholder="Pick a section" /></SelectTrigger>
          <SelectContent>
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.title} ({s.questions.length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_340px]">
        {/* Left rail — sections */}
        <div className="hidden self-start rounded-md border bg-card lg:block">
          <p className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sections
          </p>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {sections.map((s, i) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => { setSelectedSectionId(s.id); setSelectedQuestionId(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { setSelectedSectionId(s.id); setSelectedQuestionId(null); }
                }}
                className={cn(
                  "group mb-1 flex cursor-pointer items-center gap-1 rounded-md px-2 py-2 text-sm",
                  activeSection?.id === s.id ? "bg-primary/10 font-medium" : "hover:bg-muted",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {s.questions.length} question{s.questions.length === 1 ? "" : "s"} · Σ {sectionPoints(s.questions)} pts
                  </p>
                </div>
                {!readOnly && (
                  <div className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost" size="sm" className="h-5 w-5 p-0"
                      disabled={i === 0 || reorderSectionsMut.isPending}
                      onClick={(e) => { e.stopPropagation(); moveSection(s.id, -1); }}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-5 w-5 p-0"
                      disabled={i === sections.length - 1 || reorderSectionsMut.isPending}
                      onClick={(e) => { e.stopPropagation(); moveSection(s.id, 1); }}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {!readOnly && (
                  <Button
                    variant="ghost" size="sm"
                    className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); setDeleteSectionId(s.id); }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {sections.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No sections yet.
              </p>
            )}
          </div>
          {!readOnly && (
            <div className="flex gap-2 border-t p-2">
              <Input
                value={addSectionTitle}
                onChange={(e) => setAddSectionTitle(e.target.value)}
                placeholder="New section title"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && addSectionTitle.trim()) {
                    addSectionMut.mutate(addSectionTitle.trim());
                  }
                }}
              />
              <Button
                size="sm" variant="outline" className="h-8"
                disabled={!addSectionTitle.trim() || addSectionMut.isPending}
                onClick={() => addSectionMut.mutate(addSectionTitle.trim())}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Center — questions of the active section */}
        <div className="min-w-0 space-y-2">
          {activeSection ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-1 text-sm font-medium">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  {activeSection.title}
                </h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Σ {sectionPoints(activeSection.questions)} pts
                </span>
              </div>
              {activeSection.questions.map((q, i) => (
                <div
                  key={q.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { setSelectedQuestionId(q.id); openInspectorSheet(); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { setSelectedQuestionId(q.id); openInspectorSheet(); } }}
                  className={cn(
                    "group flex cursor-pointer items-start justify-between gap-3 rounded-md border bg-card p-3 transition-colors",
                    selectedQuestionId === q.id
                      ? "border-primary ring-1 ring-primary/30"
                      : "hover:bg-muted/50",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {q.mandatory && (
                        <Star className="mr-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Mandatory" />
                      )}
                      {q.prompt || <span className="text-muted-foreground">Untitled question</span>}
                    </p>
                    {q.helpText && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{q.helpText}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{titleCase(q.type)}</Badge>
                      {NON_SCORED_TYPES.has(q.type) ? (
                        <Badge variant="secondary">Not scored</Badge>
                      ) : (
                        <Badge variant="secondary" className="tabular-nums">{q.weight} pts</Badge>
                      )}
                      {q.evidenceRule !== "NONE" && (
                        <Badge variant="outline">📎 {titleCase(q.evidenceRule)}</Badge>
                      )}
                      {q.autoNcJson && (
                        <Badge variant="destructive">Auto-NC · {titleCase(q.autoNcJson.severity)}</Badge>
                      )}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost" size="sm" className="h-6 w-6 p-0"
                        disabled={i === 0 || reorderQuestionsMut.isPending}
                        onClick={(e) => { e.stopPropagation(); moveQuestion(q.id, -1); }}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-6 w-6 p-0"
                        disabled={i === activeSection.questions.length - 1 || reorderQuestionsMut.isPending}
                        onClick={(e) => { e.stopPropagation(); moveQuestion(q.id, 1); }}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-6 w-6 p-0"
                        onClick={(e) => { e.stopPropagation(); setDeleteQuestionId(q.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {activeSection.questions.length === 0 && (
                <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                  No questions in this section yet.
                </p>
              )}
              {!readOnly && (
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    disabled={addQuestionMut.isPending}
                    onClick={() =>
                      addQuestionMut.mutate({
                        sid: activeSection.id,
                        body: { prompt: "New question", type: "RATING", weight: 5 },
                      })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add question
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setBankOpen(true)}>
                    <Library className="mr-1 h-4 w-4" /> Insert from bank
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="rounded-md border border-dashed py-16 text-center text-sm text-muted-foreground">
              Add a section to start building.
            </p>
          )}
        </div>

        {/* Right — inspector (desktop) */}
        <div className="hidden self-start rounded-md border bg-card lg:block">
          {inspector}
        </div>
      </div>

      {/* Sticky footer — live points */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md border bg-card/95 px-4 py-2 text-sm shadow-sm backdrop-blur">
        {sections.map((s) => (
          <span key={s.id} className="text-muted-foreground">
            {s.title}: <span className="font-medium tabular-nums text-foreground">{sectionPoints(s.questions)}</span>
          </span>
        ))}
        <span className="ml-auto font-medium">
          Total possible: <span className="tabular-nums">{totalPoints} pts</span>
        </span>
      </div>

      {/* Mobile inspector sheet */}
      <Sheet open={sheetOpen && selectedQuestion != null} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md lg:hidden">
          <SheetHeader>
            <SheetTitle className="font-display">Question details</SheetTitle>
          </SheetHeader>
          {inspector}
        </SheetContent>
      </Sheet>

      <BankDialog
        open={bankOpen}
        onOpenChange={setBankOpen}
        inserting={addQuestionMut.isPending}
        onInsert={(item) => {
          if (!activeSection) return;
          addQuestionMut.mutate({ sid: activeSection.id, body: { bankItemId: item.id } });
        }}
      />

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        versionId={params.vid ?? null}
        versionNo={version.versionNo}
        onPublished={invalidateVersion}
      />

      <ConfirmDialog
        open={deleteQuestionId != null}
        onOpenChange={(o) => { if (!o) setDeleteQuestionId(null); }}
        title="Delete question?"
        description="This removes the question from the draft. This cannot be undone."
        onConfirm={() => deleteQuestionMut.mutate(deleteQuestionId!)}
        isConfirming={deleteQuestionMut.isPending}
        confirmLabel="Delete"
      />
      <ConfirmDialog
        open={deleteSectionId != null}
        onOpenChange={(o) => { if (!o) setDeleteSectionId(null); }}
        title="Delete section?"
        description="The section and all its questions are removed from the draft. This cannot be undone."
        onConfirm={() => deleteSectionMut.mutate(deleteSectionId!)}
        isConfirming={deleteSectionMut.isPending}
        confirmLabel="Delete"
      />
    </div>
  );
}
