"use client";

import { motion, useReducedMotion } from "motion/react";
import type { CashDrop, CashTier } from "@/domain/cashTiers";
import { Surface } from "@/components/ui/Surface";
import { formatMoneyMinor, formatRelativeTime } from "@/lib/format";
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
}

/** The last five collected payments on the rep's opportunities. Ledger facts only. */
export function RecentDrops({ drops, tier, now, currency = "USD" }: RecentDropsProps) {
  const reduce = useReducedMotion();
  const shown = drops.slice(0, 5);
  return (
    <Surface padding="none" as="section" aria-label="Recent cash">
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="text-[15px] font-semibold text-fg">Cash in</span>
        <span className="text-[12px] text-fg-subtle">Ledger</span>
      </div>
      {shown.length === 0 ? (
        <p className="px-4 pt-2 pb-4 text-[13px] text-fg-subtle">No cash collected yet this month.</p>
      ) : (
        <ol className="px-4 pt-1 pb-2">
          {shown.map((d, i) => (
            <motion.li
              key={`${d.opportunityId}:${d.at}`}
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.08 * i, ease: [0.16, 1, 0.3, 1] }}
              className="flex h-11 items-center gap-3 border-b border-line last:border-b-0"
            >
              <TierBadge tier={tier} size={24} />
              <span className="tabular w-[84px] shrink-0 text-[15px] font-semibold text-fg">+{formatMoneyMinor(d.amountMinor, currency)}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">{d.organizationName ?? d.opportunityId}</span>
              <span className="shrink-0 text-[12px] text-fg-subtle">{formatRelativeTime(d.at, now)}</span>
            </motion.li>
          ))}
        </ol>
      )}
    </Surface>
  );
}
