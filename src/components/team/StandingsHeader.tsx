"use client";

import type { ReactNode } from "react";
import { Hourglass, ListDashes, ListNumbers } from "@phosphor-icons/react";
import { DetailsRow } from "@/components/ui/DetailsRow";
import type { StandingsLines } from "@/lib/team-data";

export interface StandingsHeaderProps {
  /** What the list is and the order it is in, from the standings themselves. */
  lines: StandingsLines;
  /** Short label for the hold row. */
  holdLabel: string;
  /** What ranking waits on and who owns it. Null when nothing holds it. */
  holdLine: string | null;
  /** True while the descriptive override is showing ranks that are not standings. */
  descriptive: boolean;
  onOpen: () => void;
  /** The role switch, on the same line as the kind. */
  control?: ReactNode;
}

/**
 * Above the board: what this list is (ranked or a roster), the order it is in,
 * and one tappable line naming what the ranking waits on and who owns it. A
 * roster never carries a position number anywhere below this header
 * (docs/DECISIONS.md, "Never show a list that looks ranked when ranking is not
 * established").
 */
export function StandingsHeader({ lines, holdLabel, holdLine, descriptive, onOpen, control }: StandingsHeaderProps) {
  const KindIcon = lines.kind === "ranked" ? ListNumbers : ListDashes;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-fg" data-testid="standings-kind">
          <KindIcon size={15} weight="bold" aria-hidden className="shrink-0 text-fg-muted" />
          <span className="truncate">{lines.kindLabel}</span>
        </span>
        {control}
      </div>
      <p className="px-1 text-[12px] leading-snug text-fg-subtle" data-testid="standings-order">
        {lines.orderLine}
      </p>
      {holdLine ? (
        <div className="surface">
          <DetailsRow
            leading={<Hourglass size={16} weight="bold" aria-hidden className="text-fg-muted" />}
            label={descriptive ? `${holdLabel}, ranks shown anyway` : holdLabel}
            hint={holdLine}
            onClick={onOpen}
            data-testid="ranks-paused"
          />
        </div>
      ) : null}
    </div>
  );
}
