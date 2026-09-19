"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { IconProps } from "@phosphor-icons/react";
import {
  CalendarBlank,
  Check,
  ClipboardText,
  CreditCard,
  FileText,
  Handshake,
  Hourglass,
  Lifebuoy,
  Package,
  Phone,
  PhoneDisconnect,
  Plus,
  Question,
  Robot,
  ThumbsDown,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import type { User } from "@/domain/types";
import { obaviaDataset, NOW, CLOSERS } from "@/fixtures/obavia";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { formatDayIn, formatTimeIn, sameDayIn, TENANT_TZ, zoneAbbrev } from "@/lib/workspace-setter";
import {
  buildCloserBrief,
  buildCloserQueue,
  collectedFor,
  copilotItems,
  NO_SALE_REASONS,
  upcomingAppointments,
  type CloserQueueItem,
  type CloserQueueType,
  type UpcomingAppointment,
} from "@/lib/workspace-closer";
import { computeGame } from "@/lib/workspace-game";
import { BriefSheet } from "./BriefSheet";
import { CloserMe } from "./CloserMe";
import { CloserQueue } from "./CloserQueue";
import { FinancialLadder } from "./FinancialLadder";
import { GameStrip } from "./GameStrip";
import { NextUp, initials } from "./NextUp";
import { Segmented } from "./Segmented";
import { UserSwitcher } from "./UserSwitcher";

type Phase = "idle" | "live" | "outcome" | "result";
type Outcome = "verbal_yes" | "no_sale" | "conditional";
type Segment = "now" | "queue" | "me";
type Recover = "none" | "dropped" | "reconnecting" | "unknown_participant";

const STAGES = ["Restate problem", "Confirm participants", "Present approved scope", "Explain limitations", "Price and options", "Ask for the next voluntary decision"];

const QUEUE_ICON: Record<CloserQueueType, ComponentType<IconProps>> = {
  commitments: CalendarBlank,
  questions: Question,
  proposals: FileText,
  contract: ClipboardText,
  payment: CreditCard,
  delivery: Package,
};

const dataset = obaviaDataset;
const closers: User[] = dataset.users.filter((u) => CLOSERS.includes(u.userId));
const offer = dataset.offers?.[0];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function CloserWorkspace() {
  const reduce = useReducedMotion();
  const [userId, setUserId] = useState(CLOSERS[0]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [commitments, setCommitments] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [copilotOn, setCopilotOn] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [recover, setRecover] = useState<Recover>("none");
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [identityOk, setIdentityOk] = useState(true);
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined);
  const [noSaleReason, setNoSaleReason] = useState<string | undefined>(undefined);
  const [conditional, setConditional] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);
  const [segment, setSegment] = useState<Segment>("now");
  const [createdTasks, setCreatedTasks] = useState<CloserQueueItem[]>([]);

  const upcoming = useMemo(() => upcomingAppointments(dataset, userId, NOW).filter((u) => !completed.has(u.instance.instanceId)), [userId, completed]);
  const active: UpcomingAppointment | undefined = upcoming.find((u) => u.instance.instanceId === activeId) ?? upcoming.find((u) => !u.unresolved) ?? upcoming[0];
  const brief = useMemo(() => (active ? buildCloserBrief(dataset, active, offer) : undefined), [active]);
  const queue = useMemo(() => [...createdTasks, ...buildCloserQueue(dataset, userId, NOW)], [userId, createdTasks]);
  const game = useMemo(() => computeGame(dataset, userId, NOW), [userId]);
  const todays = useMemo(() => upcomingAppointments(dataset, userId, NOW).filter((u) => sameDayIn(u.instance.scheduledStart, NOW, TENANT_TZ)), [userId]);

  useEffect(() => {
    if (phase !== "live" || recover === "dropped" || recover === "reconnecting") return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase, recover]);

  useEffect(() => {
    if (recover !== "reconnecting") return;
    const t = window.setTimeout(() => setRecover("none"), reduce ? 40 : 1200);
    return () => window.clearTimeout(t);
  }, [recover, reduce]);

  const resetFlow = () => {
    setPhase("idle");
    setSeconds(0);
    setDone(new Set());
    setCommitments([]);
    setDraft("");
    setDismissed(new Set());
    setRecover("none");
    setRecoverOpen(false);
    setIdentityOk(true);
    setOutcome(undefined);
    setNoSaleReason(undefined);
    setConditional("");
  };

  const selectUser = (id: string) => {
    setUserId(id);
    setActiveId(undefined);
    setCreatedTasks([]);
    resetFlow();
  };

  const selectItem = (id: string) => {
    if (phase === "live" || phase === "outcome") return;
    setActiveId(id);
    resetFlow();
  };

  const saveOutcome = () => {
    if (!active || !outcome) return;
    if (outcome === "verbal_yes") {
      setCreatedTasks((t) => [
        {
          id: `followup_${active.instance.instanceId}`,
          type: "commitments",
          opportunity: active.opportunity,
          contact: active.contact,
          label: "follow up: send proposal",
          when: new Date(Date.parse(NOW) + 86_400_000).toISOString().replace(".000Z", "Z"),
        },
        ...t,
      ]);
    }
    setPhase("result");
  };

  const finish = () => {
    if (!active) return;
    const next = upcoming.find((u) => u.instance.instanceId !== active.instance.instanceId && !u.unresolved) ?? upcoming.find((u) => u.instance.instanceId !== active.instance.instanceId);
    setCompleted((s) => new Set(s).add(active.instance.instanceId));
    setActiveId(next?.instance.instanceId);
    resetFlow();
  };

  const dock = (() => {
    if (!active) return { label: "No appointments", onClick: () => {}, disabled: true, icon: Check };
    const video = active.appointment.modality === "video";
    switch (phase) {
      case "idle":
        return video ? { label: "Join", onClick: () => setPhase("live"), icon: VideoCamera } : { label: "Call", onClick: () => setPhase("live"), icon: Phone };
      case "live":
        return { label: "End call", onClick: () => setPhase("outcome"), icon: PhoneDisconnect, disabled: recover === "reconnecting" };
      case "outcome": {
        const valid = outcome === "verbal_yes" || (outcome === "no_sale" && !!noSaleReason) || (outcome === "conditional" && conditional.trim().length > 0);
        return { label: "Save outcome", onClick: saveOutcome, disabled: !valid, icon: Check };
      }
      case "result":
        return { label: "Done", onClick: finish, icon: Check };
    }
  })();
  const DockIcon = dock.icon;

  const copilot = brief && copilotOn ? copilotItems(brief).filter((c) => !dismissed.has(c.id))[0] : undefined;
  const ledger = active ? collectedFor(dataset, active.opportunity.opportunityId) : undefined;

  const nextUpItems = [
    ...upcoming.filter((u) => u.instance.instanceId !== active?.instance.instanceId).map((u) => ({ id: u.instance.instanceId, name: u.contact.displayName, icon: u.appointment.modality === "video" ? VideoCamera : Phone, hint: u.unresolved ? "unresolved" : formatTimeIn(u.instance.scheduledStart, TENANT_TZ) })),
    ...queue.filter((q) => q.type !== "commitments" || !q.id.startsWith("apt_")).map((q) => ({ id: `q:${q.id}`, name: q.contact.displayName, icon: QUEUE_ICON[q.type], hint: q.when ? formatDayIn(q.when, TENANT_TZ) : q.type })),
  ].slice(0, 3);

  return (
    <>
      <PageHeader title="Closer" actions={<UserSwitcher users={closers} value={userId} onChange={selectUser} />} />

      <div className="mx-auto flex max-w-[640px] flex-col gap-4">
        <Surface padding="lg" className="flex flex-col">
          <div className="min-h-[168px]">
            <AnimatePresence mode="wait" initial={false}>
              {active && brief ? (
                <motion.div
                  key={`${active.instance.instanceId}:${phase}`}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                  {phase === "idle" ? (
                    <HeroIdle item={active} onBrief={() => setBriefOpen(true)} />
                  ) : phase === "live" ? (
                    <div className="flex flex-col gap-4">
                      <LiveHead item={active} seconds={seconds} recover={recover} />
                      {!identityOk ? (
                        <div className="rounded-md border border-[color:var(--perf-attention-line)] p-3 text-[13px]">
                          <div className="font-medium text-fg">Unknown participant joined</div>
                          <div className="mt-0.5 text-fg-muted">Confirm identity before linking history</div>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setIdentityOk(true)}>
                              It is {active.contact.displayName.split(" ")[0]}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setIdentityOk(true)}>
                              Someone else
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {recover === "dropped" ? (
                        <div className="flex items-center justify-between rounded-md border border-[color:var(--perf-issue-line)] p-3 text-[13px]">
                          <span className="font-medium text-fg">Call dropped</span>
                          <Button size="sm" variant="secondary" onClick={() => setRecover("reconnecting")}>
                            Reconnect
                          </Button>
                        </div>
                      ) : null}
                      {copilot ? (
                        <div className="flex items-center gap-2 rounded-md border border-dashed border-line-strong px-3 py-2 text-[13px]">
                          <Robot size={14} aria-hidden className="shrink-0 text-accent" />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-fg">{copilot.label}</span>
                            <span className="block truncate text-[12px] text-fg-muted">{copilot.detail}</span>
                          </span>
                          <button type="button" aria-label="Not useful" onClick={() => setDismissed((s) => new Set(s).add(copilot.id))} className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-sm text-fg-subtle hover:bg-hover hover:text-fg">
                            <ThumbsDown size={15} aria-hidden />
                          </button>
                        </div>
                      ) : null}
                      <ol className="flex flex-col gap-1" aria-label="Stages">
                        {STAGES.map((s) => {
                          const ok = done.has(s);
                          return (
                            <li key={s}>
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={ok}
                                onClick={() => setDone((d) => { const n = new Set(d); if (n.has(s)) n.delete(s); else n.add(s); return n; })}
                                className="flex h-10 w-full items-center gap-2.5 rounded-sm px-2 text-left text-[14px] transition-colors hover:bg-hover motion-reduce:transition-none"
                              >
                                <span className={cn("inline-grid h-5 w-5 shrink-0 place-items-center rounded-full border", ok ? "border-accent bg-accent text-accent-fg" : "border-line-strong")} aria-hidden>
                                  {ok ? <Check size={11} weight="bold" /> : null}
                                </span>
                                <span className={cn(ok ? "text-fg-muted line-through" : "text-fg")}>{s}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                      {offer ? (
                        <div className="rounded-md border border-line bg-sunken p-3 text-[13px]">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-fg">{offer.name}</span>
                            <span className="tabular text-fg">{formatMoney(offer.listPrice)}</span>
                          </div>
                          <ul className="mt-1.5 flex flex-col gap-0.5 text-fg-muted">
                            {offer.approvedOptions.map((o) => (
                              <li key={o.id} className="flex items-center justify-between">
                                <span>{o.label}</span>
                                <span className="tabular">+{formatMoney(o.delta)}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="mt-2 text-[12px] text-fg-subtle">
                            Discount up to {offer.discountAuthority.maxPercent}%, {offer.discountAuthority.approverRole} approval beyond
                          </div>
                        </div>
                      ) : null}
                      {brief.nextQuestion ? (
                        <div className="flex items-start gap-2 text-[13.5px] text-fg">
                          <Question size={15} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-fg-subtle" />
                          {brief.nextQuestion}
                        </div>
                      ) : null}
                      <div>
                        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Commitments</div>
                        <ul className="mb-1.5 flex flex-col gap-1">
                          {commitments.map((c, i) => (
                            <li key={i} className="flex items-center justify-between rounded-sm bg-sunken px-2.5 py-1.5 text-[13px] text-fg">
                              {c}
                              <button type="button" aria-label="Remove" onClick={() => setCommitments((l) => l.filter((_, j) => j !== i))} className="text-fg-subtle hover:text-fg">
                                <X size={12} weight="bold" aria-hidden />
                              </button>
                            </li>
                          ))}
                        </ul>
                        <form
                          className="flex gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!draft.trim()) return;
                            setCommitments((l) => [...l, draft.trim()]);
                            setDraft("");
                          }}
                        >
                          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a commitment" aria-label="Commitment" className="h-9 min-w-0 flex-1 rounded-sm border border-line-strong bg-raised px-3 text-[13px] text-fg outline-none focus-visible:border-accent" />
                          <Button type="submit" variant="secondary" size="sm" className="h-9" aria-label="Add" disabled={!draft.trim()}>
                            <Plus size={14} weight="bold" aria-hidden />
                          </Button>
                        </form>
                      </div>
                      <div className="flex items-center justify-between">
                        <button type="button" role="switch" aria-checked={copilotOn} onClick={() => setCopilotOn((v) => !v)} className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-[12px] font-medium text-fg-muted hover:bg-hover">
                          <Robot size={13} aria-hidden />
                          Copilot {copilotOn ? "on" : "off"}
                        </button>
                        <div className="relative">
                          <button type="button" aria-expanded={recoverOpen} onClick={() => setRecoverOpen((v) => !v)} className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-[12px] font-medium text-fg-muted hover:bg-hover">
                            <Lifebuoy size={13} aria-hidden />
                            Recover
                          </button>
                          {recoverOpen ? (
                            <Surface tier="overlay" padding="none" className="absolute right-0 top-9 z-40 w-52 overflow-hidden shadow-md">
                              <button type="button" onClick={() => { setRecover("dropped"); setRecoverOpen(false); }} className="block w-full px-3 py-2 text-left text-[13px] text-fg hover:bg-hover">
                                Call dropped
                              </button>
                              <button type="button" onClick={() => { setIdentityOk(false); setRecoverOpen(false); }} className="block w-full px-3 py-2 text-left text-[13px] text-fg hover:bg-hover">
                                Unknown participant
                              </button>
                            </Surface>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : phase === "outcome" ? (
                    <div className="flex flex-col gap-3">
                      <LiveHead item={active} seconds={seconds} recover="none" ended />
                      <div role="radiogroup" aria-label="Outcome" className="grid grid-cols-1 gap-2">
                        {(
                          [
                            ["verbal_yes", "Verbal yes"],
                            ["no_sale", "No sale"],
                            ["conditional", "Conditional next step"],
                          ] as [Outcome, string][]
                        ).map(([id, label]) => (
                          <button key={id} type="button" role="radio" aria-checked={outcome === id} onClick={() => setOutcome(id)} className={cn("h-11 rounded-sm border px-3 text-left text-[14px] font-medium transition-colors motion-reduce:transition-none", outcome === id ? "border-accent bg-accent-soft text-fg" : "border-line-strong text-fg-muted hover:bg-hover")}>
                            {label}
                          </button>
                        ))}
                      </div>
                      {outcome === "no_sale" ? (
                        <div role="radiogroup" aria-label="Reason" className="flex flex-wrap gap-1.5">
                          {NO_SALE_REASONS.map((r) => (
                            <button key={r} type="button" role="radio" aria-checked={noSaleReason === r} onClick={() => setNoSaleReason(r)} className={cn("h-8 rounded-full border px-3 text-[12.5px] transition-colors motion-reduce:transition-none", noSaleReason === r ? "border-accent bg-accent-soft text-fg" : "border-line-strong text-fg-muted hover:bg-hover")}>
                              {r}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {outcome === "conditional" ? (
                        <input value={conditional} onChange={(e) => setConditional(e.target.value)} placeholder="Condition, owner, date" aria-label="Conditional next step" className="h-10 rounded-sm border border-line-strong bg-raised px-3 text-[14px] text-fg outline-none focus-visible:border-accent" />
                      ) : null}
                      {outcome === "verbal_yes" ? <div className="text-[12px] text-fg-subtle">Creates a follow-up task. Not revenue.</div> : null}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-[17px] font-semibold text-fg">
                        <Check size={18} weight="bold" aria-hidden className="text-perf-strong" />
                        {outcome === "verbal_yes" ? "Verbal yes" : outcome === "no_sale" ? `No sale: ${noSaleReason}` : "Conditional next step"}
                      </div>
                      {outcome === "verbal_yes" ? (
                        <div className="inline-flex h-6 w-fit items-center gap-1 rounded-sm border border-line-strong px-2 text-[12px] text-fg">
                          <Hourglass size={11} weight="bold" aria-hidden />
                          Follow-up task created, not revenue
                        </div>
                      ) : null}
                      {outcome === "conditional" ? <div className="text-[13px] text-fg-muted">{conditional}</div> : null}
                      {commitments.length ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {commitments.map((c, i) => (
                            <li key={i} className="inline-flex h-6 items-center rounded-sm bg-sunken px-2 text-[12px] text-fg">
                              {c}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {ledger ? <FinancialLadder opportunity={active.opportunity} verbalYes={outcome === "verbal_yes"} ledger={ledger.entries} net={ledger.net} /> : null}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div key="empty" initial={false} className="flex h-[168px] flex-col items-center justify-center gap-2 text-center">
                  <Handshake size={28} aria-hidden className="text-fg-subtle" />
                  <span className="text-[15px] font-medium text-fg">No upcoming appointment</span>
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
          items={nextUpItems}
          onSelect={(id) => {
            if (id.startsWith("q:")) setSegment("queue");
            else selectItem(id);
          }}
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
          <Surface padding="none" as="section" aria-label="Today">
            <div className="px-4 pt-3 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Today</div>
            <ul className="divide-y divide-line">
              {todays.map((u) => {
                const Icon = u.appointment.modality === "video" ? VideoCamera : Phone;
                return (
                  <li key={u.instance.instanceId}>
                    <button type="button" onClick={() => selectItem(u.instance.instanceId)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover motion-reduce:transition-none">
                      <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-[12px] font-semibold text-fg">{initials(u.contact.displayName)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[14px] font-medium text-fg">
                          <Icon size={13} weight="bold" aria-hidden className="text-fg-subtle" />
                          <span className="truncate">{u.contact.displayName}</span>
                        </span>
                        <span className="block text-[12px] text-fg-muted">{u.unresolved ? "Attendance unresolved" : u.instance.confirmedByCustomer ? "Customer confirmed" : "Not confirmed"}</span>
                      </span>
                      <span className="tabular shrink-0 text-[12px] text-fg-subtle">{formatTimeIn(u.instance.scheduledStart, TENANT_TZ)}</span>
                    </button>
                  </li>
                );
              })}
              {todays.length === 0 ? <li className="px-4 py-6 text-center text-[13px] text-fg-subtle">Nothing today</li> : null}
            </ul>
          </Surface>
        ) : null}

        {segment === "queue" ? <CloserQueue items={queue} /> : null}

        {segment === "me" ? <CloserMe dataset={dataset} userId={userId} now={NOW} /> : null}
      </div>

      {active && brief ? <BriefSheet key={active.instance.instanceId} open={briefOpen} onClose={() => setBriefOpen(false)} item={active} brief={brief} /> : null}
    </>
  );
}

function HeroIdle({ item, onBrief }: { item: UpcomingAppointment; onBrief: () => void }) {
  const { instance, appointment, contact } = item;
  const Icon = appointment.modality === "video" ? VideoCamera : Phone;
  const tz = zoneAbbrev(instance.scheduledStart, TENANT_TZ);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
            <Icon size={13} weight="bold" aria-hidden />
            {formatDayIn(instance.scheduledStart, TENANT_TZ)}
            {item.unresolved ? <span className="rounded-[4px] border border-dashed border-line-strong px-1 text-[10.5px]">unresolved</span> : null}
          </div>
          <div className="tabular mt-0.5 text-[30px] font-semibold leading-none tracking-tight text-fg">
            {formatTimeIn(instance.scheduledStart, TENANT_TZ)} <span className="text-[14px] font-medium text-fg-subtle">{tz}</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onBrief} leading={<ClipboardText size={14} weight="bold" />}>
          Brief
        </Button>
      </div>
      <div>
        <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-fg">{contact.displayName}</h2>
        {contact.organizationName ? <div className="text-[13px] text-fg-muted">{contact.organizationName}</div> : null}
      </div>
      <p className="line-clamp-2 text-[14px] italic leading-snug text-fg-muted">&ldquo;{appointment.purpose}&rdquo;</p>
    </div>
  );
}

function LiveHead({ item, seconds, recover, ended }: { item: UpcomingAppointment; seconds: number; recover: Recover; ended?: boolean }) {
  const label = ended ? "Ended" : recover === "dropped" ? "Dropped" : recover === "reconnecting" ? "Reconnecting" : "Connected";
  const live = !ended && recover === "none";
  return (
    <div className="flex items-center gap-2">
      <span className="inline-grid h-8 w-8 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-fg">{initials(item.contact.displayName)}</span>
      <span className="truncate text-[15px] font-medium text-fg">{item.contact.displayName}</span>
      <span className="ml-auto flex items-center gap-2 text-[13px] font-medium text-fg-muted">
        <span className={cn("inline-block h-2 w-2 rounded-full", live ? "bg-perf-strong" : "bg-fg-subtle")} aria-hidden />
        {label}
        <span className="tabular text-fg">
          {pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}
        </span>
        <span className="inline-flex h-5 items-center rounded-[4px] border border-line-strong px-1.5 text-[10.5px] text-fg-subtle">Provider</span>
      </span>
    </div>
  );
}
