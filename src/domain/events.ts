/**
 * Domain events: envelope construction and an idempotent reducer (SOS-03).
 * A provider payment delivered three times must produce one financial effect.
 */
import type { DomainEvent, ISODateTime, Id, LedgerEntry, Money } from "./types";
import { add, sub, zero } from "./money";

export interface CreateEventInput<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  eventId: Id;
  tenantId: Id;
  eventType: string;
  aggregateType: string;
  aggregateId: Id;
  opportunityId?: Id;
  occurredAt: ISODateTime;
  receivedAt: ISODateTime;
  actorType: DomainEvent["actorType"];
  actorId: Id;
  sourceSystem?: string;
  /** Provider account within the source system. Part of the idempotency key. */
  sourceAccountId?: string;
  /** Provider's stable event id. Part of the idempotency key. */
  sourceEventId?: string;
  correlationId?: Id;
  causationId?: Id;
  evidenceRefs?: Id[];
  payload: TPayload;
  supersedesEventId?: Id;
  schemaVersion?: number;
}

/**
 * Idempotency key is "tenant:source:account:eventId" (SOS-03 envelope).
 * When the provider supplies no stable event id, the caller must pass a
 * collision-resistant id of its own; a timestamp alone is not safe.
 */
export function buildIdempotencyKey(input: {
  tenantId: Id;
  sourceSystem?: string;
  sourceAccountId?: string;
  sourceEventId?: string;
  eventId: Id;
}): string {
  const source = input.sourceSystem ?? "internal";
  const account = input.sourceAccountId ?? "default";
  const eventId = input.sourceEventId ?? input.eventId;
  return `${input.tenantId}:${source}:${account}:${eventId}`;
}

export function createEvent<TPayload extends Record<string, unknown>>(
  input: CreateEventInput<TPayload>,
): DomainEvent<TPayload> {
  return {
    eventId: input.eventId,
    tenantId: input.tenantId,
    eventType: input.eventType,
    schemaVersion: input.schemaVersion ?? 1,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    opportunityId: input.opportunityId,
    occurredAt: input.occurredAt,
    receivedAt: input.receivedAt,
    actorType: input.actorType,
    actorId: input.actorId,
    sourceSystem: input.sourceSystem,
    sourceEventId: input.sourceEventId,
    idempotencyKey: buildIdempotencyKey(input),
    correlationId: input.correlationId,
    causationId: input.causationId,
    evidenceRefs: input.evidenceRefs ?? [],
    payload: input.payload,
    supersedesEventId: input.supersedesEventId,
  };
}

/** Adjustment events must reference the original they correct. */
export function createAdjustmentEvent<TPayload extends Record<string, unknown>>(
  original: DomainEvent,
  input: Omit<CreateEventInput<TPayload & { reason: string }>, "supersedesEventId" | "aggregateType" | "aggregateId">,
): DomainEvent<TPayload & { reason: string }> {
  return createEvent({
    ...input,
    aggregateType: original.aggregateType,
    aggregateId: original.aggregateId,
    opportunityId: input.opportunityId ?? original.opportunityId,
    supersedesEventId: original.eventId,
    causationId: input.causationId ?? original.eventId,
  });
}

// ---------- Reducer ----------

export interface PaymentPayload extends Record<string, unknown> {
  amount: Money;
  contractId?: Id;
  providerRef: string;
  commercialCategory?: LedgerEntry["commercialCategory"];
  passThrough?: boolean;
}

export interface EventReduction {
  /** Events applied once each, in received order; duplicates by idempotencyKey are dropped. */
  applied: DomainEvent[];
  /** Duplicates that were ignored, kept auditable. */
  duplicates: DomainEvent[];
  /** Event ids superseded by an adjustment. */
  supersededEventIds: Set<Id>;
  /** Ledger projection built from payment/refund/dispute events. */
  ledger: LedgerEntry[];
  /** Net collected cash per opportunity (payments minus refunds/dispute debits plus dispute credits). Excludes pass-through. */
  netCollectedByOpportunity: Map<Id, Money>;
  /** Ledger entries with no opportunity: exception queue. */
  unlinkedLedgerEntries: LedgerEntry[];
  /** Latest applied event per (aggregateType, aggregateId), for state projections. */
  latestByAggregate: Map<string, DomainEvent>;
}

const PAYMENT_EVENT_TO_KIND: Record<string, LedgerEntry["kind"]> = {
  "payment.succeeded": "payment_collected",
  "payment.collected": "payment_collected",
  "payment.refunded": "refund",
  "payment.dispute_opened": "dispute_debit",
  "payment.dispute_won": "dispute_credit",
  "payment.fee": "fee",
};

function ledgerSign(kind: LedgerEntry["kind"]): 1 | -1 | 0 {
  switch (kind) {
    case "payment_collected":
    case "dispute_credit":
      return 1;
    case "refund":
    case "dispute_debit":
      return -1;
    case "fee":
      return 0; // fees are not subtracted from the commercial revenue basis by default policy
  }
}

/**
 * Dedupes by idempotencyKey, honors supersedesEventId, and projects a ledger.
 * Pure: same events in, same result out.
 */
export function applyEvents(events: DomainEvent[]): EventReduction {
  const seen = new Set<string>();
  const applied: DomainEvent[] = [];
  const duplicates: DomainEvent[] = [];
  const supersededEventIds = new Set<Id>();
  const latestByAggregate = new Map<string, DomainEvent>();

  const ordered = [...events].sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : 0));

  for (const ev of ordered) {
    if (seen.has(ev.idempotencyKey)) {
      duplicates.push(ev);
      continue;
    }
    seen.add(ev.idempotencyKey);
    applied.push(ev);
    if (ev.supersedesEventId) supersededEventIds.add(ev.supersedesEventId);
    latestByAggregate.set(`${ev.aggregateType}:${ev.aggregateId}`, ev);
  }

  const ledger: LedgerEntry[] = [];
  for (const ev of applied) {
    const kind = PAYMENT_EVENT_TO_KIND[ev.eventType];
    if (!kind) continue;
    if (supersededEventIds.has(ev.eventId)) continue; // corrected by an adjustment
    const payload = ev.payload as Partial<PaymentPayload>;
    if (!payload.amount) continue;
    ledger.push({
      tenantId: ev.tenantId,
      entryId: `ledger_${ev.eventId}`,
      opportunityId: ev.opportunityId,
      contractId: payload.contractId,
      kind,
      amount: payload.amount,
      providerRef: payload.providerRef ?? ev.sourceEventId ?? ev.eventId,
      idempotencyKey: ev.idempotencyKey,
      occurredAt: ev.occurredAt,
      receivedAt: ev.receivedAt,
      commercialCategory: payload.commercialCategory ?? "new_customer",
      passThrough: payload.passThrough,
    });
  }

  const netCollectedByOpportunity = new Map<Id, Money>();
  const unlinkedLedgerEntries: LedgerEntry[] = [];
  for (const entry of ledger) {
    if (!entry.opportunityId) {
      unlinkedLedgerEntries.push(entry);
      continue;
    }
    if (entry.passThrough) continue;
    const sign = ledgerSign(entry.kind);
    if (sign === 0) continue;
    const current = netCollectedByOpportunity.get(entry.opportunityId) ?? zero(entry.amount.currency);
    netCollectedByOpportunity.set(
      entry.opportunityId,
      sign === 1 ? add(current, entry.amount) : sub(current, entry.amount),
    );
  }

  return {
    applied,
    duplicates,
    supersededEventIds,
    ledger,
    netCollectedByOpportunity,
    unlinkedLedgerEntries,
    latestByAggregate,
  };
}

/** Net collected cash from a ledger slice, ignoring pass-through and fees (SOS-02 default policy). */
export function netCollectedFromLedger(entries: LedgerEntry[], currency = "USD"): Money {
  let total = zero(currency);
  for (const e of entries) {
    if (e.passThrough) continue;
    const sign = ledgerSign(e.kind);
    if (sign === 0) continue;
    total = sign === 1 ? add(total, e.amount) : sub(total, e.amount);
  }
  return total;
}
