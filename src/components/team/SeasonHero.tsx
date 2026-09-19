"use client";

import type { ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react";
import type { OwnStanding } from "@/domain/leaderboard";
import type { LevelState } from "@/domain/game";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { seasonTierFor } from "@/components/cash/tier-lookup";
import { rowRole } from "@/lib/team-data";

export interface SeasonHeroProps {
  /** "September 2026". The hero shows the month; the sheet shows the full title. */
  title: string;
  daysLeft: number;
  /** My commercial track, or the pooled team track for the owner. */
  level: LevelState;
  /**
   * The rep's own standing, read from the same rows the board shows, so the
   * personal number and the board can never disagree. Omitted for the owner.
   */
  own?: OwnStanding | null;
  /** Owner: the ring is the whole team's. */
  team?: boolean;
  /** Opens the season sheet: XP, streak, rank, rules. */
  onOpen: () => void;
  /** The owner's one primary action (Invite). Sits beside the tappable area, never inside it. */
  action?: ReactNode;
}

/** "September 2026" reads as "September" on the hero; the year stays in the sheet. */
export function monthOf(title: string): string {
  return title.split(" ")[0] ?? title;
}

/**
 * Season hero: the level ring (or the team ring), the month, and one number.
 * The number is the rep's own rank, and only when the board itself is ranked;
 * on a roster there is no rank anywhere, so the hero shows the days left.
 * Tap for XP, streak, the standing in words, XP pauses, and the rules.
 */
export function SeasonHero({ title, daysLeft, level, own, team = false, onOpen, action }: SeasonHeroProps) {
  const myRow = !team ? own?.row : undefined;
  const tier = myRow ? seasonTierFor(myRow.userId, rowRole(myRow)) : undefined;
  const rank = !team && own && own.rank !== null ? own.rank : null;
  const number = rank !== null ? `#${rank}` : `${daysLeft} days left`;
  const ringLabel = `${team ? "Team level" : "Level"} ${level.level}, ${Math.round(level.progress * 100)}% to next`;

  return (
    <section aria-label="Season" className="surface flex items-center">
      <button type="button" onClick={onOpen} aria-label={`${title}, ${number}, ${ringLabel}, open details`} className="flex min-w-0 flex-1 items-center gap-4 p-4 text-left hover:bg-hover active:bg-hover">
        {!team && myRow ? (
          <Avatar userId={myRow.userId} size={64} ring={level.progress} ringLabel={ringLabel} badge={tier} />
        ) : (
          <ProgressRing value={level.progress} size={64} strokeWidth={5} label={ringLabel} centerText={`L${level.level}`} className="shrink-0 [&>span]:text-[16px] [&>span]:font-semibold" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[20px] font-semibold tracking-tight text-fg">{monthOf(title)}</span>
          <span className="tabular mt-0.5 block text-[15px] text-fg-muted">{number}</span>
        </span>
        <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
      </button>
      {action ? <span className="shrink-0 pr-4">{action}</span> : null}
    </section>
  );
}
