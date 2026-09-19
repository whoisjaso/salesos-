/**
 * Native call review over the simulated extraction (D: "Call intelligence, not a
 * third-party notetaker"). Pure over fixtures: no React, no fetch, `now` is the
 * fixture NOW. The model proposes; the policy decides; the rep can dispute any field.
 */
import {
  applyExtractionPolicy,
  DEFAULT_EXTRACTION_POLICY,
  RuleBasedCallIntelligence,
  validateExtraction,
  type CallExtraction,
  type ExtractionPolicyResult,
  type TranscriptSpan,
  type ValidationResult,
} from "@/domain/callIntelligence";
import { RulesCoachingEngine } from "@/domain/coaching";
import type { Call, CallInterpretedOutcome, CoachingRecommendation, Contact, DomainEvent, Id, Opportunity, User } from "@/domain/types";
import { NOW, obaviaDataset } from "@/fixtures/obavia";
import { TRANSCRIPT_CALL_IDS, transcriptFor } from "@/fixtures/calls";

const dataset = obaviaDataset;
const intelligence = new RuleBasedCallIntelligence();

/** Objective fit rule ids the offer policy asks about (mirrors the fixture assessments, SOS-13). */
export const OFFER_FIT_KEYS = ["rooftop_count_known", "budget_authority", "dms_compatible"];

export type MomentKind = "commitment" | "stakeholder" | "objection" | "next_step" | "outcome";

export interface Moment {
  /** Index into `transcript`. */
  spanIndex: number;
  kind: MomentKind;
  /** A label, not a sentence. */
  label: string;
  /** The extracted field that produced this moment. */
  fieldId: string;
}

/** One disputable field in the Extracted sheet. */
export interface ExtractedField {
  id: string;
  kind: MomentKind | "fit";
  label: string;
  value: string;
  /** Indexes into `transcript`. Empty for non-assertions (unknown, none). */
  spanIndexes: number[];
}

export interface Review {
  call: Call;
  contact: Contact;
  opportunity: Opportunity;
  rep: User;
  transcript: TranscriptSpan[];
  extraction: CallExtraction;
  validation: ValidationResult;
  policy: ExtractionPolicyResult;
  coaching?: CoachingRecommendation;
  moments: Moment[];
  fields: ExtractedField[];
  /** spanIndex -> labels of the fields that cite it. */
  citations: Map<number, string[]>;
}

export interface ReviewRow {
  callId: Id;
  call: Call;
  contact: Contact;
  rep: User;
  outcome: CallInterpretedOutcome;
  needsConfirm: boolean;
}

// ---------- Words ----------

/** The one large word on the review hero. */
export const OUTCOME_WORD: Record<CallInterpretedOutcome, string> = {
  meaningful_interaction: "Meaningful",
  voicemail: "Voicemail",
  no_answer: "No answer",
  wrong_contact: "Wrong contact",
  unknown: "Unknown",
};

/** Uncertainty inverted into plain confidence words. */
export const CONFIDENCE_WORD: Record<CallExtraction["uncertainty"], string> = {
  low: "High confidence",
  medium: "Medium confidence",
  high: "Low confidence",
};

export const NEXT_STEP_WORD: Record<CallExtraction["nextStep"]["value"], string> = {
  book: "Book",
  callback: "Callback",
  proposal: "Proposal",
  dq_review: "DQ review",
  none: "None",
};

export const NEVER_LINE = "Never writes money, consent, or attendance";

const STAKEHOLDER_WORD: Record<string, string> = {
  partner: "Partner",
  manager: "Manager",
  general_manager: "General manager",
  owner: "Owner",
  spouse: "Spouse",
  board: "Board",
  finance: "Finance",
  unspecified_decision_participant: "Someone else",
};

export function stakeholderWord(role: string): string {
  return STAKEHOLDER_WORD[role] ?? role.replace(/_/g, " ");
}

const OBJECTION_WORD: [RegExp, string][] = [
  [/too expensive/i, "Price"],
  [/not sure|skeptical|hesitant/i, "Unsure"],
  [/concern|worried/i, "Worried"],
  [/busy right now|bad time/i, "Timing"],
  [/we tried (something|this) before/i, "Tried before"],
  [/doesn't work for us/i, "Fit"],
];

export function objectionWord(text: string): string {
  return OBJECTION_WORD.find(([re]) => re.test(text))?.[1] ?? "Objection";
}

export function humanizeFitKey(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 62000 reads "1:02". */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "8m 56s". */
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return "Unknown length";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ---------- Plain words for the policy ----------

/** A proposed event in plain words. Returns undefined for the bookkeeping event. */
export function describeEvent(e: DomainEvent): string | undefined {
  const p = e.payload as Record<string, unknown>;
  switch (e.eventType) {
    case "call.extraction_recorded":
      return undefined;
    case "call.outcome_interpreted":
      return `Records the outcome as ${OUTCOME_WORD[p.interpretedOutcome as CallInterpretedOutcome].toLowerCase()}`;
    case "opportunity.contact_state_changed":
      return p.to === "two_way_contact" ? "Marks two-way contact" : p.to === "voicemail" ? "Marks voicemail" : `Marks ${String(p.to).replace(/_/g, " ")}`;
    case "qualification.assessment_proposed":
      return "Proposes a fit assessment for review";
    case "task.proposed":
      switch (p.action) {
        case "confirm_appointment":
          return "Creates a booking task";
        case "call":
          return "Creates a callback task";
        case "send_proposal":
          return "Creates a proposal task";
        case "review_dq":
          return "Proposes a DQ review";
        default:
          return `Creates a ${String(p.action).replace(/_/g, " ")} task`;
      }
    default:
      return e.eventType.replace(/[._]/g, " ");
  }
}

export function describePolicy(policy: ExtractionPolicyResult): string[] {
  const words = policy.proposedEvents.map(describeEvent).filter((w): w is string => Boolean(w));
  return words.length > 0 ? words : ["Nothing changes"];
}

// ---------- Access ----------

export interface Viewer {
  userId: Id;
  role: "setter" | "closer" | "owner";
}

/** Reps see their own calls. The owner sees every call. */
export function canReview(viewer: Viewer, call: Call): boolean {
  return viewer.role === "owner" || call.userId === viewer.userId;
}

function callById(callId: Id): Call | undefined {
  return dataset.calls.find((c) => c.callId === callId);
}

/** Ended calls with a transcript, newest first. Filtered to the viewer's own unless owner. */
export function reviewableCalls(viewer: Viewer): ReviewRow[] {
  const rows: ReviewRow[] = [];
  for (const callId of TRANSCRIPT_CALL_IDS) {
    const call = callById(callId);
    if (!call || call.transportState !== "ended" || !canReview(viewer, call)) continue;
    const review = buildReview(callId);
    if (!review) continue;
    rows.push({ callId, call, contact: review.contact, rep: review.rep, outcome: review.extraction.outcome.value, needsConfirm: review.policy.requiresRepConfirmation });
  }
  return rows.sort((a, b) => Date.parse(b.call.startedAt ?? "0") - Date.parse(a.call.startedAt ?? "0"));
}

/** Latest reviewable call for an opportunity, for the Review links on ended calls. */
export function latestReviewableCallId(opportunityId: Id): Id | undefined {
  const calls = TRANSCRIPT_CALL_IDS.map(callById).filter((c): c is Call => Boolean(c) && c!.opportunityId === opportunityId && c!.transportState === "ended");
  return calls.sort((a, b) => Date.parse(b.startedAt ?? "0") - Date.parse(a.startedAt ?? "0"))[0]?.callId;
}

/** `/review?call=<id>` when the opportunity has a reviewable call, otherwise the index. */
export function reviewHref(opportunityId: Id): string {
  const id = latestReviewableCallId(opportunityId);
  return id ? `/review?call=${id}` : "/review";
}

// ---------- Build ----------

function spanIndex(transcript: TranscriptSpan[], span: TranscriptSpan): number {
  return transcript.findIndex((s) => s.startMs === span.startMs && s.endMs === span.endMs);
}

function indexes(transcript: TranscriptSpan[], spans: TranscriptSpan[]): number[] {
  return spans.map((s) => spanIndex(transcript, s)).filter((i) => i >= 0);
}

/** Field ids: outcome, nextStep, commitment:<i>, stakeholder:<i>, objection:<i>, fit:<key>. */
function buildFields(x: CallExtraction, transcript: TranscriptSpan[]): ExtractedField[] {
  const fields: ExtractedField[] = [
    { id: "outcome", kind: "outcome", label: "Outcome", value: OUTCOME_WORD[x.outcome.value], spanIndexes: indexes(transcript, x.outcome.spans) },
    { id: "nextStep", kind: "next_step", label: "Next step", value: NEXT_STEP_WORD[x.nextStep.value], spanIndexes: indexes(transcript, x.nextStep.spans) },
  ];
  x.commitments.forEach((c, i) => fields.push({ id: `commitment:${i}`, kind: "commitment", label: `Commitment, ${c.owner === "rep" ? "you" : "customer"}`, value: c.text, spanIndexes: indexes(transcript, c.spans) }));
  x.stakeholders.forEach((s, i) => fields.push({ id: `stakeholder:${i}`, kind: "stakeholder", label: "Stakeholder", value: s.name ? `${s.name}, ${stakeholderWord(s.role)}` : stakeholderWord(s.role), spanIndexes: indexes(transcript, s.spans) }));
  x.objections.forEach((o, i) => fields.push({ id: `objection:${i}`, kind: "objection", label: `Objection, ${o.resolved ? "resolved" : "open"}`, value: o.text, spanIndexes: indexes(transcript, o.spans) }));
  for (const [key, f] of Object.entries(x.fitFacts)) {
    fields.push({ id: `fit:${key}`, kind: "fit", label: humanizeFitKey(key), value: f.value === "unknown" ? "Unknown" : f.value.charAt(0).toUpperCase() + f.value.slice(1), spanIndexes: indexes(transcript, f.spans) });
  }
  return fields;
}

/** One moment per cited span, in transcript order. Outcome spans come last so the strip leads with the substantive ones. */
function buildMoments(x: CallExtraction, transcript: TranscriptSpan[]): Moment[] {
  const out: Moment[] = [];
  const push = (spans: TranscriptSpan[], kind: MomentKind, label: string, fieldId: string) => {
    for (const i of indexes(transcript, spans)) {
      if (out.some((m) => m.spanIndex === i && m.kind === kind)) continue;
      out.push({ spanIndex: i, kind, label, fieldId });
    }
  };
  x.commitments.forEach((c, i) => push(c.spans, "commitment", c.owner === "rep" ? "Commitment, you" : "Commitment, customer", `commitment:${i}`));
  x.stakeholders.forEach((s, i) => push(s.spans, "stakeholder", `Stakeholder, ${stakeholderWord(s.role).toLowerCase()}`, `stakeholder:${i}`));
  x.objections.forEach((o, i) => push(o.spans, "objection", `Objection, ${objectionWord(o.text).toLowerCase()}`, `objection:${i}`));
  if (x.nextStep.value !== "none") push(x.nextStep.spans.slice(0, 1), "next_step", `Next step, ${NEXT_STEP_WORD[x.nextStep.value].toLowerCase()}`, "nextStep");
  out.sort((a, b) => a.spanIndex - b.spanIndex);
  if (x.outcome.value !== "unknown") push(x.outcome.spans.slice(0, 1), "outcome", `Outcome, ${OUTCOME_WORD[x.outcome.value].toLowerCase()}`, "outcome");
  return out;
}

function buildCitations(fields: ExtractedField[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const f of fields) {
    for (const i of f.spanIndexes) {
      const list = map.get(i) ?? [];
      if (!list.includes(f.label)) list.push(f.label);
      map.set(i, list);
    }
  }
  return map;
}

/** The full review for one call, or undefined when the call has no transcript or is not ended. */
export function buildReview(callId: Id): Review | undefined {
  const call = callById(callId);
  const transcript = transcriptFor(callId);
  if (!call || !transcript || call.transportState !== "ended") return undefined;
  const opportunity = dataset.opportunities.find((o) => o.opportunityId === call.opportunityId);
  const rep = dataset.users.find((u) => u.userId === call.userId);
  const contact = opportunity && dataset.contacts.find((c) => c.contactId === opportunity.primaryContactId);
  if (!opportunity || !rep || !contact) return undefined;

  const extraction = intelligence.extract({ callId, opportunityId: opportunity.opportunityId, transcript, offerFitKeys: OFFER_FIT_KEYS });
  const validation = validateExtraction(extraction);
  const policy = applyExtractionPolicy(extraction, call, opportunity, { ...DEFAULT_EXTRACTION_POLICY, now: NOW });
  const recs = RulesCoachingEngine.recommend(dataset, rep.userId, NOW);
  const coaching = recs.find((r) => !r.suppressed) ?? recs[0];
  const fields = buildFields(extraction, transcript);

  return {
    call,
    contact,
    opportunity,
    rep,
    transcript,
    extraction,
    validation,
    policy,
    coaching,
    moments: buildMoments(extraction, transcript),
    fields,
    citations: buildCitations(fields),
  };
}

// ---------- Disputes (client state, recomputed purely) ----------

/** A disputed field never moves a stage until resolved: the policy result flips to rep confirmation. */
export function policyWithDisputes(review: Review, disputed: ReadonlySet<string>): ExtractionPolicyResult {
  if (disputed.size === 0) return review.policy;
  const labels = review.fields.filter((f) => disputed.has(f.id)).map((f) => f.label.toLowerCase());
  return {
    proposedEvents: review.policy.proposedEvents,
    requiresRepConfirmation: true,
    reasons: [...review.policy.reasons, `disputed by rep: ${labels.join(", ")}; nothing moves until resolved`],
  };
}

/** The moment a coaching card should point at: an open objection first, then the next step, then the first moment. */
export function coachingMoment(review: Review): Moment | undefined {
  const open = review.extraction.objections.map((o, i) => (o.resolved ? undefined : `objection:${i}`)).filter(Boolean);
  return (
    review.moments.find((m) => open.includes(m.fieldId)) ??
    review.moments.find((m) => m.kind === "next_step") ??
    review.moments.find((m) => m.kind !== "outcome") ??
    review.moments[0]
  );
}

/** A good example for the playbook: meaningful, booked, and every objection resolved. */
export function isGoodExample(review: Review): boolean {
  const x = review.extraction;
  return x.outcome.value === "meaningful_interaction" && x.nextStep.value === "book" && x.objections.every((o) => o.resolved) && review.validation.ok;
}
