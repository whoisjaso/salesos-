"use client";

import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import type { CashRaceEntry } from "@/domain/cashTiers";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import { formatCompact, initialsOf } from "@/lib/format";
import { TierBadge } from "./TierBadge";

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

/** Teammates by net collected cash: avatar, tier mark, amount. No commission for anyone. Tap for the board. */
export function CashRace({ entries, meId, seasonName, currency = "USD" }: CashRaceProps) {
  const reduce = useReducedMotion();
  return (
    <Surface padding="none" as="section" aria-label="Cash race">
      <Link href="/team" className="block rounded-[inherit] transition-colors hover:bg-hover motion-reduce:transition-none">
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold text-fg">Race</span>
            <span className="text-[12px] text-fg-subtle">{seasonName}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-[12px] text-fg-subtle">
            Net collected
            <CaretRight size={12} weight="bold" aria-hidden />
          </span>
        </div>
        <ol className="flex gap-2 overflow-x-auto px-4 pt-3 pb-4 [scrollbar-width:none]" aria-label="Ranked by net collected cash">
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
                <span className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      "inline-grid h-11 w-11 place-items-center rounded-full text-[13px] font-semibold",
                      me ? "bg-accent text-accent-fg ring-2 ring-accent ring-offset-2 ring-offset-raised" : "bg-sunken text-fg-muted",
                    )}
                  >
                    {initialsOf(e.displayName)}
                  </span>
                  <TierBadge tier={e.tier} size={18} className="absolute -right-1 -bottom-1 ring-2 ring-raised" />
                </span>
                <span className="tabular mt-2 text-[12.5px] font-semibold leading-none text-fg">{compactMoney(e.netCollectedMinor, currency)}</span>
                <span className="mt-1 max-w-full truncate text-[10.5px] text-fg-subtle">
                  {me ? "You" : e.displayName.split(" ")[0]}
                </span>
                <span className="sr-only">
                  Rank {e.rank}, {e.role}, {e.tier.label} tier
                </span>
              </motion.li>
            );
          })}
        </ol>
      </Link>
    </Surface>
  );
}
