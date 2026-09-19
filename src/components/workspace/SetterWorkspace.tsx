"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  CalendarCheck,
  ChatText,
  Check,
  Clock,
  Info,
  Lock,
  MagnifyingGlass,
  Phone,
  PhoneDisconnect,
  Prohibit,
  Question,
  UserSound,
} from "@phosphor-icons/react";
import type { NextStepValue } from "@/domain/callIntelligence";
import type { CallInterpretedOutcome, Contact, ConsentState, User } from "@/domain/types";
import { obaviaDataset, NOW, CLOSERS } from "@/fixtures/obavia";
import { Button } from "@/components/ui/Button";
import { DetailsRow } from "@/components/ui/DetailsRow";
import { Sheet } from "@/components/ui/Sheet";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import { formatCount, formatRelativeTime } from "@/lib/format";
import {
  buildHandoffBrief,
  buildSetterQueue,
  DQ_REASONS,
  formatTimeIn,
  languageLabel,
  nextStepFor,
  OUTCOME_LABEL,
  primaryLabel,
  priorRelationship,
  PROVIDER_FALLBACK,
  simulatedPostCall,
  simulatedStages,
  sourceLabel,
  TENANT_TZ,
  todayStrip,
  type SetterQueueItem,
} from "@/lib/workspace-setter";
import { computeGame } from "@/lib/workspace-game";
import { useTenantData } from "@/lib/onboarding";
import { SetterEmptyToday } from "@/components/onboarding/SetterEmptyToday";
import { NEXT_STEP_WORD, OUTCOME_WORD, latestReviewableCallId, reviewHref, type StageView } from "@/lib/review";
import { StageStrip } from "@/components/review/StageStrip";
import { buildTodayFocus } from "@/components/home/today-focus";
import { TodayFocus } from "@/components/home/TodayFocus";
import { BookingSheet, type Booking } from "./BookingSheet";
import { Fields, type Field } from "./Fields";
import { GateLine } from "./GateLine";
import { HandoffSheet } from "./HandoffSheet";
import { initials } from "./NextUp";
import { Segmented } from "./Segmented";

type Phase = "idle" | "reserving" | "ringing" | "connected" | "summary" | "logging" | "dq" | "done" | "provider_failed";
type Segment = "now" | "queue";

interface CallState {
  phase: Phase;
  proposed?: CallInterpretedOutcome;
  outcome?: CallInterpretedOutcome;
  /** The next step the extraction chose. The dock is already set to it. */
  nextStep?: NextStepValue;
  stages?: StageView[];
  seconds: number;
  dqReason?: string;
  result?: string;
}

const IDLE: CallState = { phase: "idle", seconds: 0 };

/** The alternatives behind Wrong?: the outcome, then the next step. */
const OUTCOMES: CallInterpretedOutcome[] = ["meaningful_interaction", "voicemail", "no_answer", "wrong_contact"];
const NEXT_STEPS: NextStepValue[] = ["book", "callback", "dq_review"];

const dataset = obaviaDataset;
const closers: User[] = dataset.users.filter((u) => CLOSERS.includes(u.userId));

const CONSENT_WORD: Record<ConsentState, string> = { granted: "OK", unknown: "unknown", revoked: "revoked" };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today for a setter. Renders for the signed-in person. */
export function SetterWorkspace({ userId }: { userId: string }) {
  const reduce = useReducedMotion();
  const tenantData = useTenantData();
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [call, setCall] = useState<CallState>(IDLE);
  const providerDown = false;
  const [segment, setSegment] = useState<Segment>("now");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [wrongOpen, setWrongOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);
  const [stoppedOpen, setStoppedOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [bookings, setBookings] = useState<Record<string, Booking[]>>({});
  const [handoffs, setHandoffs] = useState<Record<string, "send" | "clarify">>({});
  // Calls placed in this session, with the outcome the transcript decided, so today's
  // verified progress moves as the day is worked. A correction updates its own entry.
  const [callLog, setCallLog] = useState<{ id: string; outcome?: CallInterpretedOutcome }[]>([]);
  const [reviewedCallId, setReviewedCallId] = useState<string | undefined>(undefined);
  const timers = useRef<number[]>([]);

  const { queue: allQueue, stopped } = useMemo(() => buildSetterQueue(dataset, userId, NOW), [userId]);
  const queue = useMemo(() => allQueue.filter((q) => !completed.has(q.id)), [allQueue, completed]);
  const active: SetterQueueItem | undefined = queue.find((q) => q.id === activeId) ?? queue[0];
  const today = useMemo(() => todayStrip(dataset, userId, NOW), [userId]);
  const game = useMemo(() => computeGame(dataset, userId, NOW), [userId]);

  // Today connects to improvement: verified progress during the day, the next improvement
  // with its cited moment once a call has been reviewed. The rule lives in today-focus.ts.
  const sessionBookings = useMemo(() => Object.values(bookings).reduce((n, list) => n + list.length, 0), [bookings]);
  const focus = useMemo(
    () =>
      buildTodayFocus(dataset, userId, "setter", NOW, {
        reviewedCallId,
        session: {
          calls: callLog.length,
          conversations: callLog.filter((c) => c.outcome === "meaningful_interaction").length,
          bookings: sessionBookings,
        },
      }),
    [userId, reviewedCallId, callLog, sessionBookings],
  );

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const later = useCallback(
    (ms: number, fn: () => void) => {
      const t = window.setTimeout(fn, reduce ? 40 : ms);
      timers.current.push(t);
    },
    [reduce],
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (call.phase !== "connected") return;
    const t = window.setInterval(() => setCall((c) => ({ ...c, seconds: c.seconds + 1 })), 1000);
    return () => window.clearInterval(t);
  }, [call.phase]);

  const selectItem = (id: string) => {
    if (call.phase !== "idle" && call.phase !== "done") return; // never swap the hero under a live call
    clearTimers();
    setActiveId(id);
    setCall(IDLE);
  };

  const advance = () => {
    if (!active) return;
    clearTimers();
    const next = queue.find((q) => q.id !== active.id);
    setCompleted((s) => new Set(s).add(active.id));
    setActiveId(next?.id);
    setCall(IDLE);
  };

  const startCall = () => {
    if (!active) return;
    setCallLog((log) => [...log, { id: `${active.id}:${log.length}` }]);
    setCall({ ...IDLE, phase: "reserving" });
    later(700, () => {
      if (providerDown) {
        setCall((c) => ({ ...c, phase: "provider_failed" }));
        return;
      }
      setCall((c) => ({ ...c, phase: "ringing" }));
      later(1600, () => setCall((c) => (c.phase === "ringing" ? { ...c, phase: "connected", seconds: 0 } : c)));
    });
  };

  // The transcript decides: the simulated extraction applies itself and picks the next step.
  const endCall = () => {
    if (!active) return;
    clearTimers();
    const sim = simulatedPostCall(active.opportunity.opportunityId, active.priorAttempts);
    setCall((c) => ({ ...c, phase: "summary", proposed: sim.outcome, outcome: sim.outcome, nextStep: sim.nextStep, stages: sim.stages }));
    logOutcome(sim.outcome);
    // The call has been read, so Today can lead with the improvement and the moment that shows it.
    const reviewable = latestReviewableCallId(active.opportunity.opportunityId);
    if (reviewable) setReviewedCallId(reviewable);
  };

  /** The outcome of the call in flight, on its own entry, so a correction never double counts. */
  const logOutcome = (outcome: CallInterpretedOutcome) => {
    setCallLog((log) => (log.length === 0 ? log : [...log.slice(0, -1), { ...log[log.length - 1], outcome }]));
  };

  /** A disputed or manually logged outcome recomputes the stages and the next step. */
  const setOutcome = (outcome: CallInterpretedOutcome) => {
    if (!active) return;
    const id = active.opportunity.opportunityId;
    setCall((c) => ({ ...c, outcome, nextStep: nextStepFor(outcome), stages: simulatedStages(outcome, id) }));
    logOutcome(outcome);
  };

  const logResult = () => setCall((c) => (c.outcome ? { ...c, phase: "summary" } : c));

  const callback = () => finish(`Callback ${formatTimeIn(new Date(Date.parse(NOW) + 3 * 3_600_000).toISOString(), TENANT_TZ)}`);

  const finish = (result: string) => setCall((c) => ({ ...c, phase: "done", result }));

  const activeBookings = active ? bookings[active.opportunity.opportunityId] ?? [] : [];
  const currentBooking = activeBookings[activeBookings.length - 1];

  const onBook = (b: Booking) => {
    if (!active) return;
    setBookings((m) => ({ ...m, [active.opportunity.opportunityId]: [...(m[active.opportunity.opportunityId] ?? []), b] }));
    finish(`Booked ${b.appointmentId}`);
  };

  const brief = useMemo(
    () =>
      active
        ? buildHandoffBrief(
            dataset,
            active.opportunity,
            active.contact,
            active.submission,
            currentBooking ? [`Appointment ${currentBooking.appointmentId}, ${formatTimeIn(currentBooking.slot.startIso, TENANT_TZ)} ET`] : [],
          )
        : undefined,
    [active, currentBooking],
  );

  // ----- Dock (primary control). Same slot, same size, in every phase. -----
  const dock = (() => {
    if (!active) return { label: "No tasks", onClick: () => {}, disabled: true, icon: Check };
    const { action } = active;
    switch (call.phase) {
      case "idle":
        if (action === "call" || action === "follow_up") return { label: "Call", onClick: startCall, icon: Phone };
        if (action === "reply") return { label: "Reply", onClick: () => setReplyOpen(true), icon: ChatText };
        if (action === "confirm_appointment") return { label: "Confirm appointment", onClick: () => finish("Appointment confirmed"), icon: CalendarCheck };
        // Review opens something to inspect, so it carries an inspection mark. The prohibition
        // mark belongs on the action that actually disqualifies, below.
        if (action === "review_dq") return { label: "Review", onClick: () => setCall((c) => ({ ...c, phase: "dq" })), icon: MagnifyingGlass };
        return { label: primaryLabel(action), onClick: () => finish("Done"), icon: Check };
      case "reserving":
        return { label: "Reserving", onClick: () => {}, disabled: true, icon: Clock };
      case "ringing":
      case "connected":
        return { label: "End call", onClick: endCall, icon: PhoneDisconnect };
      case "summary":
        // Already set to the next step the extraction chose.
        switch (call.nextStep) {
          case "book":
            return { label: "Book", onClick: () => setBookingOpen(true), icon: CalendarCheck };
          case "dq_review":
            return { label: "Review DQ", onClick: () => setCall((c) => ({ ...c, phase: "dq" })), icon: MagnifyingGlass };
          case "callback":
            return { label: "Callback", onClick: callback, icon: Clock };
          default:
            return { label: "Next", onClick: advance, icon: Check };
        }
      case "logging":
        return { label: "Log result", onClick: logResult, disabled: !call.outcome, icon: Check };
      case "provider_failed":
        return { label: "Log result", onClick: () => setCall((c) => ({ ...c, phase: "logging", outcome: undefined, stages: undefined, nextStep: undefined })), icon: Check };
      case "dq":
        return { label: "Submit DQ", onClick: () => finish(`DQ: ${DQ_REASONS.find((r) => r.code === call.dqReason)?.label ?? ""}`), disabled: !call.dqReason, icon: Prohibit };
      case "done":
        return { label: "Next", onClick: advance, icon: Check };
    }
  })();
  const DockIcon = dock.icon;

  const inFlow = call.phase !== "idle";
  const nextUp = queue.filter((q) => q.id !== active?.id).slice(0, 3);

  // A business created through onboarding has its own rows (zero on day one), not the fixture's.
  if (!tenantData.demo) return <SetterEmptyToday data={tenantData} userId={userId} />;

  return (
    <>
      {/*
        Phone: one column, in this order. Desktop: the same elements, no second design.
        The two wrappers are display:contents until lg, so the phone layout is untouched;
        at lg they become the call column and a standing rail, and the order classes keep
        each element where the phone put it.
      */}
      <div className="mx-auto flex max-w-[640px] flex-col gap-4 lg:grid lg:max-w-[1180px] lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
        {/* ----- Hero: a name, one muted line, one action. Everything else is behind Details. ----- */}
        <Surface padding="md" className="order-1 flex flex-col">
          <div className="min-h-[72px]">
            <AnimatePresence mode="wait" initial={false}>
              {active ? (
                <motion.div
                  key={`${active.id}:${inFlow ? "flow" : "idle"}`}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                  {!inFlow ? <HeroIdle item={active} onDetails={() => setDetailsOpen(true)} /> : <HeroFlow item={active} call={call} setCall={setCall} setOutcome={setOutcome} booking={currentBooking} onHandoff={() => setHandoffOpen(true)} onBook={() => setBookingOpen(true)} handoff={handoffs[active.opportunity.opportunityId]} />}
                </motion.div>
              ) : (
                <motion.div key="empty" initial={false} className="flex h-[72px] flex-col items-center justify-center gap-2 text-center">
                  <Check size={28} aria-hidden className="text-perf-strong" />
                  <span className="text-[15px] font-medium text-fg">Queue clear</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="mt-4 h-12">
            <Button size="lg" onClick={dock.onClick} disabled={dock.disabled} leading={<DockIcon size={20} weight="bold" />} className="h-12 w-full rounded-md text-[17px]" data-testid="dock">
              {dock.label}
            </Button>
          </div>
          {active && call.phase === "summary" ? (
            <div className="mt-2 flex items-center justify-center gap-2 text-[12px] font-medium text-fg-subtle">
              <Button variant="ghost" size="sm" href={reviewHref(active.opportunity.opportunityId)} className="h-6 px-1.5 text-[12px] text-fg-subtle">
                Review
              </Button>
              <span aria-hidden>·</span>
              <button type="button" onClick={() => setWrongOpen(true)} className="inline-flex h-6 items-center gap-1 px-1.5 underline-offset-2 hover:underline" data-testid="wrong">
                <Question size={12} weight="bold" aria-hidden />
                Wrong?
              </button>
            </div>
          ) : null}
        </Surface>

        <div className="order-2 empty:hidden">
          <GateLine game={game} />
        </div>

        {/* Today connects to improvement: verified progress, or the next improvement with its moment.
            One waiting line per screen: when an XP track already names what it waits on above, the
            held coaching note stays in the coach's own list rather than repeating the wait here. */}
        <TodayFocus focus={game.player.gate.holds.length > 0 ? { ...focus, held: undefined } : focus} className="order-6" />
        </div>

        <div className="contents lg:sticky lg:top-[72px] lg:flex lg:flex-col lg:gap-4">
        {/* The facts behind Details, standing beside the call on a desktop so opening
            anything else never costs the rep the person they are talking to. */}
        {active ? (
          <Surface padding="md" as="section" className="order-3 hidden lg:flex lg:flex-col lg:gap-1" aria-label="Who this is">
            <span className="section-label">Who this is</span>
            <span className="text-[15px] font-medium leading-tight text-fg">{active.contact.displayName}</span>
            <Fields items={heroFields(active)} />
          </Surface>
        ) : null}

        <Segmented<Segment>
          className="order-4"
          items={[
            { id: "now", label: "Now" },
            { id: "queue", label: `Queue ${queue.length}` },
          ]}
          value={segment}
          onChange={setSegment}
        />

        {segment === "now" ? (
          <Surface padding="none" as="section" aria-label="Next up" className="order-5">
            <ul className="divide-y divide-line">
              {nextUp.map((q) => (
                <li key={q.id}>
                  <QueueRow item={q} onClick={() => selectItem(q.id)} />
                </li>
              ))}
              <li>
                <DetailsRow label="Today" value={`${formatCount(today.dials)} dials`} onClick={() => setTodayOpen(true)} data-testid="today-row" />
              </li>
              {stopped.length > 0 ? (
                <li>
                  <DetailsRow label="Stopped" value={formatCount(stopped.length)} leading={<Lock size={16} weight="bold" aria-hidden className="text-fg-subtle" />} onClick={() => setStoppedOpen(true)} data-testid="stopped-row" />
                </li>
              ) : null}
            </ul>
          </Surface>
        ) : null}

        {segment === "queue" ? (
          <Surface padding="none" as="section" aria-label="Queue" className="order-5">
            <ul className="divide-y divide-line">
              {queue.map((q) => (
                <li key={q.id}>
                  <QueueRow item={q} active={q.id === active?.id} onClick={() => selectItem(q.id)} />
                </li>
              ))}
              {queue.length === 0 ? <li className="px-4 py-6 text-center text-[13px] text-fg-subtle">Queue clear</li> : null}
              {stopped.length > 0 ? (
                <li>
                  <DetailsRow label="Stopped" value={formatCount(stopped.length)} leading={<Lock size={16} weight="bold" aria-hidden className="text-fg-subtle" />} onClick={() => setStoppedOpen(true)} data-testid="stopped-row" />
                </li>
              ) : null}
            </ul>
          </Surface>
        ) : null}
        </div>
      </div>

      <Sheet open={todayOpen} onClose={() => setTodayOpen(false)} title="Today" description="Your day so far">
        <Fields
          items={[
            { label: "Dials", value: formatCount(today.dials) },
            { label: "Two-way", value: formatCount(today.twoWay) },
            { label: "Booked", value: formatCount(today.bookings) },
          ]}
        />
      </Sheet>

      <Sheet open={stoppedOpen} onClose={() => setStoppedOpen(false)} title="Stopped" description="Opted out, never contacted">
        <StoppedList items={stopped} />
      </Sheet>

      {active ? (
        <>
          <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Details" description={active.contact.displayName}>
            <Fields items={heroFields(active)} />
          </Sheet>
          <BookingSheet
            key={active.opportunity.opportunityId}
            open={bookingOpen}
            onClose={() => setBookingOpen(false)}
            dataset={dataset}
            now={NOW}
            contact={active.contact}
            closers={closers}
            initialPurpose={active.submission?.requestText ?? ""}
            bookings={activeBookings}
            onBook={onBook}
          />
          {brief ? (
            <HandoffSheet
              key={`h_${active.opportunity.opportunityId}`}
              open={handoffOpen}
              onClose={() => setHandoffOpen(false)}
              brief={brief}
              contactName={active.contact.displayName}
              closerName={closers.find((c) => c.userId === (currentBooking?.slot.repUserId ?? active.opportunity.currentOwner.closer))?.displayName}
              onSend={(kind) => setHandoffs((m) => ({ ...m, [active.opportunity.opportunityId]: kind }))}
            />
          ) : null}
          <Sheet
            open={replyOpen}
            onClose={() => setReplyOpen(false)}
            title="Reply"
            description={active.contact.displayName}
            footer={
              <Button
                size="lg"
                className="w-full"
                disabled={!replyText.trim()}
                onClick={() => {
                  setReplyOpen(false);
                  setReplyText("");
                  finish(`Reply sent, ${replyChannel(active.contact)}`);
                }}
                leading={<ChatText size={16} weight="bold" />}
              >
                Send, {replyChannel(active.contact)}
              </Button>
            }
          >
            <p className="mb-3 text-[13px] italic leading-snug text-fg-muted">&ldquo;{active.submission?.requestText}&rdquo;</p>
            <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={5} placeholder="Your reply" className="w-full resize-none rounded-sm border border-line-strong bg-raised px-3 py-2 text-[14px] leading-snug text-fg outline-none focus-visible:border-accent" />
          </Sheet>
          <Sheet open={wrongOpen} onClose={() => setWrongOpen(false)} title="Wrong?" description={active.contact.displayName}>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Outcome">
                <span className="section-label">Outcome</span>
                {OUTCOMES.map((o) => (
                  <RadioRow key={o} checked={call.outcome === o} onClick={() => setOutcome(o)} label={OUTCOME_LABEL[o]} />
                ))}
              </div>
              <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Next step">
                <span className="section-label">Next step</span>
                {NEXT_STEPS.map((n) => (
                  <RadioRow key={n} checked={call.nextStep === n} onClick={() => setCall((c) => ({ ...c, nextStep: n }))} label={NEXT_STEP_WORD[n]} />
                ))}
              </div>
            </div>
          </Sheet>
        </>
      ) : null}
    </>
  );
}

/** Everything the old hero showed, as one list behind the Details tap. */
function heroFields(item: SetterQueueItem): Field[] {
  const { contact, submission, opportunity } = item;
  const prior = priorRelationship(dataset, opportunity);
  const fields: Field[] = [];
  if (item.reason) fields.push({ label: "Why now", value: item.reason });
  if (submission) fields.push({ label: "Request", value: <span className="italic text-fg-muted">&ldquo;{submission.requestText}&rdquo;</span> });
  if (contact.organizationName) fields.push({ label: "Organization", value: contact.organizationName });
  fields.push({ label: "Source", value: sourceLabel(submission?.source) });
  if (submission) fields.push({ label: "Received", value: formatRelativeTime(submission.receivedAt, NOW) });
  fields.push({ label: "Phone consent", value: CONSENT_WORD[contact.consent.phone] });
  fields.push({ label: "SMS consent", value: CONSENT_WORD[contact.consent.sms] });
  fields.push({ label: "Email consent", value: CONSENT_WORD[contact.consent.email] });
  if (contact.preferredLanguage && contact.preferredLanguage !== "en") fields.push({ label: "Language", value: languageLabel(contact.preferredLanguage) });
  if (prior) fields.push({ label: "History", value: prior });
  return fields;
}

function replyChannel(contact: Contact): string {
  if (contact.consent.sms === "granted") return "SMS";
  if (contact.consent.email === "granted") return "email";
  return "phone";
}

/** One queue row: avatar, name, one muted line, one right-aligned value. Nothing else. */
function QueueRow({ item, active, onClick }: { item: SetterQueueItem; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "true" : undefined} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover motion-reduce:transition-none", active && "bg-accent-soft")}>
      <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-[12px] font-semibold text-fg">{initials(item.contact.displayName)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-fg">{item.contact.displayName}</span>
        <span className="block truncate text-[12px] text-fg-muted">{item.short}</span>
      </span>
      <span className="tabular shrink-0 text-[13px] text-fg-subtle">{item.when}</span>
    </button>
  );
}

function RadioRow({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn("h-11 rounded-sm border px-3 text-left text-[14px] font-medium transition-colors motion-reduce:transition-none", checked ? "border-accent bg-accent-soft text-fg" : "border-line-strong text-fg-muted hover:bg-hover")}
    >
      {label}
    </button>
  );
}

function StoppedList({ items }: { items: ReturnType<typeof buildSetterQueue>["stopped"] }) {
  if (items.length === 0) return <p className="text-[13px] text-fg-subtle">Nobody stopped</p>;
  return (
    <section aria-label="Stopped">
      <ul className="divide-y divide-line">
        {items.map((s) => (
          <li key={s.opportunity.opportunityId} className="flex items-center gap-3 py-3">
            <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-fg-subtle">
              <Lock size={14} weight="bold" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-fg-muted">{s.contact.displayName}</span>
              <span className="block text-[12px] text-fg-subtle">Opted out, all channels</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HeroIdle({ item, onDetails }: { item: SetterQueueItem; onDetails: () => void }) {
  const { contact } = item;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-fg">{contact.displayName}</h2>
        <div className="mt-1 line-clamp-2 text-[14px] leading-snug text-fg-muted">{item.reason || contact.organizationName || sourceLabel(item.submission?.source)}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={onDetails} leading={<Info size={14} weight="bold" />} className="-mr-2 -mt-1 shrink-0">
        Details
      </Button>
    </div>
  );
}

function ProviderLine({ text, live }: { text: string; live?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[13px] font-medium text-fg-muted">
      <span className={cn("inline-block h-2 w-2 rounded-full", live ? "bg-perf-strong" : "bg-fg-subtle")} aria-hidden />
      <span className="text-fg">{text}</span>
      <span className="tag ml-auto text-fg-subtle">Provider</span>
    </div>
  );
}

function HeroFlow({
  item,
  call,
  setCall,
  setOutcome,
  booking,
  onHandoff,
  onBook,
  handoff,
}: {
  item: SetterQueueItem;
  call: CallState;
  setCall: (fn: (c: CallState) => CallState) => void;
  setOutcome: (o: CallInterpretedOutcome) => void;
  booking?: Booking;
  onHandoff: () => void;
  onBook: () => void;
  handoff?: "send" | "clarify";
}) {
  const { contact } = item;
  const head = (
    <div className="flex items-center gap-2">
      <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-fg">{initials(contact.displayName)}</span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-fg">{contact.displayName}</span>
      {call.phase === "connected" ? (
        <span className="shrink-0 text-[15px] font-medium text-fg">
          {pad(Math.floor(call.seconds / 60))}:{pad(call.seconds % 60)}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {head}
      {call.phase === "reserving" ? <ProviderLine text="Reserving" /> : null}
      {call.phase === "ringing" ? <ProviderLine text="Ringing" /> : null}
      {call.phase === "connected" ? <ProviderLine text="Connected" live /> : null}

      {call.phase === "provider_failed" ? (
        <div className="rounded-md border border-[color:var(--perf-attention-line)] p-3">
          <ProviderLine text={PROVIDER_FALLBACK.title} />
          <ol className="mt-2 flex flex-col gap-1 text-[13px] text-fg-muted">
            {PROVIDER_FALLBACK.steps.map((s, i) => (
              <li key={s} className="flex gap-2">
                <span className="tabular text-fg-subtle">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <div className="mt-2 text-[12px] font-medium text-fg">{PROVIDER_FALLBACK.line}</div>
        </div>
      ) : null}

      {/* Post-call: one word, one bar, and the dock already set to the next step. */}
      {call.phase === "summary" ? (
        <div className="flex flex-col gap-3" data-testid="postcall">
          <div className="text-[24px] font-semibold leading-none tracking-tight text-fg" data-testid="postcall-outcome">
            {OUTCOME_WORD[call.outcome ?? "unknown"]}
          </div>
          {call.stages ? <StageStrip stages={call.stages} /> : null}
        </div>
      ) : null}

      {call.phase === "logging" ? (
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Outcome" data-testid="postcall">
          <span className="section-label">Outcome, no AI evidence</span>
          {OUTCOMES.map((o) => (
            <RadioRow key={o} checked={call.outcome === o} onClick={() => setOutcome(o)} label={OUTCOME_LABEL[o]} />
          ))}
        </div>
      ) : null}

      {call.phase === "dq" ? (
        <div role="radiogroup" aria-label="DQ reason" className="flex flex-col gap-1.5">
          <div className="section-label">Reason</div>
          {DQ_REASONS.map((r) => (
            <button
              key={r.code}
              type="button"
              role="radio"
              aria-checked={call.dqReason === r.code}
              onClick={() => setCall((c) => ({ ...c, dqReason: r.code }))}
              className={cn("flex h-11 items-center rounded-sm border px-3 text-left text-[14px] font-medium transition-colors motion-reduce:transition-none", call.dqReason === r.code ? "border-accent bg-accent-soft text-fg" : "border-line-strong text-fg-muted hover:bg-hover")}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Done: one outcome line, one muted state line, the next action. */}
      {call.phase === "done" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[17px] font-semibold text-fg">
            <Check size={18} weight="bold" aria-hidden className="text-perf-strong" />
            {call.result}
          </div>
          {booking ? (
            <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
              <Clock size={14} aria-hidden className="shrink-0 text-fg-subtle" />
              <span>Invitation sent</span>
              <span aria-hidden>·</span>
              <span>Customer confirmed: not yet</span>
            </div>
          ) : null}
          {call.result?.startsWith("DQ") ? <div className="text-[13px] text-fg-muted">Stays in the assigned denominator</div> : null}
          {booking || call.outcome === "meaningful_interaction" ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onHandoff} leading={<UserSound size={14} weight="bold" />}>
                {handoff === "send" ? "Handoff sent" : handoff === "clarify" ? "Clarification requested" : "Handoff brief"}
              </Button>
              {booking ? (
                <Button variant="ghost" size="sm" onClick={onBook}>
                  Reschedule
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
