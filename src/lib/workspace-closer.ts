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
  LensName,
  Offer,
  Opportunity,
  QualificationAssessment,
  Task,
} from "@/domain/types";
import {
  BUYER_MODE_LABEL,
  CONFIDENT,
  emptyBuyerMode,
  inferArchetypes,
  inferBuyerMode,
  knownDimensions,
  mergeArchetypeRead,
  mergeBuyerMode,
  type ArchetypeRead,
  type BuyerMode,
  type BuyerModeDimension,
} from "@/domain/buyerMode";
import type { TranscriptSpan } from "@/domain/callIntelligence";
import type { Dataset } from "@/domain/metrics";
import { lensByName } from "@/content/lenses";
import { transcriptFor } from "@/fixtures/calls";
import { disputeAtRisk, netCollected, opportunityAttributedTo, processingFees } from "@/domain/metrics";
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

/** One known dimension on the brief: "Decision speed: Fast", a dot, the cited words on tap. */
export interface BuyerModeBriefRow {
  dimension: BuyerModeDimension;
  label: string;
  value: string;
  /** 0..1 */
  confidence: number;
  /** Filled dot at or above CONFIDENT. */
  confident: boolean;
  /** The customer's own words, exactly as spoken. */
  quotes: string[];
}

/** One line of the archetype read on the brief: label, percent, a slim bar, the cited words on tap. */
export interface ReadBriefRow {
  name: ArchetypeRead["name"];
  label: string;
  /** 0..100, rounded. */
  percent: number;
  quotes: string[];
}

/**
 * The Buyer mode card: the top three known dimensions, the approach lines, the read, and the
 * communication preferences folded in as evidence. `empty` shows one dim "No signal yet" row.
 */
export interface BuyerModeCard {
  rows: BuyerModeBriefRow[];
  approach: string[];
  read: ReadBriefRow[];
  evidence: BriefRow[];
  /** Ended calls with a transcript that fed the card. */
  callIds: Id[];
  empty: boolean;
}

export const NO_SIGNAL_WORD = "No signal yet";
export const MAX_BRIEF_DIMENSIONS = 3;

export interface CloserBrief {
  rows: BriefRow[];
  fit: FitChip[];
  unknowns: string[];
  /** Kept for callers that list preferences alone; the brief shows them inside `buyerMode.evidence`. */
  preferences: BriefRow[];
  buyerMode: BuyerModeCard;
  lensHypothesis?: LensName;
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
  const buyerMode = buildBuyerModeCard(dataset, opp.opportunityId, preferences);

  return { rows, fit, unknowns, preferences, buyerMode, lensHypothesis: lens?.name, nextQuestion: assessment?.nextQuestion, assessment };
}

/** Ended calls on the opportunity that have a transcript, oldest first, so evidence accumulates in order. */
export function transcriptsFor(dataset: Dataset, opportunityId: Id): { callId: Id; transcript: TranscriptSpan[] }[] {
  return dataset.calls
    .filter((c) => c.opportunityId === opportunityId && c.transportState === "ended")
    .sort((a, b) => Date.parse(a.startedAt ?? "0") - Date.parse(b.startedAt ?? "0"))
    .map((c) => ({ callId: c.callId, transcript: transcriptFor(c.callId) }))
    .filter((x): x is { callId: Id; transcript: TranscriptSpan[] } => Boolean(x.transcript));
}

/**
 * Buyer mode for the opportunity: inferBuyerMode over every ended call with a transcript, merged
 * so evidence accumulates, plus the communication profile's stated preferences. Pure over the dataset.
 */
export function buildBuyerModeCard(dataset: Dataset, opportunityId: Id, evidence: BriefRow[] = []): BuyerModeCard {
  const profile = profileFor(dataset, opportunityId);
  const calls = transcriptsFor(dataset, opportunityId);
  let mode: BuyerMode = calls.length === 0 && profile ? inferBuyerMode([], profile) : emptyBuyerMode();
  let read: ArchetypeRead[] = calls.length === 0 && profile ? inferArchetypes([], profile) : [];
  for (const { transcript } of calls) {
    mode = mergeBuyerMode(mode, inferBuyerMode(transcript, profile));
    read = mergeArchetypeRead(read, inferArchetypes(transcript, profile));
  }
  const rows: BuyerModeBriefRow[] = knownDimensions(mode).slice(0, MAX_BRIEF_DIMENSIONS).map((dimension) => {
    const v = mode[dimension];
    return { dimension, label: BUYER_MODE_LABEL[dimension], value: v.value, confidence: v.confidence, confident: v.confidence >= CONFIDENT, quotes: v.spans.map((s) => s.text.trim()) };
  });
  const readRows: ReadBriefRow[] = read.map((r) => ({ name: r.name, label: lensByName[r.name]?.label ?? r.name, percent: Math.round(r.probability * 100), quotes: r.spans.map((s) => s.text.trim()) }));
  return { rows, approach: mode.approach, read: readRows, evidence, callIds: calls.map((c) => c.callId), empty: rows.length === 0 && readRows.length === 0 };
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

export type LadderStep =
  | "verbal_yes"
  | "proposal_sent"
  | "signed"
  | "payment_authorized"
  | "payment_processing"
  | "collected"
  | "delivery_accepted";

/**
 * Seven separate statuses. Processing is its own step because a payment can
 * finish checkout before it succeeds: a customer saying "I paid" while the
 * provider is still working is Processing and never Collected (specification
 * 5 step 5 and 17.5, scenario 2).
 */
export const LADDER_STEPS: { id: LadderStep; label: string }[] = [
  { id: "verbal_yes", label: "Verbal yes" },
  { id: "proposal_sent", label: "Proposal sent" },
  { id: "signed", label: "Signed" },
  { id: "payment_authorized", label: "Payment authorized" },
  { id: "payment_processing", label: "Processing" },
  { id: "collected", label: "Collected" },
  { id: "delivery_accepted", label: "Delivery accepted" },
];

export const LADDER_INDEX: Record<LadderStep, number> = Object.fromEntries(
  LADDER_STEPS.map((s, i) => [s.id, i]),
) as Record<LadderStep, number>;

/**
 * Index of the current step, or -1 when nothing commercial has happened.
 *
 * Three rules this encodes, each one a fact the previous version lost
 * (docs/PAYMENTS_AUDIT.md H4):
 *
 * - "refunded" is not "collected". Cash arrived and went back, so the
 *   opportunity's current financial state is signed with no cash held. The step
 *   it once reached is carried by `ladderNote`, not by the current position.
 * - "disputed" is not "signed". Cash arrived and is contested. An opened
 *   dispute is an at-risk figure and produces no realized debit, so the position
 *   stays Collected and the risk is disclosed beside it.
 * - "processing" is its own position, between authorized and collected.
 */
export function ladderIndex(opp: Opportunity, verbalYes: boolean): number {
  if (opp.paymentState === "collected" || opp.paymentState === "partially_collected" || opp.paymentState === "disputed") {
    return LADDER_INDEX.collected;
  }
  // Collected, then returned. The money is no longer held, so the current state
  // is the signed contract it was collected against.
  if (opp.paymentState === "refunded") return LADDER_INDEX.signed;
  if (opp.paymentState === "processing") return LADDER_INDEX.payment_processing;
  if (opp.paymentState === "authorized") return LADDER_INDEX.payment_authorized;
  if (opp.contractState === "signed") return LADDER_INDEX.signed;
  if (opp.contractState === "proposed") return LADDER_INDEX.proposal_sent;
  return verbalYes ? LADDER_INDEX.verbal_yes : -1;
}

/**
 * What the current position does not say on its own. Every state has a word and
 * an icon name here, so nothing on the ladder is carried by colour alone.
 */
export interface LadderNote {
  /** Short words for the state. */
  label: string;
  /** Phosphor icon name paired with the label. */
  icon: string;
  /** One sentence, for the accessible name and for anything that has room. */
  statement: string;
  /** True when the Collected step was reached and then reversed. */
  reversed: boolean;
  /** True when cash is held but contested. Never a debit. */
  atRisk: boolean;
}

export function ladderNote(opp: Opportunity): LadderNote | null {
  switch (opp.paymentState) {
    case "refunded":
      return {
        label: "Refunded",
        icon: "ArrowUDownLeft",
        statement: "Collected, then returned. The sale is not deleted and the refund restates the period it belongs to.",
        reversed: true,
        atRisk: false,
      };
    case "disputed":
      return {
        label: "Dispute open",
        icon: "Warning",
        statement: "Cash was collected and is being disputed. An open dispute is money at risk, not a debit, so it is shown beside collected cash and never subtracted from it.",
        reversed: false,
        atRisk: true,
      };
    case "processing":
      return {
        label: "Processing",
        icon: "Hourglass",
        statement: "The provider has not confirmed this payment. Checkout finishing is not collection.",
        reversed: false,
        atRisk: false,
      };
    case "authorized":
      return {
        label: "Authorized",
        icon: "CreditCard",
        statement: "A card authorization is not collected cash.",
        reversed: false,
        atRisk: false,
      };
    case "partially_collected":
      return {
        label: "Part collected",
        icon: "ChartPieSlice",
        statement: "Part of the contracted value has been collected. The rest is still outstanding.",
        reversed: false,
        atRisk: false,
      };
    default:
      return null;
  }
}

/**
 * The opportunity's own ledger slice with each figure on its own terms: cash
 * that moved, money threatened by an open dispute, and processing fees. The
 * three are never summed into one number (NET_COLLECTED_CASH_POLICY).
 */
export function collectedFor(
  dataset: Dataset,
  opportunityId: Id,
): {
  entries: LedgerEntry[];
  net: ReturnType<typeof netCollected>;
  atRisk: ReturnType<typeof disputeAtRisk>;
  fees: ReturnType<typeof processingFees>;
} {
  const entries = dataset.ledger.filter((e) => e.opportunityId === opportunityId);
  const currency = dataset.tenant.reportingCurrency;
  return {
    entries,
    net: netCollected(entries, currency),
    atRisk: disputeAtRisk(entries, currency),
    fees: processingFees(entries, currency),
  };
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

/**
 * Payment states that put a signed opportunity in the payment queue, and the
 * words each one reads as. A raw enum value was appearing on screen, and
 * "signed, $0 collected" was being said about states where a payment did exist.
 */
const PAYMENT_QUEUE_STATES: Opportunity["paymentState"][] = ["none", "authorized", "processing", "refunded", "disputed"];

const PAYMENT_QUEUE_LABEL: Partial<Record<Opportunity["paymentState"], string>> = {
  none: "signed, $0 collected",
  authorized: "authorized, not collected",
  processing: "processing, not confirmed",
  refunded: "collected, then refunded",
  disputed: "collected, dispute open",
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
    if (opp.contractState === "signed" && PAYMENT_QUEUE_STATES.includes(opp.paymentState) && !items.some((i) => i.opportunity === opp && i.type === "payment")) {
      items.push({ id: `pay_${opp.opportunityId}`, type: "payment", opportunity: opp, contact: c, label: PAYMENT_QUEUE_LABEL[opp.paymentState] ?? opp.paymentState });
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
