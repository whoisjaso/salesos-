"use client";

import { Flask, Question } from "@phosphor-icons/react";
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
   * inferred from an empty list and never defaulted: the caller must state it
   * (docs/DECISIONS.md "Never show a list that looks ranked...",
   * docs/PAYMENTS_AUDIT.md H5).
   */
  available: boolean;
  /**
   * Set when the ledger behind these drops is the labelled synthetic fixture
   * rather than a processor feed (AGENTS.md rule 9).
   */
  synthetic?: boolean;
  /** What is holding the feed, when something is. Shown where the figure is read. */
  heldNote?: string;
}

/** The last five collected payments on the rep's opportunities. Ledger facts only. */
export function RecentDrops({ drops, tier, now, currency = "USD", period = "this month", available, synthetic = false, heldNote }: RecentDropsProps) {
  const reduce = useReducedMotion();
  const shown = drops.slice(0, 5);
  return (
    <Surface padding="none" as="section" aria-label="Cash collected">
      <div className="px-4 pt-4">
        <p className="text-[14px] font-semibold text-fg">Cash collected</p>
        {/*
          Say the basis, because the net figure elsewhere is computed on it. This
          feed lists processor-confirmed collections only; refunds and dispute
          debits never appear here as a positive amount, and they are already
          subtracted from the net figure.
        */}
        <p className="mt-0.5 text-[12px] text-fg-subtle">
          {period}, processor-confirmed payments only. Refunds are not listed here and are already subtracted from the net figure. This is company cash, not your pay.
        </p>
        {synthetic ? (
          <p className="mt-1 flex items-start gap-1.5 text-[12px] text-fg-subtle">
            <Flask size={13} weight="bold" aria-hidden className="mt-[2px] shrink-0" />
            <span>Synthetic fixture ledger. No payment provider is connected in this build.</span>
          </p>
        ) : null}
      </div>
      {shown.length > 0 ? (
        <>
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
          {/* A held feed still shows what it read. It says so rather than hiding it. */}
          {!available ? (
            <p className="flex items-start gap-1.5 px-4 pb-4 text-[12px] text-fg-muted">
              <Question size={13} weight="bold" aria-hidden className="mt-[2px] shrink-0" />
              {/*
                The standing claim comes first and is never replaced: a feed
                that was not fully read may be missing payments, whatever the
                reason. The caller's note explains which hold it is; without it
                the fallback still states the effect. Passing a note used to
                suppress the "may be incomplete" lead-in entirely, so a held
                list presented itself as complete and only mentioned a hold.
              */}
              <span>This list may be incomplete. {heldNote ?? `${MONEY_NOT_AVAILABLE} for part of ${period}.`}</span>
            </p>
          ) : null}
        </>
      ) : available ? (
        <div className="px-4 pt-3 pb-4">
          <p className="tabular text-[15px] font-medium text-fg">{formatMoneyMinor(0, currency)} collected in {period}</p>
          <p className="mt-0.5 text-[12px] text-fg-subtle">No payments landed on your opportunities. This is a verified zero.</p>
        </div>
      ) : (
        <p className="flex items-start gap-1.5 px-4 pt-3 pb-4 text-[13px] text-fg-muted">
          <Question size={14} weight="bold" aria-hidden className="mt-[2px] shrink-0" />
          <span>{MONEY_NOT_AVAILABLE}. {heldNote ?? "Nothing here is a zero; the feed has not been read."}</span>
        </p>
      )}
    </Surface>
  );
}
