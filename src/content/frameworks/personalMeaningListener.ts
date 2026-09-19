/**
 * Personal Meaning Listener as data. Source: docs/sources/apohenia/Personal_Meaning_Listener_v3.md.
 *
 * The listener notices the specific word, analogy, image or comparison a prospect chose when other
 * expressions would have carried the same message, preserves the exact expression and the
 * relationship it expresses, and offers it back later in the prospect's own frame. A first mention
 * is eligible. It is not a keyword counter, a sentiment score, or a personality classifier.
 *
 * This file holds the types the model output and the UI consume, the six worked examples as
 * fixtures, the acceptance expectations, and the rules. Pure data: no React, no fetch, no clock.
 * Timestamps live on TranscriptSpan (src/domain/callIntelligence.ts) and are never invented here.
 */

export type ReferenceKind =
  | "analogy"
  | "emotional_description"
  | "outcome_label"
  | "metaphor"
  | "explicit_correction"
  | "personally_defined_term";

/** Where the expression came from. Absent context means unknown, never spontaneous by default. */
export type Origin = "prospect_spontaneous" | "prompted" | "seller_introduced_confirmed" | "third_party" | "unknown";

/** How much of the meaning is established. Only the prospect can move a reference to confirmed. */
export type MeaningStatus = "observed" | "inferred" | "confirmed" | "unknown";

export type EvidenceStatus = "provisional" | "final" | "corrected";

export type Valence = "positive" | "negative" | "mixed" | "neutral";

export type LifecycleState = "held" | "pinned" | "dismissed" | "rejected" | "invalidated";

export type ReactionValue = "accepted" | "rejected" | "unknown";

/** The Reference record from section 8 of the source, grouped as the source groups it. */
export interface ReferenceIdentity {
  tenantId: string;
  conversationId: string;
  prospectSpeakerId: string;
  referenceId: string;
  createdEventVersion: number;
  updatedEventVersion: number;
  schemaVersion: 1;
  extractorVersion: string;
}

export interface ReferenceEvidence {
  /** The distinctive expression, exactly as spoken. */
  exactExpression: string;
  /** The supporting quote, exactly as spoken. Never a paraphrase presented as a quote. */
  exactQuote: string;
  utteranceId: string;
  /** Unicode substring offsets of exactExpression inside the utterance text. */
  offsets: { start: number; end: number };
  transcriptRevision: number;
  status: EvidenceStatus;
  /** Only when the transcript provider supplied it. Never invented. */
  turnStartMs?: number;
}

export interface ReferenceSemantics {
  kind: ReferenceKind;
  /** The domain the expression is drawn from, e.g. "hockey", "cooking". A label, not a biography. */
  sourceDomain: string;
  /** The business thing the comparison describes, e.g. "inquiry handling". */
  describedTarget: string;
  /** The relationship the comparison expresses, e.g. "nobody knows who is defending: unclear ownership". */
  comparisonRelationship: string;
  /** The local emotional valence and the specific thing it attaches to, not the whole topic. */
  valence: { value: Valence; object: string };
  origin: Origin;
  meaningStatus: MeaningStatus;
  /** Present only when the prospect explained or confirmed the meaning; carries its evidence. */
  explainedMeaning?: { text: string; utteranceId: string };
  /** Inferences this record explicitly does not support. */
  prohibitedInferences: string[];
}

export interface ReferenceLifecycle {
  firstObservedTurn: string;
  lastObservedTurn: string;
  occurrenceCount: number;
  state: LifecycleState;
  stateReason?: string;
  corrections: { atEventVersion: number; note: string }[];
}

export interface ReferenceReuse {
  /** Stages or purposes where the reference could help later, e.g. "pitch: shared process". */
  candidatePurposes: string[];
  relevanceExplanation: string;
  /** What the reference may be mapped onto, e.g. "arrangement = shared process; solo = individual style". */
  allowedContextualMapping: string;
  proposedClarification?: string;
  bridgeText?: string;
  usedAt: { utteranceId: string; scriptNodeVersion: string }[];
  reaction: ReactionValue;
}

export interface Reference {
  identity: ReferenceIdentity;
  evidence: ReferenceEvidence;
  semantics: ReferenceSemantics;
  lifecycle: ReferenceLifecycle;
  reuse: ReferenceReuse;
}

/** The three actions a card offers. Pinning protects position; it does not certify accuracy. */
export type CardAction = "KEEP FOR LATER" | "USE NOW" | "CLARIFY MEANING";

export const CARD_ACTIONS: readonly CardAction[] = ["KEEP FOR LATER", "USE NOW", "CLARIFY MEANING"];

export const CARD_CONTROLS: readonly string[] = ["pin", "unpin", "dismiss", "correct", "do not reuse this reference"];

// ---------- Worked examples as fixtures ----------

export interface ExpectedCapture {
  /** The large card label, e.g. "JAZZ BAND / EVERYBODY WANTS A SOLO". */
  cardLabel: string;
  kind: ReferenceKind;
  sourceDomain: string;
  comparisonRelationship: string;
  valence: { value: Valence; object: string };
  origin: Origin;
  meaningStatus: MeaningStatus;
  prohibitedInferences: string[];
}

export interface ListenerExample {
  id: "hockey" | "jazz" | "souffle" | "ambushed" | "basketball" | "profit";
  title: string;
  prospectUtterance: string;
  expectedCapture: ExpectedCapture;
  /** The later moment and what the listener suggests there. `null` suggestion means abstain is the expected output. */
  laterContext: string;
  expectedSuggestion: string | null;
  /** A second utterance that updates the meaning, when the source gives one. */
  followUp?: { prospectUtterance: string; updatedMeaning: string; updatedStatus: MeaningStatus };
  doNots: string[];
}

export const LISTENER_EXAMPLES: readonly ListenerExample[] = [
  {
    id: "hockey",
    title: "Hockey: first mention",
    prospectUtterance: "The team handles inquiries like a hockey team where nobody knows who is defending.",
    expectedCapture: {
      cardLabel: "HOCKEY / NOBODY KNOWS WHO IS DEFENDING",
      kind: "analogy",
      sourceDomain: "hockey",
      comparisonRelationship: "Role coordination: no one owns the defensive response, so inquiries fall through.",
      valence: { value: "negative", object: "unclear ownership of inquiries" },
      origin: "prospect_spontaneous",
      meaningStatus: "observed",
      prohibitedInferences: ["personal connection to hockey", "player names", "team allegiance", "technical hockey claims", "shared sporting experience"],
    },
    laterContext: "Responsibilities for first response are being discussed.",
    expectedSuggestion: "Using your hockey example, who should own the first response, and who covers it when that person is unavailable?",
    doNots: ["Do not wait for another mention.", "Do not require a hobby interview."],
  },
  {
    id: "jazz",
    title: "Jazz: preserve individuality and coordination",
    prospectUtterance: "Managing these salespeople is like running a jazz band where everybody wants to play a solo.",
    expectedCapture: {
      cardLabel: "JAZZ BAND / EVERYBODY WANTS A SOLO",
      kind: "analogy",
      sourceDomain: "jazz",
      comparisonRelationship: "Individual style versus lack of coordination: everybody wants a solo, nobody follows a shared arrangement.",
      valence: { value: "negative", object: "lack of coordination among salespeople" },
      origin: "prospect_spontaneous",
      meaningStatus: "observed",
      prohibitedInferences: ["the prospect is a musician", "the prospect wants staff silenced or obedient"],
    },
    laterContext: "Several unrelated turns later the prospect asks: Would a shared process make everyone sound robotic? The current turn contains no music words.",
    expectedSuggestion: "Going back to your jazz-band example, the idea would be to keep individual style while giving everyone the same arrangement to follow. Which parts of the follow-up need that shared structure?",
    doNots: ["Do not change the relationship into obedience, silencing staff, or dismissing the concern.", "Do not retrieve by matching nouns only; retrieve by the concept (individuality versus coordination)."],
  },
  {
    id: "souffle",
    title: "Soufflé: failure after substantial effort",
    prospectUtterance: "That last website project was like spending all afternoon making a soufflé and watching it collapse when it came out of the oven.",
    expectedCapture: {
      cardLabel: "SOUFFLÉ / COLLAPSED AFTER ALL THAT WORK",
      kind: "analogy",
      sourceDomain: "cooking",
      comparisonRelationship: "Effort followed by failure at the moment the result should have been ready.",
      valence: { value: "negative", object: "a disappointing result after effort, not cooking in general" },
      origin: "prospect_spontaneous",
      meaningStatus: "observed",
      prohibitedInferences: ["the prospect is a chef", "the prospect personally baked the dish", "the prospect dislikes cooking"],
    },
    laterContext: "Rollout and testing are being discussed.",
    expectedSuggestion: "Using your soufflé comparison, what failed when the actual customers started using the website?",
    doNots: ["Do not claim the product is guaranteed not to fail.", "After the failure is named, suggest a test of that specific situation before replacing the current workflow; promise nothing."],
  },
  {
    id: "ambushed",
    title: "Ambushed: clarify the emotionally specific term",
    prospectUtterance: "I felt ambushed by the extra charges.",
    expectedCapture: {
      cardLabel: "AMBUSHED",
      kind: "emotional_description",
      sourceDomain: "none",
      comparisonRelationship: "Unexpected charges experienced as an ambush; the mechanism is not yet stated.",
      valence: { value: "negative", object: "the extra charges and how they arrived" },
      origin: "prospect_spontaneous",
      meaningStatus: "inferred",
      prohibitedInferences: ["flattening to 'price objection'", "which of non-disclosure or lock-in it was, before the prospect says"],
    },
    laterContext: "Right away, when the clarification serves the business discussion.",
    expectedSuggestion: "When you say 'ambushed', was it that the charges weren't disclosed, or that you were already committed before they appeared?",
    followUp: {
      prospectUtterance: "By then they had our website and we couldn't easily leave.",
      updatedMeaning: "Unexpected charges after commitment, combined with difficulty leaving.",
      updatedStatus: "confirmed",
    },
    doNots: ["Leave room for a third explanation.", "Later, retrieve it for full costs, change approval, account ownership or exit terms; suggest reviewing those requirements, not inventing a cancellation policy."],
  },
  {
    id: "basketball",
    title: "Basketball injury: do not invert or overextend the association",
    prospectUtterance: "That setback was as bad as breaking your leg in basketball.",
    expectedCapture: {
      cardLabel: "BASKETBALL / AS BAD AS BREAKING YOUR LEG",
      kind: "analogy",
      sourceDomain: "basketball",
      comparisonRelationship: "The setback compared to a serious injury: severity and being taken out of play.",
      valence: { value: "negative", object: "the injury and the setback, not basketball" },
      origin: "prospect_spontaneous",
      meaningStatus: "observed",
      prohibitedInferences: ["basketball disliked", "an injury history", "team preference", "gambling history"],
    },
    laterContext: "Any later moment.",
    expectedSuggestion: null,
    doNots: ["Do not automatically recommend an upbeat 'slam dunk' line from the same domain.", "It is valid to hold the reference without reusing the injury."],
  },
  {
    id: "profit",
    title: "Profit: distinct financial meaning",
    prospectUtterance: "Revenue is fine. Profit is what matters to me.",
    expectedCapture: {
      cardLabel: "PROFIT, NOT REVENUE",
      kind: "personally_defined_term",
      sourceDomain: "finance",
      comparisonRelationship: "Profit is the stated priority, explicitly distinguished from revenue.",
      valence: { value: "neutral", object: "the profit versus revenue distinction" },
      origin: "prospect_spontaneous",
      meaningStatus: "confirmed",
      prohibitedInferences: ["that revenue figures can be relabeled as profit", "that profit will improve"],
    },
    laterContext: "Whenever money outcomes are the actual subject.",
    expectedSuggestion: "Use profit-oriented language where profit is the subject. If a margin definition is needed, ask rather than assume.",
    doNots: ["Do not relabel revenue amounts as profit.", "Do not promise improved profit without evidence."],
  },
];

// ---------- Acceptance expectations ----------

export type ExpectationCategory = "recognition" | "retrieval" | "abstention" | "origin" | "lifecycle" | "boundary";

export interface AcceptanceExpectation {
  n: number;
  text: string;
  category: ExpectationCategory;
  /** Deterministic evidence and lifecycle tests versus model-dependent quality evaluation. */
  testKind: "deterministic" | "model_quality";
}

export const ACCEPTANCE_EXPECTATIONS: readonly AcceptanceExpectation[] = [
  { n: 1, text: "First-mention hockey is recognized before any repetition.", category: "recognition", testKind: "model_quality" },
  { n: 2, text: "First-mention jazz produces the comparison, not only the music noun.", category: "recognition", testKind: "model_quality" },
  { n: 3, text: "A later 'robotic' concern retrieves the earlier jazz reference outside the recent-turn window.", category: "retrieval", testKind: "model_quality" },
  { n: 4, text: "Soufflé's negative association attaches to collapse after effort, not cooking generally.", category: "recognition", testKind: "model_quality" },
  { n: 5, text: "Ambushed remains an unresolved term until clarification evidence is received.", category: "lifecycle", testKind: "deterministic" },
  { n: 6, text: "Basketball injury does not generate a personal injury history, team preference, gambling history, or dislike of basketball.", category: "abstention", testKind: "deterministic" },
  { n: 7, text: "Profit remains distinct from revenue in both wording and calculations.", category: "boundary", testKind: "deterministic" },
  { n: 8, text: "Repetition by the seller does not manufacture a prospect-originated priority.", category: "origin", testKind: "deterministic" },
  { n: 9, text: "'My partner follows hockey; I don't understand it' does not recommend hockey analogies for the prospect.", category: "origin", testKind: "model_quality" },
  { n: 10, text: "A seller-introduced analogy is labeled prompted or shared, not spontaneous.", category: "origin", testKind: "deterministic" },
  { n: 11, text: "'Let's touch base tomorrow' does not create a baseball-interest claim or an unnecessary sports reminder.", category: "abstention", testKind: "model_quality" },
  { n: 12, text: "A rare noun with no relevant comparison does not automatically receive high priority.", category: "abstention", testKind: "model_quality" },
  { n: 13, text: "A prospect rejects an analogy; later suggestions stop using it.", category: "lifecycle", testKind: "deterministic" },
  { n: 14, text: "A transcript revision retracts a phrase; cards and queued suggestions update accordingly.", category: "lifecycle", testKind: "deterministic" },
  { n: 15, text: "A rejected reference is not resurrected by a late model response.", category: "lifecycle", testKind: "deterministic" },
  { n: 16, text: "Several references remain visible and readable beside the exact script without displacing its current line.", category: "boundary", testKind: "deterministic" },
  { n: 17, text: "An irrelevant current topic produces no forced analogy.", category: "abstention", testKind: "model_quality" },
  { n: 18, text: "A proposed analogy cannot introduce an unapproved offer claim or guarantee.", category: "boundary", testKind: "deterministic" },
  { n: 19, text: "Live and simulated transcript fixtures use the same extraction and validation path; hidden mock facts are inaccessible to coaching.", category: "boundary", testKind: "deterministic" },
  { n: 20, text: "Tenant and call boundaries, consent stopping, deletion, duplicate-event handling, and model-outage fallback work correctly.", category: "boundary", testKind: "deterministic" },
];

// ---------- Rules ----------

export const LISTENER_RULES: readonly string[] = [
  "A first unprompted mention is eligible immediately. Repetition can strengthen evidence; it is never a requirement.",
  "Preserve the relationship, not the noun. 'Jazz' alone misses coordination versus individuality; 'soufflé' alone misses effort followed by collapse.",
  "Keep four kinds of information separate: observed (exact quote, speaker, location), interpretation of this sentence (inferred until confirmed), possible communication use, and confirmed personal meaning (only what the prospect supplied).",
  "No biography. A reference proves what was said, not why it was chosen. Never infer hobbies, history, trauma, gambling, hidden motives, or a numerical certainty that someone loves a sport.",
  "Store what a positive or negative description attaches to, not a label for the whole topic. The injury is negative; the sport is not.",
  "Abstaining is a valid output. Do not force every explanation into a metaphor, and do not repeat a metaphor right after it was used.",
  "Stop using a reference when the prospect rejects it. Retain reuse history and reactions; unknown reaction is neither acceptance nor rejection.",
  "Seller priming means origin is not spontaneous. A seller-introduced label the prospect endorses is seller_introduced_confirmed; without enough preceding context the origin is unknown, never spontaneous by default.",
  "An analogy illustrates a concept; it cannot prove a promised result. Never generate capabilities, ownership commitments, discounts, guarantees, or contract terms to complete a comparison.",
  "Retrieve by the concept under discussion, not by matching nouns. Persist references across the whole authorized session.",
  "At most one primary suggestion at a time, concise, grounded in the prospect's reference, fit to the current question's purpose, compatible with the approved offer.",
  "Where an analogy concerns an intensely painful event, acknowledge neutrally and clarify at business level; do not elaborate the painful image or amplify distress.",
  "Model output is a proposal. Reject fabricated quotes, invalid spans, unsupported speaker attribution, and stale outputs. Duplicate events never create duplicate cards or inflate counts.",
  "A correction or transcript retraction visibly invalidates a pinned card; it never stays silently available as valid coaching context.",
  "Reference memory is conversation-scoped by default. Saving to a persistent profile is an explicit user action that keeps evidence, status and date. A temporary analogy never becomes a permanent personality trait.",
  "Never invent timestamps. Use turn times only when the transcript supplied them.",
];

export interface PersonalMeaningListener {
  name: "Personal Meaning Listener";
  source: "docs/sources/apohenia";
  operationalQuestion: string;
  loop: string[];
  examples: readonly ListenerExample[];
  acceptance: readonly AcceptanceExpectation[];
  rules: readonly string[];
  cardActions: readonly CardAction[];
}

export const PERSONAL_MEANING_LISTENER: PersonalMeaningListener = {
  name: "Personal Meaning Listener",
  source: "docs/sources/apohenia",
  operationalQuestion:
    "Of the ways this person could have expressed this idea, what distinctive expression did they voluntarily choose, what does it represent here, and when could that same reference help explain a later point?",
  loop: [
    "Notice the choice.",
    "Preserve the exact expression and its local meaning.",
    "Display it prominently.",
    "Retain it across the conversation.",
    "Recognize a relevant later opportunity.",
    "Suggest an appropriate line or question in that frame of reference.",
  ],
  examples: LISTENER_EXAMPLES,
  acceptance: ACCEPTANCE_EXPECTATIONS,
  rules: LISTENER_RULES,
  cardActions: CARD_ACTIONS,
};

export function listenerExample(id: ListenerExample["id"]): ListenerExample {
  const e = LISTENER_EXAMPLES.find((x) => x.id === id);
  if (!e) throw new Error(`no listener example ${id}`);
  return e;
}
