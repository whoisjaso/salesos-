"use client";

import { useState } from "react";
import { Wrench } from "@phosphor-icons/react";
import type { CoachingRecommendation, MetricPayload } from "@/domain/types";
import { Button } from "@/components/ui/Button";
import { StateChip } from "@/components/ui/StateChip";
import { Surface } from "@/components/ui/Surface";
import { formatCount, formatMoneyMinor, formatPercent } from "@/lib/format";
import { NEXT_STATE_LABEL, OWNER_LABEL, STATE_LABEL, nextState, type RecommendationUiState } from "@/lib/team-data";
import { WhySheet } from "./WhySheet";
import { PremiseSheet } from "./PremiseSheet";

export interface HeroCardProps {
  rec: CoachingRecommendation;
  metric: MetricPayload;
  state: RecommendationUiState;
  onState: (next: RecommendationUiState) => void;
}

function bigNumber(m: MetricPayload): { value: string; detail: string } {
  if (m.value === null) return { value: "N/A", detail: `${formatCount(m.numerator)} of ${formatCount(m.denominator)}` };
  if (m.unit === "ratio") {
    return {
      value: formatPercent(m.value, { digits: 0 }),
      detail: `${formatCount(m.numerator)} of ${formatCount(m.denominator)}${m.unknownCount ? `, ${m.unknownCount} unresolved` : ""}`,
    };
  }
  if (m.unit === "ratio_money_per_unit") {
    return { value: formatMoneyMinor(Math.round(m.value), m.currency ?? "USD"), detail: `${formatMoneyMinor(m.numerator, m.currency ?? "USD")} over ${formatCount(m.denominator)}` };
  }
  return { value: formatCount(m.value), detail: "" };
}

/** ONE card: title, observed number big, the practice action, Accept. Evidence lives behind "Why". */
export function HeroCard({ rec, metric, state, onState }: HeroCardProps) {
  const [why, setWhy] = useState(false);
  const [premise, setPremise] = useState(false);
  const suppressed = Boolean(rec.suppressed);
  const num = bigNumber(metric);
  const next = nextState(state);
  const surfaceState = suppressed ? "data_state" : state === "evaluated" ? "strong" : undefined;

  return (
    <>
      <Surface state={surfaceState} padding="lg" className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-medium text-fg-subtle">
              {suppressed ? (
                <span className="inline-flex items-center gap-1 text-fg-muted">
                  <Wrench size={13} weight="bold" aria-hidden />
                  Fix the data first
                </span>
              ) : (
                <span>Practice</span>
              )}
              <span aria-hidden>·</span>
              <span>{OWNER_LABEL[rec.ownerRole]}</span>
            </div>
            <h2 className="mt-1 text-[19px] font-semibold leading-tight tracking-tight text-fg sm:text-[22px]">
              {suppressed ? rec.title.replace(/^Resolve data before coaching: /, "") : rec.title}
            </h2>
          </div>
          <StateChip state={suppressed ? rec.dataState : state === "proposed" ? "neutral_no_benchmark" : "strong"} label={STATE_LABEL[state]} className="shrink-0" />
        </div>

        <div className="flex items-end gap-4">
          <div className="tabular text-[52px] font-semibold leading-none tracking-tight text-fg sm:text-[60px]">{num.value}</div>
          <div className="tabular pb-1.5 text-[13px] leading-snug text-fg-muted">
            {num.detail}
            {metric.dataState !== "complete" ? (
              <div className="mt-1">
                <StateChip state={metric.dataState} />
              </div>
            ) : null}
          </div>
        </div>

        <p className="text-[16px] leading-snug text-fg">{suppressed ? capitalize(rec.action) : rec.action}</p>
        {suppressed ? <p className="text-[13px] leading-snug text-fg-muted">{rec.suppressed?.reason}</p> : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {suppressed ? (
            <Button size="md" href="/owner">
              Open data queue
            </Button>
          ) : (
            <Button size="md" disabled={next === null} onClick={() => next && onState(next)}>
              {NEXT_STATE_LABEL[state]}
            </Button>
          )}
          <Button variant="ghost" size="md" onClick={() => setWhy(true)}>
            Why
          </Button>
          <Button variant="ghost" size="md" onClick={() => setPremise(true)} className="sm:ml-auto">
            Premise is wrong
          </Button>
        </div>
      </Surface>
      <WhySheet open={why} onClose={() => setWhy(false)} rec={rec} />
      <PremiseSheet open={premise} onClose={() => setPremise(false)} title={rec.title} />
    </>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
