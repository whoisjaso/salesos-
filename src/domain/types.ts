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
  /**
   * Money state of the opportunity. "authorized" and "processing" are not
   * collected: a payment can finish checkout before it succeeds, so a customer
   * saying "I paid" while the provider is still working renders as Processing
   * and never as Collected (SOS-V2 5 step 5, scenario 2).
   */
  paymentState:
    | "none"
    | "authorized"
    | "processing"
    | "partially_collected"
    | "collected"
    | "refunded"
    | "disputed";
  dqReason?: string;
  /** The setter-closer pair that carried this opportunity from setter to closer. Set at handoff acceptance (SOS-06). */
  pairId?: Id;
}

/**
 * A setter-closer pair (SOS-06, SOS-07). Pairs are relational: the two people
 * share the opportunities that pass through the handoff, so their funnels
 * converge and gaps can be located by side and stage, never by person.
 */
export interface Pair {
  tenantId: Id;
  pairId: Id;
  setterUserId: Id;
  closerUserId: Id;
  /** Who chose the pairing. Closers choose setters, setters choose closers, or the owner assigns. */
  chosenBy: "closer" | "setter" | "owner";
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  active: boolean;
  note?: string;
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

/**
 * The nine money concepts of the payments specification, section 7, kept
 * distinct so that none can be mistaken for another. Read the list as four
 * groups.
 *
 * Before any money moves:
 *   1. price_discussed     A price came up in a conversation. Evidence of talk,
 *                          never of cash. A transcript may produce this and
 *                          nothing further down this list.
 *   2. contracted_value    An approved agreement has a value. A discount reduces
 *                          this figure; it never reduces collected cash.
 *
 * The payment itself:
 *   3. payment_authorized  The buyer authorized a charge. No cash has moved.
 *      payment_processing  The provider has the payment in flight. A checkout
 *                          redirect, a delayed payment method, and a pending
 *                          state all land here, never on payment_collected.
 *   4. payment_collected   The provider's confirmed successful state. This is
 *                          the only positive cash kind.
 *
 * Adjustments to a collected payment, each recorded once and never by deleting
 * the original:
 *      refund              Confirmed money returned to the buyer.
 *      dispute_opened      Money at risk. No realized debit. Not a loss yet.
 *      dispute_debit       A LOST dispute: the realized debit, exactly once.
 *      dispute_credit      A realized debit returned to the balance.
 *      dispute_closed_won  The risk cleared with no money movement at all.
 *      fee                 Processing cost. Excluded from net collected cash and
 *                          reported separately, never silently netted.
 *
 * Where the money sits, and what the business owes its people:
 *   5. processor_balance_credit  Funds available in the merchant's processor
 *                                balance. Not yet in the bank.
 *   6. payout_to_bank            Funds actually paid out to the bank.
 *   7. commission_accrued        Commission accrued under the employer's policy.
 *   8. commission_payable        Commission that has become payable.
 *   9. commission_paid           Commission actually paid to the representative.
 *
 * Only payment_collected, refund, dispute_debit and dispute_credit move net
 * collected cash. Every other kind is a genuine record that is reported on its
 * own terms. See NET_COLLECTED_CASH_POLICY and ledgerSign in events.ts.
 */
export type LedgerEntryKind =
  | "price_discussed"
  | "contracted_value"
  | "payment_authorized"
  | "payment_processing"
  | "payment_collected"
  | "refund"
  | "dispute_opened"
  | "dispute_debit"
  | "dispute_credit"
  | "dispute_closed_won"
  | "fee"
  | "processor_balance_credit"
  | "payout_to_bank"
  | "commission_accrued"
  | "commission_payable"
  | "commission_paid";

/**
 * How a monetary movement is known. The class travels with the movement so that
 * a downstream reader never has to guess, and so that a cheap signal can never
 * stand in for an expensive fact.
 *
 * - processor_confirmed   The payment processor confirmed the movement in its
 *                         own authoritative state, retrieved or verified
 *                         server-side. The only class that net collected cash
 *                         counts.
 * - provider_reported     A connected platform reported the movement but is not
 *                         the processor of record (a commerce platform's view of
 *                         an underlying charge, a restaurant check closed in a
 *                         point-of-sale). Genuine, not processor-confirmed.
 * - manually_marked_paid  An invoice marked paid outside the processor, a
 *                         zero-balance invoice, a credit applied. Real bookkeeping,
 *                         no new cash (scenarios 16 and 60).
 * - externally_recorded   Wire, check or cash recorded by a human with its own
 *                         independent confirmation. Real money, unverifiable here.
 * - imported_record       A spreadsheet or CRM import. A deal marked won in a CRM
 *                         is a status, not evidence that money moved.
 */
export type EvidenceClass =
  | "processor_confirmed"
  | "provider_reported"
  | "manually_marked_paid"
  | "externally_recorded"
  | "imported_record";

/**
 * Live or test. A test-environment movement is real data about a delivery and no
 * data at all about a customer: it changes no standing, no commission and no XP
 * (scenarios 13 and 62).
 */
export type ProviderEnvironment = "live" | "test";

export interface LedgerEntry {
  tenantId: Id;
  entryId: Id;
  opportunityId?: Id; // undefined -> exception queue (unlinked payment)
  contractId?: Id;
  /** The order this movement pays down, when one was bound before payment. */
  orderId?: Id;
  /** The frozen credit this movement pays into. Never recomputed from today's owner. */
  attributionSnapshotId?: Id;
  kind: LedgerEntryKind;
  amount: Money; // positive magnitude; kind determines sign
  providerRef: string;
  idempotencyKey: string;
  occurredAt: ISODateTime;
  receivedAt: ISODateTime;
  commercialCategory: "new_customer" | "expansion" | "recurring" | "referral" | "other";
  /** Excluded from commercial revenue basis (taxes, pass-through). */
  passThrough?: boolean;
  /**
   * How this movement is known. Optional only so that records written before the
   * class existed still typecheck; every new writer must set it, the database
   * column is NOT NULL, and an unset value resolves through the single named
   * constant UNCLASSIFIED_EVIDENCE_FALLBACK.
   */
  evidence?: EvidenceClass;
  /** The provider that reported the movement, e.g. "stripe". Part of its identity. */
  provider?: string;
  /** The merchant account inside that provider. An id alone is not a global namespace. */
  providerAccountId?: string;
  /** Live or test. Unset resolves through UNCLASSIFIED_ENVIRONMENT_FALLBACK. */
  environment?: ProviderEnvironment;
  /**
   * The provider's own identifier for the ECONOMIC MOVEMENT, not for the
   * delivery that carried it. A checkout event, a payment-intent event and an
   * invoice event describing one payment share this value and post once.
   */
  providerMovementId?: string;
}

export interface CommissionPolicy {
  tenantId: Id;
  policyVersion: string;
  effectiveFrom: ISODateTime;
  basis: RevenueBasis;
  ratePercent: number;
  hypothetical: boolean; // true until an actual agreement is supplied (D06)
  /** Role this rate applies to. Undefined applies to every role. Setters and closers sit in different brackets. */
  role?: "setter" | "closer";
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

// ---------- Owner policy defaults (PROPOSED, not ratified) ----------

/**
 * The payments specification leaves several decisions to the business owner.
 * None of them is ratified. Each one is expressed here once, as a named value
 * that is trivial to change, so that no call site hard-codes a policy the owner
 * has not approved. Record any change in
 * docs/spec/28_TRACEABILITY_AND_OPEN_DECISIONS.md (AGENTS.md rule 2).
 */

/** Where sale-level credit is captured, and where it is sealed. */
export type AttributionFreezePoint =
  /** Identities are captured here. This is the repository's existing pairId behaviour. */
  | "handoff_accepted"
  /** Identities are SEALED here, into an immutable snapshot. Proposed default. */
  | "order_issued_for_payment"
  /** An authorized, reasoned correction after the seal. Append-only, never an edit. */
  | "authorized_correction";

export const ATTRIBUTION_FREEZE_POLICY = {
  /** Proposed default, pending owner ratification. */
  ratified: false,
  capturedAt: "handoff_accepted" as AttributionFreezePoint,
  sealedAt: "order_issued_for_payment" as AttributionFreezePoint,
  /** After the seal, credit changes only through an appended authorized correction. */
  correctionsAreAppendOnly: true,
} as const;

/**
 * The written net-collected-cash contract (specification section 7).
 * Anything this policy excludes stays a genuine record and is reported on its
 * own terms. Nothing is silently summed into a sales metric.
 */
export const NET_COLLECTED_CASH_POLICY = {
  ratified: false,
  /** Only processor-confirmed movements are cash. */
  countedEvidence: ["processor_confirmed"] as readonly EvidenceClass[],
  /** Test-environment movements are excluded from every live figure. */
  countedEnvironment: "live" as ProviderEnvironment,
  /** A discount reduces the order's contracted value. It never reduces collected cash. */
  discountsReduceContractedValue: true,
  /** Processing fees are excluded from the metric and reported separately. */
  processingFeesExcludedAndReportedSeparately: true,
  /** An opened dispute is an at-risk figure. It produces no realized debit. */
  openDisputeIsAtRiskOnly: true,
  /** A lost dispute debits exactly once. */
  lostDisputeDebitsOnce: true,
  /** Tax and other pass-through amounts stay out of the commercial basis (SOS-02). */
  passThroughExcluded: true,
  /** Different currencies are never summed. money.ts throws instead of guessing a rate. */
  crossCurrencySum: "refuse" as const,
  /**
   * A refund that lands after a period closes restates the period it belongs to
   * and is disclosed. It is never applied silently to the open period.
   */
  lateAdjustment: "restate_the_period_and_disclose" as const,
} as const;

/**
 * Commission rates as this repository already recorded them: hypothetical,
 * pending D06. The specification's worked example uses different numbers and is
 * labelled "assumptions for this example only"; it must never overwrite this.
 */
export const COMMISSION_RATE_DEFAULTS = {
  ratified: false,
  hypothetical: true,
  setterPercent: 5,
  closerPercent: 10,
  source: "docs/spec/28_TRACEABILITY_AND_OPEN_DECISIONS.md D06 (open)",
  note: "The V2 worked example's 10 percent closer and 2 percent setter are example assumptions, not a decision.",
} as const;

/** Historical import window offered at connection time. Owner-overridable. */
export const HISTORICAL_IMPORT_DEFAULT_WINDOW_DAYS = 90;

/**
 * A second workspace connecting a merchant that is already bound elsewhere is
 * REJECTED with an explicit reason. Never resolved by matching an email address.
 */
export const MERCHANT_BINDING_CONFLICT_POLICY = {
  ratified: false,
  onAlreadyBoundMerchant: "reject_with_reason" as const,
  resolveByEmailMatch: false,
  reason:
    "This merchant account is already connected to another workspace. Sharing one merchant across workspaces needs an explicit allocation policy, not an email match.",
} as const;

// ---------- Orders, attribution, and payment requests (spec 15.3) ----------

export type OrderState =
  | "draft"
  | "approved"
  /** The attribution seal point. From here the credited identities are immutable. */
  | "issued_for_payment"
  | "fulfilled"
  | "canceled";

export type InstallmentState = "scheduled" | "requested" | "collected" | "failed" | "canceled";

/** One scheduled part of an order. Four installments of one agreement stay one order. */
export interface OrderInstallment {
  installmentId: Id;
  /** 1-based position in the schedule. */
  sequence: number;
  dueAt: ISODateTime;
  amount: Money;
  state: InstallmentState;
  /** The request sent for this installment, when one exists. */
  paymentRequestId?: Id;
}

/**
 * The specific purchased agreement. The person and company are identity records,
 * the opportunity is the sales effort, and the order is what was bought. One
 * contact can hold several orders; a later upsell is a new order with its own
 * attribution snapshot, never an extension of the first closer's credit.
 */
export interface Order {
  tenantId: Id;
  orderId: Id;
  opportunityId: Id;
  offerId: Id;
  offerVersion: string;
  contractId?: Id;
  /**
   * The approved value of the agreement. A discount reduces this figure and
   * nothing else: collected cash is whatever the processor confirms.
   */
  contractedValue: Money;
  discount?: {
    amount: Money;
    reason: string;
    /** Discount authority is the offer's, not the sender's. */
    approvedByUserId: Id;
  };
  installments: OrderInstallment[];
  state: OrderState;
  /** Set once, when the order is issued for payment. The attribution seal point. */
  issuedForPaymentAt?: ISODateTime;
  /** The snapshot sealed at issue. Absent until the order is issued. */
  attributionSnapshotId?: Id;
  createdAt: ISODateTime;
  createdByUserId: Id;
}

/** One appended, authorized change to a sealed snapshot. The original is never rewritten. */
export interface AttributionCorrection {
  correctionId: Id;
  at: ISODateTime;
  /** Who authorized it. A representative may never correct their own credit. */
  authorizedByUserId: Id;
  authorizerRole: Role;
  /** The predetermined exception rule applied, e.g. "split_credit", "manager_reassignment". */
  rule: string;
  reason: string;
  /** The values as they stood before this correction. Copied, never referenced. */
  previous: { setterUserId?: Id; closerUserId?: Id; pairId?: Id };
  /** The values this correction establishes. */
  next: { setterUserId?: Id; closerUserId?: Id; pairId?: Id };
  evidenceRefs: Id[];
}

/**
 * Frozen sale-level credit. Money reads point here, never at
 * Opportunity.currentOwner, so reassigning a contact tomorrow cannot move
 * yesterday's commission. Identities come from authenticated assignments and
 * accepted handoffs: sending the payment link is not proof of being the closer.
 */
export interface AttributionSnapshot {
  tenantId: Id;
  snapshotId: Id;
  orderId: Id;
  opportunityId: Id;
  /** The credited setter at the seal point. Absent means genuinely unallocated. */
  setterUserId?: Id;
  /** The credited closer at the seal point. */
  closerUserId?: Id;
  /** The pair that carried the opportunity, captured at handoff acceptance. */
  pairId?: Id;
  /** The commission policy version in force when the snapshot was sealed. */
  commissionPolicyVersion: string;
  freezePoint: AttributionFreezePoint;
  frozenAt: ISODateTime;
  /**
   * Append-only. An authorized correction is added; nothing in the sealed record
   * above is ever edited in place.
   */
  corrections: AttributionCorrection[];
  /**
   * True when no representative could be established from evidence. The
   * collection is still genuine; the credit stays unallocated until policy or
   * evidence resolves it.
   */
  unallocated?: boolean;
}

export type PaymentRequestState =
  | "draft"
  | "requested"
  | "sent"
  | "paid"
  | "failed"
  | "canceled"
  /** The outcome could not be established. Blocks retry; never assumed to be a failure. */
  | "unresolved";

/**
 * An order-linked checkout or invoice created on the merchant's own provider
 * account. Level B capability: creating one requires a separately granted
 * collection permission, and it is never unlimited charging authority.
 */
export interface PaymentRequest {
  tenantId: Id;
  paymentRequestId: Id;
  orderId: Id;
  opportunityId: Id;
  installmentId?: Id;
  /** Bound before the request is sent, so credit exists before money arrives. */
  attributionSnapshotId: Id;
  amount: Money;
  provider: string;
  providerAccountId: string;
  environment: ProviderEnvironment;
  /** The provider's object id once it exists, e.g. a checkout session or invoice. */
  providerObjectId?: string;
  /**
   * The key sent to the provider, so a retry after an uncertain timeout resolves
   * the original request instead of issuing a second one.
   */
  idempotencyKey: string;
  state: PaymentRequestState;
  /**
   * Who pressed send. An operations employee may send on a closer's behalf; this
   * field never determines credit (scenario 8).
   */
  requestedByUserId: Id;
  requestedAt: ISODateTime;
  sentAt?: ISODateTime;
  lastOutcome?: { kind: "succeeded" | "failed" | "unresolved"; reason: string; at: ISODateTime };
}

// ---------- Provider connection, links, sync, exceptions (spec 15.2, 15.3) ----------

/**
 * How a connection was authorized. These are distinct mechanisms with different
 * token lifecycles and account boundaries; one provider's flow is never copied
 * into another's.
 */
export type AuthorizationMethod =
  | "oauth_authorization_code"
  | "app_installation"
  | "partner_enablement_client_credentials"
  | "assisted_restricted_key"
  | "none";

/**
 * The proven state of one capability. There is deliberately no "available"
 * value: a capability is verified by evidence or it is not claimed.
 * - verified             Proven against the actual grant in this environment.
 * - pending_verification Requested and not yet proven. Not a promise.
 * - not_requested        Never asked for.
 * - not_authorized       Asked for and refused, or revoked.
 * - requires_setup       The provider supports it but setup is incomplete.
 * - unsupported          The provider does not offer it. Never fake a success.
 */
export type CapabilityState =
  | "verified"
  | "pending_verification"
  | "not_requested"
  | "not_authorized"
  | "requires_setup"
  | "unsupported";

/** How far the integration itself has actually been built and proven. */
export type ImplementationState =
  | "absent"
  | "sandbox_only"
  | "blocked_by_provider_access"
  | "awaiting_publication"
  | "live";

/**
 * Persisted proof of what a connection can do, modelled on specification 15.2.
 * Capabilities are displayed from evidence, never from the presence of a
 * provider logo. Observation is separate from collection throughout.
 */
export interface CapabilityContract {
  authorizationMethod: AuthorizationMethod;
  /** Level A: track payments. */
  observation: {
    paymentReads: CapabilityState;
    historicalImport: CapabilityState;
    signedEventDelivery: CapabilityState;
    refundReads: CapabilityState;
    disputeReads: CapabilityState;
    payoutReads: CapabilityState;
  };
  /** Level B: send payment requests. A separate, separately authorized level. */
  collection: {
    createPaymentRequest: CapabilityState;
    updateSubscription: CapabilityState;
    issueRefund: CapabilityState;
  };
  implementationState: ImplementationState;
  /** API version this contract was proven against. A method name is not a proof. */
  apiVersion?: string;
  verifiedAt?: ISODateTime;
}

export type ConnectionAuthorizationState =
  | "none"
  | "pending"
  | "granted"
  | "revoked"
  | "reconnect_required";

/**
 * The persisted Connection record of specification 15.3.
 *
 * Named ProviderConnectionRecord, not ProviderConnection, because
 * src/domain/integrations.ts already exports an in-memory ProviderConnection
 * through the same barrel. That one is a screen's connection state; this one is
 * the durable record. Folding them together belongs to the adapter work.
 */
export interface ProviderConnectionRecord {
  tenantId: Id;
  connectionId: Id;
  provider: string;
  authorizationMethod: AuthorizationMethod;
  /** The bound merchant account. Reads and writes are always scoped by it. */
  providerAccountId: string;
  accountLabel?: string;
  environment: ProviderEnvironment;
  /** Reference to a secret in the vault. Never the secret itself. */
  secretRef?: string;
  /** What was asked for. */
  requestedScopes: string[];
  /** What the provider actually granted. Recorded separately, never assumed equal. */
  grantedScopes: string[];
  capabilities: CapabilityContract;
  /** The person whose authority backs this grant. A grant can be person-dependent. */
  authorizedByUserId: Id;
  authorizationState: ConnectionAuthorizationState;
  grantedAt?: ISODateTime;
  expiresAt?: ISODateTime;
  lastVerifiedAt?: ISODateTime;
  revokedAt?: ISODateTime;
  /** Set when this merchant is already bound elsewhere. See MERCHANT_BINDING_CONFLICT_POLICY. */
  bindingConflict?: { reason: string; boundTenantId?: Id };
}

export type ProviderObjectType =
  | "payment"
  | "refund"
  | "dispute"
  | "payout"
  | "invoice"
  | "checkout_session"
  | "subscription"
  | "customer"
  | "other";

/**
 * An account-scoped and environment-scoped external object id connected to an
 * internal identity. Prefer linking before payment over matching after payment.
 */
export interface ProviderObjectLink {
  tenantId: Id;
  linkId: Id;
  provider: string;
  providerAccountId: string;
  environment: ProviderEnvironment;
  providerObjectType: ProviderObjectType;
  providerObjectId: string;
  internal: {
    kind: "order" | "opportunity" | "payment_request" | "contact" | "ledger_entry";
    id: Id;
  };
  /**
   * How the link was established, in the preferred order of specification 17.1.
   * A candidate is never used to finalize commission-bearing attribution on its own.
   */
  confidence: "authoritative_reference" | "confirmed_mapping" | "candidate";
  linkedAt: ISODateTime;
  /** Set when a person confirmed an ambiguous match. */
  confirmedByUserId?: Id;
  note?: string;
}

export type SyncResource = "payments" | "refunds" | "disputes" | "payouts" | "subscriptions";

/**
 * Resumable coverage for one resource on one connection. Coverage that actually
 * loaded is recorded, so a partial history is disclosed at the metric instead of
 * being presented as complete (scenario 59).
 */
export interface SyncCheckpoint {
  tenantId: Id;
  checkpointId: Id;
  connectionId: Id;
  provider: string;
  providerAccountId: string;
  environment: ProviderEnvironment;
  resource: SyncResource;
  /** Provider pagination cursor. Opaque. */
  cursor?: string;
  /** The window the owner asked for. */
  requestedWindowDays: number;
  /** The window actually covered so far. */
  coverageStart?: ISODateTime;
  coverageEnd?: ISODateTime;
  lastSuccessAt?: ISODateTime;
  /** Most recent authenticated event for this resource, for freshness disclosure. */
  eventFreshnessAt?: ISODateTime;
  state: "never_run" | "importing" | "reconciling" | "current" | "limited" | "failed";
  /** Plain words for the owner when the state is limited or failed. */
  limitation?: string;
}

export type PaymentExceptionKind =
  | "unlinked_payment"
  | "ambiguous_order_match"
  | "unbound_account"
  | "amount_mismatch"
  | "unresolved_payment_request"
  | "duplicate_movement_candidate"
  | "coverage_gap"
  | "unclassified_evidence";

/**
 * A persisted, assignable exception. The scoped-incident model computes what a
 * reader may do with a figure; this record is the operations work item behind
 * it, with an owner and a resolution history. One record needing reconciliation
 * never pauses unrelated selling.
 */
export interface PaymentException {
  tenantId: Id;
  exceptionId: Id;
  kind: PaymentExceptionKind;
  severity: "info" | "warning" | "critical";
  title: string;
  /** Only these surfaces are affected. Everything else keeps running. */
  affectedSurfaces: AffectedSurface[];
  subjects: IncidentSubjects;
  /** The operations owner. Unassigned is a state, not a blank. */
  assignedToUserId?: Id;
  ownerRole: IncidentOwnerRole;
  reason: string;
  openedAt: ISODateTime;
  state: "open" | "resolved" | "wont_fix";
  resolution?: { at: ISODateTime; byUserId: Id; action: string; note: string };
  /** Append-only history. Earlier entries are never rewritten. */
  history: { at: ISODateTime; byUserId?: Id; action: string; note: string }[];
  evidenceRefs: Id[];
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
  /**
   * The provider account the delivery came from. Persisted on the envelope, not
   * only inside the idempotency key: an external id alone is not a global
   * namespace (specification 15.4).
   */
  sourceAccountId?: string;
  sourceEventId?: string;
  /** Live or test. A test delivery validates delivery and nothing else. */
  environment?: ProviderEnvironment;
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
  /** The surfaces this recommendation's evidence depends on. Empty means nothing can hold it. */
  dependsOn?: AffectedSurface[];
  /** Set when an incident makes this recommendation's evidence unreliable. */
  held?: CoachingHold;
  /** The recommendation stands, but its numbers can move when an incident resolves. */
  provisional?: boolean;
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
  /**
   * Whether the revenue figure is an established amount, an established zero, or
   * not available at all. "$0 collected" and "payment data not available" are
   * different facts and must not render alike.
   */
  revenueState?: "amount" | "verified_zero" | "unavailable";
  /** The amount is shown but can move when an incident resolves. */
  revenueProvisional?: boolean;
  /** "at_least" when attendance evidence is unresolved for this row's appointments. */
  attendedState?: "verified" | "at_least";
  unresolvedAttendanceCount?: number;
  /** Surfaces held for this row, with the incidents behind them in `heldStatement`. */
  heldSurfaces?: AffectedSurface[];
  heldStatement?: string;
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
  /** The business owner, when it is the owner rather than a function. Takes precedence over `owner`. */
  ownerRole?: IncidentOwnerRole;
  /** Optional declared scope. When absent the incident holds nothing on its own (see AffectedSurface). */
  kind?: DataIncidentKind;
  surfaces?: AffectedSurface[];
  /** One sentence: what is held, and what keeps running. */
  effect?: string;
  /** What has to happen for the hold to lift. */
  waitingOn?: string;
  subjects?: IncidentSubjects;
}

// ---------- Incident scope (D: "A held measurement never holds the person") ----------

/**
 * The surfaces a data incident can make unreliable. Nothing outside this list is
 * affected by an incident: XP, levels, streaks, calling, appointments, and
 * conversation-based coaching keep running while a measurement is held.
 */
export type AffectedSurface =
  | "revenue_attribution"
  | "commission"
  | "standings"
  | "attendance_outcome"
  | "contact_permission"
  | "communication_read";

export type DataIncidentKind =
  | "unlinked_payment"
  | "unresolved_attendance"
  | "stale_sync"
  | "missing_consent_record"
  | "contact_restriction"
  | "refund_under_review"
  | "unreviewed_communication"
  | "declared";

/** Who resolves an incident. Sales ops, the owner, the rep, or another function. */
export type IncidentOwnerRole = CoachingOwner | "owner";

/**
 * What a reader may do with a figure on a surface.
 * - reliable: no incident touches it.
 * - provisional: show the figure, say it can move, name what it waits on.
 * - withheld: do not produce the figure at all (a rank, a permitted action).
 */
export type SurfaceDisposition = "reliable" | "provisional" | "withheld";

/** The specific records an incident covers. Never the whole tenant unless it really is. */
export interface IncidentSubjects {
  opportunityIds?: Id[];
  userIds?: Id[];
  appointmentInstanceIds?: Id[];
  ledgerEntryIds?: Id[];
  contactIds?: Id[];
  callIds?: Id[];
}

export interface ScopedIncident {
  incidentId: Id;
  kind: DataIncidentKind;
  severity: "info" | "warning" | "critical";
  title: string;
  /** The only surfaces this incident makes unreliable. */
  surfaces: AffectedSurface[];
  owner: IncidentOwnerRole;
  /** Display form, e.g. "Sales ops". */
  ownerLabel: string;
  /** One sentence in plain words: the limited effect. */
  effect: string;
  /** What has to happen for the hold to lift. */
  waitingOn: string;
  openedAt: ISODateTime;
  subjects: IncidentSubjects;
  evidenceRefs: Id[];
  /** How many records this incident covers. */
  count: number;
}

/** A recommendation waiting on an incident says what it waits on and who owns it. */
export interface CoachingHold {
  surface?: AffectedSurface;
  incidentIds: Id[];
  waitingOn: string;
  owner: IncidentOwnerRole;
  ownerLabel: string;
  /** One sentence of the limited effect, ready to render. */
  statement: string;
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
