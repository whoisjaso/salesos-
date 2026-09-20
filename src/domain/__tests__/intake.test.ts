import { describe, expect, it } from "vitest";
import {
  contactIdFor,
  dedupe,
  flattenPayload,
  identify,
  ingest,
  normalize,
  normalizePhone,
  sourceCatalog,
  sourceHealth,
  submissionIdFor,
  trackingSnippet,
  type IngestContext,
  type IntakeContact,
  type IntakeSubmission,
  type RawInbound,
  type SourceConnection,
} from "@/domain/intake";
import {
  calendlyInbound,
  landingInbound,
  metaInbound,
  SOURCES_NOW,
  shareLinkInbound,
  sourceById,
  sourceConnections,
} from "@/fixtures/sources";

const NOW = SOURCES_NOW;
const meta = sourceById("src_meta_dealer_video");
const vsl = sourceById("src_vsl_landing");
const calendly = sourceById("src_calendly_demo");
const share = sourceById("src_ig_dm_link");

function ctx(overrides: Partial<IngestContext> = {}): IngestContext {
  return { now: NOW, contacts: [], submissions: [], opportunities: [], offerId: "offer_dealer_followup_v1", ...overrides };
}

describe("sourceCatalog", () => {
  it("covers every kind with short copy for the onboarding screen", () => {
    const kinds = new Set(sourceCatalog.map((c) => c.kind));
    expect(kinds.size).toBe(9);
    for (const c of sourceCatalog) {
      expect(c.oneLiner.split(/\s+/).length).toBeLessThanOrEqual(8);
      expect(c.setupSteps.length).toBeLessThanOrEqual(3);
      for (const s of c.setupSteps) expect(s.split(/\s+/).length).toBeLessThanOrEqual(10);
      expect(c.icon.length).toBeGreaterThan(0);
    }
    expect(sourceCatalog.find((c) => c.kind === "calendar_booking")?.entryPathDefault).toBe("booked_entry");
  });
});

describe("normalize", () => {
  it("flattens a Meta field_data array and maps it", () => {
    const n = normalize(metaInbound, meta, NOW);
    expect(n.fullName).toBe("Marisol Ochoa-Reyes");
    expect(n.phone).toBe("+15125550142");
    expect(n.email).toBe("marisol.ochoa@lonestarmotors.example");
    expect(n.requestText).toMatch(/BDC loses internet leads/);
    expect(n.campaign).toBe("q3_dealer_bdc_video");
    expect(n.adId).toBe("120212345678900");
    expect(n.preferredLanguage).toBe("es");
    expect(n.bookingStart).toBeUndefined();
    expect(n.consent).toEqual({ phone: "granted", sms: "granted", email: "granted" });
    expect(n.rawRef).toBe("obavia:src_meta_dealer_video:lgid_9127734410021");
    const flat = flattenPayload(metaInbound.payload);
    expect(flat.get("phone_number")).toBe("(512) 555-0142");
    expect(flat.get("field_data.sms_opt_in")).toBe("true");
  });

  it("uses the connection fieldMap before heuristics on a flat landing page form", () => {
    const n = normalize(landingInbound, vsl, NOW);
    expect(n.fullName).toBe("Deshawn Whitfield");
    expect(n.phone).toBe("+17375550188");
    expect(n.email).toBe("dwhitfield@capitalcityautos.example");
    expect(n.requestText).toBe("Reps text from personal phones and nothing gets logged");
    expect(n.campaign).toBe("vsl_v3_long");
    expect(n.utm).toEqual({ utm_source: "youtube", utm_medium: "cpc", utm_campaign: "vsl_v3" });
    expect(n.preferredLanguage).toBe("en");
    expect(n.consent).toEqual({ phone: "granted", sms: "granted", email: "granted" });
  });

  it("reads a Calendly invitee event: nested invitee, scheduled_event and Q&A", () => {
    const n = normalize(calendlyInbound, calendly, NOW);
    expect(n.fullName).toBe("Priya Raghunathan");
    expect(n.email).toBe("priya@hillcountryford.example");
    expect(n.phone).toBe("+18305550107");
    expect(n.bookingStart).toBe("2026-09-22T15:30:00Z");
    expect(n.bookingProvider).toBe("calendly");
    expect(n.requestText).toMatch(/6-person BDC/);
    expect(n.utm?.utm_campaign).toBe("demo_page");
    expect(n.consent.sms).toBe("unknown");
    expect(n.consent.phone).toBe("granted");
  });

  it("accepts the minimal share-link payload without inventing anything", () => {
    const n = normalize(shareLinkInbound, share, NOW);
    expect(n.fullName).toBe("Tomas Ibarra");
    expect(n.phone).toBe("+12105550163");
    expect(n.email).toBeUndefined();
    expect(n.requestText).toBe("");
    expect(n.campaign).toBeUndefined();
    expect(n.utm).toBeUndefined();
    expect(n.consent).toEqual({ phone: "granted", sms: "granted", email: "unknown" });
  });

  it("normalizes phones to E.164 with a US default and refuses short locals", () => {
    expect(normalizePhone("(512) 555-0142")).toBe("+15125550142");
    expect(normalizePhone("1 512 555 0142")).toBe("+15125550142");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("0044 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("555-0142")).toBeUndefined();
    expect(normalizePhone("")).toBeUndefined();
  });

  it("yields revoked consent on a STOP flag", () => {
    const raw: RawInbound = { ...shareLinkInbound, providerEventId: "share_stop", payload: { name: "Tomas Ibarra", phone: "2105550163", message: "STOP" } };
    expect(normalize(raw, share, NOW).consent).toEqual({ phone: "revoked", sms: "revoked", email: "revoked" });
    const flagged: RawInbound = { ...landingInbound, providerEventId: "vsl_unsub", payload: { ...landingInbound.payload, unsubscribe: true } };
    expect(normalize(flagged, vsl, NOW).consent.email).toBe("revoked");
  });
});

describe("identify", () => {
  const existing: IntakeContact[] = [
    { tenantId: "obavia", contactId: "ct_known", displayName: "Marisol O.", phone: "512-555-0142", email: "other@example.com", consent: { phone: "granted", sms: "unknown", email: "unknown" } },
    { tenantId: "obavia", contactId: "ct_mail", displayName: "Mail Only", email: "Priya@HillCountryFord.example", consent: { phone: "unknown", sms: "unknown", email: "granted" } },
  ];

  it("matches an existing contact by normalized phone first", () => {
    const r = identify({ phone: "+15125550142", email: "new@example.com" }, existing, "obavia");
    expect(r).toEqual({ contactId: "ct_known", created: false, matchedOn: "phone" });
  });

  it("falls back to lowercased email", () => {
    const r = identify({ email: "priya@hillcountryford.example" }, existing, "obavia");
    expect(r).toEqual({ contactId: "ct_mail", created: false, matchedOn: "email" });
  });

  it("creates a deterministic id from tenant + contact point", () => {
    const a = identify({ phone: "+12105550163" }, existing, "obavia");
    const b = identify({ phone: "+12105550163" }, [], "obavia");
    expect(a.created).toBe(true);
    expect(a.contactId).toBe(b.contactId);
    expect(a.contactId).toBe(contactIdFor("obavia", "+12105550163"));
    expect(identify({ phone: "+12105550163" }, [], "other_tenant").contactId).not.toBe(a.contactId);
  });
});

describe("ingest", () => {
  it("opens an accountable opportunity for a fresh Meta lead with the right events", () => {
    const r = ingest(metaInbound, meta, ctx());
    expect(r.dropped).toBe(false);
    expect(r.holds).toEqual([]);
    expect(r.submission.submissionId).toBe(submissionIdFor(metaInbound));
    expect(r.submission.source).toBe("meta_lead_form");
    expect(r.submission.sourceId).toBe("src_meta_dealer_video");
    expect(r.submission.leadTier).toBe(1);
    expect(r.submission.entryPath).toBe("form_entry");
    expect(r.contact.displayName).toBe("Marisol Ochoa-Reyes");
    expect(r.contact.preferredLanguage).toBe("es");
    expect(r.opportunity?.entryPath).toBe("form_entry");
    expect(r.opportunity?.leadTier).toBe(1);
    expect(r.opportunity?.offerId).toBe("offer_dealer_followup_v1");
    expect(r.opportunity?.accountabilityStartedAt).toBe(NOW);
    expect(r.events.map((e) => e.eventType)).toEqual(["lead.received", "contact.created", "opportunity.opened"]);
    for (const e of r.events) expect(e.actorType).toBe("integration");
    expect(r.events[0].sourceEventId).toBe("lgid_9127734410021");
  });

  it("drops a replayed providerEventId without a new submission or opportunity", () => {
    const first = ingest(metaInbound, meta, ctx());
    const again = ingest({ ...metaInbound, receivedAt: "2026-09-18T18:50:00Z" }, meta, ctx({ submissions: [first.submission], contacts: [first.contact] }));
    expect(again.dropped).toBe(true);
    expect(again.dedupe.kind).toBe("replay");
    expect(again.opportunity).toBeUndefined();
    expect(again.submission.submissionId).toBe(first.submission.submissionId);
    expect(again.events.map((e) => e.eventType)).toEqual(["intake.replay_dropped"]);
    expect(again.holds).toContain("transport replay: already recorded");
  });

  it("flags the same person from the same source within 72h as duplicate and opens no opportunity", () => {
    const first = ingest(metaInbound, meta, ctx());
    const repeat: RawInbound = { ...metaInbound, providerEventId: "lgid_9127734410099", receivedAt: "2026-09-19T10:00:00Z" };
    const r = ingest(repeat, meta, ctx({ submissions: [first.submission], contacts: [first.contact], now: "2026-09-19T10:00:00Z" }));
    expect(r.dropped).toBe(false);
    expect(r.submission.duplicateOfSubmissionId).toBe(first.submission.submissionId);
    expect(r.opportunity).toBeUndefined();
    expect(r.holds).toEqual([`duplicate of ${first.submission.submissionId}`]);
    expect(r.events.map((e) => e.eventType)).toEqual(["lead.received", "contact.linked", "intake.duplicate_flagged"]);
    expect(r.dedupe).toMatchObject({ kind: "duplicate", sameSource: true });
  });

  it("records a repeat inquiry after the window as a new accountable opportunity", () => {
    const first = ingest(metaInbound, meta, ctx());
    const later: RawInbound = { ...metaInbound, providerEventId: "lgid_later", receivedAt: "2026-09-22T18:43:00Z" };
    const r = ingest(later, meta, ctx({ submissions: [first.submission], contacts: [first.contact], now: "2026-09-22T18:43:00Z" }));
    expect(r.submission.duplicateOfSubmissionId).toBeUndefined();
    expect(r.opportunity).toBeDefined();
    expect(r.opportunity?.opportunityId).not.toBe(first.opportunity?.opportunityId);
  });

  it("same person through a different source within the window: policy is one buying cycle, so still duplicate and no new opportunity", () => {
    // Documented policy (SOS-05): repeated inquiries enrich the active opportunity; the source
    // difference is preserved in the duplicate event (sameSource=false) for acquisition history.
    const first = ingest(metaInbound, meta, ctx());
    const viaShare: RawInbound = {
      ...shareLinkInbound,
      providerEventId: "share_marisol",
      receivedAt: "2026-09-19T09:00:00Z",
      payload: { name: "Marisol", phone: "512 555 0142" },
    };
    const r = ingest(viaShare, share, ctx({ submissions: [first.submission], contacts: [first.contact], now: "2026-09-19T09:00:00Z" }));
    expect(r.contact.contactId).toBe(first.contact.contactId);
    expect(r.submission.duplicateOfSubmissionId).toBe(first.submission.submissionId);
    expect(r.opportunity).toBeUndefined();
    expect(r.dedupe).toMatchObject({ kind: "duplicate", sameSource: false });
    const dup = r.events.find((e) => e.eventType === "intake.duplicate_flagged");
    expect(dup?.payload.sameSource).toBe(false);
  });

  it("a calendar booking yields booked_entry", () => {
    const r = ingest(calendlyInbound, calendly, ctx({ now: "2026-09-17T22:15:30Z" }));
    expect(r.submission.entryPath).toBe("booked_entry");
    expect(r.opportunity?.entryPath).toBe("booked_entry");
    expect(r.events[0].payload.bookingStart).toBe("2026-09-22T15:30:00Z");
    expect(r.events[0].payload.bookingProvider).toBe("calendly");
  });

  it("a STOP flag yields revoked consent, a hold, and no opportunity", () => {
    const raw: RawInbound = { ...shareLinkInbound, providerEventId: "share_stop", payload: { name: "Tomas Ibarra", phone: "2105550163", message: "STOP" } };
    const r = ingest(raw, share, ctx());
    expect(r.contact.consent).toEqual({ phone: "revoked", sms: "revoked", email: "revoked" });
    expect(r.holds).toEqual(["consent revoked"]);
    expect(r.opportunity).toBeUndefined();
    expect(r.events.map((e) => e.eventType)).toEqual(["lead.received", "contact.created"]);
  });

  it("an unknown payload with no phone or email is held with 'no contact point'", () => {
    const raw: RawInbound = { tenantId: "obavia", sourceId: "src_vsl_landing", providerEventId: "vsl_junk_1", receivedAt: NOW, payload: { foo: "bar", nested: { deep: 1 } } };
    const r = ingest(raw, vsl, ctx());
    expect(r.holds).toEqual(["no contact point"]);
    expect(r.opportunity).toBeUndefined();
    expect(r.contact.displayName).toBe("Unknown contact");
    expect(r.submission.requestText).toBe("");
  });

  it("links an existing contact by phone and merges consent without downgrading", () => {
    const known: IntakeContact = {
      tenantId: "obavia",
      contactId: "ct_known",
      displayName: "Marisol O.",
      phone: "+15125550142",
      consent: { phone: "unknown", sms: "unknown", email: "revoked" },
    };
    const r = ingest(metaInbound, meta, ctx({ contacts: [known] }));
    expect(r.contact.contactId).toBe("ct_known");
    expect(r.events[1].eventType).toBe("contact.linked");
    expect(r.events[1].payload.matchedOn).toBe("phone");
    expect(r.contact.consent).toEqual({ phone: "granted", sms: "granted", email: "revoked" });
    expect(r.contact.email).toBe("marisol.ochoa@lonestarmotors.example");
    expect(r.opportunity).toBeDefined();
  });

  it("produces identical ids and events across two runs", () => {
    const a = ingest(landingInbound, vsl, ctx());
    const b = ingest(landingInbound, vsl, ctx());
    expect(a.submission.submissionId).toBe(b.submission.submissionId);
    expect(a.contact.contactId).toBe(b.contact.contactId);
    expect(a.opportunity?.opportunityId).toBe(b.opportunity?.opportunityId);
    expect(a.events.map((e) => e.eventId)).toEqual(b.events.map((e) => e.eventId));
    expect(a.events.map((e) => e.idempotencyKey)).toEqual(b.events.map((e) => e.idempotencyKey));
    expect(new Set(a.events.map((e) => e.eventId)).size).toBe(a.events.length);
  });

  it("refuses an inbound that does not belong to the connection", () => {
    expect(() => ingest(metaInbound, vsl, ctx())).toThrow(/does not belong/);
  });
});

describe("dedupe", () => {
  it("chains a duplicate to the root of the lineage", () => {
    const root: IntakeSubmission = { tenantId: "obavia", submissionId: "sub_root", sourceId: "src_x", providerEventId: "e1", source: "webhook_form", entryPath: "form_entry", receivedAt: "2026-09-18T00:00:00Z", requestText: "", contactId: "ct_a" };
    const mid: IntakeSubmission = { ...root, submissionId: "sub_mid", providerEventId: "e2", receivedAt: "2026-09-19T00:00:00Z", duplicateOfSubmissionId: "sub_root" };
    const raw: RawInbound = { tenantId: "obavia", sourceId: "src_x", providerEventId: "e3", receivedAt: "2026-09-20T00:00:00Z", payload: {} };
    expect(dedupe(raw, "ct_a", [mid, root])).toMatchObject({ kind: "duplicate", duplicateOfSubmissionId: "sub_root" });
    expect(dedupe(raw, "ct_a", [mid, root], 12)).toEqual({ kind: "new" });
    expect(dedupe({ ...raw, providerEventId: "e1" }, "ct_a", [root])).toMatchObject({ kind: "replay", originalSubmissionId: "sub_root" });
  });
});

describe("sourceHealth", () => {
  it("counts recent submissions per source and computes staleness", () => {
    const subs: IntakeSubmission[] = [
      ingest(metaInbound, meta, ctx()).submission,
      ingest(landingInbound, vsl, ctx()).submission,
      ingest(calendlyInbound, calendly, ctx()).submission,
      ingest(shareLinkInbound, share, ctx()).submission,
    ];
    const rows = sourceHealth(sourceConnections, subs, NOW);
    const by = Object.fromEntries(rows.map((r) => [r.sourceId, r]));
    expect(by.src_meta_dealer_video).toMatchObject({ kind: "meta_lead_form", receivedLast24h: 1, receivedLast7d: 1, staleHours: 1.3, status: "connected" });
    expect(by.src_calendly_demo).toMatchObject({ receivedLast24h: 1, receivedLast7d: 1, staleHours: 21.8 });
    expect(by.src_ig_dm_link).toMatchObject({ receivedLast24h: 0, receivedLast7d: 1, staleHours: 72.7 });
    expect(by.src_csv_legacy).toMatchObject({ receivedLast24h: 0, receivedLast7d: 0, status: "paused", lastReceivedAt: "2026-07-01T08:45:00Z" });
    expect(by.src_csv_legacy.staleHours).toBeGreaterThan(24 * 70);
    const fresh: SourceConnection = { ...share, sourceId: "src_never", lastReceivedAt: undefined, receivedCount: 0 };
    expect(sourceHealth([fresh], [], NOW)[0].staleHours).toBeUndefined();
  });
});

describe("trackingSnippet", () => {
  it("gives a form and curl for webhook_form, a URL for share_link, text for others", () => {
    const w = trackingSnippet(vsl, "https://app.salesos.example/");
    expect(w.html).toContain('<form method="post" action="https://app.salesos.example/intake/obavia/src_vsl_landing">');
    expect(w.html).toContain('name="phone"');
    expect(w.curl).toContain("curl -X POST https://app.salesos.example/intake/obavia/src_vsl_landing");
    expect(w.instructions).toContain("vault://obavia/vsl/webhook_key");
    const s = trackingSnippet(share, "https://app.salesos.example");
    expect(s.url).toBe("https://app.salesos.example/add?source=src_ig_dm_link");
    expect(s.html).toBeUndefined();
    const c = trackingSnippet(calendly, "https://app.salesos.example");
    expect(c.instructions).toMatch(/invitee\.created/);
    expect(c.curl).toBeUndefined();
    const m = trackingSnippet(meta, "https://app.salesos.example");
    expect(m.instructions).toMatch(/Meta Business/);
  });
});
