/**
 * Repository contract for Sales OS persistence (Phase 6).
 * Governing specs: SOS-03 (domain model, idempotency, corrections),
 * SOS-22 (inbox/outbox, leases, server-side tenant filters), SOS-19 (ledger).
 *
 * Rules:
 * - Every method takes tenantId explicitly. Adapters filter server-side; a caller
 *   can never widen the scope by omitting it.
 * - Writes are idempotent by design. Re-delivering the same event, provider event,
 *   or ledger entry produces one row and reports `applied: false, reason: "duplicate"`.
 * - Time is always passed in (`now`). No adapter calls Date.now().
 * - Money is integer minor units with currency (src/domain/types.ts Money).
 */

import type {
  Appointment,
  AppointmentInstance,
  Assignment,
  Call,
  CommercialStatus,
  CommissionEntry,
  CommissionPolicy,
  CommunicationProfile,
  Contact,
  Contract,
  DomainEvent,
  EntryPath,
  Id,
  ISODateTime,
  LeadSubmission,
  LedgerEntry,
  Opportunity,
  QualificationAssessment,
  Task,
  Tenant,
  User,
} from "@/domain/types";

/**
 * Minimal Dataset shape. Mirrors the entity arrays that src/domain/metrics.ts exports as
 * `Dataset` (same field names) without importing it, so the data layer does not depend on
 * the metric engine's module.
 */
export interface DatasetLike {
  tenant: Tenant;
  users: User[];
  contacts: Contact[];
  submissions: LeadSubmission[];
  opportunities: Opportunity[];
  assignments: Assignment[];
  tasks: Task[];
  calls: Call[];
  appointments: Appointment[];
  appointmentInstances: AppointmentInstance[];
  assessments: QualificationAssessment[];
  contracts: Contract[];
  ledger: LedgerEntry[];
  commissionPolicy: CommissionPolicy;
  commissionEntries: CommissionEntry[];
}

/** Half-open time window [from, to). */
export interface TimeWindow {
  from: ISODateTime;
  to: ISODateTime;
}

export interface OpportunityFilter {
  commercialStatus?: CommercialStatus[];
  entryPath?: EntryPath;
  source?: string;
  /** Matches either setter or closer in currentOwner. */
  ownerUserId?: Id;
  /** Filter on accountabilityStartedAt. */
  accountabilityWindow?: TimeWindow;
}

export interface LedgerFilter {
  opportunityId?: Id;
  /** Filter on occurredAt. */
  window?: TimeWindow;
  /** true -> only unlinked entries (exception queue). */
  unlinkedOnly?: boolean;
}

export interface EventFilter {
  opportunityId?: Id;
  aggregateType?: string;
  aggregateId?: Id;
  eventType?: string;
  /** Filter on occurredAt. */
  window?: TimeWindow;
}

export type WriteReason = "duplicate" | "conflict" | "invalid" | "error";

export interface WriteResult {
  applied: boolean;
  /** Present when applied is false. */
  reason?: WriteReason;
  /** Adapter detail (e.g. Postgres error code). Never a secret. */
  detail?: string;
}

/** Connector inbox row (SOS-22). Unique per (tenantId, provider, providerAccountId, providerEventId). */
export interface ProviderEvent {
  tenantId: Id;
  provider: string; // e.g. "stripe", "calendly", "meta"
  providerAccountId: string;
  providerEventId: string;
  eventType?: string;
  receivedAt: ISODateTime;
  processedAt?: ISODateTime;
  status: "pending" | "processed" | "failed";
  error?: string;
  payload: Record<string, unknown>;
}

export interface Repository {
  // ---------- Reads ----------

  /** Whole-tenant aggregate for the metric engine and fixtures. Rejects when the tenant is unknown. */
  getDataset(tenantId: Id): Promise<DatasetLike>;

  listOpportunities(tenantId: Id, filter?: OpportunityFilter): Promise<Opportunity[]>;

  getOpportunity(tenantId: Id, opportunityId: Id): Promise<Opportunity | null>;

  /** Tasks owned by, or currently leased to, the user. Excludes completed and canceled. */
  listTasksForUser(tenantId: Id, userId: Id): Promise<Task[]>;

  /** Instances whose scheduledStart falls in [window.from, window.to). */
  listAppointmentInstances(tenantId: Id, window: TimeWindow): Promise<AppointmentInstance[]>;

  listLedger(tenantId: Id, filter?: LedgerFilter): Promise<LedgerEntry[]>;

  listEvents(tenantId: Id, filter?: EventFilter): Promise<DomainEvent[]>;

  // ---------- Idempotent writes ----------

  /** Append to the audit history. Dedupe on (tenantId, idempotencyKey). */
  appendEvent(tenantId: Id, event: DomainEvent): Promise<WriteResult>;

  /** Record a provider delivery. Dedupe on (tenantId, provider, providerAccountId, providerEventId). */
  recordProviderEvent(tenantId: Id, providerEvent: ProviderEvent): Promise<WriteResult>;

  /**
   * Compare-and-set task lease. Returns true when `userId` now holds the lease
   * (fresh or renewed), false when another user's lease is still live at `now`,
   * the task is terminal, or the task does not exist.
   */
  reserveTask(tenantId: Id, taskId: Id, userId: Id, leaseSeconds: number, now: ISODateTime): Promise<boolean>;

  /** Release a lease held by `userId`. Returns false when `userId` is not the holder. */
  releaseTask(tenantId: Id, taskId: Id, userId: Id, now: ISODateTime): Promise<boolean>;

  /** Record a money movement. Dedupe on (tenantId, idempotencyKey). Money changes once (SOS-19). */
  recordLedgerEntry(tenantId: Id, entry: LedgerEntry): Promise<WriteResult>;

  /** Insert or replace by (tenantId, assessmentId). */
  upsertAssessment(tenantId: Id, assessment: QualificationAssessment): Promise<WriteResult>;

  /** Insert or replace by (tenantId, profileId). */
  upsertProfile(tenantId: Id, profile: CommunicationProfile): Promise<WriteResult>;
}
