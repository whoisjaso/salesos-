import { describe, expect, it } from "vitest";
import {
  activePairs,
  pairContribution,
  pairDiagnostic,
  pairFor,
  pairFunnel,
  pairLeaderboard,
  pairSideOf,
  pairsOf,
} from "@/domain/pairs";
import type { Assignment, CommissionPolicy, LedgerEntry, Opportunity, Pair, QualificationAssessment } from "@/domain/types";
import { NOW, obaviaCommissionPolicies, obaviaDatasetWithPairs, obaviaPairs } from "@/fixtures/obavia";
import { NOW as T_NOW, T0, emptyDataset, mkAssignment, mkInstance, mkOpp, mkUser } from "./helpers";

const SEASON = { from: "2026-08-01T00:00:00Z", to: "2026-09-01T00:00:00Z" };

const mkPair = (pairId: string, setterUserId: string, closerUserId: string, extra: Partial<Pair> = {}): Pair => ({
  tenantId: "t_test",
  pairId,
  setterUserId,
  closerUserId,
  chosenBy: "owner",
  startedAt: "2026-07-01T00:00:00Z",
  active: true,
  ...extra,
});

const payment = (id: string, oppId: string, amountMinor: number, occurredAt = "2026-08-15T12:00:00Z", extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
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

const assessment = (oppId: string, fit: QualificationAssessment["repPerceivedFit"], by = "c1"): QualificationAssessment => ({
  tenantId: "t_test",
  assessmentId: `qa_${oppId}`,
  opportunityId: oppId,
  policyVersion: "fit-test",
  objective: {},
  repPerceivedFit: fit,
  reviewState: "confirmed",
  assessedAt: "2026-08-10T16:00:00Z",
  assessedByUserId: by,
});

const POLICIES: CommissionPolicy[] = [
  { tenantId: "t_test", policyVersion: "setter-5", effectiveFrom: T0, basis: "net_collected_cash", ratePercent: 5, hypothetical: true, role: "setter" },
  { tenantId: "t_test", policyVersion: "closer-10", effectiveFrom: T0, basis: "net_collected_cash", ratePercent: 10, hypothetical: true, role: "closer" },
];

const PAIRS = [mkPair("P1", "s1", "c1", { chosenBy: "closer" }), mkPair("P2", "s2", "c2", { chosenBy: "setter" })];

/**
 * A pair's cohort: `n` opportunities, all contacted and booked and retained,
 * `attended` of them attended, `qualified` rated likely, `won` won.
 */
function cohort(pairId: string, setter: string, closer: string, n: number, attended: number, qualified = 0, won = 0) {
  const opps: Opportunity[] = [];
  const instances = [];
  const assessments: QualificationAssessment[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = `${pairId}_o${i}`;
    opps.push(
      mkOpp(id, {
        pairId,
        currentOwner: { setter, closer },
        contactState: "two_way_contact",
        commercialStatus: i < won ? "won" : "open",
        contractState: i < won ? "signed" : "none",
      }),
    );
    instances.push(mkInstance(`${id}_i`, id, i < attended ? "attended" : "customer_no_show"));
    if (i < attended) assessments.push(assessment(id, i < qualified ? "likely" : "unlikely", closer));
  }
  return { opps, instances, assessments };
}

function twoPairDataset(a: ReturnType<typeof cohort>, b: ReturnType<typeof cohort>, extra: Parameters<typeof emptyDataset>[0] = {}) {
  return emptyDataset({
    users: [mkUser("s1", ["setter"]), mkUser("s2", ["setter"]), mkUser("c1", ["closer"]), mkUser("c2", ["closer"])],
    opportunities: [...a.opps, ...b.opps],
    appointmentInstances: [...a.instances, ...b.instances],
    assessments: [...a.assessments, ...b.assessments],
    ...extra,
  });
}

describe("pair lookup", () => {
  const pairs = [
    mkPair("old", "s1", "c1", { startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-06-01T00:00:00Z", active: false }),
    mkPair("cur", "s1", "c1", { startedAt: "2026-06-01T00:00:00Z" }),
    mkPair("other", "s2", "c1", { startedAt: "2026-09-01T00:00:00Z" }),
  ];

  it("finds the pair for a setter and closer, preferring the active one, and honors the time window", () => {
    expect(pairFor(pairs, "s1", "c1")?.pairId).toBe("cur");
    expect(pairFor(pairs, "s1", "c1", "2026-03-01T00:00:00Z")?.pairId).toBe("old");
    expect(pairFor(pairs, "s1", "c1", "2026-06-01T00:00:00Z")?.pairId).toBe("cur");
    expect(pairFor(pairs, "s1", "c2")).toBeUndefined();
    expect(pairFor(pairs, "s2", "c1", "2026-08-01T00:00:00Z")).toBeUndefined();
  });

  it("lists active pairs at a moment and every pair of a user", () => {
    expect(activePairs(pairs, "2026-08-15T00:00:00Z").map((p) => p.pairId)).toEqual(["cur"]);
    expect(activePairs(pairs, "2026-09-15T00:00:00Z").map((p) => p.pairId)).toEqual(["cur", "other"]);
    expect(pairsOf(pairs, "c1").map((p) => p.pairId)).toEqual(["cur", "old", "other"]);
    expect(pairsOf(pairs, "s2").map((p) => p.pairId)).toEqual(["other"]);
    expect(pairsOf(pairs, "nobody")).toEqual([]);
  });
});

describe("pairFunnel", () => {
  it("uses only the pair's opportunities and lays out setter side, handoff, closer side", () => {
    const ds = twoPairDataset(cohort("P1", "s1", "c1", 6, 4, 3, 1), cohort("P2", "s2", "c2", 10, 9, 5, 2), {
      ledger: [payment("p", "P1_o0", 480_000)],
    });
    const f = pairFunnel(ds, PAIRS, "P1", {}, T_NOW);
    expect(f.pair.pairId).toBe("P1");
    expect(f.setterSide.map((s) => [s.stageId, s.count])).toEqual([
      ["assigned", 6],
      ["two_way_contact", 6],
      ["booked", 6],
      ["retained_booking", 6],
      ["attended", 4],
    ]);
    expect(f.closerSide.map((s) => [s.stageId, s.count])).toEqual([
      ["perceived_qualified", 3],
      ["won", 1],
      ["net_collected_cash", 1],
    ]);
    expect(f.closerSide[2].money).toEqual({ amountMinor: 480_000, currency: "USD" });
    expect(f.connectors).toHaveLength(7);
    for (const c of f.connectors) {
      expect(c.metric).not.toBeNull();
      expect(c.metric?.refusalReason).toBeUndefined();
    }
    expect(f.connectors.map((c) => pairSideOf(c))).toEqual(["setter", "setter", "setter", "handoff", "closer", "closer", "closer"]);
    expect(f.cohortId).toBe("pair=P1");
  });

  it("counts accepted handoffs and the mean hours to accept", () => {
    const a = cohort("P1", "s1", "c1", 3, 0);
    const ds = twoPairDataset(a, cohort("P2", "s2", "c2", 0, 0), {
      assignments: [
        { ...mkAssignment("P1_o0", "c1", "closer"), decidedAt: "2026-08-01T12:00:00Z", acceptedAt: "2026-08-01T13:00:00Z" },
        { ...mkAssignment("P1_o1", "c1", "closer"), decidedAt: "2026-08-01T12:00:00Z", acceptedAt: "2026-08-01T15:00:00Z" },
        { ...mkAssignment("P1_o2", "c1", "closer"), decidedAt: "2026-08-01T12:00:00Z" },
        mkAssignment("P1_o0", "s1", "setter"),
        { ...mkAssignment("P2_x", "c2", "closer"), acceptedAt: "2026-08-01T12:00:00Z" } as Assignment,
      ],
    });
    const f = pairFunnel(ds, PAIRS, "P1", {}, T_NOW);
    expect(f.handoff).toEqual({ accepted: 2, total: 3, avgHoursToAccept: 2 });
    expect(pairFunnel(ds, PAIRS, "P2", {}, T_NOW).handoff).toEqual({ accepted: 0, total: 0, avgHoursToAccept: null });
  });

  it("throws on an unknown pair", () => {
    expect(() => pairFunnel(emptyDataset(), PAIRS, "nope", {}, T_NOW)).toThrow(/Unknown pair/);
  });
});

describe("pairDiagnostic", () => {
  it("picks the largest negative gap against the pooled pair rate and names the side and stage, not a person", () => {
    // P1 shows 3 of 10, P2 shows 9 of 10: pooled 12 of 20.
    const ds = twoPairDataset(cohort("P1", "s1", "c1", 10, 3, 2), cohort("P2", "s2", "c2", 10, 9, 5));
    const d = pairDiagnostic(ds, PAIRS, "P1", T_NOW);
    expect(d.weakestSide).toBe("handoff");
    expect(d.stageId).toBe("attended");
    expect(d.suggestedOwner).toBe("both");
    expect(d.observed).toBe("Handoff, attended: 3 of 10 retained bookings attended (30%).");
    expect(d.comparator).toMatch(/^Team pairs: 12 of 20 \(60%\)/);
    expect(d.gap).toBeCloseTo(-0.3, 6);
    expect(d.dataState).toBe("complete");
    for (const text of [d.observed, d.comparator, ...d.alternativeExplanations]) {
      expect(text).not.toMatch(/\bs1\b|\bc1\b/);
    }
    expect(d.alternativeExplanations.length).toBeGreaterThanOrEqual(3);
  });

  it("returns none when every stage is within tolerance", () => {
    const ds = twoPairDataset(cohort("P1", "s1", "c1", 10, 6, 3), cohort("P2", "s2", "c2", 10, 6, 3));
    const d = pairDiagnostic(ds, PAIRS, "P1", T_NOW);
    expect(d).toMatchObject({ weakestSide: "none", stageId: "none", gap: 0 });
  });

  it("never blames a stage whose pair denominator is under the minimum", () => {
    const ds = twoPairDataset(cohort("P1", "s1", "c1", 4, 0), cohort("P2", "s2", "c2", 10, 9));
    expect(pairDiagnostic(ds, PAIRS, "P1", T_NOW).weakestSide).toBe("none");
    expect(pairDiagnostic(ds, PAIRS, "P1", T_NOW, { minDenominator: 3 })).toMatchObject({ weakestSide: "handoff", stageId: "attended" });
  });

  it("comparator is pooled sum over sum, not the mean of pair rates", () => {
    // P1: 1 of 5 (20%). P2: 19 of 20 (95%). Mean 57.5%, pooled 20 of 25 = 80%.
    const ds = twoPairDataset(cohort("P1", "s1", "c1", 5, 1), cohort("P2", "s2", "c2", 20, 19));
    const d = pairDiagnostic(ds, PAIRS, "P1", T_NOW);
    expect(d.comparator).toContain("20 of 25 (80%)");
    expect(d.comparator).not.toContain("58%");
    expect(d.comparator).toMatch(/pooled sum over sum/);
  });

  it("reports an empty pair as insufficient sample", () => {
    const ds = twoPairDataset(cohort("P1", "s1", "c1", 0, 0), cohort("P2", "s2", "c2", 10, 9));
    expect(pairDiagnostic(ds, PAIRS, "P1", T_NOW)).toMatchObject({ weakestSide: "none", dataState: "insufficient_sample" });
  });

  it("chooses the closer side when the show-to-qualified gap is the largest", () => {
    // Same show rate; P1 rates 1 of 8 shows qualified, P2 rates 7 of 8.
    const ds = twoPairDataset(cohort("P1", "s1", "c1", 10, 8, 1), cohort("P2", "s2", "c2", 10, 8, 7));
    const d = pairDiagnostic(ds, PAIRS, "P1", T_NOW);
    expect(d).toMatchObject({ weakestSide: "closer", stageId: "perceived_qualified", suggestedOwner: "closer" });
    expect(d.alternativeExplanations.some((t) => /handoff/i.test(t))).toBe(true);
  });
});

describe("pairContribution", () => {
  it("splits commission by role policy (5% setter, 10% closer) on the same cash and sums in minor units", () => {
    const a = cohort("P1", "s1", "c1", 3, 3, 3, 2);
    const ds = twoPairDataset(a, cohort("P2", "s2", "c2", 0, 0), {
      ledger: [
        payment("p0", "P1_o0", 480_000),
        payment("p1", "P1_o1", 480_000),
        payment("r0", "P1_o0", 100_000, "2026-08-20T12:00:00Z", { kind: "refund" }),
        payment("late", "P1_o1", 999_999, "2026-09-02T12:00:00Z"),
        payment("other", "P2_none", 480_000),
      ],
    });
    const c = pairContribution(ds, PAIRS, "P1", SEASON, POLICIES);
    expect(c.netCollectedMinor).toBe(860_000);
    expect(c.setterCommissionMinor).toBe(19_000 + 24_000);
    expect(c.closerCommissionMinor).toBe(38_000 + 48_000);
    expect(c.closerCommissionMinor).toBe(c.setterCommissionMinor * 2);
    expect(Number.isInteger(c.setterCommissionMinor) && Number.isInteger(c.closerCommissionMinor)).toBe(true);
    expect(c).toMatchObject({ opportunities: 3, wins: 2, currency: "USD", hypothetical: true, policyVersions: { setter: "setter-5", closer: "closer-10" } });
  });

  it("falls back to a role-less policy and yields zero commission when no policy applies", () => {
    const a = cohort("P1", "s1", "c1", 1, 1, 1, 1);
    const ds = twoPairDataset(a, cohort("P2", "s2", "c2", 0, 0), { ledger: [payment("p0", "P1_o0", 480_000)] });
    const shared: CommissionPolicy = { tenantId: "t_test", policyVersion: "all-7", effectiveFrom: T0, basis: "net_collected_cash", ratePercent: 7, hypothetical: false };
    const c = pairContribution(ds, PAIRS, "P1", SEASON, [shared]);
    expect(c.setterCommissionMinor).toBe(33_600);
    expect(c.closerCommissionMinor).toBe(33_600);
    expect(c.hypothetical).toBe(false);
    expect(pairContribution(ds, PAIRS, "P1", SEASON, [])).toMatchObject({ setterCommissionMinor: 0, closerCommissionMinor: 0, hypothetical: true });
  });
});

describe("pairLeaderboard", () => {
  it("ranks pairs by net collected per assigned opportunity, shares tied ranks, and contains no individual rows", () => {
    const pairs = [...PAIRS, mkPair("P3", "s1", "c2")];
    const a = cohort("P1", "s1", "c1", 4, 4, 4, 2);
    const b = cohort("P2", "s2", "c2", 4, 4, 4, 2);
    const c3 = cohort("P3", "s1", "c2", 4, 4, 4, 1);
    const ds = emptyDataset({
      users: [mkUser("s1", ["setter"]), mkUser("s2", ["setter"]), mkUser("c1", ["closer"]), mkUser("c2", ["closer"])],
      opportunities: [...a.opps, ...b.opps, ...c3.opps, mkOpp("solo", { currentOwner: { closer: "c1" } })],
      appointmentInstances: [...a.instances, ...b.instances, ...c3.instances],
      ledger: [payment("p1", "P1_o0", 400_000), payment("p2", "P2_o0", 400_000), payment("p3", "P3_o0", 100_000), payment("ps", "solo", 9_000_000)],
    });
    const rows = pairLeaderboard(ds, pairs, SEASON, { minMaturedSample: 3 }, T_NOW);
    expect(rows.map((r) => [r.pairId, r.netCollectedMinor, r.rank, r.provisional])).toEqual([
      ["P1", 400_000, 1, false],
      ["P2", 400_000, 1, false],
      ["P3", 100_000, 3, false],
    ]);
    expect(rows.every((r) => !("userId" in r) && r.setterUserId && r.closerUserId)).toBe(true);
    expect(rows.find((r) => r.pairId === "P1")).toMatchObject({ setterDisplayName: "s1", closerDisplayName: "c1", chosenBy: "closer", wins: 2, assignedOpportunities: 4, maturedSample: 4 });
    expect(rows[0].netPerAssigned).toMatchObject({ metricId: "M16", value: 100_000, unit: "ratio_money_per_unit", basis: "net_collected_cash" });
  });

  it("marks a pair provisional under the matured-sample minimum and leaves it unranked", () => {
    const ds = twoPairDataset(cohort("P1", "s1", "c1", 2, 2, 2, 1), cohort("P2", "s2", "c2", 6, 6, 6, 1), {
      ledger: [payment("p1", "P1_o0", 480_000), payment("p2", "P2_o0", 480_000)],
    });
    const rows = pairLeaderboard(ds, PAIRS, SEASON, { minMaturedSample: 5 }, T_NOW);
    const p1 = rows.find((r) => r.pairId === "P1");
    const p2 = rows.find((r) => r.pairId === "P2");
    expect(p1).toMatchObject({ provisional: true, rank: null });
    expect(p1?.provisionalReason).toMatch(/2 matured of 2 assigned; minimum 5/);
    expect(p2).toMatchObject({ provisional: false, rank: 1 });
    expect(rows[0].pairId).toBe("P1"); // higher value still listed first, honestly, without a rank
  });

  it("omits pairs with no opportunities in the season", () => {
    const ds = twoPairDataset(cohort("P1", "s1", "c1", 2, 0), cohort("P2", "s2", "c2", 0, 0));
    expect(pairLeaderboard(ds, PAIRS, SEASON, { minMaturedSample: 1 }, T_NOW).map((r) => r.pairId)).toEqual(["P1"]);
  });
});

describe("synthetic fixture", () => {
  it("stamps pairId only where the setter and closer form a pair active at handoff, deterministically", () => {
    const d = obaviaDatasetWithPairs;
    expect(d.pairs).toBe(obaviaPairs);
    expect(obaviaPairs.map((p) => p.chosenBy)).toEqual(["closer", "owner", "setter"]);
    const stamped = d.opportunities.filter((o) => o.pairId);
    expect(stamped.length).toBeGreaterThan(0);
    for (const o of stamped) {
      const pair = obaviaPairs.find((p) => p.pairId === o.pairId);
      expect(pair?.setterUserId).toBe(o.currentOwner.setter);
      expect(pair?.closerUserId).toBe(o.currentOwner.closer);
    }
    for (const o of d.opportunities.filter((o) => !o.pairId && o.currentOwner.setter && o.currentOwner.closer)) {
      expect(pairFor(obaviaPairs, o.currentOwner.setter as string, o.currentOwner.closer as string, o.accountabilityStartedAt)).toBeUndefined();
    }
    const again = obaviaDatasetWithPairs.opportunities.map((o) => o.pairId);
    expect(again).toEqual(d.opportunities.map((o) => o.pairId));
  });

  it("carries setter and closer commission entries on the same cash at 5% and 10%", () => {
    const d = obaviaDatasetWithPairs;
    const setterEntries = d.commissionEntries.filter((e) => e.policyVersion === "commission-hypothetical-setter-0.1");
    expect(setterEntries.length).toBeGreaterThan(0);
    for (const s of setterEntries) {
      const c = d.commissionEntries.find((e) => e.opportunityId === s.opportunityId && e.policyVersion === "commission-hypothetical-closer-0.1");
      expect(c?.amount.amountMinor).toBe(s.amount.amountMinor * 2);
      expect(c?.state).toBe(s.state);
    }
    expect(obaviaCommissionPolicies.map((p) => [p.role, p.ratePercent, p.hypothetical])).toEqual([["setter", 5, true], ["closer", 10, true]]);
  });

  it("produces stable pair funnels, diagnostics, and a pair board for the fixture", () => {
    const d = obaviaDatasetWithPairs;
    const season = { from: "2026-08-01T00:00:00Z", to: "2026-10-01T00:00:00Z" };
    const first = obaviaPairs.map((p) => JSON.stringify([pairFunnel(d, obaviaPairs, p.pairId, {}, NOW), pairDiagnostic(d, obaviaPairs, p.pairId, NOW)]));
    const second = obaviaPairs.map((p) => JSON.stringify([pairFunnel(d, obaviaPairs, p.pairId, {}, NOW), pairDiagnostic(d, obaviaPairs, p.pairId, NOW)]));
    expect(second).toEqual(first);
    for (const p of obaviaPairs) {
      const f = pairFunnel(d, obaviaPairs, p.pairId, {}, NOW);
      expect(f.setterSide[0].count).toBe(d.opportunities.filter((o) => o.pairId === p.pairId).length);
      expect(f.handoff.accepted).toBe(f.handoff.total);
      const diag = pairDiagnostic(d, obaviaPairs, p.pairId, NOW);
      expect(diag.observed).not.toMatch(/Tomasz|Priya|Marcus|Renata|Devin/);
    }
    const rows = pairLeaderboard(d, obaviaPairs, season, { minMaturedSample: 5 }, NOW);
    expect(rows.map((r) => r.pairId).sort()).toEqual(obaviaPairs.map((p) => p.pairId).sort());
    expect(rows.every((r) => obaviaPairs.some((p) => p.pairId === r.pairId))).toBe(true);
  });
});
