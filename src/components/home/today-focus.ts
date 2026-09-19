/**
 * The Today secondary area (docs/DECISIONS.md, "Today connects to improvement").
 *
 * One compact strip under the hero and the list, never a dashboard. It has two
 * states and the choice between them is deterministic:
 *
 * - No call has been reviewed inside the window: today's verified progress,
 *   three counts on one line, each stating what it counts and over what period.
 * - A call has been reviewed inside the window and coaching that is waiting on
 *   nothing can be named: the single next improvement, one sentence, with a link
 *   that opens the transcript at the exact moment it can be seen in.
 *
 * Rules baked in:
 * - Verified events only. A count whose evidence does not exist today is left
 *   out rather than printed as a zero; a real zero with its denominator is shown,
 *   because a verified zero and a missing figure are different things
 *   ("Say the whole measurement", "Never show a list that looks ranked ...").
 * - A count bounded by unresolved attendance reads "at least N", never a false exact.
 * - A held recommendation is never the improvement. It rides along as one quiet
 *   note naming what it waits on and who owns it ("A held measurement never holds
 *   the person"): transcript coaching stands while revenue coaching waits.
 * - Pure. `now` is injected; nothing here reads the clock.
 */
import type { Dataset } from "@/domain/metrics";
import type { AppointmentInstance, ISODateTime, Id } from "@/domain/types";
import { coachingPlan, type CoachingPlan } from "@/domain/coaching";
import { buildReview, canReview, coachingMoment, formatClock, reviewableCalls } from "@/lib/review";
import { sameDayIn, TENANT_TZ } from "@/lib/workspace-setter";

export type RepRole = "setter" | "closer";

/** How recently a call has to have been reviewed for the area to lead with the improvement. */
export const REVIEWED_WINDOW_HOURS = 12;

export type TodayCountId = "conversations" | "bookings" | "attended";

export interface TodayCount {
  id: TodayCountId;
  /** The figure. A floor, not an exact, when `atLeast` is true. */
  value: number;
  /** The word the figure carries, already plural agreed. */
  word: string;
  /** What the figure counts, with its period, in words. */
  counts: string;
  /** Unresolved attendance bounds this figure, so it reads "at least N". */
  atLeast: boolean;
}

export interface TodayImprovement {
  /** One sentence, imperative. */
  sentence: string;
  /** What it is about, in a few words. */
  label: string;
  /** Whose conversation it was read from. */
  source: string;
  /** `/review?call=<id>&span=<startMs>`: the transcript, at that moment. */
  href: string;
  /** Where in the call, as the transcript prints it. */
  at: string;
  callId: Id;
  spanStartMs: number;
}

/** A recommendation that is waiting on an incident. Never the improvement; at most a quiet note. */
export interface TodayHeldNote {
  title: string;
  waitingOn: string;
  ownerLabel: string;
  action: string;
  statement: string;
}

export type TodayFocus =
  | { kind: "progress"; counts: TodayCount[]; held?: TodayHeldNote }
  | { kind: "improvement"; improvement: TodayImprovement; held?: TodayHeldNote };

/** Work the person completed in this session, which is today by definition. */
export interface SessionProgress {
  /** Calls placed and answered since the screen opened. */
  conversations?: number;
  calls?: number;
  /** Bookings made since the screen opened. */
  bookings?: number;
}

export interface TodayFocusOptions {
  /** A call reviewed in this session. It takes the area straight away. */
  reviewedCallId?: Id;
  session?: SessionProgress;
  windowHours?: number;
  /** Supply the plan when the caller already has it, so it is computed once. */
  plan?: CoachingPlan;
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

function ownedOpportunityIds(dataset: Dataset, userId: Id, role: RepRole): Set<Id> {
  return new Set(dataset.opportunities.filter((o) => o.currentOwner[role] === userId).map((o) => o.opportunityId));
}

/** This person's appointment instances that sit on today's calendar, in the tenant's timezone. */
function instancesToday(dataset: Dataset, userId: Id, role: RepRole, now: ISODateTime): AppointmentInstance[] {
  const owned = ownedOpportunityIds(dataset, userId, role);
  const mine = new Set(
    dataset.appointments.filter((a) => a.repUserId === userId || owned.has(a.opportunityId)).map((a) => a.appointmentId),
  );
  return dataset.appointmentInstances.filter((i) => mine.has(i.appointmentId) && sameDayIn(i.scheduledStart, now, TENANT_TZ));
}

/**
 * Today's verified progress: conversations confirmed, bookings retained, appointments
 * attended. A count appears only where the evidence for it exists today, so an empty
 * day says so in words instead of printing three zeros.
 */
export function todayCounts(dataset: Dataset, userId: Id, role: RepRole, now: ISODateTime, session: SessionProgress = {}): TodayCount[] {
  const counts: TodayCount[] = [];

  const calls = dataset.calls.filter(
    (c) => c.userId === userId && c.startedAt !== undefined && c.startedAt <= now && sameDayIn(c.startedAt, now, TENANT_TZ),
  );
  const dialed = calls.length + (session.calls ?? 0);
  const reached = calls.filter((c) => c.interpretedOutcome === "meaningful_interaction" && c.outcomeConfirmedBy).length + (session.conversations ?? 0);
  if (dialed > 0) {
    counts.push({
      id: "conversations",
      value: reached,
      word: reached === 1 ? "conversation" : "conversations",
      counts: `two-way and confirmed, from ${plural(dialed, "call")} today`,
      atLeast: false,
    });
  }

  const today = instancesToday(dataset, userId, role, now);
  const booked = today.filter((i) => i.retainedAfterReview && i.outcome !== "superseded_before_cutoff").length + (session.bookings ?? 0);
  if (today.length > 0 || (session.bookings ?? 0) > 0) {
    counts.push({
      id: "bookings",
      value: booked,
      word: booked === 1 ? "booking" : "bookings",
      counts: "retained after review, on today's calendar",
      atLeast: false,
    });
  }

  const finished = today.filter((i) => i.scheduledEnd <= now);
  const attended = finished.filter((i) => i.outcome === "attended").length;
  const unresolved = finished.filter((i) => i.outcome === "unknown" || i.outcome === "scheduled").length;
  if (finished.length > 0) {
    counts.push({
      id: "attended",
      value: attended,
      word: "attended",
      counts:
        unresolved > 0
          ? `appointments attended today, ${plural(unresolved, "meeting")} still without attendance evidence`
          : "appointments attended today, every one evidenced",
      atLeast: unresolved > 0,
    });
  }

  return counts;
}

function hoursBetween(from: ISODateTime, to: ISODateTime): number {
  return (Date.parse(to) - Date.parse(from)) / 3_600_000;
}

/** The most recent call of this person's that has been reviewed inside the window. */
export function latestReviewedCallId(userId: Id, role: RepRole, now: ISODateTime, windowHours = REVIEWED_WINDOW_HOURS): Id | undefined {
  return reviewableCalls({ userId, role }).find((row) => {
    const at = row.call.endedAt ?? row.call.startedAt;
    if (!at || at > now) return false;
    if (row.call.interpretedOutcome === "unknown" || !row.call.outcomeConfirmedBy) return false;
    return hoursBetween(at, now) <= windowHours;
  })?.callId;
}

/**
 * The single next improvement, with the moment in the transcript that shows it.
 *
 * A standing recommendation comes first when there is one: it is the person's
 * largest measured gap and it waits on nothing. When every metric recommendation
 * is held, the reviewed call's own transcript feedback is the improvement, which
 * is the rule in "A held measurement never holds the person": coaching read from
 * a conversation stands while coaching read from revenue waits. Either way the
 * link lands on the cited span, never on a search the reader has to run.
 */
export function nextImprovement(dataset: Dataset, userId: Id, role: RepRole, now: ISODateTime, callId: Id, plan?: CoachingPlan): TodayImprovement | undefined {
  const review = buildReview(callId);
  if (!review) return undefined;
  // Never point a person at a conversation they are not allowed to open, and never call
  // somebody else's call theirs. A teammate's call on the same opportunity is not this
  // person's coaching.
  if (!canReview({ userId, role }, review.call)) return undefined;
  const feedback = review.feedback[0];
  const moment = coachingMoment(review);
  const spanIndex = feedback?.spanIndex ?? moment?.spanIndex;
  const span = spanIndex === undefined ? undefined : review.transcript[spanIndex];
  if (!span) return undefined;

  const standing = (plan ?? coachingPlan(dataset, userId, now)).standing[0];
  const sentence = standing?.action ?? feedback?.hint;
  const label = standing?.title ?? feedback?.angle;
  if (!sentence || !label) return undefined;

  return {
    sentence,
    label,
    source: `Read from your call with ${review.contact.displayName}`,
    href: `/review?call=${callId}&span=${span.startMs}`,
    at: formatClock(span.startMs),
    callId,
    spanStartMs: span.startMs,
  };
}

function heldNote(plan: CoachingPlan): TodayHeldNote | undefined {
  const rec = plan.held[0];
  if (!rec?.held) return undefined;
  return {
    title: rec.title.replace(/^Waiting on data: /, ""),
    waitingOn: rec.held.waitingOn,
    ownerLabel: rec.held.ownerLabel,
    action: rec.action,
    statement: rec.held.statement,
  };
}

/**
 * The area, in one call. The improvement takes it when a call has been reviewed
 * inside the window and coaching that waits on nothing can be named; otherwise
 * today's verified progress stands. Both carry at most one held note.
 */
export function buildTodayFocus(dataset: Dataset, userId: Id, role: RepRole, now: ISODateTime, options: TodayFocusOptions = {}): TodayFocus {
  const plan = options.plan ?? coachingPlan(dataset, userId, now);
  const held = heldNote(plan);
  const callId = options.reviewedCallId ?? latestReviewedCallId(userId, role, now, options.windowHours);
  const improvement = callId ? nextImprovement(dataset, userId, role, now, callId, plan) : undefined;
  if (improvement) return { kind: "improvement", improvement, held };
  return { kind: "progress", counts: todayCounts(dataset, userId, role, now, options.session ?? {}), held };
}
