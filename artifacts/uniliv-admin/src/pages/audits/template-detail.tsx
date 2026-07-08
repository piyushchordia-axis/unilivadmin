import * as React from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive, ArchiveRestore, Copy, Download, GitBranch, Hammer, Lock, MoreHorizontal,
  Pencil, Send, Upload, Eye,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { FormModal } from "@/components/ui/form-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import { usePermissions } from "@/lib/use-permissions";
import {
  AUDIT_TYPE_LABELS, fmtDate, titleCase,
  type AccessScope, type ApiError, type ApiList, type ApiOne, type TemplateDetail,
  type VersionSummary, type VersionDiff, type WhereUsed,
} from "./lib";
import { TypeBadge, LifecycleBadge, PublishDialog, ErrorDetails } from "./shared";

/* ── Versions tab ────────────────────────────────────────────────────────── */

function VersionsTab({
  template,
  onWhereUsed,
}: {
  template: TemplateDetail;
  onWhereUsed: (versionId: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [publishVersion, setPublishVersion] = React.useState<VersionSummary | null>(null);
  const [settingsVersion, setSettingsVersion] = React.useState<VersionSummary | null>(null);
  const [rejectVersion, setRejectVersion] = React.useState<VersionSummary | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [settings, setSettings] = React.useState({
    passThresholdPct: "",
    criticalFailGate: false,
    reviewRequired: false,
    changelogNote: "",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/audit/templates", template.id] });
    qc.invalidateQueries({ queryKey: ["/audit/templates"] });
  };

  const actionMut = useMutation({
    mutationFn: ({ versionId, action, body }: { versionId: string; action: string; body?: unknown }) =>
      apiFetch(`/audit/templates/versions/${versionId}/${action}`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: (_res, vars) => {
      toast({ title: `Version ${vars.action.replace(/-/g, " ")} done` });
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message || "Action failed", variant: "destructive" }),
  });

  const newDraftMut = useMutation({
    mutationFn: (fromVersionId: string) =>
      apiFetch(`/audit/templates/${template.id}/versions`, {
        method: "POST",
        body: JSON.stringify({ fromVersionId }),
      }),
    onSuccess: () => {
      toast({ title: "New draft created" });
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message || "Draft failed", variant: "destructive" }),
  });

  const settingsMut = useMutation({
    mutationFn: () =>
      apiFetch(`/audit/templates/versions/${settingsVersion!.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          passThresholdPct: settings.passThresholdPct === "" ? null : Number(settings.passThresholdPct),
          criticalFailGate: settings.criticalFailGate,
          reviewRequired: settings.reviewRequired,
          ...(settings.changelogNote.trim() ? { changelogNote: settings.changelogNote.trim() } : {}),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Version settings saved" });
      setSettingsVersion(null);
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message || "Save failed", variant: "destructive" }),
  });

  const openSettings = (v: VersionSummary) => {
    setSettings({
      passThresholdPct: v.passThresholdPct != null ? String(Number(v.passThresholdPct)) : "",
      criticalFailGate: v.criticalFailGate,
      reviewRequired: v.reviewRequired,
      changelogNote: v.changelogNote ?? "",
    });
    setSettingsVersion(v);
  };

  const builderPath = (v: VersionSummary) =>
    `/audits/templates/${template.id}/versions/${v.id}/builder`;
  const previewPath = (v: VersionSummary) =>
    `/audits/templates/${template.id}/versions/${v.id}/preview`;

  const versions = [...template.versions].sort((a, b) => b.versionNo - a.versionNo);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Version</TableHead>
              <TableHead>Lifecycle</TableHead>
              <TableHead>Changelog</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Content hash</TableHead>
              <TableHead className="w-64 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-mono tabular-nums">v{v.versionNo}</TableCell>
                <TableCell><LifecycleBadge lifecycle={v.lifecycle} /></TableCell>
                <TableCell className="max-w-[260px]">
                  <span className="block truncate text-sm text-muted-foreground">
                    {v.changelogNote || "—"}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDate(v.publishedAt)}</TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-muted-foreground">
                    {v.contentHash ? v.contentHash.slice(0, 10) : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {v.lifecycle === "DRAFT" && (
                      <>
                        <Button asChild variant="outline" size="sm">
                          <Link href={builderPath(v)}>
                            <Hammer className="mr-1 h-3.5 w-3.5" /> Open builder
                          </Link>
                        </Button>
                        <Button size="sm" onClick={() => setPublishVersion(v)}>
                          Publish
                        </Button>
                      </>
                    )}
                    {v.lifecycle === "PENDING_APPROVAL" && (
                      <Button size="sm" onClick={() => setPublishVersion(v)}>
                        Publish (approve)
                      </Button>
                    )}
                    {v.lifecycle === "PUBLISHED" && (
                      <Button asChild variant="outline" size="sm">
                        <Link href={builderPath(v)}>
                          <Eye className="mr-1 h-3.5 w-3.5" /> View
                        </Link>
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {v.lifecycle === "DRAFT" && (
                          <>
                            <DropdownMenuItem onClick={() => openSettings(v)}>
                              <Pencil className="mr-2 h-4 w-4" /> Settings
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => actionMut.mutate({ versionId: v.id, action: "submit-approval" })}
                            >
                              <Send className="mr-2 h-4 w-4" /> Submit for approval
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => actionMut.mutate({ versionId: v.id, action: "archive" })}
                            >
                              <Archive className="mr-2 h-4 w-4" /> Archive version
                            </DropdownMenuItem>
                          </>
                        )}
                        {v.lifecycle === "PENDING_APPROVAL" && (
                          <DropdownMenuItem onClick={() => { setRejectReason(""); setRejectVersion(v); }}>
                            Reject approval
                          </DropdownMenuItem>
                        )}
                        {v.lifecycle === "PUBLISHED" && (
                          <>
                            <DropdownMenuItem asChild>
                              <Link href={previewPath(v)}>Preview (sandbox)</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => newDraftMut.mutate(v.id)}>
                              <GitBranch className="mr-2 h-4 w-4" /> New draft from this
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onWhereUsed(v.id)}>
                              Where-used
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => actionMut.mutate({ versionId: v.id, action: "deprecate" })}
                            >
                              Deprecate
                            </DropdownMenuItem>
                          </>
                        )}
                        {v.lifecycle === "DEPRECATED" && (
                          <DropdownMenuItem
                            onClick={() => actionMut.mutate({ versionId: v.id, action: "archive" })}
                          >
                            <Archive className="mr-2 h-4 w-4" /> Archive version
                          </DropdownMenuItem>
                        )}
                        {v.lifecycle !== "PUBLISHED" && (
                          <DropdownMenuItem asChild>
                            <Link href={previewPath(v)}>Preview (sandbox)</Link>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {versions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No versions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <PublishDialog
        open={publishVersion != null}
        onOpenChange={(o) => { if (!o) setPublishVersion(null); }}
        versionId={publishVersion?.id ?? null}
        versionNo={publishVersion?.versionNo}
        onPublished={invalidate}
      />

      <FormModal
        open={settingsVersion != null}
        onOpenChange={(o) => { if (!o) setSettingsVersion(null); }}
        title={`v${settingsVersion?.versionNo ?? ""} settings`}
        onSave={() => settingsMut.mutate()}
        isSaving={settingsMut.isPending}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Pass threshold %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={settings.passThresholdPct}
              onChange={(e) => setSettings((s) => ({ ...s, passThresholdPct: e.target.value }))}
              placeholder="e.g. 80 — empty = no pass/fail verdict"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Critical fail gate</p>
              <p className="text-xs text-muted-foreground">Any critical NC forces a FAIL result.</p>
            </div>
            <Switch
              checked={settings.criticalFailGate}
              onCheckedChange={(c) => setSettings((s) => ({ ...s, criticalFailGate: c }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Review required</p>
              <p className="text-xs text-muted-foreground">Submitted audits route through a reviewer.</p>
            </div>
            <Switch
              checked={settings.reviewRequired}
              onCheckedChange={(c) => setSettings((s) => ({ ...s, reviewRequired: c }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Changelog note</Label>
            <Textarea
              value={settings.changelogNote}
              onChange={(e) => setSettings((s) => ({ ...s, changelogNote: e.target.value }))}
              rows={3}
            />
          </div>
        </div>
      </FormModal>

      <FormModal
        open={rejectVersion != null}
        onOpenChange={(o) => { if (!o) setRejectVersion(null); }}
        title={`Reject v${rejectVersion?.versionNo ?? ""} approval`}
        onSave={() => {
          actionMut.mutate(
            { versionId: rejectVersion!.id, action: "reject-approval", body: { reason: rejectReason.trim() } },
            { onSuccess: () => setRejectVersion(null) },
          );
        }}
        isSaving={actionMut.isPending}
        saveLabel="Reject"
      >
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Why is this version being sent back to draft?"
          />
        </div>
      </FormModal>
    </div>
  );
}

/* ── Where-used tab ──────────────────────────────────────────────────────── */

function WhereUsedTab({
  template,
  versionId,
  setVersionId,
}: {
  template: TemplateDetail;
  versionId: string;
  setVersionId: (id: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [migrateTo, setMigrateTo] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const usageQuery = useQuery({
    queryKey: ["/audit/templates/where-used", versionId],
    queryFn: () =>
      apiFetch<ApiOne<WhereUsed>>(`/audit/templates/versions/${versionId}/where-used`),
    enabled: Boolean(versionId),
  });

  const migrateMut = useMutation({
    mutationFn: () =>
      apiFetch<ApiOne<{ migrated: number }>>(
        `/audit/templates/versions/${versionId}/migrate-schedules`,
        { method: "POST", body: JSON.stringify({ toVersionId: migrateTo }) },
      ),
    onSuccess: (res) => {
      toast({ title: `${res.data.migrated} schedule(s) migrated` });
      setConfirmOpen(false);
      setMigrateTo("");
      qc.invalidateQueries({ queryKey: ["/audit/templates/where-used"] });
      qc.invalidateQueries({ queryKey: ["/audit/schedules"] });
    },
    onError: (e: Error) => {
      setConfirmOpen(false);
      toast({ title: e.message || "Migration failed", variant: "destructive" });
    },
  });

  const versions = [...template.versions].sort((a, b) => b.versionNo - a.versionNo);
  const published = versions.filter((v) => v.lifecycle === "PUBLISHED");
  const migrateTargets = published.filter((v) => v.id !== versionId);
  const usage = usageQuery.data?.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label>Version</Label>
          <Select value={versionId} onValueChange={setVersionId}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Pick a version" /></SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  v{v.versionNo} · {titleCase(v.lifecycle)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {usage && (
          <div className="flex gap-6 pb-1 text-sm">
            <span>
              <span className="font-semibold tabular-nums">{usage.openAudits}</span>{" "}
              <span className="text-muted-foreground">open audits</span>
            </span>
            <span>
              <span className="font-semibold tabular-nums">{usage.totalAudits}</span>{" "}
              <span className="text-muted-foreground">total audits</span>
            </span>
          </div>
        )}
      </div>

      {usageQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Frequency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usage?.schedules ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/audits/schedules/${s.id}`} className="font-medium hover:underline">
                      {s.title}
                    </Link>
                  </TableCell>
                  <TableCell><Badge variant={s.status === "ACTIVE" ? "default" : "secondary"}>{s.status}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{titleCase(s.frequency)}</TableCell>
                </TableRow>
              ))}
              {(usage?.schedules ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                    No schedules reference this version.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {(usage?.schedules.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-4">
          <div className="space-y-2">
            <Label>Migrate schedules to</Label>
            <Select value={migrateTo} onValueChange={setMigrateTo}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Pick a published version" />
              </SelectTrigger>
              <SelectContent>
                {migrateTargets.map((v) => (
                  <SelectItem key={v.id} value={v.id}>v{v.versionNo} · Published</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" disabled={!migrateTo} onClick={() => setConfirmOpen(true)}>
            Migrate
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Moves every schedule on this version to the chosen published version.
            Open audits keep the version they were generated with.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Migrate schedules?"
        description={`${usage?.schedules.length ?? 0} schedule(s) will start generating audits from the selected version. Future occurrences only.`}
        onConfirm={() => migrateMut.mutate()}
        isConfirming={migrateMut.isPending}
        confirmLabel="Migrate"
        variant="default"
      />
    </div>
  );
}

/* ── Compare tab ─────────────────────────────────────────────────────────── */

function CompareTab({ template }: { template: TemplateDetail }) {
  const versions = [...template.versions].sort((a, b) => b.versionNo - a.versionNo);
  const [fromId, setFromId] = React.useState("");
  const [toId, setToId] = React.useState("");

  const diffQuery = useQuery({
    queryKey: ["/audit/templates/diff", fromId, toId],
    queryFn: () =>
      apiFetch<ApiOne<VersionDiff>>(`/audit/templates/versions/${fromId}/diff/${toId}`),
    enabled: Boolean(fromId && toId && fromId !== toId),
  });

  const diff = diffQuery.data?.data;
  const picker = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[200px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {versions.map((v) => (
          <SelectItem key={v.id} value={v.id}>v{v.versionNo} · {titleCase(v.lifecycle)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {picker(fromId, setFromId, "From version")}
        <span className="text-sm text-muted-foreground">→</span>
        {picker(toId, setToId, "To version")}
      </div>

      {fromId && toId && fromId === toId && (
        <p className="text-sm text-muted-foreground">Pick two different versions.</p>
      )}
      {diffQuery.isLoading && <Skeleton className="h-40 w-full" />}
      {diffQuery.isError && (
        <p className="text-sm text-destructive">{(diffQuery.error as Error).message}</p>
      )}

      {diff && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sections</CardTitle>
              <CardDescription>
                v{diff.from.versionNo} → v{diff.to.versionNo}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {diff.sectionsAdded.map((s) => (
                  <Badge key={`a-${s}`} className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    + {s}
                  </Badge>
                ))}
                {diff.sectionsRemoved.map((s) => (
                  <Badge key={`r-${s}`} variant="destructive">− {s}</Badge>
                ))}
                {diff.sectionsAdded.length === 0 && diff.sectionsRemoved.length === 0 && (
                  <p className="text-sm text-muted-foreground">No section changes.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Questions added / removed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {diff.questionsAdded.map((q) => (
                <p key={`qa-${q}`} className="text-emerald-700">+ {q}</p>
              ))}
              {diff.questionsRemoved.map((q) => (
                <p key={`qr-${q}`} className="text-destructive">− {q}</p>
              ))}
              {diff.questionsAdded.length === 0 && diff.questionsRemoved.length === 0 && (
                <p className="text-muted-foreground">No questions added or removed.</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Changed questions</CardTitle>
            </CardHeader>
            <CardContent>
              {diff.questionsChanged.length === 0 ? (
                <p className="text-sm text-muted-foreground">No field-level changes.</p>
              ) : (
                <div className="space-y-3">
                  {diff.questionsChanged.map((c) => (
                    <div key={c.question} className="rounded-md border p-3">
                      <p className="text-sm font-medium">{c.question}</p>
                      <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                        {Object.entries(c.changes).map(([field, ch]) => (
                          <span key={field}>
                            {field}:{" "}
                            <span className="font-mono">{JSON.stringify(ch.from)}</span>
                            {" → "}
                            <span className="font-mono text-foreground">{JSON.stringify(ch.to)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ── Import / export tab ─────────────────────────────────────────────────── */

function ImportExportTab({ template }: { template: TemplateDetail }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const versions = [...template.versions].sort((a, b) => b.versionNo - a.versionNo);
  const [versionId, setVersionId] = React.useState(versions[0]?.id ?? "");
  const [jsonText, setJsonText] = React.useState("");
  const [importError, setImportError] = React.useState<ApiError | null>(null);
  const selected = versions.find((v) => v.id === versionId);

  const exportMut = useMutation({
    mutationFn: () =>
      apiFetch<ApiOne<unknown>>(`/audit/templates/versions/${versionId}/export`),
    onSuccess: (res) => {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-v${selected?.versionNo ?? ""}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (e: Error) => toast({ title: e.message || "Export failed", variant: "destructive" }),
  });

  const importMut = useMutation({
    mutationFn: (payload: unknown) =>
      apiFetch<ApiOne<{ sections: number; questions: number }>>(
        `/audit/templates/versions/${versionId}/import`,
        { method: "POST", body: JSON.stringify(payload) },
      ),
    onSuccess: (res) => {
      setImportError(null);
      setJsonText("");
      toast({ title: `Imported ${res.data.sections} sections, ${res.data.questions} questions` });
      qc.invalidateQueries({ queryKey: ["/audit/templates/versions", versionId] });
    },
    onError: (e: ApiError) => setImportError(e),
  });

  const runImport = () => {
    setImportError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setImportError(Object.assign(new Error("Invalid JSON — paste the exported payload or a {sections:[…]} object.")));
      return;
    }
    // Accept either a bare {sections} object or a full export payload.
    const body =
      parsed && typeof parsed === "object" && "sections" in (parsed as object)
        ? { sections: (parsed as { sections: unknown }).sections }
        : parsed;
    importMut.mutate(body);
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    void file.text().then(setJsonText);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Export</CardTitle>
          <CardDescription>
            Full section/question content as JSON — for backup or cross-environment promotion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Version</Label>
            <Select value={versionId} onValueChange={setVersionId}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    v{v.versionNo} · {titleCase(v.lifecycle)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => exportMut.mutate()} disabled={!versionId || exportMut.isPending}>
            <Download className="mr-1 h-4 w-4" /> Download JSON
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Import</CardTitle>
          <CardDescription>
            All-or-nothing: replaces the selected DRAFT version's content. Nothing
            is written when validation fails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {selected && selected.lifecycle !== "DRAFT" && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              v{selected.versionNo} is {titleCase(selected.lifecycle)} — pick a draft
              version to import into.
            </p>
          )}
          <Input
            type="file"
            accept="application/json,.json"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={8}
            placeholder='{"sections":[{"title":"…","questions":[{"prompt":"…","type":"RATING","weight":5}]}]}'
            className="font-mono text-xs"
          />
          <Button
            size="sm"
            onClick={runImport}
            disabled={!jsonText.trim() || importMut.isPending || selected?.lifecycle !== "DRAFT"}
          >
            <Upload className="mr-1 h-4 w-4" /> Import
          </Button>
          {importError && (
            <div>
              <p className="text-sm font-medium text-destructive">{importError.message}</p>
              <ErrorDetails details={importError.details} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Access-scope editor (per-template visibility) ───────────────────────── */

const SCOPE_ROLES = [
  "UNIT_LEAD", "CLUSTER_MANAGER", "CITY_HEAD", "ZONAL_HEAD",
  "OPS_EXCELLENCE", "CUSTOMER_EXPERIENCE",
] as const;

interface ScopeOrgNodes {
  cities: { id: string; name: string }[];
  clusters: { id: string; name: string }[];
}

function AccessScopeDialog({
  open,
  onOpenChange,
  templateId,
  scope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  scope: AccessScope | null | undefined;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canAdmin = can("AUDIT_ADMIN", "view");

  const [clusterIds, setClusterIds] = React.useState<string[]>([]);
  const [cityIds, setCityIds] = React.useState<string[]>([]);
  const [roles, setRoles] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setClusterIds(scope?.clusterIds ?? []);
    setCityIds(scope?.cityIds ?? []);
    setRoles(scope?.roles ?? []);
  }, [open, scope]);

  // Org nodes for cluster/city names (AUDIT_ADMIN only); degrade to just properties.
  const orgNodesQuery = useQuery({
    queryKey: ["/audit/admin/org-nodes", "access-scope"],
    queryFn: () => apiFetch<ApiOne<ScopeOrgNodes>>("/audit/admin/org-nodes"),
    enabled: open && canAdmin,
    retry: false,
  });
  const propertiesQuery = useQuery({
    queryKey: ["/properties", "access-scope"],
    queryFn: () => apiFetch<ApiList<{ id: string; name: string }>>("/properties?limit=200"),
    enabled: open && (!canAdmin || orgNodesQuery.isError),
    retry: false,
  });

  const clusters = orgNodesQuery.data?.data.clusters ?? [];
  const cities = orgNodesQuery.data?.data.cities ?? [];
  const orgUnavailable = !canAdmin || orgNodesQuery.isError;

  const toggle = (list: string[], setList: (v: string[]) => void, id: string, on: boolean) =>
    setList(on ? [...list, id] : list.filter((x) => x !== id));

  const saveMut = useMutation({
    mutationFn: () => {
      const scopeJson =
        clusterIds.length === 0 && cityIds.length === 0 && roles.length === 0
          ? null
          : {
              ...(clusterIds.length ? { clusterIds } : {}),
              ...(cityIds.length ? { cityIds } : {}),
              ...(roles.length ? { roles } : {}),
            };
      return apiFetch(`/audit/templates/${templateId}`, {
        method: "PATCH",
        body: JSON.stringify({ accessScopeJson: scopeJson }),
      });
    },
    onSuccess: () => {
      toast({ title: "Access scope saved" });
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["/audit/templates", templateId] });
    },
    onError: (e: Error) => toast({ title: e.message || "Save failed", variant: "destructive" }),
  });

  const unrestricted = clusterIds.length === 0 && cityIds.length === 0 && roles.length === 0;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Access scope"
      onSave={() => saveMut.mutate()}
      isSaving={saveMut.isPending}
      saveLabel="Save scope"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Restrict who can see this template. Leave everything unchecked for
          <span className="font-medium text-foreground"> unrestricted</span> visibility.
        </p>

        {orgUnavailable ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            Cluster/city names are available to audit admins only — clusters and
            cities can't be edited here. You can still scope by role below.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Clusters</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {clusters.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                    <Checkbox
                      checked={clusterIds.includes(c.id)}
                      onCheckedChange={(v) => toggle(clusterIds, setClusterIds, c.id, v === true)}
                    />
                    {c.name}
                  </label>
                ))}
                {clusters.length === 0 && <p className="py-2 text-center text-xs text-muted-foreground">No clusters.</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cities</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {cities.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                    <Checkbox
                      checked={cityIds.includes(c.id)}
                      onCheckedChange={(v) => toggle(cityIds, setCityIds, c.id, v === true)}
                    />
                    {c.name}
                  </label>
                ))}
                {cities.length === 0 && <p className="py-2 text-center text-xs text-muted-foreground">No cities.</p>}
              </div>
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label>Roles</Label>
          <div className="grid grid-cols-2 gap-2">
            {SCOPE_ROLES.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={roles.includes(r)}
                  onCheckedChange={(v) => toggle(roles, setRoles, r, v === true)}
                />
                {titleCase(r)}
              </label>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {unrestricted ? "Currently unrestricted — visible to everyone in scope." : "Restricted to the selections above."}
        </p>
      </div>
    </FormModal>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function AuditTemplateDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = React.useState("versions");
  const [whereUsedVersionId, setWhereUsedVersionId] = React.useState("");
  const [editOpen, setEditOpen] = React.useState(false);
  const [cloneOpen, setCloneOpen] = React.useState(false);
  const [scopeOpen, setScopeOpen] = React.useState(false);
  const [cloneName, setCloneName] = React.useState("");
  const [meta, setMeta] = React.useState({ name: "", category: "", description: "" });

  const templateQuery = useQuery({
    queryKey: ["/audit/templates", params.id],
    queryFn: () => apiFetch<ApiOne<TemplateDetail>>(`/audit/templates/${params.id}`),
    enabled: Boolean(params.id),
  });
  const template = templateQuery.data?.data;

  // Default the where-used picker to the latest published version.
  React.useEffect(() => {
    if (!template || whereUsedVersionId) return;
    const versions = [...template.versions].sort((a, b) => b.versionNo - a.versionNo);
    const pick = versions.find((v) => v.lifecycle === "PUBLISHED") ?? versions[0];
    if (pick) setWhereUsedVersionId(pick.id);
  }, [template, whereUsedVersionId]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/audit/templates", params.id] });
    qc.invalidateQueries({ queryKey: ["/audit/templates"] });
  };

  const metaMut = useMutation({
    mutationFn: () =>
      apiFetch(`/audit/templates/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: meta.name.trim(),
          category: meta.category.trim() || null,
          description: meta.description.trim() || null,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Template updated" });
      setEditOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message || "Save failed", variant: "destructive" }),
  });

  const cloneMut = useMutation({
    mutationFn: () =>
      apiFetch<ApiOne<{ id: string }>>(`/audit/templates/${params.id}/clone`, {
        method: "POST",
        body: JSON.stringify({ name: cloneName.trim() }),
      }),
    onSuccess: (res) => {
      toast({ title: "Template cloned" });
      setCloneOpen(false);
      qc.invalidateQueries({ queryKey: ["/audit/templates"] });
      navigate(`/audits/templates/${res.data.id}`);
    },
    onError: (e: Error) => toast({ title: e.message || "Clone failed", variant: "destructive" }),
  });

  const archiveMut = useMutation({
    mutationFn: (restore: boolean) =>
      apiFetch(`/audit/templates/${params.id}/archive`, {
        method: "POST",
        body: JSON.stringify(restore ? { restore: true } : {}),
      }),
    onSuccess: () => {
      toast({ title: template?.archivedAt ? "Template restored" : "Template archived" });
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message || "Action failed", variant: "destructive" }),
  });

  if (templateQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!template) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Template not found"
          breadcrumbs={[{ label: "Audits" }, { label: "Templates", href: "/audits/templates" }]}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={template.name}
        subtitle={template.description || undefined}
        breadcrumbs={[
          { label: "Audits" },
          { label: "Templates", href: "/audits/templates" },
          { label: template.name },
        ]}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMeta({
                  name: template.name,
                  category: template.category ?? "",
                  description: template.description ?? "",
                });
                setEditOpen(true);
              }}
            >
              <Pencil className="mr-1 h-4 w-4" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setScopeOpen(true)}>
              <Lock className="mr-1 h-4 w-4" /> Access scope
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setCloneName(`${template.name} (copy)`); setCloneOpen(true); }}
            >
              <Copy className="mr-1 h-4 w-4" /> Clone template
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => archiveMut.mutate(Boolean(template.archivedAt))}
              disabled={archiveMut.isPending}
            >
              {template.archivedAt ? (
                <><ArchiveRestore className="mr-1 h-4 w-4" /> Restore</>
              ) : (
                <><Archive className="mr-1 h-4 w-4" /> Archive</>
              )}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <TypeBadge type={template.auditType} />
          <span className="text-muted-foreground">{AUDIT_TYPE_LABELS[template.auditType]}</span>
        </span>
        <span className="text-muted-foreground">
          Target: <span className="text-foreground">{titleCase(template.targetType)}</span>
        </span>
        {template.category && (
          <span className="text-muted-foreground">
            Category: <span className="text-foreground">{template.category}</span>
          </span>
        )}
        {template.archivedAt && <Badge variant="outline">Archived {fmtDate(template.archivedAt)}</Badge>}
        {(() => {
          const s = template.accessScopeJson;
          const restricted = !!s && ((s.clusterIds?.length ?? 0) + (s.cityIds?.length ?? 0) + (s.roles?.length ?? 0)) > 0;
          return (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Access:{" "}
              {restricted ? (
                <Badge variant="secondary">
                  Restricted
                  {(s!.roles?.length ?? 0) > 0 ? ` · ${s!.roles!.length} role${s!.roles!.length === 1 ? "" : "s"}` : ""}
                </Badge>
              ) : (
                <span className="text-foreground">Unrestricted</span>
              )}
            </span>
          );
        })()}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="where-used">Where-used</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="import-export">Import / Export</TabsTrigger>
        </TabsList>
        <TabsContent value="versions" className="mt-4">
          <VersionsTab
            template={template}
            onWhereUsed={(vid) => { setWhereUsedVersionId(vid); setTab("where-used"); }}
          />
        </TabsContent>
        <TabsContent value="where-used" className="mt-4">
          <WhereUsedTab
            template={template}
            versionId={whereUsedVersionId}
            setVersionId={setWhereUsedVersionId}
          />
        </TabsContent>
        <TabsContent value="compare" className="mt-4">
          <CompareTab template={template} />
        </TabsContent>
        <TabsContent value="import-export" className="mt-4">
          <ImportExportTab template={template} />
        </TabsContent>
      </Tabs>

      <FormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit template"
        onSave={() => metaMut.mutate()}
        isSaving={metaMut.isPending}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Input value={meta.category} onChange={(e) => setMeta((m) => ({ ...m, category: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={meta.description}
              onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))}
              rows={3}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Audit type and target type are fixed after creation — clone the
            template to change them.
          </p>
        </div>
      </FormModal>

      <AccessScopeDialog
        open={scopeOpen}
        onOpenChange={setScopeOpen}
        templateId={template.id}
        scope={template.accessScopeJson}
      />

      <FormModal
        open={cloneOpen}
        onOpenChange={setCloneOpen}
        title="Clone template"
        onSave={() => {
          if (!cloneName.trim()) {
            toast({ title: "Name is required", variant: "destructive" });
            return;
          }
          cloneMut.mutate();
        }}
        isSaving={cloneMut.isPending}
        saveLabel="Clone"
      >
        <div className="space-y-2">
          <Label>New template name</Label>
          <Input value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Copies the latest version's content into a fresh v1 draft.
          </p>
        </div>
      </FormModal>
    </div>
  );
}
