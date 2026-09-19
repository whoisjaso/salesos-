/**
 * Supabase (Postgres) Repository adapter.
 * Schema: supabase/migrations/20260918000000_sales_os_core.sql
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL          project URL
 *   SUPABASE_SERVICE_ROLE_KEY         server-only key (preferred; bypasses RLS, so this
 *                                     adapter filters every statement by tenant_id itself)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY     fallback; subject to RLS
 *
 * Tenant setting mechanism: the migration defines `set_tenant(p_tenant_id)` (SECURITY
 * DEFINER, calls set_config('app.tenant_id', ..., false)) and every RLS policy keys on
 * current_setting('app.tenant_id', true). Over the PostgREST HTTP API each request is its
 * own transaction, so a setting made by one RPC does not survive to the next request.
 * Therefore:
 *   1. `setTenant()` is exposed for callers that hold a real session (direct Postgres
 *      connection, session-mode pooler, or a single RPC that does its own work).
 *   2. Every query in this adapter filters by tenant_id explicitly. Tenant isolation is
 *      enforced server-side in this module regardless of which key is used (SOS-22).
 *   3. Lease compare-and-set runs inside the database (`reserve_task` / `release_task`
 *      functions) so it is atomic even over HTTP.
 *
 * Never import this module in browser code with the service role key.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Appointment,
  AppointmentInstance,
  Assignment,
  Call,
  CommissionEntry,
  CommissionPolicy,
  CommunicationProfile,
  Contact,
  Contract,
  DomainEvent,
  Id,
  ISODateTime,
  LeadSubmission,
  LedgerEntry,
  Money,
  Opportunity,
  QualificationAssessment,
  Task,
  Tenant,
  User,
} from "@/domain/types";
import type {
  DatasetLike,
  EventFilter,
  LedgerFilter,
  OpportunityFilter,
  ProviderEvent,
  Repository,
  TimeWindow,
  WriteResult,
} from "./repository";

// ---------------------------------------------------------------------------
// Row types (snake_case, as stored)
// ---------------------------------------------------------------------------

interface TenantRow {
  tenant_id: string;
  name: string;
  timezone: string;
  reporting_currency: string;
  maturity_horizon_days: number;
}

interface UserRow {
  tenant_id: string;
  user_id: string;
  display_name: string;
  roles: User["roles"];
  active: boolean;
  languages: string[];
  capabilities: string[];
  self_described_style: string | null;
  started_at: string;
}

interface ContactRow {
  tenant_id: string;
  contact_id: string;
  display_name: string;
  organization_name: string | null;
  preferred_language: string | null;
  preferred_channel: Contact["preferredChannel"] | null;
  consent: Contact["consent"];
}

interface LeadSubmissionRow {
  tenant_id: string;
  submission_id: string;
  provider_event_id: string;
  source: string;
  campaign: string | null;
  lead_tier: number | null;
  entry_path: LeadSubmission["entryPath"];
  received_at: string;
  request_text: string;
  contact_id: string;
  duplicate_of_submission_id: string | null;
}

interface OpportunityRow {
  tenant_id: string;
  opportunity_id: string;
  contact_ids: string[];
  primary_contact_id: string;
  offer_id: string;
  workflow_version: string;
  entry_path: Opportunity["entryPath"];
  source: string;
  lead_tier: number | null;
  commercial_status: Opportunity["commercialStatus"];
  accountability_started_at: string;
  current_owner: Opportunity["currentOwner"];
  contact_state: Opportunity["contactState"];
  fit_state: Opportunity["fitState"];
  contract_state: Opportunity["contractState"];
  payment_state: Opportunity["paymentState"];
  dq_reason: string | null;
}

interface AssignmentRow {
  tenant_id: string;
  assignment_id: string;
  opportunity_id: string;
  role: Assignment["role"];
  user_id: string;
  policy_version: string;
  decided_at: string;
  eligible_candidate_ids: string[];
  exclusions: Assignment["exclusions"];
  selection_probability: number | null;
  explanation: string;
  accepted_at: string | null;
  ended_at: string | null;
  shadow: Assignment["shadow"] | null;
}

interface TaskRow {
  tenant_id: string;
  task_id: string;
  opportunity_id: string;
  owner_user_id: string | null;
  action: Task["action"];
  priority: Task["priority"];
  due_at: string | null;
  state: Task["state"];
  idempotency_key: string;
  lease_holder_user_id: string | null;
  lease_expires_at: string | null;
}

interface CallRow {
  tenant_id: string;
  call_id: string;
  opportunity_id: string;
  user_id: string;
  direction: Call["direction"];
  provider_call_id: string | null;
  transport_state: Call["transportState"];
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  interpreted_outcome: Call["interpretedOutcome"];
  outcome_confirmed_by: Call["outcomeConfirmedBy"] | null;
  evidence_refs: string[];
}

interface AppointmentRow {
  tenant_id: string;
  appointment_id: string;
  opportunity_id: string;
  type: Appointment["type"];
  modality: Appointment["modality"];
  contact_id: string;
  rep_user_id: string;
  timezone: string;
  purpose: string;
}

interface AppointmentInstanceRow {
  tenant_id: string;
  instance_id: string;
  appointment_id: string;
  opportunity_id: string;
  scheduled_start: string;
  scheduled_end: string;
  supersedes_instance_id: string | null;
  confirmed_by_customer: boolean;
  retained_after_review: boolean;
  outcome: AppointmentInstance["outcome"];
  attendance_evidence_refs: string[];
  attended_duration_seconds: number | null;
  matured: boolean;
}

interface AssessmentRow {
  tenant_id: string;
  assessment_id: string;
  opportunity_id: string;
  policy_version: string;
  objective: QualificationAssessment["objective"];
  rep_perceived_fit: QualificationAssessment["repPerceivedFit"];
  rep_reason: string | null;
  ai_recommendation: QualificationAssessment["aiRecommendation"] | null;
  review_state: QualificationAssessment["reviewState"];
  next_question: string | null;
  assessed_at: string;
  assessed_by_user_id: string;
}

interface ProfileRow {
  tenant_id: string;
  profile_id: string;
  scope: CommunicationProfile["scope"];
  opportunity_id: string;
  preferred_language: CommunicationProfile["preferredLanguage"] | null;
  explicit_preferences: CommunicationProfile["explicitPreferences"];
  observed_preferences: CommunicationProfile["observedPreferences"];
  lenses: CommunicationProfile["lenses"];
  last_reviewed_at: string;
  review_due_at: string;
  policy_version: string;
}

interface ContractRow {
  tenant_id: string;
  contract_id: string;
  opportunity_id: string;
  offer_id: string;
  offer_version: string;
  value_minor: number | string; // bigint may arrive as string
  value_currency: string;
  state: Contract["state"];
  signed_at: string | null;
}

interface LedgerRow {
  tenant_id: string;
  entry_id: string;
  opportunity_id: string | null;
  contract_id: string | null;
  kind: LedgerEntry["kind"];
  amount_minor: number | string;
  currency: string;
  provider_ref: string;
  idempotency_key: string;
  occurred_at: string;
  received_at: string;
  commercial_category: LedgerEntry["commercialCategory"];
  pass_through: boolean;
}

interface CommissionPolicyRow {
  tenant_id: string;
  policy_version: string;
  effective_from: string;
  basis: CommissionPolicy["basis"];
  rate_percent: number | string; // numeric may arrive as string
  hypothetical: boolean;
}

interface CommissionEntryRow {
  tenant_id: string;
  entry_id: string;
  user_id: string;
  opportunity_id: string;
  policy_version: string;
  amount_minor: number | string;
  currency: string;
  state: CommissionEntry["state"];
}

interface DomainEventRow {
  tenant_id: string;
  event_id: string;
  event_type: string;
  schema_version: number;
  aggregate_type: string;
  aggregate_id: string;
  opportunity_id: string | null;
  occurred_at: string;
  received_at: string;
  actor_type: DomainEvent["actorType"];
  actor_id: string;
  source_system: string | null;
  source_event_id: string | null;
  idempotency_key: string;
  correlation_id: string | null;
  causation_id: string | null;
  evidence_refs: string[];
  payload: Record<string, unknown>;
  supersedes_event_id: string | null;
}

interface ProviderEventRow {
  tenant_id: string;
  provider: string;
  provider_account_id: string;
  provider_event_id: string;
  event_type: string | null;
  received_at: string;
  processed_at: string | null;
  status: ProviderEvent["status"];
  error: string | null;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UNIQUE_VIOLATION = "23505";
const FK_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

interface PgErrorLike {
  code?: string;
  message?: string;
}

function toWriteResult(error: PgErrorLike | null): WriteResult {
  if (!error) return { applied: true };
  if (error.code === UNIQUE_VIOLATION) return { applied: false, reason: "duplicate", detail: error.code };
  if (error.code === FK_VIOLATION || error.code === CHECK_VIOLATION) {
    return { applied: false, reason: "invalid", detail: error.code };
  }
  return { applied: false, reason: "error", detail: error.code ?? error.message };
}

function orUndefined<T>(v: T | null): T | undefined {
  return v === null ? undefined : v;
}

function orNull<T>(v: T | undefined): T | null {
  return v === undefined ? null : v;
}

function iso(v: string): ISODateTime {
  // Postgres returns "+00:00"; the domain uses "Z". Normalize so string comparisons hold.
  return new Date(v).toISOString();
}

function isoOrUndefined(v: string | null): ISODateTime | undefined {
  return v === null ? undefined : iso(v);
}

function minor(v: number | string): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isSafeInteger(n)) throw new Error(`amount_minor out of safe integer range: ${v}`);
  return n;
}

function money(amount: number | string, currency: string): Money {
  return { amountMinor: minor(amount), currency: currency.trim() };
}

function rows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

// ---------------------------------------------------------------------------
// Row -> domain mappers
// ---------------------------------------------------------------------------

const fromTenant = (r: TenantRow): Tenant => ({
  tenantId: r.tenant_id,
  name: r.name,
  timezone: r.timezone,
  reportingCurrency: r.reporting_currency.trim(),
  maturityHorizonDays: r.maturity_horizon_days,
});

const fromUser = (r: UserRow): User => ({
  tenantId: r.tenant_id,
  userId: r.user_id,
  displayName: r.display_name,
  roles: r.roles,
  active: r.active,
  languages: r.languages,
  capabilities: r.capabilities,
  selfDescribedStyle: orUndefined(r.self_described_style),
  startedAt: iso(r.started_at),
});

const fromContact = (r: ContactRow): Contact => ({
  tenantId: r.tenant_id,
  contactId: r.contact_id,
  displayName: r.display_name,
  organizationName: orUndefined(r.organization_name),
  preferredLanguage: orUndefined(r.preferred_language),
  preferredChannel: orUndefined(r.preferred_channel),
  consent: r.consent,
});

const fromSubmission = (r: LeadSubmissionRow): LeadSubmission => ({
  tenantId: r.tenant_id,
  submissionId: r.submission_id,
  providerEventId: r.provider_event_id,
  source: r.source,
  campaign: orUndefined(r.campaign),
  leadTier: orUndefined(r.lead_tier),
  entryPath: r.entry_path,
  receivedAt: iso(r.received_at),
  requestText: r.request_text,
  contactId: r.contact_id,
  duplicateOfSubmissionId: orUndefined(r.duplicate_of_submission_id),
});

const fromOpportunity = (r: OpportunityRow): Opportunity => ({
  tenantId: r.tenant_id,
  opportunityId: r.opportunity_id,
  contactIds: r.contact_ids,
  primaryContactId: r.primary_contact_id,
  offerId: r.offer_id,
  workflowVersion: r.workflow_version,
  entryPath: r.entry_path,
  source: r.source,
  leadTier: orUndefined(r.lead_tier),
  commercialStatus: r.commercial_status,
  accountabilityStartedAt: iso(r.accountability_started_at),
  currentOwner: r.current_owner,
  contactState: r.contact_state,
  fitState: r.fit_state,
  contractState: r.contract_state,
  paymentState: r.payment_state,
  dqReason: orUndefined(r.dq_reason),
});

const fromAssignment = (r: AssignmentRow): Assignment => ({
  tenantId: r.tenant_id,
  assignmentId: r.assignment_id,
  opportunityId: r.opportunity_id,
  role: r.role,
  userId: r.user_id,
  policyVersion: r.policy_version,
  decidedAt: iso(r.decided_at),
  eligibleCandidateIds: r.eligible_candidate_ids,
  exclusions: r.exclusions,
  selectionProbability: orUndefined(r.selection_probability),
  explanation: r.explanation,
  acceptedAt: isoOrUndefined(r.accepted_at),
  endedAt: isoOrUndefined(r.ended_at),
  shadow: orUndefined(r.shadow),
});

const fromTask = (r: TaskRow): Task => ({
  tenantId: r.tenant_id,
  taskId: r.task_id,
  opportunityId: r.opportunity_id,
  ownerUserId: orUndefined(r.owner_user_id),
  action: r.action,
  priority: r.priority,
  dueAt: isoOrUndefined(r.due_at),
  state: r.state,
  idempotencyKey: r.idempotency_key,
  leaseHolderUserId: orUndefined(r.lease_holder_user_id),
  leaseExpiresAt: isoOrUndefined(r.lease_expires_at),
});

const fromCall = (r: CallRow): Call => ({
  tenantId: r.tenant_id,
  callId: r.call_id,
  opportunityId: r.opportunity_id,
  userId: r.user_id,
  direction: r.direction,
  providerCallId: orUndefined(r.provider_call_id),
  transportState: r.transport_state,
  startedAt: isoOrUndefined(r.started_at),
  endedAt: isoOrUndefined(r.ended_at),
  durationSeconds: orUndefined(r.duration_seconds),
  interpretedOutcome: r.interpreted_outcome,
  outcomeConfirmedBy: orUndefined(r.outcome_confirmed_by),
  evidenceRefs: r.evidence_refs,
});

const fromAppointment = (r: AppointmentRow): Appointment => ({
  tenantId: r.tenant_id,
  appointmentId: r.appointment_id,
  opportunityId: r.opportunity_id,
  type: r.type,
  modality: r.modality,
  contactId: r.contact_id,
  repUserId: r.rep_user_id,
  timezone: r.timezone,
  purpose: r.purpose,
});

const fromInstance = (r: AppointmentInstanceRow): AppointmentInstance => ({
  tenantId: r.tenant_id,
  instanceId: r.instance_id,
  appointmentId: r.appointment_id,
  opportunityId: r.opportunity_id,
  scheduledStart: iso(r.scheduled_start),
  scheduledEnd: iso(r.scheduled_end),
  supersedesInstanceId: orUndefined(r.supersedes_instance_id),
  confirmedByCustomer: r.confirmed_by_customer,
  retainedAfterReview: r.retained_after_review,
  outcome: r.outcome,
  attendanceEvidenceRefs: r.attendance_evidence_refs,
  attendedDurationSeconds: orUndefined(r.attended_duration_seconds),
  matured: r.matured,
});

const fromAssessment = (r: AssessmentRow): QualificationAssessment => ({
  tenantId: r.tenant_id,
  assessmentId: r.assessment_id,
  opportunityId: r.opportunity_id,
  policyVersion: r.policy_version,
  objective: r.objective,
  repPerceivedFit: r.rep_perceived_fit,
  repReason: orUndefined(r.rep_reason),
  aiRecommendation: orUndefined(r.ai_recommendation),
  reviewState: r.review_state,
  nextQuestion: orUndefined(r.next_question),
  assessedAt: iso(r.assessed_at),
  assessedByUserId: r.assessed_by_user_id,
});

const fromContract = (r: ContractRow): Contract => ({
  tenantId: r.tenant_id,
  contractId: r.contract_id,
  opportunityId: r.opportunity_id,
  offerId: r.offer_id,
  offerVersion: r.offer_version,
  value: money(r.value_minor, r.value_currency),
  state: r.state,
  signedAt: isoOrUndefined(r.signed_at),
});

const fromLedger = (r: LedgerRow): LedgerEntry => ({
  tenantId: r.tenant_id,
  entryId: r.entry_id,
  opportunityId: orUndefined(r.opportunity_id),
  contractId: orUndefined(r.contract_id),
  kind: r.kind,
  amount: money(r.amount_minor, r.currency),
  providerRef: r.provider_ref,
  idempotencyKey: r.idempotency_key,
  occurredAt: iso(r.occurred_at),
  receivedAt: iso(r.received_at),
  commercialCategory: r.commercial_category,
  passThrough: r.pass_through ? true : undefined,
});

const fromCommissionPolicy = (r: CommissionPolicyRow): CommissionPolicy => ({
  tenantId: r.tenant_id,
  policyVersion: r.policy_version,
  effectiveFrom: iso(r.effective_from),
  basis: r.basis,
  ratePercent: typeof r.rate_percent === "string" ? Number(r.rate_percent) : r.rate_percent,
  hypothetical: r.hypothetical,
});

const fromCommissionEntry = (r: CommissionEntryRow): CommissionEntry => ({
  tenantId: r.tenant_id,
  entryId: r.entry_id,
  userId: r.user_id,
  opportunityId: r.opportunity_id,
  policyVersion: r.policy_version,
  amount: money(r.amount_minor, r.currency),
  state: r.state,
});

const fromDomainEvent = (r: DomainEventRow): DomainEvent => ({
  eventId: r.event_id,
  tenantId: r.tenant_id,
  eventType: r.event_type,
  schemaVersion: r.schema_version,
  aggregateType: r.aggregate_type,
  aggregateId: r.aggregate_id,
  opportunityId: orUndefined(r.opportunity_id),
  occurredAt: iso(r.occurred_at),
  receivedAt: iso(r.received_at),
  actorType: r.actor_type,
  actorId: r.actor_id,
  sourceSystem: orUndefined(r.source_system),
  sourceEventId: orUndefined(r.source_event_id),
  idempotencyKey: r.idempotency_key,
  correlationId: orUndefined(r.correlation_id),
  causationId: orUndefined(r.causation_id),
  evidenceRefs: r.evidence_refs,
  payload: r.payload,
  supersedesEventId: orUndefined(r.supersedes_event_id),
});

// ---------------------------------------------------------------------------
// Domain -> row mappers (writes)
// ---------------------------------------------------------------------------

const toDomainEventRow = (e: DomainEvent): DomainEventRow => ({
  tenant_id: e.tenantId,
  event_id: e.eventId,
  event_type: e.eventType,
  schema_version: e.schemaVersion,
  aggregate_type: e.aggregateType,
  aggregate_id: e.aggregateId,
  opportunity_id: orNull(e.opportunityId),
  occurred_at: e.occurredAt,
  received_at: e.receivedAt,
  actor_type: e.actorType,
  actor_id: e.actorId,
  source_system: orNull(e.sourceSystem),
  source_event_id: orNull(e.sourceEventId),
  idempotency_key: e.idempotencyKey,
  correlation_id: orNull(e.correlationId),
  causation_id: orNull(e.causationId),
  evidence_refs: e.evidenceRefs,
  payload: e.payload,
  supersedes_event_id: orNull(e.supersedesEventId),
});

const toProviderEventRow = (p: ProviderEvent): ProviderEventRow => ({
  tenant_id: p.tenantId,
  provider: p.provider,
  provider_account_id: p.providerAccountId,
  provider_event_id: p.providerEventId,
  event_type: orNull(p.eventType),
  received_at: p.receivedAt,
  processed_at: orNull(p.processedAt),
  status: p.status,
  error: orNull(p.error),
  payload: p.payload,
});

const toLedgerRow = (e: LedgerEntry): LedgerRow => ({
  tenant_id: e.tenantId,
  entry_id: e.entryId,
  opportunity_id: orNull(e.opportunityId),
  contract_id: orNull(e.contractId),
  kind: e.kind,
  amount_minor: e.amount.amountMinor,
  currency: e.amount.currency,
  provider_ref: e.providerRef,
  idempotency_key: e.idempotencyKey,
  occurred_at: e.occurredAt,
  received_at: e.receivedAt,
  commercial_category: e.commercialCategory,
  pass_through: e.passThrough === true,
});

const toAssessmentRow = (a: QualificationAssessment): AssessmentRow => ({
  tenant_id: a.tenantId,
  assessment_id: a.assessmentId,
  opportunity_id: a.opportunityId,
  policy_version: a.policyVersion,
  objective: a.objective,
  rep_perceived_fit: a.repPerceivedFit,
  rep_reason: orNull(a.repReason),
  ai_recommendation: orNull(a.aiRecommendation),
  review_state: a.reviewState,
  next_question: orNull(a.nextQuestion),
  assessed_at: a.assessedAt,
  assessed_by_user_id: a.assessedByUserId,
});

const toProfileRow = (p: CommunicationProfile): ProfileRow => ({
  tenant_id: p.tenantId,
  profile_id: p.profileId,
  scope: p.scope,
  opportunity_id: p.opportunityId,
  preferred_language: orNull(p.preferredLanguage),
  explicit_preferences: p.explicitPreferences,
  observed_preferences: p.observedPreferences,
  lenses: p.lenses,
  last_reviewed_at: p.lastReviewedAt,
  review_due_at: p.reviewDueAt,
  policy_version: p.policyVersion,
});

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface SupabaseRepositoryOptions {
  url: string;
  key: string;
  /** Which commission policy the dataset aggregate carries. Default: latest effective_from. */
  commissionPolicyVersion?: string;
}

export function readSupabaseEnv(env: NodeJS.ProcessEnv = process.env): SupabaseRepositoryOptions | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export class SupabaseRepository implements Repository {
  private readonly client: SupabaseClient;
  private readonly commissionPolicyVersion?: string;

  constructor(options: SupabaseRepositoryOptions, client?: SupabaseClient) {
    this.client =
      client ??
      createClient(options.url, options.key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    this.commissionPolicyVersion = options.commissionPolicyVersion;
  }

  /**
   * Sets app.tenant_id for the current database session through the `set_tenant` RPC.
   * Effective only on a connection that keeps its session (see module header); the
   * adapter's explicit tenant filters do not depend on it.
   */
  async setTenant(tenantId: Id): Promise<void> {
    const { error } = await this.client.rpc("set_tenant", { p_tenant_id: tenantId });
    if (error) throw new Error(`set_tenant failed: ${error.message}`);
  }

  private async selectAll<TRow>(table: string, tenantId: Id): Promise<TRow[]> {
    const { data, error } = await this.client.from(table).select("*").eq("tenant_id", tenantId);
    if (error) throw new Error(`${table}: ${error.message}`);
    return rows<TRow>(data);
  }

  // ---------- Reads ----------

  async getDataset(tenantId: Id): Promise<DatasetLike> {
    const { data: tenantData, error: tenantError } = await this.client
      .from("tenants")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (tenantError) throw new Error(`tenants: ${tenantError.message}`);
    if (!tenantData) throw new Error(`Unknown tenant: ${tenantId}`);
    const tenant = fromTenant(tenantData as TenantRow);

    const [
      users,
      contacts,
      submissions,
      opportunities,
      assignments,
      tasks,
      calls,
      appointments,
      instances,
      assessments,
      contracts,
      ledger,
      policies,
      commissionEntries,
    ] = await Promise.all([
      this.selectAll<UserRow>("users", tenantId),
      this.selectAll<ContactRow>("contacts", tenantId),
      this.selectAll<LeadSubmissionRow>("lead_submissions", tenantId),
      this.selectAll<OpportunityRow>("opportunities", tenantId),
      this.selectAll<AssignmentRow>("assignments", tenantId),
      this.selectAll<TaskRow>("tasks", tenantId),
      this.selectAll<CallRow>("calls", tenantId),
      this.selectAll<AppointmentRow>("appointments", tenantId),
      this.selectAll<AppointmentInstanceRow>("appointment_instances", tenantId),
      this.selectAll<AssessmentRow>("qualification_assessments", tenantId),
      this.selectAll<ContractRow>("contracts", tenantId),
      this.selectAll<LedgerRow>("ledger_entries", tenantId),
      this.selectAll<CommissionPolicyRow>("commission_policies", tenantId),
      this.selectAll<CommissionEntryRow>("commission_entries", tenantId),
    ]);

    const policyRow = this.commissionPolicyVersion
      ? policies.find((p) => p.policy_version === this.commissionPolicyVersion)
      : [...policies].sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
    if (!policyRow) throw new Error(`No commission policy for tenant ${tenantId}`);

    return {
      tenant,
      users: users.map(fromUser),
      contacts: contacts.map(fromContact),
      submissions: submissions.map(fromSubmission),
      opportunities: opportunities.map(fromOpportunity),
      assignments: assignments.map(fromAssignment),
      tasks: tasks.map(fromTask),
      calls: calls.map(fromCall),
      appointments: appointments.map(fromAppointment),
      appointmentInstances: instances.map(fromInstance),
      assessments: assessments.map(fromAssessment),
      contracts: contracts.map(fromContract),
      ledger: ledger.map(fromLedger),
      commissionPolicy: fromCommissionPolicy(policyRow),
      commissionEntries: commissionEntries.map(fromCommissionEntry),
    };
  }

  async listOpportunities(tenantId: Id, filter: OpportunityFilter = {}): Promise<Opportunity[]> {
    let q = this.client.from("opportunities").select("*").eq("tenant_id", tenantId);
    if (filter.commercialStatus && filter.commercialStatus.length > 0) {
      q = q.in("commercial_status", filter.commercialStatus);
    }
    if (filter.entryPath) q = q.eq("entry_path", filter.entryPath);
    if (filter.source) q = q.eq("source", filter.source);
    if (filter.ownerUserId) {
      // jsonb containment on either role
      q = q.or(
        `current_owner->>setter.eq.${filter.ownerUserId},current_owner->>closer.eq.${filter.ownerUserId}`,
      );
    }
    if (filter.accountabilityWindow) {
      q = q
        .gte("accountability_started_at", filter.accountabilityWindow.from)
        .lt("accountability_started_at", filter.accountabilityWindow.to);
    }
    const { data, error } = await q.order("accountability_started_at", { ascending: true });
    if (error) throw new Error(`opportunities: ${error.message}`);
    return rows<OpportunityRow>(data).map(fromOpportunity);
  }

  async getOpportunity(tenantId: Id, opportunityId: Id): Promise<Opportunity | null> {
    const { data, error } = await this.client
      .from("opportunities")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("opportunity_id", opportunityId)
      .maybeSingle();
    if (error) throw new Error(`opportunities: ${error.message}`);
    return data ? fromOpportunity(data as OpportunityRow) : null;
  }

  async listTasksForUser(tenantId: Id, userId: Id): Promise<Task[]> {
    const { data, error } = await this.client
      .from("tasks")
      .select("*")
      .eq("tenant_id", tenantId)
      .not("state", "in", "(completed,canceled)")
      .or(`owner_user_id.eq.${userId},lease_holder_user_id.eq.${userId}`)
      .order("due_at", { ascending: true, nullsFirst: false });
    if (error) throw new Error(`tasks: ${error.message}`);
    return rows<TaskRow>(data).map(fromTask);
  }

  async listAppointmentInstances(tenantId: Id, window: TimeWindow): Promise<AppointmentInstance[]> {
    const { data, error } = await this.client
      .from("appointment_instances")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("scheduled_start", window.from)
      .lt("scheduled_start", window.to)
      .order("scheduled_start", { ascending: true });
    if (error) throw new Error(`appointment_instances: ${error.message}`);
    return rows<AppointmentInstanceRow>(data).map(fromInstance);
  }

  async listLedger(tenantId: Id, filter: LedgerFilter = {}): Promise<LedgerEntry[]> {
    let q = this.client.from("ledger_entries").select("*").eq("tenant_id", tenantId);
    if (filter.opportunityId) q = q.eq("opportunity_id", filter.opportunityId);
    if (filter.unlinkedOnly) q = q.is("opportunity_id", null);
    if (filter.window) q = q.gte("occurred_at", filter.window.from).lt("occurred_at", filter.window.to);
    const { data, error } = await q.order("occurred_at", { ascending: true });
    if (error) throw new Error(`ledger_entries: ${error.message}`);
    return rows<LedgerRow>(data).map(fromLedger);
  }

  async listEvents(tenantId: Id, filter: EventFilter = {}): Promise<DomainEvent[]> {
    let q = this.client.from("domain_events").select("*").eq("tenant_id", tenantId);
    if (filter.opportunityId) q = q.eq("opportunity_id", filter.opportunityId);
    if (filter.aggregateType) q = q.eq("aggregate_type", filter.aggregateType);
    if (filter.aggregateId) q = q.eq("aggregate_id", filter.aggregateId);
    if (filter.eventType) q = q.eq("event_type", filter.eventType);
    if (filter.window) q = q.gte("occurred_at", filter.window.from).lt("occurred_at", filter.window.to);
    const { data, error } = await q.order("occurred_at", { ascending: true });
    if (error) throw new Error(`domain_events: ${error.message}`);
    return rows<DomainEventRow>(data).map(fromDomainEvent);
  }

  // ---------- Idempotent writes ----------

  async appendEvent(tenantId: Id, event: DomainEvent): Promise<WriteResult> {
    if (event.tenantId !== tenantId) return { applied: false, reason: "invalid", detail: "tenant mismatch" };
    const { error } = await this.client.from("domain_events").insert(toDomainEventRow(event));
    return toWriteResult(error);
  }

  async recordProviderEvent(tenantId: Id, providerEvent: ProviderEvent): Promise<WriteResult> {
    if (providerEvent.tenantId !== tenantId) {
      return { applied: false, reason: "invalid", detail: "tenant mismatch" };
    }
    const { error } = await this.client.from("provider_events").insert(toProviderEventRow(providerEvent));
    return toWriteResult(error);
  }

  async reserveTask(tenantId: Id, taskId: Id, userId: Id, leaseSeconds: number, now: ISODateTime): Promise<boolean> {
    const { data, error } = await this.client.rpc("reserve_task", {
      p_tenant_id: tenantId,
      p_task_id: taskId,
      p_user_id: userId,
      p_lease_seconds: leaseSeconds,
      p_now: now,
    });
    if (error) throw new Error(`reserve_task: ${error.message}`);
    return data === true;
  }

  async releaseTask(tenantId: Id, taskId: Id, userId: Id, now: ISODateTime): Promise<boolean> {
    const { data, error } = await this.client.rpc("release_task", {
      p_tenant_id: tenantId,
      p_task_id: taskId,
      p_user_id: userId,
      p_now: now,
    });
    if (error) throw new Error(`release_task: ${error.message}`);
    return data === true;
  }

  async recordLedgerEntry(tenantId: Id, entry: LedgerEntry): Promise<WriteResult> {
    if (entry.tenantId !== tenantId) return { applied: false, reason: "invalid", detail: "tenant mismatch" };
    if (!Number.isInteger(entry.amount.amountMinor) || entry.amount.amountMinor < 0) {
      return { applied: false, reason: "invalid", detail: "amountMinor must be a non-negative integer" };
    }
    const { error } = await this.client.from("ledger_entries").insert(toLedgerRow(entry));
    return toWriteResult(error);
  }

  async upsertAssessment(tenantId: Id, assessment: QualificationAssessment): Promise<WriteResult> {
    if (assessment.tenantId !== tenantId) return { applied: false, reason: "invalid", detail: "tenant mismatch" };
    const { error } = await this.client
      .from("qualification_assessments")
      .upsert(toAssessmentRow(assessment), { onConflict: "tenant_id,assessment_id" });
    return toWriteResult(error);
  }

  async upsertProfile(tenantId: Id, profile: CommunicationProfile): Promise<WriteResult> {
    if (profile.tenantId !== tenantId) return { applied: false, reason: "invalid", detail: "tenant mismatch" };
    const { error } = await this.client
      .from("communication_profiles")
      .upsert(toProfileRow(profile), { onConflict: "tenant_id,profile_id" });
    return toWriteResult(error);
  }
}
