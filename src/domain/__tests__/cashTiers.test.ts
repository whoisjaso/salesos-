import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIERS,
  DEFAULT_TIER_POLICY,
  cashRace,
  commissionBucket,
  commissionSummary,
  nextTier,
  recentCashDrops,
  tierFor,
  type TierPolicy,
} from "@/domain/cashTiers";
import { NOW, obaviaDataset } from "@/fixtures/obavia";
import type { CommissionEntry, LedgerEntry } from "@/domain/types";
import { emptyDataset, mkOpp, mkUser } from "./helpers";

const SEASON = { from: "2026-09-01T00:00:00Z", to: "2026-10-01T00:00:00Z" };

const payment = (id: string, oppId: string, amountMinor: number, occurredAt: string, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
  tenantId: "t_test",
  entryId: id,
  opportunityId: oppId,
  kind: "payment_collected",
  amount: { amountMinor, currency: "USD" },
  providerRef: `pi_${id}`,
  idempotencyKey: `k_${id}`,
  occurredAt,
  receivedAt: occurredAt,
  commercialCategory: "new_customer",
  ...extra,
});

const commission = (id: string, userId: string, oppId: string, amountMinor: number, state: CommissionEntry["state"]): CommissionEntry => ({
  tenantId: "t_test",
  entryId: id,
  userId,
  opportunityId: oppId,
  policyVersion: "test",
  amount: { amountMinor, currency: "USD" },
  state,
});

describe("tierFor", () => {
  it("is inclusive at each minimum and coins at zero", () => {
    expect(tierFor(0).id).toBe("coins");
    expect(tierFor(99_999).id).toBe("coins");
    expect(tierFor(100_000).id).toBe("cash");
    expect(tierFor(499_999).id).toBe("cash");
    expect(tierFor(500_000).id).toBe("stacks");
    expect(tierFor(2_500_000).id).toBe("bags");
    expect(tierFor(9_999_999).id).toBe("bags");
    expect(tierFor(10_000_000).id).toBe("diamonds");
    expect(tierFor(50_000_000).id).toBe("diamonds");
  });

  it("thresholds are strictly increasing from zero and the policy is versioned", () => {
    expect(DEFAULT_TIERS[0].minMinor).toBe(0);
    for (let i = 1; i < DEFAULT_TIERS.length; i += 1) expect(DEFAULT_TIERS[i].minMinor).toBeGreaterThan(DEFAULT_TIERS[i - 1].minMinor);
    expect(DEFAULT_TIER_POLICY).toMatchObject({ basis: "commission", version: "tiers-1.0" });
  });

  it("respects an owner-configured policy with different thresholds", () => {
    const policy: TierPolicy = {
      version: "tiers-custom",
      basis: "commission",
      tiers: [
        { id: "coins", label: "Coins", minMinor: 0, icon: "Coin", hue: "#aaa" },
        { id: "diamonds", label: "Diamonds", minMinor: 1_000, icon: "Diamond", hue: "#8fd3e8" },
      ],
    };
    expect(tierFor(999, policy).id).toBe("coins");
    expect(tierFor(1_000, policy).id).toBe("diamonds");
  });
});

describe("nextTier", () => {
  it("returns the next tier, the remaining amount, and progress within the current band", () => {
    expect(nextTier(0)).toMatchObject({ tier: { id: "cash" }, remainingMinor: 100_000, progress: 0 });
    expect(nextTier(50_000)).toMatchObject({ tier: { id: "cash" }, remainingMinor: 50_000, progress: 0.5 });
    expect(nextTier(300_000)).toMatchObject({ tier: { id: "stacks" }, remainingMinor: 200_000, progress: 0.5 });
    expect(nextTier(2_499_999)).toMatchObject({ tier: { id: "bags" }, remainingMinor: 1 });
  });

  it("is null at the top tier", () => {
    expect(nextTier(10_000_000)).toBeNull();
    expect(nextTier(99_000_000)).toBeNull();
  });
});

describe("commissionSummary", () => {
  it("splits states into accrued, eligible, paid and never double counts", () => {
    const ds = emptyDataset({
      users: [mkUser("closer_a", ["closer"])],
      opportunities: ["o1", "o2", "o3", "o4", "o5", "o6"].map((id) => mkOpp(id, { currentOwner: { closer: "closer_a" } })),
      ledger: ["o1", "o2", "o3", "o4", "o5", "o6"].map((id, i) => payment(`p_${id}`, id, 480_000, `2026-09-0${i + 2}T12:00:00Z`)),
      commissionEntries: [
        commission("c1", "closer_a", "o1", 10_000, "calculated"),
        commission("c2", "closer_a", "o2", 20_000, "accrued"),
        commission("c3", "closer_a", "o3", 30_000, "pending_eligibility"),
        commission("c4", "closer_a", "o4", 40_000, "payable"),
        commission("c5", "closer_a", "o5", 50_000, "paid"),
        commission("c6", "closer_a", "o6", 99_000, "disputed"),
        commission("c7", "someone_else", "o1", 77_000, "paid"),
      ],
    });
    const s = commissionSummary(ds, "closer_a", SEASON, NOW);
    expect(s.accruedMinor).toBe(30_000);
    expect(s.eligibleMinor).toBe(70_000);
    expect(s.paidMinor).toBe(50_000);
    expect(s.totalMinor).toBe(150_000);
    expect(s.totalMinor).toBe(s.accruedMinor + s.eligibleMinor + s.paidMinor);
    expect(s.currency).toBe("USD");
    expect(s.perAttended.metricId).toBe("M19");
  });

  it("attributes by the linked payment date and keeps unlinked entries", () => {
    const ds = emptyDataset({
      users: [mkUser("closer_a", ["closer"])],
      opportunities: ["o_aug", "o_sep", "o_none"].map((id) => mkOpp(id, { currentOwner: { closer: "closer_a" } })),
      ledger: [payment("p_aug", "o_aug", 480_000, "2026-08-20T12:00:00Z"), payment("p_sep", "o_sep", 480_000, "2026-09-05T12:00:00Z")],
      commissionEntries: [
        commission("c_aug", "closer_a", "o_aug", 24_000, "paid"),
        commission("c_sep", "closer_a", "o_sep", 24_000, "payable"),
        commission("c_none", "closer_a", "o_none", 5_000, "accrued"),
      ],
    });
    const s = commissionSummary(ds, "closer_a", SEASON, NOW);
    expect(s.paidMinor).toBe(0);
    expect(s.eligibleMinor).toBe(24_000);
    expect(s.accruedMinor).toBe(5_000);
  });

  it("passes the hypothetical flag through from the policy", () => {
    const ds = emptyDataset();
    expect(commissionSummary(ds, "anyone", SEASON, NOW).hypothetical).toBe(true);
    const real = emptyDataset({ commissionPolicy: { ...ds.commissionPolicy, hypothetical: false } });
    expect(commissionSummary(real, "anyone", SEASON, NOW).hypothetical).toBe(false);
  });

  it("maps every state to exactly one bucket or none", () => {
    expect(commissionBucket("calculated")).toBe("accrued");
    expect(commissionBucket("accrued")).toBe("accrued");
    expect(commissionBucket("pending_eligibility")).toBe("eligible");
    expect(commissionBucket("payable")).toBe("eligible");
    expect(commissionBucket("paid")).toBe("paid");
    expect(commissionBucket("disputed")).toBeNull();
    expect(commissionBucket("adjusted")).toBeNull();
  });
});

describe("cashRace", () => {
  it("ranks by net collected with shared ranks on ties and tiers from cash, not commission", () => {
    const ds = emptyDataset({
      users: [mkUser("a", ["closer"]), mkUser("b", ["closer"]), mkUser("c", ["closer"]), mkUser("s", ["setter"])],
      opportunities: [
        mkOpp("o_a", { currentOwner: { closer: "a", setter: "s" } }),
        mkOpp("o_b", { currentOwner: { closer: "b" } }),
        mkOpp("o_c", { currentOwner: { closer: "c" } }),
      ],
      ledger: [
        payment("p_a", "o_a", 600_000, "2026-09-03T12:00:00Z"),
        payment("p_b", "o_b", 600_000, "2026-09-04T12:00:00Z"),
        payment("p_c", "o_c", 150_000, "2026-09-05T12:00:00Z"),
        payment("p_c_refund", "o_c", 50_000, "2026-09-06T12:00:00Z", { kind: "refund" }),
        payment("p_old", "o_c", 9_000_000, "2026-08-01T12:00:00Z"),
      ],
      commissionEntries: [commission("c_c", "c", "o_c", 99_000_000, "paid")],
    });
    const race = cashRace(ds, SEASON, "closer");
    expect(race.map((r) => [r.userId, r.netCollectedMinor, r.rank, r.tier.id])).toEqual([
      ["a", 600_000, 1, "stacks"],
      ["b", 600_000, 1, "stacks"],
      ["c", 100_000, 3, "cash"],
    ]);
    expect(race.some((r) => "commissionMinor" in r)).toBe(false);
  });

  it("gives setters with no commission entries coins at zero when they own no cash", () => {
    const ds = emptyDataset({
      users: [mkUser("s1", ["setter"]), mkUser("s2", ["setter"])],
      opportunities: [mkOpp("o", { currentOwner: { setter: "s1" } })],
      ledger: [payment("p", "o", 480_000, "2026-09-03T12:00:00Z")],
    });
    const race = cashRace(ds, SEASON, "setter");
    expect(race[0]).toMatchObject({ userId: "s1", netCollectedMinor: 480_000, rank: 1, tier: { id: "cash" } });
    expect(race[1]).toMatchObject({ userId: "s2", netCollectedMinor: 0, rank: 2, tier: { id: "coins" } });
    expect(commissionSummary(ds, "s2", SEASON, NOW).totalMinor).toBe(0);
    expect(tierFor(commissionSummary(ds, "s2", SEASON, NOW).totalMinor).id).toBe("coins");
  });

  it("covers the synthetic dataset without exposing commission", () => {
    const season = { from: "2026-09-01T00:00:00Z", to: "2026-10-01T00:00:00Z" };
    const race = cashRace(obaviaDataset, season);
    expect(race.length).toBeGreaterThan(0);
    for (let i = 1; i < race.length; i += 1) {
      expect(race[i].netCollectedMinor).toBeLessThanOrEqual(race[i - 1].netCollectedMinor);
      expect(race[i].rank).toBeGreaterThanOrEqual(race[i - 1].rank);
    }
  });
});

describe("recentCashDrops", () => {
  it("returns the user's collected payments in season, newest first, capped", () => {
    const ds = emptyDataset({
      users: [mkUser("a", ["closer"])],
      opportunities: Array.from({ length: 10 }, (_, i) => mkOpp(`o${i}`, { currentOwner: { closer: "a" } })).concat(mkOpp("o_other", { currentOwner: { closer: "b" } })),
      ledger: Array.from({ length: 10 }, (_, i) => payment(`p${i}`, `o${i}`, 1_000 * (i + 1), `2026-09-${String(i + 1).padStart(2, "0")}T12:00:00Z`)).concat(
        payment("p_other", "o_other", 5_000, "2026-09-20T12:00:00Z"),
        payment("p_aug", "o1", 5_000, "2026-08-20T12:00:00Z"),
        payment("p_refund", "o1", 5_000, "2026-09-21T12:00:00Z", { kind: "refund" }),
      ),
    });
    const drops = recentCashDrops(ds, "a", SEASON);
    expect(drops).toHaveLength(8);
    expect(drops[0]).toEqual({ at: "2026-09-10T12:00:00Z", amountMinor: 10_000, opportunityId: "o9" });
    expect(drops.at(-1)?.opportunityId).toBe("o2");
  });
});
