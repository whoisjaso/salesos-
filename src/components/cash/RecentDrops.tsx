"use client";

import { Question } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import type { CashDrop, CashTier } from "@/domain/cashTiers";
import { Surface } from "@/components/ui/Surface";
import { MONEY_NOT_AVAILABLE, formatMoneyMinor, formatRelativeTime } from "@/lib/format";
import { TierBadge } from "./TierBadge";

export interface RecentDropItem extends CashDrop {
  organizationName?: string;
}

export interface RecentDropsProps {
  drops: RecentDropItem[];
  /** The rep's current tier; every drop wears its mark. */
  tier: CashTier;
  now: string;
  currency?: string;
  /** The period these payments cover, in words. */
  period?: string;
  /**
   * False when the payment feed could not be read. A verified zero and a
   * missing figure are different words in different weights, so this is never
   * inferred from an empty list.
   */
  available?: boolean;
}

/** The last five collected payments on the rep's opportunities. Ledger facts only. */
export function RecentDrops({ drops, tier, now, currency = "USD", period = "this month", available = true }: RecentDropsProps) {
  const reduce = useReducedMotion();
  const shown = drops.slice(0, 5);
  return (
    <Surface padding="none" as="section" aria-label="Cash collected">
      <div className="px-4 pt-4">
        <p className="text-[14px] font-semibold text-fg">Cash collected</p>
        <p className="mt-0.5 text-[12px] text-fg-subtle">{period}, from the payment ledger. This is company cash, not your pay.</p>
      </div>
      {!available ? (
        <p className="flex items-start gap-1.5 px-4 pt-3 pb-4 text-[13px] text-fg-muted">
          <Question size={14} weight="bold" aria-hidden className="mt-[2px] shrink-0" />
          <span>{MONEY_NOT_AVAILABLE}. Nothing here is a zero; the feed has not been read.</span>
        </p>
      ) : shown.length === 0 ? (
        <div className="px-4 pt-3 pb-4">
          <p className="tabular text-[15px] font-medium text-fg">{formatMoneyMinor(0, currency)} collected in {period}</p>
          <p className="mt-0.5 text-[12px] text-fg-subtle">No payments landed on your opportunities. This is a verified zero.</p>
        </div>
      ) : (
        <ol className="px-4 pt-2 pb-2">
          {shown.map((d, i) => (
            <motion.li
              key={`${d.opportunityId}:${d.at}`}
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.08 * i, ease: [0.16, 1, 0.3, 1] }}
              className="flex h-11 items-center gap-3 border-b border-line last:border-b-0"
            >
              <TierBadge tier={tier} size={24} />
              <span className="tabular w-[84px] shrink-0 text-[14px] font-semibold text-fg">+{formatMoneyMinor(d.amountMinor, currency)}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">{d.organizationName ?? d.opportunityId}</span>
              <span className="shrink-0 text-[12px] text-fg-subtle">{formatRelativeTime(d.at, now)}</span>
            </motion.li>
          ))}
        </ol>
      )}
    </Surface>
  );
}
