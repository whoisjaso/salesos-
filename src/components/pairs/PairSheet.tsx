"use client";

import type { ReactNode } from "react";
import { CalendarBlank, CalendarCheck, CheckCircle, Hourglass } from "@phosphor-icons/react";
import type { PairSide } from "@/domain/pairs";
import { Funnel } from "@/components/metrics/Funnel";
import type { FunnelCardMoney } from "@/components/metrics/FunnelCard";
import { Sheet } from "@/components/ui/Sheet";
import { StateChip } from "@/components/ui/StateChip";
import { Surface } from "@/components/ui/Surface";
import type { SessionRole } from "@/lib/session";
import { formatMoneyMinor, formatUnits } from "@/lib/format";
import { CHOSEN_BY_LABEL, PAIR_OWNER_LABEL, PAIR_SIDE_LABEL, PAIR_STAGE_SHORT, hoursWord, pairTitle, type PairView } from "@/lib/team-data";
import { PAIR_HUE, PairBar } from "./PairBar";
import { PairAvatars } from "./PairCard";

export interface PairViewer {
  role: SessionRole;
  userId: string;
}

export interface PairSheetProps {
  open: boolean;
  onClose: () => void;
  view: PairView | null;
  viewer: PairViewer;
  /** Hypothetical commission rates per role, percent. Absent lines are not shown. */
  rates: { setter?: number; closer?: number };
}

function formatHours(hours: number | null): string {
  if (hours === null) return "no acceptance recorded yet";
  if (hours < 1) return `accepted in ${Math.max(1, Math.round(hours * 60))} min on average`;
  return `accepted in ${hours.toFixed(1)}h on average`;
}

function sinceLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function SideLabel({ side }: { side: "setter" | "closer" }) {
  return (
    <span className="section-label inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PAIR_HUE[side] }} />
      {PAIR_SIDE_LABEL[side]}
    </span>
  );
}

/** One line of the shared answer: an icon, what it is, and at most one figure. */
function Line({ icon, label, value, hint }: { icon: ReactNode; label: ReactNode; value?: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
      <span className="mt-[2px] shrink-0 text-fg-muted">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px] leading-snug text-fg">{label}</span>
        {hint ? <span className="tabular text-[12px] leading-snug text-fg-subtle">{hint}</span> : null}
      </span>
      {value !== undefined ? <span className="tabular shrink-0 text-[13.5px] font-medium text-fg">{value}</span> : null}
    </div>
  );
}

/**
 * The pair, in the order the two people need it (docs/DECISIONS.md, "A pair
 * screen answers what we owe each other"): first what they are responsible for
 * together, then what each of them does next, and only then the comparison and
 * the diagnostic. The diagnostic names a side and a stage, never a person.
 */
export function PairSheet({ open, onClose, view, viewer, rates }: PairSheetProps) {
  if (!view) return null;
  const { pair, row, funnel, diagnostic, contribution, setterDisplayName, closerDisplayName, responsibilities } = view;
  const title = pairTitle(setterDisplayName, closerDisplayName);
  const currency = contribution.currency;
  const money = (n: number) => formatMoneyMinor(n, currency);
  const meSide = viewer.userId === pair.setterUserId ? "setter" : viewer.userId === pair.closerUserId ? "closer" : undefined;
  const showSetterLine = viewer.role === "owner" || meSide === "setter";
  const showCloserLine = viewer.role === "owner" || meSide === "closer";

  const moneyStages: Record<string, FunnelCardMoney> = {};
  for (const s of funnel.closerSide) if (s.money) moneyStages[s.stageId] = { currency: s.money.currency, basis: "net_collected_cash" };

  const weakSide = diagnostic.weakestSide;
  const hasFinding = weakSide !== "none";
  const findingState = hasFinding ? (diagnostic.gap <= -0.15 ? "material_issue" : "attention") : undefined;
  const { waiting, upcoming, shared, next } = responsibilities;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={`${CHOSEN_BY_LABEL[pair.chosenBy]}, since ${sinceLabel(pair.startedAt)}`}
      width={520}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <PairAvatars setterDisplayName={setterDisplayName} closerDisplayName={closerDisplayName} size={40} meSide={meSide} />
          <dl className="tabular grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[12px] leading-snug">
            <dt className="font-medium" style={{ color: PAIR_HUE.setter }}>
              Sets
            </dt>
            <dd className="truncate text-fg">{setterDisplayName}</dd>
            <dt className="font-medium" style={{ color: PAIR_HUE.closer }}>
              Closes
            </dt>
            <dd className="truncate text-fg">{closerDisplayName}</dd>
          </dl>
        </div>

        <section aria-label="What we owe each other" className="flex flex-col gap-2">
          <h3 className="section-label">What we owe each other</h3>
          <Surface padding="sm" className="flex flex-col divide-y divide-line">
            {waiting.length > 0 ? (
              waiting.map((w) => (
                <Line
                  key={w.opportunityId}
                  icon={<Hourglass size={15} weight="bold" aria-hidden />}
                  label={`Handoff on ${w.label} is waiting on acceptance`}
                  value={hoursWord(w.hoursWaiting)}
                />
              ))
            ) : (
              <Line icon={<CheckCircle size={15} weight="bold" aria-hidden />} label="No handoff is waiting on acceptance" />
            )}
            {upcoming.length > 0 ? (
              upcoming.map((u) => (
                <Line
                  key={`${u.opportunityId}:${u.startsAt}`}
                  icon={<CalendarCheck size={15} weight="bold" aria-hidden />}
                  label={`${u.label} is booked together`}
                  hint={u.confirmed ? "Confirmed by the customer" : "Not confirmed by the customer yet"}
                  value={u.when}
                />
              ))
            ) : (
              <Line icon={<CalendarBlank size={15} weight="bold" aria-hidden />} label="No shared appointment is scheduled" />
            )}
            <div className="flex flex-col gap-1 pt-2.5">
              <span className="text-[12px] font-medium leading-snug text-fg-subtle">Our results through the stages we both touch</span>
              <dl className="flex flex-col divide-y divide-line">
                {shared.map((s) => (
                  <div key={s.label} className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="text-[13.5px] text-fg">{s.label}</dt>
                    <dd className="tabular flex flex-col items-end text-right text-[13.5px] font-medium text-fg">
                      <span>{s.value}</span>
                      {s.label === "Handoff" ? <span className="text-[12px] font-normal text-fg-subtle">{formatHours(funnel.handoff.avgHoursToAccept)}</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Surface>
        </section>

        <section aria-label="What each of us does next" className="flex flex-col gap-2">
          <h3 className="section-label">What each of us does next</h3>
          <Surface padding="sm" className="flex flex-col divide-y divide-line">
            {[next.setter, next.closer].map((n) => (
              <div key={n.userId} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
                <span aria-hidden className="mt-[7px] inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PAIR_HUE[n.side] }} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-medium leading-snug text-fg">
                    {n.displayName}
                    {meSide === n.side ? <span className="text-fg-muted"> (you)</span> : null}
                    <span className="text-fg-muted">, {n.side === "setter" ? "sets" : "closes"}</span>
                  </span>
                  <span className="tabular text-[13.5px] leading-snug text-fg">{n.action}</span>
                </span>
              </div>
            ))}
          </Surface>
        </section>

        <section aria-label="How the pair compares" className="flex flex-col gap-3">
          <h3 className="section-label">How we compare</h3>
          <PairBar funnel={funnel} diagnostic={diagnostic} />
          <dl className="tabular flex items-center justify-between gap-3 text-[13px]">
            <dt className="text-fg-muted">Standing</dt>
            <dd className="text-fg">
              {row?.rank !== null && row?.rank !== undefined ? (
                `#${row.rank}, ${formatUnits(row.assignedOpportunities, "assigned opportunity", "assigned opportunities")}`
              ) : (
                <span className="flex items-start gap-1.5 text-right">
                  <Hourglass size={12} weight="bold" aria-hidden className="mt-1 shrink-0 text-fg-subtle" />
                  <span>Not ranked, {row?.provisionalReason ?? "no opportunities in the season yet"}</span>
                </span>
              )}
            </dd>
          </dl>
        </section>

        <section aria-label="Setter side" className="flex flex-col gap-2">
          <SideLabel side="setter" />
          <Funnel stages={funnel.setterSide} connectors={funnel.connectors} />
        </section>

        <section aria-label="Closer side" className="flex flex-col gap-2">
          <SideLabel side="closer" />
          <Funnel stages={funnel.closerSide} connectors={funnel.connectors} moneyStages={moneyStages} />
        </section>

        <Surface as="section" aria-label="Weakest stage" padding="md" state={findingState} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-[14px] font-semibold text-fg">
              {hasFinding ? `${PAIR_SIDE_LABEL[weakSide as PairSide]}, ${PAIR_STAGE_SHORT[diagnostic.stageId] ?? diagnostic.stageId}` : "No stage behind"}
            </span>
            {findingState ? <StateChip state={findingState} label={findingState === "material_issue" ? "Behind the pool" : "Slightly behind"} /> : null}
            {diagnostic.dataState !== "complete" ? <StateChip state={diagnostic.dataState} /> : null}
          </div>
          <dl className="grid grid-cols-1 gap-3 text-[13px]">
            <div>
              <dt className="text-[12px] font-medium text-fg-subtle">Observed</dt>
              <dd className="tabular mt-0.5 text-fg">{diagnostic.observed}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-medium text-fg-subtle">Comparator</dt>
              <dd className="tabular mt-0.5 text-fg-muted">{diagnostic.comparator}</dd>
            </div>
          </dl>
          <div>
            <div className="text-[12px] font-medium text-fg-subtle">Could also be</div>
            <ul className="mt-1 flex flex-col gap-1 text-[13px] text-fg-muted">
              {diagnostic.alternativeExplanations.map((e) => (
                <li key={e} className="flex gap-2">
                  <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-[12px] text-fg-subtle">
            <span>Suggested owner</span>
            <span className="chip text-fg">{PAIR_OWNER_LABEL[diagnostic.suggestedOwner]}</span>
          </div>
        </Surface>

        <Surface as="section" aria-label="This season" padding="md" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-[14px] font-semibold text-fg">This season</span>
            {contribution.hypothetical ? <span className="chip border-dashed text-fg-muted">Hypothetical policy</span> : null}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="tabular text-[24px] font-semibold leading-none tracking-tight text-fg">{money(contribution.netCollectedMinor)}</span>
            <span className="chip text-fg-muted">Net collected cash</span>
            <span className="tabular text-[12px] text-fg-subtle">
              {contribution.wins} won of {contribution.opportunities} assigned
            </span>
          </div>
          {showSetterLine || showCloserLine ? (
            <dl className="divide-y divide-line text-[13px]">
              {showSetterLine ? (
                <div className="flex items-center justify-between gap-3 py-2">
                  <dt className="flex items-center gap-2 text-fg-muted">
                    <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PAIR_HUE.setter }} />
                    Setter commission{rates.setter !== undefined ? ` at ${rates.setter}%` : ""}
                  </dt>
                  <dd className="tabular font-medium text-fg">{money(contribution.setterCommissionMinor)}</dd>
                </div>
              ) : null}
              {showCloserLine ? (
                <div className="flex items-center justify-between gap-3 py-2">
                  <dt className="flex items-center gap-2 text-fg-muted">
                    <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PAIR_HUE.closer }} />
                    Closer commission{rates.closer !== undefined ? ` at ${rates.closer}%` : ""}
                  </dt>
                  <dd className="tabular font-medium text-fg">{money(contribution.closerCommissionMinor)}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </Surface>
      </div>
    </Sheet>
  );
}
