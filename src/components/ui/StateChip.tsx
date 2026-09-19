"use client";

import type { ComponentType } from "react";
import {
  CheckCircle,
  CircleHalf,
  ClockCounterClockwise,
  Hourglass,
  HourglassMedium,
  Minus,
  Question,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react/dist/ssr";
import type { IconProps } from "@phosphor-icons/react";
import type { DataState, PerformanceState } from "@/domain/types";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";

export type ChipState = PerformanceState | DataState;

interface ChipSpec {
  label: string;
  icon: ComponentType<IconProps>;
  tone: "strong" | "attention" | "issue" | "neutral" | "data";
  /** What the mark means, in a sentence a person who has never seen it can read. */
  meaning: string;
}

/** One row per state. Every state has a label, an icon and a meaning; color is never the only signal. */
export const CHIP_SPEC: Record<ChipState, ChipSpec> = {
  strong: { label: "On target", icon: CheckCircle, tone: "strong", meaning: "At or above the target set for this measure." },
  attention: { label: "Needs attention", icon: Warning, tone: "attention", meaning: "Below target, inside the attention band. Worth a look, not an alarm." },
  material_issue: { label: "Material issue", icon: WarningOctagon, tone: "issue", meaning: "Far enough below target to change what happens next." },
  neutral_no_benchmark: { label: "No benchmark", icon: Minus, tone: "neutral", meaning: "Reported as it is. No target has been set for this measure." },
  provisional_small_sample: { label: "Small sample", icon: Hourglass, tone: "neutral", meaning: "Too few records behind it to compare. The figure is shown, the comparison is not." },
  data_state: { label: "Data state", icon: Question, tone: "data", meaning: "The data behind this is incomplete, so the figure can still move." },
  complete: { label: "Complete", icon: CheckCircle, tone: "neutral", meaning: "Every record this figure needs has arrived." },
  partial: { label: "Partial", icon: CircleHalf, tone: "data", meaning: "Some records are missing, so this figure can still move." },
  stale: { label: "Stale", icon: ClockCounterClockwise, tone: "data", meaning: "The feed behind this has not reported recently, so the figure may be out of date." },
  unknown: { label: "Unknown", icon: Question, tone: "data", meaning: "The value has not been established, which is not the same as zero." },
  insufficient_sample: { label: "Small sample", icon: Hourglass, tone: "neutral", meaning: "Too few records behind it to compare. The figure is shown, the comparison is not." },
  immature: { label: "Immature cohort", icon: HourglassMedium, tone: "neutral", meaning: "Assigned too recently to have finished. Outcomes here are provisional, not zero." },
  no_benchmark: { label: "No benchmark", icon: Minus, tone: "neutral", meaning: "Reported as it is. No target has been set for this measure." },
};

const TONE_CLASS: Record<ChipSpec["tone"], string> = {
  strong: "text-perf-strong border-[color:var(--perf-strong-line)]",
  attention: "text-perf-attention border-[color:var(--perf-attention-line)]",
  issue: "text-perf-issue border-[color:var(--perf-issue-line)]",
  neutral: "text-fg-muted border-line-strong",
  data: "text-fg-muted border-dashed border-line-strong",
};

export interface StateChipProps {
  state: ChipState;
  /** Override the default text. Use the verdict's own label when available. */
  label?: string;
  /** Override the default meaning. Pass one whenever `label` is not a state name. */
  meaning?: string;
  /**
   * Make the chip pressable so it states what the mark means on tap, focus or hover.
   * Off by default because a chip is often rendered inside a tappable card, and a
   * button never nests inside a button.
   */
  explain?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * A state mark. The label and the icon carry the meaning together, never the color alone,
 * and the whole sentence behind the mark is available as text: on tap when `explain` is
 * set, and always as the mark's accessible name.
 */
export function StateChip({ state, label, meaning, explain = false, size = "sm", className }: StateChipProps) {
  const spec = CHIP_SPEC[state];
  const Icon = spec.icon;
  const text = label ?? spec.label;
  // A caller that renames the chip is saying something the state's own sentence does not
  // cover, so the state's meaning is never put in its mouth: it passes `meaning` or gets none.
  const sentence = meaning ?? (text === spec.label ? spec.meaning : undefined);
  const shared = cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-sm border bg-transparent font-medium whitespace-nowrap",
    size === "sm" ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[13px]",
    TONE_CLASS[spec.tone],
    className,
  );
  const body = (
    <>
      <Icon size={size === "sm" ? 13 : 15} weight="bold" aria-hidden />
      <span>{text}</span>
    </>
  );

  if (!explain) {
    return sentence ? (
      <span data-tone={spec.tone} role="img" aria-label={`${text}. ${sentence}`} className={shared}>
        {body}
      </span>
    ) : (
      <span data-tone={spec.tone} className={shared}>
        {body}
      </span>
    );
  }

  const chip = (
    <button
      type="button"
      data-tone={spec.tone}
      aria-label={sentence ? `${text}. ${sentence}` : text}
      onClick={(e) => e.stopPropagation()}
      className={cn(shared, "transition-colors hover:bg-hover motion-reduce:transition-none")}
    >
      {body}
    </button>
  );
  return sentence ? <Tooltip content={sentence}>{chip}</Tooltip> : chip;
}
