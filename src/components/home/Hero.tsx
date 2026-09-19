"use client";

import { Flame } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { Avatar } from "@/components/ui/Avatar";
import { StateChip } from "@/components/ui/StateChip";
import { Surface } from "@/components/ui/Surface";
import { useRepCard } from "@/components/profile/RepCardSheet";
import { formatCount } from "@/lib/format";
import type { TodayModel } from "./today-model";

const ease = [0.16, 1, 0.3, 1] as const;

/** Compact level row: avatar with level ring, name, level and XP to next, streak. Not a hero; the cash card is. */
export function Hero({ model }: { model: TodayModel }) {
  const reduce = useReducedMotion();
  const { openCard } = useRepCard();
  const { track } = model;
  const toNext = track.xpForNextLevel === null ? null : track.xpForNextLevel - track.xp;
  const levelWord = model.role === "owner" ? "Team level" : "Level";

  return (
    <Surface padding="none">
      <motion.div
        key={model.userId}
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
        className="flex min-h-16 items-center gap-3 px-4 py-3"
      >
        <Avatar
          userId={model.userId}
          size={48}
          ring={track.progress}
          ringLabel={`${levelWord} ${track.level}, ${Math.round(track.progress * 100)}% to next`}
          onOpenCard={openCard}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold leading-tight text-fg">{model.displayName}</h2>
            <p className="tabular mt-0.5 whitespace-nowrap text-[12px] leading-tight text-fg-subtle">
              {levelWord} {track.level}
              <span className="ml-2">{toNext === null ? "Max level" : `${formatCount(toNext)} XP to next`}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={
              model.streakDays > 0
                ? "tabular inline-flex h-6 items-center gap-1 rounded-sm border border-[color:var(--perf-attention-line)] px-2 text-[12px] font-medium text-[color:var(--perf-attention-fg)]"
                : "tabular inline-flex h-6 items-center gap-1 rounded-sm border border-line-strong px-2 text-[12px] font-medium text-fg-muted"
            }
          >
            <Flame size={13} weight={model.streakDays > 0 ? "fill" : "regular"} aria-hidden />
            {model.streakDays > 0 ? `${model.streakDays} day streak` : "No streak"}
          </span>
          {model.xpPaused ? <StateChip state="attention" label="XP paused" /> : null}
          </div>
        </div>
      </motion.div>
    </Surface>
  );
}
