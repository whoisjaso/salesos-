"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { ArrowRight, CaretRight, CheckCircle, CircleDashed, CircleHalf, Clock, Hourglass, Question, Warning, type IconProps } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import {
  DEFAULT_TIER_POLICY,
  commissionStatus,
  nextTier,
  tierFor,
  type CashTierId,
  type CommissionStatusId,
  type CommissionSummary,
  type ProvisionalNotice,
  type TierPolicy,
  type TierRole,
} from "@/domain/cashTiers";
import { Button } from "@/components/ui/Button";
import { CountUp } from "@/components/ui/CountUp";
import { Sheet } from "@/components/ui/Sheet";
import { StateChip } from "@/components/ui/StateChip";
import { Surface } from "@/components/ui/Surface";
import { MONEY_NOT_AVAILABLE, formatMoneyMinor, formatUnits } from "@/lib/format";
import { DROP_ICON, TierBadge } from "./TierBadge";

/**
 * Preview hook: when localStorage "sos-tier-demo" holds a tier id, the hero
 * renders that tier at its minimum amount with a "Preview" chip. Reads only,
 * changes no data, and is harmless in production because nothing sets it.
 */
export const TIER_PREVIEW_KEY = "sos-tier-demo";

const ease = [0.16, 1, 0.3, 1] as const;

/** Tiers are the game. This line says so wherever the mark appears. */
export const TIER_DISPLAY_NOTE = "Tiers are display only and never change pay";

/** Every money status has a word and a mark; colour is never the only signal. */
const STATUS_ICON: Record<CommissionStatusId, ComponentType<IconProps>> = {
  none: CircleDashed,
  pending: Hourglass,
  payable: Clock,
  paid: CheckCircle,
  mixed: CircleHalf,
};

export interface CashHeroAction {
  href: string;
  /** Names the destination. "Collect more" is not a destination. */
  label: string;
}

/** What Today actually opens for each role, so the primary action can say it. */
export const HERO_ACTION: Record<TierRole, CashHeroAction> = {
  setter: { href: "/", label: "Open call queue" },
  closer: { href: "/", label: "Open today's appointments" },
};

const DEFAULT_ACTION: CashHeroAction = { href: "/", label: "Open Today" };

export interface CashHeroProps {
  summary: CommissionSummary;
  policy?: TierPolicy;
  /** Whose bracket this is. Sets the default action, nothing else. */
  role?: TierRole;
  /** The period every figure on this card covers, in words. The kicker. */
  period?: string;
  /** Where the primary action goes and what it says it opens. */
  action?: CashHeroAction;
  /**
   * Set when a data incident makes these figures provisional. Rendered in
   * words on the hero and in Details, with what it is waiting on. Defaults to
   * null so the card is never provisional by accident.
   */
  provisional?: ProvisionalNotice | null;
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
 * The rep's own commission for the period: the period as the kicker, one money
 * figure, the status of that money in words, and one action that names where it
 * goes. The tier mark, the bar and the threshold are the game and say so.
 * Tapping opens Details: the hypothetical-policy notice, accrued, eligible and
 * paid, commission per attended appointment, every tier threshold, and whatever
 * the caller adds.
 */
export function CashHero({
  summary,
  policy = DEFAULT_TIER_POLICY,
  role,
  period = "This month",
  action,
  provisional = null,
  details,
}: CashHeroProps) {
  const reduce = useReducedMotion();
  const preview = usePreviewTier(policy);
  const [open, setOpen] = useState(false);
  const go = action ?? (role ? HERO_ACTION[role] : DEFAULT_ACTION);

  const shown = useMemo<CommissionSummary>(() => {
    if (!preview) return summary;
    const min = policy.tiers.find((t) => t.id === preview)?.minMinor ?? 0;
    return { ...summary, accruedMinor: 0, eligibleMinor: min, paidMinor: 0, totalMinor: min };
  }, [preview, summary, policy]);

  const total = shown.totalMinor;
  const currency = shown.currency;
  const tier = tierFor(total, policy);
  const next = nextTier(total, policy);
  const status = commissionStatus(shown);
  const StatusIcon = STATUS_ICON[status.id];
  const money = (n: number) => formatMoneyMinor(Math.round(n), currency);
  const tierLine = next ? `${tier.label} tier. Next: ${next.tier.label}` : `${tier.label} tier. Top tier`;
  const progressLabel = next ? `${money(next.remainingMinor)} of ${tier.label} to ${next.tier.label}, a display badge` : `${tier.label}, the top display badge`;

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
  const attendedDetail =
    perAttended.denominator === 0
      ? `${period}, no attended appointments to divide by yet`
      : `${period}, ${money(perAttended.numerator)} over ${formatUnits(perAttended.denominator, "attended appointment")}`;

  return (
    <>
      <Surface padding="none" as="section" aria-label={`Commission, ${period}`} className="overflow-hidden">
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
              aria-label={`${period} commission, ${money(total)}. ${status.label}.${provisional ? " Provisional." : ""} ${tierLine}. ${TIER_DISPLAY_NOTE}. Open details`}
              className="-m-2 flex flex-col gap-3.5 rounded-md p-2 text-left transition-colors hover:bg-hover active:bg-hover motion-reduce:transition-none"
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
                  <span className="block text-[12px] font-medium text-fg-subtle">{period}</span>
                  <span className="tabular mt-0.5 block text-[38px] font-semibold leading-none tracking-tight text-fg sm:text-[44px]">
                    <CountUp value={total} format={money} delay={0.1} />
                  </span>
                  <span className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug text-fg-muted">
                    <StatusIcon size={14} weight="bold" aria-hidden className="mt-[1px] shrink-0" />
                    <span>{status.label}</span>
                  </span>
                </span>
              </span>

              {provisional ? (
                <span className="flex items-start gap-1.5 text-[12px] leading-snug text-fg-muted">
                  <Warning size={13} weight="bold" aria-hidden className="mt-[2px] shrink-0 text-perf-attention" />
                  <span>
                    <span className="font-medium text-perf-attention">Provisional </span>
                    {provisional.waitingOn ? `until ${provisional.waitingOn}.` : provisional.statement}
                  </span>
                </span>
              ) : null}

              <span className="block">
                <span
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((next ? next.progress : 1) * 100)}
                  aria-label={progressLabel}
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
                <span className="mt-1.5 flex items-center justify-between gap-3 text-[12px] text-fg-subtle">
                  <span className="min-w-0 truncate">{tierLine}</span>
                  <span className="inline-flex shrink-0 items-center gap-0.5">
                    Details
                    <CaretRight size={12} weight="bold" aria-hidden />
                  </span>
                </span>
                <span className="mt-0.5 block text-[12px] text-fg-faint">{TIER_DISPLAY_NOTE}</span>
              </span>
            </button>

            <Button href={go.href} className="w-full sm:w-auto sm:self-start" trailing={<ArrowRight size={16} weight="bold" />}>
              {go.label}
            </Button>
          </motion.div>
        </div>
      </Surface>

      <Sheet open={open} onClose={() => setOpen(false)} title={`${period} commission`} description={status.label} width={480}>
        <div className="flex flex-col gap-5">
          {provisional ? (
            <Surface padding="md" state="attention" className="flex flex-col gap-2">
              <StateChip state="attention" label={provisional.label ? `${provisional.label} is provisional` : "Provisional"} className="self-start" />
              <p className="text-[13px] text-fg">{provisional.statement}</p>
              {provisional.waitingOn ? <p className="text-[13px] text-fg-muted">Provisional until {provisional.waitingOn}.</p> : null}
              <p className="text-[13px] text-fg-muted">
                {provisional.ownerLabel ? `${provisional.ownerLabel} owns that. ` : ""}
                Everything else on this screen is verified and keeps running.
              </p>
            </Surface>
          ) : null}

          <div className="flex flex-col gap-2">
            <p className="flex items-start gap-1.5 text-[13px] text-fg">
              <StatusIcon size={14} weight="bold" aria-hidden className="mt-[3px] shrink-0" />
              <span>{status.meaning}</span>
            </p>
            {shown.hypothetical || preview ? (
              <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-muted">
                {preview ? <span className="inline-flex h-5 items-center rounded-[4px] border border-dashed border-line-strong px-1.5 text-[11px] font-medium text-fg-muted">Preview</span> : null}
                {shown.hypothetical ? <span>Hypothetical policy: rates are placeholders until a real commission agreement lands. No figure here is a promise to pay.</span> : null}
              </p>
            ) : null}
          </div>

          <section aria-label="Commission by status" className="surface">
            <dl className="divide-y divide-line">
              <FigureRow
                label="Commission"
                amountMinor={total}
                currency={currency}
                detail={`${period}, accrued plus eligible plus paid`}
                hypothetical={shown.hypothetical}
              />
              <FigureRow
                label="Accrued"
                amountMinor={shown.accruedMinor}
                currency={currency}
                detail={`${period}, calculated on collected cash and not yet approved`}
                hypothetical={shown.hypothetical}
              />
              <FigureRow
                label="Eligible"
                amountMinor={shown.eligibleMinor}
                currency={currency}
                detail={`${period}, approved and waiting for the next payout`}
                hypothetical={shown.hypothetical}
              />
              <FigureRow
                label="Paid"
                amountMinor={shown.paidMinor}
                currency={currency}
                detail={`${period}, already paid out`}
                hypothetical={shown.hypothetical}
              />
              <FigureRow
                label="Per attended appointment"
                amountMinor={perAttended.value === null ? null : Math.round(perAttended.value)}
                currency={currency}
                cents
                absent={perAttended.denominator === 0 ? "No attended appointments yet" : MONEY_NOT_AVAILABLE}
                detail={attendedDetail}
                hypothetical={shown.hypothetical}
              />
            </dl>
          </section>

          <section aria-label="Tier thresholds" className="surface">
            <div className="px-4 pt-3.5 pb-2">
              <p className="text-[14px] font-semibold text-fg">Tiers</p>
              <p className="mt-0.5 text-[12px] text-fg-subtle">
                Set by your {period} commission. {TIER_DISPLAY_NOTE}.
              </p>
            </div>
            <ul className="divide-y divide-line">
              {[...policy.tiers]
                .sort((a, b) => a.minMinor - b.minMinor)
                .map((t) => {
                  const mine = t.id === tier.id;
                  const isNext = next?.tier.id === t.id;
                  return (
                    <li key={t.id} className="flex min-h-11 items-center gap-3 px-4 py-2">
                      <TierBadge tier={t} size={20} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[14px] ${mine ? "font-semibold text-fg" : "text-fg"}`}>
                          {t.label}
                          {mine ? " (yours now)" : isNext ? " (next)" : ""}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-[13px] text-fg-muted">{money(t.minMinor)} and up</span>
                    </li>
                  );
                })}
            </ul>
            <p className="px-4 pt-1 pb-3.5 text-[12px] text-fg-subtle">
              {next
                ? `${money(next.remainingMinor)} more commission in ${period} reaches ${next.tier.label}. Your pay does not change when it does.`
                : `${tier.label} is the top tier. Your pay does not change with a tier.`}
            </p>
          </section>

          {details}
        </div>
      </Sheet>
    </>
  );
}

interface FigureRowProps {
  label: string;
  /** Integer minor units, or null when the figure is genuinely absent. */
  amountMinor: number | null;
  currency: string;
  cents?: boolean;
  /** Words for the absent case. A verified zero never uses them. */
  absent?: string;
  detail?: string;
  hypothetical?: boolean;
}

function FigureRow({ label, amountMinor, currency, cents, absent, detail, hypothetical }: FigureRowProps) {
  return (
    <div className="flex min-h-12 items-start gap-3 px-4 py-2.5">
      <dt className="min-w-0 flex-1">
        <span className="block text-[14px] text-fg">{label}</span>
        {detail ? <span className="mt-0.5 block text-[12px] leading-snug text-fg-subtle">{detail}</span> : null}
      </dt>
      <dd className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
        <MoneyValue amountMinor={amountMinor} currency={currency} cents={cents} absent={absent} />
        {hypothetical ? <HypotheticalChip /> : null}
      </dd>
    </div>
  );
}

/**
 * A verified zero reads "$0.00" in the money face; a figure that is not there
 * reads as words in a lighter face with its own mark. The two never look alike.
 */
function MoneyValue({ amountMinor, currency, cents, absent }: { amountMinor: number | null; currency: string; cents?: boolean; absent?: string }) {
  if (amountMinor === null) {
    return (
      <span className="inline-flex max-w-[168px] items-start gap-1 text-right text-[12.5px] leading-snug font-normal text-fg-muted">
        <Question size={13} weight="bold" aria-hidden className="mt-[2px] shrink-0" />
        <span>{absent ?? MONEY_NOT_AVAILABLE}</span>
      </span>
    );
  }
  return <span className="tabular text-[15px] font-medium text-fg">{formatMoneyMinor(amountMinor, currency, { cents })}</span>;
}
