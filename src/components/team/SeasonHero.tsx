"use client";

import { Flame, HourglassMedium, PauseCircle } from "@phosphor-icons/react";
import type { LeaderboardRow } from "@/domain/types";
import type { PlayerState } from "@/domain/game";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatCount } from "@/lib/format";

export interface SeasonHeroProps {
  title: string;
  daysLeft: number;
  player: PlayerState;
  /** The current user's comparable row, if any. */
  myRow?: LeaderboardRow;
  descriptive: boolean;
}

/** Season card: label, days left, my level ring and XP, my rank or Provisional in one chip. */
export function SeasonHero({ title, daysLeft, player, myRow, descriptive }: SeasonHeroProps) {
  const lvl = player.commercial;
  const toNext = lvl.xpForNextLevel === null ? null : lvl.xpForNextLevel - lvl.xp;

  return (
    <section aria-label="Season" className="surface flex items-center gap-4 p-4 sm:gap-6 sm:p-5">
      <ProgressRing value={lvl.progress} size={84} strokeWidth={6} label={`Level ${lvl.level}, ${Math.round(lvl.progress * 100)}% to next`} centerText={`L${lvl.level}`} className="shrink-0 [&>span]:text-[18px] [&>span]:font-semibold" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="text-[17px] font-semibold tracking-tight text-fg">{title}</h2>
          <span className="tabular text-[13px] text-fg-subtle">{daysLeft} days left</span>
        </div>
        <div className="tabular mt-1 text-[13px] text-fg-muted">
          {formatCount(lvl.xp)} XP
          {toNext !== null ? <span className="text-fg-subtle"> · {formatCount(toNext)} to next</span> : null}
          {player.streakDays > 0 ? (
            <span className="ml-2 inline-flex items-center gap-0.5 text-fg-subtle">
              <Flame size={13} weight="fill" aria-hidden />
              {player.streakDays}
            </span>
          ) : null}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {myRow ? (
            myRow.rank !== null ? (
              <span className="tabular inline-flex h-7 items-center gap-1.5 rounded-sm bg-accent-soft px-2.5 text-[13px] font-semibold text-accent">
                #{myRow.rank}
                {descriptive ? <span className="font-medium text-fg-subtle">descriptive</span> : null}
              </span>
            ) : (
              <Tooltip content={myRow.provisionalReason ?? "Provisional"}>
                <span tabIndex={0} className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-dashed border-line-strong px-2.5 text-[12.5px] font-medium text-fg-muted">
                  <HourglassMedium size={13} weight="bold" aria-hidden />
                  Provisional
                </span>
              </Tooltip>
            )
          ) : (
            <span className="text-[12.5px] text-fg-subtle">No row this season</span>
          )}
          {player.gate.paused ? (
            <Tooltip content={player.gate.reasons.join("; ")}>
              <span tabIndex={0} className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-[color:var(--perf-attention-line)] px-2.5 text-[12.5px] font-medium text-perf-attention">
                <PauseCircle size={13} weight="bold" aria-hidden />
                Paused
              </span>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </section>
  );
}
