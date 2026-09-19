"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useReducedMotion } from "motion/react";
import type { IconProps } from "@phosphor-icons/react";
import {
  ArrowLeft,
  ArrowRight,
  BookmarkSimple,
  CalendarCheck,
  Check,
  ChatCircleText,
  ClockCounterClockwise,
  Flag,
  Handshake,
  Lightbulb,
  ListBullets,
  Quotes,
  ShieldCheck,
  Sparkle,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import type { FieldCorrection, TranscriptSpan } from "@/domain/callIntelligence";
import { ConfidenceDot, ReadBlock } from "@/components/workspace/BriefSheet";
import { DetailsRow } from "@/components/ui/DetailsRow";
import { Sheet } from "@/components/ui/Sheet";
import { Surface } from "@/components/ui/Surface";
import { NOW } from "@/fixtures/obavia";
import { cn } from "@/lib/cn";
import {
  angleFor,
  ASSESSMENT_KICKER,
  assessmentFor,
  CALIBRATION_LINE,
  coachingMoment,
  correctionEventFor,
  describePolicy,
  flagField,
  FLAG_WORD,
  FLAGGED_WORD,
  formatClock as clock,
  formatDuration,
  historyFor,
  isGoodExample,
  KEEPS_ORIGINAL_LINE,
  NEVER_LINE,
  NO_SUPPORT_WORD,
  openFieldIds,
  policyWithCorrections,
  spanRefStartMs,
  stageBandLine,
  STAGE_MEANING,
  SUPPORT_WORD,
  withdrawFlag,
  WITHDRAW_WORD,
  type Moment,
  type MomentKind,
  type Review,
  type StageView,
  type Viewer,
} from "@/lib/review";
import { formatDateTimeIn, TENANT_TZ } from "@/lib/workspace-setter";
import { BAND_ICON, BAND_TEXT, StageStrip } from "./StageStrip";
import { ReferenceCards } from "./ReferenceCards";
import { Transcript } from "./Transcript";

const MOMENT_ICON: Record<MomentKind, ComponentType<IconProps>> = {
  commitment: Handshake,
  stakeholder: Users,
  objection: WarningCircle,
  next_step: CalendarCheck,
  outcome: ChatCircleText,
  reference: Quotes,
};

function toggled(s: Set<string>, id: string): Set<string> {
  const next = new Set(s);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * One call. The default view states the current assessment in words, names the next step, and
 * offers the supporting conversation; the slim four-stage bar stays, because a stage is a
 * legitimate thing to show as a stage. No ring and no bare percentage here: a percentage with no
 * stated meaning, horizon, or track record reads as more certainty than the evidence carries
 * (D: "A stage is a stage, a prediction is a prediction, a payment is a payment"). The numbers,
 * what each one is a probability of, the band that moved the stage, the cited spans, and an
 * honest line about calibration are all one tap in, inside Details. The transcript still decides;
 * the rep can flag an issue, and flagging keeps the original reading and its citations.
 */
export function ReviewCall({ review, viewer, span }: { review: Review; viewer: Viewer; span?: number }) {
  const reduce = useReducedMotion();
  /** Append-only: a withdrawal adds an entry, it never removes the flag that came before. */
  const [corrections, setCorrections] = useState<FieldCorrection[]>(() => []);
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const [rejected, setRejected] = useState<Set<string>>(() => new Set());
  /** One span after a jump, or every span an observation cites. */
  const [active, setActive] = useState<number | number[] | undefined>(undefined);
  const [activeStage, setActiveStage] = useState<string | undefined>(undefined);
  const [inspected, setInspected] = useState<number | undefined>(undefined);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [coachingOpen, setCoachingOpen] = useState(false);
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const spanRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  const { call, contact, transcript, stages } = review;
  const flagged = useMemo(() => openFieldIds(corrections), [corrections]);
  const policy = useMemo(() => policyWithCorrections(review, corrections), [review, corrections]);
  const changes = useMemo(() => describePolicy(policy), [policy]);
  const angle = useMemo(() => angleFor(review, rejected), [review, rejected]);
  const assessment = useMemo(() => assessmentFor(review), [review]);
  const disputeEvent = useMemo(() => (corrections.length > 0 ? correctionEventFor(review, corrections, viewer.userId, NOW) : undefined), [review, corrections, viewer.userId]);
  const moments = review.moments.filter((m) => m.kind !== "outcome");
  const coachMoment = review.coaching ? coachingMoment(review) : undefined;
  const anyFlagged = flagged.size > 0;

  const jumpTo = useCallback(
    (i: number) => {
      setActive(i);
      setInspected(undefined);
      const el = spanRefs.current.get(i);
      el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    },
    [reduce],
  );

  /** Highlight every given span index, then scroll to the first. */
  const showSpans = useCallback(
    (idx: number[]) => {
      if (idx.length === 0) return;
      setInspected(undefined);
      setActive(idx);
      window.setTimeout(() => spanRefs.current.get(idx[0])?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }), reduce ? 0 : 120);
    },
    [reduce],
  );

  /** A link from another surface (a cited word on the brief) lands on its own passage. */
  useEffect(() => {
    if (span === undefined) return;
    const i = transcript.findIndex((t) => t.startMs === span);
    if (i < 0) return;
    const t = window.setTimeout(() => jumpTo(i), 60);
    return () => window.clearTimeout(t);
  }, [span, transcript, jumpTo]);

  /** From inside any sheet: close it, then go. */
  const jumpFromSheet = (i: number) => {
    setDetailsOpen(false);
    setCoachingOpen(false);
    window.setTimeout(() => jumpTo(i), reduce ? 0 : 120);
  };

  const spansFromSheet = (idx: number[]) => {
    setDetailsOpen(false);
    window.setTimeout(() => showSpans(idx), reduce ? 0 : 120);
  };

  /** Every span a vocabulary chip cites. */
  const selectSpans = (spans: TranscriptSpan[]) => {
    const idx = spans.map((sp) => transcript.findIndex((t) => t.startMs === sp.startMs && t.endMs === sp.endMs)).filter((i) => i >= 0);
    spansFromSheet(idx);
  };

  const jumpToStage = (s: StageView) => {
    setActiveStage(s.key);
    if (s.spanIndexes.length > 0) showSpans(s.spanIndexes);
  };

  const flag = (fieldId: string) => {
    setCorrections((h) => (openFieldIds(h).has(fieldId) ? withdrawFlag(review, h, fieldId, viewer.userId, NOW) : flagField(review, h, fieldId, viewer.userId, NOW)));
  };

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4">
      {/* ----- Header: who, then when ----- */}
      <div className="flex flex-col gap-1.5">
        <Button variant="ghost" size="sm" href="/review" leading={<ArrowLeft size={14} weight="bold" />} className="-ml-3 self-start">
          Calls
        </Button>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[15px] font-semibold text-fg">{contact.displayName}</span>
          {contact.organizationName ? <span className="truncate text-[13px] text-fg-muted">{contact.organizationName}</span> : null}
        </div>
        <div className="tabular text-[12px] text-fg-subtle">{call.startedAt ? formatDateTimeIn(call.startedAt, TENANT_TZ) : "Unknown time"}</div>
      </div>

      {/* ----- The assessment, in words. No ring, no percentage. ----- */}
      <Surface padding="md" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-fg-subtle" data-testid="assessment-kicker">
            {ASSESSMENT_KICKER}
          </span>
          <div className="text-[30px] font-semibold leading-tight tracking-tight text-fg" data-testid="assessment">
            {assessment.headline}
          </div>
          <div className="flex items-start gap-1.5 text-[14px] leading-snug text-fg-muted" data-testid="next-step">
            <ArrowRight size={14} weight="bold" aria-hidden className="mt-[3px] shrink-0 text-fg-subtle" />
            <span>Next step: {assessment.nextStep}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            {assessment.spanIndexes.length > 0 ? (
              <button
                type="button"
                onClick={() => showSpans(assessment.spanIndexes)}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent underline-offset-2 hover:underline"
                data-testid="view-support"
              >
                <ChatCircleText size={14} weight="bold" aria-hidden />
                {SUPPORT_WORD}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-subtle" data-testid="no-support">
                <WarningCircle size={14} weight="bold" aria-hidden />
                {NO_SUPPORT_WORD}
              </span>
            )}
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium underline-offset-2 hover:underline", anyFlagged ? "text-perf-attention" : "text-fg-subtle")}
              data-testid="flag-issue"
            >
              <Flag size={14} weight="bold" aria-hidden />
              {anyFlagged ? `${FLAGGED_WORD} ${flagged.size}` : FLAG_WORD}
            </button>
          </div>
        </div>
        <StageStrip stages={stages} active={activeStage} onSelect={jumpToStage} />
      </Surface>

      {/* ----- One quiet row ----- */}
      <div className="flex items-center">
        <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(true)} leading={<ListBullets size={14} weight="bold" />} className="-ml-3" data-testid="details-open">
          Details
        </Button>
      </div>

      {/* ----- Transcript, with at most one Angle ----- */}
      <Transcript
        transcript={transcript}
        contactName={contact.displayName}
        citations={review.citations}
        active={active}
        inspected={inspected}
        angle={angle}
        onInspect={(i) => {
          setInspected((cur) => (cur === i ? undefined : i));
          setActive(i);
        }}
        registerRef={(i, el) => {
          if (el) spanRefs.current.set(i, el);
          else spanRefs.current.delete(i);
        }}
      />

      {/* ----- One list: what changed, coaching, the playbook. Each opens its own sheet. ----- */}
      <Surface padding="none">
        <div className="divide-y divide-line">
          <DetailsRow
            label="Changes"
            value={
              <span className={cn("inline-flex items-center gap-1 font-medium", anyFlagged ? "text-perf-attention" : "text-perf-strong")} data-testid="policy-tag">
                {anyFlagged ? <WarningCircle size={12} weight="bold" aria-hidden /> : <Check size={12} weight="bold" aria-hidden />}
                {anyFlagged ? "Held" : "Applied"}
              </span>
            }
            data-testid="changes-open"
            onClick={() => setChangesOpen(true)}
          />
          {review.coaching ? <DetailsRow label="Coaching" data-testid="coaching-open" onClick={() => setCoachingOpen(true)} /> : null}
          {viewer.role === "owner" && isGoodExample(review) ? (
            <DetailsRow
              label="Good example"
              value={shared ? "Marked" : "Share"}
              leading={<BookmarkSimple size={16} weight={shared ? "fill" : "regular"} aria-hidden className={shared ? "text-accent" : "text-fg-subtle"} />}
              data-testid="playbook-open"
              onClick={() => setPlaybookOpen(true)}
            />
          ) : null}
        </div>
      </Surface>

      {/* ----- Sheet: what this changes ----- */}
      <Sheet open={changesOpen} onClose={() => setChangesOpen(false)} title="What this changes" description={anyFlagged ? "Held for review" : "Applied"}>
        <div className="flex flex-col gap-3" aria-label="What this changes">
          <ul className="flex flex-col gap-1.5">
            {changes.map((c) => (
              <li key={c.text} className="flex items-center gap-2 text-[14px] text-fg" data-testid="change" data-applied={c.applied}>
                {c.applied ? <Check size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" /> : <Sparkle size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />}
                <span>{c.text}</span>
                {c.applied ? null : <span className="ml-auto text-[11px] text-fg-subtle">Leaning, not applied</span>}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 text-[12px] text-fg-subtle">
            <ShieldCheck size={13} weight="bold" aria-hidden className="shrink-0" />
            {NEVER_LINE}
          </div>
          {disputeEvent ? (
            <div className="flex items-start gap-2 text-[12px] leading-snug text-fg-muted" data-testid="dispute-event">
              <ClockCounterClockwise size={13} weight="bold" aria-hidden className="mt-0.5 shrink-0" />
              <span>
                {flagged.size === 1 ? "One field is held" : `${flagged.size} fields are held`} for review. The original extraction and the words it cited are kept; the correction was recorded as its own event.
              </span>
            </div>
          ) : null}
          <dl className="tabular mt-2 flex flex-col gap-1 border-t border-line pt-3 text-[12px] text-fg-subtle">
            <div className="flex justify-between gap-3">
              <dt>Length</dt>
              <dd className="text-fg">{formatDuration(call.durationSeconds)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Rep</dt>
              <dd className="text-fg">{review.rep.displayName}</dd>
            </div>
          </dl>
        </div>
      </Sheet>

      {/* ----- Sheet: coaching ----- */}
      {review.coaching ? (
        <Sheet open={coachingOpen} onClose={() => setCoachingOpen(false)} title="Coaching">
          <div className="flex flex-col gap-1.5" aria-label="Coaching">
            <div className="text-[15px] font-semibold text-fg">{review.coaching.title}</div>
            <div className="text-[13px] text-fg-muted">{review.coaching.action}</div>
            {coachMoment ? (
              <button type="button" onClick={() => jumpFromSheet(coachMoment.spanIndex)} className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-accent underline-offset-2 hover:underline">
                <ChatCircleText size={14} weight="bold" aria-hidden />
                See {coachMoment.label.toLowerCase()}
              </button>
            ) : null}
          </div>
        </Sheet>
      ) : null}

      {/* ----- Sheet: owner shares to the playbook ----- */}
      {viewer.role === "owner" && isGoodExample(review) ? (
        <Sheet open={playbookOpen} onClose={() => setPlaybookOpen(false)} title="Good example" description="Booked, objection resolved">
          <div className="flex flex-col gap-3">
            {shared ? (
              <span className="inline-flex items-center gap-1 text-[13px] font-medium text-fg">
                <Check size={12} weight="bold" aria-hidden />
                Marked for review
              </span>
            ) : (
              <Button onClick={() => setShared(true)} className="w-full" leading={<BookmarkSimple size={16} weight="bold" />}>
                Share to playbook
              </Button>
            )}
          </div>
        </Sheet>
      ) : null}

      {/* ----- Details: the numbers and what they measure, the moments, their words, every field ----- */}
      <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Details" description="The numbers and what they mean">
        <div className="flex flex-col gap-6">
          {/* ----- The numbers return here, each with the sentence that says what it is a probability of. ----- */}
          <section className="flex flex-col gap-2" aria-label="The numbers behind the assessment" data-testid="numbers">
            <span className="section-label">What the numbers are</span>
            <ul className="flex flex-col divide-y divide-line">
              {stages.map((s) => {
                const Icon = BAND_ICON[s.band];
                return (
                  <li key={s.key} className="flex flex-col gap-1.5 py-3" data-testid="stage-number" data-stage={s.key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[14px] font-semibold text-fg">{s.label}</span>
                      <span className="tabular text-[20px] font-semibold leading-none text-fg" data-testid="stage-percent">
                        {s.percent}%
                      </span>
                    </div>
                    <p className="text-[13px] leading-snug text-fg-muted">{STAGE_MEANING[s.key]}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                      <span className={cn("inline-flex items-center gap-1 font-medium", BAND_TEXT[s.band])} data-testid="stage-band-word">
                        <Icon size={12} weight="bold" aria-hidden />
                        {s.bandLabel}
                      </span>
                      <span className="text-fg-subtle">{stageBandLine(s)}</span>
                    </div>
                    {s.spanIndexes.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {s.spanIndexes.slice(0, 4).map((i) => (
                            <button key={i} type="button" onClick={() => jumpFromSheet(i)} className="tag tabular text-fg-muted hover:bg-hover hover:text-fg" aria-label={`Go to the words behind ${s.label.toLowerCase()} at ${clock(transcript[i]?.startMs ?? 0)}`}>
                              {clock(transcript[i]?.startMs ?? 0)}
                            </button>
                          ))}
                        </div>
                        <button type="button" onClick={() => spansFromSheet(s.spanIndexes)} className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-accent underline-offset-2 hover:underline">
                          <ChatCircleText size={14} weight="bold" aria-hidden />
                          {SUPPORT_WORD}
                        </button>
                      </div>
                    ) : (
                      <span className="text-[12px] text-fg-subtle">Nothing cited</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex items-start gap-2 text-[12px] leading-snug text-perf-attention" data-testid="calibration">
              <WarningCircle size={13} weight="bold" aria-hidden className="mt-0.5 shrink-0" />
              <span>{CALIBRATION_LINE}</span>
            </div>
          </section>

          <section className="flex flex-col gap-2" aria-label="Moments">
            <span className="section-label">Moments</span>
            {moments.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {moments.map((m) => (
                  <MomentChip key={`${m.kind}:${m.spanIndex}`} moment={m} active={Array.isArray(active) ? active.includes(m.spanIndex) : active === m.spanIndex} onClick={() => jumpFromSheet(m.spanIndex)} />
                ))}
              </div>
            ) : (
              <span className="text-[13px] text-fg-subtle">No moments extracted</span>
            )}
          </section>

          <section className="flex flex-col gap-2" aria-label="Their words">
            <span className="section-label">Their words</span>
            <ReferenceCards
              references={review.references}
              transcript={transcript}
              onSelectSpans={selectSpans}
              pinned={pinned}
              rejected={rejected}
              onJump={jumpFromSheet}
              onPin={(id) => setPinned((s) => toggled(s, id))}
              onReject={(id) => setRejected((s) => toggled(s, id))}
            />
          </section>

          {review.feedback.length > 0 ? (
            <section className="flex flex-col gap-2" aria-label="Feedback">
              <span className="section-label">Feedback</span>
              <ul className="flex flex-col gap-3">
                {review.feedback.map((f, i) => (
                  <li key={`${f.angle}:${i}`} className="flex flex-col gap-1" data-testid="feedback-card">
                    <div className="flex items-start gap-2">
                      <Lightbulb size={16} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-accent" />
                      <span className="text-[14px] font-semibold leading-snug text-fg">{f.angle}</span>
                    </div>
                    <p className="pl-6 text-[13px] leading-snug text-fg-muted">{f.hint}</p>
                    {f.spanIndex !== undefined ? (
                      <button type="button" onClick={() => jumpFromSheet(f.spanIndex!)} className="ml-6 inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-accent underline-offset-2 hover:underline">
                        <ChatCircleText size={14} weight="bold" aria-hidden />
                        See moment, {clock(transcript[f.spanIndex]?.startMs ?? 0)}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ----- Buyer mode: the approach, nine rows, and the read with what its percentage measures. ----- */}
          <section className="flex flex-col gap-2" aria-label="Buyer mode" data-testid="review-buyer-mode">
            {review.buyerMode.approach.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="section-label">Approach</span>
                <ul className="flex flex-col gap-1" data-testid="review-approach">
                  {review.buyerMode.approach.map((line) => (
                    <li key={line} className="flex items-start gap-2 text-[13.5px] leading-snug text-fg">
                      <Sparkle size={13} weight="bold" aria-hidden className="mt-[3px] shrink-0 text-fg-subtle" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ReadBlock read={review.buyerMode.read} />
            <span className="section-label">Buyer mode</span>
            <ul className="flex flex-col">
              {review.buyerMode.rows.map((r) => {
                const target = r.spanIndexes[0];
                const inner = (
                  <>
                    <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", r.known ? "text-fg" : "text-fg-subtle")}>{r.label}</span>
                    <span className={cn("text-[13.5px]", r.known ? "font-semibold text-fg" : "text-fg-subtle")}>{r.value}</span>
                    <ConfidenceDot confident={r.confident} className={r.known ? undefined : "opacity-40"} />
                  </>
                );
                return (
                  <li key={r.dimension} data-testid="buyer-mode-row" data-known={r.known}>
                    {target !== undefined ? (
                      <button type="button" onClick={() => jumpFromSheet(target)} className="-mx-1 flex h-9 w-full items-center gap-2 rounded-md px-1 text-left hover:bg-hover" aria-label={`${r.label}, ${r.value}, go to ${clock(transcript[target]?.startMs ?? 0)}`}>
                        {inner}
                      </button>
                    ) : (
                      <div className="flex h-9 items-center gap-2">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-1" aria-label="Extracted">
            <span className="section-label">Extracted</span>
            <p className="text-[12px] leading-snug text-fg-subtle" data-testid="keeps-original">
              {KEEPS_ORIGINAL_LINE}
            </p>
            <ul className="flex flex-col divide-y divide-line">
              {review.fields.map((f) => {
                const asserted = f.spanIndexes.length > 0;
                const isFlagged = flagged.has(f.id);
                const entries = historyFor(corrections, f.id);
                return (
                  <li key={f.id} className="flex flex-col gap-1.5 py-3" data-testid="extracted-field">
                    <div className="flex items-center justify-between gap-2">
                      <span className="section-label">{f.label}</span>
                      <span className={cn("inline-flex items-center gap-1 text-[11px]", isFlagged ? "font-medium text-perf-attention" : asserted ? "text-accent" : "text-fg-subtle")}>
                        {isFlagged ? <Flag size={10} weight="bold" aria-hidden /> : asserted ? <Sparkle size={10} weight="bold" aria-hidden /> : null}
                        {isFlagged ? FLAGGED_WORD : asserted ? "From transcript" : "Not asserted"}
                      </span>
                    </div>
                    <p className={cn("text-[14px] leading-snug", asserted ? "text-fg" : "text-fg-muted")}>{f.value}</p>
                    {asserted ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {f.spanIndexes.slice(0, 4).map((i) => (
                          <button key={i} type="button" onClick={() => jumpFromSheet(i)} className="tag tabular text-fg-muted hover:bg-hover hover:text-fg" aria-label={`Go to span at ${clock(transcript[i]?.startMs ?? 0)}`}>
                            {clock(transcript[i]?.startMs ?? 0)}
                          </button>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => flag(f.id)} className="ml-auto" aria-pressed={isFlagged}>
                          {isFlagged ? WITHDRAW_WORD : FLAG_WORD}
                        </Button>
                      </div>
                    ) : null}
                    {entries.length > 0 ? (
                      <ol className="flex flex-col gap-1 border-l border-line pl-2.5" data-testid="correction-history" aria-label={`Correction history for ${f.label}`}>
                        {entries.map((c, i) => (
                          <li key={`${c.fieldId}:${i}`} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-fg-subtle" data-testid="correction-entry" data-kind={c.kind}>
                            {c.kind === "flagged" ? <Flag size={11} weight="bold" aria-hidden className="mt-0.5 shrink-0" /> : <ClockCounterClockwise size={11} weight="bold" aria-hidden className="mt-0.5 shrink-0" />}
                            <span>
                              {c.kind === "flagged" ? "Flagged" : "Flag withdrawn"}. Original kept: &ldquo;{c.originalValue}&rdquo;
                              {c.originalEvidenceRefs.length > 0 ? `, cited at ${c.originalEvidenceRefs.map((ref) => clock(spanRefStartMs(ref) ?? 0)).join(", ")}` : ", nothing cited"}.
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {!review.validation.ok ? <div className="mt-3 text-[13px] text-perf-issue">Extraction rejected: {review.validation.errors.join("; ")}</div> : null}
          </section>
        </div>
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
