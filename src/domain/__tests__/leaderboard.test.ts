import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEADERBOARD_POLICY,
  buildLeaderboard,
  buildStandings,
  ownStanding,
  type LeaderboardPolicy,
} from "@/domain/leaderboard";
import { fromDollars } from "@/domain/money";
import type { LedgerEntry } from "@/domain/types";
import { obaviaDataset, NOW as OBAVIA_NOW } from "@/fixtures/obavia";
import { NOW, T0, emptyDataset, mkAssignment, mkInstance, mkOpp, mkUser } from "./helpers";

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

  it("exposes the same rows through buildLeaderboard and buildStandings", () => {
    const standings = buildStandings(outlierDataset(), "comparable_performance", policy, NOW);
    expect(standings.rows).toEqual(buildLeaderboard(outlierDataset(), "comparable_performance", policy, NOW));
    expect(standings.kind).toBe("ranked");
    expect(standings.heldBy).toBeUndefined();
    expect(standings.orderLabel).toMatch(/Ranked by net collected cash per assigned opportunity/);
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

describe("standings are a roster when ranking is not established", () => {
  const pay = (oppId: string, dollars: number, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
    tenantId: "t_test",
    entryId: `l_${oppId}`,
    opportunityId: oppId,
    kind: "payment_collected",
    amount: fromDollars(dollars),
    providerRef: oppId,
    idempotencyKey: `k_${oppId}`,
    occurredAt: T0,
    receivedAt: T0,
    commercialCategory: "new_customer",
    ...extra,
  });

  /** Two eligible closers on the same lead tier: one collected cash, one collected nothing. */
  function twoRepDataset(extra: Partial<Parameters<typeof emptyDataset>[0]> = {}) {
    const paid = mkUser("paid", ["closer"], "2025-01-01T00:00:00Z", { displayName: "Paid closer" });
    const unpaid = mkUser("unpaid", ["closer"], "2025-01-01T00:00:00Z", { displayName: "Unpaid closer" });
    const opps = [
      ...Array.from({ length: 30 }, (_, i) => mkOpp(`p_${i}`, { leadTier: 1, currentOwner: { closer: "paid" }, commercialStatus: i < 2 ? "won" : "open" })),
      ...Array.from({ length: 30 }, (_, i) => mkOpp(`u_${i}`, { leadTier: 1, currentOwner: { closer: "unpaid" } })),
    ];
    return emptyDataset({
      users: [paid, unpaid],
      opportunities: opps,
      assignments: opps.map((o) => mkAssignment(o.opportunityId, o.currentOwner.closer as string, "closer")),
      ledger: [pay("p_0", 6_000)],
      ...extra,
    });
  }

  const policy: LeaderboardPolicy = {
    ...DEFAULT_LEADERBOARD_POLICY,
    minMaturedSample: 25,
    periodFrom: "2026-07-01T00:00:00Z",
    periodTo: "2026-09-19T00:00:00Z",
  };

  it("a verified zero and a missing figure are different fields, not different wording", () => {
    const clean = buildStandings(twoRepDataset(), "comparable_performance", policy, NOW);
    expect(clean.rows.find((r) => r.userId === "unpaid")?.revenueState).toBe("verified_zero");
    expect(clean.rows.find((r) => r.userId === "unpaid")?.revenueProvisional).toBe(false);
    expect(clean.rows.find((r) => r.userId === "paid")?.revenueState).toBe("amount");

    const held = buildStandings(
      twoRepDataset({ ledger: [pay("p_0", 6_000), pay("unlinked", 4_000, { opportunityId: undefined, entryId: "l_unlinked" })] }),
      "comparable_performance",
      policy,
      NOW,
    );
    // The same rep, the same zero: now it is "payment data not available", not "$0 collected".
    expect(held.rows.find((r) => r.userId === "unpaid")?.revenueState).toBe("unavailable");
    // A figure that exists is still shown, and labeled as able to move.
    expect(held.rows.find((r) => r.userId === "paid")?.revenueState).toBe("amount");
    expect(held.rows.find((r) => r.userId === "paid")?.revenueProvisional).toBe(true);
    expect(held.rows.find((r) => r.userId === "paid")?.totalRevenue).toEqual(fromDollars(6_000));
  });

  it("an unlinked payment makes the cash board a labeled roster with no rank number anywhere", () => {
    const dataset = twoRepDataset({ ledger: [pay("p_0", 6_000), pay("unlinked", 4_000, { opportunityId: undefined, entryId: "l_unlinked" })] });
    const standings = buildStandings(dataset, "comparable_performance", policy, NOW);
    expect(standings.kind).toBe("roster");
    expect(standings.orderLabel).toMatch(/^Roster in alphabetical order, not a ranking\./);
    expect(standings.heldBy?.surface).toBe("revenue_attribution");
    expect(standings.heldBy?.ownerLabel).toBe("Sales ops");
    expect(standings.heldBy?.waitingOn).toMatch(/unlinked payment/);
    expect(standings.rows.every((r) => r.rank === null)).toBe(true);
    expect(standings.rows.every((r) => r.provisional)).toBe(true);
    expect(standings.rows.map((r) => r.displayName)).toEqual(["Paid closer", "Unpaid closer"]);
    // Economic output is a roster too: a position in a held order still reads as a rank.
    const output = buildStandings(dataset, "economic_output", policy, NOW);
    expect(output.kind).toBe("roster");
    expect(output.rows.every((r) => r.rank === null)).toBe(true);
  });

  it("a rep's own standing and the team board can never disagree", () => {
    const dataset = twoRepDataset({ ledger: [pay("p_0", 6_000), pay("unlinked", 4_000, { opportunityId: undefined, entryId: "l_unlinked" })] });
    const held = buildStandings(dataset, "comparable_performance", policy, NOW);
    const mine = ownStanding(held, "paid");
    expect(mine.rank).toBeNull();
    expect(mine.kind).toBe("roster");
    expect(mine.statement).toBe(held.heldBy?.statement);
    expect(mine.row?.rank).toBe(held.rows.find((r) => r.userId === "paid")?.rank ?? null);

    const ranked = buildStandings(twoRepDataset(), "comparable_performance", policy, NOW);
    const placed = ownStanding(ranked, "paid");
    expect(ranked.kind).toBe("ranked");
    expect(placed.rank).toBe(1);
    expect(placed.rank).toBe(ranked.rows.find((r) => r.userId === "paid")?.rank);
    expect(placed.of).toBe(2);
    expect(placed.statement).toMatch(/Rank 1 of 2 in closer lead tier 1/);
  });

  it("a contracted-value board is not held by an unlinked payment", () => {
    const dataset = twoRepDataset({ ledger: [pay("p_0", 6_000), pay("unlinked", 4_000, { opportunityId: undefined, entryId: "l_unlinked" })] });
    const standings = buildStandings(dataset, "comparable_performance", { ...policy, basis: "contracted_value" }, NOW);
    expect(standings.kind).toBe("ranked");
    expect(standings.heldBy).toBeUndefined();
    expect(standings.rows.some((r) => r.rank !== null)).toBe(true);
  });

  it("unresolved attendance bounds the attended count and leaves the money ranking alone", () => {
    const dataset = twoRepDataset({
      appointmentInstances: [mkInstance("inst_open", "p_1", "unknown"), mkInstance("inst_done", "p_2", "attended")],
    });
    const standings = buildStandings(dataset, "comparable_performance", policy, NOW);
    expect(standings.kind).toBe("ranked");
    const paid = standings.rows.find((r) => r.userId === "paid");
    expect(paid?.rank).toBe(1);
    expect(paid?.attendedState).toBe("at_least");
    expect(paid?.unresolvedAttendanceCount).toBe(1);
    expect(paid?.heldSurfaces).toEqual(["attendance_outcome"]);
    expect(paid?.heldStatement).toMatch(/At least 1 attended, with 1 attendance outcome unresolved/);
    // The rep with no unresolved meeting carries a verified count.
    const unpaid = standings.rows.find((r) => r.userId === "unpaid");
    expect(unpaid?.attendedState).toBe("verified");
    expect(unpaid?.heldSurfaces).toBeUndefined();
  });

  it("a policy that declines to hold ranking ranks on the figures as they stand, and says so on the row", () => {
    const dataset = twoRepDataset({ ledger: [pay("p_0", 6_000), pay("unlinked", 4_000, { opportunityId: undefined, entryId: "l_unlinked" })] });
    const standings = buildStandings(dataset, "comparable_performance", { ...policy, pauseOnUnresolvedData: false }, NOW);
    expect(standings.kind).toBe("ranked");
    expect(standings.rows.find((r) => r.userId === "paid")?.rank).toBe(1);
    expect(standings.rows.find((r) => r.userId === "unpaid")?.revenueState).toBe("verified_zero");
  });
});
