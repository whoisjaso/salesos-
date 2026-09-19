/**
 * Call intelligence: fixed-schema extraction from a call transcript, where every
 * asserted field cites a transcript span, and a policy layer that decides what
 * (if anything) the extraction may change (SOS-04, SOS-09, SOS-13, SOS-23, D: "Call
 * intelligence, not a third-party notetaker").
 *
 * Rules baked in:
 * - The transcript decides (D: "The transcript decides. No rep approval."). Every call is
 *   scored per stage (contacted, qualified, buying, bought) as a probability with a band.
 *   Stages move automatically when the score clears the band; below it the stage is
 *   recorded as leaning. Reps never confirm; dispute stays as the escape hatch.
 * - An assertion without a span is invalid. "unknown" / "none" are the only span-free values.
 * - The model may not establish money or consent facts (price, discount, consent, payment).
 * - The policy never emits payment, consent, or attendance events. Those come from providers.
 * - Transcript text is data. Nothing in it can authorize an action.
 */
import { createEvent } from "./events";
import { buildSystemPrompt, type LensPack } from "./lens";
import type { Call, CallInterpretedOutcome, DomainEvent, FitValue, Id, ISODateTime, Opportunity, Task } from "./types";

// ---------- Schema ----------

export interface TranscriptSpan {
  startMs: number;
  endMs: number;
  text: string;
  /** Who spoke, when the transcript provider labels turns. Unlabeled spans count as "unknown". */
  speaker?: "customer" | "rep" | "unknown";
}

export type NextStepValue = "book" | "callback" | "proposal" | "dq_review" | "none";

export interface Commitment {
  text: string;
  owner: "customer" | "rep";
  dueAt?: ISODateTime;
  spans: TranscriptSpan[];
}

export interface Stakeholder {
  name?: string;
  role: string;
  spans: TranscriptSpan[];
}

export interface Objection {
  text: string;
  resolved: boolean;
  spans: TranscriptSpan[];
}

/** Probability per funnel stage, 0..1. Monotone: a later stage never scores above an earlier one. */
export interface StageScores {
  contacted: number;
  qualified: number;
  buying: number;
  bought: number;
}

export type StageKey = keyof StageScores;
export const STAGE_KEYS: StageKey[] = ["contacted", "qualified", "buying", "bought"];

export type Band = "yes" | "likely" | "unlikely" | "no";

/** Owner-configurable thresholds. A score at or above a threshold earns that band. */
export interface BandPolicy {
  yes: number;
  likely: number;
  unlikely: number;
  version: string;
}

export const DEFAULT_BAND_POLICY: BandPolicy = { yes: 0.8, likely: 0.63, unlikely: 0.4, version: "bands-1.0" };

export function bandFor(p: number, policy: BandPolicy = DEFAULT_BAND_POLICY): Band {
  if (!Number.isFinite(p)) return "no";
  if (p >= policy.yes) return "yes";
  if (p >= policy.likely) return "likely";
  if (p >= policy.unlikely) return "unlikely";
  return "no";
}

export const BAND_LABEL: Record<Band, string> = { yes: "Yes", likely: "Likely", unlikely: "Unlikely", no: "No" };

/** One angle for the rep, through the lens pack. Cites the moment it comes from. */
export interface Feedback {
  angle: string;
  hint: string;
  spans: TranscriptSpan[];
}

export const MAX_FEEDBACK = 3;

export interface CallExtraction {
  callId: Id;
  opportunityId: Id;
  modelVersion: string;
  promptVersion: string;
  schemaVersion: 1;
  outcome: { value: CallInterpretedOutcome; spans: TranscriptSpan[] };
  commitments: Commitment[];
  stakeholders: Stakeholder[];
  objections: Objection[];
  nextStep: { value: NextStepValue; spans: TranscriptSpan[] };
  fitFacts: Record<string, { value: FitValue; spans: TranscriptSpan[] }>;
  unknowns: string[];
  uncertainty: "low" | "medium" | "high";
  stageScores: StageScores;
  /** Every score above 0 cites at least one span here. */
  stageEvidence: Record<StageKey, TranscriptSpan[]>;
  /** At most MAX_FEEDBACK angles, each citing spans. */
  feedback: Feedback[];
  /** The lens pack version the extraction was made through, when a model ran. */
  lensVersion?: string;
}

export const EXTRACTION_SCHEMA_VERSION = 1 as const;

/**
 * Field names the model may never establish (SOS-23 AI action matrix: price authority,
 * consent, payment are deterministic or human decisions). Matched case-insensitively
 * against fit-fact keys.
 */
export const FORBIDDEN_EXTRACTION_FIELD = /price|pricing|discount|consent|opt[_-]?in|opt[_-]?out|payment|card|collected|refund/i;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function spanOk(s: TranscriptSpan): boolean {
  return (
    typeof s === "object" && s !== null &&
    Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.startMs >= 0 && s.endMs >= s.startMs &&
    typeof s.text === "string" && s.text.trim().length > 0
  );
}

function spansOk(spans: unknown): spans is TranscriptSpan[] {
  return Array.isArray(spans) && spans.length > 0 && spans.every(spanOk);
}

/**
 * Rejects any asserted field without at least one well-formed span, and any fit fact
 * whose name claims money or consent. "unknown" outcome, "unknown" fit values, and
 * "none" next step are non-assertions and need no span.
 */
export function validateExtraction(x: CallExtraction): ValidationResult {
  const errors: string[] = [];
  if (!x || typeof x !== "object") return { ok: false, errors: ["extraction is not an object"] };
  if (x.schemaVersion !== EXTRACTION_SCHEMA_VERSION) errors.push(`schemaVersion must be ${EXTRACTION_SCHEMA_VERSION}`);
  if (!x.callId) errors.push("callId is required");
  if (!x.opportunityId) errors.push("opportunityId is required");
  if (!x.modelVersion) errors.push("modelVersion is required");
  if (!["low", "medium", "high"].includes(x.uncertainty)) errors.push("uncertainty must be low, medium, or high");

  if (!x.outcome) errors.push("outcome is required");
  else if (x.outcome.value !== "unknown" && !spansOk(x.outcome.spans)) errors.push(`outcome "${x.outcome.value}" asserted without a transcript span`);

  if (!x.nextStep) errors.push("nextStep is required");
  else if (x.nextStep.value !== "none" && !spansOk(x.nextStep.spans)) errors.push(`nextStep "${x.nextStep.value}" asserted without a transcript span`);

  (x.commitments ?? []).forEach((c, i) => {
    if (!c.text?.trim()) errors.push(`commitments[${i}] has no text`);
    if (!spansOk(c.spans)) errors.push(`commitments[${i}] asserted without a transcript span`);
    if (FORBIDDEN_EXTRACTION_FIELD.test(c.text ?? "") && /\$|\d/.test(c.text ?? "")) errors.push(`commitments[${i}] states a money or consent term; the model may not establish it`);
  });
  (x.stakeholders ?? []).forEach((s, i) => {
    if (!s.role?.trim()) errors.push(`stakeholders[${i}] has no role`);
    if (!spansOk(s.spans)) errors.push(`stakeholders[${i}] asserted without a transcript span`);
  });
  (x.objections ?? []).forEach((o, i) => {
    if (!o.text?.trim()) errors.push(`objections[${i}] has no text`);
    if (!spansOk(o.spans)) errors.push(`objections[${i}] asserted without a transcript span`);
  });
  for (const [key, fact] of Object.entries(x.fitFacts ?? {})) {
    if (FORBIDDEN_EXTRACTION_FIELD.test(key)) {
      errors.push(`fitFacts.${key}: money and consent facts may not be established by the model`);
      continue;
    }
    if (!fact || !["yes", "no", "partial", "unknown"].includes(fact.value)) errors.push(`fitFacts.${key} has an invalid value`);
    else if (fact.value !== "unknown" && !spansOk(fact.spans)) errors.push(`fitFacts.${key} "${fact.value}" asserted without a transcript span`);
  }
  if (!Array.isArray(x.unknowns)) errors.push("unknowns must be an array");

  if (!x.stageScores || typeof x.stageScores !== "object") errors.push("stageScores is required");
  else {
    for (const key of STAGE_KEYS) {
      const p = x.stageScores[key];
      if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) errors.push(`stageScores.${key} must be a number from 0 to 1`);
      else if (p > 0 && !spansOk(x.stageEvidence?.[key])) errors.push(`stageScores.${key} ${p} asserted without a transcript span`);
    }
  }
  if (!Array.isArray(x.feedback)) errors.push("feedback must be an array");
  else {
    if (x.feedback.length > MAX_FEEDBACK) errors.push(`feedback has more than ${MAX_FEEDBACK} angles`);
    x.feedback.forEach((f, i) => {
      if (!f?.angle?.trim() || !f?.hint?.trim()) errors.push(`feedback[${i}] needs an angle and a hint`);
      if (!spansOk(f?.spans)) errors.push(`feedback[${i}] asserted without a transcript span`);
      if (FORBIDDEN_EXTRACTION_FIELD.test(`${f?.angle ?? ""} ${f?.hint ?? ""}`) && /\$|\d+\s*%|\d{3,}/.test(`${f?.angle ?? ""} ${f?.hint ?? ""}`)) errors.push(`feedback[${i}] states a money or consent term; the model may not establish it`);
    });
  }
  return { ok: errors.length === 0, errors };
}

// ---------- Extractors ----------

export interface ExtractInput {
  callId: Id;
  opportunityId: Id;
  transcript: TranscriptSpan[];
  /** Objective fit rule ids the offer policy asks about (SOS-13). */
  offerFitKeys: string[];
}

export interface CallIntelligence {
  extract(input: ExtractInput): CallExtraction;
}

const WEEKDAY = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const VOICEMAIL = /\b(voicemail|voice mail|leave a message|after the tone|not available right now|mailbox)\b/i;
const WRONG_CONTACT = /\b(wrong number|wrong person|no one by that name|never heard of)\b/i;
const BOOK = /\b(book|calendar|schedule|set up a (call|demo|meeting)|put (it|something) on|invite)\b/i;
const CALLBACK = /\b(call (me |us )?back|callback|call again|try (me )?(again|later))\b/i;
const PROPOSAL = /\b(proposal|quote|send (me |us )?(the |a |some )?(details|information|info|deck|pricing|numbers))\b/i;
const DQ = /\b(not interested|no need|don't need|do not need|already (use|have|signed)|closing (down|next month)|take (me|us) off|stop calling)\b/i;
const STAKEHOLDER = /\b(who else|my partner|business partner|my manager|my boss|the gm\b|general manager|the owner|my wife|my husband|the board|our controller)\b/i;
const COMMITMENT = /\b(i'll|i will|we'll|we will|i can|let me)\s+(send|call|email|text|get|check|talk|confirm|forward|look|book|share|have)\b/i;
const OBJECTION = /\b(too expensive|not sure|concern|worried|hesitant|busy right now|bad time|we tried (something|this) before|skeptical|doesn't work for us)\b/i;
const RESOLVED = /\b(that makes sense|fair enough|sounds good|okay that works|that helps|good to know|understood)\b/i;
const NEGATION = /\b(no|not|don't|do not|doesn't|never|without)\b/i;
/** Customer asks about cost or timing to start: a buying signal, not a purchase. */
const BUY_INTENT = /\b(what does it cost|how much|what's the price|get started|move forward|when can we start|which store (would|do) (we|i) start|ready to go)\b/i;
/** Explicit purchase words. Only count as bought together with a commitment to pay. */
const PURCHASE = /\b(send (me |us )?(the |an? )?(agreement|contract)|(my |the )?card\b|\bpay\b|sign(ed|ing)? (it|the|up|today)|let's do it|we're in|i'm in)\b/i;
const PAY_COMMIT = /\b((i'll|i will|we'll|we will|let me)\s+(pay|sign|send (the |a )?(card|deposit|payment))|ready to (pay|sign)|take my card|run the card|put it on (my|the) card)\b/i;

const clamp01 = (n: number) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));

function uniqueSpans(spans: TranscriptSpan[]): TranscriptSpan[] {
  const seen = new Set<string>();
  return spans.filter((s) => {
    const k = `${s.startMs}-${s.endMs}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** A later stage never scores above an earlier one, and an earlier stage inherits the later one's evidence. */
function monotone(scores: StageScores, evidence: Record<StageKey, TranscriptSpan[]>): { stageScores: StageScores; stageEvidence: Record<StageKey, TranscriptSpan[]> } {
  const out = { ...scores };
  const ev: Record<StageKey, TranscriptSpan[]> = { contacted: [...evidence.contacted], qualified: [...evidence.qualified], buying: [...evidence.buying], bought: [...evidence.bought] };
  for (let i = STAGE_KEYS.length - 2; i >= 0; i--) {
    const earlier = STAGE_KEYS[i];
    const later = STAGE_KEYS[i + 1];
    if (out[later] > out[earlier]) {
      out[earlier] = out[later];
      ev[earlier] = uniqueSpans([...ev[earlier], ...ev[later]]);
    }
  }
  for (const key of STAGE_KEYS) {
    if (out[key] <= 0) ev[key] = [];
    else if (ev[key].length === 0) out[key] = 0;
  }
  return { stageScores: out, stageEvidence: ev };
}

export const EMPTY_STAGE_SCORES: StageScores = { contacted: 0, qualified: 0, buying: 0, bought: 0 };
export const EMPTY_STAGE_EVIDENCE: Record<StageKey, TranscriptSpan[]> = { contacted: [], qualified: [], buying: [], bought: [] };

function stakeholderRole(text: string): string {
  const t = text.toLowerCase();
  if (/partner/.test(t)) return "partner";
  if (/manager|boss/.test(t)) return "manager";
  if (/\bgm\b|general manager/.test(t)) return "general_manager";
  if (/owner/.test(t)) return "owner";
  if (/wife|husband/.test(t)) return "spouse";
  if (/board/.test(t)) return "board";
  if (/controller/.test(t)) return "finance";
  return "unspecified_decision_participant";
}

/** Word stems for a fit key such as "rooftop_count_known" -> ["rooftop", "count"]. */
function keyStems(key: string): string[] {
  const STOP = new Set(["known", "is", "has", "have", "the", "a", "an", "of", "and", "or", "yes", "no", "state"]);
  return key.toLowerCase().split(/[_\-\s]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ies|es|s)$/, ""));
}

/**
 * Deterministic keyword rules over the transcript. Good enough for fixtures and tests,
 * and an honest baseline: it only ever says "yes" with a span, and says "unknown" freely.
 */
export class RuleBasedCallIntelligence implements CallIntelligence {
  static readonly MODEL_VERSION = "rules-1.0";

  extract(input: ExtractInput): CallExtraction {
    const spans = input.transcript.filter(spanOk);
    const labeled = spans.some((s) => s.speaker !== undefined);
    const customerTurns = spans.filter((s) => s.speaker === "customer");
    const find = (re: RegExp) => spans.filter((s) => re.test(s.text));
    const unknowns: string[] = [];

    // Outcome: transport can say "completed" for a machine; only text or customer turns count.
    let outcome: CallExtraction["outcome"];
    let uncertainty: CallExtraction["uncertainty"];
    const vm = find(VOICEMAIL);
    const wrong = find(WRONG_CONTACT);
    if (spans.length === 0) {
      outcome = { value: "unknown", spans: [] };
      uncertainty = "high";
      unknowns.push("outcome");
    } else if (vm.length > 0 || (labeled && customerTurns.length === 0)) {
      outcome = { value: "voicemail", spans: vm.length > 0 ? vm : [spans[0]] };
      uncertainty = vm.length > 0 ? "low" : "medium";
    } else if (wrong.length > 0) {
      outcome = { value: "wrong_contact", spans: wrong };
      uncertainty = "low";
    } else if (labeled ? customerTurns.length >= 1 : spans.length >= 2) {
      const evidence = labeled ? customerTurns : spans;
      outcome = { value: "meaningful_interaction", spans: evidence.slice(0, 3) };
      uncertainty = evidence.length >= 2 ? "low" : "medium";
    } else {
      outcome = { value: "unknown", spans: [] };
      uncertainty = "high";
      unknowns.push("outcome");
    }

    const conversational = outcome.value === "meaningful_interaction";

    // Next step: the first rule that fires, in order of consequence.
    let nextStep: CallExtraction["nextStep"] = { value: "none", spans: [] };
    if (conversational) {
      const dq = find(DQ);
      const book = spans.filter((s) => BOOK.test(s.text) || WEEKDAY.test(s.text));
      const cb = find(CALLBACK);
      const prop = find(PROPOSAL);
      if (dq.length > 0) nextStep = { value: "dq_review", spans: dq };
      else if (book.length > 0) nextStep = { value: "book", spans: book };
      else if (cb.length > 0) nextStep = { value: "callback", spans: cb };
      else if (prop.length > 0) nextStep = { value: "proposal", spans: prop };
      else unknowns.push("nextStep");
    }

    const stakeholders: Stakeholder[] = conversational
      ? find(STAKEHOLDER).map((s) => ({ role: stakeholderRole(s.text.match(STAKEHOLDER)?.[0] ?? s.text), spans: [s] }))
      : [];

    const commitments: Commitment[] = conversational
      ? find(COMMITMENT).map((s) => ({ text: s.text.trim(), owner: s.speaker === "rep" ? "rep" : "customer", spans: [s] }))
      : [];

    const objections: Objection[] = conversational
      ? find(OBJECTION).map((s) => ({ text: s.text.trim(), resolved: spans.some((later) => later.startMs > s.startMs && RESOLVED.test(later.text)), spans: [s] }))
      : [];

    const fitFacts: CallExtraction["fitFacts"] = {};
    for (const key of input.offerFitKeys) {
      if (FORBIDDEN_EXTRACTION_FIELD.test(key)) {
        // Never even attempt a money or consent claim; surface it as an unknown for the rep.
        unknowns.push(key);
        continue;
      }
      // The primary stem ("rooftop" for rooftop_count_known, "dms" for dms_compatible) must be spoken by someone other than the rep.
      const stem = keyStems(key)[0];
      const hits = conversational && stem
        ? spans.filter((s) => s.speaker !== "rep" && s.text.toLowerCase().includes(stem))
        : [];
      if (hits.length === 0) {
        fitFacts[key] = { value: "unknown", spans: [] };
        unknowns.push(key);
        continue;
      }
      const negated = hits.every((s) => NEGATION.test(s.text));
      fitFacts[key] = { value: negated ? "no" : "yes", spans: hits };
    }

    // ----- Stage scores, deterministic and cited. -----
    const scores: StageScores = { ...EMPTY_STAGE_SCORES };
    const evidence: Record<StageKey, TranscriptSpan[]> = { contacted: [], qualified: [], buying: [], bought: [] };
    const customerSaid = spans.filter((s) => s.speaker !== "rep");

    if (conversational) {
      const exchanges = labeled ? customerTurns.length : spans.length;
      scores.contacted = exchanges >= 2 ? 0.9 : 0.7;
      evidence.contacted = outcome.spans;

      // Qualified: fit facts the customer stated, a real next step, a customer commitment, objections handled.
      let q = 0;
      const qEv: TranscriptSpan[] = [];
      for (const f of Object.values(fitFacts)) {
        if (f.value === "yes") { q += 0.3; qEv.push(...f.spans); }
        else if (f.value === "no") { q -= 0.2; qEv.push(...f.spans); }
      }
      if (nextStep.value === "book") { q += 0.4; qEv.push(...nextStep.spans); }
      else if (nextStep.value === "proposal") { q += 0.25; qEv.push(...nextStep.spans); }
      else if (nextStep.value === "callback") { q += 0.1; qEv.push(...nextStep.spans); }
      const customerCommitments = commitments.filter((c) => c.owner === "customer");
      if (customerCommitments.length > 0) { q += 0.15; qEv.push(...customerCommitments[0].spans); }
      for (const o of objections) { q += o.resolved ? 0.1 : -0.1; qEv.push(...o.spans); }
      if (nextStep.value === "dq_review") q = 0;
      scores.qualified = clamp01(Math.min(q, 0.95));
      evidence.qualified = uniqueSpans(qEv);

      // Buying: a commitment plus a next step toward the purchase (book or proposal), or asking what it takes to start.
      let b = 0;
      const bEv: TranscriptSpan[] = [];
      if (nextStep.value === "book") { b += 0.45; bEv.push(...nextStep.spans); }
      else if (nextStep.value === "proposal") { b += 0.35; bEv.push(...nextStep.spans); }
      if (customerCommitments.length > 0 && b > 0) { b += 0.2; bEv.push(...customerCommitments[0].spans); }
      const intent = customerSaid.filter((s) => BUY_INTENT.test(s.text));
      if (intent.length > 0) { b += 0.25; bEv.push(...intent); }
      for (const o of objections) if (!o.resolved) { b -= 0.15; bEv.push(...o.spans); }
      if (nextStep.value === "dq_review") b = 0;
      scores.buying = clamp01(Math.min(b, 0.95));
      evidence.buying = uniqueSpans(bEv);

      // Bought: explicit purchase words only count with a commitment to pay, both from the customer.
      const purchase = customerSaid.filter((s) => PURCHASE.test(s.text));
      const payCommit = customerSaid.filter((s) => PAY_COMMIT.test(s.text));
      if (purchase.length > 0 && payCommit.length > 0) {
        scores.bought = 0.85;
        evidence.bought = uniqueSpans([...purchase, ...payCommit]);
      } else if (purchase.length > 0) {
        scores.bought = 0.3;
        evidence.bought = purchase;
      }
    } else if (outcome.value === "voicemail" || outcome.value === "wrong_contact") {
      // A dial happened; nothing else did. Low, not zero, and cited.
      scores.contacted = 0.1;
      evidence.contacted = outcome.spans;
    }
    const { stageScores, stageEvidence } = monotone(scores, evidence);

    // ----- Feedback: three angles at most, each tied to a moment. No lens: the rules have none. -----
    const feedback: Feedback[] = [];
    for (const o of objections) {
      if (feedback.length >= MAX_FEEDBACK) break;
      if (!o.resolved) feedback.push({ angle: "An objection was left open", hint: "Name it back in their words before the next step, and ask what would settle it.", spans: o.spans });
    }
    for (const st of stakeholders) {
      if (feedback.length >= MAX_FEEDBACK) break;
      feedback.push({ angle: `A ${stakeholderRole(st.spans[0]?.text ?? "").replace(/_/g, " ")} decides with them`, hint: "Ask what that person needs to see, and offer to bring it to the next call.", spans: st.spans });
    }
    const unknownFit = Object.entries(fitFacts).filter(([, f]) => f.value === "unknown").map(([k]) => k);
    if (feedback.length < MAX_FEEDBACK && unknownFit.length > 0 && conversational && evidence.contacted.length > 0) {
      feedback.push({ angle: `${unknownFit.length} fit ${unknownFit.length === 1 ? "fact" : "facts"} still unknown`, hint: `Ask about ${unknownFit.map((k) => k.replace(/_/g, " ")).join(", ")} before the next step.`, spans: evidence.contacted.slice(0, 1) });
    }

    // Unknown fit facts and an unknown next step are honest unknowns, not doubt about the
    // outcome. Uncertainty describes how sure the outcome assertion is.
    return {
      callId: input.callId,
      opportunityId: input.opportunityId,
      modelVersion: RuleBasedCallIntelligence.MODEL_VERSION,
      promptVersion: "n/a",
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      outcome,
      commitments,
      stakeholders,
      objections,
      nextStep,
      fitFacts,
      unknowns,
      uncertainty,
      stageScores,
      stageEvidence,
      feedback,
    };
  }
}

/** Says nothing with confidence. Used when AI is unavailable: the rep confirms everything (SOS-09 exceptions). */
export class StubCallIntelligence implements CallIntelligence {
  static readonly MODEL_VERSION = "stub-0";

  extract(input: ExtractInput): CallExtraction {
    const fitFacts: CallExtraction["fitFacts"] = {};
    for (const key of input.offerFitKeys) fitFacts[key] = { value: "unknown", spans: [] };
    return {
      callId: input.callId,
      opportunityId: input.opportunityId,
      modelVersion: StubCallIntelligence.MODEL_VERSION,
      promptVersion: "n/a",
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      outcome: { value: "unknown", spans: [] },
      commitments: [],
      stakeholders: [],
      objections: [],
      nextStep: { value: "none", spans: [] },
      fitFacts,
      unknowns: ["outcome", "nextStep", ...input.offerFitKeys],
      uncertainty: "high",
      stageScores: { ...EMPTY_STAGE_SCORES },
      stageEvidence: { contacted: [], qualified: [], buying: [], bought: [] },
      feedback: [],
    };
  }
}

// ---------- Model-backed extractor (provider-agnostic) ----------

/** Any reasoning model. No SDK here: the adapter that implements this owns the network. */
export interface ReasoningModel {
  complete(input: { system: string; user: string; schema: object }): Promise<unknown>;
}

export interface AsyncCallIntelligence {
  extract(input: ExtractInput): Promise<CallExtraction>;
}

const SPAN_SCHEMA = {
  type: "object",
  required: ["startMs", "endMs", "text"],
  properties: { startMs: { type: "number" }, endMs: { type: "number" }, text: { type: "string" }, speaker: { enum: ["customer", "rep", "unknown"] } },
};
const SPANS = { type: "array", items: SPAN_SCHEMA };

/** JSON schema for the model's output. The wrapper fills callId, opportunityId, versions. */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  required: ["outcome", "commitments", "stakeholders", "objections", "nextStep", "fitFacts", "unknowns", "uncertainty", "stageScores", "stageEvidence", "feedback"],
  properties: {
    outcome: { type: "object", required: ["value", "spans"], properties: { value: { enum: ["no_answer", "voicemail", "wrong_contact", "meaningful_interaction", "unknown"] }, spans: SPANS } },
    commitments: { type: "array", items: { type: "object", required: ["text", "owner", "spans"], properties: { text: { type: "string" }, owner: { enum: ["customer", "rep"] }, dueAt: { type: "string" }, spans: SPANS } } },
    stakeholders: { type: "array", items: { type: "object", required: ["role", "spans"], properties: { name: { type: "string" }, role: { type: "string" }, spans: SPANS } } },
    objections: { type: "array", items: { type: "object", required: ["text", "resolved", "spans"], properties: { text: { type: "string" }, resolved: { type: "boolean" }, spans: SPANS } } },
    nextStep: { type: "object", required: ["value", "spans"], properties: { value: { enum: ["book", "callback", "proposal", "dq_review", "none"] }, spans: SPANS } },
    fitFacts: { type: "object", additionalProperties: { type: "object", required: ["value", "spans"], properties: { value: { enum: ["yes", "no", "partial", "unknown"] }, spans: SPANS } } },
    unknowns: { type: "array", items: { type: "string" } },
    uncertainty: { enum: ["low", "medium", "high"] },
    stageScores: { type: "object", required: STAGE_KEYS, properties: Object.fromEntries(STAGE_KEYS.map((k) => [k, { type: "number", minimum: 0, maximum: 1 }])) },
    stageEvidence: { type: "object", required: STAGE_KEYS, properties: Object.fromEntries(STAGE_KEYS.map((k) => [k, SPANS])) },
    feedback: { type: "array", maxItems: MAX_FEEDBACK, items: { type: "object", required: ["angle", "hint", "spans"], properties: { angle: { type: "string" }, hint: { type: "string" }, spans: SPANS } } },
  },
} as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Reads the model's JSON into the fixed schema. Fields the model may never establish
 * (money, consent, payment) are stripped to unknowns before validation. Anything
 * structurally off is left for validateExtraction to reject.
 */
function coerceModelOutput(raw: unknown, input: ExtractInput, modelVersion: string, promptVersion: string, lensVersion: string): CallExtraction | undefined {
  const r = typeof raw === "string" ? safeJson(raw) : raw;
  if (!isRecord(r)) return undefined;
  const fitFacts: CallExtraction["fitFacts"] = {};
  const unknowns = Array.isArray(r.unknowns) ? r.unknowns.filter((u): u is string => typeof u === "string") : [];
  if (isRecord(r.fitFacts)) {
    for (const [key, fact] of Object.entries(r.fitFacts)) {
      if (FORBIDDEN_EXTRACTION_FIELD.test(key)) { if (!unknowns.includes(key)) unknowns.push(key); continue; }
      fitFacts[key] = fact as CallExtraction["fitFacts"][string];
    }
  }
  for (const key of input.offerFitKeys) {
    if (FORBIDDEN_EXTRACTION_FIELD.test(key)) { if (!unknowns.includes(key)) unknowns.push(key); continue; }
    if (!fitFacts[key]) { fitFacts[key] = { value: "unknown", spans: [] }; if (!unknowns.includes(key)) unknowns.push(key); }
  }
  const commitments = (Array.isArray(r.commitments) ? r.commitments : []).filter((c) => isRecord(c) && !(FORBIDDEN_EXTRACTION_FIELD.test(String(c.text ?? "")) && /\$|\d/.test(String(c.text ?? "")))) as Commitment[];
  const stageScores = isRecord(r.stageScores) ? (Object.fromEntries(STAGE_KEYS.map((k) => [k, r.stageScores && isRecord(r.stageScores) ? r.stageScores[k] : undefined])) as unknown as StageScores) : ({} as StageScores);
  const stageEvidence = isRecord(r.stageEvidence) ? (Object.fromEntries(STAGE_KEYS.map((k) => [k, (r.stageEvidence as Record<string, unknown>)[k] ?? []])) as Record<StageKey, TranscriptSpan[]>) : { contacted: [], qualified: [], buying: [], bought: [] };
  return {
    callId: input.callId,
    opportunityId: input.opportunityId,
    modelVersion,
    promptVersion,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    outcome: r.outcome as CallExtraction["outcome"],
    commitments,
    stakeholders: (Array.isArray(r.stakeholders) ? r.stakeholders : []) as Stakeholder[],
    objections: (Array.isArray(r.objections) ? r.objections : []) as Objection[],
    nextStep: r.nextStep as CallExtraction["nextStep"],
    fitFacts,
    unknowns,
    uncertainty: r.uncertainty as CallExtraction["uncertainty"],
    stageScores,
    stageEvidence,
    feedback: (Array.isArray(r.feedback) ? r.feedback.slice(0, MAX_FEEDBACK) : []) as Feedback[],
    lensVersion,
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Runs any reasoning model through the lens pack. The model's JSON is validated
 * against the CallExtraction shape; on any rejection the rules extractor answers
 * instead, so a bad model output never reaches the policy. Money, consent, and
 * attendance fields are never taken from the model.
 */
export class ModelCallIntelligence implements AsyncCallIntelligence {
  static readonly PROMPT_VERSION = "lens-prompt-1.0";
  private readonly system: string;
  private readonly fallback = new RuleBasedCallIntelligence();

  constructor(private readonly model: ReasoningModel, private readonly lens: LensPack, private readonly modelVersion = "model") {
    this.system = buildSystemPrompt(lens);
  }

  /** The exact system prompt sent, for evals and audits. */
  get systemPrompt(): string {
    return this.system;
  }

  async extract(input: ExtractInput): Promise<CallExtraction> {
    const user = JSON.stringify({ callId: input.callId, offerFitKeys: input.offerFitKeys, transcript: input.transcript });
    let raw: unknown;
    try {
      raw = await this.model.complete({ system: this.system, user, schema: EXTRACTION_JSON_SCHEMA });
    } catch {
      return this.fallbackWith(input, "model call failed");
    }
    const coerced = coerceModelOutput(raw, input, this.modelVersion, ModelCallIntelligence.PROMPT_VERSION, this.lens.version);
    if (!coerced) return this.fallbackWith(input, "model output was not an object");
    const v = validateExtraction(coerced);
    if (!v.ok) return this.fallbackWith(input, `model output rejected: ${v.errors.join("; ")}`);
    return coerced;
  }

  private fallbackWith(input: ExtractInput, reason: string): CallExtraction {
    const x = this.fallback.extract(input);
    return { ...x, unknowns: [...x.unknowns, `fallback: ${reason}`], lensVersion: this.lens.version };
  }
}

/** A canned model for tests. Returns whatever it was given, or throws when asked to. */
export class FakeReasoningModel implements ReasoningModel {
  public calls: { system: string; user: string; schema: object }[] = [];

  constructor(private readonly response: unknown | ((input: { system: string; user: string }) => unknown), private readonly fail = false) {}

  async complete(input: { system: string; user: string; schema: object }): Promise<unknown> {
    this.calls.push(input);
    if (this.fail) throw new Error("fake model failure");
    return typeof this.response === "function" ? (this.response as (i: { system: string; user: string }) => unknown)(input) : this.response;
  }
}

/** A valid model-shaped output (without ids and versions) built from a rules extraction, for tests and fixtures. */
export function modelOutputFrom(x: CallExtraction): Record<string, unknown> {
  const { callId: _c, opportunityId: _o, modelVersion: _m, promptVersion: _p, schemaVersion: _s, lensVersion: _l, ...rest } = x;
  void _c; void _o; void _m; void _p; void _s; void _l;
  return rest;
}

// ---------- Policy ----------

export interface ExtractionPolicy {
  policyVersion: string;
  /** Contact state may move to two_way_contact without a rep tap when outcome is meaningful and uncertainty low. */
  autoApplyTwoWayContact: boolean;
  /** Contact state may move to voicemail without a rep tap when the outcome is voicemail and uncertainty low. */
  autoApplyVoicemail: boolean;
  now: ISODateTime;
  /** Identity of the AI actor for the event envelope (separate from humans and services, SOS-23). */
  actorId?: Id;
}

export const DEFAULT_EXTRACTION_POLICY: Omit<ExtractionPolicy, "now"> = {
  policyVersion: "call-intel-policy-1.0",
  autoApplyTwoWayContact: true,
  autoApplyVoicemail: true,
  actorId: "ai:call_intelligence",
};

export interface ExtractionPolicyResult {
  proposedEvents: DomainEvent[];
  requiresRepConfirmation: boolean;
  reasons: string[];
}

/** Event types the AI path may never produce; providers and humans own these facts. */
export const FORBIDDEN_AI_EVENT_TYPE = /^(payment|ledger|consent|permission|attendance|appointment\.attendance|commission)/i;

const NEXT_STEP_TASK: Record<Exclude<NextStepValue, "none">, Task["action"]> = {
  book: "confirm_appointment",
  callback: "call",
  proposal: "send_proposal",
  dq_review: "review_dq",
};

function spanRefs(callId: Id, spans: TranscriptSpan[]): Id[] {
  return spans.map((s) => `${callId}:span:${s.startMs}-${s.endMs}`);
}

/**
 * The policy decides. The extraction is a proposal; this function turns it into
 * domain events with actorType "ai" and says whether a rep must confirm before
 * they take effect. Money, consent, and attendance are never touched here.
 */
export function applyExtractionPolicy(
  extraction: CallExtraction,
  call: Call,
  opportunity: Opportunity,
  policy: ExtractionPolicy,
): ExtractionPolicyResult {
  const reasons: string[] = [];
  const proposedEvents: DomainEvent[] = [];
  const actorId = policy.actorId ?? "ai:call_intelligence";

  const validation = validateExtraction(extraction);
  if (!validation.ok) {
    return { proposedEvents: [], requiresRepConfirmation: true, reasons: ["extraction rejected by schema validation", ...validation.errors] };
  }
  if (extraction.callId !== call.callId || extraction.opportunityId !== opportunity.opportunityId || call.opportunityId !== opportunity.opportunityId) {
    return { proposedEvents: [], requiresRepConfirmation: true, reasons: ["extraction does not belong to this call and opportunity"] };
  }
  if (call.tenantId !== opportunity.tenantId) {
    return { proposedEvents: [], requiresRepConfirmation: true, reasons: ["cross-tenant call and opportunity"] };
  }

  const mk = <T extends Record<string, unknown>>(suffix: string, eventType: string, aggregateType: string, aggregateId: Id, payload: T, spans: TranscriptSpan[]) =>
    createEvent<T>({
      eventId: `${extraction.callId}:${suffix}`,
      tenantId: call.tenantId,
      eventType,
      aggregateType,
      aggregateId,
      opportunityId: opportunity.opportunityId,
      occurredAt: call.endedAt ?? policy.now,
      receivedAt: policy.now,
      actorType: "ai",
      actorId,
      sourceSystem: "call_intelligence",
      sourceEventId: `${extraction.callId}:${suffix}:${extraction.modelVersion}`,
      causationId: extraction.callId,
      evidenceRefs: [extraction.callId, ...spanRefs(extraction.callId, spans)],
      payload,
    });

  let requiresRepConfirmation = false;

  // The extraction itself is always recorded as a labeled proposal (SOS-23: summarize with source references).
  proposedEvents.push(
    mk("extraction", "call.extraction_recorded", "call", call.callId, {
      extraction,
      policyVersion: policy.policyVersion,
      disputable: true,
    }, extraction.outcome.spans),
  );

  if (extraction.uncertainty !== "low") {
    requiresRepConfirmation = true;
    reasons.push(`uncertainty ${extraction.uncertainty}: rep confirms before anything moves`);
  }
  if (call.transportState !== "ended") {
    requiresRepConfirmation = true;
    reasons.push(`call transport is ${call.transportState}, not ended: outcome is provisional`);
  }

  const outcome = extraction.outcome.value;
  if (outcome !== "unknown") {
    const autoConfirm = !requiresRepConfirmation && (
      (outcome === "meaningful_interaction" && policy.autoApplyTwoWayContact) ||
      (outcome === "voicemail" && policy.autoApplyVoicemail)
    );
    proposedEvents.push(
      mk("outcome", "call.outcome_interpreted", "call", call.callId, {
        interpretedOutcome: outcome,
        uncertainty: extraction.uncertainty,
        outcomeConfirmedBy: autoConfirm ? "policy" : "rep",
        policyVersion: policy.policyVersion,
      }, extraction.outcome.spans),
    );
    if (outcome === "meaningful_interaction") {
      if (autoConfirm) {
        if (opportunity.contactState !== "two_way_contact") {
          proposedEvents.push(
            mk("contact_state", "opportunity.contact_state_changed", "opportunity", opportunity.opportunityId, {
              from: opportunity.contactState,
              to: "two_way_contact",
              policyVersion: policy.policyVersion,
            }, extraction.outcome.spans),
          );
          reasons.push("meaningful interaction with low uncertainty: contact state moves to two_way_contact by policy");
        } else {
          reasons.push("already in two_way_contact; outcome recorded only");
        }
      } else {
        requiresRepConfirmation = true;
        reasons.push("meaningful interaction proposed; rep confirmation required before contact state changes");
      }
    } else if (outcome === "voicemail") {
      if (autoConfirm && (opportunity.contactState === "none" || opportunity.contactState === "attempted")) {
        proposedEvents.push(
          mk("contact_state", "opportunity.contact_state_changed", "opportunity", opportunity.opportunityId, {
            from: opportunity.contactState,
            to: "voicemail",
            policyVersion: policy.policyVersion,
          }, extraction.outcome.spans),
        );
        reasons.push("voicemail with low uncertainty: contact state moves to voicemail by policy; not a conversation");
      } else if (!autoConfirm) {
        requiresRepConfirmation = true;
        reasons.push("voicemail proposed; rep confirmation required");
      }
    } else {
      // wrong_contact and no_answer are consequential for the contact record: a rep confirms.
      requiresRepConfirmation = true;
      reasons.push(`${outcome} proposed; rep confirmation required`);
    }
  } else {
    requiresRepConfirmation = true;
    reasons.push("outcome unknown; rep confirms the disposition");
  }

  // Qualification: any asserted fit fact, objection, or DQ suggestion is a proposal needing confirmation (SOS-13).
  const assertedFacts = Object.entries(extraction.fitFacts).filter(([, f]) => f.value !== "unknown");
  const touchesQualification = assertedFacts.length > 0 || extraction.nextStep.value === "dq_review";
  if (touchesQualification) {
    requiresRepConfirmation = true;
    reasons.push("touches qualification: proposed assessment needs rep confirmation");
    const objective: Record<string, { value: FitValue; evidenceRefs: Id[] }> = {};
    for (const [key, f] of Object.entries(extraction.fitFacts)) objective[key] = { value: f.value, evidenceRefs: spanRefs(call.callId, f.spans) };
    proposedEvents.push(
      mk("assessment", "qualification.assessment_proposed", "opportunity", opportunity.opportunityId, {
        objective,
        aiRecommendation: extraction.nextStep.value === "dq_review" ? "decline" : extraction.unknowns.length > 0 ? "clarify" : "proceed",
        reviewState: "needs_confirmation",
        unknowns: extraction.unknowns,
        policyVersion: policy.policyVersion,
      }, assertedFacts.flatMap(([, f]) => f.spans).concat(extraction.nextStep.spans)),
    );
  }

  // Next step becomes a proposed task through the canonical workflow, never a booking by itself.
  if (extraction.nextStep.value !== "none") {
    const dueAt = extraction.commitments.find((c) => c.dueAt)?.dueAt;
    proposedEvents.push(
      mk("next_step", "task.proposed", "task", `task:${opportunity.opportunityId}:${NEXT_STEP_TASK[extraction.nextStep.value]}:${call.callId}`, {
        action: NEXT_STEP_TASK[extraction.nextStep.value],
        nextStep: extraction.nextStep.value,
        dueAt,
        commitments: extraction.commitments.map((c) => ({ text: c.text, owner: c.owner, dueAt: c.dueAt })),
        stakeholders: extraction.stakeholders.map((s) => ({ name: s.name, role: s.role })),
        policyVersion: policy.policyVersion,
      }, extraction.nextStep.spans),
    );
    if (extraction.nextStep.value === "book" && !requiresRepConfirmation) reasons.push("next step book proposed as a confirm_appointment task");
  }

  // Hard guard: nothing from the AI path may claim money, consent, or attendance.
  const forbidden = proposedEvents.filter((e) => FORBIDDEN_AI_EVENT_TYPE.test(e.eventType));
  if (forbidden.length > 0) {
    throw new Error(`applyExtractionPolicy produced forbidden event types: ${forbidden.map((e) => e.eventType).join(", ")}`);
  }

  if (!requiresRepConfirmation && reasons.length === 0) reasons.push("applied by policy");
  return { proposedEvents, requiresRepConfirmation, reasons };
}
