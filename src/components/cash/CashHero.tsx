"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react";
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
import { Sheet } from "@/components/ui/Sheet";
import { Surface } from "@/components/ui/Surface";
import { formatCount, formatMoneyMinor } from "@/lib/format";
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
  /** Extra sections for the Details sheet, after the commission figures. */
  details?: ReactNode;
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

/** Dashed chip that every commission figure carries until a real agreement lands (D06). */
export function HypotheticalChip({ className }: { className?: string }) {
  return (
    <span className={`inline-flex h-5 shrink-0 items-center rounded-[4px] border border-dashed border-line-strong px-1.5 text-[11px] font-medium text-fg-muted ${className ?? ""}`}>
      Hypothetical policy
    </span>
  );
}

/**
 * The rep's own money this month: one tier mark, one number, one bar with one caption, one action.
 * Tapping the hero opens Details: the hypothetical-policy notice, accrued, eligible and paid,
 * the next tier's threshold, commission per attended appointment, and whatever the caller adds.
 */
export function CashHero({ summary, policy = DEFAULT_TIER_POLICY, details }: CashHeroProps) {
  const reduce = useReducedMotion();
  const preview = usePreviewTier(policy);
  const [open, setOpen] = useState(false);

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
  const caption = next ? `${money(next.remainingMinor)} to ${next.tier.label}` : "Top tier";

  const bodyRef = useRef<HTMLDivElement>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const previousTotal = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) return;
    const prev = previousTotal.current;
    previousTotal.current = total;
    if (prev !== null && total <= prev) return;
    const travel = (bodyRef.current?.offsetHeight ?? 240) + 120;
    const count = 44 + Math.floor(Math.random() * 17);
    const stamp = Date.now();
    setDrops(
      Array.from({ length: count }, (_, i) => ({
        id: `${stamp}-${i}`,
        x: -2 + Math.random() * 104,
        delay: Math.random() * 1.4,
        size: 22 + Math.random() * 26,
        rotate: (Math.random() - 0.5) * 540,
        travel,
      })),
    );
    const timer = window.setTimeout(() => setDrops([]), 4200);
    return () => window.clearTimeout(timer);
  }, [total, reduce]);

  const DropIcon = DROP_ICON[tier.id];
  const perAttended = shown.perAttended;

  return (
    <>
      <Surface padding="none" as="section" aria-label="This month" className="overflow-hidden">
        <div ref={bodyRef} className="relative p-4 sm:p-5">
          {drops.length > 0 ? (
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <motion.div
                className="absolute inset-0"
                style={{ background: `radial-gradient(60% 50% at 20% 30%, color-mix(in srgb, ${tier.hue} 34%, transparent), transparent 70%)` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 2.4, times: [0, 0.2, 1], ease: "easeOut" }}
              />
              {drops.map((d, i) => {
                const dur = 1.5 + (i % 5) * 0.18;
                const sway = (i % 2 === 0 ? 1 : -1) * (10 + (i % 4) * 8);
                return (
                  <motion.span
                    key={d.id}
                    className="absolute"
                    style={{ left: `${d.x}%`, top: -56, color: tier.hue, filter: `drop-shadow(0 6px 14px color-mix(in srgb, ${tier.hue} 55%, transparent))` }}
                    initial={{ y: 0, x: 0, opacity: 0, rotate: 0, scale: 0.4 }}
                    animate={{ y: d.travel, x: [0, sway, -sway, 0], opacity: [0, 0.95, 0.95, 0.85, 0], rotate: d.rotate, scale: [0.4, 1.15, 1, 1, 0.9] }}
                    transition={{
                      duration: dur,
                      delay: d.delay,
                      ease: [0.3, 0, 0.8, 0.4],
                      x: { duration: dur, delay: d.delay, ease: "easeInOut" },
                      opacity: { duration: dur, delay: d.delay, times: [0, 0.1, 0.6, 0.85, 1] },
                      scale: { duration: dur, delay: d.delay, times: [0, 0.12, 0.3, 0.85, 1] },
                    }}
                  >
                    <DropIcon size={d.size} weight="fill" />
                  </motion.span>
                );
              })}
            </div>
          ) : null}

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease }}
            className="relative flex flex-col gap-4"
          >
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="-m-2 flex flex-col gap-4 rounded-md p-2 text-left transition-colors hover:bg-hover active:bg-hover motion-reduce:transition-none"
            >
              <span className="flex items-center gap-4">
                <motion.span
                  className="inline-flex"
                  animate={drops.length > 0 && !reduce ? { scale: [1, 1.18, 0.96, 1.06, 1], rotate: [0, -6, 5, -2, 0] } : { scale: 1, rotate: 0 }}
                  transition={{ duration: 1.1, ease: "easeOut" }}
                >
                  <TierBadge tier={tier} size={64} />
                </motion.span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium" style={{ color: tier.hue }}>
                    {tier.label}
                  </span>
                  <span className="tabular mt-1 block text-[38px] font-semibold leading-none tracking-tight text-fg sm:text-[44px]">
                    <CountUp value={total} format={money} delay={0.1} />
                  </span>
                </span>
              </span>

              <span className="block">
                <span
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((next ? next.progress : 1) * 100)}
                  aria-label={caption}
                  className="block h-1.5 w-full overflow-hidden rounded-full bg-sunken"
                >
                  <motion.span
                    className="block h-full rounded-full"
                    style={{ backgroundColor: next ? next.tier.hue : tier.hue }}
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${Math.max(2, (next ? next.progress : 1) * 100)}%` }}
                    transition={{ duration: 0.8, delay: 0.2, ease }}
                  />
                </span>
                <span className="tabular mt-1.5 flex items-center justify-between text-[12px] text-fg-subtle">
                  <span>{caption}</span>
                  <span className="inline-flex items-center gap-0.5">
                    Details
                    <CaretRight size={12} weight="bold" aria-hidden />
                  </span>
                </span>
              </span>
            </button>

            <Button href="/" className="w-full sm:w-auto sm:self-start">
              Collect more
            </Button>
          </motion.div>
        </div>
      </Surface>

      <Sheet open={open} onClose={() => setOpen(false)} title="This month" description={`${tier.label} tier, ${money(total)}`} width={480}>
        <div className="flex flex-col gap-5">
          {shown.hypothetical || preview ? (
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-muted">
              {preview ? <span className="inline-flex h-5 items-center rounded-[4px] border border-dashed border-line-strong px-1.5 text-[11px] font-medium text-fg-muted">Preview</span> : null}
              {shown.hypothetical ? <span>Hypothetical policy: rates are placeholders until a real commission agreement lands.</span> : null}
            </p>
          ) : null}

          <section aria-label="Commission by state" className="surface">
            <dl className="divide-y divide-line">
              <FigureRow label="Accrued" value={money(shown.accruedMinor)} hypothetical={shown.hypothetical} />
              <FigureRow label="Eligible" value={money(shown.eligibleMinor)} hypothetical={shown.hypothetical} />
              <FigureRow label="Paid" value={money(shown.paidMinor)} hypothetical={shown.hypothetical} />
              <FigureRow
                label="Per attended appointment"
                value={perAttended.value === null ? "N/A" : formatMoneyMinor(Math.round(perAttended.value), currency, { cents: true })}
                detail={`${formatMoneyMinor(perAttended.numerator, currency)} over ${formatCount(perAttended.denominator)} attended`}
                hypothetical={shown.hypothetical}
              />
            </dl>
          </section>

          <section aria-label="Tier" className="surface">
            <dl className="divide-y divide-line">
              <FigureRow label="Tier" value={<span className="inline-flex items-center gap-1.5"><TierBadge tier={tier} size={16} />{tier.label}</span>} />
              {next ? (
                <FigureRow label="Next tier" value={<span className="inline-flex items-center gap-1.5"><TierBadge tier={next.tier} size={16} />{`${next.tier.label} at ${money(next.tier.minMinor)}`}</span>} detail={caption} />
              ) : (
                <FigureRow label="Next tier" value="Top tier" />
              )}
            </dl>
          </section>

          {details}
        </div>
      </Sheet>
    </>
  );
}

function FigureRow({ label, value, detail, hypothetical }: { label: string; value: ReactNode; detail?: string; hypothetical?: boolean }) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-4 py-2.5">
      <dt className="min-w-0 flex-1">
        <span className="block text-[14px] text-fg">{label}</span>
        {detail ? <span className="tabular block text-[12px] text-fg-subtle">{detail}</span> : null}
      </dt>
      <dd className="flex shrink-0 items-center gap-2">
        {hypothetical ? <HypotheticalChip /> : null}
        <span className="tabular text-[15px] font-medium text-fg">{value}</span>
      </dd>
    </div>
  );
}
