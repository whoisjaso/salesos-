/**
 * Display formatting. Full precision stays in the domain layer; these only
 * decide how a number reads on screen (SOS-20 "Display precision").
 */

import type { Money, RevenueBasis } from "@/domain/types";

export interface PercentOptions {
  /** Decimal digits. Default 1, e.g. "83.5%". */
  digits?: number;
}

/** Ratio (0..1) to "83.5%". null reads as "N/A". */
export function formatPercent(value: number | null | undefined, opts: PercentOptions = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  const digits = opts.digits ?? 1;
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * Percentage-point delta between two ratios, e.g. 0.50 to 0.60 reads "+10.0 pts".
 * Never a relative percent change (SOS-20).
 */
export function formatPoints(deltaRatio: number | null | undefined, opts: PercentOptions = {}): string {
  if (deltaRatio === null || deltaRatio === undefined || Number.isNaN(deltaRatio)) return "N/A";
  const digits = opts.digits ?? 1;
  const pts = deltaRatio * 100;
  const sign = pts > 0 ? "+" : pts < 0 ? "-" : "";
  return `${sign}${Math.abs(pts).toFixed(digits)} pts`;
}

export interface MoneyOptions {
  /** Show minor units. Default: only when the amount is not whole. */
  cents?: boolean;
  locale?: string;
}

/** Integer minor units to a currency string. 68600000 USD reads "$686,000". */
export function formatMoneyMinor(amountMinor: number, currency = "USD", opts: MoneyOptions = {}): string {
  const major = amountMinor / 100;
  const whole = Number.isInteger(major);
  const showCents = opts.cents ?? !whole;
  return new Intl.NumberFormat(opts.locale ?? "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(major);
}

export function formatMoney(money: Money, opts?: MoneyOptions): string {
  return formatMoneyMinor(money.amountMinor, money.currency, opts);
}

/** 1234 reads "1.2K", 686000 reads "686K", 12 reads "12". */
export function formatCompact(value: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** Grouped integer, "1,234". */
export function formatCount(value: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

/** "71 of 85" denominator line. */
export function formatFraction(numerator: number, denominator: number): string {
  return `${formatCount(numerator)} of ${formatCount(denominator)}`;
}

const RELATIVE_STEPS: { limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { limit: 60, divisor: 1, unit: "second" },
  { limit: 3600, divisor: 60, unit: "minute" },
  { limit: 86400, divisor: 3600, unit: "hour" },
  { limit: 604800, divisor: 86400, unit: "day" },
  { limit: 2629800, divisor: 604800, unit: "week" },
  { limit: 31557600, divisor: 2629800, unit: "month" },
  { limit: Infinity, divisor: 31557600, unit: "year" },
];

/** "3 minutes ago", "in 2 days". `now` is injectable for deterministic rendering. */
export function formatRelativeTime(iso: string, now: Date | string = new Date(), locale = "en-US"): string {
  const then = new Date(iso).getTime();
  const ref = typeof now === "string" ? new Date(now).getTime() : now.getTime();
  if (Number.isNaN(then) || Number.isNaN(ref)) return "unknown time";
  const diffSeconds = Math.round((then - ref) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 10) return "just now";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  for (const step of RELATIVE_STEPS) {
    if (abs < step.limit) {
      return rtf.format(Math.round(diffSeconds / step.divisor), step.unit);
    }
  }
  return "unknown time";
}

/** "Aug 31, 2026, 09:00 UTC" for as-of stamps. */
export function formatAsOf(iso: string, locale = "en-US"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(d)} UTC`;
}

export const REVENUE_BASIS_LABEL: Record<RevenueBasis, string> = {
  reported_revenue: "Reported revenue",
  contracted_value: "Contracted value",
  net_collected_cash: "Net collected cash",
};

export function formatBasis(basis: RevenueBasis): string {
  return REVENUE_BASIS_LABEL[basis];
}
