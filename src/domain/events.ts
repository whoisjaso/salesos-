/**
 * Domain events: envelope construction and an idempotent reducer (SOS-03).
 * A provider payment delivered three times must produce one financial effect.
 */
import type {
  DomainEvent,
  EvidenceClass,
  ISODateTime,
  Id,
  LedgerEntry,
  Money,
  ProviderEnvironment,
} from "./types";
import { NET_COLLECTED_CASH_POLICY } from "./types";
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
  /** Live or test. Test deliveries never reach a live figure. */
  environment?: ProviderEnvironment;
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

/**
 * The identity of an ECONOMIC MOVEMENT, which is not the identity of the
 * delivery that carried it (specification 17.5). A checkout event, a
 * payment-intent event and an invoice event can each describe one $3,000
 * payment: three deliveries, one movement, one ledger row, $3,000.
 *
 * Provider, account and environment are all part of the key, because an external
 * payment id alone is not a global namespace (specification 15.4).
 *
 * Returns undefined when the caller cannot name the movement. An unnamed
 * movement is never deduplicated by guesswork; it falls back to delivery
 * identity alone and, when that is wrong, to an operations exception.
 */
export function buildEconomicMovementKey(input: {
  tenantId: Id;
  provider?: string;
  providerAccountId?: string;
  environment?: ProviderEnvironment;
  providerMovementId?: string;
}): string | undefined {
  if (!input.providerMovementId) return undefined;
  const provider = input.provider ?? "unknown_provider";
  const account = input.providerAccountId ?? "unknown_account";
  const environment = input.environment ?? LEDGER_ENVIRONMENT_FALLBACK;
  return `${input.tenantId}:${provider}:${account}:${environment}:${input.providerMovementId}`;
}

/**
 * Evidence class for a ledger entry written before the class existed.
 *
 * This is a compatibility shim for in-memory records only, kept as one named
 * constant so it is trivial to find and to change. The database column added by
 * the payments migration is NOT NULL with no default: every persisted movement
 * states how it is known. Every new writer must set `evidence` explicitly; the
 * spreadsheet importer in particular must write "imported_record", not this.
 */
export const UNCLASSIFIED_EVIDENCE_FALLBACK: EvidenceClass = "processor_confirmed";

/** Environment for a ledger entry written before the field existed. */
export const LEDGER_ENVIRONMENT_FALLBACK: ProviderEnvironment = "live";

export function evidenceOf(entry: Pick<LedgerEntry, "evidence">): EvidenceClass {
  return entry.evidence ?? UNCLASSIFIED_EVIDENCE_FALLBACK;
}

export function environmentOf(entry: Pick<LedgerEntry, "environment">): ProviderEnvironment {
  return entry.environment ?? LEDGER_ENVIRONMENT_FALLBACK;
}

/**
 * The sign a kind carries in the net-collected-cash basis.
 * 0 means the kind is a genuine record that this metric does not count:
 * a discussed price, a contracted value, an authorization, a payment still
 * processing, an opened dispute, a processing fee, a processor balance, a bank
 * payout, or a commission at any of its three stages.
 */
export function ledgerSign(kind: LedgerEntry["kind"]): 1 | -1 | 0 {
  switch (kind) {
    case "payment_collected":
    case "dispute_credit":
      return 1;
    case "refund":
    case "dispute_debit":
      return -1;
    case "price_discussed":
    case "contracted_value":
    case "payment_authorized":
    case "payment_processing":
    case "dispute_opened":
    case "dispute_closed_won":
    case "fee":
    case "processor_balance_credit":
    case "payout_to_bank":
    case "commission_accrued":
    case "commission_payable":
    case "commission_paid":
      return 0;
  }
}

/**
 * Whether an entry may be counted as net collected cash, under
 * NET_COLLECTED_CASH_POLICY. Four independent gates, each one a fact about the
 * record rather than an inference:
 *   1. the movement is processor-confirmed,
 *   2. it happened in the live environment,
 *   3. it is not a pass-through amount such as tax,
 *   4. its kind actually moves cash.
 *
 * Everything this refuses stays a genuine record and is reported separately.
 * XP, cash drops and any other cash-shaped read should route through this
 * predicate rather than testing `kind === "payment_collected"` on its own.
 */
export function countsAsNetCollectedCash(entry: LedgerEntry): boolean {
  if (!NET_COLLECTED_CASH_POLICY.countedEvidence.includes(evidenceOf(entry))) return false;
  if (environmentOf(entry) !== NET_COLLECTED_CASH_POLICY.countedEnvironment) return false;
  if (entry.passThrough) return false;
  return ledgerSign(entry.kind) !== 0;
}

/** The entries a cash figure is built from, in input order. */
export function collectedCashEntries(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter(countsAsNetCollectedCash);
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
    sourceAccountId: input.sourceAccountId,
    sourceEventId: input.sourceEventId,
    environment: input.environment,
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
  /** How the movement is known. Unset resolves through UNCLASSIFIED_EVIDENCE_FALLBACK. */
  evidence?: EvidenceClass;
  /** The provider's identifier for the movement, shared by every event describing it. */
  providerMovementId?: string;
  environment?: ProviderEnvironment;
  /** The order this movement pays down, bound before payment where possible. */
  orderId?: Id;
  /** The frozen credit this movement pays into. */
  attributionSnapshotId?: Id;
}

export interface EventReduction {
  /** Events applied once each, in received order; duplicates by idempotencyKey are dropped. */
  applied: DomainEvent[];
  /** Duplicates that were ignored, kept auditable. */
  duplicates: DomainEvent[];
  /**
   * Distinct deliveries that describe an economic movement another applied event
   * already posted. They are genuine events and are kept; they create no second
   * ledger row and no second dollar (specification 17.5).
   */
  economicDuplicates: DomainEvent[];
  /** Event ids superseded by an adjustment. */
  supersededEventIds: Set<Id>;
  /** Ledger projection built from payment/refund/dispute events. */
  ledger: LedgerEntry[];
  /** Net collected cash per opportunity. Processor-confirmed live movements only. */
  netCollectedByOpportunity: Map<Id, Money>;
  /** Money at risk from open disputes per opportunity. Never a realized debit. */
  atRiskByOpportunity: Map<Id, Money>;
  /** Ledger entries with no opportunity: exception queue. */
  unlinkedLedgerEntries: LedgerEntry[];
  /**
   * Movements that carry an amount of zero. A zero-balance invoice, a
   * complimentary membership or a zero-amount charge is a real record and
   * creates no cash, so it projects no ledger entry at all (scenario 17).
   */
  zeroAmountEvents: DomainEvent[];
  /** Latest applied event per (aggregateType, aggregateId), for state projections. */
  latestByAggregate: Map<string, DomainEvent>;
}

const PAYMENT_EVENT_TO_KIND: Record<string, LedgerEntry["kind"]> = {
  "payment.succeeded": "payment_collected",
  "payment.collected": "payment_collected",
  "payment.authorized": "payment_authorized",
  "payment.processing": "payment_processing",
  "payment.refunded": "refund",
  /** An opened dispute is money at risk, not a loss. It debits nothing. */
  "payment.dispute_opened": "dispute_opened",
  /** Only a lost dispute debits, and it debits exactly once. */
  "payment.dispute_lost": "dispute_debit",
  /** A won dispute clears the risk. No money moved, so no credit is minted. */
  "payment.dispute_won": "dispute_closed_won",
  /** A realized debit actually returned to the balance. */
  "payment.dispute_reversed": "dispute_credit",
  "payment.fee": "fee",
  "payment.balance_available": "processor_balance_credit",
  "payment.paid_out": "payout_to_bank",
};

/**
 * Dedupes by delivery identity AND, separately, by economic-movement identity;
 * honors supersedesEventId; and projects a ledger. Pure: same events in, same
 * result out.
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
  const economicDuplicates: DomainEvent[] = [];
  const zeroAmountEvents: DomainEvent[] = [];
  const postedMovements = new Set<string>();

  for (const ev of applied) {
    const kind = PAYMENT_EVENT_TO_KIND[ev.eventType];
    if (!kind) continue;
    if (supersededEventIds.has(ev.eventId)) continue; // corrected by an adjustment
    const payload = ev.payload as Partial<PaymentPayload>;
    if (!payload.amount) continue;
    // A zero-amount movement is a real record and no new cash. It posts nothing.
    if (payload.amount.amountMinor === 0) {
      zeroAmountEvents.push(ev);
      continue;
    }
    // Second dedupe, on economic-movement identity. One payment described by a
    // checkout event, a payment-intent event and an invoice event posts once.
    const environment = payload.environment ?? ev.environment;
    const movementKey = buildEconomicMovementKey({
      tenantId: ev.tenantId,
      provider: ev.sourceSystem,
      providerAccountId: eventAccountId(ev),
      environment,
      providerMovementId: payload.providerMovementId,
    });
    if (movementKey) {
      // The kind is part of the posting key, not of the movement's identity: a
      // charge and its processing fee can share one provider movement id and are
      // two different economic facts. Two notifications of the same fact share
      // both, and the second one posts nothing.
      const postingKey = `${movementKey}|${kind}`;
      if (postedMovements.has(postingKey)) {
        economicDuplicates.push(ev);
        continue;
      }
      postedMovements.add(postingKey);
    }
    ledger.push({
      tenantId: ev.tenantId,
      entryId: `ledger_${ev.eventId}`,
      opportunityId: ev.opportunityId,
      contractId: payload.contractId,
      orderId: payload.orderId,
      attributionSnapshotId: payload.attributionSnapshotId,
      kind,
      amount: payload.amount,
      providerRef: payload.providerRef ?? ev.sourceEventId ?? ev.eventId,
      idempotencyKey: ev.idempotencyKey,
      occurredAt: ev.occurredAt,
      receivedAt: ev.receivedAt,
      commercialCategory: payload.commercialCategory ?? "new_customer",
      passThrough: payload.passThrough,
      evidence: payload.evidence,
      provider: ev.sourceSystem,
      providerAccountId: eventAccountId(ev),
      environment,
      providerMovementId: payload.providerMovementId,
    });
  }

  const netCollectedByOpportunity = new Map<Id, Money>();
  const atRiskByOpportunity = new Map<Id, Money>();
  const unlinkedLedgerEntries: LedgerEntry[] = [];
  for (const entry of ledger) {
    if (!entry.opportunityId) {
      unlinkedLedgerEntries.push(entry);
      continue;
    }
    if (entry.kind === "dispute_opened" && countsAsAtRisk(entry)) {
      const at = atRiskByOpportunity.get(entry.opportunityId) ?? zero(entry.amount.currency);
      atRiskByOpportunity.set(entry.opportunityId, add(at, entry.amount));
      continue;
    }
    // A dispute that closed, won or lost, ends the risk it opened.
    if (entry.kind === "dispute_closed_won" || entry.kind === "dispute_debit") {
      const at = atRiskByOpportunity.get(entry.opportunityId);
      if (at) {
        const remaining = sub(at, entry.amount);
        if (remaining.amountMinor <= 0) atRiskByOpportunity.delete(entry.opportunityId);
        else atRiskByOpportunity.set(entry.opportunityId, remaining);
      }
    }
    if (!countsAsNetCollectedCash(entry)) continue;
    const sign = ledgerSign(entry.kind);
    const current = netCollectedByOpportunity.get(entry.opportunityId) ?? zero(entry.amount.currency);
    netCollectedByOpportunity.set(
      entry.opportunityId,
      sign === 1 ? add(current, entry.amount) : sub(current, entry.amount),
    );
  }

  return {
    applied,
    duplicates,
    economicDuplicates,
    supersededEventIds,
    ledger,
    netCollectedByOpportunity,
    atRiskByOpportunity,
    unlinkedLedgerEntries,
    zeroAmountEvents,
    latestByAggregate,
  };
}

/**
 * The provider account an event came from. Prefers the envelope field; falls
 * back to the account segment of "tenant:source:account:eventId" for events
 * built before the envelope carried it.
 */
function eventAccountId(ev: DomainEvent): string | undefined {
  if (ev.sourceAccountId) return ev.sourceAccountId;
  const parts = ev.idempotencyKey.split(":");
  if (parts.length < 4) return undefined;
  const account = parts[2];
  return account === "default" ? undefined : account;
}

/** An open dispute is at risk only when the money it threatens was real cash here. */
function countsAsAtRisk(entry: LedgerEntry): boolean {
  if (entry.kind !== "dispute_opened") return false;
  if (!NET_COLLECTED_CASH_POLICY.countedEvidence.includes(evidenceOf(entry))) return false;
  if (environmentOf(entry) !== NET_COLLECTED_CASH_POLICY.countedEnvironment) return false;
  return !entry.passThrough;
}

/**
 * Net collected cash from a ledger slice: processor-confirmed live movements
 * only, pass-through and processing fees excluded (NET_COLLECTED_CASH_POLICY).
 */
export function netCollectedFromLedger(entries: LedgerEntry[], currency = "USD"): Money {
  let total = zero(currency);
  for (const e of collectedCashEntries(entries)) {
    total = ledgerSign(e.kind) === 1 ? add(total, e.amount) : sub(total, e.amount);
  }
  return total;
}

/**
 * Money threatened by disputes that are open and not yet decided. An at-risk
 * figure is disclosed beside cash; it is never subtracted from it. A dispute
 * that has closed, won or lost, is no longer at risk.
 */
export function disputeAtRiskFromLedger(entries: LedgerEntry[], currency = "USD"): Money {
  let atRisk = zero(currency);
  for (const e of entries) {
    if (countsAsAtRisk(e)) atRisk = add(atRisk, e.amount);
  }
  for (const e of entries) {
    if (e.kind !== "dispute_closed_won" && e.kind !== "dispute_debit") continue;
    if (environmentOf(e) !== NET_COLLECTED_CASH_POLICY.countedEnvironment) continue;
    atRisk = sub(atRisk, e.amount);
  }
  return atRisk.amountMinor > 0 ? atRisk : zero(currency);
}

/**
 * Processing fees, reported separately and never netted into a sales metric.
 * Returned as a positive magnitude: it is a cost, not a negative sale.
 */
export function processingFeesFromLedger(entries: LedgerEntry[], currency = "USD"): Money {
  let total = zero(currency);
  for (const e of entries) {
    if (e.kind !== "fee") continue;
    if (environmentOf(e) !== NET_COLLECTED_CASH_POLICY.countedEnvironment) continue;
    total = add(total, e.amount);
  }
  return total;
}

/**
 * Every recorded movement grouped by how it is known, so that what net collected
 * cash refuses is still reported rather than lost. Amounts are signed magnitudes
 * of the cash-moving kinds within each class.
 */
export function cashByEvidenceClass(entries: LedgerEntry[], currency = "USD"): Record<EvidenceClass, Money> {
  const out: Record<EvidenceClass, Money> = {
    processor_confirmed: zero(currency),
    provider_reported: zero(currency),
    manually_marked_paid: zero(currency),
    externally_recorded: zero(currency),
    imported_record: zero(currency),
  };
  for (const e of entries) {
    if (e.passThrough) continue;
    if (environmentOf(e) !== NET_COLLECTED_CASH_POLICY.countedEnvironment) continue;
    const sign = ledgerSign(e.kind);
    if (sign === 0) continue;
    const cls = evidenceOf(e);
    out[cls] = sign === 1 ? add(out[cls], e.amount) : sub(out[cls], e.amount);
  }
  return out;
}
