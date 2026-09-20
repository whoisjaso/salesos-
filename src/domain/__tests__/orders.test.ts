import { describe, expect, it } from "vitest";
import {
  buildInstallments,
  commissionAccruals,
  companyCollected,
  createOrder,
  installmentCollections,
  issueOrderForPayment,
  orderLedger,
  orderTotals,
  ordersFor,
  scheduledTotal,
  splitEvenly,
} from "@/domain/orders";
import { effectiveCredit, type DatasetWithAttribution } from "@/domain/attribution";
import { COMMISSION_RATE_DEFAULTS, type CommissionPolicy, type LedgerEntry, type Order } from "@/domain/types";
import { obaviaDataset } from "@/fixtures/obavia";
import { emptyDataset, mkOpp, mkUser } from "./helpers";

const ISSUED_AT = "2026-09-01T12:00:00Z";

/** The repository's recorded rates, not the specification example's. */
const POLICIES: CommissionPolicy[] = [
  {
    tenantId: "t_test",
    policyVersion: "commission-hypothetical-0.1",
    effectiveFrom: "2026-08-01T00:00:00Z",
    basis: "net_collected_cash",
    ratePercent: COMMISSION_RATE_DEFAULTS.setterPercent,
    hypothetical: true,
    role: "setter",
  },
  {
    tenantId: "t_test",
    policyVersion: "commission-hypothetical-0.1",
    effectiveFrom: "2026-08-01T00:00:00Z",
    basis: "net_collected_cash",
    ratePercent: COMMISSION_RATE_DEFAULTS.closerPercent,
    hypothetical: true,
    role: "closer",
  },
];

function usd(amountMinor: number) {
  return { amountMinor, currency: "USD" };
}

function movement(entryId: string, amountMinor: number, occurredAt: string, extra: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    tenantId: "t_test",
    entryId,
    opportunityId: "opp_1",
    orderId: "ord_1",
    kind: "payment_collected",
    amount: usd(amountMinor),
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

/** USD 12,000 as four installments of USD 3,000, issued and sealed. */
function twelveThousand(): { order: Order; snapshotId: string; sealed: ReturnType<typeof issueOrderForPayment> } {
  const total = usd(1_200_000);
  const drafted = createOrder({
    tenantId: "t_test",
    orderId: "ord_1",
    opportunityId: "opp_1",
    offerId: "offer_test",
    offerVersion: "v1",
    contractedValue: total,
    installments: buildInstallments({ orderId: "ord_1", total, count: 4, firstDueAt: ISSUED_AT, intervalDays: 30 }),
    createdAt: ISSUED_AT,
    createdByUserId: "closer_a",
    state: "approved",
  });
  const sealed = issueOrderForPayment(drafted, {
    snapshotId: "atr_1",
    issuedAt: ISSUED_AT,
    frozenAt: ISSUED_AT,
    commissionPolicyVersion: "commission-hypothetical-0.1",
    setterUserId: "setter_a",
    closerUserId: "closer_a",
  });
  return { order: sealed.order, snapshotId: "atr_1", sealed };
}

describe("splitting a price without a float", () => {
  it("parts sum back to the whole, with the remainder on the earliest parts", () => {
    expect(splitEvenly(usd(1_200_000), 4).map((m) => m.amountMinor)).toEqual([300_000, 300_000, 300_000, 300_000]);
    expect(splitEvenly(usd(1_000), 3).map((m) => m.amountMinor)).toEqual([334, 333, 333]);
    expect(splitEvenly(usd(190_000), 3).map((m) => m.amountMinor)).toEqual([63_334, 63_333, 63_333]);
    for (const [amount, count] of [[1_000, 3], [1, 7], [999_999, 11], [480_000, 4]] as const) {
      const parts = splitEvenly(usd(amount), count);
      expect(parts.reduce((a, p) => a + p.amountMinor, 0)).toBe(amount);
      for (const p of parts) expect(Number.isInteger(p.amountMinor)).toBe(true);
    }
    expect(() => splitEvenly(usd(100), 0)).toThrow(/at least 1/);
    expect(() => splitEvenly(usd(100), 2.5)).toThrow(/whole count/);
  });

  it("a schedule that disagrees with the price is refused, not quietly accepted", () => {
    const total = usd(1_200_000);
    const good = buildInstallments({ orderId: "ord_1", total, count: 4, firstDueAt: ISSUED_AT, intervalDays: 30 });
    expect(scheduledTotal({ installments: good, contractedValue: total })).toEqual(total);
    expect(() =>
      createOrder({
        tenantId: "t_test",
        orderId: "ord_1",
        opportunityId: "opp_1",
        offerId: "offer_test",
        offerVersion: "v1",
        contractedValue: total,
        installments: good.slice(0, 3),
        createdAt: ISSUED_AT,
        createdByUserId: "closer_a",
      }),
    ).toThrow(/the schedule totals/);
  });

  it("numbers each installment in order and dates them from the injected first due date", () => {
    const parts = buildInstallments({ orderId: "ord_1", total: usd(1_200_000), count: 4, firstDueAt: ISSUED_AT, intervalDays: 30 });
    expect(parts.map((p) => p.sequence)).toEqual([1, 2, 3, 4]);
    expect(parts.map((p) => p.installmentId)).toEqual(["ord_1_i01", "ord_1_i02", "ord_1_i03", "ord_1_i04"]);
    expect(parts[0].dueAt).toBe("2026-09-01T12:00:00Z");
    expect(parts[3].dueAt).toBe("2026-11-30T12:00:00Z");
    expect(parts.every((p) => p.state === "scheduled")).toBe(true);
  });
});

describe("issuing an order seals its credit once", () => {
  it("sets the seal, the issue time and the state, without mutating the draft", () => {
    const total = usd(480_000);
    const drafted = createOrder({
      tenantId: "t_test",
      orderId: "ord_1",
      opportunityId: "opp_1",
      offerId: "offer_test",
      offerVersion: "v1",
      contractedValue: total,
      installments: buildInstallments({ orderId: "ord_1", total, count: 1, firstDueAt: ISSUED_AT, intervalDays: 30 }),
      createdAt: ISSUED_AT,
      createdByUserId: "closer_a",
    });
    expect(drafted.state).toBe("draft");
    const { order, snapshot } = issueOrderForPayment(drafted, {
      snapshotId: "atr_1",
      issuedAt: ISSUED_AT,
      frozenAt: ISSUED_AT,
      commissionPolicyVersion: "commission-hypothetical-0.1",
      setterUserId: "setter_a",
      closerUserId: "closer_a",
    });
    expect(drafted.attributionSnapshotId).toBeUndefined();
    expect(order.state).toBe("issued_for_payment");
    expect(order.issuedForPaymentAt).toBe(ISSUED_AT);
    expect(order.attributionSnapshotId).toBe("atr_1");
    expect(effectiveCredit(snapshot)).toMatchObject({ setterUserId: "setter_a", closerUserId: "closer_a" });
    expect(() => issueOrderForPayment(order, { snapshotId: "atr_2", issuedAt: ISSUED_AT, frozenAt: ISSUED_AT, commissionPolicyVersion: "x" })).toThrow(
      /already issued and sealed/,
    );
  });
});

describe("commission accrues per successful installment", () => {
  it("only the collected installment accrues commission", () => {
    const { order, sealed } = twelveThousand();
    const ledger = [movement("led_1", 300_000, "2026-09-03T12:00:00Z")];

    const rows = installmentCollections(order, ledger);
    expect(rows.map((r) => [r.installment.sequence, r.collected.amountMinor, r.state])).toEqual([
      [1, 300_000, "collected"],
      [2, 0, "scheduled"],
      [3, 0, "scheduled"],
      [4, 0, "scheduled"],
    ]);

    const accruals = commissionAccruals(order, sealed.snapshot, ledger, POLICIES);
    expect(accruals).toHaveLength(2);
    expect(accruals.map((a) => [a.userId, a.role, a.sequence, a.basisAmount.amountMinor, a.amount.amountMinor])).toEqual([
      ["setter_a", "setter", 1, 300_000, 15_000],
      ["closer_a", "closer", 1, 300_000, 30_000],
    ]);
    // Never the whole contract: $12,000 contracted, $3,000 collected, and the
    // closer accrues on $3,000.
    expect(accruals.every((a) => a.basisAmount.amountMinor < order.contractedValue.amountMinor)).toBe(true);
    expect(accruals.every((a) => a.policyVersion === "commission-hypothetical-0.1" && a.hypothetical)).toBe(true);

    const totals = orderTotals(order, ledger);
    expect(totals).toMatchObject({
      contracted: usd(1_200_000),
      collected: usd(300_000),
      remainingScheduled: usd(900_000),
      collectedInstallments: 1,
      totalInstallments: 4,
    });
  });

  it("the second installment adds its own accrual and nothing retroactive", () => {
    const { order, sealed } = twelveThousand();
    const one = [movement("led_1", 300_000, "2026-09-03T12:00:00Z")];
    const two = [...one, movement("led_2", 300_000, "2026-10-03T12:00:00Z")];
    expect(commissionAccruals(order, sealed.snapshot, two, POLICIES)).toHaveLength(4);
    expect(commissionAccruals(order, sealed.snapshot, two, POLICIES).slice(0, 2)).toEqual(
      commissionAccruals(order, sealed.snapshot, one, POLICIES),
    );
    expect(orderTotals(order, two).collectedInstallments).toBe(2);
    expect(orderTotals(order, two).remainingScheduled).toEqual(usd(600_000));
  });

  it("a failed installment adds no collected cash and no cash-backed commission", () => {
    const { order, sealed } = twelveThousand();
    const failed = [
      movement("led_1", 300_000, "2026-09-03T12:00:00Z"),
      movement("led_2", 300_000, "2026-10-03T12:00:00Z", { kind: "payment_processing" }),
    ];
    expect(orderTotals(order, failed).collected).toEqual(usd(300_000));
    expect(commissionAccruals(order, sealed.snapshot, failed, POLICIES)).toHaveLength(2);
  });

  it("a part payment satisfies no installment, so nothing accrues on it", () => {
    const { order, sealed } = twelveThousand();
    const part = [movement("led_1", 100_000, "2026-09-03T12:00:00Z")];
    expect(installmentCollections(order, part)[0].state).toBe("requested");
    expect(commissionAccruals(order, sealed.snapshot, part, POLICIES)).toEqual([]);
    expect(orderTotals(order, part).collected).toEqual(usd(100_000));
  });

  it("setter and closer read the same money, and the company counts it once", () => {
    const { order, sealed } = twelveThousand();
    const ledger = [movement("led_1", 300_000, "2026-09-03T12:00:00Z")];
    const accruals = commissionAccruals(order, sealed.snapshot, ledger, POLICIES);
    const [setter, closer] = accruals;
    expect(setter.basisAmount).toEqual(closer.basisAmount);
    expect(setter.installmentId).toBe(closer.installmentId);
    // The two role views are not additive. Company collected cash is the basis,
    // once, and never the sum of the two views' bases.
    expect(companyCollected([order], ledger, "USD")).toEqual(usd(300_000));
    expect(companyCollected([order], ledger, "USD").amountMinor).not.toBe(setter.basisAmount.amountMinor + closer.basisAmount.amountMinor);
  });

  it("an unallocated snapshot accrues nothing while the collection stays real", () => {
    const { order } = twelveThousand();
    const ledger = [movement("led_1", 300_000, "2026-09-03T12:00:00Z")];
    const unallocated = { ...twelveThousand().sealed.snapshot, setterUserId: undefined, closerUserId: undefined, unallocated: true };
    expect(commissionAccruals(order, unallocated, ledger, POLICIES)).toEqual([]);
    expect(orderTotals(order, ledger).collected).toEqual(usd(300_000));
  });
});

describe("only processor-confirmed live cash satisfies an installment", () => {
  const cases: [string, Partial<LedgerEntry>][] = [
    ["an invoice marked paid outside the processor", { evidence: "manually_marked_paid" }],
    ["a spreadsheet import", { evidence: "imported_record" }],
    ["a wire recorded by hand", { evidence: "externally_recorded" }],
    ["a commerce platform's own report", { evidence: "provider_reported" }],
    ["a test-mode movement", { environment: "test" }],
    ["a pass-through amount", { passThrough: true }],
    ["a payment still processing", { kind: "payment_processing" }],
  ];

  it.each(cases)("%s is a real record and satisfies no installment", (_label, patch) => {
    const { order, sealed } = twelveThousand();
    const ledger = [movement("led_1", 300_000, "2026-09-03T12:00:00Z", patch)];
    expect(orderTotals(order, ledger).collected).toEqual(usd(0));
    expect(orderTotals(order, ledger).collectedInstallments).toBe(0);
    expect(commissionAccruals(order, sealed.snapshot, ledger, POLICIES)).toEqual([]);
  });
});

describe("allocation across a schedule", () => {
  it("fills the schedule in order, and an explicit binding wins over the waterfall", () => {
    const { order } = twelveThousand();
    const ledger = [movement("led_1", 300_000, "2026-09-03T12:00:00Z")];
    expect(installmentCollections(order, ledger, { led_1: "ord_1_i03" }).map((r) => r.collected.amountMinor)).toEqual([0, 0, 300_000, 0]);
    expect(installmentCollections(order, ledger).map((r) => r.collected.amountMinor)).toEqual([300_000, 0, 0, 0]);
  });

  it("a confirmed refund reduces the most recently satisfied installment and deletes nothing", () => {
    const { order, sealed } = twelveThousand();
    const ledger = [
      movement("led_1", 300_000, "2026-09-03T12:00:00Z"),
      movement("led_2", 300_000, "2026-10-03T12:00:00Z"),
      movement("led_3", 300_000, "2026-10-10T12:00:00Z", { kind: "refund" }),
    ];
    const rows = installmentCollections(order, ledger);
    expect(rows.map((r) => r.collected.amountMinor)).toEqual([300_000, 0, 0, 0]);
    expect(rows[1].adjusted).toEqual(usd(300_000));
    expect(orderTotals(order, ledger).collected).toEqual(usd(300_000));
    expect(commissionAccruals(order, sealed.snapshot, ledger, POLICIES)).toHaveLength(2);
    // The original payments are still in the ledger. Nothing was deleted.
    expect(orderLedger(order, ledger).map((e) => e.entryId)).toEqual(["led_1", "led_2", "led_3"]);
  });

  it("an opened dispute is at risk and satisfies nothing away; only a lost one debits", () => {
    const { order } = twelveThousand();
    const collected = movement("led_1", 300_000, "2026-09-03T12:00:00Z");
    const opened = movement("led_2", 300_000, "2026-09-10T12:00:00Z", { kind: "dispute_opened" });
    const lost = movement("led_3", 300_000, "2026-09-20T12:00:00Z", { kind: "dispute_debit" });
    expect(orderTotals(order, [collected, opened]).collected).toEqual(usd(300_000));
    expect(orderTotals(order, [collected, opened, lost]).collected).toEqual(usd(0));
  });

  it("money beyond the schedule is kept as a fact and satisfies no further installment", () => {
    const { order } = twelveThousand();
    const ledger = [movement("led_1", 1_500_000, "2026-09-03T12:00:00Z")];
    const rows = installmentCollections(order, ledger);
    expect(rows.map((r) => r.collected.amountMinor)).toEqual([300_000, 300_000, 300_000, 300_000]);
    expect(orderTotals(order, ledger).remainingScheduled).toEqual(usd(0));
  });

  it("only movements bound to this order are read", () => {
    const { order } = twelveThousand();
    const other = movement("led_other", 300_000, "2026-09-03T12:00:00Z", { orderId: "ord_other" });
    const none = movement("led_none", 300_000, "2026-09-03T12:00:00Z", { orderId: undefined });
    expect(orderLedger(order, [other, none])).toEqual([]);
    expect(orderTotals(order, [other, none]).collected).toEqual(usd(0));
  });
});

describe("orders on the synthetic dataset", () => {
  it("gives every signed agreement one order whose schedule matches its contract", () => {
    const orders = obaviaDataset.orders ?? [];
    expect(orders.length).toBeGreaterThan(0);
    for (const order of orders) {
      expect(scheduledTotal(order)).toEqual(order.contractedValue);
      expect(order.state).toBe("issued_for_payment");
      expect(order.attributionSnapshotId).toBeDefined();
      if (!order.contractId) continue;
      const contract = obaviaDataset.contracts.find((c) => c.contractId === order.contractId);
      expect(order.contractedValue).toEqual(contract?.value);
    }
  });

  it("keeps the collected cash on each order equal to what the ledger already said", () => {
    for (const order of obaviaDataset.orders ?? []) {
      const totals = orderTotals(order, obaviaDataset.ledger);
      expect(totals.collected.currency).toBe("USD");
      expect(totals.remainingScheduled.amountMinor).toBeGreaterThanOrEqual(0);
    }
    const contactWithTwo = ordersFor(obaviaDataset, (obaviaDataset.orders ?? [])[0].opportunityId);
    expect(contactWithTwo.length).toBe(2);
    expect(new Set(contactWithTwo.map((o) => o.orderId)).size).toBe(2);
  });

  it("is still labelled synthetic and still owns exactly one unlinked payment", () => {
    const dataset: DatasetWithAttribution = obaviaDataset;
    expect(dataset.synthetic).toBe(true);
    expect(dataset.ledger.filter((e) => e.opportunityId === undefined)).toHaveLength(1);
    const bare: DatasetWithAttribution = emptyDataset({ users: [mkUser("u", ["closer"])], opportunities: [mkOpp("o")] });
    expect(bare.orders).toBeUndefined();
    expect(bare.attributionSnapshots).toBeUndefined();
  });
});
