import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_EXPECTATIONS,
  BANK_CLAIMED_TOTAL,
  BANK_COUNTS,
  DECISION_HISTORY_TREE,
  DELIVERY_CUES,
  DO_NOTS,
  ENTRY_ROUTES,
  IMPACT_FORMULA_PRINCIPLES,
  LISTENER_EXAMPLES,
  LISTENER_RULES,
  LIVE_QUESTIONS,
  OBJECTION_TREE,
  PHASES,
  PITCH_STRUCTURE,
  PRIVATE_TRAINING,
  QUESTION_BANK,
  SOURCE_TAXONOMIES,
  STUDY_ONLY,
  byPhase,
  frameworkForLens,
  listenerExample,
  phaseForStage,
  type DecisionNode,
} from "@/content/frameworks";

describe("question bank", () => {
  it("parsed every record the source claims", () => {
    expect(BANK_COUNTS.total).toBe(BANK_CLAIMED_TOTAL);
    expect(BANK_COUNTS.total).toBe(207);
    expect(BANK_COUNTS.adapt + BANK_COUNTS.study_only + BANK_COUNTS.private_training).toBe(BANK_COUNTS.total);
    expect(BANK_COUNTS).toMatchObject({ adapt: 160, study_only: 33, private_training: 14 });
  });

  it("has unique ids and non-empty text on every record", () => {
    const ids = new Set(QUESTION_BANK.map((r) => r.id));
    expect(ids.size).toBe(QUESTION_BANK.length);
    for (const r of QUESTION_BANK) {
      expect(r.template.length).toBeGreaterThan(0);
      expect(r.purpose.length).toBeGreaterThan(0);
      expect(r.sourceRef).toMatch(/^[AB], [AB]\d\d, original characters \[\d+, \d+\)$/);
    }
  });

  it("keeps study_only and private_training out of LIVE_QUESTIONS", () => {
    expect(LIVE_QUESTIONS.length).toBe(BANK_COUNTS.adapt);
    expect(LIVE_QUESTIONS.some((r) => r.use === "study_only")).toBe(false);
    expect(LIVE_QUESTIONS.some((r) => r.use === "private_training")).toBe(false);
    expect(STUDY_ONLY.every((r) => r.use === "study_only")).toBe(true);
    expect(PRIVATE_TRAINING.every((r) => r.use === "private_training")).toBe(true);
  });

  it("classifies the coercive records as study_only", () => {
    const ids = STUDY_ONLY.map((r) => r.id);
    for (const id of ["L06", "C06", "D01", "D02", "D03", "D04", "O14", "O19", "U06"]) expect(ids).toContain(id);
  });

  it("byPhase returns bank order and can drop non-live records", () => {
    const all = byPhase("logicalCertainty");
    const live = byPhase("logicalCertainty", true);
    expect(all.map((r) => r.id)).toContain("L06");
    expect(live.map((r) => r.id)).not.toContain("L06");
    expect(live.length).toBeLessThan(all.length);
    const sum = Object.values(BANK_COUNTS.byPhase).reduce((a, b) => a + b, 0);
    expect(sum).toBe(BANK_COUNTS.total);
  });

  it("does not carry raw source excerpts", () => {
    for (const r of QUESTION_BANK) {
      expect(r.template.length).toBeLessThan(300);
      expect(r.purpose).not.toMatch(/Unchanged source excerpt/);
    }
  });
});

describe("impact formula", () => {
  it("has four phases mapped one-to-one onto our four stages, each with required evidence", () => {
    expect(PHASES.map((p) => p.id)).toEqual(["intent", "logicalCertainty", "emotionalCertainty", "pitch"]);
    expect(PHASES.map((p) => p.ourStage)).toEqual(["contacted", "qualified", "buying", "bought"]);
    for (const p of PHASES) {
      expect(p.requiredEvidence.length).toBeGreaterThan(0);
      expect(p.answerObjectives.length).toBeGreaterThan(0);
      expect(p.bankIds.length).toBeGreaterThan(0);
    }
    expect(phaseForStage("bought").id).toBe("pitch");
  });

  it("points phase bankIds at real, live records", () => {
    const live = new Set(LIVE_QUESTIONS.map((r) => r.id));
    for (const p of PHASES) for (const id of p.bankIds) expect(live.has(id), `${p.id} -> ${id}`).toBe(true);
  });

  it("collects the do-nots, including the forced positive and the regret probe", () => {
    expect(DO_NOTS.length).toBeGreaterThan(20);
    expect(DO_NOTS.some((d) => /forced positive/i.test(d))).toBe(true);
    expect(DO_NOTS.some((d) => /regret probe/i.test(d))).toBe(true);
    expect(DO_NOTS.some((d) => /identity as worth/i.test(d))).toBe(true);
    expect(DO_NOTS.some((d) => /deflate status/i.test(d))).toBe(true);
    expect(DO_NOTS.some((d) => /fill gaps/i.test(d))).toBe(true);
    expect(DO_NOTS.some((d) => /distressed/i.test(d))).toBe(true);
    expect(DO_NOTS.some((d) => /affordability test/i.test(d))).toBe(true);
  });

  it("flags cold outbound as an Apohenia addition and nothing else", () => {
    expect(ENTRY_ROUTES.filter((r) => r.apoheniaAddition).map((r) => r.id)).toEqual(["coldOutbound"]);
  });

  it("marks coercive objection steps study-only and keeps a respectful exit", () => {
    const studyIds: string[] = [];
    for (const b of OBJECTION_TREE.branches) for (const s of b.steps) if (s.studyOnly && s.bankId) studyIds.push(s.bankId);
    for (const id of ["O09", "O10", "O11", "O14", "O16", "O19"]) expect(studyIds).toContain(id);
    // Every step marked study-only in the tree matches the bank's own classification.
    const bankStudy = new Set(STUDY_ONLY.map((r) => r.id));
    for (const id of studyIds) expect(bankStudy.has(id), id).toBe(true);
    // And every live (non-study) step with a bankId is a live record.
    const live = new Set(LIVE_QUESTIONS.map((r) => r.id));
    for (const b of OBJECTION_TREE.branches) for (const s of b.steps) if (!s.studyOnly && s.bankId && s.bankId !== "O31") expect(live.has(s.bankId), s.bankId).toBe(true);
    expect(OBJECTION_TREE.fearFrames.every((f) => f.studyOnly)).toBe(true);
    expect(OBJECTION_TREE.exit.steps.some((s) => /no minimum number of attempts/i.test(s))).toBe(true);
    expect(OBJECTION_TREE.branches[0].id).toBe("moneyLogistics");
  });

  it("keeps both price placements as named variants", () => {
    expect(PITCH_STRUCTURE.variants.map((v) => v.id).sort()).toEqual(["priceAfterPillars", "priceFirst"]);
  });

  it("marks delivery cues as described, and taxonomies as not the archetype system", () => {
    expect(DELIVERY_CUES.every((c) => c.basis === "described")).toBe(true);
    expect(SOURCE_TAXONOMIES.length).toBe(3);
    expect(SOURCE_TAXONOMIES.every((t) => t.notTheArchetypeSystem === true)).toBe(true);
    const sixNeeds = SOURCE_TAXONOMIES[0].categories;
    expect(sixNeeds).not.toContain("approval");
    expect(sixNeeds).not.toContain("intelligence");
  });

  it("decision tree has the four source leaves and labels additions", () => {
    const leaves: DecisionNode[] = [];
    const walk = (n: DecisionNode) => {
      if (!n.branches) leaves.push(n);
      else Object.values(n.branches).forEach(walk);
    };
    walk(DECISION_HISTORY_TREE);
    const sourceLeafIds = leaves.filter((l) => !l.productionAddition).map((l) => l.bankId).sort();
    expect(sourceLeafIds).toEqual(["E04", "E04", "E07", "E08"]);
    expect(leaves.some((l) => l.productionAddition)).toBe(true);
  });
});

describe("frameworkForLens", () => {
  it("returns the LensPack salesFrameworks shape with bounded principles", () => {
    const fws = frameworkForLens();
    expect(fws[0]).toMatchObject({ name: "Impact Formula", source: "docs/sources/apohenia" });
    for (const f of fws) {
      expect(Array.isArray(f.principles)).toBe(true);
      expect(Array.isArray(f.doNots)).toBe(true);
      expect(f.principles.length).toBeGreaterThan(0);
      expect(f.doNots.length).toBeGreaterThan(0);
    }
    expect(IMPACT_FORMULA_PRINCIPLES.length).toBeLessThanOrEqual(25);
  });

  it("never quotes study_only or private_training template text", () => {
    const text = frameworkForLens()
      .flatMap((f) => [...f.principles, ...f.doNots])
      .join("\n")
      .toLowerCase();
    for (const r of [...STUDY_ONLY, ...PRIVATE_TRAINING]) {
      const t = r.template.toLowerCase();
      expect(text.includes(t), `${r.id} template leaked`).toBe(false);
    }
  });

  it("every do-not is a single line with no em dash", () => {
    const emDash = String.fromCharCode(0x2014);
    for (const line of [...DO_NOTS, ...LISTENER_RULES, ...IMPACT_FORMULA_PRINCIPLES]) {
      expect(line.includes(emDash)).toBe(false);
      expect(line).not.toMatch(/\n/);
    }
  });
});

describe("personal meaning listener", () => {
  it("has six examples that parse with the expected captures", () => {
    expect(LISTENER_EXAMPLES.map((e) => e.id)).toEqual(["hockey", "jazz", "souffle", "ambushed", "basketball", "profit"]);
    for (const e of LISTENER_EXAMPLES) {
      expect(e.prospectUtterance.length).toBeGreaterThan(0);
      expect(e.expectedCapture.cardLabel.length).toBeGreaterThan(0);
      expect(e.expectedCapture.prohibitedInferences.length).toBeGreaterThan(0);
      expect(e.expectedCapture.origin).toBe("prospect_spontaneous");
    }
  });

  it("jazz preserves the relationship, not just the noun", () => {
    const jazz = listenerExample("jazz");
    expect(jazz.expectedCapture.cardLabel).toContain("EVERYBODY WANTS A SOLO");
    expect(jazz.expectedCapture.comparisonRelationship.toLowerCase()).toContain("everybody wants a solo");
    expect(jazz.expectedSuggestion).toContain("jazz-band example");
    expect(jazz.expectedCapture.prohibitedInferences).toContain("the prospect is a musician");
  });

  it("basketball abstains and ambushed stays inferred until the follow-up", () => {
    expect(listenerExample("basketball").expectedSuggestion).toBeNull();
    const amb = listenerExample("ambushed");
    expect(amb.expectedCapture.meaningStatus).toBe("inferred");
    expect(amb.followUp?.updatedStatus).toBe("confirmed");
  });

  it("lists the twenty acceptance expectations and the rules", () => {
    expect(ACCEPTANCE_EXPECTATIONS.map((a) => a.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(LISTENER_RULES.some((r) => /first unprompted mention/i.test(r))).toBe(true);
    expect(LISTENER_RULES.some((r) => /not the noun/i.test(r))).toBe(true);
    expect(LISTENER_RULES.some((r) => /four kinds/i.test(r))).toBe(true);
    expect(LISTENER_RULES.some((r) => /no biography/i.test(r))).toBe(true);
    expect(LISTENER_RULES.some((r) => /abstaining is a valid output/i.test(r))).toBe(true);
    expect(LISTENER_RULES.some((r) => /stop using a reference when the prospect rejects/i.test(r))).toBe(true);
    expect(LISTENER_RULES.some((r) => /seller priming/i.test(r))).toBe(true);
  });
});
