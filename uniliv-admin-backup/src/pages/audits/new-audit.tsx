import * as React from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import { usePermissions } from "@/lib/use-permissions";
import {
  AUDIT_TYPE_LABELS, NON_SCORED_TYPES, REMINDER_OPTIONS, titleCase,
  type ApiList, type ApiOne, type AuditType, type VersionSubset,
} from "./lib";
import { TypeBadge } from "./shared";

/** Conduct-scoped template row from GET /audits/conductable-templates. */
interface ConductableTemplate {
  id: string;
  name: string;
  auditType: AuditType;
  targetType: "PROPERTY" | "ROOM";
  category: string | null;
  latestVersionId: string;
  latestVersionNo: number;
}

type AssigneeKind = "ME" | "ROLE_AT_TARGET" | "USER";

interface FormState {
  auditType: AuditType | "";
  templateId: string;
  title: string;
  description: string;
  propertyId: string;
  roomId: string;
  assigneeKind: AssigneeKind;
  assigneeRole: "UNIT_LEAD" | "CLUSTER_MANAGER";
  assigneeUserId: string;
  scheduledFor: string;
  dueAt: string;
  reminder: string; // "none" | minutes as string
}

const EMPTY: FormState = {
  auditType: "",
  templateId: "",
  title: "",
  description: "",
  propertyId: "",
  roomId: "",
  assigneeKind: "ME",
  assigneeRole: "UNIT_LEAD",
  assigneeUserId: "",
  scheduledFor: "",
  dueAt: "",
  reminder: "none",
};

/**
 * One-off / ad-hoc audit creation (FRD one-off; unblocks the CX audit
 * workflow). A full-page form: type → published template → target → assignee,
 * with optional schedule and an optional section/question subset picker.
 * POST /audits → navigate to the created audit's detail.
 */
export default function NewAudit() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { me } = usePermissions();

  const [form, setForm] = React.useState<FormState>(EMPTY);
  // Subset picker: set of selected question ids (empty = whole template).
  const [selectedQuestionIds, setSelectedQuestionIds] = React.useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(new Set());
  const [subsetOpen, setSubsetOpen] = React.useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /* ── Reference data ────────────────────────────────────────────────────── */

  // Conductable templates — the conduct-scoped endpoint returns only PUBLISHED
  // templates for audit types the caller may conduct, so it works for the CX
  // team (who lack AUDIT_TEMPLATES/PROPERTIES read permission).
  const templatesQuery = useQuery({
    queryKey: ["/audits/conductable-templates"],
    queryFn: () =>
      apiFetch<ApiList<ConductableTemplate>>("/audits/conductable-templates"),
    staleTime: 5 * 60_000,
  });
  const allTemplates = templatesQuery.data?.data ?? [];

  const visibleTypes = React.useMemo(
    () => (["UL", "CM", "CX"] as AuditType[]).filter((t) => allTemplates.some((tp) => tp.auditType === t)),
    [allTemplates],
  );

  // Preselect when only one conductable type (common for the CX team).
  React.useEffect(() => {
    if (!form.auditType && visibleTypes.length === 1) {
      set("auditType", visibleTypes[0]!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTypes]);

  const runnableTemplates = React.useMemo(
    () => allTemplates.filter((t) => t.auditType === form.auditType && t.latestVersionId),
    [allTemplates, form.auditType],
  );
  const selectedTemplate = runnableTemplates.find((t) => t.id === form.templateId) ?? null;
  const targetType = selectedTemplate?.targetType ?? null;

  const propertiesQuery = useQuery({
    queryKey: ["/audits/target-properties", form.auditType],
    queryFn: () =>
      apiFetch<ApiList<{ id: string; name: string; city: string | null }>>(
        `/audits/target-properties?auditType=${form.auditType}`,
      ),
    enabled: Boolean(form.auditType),
  });
  const roomsQuery = useQuery({
    queryKey: ["/audits/target-rooms", form.propertyId, form.auditType],
    queryFn: () =>
      apiFetch<ApiList<{ id: string; number: string; floor: number | null }>>(
        `/audits/target-rooms?propertyId=${form.propertyId}&auditType=${form.auditType}`,
      ),
    enabled: targetType === "ROOM" && Boolean(form.propertyId),
  });
  // /users may 403 for non-admins — degrade gracefully (radio option hidden).
  const usersQuery = useQuery({
    queryKey: ["/users", "new-audit"],
    queryFn: () =>
      apiFetch<ApiList<{ id: string; name: string; role: string }>>("/users?limit=100"),
    retry: false,
  });
  const usersAvailable = !usersQuery.isError && (usersQuery.data?.data.length ?? 0) > 0;

  // Subset tree for the picked template's latest version (conduct-scoped read).
  const versionId = selectedTemplate?.latestVersionId ?? null;
  const versionQuery = useQuery({
    queryKey: ["/audits/template-version", versionId],
    queryFn: () => apiFetch<ApiOne<VersionSubset>>(`/audits/template-version/${versionId}`),
    enabled: subsetOpen && Boolean(versionId),
  });
  const sections = versionQuery.data?.data.sections ?? [];

  // Reset subset selection whenever the template changes.
  React.useEffect(() => {
    setSelectedQuestionIds(new Set());
    setExpandedSections(new Set());
    setSubsetOpen(false);
  }, [form.templateId]);

  /* ── Subset helpers ────────────────────────────────────────────────────── */

  const sectionQuestionIds = (sectionId: string): string[] =>
    sections.find((s) => s.id === sectionId)?.questions.map((q) => q.id) ?? [];

  const sectionState = (sectionId: string): "all" | "some" | "none" => {
    const ids = sectionQuestionIds(sectionId);
    if (ids.length === 0) return "none";
    const picked = ids.filter((id) => selectedQuestionIds.has(id)).length;
    return picked === 0 ? "none" : picked === ids.length ? "all" : "some";
  };

  const toggleSection = (sectionId: string, checked: boolean) => {
    const ids = sectionQuestionIds(sectionId);
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const toggleQuestion = (questionId: string, checked: boolean) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(questionId) : next.delete(questionId);
      return next;
    });
  };

  const toggleExpanded = (sectionId: string) =>
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId);
      return next;
    });

  // A "real" subset = some questions picked, but not every question (whole = no subset).
  const allQuestionIds = React.useMemo(
    () => sections.flatMap((s) => s.questions.map((q) => q.id)),
    [sections],
  );
  const isRealSubset =
    subsetOpen &&
    selectedQuestionIds.size > 0 &&
    selectedQuestionIds.size < allQuestionIds.length;

  /* ── Submit ────────────────────────────────────────────────────────────── */

  const buildBody = () => {
    const body: Record<string, unknown> = {
      templateVersionId: selectedTemplate!.latestVersionId,
      title: form.title.trim(),
      targetType,
    };
    if (form.description.trim()) body.description = form.description.trim();
    if (targetType === "ROOM") {
      body.roomId = form.roomId;
      body.propertyId = form.propertyId;
    } else {
      body.propertyId = form.propertyId;
    }
    if (form.assigneeKind === "ME") {
      if (me?.id) body.assigneeId = me.id;
    } else if (form.assigneeKind === "ROLE_AT_TARGET") {
      body.assigneeRule = form.assigneeRole;
    } else {
      body.assigneeId = form.assigneeUserId;
    }
    if (form.scheduledFor) body.scheduledFor = new Date(form.scheduledFor).toISOString();
    if (form.dueAt) body.dueAt = new Date(form.dueAt).toISOString();
    if (form.reminder !== "none") body.reminderOffsetMinutes = Number(form.reminder);
    if (isRealSubset) {
      // Include a section only if all its questions are selected; otherwise ship
      // the explicit question ids so the server can narrow correctly.
      const fullSectionIds = sections
        .filter((s) => s.questions.length > 0 && s.questions.every((q) => selectedQuestionIds.has(q.id)))
        .map((s) => s.id);
      body.subsetJson = {
        sectionIds: fullSectionIds,
        questionIds: [...selectedQuestionIds],
      };
    }
    return body;
  };

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch<ApiOne<{ id: string; ticketNo: string }>>("/audits", {
        method: "POST",
        body: JSON.stringify(buildBody()),
      }),
    onSuccess: (res) => {
      toast({ title: `Audit ${res.data.ticketNo ?? ""} created`.trim() });
      qc.invalidateQueries({ queryKey: ["/audits"] });
      qc.invalidateQueries({ queryKey: ["/audits/my"] });
      navigate(`/audits/${res.data.id}`);
    },
    onError: (e: Error) => toast({ title: e.message || "Could not create audit", variant: "destructive" }),
  });

  /* ── Validation ────────────────────────────────────────────────────────── */

  const validationError = !form.auditType
    ? "Pick an audit type."
    : !form.templateId
      ? "Pick a published template."
      : !form.title.trim()
        ? "Title is required."
        : !form.propertyId
          ? "Pick a property."
          : targetType === "ROOM" && !form.roomId
            ? "Pick a room."
            : form.assigneeKind === "USER" && !form.assigneeUserId
              ? "Pick an assignee."
              : form.scheduledFor && form.dueAt && new Date(form.dueAt) < new Date(form.scheduledFor)
                ? "Due date is before the scheduled date."
                : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="New Audit"
        subtitle="Create a one-off (ad-hoc) audit from a published template — target, assignee and optional schedule."
        breadcrumbs={[{ label: "Audits" }, { label: "New Audit" }]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* What ────────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What</CardTitle>
            <CardDescription>Audit type, template and title.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Audit type</Label>
              {templatesQuery.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : visibleTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You don't have permission to conduct any audit types.
                </p>
              ) : (
                <Select
                  value={form.auditType || undefined}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, auditType: v as AuditType, templateId: "" }))
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Pick an audit type" /></SelectTrigger>
                  <SelectContent>
                    {visibleTypes.map((t) => (
                      <SelectItem key={t} value={t}>{AUDIT_TYPE_LABELS[t]} ({t})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Template</Label>
              <Select
                value={form.templateId}
                disabled={!form.auditType || templatesQuery.isLoading}
                onValueChange={(v) => setForm((f) => ({ ...f, templateId: v, propertyId: "", roomId: "" }))}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !form.auditType ? "Pick a type first"
                      : templatesQuery.isLoading ? "Loading…"
                      : "Pick a published template"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {runnableTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · v{t.latestVersionNo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.auditType && !templatesQuery.isLoading && runnableTemplates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No published templates for this type yet.
                </p>
              )}
              {selectedTemplate && (
                <div className="flex items-center gap-2 text-sm">
                  <TypeBadge type={selectedTemplate.auditType} />
                  <span className="text-muted-foreground">
                    audits {selectedTemplate.targetType === "ROOM" ? "a room" : "a property"} ·
                    pinned to v{selectedTemplate.latestVersionNo}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Surprise CX check — North Wing"
              />
            </div>

            <div className="space-y-2">
              <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                placeholder="Why this audit is being raised…"
              />
            </div>
          </CardContent>
        </Card>

        {/* Where + who ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Target & assignee</CardTitle>
            <CardDescription>
              {targetType === "ROOM"
                ? "This template audits a room — pick a property, then a room."
                : targetType === "PROPERTY"
                  ? "This template audits a property."
                  : "Pick a template first — its target type decides what you select."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Property</Label>
              <Select
                value={form.propertyId}
                disabled={!targetType}
                onValueChange={(v) => setForm((f) => ({ ...f, propertyId: v, roomId: "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={targetType ? "Pick a property" : "Pick a template first"} />
                </SelectTrigger>
                <SelectContent>
                  {(propertiesQuery.data?.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {targetType === "ROOM" && (
              <div className="space-y-2">
                <Label>Room</Label>
                <Select
                  value={form.roomId}
                  disabled={!form.propertyId || roomsQuery.isLoading}
                  onValueChange={(v) => set("roomId", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={roomsQuery.isLoading ? "Loading rooms…" : "Pick a room"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(roomsQuery.data?.data ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        Room {r.number}{r.floor != null ? ` · Floor ${r.floor}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Assignee</Label>
              <RadioGroup
                value={form.assigneeKind}
                onValueChange={(v) => set("assigneeKind", v as AssigneeKind)}
                className="space-y-1"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="ME" /> Me
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="ROLE_AT_TARGET" /> Role at the target
                </label>
                {usersAvailable && (
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="USER" /> Specific user
                  </label>
                )}
              </RadioGroup>
              {form.assigneeKind === "ROLE_AT_TARGET" && (
                <Select
                  value={form.assigneeRole}
                  onValueChange={(v) => set("assigneeRole", v as FormState["assigneeRole"])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNIT_LEAD">Unit Lead of the target</SelectItem>
                    <SelectItem value="CLUSTER_MANAGER">Cluster Manager of the target</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {form.assigneeKind === "USER" && usersAvailable && (
                <Select value={form.assigneeUserId} onValueChange={(v) => set("assigneeUserId", v)}>
                  <SelectTrigger><SelectValue placeholder="Pick a user" /></SelectTrigger>
                  <SelectContent>
                    {(usersQuery.data?.data ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} · {titleCase(u.role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schedule ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Schedule <span className="text-sm font-normal text-muted-foreground">(optional)</span></CardTitle>
          <CardDescription>Leave blank to make the audit due immediately.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Scheduled for</Label>
            <Input
              type="datetime-local"
              value={form.scheduledFor}
              onChange={(e) => set("scheduledFor", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Due at</Label>
            <Input
              type="datetime-local"
              value={form.dueAt}
              onChange={(e) => set("dueAt", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Reminder</Label>
            <Select value={form.reminder} onValueChange={(v) => set("reminder", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No reminder</SelectItem>
                {REMINDER_OPTIONS.map((r) => (
                  <SelectItem key={r.minutes} value={String(r.minutes)}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Subset picker ────────────────────────────────────────────────── */}
      {selectedTemplate && (
        <Card>
          <CardHeader className="pb-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setSubsetOpen((o) => !o)}
            >
              <div>
                <CardTitle className="text-base">
                  Scope
                  {isRealSubset && (
                    <Badge variant="secondary" className="ml-2 tabular-nums">
                      {selectedQuestionIds.size} question{selectedQuestionIds.size === 1 ? "" : "s"}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Optional — narrow to specific sections or questions. Whole template by default.
                </CardDescription>
              </div>
              {subsetOpen ? <ChevronDown className="h-5 w-5 shrink-0" /> : <ChevronRight className="h-5 w-5 shrink-0" />}
            </button>
          </CardHeader>
          {subsetOpen && (
            <CardContent className="space-y-2">
              {versionQuery.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : sections.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  This version has no sections.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    Select nothing (or everything) to run the whole template.
                  </div>
                  <div className="max-h-[360px] space-y-1 overflow-y-auto rounded-md border p-2">
                    {sections.map((s) => {
                      const st = sectionState(s.id);
                      const expanded = expandedSections.has(s.id);
                      return (
                        <div key={s.id} className="rounded">
                          <div className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/60">
                            <Checkbox
                              checked={st === "all" ? true : st === "some" ? "indeterminate" : false}
                              onCheckedChange={(c) => toggleSection(s.id, c === true)}
                            />
                            <button
                              type="button"
                              className="flex flex-1 items-center gap-1 text-left text-sm font-medium"
                              onClick={() => toggleExpanded(s.id)}
                            >
                              {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                              <span className="truncate">{s.title}</span>
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                ({s.questions.length})
                              </span>
                            </button>
                          </div>
                          {expanded && (
                            <div className="ml-7 space-y-0.5 border-l pl-3">
                              {s.questions.map((qn) => (
                                <label
                                  key={qn.id}
                                  className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60"
                                >
                                  <Checkbox
                                    className="mt-0.5"
                                    checked={selectedQuestionIds.has(qn.id)}
                                    onCheckedChange={(c) => toggleQuestion(qn.id, c === true)}
                                  />
                                  <span className="flex-1">
                                    <span className="block">{qn.prompt}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {titleCase(qn.type)}
                                      {!NON_SCORED_TYPES.has(qn.type) && ` · weight ${qn.weight}`}
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Actions ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => createMut.mutate()}
          disabled={Boolean(validationError) || createMut.isPending}
        >
          Create audit
        </Button>
        <Button variant="outline" onClick={() => navigate("/audits/my")}>Cancel</Button>
        {validationError && <p className="text-sm text-muted-foreground">{validationError}</p>}
      </div>
    </div>
  );
}
