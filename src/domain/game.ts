/**
 * Game layer: XP, levels, streaks from VERIFIED stage events only.
 * Source: docs/spec/15_GAMIFICATION_AND_TEAM_PROGRESSION.md (SOS-15), docs/spec/14 (SOS-14).
 *
 * Rules:
 * - XP comes from evidence-backed events (provider or ledger facts), never from clicks, dials, or notes.
 * - Practice XP and commercial XP are tracked separately and never converted to pay.
 * - Seasons reset the display, not history.
 * - Streaks tolerate approved leave.
 * - A quality incident (opt-out, complaint, refund, misrepresentation) pauses the mechanic for that rep.
 */
import type { Dataset } from "./metrics";
import type { Id, ISODateTime } from "./types";

export type GameEventKind =
  | "two_way_contact"
  | "retained_booking"
  | "attended_show"
  | "verified_fit"
  | "contract_signed"
  | "cash_collected"
  | "handoff_accepted"
  | "practice_completed";

export interface GameEvent {
  kind: GameEventKind;
  userId: Id;
  opportunityId?: Id;
  occurredAt: ISODateTime;
  evidenceRef: string;
}

export const XP_TABLE: Record<GameEventKind, { xp: number; track: "commercial" | "mastery" | "team"; label: string }> = {
  two_way_contact: { xp: 10, track: "commercial", label: "Real conversation" },
  retained_booking: { xp: 20, track: "commercial", label: "Booking held" },
  attended_show: { xp: 40, track: "commercial", label: "Show" },
  verified_fit: { xp: 30, track: "commercial", label: "Fit verified" },
  contract_signed: { xp: 60, track: "commercial", label: "Signed" },
  cash_collected: { xp: 100, track: "commercial", label: "Cash in" },
  handoff_accepted: { xp: 25, track: "team", label: "Clean handoff" },
  practice_completed: { xp: 15, track: "mastery", label: "Practice rep" },
};

/** Level thresholds: cumulative XP needed to reach level n (index = level - 1). */
export const LEVELS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000];

export interface LevelState {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number | null; // null at max level
  progress: number; // 0..1 within the level
}

export function levelFor(xp: number): LevelState {
  let level = 1;
  for (let i = 1; i < LEVELS.length; i++) if (xp >= LEVELS[i]) level = i + 1;
  const base = LEVELS[level - 1];
  const next = level < LEVELS.length ? LEVELS[level] : null;
  const xpIntoLevel = xp - base;
  const span = next === null ? 0 : next - base;
  return { level, xp, xpIntoLevel, xpForNextLevel: next, progress: next === null ? 1 : xpIntoLevel / span };
}

/** Derive verified game events from the canonical dataset. No clicks, no self-reports. */
export function deriveGameEvents(dataset: Dataset): GameEvent[] {
  const events: GameEvent[] = [];
  const oppOwner = new Map(dataset.opportunities.map((o) => [o.opportunityId, o.currentOwner]));

  for (const c of dataset.calls) {
    if (c.interpretedOutcome === "meaningful_interaction" && c.outcomeConfirmedBy && c.endedAt) {
      events.push({ kind: "two_way_contact", userId: c.userId, opportunityId: c.opportunityId, occurredAt: c.endedAt, evidenceRef: c.callId });
    }
  }
  for (const inst of dataset.appointmentInstances) {
    const owner = oppOwner.get(inst.opportunityId);
    const appt = dataset.appointments.find((a) => a.appointmentId === inst.appointmentId);
    if (inst.retainedAfterReview && owner?.setter) {
      events.push({ kind: "retained_booking", userId: owner.setter, opportunityId: inst.opportunityId, occurredAt: inst.scheduledStart, evidenceRef: inst.instanceId });
    }
    if (inst.outcome === "attended" && appt) {
      events.push({ kind: "attended_show", userId: appt.repUserId, opportunityId: inst.opportunityId, occurredAt: inst.scheduledEnd, evidenceRef: inst.instanceId });
    }
  }
  for (const a of dataset.assessments) {
    const allYes = Object.values(a.objective).length > 0 && Object.values(a.objective).every((v) => v.value === "yes");
    if (allYes && a.reviewState === "confirmed") {
      events.push({ kind: "verified_fit", userId: a.assessedByUserId, opportunityId: a.opportunityId, occurredAt: a.assessedAt, evidenceRef: a.assessmentId });
    }
  }
  for (const c of dataset.contracts) {
    const owner = oppOwner.get(c.opportunityId);
    if (c.state === "signed" && c.signedAt && owner?.closer) {
      events.push({ kind: "contract_signed", userId: owner.closer, opportunityId: c.opportunityId, occurredAt: c.signedAt, evidenceRef: c.contractId });
    }
  }
  for (const e of dataset.ledger) {
    const owner = e.opportunityId ? oppOwner.get(e.opportunityId) : undefined;
    if (e.kind === "payment_collected" && !e.passThrough && owner?.closer) {
      events.push({ kind: "cash_collected", userId: owner.closer, opportunityId: e.opportunityId, occurredAt: e.occurredAt, evidenceRef: e.entryId });
    }
  }
  return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export interface QualityGate {
  paused: boolean;
  reasons: string[];
}

/** Opt-outs, refunds, or disputes on a rep's opportunities pause the mechanic (SOS-15). */
export function qualityGate(dataset: Dataset, userId: Id): QualityGate {
  const reasons: string[] = [];
  const mine = new Set(
    dataset.opportunities.filter((o) => o.currentOwner.setter === userId || o.currentOwner.closer === userId).map((o) => o.opportunityId),
  );
  const refunds = dataset.ledger.filter((e) => e.opportunityId && mine.has(e.opportunityId) && (e.kind === "refund" || e.kind === "dispute_debit"));
  if (refunds.length > 0) reasons.push(`${refunds.length} refund or dispute under review`);
  const optOuts = dataset.opportunities.filter((o) => mine.has(o.opportunityId)).filter((o) => {
    const c = dataset.contacts.find((ct) => ct.contactId === o.primaryContactId);
    return c && Object.values(c.consent).some((s) => s === "revoked");
  });
  if (optOuts.length > 0) reasons.push(`${optOuts.length} opt-out under review`);
  return { paused: reasons.length > 0, reasons };
}

export interface PlayerState {
  userId: Id;
  season: { from: ISODateTime; to: ISODateTime };
  commercial: LevelState;
  mastery: LevelState;
  team: LevelState;
  streakDays: number;
  lastEventAt?: ISODateTime;
  recent: GameEvent[]; // last 5, newest first
  gate: QualityGate;
}

function dayKey(iso: ISODateTime): string {
  return iso.slice(0, 10);
}

function addDays(iso: ISODateTime, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * Streak = consecutive calendar days (UTC) ending today or yesterday with at least one verified event.
 * `approvedLeaveDays` are skipped, not broken.
 */
export function streakDays(events: GameEvent[], now: ISODateTime, approvedLeaveDays: string[] = []): number {
  const days = new Set(events.map((e) => dayKey(e.occurredAt)));
  const leave = new Set(approvedLeaveDays);
  let cursor = dayKey(now);
  if (!days.has(cursor)) cursor = dayKey(addDays(now, -1));
  let streak = 0;
  while (days.has(cursor) || leave.has(cursor)) {
    if (days.has(cursor)) streak++;
    cursor = dayKey(addDays(cursor + "T00:00:00Z", -1));
  }
  return streak;
}

export function playerState(
  dataset: Dataset,
  userId: Id,
  now: ISODateTime,
  season: { from: ISODateTime; to: ISODateTime },
  approvedLeaveDays: string[] = [],
): PlayerState {
  const all = deriveGameEvents(dataset).filter((e) => e.userId === userId);
  const inSeason = all.filter((e) => e.occurredAt >= season.from && e.occurredAt < season.to && e.occurredAt <= now);
  const sum = (track: "commercial" | "mastery" | "team") =>
    inSeason.filter((e) => XP_TABLE[e.kind].track === track).reduce((acc, e) => acc + XP_TABLE[e.kind].xp, 0);
  return {
    userId,
    season,
    commercial: levelFor(sum("commercial")),
    mastery: levelFor(sum("mastery")),
    team: levelFor(sum("team")),
    streakDays: streakDays(all.filter((e) => e.occurredAt <= now), now, approvedLeaveDays),
    lastEventAt: inSeason.at(-1)?.occurredAt,
    recent: [...inSeason].reverse().slice(0, 5),
    gate: qualityGate(dataset, userId),
  };
}

export interface StageChampion {
  stageId: "contact" | "booked" | "show" | "fit" | "won" | "cash";
  label: string;
  userId: Id | null;
  displayName: string | null;
  numerator: number;
  denominator: number;
  rate: number | null;
  provisional: boolean;
  reason?: string;
}
