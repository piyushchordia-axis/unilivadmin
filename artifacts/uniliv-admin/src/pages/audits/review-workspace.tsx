import * as React from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle, AlertTriangle, ArrowLeft, BadgeCheck, Camera, Loader2,
  MapPin, Plus, RotateCcw, ThumbsDown, ThumbsUp, Undo2,
} from "lucide-react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { FormModal } from "@/components/ui/form-modal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import { usePermissions } from "@/lib/use-permissions";
import { ImageLightbox } from "@/components/image-lightbox";
import {
  AUDIT_STATE_BADGE, NC_SEVERITIES, NON_SCORED_TYPES, answerLabel, fmtDateTime,
  fmtDuration, scoreColorClass, titleCase,
  type ApiList, type ApiOne, type NcSeverity, type ReviewWorkspaceData,
  type RunQuestion, type RunResponse, type WorkspaceEvidence,
} from "./lib";
import { NcStateBadge, ReasonDialog, SeverityBadge, TypeBadge } from "./shared";

function gps(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** One read-only answered question row. */
function ResponseRow({
  question, response, ws, onOpenImage,
}: {
  question: RunQuestion;
  response: RunResponse | undefined;
  ws: ReviewWorkspaceData;
  onOpenImage: (evidenceId: string) => void;
}) {
  if (question.type === "INSTRUCTION") return null;
  const label = response ? answerLabel(question, response.answerJson, ws.scaleSnapshot) : null;
  const isNa = response?.isNa === true;
  const earned = response?.earnedScore != null ? Number(response.earnedScore) : null;
  const max = response?.maxScore != null ? Number(response.maxScore) : null;
  const scorable = !NON_SCORED_TYPES.has(question.type) && question.weight > 0;
  const evidence = (response
    ? ws.evidence.filter((e) => e.kind === "RESPONSE" && e.responseId === response.id)
    : []);
  const signatureUrl =
    question.type === "SIGNATURE" && response
      ? String((response.answerJson as Record<string, unknown> | null)?.["dataUrl"] ?? "") || null
      : null;

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{question.prompt}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {scorable && (
            <Badge variant="outline" className="tabular-nums" title="Weight">w{question.weight}</Badge>
          )}
          {question.adHoc && <Badge variant="secondary">ad-hoc</Badge>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {isNa ? (
          <Badge variant="outline">N/A — excluded</Badge>
        ) : label ? (
          <Badge variant="secondary">{label}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Not answered</span>
        )}
        {earned != null && max != null && max > 0 && (
          <span className={`text-xs tabular-nums ${scoreColorClass((earned / max) * 100)}`}>
            {earned.toFixed(1)} / {max.toFixed(1)} pts
          </span>
        )}
      </div>
      {signatureUrl && (
        <div className="inline-block rounded-md border bg-white p-1.5">
          <img src={signatureUrl} alt="Signature" className="max-h-16" />
        </div>
      )}
      {response?.notes && (
        <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-sm text-muted-foreground">
          {response.notes}
        </p>
      )}
      {evidence.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {evidence.map((e) => (
            <button key={e.id} type="button" onClick={() => onOpenImage(e.id)}>
              <img
                src={e.thumbUrl ?? e.url ?? undefined}
                alt={e.originalName ?? "Evidence"}
                className="h-14 w-14 rounded-md border object-cover hover:opacity-90"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Review workspace (FRD-REV-01/02/03/06) — read-only evidence pack + verdict dock. */
export default function ReviewWorkspace() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { role, can } = usePermissions();

  const wsQuery = useQuery({
    queryKey: ["/audit/reviews", id, "workspace"],
    queryFn: () => apiFetch<ApiOne<ReviewWorkspaceData>>(`/audit/reviews/${id}/workspace`),
  });
  const ws = wsQuery.data?.data;

  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveComment, setApproveComment] = React.useState("");
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reopenOpen, setReopenOpen] = React.useState(false);
  const [findingOpen, setFindingOpen] = React.useState(false);
  const [findingSeverity, setFindingSeverity] = React.useState<NcSeverity>("MINOR");
  const [findingDescription, setFindingDescription] = React.useState("");
  const [findingOwner, setFindingOwner] = React.useState("");
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);

  const usersQuery = useQuery({
    queryKey: ["/users", "finding-owner-picker"],
    queryFn: () => apiFetch<ApiList<{ id: string; name: string; role: string }>>("/users?limit=100"),
    enabled: findingOpen,
  });

  const invalidate = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/audit/reviews"] });
    qc.invalidateQueries({ queryKey: ["/audits"] });
    qc.invalidateQueries({ queryKey: ["/audit/ncs"] });
  }, [qc]);

  const leaveWithToast = (title: string) => {
    invalidate();
    navigate("/audits/review");
    toast({ title });
  };

  const claimMut = useMutation({
    mutationFn: () => apiFetch(`/audit/reviews/${id}/claim`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { toast({ title: "Review started" }); invalidate(); },
    onError: (e: Error) => toast({ title: e.message || "Claim failed", variant: "destructive" }),
  });
  const approveMut = useMutation({
    mutationFn: () =>
      apiFetch(`/audit/reviews/${id}/approve`, {
        method: "POST",
        body: JSON.stringify(approveComment.trim() ? { comments: approveComment.trim() } : {}),
      }),
    onSuccess: () => { setApproveOpen(false); leaveWithToast(`Audit ${ws?.audit.ticketNo ?? ""} approved`); },
    onError: (e: Error) => toast({ title: e.message || "Approve failed", variant: "destructive" }),
  });
  const rejectMut = useMutation({
    mutationFn: (comment: string) =>
      apiFetch(`/audit/reviews/${id}/reject`, { method: "POST", body: JSON.stringify({ comment }) }),
    onSuccess: () => {
      setRejectOpen(false);
      leaveWithToast(`Audit ${ws?.audit.ticketNo ?? ""} rejected — returned for rework`);
    },
    onError: (e: Error) => toast({ title: e.message || "Reject failed", variant: "destructive" }),
  });
  const reopenMut = useMutation({
    mutationFn: (reason: string) =>
      apiFetch(`/audit/reviews/${id}/reopen`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      setReopenOpen(false);
      leaveWithToast(`Audit ${ws?.audit.ticketNo ?? ""} reopened`);
    },
    onError: (e: Error) => toast({ title: e.message || "Reopen failed", variant: "destructive" }),
  });
  const findingMut = useMutation({
    mutationFn: () =>
      apiFetch<ApiOne<{ ncNo: string }>>(`/audit/reviews/${id}/findings`, {
        method: "POST",
        body: JSON.stringify({
          severity: findingSeverity,
          description: findingDescription.trim(),
          ...(findingOwner ? { ownerId: findingOwner } : {}),
        }),
      }),
    onSuccess: (res) => {
      toast({ title: `Finding ${res.data.ncNo} raised` });
      setFindingOpen(false);
      qc.invalidateQueries({ queryKey: ["/audit/reviews", id, "workspace"] });
      qc.invalidateQueries({ queryKey: ["/audit/ncs"] });
    },
    onError: (e: Error) => toast({ title: e.message || "Could not raise the finding", variant: "destructive" }),
  });

  /* — Derived — */
  const images = React.useMemo(() => {
    const list: WorkspaceEvidence[] = (ws?.evidence ?? []).filter(
      (e) => e.mime.startsWith("image/") && (e.url || e.thumbUrl),
    );
    return list;
  }, [ws?.evidence]);
  const openImage = (evidenceId: string) => {
    const idx = images.findIndex((e) => e.id === evidenceId);
    if (idx >= 0) setLightboxIndex(idx);
  };

  if (wsQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (wsQuery.isError || !ws) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm">{(wsQuery.error as Error)?.message || "Could not load the workspace."}</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/audits/review")}>
          Back to queue
        </Button>
      </div>
    );
  }

  const audit = ws.audit;
  const pct = audit.scorePct != null ? Number(audit.scorePct) : null;
  const threshold = ws.version?.passThresholdPct != null ? Number(ws.version.passThresholdPct) : null;
  const responseByQ = new Map(ws.responses.map((r) => [r.questionId, r]));
  const sectionScoreById = new Map(ws.sectionScores.map((s) => [s.sectionId, s]));
  const canReview = can("AUDIT_REVIEW", "edit");
  const canReopen = audit.state === "CLOSED" && (role === "SUPER_ADMIN" || role === "OPS_EXCELLENCE");
  const canAddFinding =
    canReview && ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(audit.state);
  const proof = ws.submissionProof;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      {/* (a) Header */}
      <div className="space-y-2">
        <Link
          href="/audits/review"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Review queue
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-bold tracking-tight text-primary">{audit.ticketNo}</h1>
          <Badge variant={AUDIT_STATE_BADGE[audit.state] ?? "outline"}>{titleCase(audit.state)}</Badge>
          <TypeBadge type={audit.auditType} />
        </div>
        <p className="text-muted-foreground">{audit.title}</p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {ws.target.propertyName ?? "—"}
            {ws.target.roomNumber ? ` · Room ${ws.target.roomNumber}` : ""}
          </span>
          <span>
            Auditor: <span className="font-medium text-foreground">{ws.assignee?.name ?? "—"}</span>
            {ws.assignee?.role && ` (${titleCase(ws.assignee.role)})`}
          </span>
          {ws.template && (
            <span>
              {ws.template.name}{" "}
              {ws.version && <span className="font-mono text-xs">v{ws.version.versionNo}</span>}
            </span>
          )}
        </p>
      </div>

      {/* Score + auto-captured timeline + proof */}
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[auto_1fr_auto]">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Score</p>
            <p className={`text-3xl font-bold tabular-nums ${scoreColorClass(pct)}`}>
              {pct != null ? `${pct.toFixed(1)}%` : "—"}
            </p>
            <div className="flex items-center gap-1.5">
              {audit.result && (
                <Badge variant={audit.result === "PASS" ? "success" : "destructive"}>{audit.result}</Badge>
              )}
              {audit.scoreBand && <Badge variant="outline">{audit.scoreBand}</Badge>}
            </div>
            {threshold != null && (
              <p className="text-xs text-muted-foreground">
                Pass threshold {threshold.toFixed(0)}%
                {ws.version?.criticalFailGate && " · critical-fail gate on"}
              </p>
            )}
          </div>
          <div className="space-y-1.5 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Auto-captured timeline</p>
            <p>
              Started {fmtDateTime(audit.startedAt)}
              {gps(audit.startGeoLat, audit.startGeoLng) && (
                <span className="ml-1 font-mono text-xs text-muted-foreground">
                  @ {gps(audit.startGeoLat, audit.startGeoLng)}
                </span>
              )}
            </p>
            <p>
              Submitted {fmtDateTime(audit.submittedAt)}
              {gps(audit.submitGeoLat, audit.submitGeoLng) && (
                <span className="ml-1 font-mono text-xs text-muted-foreground">
                  @ {gps(audit.submitGeoLat, audit.submitGeoLng)}
                </span>
              )}
            </p>
            <p className="text-muted-foreground">
              Duration {fmtDuration(audit.durationSeconds)}
              {audit.reopenCount > 0 && ` · reopened ×${audit.reopenCount}`}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              <Camera className="mr-1 inline h-3.5 w-3.5" /> Submission proof
            </p>
            {proof && (proof.thumbUrl || proof.url) ? (
              <button type="button" onClick={() => openImage(proof.id)}>
                <img
                  src={proof.thumbUrl ?? proof.url ?? undefined}
                  alt="Submission proof"
                  className="h-20 w-20 rounded-md border object-cover hover:opacity-90"
                />
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">Not captured</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* (b) Sections — read-only responses */}
      <Accordion type="multiple" className="space-y-3" defaultValue={ws.sections[0] ? [ws.sections[0].id] : []}>
        {ws.sections.map((section) => {
          const score = sectionScoreById.get(section.id);
          return (
            <AccordionItem
              key={section.id}
              value={section.id}
              className="rounded-lg border bg-card px-4 last:border-b"
            >
              <AccordionTrigger className="hover:no-underline">
                <span className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                  <span className="truncate font-medium">{section.title}</span>
                  <span className="flex-1" />
                  {score && score.possible > 0 && score.pct != null && (
                    <span className={`text-xs font-semibold tabular-nums ${scoreColorClass(score.pct)}`}>
                      {score.earned.toFixed(1)}/{score.possible.toFixed(1)} · {score.pct.toFixed(0)}%
                    </span>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2.5">
                  {section.questions.map((q) => (
                    <ResponseRow
                      key={q.id}
                      question={q}
                      response={responseByQ.get(q.id)}
                      ws={ws}
                      onOpenImage={openImage}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Findings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Findings
              <Badge variant="secondary" className="tabular-nums">{ws.ncs.length}</Badge>
            </span>
            {canAddFinding && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFindingSeverity("MINOR");
                  setFindingDescription("");
                  setFindingOwner("");
                  setFindingOpen(true);
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add finding
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {ws.ncs.length === 0 && (
            <p className="text-sm text-muted-foreground">No non-conformances on this audit.</p>
          )}
          {ws.ncs.map((nc) => (
            <Link
              key={nc.id}
              href={`/audits/ncs/${nc.id}`}
              className="flex items-center justify-between gap-3 rounded-md border p-2.5 hover:border-primary"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{nc.ncNo}</span>{" "}
                  {nc.description}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5">
                <SeverityBadge severity={nc.severity} />
                <NcStateBadge state={nc.state} />
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>

      {/* Prior verdicts */}
      {ws.reviews.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Review history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ws.reviews.map((r) => (
              <div key={r.id} className="rounded-md border p-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={r.verdict === "APPROVED" ? "success" : "destructive"}>
                    {titleCase(r.verdict)}
                  </Badge>
                  <span className="font-medium">{r.reviewerName ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {r.comments && <p className="mt-1 text-muted-foreground">{r.comments}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* (c) Verdict dock */}
      {(canReview && ["SUBMITTED", "UNDER_REVIEW"].includes(audit.state)) || canReopen ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_20px_-12px_rgba(0,0,0,0.25)] md:left-64">
          <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-6">
            {canReview && audit.state === "SUBMITTED" && (
              <Button
                className="min-h-11"
                disabled={claimMut.isPending}
                onClick={() => claimMut.mutate()}
              >
                {claimMut.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <BadgeCheck className="mr-2 h-4 w-4" />}
                Start review
              </Button>
            )}
            {canReview && audit.state === "UNDER_REVIEW" && (
              <>
                <Button className="min-h-11" onClick={() => { setApproveComment(""); setApproveOpen(true); }}>
                  <ThumbsUp className="mr-2 h-4 w-4" /> Approve
                </Button>
                <Button variant="outline" className="min-h-11" onClick={() => setRejectOpen(true)}>
                  <ThumbsDown className="mr-2 h-4 w-4" /> Reject
                </Button>
              </>
            )}
            {canReopen && (
              <Button variant="outline" className="min-h-11" onClick={() => setReopenOpen(true)}>
                <Undo2 className="mr-2 h-4 w-4" /> Reopen audit
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {/* Dialogs */}
      <FormModal
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={`Approve ${audit.ticketNo}`}
        onSave={() => approveMut.mutate()}
        isSaving={approveMut.isPending}
        saveLabel="Approve"
      >
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Approving locks the verdict; the audit auto-closes once every
            finding is terminal (FRD-REV-04).
          </p>
          <Label>Comment (optional)</Label>
          <Textarea
            value={approveComment}
            onChange={(e) => setApproveComment(e.target.value)}
            placeholder="Anything for the record?"
            rows={3}
            className="text-base"
          />
        </div>
      </FormModal>

      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Reject ${audit.ticketNo}`}
        description="The audit returns to the auditor In Progress with answers preserved. A comment is required (FRD-REV-02)."
        label="Comment"
        placeholder="What must be fixed before resubmission?"
        saveLabel="Reject"
        isSaving={rejectMut.isPending}
        onSave={(comment) => rejectMut.mutate(comment)}
      />

      <ReasonDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title={`Reopen ${audit.ticketNo}`}
        description="Operations Excellence only. The prior report revision is preserved; resubmission produces revision+1 (FRD-REV-06)."
        label="Reason"
        placeholder="Why is this closed audit being reopened?"
        saveLabel="Reopen"
        isSaving={reopenMut.isPending}
        onSave={(reason) => reopenMut.mutate(reason)}
      />

      <FormModal
        open={findingOpen}
        onOpenChange={setFindingOpen}
        title="Add finding"
        onSave={() => { if (findingDescription.trim()) findingMut.mutate(); }}
        isSaving={findingMut.isPending}
        saveLabel="Raise finding"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Raise a non-conformance the auditor missed (FRD-REV-03). It defaults
            to the property's Unit Lead unless you pick an owner.
          </p>
          <div className="space-y-2">
            <Label>Severity</Label>
            <Select value={findingSeverity} onValueChange={(v) => setFindingSeverity(v as NcSeverity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NC_SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea
              value={findingDescription}
              onChange={(e) => setFindingDescription(e.target.value)}
              placeholder="What is non-conforming?"
              rows={3}
              className="text-base"
            />
          </div>
          <div className="space-y-2">
            <Label>Owner (optional)</Label>
            <Select value={findingOwner} onValueChange={setFindingOwner}>
              <SelectTrigger>
                <SelectValue placeholder={usersQuery.isLoading ? "Loading users…" : "Default (auditee of target)"} />
              </SelectTrigger>
              <SelectContent>
                {(usersQuery.data?.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} · {titleCase(u.role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormModal>

      <ImageLightbox
        images={images.map((e) => e.url ?? e.thumbUrl!)}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        alt="Audit evidence"
      />
    </div>
  );
}
