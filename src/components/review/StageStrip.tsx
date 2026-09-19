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
 * One slim bar, four segments, each filled to its score in the band hue, with a tiny
 * label under each. The percent shows only on tap (and in the accessible name, with
 * the band word, so the bar never carries meaning by color alone). No borders, no icons.
 * Tapping a segment goes to the stage's first cited span when there is one.
 */
export function StageStrip({ stages, active, onSelect, className }: { stages: StageView[]; active?: string; onSelect?: (stage: StageView) => void; className?: string }) {
  return (
    <div role="group" aria-label="Stages" data-testid="stage-strip" className={cn("grid grid-cols-4 gap-1", className)}>
      {stages.map((s) => {
        const cited = s.spanIndexes.length > 0;
        const isActive = active === s.key;
        const tappable = Boolean(onSelect);
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect?.(s)}
            disabled={!tappable}
            aria-pressed={tappable ? isActive : undefined}
            aria-label={`${s.label} ${s.percent} percent, ${s.bandLabel}${cited ? ", see moment" : ""}`}
            title={`${s.percent}%`}
            data-testid="stage-segment"
            data-stage={s.key}
            data-band={s.band}
            className={cn("flex min-w-0 flex-col gap-1.5 rounded-sm py-1 text-left disabled:cursor-default", tappable && "hover:bg-hover motion-reduce:transition-none")}
          >
            <span className="block h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden>
              <span className="block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${s.percent}%`, background: BAND_STROKE[s.band] }} />
            </span>
            <span className={cn("flex items-baseline gap-1 truncate text-[11px] leading-none", isActive ? "font-medium text-fg" : "text-fg-subtle")}>
              <span className="truncate">{s.label}</span>
              {isActive ? (
                <span className="tabular shrink-0 text-fg-muted" data-testid="stage-percent">
                  {s.percent}%
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A probability ring: one arc, the percent inside, the band color on the stroke. */
export function ProbabilityRing({ percent, band, size = 72 }: { percent: number; band: Band; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, percent)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} data-testid="probability-ring" aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={BAND_STROKE[band]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          className="transition-[stroke-dasharray] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="tabular absolute inset-0 grid place-items-center text-[15px] font-semibold text-fg">{percent}%</span>
    </div>
  );
}
