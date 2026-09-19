"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { IconProps } from "@phosphor-icons/react";
import {
  ArrowCounterClockwise,
  Bug,
  CalendarCheck,
  ChatText,
  Check,
  Clock,
  EnvelopeSimple,
  Lock,
  Phone,
  PhoneDisconnect,
  Prohibit,
  Sparkle,
  UserSound,
} from "@phosphor-icons/react";
import type { CallInterpretedOutcome, Contact, ConsentState, User } from "@/domain/types";
import { obaviaDataset, NOW, SETTERS, CLOSERS } from "@/fixtures/obavia";
import { PageHeader } from "@/components/shell/PageHeader";
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
  OUTCOME_LABEL,
  primaryLabel,
  priorRelationship,
  PROVIDER_FALLBACK,
  simulatedOutcome,
  sourceLabel,
  TENANT_TZ,
  todayStrip,
  type QueueAction,
  type SetterQueueItem,
} from "@/lib/workspace-setter";
import { computeGame } from "@/lib/workspace-game";
import { BookingSheet, type Booking } from "./BookingSheet";
import { HandoffSheet } from "./HandoffSheet";
import { GameStrip } from "./GameStrip";
import { NextUp, initials } from "./NextUp";
import { Segmented } from "./Segmented";
import { SetterMe } from "./SetterMe";
import { UserSwitcher } from "./UserSwitcher";

type Phase = "idle" | "reserving" | "ringing" | "connected" | "summary" | "logging" | "next" | "dq" | "done" | "provider_failed";
type Segment = "now" | "queue" | "me";

interface CallState {
  phase: Phase;
  proposed?: CallInterpretedOutcome;
  outcome?: CallInterpretedOutcome;
  seconds: number;
  dqReason?: string;
  result?: string;
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
const setters: User[] = dataset.users.filter((u) => SETTERS.includes(u.userId));
const closers: User[] = dataset.users.filter((u) => CLOSERS.includes(u.userId));

function ConsentChip({ channel, state, icon: Icon }: { channel: string; state: ConsentState; icon: ComponentType<IconProps> }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[12px] font-medium",
        state === "granted" ? "border-line-strong text-fg" : state === "revoked" ? "border-[color:var(--perf-issue-line)] text-perf-issue" : "border-dashed border-line-strong text-fg-subtle",
      )}
      aria-label={`${channel} ${state}`}
    >
      <Icon size={12} weight="bold" aria-hidden />
      {channel}
      {state !== "granted" ? <span className="text-[10.5px]">{state}</span> : null}
    </span>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function SetterWorkspace() {
  const reduce = useReducedMotion();
  const [userId, setUserId] = useState(SETTERS[0]);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [call, setCall] = useState<CallState>(IDLE);
  const [providerDown, setProviderDown] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
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

  const selectUser = (id: string) => {
    clearTimers();
    setUserId(id);
    setActiveId(undefined);
    setCall(IDLE);
    setExpanded(false);
  };

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

  const endCall = () => {
    if (!active) return;
    clearTimers();
    const proposed = simulatedOutcome(active.opportunity.opportunityId, active.priorAttempts);
    setCall((c) => ({ ...c, phase: "summary", proposed, outcome: proposed }));
  };

  const confirmOutcome = () => setCall((c) => (c.outcome ? { ...c, phase: "next", changing: false } : c));

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
      case "logging":
        return { label: "Confirm", onClick: confirmOutcome, disabled: !call.outcome, icon: Check };
      case "provider_failed":
        return { label: "Log result", onClick: () => setCall((c) => ({ ...c, phase: "logging", outcome: undefined })), icon: Check };
      case "next":
        return call.outcome === "meaningful_interaction"
          ? { label: "Book", onClick: () => setBookingOpen(true), icon: CalendarCheck }
          : { label: "Approved reattempt", onClick: () => finish(`Reattempt ${active.priorAttempts + 2} approved`), icon: ArrowCounterClockwise };
      case "dq":
        return { label: "Submit DQ", onClick: () => finish(`DQ: ${DQ_REASONS.find((r) => r.code === call.dqReason)?.label ?? ""}`), disabled: !call.dqReason, icon: Prohibit };
      case "done":
        return { label: "Next", onClick: advance, icon: Check };
    }
  })();
  const DockIcon = dock.icon;

  const inFlow = call.phase !== "idle";
  const nextUp = queue.filter((q) => q.id !== active?.id).slice(0, 3);

  return (
    <>
      <PageHeader
        title="Setter"
        actions={
          <>
            <UserSwitcher users={setters} value={userId} onChange={selectUser} />
            <div className="relative">
              <Button variant="ghost" size="sm" aria-label="Debug" aria-expanded={debugOpen} onClick={() => setDebugOpen((v) => !v)} className="w-8 px-0">
                <Bug size={15} aria-hidden />
              </Button>
              {debugOpen ? (
                <Surface tier="overlay" padding="sm" className="absolute right-0 top-9 z-40 w-56 shadow-md">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg">
                    <input type="checkbox" checked={providerDown} onChange={(e) => setProviderDown(e.target.checked)} className="accent-[var(--accent)]" />
                    Provider unavailable
                  </label>
                </Surface>
              ) : null}
            </div>
          </>
        }
      />

      <div className="mx-auto flex max-w-[640px] flex-col gap-4">
        {/* ----- Hero ----- */}
        <Surface padding="lg" className="flex flex-col">
          <div className="min-h-[168px]">
            <AnimatePresence mode="wait" initial={false}>
              {active ? (
                <motion.div
                  key={`${active.id}:${inFlow ? "flow" : "idle"}`}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                  {!inFlow ? <HeroIdle item={active} expanded={expanded} onToggle={() => setExpanded((v) => !v)} /> : <HeroFlow item={active} call={call} setCall={setCall} booking={currentBooking} onHandoff={() => setHandoffOpen(true)} onBook={() => setBookingOpen(true)} handoff={handoffs[active.opportunity.opportunityId]} />}
                </motion.div>
              ) : (
                <motion.div key="empty" initial={false} className="flex h-[168px] flex-col items-center justify-center gap-2 text-center">
                  <Check size={28} aria-hidden className="text-perf-strong" />
                  <span className="text-[15px] font-medium text-fg">Queue clear</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="mt-5 h-14">
            <Button size="md" onClick={dock.onClick} disabled={dock.disabled} leading={<DockIcon size={20} weight="bold" />} className="h-14 w-full rounded-md text-[17px]" data-testid="dock">
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
            { id: "me", label: "Me" },
          ]}
          value={segment}
          onChange={setSegment}
        />

        {segment === "now" ? (
          <div className="flex flex-col gap-3">
            <Surface padding="md" className="flex items-center justify-around">
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

        {segment === "me" ? <SetterMe dataset={dataset} userId={userId} now={NOW} /> : null}
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
                className="w-full"
                disabled={!replyText.trim()}
                onClick={() => {
                  setReplyOpen(false);
                  setReplyText("");
                  finish(`Reply sent, ${replyChannel(active.contact)}`);
                }}
                leading={<ChatText size={15} weight="bold" />}
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
      <span className="tabular text-[22px] font-semibold leading-none text-fg">{formatCount(value)}</span>
      <span className="mt-1 text-[11px] text-fg-subtle">{label}</span>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="h-8 w-px bg-line" />;
}

function StoppedList({ items }: { items: ReturnType<typeof buildSetterQueue>["stopped"] }) {
  if (items.length === 0) return null;
  return (
    <Surface padding="none" as="section" aria-label="Stopped">
      <div className="flex items-center gap-1.5 px-4 pt-3 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
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
        <div className="truncate text-[12px] text-fg-subtle">
          {contact.organizationName ? `${contact.organizationName}, ` : ""}
          {sourceLabel(submission?.source)}
          {submission ? `, ${formatRelativeTime(submission.receivedAt, NOW)}` : ""}
        </div>
        <h2 className="mt-0.5 text-[26px] font-semibold leading-tight tracking-tight text-fg">{contact.displayName}</h2>
      </div>
      {submission ? (
        <button type="button" onClick={onToggle} aria-expanded={expanded} className={cn("text-left text-[15px] italic leading-snug text-fg-muted", expanded ? "" : "line-clamp-1")}>
          &ldquo;{submission.requestText}&rdquo;
        </button>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <ConsentChip channel="Phone" state={contact.consent.phone} icon={Phone} />
        <ConsentChip channel="SMS" state={contact.consent.sms} icon={ChatText} />
        {contact.preferredLanguage && contact.preferredLanguage !== "en" ? <span className="inline-flex h-7 items-center rounded-full border border-line-strong px-2 text-[12px] font-medium text-fg">{languageLabel(contact.preferredLanguage)}</span> : null}
        {prior ? <span className="inline-flex h-7 items-center rounded-full border border-dashed border-line-strong px-2 text-[12px] text-fg-muted">{prior}</span> : null}
      </div>
      <div className="flex items-center gap-1.5 text-[12.5px] text-fg-muted">
        <Clock size={12} aria-hidden className="shrink-0 text-fg-subtle" />
        <span className="truncate">{item.reason}</span>
      </div>
    </div>
  );
}

function ProviderLine({ text, live }: { text: string; live?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[15px] font-medium text-fg">
      <span className={cn("inline-block h-2 w-2 rounded-full", live ? "bg-perf-strong" : "bg-fg-subtle")} aria-hidden />
      {text}
      <span className="ml-auto inline-flex h-5 items-center rounded-[4px] border border-line-strong px-1.5 text-[10.5px] font-medium text-fg-subtle">Provider</span>
    </div>
  );
}

function HeroFlow({
  item,
  call,
  setCall,
  booking,
  onHandoff,
  onBook,
  handoff,
}: {
  item: SetterQueueItem;
  call: CallState;
  setCall: (fn: (c: CallState) => CallState) => void;
  booking?: Booking;
  onHandoff: () => void;
  onBook: () => void;
  handoff?: "send" | "clarify";
}) {
  const { contact } = item;
  const head = (
    <div className="flex items-center gap-2">
      <span className="inline-grid h-8 w-8 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-fg">{initials(contact.displayName)}</span>
      <span className="truncate text-[15px] font-medium text-fg">{contact.displayName}</span>
      {call.phase === "connected" ? (
        <span className="tabular ml-auto text-[15px] font-medium text-fg">
          {pad(Math.floor(call.seconds / 60))}:{pad(call.seconds % 60)}
        </span>
      ) : null}
    </div>
  );

  const outcomes: CallInterpretedOutcome[] = ["meaningful_interaction", "voicemail", "no_answer", "wrong_contact"];

  return (
    <div className="flex flex-col gap-4">
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
        <div className="rounded-md border border-dashed border-line-strong p-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-accent">
              <Sparkle size={11} weight="bold" aria-hidden />
              {call.phase === "summary" ? "AI proposed" : "No AI evidence"}
            </span>
            {call.phase === "summary" && !call.changing ? (
              <button type="button" onClick={() => setCall((c) => ({ ...c, changing: true }))} className="text-[12px] font-medium text-fg-muted underline-offset-2 hover:underline">
                Change
              </button>
            ) : null}
          </div>
          {call.phase === "summary" && !call.changing ? (
            <div className="mt-1.5 text-[17px] font-semibold text-fg">{OUTCOME_LABEL[call.outcome ?? "unknown"]}</div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Outcome">
              {outcomes.map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={call.outcome === o}
                  onClick={() => setCall((c) => ({ ...c, outcome: o }))}
                  className={cn("h-9 rounded-sm border px-2 text-[13px] font-medium transition-colors motion-reduce:transition-none", call.outcome === o ? "border-accent bg-accent-soft text-fg" : "border-line-strong text-fg-muted hover:bg-hover")}
                >
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {call.phase === "next" ? (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] text-fg-subtle">{OUTCOME_LABEL[call.outcome ?? "unknown"]}, confirmed</div>
          <div className="grid grid-cols-2 gap-2">
            {call.outcome === "meaningful_interaction" ? (
              <Button variant="secondary" onClick={onBook} leading={<CalendarCheck size={15} weight="bold" />}>
                Book
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setCall((c) => ({ ...c, phase: "done", result: `Reattempt ${item.priorAttempts + 2} approved` }))} leading={<ArrowCounterClockwise size={15} weight="bold" />}>
                Reattempt
              </Button>
            )}
            <Button variant="secondary" onClick={() => setCall((c) => ({ ...c, phase: "done", result: `Callback ${formatTimeIn(new Date(Date.parse(NOW) + 3 * 3_600_000).toISOString(), TENANT_TZ)}` }))} leading={<Clock size={15} weight="bold" />}>
              Callback
            </Button>
            <Button variant="secondary" onClick={() => setCall((c) => ({ ...c, phase: "dq" }))} leading={<Prohibit size={15} weight="bold" />} className="col-span-2">
              Review DQ
            </Button>
          </div>
        </div>
      ) : null}

      {call.phase === "dq" ? (
        <div role="radiogroup" aria-label="DQ reason" className="flex flex-col gap-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Reason code</div>
          {DQ_REASONS.map((r) => (
            <button
              key={r.code}
              type="button"
              role="radio"
              aria-checked={call.dqReason === r.code}
              onClick={() => setCall((c) => ({ ...c, dqReason: r.code }))}
              className={cn("flex h-10 items-center justify-between rounded-sm border px-3 text-left text-[13px] font-medium transition-colors motion-reduce:transition-none", call.dqReason === r.code ? "border-accent bg-accent-soft text-fg" : "border-line-strong text-fg-muted hover:bg-hover")}
            >
              {r.label}
              <span className="tabular text-[11px] text-fg-subtle">{r.code}</span>
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
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="inline-flex h-6 items-center gap-1 rounded-sm border border-line-strong px-2 text-fg">
                <Check size={11} weight="bold" aria-hidden className="text-perf-strong" />
                Invitation sent
              </span>
              <span className="inline-flex h-6 items-center gap-1 rounded-sm border border-dashed border-line-strong px-2 text-fg-muted">Customer confirmed: not yet</span>
              {booking.supersedesInstanceId ? <span className="tabular inline-flex h-6 items-center rounded-sm border border-line px-2 text-fg-subtle">supersedes {booking.supersedesInstanceId}</span> : null}
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
