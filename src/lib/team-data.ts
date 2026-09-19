/**
 * Pure helpers for the Team and Coach pages. No React, no fixtures baked in:
 * every function takes the dataset and `now` so the pages stay deterministic.
 */
import type { CoachingRecommendation, ISODateTime, Id, Mission, SkillPath } from "@/domain/types";
import type { Dataset } from "@/domain/metrics";
import { computeMetric } from "@/domain/metrics";
import { DEFAULT_LEADERBOARD_POLICY, type LeaderboardPolicy } from "@/domain/leaderboard";
import { COACHING_ENGINE_VERSION, STAGE_ACTION_LIBRARY, sensitivityTable, type StageAction } from "@/domain/coaching";
import { defaultSkillPaths, missionFromRecommendation, seasonFor } from "@/domain/gamification";
import { fromDollars } from "@/domain/money";

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

export const OWNER_LABEL: Record<CoachingRecommendation["ownerRole"], string> = {
  rep: "Rep",
  marketing: "Marketing",
  sales_ops: "Sales ops",
  product: "Product",
  finance: "Finance",
  delivery: "Delivery",
};
