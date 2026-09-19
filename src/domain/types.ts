/**
 * Sales OS domain types.
 * Governing spec: docs/spec/03_DOMAIN_MODEL_AND_EVENTS.md (SOS-03),
 * docs/spec/02_METRIC_CONTRACTS.md (SOS-02), docs/spec/20_UX_AND_VISUAL_METRIC_LANGUAGE.md (SOS-20).
 *
 * Rules baked into these types:
 * - Every business object carries tenant_id.
 * - Money is integer minor units with an ISO currency. Never a float dollar.
 * - Metrics are never bare numbers. See MetricPayload.
 * - Unknown is a valid state everywhere it appears.
 */

export type ISODateTime = string; // UTC, e.g. "2026-09-18T15:03:00Z"
export type Id = string;

// ---------- Money ----------

export interface Money {
  amountMinor: number; // integer, minor units (cents)
  currency: string; // ISO 4217, e.g. "USD"
}

export type RevenueBasis =
  | "reported_revenue" // imported / speaker-reported, basis unknown (SOS-19)
  | "contracted_value" // approved contract / order value
  | "net_collected_cash"; // reconciled eligible cash after refunds and disputes

// ---------- Tenancy, people, roles ----------

export type Role = "setter" | "closer" | "owner" | "manager" | "delivery";

export interface Tenant {
  tenantId: Id;
  name: string;
  timezone: string; // IANA
  reportingCurrency: string;
  maturityHorizonDays: number; // pilot default, policy decision (D08)
}

export interface User {
  tenantId: Id;
  userId: Id;
  displayName: string;
  roles: Role[];
  active: boolean;
  languages: string[];
  /** Demonstrated, audited capabilities. Not self-description. (SOS-07) */
  capabilities: string[];
  /** Self-described communication style, optional, not a proven ability. */
  selfDescribedStyle?: string;
  startedAt: ISODateTime;
}

// ---------- Contacts and intake ----------

export type ConsentState = "granted" | "revoked" | "unknown";

export interface Contact {
  tenantId: Id;
  contactId: Id;
  displayName: string;
  organizationName?: string;
  preferredLanguage?: string;
  preferredChannel?: "phone" | "sms" | "email" | "video";
  consent: Record<"phone" | "sms" | "email", ConsentState>;
}

export type EntryPath = "form_entry" | "booked_entry" | "existing_customer_expansion";

export interface LeadSubmission {
  tenantId: Id;
  submissionId: Id;
  providerEventId: string;
  source: string; // e.g. "meta_lead_form"
  campaign?: string;
  leadTier?: number; // pool definition snapshot at assignment time (SOS-06)
  entryPath: EntryPath;
  receivedAt: ISODateTime;
  requestText: string; // the customer's own words
  contactId: Id;
  /** Duplicate of an earlier submission; does not create a new accountable opportunity. */
  duplicateOfSubmissionId?: Id;
}

// ---------- Opportunity and assignment ----------

export type CommercialStatus = "open" | "won" | "lost" | "nurture" | "dq" | "reactivated";

export interface Opportunity {
  tenantId: Id;
  opportunityId: Id;
  contactIds: Id[];
  primaryContactId: Id;
  offerId: Id;
  workflowVersion: string;
  entryPath: EntryPath;
  source: string;
  leadTier?: number;
  commercialStatus: CommercialStatus;
  accountabilityStartedAt: ISODateTime;
  /** Current responsible owner by role. History lives in Assignment records. */
  currentOwner: Partial<Record<"setter" | "closer", Id>>;
  /** Multi-dimensional state, separate from commercialStatus (SOS-03). */
  contactState: "none" | "attempted" | "voicemail" | "two_way_contact";
  fitState: "unassessed" | "clarify" | "likely" | "unlikely" | "verified";
  contractState: "none" | "proposed" | "signed";
  paymentState: "none" | "authorized" | "partially_collected" | "collected" | "refunded" | "disputed";
  dqReason?: string;
}

export interface Assignment {
  tenantId: Id;
  assignmentId: Id;
  opportunityId: Id;
  role: "setter" | "closer";
  userId: Id;
  policyVersion: string;
  decidedAt: ISODateTime;
  eligibleCandidateIds: Id[];
  exclusions: { userId: Id; reason: string }[];
  selectionProbability?: number;
  explanation: string; // human-readable, e.g. "Assigned to Rep B: English support, three open intake slots..."
  acceptedAt?: ISODateTime;
  endedAt?: ISODateTime;
  /** Steps 6/7 of SOS-06 computed but not applied until policy enables them. */
  shadow?: {
    performanceWeight?: number;
    performanceReason?: string;
    relationalSuggestionUserId?: Id;
    relationalReason?: string;
  };
}

// ---------- Tasks, calls, appointments ----------

export type TaskPriorityReason =
  | { kind: "scheduled_commitment"; dueAt: ISODateTime }
  | { kind: "urgent_customer_reply"; receivedAt: ISODateTime }
  | { kind: "fresh_inquiry"; receivedAt: ISODateTime }
  | { kind: "agreed_follow_up"; dueAt: ISODateTime }
  | { kind: "approved_reattempt"; attempt: number }
  | { kind: "appointment_confirmation_review"; appointmentInstanceId: Id };

export type TaskState =
  | "unassigned"
  | "reserved"
  | "assigned"
  | "accepted"
  | "in_progress"
  | "awaiting_customer"
  | "completed"
  | "escalated"
  | "canceled";

export interface Task {
  tenantId: Id;
  taskId: Id;
  opportunityId: Id;
  ownerUserId?: Id;
  action: "call" | "reply" | "confirm_appointment" | "review_dq" | "send_proposal" | "collect_payment" | "handoff_delivery" | "follow_up";
  priority: TaskPriorityReason;
  dueAt?: ISODateTime;
  state: TaskState;
  idempotencyKey: string;
  leaseHolderUserId?: Id;
  leaseExpiresAt?: ISODateTime;
}

export type CallTransportState = "queued" | "ringing" | "connected" | "ended" | "failed";
export type CallInterpretedOutcome = "no_answer" | "voicemail" | "wrong_contact" | "meaningful_interaction" | "unknown";

export interface Call {
  tenantId: Id;
  callId: Id;
  opportunityId: Id;
  userId: Id;
  direction: "outbound" | "inbound";
  providerCallId?: string;
  transportState: CallTransportState; // provider fact
  startedAt?: ISODateTime;
  endedAt?: ISODateTime;
  durationSeconds?: number;
  /** Interpretation is separate from transport. Proposed by AI or rep, confirmed by rep. */
  interpretedOutcome: CallInterpretedOutcome;
  outcomeConfirmedBy?: "rep" | "policy";
  evidenceRefs: Id[];
}

export type AppointmentInstanceOutcome =
  | "scheduled"
  | "canceled_before_cutoff"
  | "superseded_before_cutoff"
  | "late_canceled"
  | "attended"
  | "customer_no_show"
  | "rep_no_show"
  | "both_absent"
  | "technical_failure"
  | "unknown";

export interface Appointment {
  tenantId: Id;
  appointmentId: Id;
  opportunityId: Id;
  type: "discovery" | "sales" | "follow_up";
  modality: "video" | "phone" | "in_person";
  contactId: Id;
  repUserId: Id;
  timezone: string;
  purpose: string; // in the customer's terms
}

export interface AppointmentInstance {
  tenantId: Id;
  instanceId: Id;
  appointmentId: Id;
  opportunityId: Id;
  scheduledStart: ISODateTime;
  scheduledEnd: ISODateTime;
  supersedesInstanceId?: Id; // reschedule lineage
  confirmedByCustomer: boolean;
  retainedAfterReview: boolean; // source "Calls" = retained bookings (SOS-01)
  outcome: AppointmentInstanceOutcome;
  attendanceEvidenceRefs: Id[];
  attendedDurationSeconds?: number;
  matured: boolean; // past end + grace + provider lag
}

// ---------- Qualification ----------

export type FitValue = "yes" | "no" | "partial" | "unknown";

export interface QualificationAssessment {
  tenantId: Id;
  assessmentId: Id;
  opportunityId: Id;
  policyVersion: string;
  objective: Record<string, { value: FitValue; evidenceRefs: Id[] }>;
  repPerceivedFit: "likely" | "unlikely" | "unsure";
  repReason?: string;
  aiRecommendation?: "proceed" | "clarify" | "decline";
  reviewState: "proposed" | "needs_confirmation" | "confirmed";
  nextQuestion?: string;
  assessedAt: ISODateTime;
  assessedByUserId: Id;
}

// ---------- Communication profile (SOS-07, SOS-08) ----------

export type LensName =
  | "competence_intelligence"
  | "autonomy_control"
  | "safety_certainty"
  | "achievement_growth"
  | "significance_status"
  | "connection_trust"
  | "approval_recognition"
  | "care_contribution"
  | "family_provider"
  | "novelty_opportunity"
  | "efficiency_simplicity"
  | "legacy_durability";

export interface CommunicationProfile {
  tenantId: Id;
  profileId: Id;
  scope: "opportunity_conversation";
  opportunityId: Id;
  preferredLanguage?: { value: string; source: "customer_selected" | "inferred" };
  /** Concrete, plain-language preferences are the primary display. e.g. "prefers numbers first". */
  explicitPreferences: { text: string; evidenceRef: Id }[];
  observedPreferences: { text: string; evidenceRef: Id; confirmed: boolean }[];
  lenses: {
    name: LensName;
    status: "hypothesis" | "confirmed" | "contradicted";
    evidenceRefs: Id[];
    contradictingEvidenceRefs: Id[];
    humanConfirmed: boolean;
  }[];
  lastReviewedAt: ISODateTime;
  reviewDueAt: ISODateTime;
  policyVersion: string;
}

// ---------- Offers, contracts, money ----------

export interface Offer {
  tenantId: Id;
  offerId: Id;
  name: string;
  version: string;
  listPrice: Money;
  approvedOptions: { id: Id; label: string; delta: Money }[];
  discountAuthority: { maxPercent: number; approverRole: Role };
}

export interface Contract {
  tenantId: Id;
  contractId: Id;
  opportunityId: Id;
  offerId: Id;
  offerVersion: string;
  value: Money;
  state: "proposed" | "signed" | "canceled";
  signedAt?: ISODateTime;
}

export type LedgerEntryKind = "payment_collected" | "refund" | "dispute_debit" | "dispute_credit" | "fee";

export interface LedgerEntry {
  tenantId: Id;
  entryId: Id;
  opportunityId?: Id; // undefined -> exception queue (unlinked payment)
  contractId?: Id;
  kind: LedgerEntryKind;
  amount: Money; // positive magnitude; kind determines sign
  providerRef: string;
  idempotencyKey: string;
  occurredAt: ISODateTime;
  receivedAt: ISODateTime;
  commercialCategory: "new_customer" | "expansion" | "recurring" | "referral" | "other";
  /** Excluded from commercial revenue basis (taxes, pass-through). */
  passThrough?: boolean;
}

export interface CommissionPolicy {
  tenantId: Id;
  policyVersion: string;
  effectiveFrom: ISODateTime;
  basis: RevenueBasis;
  ratePercent: number;
  hypothetical: boolean; // true until an actual agreement is supplied (D06)
}

export interface CommissionEntry {
  tenantId: Id;
  entryId: Id;
  userId: Id;
  opportunityId: Id;
  policyVersion: string;
  amount: Money;
  state: "calculated" | "accrued" | "pending_eligibility" | "payable" | "paid" | "disputed" | "adjusted";
}

// ---------- Domain events ----------

export interface DomainEvent<TPayload = Record<string, unknown>> {
  eventId: Id;
  tenantId: Id;
  eventType: string; // e.g. "appointment.attendance_verified"
  schemaVersion: number;
  aggregateType: string;
  aggregateId: Id;
  opportunityId?: Id;
  occurredAt: ISODateTime;
  receivedAt: ISODateTime;
  actorType: "user" | "integration" | "ai" | "policy";
  actorId: Id;
  sourceSystem?: string;
  sourceEventId?: string;
  idempotencyKey: string;
  correlationId?: Id;
  causationId?: Id;
  evidenceRefs: Id[];
  payload: TPayload;
  /** Adjustment events reference the original they correct. */
  supersedesEventId?: Id;
}

// ---------- Metrics (SOS-02) ----------

export type MetricId =
  | "M01" | "M02" | "M03" | "M04" | "M05" | "M06" | "M07" | "M08" | "M09" | "M10"
  | "M11" | "M12" | "M13" | "M14" | "M15" | "M16" | "M17" | "M18" | "M19" | "M20" | "M21";

export type DataState = "complete" | "partial" | "stale" | "unknown" | "insufficient_sample" | "immature" | "no_benchmark";

export type ComparisonStatus = "descriptive_only" | "benchmarked" | "provisional";

export interface MetricPayload {
  metricId: MetricId;
  definitionVersion: string;
  label: string;
  /** null when denominator is zero ("N/A"), or when not computable. */
  value: number | null;
  numerator: number;
  denominator: number;
  unknownCount: number;
  unit: "ratio" | "count" | "money_minor" | "seconds" | "ratio_money_per_unit";
  currency?: string;
  basis?: RevenueBasis;
  cohortId: string;
  timeBasis: string;
  asOf: ISODateTime;
  comparisonStatus: ComparisonStatus;
  benchmarkId: string | null;
  dataState: DataState;
  evidenceQueryId: string;
  /** For attendance with unknowns: lower and upper bounds (SOS-02). */
  bounds?: { lower: number; upper: number };
  /** Non-empty when the ratio was refused (e.g. numerator not a subset of denominator). */
  refusalReason?: string;
}

// ---------- Performance state / glow (SOS-20) ----------

export type PerformanceState =
  | "strong"
  | "attention"
  | "material_issue"
  | "neutral_no_benchmark"
  | "provisional_small_sample"
  | "data_state"; // unknown / stale / incomplete

export interface Benchmark {
  benchmarkId: string;
  metricId: MetricId;
  /** "higher" | "lower" | "contextual". Contextual (e.g. DQ) never colors. */
  favorableDirection: "higher" | "lower" | "contextual";
  target: number; // ratio or value
  attentionBand: number; // width below/above target that is amber rather than red
  minDenominator: number;
  label: string;
  /** Company policy or pilot hypothesis, never "industry benchmark" (SOS-20). */
  origin: "company_policy" | "pilot_hypothesis" | "experiment";
}

export interface PerformanceVerdict {
  state: PerformanceState;
  label: string; // text equivalent, never color-only
  explanation: string;
  benchmark?: Benchmark;
}

// ---------- Funnel (SOS-20) ----------

export interface FunnelStage {
  stageId: string;
  label: string;
  count: number;
  unknownCount?: number;
  /** The stage whose population this stage is a subset of. Connector rate allowed only when it matches the previous card. */
  parentStageId?: string;
  metricId?: MetricId;
  dataState: DataState;
  cohortLabel: string;
  /** Text shown under the count, e.g. "71 attended / 85 retained bookings". */
  supportingText?: string;
  /** Money stages (e.g. net collected cash) carry the amount and its labeled basis. */
  money?: Money;
  basis?: RevenueBasis;
}

export interface FunnelConnector {
  fromStageId: string;
  toStageId: string;
  metric: MetricPayload | null; // null when the ratio is invalid; render split path instead
  verdict: PerformanceVerdict;
}

// ---------- Coaching (SOS-16) ----------

export type CoachingOwner = "rep" | "marketing" | "sales_ops" | "product" | "finance" | "delivery";

export interface CoachingScenario {
  assumptions: string[];
  additionalUnits: number; // e.g. additional attended appointments
  modeledCash: Money;
  modeledCommission?: Money;
  commissionBasisHypothetical: boolean;
  capacityCapApplied: boolean;
  disclaimer: "Not a forecast";
}

export interface CoachingRecommendation {
  tenantId: Id;
  recommendationId: Id;
  ownerRole: CoachingOwner;
  ownerUserId?: Id;
  title: string;
  issue: string; // observation
  metricIds: MetricId[];
  cohortId: string;
  dataState: DataState;
  observed: string; // "70 of 140 retained appointments attended"
  comparator: string;
  alternativeExplanations: string[];
  evidenceRefs: Id[];
  action: string; // controllable, specific
  playbookVersion?: string;
  effort: string;
  scenario?: CoachingScenario;
  guardrails: string[];
  reviewAt: ISODateTime;
  state: "proposed" | "accepted" | "in_practice" | "evaluated" | "adopted" | "rejected" | "inconclusive";
  suppressed?: { reason: string }; // when data is stale/unreconciled, the action is "fix the data"
  provenance: { engine: "rules" | "llm"; version: string };
}

// ---------- Leaderboard (SOS-14) ----------

export type LeaderboardView = "economic_output" | "comparable_performance" | "personal_progress";

export interface LeaderboardRow {
  userId: Id;
  displayName: string;
  role: Role;
  cohortId: string;
  leadTier?: number;
  rank: number | null; // null when provisional
  provisional: boolean;
  provisionalReason?: string;
  assignedOpportunities: number;
  maturedSample: number;
  revenuePerLead: MetricPayload;
  totalRevenue: Money;
  basis: RevenueBasis;
  attendedAppointments: number;
  wins: number;
  refundCount: number;
  movementReason?: string;
  priorPeriodRevenuePerLead?: number | null;
}

// ---------- Gamification (SOS-15) ----------

export interface Mission {
  missionId: Id;
  userId: Id;
  title: string;
  linkedMetricId: MetricId;
  evidenceRule: string; // what proves completion, not a checkbox
  target: number;
  progress: number;
  kind: "personal_mastery" | "commercial_result" | "team_contribution";
  state: "active" | "completed" | "paused";
}

export interface SkillPath {
  pathId: Id;
  name: string;
  steps: { id: Id; label: string; done: boolean }[];
}

export interface Season {
  seasonId: Id;
  label: string;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
}

// ---------- Owner analytics (SOS-21) ----------

export interface DataIncident {
  incidentId: Id;
  severity: "info" | "warning" | "critical";
  title: string;
  affected: string; // which decisions this touches
  owner: CoachingOwner;
  openedAt: ISODateTime;
}

export interface BottleneckCard {
  cardId: Id;
  stageId: string;
  cohortId: string;
  observed: string;
  comparator: string;
  dataState: DataState;
  responsibleFunction: CoachingOwner;
  candidateExplanations: string[];
  proposedInvestigation: string;
  scenario?: CoachingScenario;
  verdict: PerformanceVerdict;
}
