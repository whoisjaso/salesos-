import { describe, expect, it } from "vitest";
import { add, sub, fromDollars, formatMoney, formatMinorPerUnit, formatPercentagePointChange, CurrencyMismatchError, scale } from "@/domain/money";

describe("money", () => {
  it("adds and subtracts in minor units", () => {
    expect(add(fromDollars(10_000), fromDollars(2_000))).toEqual({ amountMinor: 1_200_000, currency: "USD" });
    expect(sub(fromDollars(10_000), fromDollars(2_000))).toEqual({ amountMinor: 800_000, currency: "USD" });
  });

  it("throws on currency mismatch instead of guessing a rate", () => {
    expect(() => add(fromDollars(1, "USD"), fromDollars(1, "EUR"))).toThrow(CurrencyMismatchError);
    expect(() => sub(fromDollars(1, "USD"), fromDollars(1, "CAD"))).toThrow(/Currency mismatch/);
  });

  it("formats $686,000 from minor units", () => {
    expect(formatMoney({ amountMinor: 68_600_000, currency: "USD" })).toBe("$686,000");
    expect(formatMoney({ amountMinor: 123_400_000, currency: "USD" })).toBe("$1,234,000");
    expect(formatMoney({ amountMinor: 531_783, currency: "USD" })).toBe("$5,317.83");
    expect(formatMoney({ amountMinor: -120_000, currency: "USD" })).toBe("-$1,200");
  });

  it("formats money-per-unit ratios and N/A", () => {
    expect(formatMinorPerUnit(68_600_000 / 129)).toBe("$5,317.83");
    expect(formatMinorPerUnit(null)).toBe("N/A");
  });

  it("uses percentage points, not relative percent", () => {
    expect(formatPercentagePointChange(0.5, 0.6)).toBe("+10.0 percentage points");
  });

  it("scales and rounds to a minor unit", () => {
    expect(scale(fromDollars(4_800), 0.05)).toEqual({ amountMinor: 24_000, currency: "USD" });
  });
});
