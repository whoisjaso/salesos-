/**
 * Native call review over the simulated extraction (D: "Call intelligence, not a
 * third-party notetaker"; D: "The transcript decides. No rep approval."). Pure over
 * fixtures: no React, no fetch, `now` is the fixture NOW. The transcript is scored per
 * stage; the policy applies at the band; the rep can dispute any field.
 */
import {
  applyExtractionPolicy,
  BAND_LABEL,
  DEFAULT_EXTRACTION_POLICY,
  RuleBasedCallIntelligence,
  STAGE_KEYS,
  validateExtraction,
  type Band,
  type CallExtraction,
  type ExtractionPolicyResult,
  type StageApplication,
  type StageKey,
  type TranscriptSpan,
  type ValidationResult,
} from "@/domain/callIntelligence";
import { BUYER_MODE_DIMENSIONS, BUYER_MODE_LABEL, UNKNOWN_VALUE, emptyBuyerMode, isConfident, type ArchetypeRead, type BuyerMode, type BuyerModeDimension } from "@/domain/buyerMode";
import { RulesCoachingEngine } from "@/domain/coaching";
import { lensByName } from "@/content/lenses";
import { MEANING_WORD, ORIGIN_WORD, reject, suggestReuse, type CitedReference } from "@/domain/references";
import type { Call, CallInterpretedOutcome, CoachingRecommendation, Contact, DomainEvent, Id, Opportunity, User } from "@/domain/types";
import { NOW, obaviaDataset } from "@/fixtures/obavia";
import { TRANSCRIPT_CALL_IDS, transcriptFor } from "@/fixtures/calls";

const dataset = obaviaDataset;
const intelligence = new RuleBasedCallIntelligence();

/** Objective fit rule ids the offer policy asks about (mirrors the fixture assessments, SOS-13). */
export const OFFER_FIT_KEYS = ["rooftop_count_known", "budget_authority", "dms_compatible"];

export type MomentKind = "commitment" | "stakeholder" | "objection" | "next_step" | "outcome" | "reference";

export interface Moment {
  /** Index into `transcript`. */
  spanIndex: number;
  kind: MomentKind;
  /** A label, not a sentence. */
  label: string;
  /** The extracted field that produced this moment. */
  fieldId: string;
}

/** One funnel stage as the review shows it. */
export interface StageView {
  key: StageKey;
  label: string;
  /** 0..1 */
  score: number;
  /** 0..100, rounded. */
  percent: number;
  band: Band;
  bandLabel: string;
  application: StageApplication;
  /** Indexes into `transcript` of the cited spans. Empty at score 0. */
  spanIndexes: number[];
}

/** The one large word on the review hero: the furthest stage at or above Likely, or No contact. */
export interface Hero {
  word: string;
  key?: StageKey;
  score: number;
  percent: number;
  band: Band;
  bandLabel: string;
}

/** One angle card. */
export interface FeedbackCard {
  angle: string;
  hint: string;
  spanIndex?: number;
}

/** One disputable field in the Extracted sheet. */
export interface ExtractedField {
  id: string;
  kind: MomentKind | "fit" | "stage";
  label: string;
  value: string;
  /** Indexes into `transcript`. Empty for non-assertions (unknown, none). */
  spanIndexes: number[];
}

/** One "Their words" card: the prospect's exact expression and what it stood for here. */
export interface ReferenceView {
  referenceId: string;
  /** Exactly as spoken. */
  expression: string;
  /** One line: the relationship the expression carries, or the prospect's own explanation once confirmed. */
  meaning: string;
  originWord: string;
  meaningWord: string;
  domain: string;
  /** Index into `transcript` of the cited span. */
  spanIndex: number;
}

/** The one Angle chip: a line in the prospect's own frame, under a later customer turn. */
export interface Angle {
  spanIndex: number;
  referenceId: string;
  line: string;
}

/** One buyer mode dimension as the Details sheet shows it: a label, a value word, a dot. */
export interface BuyerModeRow {
  dimension: BuyerModeDimension;
  label: string;
  value: string;
  /** 0..1 */
  confidence: number;
  /** Filled dot at or above CONFIDENT. */
  confident: boolean;
  /** False for Unknown: the row is dimmed and cites nothing. */
  known: boolean;
  /** Indexes into `transcript`. Empty for Unknown. */
  spanIndexes: number[];
}

/** One line of the archetype read: "Competence 72%", a slim bar, the cited words on tap. */
export interface ReadRow {
  name: ArchetypeRead["name"];
  label: string;
  /** 0..100, rounded. */
  percent: number;
  spanIndexes: number[];
}

export interface BuyerModeView {
  rows: BuyerModeRow[];
  /** Up to six imperative lines. */
  approach: string[];
  /** Up to four lines, strongest first. */
  read: ReadRow[];
  /** True when every dimension is Unknown and the read is empty. */
  empty: boolean;
}

export const READ_CAPTION = "what we believe, and how strongly";

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
  stages: StageView[];
  hero: Hero;
  feedback: FeedbackCard[];
  /** Their words, in transcript order. */
  references: ReferenceView[];
  /** Buyer mode: nine rows, the approach, the read. */
  buyerMode: BuyerModeView;
}

export interface ReviewRow {
  callId: Id;
  call: Call;
  contact: Contact;
  rep: User;
  outcome: CallInterpretedOutcome;
  hero: Hero;
}

// ---------- Words ----------

export const STAGE_WORD: Record<StageKey, string> = {
  contacted: "Contacted",
  qualified: "Qualified",
  buying: "Buying",
  bought: "Bought",
};

export const NO_CONTACT_WORD = "No contact";

/** "Applied" when a stage moved, "Leaning" when it was recorded below the band. */
export const APPLICATION_WORD: Record<StageApplication, string> = {
  applied: "Applied",
  leaning: "Leaning",
  none: "Not scored",
};

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

/** One line under "What this changes". `applied` false means leaning: recorded, not applied. */
export interface Change {
  text: string;
  applied: boolean;
}

function taskWord(action: unknown): string {
  switch (action) {
    case "confirm_appointment":
      return "Creates a booking task";
    case "call":
      return "Creates a callback task";
    case "send_proposal":
      return "Creates a proposal task";
    case "review_dq":
      return "Proposes a DQ review";
    case "follow_up":
      return "Creates a follow-up task";
    default:
      return `Creates a ${String(action).replace(/_/g, " ")} task`;
  }
}

/** A proposed event in plain words. Returns undefined for the bookkeeping event. */
export function describeEvent(e: DomainEvent): Change | undefined {
  const p = e.payload as Record<string, unknown>;
  switch (e.eventType) {
    case "call.extraction_recorded":
      return undefined;
    case "call.outcome_interpreted":
      return { text: `Records the outcome as ${OUTCOME_WORD[p.interpretedOutcome as CallInterpretedOutcome].toLowerCase()}`, applied: true };
    case "opportunity.contact_state_changed":
      return { text: p.to === "two_way_contact" ? "Marks two-way contact" : p.to === "voicemail" ? "Marks voicemail" : `Marks ${String(p.to).replace(/_/g, " ")}`, applied: true };
    case "qualification.assessment_proposed":
      if (p.reviewState === "confirmed") return { text: p.aiRecommendation === "decline" ? "Records not a fit" : "Confirms the fit assessment", applied: true };
      if (p.reviewState === "needs_confirmation") return { text: "Proposes a fit assessment for review", applied: false };
      return { text: "Records a leaning fit assessment", applied: false };
    case "opportunity.decision_recorded":
      return { text: "Records a verbal yes", applied: true };
    case "task.created":
      return { text: taskWord(p.action), applied: true };
    case "task.proposed":
      return { text: taskWord(p.action), applied: false };
    default:
      return { text: e.eventType.replace(/[._]/g, " "), applied: true };
  }
}

export function describePolicy(policy: ExtractionPolicyResult): Change[] {
  const words = policy.proposedEvents.map(describeEvent).filter((w): w is Change => Boolean(w));
  return words.length > 0 ? words : [{ text: "Nothing changes", applied: true }];
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
    rows.push({ callId, call, contact: review.contact, rep: review.rep, outcome: review.extraction.outcome.value, hero: review.hero });
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
  x.references.forEach((r, i) => fields.push({ id: `reference:${i}`, kind: "reference", label: "Their words", value: r.evidence.exactExpression, spanIndexes: indexes(transcript, r.spans) }));
  for (const [key, f] of Object.entries(x.fitFacts)) {
    fields.push({ id: `fit:${key}`, kind: "fit", label: humanizeFitKey(key), value: f.value === "unknown" ? "Unknown" : f.value.charAt(0).toUpperCase() + f.value.slice(1), spanIndexes: indexes(transcript, f.spans) });
  }
  for (const key of STAGE_KEYS) {
    const score = x.stageScores[key];
    fields.push({ id: `stage:${key}`, kind: "stage", label: `Stage, ${STAGE_WORD[key].toLowerCase()}`, value: `${Math.round(score * 100)}%, ${BAND_LABEL[stageBand(x, key)]}`, spanIndexes: indexes(transcript, x.stageEvidence[key]) });
  }
  return fields;
}

function stageBand(x: CallExtraction, key: StageKey): Band {
  return bandOf(x.stageScores[key]);
}

function bandOf(score: number): Band {
  const b = DEFAULT_EXTRACTION_POLICY.bands!;
  return score >= b.yes ? "yes" : score >= b.likely ? "likely" : score >= b.unlikely ? "unlikely" : "no";
}

/** The four stages, in funnel order, with the policy's bands and application. */
function buildStages(x: CallExtraction, policy: ExtractionPolicyResult, transcript: TranscriptSpan[]): StageView[] {
  return STAGE_KEYS.map((key) => {
    const score = x.stageScores[key];
    const band = policy.stageBands[key];
    return {
      key,
      label: STAGE_WORD[key],
      score,
      percent: Math.round(score * 100),
      band,
      bandLabel: BAND_LABEL[band],
      application: policy.stageApplication[key],
      spanIndexes: indexes(transcript, x.stageEvidence[key]),
    };
  });
}

/** The furthest stage at or above Likely wins the hero. Nothing at Likely reads "No contact". */
export function heroFor(stages: StageView[]): Hero {
  const cleared = [...stages].reverse().find((s) => s.band === "yes" || s.band === "likely");
  if (cleared) return { word: cleared.label, key: cleared.key, score: cleared.score, percent: cleared.percent, band: cleared.band, bandLabel: cleared.bandLabel };
  const contacted = stages.find((s) => s.key === "contacted") ?? stages[0];
  return { word: NO_CONTACT_WORD, score: contacted?.score ?? 0, percent: contacted?.percent ?? 0, band: contacted?.band ?? "no", bandLabel: BAND_LABEL[contacted?.band ?? "no"] };
}

function buildFeedback(x: CallExtraction, transcript: TranscriptSpan[]): FeedbackCard[] {
  return x.feedback.map((f) => ({ angle: f.angle, hint: f.hint, spanIndex: indexes(transcript, f.spans)[0] }));
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
  x.references.forEach((r, i) => push(r.spans, "reference", `Their words, ${referenceWord(r)}`, `reference:${i}`));
  if (x.nextStep.value !== "none") push(x.nextStep.spans.slice(0, 1), "next_step", `Next step, ${NEXT_STEP_WORD[x.nextStep.value].toLowerCase()}`, "nextStep");
  out.sort((a, b) => a.spanIndex - b.spanIndex);
  if (x.outcome.value !== "unknown") push(x.outcome.spans.slice(0, 1), "outcome", `Outcome, ${OUTCOME_WORD[x.outcome.value].toLowerCase()}`, "outcome");
  return out;
}

/** The short word on a reference moment: the domain for an analogy, the term itself otherwise. */
function referenceWord(r: CitedReference): string {
  const d = r.semantics.sourceDomain;
  if (r.semantics.kind === "analogy" && d && d !== "none") return d;
  return r.evidence.exactExpression.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
}

function buildReferences(x: CallExtraction, transcript: TranscriptSpan[]): ReferenceView[] {
  return x.references
    .map((r) => ({
      referenceId: r.identity.referenceId,
      expression: r.evidence.exactExpression,
      meaning: r.semantics.explainedMeaning?.text ?? r.semantics.comparisonRelationship,
      originWord: ORIGIN_WORD[r.semantics.origin],
      meaningWord: MEANING_WORD[r.semantics.meaningStatus],
      domain: r.semantics.sourceDomain,
      spanIndex: indexes(transcript, r.spans)[0] ?? -1,
    }))
    .filter((v) => v.spanIndex >= 0);
}

/**
 * The one Angle for the call: the first later customer turn where a reference the rep
 * has not rejected retrieves by concept. At most one per call. Pure over client state.
 */
export function angleFor(review: Review, rejected: ReadonlySet<string> = new Set()): Angle | undefined {
  const refs = review.extraction.references.map((r) => (rejected.has(r.identity.referenceId) ? reject(r) : r));
  if (refs.length === 0) return undefined;
  const stage = review.hero.key ?? "contacted";
  for (let i = 0; i < review.transcript.length; i++) {
    const turn = review.transcript[i];
    if (turn.speaker !== "customer") continue;
    const s = suggestReuse(refs, turn, stage);
    if (s) return { spanIndex: i, referenceId: s.referenceId, line: s.line };
  }
  return undefined;
}

/** Nine rows in dimension order; a dimension the extraction did not fill reads Unknown. */
export function buildBuyerModeView(mode: BuyerMode | undefined, read: ArchetypeRead[] | undefined, transcript: TranscriptSpan[]): BuyerModeView {
  const m = mode ?? emptyBuyerMode();
  const rows: BuyerModeRow[] = BUYER_MODE_DIMENSIONS.map((dimension) => {
    const v = m[dimension];
    const known = v.value !== UNKNOWN_VALUE;
    return { dimension, label: BUYER_MODE_LABEL[dimension], value: v.value, confidence: v.confidence, confident: isConfident(v), known, spanIndexes: known ? indexes(transcript, v.spans) : [] };
  });
  const readRows: ReadRow[] = (read ?? []).map((r) => ({ name: r.name, label: lensByName[r.name]?.label ?? r.name, percent: Math.round(r.probability * 100), spanIndexes: indexes(transcript, r.spans) }));
  return { rows, approach: m.approach ?? [], read: readRows, empty: rows.every((r) => !r.known) && readRows.length === 0 };
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

  const profile = dataset.communicationProfiles?.find((p) => p.opportunityId === opportunity.opportunityId);
  const extraction = intelligence.extract({ callId, opportunityId: opportunity.opportunityId, transcript, offerFitKeys: OFFER_FIT_KEYS, tenantId: call.tenantId, profile });
  const validation = validateExtraction(extraction);
  const policy = applyExtractionPolicy(extraction, call, opportunity, { ...DEFAULT_EXTRACTION_POLICY, now: NOW });
  const recs = RulesCoachingEngine.recommend(dataset, rep.userId, NOW);
  const coaching = recs.find((r) => !r.suppressed) ?? recs[0];
  const fields = buildFields(extraction, transcript);
  const stages = buildStages(extraction, policy, transcript);

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
    stages,
    hero: heroFor(stages),
    feedback: buildFeedback(extraction, transcript),
    references: buildReferences(extraction, transcript),
    buyerMode: buildBuyerModeView(extraction.buyerMode, extraction.archetypeRead, transcript),
  };
}

// ---------- Disputes (client state, recomputed purely) ----------

/** A disputed field holds what it touched until resolved: the only way a rep stops the transcript. */
export function policyWithDisputes(review: Review, disputed: ReadonlySet<string>): ExtractionPolicyResult {
  if (disputed.size === 0) return review.policy;
  const labels = review.fields.filter((f) => disputed.has(f.id)).map((f) => f.label.toLowerCase());
  return {
    ...review.policy,
    requiresRepConfirmation: true,
    reasons: [...review.policy.reasons, `disputed by rep: ${labels.join(", ")}; held until resolved`],
  };
}

/** The moment a coaching card should point at: an open objection first, then the next step, then the first moment. */
export function coachingMoment(review: Review): Moment | undefined {
  const open = review.extraction.objections.map((o, i) => (o.resolved ? undefined : `objection:${i}`)).filter(Boolean);
  return (
    review.moments.find((m) => open.includes(m.fieldId)) ??
    review.moments.find((m) => m.kind === "next_step") ??
    review.moments.find((m) => m.kind !== "outcome" && m.kind !== "reference") ??
    review.moments[0]
  );
}

/** "65%, likely": the one caption under the hero word. */
export function heroCaption(hero: Hero): string {
  return `${hero.percent}%, ${hero.bandLabel.toLowerCase()}`;
}

/** A good example for the playbook: meaningful, booked, and every objection resolved. */
export function isGoodExample(review: Review): boolean {
  const x = review.extraction;
  return x.outcome.value === "meaningful_interaction" && x.nextStep.value === "book" && x.objections.every((o) => o.resolved) && review.validation.ok;
}
