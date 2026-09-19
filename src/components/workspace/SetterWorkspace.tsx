"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { IconProps } from "@phosphor-icons/react";
import {
  ArrowCounterClockwise,
  CalendarCheck,
  ChatText,
  Check,
  Clock,
  EnvelopeSimple,
  Lock,
  Phone,
  PhoneDisconnect,
  Prohibit,
  Question,
  Sparkle,
  UserSound,
} from "@phosphor-icons/react";
import type { NextStepValue } from "@/domain/callIntelligence";
import type { CallInterpretedOutcome, Contact, ConsentState, User } from "@/domain/types";
import { obaviaDataset, NOW, CLOSERS } from "@/fixtures/obavia";
import { Button } from "@/components/ui/Button";
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
  type QueueAction,
  type SetterQueueItem,
} from "@/lib/workspace-setter";
import { computeGame } from "@/lib/workspace-game";
import { useTenantData } from "@/lib/onboarding";
import { SetterEmptyToday } from "@/components/onboarding/SetterEmptyToday";
import { NEXT_STEP_WORD, reviewHref, type StageView } from "@/lib/review";
import { StageStrip } from "@/components/review/StageStrip";
import { BookingSheet, type Booking } from "./BookingSheet";
import { HandoffSheet } from "./HandoffSheet";
import { GameStrip } from "./GameStrip";
import { NextUp, initials } from "./NextUp";
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
  /** "Wrong?" was tapped: the outcome radios are open. */
  changing: boolean;
}

const IDLE: CallState = { phase: "idle", seconds: 0, changing: false };

const ACTION_ICON: Record<QueueAction, ComponentType<IconProps>> = {
  call: Phone,
  reply: ChatText,
  confirm_appointment: CalendarCheck,
  review_dq: Prohibit,
  follow_up: ArrowCounterClockwise,
  send_proposal: EnvelopeSimple,
  collect_payment: EnvelopeSimple,
  handoff_delivery: EnvelopeSimple,
};

const dataset = obaviaDataset;
const closers: User[] = dataset.users.filter((u) => CLOSERS.includes(u.userId));

function ConsentChip({ channel, state, icon: Icon }: { channel: string; state: ConsentState; icon: ComponentType<IconProps> }) {
  return (
    <span
      className={cn("chip", state === "granted" ? "text-fg" : state === "revoked" ? "border-[color:var(--perf-issue-line)] text-perf-issue" : "border-dashed text-fg-subtle")}
      aria-label={`${channel} ${state}`}
    >
      <Icon size={12} weight="bold" aria-hidden />
      {state === "granted" ? channel : `${channel} ${state}`}
    </span>
  );
}

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
  const [expanded, setExpanded] = useState(false);
  const [segment, setSegment] = useState<Segment>("now");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [bookings, setBookings] = useState<Record<string, Booking[]>>({});
  const [handoffs, setHandoffs] = useState<Record<string, "send" | "clarify">>({});
  const timers = useRef<number[]>([]);

  const { queue: allQueue, stopped } = useMemo(() => buildSetterQueue(dataset, userId, NOW), [userId]);
  const queue = useMemo(() => allQueue.filter((q) => !completed.has(q.id)), [allQueue, completed]);
  const active: SetterQueueItem | undefined = queue.find((q) => q.id === activeId) ?? queue[0];
  const today = useMemo(() => todayStrip(dataset, userId, NOW), [userId]);
  const game = useMemo(() => computeGame(dataset, userId, NOW), [userId]);

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
    setExpanded(false);
  };

  const advance = () => {
    if (!active) return;
    clearTimers();
    const next = queue.find((q) => q.id !== active.id);
    setCompleted((s) => new Set(s).add(active.id));
    setActiveId(next?.id);
    setCall(IDLE);
    setExpanded(false);
  };

  const startCall = () => {
    if (!active) return;
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
    setCall((c) => ({ ...c, phase: "summary", proposed: sim.outcome, outcome: sim.outcome, nextStep: sim.nextStep, stages: sim.stages, changing: false }));
  };

  /** A disputed or manually logged outcome recomputes the stages and the next step. */
  const setOutcome = (outcome: CallInterpretedOutcome) => {
    if (!active) return;
    const id = active.opportunity.opportunityId;
    setCall((c) => ({ ...c, outcome, nextStep: nextStepFor(outcome), stages: simulatedStages(outcome, id) }));
  };

  const logResult = () => setCall((c) => (c.outcome ? { ...c, phase: "summary", changing: false } : c));

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
        if (action === "review_dq") return { label: "Review", onClick: () => setCall((c) => ({ ...c, phase: "dq" })), icon: Prohibit };
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
            return { label: "Review DQ", onClick: () => setCall((c) => ({ ...c, phase: "dq" })), icon: Prohibit };
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
      <div className="mx-auto flex max-w-[640px] flex-col gap-4">
        {/* ----- Hero ----- */}
        <Surface padding="md" className="flex flex-col">
          <div className="min-h-[148px]">
            <AnimatePresence mode="wait" initial={false}>
              {active ? (
                <motion.div
                  key={`${active.id}:${inFlow ? "flow" : "idle"}`}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                  {!inFlow ? <HeroIdle item={active} expanded={expanded} onToggle={() => setExpanded((v) => !v)} /> : <HeroFlow item={active} call={call} setCall={setCall} setOutcome={setOutcome} onCallback={callback} booking={currentBooking} onHandoff={() => setHandoffOpen(true)} onBook={() => setBookingOpen(true)} handoff={handoffs[active.opportunity.opportunityId]} />}
                </motion.div>
              ) : (
                <motion.div key="empty" initial={false} className="flex h-[148px] flex-col items-center justify-center gap-2 text-center">
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
        </Surface>

        <NextUp
          items={nextUp.map((q) => ({ id: q.id, name: q.contact.displayName, icon: ACTION_ICON[q.action], hint: q.when }))}
          onSelect={selectItem}
        />

        <GameStrip game={game} />

        <Segmented<Segment>
          items={[
            { id: "now", label: "Now" },
            { id: "queue", label: `Queue ${queue.length}` },
          ]}
          value={segment}
          onChange={setSegment}
        />

        {segment === "now" ? (
          <div className="flex flex-col gap-3">
            <Surface padding="sm" className="flex items-center justify-around">
              <Stat value={today.dials} label="Dials" />
              <Divider />
              <Stat value={today.twoWay} label="Two-way" />
              <Divider />
              <Stat value={today.bookings} label="Booked" />
            </Surface>
            <StoppedList items={stopped} />
          </div>
        ) : null}

        {segment === "queue" ? (
          <div className="flex flex-col gap-3">
            <Surface padding="none" as="section" aria-label="Queue">
              <ul className="divide-y divide-line">
                {queue.map((q) => {
                  const Icon = ACTION_ICON[q.action];
                  const isActive = q.id === active?.id;
                  return (
                    <li key={q.id}>
                      <button type="button" onClick={() => selectItem(q.id)} aria-current={isActive ? "true" : undefined} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover motion-reduce:transition-none", isActive && "bg-accent-soft")}>
                        <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-[12px] font-semibold text-fg">{initials(q.contact.displayName)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-[14px] font-medium text-fg">
                            <Icon size={13} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
                            <span className="truncate">{q.contact.displayName}</span>
                          </span>
                          <span className="block truncate text-[12px] text-fg-muted">{q.reason}</span>
                        </span>
                        <span className="tabular shrink-0 text-[12px] text-fg-subtle">{q.when}</span>
                      </button>
                    </li>
                  );
                })}
                {queue.length === 0 ? <li className="px-4 py-6 text-center text-[13px] text-fg-subtle">Queue clear</li> : null}
              </ul>
            </Surface>
            <StoppedList items={stopped} />
          </div>
        ) : null}
      </div>

      {active ? (
        <>
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
        </>
      ) : null}
    </>
  );
}

function replyChannel(contact: Contact): string {
  if (contact.consent.sms === "granted") return "SMS";
  if (contact.consent.email === "granted") return "email";
  return "phone";
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[17px] font-semibold leading-none text-fg">{formatCount(value)}</span>
      <span className="mt-1 text-[11px] text-fg-subtle">{label}</span>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="h-7 w-px bg-line" />;
}

function StoppedList({ items }: { items: ReturnType<typeof buildSetterQueue>["stopped"] }) {
  if (items.length === 0) return null;
  return (
    <Surface padding="none" as="section" aria-label="Stopped">
      <div className="section-label flex items-center gap-1.5 px-4 pt-3">
        <Lock size={11} weight="bold" aria-hidden />
        Stopped
      </div>
      <ul className="divide-y divide-line">
        {items.map((s) => (
          <li key={s.opportunity.opportunityId} className="flex items-center gap-3 px-4 py-3">
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
    </Surface>
  );
}

function HeroIdle({ item, expanded, onToggle }: { item: SetterQueueItem; expanded: boolean; onToggle: () => void }) {
  const { contact, submission, opportunity } = item;
  const prior = priorRelationship(dataset, opportunity);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-fg">{contact.displayName}</h2>
        <div className="mt-0.5 truncate text-[12px] text-fg-subtle">
          {contact.organizationName ? `${contact.organizationName}, ` : ""}
          {sourceLabel(submission?.source)}
          {submission ? `, ${formatRelativeTime(submission.receivedAt, NOW)}` : ""}
        </div>
      </div>
      {submission ? (
        <button type="button" onClick={onToggle} aria-expanded={expanded} className={cn("text-left text-[14px] italic leading-snug text-fg-muted", expanded ? "" : "line-clamp-1")}>
          &ldquo;{submission.requestText}&rdquo;
        </button>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <ConsentChip channel="Phone" state={contact.consent.phone} icon={Phone} />
        <ConsentChip channel="SMS" state={contact.consent.sms} icon={ChatText} />
        {contact.preferredLanguage && contact.preferredLanguage !== "en" ? <span className="chip text-fg">{languageLabel(contact.preferredLanguage)}</span> : null}
        {prior ? <span className="chip border-dashed text-fg-muted">{prior}</span> : null}
      </div>
      <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
        <Clock size={14} aria-hidden className="shrink-0 text-fg-subtle" />
        <span className="truncate">{item.reason}</span>
      </div>
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
  onCallback,
  booking,
  onHandoff,
  onBook,
  handoff,
}: {
  item: SetterQueueItem;
  call: CallState;
  setCall: (fn: (c: CallState) => CallState) => void;
  setOutcome: (o: CallInterpretedOutcome) => void;
  onCallback: () => void;
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

  const outcomes: CallInterpretedOutcome[] = ["meaningful_interaction", "voicemail", "no_answer", "wrong_contact"];

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

      {call.phase === "summary" || call.phase === "logging" ? (
        <div className="rounded-md border border-dashed border-line-strong p-3" data-testid="postcall">
          <div className="flex items-center justify-between">
            <span className="section-label inline-flex items-center gap-1 text-accent">
              <Sparkle size={11} weight="bold" aria-hidden />
              {call.phase === "summary" ? "Transcript decided" : "No AI evidence"}
            </span>
            {call.phase === "summary" ? (
              <span className="flex items-center gap-1">
                <Button variant="ghost" size="sm" href={reviewHref(item.opportunity.opportunityId)} className="h-6 px-2 text-[12px]">
                  Review
                </Button>
                {!call.changing ? (
                  <button type="button" onClick={() => setCall((c) => ({ ...c, changing: true }))} className="inline-flex h-6 items-center gap-1 px-1 text-[12px] font-medium text-fg-muted underline-offset-2 hover:underline" data-testid="wrong">
                    <Question size={12} weight="bold" aria-hidden />
                    Wrong?
                  </button>
                ) : null}
              </span>
            ) : null}
          </div>
          {call.phase === "summary" && !call.changing ? (
            <div className="mt-1.5 text-[17px] font-semibold text-fg">{OUTCOME_LABEL[call.outcome ?? "unknown"]}</div>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-1.5" role="radiogroup" aria-label="Outcome">
              {outcomes.map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={call.outcome === o}
                  onClick={() => setOutcome(o)}
                  className={cn("h-11 rounded-sm border px-3 text-left text-[14px] font-medium transition-colors motion-reduce:transition-none", call.outcome === o ? "border-accent bg-accent-soft text-fg" : "border-line-strong text-fg-muted hover:bg-hover")}
                >
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
          )}
          {call.stages ? <StageStrip stages={call.stages} compact className="mt-2" /> : null}
          {call.phase === "summary" && call.nextStep && call.nextStep !== "none" ? (
            <div className="mt-2 flex items-center gap-2 text-[13px]">
              <span className="text-fg-muted">Next</span>
              <span className="font-medium text-fg" data-testid="next-step">{NEXT_STEP_WORD[call.nextStep]}</span>
              <span className="ml-auto flex items-center gap-1">
                {call.nextStep !== "callback" ? (
                  <Button variant="ghost" size="sm" onClick={onCallback} className="h-6 px-2 text-[12px]">
                    Callback
                  </Button>
                ) : null}
                {call.nextStep !== "dq_review" ? (
                  <Button variant="ghost" size="sm" onClick={() => setCall((c) => ({ ...c, phase: "dq" }))} className="h-6 px-2 text-[12px]">
                    DQ
                  </Button>
                ) : null}
              </span>
            </div>
          ) : null}
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

      {call.phase === "done" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[17px] font-semibold text-fg">
            <Check size={18} weight="bold" aria-hidden className="text-perf-strong" />
            {call.result}
          </div>
          {booking ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="chip text-fg">
                <Check size={12} weight="bold" aria-hidden className="text-perf-strong" />
                Invitation sent
              </span>
              <span className="chip border-dashed text-fg-muted">Customer confirmed: not yet</span>
              {booking.supersedesInstanceId ? <span className="chip border-line text-fg-subtle">supersedes {booking.supersedesInstanceId}</span> : null}
            </div>
          ) : null}
          {call.result?.startsWith("DQ") ? <div className="text-[12px] text-fg-subtle">Stays in the assigned denominator</div> : null}
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

      {call.phase === "ringing" || call.phase === "connected" || call.phase === "reserving" ? (
        <p className="line-clamp-2 text-[13px] italic leading-snug text-fg-muted">&ldquo;{item.submission?.requestText}&rdquo;</p>
      ) : null}
    </div>
  );
}
