import { describe, expect, it } from "vitest";
import {
  BASIS_SURFACES,
  METRIC_SURFACES,
  SURFACES,
  SURFACE_DISPOSITION,
  emptyScope,
  heldSurfaces,
  holdFor,
  holdForMetric,
  incidentsForSurface,
  isHeld,
  scopeIncidents,
  standingsHold,
  surfacesForMetric,
} from "@/domain/incidents";
import type { Call, Contact, DataIncident, LedgerEntry } from "@/domain/types";
import { NOW, emptyDataset, mkInstance, mkOpp } from "./helpers";

const opp = (id: string, closer = "c1") => mkOpp(id, { currentOwner: { closer } });

function ledger(entryId: string, extra: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    tenantId: "t_test",
    entryId,
    opportunityId: "o1",
    kind: "payment_collected",
    amount: { amountMinor: 480_000, currency: "USD" },
    providerRef: entryId,
    idempotencyKey: `k:${entryId}`,
    occurredAt: "2026-09-10T10:00:00Z",
    receivedAt: "2026-09-10T10:00:05Z",
    commercialCategory: "new_customer",
    ...extra,
  };
}

function contact(contactId: string, consent: Contact["consent"]): Contact {
  return { tenantId: "t_test", contactId, displayName: contactId, consent };
}

const granted: Contact["consent"] = { phone: "granted", sms: "granted", email: "granted" };

describe("surface vocabulary", () => {
  it("covers exactly the declared surfaces, each with a disposition", () => {
    expect(SURFACES).toEqual([
      "revenue_attribution",
      "commission",
      "standings",
      "attendance_outcome",
      "contact_permission",
      "communication_read",
    ]);
    for (const surface of SURFACES) expect(SURFACE_DISPOSITION[surface]).toBeTruthy();
    // A rank and a blocked action are withheld; a money figure is shown and labeled.
    expect(SURFACE_DISPOSITION.standings).toBe("withheld");
    expect(SURFACE_DISPOSITION.contact_permission).toBe("withheld");
    expect(SURFACE_DISPOSITION.revenue_attribution).toBe("provisional");
    expect(SURFACE_DISPOSITION.commission).toBe("provisional");
  });

  it("a metric rests on the surfaces its evidence rests on, and most rest on none", () => {
    expect(surfacesForMetric("M16")).toEqual(["revenue_attribution"]);
    expect(surfacesForMetric("M08")).toEqual(["attendance_outcome"]);
    expect(surfacesForMetric("M11")).toEqual([]); // qualified to win: no payment, no attendance
    expect(surfacesForMetric("M06")).toEqual([]);
    expect(METRIC_SURFACES.M19).toEqual(["revenue_attribution", "commission"]);
    // Contracted value does not rest on payment attribution.
    expect(BASIS_SURFACES.contracted_value).toEqual([]);
    expect(BASIS_SURFACES.net_collected_cash).toEqual(["revenue_attribution"]);
  });

  it("an empty scope holds nothing and still answers every surface", () => {
    const scope = emptyScope();
    expect(scope.incidents).toEqual([]);
    expect(heldSurfaces(scope)).toEqual([]);
    for (const surface of SURFACES) {
      expect(scope.surfaces[surface].held).toBe(false);
      expect(scope.surfaces[surface].disposition).toBe("reliable");
      expect(scope.surfaces[surface].statement).toMatch(/no open incident/);
    }
  });
});

describe("an unlinked payment holds attribution and nothing else", () => {
  const dataset = emptyDataset({
    opportunities: [opp("o1")],
    contacts: [contact("ct_o1", granted)],
    ledger: [ledger("led_unlinked", { opportunityId: undefined })],
  });
  const scope = scopeIncidents(dataset, { now: NOW });

  it("declares its surfaces, its owner, what it waits on, and a one-sentence effect", () => {
    expect(scope.incidents).toHaveLength(1);
    const incident = scope.incidents[0];
    expect(incident.kind).toBe("unlinked_payment");
    expect(incident.surfaces).toEqual(["revenue_attribution", "commission"]);
    expect(incident.owner).toBe("sales_ops");
    expect(incident.ownerLabel).toBe("Sales ops");
    expect(incident.waitingOn).toMatch(/1 unlinked payment is mapped to an opportunity/);
    expect(incident.effect).toMatch(/calling, appointments, conversation coaching, and every other verified result keep running/);
    expect(incident.effect.split(". ")).toHaveLength(1); // one sentence
    expect(incident.subjects.ledgerEntryIds).toEqual(["led_unlinked"]);
    expect(incident.openedAt).toBe("2026-09-10T10:00:05Z");
    expect(incident.count).toBe(1);
  });

  it("holds only the surfaces it declares", () => {
    expect(heldSurfaces(scope)).toEqual(["revenue_attribution", "commission"]);
    expect(isHeld(scope, "revenue_attribution")).toBe(true);
    expect(isHeld(scope, "commission")).toBe(true);
    expect(isHeld(scope, "attendance_outcome")).toBe(false);
    expect(isHeld(scope, "communication_read")).toBe(false);
    expect(isHeld(scope, "contact_permission")).toBe(false);
    // The roster itself is untouched; a board derives its own hold from its basis.
    expect(isHeld(scope, "standings")).toBe(false);
  });

  it("answers 'is this number provisional, and why' per number", () => {
    expect(holdForMetric(scope, "M16")?.statement).toMatch(/Collected revenue attribution is provisional until/);
    expect(holdForMetric(scope, "M16")?.action).toBe("verify payment mapping");
    expect(holdForMetric(scope, "M16")?.ownerLabel).toBe("Sales ops");
    // Transcript and funnel metrics are never touched by a payment.
    expect(holdForMetric(scope, "M11")).toBeNull();
    expect(holdForMetric(scope, "M04")).toBeNull();
    expect(holdFor(scope, [])).toBeNull();
  });

  it("holds a cash-basis standing and leaves a contracted-value standing alone", () => {
    expect(standingsHold(scope, "net_collected_cash")?.surface).toBe("revenue_attribution");
    expect(standingsHold(scope, "contracted_value")).toBeNull();
    expect(standingsHold(scope, "reported_revenue")).toBeNull();
  });

  it("is never narrowed to one rep, because an unattributed payment could be anyone's", () => {
    expect(scopeIncidents(dataset, { userId: "c1", now: NOW }).incidents).toHaveLength(1);
    expect(scopeIncidents(dataset, { userId: "someone_else", now: NOW }).incidents).toHaveLength(1);
  });

  it("is deterministic: the same dataset gives the same scope", () => {
    expect(JSON.stringify(scopeIncidents(dataset, { now: NOW }))).toBe(JSON.stringify(scopeIncidents(dataset, { now: NOW })));
  });
});

describe("incidents bound to opportunities are scoped to the person", () => {
  const dataset = emptyDataset({
    opportunities: [opp("o1", "c1"), opp("o2", "c2")],
    contacts: [contact("ct_o1", granted), contact("ct_o2", granted)],
    ledger: [ledger("led_refund", { opportunityId: "o2", kind: "refund" })],
  });

  it("a refund on another rep's opportunity never reaches my scope", () => {
    expect(scopeIncidents(dataset, { userId: "c2", now: NOW }).incidents.map((i) => i.kind)).toEqual(["refund_under_review"]);
    expect(scopeIncidents(dataset, { userId: "c1", now: NOW }).incidents).toEqual([]);
    expect(scopeIncidents(dataset, { now: NOW }).incidents.map((i) => i.kind)).toEqual(["refund_under_review"]);
  });

  it("a refund restates cash and commission, not the person's activity", () => {
    const scope = scopeIncidents(dataset, { userId: "c2", now: NOW });
    expect(scope.incidents[0].surfaces).toEqual(["revenue_attribution", "commission"]);
    expect(scope.incidents[0].owner).toBe("finance");
    expect(scope.incidents[0].effect).toMatch(/levels, and streaks are untouched/);
  });
});

describe("attendance, permission, and conversation reads", () => {
  it("a matured appointment with no evidence holds the attendance outcome only", () => {
    const dataset = emptyDataset({
      opportunities: [opp("o1")],
      contacts: [contact("ct_o1", granted)],
      appointmentInstances: [mkInstance("inst_open", "o1", "unknown"), mkInstance("inst_done", "o1", "attended")],
    });
    const scope = scopeIncidents(dataset, { now: NOW });
    expect(heldSurfaces(scope)).toEqual(["attendance_outcome"]);
    const incident = scope.incidents[0];
    expect(incident.count).toBe(1);
    expect(incident.subjects.appointmentInstanceIds).toEqual(["inst_open"]);
    expect(incident.effect).toMatch(/other meetings, lead work, and coaching from conversations are unaffected/);
  });

  it("an immature appointment is not an incident: it is simply not due yet", () => {
    const dataset = emptyDataset({
      opportunities: [opp("o1")],
      appointmentInstances: [
        mkInstance("inst_future", "o1", "scheduled", { matured: false, scheduledStart: "2026-09-19T15:00:00Z", scheduledEnd: "2026-09-19T15:45:00Z" }),
      ],
    });
    expect(scopeIncidents(dataset, { now: NOW }).incidents).toEqual([]);
  });

  it("a missing permission record and a real opt-out are different incidents on the same surface", () => {
    const dataset = emptyDataset({
      opportunities: [opp("o1"), opp("o2")],
      contacts: [contact("ct_o1", { ...granted, sms: "unknown" }), contact("ct_o2", { ...granted, phone: "revoked" })],
    });
    const scope = scopeIncidents(dataset, { now: NOW });
    expect(scope.incidents.map((i) => i.kind).sort()).toEqual(["contact_restriction", "missing_consent_record"]);
    expect(heldSurfaces(scope)).toEqual(["contact_permission"]);
    expect(incidentsForSurface(scope, "contact_permission")).toHaveLength(2);
    const restriction = scope.incidents.find((i) => i.kind === "contact_restriction");
    expect(restriction?.owner).toBe("rep");
    expect(restriction?.effect).toMatch(/that one action is blocked with its reason/);
    const missing = scope.incidents.find((i) => i.kind === "missing_consent_record");
    expect(missing?.owner).toBe("sales_ops");
    // Neither touches any measurement.
    expect(isHeld(scope, "revenue_attribution")).toBe(false);
    expect(isHeld(scope, "attendance_outcome")).toBe(false);
  });

  it("a call with no confirmed outcome makes the read tentative and nothing else", () => {
    const base: Call = {
      tenantId: "t_test",
      callId: "call_1",
      opportunityId: "o1",
      userId: "c1",
      direction: "outbound",
      transportState: "ended",
      startedAt: "2026-09-12T10:00:00Z",
      endedAt: "2026-09-12T10:06:00Z",
      interpretedOutcome: "meaningful_interaction",
      evidenceRefs: [],
    };
    const dataset = emptyDataset({
      opportunities: [opp("o1")],
      contacts: [contact("ct_o1", granted)],
      calls: [base, { ...base, callId: "call_2", outcomeConfirmedBy: "rep" }],
    });
    const scope = scopeIncidents(dataset, { now: NOW });
    expect(heldSurfaces(scope)).toEqual(["communication_read"]);
    expect(scope.incidents[0].subjects.callIds).toEqual(["call_1"]);
    expect(scope.incidents[0].effect).toMatch(/the brief, the known facts, and the conversation continue/);
    expect(holdForMetric(scope, "M04")?.action).toBe("review the conversation and confirm its outcome");
    expect(holdForMetric(scope, "M16")).toBeNull();
  });
});

describe("stale syncs and declared incidents", () => {
  const dataset = emptyDataset({ opportunities: [opp("o1")], contacts: [contact("ct_o1", granted)] });

  it("a sync is stale only past its window, and holds only the surfaces it declares", () => {
    const stale = scopeIncidents(dataset, {
      now: NOW,
      staleSyncs: [{ label: "Payments provider", surfaces: ["revenue_attribution"], lastSyncedAt: "2026-09-15T20:00:00Z" }],
    });
    expect(stale.incidents.map((i) => i.kind)).toEqual(["stale_sync"]);
    expect(heldSurfaces(stale)).toEqual(["revenue_attribution"]);
    expect(stale.incidents[0].title).toMatch(/72 hours ago/);

    const fresh = scopeIncidents(dataset, {
      now: NOW,
      staleSyncs: [{ label: "Payments provider", surfaces: ["revenue_attribution"], lastSyncedAt: "2026-09-18T12:00:00Z" }],
    });
    expect(fresh.incidents).toEqual([]);
  });

  it("without an injected clock nothing is late: a missing time never holds a measurement", () => {
    const scope = scopeIncidents(dataset, {
      staleSyncs: [{ label: "Payments provider", surfaces: ["revenue_attribution"], lastSyncedAt: "2020-01-01T00:00:00Z" }],
    });
    expect(scope.incidents).toEqual([]);
  });

  it("a declared incident holds exactly the surfaces it declares", () => {
    const declared: DataIncident = {
      incidentId: "inc_roster",
      severity: "critical",
      title: "Roster import half applied",
      affected: "team board",
      owner: "sales_ops",
      openedAt: "2026-09-17T09:00:00Z",
      kind: "stale_sync",
      surfaces: ["standings"],
      waitingOn: "the roster import finishes",
    };
    const scope = scopeIncidents(dataset, { now: NOW, declared: [declared] });
    expect(heldSurfaces(scope)).toEqual(["standings"]);
    expect(standingsHold(scope, "contracted_value")?.surface).toBe("standings");
    expect(isHeld(scope, "revenue_attribution")).toBe(false);
  });

  it("a declared incident with no declared scope holds nothing: an unscoped worry is not a pause", () => {
    const vague: DataIncident = {
      incidentId: "inc_vague",
      severity: "critical",
      title: "Something looks off",
      affected: "everything",
      owner: "sales_ops",
      ownerRole: "owner",
      openedAt: "2026-09-17T09:00:00Z",
    };
    const scope = scopeIncidents(dataset, { now: NOW, declared: [vague] });
    expect(scope.incidents).toHaveLength(1);
    expect(heldSurfaces(scope)).toEqual([]);
    for (const surface of SURFACES) expect(isHeld(scope, surface)).toBe(false);
    expect(scope.incidents[0].effect).toMatch(/holds no measurement on its own until its scope is declared/);
    // The owner can own an incident, not only a function.
    expect(scope.incidents[0].owner).toBe("owner");
    expect(scope.incidents[0].ownerLabel).toBe("The owner");
  });
});

describe("statements name the limited effect and the owner", () => {
  it("every held surface states what it waits on, who owns it, and that nothing else is held", () => {
    const dataset = emptyDataset({
      opportunities: [opp("o1")],
      contacts: [contact("ct_o1", granted)],
      ledger: [ledger("led_unlinked", { opportunityId: undefined })],
      appointmentInstances: [mkInstance("inst_open", "o1", "unknown")],
    });
    const scope = scopeIncidents(dataset, { now: NOW });
    expect(heldSurfaces(scope)).toEqual(["revenue_attribution", "commission", "attendance_outcome"]);
    for (const status of scope.affected) {
      expect(status.statement).toMatch(/until/);
      expect(status.statement).toMatch(/owns that, and nothing else is held\.$/);
      expect(status.owner).toBeTruthy();
      expect(status.ownerLabel).toBeTruthy();
      expect(status.action).toBeTruthy();
      expect(status.incidents.length).toBeGreaterThan(0);
    }
    expect(scope.surfaces.attendance_outcome.statement).toMatch(/Attendance outcome is provisional/);
    expect(scope.surfaces.communication_read.held).toBe(false);
  });
});
