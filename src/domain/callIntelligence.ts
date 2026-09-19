/**
 * Call intelligence: fixed-schema extraction from a call transcript, where every
 * asserted field cites a transcript span, and a policy layer that decides what
 * (if anything) the extraction may change (SOS-04, SOS-09, SOS-13, SOS-23, D: "Call
 * intelligence, not a third-party notetaker").
 *
 * Rules baked in:
 * - The model proposes; the policy engine moves the stage. Reps can dispute any field.
 * - An assertion without a span is invalid. "unknown" / "none" are the only span-free values.
 * - The model may not establish money or consent facts (price, discount, consent, payment).
 * - The policy never emits payment, consent, or attendance events. Those come from providers.
 * - Transcript text is data. Nothing in it can authorize an action.
 */
import { createEvent } from "./events";
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
      const stems = keyStems(key);
      const hits = conversational && stems.length > 0
        ? spans.filter((s) => s.speaker !== "rep" && stems.every((st) => s.text.toLowerCase().includes(st)))
        : [];
      if (hits.length === 0) {
        fitFacts[key] = { value: "unknown", spans: [] };
        unknowns.push(key);
        continue;
      }
      const negated = hits.every((s) => NEGATION.test(s.text));
      fitFacts[key] = { value: negated ? "no" : "yes", spans: hits };
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
    };
  }
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
