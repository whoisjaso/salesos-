"use client";

import { Flame, HourglassMedium, PauseCircle } from "@phosphor-icons/react";
import type { LeaderboardRow } from "@/domain/types";
import type { LevelState } from "@/domain/game";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Tooltip } from "@/components/ui/Tooltip";
import { TierBadge } from "@/components/cash/TierBadge";
import { seasonTierFor } from "@/components/cash/tier-lookup";
import { formatCount } from "@/lib/format";
import { rowRole } from "@/lib/team-data";

export interface SeasonHeroProps {
  title: string;
  daysLeft: number;
  /** My commercial track, or the pooled team track for the owner. */
  level: LevelState;
  streakDays: number;
  /** Quality gate reasons when XP is paused. Empty means running. */
  pausedReasons?: string[];
  /** The current user's comparable row. Omitted for the owner. */
  myRow?: LeaderboardRow;
  /** Owner: the ring is the whole team's. */
  team?: boolean;
  descriptive: boolean;
}

/** Season card: label, days left, level ring and XP, rank or Provisional in one chip. */
export function SeasonHero({ title, daysLeft, level, streakDays, pausedReasons = [], myRow, team = false, descriptive }: SeasonHeroProps) {
  const toNext = level.xpForNextLevel === null ? null : level.xpForNextLevel - level.xp;
  const paused = pausedReasons.length > 0;
  const tier = !team && myRow ? seasonTierFor(myRow.userId, rowRole(myRow)) : undefined;

  return (
    <section aria-label="Season" className="surface flex items-center gap-4 p-4 sm:gap-6 sm:p-5">
      <span className="relative shrink-0">
        <ProgressRing value={level.progress} size={84} strokeWidth={6} label={`${team ? "Team level" : "Level"} ${level.level}, ${Math.round(level.progress * 100)}% to next`} centerText={`L${level.level}`} className="[&>span]:text-[18px] [&>span]:font-semibold" />
        {tier ? (
          <TierBadge tier={tier} size={26} tooltip={`${tier.label} tier, by net collected cash this season. Display only.`} className="absolute -right-1 -bottom-1 ring-2 ring-raised" />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="text-[17px] font-semibold tracking-tight text-fg">{title}</h2>
          <span className="tabular text-[13px] text-fg-subtle">{daysLeft} days left</span>
        </div>
        <div className="tabular mt-1 text-[13px] text-fg-muted">
          {team ? "Team, " : ""}
          {formatCount(level.xp)} XP
          {toNext !== null ? <span className="text-fg-subtle"> · {formatCount(toNext)} to next</span> : null}
          {streakDays > 0 ? (
            <span className="ml-2 inline-flex items-center gap-0.5 text-fg-subtle">
              <Flame size={13} weight="fill" aria-hidden />
              {streakDays}
            </span>
          ) : null}
        </div>
        {team && !paused ? null : (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {!team ? (
              myRow ? (
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
              )
            ) : null}
            {paused ? (
              <Tooltip content={pausedReasons.join("; ")}>
                <span tabIndex={0} className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-[color:var(--perf-attention-line)] px-2.5 text-[12.5px] font-medium text-perf-attention">
                  <PauseCircle size={13} weight="bold" aria-hidden />
                  Paused
                </span>
              </Tooltip>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
