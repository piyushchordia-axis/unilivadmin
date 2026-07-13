import * as React from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle, ArrowLeft, BadgeCheck, CalendarClock, Camera, Check,
  ClipboardList, FileText, Loader2, Pencil, Play, Plus, ShieldOff, Undo2, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { FormModal } from "@/components/ui/form-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import { usePermissions } from "@/lib/use-permissions";
import { CameraCapture, type CaptureMeta } from "@/components/audits/camera-capture";
import { ImageLightbox } from "@/components/image-lightbox";
import {
  NC_SEVERITIES, NC_TERMINAL_STATES, fmtDate, fmtDateTime, titleCase,
  type ApiError, type ApiOne, type NcDetailData, type NcSeverity,
} from "./lib";
import {
  NcActionDialog, NcStateBadge, ReasonDialog, SeverityBadge, SlaCountdown, useNowTick,
} from "./shared";

function tomorrowIso(): string {
  const d = new Date(Date.now() + 24 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

/** NC detail (FRD-NCM-02) — origin, evidence, CAPA timeline, extensions, verdicts. */
export default function NcDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { me, can } = usePermissions();
  const nowMs = useNowTick();

  // Owners arrive via My Findings (/audits/findings/:id); register roles via the board.
  const fromFindings = location.startsWith("/audits/findings");
  const backHref = fromFindings ? "/audits/findings" : "/audits/ncs";
  const backLabel = fromFindings ? "My Findings" : "NC Board";

  const ncQuery = useQuery({
    queryKey: ["/audit/ncs", id],
    queryFn: () => apiFetch<ApiOne<NcDetailData>>(`/audit/ncs/${id}`),
  });
  const nc = ncQuery.data?.data;

  const invalidate = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/audit/ncs"] });
  }, [qc]);

  /* — Dialog state — */
  const [editOpen, setEditOpen] = React.useState(false);
  const [editDescription, setEditDescription] = React.useState("");
  const [editCategory, setEditCategory] = React.useState("");
  const [actionOpen, setActionOpen] = React.useState(false);
  const [extensionOpen, setExtensionOpen] = React.useState(false);
  const [extDate, setExtDate] = React.useState("");
  const [extJustification, setExtJustification] = React.useState("");
  const [verifyOpen, setVerifyOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [waiveOpen, setWaiveOpen] = React.useState(false);
  const [denyFor, setDenyFor] = React.useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [evidenceKind, setEvidenceKind] = React.useState<"NC" | "CAPA">("CAPA");
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);

  /* — Mutations — */
  const patchMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/audit/ncs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Finding updated" });
      setEditOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message || "Update failed", variant: "destructive" }),
  });

  const startMut = useMutation({
    mutationFn: () => apiFetch(`/audit/ncs/${id}/start`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { toast({ title: "Corrective work started" }); invalidate(); },
    onError: (e: Error) => toast({ title: e.message || "Could not start", variant: "destructive" }),
  });

  const extensionMut = useMutation({
    mutationFn: () =>
      apiFetch(`/audit/ncs/${id}/extensions`, {
        method: "POST",
        body: JSON.stringify({ requestedDueAt: extDate, justification: extJustification.trim() }),
      }),
    onSuccess: () => {
      toast({ title: "Extension requested — reviewers notified" });
      setExtensionOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message || "Request failed", variant: "destructive" }),
  });

  const decideMut = useMutation({
    mutationFn: ({ eid, approve, comment }: { eid: string; approve: boolean; comment?: string }) =>
      apiFetch(`/audit/ncs/extensions/${eid}/decide`, {
        method: "POST",
        body: JSON.stringify({ approve, ...(comment ? { comment } : {}) }),
      }),
    onSuccess: (_r, vars) => {
      toast({ title: `Extension ${vars.approve ? "approved — SLA re-stamped" : "denied"}` });
      setDenyFor(null);
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message || "Decision failed", variant: "destructive" }),
  });

  const verifyMut = useMutation({
    mutationFn: () => apiFetch(`/audit/ncs/${id}/verify`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      toast({ title: "Finding verified & closed" });
      setVerifyOpen(false);
      invalidate();
    },
    onError: (e: Error) => {
      setVerifyOpen(false);
      toast({ title: e.message || "Verify failed", variant: "destructive" });
    },
  });
  const rejectMut = useMutation({
    mutationFn: (comment: string) =>
      apiFetch(`/audit/ncs/${id}/reject`, { method: "POST", body: JSON.stringify({ comment }) }),
    onSuccess: () => {
      toast({ title: "Resolution rejected — finding reopened" });
      setRejectOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message || "Reject failed", variant: "destructive" }),
  });
  const waiveMut = useMutation({
    mutationFn: (justification: string) =>
      apiFetch(`/audit/ncs/${id}/waive`, { method: "POST", body: JSON.stringify({ justification }) }),
    onSuccess: () => {
      toast({ title: "Finding waived" });
      setWaiveOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message || "Waive failed", variant: "destructive" }),
  });

  const uploadEvidence = async (dataUrl: string, thumbDataUrl: string, meta: CaptureMeta) => {
    try {
      await apiFetch(`/audit/ncs/${id}/evidence`, {
        method: "POST",
        body: JSON.stringify({
          dataUrl,
          thumbDataUrl,
          kind: evidenceKind,
          isLiveCapture: meta.source === "live-camera",
          capturedAt: meta.capturedAt,
          geo: meta.geo ?? undefined,
        }),
      });
      toast({ title: `${evidenceKind} evidence attached` });
      invalidate();
    } catch (e) {
      const err = e as ApiError;
      toast({ title: "Evidence rejected", description: err.message, variant: "destructive" });
      throw err; // keep the capture dialog open
    }
  };

  /* — Render — */
  if (ncQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (ncQuery.isError || !nc) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm">{(ncQuery.error as Error)?.message || "Finding not found."}</p>
        <Button variant="outline" size="sm" onClick={() => navigate(backHref)}>
          Back to {backLabel}
        </Button>
      </div>
    );
  }

  const isOwner = !!me?.id && me.id === nc.ownerId;
  const isReviewer = can("AUDIT_REVIEW", "edit");
  const canEditMeta = isOwner || can("AUDIT_NCS", "edit");
  const terminal = NC_TERMINAL_STATES.includes(nc.state);
  const workable = ["OPEN", "IN_PROGRESS", "REOPENED"].includes(nc.state);
  const pendingExtension = nc.extensionRequests.find((e) => e.status === "PENDING");
  const images = nc.evidence.filter((e) => e.mime.startsWith("image/") && (e.url || e.thumbUrl));

  const footerActions: React.ReactNode[] = [];
  if (isOwner && nc.state === "OPEN") {
    footerActions.push(
      <Button key="start" className="min-h-11" disabled={startMut.isPending} onClick={() => startMut.mutate()}>
        {startMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
        Start work
      </Button>,
    );
  }
  if (isOwner && (nc.state === "IN_PROGRESS" || nc.state === "REOPENED")) {
    footerActions.push(
      <Button key="action" className="min-h-11" onClick={() => setActionOpen(true)}>
        <ClipboardList className="mr-2 h-4 w-4" /> Add action
      </Button>,
    );
  }
  if (isOwner && ["OPEN", "IN_PROGRESS"].includes(nc.state) && !pendingExtension) {
    footerActions.push(
      <Button key="extension" variant="outline" className="min-h-11" onClick={() => setExtensionOpen(true)}>
        <CalendarClock className="mr-2 h-4 w-4" /> Request extension
      </Button>,
    );
  }
  if (isReviewer && nc.state === "RESOLVED") {
    footerActions.push(
      <Button key="verify" className="min-h-11" onClick={() => setVerifyOpen(true)}>
        <BadgeCheck className="mr-2 h-4 w-4" /> Verify
      </Button>,
      <Button key="reject" variant="outline" className="min-h-11" onClick={() => setRejectOpen(true)}>
        <Undo2 className="mr-2 h-4 w-4" /> Reject
      </Button>,
    );
  }
  if (isReviewer && ["OPEN", "IN_PROGRESS", "EXTENSION_REQUESTED"].includes(nc.state)) {
    footerActions.push(
      <Button
        key="waive"
        variant="outline"
        className="min-h-11 text-destructive hover:text-destructive"
        onClick={() => setWaiveOpen(true)}
      >
        <ShieldOff className="mr-2 h-4 w-4" /> Waive
      </Button>,
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      {/* Header */}
      <div className="space-y-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-bold tracking-tight text-primary">{nc.ncNo}</h1>
          <SeverityBadge severity={nc.severity} />
          <NcStateBadge state={nc.state} />
          {nc.isOverdue && !terminal && <Badge variant="destructive">Overdue</Badge>}
          <SlaCountdown state={nc.state} dueAt={nc.dueAt} nowMs={nowMs} className="text-sm" />
        </div>
        <p className="text-sm text-muted-foreground">
          Owner: <span className="font-medium text-foreground">{nc.ownerName ?? "—"}</span>
          {" · "}raised {formatDistanceToNow(new Date(nc.createdAt), { addSuffix: true })} by {nc.createdByName ?? "System"}
          {" · "}due {fmtDateTime(nc.dueAt)}
          {nc.reopenCount > 0 && ` · reopened ×${nc.reopenCount}`}
        </p>
      </div>

      {/* Origin */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            Origin
            {canEditMeta && !terminal && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditDescription(nc.description);
                  setEditCategory(nc.category ?? "");
                  setEditOpen(true);
                }}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href={`/audits/${nc.audit.id}`}
              className="font-mono text-xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              {nc.audit.ticketNo}
            </Link>
            <span className="text-muted-foreground">{nc.audit.title}</span>
            {nc.audit.propertyName && (
              <Badge variant="outline">{nc.audit.propertyName}</Badge>
            )}
            <Badge variant="secondary">{titleCase(nc.source)}</Badge>
          </div>
          {nc.questionPrompt && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Failed question</p>
              <p className="mt-0.5 font-medium">{nc.questionPrompt}</p>
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Description</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm">{nc.description}</p>
          </div>
          {nc.category && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Category</p>
              <p className="mt-0.5 text-sm">{nc.category}</p>
            </div>
          )}
          {nc.state === "WAIVED" && nc.waiverReason && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <p className="text-xs font-medium uppercase tracking-wide">Waived</p>
              <p className="mt-0.5">{nc.waiverReason}</p>
            </div>
          )}
          {isReviewer && !terminal && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <div className="space-y-1">
                <Label className="text-xs">Severity (reviewer)</Label>
                <Select
                  value={nc.severity}
                  onValueChange={(v) => patchMut.mutate({ severity: v as NcSeverity })}
                >
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NC_SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="max-w-xs text-xs text-muted-foreground">
                Changing severity re-stamps the SLA due date from the new
                severity's clock and is recorded in the trail (FRD-NCM-04).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Evidence */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evidence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {nc.evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No evidence yet{nc.severity === "CRITICAL" && !terminal
                ? " — critical findings need at least one photo/document before resolving (CAP-02)."
                : "."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {nc.evidence.map((e) => {
                const isImage = e.mime.startsWith("image/");
                const imageIndex = images.findIndex((img) => img.id === e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    className="group relative"
                    onClick={() => {
                      if (isImage && imageIndex >= 0) setLightboxIndex(imageIndex);
                      else if (e.url) window.open(e.url, "_blank", "noreferrer");
                    }}
                  >
                    {isImage ? (
                      <img
                        src={e.thumbUrl ?? e.url ?? undefined}
                        alt={e.originalName ?? "Evidence"}
                        className="h-20 w-20 rounded-md border object-cover transition-opacity group-hover:opacity-90"
                      />
                    ) : (
                      <span className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border bg-muted/40 text-muted-foreground">
                        <FileText className="h-6 w-6" />
                        <span className="text-[10px]">PDF</span>
                      </span>
                    )}
                    <span
                      className={`absolute left-1 top-1 rounded px-1 text-[10px] font-medium ${
                        e.kind === "CAPA" ? "bg-emerald-600 text-white" : "bg-slate-700 text-white"
                      }`}
                    >
                      {e.kind}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {!terminal && (
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={evidenceKind}
                onValueChange={(v) => { if (v) setEvidenceKind(v as "NC" | "CAPA"); }}
              >
                <ToggleGroupItem value="NC" className="min-h-9 px-3 text-xs">NC (issue)</ToggleGroupItem>
                <ToggleGroupItem value="CAPA" className="min-h-9 px-3 text-xs">CAPA (fix)</ToggleGroupItem>
              </ToggleGroup>
              <Button variant="outline" size="sm" className="min-h-9" onClick={() => setCameraOpen(true)}>
                <Camera className="mr-1.5 h-4 w-4" /> Add evidence
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CAPA timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            Corrective actions
            {isOwner && workable && (
              <Button variant="ghost" size="sm" onClick={() => setActionOpen(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nc.actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No corrective actions recorded yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l pl-6">
              {nc.actions.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border bg-card">
                    <Check className="h-3 w-3 text-muted-foreground" />
                  </span>
                  <p className="whitespace-pre-wrap text-sm">{a.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.submittedByName ?? "—"} · {fmtDateTime(a.createdAt)}
                    {a.completedAt && <span> · completed {fmtDate(a.completedAt)}</span>}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Extensions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Due-date extensions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {nc.extensionRequests.length === 0 && (
            <p className="text-sm text-muted-foreground">No extension requests.</p>
          )}
          {nc.extensionRequests.map((e) => (
            <div
              key={e.id}
              className={`rounded-md border p-3 ${e.status === "PENDING" ? "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/40" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">New due date: {fmtDateTime(e.requestedDueAt)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    requested by {e.requestedByName ?? "—"} · {fmtDate(e.createdAt)}
                  </span>
                </div>
                <Badge
                  variant={
                    e.status === "PENDING" ? "warning" : e.status === "APPROVED" ? "success" : "destructive"
                  }
                >
                  {titleCase(e.status)}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{e.justification}</p>
              {e.decisionComment && (
                <p className="mt-1 text-xs text-muted-foreground">Decision: {e.decisionComment}</p>
              )}
              {e.status === "PENDING" && isReviewer && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    className="min-h-9"
                    disabled={decideMut.isPending}
                    onClick={() => decideMut.mutate({ eid: e.id, approve: true })}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-9"
                    disabled={decideMut.isPending}
                    onClick={() => setDenyFor(e.id)}
                  >
                    <X className="mr-1 h-3.5 w-3.5" /> Deny
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Action dock */}
      {footerActions.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_20px_-12px_rgba(0,0,0,0.25)] md:left-64">
          <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-6">
            {footerActions}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <FormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit finding"
        onSave={() => {
          if (!editDescription.trim()) return;
          patchMut.mutate({ description: editDescription.trim(), category: editCategory.trim() || null });
        }}
        isSaving={patchMut.isPending}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={4}
              className="text-base"
            />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Input
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              placeholder="e.g. Housekeeping"
            />
          </div>
        </div>
      </FormModal>

      <NcActionDialog
        ncId={id}
        open={actionOpen}
        onOpenChange={setActionOpen}
      />

      <FormModal
        open={extensionOpen}
        onOpenChange={setExtensionOpen}
        title="Request due-date extension"
        onSave={() => { if (extDate && extJustification.trim()) extensionMut.mutate(); }}
        isSaving={extensionMut.isPending}
        saveLabel="Request extension"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Reviewers decide the request; if approved, the SLA clock re-stamps
            to the new date (FRD-CAP-04).
          </p>
          <div className="space-y-2">
            <Label>New due date *</Label>
            <DatePicker value={extDate} min={tomorrowIso()} onChange={setExtDate} className="w-[200px]" />
          </div>
          <div className="space-y-2">
            <Label>Justification *</Label>
            <Textarea
              value={extJustification}
              onChange={(e) => setExtJustification(e.target.value)}
              placeholder="Why is more time needed?"
              rows={3}
              className="text-base"
            />
          </div>
        </div>
      </FormModal>

      <ConfirmDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        title="Verify resolution?"
        description={`${nc.ncNo} will be marked Verified and closed immediately. This cannot be undone.`}
        onConfirm={() => verifyMut.mutate()}
        isConfirming={verifyMut.isPending}
        confirmLabel="Verify & close"
        variant="default"
      />
      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Reject resolution — ${nc.ncNo}`}
        description="The finding reopens and the owner is notified. A comment is required (FRD-CAP-05)."
        label="Comment"
        placeholder="Why is this resolution not acceptable?"
        saveLabel="Reject & reopen"
        isSaving={rejectMut.isPending}
        onSave={(comment) => rejectMut.mutate(comment)}
      />
      <ReasonDialog
        open={waiveOpen}
        onOpenChange={setWaiveOpen}
        title={`Waive finding — ${nc.ncNo}`}
        description="Waiving closes the finding without corrective action. A justification is required."
        label="Justification"
        placeholder="Why is this finding being waived?"
        saveLabel="Waive"
        isSaving={waiveMut.isPending}
        onSave={(justification) => waiveMut.mutate(justification)}
      />
      <ReasonDialog
        open={denyFor != null}
        onOpenChange={(o) => { if (!o) setDenyFor(null); }}
        title="Deny extension request"
        description="The original due date stands and the owner is notified."
        label="Comment"
        placeholder="Why is the extension denied? (optional)"
        saveLabel="Deny"
        required={false}
        isSaving={decideMut.isPending}
        onSave={(comment) =>
          denyFor && decideMut.mutate({ eid: denyFor, approve: false, comment: comment || undefined })
        }
      />

      <CameraCapture
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        purpose="evidence"
        auditorName={me?.name ?? "User"}
        onCapture={uploadEvidence}
      />

      <ImageLightbox
        images={images.map((e) => e.url ?? e.thumbUrl!)}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        alt="Evidence"
      />
    </div>
  );
}
