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
  ListBullets,
  Quotes,
  ShieldCheck,
  Sparkle,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import type { TranscriptSpan } from "@/domain/callIntelligence";
import { ConfidenceDot, ReadBlock } from "@/components/workspace/BriefSheet";
import { DetailsRow } from "@/components/ui/DetailsRow";
import { Sheet } from "@/components/ui/Sheet";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import {
  angleFor,
  coachingMoment,
  describePolicy,
  formatClock as clock,
  formatDuration,
  heroCaption,
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
import { ReferenceCards } from "./ReferenceCards";
import { ProbabilityRing, StageStrip } from "./StageStrip";
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
 * One call. One hero word, one ring, one caption; the compact stage bar; the transcript
 * with at most one Angle; what changed; coaching. Everything else (moments, their words,
 * feedback, every extracted field) lives in the Details sheet. The transcript decides;
 * the rep can only dispute (Wrong?). Owner sees the same.
 */
export function ReviewCall({ review, viewer }: { review: Review; viewer: Viewer }) {
  const reduce = useReducedMotion();
  const [disputed, setDisputed] = useState<Set<string>>(() => new Set());
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const [rejected, setRejected] = useState<Set<string>>(() => new Set());
  /** One span after a jump, or every span a vocabulary chip cites. */
  const [active, setActive] = useState<number | number[] | undefined>(undefined);
  const [activeStage, setActiveStage] = useState<string | undefined>(undefined);
  const [inspected, setInspected] = useState<number | undefined>(undefined);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [coachingOpen, setCoachingOpen] = useState(false);
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const spanRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  const { call, contact, transcript, hero, stages } = review;
  const policy = useMemo(() => policyWithDisputes(review, disputed), [review, disputed]);
  const changes = useMemo(() => describePolicy(policy), [policy]);
  const angle = useMemo(() => angleFor(review, rejected), [review, rejected]);
  const moments = review.moments.filter((m) => m.kind !== "outcome");
  const coachMoment = review.coaching ? coachingMoment(review) : undefined;
  const anyDisputed = disputed.size > 0;

  const jumpTo = useCallback(
    (i: number) => {
      setActive(i);
      setInspected(undefined);
      const el = spanRefs.current.get(i);
      el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    },
    [reduce],
  );

  /** From inside any sheet: close it, then go. */
  const jumpFromSheet = (i: number) => {
    setDetailsOpen(false);
    setCoachingOpen(false);
    window.setTimeout(() => jumpTo(i), reduce ? 0 : 120);
  };

  /** Highlight every given span (a vocabulary chip), close the sheet, and scroll to the first. */
  const selectSpans = (spans: TranscriptSpan[]) => {
    const idx = spans.map((sp) => transcript.findIndex((t) => t.startMs === sp.startMs && t.endMs === sp.endMs)).filter((i) => i >= 0);
    if (idx.length === 0) return;
    setDetailsOpen(false);
    setInspected(undefined);
    setActive(idx);
    window.setTimeout(() => spanRefs.current.get(idx[0])?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }), reduce ? 0 : 120);
  };

  const jumpToStage = (s: StageView) => {
    setActiveStage(s.key);
    if (s.spanIndexes.length > 0) jumpTo(s.spanIndexes[0]);
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

      {/* ----- Hero: one word, one ring, one caption ----- */}
      <Surface padding="md" className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <ProbabilityRing percent={hero.percent} band={hero.band} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="truncate text-[36px] font-semibold leading-none tracking-tight text-fg" data-testid="hero-outcome">
              {hero.word}
            </div>
            <div className="tabular text-[12px] text-fg-muted" data-testid="hero-caption">
              {heroCaption(hero)}
            </div>
            <button type="button" onClick={() => setDetailsOpen(true)} className={cn("self-start text-[12px] font-medium underline-offset-2 hover:underline", anyDisputed ? "text-perf-attention" : "text-fg-subtle")} data-testid="wrong">
              {anyDisputed ? `Disputed ${disputed.size}` : "Wrong?"}
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
              <span className={cn("inline-flex items-center gap-1 font-medium", anyDisputed ? "text-perf-attention" : "text-perf-strong")} data-testid="policy-tag">
                {anyDisputed ? <WarningCircle size={12} weight="bold" aria-hidden /> : <Check size={12} weight="bold" aria-hidden />}
                {anyDisputed ? "Disputed" : "Applied"}
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
      <Sheet open={changesOpen} onClose={() => setChangesOpen(false)} title="What this changes" description={anyDisputed ? "Disputed" : "Applied"}>
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

      {/* ----- Details: moments, their words, feedback, every field ----- */}
      <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Details" description="Every field cites a span. Dispute any one; the transcript still decides the rest.">
        <div className="flex flex-col gap-6">
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

          {/* ----- Buyer mode: nine rows, the approach, the read. Labels, not sentences. ----- */}
          <section className="flex flex-col gap-2" aria-label="Buyer mode" data-testid="review-buyer-mode">
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
          </section>

          <section className="flex flex-col gap-1" aria-label="Extracted">
            <span className="section-label">Extracted</span>
            <ul className="flex flex-col divide-y divide-line">
              {review.fields.map((f) => {
                const asserted = f.spanIndexes.length > 0;
                const isDisputed = disputed.has(f.id);
                return (
                  <li key={f.id} className="flex flex-col gap-1.5 py-3" data-testid="extracted-field">
                    <div className="flex items-center justify-between gap-2">
                      <span className="section-label">{f.label}</span>
                      <span className={cn("inline-flex items-center gap-1 text-[11px]", isDisputed ? "font-medium text-perf-attention" : asserted ? "text-accent" : "text-fg-subtle")}>
                        {isDisputed ? <WarningCircle size={10} weight="bold" aria-hidden /> : asserted ? <Sparkle size={10} weight="bold" aria-hidden /> : null}
                        {isDisputed ? "Disputed" : asserted ? "From transcript" : "Not asserted"}
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
                        <Button variant="ghost" size="sm" onClick={() => setDisputed((s) => toggled(s, f.id))} className="ml-auto" aria-pressed={isDisputed}>
                          {isDisputed ? "Withdraw" : "Dispute"}
                        </Button>
                      </div>
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
