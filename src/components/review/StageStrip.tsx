"use client";

import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { CheckCircle, Minus, TrendUp, X } from "@phosphor-icons/react";
import type { Band } from "@/domain/callIntelligence";
import type { StageView } from "@/lib/review";
import { cn } from "@/lib/cn";

/** Band as color plus a word plus an icon, never color alone (SOS-20). Used where a band is spelled out. */
export const BAND_ICON: Record<Band, ComponentType<IconProps>> = {
  yes: CheckCircle,
  likely: TrendUp,
  unlikely: Minus,
  no: X,
};

export const BAND_TEXT: Record<Band, string> = {
  yes: "text-perf-strong",
  likely: "text-accent",
  unlikely: "text-perf-attention",
  no: "text-fg-subtle",
};

export const BAND_BORDER: Record<Band, string> = {
  yes: "border-[color:var(--perf-strong-line)]",
  likely: "border-accent",
  unlikely: "border-[color:var(--perf-attention-line)]",
  no: "border-dashed border-line-strong",
};

export const BAND_STROKE: Record<Band, string> = {
  yes: "var(--perf-strong-fg)",
  likely: "var(--accent)",
  unlikely: "var(--perf-attention-fg)",
  no: "var(--fg-subtle)",
};

/**
 * One slim bar, four segments, each filled to its score in the band hue, with a tiny label
 * under each. A stage is a legitimate thing to show as a stage, so the strip stays on the
 * default view; the percent does not. Tapping a segment names its band in words with an icon,
 * never color alone, and goes to the stage's first cited span when there is one. The number
 * behind the segment lives in Details (D: "A stage is a stage, a prediction is a prediction").
 */
export function StageStrip({ stages, active, onSelect, className }: { stages: StageView[]; active?: string; onSelect?: (stage: StageView) => void; className?: string }) {
  return (
    <div role="group" aria-label="Stages" data-testid="stage-strip" className={cn("grid grid-cols-4 gap-1", className)}>
      {stages.map((s) => {
        const cited = s.spanIndexes.length > 0;
        const isActive = active === s.key;
        const tappable = Boolean(onSelect);
        const Icon = BAND_ICON[s.band];
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect?.(s)}
            disabled={!tappable}
            aria-pressed={tappable ? isActive : undefined}
            aria-label={`${s.label}, ${s.bandLabel}${cited ? ", see supporting conversation" : ""}`}
            data-testid="stage-segment"
            data-stage={s.key}
            data-band={s.band}
            className={cn("flex min-w-0 flex-col gap-1.5 rounded-sm py-1 text-left disabled:cursor-default", tappable && "hover:bg-hover motion-reduce:transition-none")}
          >
            <span className="block h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden>
              <span className="block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${s.percent}%`, background: BAND_STROKE[s.band] }} />
            </span>
            <span className={cn("flex items-center gap-1 truncate text-[11px] leading-none", isActive ? "font-medium text-fg" : "text-fg-subtle")}>
              <span className="truncate">{s.label}</span>
              {isActive ? (
                <span className={cn("inline-flex shrink-0 items-center gap-0.5", BAND_TEXT[s.band])} data-testid="stage-band">
                  <Icon size={10} weight="bold" aria-hidden />
                  {s.bandLabel}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
