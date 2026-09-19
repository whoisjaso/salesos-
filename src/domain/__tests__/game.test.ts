import { describe, expect, it } from "vitest";
import { LEVELS, XP_TABLE, deriveGameEvents, levelFor, playerState, qualityGate, streakDays, type GameEvent } from "@/domain/game";
import { NOW, obaviaDataset } from "@/fixtures/obavia";
import type { Call, Contract, LedgerEntry } from "@/domain/types";
import { emptyDataset, mkOpp } from "./helpers";

const ev = (kind: GameEvent["kind"], occurredAt: string, userId = "u1"): GameEvent => ({ kind, userId, occurredAt, evidenceRef: `ev_${occurredAt}` });

describe("levelFor", () => {
  it("maps cumulative XP to level thresholds", () => {
    expect(levelFor(0)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForNextLevel: 100, progress: 0 });
    expect(levelFor(99)).toMatchObject({ level: 1, xpIntoLevel: 99, progress: 0.99 });
    expect(levelFor(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNextLevel: 250, progress: 0 });
    expect(levelFor(175)).toMatchObject({ level: 2, xpIntoLevel: 75, progress: 0.5 });
    expect(levelFor(250)).toMatchObject({ level: 3, xpForNextLevel: 500 });
  });

  it("caps at the last level with progress 1 and no next threshold", () => {
    const max = LEVELS[LEVELS.length - 1];
    expect(levelFor(max)).toMatchObject({ level: LEVELS.length, xpForNextLevel: null, progress: 1 });
    expect(levelFor(max + 5000)).toMatchObject({ level: LEVELS.length, xpIntoLevel: 5000, xpForNextLevel: null, progress: 1 });
  });

  it("thresholds are strictly increasing from zero", () => {
    expect(LEVELS[0]).toBe(0);
    for (let i = 1; i < LEVELS.length; i += 1) expect(LEVELS[i]).toBeGreaterThan(LEVELS[i - 1]);
  });
});

describe("deriveGameEvents on the synthetic dataset", () => {
  const events = deriveGameEvents(obaviaDataset);
  const byId = <T extends { [k: string]: unknown }>(rows: T[], key: keyof T) => new Map(rows.map((r) => [r[key] as string, r]));
  const calls = byId(obaviaDataset.calls, "callId");
  const contracts = byId(obaviaDataset.contracts, "contractId");
  const ledger = byId(obaviaDataset.ledger, "entryId");
  const instances = byId(obaviaDataset.appointmentInstances, "instanceId");
  const assessments = byId(obaviaDataset.assessments, "assessmentId");

  it("yields only evidence-backed kinds, sorted by time", () => {
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(Object.keys(XP_TABLE)).toContain(e.kind);
      expect(e.evidenceRef).toBeTruthy();
    }
    for (let i = 1; i < events.length; i += 1) expect(events[i].occurredAt >= events[i - 1].occurredAt).toBe(true);
    // No practice or handoff events exist in the dataset: nothing is invented.
    expect(events.filter((e) => e.kind === "practice_completed" || e.kind === "handoff_accepted")).toHaveLength(0);
  });

  it("two_way_contact only from meaningful calls confirmed by rep or policy, with an end time", () => {
    const contact = events.filter((e) => e.kind === "two_way_contact");
    expect(contact.length).toBeGreaterThan(0);
    for (const e of contact) {
      const c = calls.get(e.evidenceRef) as Call;
      expect(c.interpretedOutcome).toBe("meaningful_interaction");
      expect(c.outcomeConfirmedBy).toBeDefined();
      expect(c.endedAt).toBe(e.occurredAt);
      expect(e.userId).toBe(c.userId);
    }
    const unconfirmed = obaviaDataset.calls.filter((c) => !c.outcomeConfirmedBy);
    expect(unconfirmed.length).toBeGreaterThan(0);
    for (const c of unconfirmed) expect(contact.find((e) => e.evidenceRef === c.callId)).toBeUndefined();
    // Voicemail / no_answer calls never earn contact XP even though policy confirmed them.
    const voicemail = obaviaDataset.calls.filter((c) => c.interpretedOutcome !== "meaningful_interaction");
    expect(voicemail.length).toBeGreaterThan(0);
    for (const c of voicemail) expect(contact.find((e) => e.evidenceRef === c.callId)).toBeUndefined();
  });

  it("retained bookings and attended shows come from instances, credited to setter and appointment rep", () => {
    const retained = events.filter((e) => e.kind === "retained_booking");
    for (const e of retained) {
      const inst = instances.get(e.evidenceRef);
      expect(inst?.retainedAfterReview).toBe(true);
      const opp = obaviaDataset.opportunities.find((o) => o.opportunityId === e.opportunityId);
      expect(opp?.currentOwner.setter).toBe(e.userId);
    }
    const shows = events.filter((e) => e.kind === "attended_show");
    expect(shows.length).toBeGreaterThan(0);
    for (const e of shows) {
      const inst = instances.get(e.evidenceRef);
      expect(inst?.outcome).toBe("attended");
      const appt = obaviaDataset.appointments.find((a) => a.appointmentId === inst?.appointmentId);
      expect(appt?.repUserId).toBe(e.userId);
    }
    const notAttended = obaviaDataset.appointmentInstances.filter((i) => i.outcome !== "attended");
    for (const i of notAttended) expect(shows.find((e) => e.evidenceRef === i.instanceId)).toBeUndefined();
  });

  it("verified_fit requires every objective rule yes and a confirmed review", () => {
    const fit = events.filter((e) => e.kind === "verified_fit");
    for (const e of fit) {
      const a = assessments.get(e.evidenceRef);
      expect(a?.reviewState).toBe("confirmed");
      expect(Object.values(a?.objective ?? {}).every((v) => v.value === "yes")).toBe(true);
    }
    const partial = obaviaDataset.assessments.filter((a) => Object.values(a.objective).some((v) => v.value !== "yes"));
    expect(partial.length).toBeGreaterThan(0);
    for (const a of partial) expect(fit.find((e) => e.evidenceRef === a.assessmentId)).toBeUndefined();
  });

  it("contract_signed and cash_collected come from signed contracts and real (non pass-through) payments", () => {
    const signed = events.filter((e) => e.kind === "contract_signed");
    expect(signed.length).toBeGreaterThan(0);
    for (const e of signed) {
      const c = contracts.get(e.evidenceRef) as Contract;
      expect(c.state).toBe("signed");
      expect(c.signedAt).toBe(e.occurredAt);
    }
    const cash = events.filter((e) => e.kind === "cash_collected");
    expect(cash.length).toBeGreaterThan(0);
    for (const e of cash) {
      const l = ledger.get(e.evidenceRef) as LedgerEntry;
      expect(l.kind).toBe("payment_collected");
      expect(l.passThrough).toBeFalsy();
      expect(l.opportunityId).toBe(e.opportunityId);
    }
    // Refunds and the unlinked payment never earn XP.
    const nonEarning = obaviaDataset.ledger.filter((l) => l.kind !== "payment_collected" || !l.opportunityId);
    expect(nonEarning.length).toBeGreaterThan(0);
    for (const l of nonEarning) expect(cash.find((e) => e.evidenceRef === l.entryId)).toBeUndefined();
  });
});

describe("deriveGameEvents refuses unverified inputs", () => {
  const opp = mkOpp("o1", { currentOwner: { setter: "s1", closer: "c1" } });
  const base = { tenantId: "t_test", opportunityId: "o1" };

  it("no event for a meaningful call without outcomeConfirmedBy or without an end time", () => {
    const unconfirmed: Call = { ...base, callId: "call_x", userId: "s1", direction: "outbound", transportState: "ended", startedAt: "2026-09-10T10:00:00Z", endedAt: "2026-09-10T10:05:00Z", durationSeconds: 300, interpretedOutcome: "meaningful_interaction", evidenceRefs: [] };
    const stillOpen: Call = { ...unconfirmed, callId: "call_y", outcomeConfirmedBy: "rep", endedAt: undefined, transportState: "connected" };
    const confirmed: Call = { ...unconfirmed, callId: "call_z", outcomeConfirmedBy: "rep" };
    const events = deriveGameEvents(emptyDataset({ opportunities: [opp], calls: [unconfirmed, stillOpen, confirmed] }));
    expect(events.map((e) => e.evidenceRef)).toEqual(["call_z"]);
  });

  it("no event for an unsigned or canceled contract", () => {
    const proposed: Contract = { ...base, contractId: "ctr_p", offerId: "offer_test", offerVersion: "1", value: { amountMinor: 100, currency: "USD" }, state: "proposed" };
    const canceled: Contract = { ...proposed, contractId: "ctr_c", state: "canceled", signedAt: "2026-09-10T10:00:00Z" };
    const signedNoDate: Contract = { ...proposed, contractId: "ctr_n", state: "signed" };
    const signed: Contract = { ...proposed, contractId: "ctr_s", state: "signed", signedAt: "2026-09-11T10:00:00Z" };
    const events = deriveGameEvents(emptyDataset({ opportunities: [opp], contracts: [proposed, canceled, signedNoDate, signed] }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "contract_signed", userId: "c1", evidenceRef: "ctr_s" });
  });

  it("no event for pass-through ledger entries, refunds, or unlinked payments", () => {
    const entry = (entryId: string, extra: Partial<LedgerEntry>): LedgerEntry => ({
      ...base, entryId, kind: "payment_collected", amount: { amountMinor: 480_000, currency: "USD" }, providerRef: entryId, idempotencyKey: `k:${entryId}`,
      occurredAt: "2026-09-10T10:00:00Z", receivedAt: "2026-09-10T10:00:05Z", commercialCategory: "new_customer", ...extra,
    });
    const ledger = [
      entry("led_tax", { passThrough: true }),
      entry("led_refund", { kind: "refund" }),
      entry("led_unlinked", { opportunityId: undefined }),
      entry("led_real", {}),
    ];
    const events = deriveGameEvents(emptyDataset({ opportunities: [opp], ledger }));
    expect(events.map((e) => e.evidenceRef)).toEqual(["led_real"]);
    expect(events[0].userId).toBe("c1");
  });
});

describe("XP split by track", () => {
  it("commercial, mastery, and team XP accumulate separately and never merge", () => {
    const dataset = emptyDataset({
      opportunities: [mkOpp("o1", { currentOwner: { setter: "s1", closer: "s1" } })],
      contracts: [{ tenantId: "t_test", contractId: "ctr_1", opportunityId: "o1", offerId: "offer_test", offerVersion: "1", value: { amountMinor: 1, currency: "USD" }, state: "signed", signedAt: "2026-09-10T10:00:00Z" }],
    });
    const state = playerState(dataset, "s1", NOW, { from: "2026-09-01T00:00:00Z", to: "2026-10-01T00:00:00Z" });
    expect(state.commercial.xp).toBe(XP_TABLE.contract_signed.xp);
    expect(state.mastery.xp).toBe(0);
    expect(state.team.xp).toBe(0);
    expect(XP_TABLE.practice_completed.track).toBe("mastery");
    expect(XP_TABLE.handoff_accepted.track).toBe("team");
    const tracks = new Set(Object.values(XP_TABLE).map((x) => x.track));
    expect(tracks).toEqual(new Set(["commercial", "mastery", "team"]));
  });
});

describe("streakDays", () => {
  const now = "2026-09-18T20:00:00Z";

  it("counts consecutive days ending today or yesterday", () => {
    expect(streakDays([ev("two_way_contact", "2026-09-18T09:00:00Z"), ev("two_way_contact", "2026-09-17T09:00:00Z"), ev("two_way_contact", "2026-09-16T23:59:00Z")], now)).toBe(3);
    // Nothing today yet: yesterday still anchors the streak.
    expect(streakDays([ev("two_way_contact", "2026-09-17T09:00:00Z"), ev("two_way_contact", "2026-09-16T09:00:00Z")], now)).toBe(2);
    expect(streakDays([], now)).toBe(0);
    // Two days silent: broken.
    expect(streakDays([ev("two_way_contact", "2026-09-16T09:00:00Z")], now)).toBe(0);
  });

  it("a gap breaks the streak", () => {
    const events = [ev("two_way_contact", "2026-09-18T09:00:00Z"), ev("two_way_contact", "2026-09-17T09:00:00Z"), ev("two_way_contact", "2026-09-15T09:00:00Z"), ev("two_way_contact", "2026-09-14T09:00:00Z")];
    expect(streakDays(events, now)).toBe(2);
  });

  it("approved leave days bridge the gap without counting as activity", () => {
    const events = [ev("two_way_contact", "2026-09-18T09:00:00Z"), ev("two_way_contact", "2026-09-17T09:00:00Z"), ev("two_way_contact", "2026-09-15T09:00:00Z"), ev("two_way_contact", "2026-09-14T09:00:00Z")];
    expect(streakDays(events, now, ["2026-09-16"])).toBe(4);
    // Leave at the start (today and yesterday off) still preserves the earlier run.
    expect(streakDays([ev("two_way_contact", "2026-09-16T09:00:00Z"), ev("two_way_contact", "2026-09-15T09:00:00Z")], now, ["2026-09-17", "2026-09-18"])).toBe(2);
  });
});

describe("qualityGate", () => {
  it("pauses the mechanic for the rep whose opportunity has a refund", () => {
    const refund = obaviaDataset.ledger.find((e) => e.kind === "refund");
    expect(refund?.opportunityId).toBeDefined();
    const opp = obaviaDataset.opportunities.find((o) => o.opportunityId === refund?.opportunityId);
    const closer = opp?.currentOwner.closer as string;
    expect(closer).toBeTruthy();
    const gate = qualityGate(obaviaDataset, closer);
    expect(gate.paused).toBe(true);
    expect(gate.reasons.join(" ")).toMatch(/refund or dispute/);
  });

  it("does not pause a rep with no incidents, and flags opt-outs on owned opportunities", () => {
    const clean = emptyDataset({ opportunities: [mkOpp("o1", { currentOwner: { setter: "s1" } })] });
    expect(qualityGate(clean, "s1")).toEqual({ paused: false, reasons: [] });
    const optedOut = emptyDataset({
      opportunities: [mkOpp("o1", { currentOwner: { setter: "s1" } })],
      contacts: [{ tenantId: "t_test", contactId: "ct_o1", displayName: "x", consent: { phone: "revoked", sms: "granted", email: "granted" } }],
    });
    expect(qualityGate(optedOut, "s1").reasons.join(" ")).toMatch(/opt-out/);
    // Another rep is unaffected by someone else's incident.
    expect(qualityGate(optedOut, "s2").paused).toBe(false);
  });
});

describe("playerState", () => {
  const season = { from: "2026-09-01T00:00:00Z", to: "2026-10-01T00:00:00Z" };
  const signed = (contractId: string, signedAt: string): Contract => ({ tenantId: "t_test", contractId, opportunityId: "o1", offerId: "offer_test", offerVersion: "1", value: { amountMinor: 1, currency: "USD" }, state: "signed", signedAt });
  const dataset = emptyDataset({
    opportunities: [mkOpp("o1", { currentOwner: { closer: "c1" } })],
    contracts: [
      signed("ctr_last_season", "2026-08-20T10:00:00Z"),
      signed("ctr_this_season", "2026-09-10T10:00:00Z"),
      signed("ctr_future", "2026-09-25T10:00:00Z"),
      signed("ctr_next_season", "2026-10-02T10:00:00Z"),
    ],
  });

  it("season window excludes prior seasons and anything after now", () => {
    const state = playerState(dataset, "c1", NOW, season);
    expect(state.recent.map((e) => e.evidenceRef)).toEqual(["ctr_this_season"]);
    expect(state.commercial.xp).toBe(XP_TABLE.contract_signed.xp);
    expect(state.lastEventAt).toBe("2026-09-10T10:00:00Z");
    expect(state.gate.paused).toBe(false);
    expect(state.userId).toBe("c1");
    expect(state.season).toEqual(season);
  });

  it("recent is newest first and capped at five", () => {
    const many = emptyDataset({
      opportunities: [mkOpp("o1", { currentOwner: { closer: "c1" } })],
      contracts: Array.from({ length: 7 }, (_, i) => signed(`ctr_${i}`, `2026-09-0${i + 1}T10:00:00Z`)),
    });
    const state = playerState(many, "c1", NOW, season);
    expect(state.recent).toHaveLength(5);
    expect(state.recent[0].evidenceRef).toBe("ctr_6");
    expect(state.commercial.xp).toBe(7 * XP_TABLE.contract_signed.xp);
  });

  it("ignores events belonging to other users", () => {
    expect(playerState(dataset, "someone_else", NOW, season).commercial.xp).toBe(0);
  });
});
