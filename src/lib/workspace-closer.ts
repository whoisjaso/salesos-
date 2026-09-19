/**
 * Pure helpers for the closer workspace (SOS-10, SOS-12, SOS-19).
 * `now` is injected; no Date.now().
 */
import type {
  Appointment,
  AppointmentInstance,
  Assignment,
  Contact,
  FitValue,
  ISODateTime,
  Id,
  LeadSubmission,
  LedgerEntry,
  Offer,
  Opportunity,
  QualificationAssessment,
  Task,
} from "@/domain/types";
import type { Dataset } from "@/domain/metrics";
import { netCollected, opportunityAttributedTo } from "@/domain/metrics";
import type { EvidenceLabel } from "./workspace-setter";
import { contactFor, humanizeKey, languageLabel, latestAssessment, profileFor, submissionFor } from "./workspace-setter";

// ---------- Next appointment ----------

export interface UpcomingAppointment {
  instance: AppointmentInstance;
  appointment: Appointment;
  opportunity: Opportunity;
  contact: Contact;
  submission?: LeadSubmission;
  assignment?: Assignment;
  /** Started already but attendance is unresolved. */
  unresolved: boolean;
}

export function upcomingAppointments(dataset: Dataset, closerId: Id, now: ISODateTime): UpcomingAppointment[] {
  const out: UpcomingAppointment[] = [];
  for (const inst of dataset.appointmentInstances) {
    if (inst.outcome !== "scheduled") continue;
    const apt = dataset.appointments.find((a) => a.appointmentId === inst.appointmentId);
    if (!apt || apt.repUserId !== closerId) continue;
    const opp = dataset.opportunities.find((o) => o.opportunityId === inst.opportunityId);
    if (!opp) continue;
    const contact = contactFor(dataset, opp);
    if (!contact) continue;
    const assignment = dataset.assignments.find((a) => a.opportunityId === opp.opportunityId && a.role === "closer" && a.userId === closerId);
    out.push({
      instance: inst,
      appointment: apt,
      opportunity: opp,
      contact,
      submission: submissionFor(dataset, opp),
      assignment,
      unresolved: Date.parse(inst.scheduledEnd) < Date.parse(now),
    });
  }
  return out.sort((a, b) => Date.parse(a.instance.scheduledStart) - Date.parse(b.instance.scheduledStart));
}

// ---------- Brief ----------

export interface BriefRow {
  label: string;
  text: string;
  evidence: EvidenceLabel;
}

export interface FitChip {
  key: string;
  value: FitValue;
  evidence: EvidenceLabel;
}

export interface CloserBrief {
  rows: BriefRow[];
  fit: FitChip[];
  unknowns: string[];
  preferences: BriefRow[];
  lensHypothesis?: string;
  nextQuestion?: string;
  assessment?: QualificationAssessment;
}

export function buildCloserBrief(dataset: Dataset, item: UpcomingAppointment, offer: Offer | undefined): CloserBrief {
  const { opportunity: opp, contact, submission, appointment } = item;
  const assessment = latestAssessment(dataset, opp.opportunityId);
  const profile = profileFor(dataset, opp.opportunityId);
  const rows: BriefRow[] = [];
  const unknowns: string[] = [];

  if (submission) rows.push({ label: "Request", text: submission.requestText, evidence: "Customer-stated" });
  rows.push({ label: "Desired outcome", text: appointment.purpose, evidence: "Customer-stated" });

  const gm = profile?.explicitPreferences.find((p) => /\bGM\b|owner|manager/i.test(p.text));
  if (gm) rows.push({ label: "Decision participants", text: gm.text, evidence: "Customer-stated" });
  else unknowns.push("Decision participants");

  const fit: FitChip[] = [];
  if (assessment) {
    for (const [key, v] of Object.entries(assessment.objective)) {
      fit.push({ key: humanizeKey(key), value: v.value, evidence: v.evidenceRefs.length ? "Verified" : "AI-proposed" });
      if (v.value === "unknown") unknowns.push(humanizeKey(key));
    }
  } else {
    unknowns.push("Offer fit not assessed");
  }

  const prior = dataset.appointmentInstances.filter((i) => i.opportunityId === opp.opportunityId && i.instanceId !== item.instance.instanceId);
  if (prior.length) {
    const superseded = prior.find((p) => p.outcome === "superseded_before_cutoff");
    rows.push({ label: "Previous promises", text: superseded ? "Rescheduled once; original slot superseded" : `${prior.length} earlier appointment`, evidence: "Verified" });
  } else {
    rows.push({ label: "Previous promises", text: "None recorded", evidence: "Verified" });
  }

  if (offer) rows.push({ label: "Offer version", text: `${offer.name} ${offer.version}`, evidence: "Verified" });

  const preferences: BriefRow[] = [];
  if (contact.preferredLanguage) preferences.push({ label: "Language", text: languageLabel(contact.preferredLanguage), evidence: "Verified" });
  if (contact.preferredChannel) preferences.push({ label: "Channel", text: `Prefers ${contact.preferredChannel}`, evidence: "Customer-stated" });
  for (const p of profile?.explicitPreferences ?? []) preferences.push({ label: "Stated", text: p.text, evidence: "Customer-stated" });
  for (const p of profile?.observedPreferences ?? []) preferences.push({ label: "Observed", text: p.text, evidence: p.confirmed ? "Verified" : "AI-proposed" });

  const lens = profile?.lenses.find((l) => l.status !== "contradicted");

  return { rows, fit, unknowns, preferences, lensHypothesis: lens?.name, nextQuestion: assessment?.nextQuestion, assessment };
}

// ---------- Copilot ----------

export interface CopilotItem {
  id: string;
  kind: "missing_stakeholder" | "implementation_owner" | "unresolved_limitation";
  label: string;
  detail: string;
}

export function copilotItems(brief: CloserBrief): CopilotItem[] {
  const items: CopilotItem[] = [];
  if (brief.unknowns.includes("Decision participants") || brief.fit.some((f) => /budget|authority/i.test(f.key) && f.value === "unknown")) {
    items.push({ id: "stakeholder", kind: "missing_stakeholder", label: "Missing stakeholder", detail: "Who signs off is unknown" });
  }
  if (brief.fit.some((f) => /implementation|owner/i.test(f.key) && f.value !== "yes") || !brief.fit.some((f) => /implementation/i.test(f.key))) {
    items.push({ id: "impl", kind: "implementation_owner", label: "Implementation owner unclear", detail: "Who runs setup on their side" });
  }
  const partial = brief.fit.find((f) => f.value === "partial");
  if (partial) items.push({ id: "limit", kind: "unresolved_limitation", label: "Unresolved limitation", detail: `${partial.key}: partial` });
  return items;
}

// ---------- Financial ladder ----------

export type LadderStep = "verbal_yes" | "proposal_sent" | "signed" | "payment_authorized" | "collected" | "delivery_accepted";

export const LADDER_STEPS: { id: LadderStep; label: string }[] = [
  { id: "verbal_yes", label: "Verbal yes" },
  { id: "proposal_sent", label: "Proposal sent" },
  { id: "signed", label: "Signed" },
  { id: "payment_authorized", label: "Payment authorized" },
  { id: "collected", label: "Collected" },
  { id: "delivery_accepted", label: "Delivery accepted" },
];

/** Index of the current step, or -1 when nothing commercial has happened. */
export function ladderIndex(opp: Opportunity, verbalYes: boolean): number {
  if (opp.paymentState === "collected" || opp.paymentState === "partially_collected" || opp.paymentState === "refunded") return 4;
  if (opp.paymentState === "authorized") return 3;
  if (opp.contractState === "signed") return 2;
  if (opp.contractState === "proposed") return 1;
  return verbalYes ? 0 : -1;
}

export function collectedFor(dataset: Dataset, opportunityId: Id): { entries: LedgerEntry[]; net: ReturnType<typeof netCollected> } {
  const entries = dataset.ledger.filter((e) => e.opportunityId === opportunityId);
  return { entries, net: netCollected(entries, dataset.tenant.reportingCurrency) };
}

// ---------- Queue by type ----------

export type CloserQueueType = "commitments" | "questions" | "proposals" | "contract" | "payment" | "delivery";

export interface CloserQueueItem {
  id: string;
  type: CloserQueueType;
  opportunity: Opportunity;
  contact: Contact;
  label: string;
  when?: ISODateTime;
}

export const QUEUE_TYPE_LABEL: Record<CloserQueueType, string> = {
  commitments: "Due",
  questions: "Questions",
  proposals: "Proposals",
  contract: "Contract",
  payment: "Payment",
  delivery: "Delivery",
};

export function buildCloserQueue(dataset: Dataset, closerId: Id, now: ISODateTime): CloserQueueItem[] {
  const items: CloserQueueItem[] = [];
  const owned = dataset.opportunities.filter((o) => opportunityAttributedTo(o, dataset.assignments, closerId, "closer"));
  const contact = (o: Opportunity) => contactFor(dataset, o);

  for (const task of dataset.tasks as Task[]) {
    if (task.ownerUserId !== closerId || task.state === "completed" || task.state === "canceled") continue;
    const opp = dataset.opportunities.find((o) => o.opportunityId === task.opportunityId);
    const c = opp && contact(opp);
    if (!opp || !c) continue;
    const type: CloserQueueType = task.action === "collect_payment" ? "payment" : task.action === "send_proposal" ? "proposals" : task.action === "handoff_delivery" ? "delivery" : "commitments";
    items.push({ id: task.taskId, type, opportunity: opp, contact: c, label: task.action.replace(/_/g, " "), when: task.dueAt });
  }

  for (const u of upcomingAppointments(dataset, closerId, now)) {
    items.push({
      id: `apt_${u.instance.instanceId}`,
      type: "commitments",
      opportunity: u.opportunity,
      contact: u.contact,
      label: u.unresolved ? "attendance unresolved" : "appointment",
      when: u.instance.scheduledStart,
    });
  }

  for (const opp of owned) {
    const c = contact(opp);
    if (!c) continue;
    const a = latestAssessment(dataset, opp.opportunityId);
    if (opp.commercialStatus === "open" && a?.nextQuestion) {
      items.push({ id: `q_${opp.opportunityId}`, type: "questions", opportunity: opp, contact: c, label: a.nextQuestion });
    }
    if (opp.contractState === "proposed") {
      items.push({ id: `p_${opp.opportunityId}`, type: "proposals", opportunity: opp, contact: c, label: "awaiting decision" });
    }
    if (opp.commercialStatus === "open" && opp.contractState === "none" && (opp.fitState === "verified" || opp.fitState === "likely")) {
      items.push({ id: `c_${opp.opportunityId}`, type: "contract", opportunity: opp, contact: c, label: "ready for proposal" });
    }
    if (opp.contractState === "signed" && (opp.paymentState === "none" || opp.paymentState === "refunded" || opp.paymentState === "disputed") && !items.some((i) => i.opportunity === opp && i.type === "payment")) {
      items.push({ id: `pay_${opp.opportunityId}`, type: "payment", opportunity: opp, contact: c, label: opp.paymentState === "none" ? "signed, $0 collected" : opp.paymentState });
    }
    if (opp.paymentState === "collected") {
      items.push({ id: `d_${opp.opportunityId}`, type: "delivery", opportunity: opp, contact: c, label: "delivery handoff" });
    }
  }
  return items.sort((a, b) => (a.when && b.when ? Date.parse(a.when) - Date.parse(b.when) : a.when ? -1 : b.when ? 1 : 0));
}

// ---------- Personal performance ----------

export interface CloserStats {
  attended: number;
  wins: number;
  netCollectedMinor: number;
  currency: string;
}

export function closerStats(dataset: Dataset, closerId: Id): CloserStats {
  const owned = dataset.opportunities.filter((o) => opportunityAttributedTo(o, dataset.assignments, closerId, "closer"));
  const ids = new Set(owned.map((o) => o.opportunityId));
  const attended = dataset.appointmentInstances.filter((i) => ids.has(i.opportunityId) && i.outcome === "attended").length;
  const wins = owned.filter((o) => o.commercialStatus === "won").length;
  const net = netCollected(dataset.ledger.filter((e) => e.opportunityId && ids.has(e.opportunityId)), dataset.tenant.reportingCurrency);
  return { attended, wins, netCollectedMinor: net.amountMinor, currency: net.currency };
}

export const NO_SALE_REASONS = ["Offer does not fit the need", "No decision authority yet", "Chose another vendor", "Budget not available", "Timing, revisit later"];
