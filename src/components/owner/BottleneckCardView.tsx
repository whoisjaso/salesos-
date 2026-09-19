"use client";

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import type { BottleneckCard, CoachingOwner } from "@/domain/types";
import { Surface } from "@/components/ui/Surface";
import { StateChip } from "@/components/ui/StateChip";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { OWNER_FUNCTION_LABEL, STAGE_LABEL } from "@/lib/owner-model";

const OWNER_OPTIONS = Object.keys(OWNER_FUNCTION_LABEL) as CoachingOwner[];
const VISIBLE_EXPLANATIONS = 3;

export interface BottleneckCardViewProps {
  card: BottleneckCard;
  /** Client-only assignment. */
  owner: CoachingOwner;
  onAssign: (owner: CoachingOwner) => void;
  className?: string;
}

function Term({ children }: { children: string }) {
  return <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{children}</div>;
}

/** Stage, observed, comparator, data state, owner, explanations, investigation, scenario. */
export function BottleneckCardView({ card, owner, onAssign, className }: BottleneckCardViewProps) {
  const [expanded, setExpanded] = useState(false);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const explanations = expanded ? card.candidateExplanations : card.candidateExplanations.slice(0, VISIBLE_EXPLANATIONS);
  const hidden = card.candidateExplanations.length - VISIBLE_EXPLANATIONS;

  return (
    <Surface as="article" state={card.verdict.state} padding="md" className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-[15px] font-semibold text-fg">{STAGE_LABEL[card.stageId] ?? card.stageId}</h3>
        <StateChip state={card.verdict.state} label={card.verdict.label} />
        {card.verdict.state !== "data_state" && card.dataState !== "complete" ? <StateChip state={card.dataState} /> : null}
      </div>

      <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
        <div>
          <dt><Term>Observed</Term></dt>
          <dd className="tabular mt-1 text-fg">{card.observed}</dd>
        </div>
        <div>
          <dt><Term>Comparator</Term></dt>
          <dd className="tabular mt-1 text-fg-muted">{card.comparator}</dd>
        </div>
      </dl>

      <div>
        <Term>Candidate explanations</Term>
        <ul className="mt-1 flex flex-col gap-1 text-[13px] text-fg-muted">
          {explanations.map((e) => (
            <li key={e} className="flex gap-2">
              <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
              <span>{e.replace(/ \((hypothesis, not established cause)\)$/, "")}</span>
            </li>
          ))}
        </ul>
        {hidden > 0 ? (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1.5 text-[12px] font-medium text-accent hover:underline">
            {expanded ? "Show fewer" : `${hidden} more`}
          </button>
        ) : null}
      </div>

      <div>
        <Term>Investigate</Term>
        <p className="mt-1 text-[13px] text-fg">{card.proposedInvestigation}</p>
      </div>

      {card.scenario ? (
        <div className="rounded-sm border border-dashed border-line-strong p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[12px] font-medium text-fg-muted">Benchmark opportunity scenario</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Not a forecast</span>
          </div>
          <div className="tabular mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-[22px] font-semibold leading-none text-fg">{formatMoney(card.scenario.modeledCash)}</span>
            <span className="text-[12px] text-fg-subtle">modeled cash</span>
            {card.scenario.additionalUnits > 0 ? (
              <span className="text-[12px] text-fg-subtle">+{card.scenario.additionalUnits} units</span>
            ) : null}
            {card.scenario.modeledCommission ? (
              <span className="text-[12px] text-fg-subtle">
                {formatMoney(card.scenario.modeledCommission)} commission{card.scenario.commissionBasisHypothetical ? ", hypothetical" : ""}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setAssumptionsOpen((v) => !v)}
            aria-expanded={assumptionsOpen}
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-fg-muted hover:text-fg"
          >
            Assumptions
            <CaretDown size={12} weight="bold" aria-hidden className={cn("transition-transform motion-reduce:transition-none", assumptionsOpen && "rotate-180")} />
          </button>
          {assumptionsOpen ? (
            <ul className="mt-2 flex flex-col gap-1 text-[12px] leading-snug text-fg-muted">
              {card.scenario.assumptions.map((a) => (
                <li key={a} className="flex gap-2">
                  <span aria-hidden className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <label className="flex items-center justify-between gap-3 border-t border-line pt-3 text-[12px] text-fg-subtle">
        <span>Owner</span>
        <span className="relative inline-flex">
          <select
            value={owner}
            onChange={(e) => onAssign(e.target.value as CoachingOwner)}
            aria-label="Assign owner function"
            className="h-8 appearance-none rounded-sm border border-line-strong bg-raised pl-3 pr-8 text-[13px] font-medium text-fg hover:bg-hover"
          >
            {OWNER_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {OWNER_FUNCTION_LABEL[o]}
              </option>
            ))}
          </select>
          <CaretDown size={12} weight="bold" aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
        </span>
      </label>
    </Surface>
  );
}
