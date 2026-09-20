"use client";

import { Fire, Target } from "@phosphor-icons/react";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import type { GameView } from "@/lib/workspace-game";

/**
 * One line: level ring (verified stage events only), streak, active mission with progress.
 * The mission's proof rule appears on tap.
 *
 * The level is always shown plainly. A data incident holds the XP kinds that rest on the
 * surface it makes unreliable and nothing else, so it never replaces this line with a pause
 * (docs/DECISIONS.md, "A held measurement never holds the person"). The one track that is
 * waiting is named by GateLine, with its owner and what keeps accruing.
 */
export function GameStrip({ game }: { game: GameView }) {
  const { player, mission, proofRule } = game;
  const { commercial } = player;
  const streakOn = player.streakDays > 0;

  return (
    <div className="flex h-14 items-center gap-3 rounded-md border border-line bg-raised px-4">
      <Tooltip content={`Level ${commercial.level}. ${commercial.xpIntoLevel} of ${commercial.xpForNextLevel === null ? "max" : commercial.xpForNextLevel - (commercial.xp - commercial.xpIntoLevel)} XP this season, from verified stage events only.`}>
        <ProgressRing value={commercial.progress} size={36} strokeWidth={3} label={`Level ${commercial.level}`} centerText={String(commercial.level)} />
      </Tooltip>
      <div className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-fg" aria-label={`${player.streakDays} day streak`}>
        <Fire size={14} weight="fill" aria-hidden className={cn(streakOn ? "text-perf-attention" : "text-fg-faint")} />
        {player.streakDays}
      </div>
      <span aria-hidden className="h-6 w-px bg-line" />
      {mission ? (
        <Tooltip content={proofRule ?? mission.title} className="min-w-0 flex-1">
          <button type="button" className="flex h-9 w-full min-w-0 items-center gap-1.5 rounded-sm text-left text-[13px] font-medium text-fg">
            <Target size={14} weight="bold" aria-hidden className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate">{mission.title}</span>
            <span className="shrink-0 text-[12px] text-fg-subtle">
              {mission.progress}/{mission.target}
            </span>
          </button>
        </Tooltip>
      ) : (
        <span className="text-[12px] text-fg-subtle">No mission</span>
      )}
    </div>
  );
}
