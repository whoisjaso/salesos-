"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  CalendarBlank,
  Check,
  ClipboardText,
  Hourglass,
  Lifebuoy,
  Phone,
  PhoneDisconnect,
  Plus,
  Question,
  Robot,
  ThumbsDown,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import { APPROACH_TENTATIVE_SENTENCE, SUGGESTED_APPROACH_KICKER } from "@/domain/buyerMode";
import { obaviaDataset, NOW } from "@/fixtures/obavia";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { latestReviewableCallId } from "@/lib/review";
import { formatDayIn, formatTimeIn, sameDayIn, TENANT_TZ, zoneAbbrev } from "@/lib/workspace-setter";
import {
  buildCloserBrief,
  buildCloserQueue,
  collectedFor,
  copilotItems,
  NO_SALE_REASONS,
  upcomingAppointments,
  type CloserBrief,
  type CloserQueueItem,
  type UpcomingAppointment,
} from "@/lib/workspace-closer";
import { computeGame } from "@/lib/workspace-game";
import { useTenantData } from "@/lib/onboarding";
import { CloserEmptyToday } from "@/components/onboarding/CloserEmptyToday";
import { buildTodayFocus } from "@/components/home/today-focus";
import { TodayFocus } from "@/components/home/TodayFocus";
import { BriefSheet } from "./BriefSheet";
import { CloserQueue } from "./CloserQueue";
import { Fields, type Field } from "./Fields";
import { FinancialLadder } from "./FinancialLadder";
import { GateLine } from "./GateLine";
import { initials } from "./NextUp";
import { Segmented } from "./Segmented";

type Phase = "idle" | "live" | "outcome" | "result";
type Outcome = "verbal_yes" | "no_sale" | "conditional";
type Segment = "now" | "queue";
type Recover = "none" | "dropped" | "reconnecting" | "unknown_participant";

const STAGES = ["Restate problem", "Confirm participants", "Present approved scope", "Explain limitations", "Price and options", "Ask for the next voluntary decision"];

const dataset = obaviaDataset;
const offer = dataset.offers?.[0];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today for a closer. Renders for the signed-in person. */
export function CloserWorkspace({ userId }: { userId: string }) {
  const reduce = useReducedMotion();
  const tenantData = useTenantData();
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
  // Calls finished in this session: one conversation each, and a call that has been read.
  const [heldCalls, setHeldCalls] = useState(0);
  const [reviewedCallId, setReviewedCallId] = useState<string | undefined>(undefined);

  const upcoming = useMemo(() => upcomingAppointments(dataset, userId, NOW).filter((u) => !completed.has(u.instance.instanceId)), [userId, completed]);
  const active: UpcomingAppointment | undefined = upcoming.find((u) => u.instance.instanceId === activeId) ?? upcoming.find((u) => !u.unresolved) ?? upcoming[0];
  const brief = useMemo(() => (active ? buildCloserBrief(dataset, active, offer) : undefined), [active]);
  const queue = useMemo(() => [...createdTasks, ...buildCloserQueue(dataset, userId, NOW)], [userId, createdTasks]);
  const game = useMemo(() => computeGame(dataset, userId, NOW), [userId]);
  const todays = useMemo(() => upcomingAppointments(dataset, userId, NOW).filter((u) => sameDayIn(u.instance.scheduledStart, NOW, TENANT_TZ)), [userId]);

  // Today connects to improvement: verified progress during the day, the next improvement
  // with its cited moment once a call has been reviewed. The rule lives in today-focus.ts.
  const focus = useMemo(
    () => buildTodayFocus(dataset, userId, "closer", NOW, { reviewedCallId, session: { calls: heldCalls, conversations: heldCalls } }),
    [userId, reviewedCallId, heldCalls],
  );

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

  /** The call is over and has been read, so Today can lead with the improvement it showed. */
  const endCall = () => {
    setPhase("outcome");
    setHeldCalls((n) => n + 1);
    const reviewable = active ? latestReviewableCallId(active.opportunity.opportunityId) : undefined;
    if (reviewable) setReviewedCallId(reviewable);
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
        return { label: "End call", onClick: endCall, icon: PhoneDisconnect, disabled: recover === "reconnecting" };
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


  // A business created through onboarding has its own rows (zero on day one), not the fixture's.
  if (!tenantData.demo) return <CloserEmptyToday data={tenantData} />;

  return (
    <>
      {/*
        Phone: one column, in this order. Desktop: the same elements, no second design.
        The two wrappers are display:contents until lg, so the phone layout is untouched;
        at lg the first becomes the call column and the second a standing rail that holds
        the customer beside the call, so opening anything never costs the rep their context.
      */}
      <div className="mx-auto flex max-w-[640px] flex-col gap-4 lg:grid lg:max-w-[1180px] lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
        <Surface padding="md" className="order-1 flex flex-col">
          <div className="min-h-[96px]">
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
                    /*
                      Live call. Phone: one column, same order as before. Desktop: two columns,
                      the plan on the left and the material on the right, so the whole working
                      surface and the End call control sit on one screen with no scrolling.
                    */
                    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-5 lg:gap-y-3">
                      <LiveHead item={active} seconds={seconds} recover={recover} className="lg:col-span-2" />
                      {!identityOk ? (
                        <div className="rounded-md border border-[color:var(--perf-attention-line)] p-3 text-[13px] lg:col-span-2">
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
                        <div className="flex items-center justify-between rounded-md border border-[color:var(--perf-issue-line)] p-3 text-[13px] lg:col-span-2">
                          <span className="font-medium text-fg">Call dropped</span>
                          <Button size="sm" variant="secondary" onClick={() => setRecover("reconnecting")}>
                            Reconnect
                          </Button>
                        </div>
                      ) : null}
                      {/* Left on a desktop: the plan for this call, and the live hint. */}
                      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
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
                      <ol className="-mx-2 flex flex-col" aria-label="Stages">
                        {STAGES.map((s) => {
                          const ok = done.has(s);
                          return (
                            <li key={s}>
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={ok}
                                onClick={() => setDone((d) => { const n = new Set(d); if (n.has(s)) n.delete(s); else n.add(s); return n; })}
                                className="flex h-10 w-full items-center gap-3 rounded-sm px-2 text-left text-[14px] transition-colors hover:bg-hover motion-reduce:transition-none"
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
                      </div>
                      {/* Right on a desktop: the approved material, the question to ask, what was promised. */}
                      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
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
                        <div className="section-label mb-1.5">Commitments</div>
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
                          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a commitment" aria-label="Commitment" className="h-10 min-w-0 flex-1 rounded-sm border border-line-strong bg-raised px-3 text-[14px] text-fg outline-none focus-visible:border-accent" />
                          <Button type="submit" variant="secondary" size="md" className="w-10 px-0" aria-label="Add" disabled={!draft.trim()}>
                            <Plus size={16} weight="bold" aria-hidden />
                          </Button>
                        </form>
                      </div>
                      </div>
                      <div className="flex items-center justify-between lg:col-span-2">
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
                            <button key={r} type="button" role="radio" aria-checked={noSaleReason === r} onClick={() => setNoSaleReason(r)} className={cn("h-8 rounded-full border px-3 text-[13px] transition-colors motion-reduce:transition-none", noSaleReason === r ? "border-accent bg-accent-soft text-fg" : "border-line-strong text-fg-muted hover:bg-hover")}>
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
                        <Check size={20} weight="bold" aria-hidden className="text-perf-strong" />
                        {outcome === "verbal_yes" ? "Verbal yes" : outcome === "no_sale" ? `No sale: ${noSaleReason}` : "Conditional next step"}
                      </div>
                      {outcome === "conditional" ? <div className="text-[13px] text-fg-muted">{conditional}</div> : null}
                      {outcome === "verbal_yes" || commitments.length ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {outcome === "verbal_yes" ? (
                            <li className="chip text-fg">
                              <Hourglass size={12} weight="bold" aria-hidden />
                              Follow-up task created, not revenue
                            </li>
                          ) : null}
                          {commitments.map((c, i) => (
                            <li key={i} className="chip border-transparent bg-sunken text-fg">
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
                <motion.div key="empty" initial={false} className="flex h-[96px] flex-col items-center justify-center gap-2 text-center">
                  <CalendarBlank size={28} aria-hidden className="text-fg-subtle" />
                  <span className="text-[15px] font-medium text-fg">No upcoming appointment</span>
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

        <div className="order-2 empty:hidden">
          <GateLine game={game} />
        </div>

        {/* Today connects to improvement: verified progress, or the next improvement with its moment. */}
        <TodayFocus focus={focus} className="order-6" />
        </div>

        <div className="contents lg:sticky lg:top-[72px] lg:flex lg:flex-col lg:gap-4">
        {active && brief ? <CallContext item={active} brief={brief} /> : null}

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
          <Surface padding="none" as="section" aria-label="Today" className="order-5">
            <ul className="divide-y divide-line">
              {todays.map((u) => (
                <li key={u.instance.instanceId}>
                  <button type="button" onClick={() => selectItem(u.instance.instanceId)} aria-current={u.instance.instanceId === active?.instance.instanceId ? "true" : undefined} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover motion-reduce:transition-none", u.instance.instanceId === active?.instance.instanceId && "bg-accent-soft")}>
                    <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-[12px] font-semibold text-fg">{initials(u.contact.displayName)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-fg">{u.contact.displayName}</span>
                      <span className="block truncate text-[12px] text-fg-muted">{u.unresolved ? "Attendance unresolved" : u.instance.confirmedByCustomer ? "Customer confirmed" : "Not confirmed"}</span>
                    </span>
                    <span className="tabular shrink-0 text-[13px] text-fg-subtle">{formatTimeIn(u.instance.scheduledStart, TENANT_TZ)}</span>
                  </button>
                </li>
              ))}
              {todays.length === 0 ? <li className="px-4 py-6 text-center text-[13px] text-fg-subtle">Nothing today</li> : null}
            </ul>
          </Surface>
        ) : null}

        {segment === "queue" ? <CloserQueue items={queue} className="order-5" /> : null}
        </div>
      </div>

      {active && brief ? <BriefSheet key={active.instance.instanceId} open={briefOpen} onClose={() => setBriefOpen(false)} item={active} brief={brief} /> : null}
    </>
  );
}

/** The facts behind the brief, as short label and value pairs. Provenance stays in the brief. */
function contextFields(brief: CloserBrief): Field[] {
  const fields: Field[] = brief.rows.map((r) => ({ label: r.label, value: r.text }));
  if (brief.fit.length > 0) {
    fields.push({
      label: "Verified fit",
      value: (
        <span className="flex flex-col gap-0.5">
          {brief.fit.map((f) => (
            <span key={f.key}>
              {f.key}: <span className="font-medium">{f.value}</span>
            </span>
          ))}
        </span>
      ),
    });
  }
  if (brief.unknowns.length > 0) fields.push({ label: "Not known yet", value: brief.unknowns.join(", ") });
  return fields;
}

/**
 * The customer, standing beside the call on a desktop: who this is, the suggested approach
 * with the line that says it is tentative, and the facts the brief carries. The phone keeps
 * the brief behind its one tap; this is the same content, not a second design, so the rep
 * never loses the person to open the guidance.
 */
function CallContext({ item, brief }: { item: UpcomingAppointment; brief: CloserBrief }) {
  const approach = brief.buyerMode.approach[0];
  return (
    <Surface padding="md" className="order-3 hidden lg:flex lg:flex-col lg:gap-3" aria-label="Who this is">
      <div className="flex flex-col gap-0.5">
        <span className="section-label">Who this is</span>
        <span className="text-[15px] font-medium leading-tight text-fg">{item.contact.displayName}</span>
        {item.contact.organizationName ? <span className="text-[12.5px] leading-snug text-fg-muted">{item.contact.organizationName}</span> : null}
      </div>
      {approach ? (
        <div className="flex flex-col gap-0.5">
          <span className="section-label">{SUGGESTED_APPROACH_KICKER}</span>
          <span className="text-[15px] font-semibold leading-tight text-fg">{approach}</span>
          <span className="text-[11.5px] leading-snug text-fg-subtle">{APPROACH_TENTATIVE_SENTENCE}</span>
        </div>
      ) : null}
      <Fields items={contextFields(brief)} />
    </Surface>
  );
}

function HeroIdle({ item, onBrief }: { item: UpcomingAppointment; onBrief: () => void }) {
  const { instance, appointment, contact } = item;
  const tz = zoneAbbrev(instance.scheduledStart, TENANT_TZ);
  const today = sameDayIn(instance.scheduledStart, NOW, TENANT_TZ);
  const line = item.unresolved ? "Attendance unresolved" : contact.organizationName ?? (appointment.modality === "video" ? "Video call" : "Phone call");
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {!today ? <div className="text-[12px] text-fg-subtle">{formatDayIn(instance.scheduledStart, TENANT_TZ)}</div> : null}
        <div className="text-[34px] font-semibold leading-none tracking-tight text-fg">
          {formatTimeIn(instance.scheduledStart, TENANT_TZ)} <span className="text-[13px] font-medium text-fg-subtle">{tz}</span>
        </div>
        <h2 className="mt-2 truncate text-[17px] font-semibold leading-tight tracking-tight text-fg">{contact.displayName}</h2>
        <div className="truncate text-[14px] text-fg-muted">{line}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={onBrief} leading={<ClipboardText size={14} weight="bold" />} className="-mr-2 -mt-1 shrink-0">
        Brief
      </Button>
    </div>
  );
}

function LiveHead({ item, seconds, recover, ended, className }: { item: UpcomingAppointment; seconds: number; recover: Recover; ended?: boolean; className?: string }) {
  const label = ended ? "Ended" : recover === "dropped" ? "Dropped" : recover === "reconnecting" ? "Reconnecting" : "Connected";
  const live = !ended && recover === "none";
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-fg">{initials(item.contact.displayName)}</span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-fg">{item.contact.displayName}</span>
        <span className="shrink-0 text-[15px] font-medium text-fg">
          {pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[13px] font-medium text-fg-muted">
        <span className={cn("inline-block h-2 w-2 rounded-full", live ? "bg-perf-strong" : "bg-fg-subtle")} aria-hidden />
        <span className="text-fg">{label}</span>
        <span className="tag ml-auto text-fg-subtle">Provider</span>
      </div>
    </div>
  );
}
