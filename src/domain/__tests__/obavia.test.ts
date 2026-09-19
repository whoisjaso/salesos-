import { describe, expect, it } from "vitest";
import { NOW, OPTED_OUT_CONTACT_ID, OPTED_OUT_OPPORTUNITY_ID, RESCHEDULED_OPPORTUNITY_ID, generateObaviaDataset, obaviaDataset } from "@/fixtures/obavia";
import { computeM01, computeM02 } from "@/domain/metrics";

describe("obavia synthetic fixture", () => {
  it("is deterministic", () => {
    expect(JSON.stringify(generateObaviaDataset())).toBe(JSON.stringify(generateObaviaDataset()));
    expect(JSON.stringify(generateObaviaDataset(1))).not.toBe(JSON.stringify(generateObaviaDataset(2)));
  });

  it("has the requested shape", () => {
    const d = obaviaDataset;
    expect(d.synthetic).toBe(true);
    expect(d.tenant.tenantId).toBe("obavia");
    expect(d.users).toHaveLength(6);
    expect(d.users.filter((u) => u.roles.includes("setter"))).toHaveLength(2);
    expect(d.users.filter((u) => u.roles.includes("closer"))).toHaveLength(3);
    expect(d.users.filter((u) => u.roles.includes("owner"))).toHaveLength(1);
    expect(d.opportunities).toHaveLength(90);
    expect(d.offers?.[0].listPrice.amountMinor).toBe(480_000);
    expect(d.commissionPolicy.hypothetical).toBe(true);
    expect(d.commissionPolicy.ratePercent).toBe(5);
    const paths = new Set(d.opportunities.map((o) => o.entryPath));
    expect(paths.has("form_entry") && paths.has("booked_entry")).toBe(true);
    expect(new Set(d.opportunities.map((o) => o.leadTier))).toEqual(new Set([1, 2, 3]));
    const starts = d.opportunities.map((o) => o.accountabilityStartedAt).sort();
    expect(starts[0] >= "2026-08-20").toBe(true);
    expect(starts[starts.length - 1] < "2026-09-19").toBe(true);
  });

  it("contains the required exceptions and edge cases", () => {
    const d = obaviaDataset;
    expect(d.ledger.filter((e) => e.opportunityId === undefined)).toHaveLength(1);
    expect(d.ledger.filter((e) => e.kind === "refund")).toHaveLength(1);
    expect(d.submissions.filter((s) => s.duplicateOfSubmissionId)).toHaveLength(1);
    const optedOut = d.contacts.find((c) => c.contactId === OPTED_OUT_CONTACT_ID);
    expect(optedOut?.consent).toEqual({ phone: "revoked", sms: "revoked", email: "revoked" });
    expect(d.calls.filter((c) => c.opportunityId === OPTED_OUT_OPPORTUNITY_ID)).toHaveLength(0);
    const lineage = d.appointmentInstances.filter((i) => i.opportunityId === RESCHEDULED_OPPORTUNITY_ID);
    expect(lineage).toHaveLength(2);
    expect(lineage[0].outcome).toBe("superseded_before_cutoff");
    expect(lineage[1].supersedesInstanceId).toBe(lineage[0].instanceId);
    expect(d.appointmentInstances.some((i) => i.outcome === "unknown" && i.matured)).toBe(true);
    const kinds = new Set(d.tasks.map((t) => t.priority.kind));
    for (const k of ["scheduled_commitment", "urgent_customer_reply", "fresh_inquiry", "agreed_follow_up", "approved_reattempt", "appointment_confirmation_review"]) {
      expect(kinds.has(k as never)).toBe(true);
    }
    const transports = new Set(d.calls.map((c) => c.transportState));
    for (const t of ["queued", "ringing", "ended", "failed"]) expect(transports.has(t as never)).toBe(true);
    expect(d.communicationProfiles?.some((p) => p.explicitPreferences.some((e) => e.text.includes("prefers numbers first")))).toBe(true);
    expect(d.opportunities.some((o) => o.commercialStatus === "dq")).toBe(true);
    expect(d.opportunities.some((o) => o.contractState === "signed" && o.paymentState === "none")).toBe(true); // signed, unpaid
  });

  it("duplicate submission does not create a new accountable opportunity (T02)", () => {
    expect(computeM01(obaviaDataset, {}, NOW).value).toBe(91);
    expect(computeM02(obaviaDataset, {}, NOW).value).toBe(90);
  });
});
