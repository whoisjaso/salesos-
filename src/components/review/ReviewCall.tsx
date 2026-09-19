"use client";

import { useCallback, useMemo, useRef, useState, type ComponentType } from "react";
import { useReducedMotion } from "motion/react";
import type { IconProps } from "@phosphor-icons/react";
import {
  ArrowLeft,
  BookmarkSimple,
  CalendarCheck,
  Check,
  ChatCircleText,
  Handshake,
  Lightbulb,
  ListChecks,
  Question,
  ShieldCheck,
  Sparkle,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import {
  coachingMoment,
  describePolicy,
  formatClock as clock,
  formatDuration,
  isGoodExample,
  NEVER_LINE,
  policyWithDisputes,
  type Moment,
  type MomentKind,
  type Review,
  type StageView,
  type Viewer,
} from "@/lib/review";
import { formatDateTimeIn, TENANT_TZ } from "@/lib/workspace-setter";
import { OutcomeChip } from "./OutcomeChip";
import { BAND_BORDER, BAND_ICON, BAND_TEXT, ProbabilityRing, StageStrip } from "./StageStrip";
import { Transcript } from "./Transcript";

const MOMENT_ICON: Record<MomentKind, ComponentType<IconProps>> = {
  commitment: Handshake,
  stakeholder: Users,
  objection: WarningCircle,
  next_step: CalendarCheck,
  outcome: ChatCircleText,
};

/**
 * One call: header, hero stage with a probability ring and the stage strip, moments,
 * transcript, what changed, feedback angles, coaching. The transcript decides; the rep
 * can only dispute (Wrong?). Extracted fields live in a side sheet. Owner sees the same.
 */
export function ReviewCall({ review, viewer }: { review: Review; viewer: Viewer }) {
  const reduce = useReducedMotion();
  const [disputed, setDisputed] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState<number | undefined>(undefined);
  const [activeStage, setActiveStage] = useState<string | undefined>(undefined);
  const [inspected, setInspected] = useState<number | undefined>(undefined);
  const [extractedOpen, setExtractedOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const spanRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  const { call, contact, extraction, transcript, hero, stages } = review;
  const policy = useMemo(() => policyWithDisputes(review, disputed), [review, disputed]);
  const changes = useMemo(() => describePolicy(policy), [policy]);
  const stripMoments = review.moments.filter((m) => m.kind !== "outcome");
  const coachMoment = review.coaching ? coachingMoment(review) : undefined;
  const anyDisputed = disputed.size > 0;
  const HeroIcon = BAND_ICON[hero.band];

  const jumpTo = useCallback(
    (i: number) => {
      setActive(i);
      setInspected(undefined);
      const el = spanRefs.current.get(i);
      el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    },
    [reduce],
  );

  const jumpToStage = (s: StageView) => {
    setActiveStage(s.key);
    if (s.spanIndexes.length > 0) jumpTo(s.spanIndexes[0]);
  };

  const toggleDispute = (id: string) =>
    setDisputed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const assertedCount = review.fields.filter((f) => f.spanIndexes.length > 0).length;

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4">
      {/* ----- Header row ----- */}
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" href="/review" leading={<ArrowLeft size={14} weight="bold" />} className="-ml-3 self-start">
          Calls
        </Button>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15px] font-semibold text-fg">{contact.displayName}</span>
          {contact.organizationName ? <span className="text-[13px] text-fg-muted">{contact.organizationName}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-fg-subtle">
          <span className="tabular">{call.startedAt ? formatDateTimeIn(call.startedAt, TENANT_TZ) : "Unknown time"}</span>
          <span aria-hidden>·</span>
          <span className="tabular">{formatDuration(call.durationSeconds)}</span>
          {viewer.role === "owner" ? (
            <>
              <span aria-hidden>·</span>
              <span>{review.rep.displayName}</span>
            </>
          ) : null}
          <OutcomeChip outcome={extraction.outcome.value} className="ml-auto" />
          <span className={cn("tag", anyDisputed ? "border-[color:var(--perf-attention-line)] text-perf-attention" : "text-perf-strong border-[color:var(--perf-strong-line)]")} data-testid="outcome-status">
            {anyDisputed ? <WarningCircle size={10} weight="bold" aria-hidden /> : <Sparkle size={10} weight="bold" aria-hidden />}
            {anyDisputed ? "Disputed" : "Transcript decided"}
          </span>
        </div>
      </div>

      {/* ----- Hero: the furthest stage the transcript cleared ----- */}
      <Surface padding="md" className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <ProbabilityRing percent={hero.percent} band={hero.band} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="section-label">Outcome</div>
            <div className="text-[36px] font-semibold leading-none tracking-tight text-fg" data-testid="hero-outcome">
              {hero.word}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn("chip", BAND_BORDER[hero.band], BAND_TEXT[hero.band])} data-testid="hero-band">
                <HeroIcon size={12} weight="bold" aria-hidden />
                {hero.bandLabel}
              </span>
              {extraction.unknowns.length > 0 ? <span className="chip border-dashed text-fg-subtle">{extraction.unknowns.length} unknown</span> : null}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExtractedOpen(true)} leading={<Question size={14} weight="bold" />} className="self-start" data-testid="wrong">
            Wrong?
          </Button>
        </div>
        <StageStrip stages={stages} active={activeStage} onSelect={jumpToStage} />
      </Surface>

      {/* ----- Moments ----- */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="section-label">Moments</span>
          <Button variant="secondary" size="sm" onClick={() => setExtractedOpen(true)} leading={<ListChecks size={14} weight="bold" />} data-testid="extracted-open">
            Extracted {assertedCount}
          </Button>
        </div>
        {stripMoments.length > 0 ? (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Moments">
            <div className="flex w-max gap-1.5 pb-1">
              {stripMoments.map((m) => (
                <MomentChip key={`${m.kind}:${m.spanIndex}`} moment={m} active={active === m.spanIndex} onClick={() => jumpTo(m.spanIndex)} />
              ))}
            </div>
          </div>
        ) : (
          <span className="text-[13px] text-fg-subtle">No moments extracted</span>
        )}
      </div>

      {/* ----- Transcript ----- */}
      <Transcript
        transcript={transcript}
        contactName={contact.displayName}
        citations={review.citations}
        active={active}
        inspected={inspected}
        onInspect={(i) => {
          setInspected((cur) => (cur === i ? undefined : i));
          setActive(i);
        }}
        registerRef={(i, el) => {
          if (el) spanRefs.current.set(i, el);
          else spanRefs.current.delete(i);
        }}
      />

      {/* ----- What this changes ----- */}
      <Surface padding="md" className="flex flex-col gap-2" aria-label="What this changes">
        <div className="flex items-center justify-between">
          <span className="section-label">What this changes</span>
          <span className={cn("tag", anyDisputed ? "border-[color:var(--perf-attention-line)] text-perf-attention" : "text-perf-strong border-[color:var(--perf-strong-line)]")} data-testid="policy-tag">
            {anyDisputed ? <WarningCircle size={10} weight="bold" aria-hidden /> : <Check size={10} weight="bold" aria-hidden />}
            {anyDisputed ? "Disputed" : "Applied"}
          </span>
        </div>
        <ul className="flex flex-col gap-1">
          {changes.map((c) => (
            <li key={c.text} className="flex items-center gap-2 text-[14px] text-fg" data-testid="change" data-applied={c.applied}>
              {c.applied ? <Check size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" /> : <Sparkle size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />}
              <span>{c.text}</span>
              {c.applied ? null : <span className="tag ml-auto border-dashed text-fg-muted">Leaning, not applied</span>}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 text-[12px] text-fg-subtle">
          <ShieldCheck size={13} weight="bold" aria-hidden className="shrink-0" />
          {NEVER_LINE}
        </div>
        {anyDisputed ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {review.fields
              .filter((f) => disputed.has(f.id))
              .map((f) => (
                <span key={f.id} className="tag border-[color:var(--perf-attention-line)] text-perf-attention">
                  Disputed, {f.label.toLowerCase()}
                </span>
              ))}
          </div>
        ) : null}
      </Surface>

      {/* ----- Feedback: angles through the lens ----- */}
      {review.feedback.length > 0 ? (
        <Surface padding="md" className="flex flex-col gap-2" aria-label="Feedback">
          <div className="section-label">Feedback</div>
          <ul className="flex flex-col gap-2">
            {review.feedback.map((f, i) => (
              <li key={`${f.angle}:${i}`} className="flex flex-col gap-1 rounded-md border border-line p-3" data-testid="feedback-card">
                <div className="flex items-start gap-2">
                  <Lightbulb size={16} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-accent" />
                  <span className="text-[14px] font-semibold leading-snug text-fg">{f.angle}</span>
                </div>
                <p className="pl-6 text-[13px] leading-snug text-fg-muted">{f.hint}</p>
                {f.spanIndex !== undefined ? (
                  <button type="button" onClick={() => jumpTo(f.spanIndex!)} className="ml-6 inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-accent underline-offset-2 hover:underline">
                    <ChatCircleText size={14} weight="bold" aria-hidden />
                    See moment, {clock(transcript[f.spanIndex]?.startMs ?? 0)}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}

      {/* ----- Coaching ----- */}
      {review.coaching ? (
        <Surface padding="md" className="flex flex-col gap-2" aria-label="Coaching">
          <div className="section-label">Coaching</div>
          <div className="text-[15px] font-semibold text-fg">{review.coaching.title}</div>
          <div className="flex flex-col gap-1">
            <span className="section-label">Why</span>
            <p className="text-[13px] leading-snug text-fg-muted">{review.coaching.issue}</p>
          </div>
          {coachMoment ? (
            <button type="button" onClick={() => jumpTo(coachMoment.spanIndex)} className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-accent underline-offset-2 hover:underline">
              <ChatCircleText size={14} weight="bold" aria-hidden />
              See {coachMoment.label.toLowerCase()}
            </button>
          ) : null}
          <div className="text-[13px] text-fg">{review.coaching.action}</div>
        </Surface>
      ) : null}

      {/* ----- Owner: share to playbook ----- */}
      {viewer.role === "owner" && isGoodExample(review) ? (
        <Surface padding="md" className="flex items-center gap-3">
          <BookmarkSimple size={18} weight={shared ? "fill" : "regular"} aria-hidden className={shared ? "text-accent" : "text-fg-subtle"} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-fg">Good example</div>
            <div className="text-[12px] text-fg-muted">Booked, objection resolved</div>
          </div>
          {shared ? (
            <span className="chip text-fg">
              <Check size={12} weight="bold" aria-hidden />
              Marked for review
            </span>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setShared(true)}>
              Share to playbook
            </Button>
          )}
        </Surface>
      ) : null}

      {/* ----- Extracted sheet: every field, dispute any one ----- */}
      <Sheet open={extractedOpen} onClose={() => setExtractedOpen(false)} title="Extracted" description="Every field cites a span. Dispute any one; the transcript still decides the rest.">
        <ul className="flex flex-col divide-y divide-line">
          {review.fields.map((f) => {
            const asserted = f.spanIndexes.length > 0;
            const isDisputed = disputed.has(f.id);
            return (
              <li key={f.id} className="flex flex-col gap-1.5 py-3" data-testid="extracted-field">
                <div className="flex items-center justify-between gap-2">
                  <span className="section-label">{f.label}</span>
                  {isDisputed ? (
                    <span className="tag border-[color:var(--perf-attention-line)] text-perf-attention">
                      <WarningCircle size={10} weight="bold" aria-hidden />
                      Disputed
                    </span>
                  ) : asserted ? (
                    <span className="tag border-dashed text-accent">
                      <Sparkle size={10} weight="bold" aria-hidden />
                      From transcript
                    </span>
                  ) : (
                    <span className="tag border-dashed text-fg-subtle">Not asserted</span>
                  )}
                </div>
                <p className={cn("text-[14px] leading-snug", asserted ? "text-fg" : "text-fg-muted")}>{f.value}</p>
                {asserted ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {f.spanIndexes.slice(0, 4).map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setExtractedOpen(false);
                          jumpTo(i);
                        }}
                        className="tag tabular text-fg-muted hover:bg-hover hover:text-fg"
                        aria-label={`Go to span at ${clock(transcript[i]?.startMs ?? 0)}`}
                      >
                        {clock(transcript[i]?.startMs ?? 0)}
                      </button>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => toggleDispute(f.id)} className="ml-auto" aria-pressed={isDisputed}>
                      {isDisputed ? "Withdraw" : "Dispute"}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!review.validation.ok ? (
          <div className="mt-3 rounded-md border border-[color:var(--perf-issue-line)] p-3 text-[13px] text-perf-issue">
            Extraction rejected: {review.validation.errors.join("; ")}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

function MomentChip({ moment, active, onClick }: { moment: Moment; active: boolean; onClick: () => void }) {
  const Icon = MOMENT_ICON[moment.kind];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid="moment"
      className={cn("chip transition-colors motion-reduce:transition-none", active ? "border-accent bg-accent-soft text-fg" : "text-fg-muted hover:bg-hover hover:text-fg")}
    >
      <Icon size={12} weight="bold" aria-hidden />
      {moment.label}
    </button>
  );
}
