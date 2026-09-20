/**
 * The owner money screen states one basis in three places: the hero subtitle,
 * the metric payload's timeBasis, and the definition sheet one tap in. They are
 * written in different modules, so nothing but a test keeps them saying the
 * same thing.
 *
 * The fact they must agree on: net collected cash subtracts confirmed refunds
 * and LOST disputes. An opened dispute is at risk and is never subtracted
 * (NET_COLLECTED_CASH_POLICY, and `isRefundLike` in owner-model.ts which
 * matches `refund` and `dispute_debit` only). "Minus refunds and disputes"
 * claimed a subtraction the code does not perform.
 */
import { describe, expect, it } from "vitest";
import { NOW, obaviaDataset } from "@/fixtures/obavia";
import { buildEconomics, filterFor } from "@/lib/owner-model";

const economics = () => buildEconomics(obaviaDataset, filterFor({ path: "all", tier: "all" }), NOW);

describe("owner money copy states the basis the code actually applies", () => {
  it("does not claim an open dispute is subtracted from collected cash", () => {
    const e = economics();
    const claims = [
      e.measurements.netCollected.over,
      e.netCollected.timeBasis,
      e.measurements.refunds.name,
      e.measurements.refunds.over,
      e.refunds.timeBasis,
      e.refunds.label,
    ];
    for (const claim of claims) {
      // "disputes" is only ever honest here when qualified as lost or confirmed.
      if (/dispute/i.test(claim)) {
        expect(claim).toMatch(/lost[- ]dispute|lost disputes/i);
      }
      expect(claim).not.toMatch(/minus refunds and disputes/i);
    }
  });

  it("names the subtraction as refunds and lost disputes on the hero and on the refunds row", () => {
    const e = economics();
    expect(e.measurements.netCollected.over).toContain("Payments minus refunds and lost disputes");
    expect(e.measurements.refunds.name).toBe("Refunds and lost disputes");
    expect(e.netCollected.timeBasis).toContain("confirmed refunds and lost disputes subtracted");
  });

  it("carries no em dash in any owner money sentence", () => {
    const e = economics();
    const sentences = Object.values(e.measurements).flatMap((m) => [m.name, m.over, m.count, m.period]);
    for (const s of sentences) expect(s).not.toMatch(/[—–]/);
  });
});
