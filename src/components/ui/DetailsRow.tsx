"use client";

import type { ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export interface DetailsRowProps {
  /** What the row opens. Short: one or two words. */
  label: ReactNode;
  /** One value at most, right-aligned. */
  value?: ReactNode;
  /** Optional leading mark (an icon, an avatar). */
  leading?: ReactNode;
  onClick: () => void;
  className?: string;
  "data-testid"?: string;
}

/**
 * The one way a screen hides more: a full-width tappable row with a label, at most one value,
 * and a chevron. Everything the row opens lives in a Sheet. Never bordered on its own; the
 * caller groups rows in a Surface with divide-y.
 */
export function DetailsRow({ label, value, leading, onClick, className, ...rest }: DetailsRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={rest["data-testid"]}
      className={cn("flex h-12 w-full items-center gap-3 px-4 text-left hover:bg-hover active:bg-hover", className)}
    >
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      <span className="min-w-0 flex-1 truncate text-[15px] text-fg">{label}</span>
      {value !== undefined ? <span className="tabular shrink-0 text-[15px] text-fg-muted">{value}</span> : null}
      <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
    </button>
  );
}
