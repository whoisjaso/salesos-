import { describe, expect, it } from "vitest";
import {
  APPROACH_TENTATIVE_SENTENCE,
  BUYER_MODE_DIMENSIONS,
  BUYER_MODE_VERSION,
  CONFIDENT,
  MAX_APPROACH,
  MAX_ARCHETYPE_READ,
  NO_APPROACH_WORD,
  READ_MEASURE_SENTENCE,
  SUGGESTED_APPROACH_KICKER,
  UNKNOWN_VALUE,
  VALUE_WORD,
  approachFor,
  confidenceWordFor,
  emptyBuyerMode,
  inferArchetypes,
  inferBuyerMode,
  knownDimensions,
  mergeArchetypeRead,
  mergeBuyerMode,
  validateArchetypeRead,
  validateBuyerMode,
  type BuyerMode,
  type BuyerModeDimension,
} from "@/domain/buyerMode";
import {
  EXTRACTION_JSON_SCHEMA,
  FakeReasoningModel,
  ModelCallIntelligence,
  RuleBasedCallIntelligence,
  StubCallIntelligence,
  modelOutputFrom,
  validateExtraction,
  type TranscriptSpan,
} from "@/domain/callIntelligence";
import { buildSystemPrompt, defaultLensPack, NEVER_INFER_FROM_PERSON, THEIR_DOMAIN_RULE } from "@/domain/lens";
import { lenses } from "@/content/lenses";
import type { CommunicationProfile } from "@/domain/types";
import { transcripts } from "@/fixtures/calls";

const span = (startMs: number, text: string, speaker: TranscriptSpan["speaker"] = "customer"): TranscriptSpan => ({ startMs, endMs: startMs + 4000, text, speaker });
const customer = (text: string, at = 5000) => span(at, text, "customer");
const rep = (text: string, at = 1000) => span(at, text, "rep");

/** The archetype labels from the lens library: never allowed in an approach line. */
const ARCHETYPE_LABELS = lenses.map((l) => l.label);

const profile = (prefs: string[], lens?: CommunicationProfile["lenses"][number]): CommunicationProfile => ({
  tenantId: "t",
  profileId: "cp_1",
  scope: "opportunity_conversation",
  opportunityId: "o1",
  explicitPreferences: prefs.map((text, i) => ({ text, evidenceRef: `ev_${i}` })),
  observedPreferences: [],
  lenses: lens ? [lens] : [],
  lastReviewedAt: "2026-09-15T00:00:00Z",
  reviewDueAt: "2026-09-29T00:00:00Z",
  policyVersion: "profile-policy-1.0",
});

function expectCited(mode: BuyerMode, d: BuyerModeDimension, value: string, text: string) {
  expect(mode[d].value).toBe(value);
  expect(mode[d].confidence).toBeGreaterThan(0);
  expect(mode[d].spans.length).toBeGreaterThan(0);
  expect(mode[d].spans.every((s) => s.speaker === "customer")).toBe(true);
  expect(mode[d].spans.some((s) => s.text.includes(text))).toBe(true);
}

describe("inferBuyerMode: each dimension from the customer's words, with its span", () => {
  it("evidence preference: 'send me the numbers first' reads Quantitative at 0.9", () => {
    const m = inferBuyerMode([rep("What should Marcus open with?"), customer("Send me the numbers first, then we can talk.")]);
    expectCited(m, "evidencePreference", "Quantitative", "Send me the numbers first");
    expect(m.evidencePreference.confidence).toBe(0.9);
  });

  it("control orientation: 'I decide' and 'my call' read High", () => {
    expectCited(inferBuyerMode([customer("I decide on the tools here.")]), "controlOrientation", "High", "I decide");
    expectCited(inferBuyerMode([customer("At the end of the day it's my call.")]), "controlOrientation", "High", "my call");
  });

  it("'my partner and I' is not a value: it lowers control confidence below the approach line and is cited", () => {
    const alone = inferBuyerMode([customer("I decide on the tools.")]);
    const joint = inferBuyerMode([customer("I decide on the tools."), customer("My partner and I run the store together.", 9000)]);
    expect(joint.controlOrientation.value).toBe("High");
    expect(joint.controlOrientation.confidence).toBeLessThan(alone.controlOrientation.confidence);
    expect(joint.controlOrientation.confidence).toBeLessThan(CONFIDENT);
    expect(joint.controlOrientation.spans.some((s) => s.text.includes("My partner and I"))).toBe(true);
    expect(joint.approach).not.toContain("Give two options, not six");
    // Joint alone: a low-confidence Medium, still cited, never an approach line.
    const only = inferBuyerMode([customer("My partner and I run the store together.")]);
    expect(only.controlOrientation.value).toBe("Medium");
    expect(only.controlOrientation.confidence).toBeLessThan(CONFIDENT);
    expect(only.controlOrientation.spans).toHaveLength(1);
  });

  it("decision speed: 'how fast can we start' reads Fast; 'no rush' reads Slow", () => {
    expectCited(inferBuyerMode([customer("How fast can we start if it makes sense?")]), "decisionSpeed", "Fast", "How fast can we start");
    expectCited(inferBuyerMode([customer("There's no rush on our side, maybe next quarter.")]), "decisionSpeed", "Slow", "no rush");
  });

  it("risk sensitivity: 'what happens if it breaks' and 'guarantee' read High", () => {
    expectCited(inferBuyerMode([customer("What happens if it breaks on a Saturday?")]), "riskSensitivity", "High", "What happens if it breaks");
    expectCited(inferBuyerMode([customer("Is there any kind of guarantee on this?")]), "riskSensitivity", "High", "guarantee");
  });

  it("detail appetite: 'just give me the short version' reads Low", () => {
    expectCited(inferBuyerMode([customer("Just give me the short version.")]), "detailAppetite", "Low", "short version");
  });

  it("social proof need: 'who else uses this' reads High", () => {
    expectCited(inferBuyerMode([customer("Who else uses this around here?")]), "socialProofNeed", "High", "Who else uses this");
  });

  it("primary motivation: 'we want to grow' and 'more leads' read Growth", () => {
    expectCited(inferBuyerMode([customer("We want to grow the used side next year.")]), "primaryMotivation", "Growth", "grow");
    expectCited(inferBuyerMode([customer("Honestly we just need more leads worked.")]), "primaryMotivation", "Growth", "more leads");
  });

  it("primary friction: 'last agency burned us' reads Trust and lifts risk to High, both cited", () => {
    const m = inferBuyerMode([customer("The last agency burned us on the setup fee.")]);
    expectCited(m, "primaryFriction", "Trust", "burned us");
    expectCited(m, "riskSensitivity", "High", "burned us");
  });

  it("communication style: 'keep it tight' reads Direct", () => {
    expectCited(inferBuyerMode([customer("I've got fifteen minutes, so keep it tight.")]), "communicationStyle", "Direct", "keep it tight");
  });
});

describe("inferBuyerMode: silence, rep speech, profiles, determinism", () => {
  it("is Unknown at confidence 0 with no spans on every dimension when the transcript is silent", () => {
    for (const m of [inferBuyerMode([]), inferBuyerMode([rep("Hi, this is Tomasz."), customer("Hi.")])]) {
      for (const d of BUYER_MODE_DIMENSIONS) expect(m[d]).toEqual({ value: UNKNOWN_VALUE, confidence: 0, spans: [] });
      expect(m.approach).toEqual([]);
      expect(m.version).toBe(BUYER_MODE_VERSION);
    }
  });

  it("rep speech never counts, however leading", () => {
    const m = inferBuyerMode([
      rep("Send me the numbers first. I decide. How fast can we start? What happens if it breaks? Who else uses this? Keep it tight."),
      span(5000, "Just give me the short version, we want to grow.", "unknown"),
      customer("Okay.", 9000),
    ]);
    for (const d of BUYER_MODE_DIMENSIONS) expect(m[d].value).toBe(UNKNOWN_VALUE);
  });

  it("every non-Unknown value cites at least one customer span, on every fixture transcript", () => {
    for (const [callId, t] of Object.entries(transcripts)) {
      const m = inferBuyerMode(t);
      expect(validateBuyerMode(m), callId).toEqual([]);
      for (const d of BUYER_MODE_DIMENSIONS) {
        if (m[d].value === UNKNOWN_VALUE) continue;
        expect(m[d].spans.length, `${callId} ${d}`).toBeGreaterThan(0);
        expect(m[d].spans.every((s) => s.speaker === "customer"), `${callId} ${d}`).toBe(true);
      }
    }
  });

  it("a profile's explicit preference boosts a matching dimension and cites the stated words", () => {
    const t = [customer("Send me the numbers first.")];
    const plain = inferBuyerMode(t);
    const boosted = inferBuyerMode(t, profile(["prefers numbers first, then the story"]));
    expect(boosted.evidencePreference.value).toBe("Quantitative");
    expect(boosted.evidencePreference.confidence).toBeGreaterThan(plain.evidencePreference.confidence);
    expect(boosted.evidencePreference.confidence).toBeLessThanOrEqual(1);
    expect(boosted.evidencePreference.spans.some((s) => s.text === "prefers numbers first, then the story" && s.speaker === "customer")).toBe(true);
    // A preference alone stands in at reduced confidence, still cited and valid.
    const only = inferBuyerMode([], profile(["prefers numbers first, then the story"]));
    expect(only.evidencePreference.value).toBe("Quantitative");
    expect(only.evidencePreference.confidence).toBeLessThan(plain.evidencePreference.confidence);
    expect(validateBuyerMode(only)).toEqual([]);
  });

  it("is deterministic: the same transcript yields the same bytes", () => {
    const t = transcripts.call_010;
    expect(JSON.stringify(inferBuyerMode(t))).toBe(JSON.stringify(inferBuyerMode(t)));
    expect(JSON.stringify(inferArchetypes(t))).toBe(JSON.stringify(inferArchetypes(t)));
  });

  it("the Svetlana confirmation fixture reads numbers first, a fast decision, and a partner in the room", () => {
    const m = inferBuyerMode(transcripts.call_089c);
    expect(m.evidencePreference.value).toBe("Quantitative");
    expect(m.decisionSpeed.value).toBe("Fast");
    expect(m.controlOrientation.value).toBe("High");
    expect(m.controlOrientation.confidence).toBeLessThan(CONFIDENT);
    expect(m.approach).toContain("Lead with the numbers");
    expect(m.approach).toContain("Name the next step on this call");
    expect(knownDimensions(m)[0]).toBe("evidencePreference");
  });
});

describe("approach lines", () => {
  it("come only from dimensions at or above CONFIDENT, at most six, never an archetype name", () => {
    const m = inferBuyerMode([
      customer("Send me the numbers first."),
      customer("How fast can we start?", 9000),
      customer("What happens if it breaks?", 13000),
      customer("Who else uses this?", 17000),
      customer("Just give me the short version.", 21000),
      customer("The last agency burned us.", 25000),
      customer("We want to grow.", 29000),
      customer("My partner and I run it.", 33000),
    ]);
    expect(m.approach.length).toBeGreaterThan(0);
    expect(m.approach.length).toBeLessThanOrEqual(MAX_APPROACH);
    expect(m.approach).toContain("Lead with the numbers");
    expect(m.approach).toContain("Show one comparable dealer, not a list");
    // Control sits below CONFIDENT because of the partner: no control line.
    expect(m.approach).not.toContain("Give two options, not six");
    for (const line of m.approach) {
      for (const label of ARCHETYPE_LABELS) expect(line.toLowerCase()).not.toContain(label.toLowerCase());
      expect(line).not.toMatch(/archetype|type\b/i);
    }
    // Directly: a dimension under the line earns nothing.
    const low: BuyerMode = { ...emptyBuyerMode(), evidencePreference: { value: "Quantitative", confidence: 0.59, spans: [customer("numbers")] } };
    expect(approachFor(low)).toEqual([]);
    low.evidencePreference.confidence = CONFIDENT;
    expect(approachFor(low)).toEqual(["Lead with the numbers"]);
  });
});

describe("mergeBuyerMode", () => {
  it("keeps the higher-confidence value per dimension and unions spans of the same value", () => {
    const a = inferBuyerMode([customer("Send me the numbers first.", 5000), customer("There's no rush.", 9000)]);
    const b = inferBuyerMode([customer("Show me the data before anything else.", 5000), customer("How fast can we start?", 9000)]);
    const m = mergeBuyerMode(a, b);
    expect(m.evidencePreference.value).toBe("Quantitative");
    expect(m.evidencePreference.spans).toHaveLength(2);
    expect(m.evidencePreference.confidence).toBe(Math.max(a.evidencePreference.confidence, b.evidencePreference.confidence));
    // Fast (0.85) outranks Slow (0.75): the stronger reading wins, with only its spans.
    expect(m.decisionSpeed.value).toBe("Fast");
    expect(m.decisionSpeed.spans).toHaveLength(1);
    // Unknown never overrides a known value; a known value fills an Unknown.
    const silent = inferBuyerMode([]);
    expect(mergeBuyerMode(m, silent).evidencePreference).toEqual(m.evidencePreference);
    expect(mergeBuyerMode(silent, m).decisionSpeed).toEqual(m.decisionSpeed);
    expect(mergeBuyerMode(m, silent).approach).toEqual(m.approach);
    expect(validateBuyerMode(m)).toEqual([]);
  });
});

describe("validation", () => {
  it("rejects a non-Unknown value without a customer span, and an Unknown with confidence", () => {
    const m = emptyBuyerMode();
    m.decisionSpeed = { value: "Fast", confidence: 0.8, spans: [] };
    expect(validateBuyerMode(m).join("; ")).toMatch(/decisionSpeed "Fast" asserted without a customer span/);
    m.decisionSpeed = { value: "Fast", confidence: 0.8, spans: [rep("How fast can we start?")] };
    expect(validateBuyerMode(m).join("; ")).toMatch(/decisionSpeed "Fast" cites a span the customer did not speak/);
    m.decisionSpeed = { value: UNKNOWN_VALUE, confidence: 0.4, spans: [] };
    expect(validateBuyerMode(m).join("; ")).toMatch(/Unknown must carry confidence 0/);
    m.decisionSpeed = { value: "Competence", confidence: 0.8, spans: [customer("x")] };
    expect(validateBuyerMode(m).join("; ")).toMatch(/type label/);
    expect(validateBuyerMode(emptyBuyerMode())).toEqual([]);
  });

  it("validateExtraction rejects an extraction whose buyer mode is uncited, and the model path falls back to the rules", async () => {
    const rules = new RuleBasedCallIntelligence();
    const input = { callId: "c1", opportunityId: "o1", transcript: transcripts.call_010, offerFitKeys: [] };
    const good = rules.extract(input);
    expect(validateExtraction(good).ok).toBe(true);
    expect(good.buyerMode?.evidencePreference.value).toBe("Quantitative");

    const bad = { ...good, buyerMode: { ...good.buyerMode!, socialProofNeed: { value: "High", confidence: 0.9, spans: [] } } };
    const v = validateExtraction(bad);
    expect(v.ok).toBe(false);
    expect(v.errors.join("; ")).toMatch(/buyerMode.socialProofNeed "High" asserted without a customer span/);

    // The model path passes a cited buyer mode through and rejects an uncited one.
    const pass = new ModelCallIntelligence(new FakeReasoningModel(modelOutputFrom(good)), defaultLensPack(), "fake");
    const passed = await pass.extract(input);
    expect(passed.modelVersion).toBe("fake");
    expect(passed.buyerMode).toEqual(good.buyerMode);
    expect(passed.archetypeRead).toEqual(good.archetypeRead);
    const fail = new ModelCallIntelligence(new FakeReasoningModel(modelOutputFrom(bad)), defaultLensPack(), "fake");
    const fell = await fail.extract(input);
    expect(fell.modelVersion).toBe(RuleBasedCallIntelligence.MODEL_VERSION);
    expect(fell.unknowns.join(" ")).toMatch(/buyerMode.socialProofNeed/);
    // A model that says nothing about buyer mode reads all Unknown.
    const silent = new ModelCallIntelligence(new FakeReasoningModel({ ...modelOutputFrom(good), buyerMode: undefined, archetypeRead: undefined }), defaultLensPack(), "fake");
    const s = await silent.extract(input);
    expect(s.modelVersion).toBe("fake");
    expect(s.buyerMode).toEqual(emptyBuyerMode());
    expect(s.archetypeRead).toEqual([]);
  });

  it("the stub says Unknown everywhere and the JSON schema carries the nine dimensions and the read", () => {
    const x = new StubCallIntelligence().extract({ callId: "c", opportunityId: "o", transcript: [], offerFitKeys: [] });
    expect(x.buyerMode).toEqual(emptyBuyerMode());
    expect(x.archetypeRead).toEqual([]);
    expect(validateExtraction(x).ok).toBe(true);
    const schema = EXTRACTION_JSON_SCHEMA.properties.buyerMode;
    for (const d of BUYER_MODE_DIMENSIONS) expect(schema.required).toContain(d);
    expect(EXTRACTION_JSON_SCHEMA.properties.archetypeRead.maxItems).toBe(MAX_ARCHETYPE_READ);
  });
});

describe("archetype read", () => {
  it("weights each lens by the customer's words, at most four, sorted, every entry cited", () => {
    const read = inferArchetypes([
      rep("How does it work? Any risk? What are your goals?"),
      customer("How does it actually work, what are the assumptions?", 5000),
      customer("What's the risk if it breaks? Is there a guarantee?", 9000),
      customer("We want to grow, the goal is two hundred leads a month.", 13000),
      customer("My team has to live with it, so it has to be simple for my people.", 17000),
      customer("Is that a good idea, what would you do?", 21000),
    ]);
    expect(read.length).toBeLessThanOrEqual(MAX_ARCHETYPE_READ);
    expect(read.length).toBeGreaterThan(0);
    for (let i = 1; i < read.length; i++) expect(read[i].probability).toBeLessThanOrEqual(read[i - 1].probability);
    for (const e of read) {
      expect(e.probability).toBeGreaterThanOrEqual(0.2);
      expect(e.spans.length).toBeGreaterThan(0);
      expect(e.spans.every((s) => s.speaker === "customer")).toBe(true);
    }
    expect(validateArchetypeRead(read)).toEqual([]);
    expect(inferArchetypes([rep("How does it work? Any risk?")])).toEqual([]);
  });

  it("a profile lens status moves the probability; merge keeps the max and unions spans", () => {
    const t = [customer("Keep it simple, fewer steps for my people.")];
    const plain = inferArchetypes(t);
    const eff = plain.find((r) => r.name === "efficiency_simplicity")!;
    const confirmed = inferArchetypes(t, profile([], { name: "efficiency_simplicity", status: "confirmed", evidenceRefs: [], contradictingEvidenceRefs: [], humanConfirmed: true })).find((r) => r.name === "efficiency_simplicity")!;
    const contradicted = inferArchetypes(t, profile([], { name: "efficiency_simplicity", status: "contradicted", evidenceRefs: [], contradictingEvidenceRefs: [], humanConfirmed: true })).find((r) => r.name === "efficiency_simplicity");
    expect(confirmed.probability).toBeGreaterThan(eff.probability);
    expect(contradicted?.probability ?? 0).toBeLessThan(eff.probability);

    const later = inferArchetypes([customer("Simple is what I want, and the less work the better.", 40000)]);
    const merged = mergeArchetypeRead(plain, later);
    const m = merged.find((r) => r.name === "efficiency_simplicity")!;
    expect(m.probability).toBe(Math.max(eff.probability, later.find((r) => r.name === "efficiency_simplicity")!.probability));
    expect(m.spans).toHaveLength(2);
    expect(validateArchetypeRead(merged)).toEqual([]);
  });

  it("validation rejects an unsorted, uncited, or unknown-lens read; words for the read are never lens names", () => {
    expect(validateArchetypeRead([{ name: "competence_intelligence", probability: 0.5, spans: [] }]).join(" ")).toMatch(/without a customer span/);
    expect(validateArchetypeRead([{ name: "competence_intelligence", probability: 0.5, spans: [rep("x")] }]).join(" ")).toMatch(/customer did not speak/);
    expect(validateArchetypeRead([{ name: "competence_intelligence", probability: 0.4, spans: [customer("x")] }, { name: "autonomy_control", probability: 0.6, spans: [customer("y")] }]).join(" ")).toMatch(/sorted/);
    expect(validateArchetypeRead([{ name: "nope" as never, probability: 0.6, spans: [customer("y")] }]).join(" ")).toMatch(/unknown lens/);
    for (const l of lenses) {
      expect(VALUE_WORD[l.name]).toBeTruthy();
      expect(VALUE_WORD[l.name].toLowerCase()).not.toBe(l.label.toLowerCase());
    }
    expect(confidenceWordFor(0.72)).toBe("High");
    expect(confidenceWordFor(0.45)).toBe("Medium");
    expect(confidenceWordFor(0.2)).toBe("Low");
  });
});

describe("lens prompt", () => {
  it("asks for the nine dimensions with cited words, forbids inference from the person, and locks the prospect's domain", () => {
    const prompt = buildSystemPrompt(defaultLensPack());
    for (const d of BUYER_MODE_DIMENSIONS) expect(prompt).toContain(d);
    expect(prompt).toMatch(/only what the customer said counts/i);
    expect(prompt).toContain(NEVER_INFER_FROM_PERSON);
    expect(prompt).toMatch(/name, voice, accent, appearance/);
    expect(prompt).toContain(THEIR_DOMAIN_RULE);
    expect(prompt).toMatch(/Never substitute another analogy or a generic synonym/);
    expect(prompt).toMatch(/Repetition raises the weight; first mention already counts/);
    expect(prompt).toMatch(/archetypeRead/);
  });
});

describe("words that stop a percentage from reading as a verdict", () => {
  it("the read sentence says what the percentage measures and never claims anything about the person", () => {
    // The owner's complaint: "Competence 45%" alone invites "45% of what?", worst case a claim
    // about the customer's competence. The sentence that travels with it has to rule that out.
    expect(READ_MEASURE_SENTENCE).toMatch(/percentage is how strongly/i);
    expect(READ_MEASURE_SENTENCE).toMatch(/customer'?s own words/i);
    expect(READ_MEASURE_SENTENCE).toMatch(/not a score for the person/i);
    expect(READ_MEASURE_SENTENCE).toMatch(/not a judgment of their ability/i);
    // Plain words only: no em dash anywhere in the copy this module ships.
    for (const line of [READ_MEASURE_SENTENCE, APPROACH_TENTATIVE_SENTENCE, SUGGESTED_APPROACH_KICKER, NO_APPROACH_WORD]) {
      expect(line).not.toMatch(/—/);
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it("the approach kicker leads with doing, and its caveat says the recommendation is tentative and unchecked", () => {
    expect(SUGGESTED_APPROACH_KICKER).toBe("Suggested approach");
    expect(APPROACH_TENTATIVE_SENTENCE).toMatch(/tentative/i);
    expect(APPROACH_TENTATIVE_SENTENCE).toMatch(/earlier conversation/i);
    expect(APPROACH_TENTATIVE_SENTENCE).toMatch(/not been checked/i);
    // What leads the brief is a real instruction from the buyer mode, never a type label.
    const mode = inferBuyerMode([customer("Send me the numbers first, then we can talk.")]);
    expect(mode.approach[0]).toBe("Lead with the numbers");
    for (const label of ARCHETYPE_LABELS) expect(mode.approach[0]).not.toContain(label);
  });
});
