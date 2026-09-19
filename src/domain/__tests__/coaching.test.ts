import { describe, expect, it } from "vitest";
import { RulesCoachingEngine, benchmarkOpportunityScenario, buildBottleneckCards, modelScenario, sensitivityTable } from "@/domain/coaching";
import { fromDollars } from "@/domain/money";
import { computeM08 } from "@/domain/metrics";
import { obaviaDataset, NOW } from "@/fixtures/obavia";

describe("SOS-16 earnings scenario", () => {
  const base = {
    eligible: 140,
    currentRate: 0.5,
    downstreamRate: 0.2,
    avgNetCollected: fromDollars(5_000),
    commissionPolicy: { ratePercent: 5, hypothetical: true, basis: "net_collected_cash" as const, policyVersion: "hyp" },
  };

  it("reproduces 14 shows, $14,000 cash, $700 commission exactly", () => {
    const s = modelScenario({ ...base, targetRate: 0.6 });
    expect(s.additionalUnits).toBe(14);
    expect(s.modeledCash).toEqual(fromDollars(14_000));
    expect(s.modeledCommission).toEqual(fromDollars(700));
    expect(s.commissionBasisHypothetical).toBe(true);
    expect(s.capacityCapApplied).toBe(false);
    expect(s.disclaimer).toBe("Not a forecast");
    expect(s.assumptions.join(" ")).toMatch(/2.8 expected wins/);
  });

  it("produces the 55% / 60% / 65% sensitivity table", () => {
    const rows = sensitivityTable(base, [0.55, 0.6, 0.65]);
    expect(rows.map((r) => r.scenario.additionalUnits)).toEqual([7, 14, 21]);
    expect(rows.map((r) => r.scenario.modeledCash.amountMinor)).toEqual([700_000, 1_400_000, 2_100_000]);
    expect(rows.map((r) => r.scenario.modeledCommission?.amountMinor)).toEqual([35_000, 70_000, 105_000]);
  });

  it("caps the modeled increase by available capacity", () => {
    const s = modelScenario({ ...base, targetRate: 0.6, capacityCap: 10 });
    expect(s.additionalUnits).toBe(10);
    expect(s.capacityCapApplied).toBe(true);
    expect(s.modeledCash).toEqual(fromDollars(10_000));
    expect(s.modeledCommission).toEqual(fromDollars(500));
  });

  it("benchmark gaps are labeled scenarios, never lost money (T43)", () => {
    const s = benchmarkOpportunityScenario({ assignedOpportunities: 776, observedRplMinor: 159_021, benchmarkRplMinor: 531_783, benchmarkLabel: "Ben (tier 1)", currency: "USD", crossesLeadTier: true });
    expect(s?.label).toBe("benchmark opportunity scenario");
    expect(s?.disclaimer).toBe("Not a forecast");
    expect(JSON.stringify(s).toLowerCase()).not.toMatch(/lost/);
    expect(s?.assumptions.join(" ")).toMatch(/not an amount owed/);
    expect(benchmarkOpportunityScenario({ assignedOpportunities: 10, observedRplMinor: null, benchmarkRplMinor: 100, benchmarkLabel: "x", currency: "USD" })).toBeUndefined();
  });
});

describe("rules coaching engine", () => {
  it("suppresses attendance coaching while attendance evidence is unresolved", () => {
    const show = computeM08(obaviaDataset, {}, NOW);
    expect(show.dataState).toBe("partial");
    const recs = RulesCoachingEngine.recommend(obaviaDataset, null, NOW);
    const attendance = recs.find((r) => r.metricIds.includes("M08"));
    expect(attendance?.suppressed?.reason).toMatch(/unresolved attendance/);
    expect(attendance?.action).toBe("resolve attendance evidence");
    expect(attendance?.scenario).toBeUndefined();
    expect(attendance?.ownerRole).toBe("sales_ops");
  });

  it("every recommendation carries metric, evidence, owner, alternatives, and an action", () => {
    for (const r of RulesCoachingEngine.recommend(obaviaDataset, null, NOW)) {
      expect(r.metricIds.length).toBeGreaterThan(0);
      expect(r.evidenceRefs.length).toBeGreaterThan(0);
      expect(r.ownerRole).toBeTruthy();
      expect(r.alternativeExplanations.length).toBeGreaterThan(0);
      expect(r.action).toBeTruthy();
      expect(r.provenance.engine).toBe("rules");
      expect(r.state).toBe("proposed");
      if (r.scenario) expect(r.scenario.disclaimer).toBe("Not a forecast");
    }
  });

  it("scopes to a rep when a userId is given", () => {
    const recs = RulesCoachingEngine.recommend(obaviaDataset, "usr_closer_marcus", NOW);
    for (const r of recs) {
      expect(r.ownerUserId).toBe("usr_closer_marcus");
      expect(r.cohortId).toMatch(/user=usr_closer_marcus/);
    }
  });
});

describe("owner bottleneck cards (SOS-21)", () => {
  it("puts measurement problems first and assigns a responsible function", () => {
    const cards = buildBottleneckCards(obaviaDataset, NOW);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].verdict.state).toBe("data_state");
    const unlinked = cards.find((c) => c.cardId === "bn_unlinked_payments");
    expect(unlinked?.responsibleFunction).toBe("finance");
    for (const c of cards) {
      expect(c.candidateExplanations.length).toBeGreaterThan(0);
      expect(c.proposedInvestigation).toBeTruthy();
      expect(c.responsibleFunction).toBeTruthy();
    }
  });
});
