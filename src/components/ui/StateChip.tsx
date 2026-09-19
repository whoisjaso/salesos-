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
  type IconProps,
} from "@phosphor-icons/react/dist/ssr";
import type { DataState, PerformanceState } from "@/domain/types";
import { cn } from "@/lib/cn";

export type ChipState = PerformanceState | DataState;

interface ChipSpec {
  label: string;
  icon: ComponentType<IconProps>;
  tone: "strong" | "attention" | "issue" | "neutral" | "data";
}

/** One row per state. Every state has a label and an icon; color is never the only signal. */
export const CHIP_SPEC: Record<ChipState, ChipSpec> = {
  strong: { label: "On target", icon: CheckCircle, tone: "strong" },
  attention: { label: "Needs attention", icon: Warning, tone: "attention" },
  material_issue: { label: "Material issue", icon: WarningOctagon, tone: "issue" },
  neutral_no_benchmark: { label: "No benchmark", icon: Minus, tone: "neutral" },
  provisional_small_sample: { label: "Small sample", icon: Hourglass, tone: "neutral" },
  data_state: { label: "Data state", icon: Question, tone: "data" },
  complete: { label: "Complete", icon: CheckCircle, tone: "neutral" },
  partial: { label: "Partial", icon: CircleHalf, tone: "data" },
  stale: { label: "Stale", icon: ClockCounterClockwise, tone: "data" },
  unknown: { label: "Unknown", icon: Question, tone: "data" },
  insufficient_sample: { label: "Small sample", icon: Hourglass, tone: "neutral" },
  immature: { label: "Immature cohort", icon: HourglassMedium, tone: "neutral" },
  no_benchmark: { label: "No benchmark", icon: Minus, tone: "neutral" },
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
  size?: "sm" | "md";
  className?: string;
}

export function StateChip({ state, label, size = "sm", className }: StateChipProps) {
  const spec = CHIP_SPEC[state];
  const Icon = spec.icon;
  return (
    <span
      data-tone={spec.tone}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-sm border bg-transparent font-medium whitespace-nowrap",
        size === "sm" ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[13px]",
        TONE_CLASS[spec.tone],
        className,
      )}
    >
      <Icon size={size === "sm" ? 13 : 15} weight="bold" aria-hidden />
      <span>{label ?? spec.label}</span>
    </span>
  );
}
