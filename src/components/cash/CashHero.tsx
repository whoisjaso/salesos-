"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  DEFAULT_TIER_POLICY,
  nextTier,
  tierFor,
  type CashTierId,
  type CommissionSummary,
  type TierPolicy,
} from "@/domain/cashTiers";
import { Button } from "@/components/ui/Button";
import { CountUp } from "@/components/ui/CountUp";
import { Surface } from "@/components/ui/Surface";
import { formatMoneyMinor } from "@/lib/format";
import { DROP_ICON, TierBadge } from "./TierBadge";

/**
 * Preview hook: when localStorage "sos-tier-demo" holds a tier id, the hero
 * renders that tier at its minimum amount with a "Preview" chip. Reads only,
 * changes no data, and is harmless in production because nothing sets it.
 */
export const TIER_PREVIEW_KEY = "sos-tier-demo";

const ease = [0.16, 1, 0.3, 1] as const;

export interface CashHeroProps {
  summary: CommissionSummary;
  policy?: TierPolicy;
}

interface Drop {
  id: string;
  x: number;
  delay: number;
  size: number;
  rotate: number;
  travel: number;
}

function readPreviewRaw(): string | null {
  try {
    return window.localStorage.getItem(TIER_PREVIEW_KEY);
  } catch {
    return null;
  }
}

function subscribePreview(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** Server render and first client paint both see null; the stored value applies after hydration. */
function usePreviewTier(policy: TierPolicy): CashTierId | null {
  const raw = useSyncExternalStore(subscribePreview, readPreviewRaw, () => null);
  return raw && policy.tiers.some((t) => t.id === raw) ? (raw as CashTierId) : null;
}

/** The rep's own money this month: tier mark, commission by state, distance to the next tier, one action. */
export function CashHero({ summary, policy = DEFAULT_TIER_POLICY }: CashHeroProps) {
  const reduce = useReducedMotion();
  const preview = usePreviewTier(policy);

  const shown = useMemo<CommissionSummary>(() => {
    if (!preview) return summary;
    const min = policy.tiers.find((t) => t.id === preview)?.minMinor ?? 0;
    return { ...summary, accruedMinor: 0, eligibleMinor: min, paidMinor: 0, totalMinor: min };
  }, [preview, summary, policy]);

  const total = shown.totalMinor;
  const currency = shown.currency;
  const tier = tierFor(total, policy);
  const next = nextTier(total, policy);
  const money = (n: number) => formatMoneyMinor(Math.round(n), currency);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const previousTotal = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) return;
    const prev = previousTotal.current;
    previousTotal.current = total;
    if (prev !== null && total <= prev) return;
    const travel = (bodyRef.current?.offsetHeight ?? 240) + 72;
    const count = 14 + Math.floor(Math.random() * 11);
    const stamp = Date.now();
    setDrops(
      Array.from({ length: count }, (_, i) => ({
        id: `${stamp}-${i}`,
        x: 3 + Math.random() * 94,
        delay: Math.random() * 0.8,
        size: 13 + Math.random() * 11,
        rotate: (Math.random() - 0.5) * 70,
        travel,
      })),
    );
    const timer = window.setTimeout(() => setDrops([]), 2600);
    return () => window.clearTimeout(timer);
  }, [total, reduce]);

  const DropIcon = DROP_ICON[tier.id];

  return (
    <Surface padding="none" as="section" aria-label="This month" className="overflow-hidden">
      <div ref={bodyRef} className="relative p-5 sm:p-6">
        {drops.length > 0 ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {drops.map((d) => (
              <motion.span
                key={d.id}
                className="absolute"
                style={{ left: `${d.x}%`, top: -36, color: tier.hue }}
                initial={{ y: 0, opacity: 0, rotate: 0 }}
                animate={{ y: d.travel, opacity: [0, 0.38, 0.38, 0], rotate: d.rotate }}
                transition={{ duration: 1.2, delay: d.delay, ease: "easeIn", opacity: { duration: 1.2, delay: d.delay, times: [0, 0.15, 0.7, 1] } }}
              >
                <DropIcon size={d.size} weight="duotone" />
              </motion.span>
            ))}
          </div>
        ) : null}

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease }}
          className="relative flex flex-col gap-5"
        >
          <div className="flex items-start gap-4">
            <TierBadge tier={tier} size={72} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">This month</span>
                <span className="text-[12px] font-medium" style={{ color: tier.hue }}>
                  {tier.label}
                </span>
              </div>
              <div className="tabular mt-1 text-[38px] font-semibold leading-none tracking-tight text-fg sm:text-[44px]">
                <CountUp value={total} format={money} delay={0.1} />
              </div>
              {shown.hypothetical || preview ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {shown.hypothetical ? (
                    <span className="inline-flex h-5 items-center rounded-[4px] border border-dashed border-line-strong px-1.5 text-[11px] text-fg-muted">Hypothetical policy</span>
                  ) : null}
                  {preview ? <span className="inline-flex h-5 items-center rounded-[4px] border border-dashed border-line-strong px-1.5 text-[11px] text-fg-muted">Preview</span> : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="-mt-1 flex flex-wrap items-center gap-1.5" aria-label="Commission by state">
            <StatePill label="Accrued" value={money(shown.accruedMinor)} />
            <StatePill label="Eligible" value={money(shown.eligibleMinor)} />
            <StatePill label="Paid" value={money(shown.paidMinor)} />
          </div>

          <div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((next ? next.progress : 1) * 100)}
              aria-label={next ? `${money(next.remainingMinor)} to ${next.tier.label}` : "Top tier"}
              className="h-1.5 w-full overflow-hidden rounded-full bg-sunken"
            >
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: next ? next.tier.hue : tier.hue }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.max(2, (next ? next.progress : 1) * 100)}%` }}
                transition={{ duration: 0.8, delay: 0.2, ease }}
              />
            </div>
            <div className="tabular mt-1.5 flex items-center justify-between text-[12px] text-fg-subtle">
              <span>{next ? `${money(next.remainingMinor)} to ${next.tier.label}` : "Top tier"}</span>
              {next ? (
                <span className="inline-flex items-center gap-1">
                  <TierBadge tier={next.tier} size={16} />
                  {money(next.tier.minMinor)}
                </span>
              ) : null}
            </div>
          </div>

          <Button href="/" className="w-full sm:w-auto sm:self-start">
            Collect more
          </Button>
        </motion.div>
      </div>
    </Surface>
  );
}

function StatePill({ label, value }: { label: string; value: string }) {
  return (
    <span className="tabular inline-flex h-5 items-center gap-1 rounded-[4px] bg-hover px-1.5 text-[11px] text-fg-muted">
      {label}
      <span className="font-medium text-fg">{value}</span>
    </span>
  );
}
