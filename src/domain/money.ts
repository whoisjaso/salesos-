/**
 * Money helpers. Money is integer minor units with an ISO currency (SOS-02).
 * Never combine currencies without an explicit conversion policy; these
 * helpers throw on mismatch rather than guessing.
 */
import type { Money } from "./types";

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Currency mismatch: ${a} vs ${b}. Cross-currency sums require a disclosed rate policy.`);
    this.name = "CurrencyMismatchError";
  }
}

function assertInteger(amountMinor: number): void {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`Money amountMinor must be an integer, received ${amountMinor}`);
  }
}

export function money(amountMinor: number, currency = "USD"): Money {
  assertInteger(amountMinor);
  return { amountMinor, currency };
}

export function zero(currency = "USD"): Money {
  return { amountMinor: 0, currency };
}

/** For fixtures only: whole dollars (or dollars with cents) into minor units. */
export function fromDollars(dollars: number, currency = "USD"): Money {
  const minor = Math.round(dollars * 100);
  return { amountMinor: minor, currency };
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function sub(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function sum(items: Money[], currency = "USD"): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency));
}

/** Multiply by a scalar and round to the nearest minor unit. */
export function scale(m: Money, factor: number): Money {
  return { amountMinor: Math.round(m.amountMinor * factor), currency: m.currency };
}

export function isZero(m: Money): boolean {
  return m.amountMinor === 0;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

export function toDollars(m: Money): number {
  return m.amountMinor / 100;
}

const SYMBOLS: Record<string, string> = { USD: "$", CAD: "CA$", EUR: "€", GBP: "£" };

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * formatMoney({amountMinor: 68600000, currency: "USD"}) -> "$686,000"
 * Cents are shown only when non-zero, or when `showCents` is true.
 */
export function formatMoney(m: Money, opts: { showCents?: boolean } = {}): string {
  const symbol = SYMBOLS[m.currency] ?? `${m.currency} `;
  const negative = m.amountMinor < 0;
  const abs = Math.abs(m.amountMinor);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  const showCents = opts.showCents === true || cents !== 0;
  const body = showCents
    ? `${groupThousands(String(dollars))}.${String(cents).padStart(2, "0")}`
    : groupThousands(String(dollars));
  return `${negative ? "-" : ""}${symbol}${body}`;
}

/** Format a ratio-of-money value (e.g. revenue per lead, already in minor units per unit). */
export function formatMinorPerUnit(minorPerUnit: number | null, currency = "USD", decimals = 2): string {
  if (minorPerUnit === null || !Number.isFinite(minorPerUnit)) return "N/A";
  const value = minorPerUnit / 100;
  const fixed = value.toFixed(decimals);
  const [intPart, frac] = fixed.split(".");
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  const sign = value < 0 ? "-" : "";
  return `${sign}${symbol}${groupThousands(intPart.replace("-", ""))}${frac ? "." + frac : ""}`;
}

export function formatPercent(ratio: number | null, decimals = 1): string {
  if (ratio === null || !Number.isFinite(ratio)) return "N/A";
  return `${(ratio * 100).toFixed(decimals)}%`;
}

/** "+10.0 percentage points", never "up 10%" (SOS-20). */
export function formatPercentagePointChange(fromRatio: number, toRatio: number, decimals = 1): string {
  const pp = (toRatio - fromRatio) * 100;
  const sign = pp > 0 ? "+" : pp < 0 ? "-" : "";
  return `${sign}${Math.abs(pp).toFixed(decimals)} percentage points`;
}
