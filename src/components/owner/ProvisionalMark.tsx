"use client";

import { Hourglass } from "@phosphor-icons/react";
import type { ProvisionalNote } from "@/lib/owner-model";
import { cn } from "@/lib/cn";

export interface ProvisionalMarkProps {
  note: ProvisionalNote;
  /** Reason on its own line under the word. Default is one line. */
  stacked?: boolean;
  className?: string;
}

/**
 * The word Provisional where the figure is read, not only inside a sheet
 * ("Say the whole measurement", docs/DECISIONS.md). Text label and icon together;
 * the hue repeats the word, it never replaces it.
 */
export function ProvisionalMark({ note, stacked = false, className }: ProvisionalMarkProps) {
  return (
    <span className={cn("inline-flex items-start gap-1.5 text-fg-muted", className)}>
      <Hourglass size={13} weight="bold" aria-hidden className="mt-[2px] shrink-0 text-perf-attention" />
      <span className={cn(stacked && "flex flex-col gap-0.5")}>
        <span className="font-medium text-fg">{note.label}</span>
        {stacked ? <span>{note.reason}</span> : <span>{`: ${note.reason}`}</span>}
      </span>
    </span>
  );
}
