import { describe, expect, it } from "vitest";
import {
  counterfactualRevenueAtLeads,
  deriveSourceMetrics,
  sourceColumn,
  sourceFunnelText,
  sourceSheetColumns,
  sourceSheetTotals,
} from "@/fixtures/sourceSheet";

describe("SOS-01 source sheet reproduction", () => {
  const ben = sourceColumn("ben");
  const hv = sourceColumn("rep_high_volume");

  it("reads the corrected two-column fixture", () => {
    expect([ben.leads, ben.retainedBookings, ben.shows, ben.perceivedQualified, ben.wins]).toEqual([129, 85, 71, 58, 21]);
    expect([hv.leads, hv.retainedBookings, hv.shows, hv.perceivedQualified, hv.wins]).toEqual([776, 475, 159, 109, 39]);
    expect(hv.shows).toBe(159); // not 150
    expect(ben.leadTier).toBe(1);
    expect(hv.leadTier).toBe(2);
    expect(ben.reportedRevenue.amountMinor).toBe(68_600_000);
    expect(hv.reportedRevenue.amountMinor).toBe(123_400_000);
  });

  it("labels provenance, basis, and verification honestly", () => {
    for (const c of sourceSheetColumns) {
      expect(c.provenance).toBe("visual_reading_of_screenshot");
      expect(c.verified).toBe(false);
      expect(c.basis).toBe("reported_revenue");
      expect(c.basisNote).toBe("reported_revenue_basis_unknown");
    }
    expect(sourceSheetColumns).toHaveLength(12);
  });

  it("recalculates Ben: RPL $5,317.83, show rate 83.53%", () => {
    const d = deriveSourceMetrics(ben);
    expect(d.revenuePerLeadMinor).toBeCloseTo(531_782.945736, 4);
    expect((d.revenuePerLeadMinor as number) / 100).toBeCloseTo(5317.83, 2);
    expect((d.showRate as number) * 100).toBeCloseTo(83.53, 2);
    expect((d.retainedBookingRate as number) * 100).toBeCloseTo(65.89, 2);
    expect((d.perceivedQualifiedShowRate as number) * 100).toBeCloseTo(81.69, 2);
    expect((d.winPerPerceivedQualified as number) * 100).toBeCloseTo(36.21, 2);
    expect((d.showToWinRate as number) * 100).toBeCloseTo(29.58, 2);
    expect((d.leadToWinRate as number) * 100).toBeCloseTo(16.28, 2);
    expect(d.leadsPerWin).toBeCloseTo(6.14, 2);
    expect((d.revenuePerRetainedBookingMinor as number) / 100).toBeCloseTo(8070.59, 2);
    expect((d.revenuePerWinMinor as number) / 100).toBeCloseTo(32_666.67, 2);
  });

  it("recalculates the high-volume rep: show rate 33.47%, RPL $1,590.21", () => {
    const d = deriveSourceMetrics(hv);
    expect((d.showRate as number) * 100).toBeCloseTo(33.47, 2);
    expect((d.retainedBookingRate as number) * 100).toBeCloseTo(61.21, 2);
    expect((d.revenuePerLeadMinor as number) / 100).toBeCloseTo(1590.21, 2);
    expect(d.leadsPerWin).toBeCloseTo(19.9, 2);
    expect((d.leadToWinRate as number) * 100).toBeCloseTo(5.03, 2);
  });

  it("computes the counterfactual 776 x (686000/129) = $4,126,635.66 and labels it a scenario", () => {
    const cf = counterfactualRevenueAtLeads(ben, 776);
    expect(cf.dollars).toBeCloseTo(4_126_635.66, 2);
    expect(cf.dollars / 1_234_000).toBeCloseTo(3.3441, 4);
    expect(cf.label).toBe("arithmetic scenario, not a forecast");
  });

  it("keeps raw anomalous readings and flags them", () => {
    expect(sourceColumn("nathan").anomaly).toBe("retained exceeds leads in source reading");
    expect(sourceColumn("steve").anomaly).toBe("retained exceeds leads in source reading");
    expect(sourceColumn("nathan").leads).toBe(6);
    expect(sourceColumn("nathan").retainedBookings).toBe(10);
    expect(deriveSourceMetrics(sourceColumn("nathan")).preCallDqComplement).toBeLessThan(0);
  });

  it("returns null, not zero, for zero-win columns", () => {
    const tony = deriveSourceMetrics(sourceColumn("tony"));
    expect(tony.leadsPerWin).toBeNull();
    expect(tony.revenuePerWinMinor).toBeNull();
    expect(tony.showToWinRate).toBe(0);
  });

  it("team totals are sum/sum, not the mean of column rates", () => {
    const totals = sourceSheetTotals();
    const d = deriveSourceMetrics(totals);
    const meanOfRates = sourceSheetColumns.reduce((s, c) => s + c.shows / c.retainedBookings, 0) / sourceSheetColumns.length;
    expect(d.showRate).toBeCloseTo(totals.shows / totals.retainedBookings, 12);
    expect(d.showRate).not.toBeCloseTo(meanOfRates, 3);
  });

  it("renders the SOS-20 source display sequence", () => {
    expect(sourceFunnelText(ben)).toBe(
      "129 assigned source leads → 85 retained bookings → 71 shows → 58 perceived qualified → 21 wins → $686,000 reported revenue",
    );
  });
});
