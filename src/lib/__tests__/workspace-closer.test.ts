/**
 * H4: an opened dispute is not a settled loss, a refund is not a collection, and
 * a payment still processing is neither.
 *
 * These pin the closer's financial ladder (docs/PAYMENTS_AUDIT.md H4,
 * specification 5 step 5 and 17.5).
 */
import { describe, expect, it } from "vitest";
import type { Opportunity } from "@/domain/types";
import { obaviaDataset } from "@/fixtures/obavia";
import { LADDER_INDEX, LADDER_STEPS, collectedFor, ladderIndex, ladderNote } from "../workspace-closer";

function opp(over: Partial<Opportunity> = {}): Opportunity {
  return {
    tenantId: "t1",
    opportunityId: "opp_1",
    contactIds: ["c1"],
    primaryContactId: "c1",
    offerId: "offer_1",
    workflowVersion: "1.0",
    entryPath: "form_entry",
    source: "test",
    commercialStatus: "open",
    accountabilityStartedAt: "2026-09-01T00:00:00.000Z",
    currentOwner: {},
    contactState: "two_way_contact",
    fitState: "verified",
    contractState: "signed",
    paymentState: "none",
    ...over,
  };
}

describe("the ladder has a Processing step", () => {
  it("lists seven steps with Processing between authorized and collected", () => {
    expect(LADDER_STEPS.map((s) => s.id)).toEqual([
      "verbal_yes",
      "proposal_sent",
      "signed",
      "payment_authorized",
      "payment_processing",
      "collected",
      "delivery_accepted",
    ]);
    expect(LADDER_INDEX.payment_authorized).toBeLessThan(LADDER_INDEX.payment_processing);
    expect(LADDER_INDEX.payment_processing).toBeLessThan(LADDER_INDEX.collected);
  });

  it("puts a processing payment on Processing, not on Collected and not on Signed", () => {
    const i = ladderIndex(opp({ paymentState: "processing" }), false);
    expect(i).toBe(LADDER_INDEX.payment_processing);
    expect(i).not.toBe(LADDER_INDEX.collected);
    expect(i).not.toBe(LADDER_INDEX.signed);
    expect(ladderNote(opp({ paymentState: "processing" }))?.label).toBe("Processing");
  });
});

describe("refunded is not collected", () => {
  it("returns a different index from collected", () => {
    const refunded = ladderIndex(opp({ paymentState: "refunded" }), false);
    const collected = ladderIndex(opp({ paymentState: "collected" }), false);
    expect(refunded).not.toBe(collected);
    expect(refunded).toBe(LADDER_INDEX.signed);
  });

  it("carries the reversal in words and an icon, and does not delete the sale", () => {
    const note = ladderNote(opp({ paymentState: "refunded" }));
    expect(note).not.toBeNull();
    expect(note?.reversed).toBe(true);
    expect(note?.atRisk).toBe(false);
    expect(note?.label).toBe("Refunded");
    expect(note?.icon.length).toBeGreaterThan(0);
    expect(note?.statement).toContain("not deleted");
  });
});

describe("a disputed payment shows a payment happened", () => {
  it("no longer falls through to Signed", () => {
    const disputed = ladderIndex(opp({ paymentState: "disputed" }), false);
    expect(disputed).not.toBe(LADDER_INDEX.signed);
    expect(disputed).toBe(LADDER_INDEX.collected);
  });

  it("reads as money at risk, never as a debit", () => {
    const note = ladderNote(opp({ paymentState: "disputed" }));
    expect(note?.atRisk).toBe(true);
    expect(note?.reversed).toBe(false);
    expect(note?.label).toBe("Dispute open");
    expect(note?.statement).toContain("at risk, not a debit");
  });
});

describe("the other states still read correctly", () => {
  it("authorized and partially collected are each their own state with a word", () => {
    expect(ladderIndex(opp({ paymentState: "authorized" }), false)).toBe(LADDER_INDEX.payment_authorized);
    expect(ladderNote(opp({ paymentState: "authorized" }))?.label).toBe("Authorized");
    expect(ladderIndex(opp({ paymentState: "partially_collected" }), false)).toBe(LADDER_INDEX.collected);
    expect(ladderNote(opp({ paymentState: "partially_collected" }))?.label).toBe("Part collected");
  });

  it("nothing commercial is -1, a verbal yes is the first step, and a settled collection carries no note", () => {
    expect(ladderIndex(opp({ contractState: "none" }), false)).toBe(-1);
    expect(ladderIndex(opp({ contractState: "none" }), true)).toBe(LADDER_INDEX.verbal_yes);
    expect(ladderIndex(opp({ contractState: "proposed" }), false)).toBe(LADDER_INDEX.proposal_sent);
    expect(ladderNote(opp({ paymentState: "collected" }))).toBeNull();
    expect(ladderNote(opp({ paymentState: "none" }))).toBeNull();
  });
});

describe("collectedFor keeps cash, risk and fees as three separate figures", () => {
  it("never folds them into one number", () => {
    const id = obaviaDataset.ledger.find((e) => e.opportunityId)?.opportunityId;
    expect(id).toBeDefined();
    const slice = collectedFor(obaviaDataset, id as string);
    expect(slice.net.currency).toBe(obaviaDataset.tenant.reportingCurrency);
    expect(slice.atRisk.currency).toBe(slice.net.currency);
    expect(slice.fees.currency).toBe(slice.net.currency);
    // Fees and at-risk are reported as positive magnitudes and are not in cash.
    expect(slice.fees.amountMinor).toBeGreaterThanOrEqual(0);
    expect(slice.atRisk.amountMinor).toBeGreaterThanOrEqual(0);
    expect(slice.entries.every((e) => e.opportunityId === id)).toBe(true);
  });
});
