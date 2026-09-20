import { describe, expect, it } from "vitest";
import {
  PERCEPTION_GAP_STAGE_ID,
  RulesCoachingEngine,
  TRANSCRIPT_COACHING_WINDOW_DAYS,
  benchmarkOpportunityScenario,
  buildBottleneckCards,
  coachingPlan,
  isPerceptionGapCard,
  isPerceptionGapRecommendation,
  libraryEntryByKey,
  modelScenario,
  perceptionGap,
  sensitivityTable,
} from "@/domain/coaching";
import { FORBIDDEN_AI_EVENT_TYPE, FORBIDDEN_EXTRACTION_FIELD } from "@/domain/callIntelligence";
import { fromDollars } from "@/domain/money";
import { computeM08, type Dataset } from "@/domain/metrics";
import type { LedgerEntry } from "@/domain/types";
import { obaviaDataset, NOW } from "@/fixtures/obavia";
import { transcripts } from "@/fixtures/calls";
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
  it("holds attendance coaching while attendance evidence is unresolved, and names the owner", () => {
    const show = computeM08(obaviaDataset, {}, NOW);
    expect(show.dataState).toBe("partial");
    const plan = coachingPlan(obaviaDataset, null, NOW);
    const attendance = plan.held.find((r) => r.metricIds.includes("M08"));
    expect(attendance?.suppressed?.reason).toMatch(/unresolved attendance/);
    expect(attendance?.action).toBe("resolve attendance evidence");
    expect(attendance?.scenario).toBeUndefined();
    expect(attendance?.ownerRole).toBe("sales_ops");
    expect(attendance?.held?.ownerLabel).toBe("Sales ops");
    expect(attendance?.held?.waitingOn).toMatch(/unresolved attendance outcome/);
    expect(attendance?.dependsOn).toEqual(["attendance_outcome"]);
    // Nothing in the standing list is waiting on anything.
    expect(plan.standing.every((r) => r.held === undefined)).toBe(true);
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

describe("a held measurement never holds the coaching", () => {
  const closer = "usr_closer_a";

  /** One closer, every opportunity attended, with a real perception gap read from assessments. */
  function transcriptDataset(extra: Partial<Dataset> = {}) {
    const ds = emptyDataset({ users: [mkUser(closer, ["closer"])], ...extra });
    for (let i = 0; i < 20; i += 1) {
      const id = `opp_${i}`;
      const verified = i < 14;
      ds.opportunities.push(
        mkOpp(id, {
          currentOwner: { closer },
          contactState: "two_way_contact",
          fitState: verified ? "verified" : "unlikely",
          commercialStatus: i < 8 ? "won" : "open",
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
          budget_authority: { value: verified ? "yes" : "unknown", evidenceRefs: [] },
        },
        repPerceivedFit: i < 8 ? "likely" : "unlikely",
        reviewState: "confirmed",
        assessedAt: "2026-08-10T16:00:00Z",
        assessedByUserId: closer,
      });
    }
    return ds;
  }

  const unlinkedPayment: LedgerEntry = {
    tenantId: "t_test",
    entryId: "led_unlinked",
    opportunityId: undefined,
    kind: "payment_collected",
    amount: fromDollars(4_000),
    providerRef: "pi_unlinked",
    idempotencyKey: "k:led_unlinked",
    occurredAt: "2026-09-10T10:00:00Z",
    receivedAt: "2026-09-10T10:00:05Z",
    commercialCategory: "new_customer",
  };

  const clean = transcriptDataset();
  const withUnlinked = transcriptDataset({ ledger: [unlinkedPayment] });

  it("an unlinked payment does not hide the coaching read from the conversation", () => {
    const before = coachingPlan(clean, closer, H_NOW);
    const after = coachingPlan(withUnlinked, closer, H_NOW);
    expect(after.standing.map((r) => r.recommendationId)).toEqual(before.standing.map((r) => r.recommendationId));
    const gap = after.standing.find((r) => r.metricIds.includes("M10"));
    expect(gap).toBeDefined();
    expect(gap?.held).toBeUndefined();
    expect(gap?.action).toMatch(/clarification question/);
    expect(gap?.dependsOn).toEqual(["attendance_outcome"]);
    expect(gap?.provisional).toBe(false);
    // And the rep still gets a primary task, not a data chore.
    expect(RulesCoachingEngine.recommend(withUnlinked, closer, H_NOW)[0].held).toBeUndefined();
  });

  it("an unlinked payment does make the commission and revenue recommendation wait, with its owner", () => {
    const plan = coachingPlan(withUnlinked, closer, H_NOW);
    const revenue = plan.held.find((r) => r.metricIds.includes("M16"));
    expect(revenue).toBeDefined();
    expect(revenue?.dependsOn).toEqual(["revenue_attribution"]);
    expect(revenue?.held?.waitingOn).toMatch(/unlinked payment/);
    expect(revenue?.held?.ownerLabel).toBe("Sales ops");
    expect(revenue?.held?.owner).toBe("sales_ops");
    expect(revenue?.action).toBe("verify payment mapping");
    expect(revenue?.title).toMatch(/^Waiting on data:/);
    expect(revenue?.suppressed?.reason).toBe(revenue?.held?.statement);
    expect(revenue?.scenario).toBeUndefined();
    // The same recommendation stands on its own when nothing is unlinked.
    expect(coachingPlan(clean, closer, H_NOW).held.find((r) => r.metricIds.includes("M16"))).toBeUndefined();
  });

  it("a held recommendation never displaces valid coaching", () => {
    const recs = RulesCoachingEngine.recommend(withUnlinked, closer, H_NOW);
    const firstHeld = recs.findIndex((r) => r.held !== undefined);
    const lastStanding = recs.map((r) => r.held === undefined).lastIndexOf(true);
    expect(firstHeld).toBeGreaterThan(lastStanding);
    expect(recs.filter((r) => r.held !== undefined)).toHaveLength(1);
    expect(recs.filter((r) => r.held === undefined).length).toBeGreaterThan(0);
  });

  it("the plan is deterministic and pure", () => {
    expect(JSON.stringify(coachingPlan(withUnlinked, closer, H_NOW))).toBe(JSON.stringify(coachingPlan(withUnlinked, closer, H_NOW)));
  });

  it("the owner's unlinked-payment card states the limited effect", () => {
    const card = buildBottleneckCards(withUnlinked, H_NOW).find((c) => c.cardId === "bn_unlinked_payments");
    expect(card?.verdict.explanation).toMatch(/Calling, appointments, XP, levels, and coaching read from conversations are unaffected/);
    expect(card?.responsibleFunction).toBe("finance");
  });
});

/**
 * Every coached metric rests on attendance or revenue attribution, so a single
 * unlinked payment or one unevidenced meeting used to leave a rep with nothing but
 * waiting rows. Coaching read from the rep's own conversation depends on no surface
 * (docs/DECISIONS.md, "A held measurement never holds the person").
 */
describe("coaching read from the rep's own conversation", () => {
  const SETTER = "usr_setter_tomasz";
  const CLOSER = "usr_closer_marcus";

  const unlinked = obaviaDataset.ledger.filter((e) => e.opportunityId === undefined);

  it("a rep with an unlinked payment still gets a standing recommendation, and nothing holds it", () => {
    expect(unlinked.length).toBeGreaterThan(0);
    // Without the conversations there is nothing that stands, because every coached
    // metric rests on attendance or revenue attribution. That was the gap, and it is
    // why the pilot dataset carries its transcripts: the honest behaviour is the default.
    const withoutConversations = { ...obaviaDataset, transcripts: undefined };
    expect(coachingPlan(withoutConversations, SETTER, NOW).standing).toHaveLength(0);

    const plan = coachingPlan(obaviaDataset, SETTER, NOW);
    expect(plan.standing).not.toHaveLength(0);
    const rec = plan.standing[0];
    expect(rec).toBeDefined();
    expect(rec.held).toBeUndefined();
    expect(rec.suppressed).toBeUndefined();
    expect(rec.provisional).toBe(false);
    // Nothing to depend on: the transcript is the whole evidence.
    expect(rec.dependsOn).toEqual([]);
    expect(rec.metricIds).toEqual([]);
    expect(rec.ownerRole).toBe("rep");
    expect(rec.ownerUserId).toBe(SETTER);
    expect(rec.dataState).toBe("complete");
    // And the revenue recommendation still waits, with its owner, exactly as before.
    const revenue = plan.held.find((r) => r.metricIds.includes("M16"));
    expect(revenue?.held?.waitingOn).toMatch(/unlinked payment/);
  });

  it("is a real primary task: the rep's first recommendation, ahead of every waiting row", () => {
    const recs = RulesCoachingEngine.recommend(obaviaDataset, SETTER, NOW, { transcripts });
    expect(recs[0].held).toBeUndefined();
    expect(recs[0].title).toBe("An objection was left open");
    expect(recs[0].action).toBe("Name it back in their words before the next step, and ask what would settle it.");
    // The same for a closer, whose conversation named someone else in the decision.
    const closer = RulesCoachingEngine.recommend(obaviaDataset, CLOSER, NOW, { transcripts })[0];
    expect(closer.held).toBeUndefined();
    expect(closer.title).toBe("A partner decides with them");
  });

  it("cites the call and the exact spans, and quotes what was said", () => {
    const rec = coachingPlan(obaviaDataset, SETTER, NOW, { transcripts }).standing[0];
    expect(rec.evidenceRefs[0]).toBe("call_016");
    expect(rec.evidenceRefs.slice(1).every((r) => /^call_016:span:\d+-\d+$/.test(r))).toBe(true);
    expect(rec.evidenceRefs.length).toBeGreaterThan(1);
    expect(rec.cohortId).toBe(`cohort:user=${SETTER}:call=call_016`);
    const span = transcripts.call_016.find((s) => `call_016:span:${s.startMs}-${s.endMs}` === rec.evidenceRefs[1]);
    expect(span).toBeDefined();
    expect(rec.observed).toContain(span!.text.trim());
    expect(rec.observed).toContain("Desmond Castellano");
    expect(rec.observed).toContain("0:52");
  });

  it("establishes no money, consent, or attendance fact", () => {
    for (const userId of [SETTER, CLOSER]) {
      const rec = coachingPlan(obaviaDataset, userId, NOW, { transcripts }).standing[0];
      expect(FORBIDDEN_AI_EVENT_TYPE.test(rec.title)).toBe(false);
      expect(FORBIDDEN_EXTRACTION_FIELD.test(`${rec.title} ${rec.action}`)).toBe(false);
      // Nothing outside the transcript is cited, so nothing outside it can be claimed.
      expect(rec.evidenceRefs.every((r) => r.startsWith("call_"))).toBe(true);
      expect(rec.scenario).toBeUndefined();
    }
  });

  it("stops coaching once the call is older than the window", () => {
    const later = new Date(Date.parse(NOW) + (TRANSCRIPT_COACHING_WINDOW_DAYS + 5) * 86_400_000).toISOString().replace(".000Z", "Z");
    const plan = coachingPlan(obaviaDataset, SETTER, later, { transcripts });
    const fromCall = [...plan.standing, ...plan.held].filter((r) => r.metricIds.length === 0);
    expect(fromCall).toHaveLength(0);
    // Inside the window it is still there.
    expect(coachingPlan(obaviaDataset, SETTER, NOW, { transcripts }).standing[0].metricIds).toEqual([]);
  });

  it("reads the transcripts the dataset carries, and is deterministic and pure", () => {
    const carried = coachingPlan({ ...obaviaDataset, transcripts }, SETTER, NOW);
    const passed = coachingPlan(obaviaDataset, SETTER, NOW, { transcripts });
    expect(JSON.stringify(carried)).toBe(JSON.stringify(passed));
    expect(JSON.stringify(passed)).toBe(JSON.stringify(coachingPlan(obaviaDataset, SETTER, NOW, { transcripts })));
  });

  it("says nothing when the rep has no recent conversation to read", () => {
    // This closer's calls carry no transcript in the fixture, so nothing is invented.
    const plan = coachingPlan(obaviaDataset, "usr_closer_renata", NOW, { transcripts });
    expect(plan.standing.filter((r) => r.metricIds.length === 0)).toHaveLength(0);
    expect(plan.held.length).toBeGreaterThan(0);
  });
});
