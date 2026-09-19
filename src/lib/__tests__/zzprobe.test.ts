import { it } from "vitest";
import { obaviaDatasetWithPairs, obaviaPairs, NOW } from "@/fixtures/obavia";
import { activePairs, pairFunnel, pairHandoff, pairOpportunities, pairDiagnostic } from "@/domain/pairs";

it("probe", () => {
const ds = obaviaDatasetWithPairs;
const nowMs = Date.parse(NOW);
const contacts = new Map(ds.contacts.map((c) => [c.contactId, c]));
for (const p of activePairs(obaviaPairs, NOW)) {
  const opps = pairOpportunities(ds, p.pairId);
  const ids = new Set(opps.map((o) => o.opportunityId));
  const h = pairHandoff(ds, p.pairId);
  console.log(`\n== ${p.pairId} setter=${p.setterUserId} closer=${p.closerUserId} opps=${opps.length} handoff=${JSON.stringify(h)}`);
  const waiting = ds.assignments.filter((a) => a.role === "closer" && ids.has(a.opportunityId) && !a.acceptedAt);
  for (const a of waiting) {
    const opp = opps.find((o) => o.opportunityId === a.opportunityId)!;
    const c = contacts.get(opp.primaryContactId);
    console.log(`   waiting: ${a.opportunityId} decided ${a.decidedAt} hours=${((nowMs - Date.parse(a.decidedAt))/3600000).toFixed(1)} contact=${c?.displayName} org=${c?.organizationName} status=${opp.commercialStatus}`);
  }
  const upcoming = ds.appointmentInstances.filter((i) => ids.has(i.opportunityId) && Date.parse(i.scheduledStart) >= nowMs).sort((a,b)=>a.scheduledStart.localeCompare(b.scheduledStart));
  for (const i of upcoming.slice(0,4)) {
    const opp = opps.find((o) => o.opportunityId === i.opportunityId)!;
    const c = contacts.get(opp.primaryContactId);
    console.log(`   upcoming: ${i.scheduledStart} outcome=${i.outcome} retained=${i.retainedAfterReview} confirmed=${i.confirmedByCustomer} contact=${c?.displayName} org=${c?.organizationName}`);
  }
  const unresolved = ds.appointmentInstances.filter((i) => ids.has(i.opportunityId) && (i.outcome === "unknown" || i.outcome === "scheduled") && Date.parse(i.scheduledEnd) < nowMs);
  console.log(`   unresolved past: ${unresolved.length}`);
  const f = pairFunnel(ds, obaviaPairs, p.pairId, {}, NOW);
  console.log("   setterSide:", f.setterSide.map(s=>`${s.label}=${s.count}`).join(" "), "| closerSide:", f.closerSide.map(s=>`${s.label}=${s.count}`).join(" "));
  const d = pairDiagnostic(ds, obaviaPairs, p.pairId, NOW);
  console.log(`   diag side=${d.weakestSide} stage=${d.stageId} gap=${d.gap.toFixed(3)} obs=${d.observed} comp=${d.comparator}`);
}
});
