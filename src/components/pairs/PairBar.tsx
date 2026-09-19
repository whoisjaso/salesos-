"use client";

import type { CSSProperties } from "react";
import { Warning, WarningOctagon } from "@phosphor-icons/react";
import type { PairDiagnostic, PairFunnel } from "@/domain/pairs";
import { cn } from "@/lib/cn";
import { PAIR_BAR_CLOSER, PAIR_BAR_SETTER, PAIR_SIDE_LABEL, PAIR_STAGE_SHORT, pairStageRate } from "@/lib/team-data";

/** Two hues, one per side. The setter side is the accent; the closer side a teal that reads in both themes. */
export const PAIR_HUE = { setter: "var(--accent)", closer: "#4fb3a6" } as const;

/** Gap at or past this many ratio points is an issue (red); a smaller gap needs attention (amber). */
const ISSUE_GAP = 0.15;

export interface PairBarProps {
  funnel: PairFunnel;
  diagnostic: PairDiagnostic;
  className?: string;
}

function pct(rate: number | null): string {
  return rate === null ? "N/A" : `${Math.round(rate * 100)}%`;
}

/**
 * Slim two-tone pair bar: setter stages (Contact, Booked, Retained, Show) in
 * the setter hue, a handoff mark, closer stages (Fit, Won, Cash) in the closer
 * hue. Each segment fills to its conversion rate. The weakest stage from the
 * diagnostic is outlined amber or red and named in text beneath the bar.
 * Rendered with spans only so it can sit inside a button.
 */
export function PairBar({ funnel, diagnostic, className }: PairBarProps) {
  const weakStage = diagnostic.weakestSide === "none" ? null : diagnostic.stageId;
  const severity = diagnostic.gap <= -ISSUE_GAP ? "issue" : "attention";
  const SeverityIcon = severity === "issue" ? WarningOctagon : Warning;

  const segment = (stageId: string, side: "setter" | "closer") => {
    const rate = pairStageRate(funnel, stageId);
    const weak = stageId === weakStage;
    const hue = PAIR_HUE[side];
    return (
      <span
        key={stageId}
        title={`${PAIR_STAGE_SHORT[stageId] ?? stageId} ${pct(rate)}`}
        className={cn("relative block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full", weak && "ring-2 ring-offset-1 ring-offset-[color:var(--bg-raised)]")}
        style={{
          backgroundColor: rate === null ? "transparent" : `color-mix(in srgb, ${hue} 22%, transparent)`,
          boxShadow: rate === null ? `inset 0 0 0 1px color-mix(in srgb, ${hue} 45%, transparent)` : undefined,
          ...(weak ? ({ "--tw-ring-color": severity === "issue" ? "var(--perf-issue-line)" : "var(--perf-attention-line)" } as CSSProperties) : {}),
        }}
      >
        {rate !== null ? <span className="absolute inset-y-0 left-0 block rounded-full" style={{ width: `${Math.max(rate > 0 ? 6 : 0, rate * 100)}%`, backgroundColor: hue }} /> : null}
      </span>
    );
  };

  const summary = [
    ...PAIR_BAR_SETTER.map((s) => `${PAIR_STAGE_SHORT[s]} ${pct(pairStageRate(funnel, s))}`),
    "handoff",
    ...PAIR_BAR_CLOSER.map((s) => `${PAIR_STAGE_SHORT[s]} ${pct(pairStageRate(funnel, s))}`),
  ].join(", ");
  const weakText = weakStage ? `${PAIR_SIDE_LABEL[diagnostic.weakestSide as "setter" | "handoff" | "closer"]}, ${PAIR_STAGE_SHORT[weakStage] ?? weakStage} ${pct(pairStageRate(funnel, weakStage))}` : null;

  return (
    <span className={cn("block", className)}>
      <span role="img" aria-label={`Pair bar: ${summary}. ${weakText ? `Weakest: ${weakText}.` : "No stage behind the pooled rate."}`} className="flex items-center gap-1">
        {PAIR_BAR_SETTER.map((s) => segment(s, "setter"))}
        <span aria-hidden className="mx-0.5 block h-3 w-0.5 shrink-0 rounded-full bg-fg-subtle" title="Handoff" />
        {PAIR_BAR_CLOSER.map((s) => segment(s, "closer"))}
      </span>
      <span className="mt-1.5 flex items-center justify-between gap-2 text-[11px] leading-none">
        <span className="font-medium" style={{ color: PAIR_HUE.setter }}>
          Setter
        </span>
        {weakText ? (
          <span className={cn("tabular inline-flex min-w-0 items-center gap-1 truncate font-medium", severity === "issue" ? "text-perf-issue" : "text-perf-attention")}>
            <SeverityIcon size={12} weight="bold" aria-hidden />
            <span className="truncate">{weakText}</span>
          </span>
        ) : (
          <span className="truncate text-fg-subtle">No stage behind</span>
        )}
        <span className="font-medium" style={{ color: PAIR_HUE.closer }}>
          Closer
        </span>
      </span>
    </span>
  );
}
