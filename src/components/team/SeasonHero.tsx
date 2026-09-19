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

const CHIP = "inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-[12px] font-medium";

/** Season card: the one hero on Team. Level ring, month, days left, XP line, rank or Provisional. */
export function SeasonHero({ title, daysLeft, level, streakDays, pausedReasons = [], myRow, team = false, descriptive }: SeasonHeroProps) {
  const toNext = level.xpForNextLevel === null ? null : level.xpForNextLevel - level.xp;
  const paused = pausedReasons.length > 0;
  const tier = !team && myRow ? seasonTierFor(myRow.userId, rowRole(myRow)) : undefined;

  return (
    <section aria-label="Season" className="surface flex items-center gap-4 p-4 sm:p-5">
      <span className="relative shrink-0">
        <ProgressRing value={level.progress} size={72} strokeWidth={6} label={`${team ? "Team level" : "Level"} ${level.level}, ${Math.round(level.progress * 100)}% to next`} centerText={`L${level.level}`} className="[&>span]:text-[17px] [&>span]:font-semibold" />
        {tier ? (
          <TierBadge tier={tier} size={24} tooltip={`${tier.label} tier, by net collected cash this season. Display only.`} className="absolute -right-1 -bottom-1 ring-2 ring-raised" />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2 className="text-[17px] font-semibold tracking-tight text-fg">{title}</h2>
          <span className="tabular text-[12px] text-fg-subtle">{daysLeft} days left</span>
        </div>
        <div className="tabular mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-fg-muted">
          <span>
            {team ? "Team, " : ""}
            {formatCount(level.xp)} XP
          </span>
          {toNext !== null ? <span className="text-fg-subtle">{formatCount(toNext)} to next</span> : null}
          {streakDays > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-fg-subtle">
              <Flame size={12} weight="fill" aria-hidden />
              {streakDays}
            </span>
          ) : null}
        </div>
        {team && !paused ? null : (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {!team ? (
              myRow ? (
                myRow.rank !== null ? (
                  <span className={`${CHIP} tabular bg-accent-soft text-accent`}>
                    #{myRow.rank}
                    {descriptive ? <span className="font-medium text-fg-subtle">descriptive</span> : null}
                  </span>
                ) : (
                  <Tooltip content={myRow.provisionalReason ?? "Provisional"}>
                    <span tabIndex={0} className={`${CHIP} border border-dashed border-line-strong text-fg-muted`}>
                      <HourglassMedium size={13} weight="bold" aria-hidden />
                      Provisional
                    </span>
                  </Tooltip>
                )
              ) : (
                <span className="text-[12px] text-fg-subtle">No row this season</span>
              )
            ) : null}
            {paused ? (
              <Tooltip content={pausedReasons.join("; ")}>
                <span tabIndex={0} className={`${CHIP} border border-[color:var(--perf-attention-line)] text-perf-attention`}>
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
