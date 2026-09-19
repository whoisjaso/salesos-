import { describe, expect, it } from "vitest";
import { ACCEPTANCE_EXPECTATIONS, LISTENER_RULES, listenerExample } from "@/content/frameworks/personalMeaningListener";
import { FakeReasoningModel, ModelCallIntelligence, modelOutputFrom, RuleBasedCallIntelligence, validateExtraction, type TranscriptSpan } from "@/domain/callIntelligence";
import { defaultLensPack } from "@/domain/lens";
import {
  breaksDomainLock,
  conceptsFor,
  dismiss,
  DOMAIN_LOCK_RULE,
  domainFor,
  extractReferences,
  FORBIDDEN_SUGGESTION,
  invalidateOnRetraction,
  pin,
  reject,
  significance,
  suggestReuse,
  unpin,
  utteranceIdFor,
  vocabulary,
} from "@/domain/references";

/**
 * Deterministic evidence and lifecycle tests for the Personal Meaning Listener
 * (ACCEPTANCE_EXPECTATIONS in src/content/frameworks/personalMeaningListener.ts). The
 * rule-based extractor is the honest baseline; model-quality expectations are checked
 * here only as far as the rules reach.
 */

let clock = 0;
const turn = (speaker: TranscriptSpan["speaker"], text: string): TranscriptSpan => {
  const startMs = clock;
  clock += 5000;
  return { startMs, endMs: startMs + 4000, text, speaker };
};
const reset = () => {
  clock = 0;
};

const FILLER: [TranscriptSpan["speaker"], string][] = [
  ["rep", "How many stores are in the group today?"],
  ["customer", "Two, and a third opening in the spring."],
  ["rep", "Who answers the website chat after hours?"],
  ["customer", "Nobody, it waits until morning."],
  ["rep", "Which DMS are you on?"],
  ["customer", "CDK at both stores."],
  ["rep", "And the BDC sits at the flagship?"],
  ["customer", "Right, three people."],
];

function conversation(before: [TranscriptSpan["speaker"], string][], filler = 0, after: [TranscriptSpan["speaker"], string][] = []): TranscriptSpan[] {
  reset();
  const lines = [...before, ...FILLER.slice(0, filler), ...after];
  return lines.map(([s, t]) => turn(s, t));
}

describe("recognition: first mention, relationship preserved", () => {
  it("1. hockey is captured on the first mention, before any repetition, with the relationship", () => {
    const t = conversation([["rep", "How do inquiries get handled today?"], ["customer", listenerExample("hockey").prospectUtterance]]);
    const refs = extractReferences(t, { conversationId: "c1" });
    expect(refs).toHaveLength(1);
    const r = refs[0];
    expect(r.semantics.kind).toBe("analogy");
    expect(r.semantics.sourceDomain).toBe("hockey");
    expect(r.evidence.exactExpression).toBe("like a hockey team where nobody knows who is defending");
    expect(r.evidence.exactQuote).toBe(listenerExample("hockey").prospectUtterance);
    expect(r.semantics.comparisonRelationship).toMatch(/nobody knows who is defending/);
    expect(r.semantics.describedTarget).toMatch(/inquiries/);
    expect(r.semantics.valence).toEqual({ value: "negative", object: "nobody knows who is defending" });
    expect(r.semantics.origin).toBe("prospect_spontaneous");
    expect(r.semantics.meaningStatus).toBe("observed");
    expect(r.lifecycle.occurrenceCount).toBe(1);
    expect(r.lifecycle.state).toBe("held");
    expect(conceptsFor(r)).toContain("coordination");
    // The quote is verbatim and the offsets point at it.
    expect(t[1].text.slice(r.evidence.offsets.start, r.evidence.offsets.end)).toBe(r.evidence.exactExpression);
    expect(r.evidence.utteranceId).toBe(utteranceIdFor("c1", t[1]));
    expect(r.spans).toEqual([t[1]]);
    expect(r.evidence.turnStartMs).toBe(t[1].startMs);
    // No biography: the prohibitions name what the record does not support.
    expect(r.semantics.prohibitedInferences).toEqual(expect.arrayContaining(["personal connection to hockey", "biography or hobby"]));
  });

  it("2. jazz keeps 'everybody wants to play a solo', not only the music noun", () => {
    const t = conversation([["customer", listenerExample("jazz").prospectUtterance]]);
    const [r] = extractReferences(t);
    expect(r.semantics.sourceDomain).toBe("jazz");
    expect(r.evidence.exactExpression).toBe("like running a jazz band where everybody wants to play a solo");
    expect(r.semantics.comparisonRelationship).toBe("everybody wants to play a solo");
    expect(r.semantics.describedTarget).toBe("managing these salespeople");
    expect(conceptsFor(r)).toContain("individuality_vs_structure");
  });

  it("4. soufflé's negative valence attaches to the collapse after effort, not to cooking", () => {
    const t = conversation([["customer", listenerExample("souffle").prospectUtterance]]);
    const [r] = extractReferences(t);
    expect(r.semantics.sourceDomain).toBe("cooking");
    expect(r.semantics.valence.value).toBe("negative");
    expect(r.semantics.valence.object).toMatch(/collapse/);
    expect(r.semantics.valence.object).not.toMatch(/cooking/);
    expect(r.semantics.describedTarget).toBe("that last website project");
    expect(conceptsFor(r)).toContain("effort_then_failure");
    expect(r.semantics.prohibitedInferences).toEqual(expect.arrayContaining(["personal connection to cooking"]));
  });

  it("an unseen domain still captures the relationship: a relay where nobody is holding the baton", () => {
    const t = conversation([["customer", "After six it's like a relay where nobody's holding the baton and the lead just sits there."]]);
    const [r] = extractReferences(t);
    expect(r).toBeDefined();
    expect(r.semantics.sourceDomain).toBe("relay");
    expect(r.semantics.comparisonRelationship).toMatch(/nobody's holding the baton/);
    expect(conceptsFor(r)).toContain("coordination");
  });

  it("a repeated mention raises the count on the same card and never makes a second one", () => {
    const t = conversation([
      ["customer", listenerExample("hockey").prospectUtterance],
      ["rep", "Say more about that."],
      ["customer", "It's a hockey team where nobody covers the net. Same thing every night."],
    ]);
    const refs = extractReferences(t);
    expect(refs).toHaveLength(1);
    expect(refs[0].lifecycle.occurrenceCount).toBe(2);
    expect(refs[0].lifecycle.firstObservedTurn).not.toBe(refs[0].lifecycle.lastObservedTurn);
  });
});

describe("meaning status and confirmation", () => {
  it("5. ambushed stays inferred until the customer explains it, then reads confirmed with its evidence", () => {
    const amb = listenerExample("ambushed");
    const before = conversation([["customer", amb.prospectUtterance]]);
    const [held] = extractReferences(before);
    expect(held.semantics.kind).toBe("emotional_description");
    expect(held.evidence.exactExpression).toBe("ambushed");
    expect(held.semantics.meaningStatus).toBe("inferred");
    expect(held.semantics.explainedMeaning).toBeUndefined();
    expect(held.semantics.describedTarget).toBe("the extra charges");
    expect(held.semantics.valence.value).toBe("negative");
    expect(held.semantics.prohibitedInferences).toContain("flattening to a generic objection");

    const after = conversation([
      ["customer", amb.prospectUtterance],
      ["rep", amb.expectedSuggestion!],
      ["customer", amb.followUp!.prospectUtterance],
    ]);
    const [confirmed] = extractReferences(after, { conversationId: "c2" });
    expect(confirmed.semantics.meaningStatus).toBe("confirmed");
    expect(confirmed.semantics.explainedMeaning).toEqual({ text: amb.followUp!.prospectUtterance, utteranceId: utteranceIdFor("c2", after[2]) });
    expect(conceptsFor(confirmed)).toContain("unexpected_cost_after_commitment");
  });

  it("a rep explanation never confirms the meaning; only a customer turn does", () => {
    const t = conversation([
      ["customer", "I felt ambushed by the extra charges."],
      ["rep", "When you say ambushed, do you mean they weren't disclosed?"],
      ["rep", "Because with most vendors it's the second one."],
    ]);
    expect(extractReferences(t)[0].semantics.meaningStatus).toBe("inferred");
  });

  it("6. the basketball injury creates no injury history, no team preference, and is never reused upbeat", () => {
    const t = conversation([["customer", listenerExample("basketball").prospectUtterance]], 4, [["customer", "Who handles the first response when we roll this out?"]]);
    const refs = extractReferences(t);
    expect(refs).toHaveLength(1);
    const r = refs[0];
    expect(r.semantics.sourceDomain).toBe("basketball");
    expect(r.semantics.valence.value).toBe("negative");
    expect(r.semantics.valence.object).toBe("that setback, compared to breaking your leg");
    expect(r.semantics.prohibitedInferences).toEqual(expect.arrayContaining(["an injury history", "team preference", "gambling history", "dislike of the domain"]));
    // Outside the explicit prohibitions, the record never states a dislike, an injury history, or an upbeat line.
    const { prohibitedInferences: _p, ...semantics } = r.semantics;
    void _p;
    expect(JSON.stringify({ ...r, semantics })).not.toMatch(/dislike|injur(ed|y)|slam dunk|gambl/i);
    expect(conceptsFor(r)).toContain("painful_event");
    // Held, never suggested, even when the later turn is about coordination or a rollout.
    expect(suggestReuse(refs, t[t.length - 1], "qualified")).toBeNull();
  });

  it("7. profit stays distinct from revenue in wording and in the record", () => {
    const t = conversation([["customer", listenerExample("profit").prospectUtterance]]);
    const [r] = extractReferences(t);
    expect(r.semantics.kind).toBe("personally_defined_term");
    expect(r.semantics.sourceDomain).toBe("finance");
    expect(r.semantics.describedTarget).toBe("profit");
    expect(r.evidence.exactExpression).toBe("Profit is what matters to me");
    expect(r.semantics.comparisonRelationship).toBe("Profit is the stated priority, explicitly distinguished from revenue.");
    expect(r.semantics.meaningStatus).toBe("confirmed");
    expect(r.semantics.prohibitedInferences).toContain("relabeling other figures as this term");
    const s = suggestReuse([r], turn("customer", "So what does this do to my margin?"), "buying");
    expect(s?.line).toMatch(/profit/);
    expect(s?.line).not.toMatch(/revenue amounts|improve/);
  });
});

describe("origin", () => {
  it("8. seller repetition does not manufacture a prospect priority", () => {
    const t = conversation([
      ["rep", "Profit is what matters, right? Profit, not revenue."],
      ["rep", "Most owners tell me profit is what matters."],
      ["customer", "We'll see."],
      ["rep", "Profit is what matters at the end of the day."],
    ]);
    expect(extractReferences(t)).toEqual([]);
  });

  it("10. a seller-introduced analogy the prospect endorses is labeled shared, not spontaneous", () => {
    const t = conversation([
      ["rep", "Some owners describe it like a hockey team where nobody knows who is defending."],
      ["customer", "Yeah, it's exactly like a hockey team where nobody knows who is defending."],
    ]);
    const [r] = extractReferences(t);
    expect(r.semantics.origin).toBe("seller_introduced_confirmed");
  });

  it("an answer to 'what is it like' is labeled prompted", () => {
    const t = conversation([
      ["rep", "What's it like managing the floor right now?"],
      ["customer", "Like running a jazz band where everybody wants to play a solo."],
    ]);
    expect(extractReferences(t)[0].semantics.origin).toBe("prompted");
  });

  it("9. 'my partner follows hockey; I don't understand it' is third party or nothing, and never suggested", () => {
    const t = conversation(
      [
        ["customer", "My partner follows hockey; I don't understand it."],
        ["customer", "My partner says our inquiries are handled like a hockey team where nobody knows who is defending."],
      ],
      4,
      [["customer", "So who handles the first response on your side?"]],
    );
    const refs = extractReferences(t);
    expect(refs.every((r) => r.semantics.origin === "third_party")).toBe(true);
    expect(refs.length).toBeGreaterThanOrEqual(1);
    expect(suggestReuse(refs, t[t.length - 1], "qualified")).toBeNull();
  });

  it("without preceding context the origin is unknown, never spontaneous by default", () => {
    const t = conversation([["customer", listenerExample("hockey").prospectUtterance]]);
    expect(extractReferences(t, { contextComplete: false })[0].semantics.origin).toBe("unknown");
    expect(extractReferences(t)[0].semantics.origin).toBe("prospect_spontaneous");
  });
});

describe("abstention", () => {
  it("11. 'touch base' and other idioms create nothing, from either speaker", () => {
    const t = conversation([
      ["rep", "Let's touch base tomorrow, ballpark ten."],
      ["customer", "Sure, let's touch base tomorrow. Should be a slam dunk."],
      ["customer", "It was like a slam dunk for the last vendor."],
    ]);
    expect(extractReferences(t)).toEqual([]);
  });

  it("12. a rare noun without a relationship gets no reference", () => {
    const t = conversation([
      ["customer", "We keep the Zamboni in the back lot and the trucks up front."],
      ["customer", "The controller runs the numbers on Fridays."],
      ["customer", "It's like a zoo."],
    ]);
    expect(extractReferences(t)).toEqual([]);
  });

  it("17. an irrelevant current topic produces no forced analogy", () => {
    const t = conversation([["customer", listenerExample("hockey").prospectUtterance]], 8);
    const refs = extractReferences(t);
    for (const later of t.slice(1)) expect(suggestReuse(refs, later, "qualified")).toBeNull();
    expect(suggestReuse(refs, turn("customer", "What time zone is your team in?"), "qualified")).toBeNull();
    // The rep's own question never triggers a suggestion; the listener answers the prospect.
    expect(suggestReuse(refs, turn("rep", "Who handles the first response today?"), "qualified")).toBeNull();
  });

  it("a reference is never suggested on its own turn or before it was said", () => {
    const t = conversation([["customer", "So who handles the reply? It's like a hockey team where nobody knows who is defending."]]);
    const refs = extractReferences(t);
    expect(refs).toHaveLength(1);
    expect(suggestReuse(refs, t[0], "qualified")).toBeNull();
    const earlier: TranscriptSpan = { startMs: 0, endMs: 1000, text: "Who handles the first response?", speaker: "customer" };
    reset();
    const late = conversation([["rep", "Hello."], ["customer", listenerExample("hockey").prospectUtterance]]);
    expect(suggestReuse(extractReferences(late), earlier, "qualified")).toBeNull();
  });
});

describe("retrieval by concept", () => {
  it("3. a later 'robotic' concern with no music words retrieves jazz from outside the recent window", () => {
    const t = conversation([["customer", listenerExample("jazz").prospectUtterance]], 8, [["customer", "Would a shared process make everyone sound robotic?"]]);
    const refs = extractReferences(t);
    const s = suggestReuse(refs, t[t.length - 1], "buying");
    expect(s).not.toBeNull();
    expect(s!.referenceId).toBe(refs[0].identity.referenceId);
    expect(s!.concept).toBe("individuality_vs_structure");
    expect(s!.line).toMatch(/jazz example/);
    expect(s!.line).toMatch(/keep each person's own style/);
    expect(s!.line).not.toMatch(/obey|silence|quiet/i);
  });

  it("hockey answers a later ownership question in the prospect's frame", () => {
    const t = conversation([["customer", listenerExample("hockey").prospectUtterance]], 6, [["customer", "But who handles the reply when your setter is out?"]]);
    const s = suggestReuse(extractReferences(t), t[t.length - 1], "qualified");
    expect(s?.line).toBe(listenerExample("hockey").expectedSuggestion);
  });

  it("soufflé answers a rollout question; ambushed answers a fees question", () => {
    const t = conversation([["customer", listenerExample("souffle").prospectUtterance], ["customer", listenerExample("ambushed").prospectUtterance]], 4, [
      ["customer", "How do we test this before we switch over?"],
      ["customer", "What fees show up after we sign?"],
    ]);
    const refs = extractReferences(t);
    const rollout = suggestReuse(refs, t[t.length - 2], "buying");
    expect(rollout?.concept).toBe("effort_then_failure");
    expect(rollout?.line).toMatch(/cooking comparison/);
    const fees = suggestReuse(refs, t[t.length - 1], "buying");
    expect(fees?.concept).toBe("unexpected_cost_after_commitment");
    expect(fees?.line).toMatch(/"ambushed"/);
  });

  it("18. a suggestion never names price, discount, guarantee, or contract terms", () => {
    const prompts = ["Would a shared process make everyone sound robotic?", "Who handles the first response?", "What fees show up after we sign the contract?", "How do we test the rollout?", "What does this do to profit?"];
    const t = conversation(
      [
        ["customer", listenerExample("hockey").prospectUtterance],
        ["customer", listenerExample("jazz").prospectUtterance],
        ["customer", listenerExample("souffle").prospectUtterance],
        ["customer", listenerExample("ambushed").prospectUtterance],
        ["customer", listenerExample("profit").prospectUtterance],
      ],
      2,
      prompts.map((p) => ["customer", p] as [TranscriptSpan["speaker"], string]),
    );
    const refs = extractReferences(t);
    let seen = 0;
    for (const later of t.slice(-prompts.length)) {
      const s = suggestReuse(refs, later, "buying");
      if (!s) continue;
      seen += 1;
      expect(s.line).not.toMatch(FORBIDDEN_SUGGESTION);
      expect(s.line).not.toMatch(/\d/);
    }
    expect(seen).toBeGreaterThanOrEqual(4);
  });
});

describe("lifecycle", () => {
  const laterTurn = () => turn("customer", "Who handles the first response?");

  it("13. a rejected reference is not suggested; pin and dismiss behave as labeled", () => {
    const t = conversation([["customer", listenerExample("hockey").prospectUtterance]], 2);
    const [r] = extractReferences(t);
    const later = laterTurn();
    expect(suggestReuse([r], later, "qualified")).not.toBeNull();
    const rejected = reject(r);
    expect(rejected.lifecycle.state).toBe("rejected");
    expect(rejected.reuse.reaction).toBe("rejected");
    expect(suggestReuse([rejected], later, "qualified")).toBeNull();
    // Pinning protects position, never accuracy; it stays reusable.
    const pinned = pin(r);
    expect(pinned.lifecycle.state).toBe("pinned");
    expect(pinned.semantics.meaningStatus).toBe("observed");
    expect(suggestReuse([pinned], later, "qualified")).not.toBeNull();
    expect(unpin(pinned).lifecycle.state).toBe("held");
    expect(suggestReuse([dismiss(r)], later, "qualified")).toBeNull();
    // The original is untouched.
    expect(r.lifecycle.state).toBe("held");
  });

  it("15. a late model response cannot resurrect a rejected reference", () => {
    const t = conversation([["customer", listenerExample("hockey").prospectUtterance]], 2);
    const [r] = extractReferences(t);
    const rejected = reject(r);
    // A late extraction of the same transcript yields a fresh "held" record with the same id; the stored rejection wins.
    const [late] = extractReferences(t);
    expect(late.identity.referenceId).toBe(rejected.identity.referenceId);
    const memory = new Map([[rejected.identity.referenceId, rejected]]);
    const merged = [late].map((x) => memory.get(x.identity.referenceId) ?? x);
    expect(merged[0].lifecycle.state).toBe("rejected");
    expect(suggestReuse(merged, laterTurn(), "qualified")).toBeNull();
  });

  it("14. a transcript revision that retracts the phrase invalidates the card and its suggestion", () => {
    const t = conversation([["customer", listenerExample("hockey").prospectUtterance]], 2);
    const [r] = extractReferences(t);
    const revised = t.map((s, i) => (i === 0 ? { ...s, text: "The team handles inquiries when they can." } : s));
    const inv = invalidateOnRetraction(r, revised);
    expect(inv.lifecycle.state).toBe("invalidated");
    expect(inv.evidence.status).toBe("corrected");
    expect(inv.evidence.transcriptRevision).toBe(r.evidence.transcriptRevision + 1);
    expect(inv.lifecycle.corrections).toHaveLength(1);
    expect(inv.lifecycle.stateReason).toMatch(/retracted/);
    expect(suggestReuse([inv], laterTurn(), "qualified")).toBeNull();
    // An intact phrase leaves the reference exactly as it was.
    expect(invalidateOnRetraction(r, t)).toBe(r);
    // A reattribution to the rep counts as a retraction too.
    const reattributed = t.map((s, i) => (i === 0 ? { ...s, speaker: "rep" as const } : s));
    expect(invalidateOnRetraction(r, reattributed).lifecycle.state).toBe("invalidated");
  });

  it("is deterministic: the same transcript yields the same references, byte for byte", () => {
    const t = conversation([["customer", listenerExample("jazz").prospectUtterance], ["customer", listenerExample("ambushed").prospectUtterance]], 3);
    const a = extractReferences(t, { tenantId: "t", conversationId: "c" });
    const b = extractReferences(t, { tenantId: "t", conversationId: "c" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a[0].identity).toMatchObject({ tenantId: "t", conversationId: "c", schemaVersion: 1 });
  });
});

describe("19. one extraction and validation path", () => {
  const keys = ["rooftop_count_known"];

  it("the rules extractor fills references from customer turns only and the result validates", () => {
    const t = conversation([["rep", "Managing the floor is like herding cats, right?"], ["customer", listenerExample("hockey").prospectUtterance], ["customer", "Two rooftops."]]);
    const x = new RuleBasedCallIntelligence().extract({ callId: "call_x", opportunityId: "o1", transcript: t, offerFitKeys: keys, tenantId: "t_test" });
    expect(x.references).toHaveLength(1);
    expect(x.references[0].identity).toMatchObject({ tenantId: "t_test", conversationId: "call_x" });
    expect(x.references[0].spans[0].speaker).toBe("customer");
    expect(validateExtraction(x)).toEqual({ ok: true, errors: [] });
  });

  it("validation rejects a reference cited to a rep span, an uncited one, or a fabricated quote", () => {
    const t = conversation([["customer", listenerExample("hockey").prospectUtterance], ["rep", "Got it."]]);
    const x = new RuleBasedCallIntelligence().extract({ callId: "call_x", opportunityId: "o1", transcript: t, offerFitKeys: keys });
    const [r] = x.references;
    expect(validateExtraction({ ...x, references: [{ ...r, spans: [t[1]] }] }).errors.join("\n")).toMatch(/references\[0\] cites a span the customer did not speak/);
    expect(validateExtraction({ ...x, references: [{ ...r, spans: [] }] }).errors.join("\n")).toMatch(/references\[0\] asserted without a transcript span/);
    const fabricated = { ...r, evidence: { ...r.evidence, exactExpression: "like a chess game where nobody moves" } };
    expect(validateExtraction({ ...x, references: [fabricated] }).errors.join("\n")).toMatch(/references\[0\] quotes words that are not in its span/);
    expect(validateExtraction({ ...x, references: [{ ...r, evidence: { ...r.evidence, exactExpression: " " } }] }).errors.join("\n")).toMatch(/references\[0\] has no exact expression/);
  });

  it("the model path passes references through the same validation and falls back on a bad one", async () => {
    const t = conversation([["customer", listenerExample("hockey").prospectUtterance], ["rep", "Got it."], ["customer", "Two rooftops."]]);
    const input = { callId: "call_x", opportunityId: "o1", transcript: t, offerFitKeys: keys };
    const rules = new RuleBasedCallIntelligence().extract(input);
    const good = new ModelCallIntelligence(new FakeReasoningModel(modelOutputFrom(rules)), defaultLensPack(), "fake");
    const ok = await good.extract(input);
    expect(ok.modelVersion).toBe("fake");
    expect(ok.references).toHaveLength(1);
    expect(ok.references[0].evidence.exactExpression).toBe(rules.references[0].evidence.exactExpression);

    const tampered = modelOutputFrom({ ...rules, references: [{ ...rules.references[0], spans: [t[1]] }] });
    const bad = new ModelCallIntelligence(new FakeReasoningModel(tampered), defaultLensPack(), "fake");
    const fell = await bad.extract(input);
    expect(fell.modelVersion).toBe(RuleBasedCallIntelligence.MODEL_VERSION);
    expect(fell.unknowns.join("\n")).toMatch(/references\[0\] cites a span the customer did not speak/);
    expect(fell.references[0].spans[0].speaker).toBe("customer");
  });

  it("the deterministic expectations this file covers are the ones the source marks deterministic", () => {
    const deterministic = ACCEPTANCE_EXPECTATIONS.filter((e) => e.testKind === "deterministic").map((e) => e.n);
    // 16 (layout beside the script) and 20 (tenant, consent, deletion) are e2e and integration concerns.
    expect(deterministic).toEqual([5, 6, 7, 8, 10, 13, 14, 15, 16, 18, 19, 20]);
  });
});

describe("word choice is significance", () => {
  const hockey = listenerExample("hockey").prospectUtterance;
  const laterOwnership = (): [TranscriptSpan["speaker"], string] => ["customer", "So who handles the first response when your setter is out?"];

  /** A small synthetic transcript: baseball said three times by the customer, then an ownership question. */
  const baseballCall = () =>
    conversation(
      [
        ["rep", "How do inquiries get handled today?"],
        ["customer", "It's like a baseball team where nobody knows who is fielding the ball."],
        ["rep", "Say more about that."],
        ["customer", "Baseball, right. The ball drops between two people and everyone looks at each other."],
        ["customer", "Every lead is a baseball nobody calls for."],
      ],
      4,
      [laterOwnership()],
    );

  it("repeated hockey merges into one reference with count 3, a span per occurrence, and more significance than a single mention", () => {
    const three = conversation([
      ["customer", hockey],
      ["rep", "Say more about that."],
      ["customer", "It's a hockey team where nobody covers the net."],
      ["customer", "Hockey, every night. That's what it feels like."],
    ]);
    const refs = extractReferences(three);
    expect(refs).toHaveLength(1);
    const r = refs[0];
    expect(r.lifecycle.occurrenceCount).toBe(3);
    expect(r.spans).toHaveLength(3);
    expect(r.spans.map((s) => s.startMs)).toEqual([three[0].startMs, three[2].startMs, three[3].startMs]);
    expect(r.lifecycle.lastObservedTurn).toBe(utteranceIdFor("conversation", three[3]));
    const [single] = extractReferences(conversation([["customer", hockey]]));
    expect(significance(single)).toBe(0.6);
    expect(significance(r)).toBe(0.9);
    expect(significance(r)).toBeGreaterThan(significance(single));
    // The relationship clause is worth 0.1: the same first mention without one scores 0.5.
    const [bare] = extractReferences(conversation([["customer", "That setback was as bad as breaking your leg in basketball."]]));
    expect(significance(bare)).toBe(0.5);
  });

  it("significance caps at 1.0 and drops to 0 once rejected", () => {
    const t = conversation([
      ["customer", hockey],
      ["customer", "Hockey again."],
      ["customer", "Still hockey."],
      ["customer", "Hockey, hockey, hockey."],
      ["customer", "A hockey team, like I said."],
    ]);
    const [r] = extractReferences(t);
    expect(r.lifecycle.occurrenceCount).toBe(5);
    expect(significance(r)).toBe(1);
    expect(significance(reject(r))).toBe(0);
  });

  it("seller-introduced lowers significance; third party lowers it further", () => {
    const [shared] = extractReferences(
      conversation([
        ["rep", "Some owners describe it like a hockey team where nobody knows who is defending."],
        ["customer", "Yeah, it's exactly like a hockey team where nobody knows who is defending."],
      ]),
    );
    expect(shared.semantics.origin).toBe("seller_introduced_confirmed");
    const [own] = extractReferences(conversation([["customer", hockey]]));
    expect(significance(shared)).toBeCloseTo(significance(own) - 0.3, 5);
    const [third] = extractReferences(conversation([["customer", "My partner says our inquiries are handled like a hockey team where nobody knows who is defending."]]));
    expect(third.semantics.origin).toBe("third_party");
    expect(significance(third)).toBeCloseTo(significance(own) - 0.5, 5);
  });

  it("rep repetition of a domain never raises the customer's count", () => {
    const t = conversation([
      ["customer", hockey],
      ["rep", "Hockey, right. Like a hockey team. Hockey is a good way to put it."],
      ["rep", "Back to the hockey team for a second."],
    ]);
    const [r] = extractReferences(t);
    expect(r.lifecycle.occurrenceCount).toBe(1);
    expect(r.spans).toHaveLength(1);
    expect(significance(r)).toBe(0.6);
  });

  it("vocabulary finds profit x4, groups inflections, ranks by count then first use, and excludes the stoplist", () => {
    const t = conversation([
      ["rep", "Leads, leads, leads. The team needs more leads and the price is the price."],
      ["customer", "Revenue is fine. Profit is what matters to me."],
      ["customer", "The profits at the Kearney store are thin, and the leads we get are junk."],
      ["customer", "I want the margin up. Margins, honestly, before anything else. More profit."],
      ["customer", "If the profit is there the team is happy and the price is fine."],
    ]);
    const v = vocabulary(t);
    expect(v[0]).toMatchObject({ term: "profit", count: 4, kind: "value_word" });
    expect(v[0].spans).toHaveLength(4);
    expect(v[0].spans.every((s) => s.speaker === "customer")).toBe(true);
    expect(v.find((e) => e.term === "margin")).toMatchObject({ count: 2, kind: "value_word" });
    const terms = v.map((e) => e.term);
    for (const filler of ["the", "leads", "lead", "team", "price", "fine", "store", "more"]) expect(terms).not.toContain(filler);
    expect(terms).not.toContain("profits");
    expect(v.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < v.length; i++) expect(v[i - 1].count).toBeGreaterThanOrEqual(v[i].count);
  });

  it("vocabulary types outcome labels and emotion words, and a domain word reads as domain", () => {
    const t = conversation([
      ["customer", "What I want is breathing room. Honestly I'm frustrated with the whole thing."],
      ["customer", "Breathing room on weekends, that's it. It's frustrating every single week."],
      ["customer", "Like a hockey team, and hockey is the only way I can describe it."],
    ]);
    const v = vocabulary(t);
    expect(v.find((e) => e.term === "breathing room")).toMatchObject({ count: 2, kind: "outcome_label" });
    const emotion = v.find((e) => e.kind === "emotion_word");
    expect(emotion?.count).toBe(2);
    expect(["frustrated", "frustrating"]).toContain(emotion?.term);
    expect(v.find((e) => e.term === "hockey")).toMatchObject({ count: 2, kind: "domain" });
    // The phrase is not double counted as its words.
    expect(v.map((e) => e.term)).not.toContain("breathing");
    expect(v.map((e) => e.term)).not.toContain("room");
  });

  it("vocabulary never counts rep words, and a word said once is not vocabulary", () => {
    const t = conversation([
      ["rep", "Profit, profit, profit. Breathing room, breathing room. Frustrated, frustrated."],
      ["customer", "Profit, once."],
      ["customer", "Sure."],
    ]);
    expect(vocabulary(t)).toEqual([]);
    expect(vocabulary([])).toEqual([]);
  });

  it("vocabulary is capped at 8 and deterministic", () => {
    const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet"];
    const line = words.map((w) => `${w} ${w}`).join(" ");
    const t = conversation([["customer", line]]);
    const v = vocabulary(t);
    expect(v).toHaveLength(8);
    expect(v.map((e) => e.term)).toEqual(words.slice(0, 8));
    expect(JSON.stringify(vocabulary(t))).toBe(JSON.stringify(v));
  });

  it("domain lock: a baseball reference is only ever suggested in baseball words", () => {
    const t = baseballCall();
    const refs = extractReferences(t);
    expect(refs).toHaveLength(1);
    const r = refs[0];
    expect(domainFor(r)).toBe("baseball");
    expect(r.lifecycle.occurrenceCount).toBe(3);
    expect(significance(r)).toBe(0.9);
    const s = suggestReuse(refs, t[t.length - 1], "qualified");
    expect(s).not.toBeNull();
    expect(s!.line).toMatch(/your baseball example/);
    expect(s!.line).not.toMatch(/hockey|basketball|jazz|soufflé|souffle|oven|band|football|chess/i);
    expect(breaksDomainLock(s!.line, "baseball")).toBe(false);
    expect(breaksDomainLock("Using your hockey example, who owns the first response?", "baseball")).toBe(true);
    expect(breaksDomainLock("Like a souffle out of the oven that collapsed.", "baseball")).toBe(true);
    expect(DOMAIN_LOCK_RULE).toMatch(/never substitute/i);
    expect(domainFor(extractReferences(conversation([["customer", listenerExample("ambushed").prospectUtterance]]))[0])).toBeUndefined();
  });

  it("suggestReuse prefers the more significant of two references that match the same concept", () => {
    // Relay first, then hockey said three times: both carry coordination; hockey outweighs.
    const t = conversation(
      [
        ["customer", "After six it's like a relay where nobody's holding the baton and the lead just sits there."],
        ["customer", hockey],
        ["customer", "Hockey, every single night."],
        ["customer", "A hockey team with no goalie."],
      ],
      4,
      [laterOwnership()],
    );
    const refs = extractReferences(t);
    expect(refs.map((r) => r.semantics.sourceDomain)).toEqual(["relay", "hockey"]);
    expect(significance(refs[1])).toBeGreaterThan(significance(refs[0]));
    const s = suggestReuse(refs, t[t.length - 1], "qualified");
    expect(s?.referenceId).toBe(refs[1].identity.referenceId);
    expect(s?.line).toMatch(/hockey example/);
    // Equal weight keeps transcript order: the earlier one speaks.
    const single = conversation([["customer", "After six it's like a relay where nobody's holding the baton and the lead just sits there."], ["customer", hockey]], 4, [laterOwnership()]);
    const sr = extractReferences(single);
    expect(significance(sr[0])).toBe(significance(sr[1]));
    expect(suggestReuse(sr, single[single.length - 1], "qualified")?.referenceId).toBe(sr[0].identity.referenceId);
  });

  it("is deterministic: counts, significance, and vocabulary repeat byte for byte", () => {
    const t = baseballCall();
    const a = extractReferences(t, { tenantId: "t", conversationId: "c" });
    const b = extractReferences(t, { tenantId: "t", conversationId: "c" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.map(significance)).toEqual(b.map(significance));
    expect(JSON.stringify(vocabulary(t))).toBe(JSON.stringify(vocabulary(t)));
  });

  it("the listener rules name repetition, the domain lock, and vocabulary", () => {
    expect(LISTENER_RULES.some((r) => /repetition raises weight; first mention already counts/i.test(r))).toBe(true);
    expect(LISTENER_RULES.some((r) => /speak their domain; never substitute another analogy or synonym/i.test(r))).toBe(true);
    expect(LISTENER_RULES.some((r) => /vocabulary is theirs, ranked by count; rep words never count/i.test(r))).toBe(true);
  });
});
