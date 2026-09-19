/**
 * Pure helpers for the Team and Coach pages. No React, no fixtures baked in:
 * every function takes the dataset and `now` so the pages stay deterministic.
 */
import type { CoachingRecommendation, CommissionPolicy, FunnelStage, ISODateTime, Id, LeaderboardRow, MetricId, Mission, Pair, SkillPath } from "@/domain/types";
import type { Dataset } from "@/domain/metrics";
import {
  activePairs,
  pairContribution,
  pairDiagnostic,
  pairFunnel,
  pairLeaderboard,
  pairOpportunities,
  pairSideOf,
  pairsOf,
  type PairContribution,
  type PairDiagnostic,
  type PairFunnel,
  type PairLeaderboardRow,
  type PairSide,
} from "@/domain/pairs";
import type { SeasonWindow } from "@/domain/cashTiers";
import { attendedOpportunityIds, computeMetric, perceivedQualifiedIds } from "@/domain/metrics";
import { DEFAULT_LEADERBOARD_POLICY, type LeaderboardPolicy, type Standings } from "@/domain/leaderboard";
import { MONEY_NOT_AVAILABLE, formatCount, formatMoneyMinor, formatUnits } from "@/lib/format";
import { COACHING_ENGINE_VERSION, STAGE_ACTION_LIBRARY, perceptionGap, sensitivityTable, type PerceptionGap, type StageAction } from "@/domain/coaching";
import { defaultSkillPaths, missionFromRecommendation, seasonFor } from "@/domain/gamification";
import type { StageChampion } from "@/domain/game";
import { fromDollars } from "@/domain/money";

// ---------- Season and policy ----------

/** Season window as the ranking period; the previous calendar month as the own-baseline prior period. */
export function seasonPolicy(now: ISODateTime, overrides: Partial<LeaderboardPolicy> = {}): LeaderboardPolicy {
  const season = seasonFor(now);
  const start = new Date(season.startsAt);
  const priorStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1)).toISOString().replace(".000Z", "Z");
  return {
    ...DEFAULT_LEADERBOARD_POLICY,
    periodFrom: season.startsAt,
    periodTo: season.endsAt,
    priorPeriodFrom: priorStart,
    priorPeriodTo: season.startsAt,
    ...overrides,
  };
}

/** Descriptive rebuild: pause lifted and the sample minimum relaxed so a rank can be shown at all. */
export function descriptivePolicy(now: ISODateTime): LeaderboardPolicy {
  return seasonPolicy(now, { pauseOnUnresolvedData: false, minMaturedSample: 1, policyVersion: `${DEFAULT_LEADERBOARD_POLICY.policyVersion}-descriptive` });
}

/** "September 2026" without the display-layer suffix. */
export function seasonTitle(now: ISODateTime): string {
  return seasonFor(now).label.split(" season")[0];
}

export function seasonDaysLeft(now: ISODateTime): number {
  const end = Date.parse(seasonFor(now).endsAt);
  return Math.max(0, Math.ceil((end - Date.parse(now)) / 86_400_000));
}

// ---------- Standings: ranked list or roster ----------

/** The first sentence of a domain statement, so a phone line stays one thought. */
function firstSentence(text: string): string {
  const end = text.indexOf(". ");
  return end === -1 ? text : text.slice(0, end + 1);
}

function restAfterFirstSentence(text: string): string {
  const end = text.indexOf(". ");
  return end === -1 ? "" : text.slice(end + 2).trim();
}

/**
 * What the board says above the list. A roster never borrows the words of a
 * ranking: the kind is stated, the order is stated, and the hold names what it
 * waits on and who owns it ("Never show a list that looks ranked when ranking
 * is not established", docs/DECISIONS.md).
 */
export interface StandingsLines {
  kind: Standings["kind"];
  /** "Ranked" or "Roster, not a ranking". Always paired with an icon on screen. */
  kindLabel: string;
  /** The order the list is in, one sentence, above the list. */
  orderLine: string;
  /** Short label for the row that opens the standings sheet. */
  holdLabel: string;
  /** What ranking waits on and who owns it. Null when nothing holds it. */
  holdLine: string | null;
}

export function standingsLines(standings: Standings, descriptive = false): StandingsLines {
  const held = standings.heldBy;
  const kindLabel = standings.kind === "ranked" ? (descriptive ? "Ranked, descriptive only" : "Ranked") : "Roster, not a ranking";
  const orderLine = firstSentence(standings.orderLabel);
  const holdLine = held
    ? `Ranking waits until ${held.waitingOn}. ${held.ownerLabel ?? "The owner"} owns that.`
    : standings.kind === "roster"
      ? restAfterFirstSentence(standings.orderLabel) || null
      : null;
  return {
    kind: standings.kind,
    kindLabel,
    orderLine,
    holdLabel: held ? "Ranking on hold" : "No ranking yet",
    holdLine,
  };
}

/**
 * The money on a board row. A verified zero and a missing figure are different
 * facts and never render alike; an amount that can still move says so in words.
 */
export type MoneyRead =
  | { kind: "amount"; text: string; provisional: boolean }
  | { kind: "verified_zero"; text: string; provisional: false }
  | { kind: "unavailable"; text: string; provisional: false };

export const MONEY_VERIFIED_ZERO = "$0 collected";

export function rowMoneyRead(row: LeaderboardRow): MoneyRead {
  if (row.revenueState === "unavailable") return { kind: "unavailable", text: MONEY_NOT_AVAILABLE, provisional: false };
  if (row.revenueState === "verified_zero") return { kind: "verified_zero", text: MONEY_VERIFIED_ZERO, provisional: false };
  const value = row.revenuePerLead.value;
  const currency = row.revenuePerLead.currency ?? row.totalRevenue.currency;
  return {
    kind: "amount",
    text: value === null ? MONEY_NOT_AVAILABLE : formatMoneyMinor(Math.round(value), currency, { cents: true }),
    provisional: row.revenueProvisional,
  };
}

/** "At least 5 attended, 2 outcomes unresolved" or "5 attended". Never a false exact. */
export function attendedRead(row: LeaderboardRow): string {
  if (row.attendedState === "at_least") {
    return `At least ${formatCount(row.attendedAppointments)} attended, ${formatUnits(row.unresolvedAttendanceCount, "outcome")} unresolved`;
  }
  return `${formatCount(row.attendedAppointments)} attended`;
}

export interface GuardrailCounts {
  optOuts: number;
  /** null when the dataset has no complaint records at all (not tracked, not zero). */
  complaints: number | null;
  refunds: number;
}

export function guardrailCounts(dataset: Dataset): GuardrailCounts {
  const optOuts = dataset.contacts.filter((c) => Object.values(c.consent).includes("revoked")).length;
  const refunds = dataset.ledger.filter((e) => e.kind === "refund" || e.kind === "dispute_debit").length;
  const complaintEvents = dataset.events?.filter((e) => e.eventType.includes("complaint")).length;
  return { optOuts, complaints: dataset.events ? (complaintEvents ?? 0) : null, refunds };
}

// ---------- Board helpers ----------

/** Leaderboard rows only ever carry setter or closer; narrow the wider Role type. */
export function rowRole(row: LeaderboardRow): "setter" | "closer" {
  return row.role === "setter" ? "setter" : "closer";
}

export function initials(displayName: string): string {
  const parts = displayName.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export type Movement = "up" | "down" | "flat" | "none";

/** Direction of the current value against the rep's own prior period. Never a rank animation. */
export function movementOf(row: LeaderboardRow): Movement {
  const cur = row.revenuePerLead.value;
  const prior = row.priorPeriodRevenuePerLead;
  if (cur === null || prior === null || prior === undefined) return "none";
  if (cur > prior) return "up";
  if (cur < prior) return "down";
  return "flat";
}

// ---------- Stage champions ----------

const STAGE_METRIC: { stageId: StageChampion["stageId"]; label: string; metricId: MetricId }[] = [
  { stageId: "contact", label: "Contact", metricId: "M04" },
  { stageId: "booked", label: "Booked", metricId: "M06" },
  { stageId: "show", label: "Show", metricId: "M08" },
  { stageId: "fit", label: "Fit", metricId: "M09" },
  { stageId: "won", label: "Won", metricId: "M12" },
  { stageId: "cash", label: "Cash", metricId: "M16" },
];

export const CHAMPION_MIN_DENOMINATOR = 10;

/**
 * A rep's perception gap (perceived minus verified fit, in points) over their
 * attributed opportunities. Reserved for the board; not rendered there yet.
 */
export function perceptionGapFor(dataset: Dataset, userId: Id, now: ISODateTime, role?: "setter" | "closer"): PerceptionGap {
  return perceptionGap(dataset, role ? { userId, role } : { userId }, now);
}

export interface ChampionRow extends StageChampion {
  metricId: MetricId;
  leadTier?: number;
  /** Money per unit for the cash stage; ratio otherwise. */
  unit: "ratio" | "money_per_unit";
  currency: string;
}

/**
 * Leader per stage within the comparable tier: the role's largest tier group
 * (ties go to the lower tier), highest rate wins, provisional under 10 in the denominator.
 */
export function stageChampions(dataset: Dataset, rows: LeaderboardRow[], policy: LeaderboardPolicy, now: ISODateTime): ChampionRow[] {
  const groups = new Map<number | undefined, LeaderboardRow[]>();
  for (const r of rows) groups.set(r.leadTier, [...(groups.get(r.leadTier) ?? []), r]);
  let cohort: LeaderboardRow[] = [];
  let tier: number | undefined;
  for (const [t, members] of groups) {
    if (members.length > cohort.length || (members.length === cohort.length && (t ?? 99) < (tier ?? 99))) {
      cohort = members;
      tier = t;
    }
  }
  const currency = dataset.tenant.reportingCurrency;
  return STAGE_METRIC.map(({ stageId, label, metricId }) => {
    let best: { row: LeaderboardRow; value: number; numerator: number; denominator: number } | null = null;
    for (const row of cohort) {
      const m = computeMetric(metricId, dataset, { userId: row.userId, role: rowRole(row), from: policy.periodFrom, to: policy.periodTo }, now);
      if (m.value === null) continue;
      if (!best || m.value > best.value || (m.value === best.value && row.displayName.localeCompare(best.row.displayName) < 0)) {
        best = { row, value: m.value, numerator: m.numerator, denominator: m.denominator };
      }
    }
    const unit = metricId === "M16" ? "money_per_unit" : "ratio";
    if (!best) {
      return { stageId, label, metricId, userId: null, displayName: null, numerator: 0, denominator: 0, rate: null, provisional: true, reason: "No computable value in this cohort", leadTier: tier, unit, currency };
    }
    const small = best.denominator < CHAMPION_MIN_DENOMINATOR;
    return {
      stageId,
      label,
      metricId,
      userId: best.row.userId,
      displayName: best.row.displayName,
      numerator: unit === "money_per_unit" ? Math.round(best.numerator) : best.numerator,
      denominator: best.denominator,
      rate: best.value,
      provisional: small,
      reason: small ? `${best.denominator} in the denominator, under ${CHAMPION_MIN_DENOMINATOR}` : undefined,
      leadTier: tier,
      unit,
      currency,
    };
  });
}

// ---------- Missions and skill paths ----------

/** Five-word proof rules per metric. The full evidence rule stays on the mission. */
export const PROOF_SHORT: Partial<Record<MetricId, string>> = {
  M03: "First attempt logged on time",
  M04: "Confirmed conversation, not voicemail",
  M06: "Agenda recorded, booking retained",
  M07: "DQ sample annotated with evidence",
  M08: "Provider-verified attendance, agenda recorded",
  M09: "Fit rating with evidence refs",
  M11: "Decision objective recorded, revisited",
  M12: "Review documented, one behavior",
  M16: "Payment confirmed in the ledger",
};

export function proofShort(metricId: MetricId): string {
  return PROOF_SHORT[metricId] ?? "Linked evidence, manager reviewed";
}

/** Sum of accountable opportunities a rep has held in any role, for the optional private milestone. */
export function opportunitiesProcessed(dataset: Dataset, userId: Id): number {
  const ids = new Set(dataset.assignments.filter((a) => a.userId === userId).map((a) => a.opportunityId));
  return ids.size;
}

const LESSON_ORDER = ["M08", "M11", "M12", "M04", "M06"] as const;

/** A library entry shaped as a recommendation so it can become an optional lesson mission. Labeled as such. */
export function lessonFromLibrary(entry: StageAction, dataset: Dataset, userId: Id, now: ISODateTime): CoachingRecommendation {
  const metric = computeMetric(entry.metricId, dataset, { userId }, now);
  return {
    tenantId: dataset.tenant.tenantId,
    recommendationId: `lesson_${entry.metricId}_${userId}`,
    ownerRole: "rep",
    ownerUserId: userId,
    title: entry.issue,
    issue: `Optional lesson from the stage library: ${entry.issue}`,
    metricIds: [entry.metricId],
    cohortId: metric.cohortId,
    dataState: metric.dataState,
    observed: `${metric.numerator} of ${metric.denominator}`,
    comparator: "Optional lesson; no benchmark applied",
    alternativeExplanations: entry.investigate,
    evidenceRefs: [metric.evidenceQueryId],
    action: entry.action,
    effort: entry.effort,
    guardrails: entry.guardrails,
    reviewAt: now,
    state: "proposed",
    provenance: { engine: "rules", version: COACHING_ENGINE_VERSION },
  };
}

export interface RepMission {
  mission: Mission;
  source: "coaching" | "lesson";
}

/** Three missions: coaching recommendations first, padded with optional library lessons. */
export function missionsForRep(recs: CoachingRecommendation[], dataset: Dataset, userId: Id, now: ISODateTime, count = 3): RepMission[] {
  const out: RepMission[] = [];
  const used = new Set<string>();
  for (const rec of recs) {
    if (!rec.ownerUserId || out.length >= count) continue;
    out.push({ mission: missionFromRecommendation(rec), source: "coaching" });
    used.add(rec.metricIds[0]);
  }
  for (const id of LESSON_ORDER) {
    if (out.length >= count) break;
    if (used.has(id)) continue;
    const entry = STAGE_ACTION_LIBRARY.find((s) => s.metricId === id);
    if (!entry) continue;
    out.push({ mission: missionFromRecommendation(lessonFromLibrary(entry, dataset, userId, now)), source: "lesson" });
    used.add(id);
  }
  return out;
}

const CAPABILITY_TO_PATH: Record<string, string> = {
  intake_discipline: "path_intake_discipline",
  clear_explanation: "path_clear_explanation",
  fit_judgment: "path_fit_judgment",
  verified_handoff: "path_delivery_handoff",
};

/** Skill paths with steps marked done only where an audited capability certifies the whole path. */
export function skillPathsForRep(dataset: Dataset, userId: Id): SkillPath[] {
  const user = dataset.users.find((u) => u.userId === userId);
  const certified = new Set((user?.capabilities ?? []).map((c) => CAPABILITY_TO_PATH[c]).filter(Boolean));
  return defaultSkillPaths().map((p) =>
    certified.has(p.pathId) ? { ...p, steps: p.steps.map((s) => ({ ...s, done: true })) } : p,
  );
}

// ---------- Coach ----------

/** SOS-16 worked base: 140 retained, 50% current, 20% downstream, $5,000 per win, 5% hypothetical. */
export const SENSITIVITY_BASE = {
  eligible: 140,
  currentRate: 0.5,
  downstreamRate: 0.2,
  avgNetCollected: fromDollars(5_000),
  commissionPolicy: { ratePercent: 5, hypothetical: true, basis: "net_collected_cash" as const, policyVersion: "hypothetical" },
};

export function workedSensitivity() {
  return sensitivityTable(SENSITIVITY_BASE, [0.55, 0.6, 0.65]);
}

export const RECOMMENDATION_STATES = ["accepted", "in_practice", "evaluated"] as const;
export type RecommendationUiState = "proposed" | (typeof RECOMMENDATION_STATES)[number];

export const STATE_LABEL: Record<RecommendationUiState, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  in_practice: "In practice",
  evaluated: "Evaluated",
};

/** The next state a single button moves to; null once evaluated. */
export function nextState(state: RecommendationUiState): RecommendationUiState | null {
  const order: RecommendationUiState[] = ["proposed", "accepted", "in_practice", "evaluated"];
  const i = order.indexOf(state);
  return i < 0 || i === order.length - 1 ? null : order[i + 1];
}

export const NEXT_STATE_LABEL: Record<RecommendationUiState, string> = {
  proposed: "Accept",
  accepted: "Start practice",
  in_practice: "Mark evaluated",
  evaluated: "Evaluated",
};

export const OWNER_LABEL: Record<CoachingRecommendation["ownerRole"], string> = {
  rep: "Rep",
  marketing: "Marketing",
  sales_ops: "Sales ops",
  product: "Product",
  finance: "Finance",
  delivery: "Delivery",
};

// ---------- Pairs (Batman and Robin) ----------

export const CHOSEN_BY_LABEL: Record<Pair["chosenBy"], string> = {
  owner: "Owner picked",
  closer: "Closer picked",
  setter: "Setter picked",
};

export const PAIR_SIDE_LABEL: Record<PairSide, string> = {
  setter: "Setter side",
  handoff: "Handoff",
  closer: "Closer side",
};

export const PAIR_OWNER_LABEL: Record<PairDiagnostic["suggestedOwner"], string> = {
  setter: "Setter side",
  closer: "Closer side",
  both: "Both sides",
  sales_ops: "Sales ops",
};

/** One-word stage names for the slim pair bar. */
export const PAIR_STAGE_SHORT: Record<string, string> = {
  two_way_contact: "Contact",
  booked: "Booked",
  retained_booking: "Retained",
  attended: "Show",
  perceived_qualified: "Fit",
  won: "Won",
  net_collected_cash: "Cash",
};

/** Setter-side bar stages (fed by connectors) and closer-side bar stages, in order. */
export const PAIR_BAR_SETTER = ["two_way_contact", "booked", "retained_booking", "attended"] as const;
export const PAIR_BAR_CLOSER = ["perceived_qualified", "won", "net_collected_cash"] as const;

export function firstName(displayName: string): string {
  return displayName.split(/\s+/).filter(Boolean)[0] ?? displayName;
}

/** "Priya and Renata": setter first, closer second. */
export function pairTitle(setterDisplayName: string, closerDisplayName: string): string {
  return `${firstName(setterDisplayName)} and ${firstName(closerDisplayName)}`;
}

// ---------- Pairs: what the two people owe each other ----------

export interface PairWaitingHandoff {
  opportunityId: Id;
  /** The business or person the handoff is about. */
  label: string;
  hoursWaiting: number;
}

export interface PairUpcoming {
  opportunityId: Id;
  label: string;
  startsAt: ISODateTime;
  confirmed: boolean;
  /** "Sep 21, 16:26 UTC". */
  when: string;
}

/** One shared stage result: the label, and one figure with its denominator in words. */
export interface PairSharedResult {
  label: string;
  value: string;
}

export interface PairNextAction {
  userId: Id;
  displayName: string;
  side: "setter" | "closer";
  /** One sentence naming the thing and its count. Never an adjective. */
  action: string;
}

/**
 * What a pair screen answers before any comparison (docs/DECISIONS.md, "A pair
 * screen answers what we owe each other"): what the two are responsible for
 * together, and what each of them does next.
 */
export interface PairResponsibilities {
  /** Handoffs waiting on the closer's acceptance, oldest first. */
  waiting: PairWaitingHandoff[];
  /** Shared opportunities with a meeting still to come, soonest first. */
  upcoming: PairUpcoming[];
  /** The pair's results through the stages both people touch. */
  shared: PairSharedResult[];
  next: { setter: PairNextAction; closer: PairNextAction };
  /** The one specific thing true of this pair right now, or null. Never a bare adjective. */
  headline: string | null;
}

/** "31 hours", "45 minutes", "3 days". Rounded, never a false precision. */
export function hoursWord(hours: number): string {
  if (hours < 1) return formatUnits(Math.max(1, Math.round(hours * 60)), "minute");
  if (hours < 48) return formatUnits(Math.round(hours), "hour");
  return formatUnits(Math.round(hours / 24), "day");
}

/** "Sep 21, 16:26 UTC". UTC so the label never drifts with the reader's zone. */
export function shortWhen(iso: ISODateTime): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown time";
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(d);
  return `${date}, ${time} UTC`;
}

function stageCount(stages: FunnelStage[], stageId: string): FunnelStage | undefined {
  return stages.find((s) => s.stageId === stageId);
}

/**
 * The coordination answer for one pair, built from what the domain already has:
 * handoff acceptance records, the pair's scheduled meetings, and the pair funnel.
 * Nothing is invented: when nothing specific is true, `headline` is null and the
 * row says nothing rather than naming a state.
 */
export function pairResponsibilities(dataset: Dataset, pair: Pair, funnel: PairFunnel, diagnostic: PairDiagnostic, now: ISODateTime): PairResponsibilities {
  const opps = pairOpportunities(dataset, pair.pairId);
  const ids = new Set(opps.map((o) => o.opportunityId));
  const contacts = new Map(dataset.contacts.map((c) => [c.contactId, c]));
  const names = new Map(dataset.users.map((u) => [u.userId, u.displayName]));
  const nowMs = Date.parse(now);
  const labelOf = (opportunityId: Id): string => {
    const opp = opps.find((o) => o.opportunityId === opportunityId);
    const contact = opp ? contacts.get(opp.primaryContactId) : undefined;
    return contact?.organizationName ?? contact?.displayName ?? opportunityId;
  };

  const waiting: PairWaitingHandoff[] = dataset.assignments
    .filter((a) => a.role === "closer" && ids.has(a.opportunityId) && !a.acceptedAt && !a.endedAt)
    .map((a) => ({ opportunityId: a.opportunityId, label: labelOf(a.opportunityId), hoursWaiting: Math.max(0, (nowMs - Date.parse(a.decidedAt)) / 3_600_000) }))
    .sort((a, b) => b.hoursWaiting - a.hoursWaiting);

  const upcoming: PairUpcoming[] = dataset.appointmentInstances
    .filter((i) => ids.has(i.opportunityId) && i.outcome === "scheduled" && Date.parse(i.scheduledStart) >= nowMs)
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))
    .map((i) => ({ opportunityId: i.opportunityId, label: labelOf(i.opportunityId), startsAt: i.scheduledStart, confirmed: i.confirmedByCustomer, when: shortWhen(i.scheduledStart) }));

  const assigned = stageCount(funnel.setterSide, "assigned")?.count ?? 0;
  const contacted = stageCount(funnel.setterSide, "two_way_contact")?.count ?? 0;
  const booked = stageCount(funnel.setterSide, "booked")?.count ?? 0;
  const retained = stageCount(funnel.setterSide, "retained_booking")?.count ?? 0;
  const attendedStage = stageCount(funnel.setterSide, "attended");
  const attended = attendedStage?.count ?? 0;
  const unresolved = attendedStage?.unknownCount ?? 0;
  const qualified = stageCount(funnel.closerSide, "perceived_qualified")?.count ?? 0;

  const shared: PairSharedResult[] = [
    { label: "Handoff", value: `Accepted ${funnel.handoff.accepted} of ${funnel.handoff.total}` },
    {
      label: "Attended",
      value: unresolved > 0
        ? `At least ${attended} of ${formatUnits(retained, "retained booking")}, ${formatUnits(unresolved, "outcome")} unresolved`
        : `${attended} of ${formatUnits(retained, "retained booking")}`,
    },
    { label: "Rated qualified", value: `${qualified} of ${formatUnits(attended, "attended show")}` },
  ];

  const attendedIds = attendedOpportunityIds(dataset, ids);
  const unrated = perceivedQualifiedIds(dataset, attendedIds).unrated.size;
  const oldest = waiting[0];
  const closerAction = oldest
    ? `Accept the handoff on ${formatUnits(waiting.length, "opportunity", "opportunities")}, oldest waiting ${hoursWord(oldest.hoursWaiting)}.`
    : upcoming.length > 0
      ? `Run the shared appointment with ${upcoming[0].label}, ${upcoming[0].when}.`
      : unrated > 0
        ? `Rate fit on ${formatUnits(unrated, "attended show")} with no assessment yet.`
        : "Nothing is waiting on the closer side right now.";

  const unconfirmed = upcoming.find((u) => !u.confirmed);
  const notRetained = Math.max(0, booked - retained);
  const notContacted = Math.max(0, assigned - contacted);
  const setterAction = unconfirmed
    ? `Confirm ${unconfirmed.label} before ${unconfirmed.when}.`
    : notRetained > 0
      ? `Record the agenda and confirmation on ${formatUnits(notRetained, "booking")} that ${notRetained === 1 ? "has" : "have"} not retained.`
      : notContacted > 0
        ? `Reach ${formatUnits(notContacted, "assigned opportunity", "assigned opportunities")} with no two-way conversation yet.`
        : "Nothing is waiting on the setter side right now.";

  // A waiting handoff is called out once it has waited longer than this pair's own
  // acceptance record. No invented service level: the comparator is their own time.
  const ownAverage = funnel.handoff.avgHoursToAccept;
  const callOut = oldest !== undefined && (ownAverage === null ? oldest.hoursWaiting >= 1 : oldest.hoursWaiting > ownAverage);
  const points = Math.round(Math.abs(diagnostic.gap) * 100);
  const headline = callOut
    ? `Handoff waiting ${hoursWord(oldest.hoursWaiting)} on ${oldest.label}`
    : diagnostic.weakestSide !== "none" && points > 0
      ? `${PAIR_SIDE_LABEL[diagnostic.weakestSide]}, ${PAIR_STAGE_SHORT[diagnostic.stageId] ?? diagnostic.stageId}: ${points} points under the pooled pair rate`
      : null;

  return {
    waiting,
    upcoming,
    shared,
    next: {
      setter: { userId: pair.setterUserId, displayName: names.get(pair.setterUserId) ?? pair.setterUserId, side: "setter", action: setterAction },
      closer: { userId: pair.closerUserId, displayName: names.get(pair.closerUserId) ?? pair.closerUserId, side: "closer", action: closerAction },
    },
    headline,
  };
}

export interface PairView {
  pair: Pair;
  setterDisplayName: string;
  closerDisplayName: string;
  /** Absent when the pair carried no opportunity in the season (the board skips it). */
  row?: PairLeaderboardRow;
  funnel: PairFunnel;
  diagnostic: PairDiagnostic;
  contribution: PairContribution;
  /** What the two owe each other, and what each does next. Answered before any comparison. */
  responsibilities: PairResponsibilities;
}

export interface PairViewOptions {
  minMaturedSample: number;
  policies: CommissionPolicy[];
}

export function buildPairView(dataset: Dataset, pairs: Pair[], pair: Pair, season: SeasonWindow, now: ISODateTime, options: PairViewOptions, rows?: PairLeaderboardRow[]): PairView {
  const names = new Map(dataset.users.map((u) => [u.userId, u.displayName]));
  const board = rows ?? pairLeaderboard(dataset, pairs, season, { minMaturedSample: options.minMaturedSample }, now);
  const funnel = pairFunnel(dataset, pairs, pair.pairId, {}, now);
  const diagnostic = pairDiagnostic(dataset, pairs, pair.pairId, now);
  return {
    pair,
    setterDisplayName: names.get(pair.setterUserId) ?? pair.setterUserId,
    closerDisplayName: names.get(pair.closerUserId) ?? pair.closerUserId,
    row: board.find((r) => r.pairId === pair.pairId),
    funnel,
    diagnostic,
    contribution: pairContribution(dataset, pairs, pair.pairId, season, options.policies),
    responsibilities: pairResponsibilities(dataset, pair, funnel, diagnostic, now),
  };
}

/**
 * The pair board: active pairs in pairLeaderboard order (ranked first, then
 * provisional by value), followed by active pairs with nothing in the season.
 * Pairs only; never merged with an individual board.
 */
export function buildPairViews(dataset: Dataset, pairs: Pair[], season: SeasonWindow, now: ISODateTime, options: PairViewOptions): PairView[] {
  const active = activePairs(pairs, now);
  const rows = pairLeaderboard(dataset, active, season, { minMaturedSample: options.minMaturedSample }, now);
  const byId = new Map(active.map((p) => [p.pairId, p]));
  const ordered: Pair[] = [];
  for (const r of rows) {
    const p = byId.get(r.pairId);
    if (p) ordered.push(p);
  }
  for (const p of active) if (!rows.some((r) => r.pairId === p.pairId)) ordered.push(p);
  return ordered.map((p) => buildPairView(dataset, pairs, p, season, now, options, rows));
}

/** The rep's active pair. With several, the one carrying the most opportunities. */
export function pairForRep(dataset: Dataset, pairs: Pair[], userId: Id, now: ISODateTime): Pair | undefined {
  const mine = activePairs(pairsOf(pairs, userId), now);
  if (mine.length === 0) return undefined;
  return [...mine].sort((a, b) => pairOpportunities(dataset, b.pairId).length - pairOpportunities(dataset, a.pairId).length || a.pairId.localeCompare(b.pairId))[0];
}

/** A connector rate from the pair funnel: 0..1, or null when the rate is refused or undefined. */
export function pairStageRate(funnel: PairFunnel, toStageId: string): number | null {
  const c = funnel.connectors.find((x) => x.toStageId === toStageId);
  if (!c?.metric || c.metric.refusalReason || c.metric.value === null || c.metric.value === undefined) return null;
  return Math.max(0, Math.min(1, c.metric.value));
}

export interface PairStageGap {
  pair: Pair;
  side: PairSide;
  /** Pair rate minus pooled rate, ratio points (negative is behind). */
  gap: number;
}

/**
 * For one stage, the pair furthest behind the pooled pair rate (sum over sum),
 * ignoring pair denominators under `minDenominator`. Undefined when no pair is
 * behind or the stage has no pair connector. Names a side, never a person.
 */
export function pairGapForStage(dataset: Dataset, pairs: Pair[], stageId: string, now: ISODateTime, minDenominator = 5, tolerance = 0.02): PairStageGap | undefined {
  const active = activePairs(pairs, now);
  if (active.length === 0) return undefined;
  const parts: { pair: Pair; side: PairSide; numerator: number; denominator: number }[] = [];
  let pooledN = 0;
  let pooledD = 0;
  for (const pair of active) {
    const funnel = pairFunnel(dataset, pairs, pair.pairId, {}, now);
    const c = funnel.connectors.find((x) => x.toStageId === stageId);
    if (!c?.metric || c.metric.refusalReason) continue;
    parts.push({ pair, side: pairSideOf(c), numerator: c.metric.numerator, denominator: c.metric.denominator });
    pooledN += c.metric.numerator;
    pooledD += c.metric.denominator;
  }
  if (pooledD === 0) return undefined;
  const pooled = pooledN / pooledD;
  let worst: PairStageGap | undefined;
  for (const p of parts) {
    if (p.denominator < minDenominator) continue;
    const gap = p.numerator / p.denominator - pooled;
    if (gap >= -tolerance) continue;
    if (!worst || gap < worst.gap) worst = { pair: p.pair, side: p.side, gap };
  }
  return worst;
}
