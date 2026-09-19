import { describe, expect, it } from "vitest";
import { DEFAULT_LEADERBOARD_POLICY, buildLeaderboard, type LeaderboardPolicy } from "@/domain/leaderboard";
import { fromDollars } from "@/domain/money";
import { obaviaDataset, NOW as OBAVIA_NOW } from "@/fixtures/obavia";
import { NOW, T0, emptyDataset, mkAssignment, mkOpp, mkUser } from "./helpers";

const policy: LeaderboardPolicy = {
  ...DEFAULT_LEADERBOARD_POLICY,
  minMaturedSample: 25,
  periodFrom: "2026-07-01T00:00:00Z",
  periodTo: "2026-09-19T00:00:00Z",
  priorPeriodFrom: "2026-05-01T00:00:00Z",
  priorPeriodTo: "2026-07-01T00:00:00Z",
};

function outlierDataset() {
  const outlier = mkUser("outlier", ["closer"], "2025-01-01T00:00:00Z", { displayName: "Six-lead outlier" });
  const steady = mkUser("steady", ["closer"], "2025-01-01T00:00:00Z", { displayName: "Steady closer" });
  const tier3 = mkUser("tier3", ["closer"], "2025-01-01T00:00:00Z", { displayName: "Tier three closer" });
  const opps = [
    ...Array.from({ length: 6 }, (_, i) => mkOpp(`out_${i}`, { leadTier: 1, currentOwner: { closer: "outlier" }, commercialStatus: i === 0 ? "won" : "open" })),
    ...Array.from({ length: 30 }, (_, i) => mkOpp(`st_${i}`, { leadTier: 1, currentOwner: { closer: "steady" }, commercialStatus: i < 3 ? "won" : "open" })),
    ...Array.from({ length: 30 }, (_, i) => mkOpp(`t3_${i}`, { leadTier: 3, currentOwner: { closer: "tier3" }, commercialStatus: i < 1 ? "won" : "open" })),
  ];
  const assignments = opps.map((o) => mkAssignment(o.opportunityId, o.currentOwner.closer as string, "closer"));
  const pay = (oppId: string, dollars: number) => ({
    tenantId: "t_test",
    entryId: `l_${oppId}`,
    opportunityId: oppId,
    kind: "payment_collected" as const,
    amount: fromDollars(dollars),
    providerRef: oppId,
    idempotencyKey: `k_${oppId}`,
    occurredAt: T0,
    receivedAt: T0,
    commercialCategory: "new_customer" as const,
  });
  const ledger = [pay("out_0", 30_000), pay("st_0", 4_800), pay("st_1", 4_800), pay("st_2", 4_800), pay("t3_0", 4_800)];
  return emptyDataset({ users: [outlier, steady, tier3], opportunities: opps, assignments, ledger });
}

describe("leaderboard (SOS-14)", () => {
  it("the six-lead outlier shows its value but is provisional, with the reason", () => {
    const rows = buildLeaderboard(outlierDataset(), "comparable_performance", policy, NOW);
    const outlier = rows.find((r) => r.userId === "outlier");
    const steady = rows.find((r) => r.userId === "steady");
    expect(outlier?.provisional).toBe(true);
    expect(outlier?.rank).toBeNull();
    expect(outlier?.provisionalReason).toMatch(/6 assigned opportunities, minimum 25 for eligible rank/);
    expect(outlier?.revenuePerLead.value).toBe(500_000); // $5,000 per lead, still shown honestly
    expect(steady?.provisional).toBe(false);
    expect(steady?.rank).toBe(1);
    expect(steady?.revenuePerLead.value).toBe(48_000);
    expect(steady?.movementReason).toMatch(/Eligible rank/);
  });

  it("different lead tiers are visible and ranked within their own group", () => {
    const rows = buildLeaderboard(outlierDataset(), "comparable_performance", policy, NOW);
    const tier3 = rows.find((r) => r.userId === "tier3");
    expect(tier3?.leadTier).toBe(3);
    expect(tier3?.rank).toBe(1); // top of its own tier group, not compared to tier 1
    expect(rows.find((r) => r.userId === "steady")?.leadTier).toBe(1);
    expect(rows.every((r) => r.cohortId.includes(`tier=${r.leadTier}`))).toBe(true);
  });

  it("economic output uses the declared basis and is not a skill ranking", () => {
    const rows = buildLeaderboard(outlierDataset(), "economic_output", policy, NOW);
    expect(rows[0].userId).toBe("outlier"); // largest total, provisional flag irrelevant to output view
    expect(rows.every((r) => r.basis === "net_collected_cash")).toBe(true);
    expect(rows.every((r) => r.revenuePerLead.basis === "net_collected_cash")).toBe(true);
    expect(rows[0].movementReason).toMatch(/not isolated skill/);
    const contracted = buildLeaderboard(outlierDataset(), "economic_output", { ...policy, basis: "contracted_value" }, NOW);
    expect(contracted.every((r) => r.revenuePerLead.basis === "contracted_value")).toBe(true);
  });

  it("personal progress compares a rep with their own prior period and carries no rank", () => {
    const rows = buildLeaderboard(outlierDataset(), "personal_progress", policy, NOW);
    for (const r of rows) {
      expect(r.rank).toBeNull();
      expect(r.movementReason).toMatch(/prior period/);
    }
  });

  it("unresolved attendance or unlinked payments pause consequential ranking on the synthetic tenant", () => {
    const rows = buildLeaderboard(
      obaviaDataset,
      "comparable_performance",
      { ...DEFAULT_LEADERBOARD_POLICY, periodFrom: "2026-08-20T00:00:00Z", periodTo: "2026-09-19T00:00:00Z" },
      OBAVIA_NOW,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.provisional)).toBe(true);
    expect(rows.some((r) => r.provisionalReason?.includes("unlinked payment"))).toBe(true);
  });
});
