import { describe, expect, it } from "vitest";
import {
  applyManualMapping,
  detectPreset,
  dryRun,
  isNegatedConsentHeader,
  parseConsent,
  parseCsv,
  parseDate,
  parseMoney,
  parseOutcome,
  parseStatus,
  profileColumns,
  runImport,
  suggestMapping,
  TARGET_FIELDS,
  type ImportContext,
  type MappingPlan,
} from "@/domain/migration";
import { applyEvents } from "@/domain/events";
import type { IntakeContact } from "@/domain/intake";
import { GOHIGHLEVEL_CSV, HUBSPOT_CSV, MESSY_CSV, MIGRATION_NOW, MIGRATION_TENANT, migrationUsers } from "@/fixtures/migration";

function load(csv: string, preset?: MappingPlan["preset"]) {
  const { headers, rows } = parseCsv(csv);
  const profiles = profileColumns(headers, rows);
  const plan = suggestMapping(profiles, preset);
  return { headers, rows, profiles, plan };
}

function ctx(overrides: Partial<ImportContext> = {}): ImportContext {
  return { tenantId: MIGRATION_TENANT, now: MIGRATION_NOW, existingContacts: [], users: migrationUsers, ...overrides };
}

const hubspot = load(HUBSPOT_CSV);
const ghl = load(GOHIGHLEVEL_CSV);
const messy = load(MESSY_CSV);

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes and CRLF", () => {
    const out = parseCsv('a,b,c\r\n1,"x, y","He said ""hi"""\r\n2,,\r\n');
    expect(out.headers).toEqual(["a", "b", "c"]);
    expect(out.rows).toEqual([
      ["1", "x, y", 'He said "hi"'],
      ["2", "", ""],
    ]);
  });

  it("strips a BOM, skips blank lines, pads ragged rows and keeps newlines inside quotes", () => {
    const out = parseCsv('﻿name,note\n\nAnn,"line one\nline two"\nBob\n');
    expect(out.headers).toEqual(["name", "note"]);
    expect(out.rows).toEqual([
      ["Ann", "line one\nline two"],
      ["Bob", ""],
    ]);
  });

  it("returns empty for an empty file", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("profileColumns", () => {
  it("detects value shapes on the messy sheet", () => {
    const kind = (h: string) => messy.profiles.find((p) => p.header === h)!.detectedKind;
    expect(kind("Cell")).toBe("phone");
    expect(kind("E-mail")).toBe("email");
    expect(kind("$ Paid")).toBe("money");
    expect(kind("Booked?")).toBe("date");
    expect(kind("Do not text")).toBe("boolean");
    expect(kind("Notes")).toBe("text");
  });

  it("counts non-empty values and caps samples", () => {
    const cell = profileColumns(messy.headers, messy.rows, 3).find((p) => p.header === "Cell")!;
    expect(cell.total).toBe(10);
    expect(cell.nonEmpty).toBe(9);
    expect(cell.sampleValues).toHaveLength(3);
  });
});

describe("detectPreset", () => {
  it("recognizes the HubSpot export", () => {
    const d = detectPreset(hubspot.headers);
    expect(d.preset).toBe("hubspot");
    expect(d.score).toBeGreaterThan(0.6);
  });

  it("recognizes the GoHighLevel export", () => {
    const d = detectPreset(ghl.headers);
    expect(d.preset).toBe("gohighlevel");
    expect(d.score).toBeGreaterThan(0.6);
  });

  it("falls back to generic for the messy sheet", () => {
    const d = detectPreset(messy.headers);
    expect(d.preset).toBe("generic");
    expect(d.score).toBeGreaterThan(0.6);
  });
});

describe("suggestMapping", () => {
  it("maps at least 90% of HubSpot columns at confidence >= 0.8 with nothing to review", () => {
    const { plan } = hubspot;
    expect(plan.preset).toBe("hubspot");
    const confident = plan.columns.filter((c) => c.confidence >= 0.8).length;
    expect(confident / plan.totalColumns).toBeGreaterThanOrEqual(0.9);
    expect(plan.needsReview).toEqual([]);
    const target = (h: string) => plan.columns.find((c) => c.header === h)!.target;
    expect(target("Phone Number")).toBe("contact.phone");
    expect(target("Deal Stage")).toBe("opportunity.status");
    expect(target("Contact owner")).toBe("opportunity.ownerName");
    expect(target("Unsubscribed from all email")).toBe("contact.consent.email");
  });

  it("maps every GoHighLevel column through the preset", () => {
    const { plan } = ghl;
    expect(plan.preset).toBe("gohighlevel");
    expect(plan.columns.every((c) => c.reason === "preset" && c.confidence === 0.98)).toBe(true);
    expect(plan.needsReview).toEqual([]);
    expect(plan.columns.find((c) => c.header === "DND")!.target).toBe("contact.consent.sms");
    expect(plan.columns.find((c) => c.header === "Appointment Time")!.target).toBe("appointment.start");
  });

  it("maps the messy sheet by synonyms and value shape", () => {
    const { plan } = messy;
    const col = (h: string) => plan.columns.find((c) => c.header === h)!;
    expect(col("Cell").target).toBe("contact.phone");
    expect(col("Cell").reason).toBe("value_shape");
    expect(col("E-mail").target).toBe("contact.email");
    expect(col("$ Paid").target).toBe("payment.amount");
    expect(col("Do not text").target).toBe("contact.consent.sms");
    expect(col("Where from").target).toBe("opportunity.source");
    expect(col("Booked?").target).toBe("appointment.start");
    expect(col("Showed?").target).toBe("appointment.outcome");
    expect(col("Notes").target).toBe("note.text");
    expect(plan.mappedCount).toBe(9);
    // Only the value-shape column sits under the review threshold.
    expect(plan.needsReview.map((c) => c.header)).toEqual(["Cell"]);
  });

  it("uses fuzzy header matching for near-misses", () => {
    const plan = suggestMapping(profileColumns(["Phone Numbr", "Deal Owner Name"], [["512-555-0100", "Sam"]]));
    expect(plan.columns[0].target).toBe("contact.phone");
    expect(plan.columns[0].confidence).toBe(0.75);
    expect(plan.columns[1].target).toBe("opportunity.ownerName");
  });

  it("leaves an unrecognizable column unmapped with alternatives and flags it for review", () => {
    const plan = suggestMapping(profileColumns(["Name", "Zorblax"], [["Ann", "abc"]]));
    const z = plan.columns.find((c) => c.header === "Zorblax")!;
    expect(z.reason).toBe("unmapped");
    expect(z.confidence).toBe(0);
    expect(z.alternatives.length).toBeLessThanOrEqual(3);
    expect(plan.needsReview.map((c) => c.header)).toEqual(["Zorblax"]);
  });

  it("never maps two columns to the same single-column target; the second gets it as an alternative", () => {
    const plan = suggestMapping(profileColumns(["Email", "Email address"], [["a@x.com", "b@x.com"]]));
    expect(plan.columns[0].target).toBe("contact.email");
    expect(plan.columns[1].reason).toBe("unmapped");
    expect(plan.columns[1].alternatives[0]).toBe("contact.email");
  });
});

describe("applyManualMapping", () => {
  it("fixes an unmapped column and reduces needsReview", () => {
    const before = suggestMapping(profileColumns(["Name", "Zorblax"], [["Ann", "hello"]]));
    expect(before.needsReview).toHaveLength(1);
    const after = applyManualMapping(before, "Zorblax", "note.text");
    expect(after.needsReview).toHaveLength(0);
    const z = after.columns.find((c) => c.header === "Zorblax")!;
    expect(z).toMatchObject({ target: "note.text", confidence: 1, reason: "manual" });
    expect(after.mappedCount).toBe(before.mappedCount + 1);
  });

  it("releases the previous holder of a single-column target", () => {
    const after = applyManualMapping(messy.plan, "Cell", "contact.phone");
    expect(after.columns.find((c) => c.header === "Cell")!.confidence).toBe(1);
    const moved = applyManualMapping(messy.plan, "Notes", "contact.phone");
    expect(moved.columns.find((c) => c.header === "Cell")!.reason).toBe("unmapped");
    expect(moved.columns.find((c) => c.header === "Cell")!.alternatives[0]).toBe("contact.phone");
  });

  it("rejects an unknown target", () => {
    expect(() => applyManualMapping(messy.plan, "Cell", "contact.shoeSize")).toThrow();
  });
});

describe("value parsing", () => {
  it("parses dates across ISO, US, month-name, 2-digit year and epoch formats", () => {
    expect(parseDate("2026-08-01T14:22:00Z")).toBe("2026-08-01T14:22:00Z");
    expect(parseDate("2026-08-12 09:15")).toBe("2026-08-12T09:15:00Z");
    expect(parseDate("08/03/2026")).toBe("2026-08-03T00:00:00Z");
    expect(parseDate("9/3/2026 10am")).toBe("2026-09-03T10:00:00Z");
    expect(parseDate("09/28/2026 2:30 PM")).toBe("2026-09-28T14:30:00Z");
    expect(parseDate("8/18/26")).toBe("2026-08-18T00:00:00Z");
    expect(parseDate("Sep 3, 2026 10:00 AM")).toBe("2026-09-03T10:00:00Z");
    expect(parseDate("Aug 4, 2026")).toBe("2026-08-04T00:00:00Z");
    expect(parseDate("3 September 2026")).toBe("2026-09-03T00:00:00Z");
    expect(parseDate("1754400000")).toBe("2025-08-05T13:20:00Z");
    expect(parseDate("1754400000000")).toBe("2025-08-05T13:20:00Z");
    expect(parseDate("2026-08-01T10:00:00-05:00")).toBe("2026-08-01T15:00:00Z");
    expect(parseDate("not a date")).toBeUndefined();
    expect(parseDate("2026-02-30")).toBeUndefined();
    expect(parseDate("")).toBeUndefined();
  });

  it("parses money into minor units, with parentheses as negative", () => {
    expect(parseMoney("$4,800.00")).toEqual({ amountMinor: 480000, negative: false, currency: "USD" });
    expect(parseMoney("4800")).toEqual({ amountMinor: 480000, negative: false, currency: undefined });
    expect(parseMoney("(200)")).toEqual({ amountMinor: 20000, negative: true, currency: undefined });
    expect(parseMoney("-50.25")).toEqual({ amountMinor: 5025, negative: true, currency: undefined });
    expect(parseMoney("EUR 1,200")).toEqual({ amountMinor: 120000, negative: false, currency: "EUR" });
    expect(parseMoney("abc")).toBeUndefined();
  });

  it("maps status words to CommercialStatus", () => {
    expect(parseStatus("closedwon")).toBe("won");
    expect(parseStatus("Closed Won")).toBe("won");
    expect(parseStatus("sold")).toBe("won");
    expect(parseStatus("closed lost")).toBe("lost");
    expect(parseStatus("Disqualified")).toBe("dq");
    expect(parseStatus("unqualified")).toBe("dq");
    expect(parseStatus("On hold")).toBe("nurture");
    expect(parseStatus("appointmentscheduled")).toBe("open");
    expect(parseStatus("")).toBe("open");
  });

  it("maps outcome words to AppointmentInstanceOutcome", () => {
    expect(parseOutcome("Showed")).toBe("attended");
    expect(parseOutcome("completed")).toBe("attended");
    expect(parseOutcome("No Show")).toBe("customer_no_show");
    expect(parseOutcome("ns")).toBe("customer_no_show");
    expect(parseOutcome("Cancelled")).toBe("canceled_before_cutoff");
    expect(parseOutcome("rescheduled")).toBe("superseded_before_cutoff");
    expect(parseOutcome("")).toBe("unknown");
  });

  it("parses consent, inverting plain yes/no under a negated header", () => {
    expect(parseConsent("yes")).toBe("granted");
    expect(parseConsent("1")).toBe("granted");
    expect(parseConsent("opted in")).toBe("granted");
    expect(parseConsent("no")).toBe("revoked");
    expect(parseConsent("unsubscribed")).toBe("revoked");
    expect(parseConsent("STOP")).toBe("revoked");
    expect(parseConsent("")).toBe("unknown");
    expect(isNegatedConsentHeader("Do not text")).toBe(true);
    expect(isNegatedConsentHeader("DND")).toBe(true);
    expect(isNegatedConsentHeader("SMS consent")).toBe(false);
    expect(parseConsent("yes", true)).toBe("revoked");
    expect(parseConsent("no", true)).toBe("granted");
    expect(parseConsent("opted out", true)).toBe("revoked");
  });
});

describe("dryRun", () => {
  it("counts contacts, merges the duplicate person and errors the row without a contact point", () => {
    const report = dryRun(hubspot.plan, hubspot.headers, hubspot.rows, ctx());
    expect(report.rows).toBe(10);
    expect(report.contacts).toEqual({ create: 8, merge: 0 });
    expect(report.duplicatesMerged).toBe(1);
    expect(report.opportunities).toBe(8);
    const errors = report.issues.filter((i) => i.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ row: 5, problem: "no contact point" });
    expect(report.readyPercent).toBe(90);
    expect(report.unmappedColumns).toEqual([]);
  });

  it("records a parenthesized amount as a refund and totals in minor units", () => {
    const result = runImport(hubspot.plan, hubspot.headers, hubspot.rows, ctx());
    const refunds = result.ledger.filter((l) => l.kind === "refund");
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount).toEqual({ amountMinor: 20000, currency: "USD" });
    // Won deals: 4800 + 3200 + 6500 collected, minus the 200 refund. Lost and open deals are not cash.
    expect(result.report.payments).toEqual({ count: 4, totalMinor: 480000 + 320000 + 650000 - 20000, currency: "USD" });
    const maria = result.contacts.find((c) => c.phone === "+15125550142")!;
    const mariaOpp = result.opportunities.find((o) => o.primaryContactId === maria.contactId)!;
    expect(refunds[0].opportunityId).toBe(mariaOpp.opportunityId);
    expect(mariaOpp.paymentState).toBe("refunded");
  });

  it("treats a GoHighLevel DND flag as revoked on every channel", () => {
    const result = runImport(ghl.plan, ghl.headers, ghl.rows, ctx());
    const chloe = result.contacts.find((c) => c.email === "chloe.b@example.com")!;
    expect(chloe.consent).toEqual({ phone: "revoked", sms: "revoked", email: "revoked" });
    const maria = result.contacts.find((c) => c.email === "maria.g@example.com")!;
    expect(maria.consent.sms).toBe("granted");
    expect(result.report.contacts).toEqual({ create: 8, merge: 0 });
    expect(result.report.duplicatesMerged).toBe(1);
  });

  it("treats 'Do not text' = yes as sms revoked only", () => {
    const result = runImport(messy.plan, messy.headers, messy.rows, ctx());
    const chloe = result.contacts.find((c) => c.email === "chloe.b@example.com")!;
    expect(chloe.consent).toEqual({ phone: "unknown", sms: "revoked", email: "unknown" });
    const devon = result.contacts.find((c) => c.email === "devon.price@example.com")!;
    expect(devon.consent.sms).toBe("granted");
  });

  it("assigns known owners and warns on unknown ones, leaving the opportunity unassigned", () => {
    const result = runImport(hubspot.plan, hubspot.headers, hubspot.rows, ctx());
    const lena = result.contacts.find((c) => c.email === "lena.f@example.com")!;
    const lenaOpp = result.opportunities.find((o) => o.primaryContactId === lena.contactId)!;
    expect(lenaOpp.currentOwner).toEqual({});
    expect(result.report.issues.some((i) => i.problem === "unknown owner" && i.value === "Casey Morgan" && i.severity === "warning")).toBe(true);
    const tom = result.contacts.find((c) => c.email === "tom.nguyen@example.com")!;
    const tomOpp = result.opportunities.find((o) => o.primaryContactId === tom.contactId)!;
    expect(tomOpp.currentOwner).toEqual({ setter: "u_sam" });
    const maria = result.contacts.find((c) => c.phone === "+15125550142")!;
    expect(result.opportunities.find((o) => o.primaryContactId === maria.contactId)!.currentOwner).toEqual({ closer: "u_jordan" });
  });

  it("creates appointments, warns on future dates and keeps them scheduled", () => {
    const result = runImport(ghl.plan, ghl.headers, ghl.rows, ctx());
    expect(result.report.appointments).toBe(7);
    expect(result.instances).toHaveLength(7);
    const future = result.report.issues.filter((i) => i.problem === "appointment is in the future");
    expect(future.map((i) => i.row)).toEqual([1]);
    const devon = result.contacts.find((c) => c.email === "devon.price@example.com")!;
    const devonOpp = result.opportunities.find((o) => o.primaryContactId === devon.contactId)!;
    const devonInstance = result.instances.find((i) => i.opportunityId === devonOpp.opportunityId)!;
    expect(devonInstance.outcome).toBe("scheduled");
    expect(devonInstance.matured).toBe(false);
    expect(devonInstance.scheduledStart).toBe("2026-09-28T14:30:00Z");
    expect(devonOpp.entryPath).toBe("booked_entry");
    const outcomes = result.instances.map((i) => i.outcome).sort();
    expect(outcomes).toContain("attended");
    expect(outcomes).toContain("customer_no_show");
    expect(outcomes).toContain("canceled_before_cutoff");
    expect(outcomes).toContain("superseded_before_cutoff");
  });

  it("errors a payment reference without an amount", () => {
    const { headers, rows } = parseCsv("Name,Phone,Amount,Transaction id\nAnn,512-555-0100,,ch_123\nBob,512-555-0101,50,ch_124");
    const plan = suggestMapping(profileColumns(headers, rows), "generic");
    const report = dryRun(plan, headers, rows, ctx());
    const errors = report.issues.filter((i) => i.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ row: 0, problem: "payment without an amount" });
    expect(report.payments.count).toBe(1);
    expect(report.payments.totalMinor).toBe(5000);
    expect(report.readyPercent).toBe(50);
  });

  it("matches the runImport report exactly", () => {
    expect(dryRun(messy.plan, messy.headers, messy.rows, ctx())).toEqual(runImport(messy.plan, messy.headers, messy.rows, ctx()).report);
  });
});

describe("runImport", () => {
  it("merges into existing contacts and never downgrades a revoked consent", () => {
    const existing: IntakeContact = {
      tenantId: MIGRATION_TENANT,
      contactId: "ct_existing_maria",
      displayName: "Maria Gonzalez",
      phone: "+15125550142",
      consent: { phone: "unknown", sms: "revoked", email: "unknown" },
    };
    const result = runImport(messy.plan, messy.headers, messy.rows, ctx({ existingContacts: [existing] }));
    expect(result.report.contacts.merge).toBe(1);
    expect(result.report.contacts.create).toBe(7);
    const maria = result.contacts.find((c) => c.contactId === "ct_existing_maria")!;
    expect(maria.consent.sms).toBe("revoked");
    expect(maria.email).toBe("maria.g@example.com"); // filled, not overwritten
    expect(result.report.consentPreserved).toBeGreaterThanOrEqual(1);
    const mariaSubs = result.submissions.filter((s) => s.contactId === "ct_existing_maria");
    expect(mariaSubs).toHaveLength(2);
    expect(mariaSubs[1].duplicateOfSubmissionId).toBe(mariaSubs[0].submissionId);
    expect(result.opportunities.filter((o) => o.primaryContactId === "ct_existing_maria")).toHaveLength(1);
    expect(result.events.find((e) => e.aggregateId === mariaSubs[0].submissionId)!.payload.contactMerged).toBe(true);
  });

  it("is deterministic: running twice yields identical ids and no duplicate event keys", () => {
    const a = runImport(ghl.plan, ghl.headers, ghl.rows, ctx());
    const b = runImport(ghl.plan, ghl.headers, ghl.rows, ctx());
    expect(b).toEqual(a);
    const keys = a.events.map((e) => e.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
    const reduced = applyEvents([...a.events, ...b.events]);
    expect(reduced.applied).toHaveLength(a.events.length);
    expect(reduced.duplicates).toHaveLength(b.events.length);
    expect(keys[0]).toMatch(new RegExp(`^${MIGRATION_TENANT}:migration:[0-9a-f]{8}:\\d+$`));
  });

  it("applies nothing when the same file's submissions already exist", () => {
    const first = runImport(hubspot.plan, hubspot.headers, hubspot.rows, ctx());
    const second = runImport(hubspot.plan, hubspot.headers, hubspot.rows, ctx({ existingContacts: first.contacts, existingSubmissions: first.submissions }));
    expect(second.submissions).toHaveLength(0);
    expect(second.opportunities).toHaveLength(0);
    expect(second.ledger).toHaveLength(0);
    expect(second.events).toHaveLength(0);
    expect(second.report.issues.filter((i) => i.problem === "already imported")).toHaveLength(first.submissions.length);
  });

  it("provenance-tags every record", () => {
    const result = runImport(hubspot.plan, hubspot.headers, hubspot.rows, ctx());
    for (const s of result.submissions) {
      expect(s.source).toBe("import:hubspot");
      expect(s.providerEventId).toMatch(/^import:[0-9a-f]{8}$/);
      expect(s.tenantId).toBe(MIGRATION_TENANT);
    }
    for (const e of result.events) {
      expect(e.eventType).toBe("import.row_applied");
      expect(e.sourceSystem).toBe("migration");
      expect(e.actorType).toBe("integration");
      expect(e.payload.preset).toBe("hubspot");
    }
    expect(result.events).toHaveLength(9); // 10 rows, one error row held back
    for (const l of result.ledger) expect(l.providerRef).toMatch(/^import:/);
    for (const o of result.opportunities) expect(o.tenantId).toBe(MIGRATION_TENANT);
  });

  it("stores money as integer minor units and keeps the original source on the opportunity", () => {
    const result = runImport(messy.plan, messy.headers, messy.rows, ctx());
    for (const l of result.ledger) {
      expect(Number.isInteger(l.amount.amountMinor)).toBe(true);
      expect(l.amount.currency).toBe("USD");
    }
    const maria = result.contacts.find((c) => c.phone === "+15125550142")!;
    const mariaOpp = result.opportunities.find((o) => o.primaryContactId === maria.contactId)!;
    expect(mariaOpp.source).toBe("Facebook");
    const collected = result.ledger.filter((l) => l.opportunityId === mariaOpp.opportunityId && l.kind === "payment_collected");
    expect(collected[0].amount.amountMinor).toBe(480000);
    expect(result.report.payments.totalMinor).toBe(480000 + 320000 - 20000 + 650000);
  });

  it("carries notes and prefixes non-note columns with their header", () => {
    const ghlResult = runImport(ghl.plan, ghl.headers, ghl.rows, ctx());
    expect(ghlResult.report.notes).toBeGreaterThan(0);
    const mariaEvent = ghlResult.events.find((e) => e.payload.row === 0)!;
    expect(mariaEvent.payload.note).toBe("Tags: fb-lead,hot");
    const messyResult = runImport(messy.plan, messy.headers, messy.rows, ctx());
    expect(messyResult.events.find((e) => e.payload.row === 0)!.payload.note).toBe("Bought the fleet package");
    expect(messyResult.report.notes).toBe(6);
  });

  it("parses mixed date formats within one file into ISO", () => {
    const result = runImport(hubspot.plan, hubspot.headers, hubspot.rows, ctx());
    const receivedAt = new Map(result.submissions.map((s) => [s.submissionId, s.receivedAt]));
    const rowAt = (i: number) => receivedAt.get(result.events.find((e) => e.payload.row === i)!.aggregateId);
    expect(rowAt(0)).toBe("2026-08-01T14:22:00Z");
    expect(rowAt(1)).toBe("2026-08-03T00:00:00Z");
    expect(rowAt(2)).toBe("2026-08-04T00:00:00Z");
    expect(rowAt(3)).toBe("2025-08-05T13:20:00Z");
    expect(rowAt(9)).toBe("2026-08-12T09:15:00Z");
    expect(result.report.issues.filter((i) => i.problem === "unrecognized date")).toHaveLength(0);
  });

  it("exposes a target catalog the mapping UI can render", () => {
    const fields = new Set(TARGET_FIELDS.map((t) => t.field));
    for (const f of ["contact.fullName", "contact.phone", "contact.email", "contact.consent.sms", "opportunity.status", "appointment.start", "payment.amount", "note.text", "ignore"]) {
      expect(fields.has(f)).toBe(true);
    }
    expect(TARGET_FIELDS.find((t) => t.field === "opportunity.status")!.enumValues).toContain("won");
    expect(TARGET_FIELDS.filter((t) => t.required).map((t) => t.field)).toEqual(["contact.fullName", "contact.phone", "contact.email"]);
  });
});
