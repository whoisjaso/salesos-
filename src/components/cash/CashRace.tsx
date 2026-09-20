"use client";

import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import type { CashRaceEntry } from "@/domain/cashTiers";
import { Avatar } from "@/components/ui/Avatar";
import { Surface } from "@/components/ui/Surface";
import { useRepCard } from "@/components/profile/RepCardSheet";
import { cn } from "@/lib/cn";
import { formatCompact } from "@/lib/format";

export interface CashRaceProps {
  entries: CashRaceEntry[];
  meId: string;
  seasonName: string;
  currency?: string;
}

/** "$9.2k" style. Whole thousands stay short. */
export function compactMoney(amountMinor: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${formatCompact(amountMinor / 100).replace(/K$/, "k").replace(/M$/, "m")}`;
}

/** Teammates by net collected cash: avatar, tier mark, amount. No commission for anyone. Tap an avatar for the card, the header for the board. */
export function CashRace({ entries, meId, seasonName, currency = "USD" }: CashRaceProps) {
  const reduce = useReducedMotion();
  const { openCard } = useRepCard();
  return (
    <Surface padding="none" as="section" aria-label="Cash race">
      <Link href="/team" className="flex items-start justify-between gap-3 rounded-t-[inherit] px-4 pt-4 pb-1 transition-colors hover:bg-hover motion-reduce:transition-none">
        <span className="min-w-0">
          <span className="flex items-baseline gap-2">
            <span className="text-[14px] font-semibold text-fg">Race</span>
            <span className="text-[12px] text-fg-subtle">{seasonName}</span>
          </span>
          <span className="mt-0.5 block text-[12px] text-fg-subtle">Net collected cash on the opportunities each rep owns. No commission is shown for anyone.</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-[12px] text-fg-subtle">
          Board
          <CaretRight size={12} weight="bold" aria-hidden />
        </span>
      </Link>
      <ol className="flex gap-2 overflow-x-auto px-4 pt-2 pb-4 [scrollbar-width:none]" aria-label="Ranked by net collected cash">
        {entries.map((e, i) => {
          const me = e.userId === meId;
          return (
            <motion.li
              key={`${e.userId}:${e.role}`}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] }}
              className="flex w-[64px] shrink-0 flex-col items-center"
            >
              <Avatar userId={e.userId} size={48} badge={e.tier} onOpenCard={openCard} className={cn(me && "ring-2 ring-accent ring-offset-2 ring-offset-raised")} />
              <span className="tabular mt-2 text-[12.5px] font-semibold leading-none text-fg">{compactMoney(e.netCollectedMinor, currency)}</span>
              <span className="mt-1 max-w-full truncate text-[10.5px] text-fg-subtle">{me ? "You" : e.displayName.split(" ")[0]}</span>
              <span className="sr-only">
                Rank {e.rank}, {e.role}, {e.tier.label} tier, net collected cash in {seasonName}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </Surface>
  );
}
