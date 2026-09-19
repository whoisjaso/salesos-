/**
 * Pure helpers for the Team and Coach pages. No React, no fixtures baked in:
 * every function takes the dataset and `now` so the pages stay deterministic.
 */
import type { CoachingRecommendation, CommissionPolicy, ISODateTime, Id, LeaderboardRow, MetricId, Mission, Pair, SkillPath } from "@/domain/types";
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
import { computeMetric } from "@/domain/metrics";
import { DEFAULT_LEADERBOARD_POLICY, type LeaderboardPolicy } from "@/domain/leaderboard";
import { COACHING_ENGINE_VERSION, STAGE_ACTION_LIBRARY, sensitivityTable, type StageAction } from "@/domain/coaching";
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

export interface PauseConditions {
  unlinkedPayments: number;
  unresolvedAttendance: number;
}

/** Tenant-wide pause conditions (SOS-14): unlinked payments and unresolved attendance outcomes. */
export function pauseConditions(dataset: Dataset, now: ISODateTime): PauseConditions {
  return {
    unlinkedPayments: dataset.ledger.filter((e) => e.opportunityId === undefined).length,
    unresolvedAttendance: computeMetric("M08", dataset, {}, now).unknownCount,
  };
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

export interface PairView {
  pair: Pair;
  setterDisplayName: string;
  closerDisplayName: string;
  /** Absent when the pair carried no opportunity in the season (the board skips it). */
  row?: PairLeaderboardRow;
  funnel: PairFunnel;
  diagnostic: PairDiagnostic;
  contribution: PairContribution;
}

export interface PairViewOptions {
  minMaturedSample: number;
  policies: CommissionPolicy[];
}

export function buildPairView(dataset: Dataset, pairs: Pair[], pair: Pair, season: SeasonWindow, now: ISODateTime, options: PairViewOptions, rows?: PairLeaderboardRow[]): PairView {
  const names = new Map(dataset.users.map((u) => [u.userId, u.displayName]));
  const board = rows ?? pairLeaderboard(dataset, pairs, season, { minMaturedSample: options.minMaturedSample }, now);
  return {
    pair,
    setterDisplayName: names.get(pair.setterUserId) ?? pair.setterUserId,
    closerDisplayName: names.get(pair.closerUserId) ?? pair.closerUserId,
    row: board.find((r) => r.pairId === pair.pairId),
    funnel: pairFunnel(dataset, pairs, pair.pairId, {}, now),
    diagnostic: pairDiagnostic(dataset, pairs, pair.pairId, now),
    contribution: pairContribution(dataset, pairs, pair.pairId, season, options.policies),
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
