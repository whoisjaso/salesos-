"use client";

import type { ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export interface DetailsRowProps {
  /** What the row opens. Short: one or two words. */
  label: ReactNode;
  /**
   * One short line under the label. When the row carries a figure, this is what the
   * figure is measured over, its period, and the word provisional when it can still
   * move ("Say the whole measurement", docs/DECISIONS.md). It wraps; it never clips.
   */
  hint?: ReactNode;
  /** One value at most, right-aligned. */
  value?: ReactNode;
  /** Optional leading mark (an icon, an avatar). */
  leading?: ReactNode;
  /** Whole sentence for the accessible name when the visible text is abbreviated. */
  ariaLabel?: string;
  onClick: () => void;
  className?: string;
  "data-testid"?: string;
}

/**
 * The one way a screen hides more: a full-width tappable row with a label, at most one value,
 * and a chevron. Everything the row opens lives in a Sheet. Never bordered on its own; the
 * caller groups rows in a Surface with divide-y.
 */
export function DetailsRow({ label, hint, value, leading, ariaLabel, onClick, className, ...rest }: DetailsRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={rest["data-testid"]}
      className={cn(
        "flex w-full items-center gap-3 px-4 text-left hover:bg-hover active:bg-hover",
        hint ? "min-h-12 py-2.5" : "h-12",
        className,
      )}
    >
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-[15px] text-fg", hint ? "leading-snug" : "truncate")}>{label}</span>
        {hint ? <span className="tabular text-[12px] leading-snug text-fg-muted">{hint}</span> : null}
      </span>
      {value !== undefined ? <span className="tabular shrink-0 text-[15px] text-fg-muted">{value}</span> : null}
      <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
    </button>
  );
}
