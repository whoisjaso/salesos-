"use client";

import { ArrowsLeftRight } from "@phosphor-icons/react";
import type { PairSide } from "@/domain/pairs";
import { Funnel } from "@/components/metrics/Funnel";
import type { FunnelCardMoney } from "@/components/metrics/FunnelCard";
import { Sheet } from "@/components/ui/Sheet";
import { StateChip } from "@/components/ui/StateChip";
import { Surface } from "@/components/ui/Surface";
import type { SessionRole } from "@/lib/session";
import { formatMoneyMinor } from "@/lib/format";
import { CHOSEN_BY_LABEL, PAIR_OWNER_LABEL, PAIR_SIDE_LABEL, PAIR_STAGE_SHORT, pairTitle, type PairView } from "@/lib/team-data";
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
  if (hours === null) return "no acceptance yet";
  if (hours < 1) return `avg ${Math.max(1, Math.round(hours * 60))} min to accept`;
  return `avg ${hours.toFixed(1)}h to accept`;
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

/**
 * The full pair: setter side funnel, handoff row, closer side funnel, the
 * diagnostic (side and stage, never a person), and the season contribution.
 * The owner sees both commission lines; a rep sees only their own.
 */
export function PairSheet({ open, onClose, view, viewer, rates }: PairSheetProps) {
  if (!view) return null;
  const { pair, funnel, diagnostic, contribution, setterDisplayName, closerDisplayName } = view;
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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={`${setterDisplayName} sets, ${closerDisplayName} closes. ${CHOSEN_BY_LABEL[pair.chosenBy]}, since ${sinceLabel(pair.startedAt)}.`}
      width={520}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <PairAvatars setterDisplayName={setterDisplayName} closerDisplayName={closerDisplayName} size={40} meSide={meSide} />
          <div className="min-w-0 flex-1">
            <PairBar funnel={funnel} diagnostic={diagnostic} />
          </div>
        </div>

        <section aria-label="Setter side" className="flex flex-col gap-2">
          <SideLabel side="setter" />
          <Funnel stages={funnel.setterSide} connectors={funnel.connectors} />
        </section>

        <Surface as="section" aria-label="Handoff" padding="sm" className="flex items-center gap-3">
          <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-fg-muted">
            <ArrowsLeftRight size={18} weight="bold" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="section-label">Handoff</div>
            <div className="tabular mt-0.5 text-[15px] font-semibold leading-tight text-fg">
              Accepted {funnel.handoff.accepted} of {funnel.handoff.total}
            </div>
            <div className="tabular text-[12px] text-fg-subtle">{formatHours(funnel.handoff.avgHoursToAccept)}</div>
          </div>
        </Surface>

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
