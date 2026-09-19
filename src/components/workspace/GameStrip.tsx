"use client";

import { Fire, Pause, Target } from "@phosphor-icons/react";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Tooltip } from "@/components/ui/Tooltip";
import type { GameView } from "@/lib/workspace-game";

/**
 * One strip: level ring (verified stage events only), streak, active mission with its proof rule.
 * When the quality gate is paused, a single calm chip replaces the numbers (SOS-15).
 */
export function GameStrip({ game }: { game: GameView }) {
  const { player, mission, proofRule } = game;
  const { commercial } = player;

  if (player.gate.paused) {
    return (
      <div className="flex h-14 items-center justify-between rounded-md border border-line bg-raised px-4">
        <Tooltip content={player.gate.reasons.join(". ")}>
          <button type="button" className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-line-strong px-2.5 text-[12px] font-medium text-fg-muted">
            <Pause size={12} weight="bold" aria-hidden />
            Paused
          </button>
        </Tooltip>
        <span className="text-[11px] text-fg-subtle">Quality gate</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-md border border-line bg-raised px-4 py-3">
      <Tooltip content={`Level ${commercial.level}. ${commercial.xpIntoLevel} of ${commercial.xpForNextLevel === null ? "max" : commercial.xpForNextLevel - (commercial.xp - commercial.xpIntoLevel)} XP this season, from verified stage events only.`}>
        <ProgressRing value={commercial.progress} size={44} strokeWidth={4} label={`Level ${commercial.level}`} centerText={String(commercial.level)} />
      </Tooltip>
      <div className="tabular flex shrink-0 items-center gap-1 text-[14px] font-medium text-fg" aria-label={`${player.streakDays} day streak`}>
        <Fire size={16} weight="fill" aria-hidden className="text-perf-attention" />
        {player.streakDays}
      </div>
      <div className="min-w-0 flex-1 border-l border-line pl-4">
        {mission ? (
          <>
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
              <Target size={13} weight="bold" aria-hidden className="shrink-0 text-accent" />
              <span className="truncate">{mission.title}</span>
              <span className="tabular ml-auto shrink-0 text-[12px] text-fg-subtle">
                {mission.progress}/{mission.target}
              </span>
            </div>
            {proofRule ? <div className="truncate text-[11.5px] text-fg-subtle">{proofRule}</div> : null}
          </>
        ) : (
          <div className="text-[12px] text-fg-subtle">No mission</div>
        )}
      </div>
    </div>
  );
}
