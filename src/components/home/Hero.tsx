"use client";

import { Flame } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { StateChip } from "@/components/ui/StateChip";
import { Surface } from "@/components/ui/Surface";
import { formatCount } from "@/lib/format";
import type { TodayModel } from "./today-model";

const ease = [0.16, 1, 0.3, 1] as const;

/** One hero: level ring, name, XP to next, streak. */
export function Hero({ model }: { model: TodayModel }) {
  const reduce = useReducedMotion();
  const { track } = model;
  const toNext = track.xpForNextLevel === null ? null : track.xpForNextLevel - track.xp;
  const levelWord = model.role === "owner" ? "Team level" : "Level";

  return (
    <Surface padding="lg" className="overflow-hidden">
      <motion.div
        key={model.userId}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease }}
        className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8"
      >
        <div className="relative mx-auto shrink-0 sm:mx-0">
          <ProgressRing value={track.progress} size={132} strokeWidth={9} label={`${levelWord} ${track.level}, ${Math.round(track.progress * 100)}% to next`} centerText=" " />
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center leading-none">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">Lvl</span>
              <span className="tabular mt-0.5 text-[44px] font-semibold tracking-tight text-fg">{track.level}</span>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 className="truncate text-[24px] font-semibold leading-tight tracking-tight text-fg sm:text-[28px]">{model.displayName}</h2>
          <p className="tabular mt-1.5 text-[15px] text-fg-muted">
            {levelWord} {track.level}
            <span aria-hidden className="mx-2 text-fg-faint">·</span>
            {toNext === null ? "Max level" : `${formatCount(toNext)} XP to next`}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span
              className={
                model.streakDays > 0
                  ? "inline-flex h-7 items-center gap-1.5 rounded-full bg-[color:var(--perf-attention-tint)] px-2.5 text-[13px] font-medium text-[color:var(--perf-attention-fg)]"
                  : "inline-flex h-7 items-center gap-1.5 rounded-full bg-hover px-2.5 text-[13px] font-medium text-fg-muted"
              }
            >
              <Flame size={15} weight={model.streakDays > 0 ? "fill" : "regular"} aria-hidden />
              <span className="tabular">{model.streakDays > 0 ? `${model.streakDays} day streak` : "No streak yet"}</span>
            </span>
            {model.xpPaused ? <StateChip state="attention" label="XP paused" /> : null}
          </div>
        </div>
      </motion.div>
    </Surface>
  );
}
