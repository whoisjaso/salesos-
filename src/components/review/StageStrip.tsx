"use client";

import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { CheckCircle, Minus, TrendUp, X } from "@phosphor-icons/react";
import type { Band } from "@/domain/callIntelligence";
import type { StageView } from "@/lib/review";
import { cn } from "@/lib/cn";

/** Band as color plus a word plus an icon, never color alone (SOS-20). */
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
 * Four segments, Contacted to Bought. Each shows its band (color, word, icon) and the
 * percent. Tapping one goes to the stage's first cited span when there is one.
 */
export function StageStrip({ stages, active, onSelect, compact = false, className }: { stages: StageView[]; active?: string; onSelect?: (stage: StageView) => void; compact?: boolean; className?: string }) {
  return (
    <div role="group" aria-label="Stages" data-testid="stage-strip" className={cn("grid grid-cols-4 gap-1.5", className)}>
      {stages.map((s) => {
        const Icon = BAND_ICON[s.band];
        const cited = s.spanIndexes.length > 0;
        const isActive = active === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect?.(s)}
            disabled={!onSelect || !cited}
            aria-pressed={onSelect ? isActive : undefined}
            aria-label={`${s.label} ${s.percent} percent, ${s.bandLabel}${cited ? ", see moment" : ""}`}
            data-testid="stage-segment"
            data-stage={s.key}
            data-band={s.band}
            className={cn(
              "flex min-w-0 flex-col items-start gap-0.5 rounded-sm border px-2 text-left transition-colors motion-reduce:transition-none",
              compact ? "py-1.5" : "py-2",
              BAND_BORDER[s.band],
              isActive ? "bg-accent-soft" : cited && onSelect ? "hover:bg-hover" : "",
              "disabled:cursor-default",
            )}
          >
            <span className={cn("truncate text-[11px] font-medium", s.band === "no" ? "text-fg-subtle" : "text-fg-muted")}>{s.label}</span>
            <span className={cn("tabular font-semibold leading-none text-fg", compact ? "text-[15px]" : "text-[17px]")}>{s.percent}%</span>
            <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", BAND_TEXT[s.band])}>
              <Icon size={11} weight="bold" aria-hidden />
              {s.bandLabel}
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
