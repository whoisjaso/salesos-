"use client";

import { Flame, Pause } from "@phosphor-icons/react";
import { Surface } from "@/components/ui/Surface";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import type { CapacityRow, PlayerRow } from "@/lib/owner-model";

export interface TeamViewProps {
  players: PlayerRow[];
  capacity: CapacityRow[];
  seasonLabel: string;
}

/** One row per rep: name, level ring, streak. Load from the capacity model as a thin line. No ranking. */
export function TeamView({ players, capacity, seasonLabel }: TeamViewProps) {
  const loadOf = (userId: string) => capacity.find((c) => c.userId === userId);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-[12px] text-fg-subtle">
        <span>{seasonLabel}</span>
        <span>Verified events only</span>
      </div>
      <Surface padding="none">
        <ul className="divide-y divide-line">
          {players.map((p) => {
            const load = loadOf(p.userId);
            const ratio = load ? Math.min(1, load.loadRatio) : 0;
            return (
              <li key={p.userId} className="relative flex items-center gap-4 px-4 py-3 sm:px-5">
                <ProgressRing value={p.progress} size={44} strokeWidth={3} label={`${p.name}, level ${p.level}`} centerText={`L${p.level}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-fg">{p.name}</span>
                    {p.paused ? (
                      <span className="inline-flex h-5 items-center gap-1 rounded-[4px] border border-dashed border-line-strong px-1.5 text-[11px] font-medium text-fg-muted">
                        <Pause size={11} weight="bold" aria-hidden />
                        Paused
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[12px] capitalize text-fg-subtle">{p.role}</div>
                </div>
                <div className={cn("tabular inline-flex items-center gap-1.5 text-[15px] font-semibold", p.streakDays > 0 ? "text-fg" : "text-fg-subtle")} aria-label={`${p.streakDays} day streak`}>
                  <Flame size={16} weight={p.streakDays > 0 ? "fill" : "regular"} aria-hidden className={p.streakDays > 0 ? "text-perf-attention" : "text-fg-faint"} />
                  {formatCount(p.streakDays)}
                  <span className="text-[11px] font-medium text-fg-subtle">d</span>
                </div>
                {load ? (
                  <span
                    role="meter"
                    aria-label={`${p.name} load, next 7 days`}
                    aria-valuemin={0}
                    aria-valuemax={load.availableMinutes}
                    aria-valuenow={load.totalMinutes}
                    aria-valuetext={load.explanation}
                    className="absolute inset-x-4 bottom-0 h-px bg-line sm:inset-x-5"
                  >
                    <span className="block h-full bg-accent" style={{ width: `${ratio * 100}%` }} />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Surface>
    </div>
  );
}
