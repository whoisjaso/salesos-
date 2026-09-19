"use client";

import type { ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";

export interface HeroCardProps {
  /** The metric's full name, with its denominator in words. */
  label: string;
  /** The one number. */
  value: ReactNode;
  /** One muted line at most. */
  caption?: ReactNode;
  /**
   * Short lines under the number that finish the sentence the number starts: what it is
   * measured over, the period it covers, and whether it is provisional. Qualifiers, never
   * new cards ("Say the whole measurement", docs/DECISIONS.md).
   */
  qualifiers?: ReactNode[];
  /** Full accessible name for the hero when it is tappable. */
  ariaLabel?: string;
  /** Tap opens the Details sheet. Absent means a plain card. */
  onClick?: () => void;
  className?: string;
  "data-testid"?: string;
}

/**
 * The owner's hero: one name, one number, its qualifiers, one chevron. Everything else the
 * number rests on (basis, cohort, data state, funnel) lives behind the tap.
 */
export function HeroCard({ label, value, caption, qualifiers, ariaLabel, onClick, className, ...rest }: HeroCardProps) {
  const body = (
    <>
      <div className="flex w-full items-start justify-between gap-2">
        <span className="text-[13px] font-medium leading-snug text-balance text-fg-muted">{label}</span>
        {onClick ? <CaretRight size={14} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-fg-subtle transition-colors group-hover:text-fg motion-reduce:transition-none" /> : null}
      </div>
      <div className="tabular text-[40px] font-semibold leading-none tracking-tight text-fg sm:text-[52px]">{value}</div>
      {caption ? <div className="tabular text-[12px] text-fg-muted">{caption}</div> : null}
      {qualifiers && qualifiers.length > 0 ? (
        <div className="flex flex-col gap-1">
          {qualifiers.map((q, i) => (
            <div key={i} className="tabular text-[12.5px] leading-snug text-fg-muted">
              {q}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <Surface
        as="button"
        interactive
        padding="md"
        onClick={onClick}
        aria-label={ariaLabel}
        data-testid={rest["data-testid"]}
        className={cn("group flex w-full flex-col gap-3 lg:p-6", className)}
      >
        {body}
      </Surface>
    );
  }
  return (
    <Surface padding="md" data-testid={rest["data-testid"]} className={cn("flex w-full flex-col gap-3 lg:p-6", className)}>
      {body}
    </Surface>
  );
}
