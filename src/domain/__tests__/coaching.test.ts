import { describe, expect, it } from "vitest";
import {
  PERCEPTION_GAP_STAGE_ID,
  RulesCoachingEngine,
  benchmarkOpportunityScenario,
  buildBottleneckCards,
  isPerceptionGapCard,
  isPerceptionGapRecommendation,
  libraryEntryByKey,
  modelScenario,
  perceptionGap,
  sensitivityTable,
} from "@/domain/coaching";
import { fromDollars } from "@/domain/money";
import { computeM08 } from "@/domain/metrics";
import { obaviaDataset, NOW } from "@/fixtures/obavia";
import { NOW as H_NOW, emptyDataset, mkAssignment, mkInstance, mkOpp, mkUser } from "./helpers";

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

describe("perception gap (perceived minus verified fit)", () => {
  type Spec = { perceived: "likely" | "unlikely" | "unsure"; verified: boolean; won?: boolean };

  /** One closer, every opportunity attended and healthy on the other coached metrics, so the gap is the only signal. */
  function gapDataset(specs: Spec[]) {
    const closer = "usr_closer_a";
    const ds = emptyDataset({ users: [mkUser(closer, ["closer"])] });
    specs.forEach((spec, i) => {
      const id = `opp_${i}`;
      ds.opportunities.push(
        mkOpp(id, {
          currentOwner: { closer },
          contactState: "two_way_contact",
          fitState: spec.verified ? "verified" : spec.perceived === "likely" ? "likely" : "unlikely",
          commercialStatus: spec.won ? "won" : "open",
        }),
      );
      ds.assignments.push(mkAssignment(id, closer, "closer"));
      ds.appointmentInstances.push(mkInstance(`inst_${i}`, id, "attended"));
      ds.assessments.push({
        tenantId: "t_test",
        assessmentId: `qa_${i}`,
        opportunityId: id,
        policyVersion: "fit-policy-test",
        objective: {
          rooftop_count_known: { value: "yes", evidenceRefs: [] },
          budget_authority: { value: spec.verified ? "yes" : "unknown", evidenceRefs: [] },
        },
        repPerceivedFit: spec.perceived,
        reviewState: "confirmed",
        assessedAt: "2026-08-10T16:00:00Z",
        assessedByUserId: closer,
      });
    });
    return { ds, closer };
  }

  /** `attended` cases, `likely` rated likely, `verified` objectively verified, wins on the first `won`. */
  function mix(attended: number, likely: number, verified: number, won = Math.round(attended * 0.4)): Spec[] {
    return Array.from({ length: attended }, (_, i) => ({ perceived: i < likely ? "likely" : "unlikely", verified: i < verified, won: i < won }));
  }

  it("reports the gap in percentage points, perceived minus verified", () => {
    const under = perceptionGap(gapDataset(mix(20, 8, 14)).ds, {}, H_NOW);
    expect(under.perceived.value).toBeCloseTo(0.4);
    expect(under.verified.value).toBeCloseTo(0.7);
    expect(under.gapPoints).toBe(-30);
    expect(under.band).toBe("under_perceiving");
    expect(under.coverage).toEqual({ assessed: 20, attended: 20 });

    const over = perceptionGap(gapDataset(mix(20, 16, 10)).ds, {}, H_NOW);
    expect(over.gapPoints).toBe(30);
    expect(over.band).toBe("over_perceiving");
  });

  it("is null on a zero denominator and on incomplete data", () => {
    const empty = perceptionGap(emptyDataset(), {}, H_NOW);
    expect(empty.gapPoints).toBeNull();
    expect(empty.band).toBe("insufficient");
    expect(empty.coverage).toEqual({ assessed: 0, attended: 0 });

    const specs = mix(20, 8, 14);
    specs[19] = { perceived: "unsure", verified: false };
    const partial = perceptionGap(gapDataset(specs).ds, {}, H_NOW);
    expect(partial.perceived.dataState).toBe("partial");
    expect(partial.gapPoints).toBeNull();
    expect(partial.band).toBe("insufficient");
    expect(partial.coverage).toEqual({ assessed: 19, attended: 20 });
  });

  it("bands: aligned at exactly 10 points, a direction just past it", () => {
    expect(perceptionGap(gapDataset(mix(100, 60, 50)).ds, {}, H_NOW).band).toBe("aligned");
    expect(perceptionGap(gapDataset(mix(100, 60, 50)).ds, {}, H_NOW).gapPoints).toBe(10);
    expect(perceptionGap(gapDataset(mix(100, 40, 50)).ds, {}, H_NOW).band).toBe("aligned");
    expect(perceptionGap(gapDataset(mix(100, 61, 50)).ds, {}, H_NOW).band).toBe("over_perceiving");
    expect(perceptionGap(gapDataset(mix(100, 39, 50)).ds, {}, H_NOW).band).toBe("under_perceiving");
  });

  it("is insufficient under 10 attended even with a large gap", () => {
    const g = perceptionGap(gapDataset(mix(9, 2, 8)).ds, {}, H_NOW);
    expect(g.gapPoints).toBeCloseTo(-66.7);
    expect(g.band).toBe("insufficient");
    expect(g.action).toMatch(/No rating change/);
  });

  it("emits a rep recommendation with both metrics, a team pooled comparator, and alternatives", () => {
    const { ds, closer } = gapDataset(mix(20, 8, 14));
    const rec = RulesCoachingEngine.recommend(ds, closer, H_NOW).find((r) => r.metricIds.includes("M10"));
    expect(rec).toBeDefined();
    expect(rec?.metricIds).toEqual(["M09", "M10"]);
    expect(rec?.observed).toBe("Verified fit 70%, perceived 40%, gap 30 points under");
    expect(rec?.comparator).toMatch(/^Team pooled/);
    expect(rec?.alternativeExplanations).toHaveLength(5);
    expect(rec?.alternativeExplanations.join(" ")).toMatch(/Lead mix/);
    expect(rec?.alternativeExplanations.join(" ")).toMatch(/Assessment coverage/);
    expect(rec?.alternativeExplanations.join(" ")).toMatch(/Inconsistent criteria/);
    expect(rec?.alternativeExplanations.join(" ")).toMatch(/Product knowledge/);
    expect(rec?.alternativeExplanations.join(" ")).toMatch(/Small sample/);
    expect(rec?.action).toMatch(/clarification question/);
    expect(rec?.ownerUserId).toBe(closer);
    expect(rec?.scenario).toBeUndefined();
    expect(rec && isPerceptionGapRecommendation(rec)).toBe(true);
    if (rec && isPerceptionGapRecommendation(rec)) expect(rec.perception.gapPoints).toBe(-30);
  });

  it("is suppressed for a small sample and for an aligned rep", () => {
    const small = gapDataset(mix(9, 2, 8));
    expect(RulesCoachingEngine.recommend(small.ds, small.closer, H_NOW).find((r) => r.metricIds.includes("M10"))).toBeUndefined();
    const aligned = gapDataset(mix(20, 12, 10));
    expect(RulesCoachingEngine.recommend(aligned.ds, aligned.closer, H_NOW).find((r) => r.metricIds.includes("M10"))).toBeUndefined();
  });

  it("never asks a rep to be more positive or diagnoses confidence", () => {
    const actions = [
      libraryEntryByKey("perception_gap")?.action ?? "",
      ...(libraryEntryByKey("perception_gap")?.guardrails ?? []),
      perceptionGap(gapDataset(mix(20, 8, 14)).ds, {}, H_NOW).action,
      perceptionGap(gapDataset(mix(20, 16, 10)).ds, {}, H_NOW).action,
      perceptionGap(gapDataset(mix(20, 12, 10)).ds, {}, H_NOW).action,
      perceptionGap(gapDataset(mix(9, 2, 8)).ds, {}, H_NOW).action,
      perceptionGap(emptyDataset(), {}, H_NOW).action,
    ];
    for (const a of actions) {
      expect(a.toLowerCase()).not.toMatch(/positive/);
      expect(a.toLowerCase()).not.toMatch(/confidence/);
    }
  });

  it("adds a neutral team bottleneck card only above 15 points, owned by sales ops", () => {
    const none = buildBottleneckCards(gapDataset(mix(100, 65, 50)).ds, H_NOW);
    expect(none.find((c) => c.stageId === PERCEPTION_GAP_STAGE_ID)).toBeUndefined();

    const cards = buildBottleneckCards(gapDataset(mix(100, 66, 50)).ds, H_NOW);
    const card = cards.find((c) => c.stageId === PERCEPTION_GAP_STAGE_ID);
    expect(card).toBeDefined();
    expect(card?.responsibleFunction).toBe("sales_ops");
    expect(card?.verdict.state).toBe("neutral_no_benchmark");
    expect(card?.verdict.label).toBe("Contextual");
    expect(card?.observed).toMatch(/Verified fit 50%, perceived 66%, gap 16 points over/);
    expect(card?.candidateExplanations).toHaveLength(5);
    expect(card && isPerceptionGapCard(card)).toBe(true);
    if (card && isPerceptionGapCard(card)) {
      expect(card.perception.verified.numerator).toBe(50);
      expect(card.perception.perceived.numerator).toBe(66);
    }
  });

  it("is deterministic for the same inputs", () => {
    const { ds, closer } = gapDataset(mix(20, 8, 14));
    expect(JSON.stringify(perceptionGap(ds, { userId: closer }, H_NOW))).toBe(JSON.stringify(perceptionGap(ds, { userId: closer }, H_NOW)));
    expect(JSON.stringify(RulesCoachingEngine.recommend(ds, closer, H_NOW))).toBe(JSON.stringify(RulesCoachingEngine.recommend(ds, closer, H_NOW)));
    expect(JSON.stringify(buildBottleneckCards(ds, H_NOW))).toBe(JSON.stringify(buildBottleneckCards(ds, H_NOW)));
  });

  it("stays quiet on the synthetic fixture, where assessment coverage is partial", () => {
    const team = perceptionGap(obaviaDataset, {}, NOW);
    expect(team.perceived.dataState).toBe("partial");
    expect(team.gapPoints).toBeNull();
    expect(buildBottleneckCards(obaviaDataset, NOW).find((c) => c.stageId === PERCEPTION_GAP_STAGE_ID)).toBeUndefined();
  });
});
