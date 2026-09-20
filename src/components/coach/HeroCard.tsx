"use client";

import { useState } from "react";
import { Wrench } from "@phosphor-icons/react";
import type { CoachingRecommendation, MetricPayload } from "@/domain/types";
import { isPerceptionGapRecommendation } from "@/domain/coaching";
import { Button } from "@/components/ui/Button";
import { StateChip } from "@/components/ui/StateChip";
import { Surface } from "@/components/ui/Surface";
import { formatCount, formatMoneyMinor, formatPercent } from "@/lib/format";
import { NEXT_STATE_LABEL, OWNER_LABEL, STATE_LABEL, nextState, type RecommendationUiState } from "@/lib/team-data";
import { useSession } from "@/lib/session";
import { WhySheet } from "./WhySheet";
import { PremiseSheet } from "./PremiseSheet";

export interface HeroCardProps {
  rec: CoachingRecommendation;
  /**
   * The measured figure behind the recommendation. Null when there is none to show:
   * coaching read from a conversation cites the words it came from, not a rate.
   */
  metric?: MetricPayload | null;
  state: RecommendationUiState;
  onState: (next: RecommendationUiState) => void;
}

function bigNumber(m: MetricPayload, rec?: CoachingRecommendation): { value: string; unit?: string; detail: string } {
  // Perception gap: the number is the gap in points, not either rate. Direction lives in the title and the Why sheet.
  if (rec && isPerceptionGapRecommendation(rec)) {
    const pts = rec.perception.gapPoints;
    if (pts === null) return { value: "N/A", detail: "perceived vs verified" };
    const abs = Math.abs(pts);
    return { value: Number.isInteger(abs) ? String(abs) : abs.toFixed(1), unit: "pts", detail: "perceived vs verified" };
  }
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

/** ONE coaching card: title, observed number, the practice line, Accept. The six-part sequence lives behind Why. */
export function HeroCard({ rec, metric, state, onState }: HeroCardProps) {
  const [why, setWhy] = useState(false);
  const [premise, setPremise] = useState(false);
  const { session } = useSession();
  const hold = rec.held;
  const suppressed = Boolean(rec.suppressed);
  // Coaching read from a conversation carries no rate; its evidence is the moment it quotes.
  const num = metric ? bigNumber(metric, rec) : null;
  const next = nextState(state);
  const surfaceState = suppressed ? "data_state" : state === "evaluated" ? "strong" : undefined;

  return (
    <>
      <Surface state={surfaceState} padding="md" className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* A hold speaks in its own words: what this recommendation waits on and who
                owns that. Nothing here ever tells a rep to go fix data
                (docs/DECISIONS.md, "A held measurement never holds the person"). */}
            <div className="flex flex-wrap items-center gap-x-1.5 text-[12px] font-medium text-fg-subtle">
              {hold ? (
                <span className="inline-flex items-start gap-1 leading-snug text-fg-muted">
                  <Wrench size={13} weight="bold" aria-hidden className="mt-[2px] shrink-0" />
                  <span>
                    Waiting until {hold.waitingOn}. {hold.ownerLabel} owns that.
                  </span>
                </span>
              ) : (
                <>
                  <span>Practice</span>
                  {/* The rep reading their own card already knows whose it is. */}
                  {rec.ownerRole === "rep" ? null : <span>{OWNER_LABEL[rec.ownerRole]}</span>}
                </>
              )}
            </div>
            <h2 className="mt-1 text-[15px] font-semibold leading-snug text-fg">
              {rec.title.replace(/^(Resolve data before coaching: |Waiting on data: )/, "")}
            </h2>
          </div>
          <StateChip state={suppressed ? rec.dataState : state === "proposed" ? "neutral_no_benchmark" : "strong"} label={STATE_LABEL[state]} className="shrink-0" />
        </div>

        {num && metric ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="tabular text-[24px] font-semibold leading-none tracking-tight text-fg">{num.value}</span>
            {num.unit ? <span className="text-[13px] font-medium text-fg-muted">{num.unit}</span> : null}
            <span className="tabular text-[12px] text-fg-subtle">{num.detail}</span>
            {metric.dataState !== "complete" ? <StateChip state={metric.dataState} className="self-center" /> : null}
          </div>
        ) : (
          <p className="text-[13px] leading-snug text-fg-muted">{rec.observed}</p>
        )}

        <p className="text-[14px] leading-snug text-fg">{capitalize(rec.action)}</p>

        <div className="flex flex-wrap items-center gap-2">
          {suppressed ? (
            session?.role === "owner" ? (
              <Button size="sm" href="/">
                Open data queue
              </Button>
            ) : null
          ) : (
            <Button size="sm" disabled={next === null} onClick={() => next && onState(next)}>
              {NEXT_STATE_LABEL[state]}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setWhy(true)}>
            Why
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPremise(true)} className="ml-auto">
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
