/**
 * In-memory Repository. Default adapter so the product runs with zero external
 * credentials (docs/ARCHITECTURE.md). Also the reference for idempotency and lease
 * semantics that the Supabase adapter must match.
 *
 * Deterministic: no Date.now(), no randomness. Time is passed in by callers.
 */

import type {
  AppointmentInstance,
  CommunicationProfile,
  DomainEvent,
  Id,
  ISODateTime,
  LedgerEntry,
  Opportunity,
  QualificationAssessment,
  Task,
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

export type { DatasetLike } from "./repository";

const TERMINAL_TASK_STATES: ReadonlySet<Task["state"]> = new Set(["completed", "canceled"]);

function inWindow(ts: ISODateTime, window: TimeWindow): boolean {
  return ts >= window.from && ts < window.to;
}

function providerEventKey(e: ProviderEvent): string {
  return [e.tenantId, e.provider, e.providerAccountId, e.providerEventId].join("\u0000");
}

function addSeconds(iso: ISODateTime, seconds: number): ISODateTime {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

/** An empty dataset for a tenant. Used when no fixture module is available. */
export function emptyDataset(tenantId: Id): DatasetLike {
  return {
    tenant: {
      tenantId,
      name: "Empty tenant",
      timezone: "UTC",
      reportingCurrency: "USD",
      maturityHorizonDays: 30,
    },
    users: [],
    contacts: [],
    submissions: [],
    opportunities: [],
    assignments: [],
    tasks: [],
    calls: [],
    appointments: [],
    appointmentInstances: [],
    assessments: [],
    contracts: [],
    ledger: [],
    commissionPolicy: {
      tenantId,
      policyVersion: "none",
      effectiveFrom: "1970-01-01T00:00:00Z",
      basis: "net_collected_cash",
      ratePercent: 0,
      hypothetical: true,
    },
    commissionEntries: [],
  };
}

export class MemoryRepository implements Repository {
  /** One dataset per tenant. Seeded datasets are deep-copied so fixtures are never mutated. */
  private readonly datasets = new Map<Id, DatasetLike>();
  private readonly events = new Map<Id, DomainEvent[]>();
  private readonly providerEvents = new Map<string, ProviderEvent>();
  private readonly profiles = new Map<Id, Map<Id, CommunicationProfile>>();

  constructor(seed?: DatasetLike | DatasetLike[]) {
    const seeds = seed === undefined ? [] : Array.isArray(seed) ? seed : [seed];
    for (const ds of seeds) this.seed(ds);
  }

  /** Add or replace a tenant's dataset. */
  seed(dataset: DatasetLike): void {
    const copy = structuredClone(dataset);
    const tenantId = copy.tenant.tenantId;
    this.datasets.set(tenantId, copy);
    if (!this.events.has(tenantId)) this.events.set(tenantId, []);
    if (!this.profiles.has(tenantId)) this.profiles.set(tenantId, new Map());
  }

  private ds(tenantId: Id): DatasetLike {
    const ds = this.datasets.get(tenantId);
    if (!ds) throw new Error(`Unknown tenant: ${tenantId}`);
    return ds;
  }

  private dsOrNull(tenantId: Id): DatasetLike | null {
    return this.datasets.get(tenantId) ?? null;
  }

  // ---------- Reads ----------

  async getDataset(tenantId: Id): Promise<DatasetLike> {
    return structuredClone(this.ds(tenantId));
  }

  async listOpportunities(tenantId: Id, filter: OpportunityFilter = {}): Promise<Opportunity[]> {
    const ds = this.dsOrNull(tenantId);
    if (!ds) return [];
    return ds.opportunities
      .filter((o) => o.tenantId === tenantId)
      .filter((o) => !filter.commercialStatus || filter.commercialStatus.includes(o.commercialStatus))
      .filter((o) => !filter.entryPath || o.entryPath === filter.entryPath)
      .filter((o) => !filter.source || o.source === filter.source)
      .filter(
        (o) =>
          !filter.ownerUserId ||
          o.currentOwner.setter === filter.ownerUserId ||
          o.currentOwner.closer === filter.ownerUserId,
      )
      .filter((o) => !filter.accountabilityWindow || inWindow(o.accountabilityStartedAt, filter.accountabilityWindow))
      .map((o) => structuredClone(o));
  }

  async getOpportunity(tenantId: Id, opportunityId: Id): Promise<Opportunity | null> {
    const ds = this.dsOrNull(tenantId);
    if (!ds) return null;
    const o = ds.opportunities.find((x) => x.tenantId === tenantId && x.opportunityId === opportunityId);
    return o ? structuredClone(o) : null;
  }

  async listTasksForUser(tenantId: Id, userId: Id): Promise<Task[]> {
    const ds = this.dsOrNull(tenantId);
    if (!ds) return [];
    return ds.tasks
      .filter((t) => t.tenantId === tenantId)
      .filter((t) => !TERMINAL_TASK_STATES.has(t.state))
      .filter((t) => t.ownerUserId === userId || t.leaseHolderUserId === userId)
      .map((t) => structuredClone(t));
  }

  async listAppointmentInstances(tenantId: Id, window: TimeWindow): Promise<AppointmentInstance[]> {
    const ds = this.dsOrNull(tenantId);
    if (!ds) return [];
    return ds.appointmentInstances
      .filter((i) => i.tenantId === tenantId && inWindow(i.scheduledStart, window))
      .map((i) => structuredClone(i));
  }

  async listLedger(tenantId: Id, filter: LedgerFilter = {}): Promise<LedgerEntry[]> {
    const ds = this.dsOrNull(tenantId);
    if (!ds) return [];
    return ds.ledger
      .filter((e) => e.tenantId === tenantId)
      .filter((e) => !filter.opportunityId || e.opportunityId === filter.opportunityId)
      .filter((e) => !filter.unlinkedOnly || e.opportunityId === undefined)
      .filter((e) => !filter.window || inWindow(e.occurredAt, filter.window))
      .map((e) => structuredClone(e));
  }

  async listEvents(tenantId: Id, filter: EventFilter = {}): Promise<DomainEvent[]> {
    const list = this.events.get(tenantId) ?? [];
    return list
      .filter((e) => e.tenantId === tenantId)
      .filter((e) => !filter.opportunityId || e.opportunityId === filter.opportunityId)
      .filter((e) => !filter.aggregateType || e.aggregateType === filter.aggregateType)
      .filter((e) => !filter.aggregateId || e.aggregateId === filter.aggregateId)
      .filter((e) => !filter.eventType || e.eventType === filter.eventType)
      .filter((e) => !filter.window || inWindow(e.occurredAt, filter.window))
      .map((e) => structuredClone(e));
  }

  /** Test/inspection helper: every recorded provider event for a tenant. */
  async listProviderEvents(tenantId: Id): Promise<ProviderEvent[]> {
    return [...this.providerEvents.values()].filter((e) => e.tenantId === tenantId).map((e) => structuredClone(e));
  }

  /** Test/inspection helper. */
  async getProfile(tenantId: Id, profileId: Id): Promise<CommunicationProfile | null> {
    const p = this.profiles.get(tenantId)?.get(profileId);
    return p ? structuredClone(p) : null;
  }

  // ---------- Idempotent writes ----------

  async appendEvent(tenantId: Id, event: DomainEvent): Promise<WriteResult> {
    if (event.tenantId !== tenantId) return { applied: false, reason: "invalid", detail: "tenant mismatch" };
    if (!this.datasets.has(tenantId)) return { applied: false, reason: "invalid", detail: "unknown tenant" };
    const list = this.events.get(tenantId) ?? [];
    if (list.some((e) => e.idempotencyKey === event.idempotencyKey || e.eventId === event.eventId)) {
      return { applied: false, reason: "duplicate" };
    }
    if (event.supersedesEventId && !list.some((e) => e.eventId === event.supersedesEventId)) {
      return { applied: false, reason: "invalid", detail: "supersedesEventId not found" };
    }
    list.push(structuredClone(event));
    this.events.set(tenantId, list);
    return { applied: true };
  }

  async recordProviderEvent(tenantId: Id, providerEvent: ProviderEvent): Promise<WriteResult> {
    if (providerEvent.tenantId !== tenantId) return { applied: false, reason: "invalid", detail: "tenant mismatch" };
    if (!this.datasets.has(tenantId)) return { applied: false, reason: "invalid", detail: "unknown tenant" };
    const key = providerEventKey(providerEvent);
    if (this.providerEvents.has(key)) return { applied: false, reason: "duplicate" };
    this.providerEvents.set(key, structuredClone(providerEvent));
    return { applied: true };
  }

  async reserveTask(tenantId: Id, taskId: Id, userId: Id, leaseSeconds: number, now: ISODateTime): Promise<boolean> {
    const ds = this.dsOrNull(tenantId);
    if (!ds) return false;
    const task = ds.tasks.find((t) => t.tenantId === tenantId && t.taskId === taskId);
    if (!task) return false;
    if (TERMINAL_TASK_STATES.has(task.state)) return false;

    const holder = task.leaseHolderUserId;
    const expires = task.leaseExpiresAt;
    const liveOther = holder !== undefined && holder !== userId && expires !== undefined && expires > now;
    if (liveOther) return false;

    task.leaseHolderUserId = userId;
    task.leaseExpiresAt = addSeconds(now, leaseSeconds);
    if (task.state === "unassigned") task.state = "reserved";
    return true;
  }

  async releaseTask(tenantId: Id, taskId: Id, userId: Id, _now: ISODateTime): Promise<boolean> {
    void _now;
    const ds = this.dsOrNull(tenantId);
    if (!ds) return false;
    const task = ds.tasks.find((t) => t.tenantId === tenantId && t.taskId === taskId);
    if (!task || task.leaseHolderUserId !== userId) return false;
    delete task.leaseHolderUserId;
    delete task.leaseExpiresAt;
    if (task.state === "reserved") task.state = "unassigned";
    return true;
  }

  async recordLedgerEntry(tenantId: Id, entry: LedgerEntry): Promise<WriteResult> {
    if (entry.tenantId !== tenantId) return { applied: false, reason: "invalid", detail: "tenant mismatch" };
    const ds = this.dsOrNull(tenantId);
    if (!ds) return { applied: false, reason: "invalid", detail: "unknown tenant" };
    if (!Number.isInteger(entry.amount.amountMinor) || entry.amount.amountMinor < 0) {
      return { applied: false, reason: "invalid", detail: "amountMinor must be a non-negative integer" };
    }
    if (ds.ledger.some((e) => e.idempotencyKey === entry.idempotencyKey || e.entryId === entry.entryId)) {
      return { applied: false, reason: "duplicate" };
    }
    ds.ledger.push(structuredClone(entry));
    return { applied: true };
  }

  async upsertAssessment(tenantId: Id, assessment: QualificationAssessment): Promise<WriteResult> {
    if (assessment.tenantId !== tenantId) return { applied: false, reason: "invalid", detail: "tenant mismatch" };
    const ds = this.dsOrNull(tenantId);
    if (!ds) return { applied: false, reason: "invalid", detail: "unknown tenant" };
    const idx = ds.assessments.findIndex((a) => a.assessmentId === assessment.assessmentId);
    const copy = structuredClone(assessment);
    if (idx >= 0) ds.assessments[idx] = copy;
    else ds.assessments.push(copy);
    return { applied: true };
  }

  async upsertProfile(tenantId: Id, profile: CommunicationProfile): Promise<WriteResult> {
    if (profile.tenantId !== tenantId) return { applied: false, reason: "invalid", detail: "tenant mismatch" };
    if (!this.datasets.has(tenantId)) return { applied: false, reason: "invalid", detail: "unknown tenant" };
    const byId = this.profiles.get(tenantId) ?? new Map<Id, CommunicationProfile>();
    byId.set(profile.profileId, structuredClone(profile));
    this.profiles.set(tenantId, byId);
    return { applied: true };
  }
}
