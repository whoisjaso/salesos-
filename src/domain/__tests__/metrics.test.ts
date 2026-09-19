import { describe, expect, it } from "vitest";
import {
  computeAllMetrics,
  computeFunnel,
  computeM04,
  computeM06,
  computeM07,
  computeM08,
  computeM13,
  computeM14,
  computeM15,
  computeM16,
  computeM19,
  computeTeamRate,
  pooledRate,
} from "@/domain/metrics";
import { fromDollars } from "@/domain/money";
import { NOW, T0, emptyDataset, mkAssignment, mkInstance, mkOpp, mkUser } from "./helpers";
import { obaviaDataset, NOW as OBAVIA_NOW } from "@/fixtures/obavia";

describe("metric payload contract", () => {
  it("every M01..M21 payload carries the required fields and definitionVersion 1.0", () => {
    const all = computeAllMetrics(obaviaDataset, {}, OBAVIA_NOW);
    expect(Object.keys(all)).toHaveLength(21);
    for (const p of Object.values(all)) {
      expect(p.definitionVersion).toBe("1.0");
      expect(typeof p.numerator).toBe("number");
      expect(typeof p.denominator).toBe("number");
      expect(typeof p.unknownCount).toBe("number");
      expect(p.cohortId).toBeTruthy();
      expect(p.asOf).toBe(OBAVIA_NOW);
      expect(p.dataState).toBeTruthy();
      expect(p.evidenceQueryId).toBeTruthy();
    }
  });

  it("zero denominator yields value null, never zero or 100% (T33)", () => {
    const d = emptyDataset();
    const m = computeM04(d, {}, NOW);
    expect(m.value).toBeNull();
    expect(m.denominator).toBe(0);
    expect(m.refusalReason).toMatch(/N\/A/);
    const noWins = computeM14(emptyDataset({ opportunities: [mkOpp("o1"), mkOpp("o2")] }), {}, NOW);
    expect(noWins.value).toBeNull();
    expect(noWins.refusalReason).toBe("N/A: no wins");
  });

  it("team rate is sum(num)/sum(den), not the mean of rep percentages (T34)", () => {
    const users = [mkUser("a", ["setter"]), mkUser("b", ["setter"])];
    // Rep a: 1 of 1 contacted (100%). Rep b: 1 of 9 contacted (11%). Mean = 55.6%, pooled = 20%.
    const opps = [
      mkOpp("a1", { contactState: "two_way_contact", currentOwner: { setter: "a" } }),
      ...Array.from({ length: 9 }, (_, i) => mkOpp(`b${i}`, { contactState: i === 0 ? "two_way_contact" : "attempted", currentOwner: { setter: "b" } })),
    ];
    const assignments = opps.map((o) => mkAssignment(o.opportunityId, o.currentOwner.setter as string, "setter"));
    const d = emptyDataset({ users, opportunities: opps, assignments });
    const team = computeTeamRate("M04", d, ["a", "b"], {}, NOW);
    expect(team.numerator).toBe(2);
    expect(team.denominator).toBe(10);
    expect(team.value).toBeCloseTo(0.2, 12);
    const mean = (1 + 1 / 9) / 2;
    expect(team.value).not.toBeCloseTo(mean, 2);
    const pooled = pooledRate([computeM04(d, { userId: "a" }, NOW), computeM04(d, { userId: "b" }, NOW)], "team", NOW);
    expect(pooled.value).toBeCloseTo(0.2, 12);
  });

  it("a rep DQ keeps the opportunity in the assigned denominator (T05)", () => {
    const opps = [
      mkOpp("o1", { commercialStatus: "won" }),
      mkOpp("o2", { commercialStatus: "dq", dqReason: "no BDC" }),
      mkOpp("o3", { commercialStatus: "dq", dqReason: "closing" }),
      mkOpp("o4"),
    ];
    const d = emptyDataset({ opportunities: opps });
    expect(computeM13(d, {}, NOW).denominator).toBe(4);
    expect(computeM13(d, {}, NOW).value).toBeCloseTo(0.25, 12);
    const dq = computeM07(d, {}, NOW);
    expect(dq.numerator).toBe(2);
    expect(dq.denominator).toBe(4);
    expect(dq.label).toMatch(/contextual/i);
    // RPL denominator is unchanged by DQ.
    const withContract = emptyDataset({
      opportunities: opps,
      contracts: [{ tenantId: "t_test", contractId: "c1", opportunityId: "o1", offerId: "offer_test", offerVersion: "1", value: fromDollars(4_800), state: "signed" }],
    });
    expect(computeM15(withContract, {}, NOW).denominator).toBe(4);
    expect(computeM15(withContract, {}, NOW).value).toBe(120_000);
  });

  it("unknown attendance yields lower and upper bounds and dataState partial", () => {
    const opps = ["o1", "o2", "o3", "o4", "o5"].map((id) => mkOpp(id));
    const instances = [
      mkInstance("i1", "o1", "attended"),
      mkInstance("i2", "o2", "attended"),
      mkInstance("i3", "o3", "customer_no_show"),
      mkInstance("i4", "o4", "unknown"),
      mkInstance("i5", "o5", "canceled_before_cutoff"), // leaves the denominator
      mkInstance("i6", "o5", "attended", { supersedesInstanceId: "i5", scheduledStart: "2026-08-12T15:00:00Z", scheduledEnd: "2026-08-12T15:45:00Z" }),
    ];
    const d = emptyDataset({ opportunities: opps, appointmentInstances: instances });
    const show = computeM08(d, {}, NOW);
    expect(show.denominator).toBe(5);
    expect(show.numerator).toBe(3);
    expect(show.unknownCount).toBe(1);
    expect(show.dataState).toBe("partial");
    expect(show.bounds).toEqual({ lower: 3 / 5, upper: 4 / 5 });
    expect(show.timeBasis).toBe("scheduled_start");
  });

  it("immature instances are excluded from the show denominator", () => {
    const d = emptyDataset({
      opportunities: [mkOpp("o1")],
      appointmentInstances: [mkInstance("i1", "o1", "scheduled", { scheduledStart: "2026-09-20T15:00:00Z", scheduledEnd: "2026-09-20T15:45:00Z", matured: false })],
    });
    const show = computeM08(d, {}, NOW);
    expect(show.denominator).toBe(0);
    expect(show.value).toBeNull();
    expect(show.dataState).toBe("immature");
  });

  it("M15 and M16 carry different bases and never mix contract value with cash (T40)", () => {
    const d = emptyDataset({
      opportunities: [mkOpp("o1", { commercialStatus: "won", contractState: "signed" }), mkOpp("o2")],
      contracts: [{ tenantId: "t_test", contractId: "c1", opportunityId: "o1", offerId: "offer_test", offerVersion: "1", value: fromDollars(4_800), state: "signed" }],
      ledger: [],
    });
    const m15 = computeM15(d, {}, NOW);
    const m16 = computeM16(d, {}, NOW);
    expect(m15.basis).toBe("contracted_value");
    expect(m16.basis).toBe("net_collected_cash");
    expect(m15.value).toBe(240_000);
    expect(m16.value).toBe(0);
    expect(m16.numerator).toBe(0);
  });

  it("M16 nets refunds inside the cohort", () => {
    const base = {
      tenantId: "t_test",
      opportunityId: "o1",
      contractId: "c1",
      providerRef: "x",
      occurredAt: T0,
      receivedAt: T0,
      commercialCategory: "new_customer" as const,
    };
    const d = emptyDataset({
      opportunities: [mkOpp("o1", { commercialStatus: "won" })],
      ledger: [
        { ...base, entryId: "l1", kind: "payment_collected", amount: fromDollars(10_000), idempotencyKey: "k1" },
        { ...base, entryId: "l2", kind: "refund", amount: fromDollars(2_000), idempotencyKey: "k2" },
        { ...base, entryId: "l3", kind: "fee", amount: fromDollars(300), idempotencyKey: "k3" },
      ],
    });
    expect(computeM16(d, {}, NOW).numerator).toBe(800_000);
  });

  it("M19 is commission per attended appointment, labeled not hourly (T42)", () => {
    const d = emptyDataset({
      opportunities: [mkOpp("o1", { commercialStatus: "won" })],
      appointmentInstances: [mkInstance("i1", "o1", "attended"), mkInstance("i2", "o1", "attended", { scheduledStart: "2026-08-14T15:00:00Z", scheduledEnd: "2026-08-14T15:45:00Z" })],
      commissionEntries: [{ tenantId: "t_test", entryId: "cm1", userId: "u1", opportunityId: "o1", policyVersion: "p", amount: fromDollars(240), state: "payable" }],
    });
    const m19 = computeM19(d, {}, NOW);
    expect(m19.value).toBe(12_000);
    expect(m19.denominator).toBe(2);
    expect(m19.label).toMatch(/per attended appointment/);
    expect(m19.label).toMatch(/not an hourly rate/);
  });

  it("retained bookings are counted per opportunity, once", () => {
    const d = emptyDataset({
      opportunities: [mkOpp("o1"), mkOpp("o2")],
      appointmentInstances: [mkInstance("i1", "o1", "attended"), mkInstance("i2", "o1", "attended", { scheduledStart: "2026-08-20T15:00:00Z", scheduledEnd: "2026-08-20T15:45:00Z" })],
    });
    expect(computeM06(d, {}, NOW).numerator).toBe(1);
  });
});

describe("funnel connectors (SOS-20)", () => {
  it("refuses a connector when the numerator stage's parent is not the from stage", () => {
    const funnel = computeFunnel(obaviaDataset, {}, OBAVIA_NOW);
    expect(funnel.stages.map((s) => s.stageId)).toEqual([
      "assigned", "two_way_contact", "retained_booking", "attended", "perceived_qualified", "won", "net_collected_cash",
    ]);
    const refused = funnel.connectors.find((c) => c.fromStageId === "two_way_contact" && c.toStageId === "retained_booking");
    expect(refused?.metric).toBeNull();
    expect(refused?.verdict.label).toBe("Split path");
    expect(refused?.verdict.explanation).toMatch(/not a subset/);
    const allowed = funnel.connectors.find((c) => c.fromStageId === "assigned" && c.toStageId === "two_way_contact");
    expect(allowed?.metric?.value).not.toBeNull();
    expect(allowed?.metric?.denominator).toBe(90);
  });

  it("allows the contact -> retained connector for the form_entry path where booking follows contact", () => {
    const funnel = computeFunnel(obaviaDataset, { entryPath: "form_entry" }, OBAVIA_NOW);
    const conn = funnel.connectors.find((c) => c.fromStageId === "two_way_contact" && c.toStageId === "retained_booking");
    expect(conn?.metric).not.toBeNull();
    expect(conn?.metric?.refusalReason).toBeUndefined();
  });

  it("labels the money stage with its basis and carries unresolved counts", () => {
    const funnel = computeFunnel(obaviaDataset, {}, OBAVIA_NOW);
    const cash = funnel.stages.find((s) => s.stageId === "net_collected_cash");
    expect(cash?.basis).toBe("net_collected_cash");
    expect(cash?.money?.currency).toBe("USD");
    expect(cash?.supportingText).toMatch(/net collected cash/);
    const attended = funnel.stages.find((s) => s.stageId === "attended");
    expect(attended?.unknownCount).toBeGreaterThan(0);
    expect(attended?.dataState).toBe("partial");
  });
});
