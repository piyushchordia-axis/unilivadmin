import * as React from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FlaskConical, RotateCcw, Camera, PenLine, Info } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";
import {
  NON_SCORED_TYPES, titleCase,
  type ApiOne, type BuilderQuestion, type PreviewScore, type TemplateDetail,
  type VersionDetail,
} from "./lib";

/* ── Segmented pill control (single-select, click again to clear) ────────── */

function Pills({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(value === o.id ? null : o.id)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value === o.id
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Per-type answer input ───────────────────────────────────────────────── */

function AnswerInput({
  question,
  answer,
  setAnswer,
  scaleOptions,
}: {
  question: BuilderQuestion;
  answer: unknown;
  setAnswer: (answerJson: unknown) => void;
  scaleOptions: { id: string; label: string }[];
}) {
  const a = (answer ?? {}) as Record<string, unknown>;

  switch (question.type) {
    case "YES_NO_NA":
      return (
        <Pills
          options={[{ id: "YES", label: "Yes" }, { id: "NO", label: "No" }, { id: "NA", label: "N/A" }]}
          value={(a["value"] as string) ?? null}
          onChange={(v) => setAnswer(v ? { value: v } : null)}
        />
      );
    case "PASS_FAIL":
      return (
        <Pills
          options={[{ id: "PASS", label: "Pass" }, { id: "FAIL", label: "Fail" }]}
          value={(a["value"] as string) ?? null}
          onChange={(v) => setAnswer(v ? { value: v } : null)}
        />
      );
    case "RATING":
      return scaleOptions.length > 0 ? (
        <Pills
          options={scaleOptions}
          value={(a["optionId"] as string) ?? null}
          onChange={(v) => setAnswer(v ? { optionId: v } : null)}
        />
      ) : (
        <p className="text-xs text-muted-foreground">No rating scale configured.</p>
      );
    case "SINGLE_CHOICE":
      return (
        <Pills
          options={(question.optionsJson ?? []).map((o) => ({ id: o.id, label: o.label }))}
          value={(a["optionId"] as string) ?? null}
          onChange={(v) => setAnswer(v ? { optionId: v } : null)}
        />
      );
    case "MULTI_CHOICE": {
      const selected = Array.isArray(a["optionIds"]) ? (a["optionIds"] as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {(question.optionsJson ?? []).map((o) => {
            const on = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  const next = on ? selected.filter((x) => x !== o.id) : [...selected, o.id];
                  setAnswer(next.length ? { optionIds: next } : null);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "NUMERIC":
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="h-8 w-32"
            value={a["value"] != null ? String(a["value"]) : ""}
            onChange={(e) =>
              setAnswer(e.target.value === "" ? null : { value: Number(e.target.value) })
            }
          />
          {question.numericUnit && (
            <span className="text-xs text-muted-foreground">{question.numericUnit}</span>
          )}
          {(question.numericMin != null || question.numericMax != null) && (
            <span className="text-xs text-muted-foreground tabular-nums">
              ({question.numericMin ?? "−∞"} – {question.numericMax ?? "∞"})
            </span>
          )}
        </div>
      );
    case "TEXT":
      return (
        <Input
          className="h-8"
          placeholder="Free text (not scored)"
          value={(a["value"] as string) ?? ""}
          onChange={(e) => setAnswer(e.target.value ? { value: e.target.value } : null)}
        />
      );
    case "DATE":
      return (
        <Input
          type="date"
          className="h-8 w-40"
          value={(a["value"] as string) ?? ""}
          onChange={(e) => setAnswer(e.target.value ? { value: e.target.value } : null)}
        />
      );
    case "PHOTO":
      return (
        <Badge variant="outline"><Camera className="mr-1 h-3 w-3" /> Photo capture (display only)</Badge>
      );
    case "SIGNATURE":
      return (
        <Badge variant="outline"><PenLine className="mr-1 h-3 w-3" /> Signature (display only)</Badge>
      );
    case "INSTRUCTION":
      return (
        <Badge variant="outline"><Info className="mr-1 h-3 w-3" /> Instruction (display only)</Badge>
      );
    default:
      return null;
  }
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function TemplatePreview() {
  const params = useParams<{ id: string; vid: string }>();
  const { toast } = useToast();

  const versionQuery = useQuery({
    queryKey: ["/audit/templates/versions", params.vid],
    queryFn: () => apiFetch<ApiOne<VersionDetail>>(`/audit/templates/versions/${params.vid}`),
    enabled: Boolean(params.vid),
  });
  const templateQuery = useQuery({
    queryKey: ["/audit/templates", params.id],
    queryFn: () => apiFetch<ApiOne<TemplateDetail>>(`/audit/templates/${params.id}`),
    enabled: Boolean(params.id),
  });

  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const [score, setScore] = React.useState<PreviewScore | null>(null);

  const scoreMut = useMutation({
    mutationFn: (payload: { questionId: string; answerJson: unknown }[]) =>
      apiFetch<ApiOne<PreviewScore>>(
        `/audit/templates/versions/${params.vid}/preview-score`,
        { method: "POST", body: JSON.stringify({ answers: payload }) },
      ),
    onSuccess: (res) => setScore(res.data),
    onError: (e: Error) => toast({ title: e.message || "Scoring failed", variant: "destructive" }),
  });
  const scoreNow = scoreMut.mutate;

  // Initial dry-run with no answers → totals + the rating-scale snapshot.
  React.useEffect(() => {
    if (params.vid) scoreNow([]);
  }, [params.vid, scoreNow]);

  const setAnswer = (questionId: string, answerJson: unknown) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (answerJson == null) delete next[questionId];
      else next[questionId] = answerJson;
      scoreNow(Object.entries(next).map(([qid, aj]) => ({ questionId: qid, answerJson: aj })));
      return next;
    });
  };

  const reset = () => {
    setAnswers({});
    scoreNow([]);
  };

  const version = versionQuery.data?.data;
  const template = templateQuery.data?.data;
  const sections = React.useMemo(() => {
    const list = [...(version?.sections ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
    return list.map((s) => ({
      ...s,
      questions: [...s.questions].sort((a, b) => a.orderIndex - b.orderIndex),
    }));
  }, [version]);

  const scaleOptions = React.useMemo(() => {
    const opts = score?.scaleSnapshot?.options ?? [];
    return [...opts]
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      .map((o) => ({ id: o.id, label: o.label }));
  }, [score?.scaleSnapshot]);

  const sectionPct = (sectionId: string): number | null =>
    score?.sections.find((s) => s.sectionId === sectionId)?.pct ?? null;

  if (versionQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="mx-auto h-[560px] w-[390px] max-w-full" />
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

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Preview — v${version.versionNo}`}
        subtitle={template?.name}
        breadcrumbs={[
          { label: "Audits" },
          { label: "Templates", href: "/audits/templates" },
          { label: template?.name ?? "Template", href: `/audits/templates/${params.id}` },
          { label: `v${version.versionNo} preview` },
        ]}
        action={
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="mr-1 h-4 w-4" /> Reset answers
          </Button>
        }
      />

      <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <FlaskConical className="h-4 w-4 shrink-0" />
        Sandbox — nothing is saved. Answers score through the real engine and
        vanish when you leave.
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)]">
        {/* Phone frame */}
        <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[2.2rem] border-8 border-slate-900 bg-background shadow-xl">
          <div className="flex h-7 items-center justify-center bg-slate-900">
            <div className="h-1.5 w-16 rounded-full bg-slate-700" />
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-3">
            <p className="mb-1 px-1 text-sm font-semibold">{template?.name}</p>
            <p className="mb-3 px-1 text-xs text-muted-foreground">
              v{version.versionNo} · {sections.length} section{sections.length === 1 ? "" : "s"}
            </p>
            <Accordion type="multiple" defaultValue={sections.map((s) => s.id)}>
              {sections.map((s) => {
                const pct = sectionPct(s.id);
                return (
                  <AccordionItem key={s.id} value={s.id}>
                    <AccordionTrigger className="py-2 text-sm hover:no-underline">
                      <span className="flex flex-1 items-center justify-between gap-2 pr-2 text-left">
                        <span>{s.title}</span>
                        <Badge variant={pct == null ? "outline" : "secondary"} className="tabular-nums">
                          {pct == null ? "—" : `${pct.toFixed(0)}%`}
                        </Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pb-3">
                      {s.questions.map((q) => (
                        <div key={q.id} className="space-y-1.5">
                          <p className="text-sm">
                            {q.prompt}
                            {q.mandatory && <span className="text-destructive"> *</span>}
                            {!NON_SCORED_TYPES.has(q.type) && (
                              <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                                ({q.weight} pts)
                              </span>
                            )}
                          </p>
                          {q.helpText && (
                            <p className="text-xs text-muted-foreground">{q.helpText}</p>
                          )}
                          <AnswerInput
                            question={q}
                            answer={answers[q.id]}
                            setAnswer={(aj) => setAnswer(q.id, aj)}
                            scaleOptions={scaleOptions}
                          />
                        </div>
                      ))}
                      {s.questions.length === 0 && (
                        <p className="text-xs text-muted-foreground">Empty section.</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </div>

        {/* Live score panel */}
        <Card className="lg:sticky lg:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Live score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-3xl font-bold tabular-nums">
                {score?.overall.pct == null ? "—" : `${score.overall.pct.toFixed(1)}%`}
              </span>
              {score?.band && <Badge variant="secondary">{score.band}</Badge>}
              {score?.result && (
                <Badge variant={score.result === "PASS" ? "default" : "destructive"}>
                  {score.result}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {score
                ? `${score.overall.earnedRaw.toFixed(2)} of ${score.overall.maxRaw.toFixed(2)} points · ${Object.keys(answers).length} answered`
                : "Scoring…"}
            </p>
            <div className="space-y-2">
              {sections.map((s) => {
                const sec = score?.sections.find((x) => x.sectionId === s.id);
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{s.title}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {sec && sec.pct != null
                        ? `${sec.earnedRaw.toFixed(1)} / ${sec.maxRaw.toFixed(1)} · ${sec.pct.toFixed(0)}%`
                        : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
            {score?.scaleSnapshot && (
              <p className="text-xs text-muted-foreground">
                Rating scale: {score.scaleSnapshot.name} ·{" "}
                {score.scaleSnapshot.options.map((o) => `${o.label} ${o.multiplierPct}%`).join(", ")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Pass threshold: {version.passThresholdPct != null ? `${Number(version.passThresholdPct)}%` : "not set"} ·{" "}
              {titleCase(version.lifecycle)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
