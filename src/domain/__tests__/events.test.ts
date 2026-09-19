import { describe, expect, it } from "vitest";
import { applyEvents, createAdjustmentEvent, createEvent, netCollectedFromLedger } from "@/domain/events";
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

    const afterDispute = applyEvents([payment("evt_1", "2026-09-10T15:00:04Z"), refund, disputeOpen]);
    expect(afterDispute.netCollectedByOpportunity.get("opp_001")).toEqual(fromDollars(0));

    const afterWin = applyEvents([payment("evt_1", "2026-09-10T15:00:04Z"), refund, disputeOpen, disputeWon]);
    expect(afterWin.netCollectedByOpportunity.get("opp_001")).toEqual(fromDollars(8_000));
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
