import { describe, expect, it } from "vitest";
import {
  applyEvents,
  buildEconomicMovementKey,
  cashByEvidenceClass,
  countsAsNetCollectedCash,
  createAdjustmentEvent,
  createEvent,
  disputeAtRiskFromLedger,
  evidenceOf,
  netCollectedFromLedger,
  LEDGER_ENVIRONMENT_FALLBACK,
  UNCLASSIFIED_EVIDENCE_FALLBACK,
  processingFeesFromLedger,
  type PaymentPayload,
} from "@/domain/events";
import { fromDollars } from "@/domain/money";

const payment = (eventId: string, receivedAt: string, sourceEventId = "pi_123") =>
  createEvent({
    eventId,
    tenantId: "obavia",
    eventType: "payment.succeeded",
    aggregateType: "payment",
    aggregateId: "pi_123",
    opportunityId: "opp_001",
    occurredAt: "2026-09-10T15:00:00Z",
    receivedAt,
    actorType: "integration",
    actorId: "card_processor",
    sourceSystem: "card_processor",
    sourceAccountId: "acct_main",
    sourceEventId,
    payload: { amount: fromDollars(10_000), providerRef: "pi_123" },
  });

describe("domain events", () => {
  it("builds the idempotency key as tenant:source:account:eventId", () => {
    const ev = payment("evt_1", "2026-09-10T15:00:04Z");
    expect(ev.idempotencyKey).toBe("obavia:card_processor:acct_main:pi_123");
    expect(ev.schemaVersion).toBe(1);
  });

  it("a payment delivered three times affects the ledger once (T01/T37)", () => {
    const events = [
      payment("evt_1", "2026-09-10T15:00:04Z"),
      payment("evt_1_retry", "2026-09-10T15:00:09Z"),
      payment("evt_1_retry2", "2026-09-10T16:00:00Z"),
    ];
    const r = applyEvents(events);
    expect(r.applied).toHaveLength(1);
    expect(r.duplicates).toHaveLength(2);
    expect(r.ledger).toHaveLength(1);
    expect(r.netCollectedByOpportunity.get("opp_001")).toEqual(fromDollars(10_000));
  });

  it("out-of-order delivery still yields one effect", () => {
    const r = applyEvents([payment("evt_late", "2026-09-11T00:00:00Z"), payment("evt_first", "2026-09-10T15:00:04Z")]);
    expect(r.applied[0].eventId).toBe("evt_first");
    expect(r.ledger).toHaveLength(1);
  });

  it("an opened dispute is at risk and debits nothing; a lost dispute debits exactly once", () => {
    const disputeOn = (eventType: string, sourceEventId: string, receivedAt: string) =>
      createEvent({
        eventId: `evt_${sourceEventId}`,
        tenantId: "obavia",
        eventType,
        aggregateType: "payment",
        aggregateId: "pi_123",
        opportunityId: "opp_001",
        occurredAt: "2026-09-13T10:00:00Z",
        receivedAt,
        actorType: "integration",
        actorId: "card_processor",
        sourceSystem: "card_processor",
        sourceAccountId: "acct_main",
        sourceEventId,
        payload: { amount: fromDollars(10_000), providerRef: "dp_1", evidence: "processor_confirmed" as const },
      });

    const collected = payment("evt_1", "2026-09-10T15:00:04Z");
    const opened = disputeOn("payment.dispute_opened", "dp_1", "2026-09-13T10:00:00Z");

    const atOpen = applyEvents([collected, opened]);
    expect(atOpen.netCollectedByOpportunity.get("opp_001")).toEqual(fromDollars(10_000));
    expect(atOpen.atRiskByOpportunity.get("opp_001")).toEqual(fromDollars(10_000));
    expect(disputeAtRiskFromLedger(atOpen.ledger)).toEqual(fromDollars(10_000));

    const lost = disputeOn("payment.dispute_lost", "dp_1_lost", "2026-09-20T10:00:00Z");
    const afterLoss = applyEvents([collected, opened, lost]);
    expect(afterLoss.netCollectedByOpportunity.get("opp_001")).toEqual(fromDollars(0));
    expect(afterLoss.atRiskByOpportunity.get("opp_001")).toBeUndefined();

    // The loss redelivered is still one debit.
    const redelivered = { ...lost, eventId: "evt_dp_1_lost_retry", receivedAt: "2026-09-20T10:05:00Z" };
    const afterRedelivery = applyEvents([collected, opened, lost, redelivered]);
    expect(afterRedelivery.netCollectedByOpportunity.get("opp_001")).toEqual(fromDollars(0));
    expect(netCollectedFromLedger(afterRedelivery.ledger)).toEqual(fromDollars(0));
  });

  it("refund and dispute movements net correctly without double subtraction (T38/T39)", () => {
    const refund = createEvent({
      eventId: "evt_refund",
      tenantId: "obavia",
      eventType: "payment.refunded",
      aggregateType: "payment",
      aggregateId: "pi_123",
      opportunityId: "opp_001",
      occurredAt: "2026-09-12T10:00:00Z",
      receivedAt: "2026-09-12T10:00:01Z",
      actorType: "integration",
      actorId: "card_processor",
      sourceSystem: "card_processor",
      sourceAccountId: "acct_main",
      sourceEventId: "re_1",
      payload: { amount: fromDollars(2_000), providerRef: "re_1" },
    });
    const disputeOpen = { ...refund, eventId: "evt_d1", eventType: "payment.dispute_opened", sourceEventId: "dp_1", idempotencyKey: "obavia:card_processor:acct_main:dp_1", payload: { amount: fromDollars(8_000), providerRef: "dp_1" }, receivedAt: "2026-09-13T10:00:00Z" };
    const disputeWon = { ...disputeOpen, eventId: "evt_d2", eventType: "payment.dispute_won", sourceEventId: "dp_1_won", idempotencyKey: "obavia:card_processor:acct_main:dp_1_won", receivedAt: "2026-09-14T10:00:00Z" };

    const afterRefund = applyEvents([payment("evt_1", "2026-09-10T15:00:04Z"), refund]);
    expect(afterRefund.netCollectedByOpportunity.get("opp_001")).toEqual(fromDollars(8_000));

    // Behaviour changed deliberately: an opened dispute used to debit cash on the
    // spot. Dispute risk and a recorded debit are different things (spec 17.5), so
    // the open now produces an at-risk figure and leaves cash alone.
    const afterDispute = applyEvents([payment("evt_1", "2026-09-10T15:00:04Z"), refund, disputeOpen]);
    expect(afterDispute.netCollectedByOpportunity.get("opp_001")).toEqual(fromDollars(8_000));
    expect(afterDispute.atRiskByOpportunity.get("opp_001")).toEqual(fromDollars(8_000));

    const afterWin = applyEvents([payment("evt_1", "2026-09-10T15:00:04Z"), refund, disputeOpen, disputeWon]);
    expect(afterWin.netCollectedByOpportunity.get("opp_001")).toEqual(fromDollars(8_000));
    expect(afterWin.atRiskByOpportunity.get("opp_001")).toBeUndefined();
    expect(netCollectedFromLedger(afterWin.ledger)).toEqual(fromDollars(8_000));
  });

  it("adjustment events reference the original and supersede its ledger effect", () => {
    const original = payment("evt_1", "2026-09-10T15:00:04Z");
    const adjustment = createAdjustmentEvent(original, {
      eventId: "evt_adj",
      tenantId: "obavia",
      eventType: "payment.succeeded",
      occurredAt: "2026-09-10T15:00:00Z",
      receivedAt: "2026-09-15T09:00:00Z",
      actorType: "user",
      actorId: "usr_owner_delphine",
      payload: { amount: fromDollars(9_500), providerRef: "pi_123", reason: "provider amount corrected after fee reversal" },
    });
    expect(adjustment.supersedesEventId).toBe("evt_1");
    expect(adjustment.causationId).toBe("evt_1");
    const r = applyEvents([original, adjustment]);
    expect(r.supersededEventIds.has("evt_1")).toBe(true);
    expect(r.ledger).toHaveLength(1);
    expect(r.netCollectedByOpportunity.get("opp_001")).toEqual(fromDollars(9_500));
  });

  it("unlinked payments go to the exception queue, not into any opportunity", () => {
    const ev = { ...payment("evt_u", "2026-09-10T15:00:04Z", "pi_unlinked"), opportunityId: undefined };
    const r = applyEvents([ev]);
    expect(r.unlinkedLedgerEntries).toHaveLength(1);
    expect(r.netCollectedByOpportunity.size).toBe(0);
  });
});

/** One movement, described by three different kinds of provider notification. */
const movement = (
  eventId: string,
  eventType: string,
  sourceEventId: string,
  receivedAt: string,
  extra: Partial<PaymentPayload> = {},
) =>
  createEvent<PaymentPayload>({
    eventId,
    tenantId: "obavia",
    eventType,
    aggregateType: "payment",
    aggregateId: "pi_777",
    opportunityId: "opp_001",
    occurredAt: "2026-09-10T15:00:00Z",
    receivedAt,
    actorType: "integration",
    actorId: "card_processor",
    sourceSystem: "card_processor",
    sourceAccountId: "acct_main",
    sourceEventId,
    environment: "live",
    payload: {
      amount: fromDollars(3_000),
      providerRef: "pi_777",
      providerMovementId: "pi_777",
      evidence: "processor_confirmed",
      ...extra,
    },
  });

describe("economic movement identity", () => {
  it("a checkout, a payment-intent and an invoice event describing one payment post once and total 3000", () => {
    const events = [
      movement("evt_checkout", "payment.succeeded", "cs_test_1", "2026-09-10T15:00:04Z"),
      movement("evt_intent", "payment.succeeded", "pi_evt_9", "2026-09-10T15:00:07Z"),
      movement("evt_invoice", "payment.collected", "in_evt_4", "2026-09-10T15:01:00Z"),
    ];
    const r = applyEvents(events);

    // Three genuine deliveries. None is a redelivery of another.
    expect(r.applied).toHaveLength(3);
    expect(r.duplicates).toHaveLength(0);
    // One movement, one ledger row, one three thousand dollars.
    expect(r.economicDuplicates.map((e) => e.eventId)).toEqual(["evt_intent", "evt_invoice"]);
    expect(r.ledger).toHaveLength(1);
    expect(r.netCollectedByOpportunity.get("opp_001")).toEqual(fromDollars(3_000));
    expect(netCollectedFromLedger(r.ledger)).toEqual(fromDollars(3_000));
  });

  it("the movement key separates provider, account and environment", () => {
    const base = { tenantId: "obavia", provider: "stripe", providerAccountId: "acct_a", environment: "live" as const, providerMovementId: "pi_777" };
    expect(buildEconomicMovementKey(base)).toBe("obavia:stripe:acct_a:live:pi_777");
    expect(buildEconomicMovementKey({ ...base, providerAccountId: "acct_b" })).not.toBe(buildEconomicMovementKey(base));
    expect(buildEconomicMovementKey({ ...base, environment: "test" })).not.toBe(buildEconomicMovementKey(base));
    expect(buildEconomicMovementKey({ ...base, provider: "whop" })).not.toBe(buildEconomicMovementKey(base));
    // No movement id means no economic dedupe. Guessing is not deduplication.
    expect(buildEconomicMovementKey({ ...base, providerMovementId: undefined })).toBeUndefined();
  });

  it("the same movement seen by a historical import and by an event is not two movements", () => {
    const fromEvent = movement("evt_live", "payment.succeeded", "pi_evt_9", "2026-09-10T15:00:07Z");
    const fromImport = movement("evt_import", "payment.succeeded", "import_row_12", "2026-09-11T02:00:00Z");
    const r = applyEvents([fromEvent, fromImport]);
    expect(r.ledger).toHaveLength(1);
    expect(r.netCollectedByOpportunity.get("opp_001")).toEqual(fromDollars(3_000));
  });
});

describe("evidence classification and the cash basis", () => {
  it("a manually marked paid movement is recorded and never enters net collected cash", () => {
    const marked = movement("evt_marked", "payment.collected", "in_evt_7", "2026-09-10T15:00:04Z", {
      evidence: "manually_marked_paid",
      providerMovementId: "in_777",
      providerRef: "in_777",
    });
    const r = applyEvents([marked]);

    // The record is genuine and kept.
    expect(r.ledger).toHaveLength(1);
    expect(r.ledger[0].evidence).toBe("manually_marked_paid");
    // It is not cash.
    expect(r.netCollectedByOpportunity.size).toBe(0);
    expect(netCollectedFromLedger(r.ledger)).toEqual(fromDollars(0));
    // And it is reported under its own class rather than lost.
    expect(cashByEvidenceClass(r.ledger).manually_marked_paid).toEqual(fromDollars(3_000));
    expect(cashByEvidenceClass(r.ledger).processor_confirmed).toEqual(fromDollars(0));
  });

  it("an imported spreadsheet row and an external wire are records, not processor-confirmed cash", () => {
    const imported = movement("evt_csv", "payment.collected", "row_3", "2026-09-10T15:00:04Z", {
      evidence: "imported_record",
      providerMovementId: "import_row_3",
    });
    const wire = movement("evt_wire", "payment.collected", "wire_8", "2026-09-10T15:00:05Z", {
      evidence: "externally_recorded",
      providerMovementId: "wire_8",
    });
    const r = applyEvents([imported, wire]);
    expect(r.ledger).toHaveLength(2);
    expect(netCollectedFromLedger(r.ledger)).toEqual(fromDollars(0));
    const byClass = cashByEvidenceClass(r.ledger);
    expect(byClass.imported_record).toEqual(fromDollars(3_000));
    expect(byClass.externally_recorded).toEqual(fromDollars(3_000));
  });

  it("a processing fee is excluded from cash and reported separately", () => {
    const paid = movement("evt_paid", "payment.succeeded", "pi_evt_1", "2026-09-10T15:00:04Z");
    const fee = movement("evt_fee", "payment.fee", "fee_1", "2026-09-10T15:00:05Z", {
      amount: fromDollars(87),
      providerMovementId: "fee_1",
      providerRef: "fee_1",
    });
    const r = applyEvents([paid, fee]);
    expect(r.netCollectedByOpportunity.get("opp_001")).toEqual(fromDollars(3_000));
    expect(processingFeesFromLedger(r.ledger)).toEqual(fromDollars(87));
  });

  it("a zero-amount movement creates no ledger entry and no cash", () => {
    const zeroInvoice = movement("evt_zero", "payment.collected", "in_zero", "2026-09-10T15:00:04Z", {
      amount: fromDollars(0),
      providerMovementId: "in_zero",
    });
    const r = applyEvents([zeroInvoice]);
    expect(r.zeroAmountEvents.map((e) => e.eventId)).toEqual(["evt_zero"]);
    expect(r.ledger).toHaveLength(0);
    expect(r.netCollectedByOpportunity.size).toBe(0);
  });

  it("an entry written before the evidence class existed resolves through one named fallback", () => {
    // The compatibility shim, pinned so that changing it is a visible decision
    // rather than a quiet one. The database column has no such default: every
    // persisted movement states how it is known.
    expect(UNCLASSIFIED_EVIDENCE_FALLBACK).toBe("processor_confirmed");
    expect(LEDGER_ENVIRONMENT_FALLBACK).toBe("live");
    const legacy = applyEvents([payment("evt_legacy", "2026-09-10T15:00:04Z", "pi_legacy")]).ledger[0];
    expect(legacy.evidence).toBeUndefined();
    expect(evidenceOf(legacy)).toBe(UNCLASSIFIED_EVIDENCE_FALLBACK);
    expect(countsAsNetCollectedCash(legacy)).toBe(true);
  });

  it("a test-environment movement is not live cash", () => {
    const testEvent = {
      ...movement("evt_test", "payment.succeeded", "pi_test_1", "2026-09-10T15:00:04Z", { environment: "test" }),
      environment: "test" as const,
    };
    const r = applyEvents([testEvent]);
    expect(r.ledger).toHaveLength(1);
    expect(r.ledger[0].environment).toBe("test");
    expect(r.netCollectedByOpportunity.size).toBe(0);
    expect(netCollectedFromLedger(r.ledger)).toEqual(fromDollars(0));
    expect(countsAsNetCollectedCash(r.ledger[0])).toBe(false);
  });
});
