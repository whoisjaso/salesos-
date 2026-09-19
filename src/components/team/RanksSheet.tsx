"use client";

import Link from "next/link";
import { PauseCircle } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import type { PauseConditions } from "@/lib/team-data";
import { Switch } from "./Segmented";

export interface RanksSheetProps {
  open: boolean;
  onClose: () => void;
  pause: PauseConditions;
  descriptive: boolean;
  onDescriptive: (next: boolean) => void;
  /** The owner can fix the data from Business; reps only see the reasons. */
  isOwner: boolean;
}

/** "1 unlinked payment, 4 unresolved attendances" or an empty string when nothing pauses. */
export function pauseSummary(pause: PauseConditions): string {
  return [
    pause.unlinkedPayments ? `${pause.unlinkedPayments} unlinked ${pause.unlinkedPayments === 1 ? "payment" : "payments"}` : null,
    pause.unresolvedAttendance ? `${pause.unresolvedAttendance} unresolved ${pause.unresolvedAttendance === 1 ? "attendance" : "attendances"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Why ranks are paused (SOS-14), the descriptive override, and the owner's way
 * to fix the data. Reached from the one "Ranks paused" line under the hero.
 */
export function RanksSheet({ open, onClose, pause, descriptive, onDescriptive, isOwner }: RanksSheetProps) {
  const summary = pauseSummary(pause);
  return (
    <Sheet open={open} onClose={onClose} title="Ranks paused" description="Until the data is fixed">
      <div className="flex flex-col gap-5">
        <p className="flex items-start gap-2 text-[14px] leading-relaxed text-fg">
          <PauseCircle size={16} weight="bold" aria-hidden className="mt-1 shrink-0 text-fg-muted" />
          <span className="tabular">
            Ranking paused: {summary}. Ranks return on their own once every payment is linked and every attendance is resolved.
          </span>
        </p>
        <div className="surface flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-fg">Show ranks anyway</div>
            <div className="text-[12px] text-fg-subtle">Descriptive only, not a standing</div>
          </div>
          <Switch checked={descriptive} onChange={onDescriptive} label="Show ranks anyway" className="shrink-0 [&>span:last-child]:sr-only" />
        </div>
        {isOwner ? (
          <Link href="/" className="inline-flex h-11 items-center justify-center rounded-sm bg-accent px-4 text-[15px] font-medium text-accent-fg hover:bg-accent-strong">
            Fix in Business
          </Link>
        ) : (
          <p className="text-[12px] text-fg-subtle">Only the owner can fix the data, from Business.</p>
        )}
      </div>
    </Sheet>
  );
}
