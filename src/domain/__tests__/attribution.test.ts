import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_EXCEPTION_RULES,
  AUTHORIZED_CORRECTION_ROLES,
  UNSEALED_CREDIT_FALLBACK,
  appendAttributionCorrection,
  creditForEntry,
  effectiveCredit,
  identitiesAtIssue,
  ledgerCreditedTo,
  opportunitySealVerdict,
  opportunitiesCreditedTo,
  ordinaryEdit,
  sealAttribution,
  senderCredit,
  snapshotForEntry,
  snapshotsForOpportunity,
  type Actor,
  type DatasetWithAttribution,
} from "@/domain/attribution";
import { buildInstallments, companyCollected, createOrder, issueOrderForPayment, orderTotals } from "@/domain/orders";
import { cashRace, commissionSummary, recentCashDrops } from "@/domain/cashTiers";
import { deriveGameEvents } from "@/domain/game";
import { DEFAULT_LEADERBOARD_POLICY, buildStandings, type LeaderboardPolicy } from "@/domain/leaderboard";
import { ATTRIBUTION_FREEZE_POLICY } from "@/domain/types";
import type { AttributionSnapshot, CommissionPolicy, LedgerEntry, Order, PaymentRequest } from "@/domain/types";
import { obaviaDataset } from "@/fixtures/obavia";
import { emptyDataset, mkAssignment, mkOpp, mkUser } from "./helpers";

const NOW = "2026-09-18T20:00:00Z";
const SEASON = { from: "2026-09-01T00:00:00Z", to: "2026-10-01T00:00:00Z" };
const SEALED_AT = "2026-09-02T12:00:00Z";

const POLICIES: CommissionPolicy[] = [
  { tenantId: "t_test", policyVersion: "s5", effectiveFrom: "2026-08-01T00:00:00Z", basis: "net_collected_cash", ratePercent: 5, hypothetical: true, role: "setter" },
  { tenantId: "t_test", policyVersion: "c10", effectiveFrom: "2026-08-01T00:00:00Z", basis: "net_collected_cash", ratePercent: 10, hypothetical: true, role: "closer" },
];

const BOARD: LeaderboardPolicy = {
  ...DEFAULT_LEADERBOARD_POLICY,
  periodFrom: "2026-07-01T00:00:00Z",
  periodTo: "2026-10-01T00:00:00Z",
  minMaturedSample: 1,
  pauseOnUnresolvedData: false,
};

function payment(entryId: string, oppId: string, amountMinor: number, occurredAt: string, extra: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    tenantId: "t_test",
    entryId,
    opportunityId: oppId,
    kind: "payment_collected",
    amount: { amountMinor, currency: "USD" },
    providerRef: `pi_${entryId}`,
    idempotencyKey: `t_test:card_processor:acct_main:${entryId}`,
    occurredAt,
    receivedAt: occurredAt,
    commercialCategory: "new_customer",
    evidence: "processor_confirmed",
    environment: "live",
    ...extra,
  };
}

/** One order sealed to one setter and one closer, with a single installment. */
function sealedOrder(input: {
  orderId: string;
  snapshotId: string;
  opportunityId: string;
  amountMinor: number;
  setterUserId?: string;
  closerUserId?: string;
  count?: number;
}): { order: Order; snapshot: AttributionSnapshot } {
  const total = { amountMinor: input.amountMinor, currency: "USD" };
  const drafted = createOrder({
    tenantId: "t_test",
    orderId: input.orderId,
    opportunityId: input.opportunityId,
    offerId: "offer_test",
    offerVersion: "v1",
    contractedValue: total,
    installments: buildInstallments({ orderId: input.orderId, total, count: input.count ?? 1, firstDueAt: SEALED_AT, intervalDays: 30 }),
    createdAt: SEALED_AT,
    createdByUserId: input.closerUserId ?? "unknown",
    state: "approved",
  });
  return issueOrderForPayment(drafted, {
    snapshotId: input.snapshotId,
    issuedAt: SEALED_AT,
    frozenAt: SEALED_AT,
    commissionPolicyVersion: "c10",
    setterUserId: input.setterUserId,
    closerUserId: input.closerUserId,
  });
}

/**
 * Two reps, two sales, both sealed. closer_b already holds a row of their own,
 * so the "nothing moved" assertions compare rows that both genuinely exist.
 */
function sealedDataset(): DatasetWithAttribution {
  const one = sealedOrder({ orderId: "ord_1", snapshotId: "atr_1", opportunityId: "opp_1", amountMinor: 480_000, setterUserId: "setter_a", closerUserId: "closer_a" });
  const two = sealedOrder({ orderId: "ord_2", snapshotId: "atr_2", opportunityId: "opp_2", amountMinor: 300_000, setterUserId: "setter_a", closerUserId: "closer_b" });
  return {
    ...emptyDataset({
      users: [mkUser("setter_a", ["setter"]), mkUser("closer_a", ["closer"]), mkUser("closer_b", ["closer"]), mkUser("ops_user", ["owner"])],
      opportunities: [
        mkOpp("opp_1", { currentOwner: { setter: "setter_a", closer: "closer_a" }, leadTier: 1 }),
        mkOpp("opp_2", { currentOwner: { setter: "setter_a", closer: "closer_b" }, leadTier: 1 }),
      ],
      assignments: [
        mkAssignment("opp_1", "setter_a", "setter"),
        mkAssignment("opp_1", "closer_a", "closer"),
        mkAssignment("opp_2", "setter_a", "setter"),
        mkAssignment("opp_2", "closer_b", "closer"),
      ],
      ledger: [
        payment("led_1", "opp_1", 480_000, "2026-09-03T12:00:00Z", { orderId: "ord_1", attributionSnapshotId: "atr_1" }),
        payment("led_2", "opp_2", 300_000, "2026-09-04T12:00:00Z", { orderId: "ord_2", attributionSnapshotId: "atr_2" }),
      ],
    }),
    orders: [one.order, two.order],
    attributionSnapshots: [one.snapshot, two.snapshot],
  };
}

/** Change only who owns the contact today. Nothing else about the sale changes. */
function reassignCloser(data: DatasetWithAttribution, opportunityId: string, closer: string): DatasetWithAttribution {
  return {
    ...data,
    opportunities: data.opportunities.map((o) =>
      o.opportunityId === opportunityId ? { ...o, currentOwner: { ...o.currentOwner, closer } } : o,
    ),
  };
}

describe("the seal decides credit, not today's contact owner", () => {
  it("reassigning currentOwner after a collected payment leaves both users' commission and both standings rows byte-identical", () => {
    const before = sealedDataset();
    const after = reassignCloser(before, "opp_1", "closer_b");

    // The reassignment really happened.
    expect(after.opportunities.find((o) => o.opportunityId === "opp_1")?.currentOwner.closer).toBe("closer_b");

    for (const userId of ["setter_a", "closer_a", "closer_b"]) {
      expect(commissionSummary(after, userId, SEASON, NOW, POLICIES)).toEqual(
        commissionSummary(before, userId, SEASON, NOW, POLICIES),
      );
    }
    // closer_a keeps the whole $480,000 sale: 10 percent of it, and nothing moved to closer_b.
    expect(commissionSummary(after, "closer_a", SEASON, NOW, POLICIES).totalMinor).toBe(48_000);
    expect(commissionSummary(after, "closer_b", SEASON, NOW, POLICIES).totalMinor).toBe(30_000);

    const rowsBefore = buildStandings(before, "economic_output", BOARD, NOW).rows;
    const rowsAfter = buildStandings(after, "economic_output", BOARD, NOW).rows;
    expect(JSON.stringify(rowsAfter)).toBe(JSON.stringify(rowsBefore));

    expect(cashRace(after, SEASON, "closer")).toEqual(cashRace(before, SEASON, "closer"));
    expect(cashRace(after, SEASON, "setter")).toEqual(cashRace(before, SEASON, "setter"));
    expect(recentCashDrops(after, "closer_a", SEASON)).toEqual(recentCashDrops(before, "closer_a", SEASON));
    expect(recentCashDrops(after, "closer_b", SEASON)).toEqual(recentCashDrops(before, "closer_b", SEASON));

    const cashXp = (d: DatasetWithAttribution) => deriveGameEvents(d).filter((e) => e.kind === "cash_collected");
    expect(cashXp(after)).toEqual(cashXp(before));
    expect(cashXp(after).map((e) => e.userId)).toEqual(["closer_a", "closer_b"]);
  });

  it("without a seal the same reassignment does move the money, which is the defect this exists to close", () => {
    const sealed = sealedDataset();
    const unsealed: DatasetWithAttribution = {
      ...sealed,
      orders: [],
      attributionSnapshots: [],
      ledger: sealed.ledger.map((e) => ({ ...e, orderId: undefined, attributionSnapshotId: undefined })),
    };
    const moved = reassignCloser(unsealed, "opp_1", "closer_b");
    expect(commissionSummary(unsealed, "closer_a", SEASON, NOW, POLICIES).totalMinor).toBe(48_000);
    expect(commissionSummary(moved, "closer_a", SEASON, NOW, POLICIES).totalMinor).toBe(0);
    expect(commissionSummary(moved, "closer_b", SEASON, NOW, POLICIES).totalMinor).toBe(78_000);
    // And the fallback that produced that reading is one named constant.
    expect(UNSEALED_CREDIT_FALLBACK).toBe("current_owner");
    expect(creditForEntry(unsealed, unsealed.ledger[0]).source).toBe("current_owner");
    expect(creditForEntry(sealed, sealed.ledger[0]).source).toBe("snapshot");
  });

  it("seals at the policy's freeze point and reads credit from the snapshot, never from the opportunity", () => {
    const data = sealedDataset();
    const snapshot = snapshotForEntry(data, data.ledger[0]);
    expect(snapshot?.freezePoint).toBe(ATTRIBUTION_FREEZE_POLICY.sealedAt);
    expect(ATTRIBUTION_FREEZE_POLICY.ratified).toBe(false);
    expect(effectiveCredit(snapshot!)).toMatchObject({ setterUserId: "setter_a", closerUserId: "closer_a", source: "snapshot" });
    expect(opportunitySealVerdict(data, "opp_1", "closer_a", "closer")).toBe("sealed_to_user");
    expect(opportunitySealVerdict(data, "opp_1", "closer_b", "closer")).toBe("sealed_elsewhere");
    expect(opportunitySealVerdict(data, "opp_none", "closer_a", "closer")).toBe("unsealed");
    expect(ledgerCreditedTo(data, "closer_a", "closer").map((e) => e.entryId)).toEqual(["led_1"]);
    expect(opportunitiesCreditedTo(data, "closer_a", "closer").map((o) => o.opportunityId)).toEqual(["opp_1"]);
  });

  it("a snapshot with no representative is unallocated, and the collection is still genuine", () => {
    const snapshot = sealAttribution({
      snapshotId: "atr_none",
      order: { tenantId: "t_test", orderId: "ord_none", opportunityId: "opp_none" },
      frozenAt: SEALED_AT,
      commissionPolicyVersion: "c10",
    });
    expect(snapshot.unallocated).toBe(true);
    expect(effectiveCredit(snapshot).source).toBe("unallocated");
  });
});

describe("sending a payment request is not proof of being the closer", () => {
  const request: PaymentRequest = {
    tenantId: "t_test",
    paymentRequestId: "preq_1",
    orderId: "ord_1",
    opportunityId: "opp_1",
    attributionSnapshotId: "atr_1",
    amount: { amountMinor: 480_000, currency: "USD" },
    provider: "card_processor",
    providerAccountId: "acct_main",
    environment: "test",
    idempotencyKey: "t_test:preq_1",
    state: "sent",
    requestedByUserId: "ops_user",
    requestedAt: SEALED_AT,
  };

  it("a recorded payment-request sender receives no closer credit", () => {
    const data: DatasetWithAttribution = { ...sealedDataset(), paymentRequests: [request] };
    expect(senderCredit(request)).toBeNull();

    const ops = commissionSummary(data, "ops_user", SEASON, NOW, POLICIES);
    expect(ops.totalMinor).toBe(0);
    expect(recentCashDrops(data, "ops_user", SEASON)).toEqual([]);
    expect(cashRace(data, SEASON, "closer").some((r) => r.userId === "ops_user")).toBe(false);
    expect(deriveGameEvents(data).some((e) => e.kind === "cash_collected" && e.userId === "ops_user")).toBe(false);

    // The closer who actually sold it still has all of it.
    expect(commissionSummary(data, "closer_a", SEASON, NOW, POLICIES).totalMinor).toBe(48_000);
    expect(creditForEntry(data, data.ledger[0]).closerUserId).toBe("closer_a");
  });

  it("identitiesAtIssue takes the sender and drops it on the floor", () => {
    const opp = mkOpp("opp_1", { currentOwner: { setter: "setter_a", closer: "closer_a" }, pairId: "pair_1" });
    expect(identitiesAtIssue(opp, "ops_user")).toEqual({ setterUserId: "setter_a", closerUserId: "closer_a", pairId: "pair_1" });
    expect(identitiesAtIssue(opp, "ops_user")).toEqual(identitiesAtIssue(opp));
  });

  it("the synthetic fixture's payment request is sent by an operations user who earns nothing from it", () => {
    const req = obaviaDataset.paymentRequests?.[0];
    expect(req?.requestedByUserId).toBe("usr_owner_delphine");
    const snapshot = obaviaDataset.attributionSnapshots?.find((s) => s.snapshotId === req?.attributionSnapshotId);
    expect(snapshot?.closerUserId).not.toBe("usr_owner_delphine");
    expect(commissionSummary(obaviaDataset, "usr_owner_delphine", SEASON, "2026-09-18T20:00:00Z").totalMinor).toBe(0);
  });
});

describe("one contact, two orders", () => {
  function twoOrderDataset(): DatasetWithAttribution {
    const first = sealedOrder({ orderId: "ord_1", snapshotId: "atr_1", opportunityId: "opp_1", amountMinor: 480_000, setterUserId: "setter_a", closerUserId: "closer_a" });
    const upsell = sealedOrder({ orderId: "ord_2", snapshotId: "atr_2", opportunityId: "opp_1", amountMinor: 190_000, setterUserId: "setter_a", closerUserId: "closer_b" });
    return {
      ...emptyDataset({
        users: [mkUser("setter_a", ["setter"]), mkUser("closer_a", ["closer"]), mkUser("closer_b", ["closer"])],
        opportunities: [mkOpp("opp_1", { currentOwner: { setter: "setter_a", closer: "closer_a" } })],
        assignments: [mkAssignment("opp_1", "closer_a", "closer"), mkAssignment("opp_1", "setter_a", "setter")],
        ledger: [
          payment("led_1", "opp_1", 480_000, "2026-09-03T12:00:00Z", { orderId: "ord_1", attributionSnapshotId: "atr_1" }),
          payment("led_2", "opp_1", 190_000, "2026-09-10T12:00:00Z", { orderId: "ord_2", attributionSnapshotId: "atr_2" }),
        ],
      }),
      orders: [first.order, upsell.order],
      attributionSnapshots: [first.snapshot, upsell.snapshot],
    };
  }

  it("one contact with two orders yields two snapshots and two independent totals", () => {
    const data = twoOrderDataset();
    expect(snapshotsForOpportunity(data, "opp_1")).toHaveLength(2);
    expect(data.orders).toHaveLength(2);

    const [first, upsell] = data.orders!;
    expect(orderTotals(first, data.ledger).collected).toEqual({ amountMinor: 480_000, currency: "USD" });
    expect(orderTotals(upsell, data.ledger).collected).toEqual({ amountMinor: 190_000, currency: "USD" });
    expect(orderTotals(first, data.ledger).remainingScheduled.amountMinor).toBe(0);

    // A later upsell by a different closer does not extend the first closer's credit.
    expect(commissionSummary(data, "closer_a", SEASON, NOW, POLICIES).totalMinor).toBe(48_000);
    expect(commissionSummary(data, "closer_b", SEASON, NOW, POLICIES).totalMinor).toBe(19_000);

    // The setter carried both, so the setter view references both sales at the
    // setter rate. Role views are not additive: company cash is counted once.
    expect(commissionSummary(data, "setter_a", SEASON, NOW, POLICIES).totalMinor).toBe(33_500);
    expect(companyCollected(data.orders!, data.ledger, "USD")).toEqual({ amountMinor: 670_000, currency: "USD" });
    expect(cashRace(data, SEASON, "closer").map((r) => [r.userId, r.netCollectedMinor])).toEqual([
      ["closer_a", 480_000],
      ["closer_b", 190_000],
    ]);
  });

  it("an entry on a two-order contact that names no order is reported ambiguous, never guessed", () => {
    const data = twoOrderDataset();
    const orphan = payment("led_orphan", "opp_1", 100_000, "2026-09-12T12:00:00Z");
    const withOrphan: DatasetWithAttribution = { ...data, ledger: [...data.ledger, orphan] };
    expect(creditForEntry(withOrphan, orphan)).toEqual({ source: "ambiguous" });
    expect(ledgerCreditedTo(withOrphan, "closer_a", "closer").map((e) => e.entryId)).toEqual(["led_1"]);
    expect(commissionSummary(withOrphan, "closer_a", SEASON, NOW, POLICIES).totalMinor).toBe(48_000);
  });

  it("the synthetic fixture carries a second order on one contact, sold by a different closer", () => {
    const orders = obaviaDataset.orders ?? [];
    const upsell = orders.find((o) => o.orderId === "ord_upsell_01");
    expect(upsell).toBeDefined();
    const siblings = orders.filter((o) => o.opportunityId === upsell!.opportunityId);
    expect(siblings.length).toBe(2);
    const snapshots = snapshotsForOpportunity(obaviaDataset, upsell!.opportunityId);
    expect(snapshots).toHaveLength(2);
    expect(new Set(snapshots.map((s) => s.closerUserId)).size).toBe(2);
    // Nothing has been collected on the upsell, so it adds no cash anywhere.
    expect(orderTotals(upsell!, obaviaDataset.ledger).collected.amountMinor).toBe(0);
    expect(upsell!.installments).toHaveLength(3);
  });
});

describe("corrections are authorized, reasoned and appended", () => {
  const snapshot = sealedOrder({ orderId: "ord_1", snapshotId: "atr_1", opportunityId: "opp_1", amountMinor: 480_000, setterUserId: "setter_a", closerUserId: "closer_a" }).snapshot;
  const manager: Actor = { userId: "mgr", roles: ["manager"] };
  const request = {
    correctionId: "cor_1",
    at: "2026-09-12T09:00:00Z",
    rule: "manager_reassignment_before_payment",
    reason: "Late close completed by the second closer, per the approved exception rule.",
    next: { setterUserId: "setter_a", closerUserId: "closer_b" },
  };

  it("appends rather than overwrites, and keeps a copy of what stood before", () => {
    const outcome = appendAttributionCorrection(snapshot, request, manager);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(snapshot.corrections).toHaveLength(0); // the original is untouched
    expect(outcome.snapshot.corrections).toHaveLength(1);
    expect(outcome.snapshot.closerUserId).toBe("closer_a"); // the sealed field is never rewritten
    expect(outcome.correction.previous).toEqual({ setterUserId: "setter_a", closerUserId: "closer_a", pairId: undefined });
    expect(outcome.correction.authorizedByUserId).toBe("mgr");
    expect(outcome.correction.authorizerRole).toBe("manager");
    expect(effectiveCredit(outcome.snapshot).closerUserId).toBe("closer_b");
  });

  it("a representative cannot change their own credited closer, by correction or by an ordinary edit", () => {
    const self = appendAttributionCorrection(snapshot, { ...request, next: { closerUserId: "closer_a" } }, { userId: "closer_a", roles: ["closer"] });
    expect(self).toMatchObject({ ok: false, code: "not_authorized_role" });

    const managerButParty = appendAttributionCorrection(snapshot, request, { userId: "closer_b", roles: ["manager"] });
    expect(managerButParty).toMatchObject({ ok: false, code: "self_serving" });

    const edit = ordinaryEdit({ closerUserId: "closer_b", commissionPolicyVersion: "c99" });
    expect(edit.ok).toBe(false);
    expect(edit.refusedFields).toEqual(["closerUserId", "commissionPolicyVersion"]);
    expect(edit.reason).toMatch(/sealed at order issuance/);
    expect(AUTHORIZED_CORRECTION_ROLES).toEqual(["owner", "manager"]);
  });

  it("refuses an invented rule, a missing reason, and a correction that changes nothing", () => {
    expect(appendAttributionCorrection(snapshot, { ...request, rule: "because_they_worked_hard" }, manager)).toMatchObject({ ok: false, code: "unknown_rule" });
    expect(appendAttributionCorrection(snapshot, { ...request, reason: "   " }, manager)).toMatchObject({ ok: false, code: "reason_required" });
    expect(appendAttributionCorrection(snapshot, { ...request, next: { setterUserId: "setter_a", closerUserId: "closer_a" } }, manager)).toMatchObject({
      ok: false,
      code: "no_change",
    });
    expect(ATTRIBUTION_EXCEPTION_RULES.ratified).toBe(false);
    expect(ATTRIBUTION_EXCEPTION_RULES.rules).toContain("split_credit");
  });

  it("a corrected snapshot moves the money to the corrected closer and nowhere else", () => {
    const data = sealedDataset();
    const outcome = appendAttributionCorrection(data.attributionSnapshots![0], request, manager);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const corrected: DatasetWithAttribution = {
      ...data,
      attributionSnapshots: [outcome.snapshot, data.attributionSnapshots![1]],
    };
    expect(commissionSummary(corrected, "closer_a", SEASON, NOW, POLICIES).totalMinor).toBe(0);
    expect(commissionSummary(corrected, "closer_b", SEASON, NOW, POLICIES).totalMinor).toBe(78_000);
    // The reason and the authorizer travel with it.
    expect(corrected.attributionSnapshots![0].corrections[0].reason).toMatch(/approved exception rule/);
  });
});

describe("the fixture keeps every screen reading the same figures", () => {
  it("seals every signed agreement to the owners the fixture already used", () => {
    const snapshots = obaviaDataset.attributionSnapshots ?? [];
    expect(snapshots.length).toBeGreaterThan(0);
    for (const snapshot of snapshots) {
      if (snapshot.orderId === "ord_upsell_01") continue;
      const opp = obaviaDataset.opportunities.find((o) => o.opportunityId === snapshot.opportunityId);
      expect(snapshot.closerUserId).toBe(opp?.currentOwner.closer);
      expect(snapshot.setterUserId).toBe(opp?.currentOwner.setter);
      expect(snapshot.freezePoint).toBe("order_issued_for_payment");
      expect(snapshot.corrections).toEqual([]);
    }
    expect(obaviaDataset.synthetic).toBe(true);
  });

  it("binds every collected payment and refund on a signed agreement to its order", () => {
    const orderIds = new Set((obaviaDataset.orders ?? []).map((o) => o.orderId));
    const linked = obaviaDataset.ledger.filter((e) => e.contractId);
    expect(linked.length).toBeGreaterThan(0);
    for (const entry of linked) {
      expect(entry.orderId).toBeDefined();
      expect(orderIds.has(entry.orderId!)).toBe(true);
      expect(snapshotForEntry(obaviaDataset, entry)).toBeDefined();
    }
    // The unlinked payment stays unallocated: it belongs to no order and no rep.
    const unlinked = obaviaDataset.ledger.find((e) => e.opportunityId === undefined);
    expect(creditForEntry(obaviaDataset, unlinked!)).toEqual({ source: "unallocated" });
  });
});
