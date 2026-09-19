"use client";

import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { Barbell, CalendarCheck, ChatCircleDots, Coins, Handshake, SealCheck, Signature, VideoCamera } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import type { GameEventKind } from "@/domain/game";
import { Surface } from "@/components/ui/Surface";
import { formatRelativeTime } from "@/lib/format";
import type { RecentWin } from "./today-model";

const ICON: Record<GameEventKind, ComponentType<IconProps>> = {
  two_way_contact: ChatCircleDots,
  retained_booking: CalendarCheck,
  attended_show: VideoCamera,
  verified_fit: SealCheck,
  contract_signed: Signature,
  cash_collected: Coins,
  handoff_accepted: Handshake,
  practice_completed: Barbell,
};

const ease = [0.16, 1, 0.3, 1] as const;

/** Last five verified events. Icon, label, XP, when. */
export function RecentWins({ wins, now, personKey }: { wins: RecentWin[]; now: string; personKey: string }) {
  const reduce = useReducedMotion();
  return (
    <Surface padding="lg" className="flex flex-col gap-4">
      <h2 className="text-[13px] font-medium text-fg-muted">Recent wins</h2>
      {wins.length === 0 ? (
        <p className="text-[14px] text-fg-subtle">No verified events yet this season.</p>
      ) : (
        <ol className="flex flex-col" key={personKey}>
          {wins.map((w, i) => {
            const Icon = ICON[w.kind];
            return (
              <motion.li
                key={`${w.kind}-${w.evidenceRef}`}
                initial={reduce ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.07, ease }}
                className="flex items-center gap-3 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0"
              >
                <span aria-hidden className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                  <Icon size={18} weight="fill" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium leading-tight text-fg">{w.label}</span>
                  <span className="tabular block text-[12px] text-fg-subtle">{formatRelativeTime(w.occurredAt, now)}</span>
                </span>
                <span className="tabular shrink-0 text-[14px] font-semibold text-[color:var(--perf-strong-fg)]">+{w.xp} XP</span>
              </motion.li>
            );
          })}
        </ol>
      )}
    </Surface>
  );
}
