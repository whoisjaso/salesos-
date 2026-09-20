/**
 * Setter-closer pairs (SOS-06, SOS-07, SOS-10, SOS-14).
 *
 * Batman and Robin: an appointment setter and a closer work as a pair. A pair
 * is chosen by the closer, the setter, or the owner. Because the two people
 * share the opportunities that pass through the handoff, their metrics
 * converge: the pair funnel has a setter side, a handoff, and a closer side,
 * and a diagnostic can name the side and stage where the pair loses the most
 * against the pooled rate of every pair on the tenant.
 *
 * Rules:
 * - Pure. `now` is injected. No Date.now().
 * - Diagnostics name a side and a stage, never a person.
 * - Comparators are pooled sum over sum across pairs, never a mean of rates.
 * - Money is integer minor units with an ISO currency.
 * - Commission is split by role policy (setter and closer brackets differ).
 * - Pair rankings never mix with individual boards: rows are pairs only.
 */
import type {
  CommissionPolicy,
  DataState,
  FunnelConnector,
  FunnelStage,
  ISODateTime,
  Id,
  MetricId,
  MetricPayload,
  Opportunity,
  Pair,
} from "./types";
import {
  type CohortFilter,
  type Dataset,
  buildPayload,
  computeFunnel,
  contractedValue,
  ledgerFor,
  netCollected,
  opportunityMatured,
  selectOpportunities,
  bookedOpportunityIds,
  wonOpportunities,
} from "./metrics";
import { evaluate, defaultBenchmarkFor } from "./performance";
import { type SeasonWindow, commissionPolicyFor } from "./cashTiers";
import { scale } from "./money";

/** A dataset that also carries pairs and (optionally) role-scoped commission policies. */
export type DatasetWithPairs = Dataset & { pairs: Pair[]; commissionPolicies?: CommissionPolicy[] };

export type PairSide = "setter" | "handoff" | "closer";

// ---------- Lookup ----------

function pairActiveAt(pair: Pair, at: ISODateTime): boolean {
  if (pair.startedAt > at) return false;
  if (pair.endedAt && pair.endedAt <= at) return false;
  return true;
}

/**
 * The pair for a setter and closer. With `at`, the pair must cover that
 * moment (started at or before, not ended by then). Without `at`, an active
 * pair wins; otherwise the most recently started one.
 */
export function pairFor(pairs: Pair[], setterUserId: Id, closerUserId: Id, at?: ISODateTime): Pair | undefined {
  const matching = pairs.filter((p) => p.setterUserId === setterUserId && p.closerUserId === closerUserId);
  if (matching.length === 0) return undefined;
  if (at) {
    return [...matching].filter((p) => pairActiveAt(p, at)).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  }
  const active = matching.filter((p) => p.active && !p.endedAt);
  const pool = active.length > 0 ? active : matching;
  return [...pool].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

/** Pairs flagged active whose window covers `now`, stable order by pairId. */
export function activePairs(pairs: Pair[], now: ISODateTime): Pair[] {
  return pairs.filter((p) => p.active && pairActiveAt(p, now)).sort((a, b) => a.pairId.localeCompare(b.pairId));
}

/** Every pair a user belongs to, in either role. */
export function pairsOf(pairs: Pair[], userId: Id): Pair[] {
  return pairs.filter((p) => p.setterUserId === userId || p.closerUserId === userId).sort((a, b) => a.pairId.localeCompare(b.pairId));
}

function requirePair(pairs: Pair[], pairId: Id): Pair {
  const pair = pairs.find((p) => p.pairId === pairId);
  if (!pair) throw new Error(`Unknown pair "${pairId}"`);
  return pair;
}

/** Opportunities carried by the pair: those stamped with the pairId at handoff acceptance. */
export function pairOpportunities(dataset: Dataset, pairId: Id): Opportunity[] {
  return dataset.opportunities.filter((o) => o.pairId === pairId);
}

/** The dataset restricted to one pair's opportunities. Everything else is kept (users, ledger...) so metric code works unchanged. */
function datasetForPair(dataset: Dataset, pairId: Id): Dataset {
  return { ...dataset, opportunities: pairOpportunities(dataset, pairId) };
}

// ---------- Pair funnel ----------

export const PAIR_SETTER_STAGES = ["assigned", "two_way_contact", "booked", "retained_booking", "attended"] as const;
export const PAIR_CLOSER_STAGES = ["perceived_qualified", "won", "net_collected_cash"] as const;

export interface PairHandoff {
  /** Closer assignments on the pair's opportunities that the closer explicitly accepted. */
  accepted: number;
  /** Closer assignments on the pair's opportunities. */
  total: number;
  /** Mean hours from the assignment decision to acceptance, null when nothing was accepted. */
  avgHoursToAccept: number | null;
}

export interface PairFunnel {
  pair: Pair;
  cohortId: string;
  asOf: ISODateTime;
  /** assigned, two_way_contact, booked, retained_booking, attended */
  setterSide: FunnelStage[];
  handoff: PairHandoff;
  /** perceived_qualified, won, net_collected_cash */
  closerSide: FunnelStage[];
  /** One connector per adjacent stage across both sides, setter side first. */
  connectors: FunnelConnector[];
}

const SIDE_OF_TO_STAGE: Record<string, PairSide> = {
  two_way_contact: "setter",
  booked: "setter",
  retained_booking: "setter",
  attended: "handoff",
  perceived_qualified: "closer",
  won: "closer",
  net_collected_cash: "closer",
};

/** Which side of the pair a connector belongs to, by the stage it feeds. */
export function pairSideOf(connector: Pick<FunnelConnector, "toStageId">): PairSide {
  return SIDE_OF_TO_STAGE[connector.toStageId] ?? "closer";
}

export function pairHandoff(dataset: Dataset, pairId: Id): PairHandoff {
  const ids = new Set(pairOpportunities(dataset, pairId).map((o) => o.opportunityId));
  let total = 0;
  let accepted = 0;
  let hours = 0;
  for (const a of dataset.assignments) {
    if (a.role !== "closer" || !ids.has(a.opportunityId)) continue;
    total += 1;
    if (a.acceptedAt) {
      accepted += 1;
      hours += Math.max(0, (Date.parse(a.acceptedAt) - Date.parse(a.decidedAt)) / 3_600_000);
    }
  }
  return { accepted, total, avgHoursToAccept: accepted === 0 ? null : hours / accepted };
}

/**
 * The pair's funnel, built on computeFunnel over the pair's opportunities.
 * Setter side: assigned, two-way contact, booked, retained, show.
 * Handoff: closer acceptance counts and time.
 * Closer side: perceived qualified, won, net collected cash.
 * `filter` may carry a window on accountability start; a userId in it is
 * ignored because the pair already defines who is accountable.
 */
export function pairFunnel(dataset: Dataset, pairs: Pair[], pairId: Id, filter: CohortFilter, now: ISODateTime): PairFunnel {
  const pair = requirePair(pairs, pairId);
  const scoped = datasetForPair(dataset, pairId);
  const cohortFilter: CohortFilter = { ...filter, userId: undefined, role: undefined, cohortId: filter.cohortId ?? `pair=${pairId}` };
  const base = computeFunnel(scoped, cohortFilter, now);
  const byId = new Map(base.stages.map((s) => [s.stageId, s]));
  const stage = (id: string): FunnelStage => {
    const s = byId.get(id);
    if (!s) throw new Error(`computeFunnel did not return stage "${id}"`);
    return s;
  };

  const opps = selectOpportunities(scoped, cohortFilter, now);
  const booked = bookedOpportunityIds(scoped, new Set(opps.map((o) => o.opportunityId)));
  const contact = stage("two_way_contact");
  const bookedStage: FunnelStage = {
    stageId: "booked",
    label: "Booked",
    count: booked.size,
    parentStageId: "two_way_contact",
    metricId: "M05",
    dataState: "complete",
    cohortLabel: contact.cohortLabel,
    supportingText: `${booked.size} booked / ${contact.count} contacted (any booking, retained or not)`,
  };
  const retained: FunnelStage = { ...stage("retained_booking"), parentStageId: "booked" };

  const setterSide: FunnelStage[] = [stage("assigned"), contact, bookedStage, retained, stage("attended")];
  const closerSide: FunnelStage[] = [stage("perceived_qualified"), stage("won"), stage("net_collected_cash")];
  const chain = [...setterSide, ...closerSide];
  const baseConnector = new Map(base.connectors.map((c) => [`${c.fromStageId}>${c.toStageId}`, c]));

  const connectors: FunnelConnector[] = [];
  for (let i = 0; i < chain.length - 1; i += 1) {
    const from = chain[i];
    const to = chain[i + 1];
    const reused = baseConnector.get(`${from.stageId}>${to.stageId}`);
    if (reused && reused.metric) {
      connectors.push(reused);
      continue;
    }
    // Setter-side links computeFunnel does not emit for a mixed cohort: in a
    // pair the setter reaches the customer before any booking, so these are
    // true subsets and a rate is allowed.
    const metric = buildPayload({
      metricId: (to.metricId ?? "M02") as MetricId,
      label: `${to.label} / ${from.label}`,
      numerator: to.count,
      denominator: from.count,
      unknownCount: to.unknownCount ?? 0,
      unit: "ratio",
      cohortId: base.cohortId,
      timeBasis: "accountability_started_at",
      asOf: now,
      dataState: to.dataState,
      zeroDenominatorReason: `N/A: no ${from.label.toLowerCase()}`,
    });
    connectors.push({ fromStageId: from.stageId, toStageId: to.stageId, metric, verdict: evaluate(metric, defaultBenchmarkFor(metric.metricId)) });
  }

  return { pair, cohortId: base.cohortId, asOf: now, setterSide, handoff: pairHandoff(scoped, pairId), closerSide, connectors };
}

// ---------- Diagnostic ----------

export interface PairDiagnostic {
  pairId: Id;
  weakestSide: PairSide | "none";
  /** The stage the weakest connector feeds, or "none". */
  stageId: string;
  /** Names the stage and its counts, never a person. */
  observed: string;
  /** Pooled rate across the tenant's pairs: sum of numerators over sum of denominators. */
  comparator: string;
  dataState: DataState;
  /** Upstream and outside possibilities the diagnostic must name (SOS-10). */
  alternativeExplanations: string[];
  suggestedOwner: "setter" | "closer" | "both" | "sales_ops";
  /** Rate gap (pair minus pooled) at the weakest connector, in ratio points; 0 when none. */
  gap: number;
}

export interface PairDiagnosticOptions {
  /** Connectors with a pair denominator below this are never blamed. */
  minDenominator?: number;
  /** Gaps smaller than this (in ratio points) count as within tolerance. */
  tolerance?: number;
}

export const PAIR_DIAGNOSTIC_DEFAULTS: Required<PairDiagnosticOptions> = { minDenominator: 5, tolerance: 0.02 };

const STAGE_NOUN: Record<string, string> = {
  two_way_contact: "reached in a two-way conversation",
  booked: "booked",
  retained_booking: "retained after review",
  attended: "attended",
  perceived_qualified: "rated qualified after the show",
  won: "won",
  net_collected_cash: "collected cash",
};

const ALTERNATIVES: Record<PairSide, string[]> = {
  setter: [
    "Lead source or campaign mix changed for this pair's inquiries",
    "Lead tier mix differs from the pooled pairs",
    "Consent or channel limits reduced permitted attempts",
    "Inquiry timing (weekends, evenings) shifted first-attempt windows",
    "Small sample: a few opportunities move the rate",
  ],
  handoff: [
    "Handoff accepted late, so the booking aged before the closer engaged",
    "Booking placed too far out or without a confirmation touch",
    "Closer calendar capacity was short in the window",
    "Attendance evidence is unresolved for part of the cohort",
    "Small sample: a few no-shows move the rate",
  ],
  closer: [
    "Fit evidence in the handoff was thin, so the show surfaced a poor fit",
    "Offer or price authority constrained what could be proposed",
    "Lead tier or customer readiness differs from the pooled pairs",
    "Payment collection lag, refunds, or unlinked payments",
    "Small sample: a few outcomes move the rate",
  ],
};

interface RateParts {
  numerator: number;
  denominator: number;
  dataState: DataState;
}

function connectorParts(c: FunnelConnector): RateParts | null {
  if (!c.metric || c.metric.refusalReason) return null;
  return { numerator: c.metric.numerator, denominator: c.metric.denominator, dataState: c.metric.dataState };
}

function worstState(states: DataState[]): DataState {
  const order: DataState[] = ["complete", "no_benchmark", "insufficient_sample", "immature", "partial", "stale", "unknown"];
  return states.reduce<DataState>((acc, s) => (order.indexOf(s) > order.indexOf(acc) ? s : acc), "complete");
}

function pct(n: number, d: number): string {
  return d === 0 ? "N/A" : `${Math.round((n / d) * 100)}%`;
}

/**
 * Where does this pair lose the most against the other pairs on the tenant?
 * Compares every connector rate to the pooled rate (sum over sum) across all
 * pairs, and picks the largest negative gap with a pair denominator of at
 * least `minDenominator`. Within tolerance, or nothing measurable: "none".
 */
export function pairDiagnostic(dataset: Dataset, pairs: Pair[], pairId: Id, now: ISODateTime, options: PairDiagnosticOptions = {}): PairDiagnostic {
  const { minDenominator, tolerance } = { ...PAIR_DIAGNOSTIC_DEFAULTS, ...options };
  const pair = requirePair(pairs, pairId);
  const own = pairFunnel(dataset, pairs, pairId, {}, now);
  const tenantPairs = pairs.filter((p) => p.tenantId === pair.tenantId);
  const pooled = new Map<string, { numerator: number; denominator: number }>();
  for (const p of tenantPairs) {
    const f = p.pairId === pairId ? own : pairFunnel(dataset, pairs, p.pairId, {}, now);
    for (const c of f.connectors) {
      const parts = connectorParts(c);
      if (!parts) continue;
      const key = `${c.fromStageId}>${c.toStageId}`;
      const acc = pooled.get(key) ?? { numerator: 0, denominator: 0 };
      acc.numerator += parts.numerator;
      acc.denominator += parts.denominator;
      pooled.set(key, acc);
    }
  }

  const overall = worstState(own.connectors.map((c) => c.metric?.dataState ?? "unknown"));
  const totalOpps = own.setterSide[0]?.count ?? 0;

  let worst: { connector: FunnelConnector; parts: RateParts; pool: { numerator: number; denominator: number }; gap: number } | null = null;
  for (const c of own.connectors) {
    const parts = connectorParts(c);
    if (!parts || parts.denominator < minDenominator) continue;
    const pool = pooled.get(`${c.fromStageId}>${c.toStageId}`);
    if (!pool || pool.denominator === 0) continue;
    const gap = parts.numerator / parts.denominator - pool.numerator / pool.denominator;
    if (gap >= -tolerance) continue;
    if (!worst || gap < worst.gap) worst = { connector: c, parts, pool, gap };
  }

  if (!worst) {
    return {
      pairId,
      weakestSide: "none",
      stageId: "none",
      observed:
        totalOpps === 0
          ? "No opportunities carried by this pair yet."
          : `Every stage with at least ${minDenominator} in the denominator is within ${Math.round(tolerance * 100)} points of the pooled pair rate.`,
      comparator: `Team pairs (${tenantPairs.length}), pooled sum over sum`,
      dataState: totalOpps === 0 ? "insufficient_sample" : overall,
      alternativeExplanations: totalOpps === 0 ? ["Nothing has passed through the handoff yet"] : ["Stages below the minimum denominator were not compared"],
      suggestedOwner: "sales_ops",
      gap: 0,
    };
  }

  const side = pairSideOf(worst.connector);
  const stageId = worst.connector.toStageId;
  const noun = STAGE_NOUN[stageId] ?? stageId;
  const fromStageId = worst.connector.fromStageId;
  const fromLabel = [...own.setterSide, ...own.closerSide].find((s) => s.stageId === fromStageId)?.label ?? fromStageId;
  // The finding carries the weakest connector's own data state. A data problem
  // elsewhere in the funnel (say an unlinked payment) does not reroute a
  // setter-side finding to sales_ops.
  const dataState = worst.parts.dataState;
  const dataProblem = dataState !== "complete" && dataState !== "no_benchmark";
  return {
    pairId,
    weakestSide: side,
    stageId,
    observed: `${side === "handoff" ? "Handoff" : side === "setter" ? "Setter side" : "Closer side"}, ${stageId.replace(/_/g, " ")}: ${worst.parts.numerator} of ${worst.parts.denominator} ${fromLabel.toLowerCase()} ${noun} (${pct(worst.parts.numerator, worst.parts.denominator)}).`,
    comparator: `Team pairs: ${worst.pool.numerator} of ${worst.pool.denominator} (${pct(worst.pool.numerator, worst.pool.denominator)}), pooled sum over sum across ${tenantPairs.length} pair(s).`,
    dataState,
    // Never "fix the data": an alternative explanation names the specific gap and
    // what would close it (docs/DECISIONS.md, "A held measurement never holds the person").
    alternativeExplanations: dataProblem
      ? [`Some records for this stage are missing their evidence, so the rate can still move. Sales ops completes them.`, ...ALTERNATIVES[side]]
      : ALTERNATIVES[side],
    suggestedOwner: dataProblem ? "sales_ops" : side === "handoff" ? "both" : side,
    gap: worst.gap,
  };
}

// ---------- Contribution ----------

export interface PairContribution {
  pairId: Id;
  currency: string;
  /** Net collected cash landed in the season on the pair's opportunities. */
  netCollectedMinor: number;
  /** Commission at the setter policy rate on the same cash. */
  setterCommissionMinor: number;
  /** Commission at the closer policy rate on the same cash. */
  closerCommissionMinor: number;
  /** Pair opportunities whose accountability started in the season. */
  opportunities: number;
  wins: number;
  hypothetical: boolean;
  policyVersions: { setter?: string; closer?: string };
}

function commissionOn(dataset: Dataset, oppIds: Id[], seasonLedgerDataset: Dataset, policy: CommissionPolicy | undefined, currency: string): number {
  if (!policy) return 0;
  let total = 0;
  for (const id of oppIds) {
    const ids = new Set([id]);
    const base = policy.basis === "contracted_value" ? contractedValue(dataset, ids, currency) : netCollected(ledgerFor(seasonLedgerDataset, ids), currency);
    if (base.amountMinor <= 0) continue;
    total += scale(base, policy.ratePercent / 100).amountMinor;
  }
  return total;
}

/**
 * What a pair produced in a season and how the hypothetical commission splits
 * by role. Commission is computed per opportunity (rounded to the minor unit
 * each time, like ledger entries) and summed as integers.
 */
export function pairContribution(dataset: Dataset, pairs: Pair[], pairId: Id, season: SeasonWindow, policies: CommissionPolicy[]): PairContribution {
  requirePair(pairs, pairId);
  const currency = dataset.tenant.reportingCurrency;
  const opps = pairOpportunities(dataset, pairId);
  const allIds = opps.map((o) => o.opportunityId);
  const seasonLedgerDataset: Dataset = { ...dataset, ledger: dataset.ledger.filter((e) => e.occurredAt >= season.from && e.occurredAt < season.to) };
  const net = netCollected(ledgerFor(seasonLedgerDataset, new Set(allIds)), currency);
  const inSeason = opps.filter((o) => o.accountabilityStartedAt >= season.from && o.accountabilityStartedAt < season.to);
  const setterPolicy = commissionPolicyFor(policies, "setter");
  const closerPolicy = commissionPolicyFor(policies, "closer");
  return {
    pairId,
    currency,
    netCollectedMinor: net.amountMinor,
    setterCommissionMinor: commissionOn(dataset, allIds, seasonLedgerDataset, setterPolicy, currency),
    closerCommissionMinor: commissionOn(dataset, allIds, seasonLedgerDataset, closerPolicy, currency),
    opportunities: inSeason.length,
    wins: wonOpportunities(inSeason).length,
    hypothetical: [setterPolicy, closerPolicy].some((p) => p?.hypothetical ?? false) || (!setterPolicy && !closerPolicy),
    policyVersions: { setter: setterPolicy?.policyVersion, closer: closerPolicy?.policyVersion },
  };
}

// ---------- Pair leaderboard ----------

export interface PairLeaderboardPolicy {
  minMaturedSample: number;
}

export interface PairLeaderboardRow {
  pairId: Id;
  setterUserId: Id;
  closerUserId: Id;
  setterDisplayName: string;
  closerDisplayName: string;
  chosenBy: Pair["chosenBy"];
  active: boolean;
  /** 1-based, ties share a rank; null while provisional. */
  rank: number | null;
  provisional: boolean;
  provisionalReason?: string;
  assignedOpportunities: number;
  maturedSample: number;
  wins: number;
  netCollectedMinor: number;
  currency: string;
  /** Net collected cash per assigned opportunity (M16 shape). */
  netPerAssigned: MetricPayload;
}

/**
 * Pairs ranked by net collected cash per assigned opportunity for the season.
 * Pairs only: this board never contains an individual row and is never merged
 * with the individual boards. A pair under the matured-sample minimum is shown
 * with its value but no rank.
 */
export function pairLeaderboard(dataset: Dataset, pairs: Pair[], season: SeasonWindow, policy: PairLeaderboardPolicy, now: ISODateTime = season.to): PairLeaderboardRow[] {
  const currency = dataset.tenant.reportingCurrency;
  const names = new Map(dataset.users.map((u) => [u.userId, u.displayName]));
  const seasonLedgerDataset: Dataset = { ...dataset, ledger: dataset.ledger.filter((e) => e.occurredAt >= season.from && e.occurredAt < season.to) };
  const drafts: PairLeaderboardRow[] = [];
  for (const pair of [...pairs].sort((a, b) => a.pairId.localeCompare(b.pairId))) {
    const opps = pairOpportunities(dataset, pair.pairId).filter((o) => o.accountabilityStartedAt >= season.from && o.accountabilityStartedAt < season.to);
    if (opps.length === 0) continue;
    const ids = new Set(opps.map((o) => o.opportunityId));
    const net = netCollected(ledgerFor(seasonLedgerDataset, ids), currency);
    const matured = opps.filter((o) => opportunityMatured(o, dataset.tenant, now)).length;
    const netPerAssigned = buildPayload({
      metricId: "M16",
      label: "Net collected revenue per assigned opportunity (pair)",
      numerator: net.amountMinor,
      denominator: opps.length,
      unit: "ratio_money_per_unit",
      currency,
      basis: "net_collected_cash",
      cohortId: `pair=${pair.pairId}:season=[${season.from},${season.to})`,
      timeBasis: "accountability_started_at; cash by occurred_at in season",
      asOf: now,
      zeroDenominatorReason: "N/A: no assigned opportunities",
    });
    const provisional = matured < policy.minMaturedSample;
    drafts.push({
      pairId: pair.pairId,
      setterUserId: pair.setterUserId,
      closerUserId: pair.closerUserId,
      setterDisplayName: names.get(pair.setterUserId) ?? pair.setterUserId,
      closerDisplayName: names.get(pair.closerUserId) ?? pair.closerUserId,
      chosenBy: pair.chosenBy,
      active: pair.active,
      rank: null,
      provisional,
      provisionalReason: provisional ? `${matured} matured of ${opps.length} assigned; minimum ${policy.minMaturedSample} for an eligible rank` : undefined,
      assignedOpportunities: opps.length,
      maturedSample: matured,
      wins: wonOpportunities(opps).length,
      netCollectedMinor: net.amountMinor,
      currency,
      netPerAssigned,
    });
  }
  const key = (r: PairLeaderboardRow) => r.netPerAssigned.value ?? Number.NEGATIVE_INFINITY;
  drafts.sort((a, b) => key(b) - key(a) || a.pairId.localeCompare(b.pairId));
  let rank = 0;
  let placed = 0;
  let last: number | null = null;
  for (const row of drafts) {
    if (row.provisional) continue;
    placed += 1;
    const v = key(row);
    if (last === null || v !== last) rank = placed;
    last = v;
    row.rank = rank;
  }
  return drafts;
}
