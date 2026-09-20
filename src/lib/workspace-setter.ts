/**
 * Pure helpers for the setter workspace (SOS-09, SOS-12, SOS-13).
 * No React, no Date.now(): `now` is always injected so renders are deterministic.
 */
import type {
  Call,
  CallInterpretedOutcome,
  Contact,
  ISODateTime,
  Id,
  LeadSubmission,
  LensName,
  Opportunity,
  QualificationAssessment,
  Task,
  TaskPriorityReason,
  CommunicationProfile,
} from "@/domain/types";
import type { Dataset } from "@/domain/metrics";
import { BAND_LABEL, bandFor, STAGE_KEYS, type NextStepValue, type StageKey } from "@/domain/callIntelligence";
import { formatRelativeTime } from "@/lib/format";
import { STAGE_WORD, type StageView } from "@/lib/review";

export const TENANT_TZ = "America/New_York";
export const BOOKING_TZ = "America/Chicago";

// ---------- Time formatting in a fixed zone ----------

export function formatTimeIn(iso: ISODateTime, timeZone: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}

export function formatDayIn(iso: ISODateTime, timeZone: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone }).format(new Date(iso));
}

export function formatDateTimeIn(iso: ISODateTime, timeZone: string, locale = "en-US"): string {
  return `${formatDayIn(iso, timeZone, locale)}, ${formatTimeIn(iso, timeZone, locale)}`;
}

/** "ET", "CT" style zone abbreviation for a given instant. */
export function zoneAbbrev(iso: ISODateTime, timeZone: string, locale = "en-US"): string {
  const parts = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" }).formatToParts(new Date(iso));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

/** Same calendar day in a zone. */
export function sameDayIn(a: ISODateTime, b: ISODateTime, timeZone: string): boolean {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date(a)) === f.format(new Date(b));
}

// ---------- Queue ----------

export type QueueAction = Task["action"];

export interface SetterQueueItem {
  id: string;
  taskId?: Id;
  opportunity: Opportunity;
  contact: Contact;
  submission?: LeadSubmission;
  action: QueueAction;
  priority: TaskPriorityReason;
  /** SOS-09 order: 0 scheduled commitments, 1 urgent replies, 2 fresh inquiries, 3 agreed follow-ups, 4 approved reattempts. */
  rank: number;
  /** Plain-language reason, e.g. "Customer asked for a callback at 3:00". */
  reason: string;
  /** The reason in two or three words for a list row, where `when` sits beside it. */
  short: string;
  /** Short due or age text for the row. */
  when: string;
  /** Sort key inside a rank. */
  sortAt: number;
  /** Prior outbound calls on this opportunity, for the reattempt copy. */
  priorAttempts: number;
}

export interface StoppedItem {
  opportunity: Opportunity;
  contact: Contact;
  submission?: LeadSubmission;
}

const RANK: Record<TaskPriorityReason["kind"], number> = {
  scheduled_commitment: 0,
  appointment_confirmation_review: 0,
  urgent_customer_reply: 1,
  fresh_inquiry: 2,
  agreed_follow_up: 3,
  approved_reattempt: 4,
};

export function isOptedOut(contact: Contact): boolean {
  return contact.consent.phone === "revoked" && contact.consent.sms === "revoked" && contact.consent.email === "revoked";
}

export function contactFor(dataset: Dataset, opp: Opportunity): Contact | undefined {
  return dataset.contacts.find((c) => c.contactId === opp.primaryContactId);
}

export function submissionFor(dataset: Dataset, opp: Opportunity): LeadSubmission | undefined {
  const subs = dataset.submissions.filter((s) => s.contactId === opp.primaryContactId && !s.duplicateOfSubmissionId);
  return subs.sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))[0];
}

export function outboundCalls(dataset: Dataset, opportunityId: Id): Call[] {
  return dataset.calls
    .filter((c) => c.opportunityId === opportunityId && c.direction === "outbound" && c.startedAt)
    .sort((a, b) => Date.parse(a.startedAt as string) - Date.parse(b.startedAt as string));
}

export function priorityReasonText(priority: TaskPriorityReason, action: QueueAction, now: ISODateTime, attempts = 0): string {
  switch (priority.kind) {
    case "fresh_inquiry":
      return `New eligible inquiry received ${formatRelativeTime(priority.receivedAt, now)}`;
    case "urgent_customer_reply":
      return `Customer replied ${formatRelativeTime(priority.receivedAt, now)}`;
    case "scheduled_commitment":
      return action === "confirm_appointment"
        ? `Appointment at ${formatTimeIn(priority.dueAt, TENANT_TZ)} needs confirmation`
        : `Customer asked for a callback at ${formatTimeIn(priority.dueAt, TENANT_TZ)}`;
    case "agreed_follow_up":
      return `Follow-up agreed for ${formatTimeIn(priority.dueAt, TENANT_TZ)}`;
    case "approved_reattempt":
      return `Approved reattempt ${priority.attempt}${attempts ? ` after ${attempts} unanswered` : ""}`;
    case "appointment_confirmation_review":
      return "Appointment confirmation needs review";
  }
}

/** The row form of the reason: two or three words, because the row's value already carries the time or the attempt. */
export function shortReasonText(priority: TaskPriorityReason, action: QueueAction, attempts = 0): string {
  switch (priority.kind) {
    case "fresh_inquiry":
      return "New inquiry";
    case "urgent_customer_reply":
      return "Customer replied";
    case "scheduled_commitment":
      return action === "confirm_appointment" ? "Confirm appointment" : "Callback requested";
    case "agreed_follow_up":
      return "Follow-up agreed";
    case "approved_reattempt":
      return attempts ? `Reattempt after ${attempts} unanswered` : "Reattempt approved";
    case "appointment_confirmation_review":
      return "Confirmation review";
  }
}

function whenText(priority: TaskPriorityReason, now: ISODateTime): { when: string; sortAt: number } {
  switch (priority.kind) {
    case "fresh_inquiry":
    case "urgent_customer_reply":
      return { when: formatRelativeTime(priority.receivedAt, now), sortAt: Date.parse(priority.receivedAt) };
    case "scheduled_commitment":
    case "agreed_follow_up":
      return { when: formatTimeIn(priority.dueAt, TENANT_TZ), sortAt: Date.parse(priority.dueAt) };
    case "approved_reattempt":
      return { when: `attempt ${priority.attempt}`, sortAt: priority.attempt };
    case "appointment_confirmation_review":
      return { when: "review", sortAt: 0 };
  }
}

const MAX_APPROVED_ATTEMPTS = 3;

/**
 * Tasks owned by this setter, ordered by SOS-09 priority, plus approved reattempts
 * derived from open opportunities that were attempted but never reached. Opted-out
 * contacts never become callable items; they are returned separately as `stopped`.
 */
export function buildSetterQueue(dataset: Dataset, userId: Id, now: ISODateTime): { queue: SetterQueueItem[]; stopped: StoppedItem[] } {
  const queue: SetterQueueItem[] = [];
  const stopped: StoppedItem[] = [];
  const covered = new Set<Id>();

  for (const task of dataset.tasks) {
    if (task.ownerUserId !== userId) continue;
    if (task.state === "completed" || task.state === "canceled") continue;
    const opp = dataset.opportunities.find((o) => o.opportunityId === task.opportunityId);
    if (!opp) continue;
    const contact = contactFor(dataset, opp);
    if (!contact) continue;
    if (isOptedOut(contact)) {
      stopped.push({ opportunity: opp, contact, submission: submissionFor(dataset, opp) });
      continue;
    }
    const attempts = outboundCalls(dataset, opp.opportunityId).length;
    const { when, sortAt } = whenText(task.priority, now);
    covered.add(opp.opportunityId);
    queue.push({
      id: task.taskId,
      taskId: task.taskId,
      opportunity: opp,
      contact,
      submission: submissionFor(dataset, opp),
      action: task.action,
      priority: task.priority,
      rank: RANK[task.priority.kind],
      reason: priorityReasonText(task.priority, task.action, now, attempts),
      short: shortReasonText(task.priority, task.action, attempts),
      when,
      sortAt,
      priorAttempts: attempts,
    });
  }

  for (const opp of dataset.opportunities) {
    const contact = contactFor(dataset, opp);
    if (!contact) continue;
    const ownedHere = opp.currentOwner.setter === userId;
    const unowned = !opp.currentOwner.setter && !opp.currentOwner.closer;
    if (isOptedOut(contact) && (ownedHere || unowned) && !stopped.some((s) => s.opportunity.opportunityId === opp.opportunityId)) {
      stopped.push({ opportunity: opp, contact, submission: submissionFor(dataset, opp) });
      continue;
    }
    if (!ownedHere || covered.has(opp.opportunityId) || opp.commercialStatus !== "open") continue;
    if (opp.contactState !== "attempted" && opp.contactState !== "voicemail") continue;
    const attempts = outboundCalls(dataset, opp.opportunityId).length;
    if (attempts >= MAX_APPROVED_ATTEMPTS) continue;
    const priority: TaskPriorityReason = { kind: "approved_reattempt", attempt: attempts + 1 };
    const { when, sortAt } = whenText(priority, now);
    queue.push({
      id: `derived_${opp.opportunityId}`,
      opportunity: opp,
      contact,
      submission: submissionFor(dataset, opp),
      action: "call",
      priority,
      rank: RANK.approved_reattempt,
      reason: priorityReasonText(priority, "call", now, attempts),
      short: shortReasonText(priority, "call", attempts),
      when,
      sortAt,
      priorAttempts: attempts,
    });
  }

  queue.sort((a, b) => a.rank - b.rank || a.sortAt - b.sortAt);
  return { queue, stopped };
}

export function primaryLabel(action: QueueAction): string {
  switch (action) {
    case "call":
    case "follow_up":
      return "Call";
    case "reply":
      return "Reply";
    case "confirm_appointment":
      return "Confirm appointment";
    case "review_dq":
      return "Review";
    default:
      return "Open";
  }
}

export function sourceLabel(source: string | undefined): string {
  switch (source) {
    case "meta_lead_form":
      return "Form inquiry";
    case "website_form":
      return "Website form";
    case "calendar_booking_page":
      return "Self-booked";
    default:
      return source ? source.replace(/_/g, " ") : "Unknown source";
  }
}

export function languageLabel(code: string | undefined): string {
  switch (code) {
    case "en":
      return "English";
    case "es":
      return "Spanish";
    case "pl":
      return "Polish";
    default:
      return code ?? "Unknown";
  }
}

/** Prior relationship: earlier opportunities or a duplicate submission for the same contact. */
export function priorRelationship(dataset: Dataset, opp: Opportunity): string | undefined {
  const dup = dataset.submissions.find((s) => s.contactId === opp.primaryContactId && s.duplicateOfSubmissionId);
  if (dup) return "Submitted twice";
  const earlier = dataset.opportunities.filter(
    (o) => o.primaryContactId === opp.primaryContactId && o.opportunityId !== opp.opportunityId && Date.parse(o.accountabilityStartedAt) < Date.parse(opp.accountabilityStartedAt),
  );
  if (earlier.length) return `${earlier.length} earlier inquiry`;
  return undefined;
}

// ---------- Today strip ----------

export interface TodayStrip {
  dials: number;
  twoWay: number;
  bookings: number;
}

export function todayStrip(dataset: Dataset, userId: Id, now: ISODateTime): TodayStrip {
  const calls = dataset.calls.filter((c) => c.userId === userId && c.direction === "outbound" && c.startedAt && sameDayIn(c.startedAt, now, TENANT_TZ));
  const twoWay = calls.filter((c) => c.interpretedOutcome === "meaningful_interaction" && c.outcomeConfirmedBy).length;
  const owned = new Set(dataset.opportunities.filter((o) => o.currentOwner.setter === userId).map((o) => o.opportunityId));
  const bookings = dataset.appointmentInstances.filter((i) => owned.has(i.opportunityId) && !i.supersedesInstanceId && sameDayIn(i.scheduledStart, now, TENANT_TZ)).length;
  return { dials: calls.length, twoWay, bookings };
}

// ---------- Call simulation ----------

/** Deterministic likely outcome per opportunity so screenshots and demos repeat. */
export function simulatedOutcome(opportunityId: Id, priorAttempts: number): CallInterpretedOutcome {
  if (priorAttempts > 0) return "voicemail";
  let h = 0;
  for (const ch of opportunityId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = h % 10;
  return r < 5 ? "meaningful_interaction" : r < 8 ? "voicemail" : "no_answer";
}

/** Deterministic stage scores and next step for the simulated call, so the post-call step auto-applies without a transcript. */
export interface SimulatedPostCall {
  outcome: CallInterpretedOutcome;
  stages: StageView[];
  nextStep: NextStepValue;
}

/** The next step the extraction picks for an outcome: book, callback, or DQ review. */
export function nextStepFor(outcome: CallInterpretedOutcome): NextStepValue {
  switch (outcome) {
    case "meaningful_interaction":
      return "book";
    case "wrong_contact":
      return "dq_review";
    case "voicemail":
    case "no_answer":
      return "callback";
    default:
      return "none";
  }
}

function hashOf(id: Id): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Stage scores under the default bands for a simulated outcome. No transcript, so no cited spans. */
export function simulatedStages(outcome: CallInterpretedOutcome, opportunityId: Id): StageView[] {
  const h = hashOf(opportunityId);
  const scores: Record<StageKey, number> =
    outcome === "meaningful_interaction"
      ? (() => {
          const qualified = 0.55 + (h % 30) / 100; // 0.55..0.84
          return { contacted: 0.9, qualified, buying: Math.max(0, Math.round((qualified - 0.15) * 100) / 100), bought: 0 };
        })()
      : outcome === "voicemail" || outcome === "wrong_contact"
        ? { contacted: 0.1, qualified: 0, buying: 0, bought: 0 }
        : { contacted: 0, qualified: 0, buying: 0, bought: 0 };
  return STAGE_KEYS.map((key) => {
    const score = Math.round(scores[key] * 100) / 100;
    const band = bandFor(score);
    const cleared = band === "yes" || band === "likely";
    return { key, label: STAGE_WORD[key], score, percent: Math.round(score * 100), band, bandLabel: BAND_LABEL[band], application: cleared ? "applied" : score > 0 ? "leaning" : "none", spanIndexes: [] };
  });
}

export function simulatedPostCall(opportunityId: Id, priorAttempts: number, outcome = simulatedOutcome(opportunityId, priorAttempts)): SimulatedPostCall {
  return { outcome, stages: simulatedStages(outcome, opportunityId), nextStep: nextStepFor(outcome) };
}

export const OUTCOME_LABEL: Record<CallInterpretedOutcome, string> = {
  no_answer: "No answer",
  voicemail: "Voicemail",
  wrong_contact: "Wrong contact",
  meaningful_interaction: "Meaningful interaction",
  unknown: "Unknown",
};

/** SOS-13 pre-call DQ reason codes. */
export const DQ_REASONS: { code: string; label: string }[] = [
  { code: "spam_test_duplicate", label: "Spam, test, or duplicate" },
  { code: "wrong_service", label: "Wrong service" },
  { code: "ineligible_need", label: "Ineligible product need" },
  { code: "request_withdrawn", label: "Contact request withdrawn" },
  { code: "unreachable_after_attempts", label: "Unreachable after approved attempts" },
  { code: "timing_nurture", label: "Timing, nurture" },
];

/** Approved business fallback when the phone provider is unavailable (SOS-09 exceptions). */
export const PROVIDER_FALLBACK = {
  title: "Provider unavailable",
  steps: ["Dial from the business desk line", "Log the result here when done", "Do not use a personal phone"],
  line: "Desk line 2",
};

// ---------- Booking slots ----------

export interface BookingSlot {
  id: string;
  startIso: ISODateTime;
  endIso: ISODateTime;
  repUserId: Id;
}

function nextBusinessDays(fromIso: ISODateTime, count: number, timeZone: string): string[] {
  const days: string[] = [];
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  let t = Date.parse(fromIso) + 86_400_000;
  while (days.length < count) {
    const parts = fmt.formatToParts(new Date(t));
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
    if (wd !== "Sat" && wd !== "Sun") {
      const y = parts.find((p) => p.type === "year")?.value;
      const m = parts.find((p) => p.type === "month")?.value;
      const d = parts.find((p) => p.type === "day")?.value;
      days.push(`${y}-${m}-${d}`);
    }
    t += 86_400_000;
  }
  return days;
}

/** Offset (minutes) of a zone at a UTC instant. */
function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return (asUtc - utcMs) / 60_000;
}

/** Wall-clock time in a zone to a UTC ISO instant. Two-pass so DST edges resolve. */
export function zonedToIso(day: string, hour: number, minute: number, timeZone: string): ISODateTime {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const off1 = zoneOffsetMinutes(guess, timeZone);
  const utc1 = guess - off1 * 60_000;
  const off2 = zoneOffsetMinutes(utc1, timeZone);
  return new Date(guess - off2 * 60_000).toISOString().replace(".000Z", "Z");
}

/**
 * Real free slots: two per business day over the next three business days,
 * assigned to the closer with the lightest scheduled load who is free then.
 * The fixture carries no availability calendar, so business hours are the policy.
 */
export function generateSlots(dataset: Dataset, now: ISODateTime, closerIds: Id[], durationMinutes = 45): BookingSlot[] {
  const days = nextBusinessDays(now, 3, BOOKING_TZ);
  const scheduled = dataset.appointmentInstances.filter((i) => i.outcome === "scheduled");
  const load = (rep: Id) =>
    scheduled.filter((i) => dataset.appointments.find((a) => a.appointmentId === i.appointmentId)?.repUserId === rep).length;
  const busy = (rep: Id, startIso: ISODateTime, endIso: ISODateTime) =>
    scheduled.some((i) => {
      const apt = dataset.appointments.find((a) => a.appointmentId === i.appointmentId);
      return apt?.repUserId === rep && Date.parse(i.scheduledStart) < Date.parse(endIso) && Date.parse(i.scheduledEnd) > Date.parse(startIso);
    });
  const slots: BookingSlot[] = [];
  const reps = [...closerIds].sort((a, b) => load(a) - load(b));
  for (const day of days) {
    for (const [h, m] of [[10, 0], [14, 0]] as const) {
      const startIso = zonedToIso(day, h, m, BOOKING_TZ);
      const endIso = new Date(Date.parse(startIso) + durationMinutes * 60_000).toISOString().replace(".000Z", "Z");
      const rep = reps.find((r) => !busy(r, startIso, endIso));
      if (!rep) continue;
      slots.push({ id: `slot_${day}_${h}`, startIso, endIso, repUserId: rep });
    }
  }
  return slots;
}

// ---------- Handoff brief ----------

export type EvidenceLabel = "Customer-stated" | "Verified" | "AI-proposed";

export interface BriefLine {
  text: string;
  label: EvidenceLabel;
}

export interface HandoffBrief {
  problem: BriefLine[];
  fitEvidence: BriefLine[];
  participants: BriefLine[];
  timeline: BriefLine[];
  questions: BriefLine[];
  commitments: BriefLine[];
  preferences: BriefLine[];
  lensHypothesis?: LensName;
  missing: string[];
}

export function latestAssessment(dataset: Dataset, opportunityId: Id): QualificationAssessment | undefined {
  return dataset.assessments
    .filter((a) => a.opportunityId === opportunityId)
    .sort((a, b) => Date.parse(b.assessedAt) - Date.parse(a.assessedAt))[0];
}

export function profileFor(dataset: Dataset, opportunityId: Id): CommunicationProfile | undefined {
  return dataset.communicationProfiles?.find((p) => p.opportunityId === opportunityId);
}

export function humanizeKey(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function explicitQuestions(requestText: string | undefined): string[] {
  if (!requestText) return [];
  return requestText
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.endsWith("?"));
}

export function buildHandoffBrief(
  dataset: Dataset,
  opp: Opportunity,
  contact: Contact,
  submission: LeadSubmission | undefined,
  commitments: string[],
): HandoffBrief {
  const assessment = latestAssessment(dataset, opp.opportunityId);
  const profile = profileFor(dataset, opp.opportunityId);
  const missing: string[] = [];

  const fitEvidence: BriefLine[] = [];
  if (assessment) {
    for (const [key, v] of Object.entries(assessment.objective)) {
      if (v.value === "unknown") {
        missing.push(humanizeKey(key));
        continue;
      }
      fitEvidence.push({ text: `${humanizeKey(key)}: ${v.value}`, label: v.evidenceRefs.length ? "Verified" : "AI-proposed" });
    }
    if (assessment.repReason) fitEvidence.push({ text: assessment.repReason, label: "Customer-stated" });
  } else {
    missing.push("Offer-fit questions not asked yet");
  }

  const participants: BriefLine[] = [];
  const gmPref = profile?.explicitPreferences.find((p) => /\bGM\b|owner|manager/i.test(p.text));
  if (gmPref) participants.push({ text: gmPref.text, label: "Customer-stated" });
  if (/owner asked me/i.test(submission?.requestText ?? "")) participants.push({ text: "Owner initiated the request", label: "Customer-stated" });
  if (participants.length === 0) missing.push("Decision participants");

  const timeline: BriefLine[] = [];
  if (/before Q4/i.test(submission?.requestText ?? "")) timeline.push({ text: "Wants a decision before Q4", label: "Customer-stated" });
  if (timeline.length === 0) missing.push("Timeline");

  const questions = explicitQuestions(submission?.requestText).map<BriefLine>((q) => ({ text: q, label: "Customer-stated" }));

  const preferences: BriefLine[] = [];
  if (contact.preferredLanguage) preferences.push({ text: `${languageLabel(contact.preferredLanguage)} preferred`, label: "Verified" });
  if (contact.preferredChannel) preferences.push({ text: `Prefers ${contact.preferredChannel}`, label: "Customer-stated" });
  for (const p of profile?.explicitPreferences ?? []) preferences.push({ text: p.text, label: "Customer-stated" });
  for (const p of profile?.observedPreferences ?? []) preferences.push({ text: p.text, label: p.confirmed ? "Verified" : "AI-proposed" });

  const lens = profile?.lenses.find((l) => l.status === "hypothesis" || l.status === "confirmed");

  return {
    problem: submission ? [{ text: submission.requestText, label: "Customer-stated" }] : [],
    fitEvidence,
    participants,
    timeline,
    questions,
    commitments: commitments.map((c) => ({ text: c, label: "Verified" })),
    preferences,
    lensHypothesis: lens?.name,
    missing,
  };
}
