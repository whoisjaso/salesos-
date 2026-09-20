/**
 * Game layer: XP, levels, streaks from VERIFIED stage events only.
 * Source: docs/spec/15_GAMIFICATION_AND_TEAM_PROGRESSION.md (SOS-15), docs/spec/14 (SOS-14).
 *
 * Rules:
 * - XP comes from evidence-backed events (provider or ledger facts), never from clicks, dials, or notes.
 * - Practice XP and commercial XP are tracked separately and never converted to pay.
 * - Seasons reset the display, not history.
 * - Streaks tolerate approved leave.
 * - A data incident holds only the XP that rests on the surface it makes unreliable.
 *   It never pauses the mechanic, the level, or the streak. See docs/DECISIONS.md,
 *   "A held measurement never holds the person" (2026-09-19).
 * - Cash XP follows the SEALED attribution snapshot and the cash predicate, not
 *   today's contact owner and not the bare ledger kind. A test-mode movement, an
 *   invoice marked paid outside the processor and a spreadsheet import are real
 *   records that award no XP, and reassigning a contact awards nobody anything.
 *   Non-cash XP is activity credit for work that happened, and stays where the
 *   work is recorded.
 */
import { type IncidentScope, type SurfaceStatus, holdFor, scopeIncidents } from "./incidents";
import { type DatasetWithAttribution, creditedUserForEntry } from "./attribution";
import { countsAsNetCollectedCash } from "./events";
import type { AffectedSurface, Id, ISODateTime, ScopedIncident } from "./types";

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

export type GameTrack = "commercial" | "mastery" | "team";

export const GAME_TRACKS: GameTrack[] = ["commercial", "mastery", "team"];

export const XP_TABLE: Record<GameEventKind, { xp: number; track: GameTrack; label: string }> = {
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
export function deriveGameEvents(dataset: DatasetWithAttribution): GameEvent[] {
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
    if (e.kind !== "payment_collected" || !countsAsNetCollectedCash(e) || !e.opportunityId) continue;
    // Credited closer, from the seal where one exists. Never the current owner
    // of the contact, so a reassignment moves no XP either.
    const closer = creditedUserForEntry(dataset, e, "closer");
    if (!closer) continue;
    events.push({ kind: "cash_collected", userId: closer, opportunityId: e.opportunityId, occurredAt: e.occurredAt, evidenceRef: e.entryId });
  }
  return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

/**
 * Which surface each XP kind rests on. A kind that is absent rests on none of
 * them: no data incident can ever hold it. Signing, fit, handoffs, practice, and
 * real conversations are verified where they happen, so they always accrue.
 */
export const XP_SURFACE: Partial<Record<GameEventKind, AffectedSurface>> = {
  cash_collected: "revenue_attribution",
  attended_show: "attendance_outcome",
};

export interface TrackHold {
  track: GameTrack;
  /** Kinds on this track whose XP is untouched by any open incident. */
  accruing: GameEventKind[];
  /** Kinds whose award waits on a held surface. XP already earned is never removed. */
  held: GameEventKind[];
  surfaces: AffectedSurface[];
  /** One sentence: what waits, who owns it, and what keeps running. */
  statement: string;
}

export interface QualityGate {
  /**
   * Kept for compatibility with screens that read it. True only when every track
   * is held at once, which a scoped data incident never does: the mechanic as a
   * whole is not pausable by a measurement problem.
   */
  paused: boolean;
  /** One plain sentence per hold, each naming its limited effect. */
  reasons: string[];
  /** Tracks whose totals can move when an incident resolves. Their XP still accrues. */
  provisionalTracks: GameTrack[];
  holds: TrackHold[];
  affectedSurfaces: AffectedSurface[];
  incidents: ScopedIncident[];
}

function trackKinds(track: GameTrack): GameEventKind[] {
  return (Object.keys(XP_TABLE) as GameEventKind[]).filter((k) => XP_TABLE[k].track === track);
}

/**
 * Per-track holds from an incident scope. Only the kinds that rest on a held
 * surface wait; everything else on the same track keeps accruing, so a level is
 * never frozen by an unrelated incident.
 */
export function trackHolds(scope: IncidentScope): TrackHold[] {
  const holds: TrackHold[] = [];
  for (const track of GAME_TRACKS) {
    const kinds = trackKinds(track);
    const held: GameEventKind[] = [];
    const surfaces = new Set<AffectedSurface>();
    const statuses: SurfaceStatus[] = [];
    for (const kind of kinds) {
      const surface = XP_SURFACE[kind];
      if (!surface) continue;
      const status = holdFor(scope, [surface]);
      if (!status) continue;
      held.push(kind);
      surfaces.add(surface);
      statuses.push(status);
    }
    if (held.length === 0) continue;
    const accruing = kinds.filter((k) => !held.includes(k));
    const waiting = held.map((k) => XP_TABLE[k].label).join(" and ");
    const keeps = accruing.map((k) => XP_TABLE[k].label).join(", ");
    holds.push({
      track,
      accruing,
      held,
      surfaces: [...surfaces],
      statement: `${waiting} XP waits on ${statuses[0].waitingOn} (${statuses[0].ownerLabel}); ${keeps ? `${keeps} XP` : "every other track"} keeps accruing, and the level and streak are untouched.`,
    });
  }
  return holds;
}

/**
 * The scoped gate. A data incident holds the XP kinds that rest on the surface it
 * makes unreliable and nothing else: levels, streaks, and every unrelated verified
 * event keep running. `paused` stays false unless every track is held at once.
 */
export function qualityGate(dataset: DatasetWithAttribution, userId: Id, now?: ISODateTime): QualityGate {
  const scope = scopeIncidents(dataset, { userId, now });
  return gateFromScope(scope);
}

export function gateFromScope(scope: IncidentScope): QualityGate {
  const holds = trackHolds(scope);
  const surfaces = scope.affected.map((s) => s.surface);
  const reasons = [...holds.map((h) => h.statement), ...scope.affected.filter((s) => !surfaceOnATrack(s.surface)).map((s) => s.statement)];
  return {
    paused: holds.length === GAME_TRACKS.length && holds.every((h) => h.accruing.length === 0),
    reasons,
    provisionalTracks: holds.map((h) => h.track),
    holds,
    affectedSurfaces: surfaces,
    incidents: scope.incidents,
  };
}

function surfaceOnATrack(surface: AffectedSurface): boolean {
  return Object.values(XP_SURFACE).includes(surface);
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
  /** The incidents that touch this rep's work, each with its limited effect. */
  scope: IncidentScope;
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
  dataset: DatasetWithAttribution,
  userId: Id,
  now: ISODateTime,
  season: { from: ISODateTime; to: ISODateTime },
  approvedLeaveDays: string[] = [],
  scope?: IncidentScope,
): PlayerState {
  const all = deriveGameEvents(dataset).filter((e) => e.userId === userId);
  const inSeason = all.filter((e) => e.occurredAt >= season.from && e.occurredAt < season.to && e.occurredAt <= now);
  const sum = (track: GameTrack) =>
    inSeason.filter((e) => XP_TABLE[e.kind].track === track).reduce((acc, e) => acc + XP_TABLE[e.kind].xp, 0);
  const resolved = scope ?? scopeIncidents(dataset, { userId, now });
  return {
    userId,
    season,
    // Verified events accrue whatever is held elsewhere: a held measurement never holds the person.
    commercial: levelFor(sum("commercial")),
    mastery: levelFor(sum("mastery")),
    team: levelFor(sum("team")),
    streakDays: streakDays(all.filter((e) => e.occurredAt <= now), now, approvedLeaveDays),
    lastEventAt: inSeason.at(-1)?.occurredAt,
    recent: [...inSeason].reverse().slice(0, 5),
    gate: gateFromScope(resolved),
    scope: resolved,
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
