/**
 * Rule-based coaching engine (SOS-16) and owner bottleneck cards (SOS-21).
 * Sequence per card: observation, evidence check, possible cause, controllable
 * action, labeled financial scenario, review. Scenarios are never forecasts
 * and benchmark gaps are never "lost" money.
 */
import type {
  BottleneckCard,
  CoachingOwner,
  CoachingRecommendation,
  CoachingScenario,
  CommissionPolicy,
  DataState,
  ISODateTime,
  Id,
  MetricId,
  MetricPayload,
  Money,
  PerformanceVerdict,
} from "./types";
import {
  type CohortFilter,
  type Dataset,
  attendedOpportunityIds,
  computeMetric,
  latestAssessmentByOpportunity,
  ledgerFor,
  netCollected,
  selectOpportunities,
  wonOpportunities,
} from "./metrics";
import { defaultBenchmarkFor, evaluate } from "./performance";
import { formatMoney, formatPercent, money, scale } from "./money";

export const COACHING_ENGINE_VERSION = "rules-1.0";

// ---------- Stage-to-action library (SOS-16) ----------

export interface StageAction {
  /** Stable key for entries that are not looked up by metric alone (e.g. "perception_gap"). */
  key?: string;
  issue: string;
  metricId: MetricId;
  investigate: string[];
  action: string;
  owner: CoachingOwner;
  effort: string;
  guardrails: string[];
}

export const STAGE_ACTION_LIBRARY: StageAction[] = [
  {
    issue: "Slow first attempt",
    metricId: "M03",
    investigate: ["Ingestion lag", "Coverage gaps", "Assignment backlog", "Consent restrictions"],
    action: "Fix routing and coverage first; then practice timely acknowledgment on the next eligible inquiries.",
    owner: "sales_ops",
    effort: "Ops review 1h; rep practice 10 min per day",
    guardrails: ["No contact outside permitted channels or hours"],
  },
  {
    issue: "Low two-way contact",
    metricId: "M04",
    investigate: ["Invalid contact details", "Channel preference", "Caller reputation", "Timing", "Source quality"],
    action: "Verify source quality and test one approved channel or timing change on the next eligible opportunities.",
    owner: "rep",
    effort: "One approved variant for two weeks",
    guardrails: ["Respect consent and contact-frequency policy", "Stop if opt-outs rise"],
  },
  {
    issue: "High pre-call DQ",
    metricId: "M07",
    investigate: ["Offer mismatch", "Unclear criteria", "Missing facts", "Inconsistent review"],
    action: "Review a matched DQ sample and clarify one offer-fit question in the intake script.",
    owner: "sales_ops",
    effort: "Review of 10 DQ cases, 1h",
    guardrails: ["DQ is contextual; do not target a lower rate for its own sake", "DQ never leaves the assigned denominator"],
  },
  {
    issue: "Low retained-booking attendance",
    metricId: "M08",
    investigate: ["Booking lead time", "Timezone", "Unclear purpose", "Reminder delivery", "Rep punctuality"],
    action: "On the next eligible bookings, confirm the customer's goal, the meeting purpose, and an easy reschedule option.",
    owner: "rep",
    effort: "2 minutes per confirmation",
    guardrails: ["No fabricated urgency", "Review opt-outs and complaints", "Rep absence is a service failure, not a customer no-show"],
  },
  {
    issue: "Low perceived qualification",
    metricId: "M09",
    investigate: ["Lead mix", "Assessment coverage", "Product knowledge", "Inconsistent criteria"],
    action: "Review evidence on a matched sample and practice one clarification question. Do not diagnose pessimism.",
    owner: "rep",
    effort: "Evidence review of 5 attended cases",
    guardrails: ["Perceived fit is not verified fit", "Unknown is not No"],
  },
  {
    key: "perception_gap",
    issue: "Perception gap",
    metricId: "M10",
    investigate: ["Lead mix", "Assessment coverage", "Inconsistent criteria", "Product knowledge", "Small sample"],
    action: "Review five attended cases where the rating and the verified criteria disagree; ask one clarification question per case, or add the product lesson that covers the criterion the rating missed.",
    owner: "rep",
    effort: "Evidence review of 5 attended cases, 30 min",
    guardrails: [
      "Perceived fit is not verified fit; the gap is coaching data, not a diagnosis of the rep's outlook",
      "Neither direction is automatically good or bad",
      "Unknown is not No",
    ],
  },
  {
    issue: "Low qualified-to-win",
    metricId: "M11",
    investigate: ["Fit definition", "Unresolved stakeholders", "Offer limitations", "Price changes"],
    action: "Review comparable conversations and record one unresolved decision objective per open opportunity.",
    owner: "rep",
    effort: "Review 5 won and 5 not-won conversations",
    guardrails: ["No unsupported guarantees", "Respect a customer's No"],
  },
  {
    issue: "Low show-to-win",
    metricId: "M12",
    investigate: ["Fit definition", "Unresolved stakeholders", "Offer limitations", "Discovery completeness"],
    action: "Review comparable attended conversations and practice one discovery behavior on the next appointments.",
    owner: "rep",
    effort: "Review 5 attended cases",
    guardrails: ["No pressure tactics", "Quality gates can cancel this recommendation"],
  },
  {
    issue: "Signed deals not collecting",
    metricId: "M16",
    investigate: ["Payment friction", "Inaccurate terms", "Wrong authority", "Collection timing"],
    action: "Fix the payment workflow step and clarify approved terms before the next proposal.",
    owner: "finance",
    effort: "Workflow review 2h",
    guardrails: ["Contracted value is not cash", "Never record cash that was not collected"],
  },
  {
    issue: "High refunds or delivery failures",
    metricId: "M16",
    investigate: ["Mis-selling", "Product quality", "Scope mismatch", "Implementation capacity"],
    action: "Coordinate with delivery; pause the harmful script or offer promise.",
    owner: "delivery",
    effort: "Delivery review meeting",
    guardrails: ["Refunds restate the original cohort", "Do not reward a sale that breaches suitability"],
  },
  {
    issue: "High revenue with poor contribution",
    metricId: "M18",
    investigate: ["Discounts", "Costly customers", "Ad cost", "Delivery burden"],
    action: "Review offer economics; do not merely demand more calls.",
    owner: "finance",
    effort: "Unit economics review",
    guardrails: ["Revenue is not profit"],
  },
];

export function libraryEntry(metricId: MetricId): StageAction | undefined {
  return STAGE_ACTION_LIBRARY.find((s) => s.metricId === metricId);
}

export function libraryEntryByKey(key: string): StageAction | undefined {
  return STAGE_ACTION_LIBRARY.find((s) => s.key === key);
}

// ---------- Perception gap (perceived fit vs verified fit) ----------

/** Perceived minus verified within this many points counts as aligned. */
export const PERCEPTION_GAP_ALIGNED_POINTS = 10;
/** Attended cases needed before a direction is named at all. */
export const PERCEPTION_GAP_MIN_ATTENDED = 10;
/** Team-level owner card threshold, in points. */
export const PERCEPTION_GAP_CARD_POINTS = 15;
export const PERCEPTION_GAP_STAGE_ID = "perception_gap";

export type PerceptionGapBand = "aligned" | "under_perceiving" | "over_perceiving" | "insufficient";

export interface PerceptionGap {
  /** M10 verified-fit rate over attended. */
  verified: MetricPayload;
  /** M09 perceived qualified-show rate over attended. */
  perceived: MetricPayload;
  /**
   * Perceived minus verified, in percentage points (one decimal). null when
   * either denominator is zero or either data state is not complete.
   */
  gapPoints: number | null;
  coverage: { assessed: number; attended: number };
  band: PerceptionGapBand;
  /** Alternative explanations, always listed; the gap is never a diagnosis. */
  alternatives: string[];
  /** A clarification question or product lesson. Never a request to rate differently. */
  action: string;
}

function points(ratio: number): number {
  return Math.round(ratio * 1000) / 10;
}

function formatPoints(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(1);
}

function humanKey(key: string): string {
  return key.replace(/_/g, " ");
}

/** The objective criterion most often not met on attended cases where the rating and verification disagree. */
function weakestCriterion(dataset: Dataset, filter: CohortFilter, now: ISODateTime, band: PerceptionGapBand): string | undefined {
  const opps = selectOpportunities(dataset, filter, now);
  const attended = attendedOpportunityIds(dataset, new Set(opps.map((o) => o.opportunityId)));
  const latest = latestAssessmentByOpportunity(dataset);
  const counts = new Map<string, number>();
  for (const opp of opps) {
    if (!attended.has(opp.opportunityId)) continue;
    const a = latest.get(opp.opportunityId);
    if (!a) continue;
    const disagree = band === "over_perceiving"
      ? a.repPerceivedFit === "likely" && opp.fitState !== "verified"
      : a.repPerceivedFit === "unlikely" && opp.fitState === "verified";
    if (!disagree) continue;
    for (const [key, entry] of Object.entries(a.objective)) {
      if (entry.value !== "yes") counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [key, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function perceptionAlternatives(coverage: { assessed: number; attended: number }): string[] {
  return [
    "Lead mix: the attended cases may differ in source or lead tier from the pool, so the same criteria meet a different population.",
    `Assessment coverage: ${coverage.assessed} of ${coverage.attended} attended cases carry a definite rating; unrated or unsure cases sit outside both rates.`,
    "Inconsistent criteria: the fit policy may be applied differently across reps or over time, which moves either rate without any change in judgment.",
    "Product knowledge: an unfamiliar offer criterion can move a rating in either direction.",
    `Small sample: ${coverage.attended} attended cases; a few cases move the gap by several points.`,
  ];
}

function perceptionAction(band: PerceptionGapBand, criterion: string | undefined): string {
  const lesson = criterion ? `; where ${humanKey(criterion)} was the criterion in doubt, add the product lesson that covers it` : "";
  switch (band) {
    case "over_perceiving":
      return `On the next five attended cases rated likely, ask one clarification question against the fit criterion that most often went unverified${lesson}.`;
    case "under_perceiving":
      return `On the next five attended cases rated unlikely or unsure, ask one clarification question against the criterion the verification met and note which fact the rating did not have${lesson}.`;
    case "aligned":
      return "No change asked for. Keep attaching evidence to each rating so the two rates stay comparable.";
    default:
      return "Collect evidence on more attended cases before comparing the two rates. No rating change is asked for.";
  }
}

/**
 * Perceived qualified-show rate (M09) beside verified-fit rate (M10) on the
 * same attended denominator. The gap is perceived minus verified in points.
 * Aligned within PERCEPTION_GAP_ALIGNED_POINTS; insufficient under
 * PERCEPTION_GAP_MIN_ATTENDED attended or when either rate is not computable
 * on complete data. Never "be more positive": the action is a clarification
 * question or a product lesson, and alternatives are always listed.
 */
export function perceptionGap(dataset: Dataset, filter: CohortFilter, now: ISODateTime): PerceptionGap {
  const perceived = computeMetric("M09", dataset, filter, now);
  const verified = computeMetric("M10", dataset, filter, now);
  const attended = perceived.denominator;
  const coverage = { assessed: Math.max(0, attended - perceived.unknownCount), attended };
  const computable =
    perceived.value !== null &&
    verified.value !== null &&
    perceived.denominator > 0 &&
    verified.denominator > 0 &&
    perceived.dataState === "complete" &&
    verified.dataState === "complete";
  const gapPoints = computable ? Math.round((points(perceived.value as number) - points(verified.value as number)) * 10) / 10 : null;
  let band: PerceptionGapBand;
  if (gapPoints === null || attended < PERCEPTION_GAP_MIN_ATTENDED) band = "insufficient";
  else if (Math.abs(gapPoints) <= PERCEPTION_GAP_ALIGNED_POINTS) band = "aligned";
  else band = gapPoints < 0 ? "under_perceiving" : "over_perceiving";
  const criterion = band === "over_perceiving" || band === "under_perceiving" ? weakestCriterion(dataset, filter, now, band) : undefined;
  return {
    verified,
    perceived,
    gapPoints,
    coverage,
    band,
    alternatives: perceptionAlternatives(coverage),
    action: perceptionAction(band, criterion),
  };
}

/** "Verified fit 76%, perceived 48%, gap 28 points under". */
export function perceptionGapObserved(gap: PerceptionGap): string {
  const v = formatPercent(gap.verified.value, 0);
  const p = formatPercent(gap.perceived.value, 0);
  if (gap.gapPoints === null) return `Verified fit ${v}, perceived ${p}, gap not computable`;
  const direction = gap.gapPoints < 0 ? "under" : gap.gapPoints > 0 ? "over" : "even";
  return `Verified fit ${v}, perceived ${p}, gap ${formatPoints(Math.abs(gap.gapPoints))} points ${direction}`;
}

/** A recommendation built from the perception gap carries the two rates for the coach screens. */
export interface PerceptionGapRecommendation extends CoachingRecommendation {
  perception: PerceptionGap;
}

export function isPerceptionGapRecommendation(rec: CoachingRecommendation): rec is PerceptionGapRecommendation {
  return "perception" in rec && rec.metricIds.includes("M09") && rec.metricIds.includes("M10");
}

/** The owner card for the team gap carries the two rates so the view can show them as labels. */
export interface PerceptionGapBottleneckCard extends BottleneckCard {
  perception: PerceptionGap;
}

export function isPerceptionGapCard(card: BottleneckCard): card is PerceptionGapBottleneckCard {
  return card.stageId === PERCEPTION_GAP_STAGE_ID && "perception" in card;
}

/** The same cohort without the person: the team pooled comparator (sum over sum). */
function teamFilter(filter: CohortFilter): CohortFilter {
  const rest: CohortFilter = { ...filter };
  delete rest.userId;
  delete rest.role;
  return rest;
}

function perceptionGapRecommendation(dataset: Dataset, filter: CohortFilter, userId: Id, now: ISODateTime): Candidate | undefined {
  const gap = perceptionGap(dataset, filter, now);
  if (gap.band !== "under_perceiving" && gap.band !== "over_perceiving" || gap.gapPoints === null) return undefined;
  const entry = libraryEntryByKey("perception_gap");
  if (!entry) return undefined;
  const team = perceptionGap(dataset, teamFilter(filter), now);
  const comparator = team.gapPoints === null
    ? "Team pooled: gap not computable on complete data; descriptive only"
    : `Team pooled: ${perceptionGapObserved(team).charAt(0).toLowerCase()}${perceptionGapObserved(team).slice(1)} (sum over sum, not a mean)`;
  const rec: PerceptionGapRecommendation = {
    tenantId: dataset.tenant.tenantId,
    recommendationId: `rec_perception_gap_${userId}_${Date.parse(now)}`,
    ownerRole: "rep",
    ownerUserId: userId,
    title: entry.issue,
    issue: `${entry.issue}: ${perceptionGapObserved(gap)} on ${gap.coverage.attended} attended cases. ${gap.band === "under_perceiving" ? "Ratings run below what the criteria verified." : "Ratings run above what the criteria verified."}`,
    metricIds: ["M09", "M10"],
    cohortId: gap.perceived.cohortId,
    dataState: gap.perceived.dataState,
    observed: perceptionGapObserved(gap),
    comparator,
    alternativeExplanations: gap.alternatives,
    evidenceRefs: [gap.perceived.evidenceQueryId, gap.verified.evidenceQueryId],
    action: gap.action,
    playbookVersion: "playbook-1.0-pilot",
    effort: entry.effort,
    guardrails: [...entry.guardrails, "Correlation is not cause; a rep can challenge this premise."],
    reviewAt: reviewDate(now),
    state: "proposed",
    provenance: { engine: "rules", version: COACHING_ENGINE_VERSION },
    perception: gap,
  };
  const severity = Math.abs(gap.gapPoints) > 2 * PERCEPTION_GAP_ALIGNED_POINTS ? 3 : 2;
  return { rec, priority: severity * 10 + 2 * 3 };
}

// ---------- Scenario modeling (SOS-16 worked example) ----------

export interface ScenarioInput {
  /** Eligible units at the stage (e.g. 140 retained appointments). */
  eligible: number;
  currentRate: number;
  targetRate: number;
  /** Downstream conversion from the incremental units to wins (e.g. 0.20 show-to-win). */
  downstreamRate: number;
  /** Average net collected amount per win. */
  avgNetCollected: Money;
  commissionPolicy?: Pick<CommissionPolicy, "ratePercent" | "hypothetical" | "basis" | "policyVersion">;
  /** Available additional capacity in units; caps the modeled increase. */
  capacityCap?: number;
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/**
 * 140 retained, 50% -> 60%, 20% show-to-win, $5,000 average, 5% hypothetical
 * -> 14 additional shows, $14,000 modeled cash, $700 modeled commission.
 */
export function modelScenario(input: ScenarioInput): CoachingScenario {
  const rawUnits = round6(input.eligible * (input.targetRate - input.currentRate));
  const capacityCapApplied = input.capacityCap !== undefined && rawUnits > input.capacityCap;
  const additionalUnits = capacityCapApplied ? (input.capacityCap as number) : rawUnits;
  const expectedWins = round6(additionalUnits * input.downstreamRate);
  const modeledCash = scale(input.avgNetCollected, expectedWins);
  const modeledCommission = input.commissionPolicy ? scale(modeledCash, input.commissionPolicy.ratePercent / 100) : undefined;
  const assumptions = [
    `${input.eligible} eligible units at the stage; rate moves from ${formatPercent(input.currentRate, 0)} to ${formatPercent(input.targetRate, 0)} (${formatPercent(input.targetRate - input.currentRate, 0).replace("%", "")} percentage points)`,
    `Incremental units = ${input.eligible} x (${input.targetRate} - ${input.currentRate}) = ${rawUnits}${capacityCapApplied ? `, capped at ${input.capacityCap} by available capacity` : ""}`,
    `Downstream conversion held at ${formatPercent(input.downstreamRate, 0)}: ${additionalUnits} x ${input.downstreamRate} = ${expectedWins} expected wins (fractional wins are scenario expectations, not literal deals)`,
    `Average net collected per win held at ${formatMoney(input.avgNetCollected)}`,
    input.commissionPolicy
      ? `Commission at ${input.commissionPolicy.ratePercent}% on ${input.commissionPolicy.basis} (${input.commissionPolicy.hypothetical ? "hypothetical policy" : `policy ${input.commissionPolicy.policyVersion}`})`
      : "No commission policy supplied; commission not modeled",
    "Customer mix, workload, sale size, refunds, and costs assumed unchanged. Sensitivity case, not a confidence interval.",
  ];
  return {
    assumptions,
    additionalUnits,
    modeledCash,
    modeledCommission,
    commissionBasisHypothetical: input.commissionPolicy?.hypothetical ?? true,
    capacityCapApplied,
    disclaimer: "Not a forecast",
  };
}

export function sensitivityTable(base: Omit<ScenarioInput, "targetRate">, targetRates: number[]): { targetRate: number; scenario: CoachingScenario }[] {
  return targetRates.map((targetRate) => ({ targetRate, scenario: modelScenario({ ...base, targetRate }) }));
}

/**
 * SOS-21 benchmark opportunity scenario:
 * assigned x (benchmark RPL - observed RPL). Descriptive counterfactual, never "lost".
 * Returns undefined when no valid comparator exists rather than fabricating one.
 */
export function benchmarkOpportunityScenario(input: {
  assignedOpportunities: number;
  observedRplMinor: number | null;
  benchmarkRplMinor: number | null;
  benchmarkLabel: string;
  currency: string;
  crossesLeadTier?: boolean;
}): (CoachingScenario & { label: "benchmark opportunity scenario" }) | undefined {
  if (input.observedRplMinor === null || input.benchmarkRplMinor === null) return undefined;
  const gapMinor = Math.round(input.assignedOpportunities * (input.benchmarkRplMinor - input.observedRplMinor));
  return {
    label: "benchmark opportunity scenario",
    assumptions: [
      `${input.assignedOpportunities} assigned opportunities x (${input.benchmarkLabel} RPL ${formatMoney(money(Math.round(input.benchmarkRplMinor), input.currency))} - observed RPL ${formatMoney(money(Math.round(input.observedRplMinor), input.currency))})`,
      "Assumes the benchmark is transferable and the required capacity exists.",
      "Descriptive counterfactual. Not a measured loss, not an accounting expense, not an amount owed by anyone.",
      ...(input.crossesLeadTier ? ["Comparator crosses lead tiers; use only as a labeled teaching example."] : []),
    ],
    additionalUnits: 0,
    modeledCash: money(gapMinor, input.currency),
    commissionBasisHypothetical: true,
    capacityCapApplied: false,
    disclaimer: "Not a forecast",
  };
}

// ---------- Recommendation engine ----------

export interface CoachingEngine {
  recommend(dataset: Dataset, userId: Id | null, now: ISODateTime): CoachingRecommendation[];
}

function reviewDate(now: ISODateTime, days = 14): ISODateTime {
  return new Date(Date.parse(now) + days * 86_400_000).toISOString().replace(".000Z", "Z");
}

function altExplanations(metricId: MetricId): string[] {
  const entry = libraryEntry(metricId);
  return entry ? entry.investigate.map((i) => `${i} could explain this without any change in rep behavior.`) : [];
}

function observedText(m: MetricPayload): string {
  if (m.unit === "ratio") return `${m.numerator} of ${m.denominator} (${formatPercent(m.value)})${m.unknownCount ? `, ${m.unknownCount} unresolved` : ""}`;
  if (m.unit === "ratio_money_per_unit") return `${formatMoney(money(m.numerator, m.currency))} over ${m.denominator} (${m.basis})`;
  return `${m.numerator}`;
}

function suppression(m: MetricPayload, dataset: Dataset): { reason: string; action: string } | undefined {
  if (m.metricId === "M08" && m.unknownCount > 0) {
    return {
      reason: `${m.unknownCount} matured appointment instance(s) have unresolved attendance evidence; show rate is only a bound (${formatPercent(m.bounds?.lower ?? null)} to ${formatPercent(m.bounds?.upper ?? null)}).`,
      action: "resolve attendance evidence",
    };
  }
  if ((m.metricId === "M16" || m.metricId === "M19") && dataset.ledger.some((e) => e.opportunityId === undefined)) {
    return { reason: "Unlinked payment(s) sit in the exception queue; cash attribution is unreconciled.", action: "verify payment mapping" };
  }
  if (m.dataState === "stale" || m.dataState === "unknown") {
    return { reason: `Data state is ${m.dataState}.`, action: "fix the data before coaching" };
  }
  return undefined;
}

interface Candidate {
  rec: CoachingRecommendation;
  priority: number;
}

function avgNetCollectedPerWin(dataset: Dataset, filter: CohortFilter, now: ISODateTime): Money | undefined {
  const opps = selectOpportunities(dataset, filter, now);
  const won = wonOpportunities(opps);
  if (won.length === 0) return undefined;
  const net = netCollected(ledgerFor(dataset, new Set(won.map((o) => o.opportunityId))), dataset.tenant.reportingCurrency);
  return money(Math.round(net.amountMinor / won.length), net.currency);
}

function buildRecommendation(
  dataset: Dataset,
  metric: MetricPayload,
  verdict: PerformanceVerdict,
  entry: StageAction,
  filter: CohortFilter,
  userId: Id | null,
  now: ISODateTime,
): Candidate | undefined {
  const suppressed = suppression(metric, dataset);
  const isIssue = verdict.state === "attention" || verdict.state === "material_issue";
  if (!suppressed && !isIssue) return undefined;

  const target = verdict.benchmark?.target;
  let scenario: CoachingScenario | undefined;
  if (!suppressed && metric.unit === "ratio" && metric.value !== null && target !== undefined && target > metric.value) {
    const downstream = computeMetric("M12", dataset, filter, now);
    const avg = avgNetCollectedPerWin(dataset, filter, now);
    if (downstream.value !== null && avg) {
      scenario = modelScenario({
        eligible: metric.denominator,
        currentRate: metric.value,
        targetRate: target,
        downstreamRate: metric.metricId === "M12" || metric.metricId === "M11" ? 1 : downstream.value,
        avgNetCollected: avg,
        commissionPolicy: dataset.commissionPolicy,
      });
    }
  }

  const rec: CoachingRecommendation = {
    tenantId: dataset.tenant.tenantId,
    recommendationId: `rec_${metric.metricId}_${userId ?? "team"}_${Date.parse(now)}`,
    ownerRole: suppressed ? "sales_ops" : userId ? "rep" : entry.owner,
    ownerUserId: userId ?? undefined,
    title: suppressed ? `Resolve data before coaching: ${entry.issue}` : entry.issue,
    issue: suppressed ? suppressed.reason : `${entry.issue}: ${verdict.explanation}`,
    metricIds: [metric.metricId],
    cohortId: metric.cohortId,
    dataState: metric.dataState,
    observed: observedText(metric),
    comparator: verdict.benchmark
      ? `${verdict.benchmark.label} ${verdict.benchmark.origin.replace("_", " ")} target ${metric.unit === "ratio" ? formatPercent(verdict.benchmark.target, 0) : verdict.benchmark.target}; not the top outlier`
      : "Descriptive only; no benchmark",
    alternativeExplanations: altExplanations(metric.metricId),
    evidenceRefs: [metric.evidenceQueryId],
    action: suppressed ? suppressed.action : entry.action,
    playbookVersion: "playbook-1.0-pilot",
    effort: suppressed ? "Data reconciliation, ops" : entry.effort,
    scenario,
    guardrails: [...entry.guardrails, "Correlation is not cause; a rep can challenge this premise."],
    reviewAt: reviewDate(now),
    state: "proposed",
    suppressed: suppressed ? { reason: suppressed.reason } : undefined,
    provenance: { engine: "rules", version: COACHING_ENGINE_VERSION },
  };

  const controllable = entry.owner === "rep" ? 2 : 1;
  const severity = verdict.state === "material_issue" ? 3 : verdict.state === "attention" ? 2 : 1;
  const cashWeight = scenario ? Math.min(3, scenario.modeledCash.amountMinor / 500_000) : 0;
  const priority = suppressed ? 100 : severity * 10 + controllable * 3 + cashWeight;
  return { rec, priority };
}

const COACHED_METRICS: MetricId[] = ["M04", "M06", "M08", "M09", "M11", "M12", "M16"];

export const RulesCoachingEngine: CoachingEngine = {
  recommend(dataset, userId, now) {
    const filter: CohortFilter = userId ? { userId } : {};
    const candidates: Candidate[] = [];
    for (const id of COACHED_METRICS) {
      const metric = computeMetric(id, dataset, filter, now);
      const verdict = evaluate(metric, defaultBenchmarkFor(id));
      const entry = libraryEntry(id);
      if (!entry) continue;
      const candidate = buildRecommendation(dataset, metric, verdict, entry, filter, userId, now);
      if (candidate) candidates.push(candidate);
    }
    // Perception gap for a rep: emitted only when a direction can be named; suppressed on small samples.
    if (userId) {
      const gap = perceptionGapRecommendation(dataset, filter, userId, now);
      if (gap) candidates.push(gap);
    }
    // One primary task plus a small number of optional lessons.
    return candidates.sort((a, b) => b.priority - a.priority).slice(0, 3).map((c) => c.rec);
  },
};

export const CoachingEngineImpl = RulesCoachingEngine;

// ---------- Owner bottleneck cards (SOS-21) ----------

const STAGE_FUNCTION: Record<string, CoachingOwner> = {
  M03: "sales_ops",
  M04: "marketing",
  M06: "sales_ops",
  M08: "sales_ops",
  M11: "rep",
  M12: "rep",
  M16: "finance",
};

const STAGE_IDS: Record<string, string> = {
  M03: "first_attempt",
  M04: "two_way_contact",
  M06: "retained_booking",
  M08: "attended",
  M11: "won",
  M12: "won",
  M16: "net_collected_cash",
};

export function buildBottleneckCards(dataset: Dataset, now: ISODateTime, filter: CohortFilter = {}): BottleneckCard[] {
  const cards: BottleneckCard[] = [];
  const currency = dataset.tenant.reportingCurrency;

  // Measurement first (SOS-21 diagnostic hierarchy).
  const unlinked = dataset.ledger.filter((e) => e.opportunityId === undefined);
  if (unlinked.length > 0) {
    const amount = unlinked.reduce((s, e) => s + e.amount.amountMinor, 0);
    cards.push({
      cardId: "bn_unlinked_payments",
      stageId: "net_collected_cash",
      cohortId: "ledger:exception_queue",
      observed: `${unlinked.length} payment(s) totaling ${formatMoney(money(amount, currency))} are not linked to an opportunity.`,
      comparator: "Policy: zero unreconciled payments before ranking or commission.",
      dataState: "partial",
      responsibleFunction: "finance",
      candidateExplanations: ["Provider mapping gap", "Payment made under a different contact name", "Manual invoice outside the workflow"],
      proposedInvestigation: "Map each payment to its opportunity or record an audited exception; then restate affected cohorts.",
      verdict: { state: "data_state", label: "Data state: partial", explanation: "Cash metrics are unreconciled until these payments are mapped." },
    });
  }

  for (const id of ["M04", "M06", "M08", "M11", "M12", "M16"] as MetricId[]) {
    const metric = computeMetric(id, dataset, filter, now);
    const verdict = evaluate(metric, defaultBenchmarkFor(id));
    const entry = libraryEntry(id);
    const interesting = verdict.state === "attention" || verdict.state === "material_issue" || verdict.state === "data_state";
    if (!interesting || !entry) continue;
    let scenario: CoachingScenario | undefined;
    if (verdict.state !== "data_state" && metric.value !== null && verdict.benchmark && verdict.benchmark.target > metric.value && metric.unit === "ratio") {
      const downstream = computeMetric("M12", dataset, filter, now);
      const avg = avgNetCollectedPerWin(dataset, filter, now);
      if (downstream.value !== null && avg) {
        scenario = modelScenario({
          eligible: metric.denominator,
          currentRate: metric.value,
          targetRate: verdict.benchmark.target,
          downstreamRate: id === "M12" || id === "M11" ? 1 : downstream.value,
          avgNetCollected: avg,
          commissionPolicy: dataset.commissionPolicy,
        });
      }
    }
    const dataState: DataState = metric.dataState;
    cards.push({
      cardId: `bn_${id}_${metric.cohortId}`,
      stageId: STAGE_IDS[id] ?? id,
      cohortId: metric.cohortId,
      observed: `${metric.label}: ${observedText(metric)}.`,
      comparator: verdict.benchmark ? `${verdict.benchmark.origin.replace("_", " ")} target ${formatPercent(verdict.benchmark.target, 0)} (${verdict.benchmark.label})` : "No benchmark",
      dataState,
      responsibleFunction: verdict.state === "data_state" ? "sales_ops" : STAGE_FUNCTION[id] ?? entry.owner,
      candidateExplanations: entry.investigate.map((i) => `${i} (hypothesis, not established cause)`),
      proposedInvestigation: verdict.state === "data_state"
        ? `Resolve the ${metric.unknownCount} unresolved record(s) before drawing a conclusion.`
        : `${entry.action} Review five progressed and five stalled cases selected by a declared sampling method.`,
      scenario,
      verdict,
    });
  }

  // Team perception gap: shown above PERCEPTION_GAP_CARD_POINTS in either direction. Neutral: neither direction is good by itself.
  const gap = perceptionGap(dataset, filter, now);
  if (gap.gapPoints !== null && gap.band !== "insufficient" && Math.abs(gap.gapPoints) > PERCEPTION_GAP_CARD_POINTS) {
    const entry = libraryEntryByKey("perception_gap");
    const verdict = evaluate(gap.verified, {
      benchmarkId: "pilot_perception_gap",
      metricId: "M10",
      favorableDirection: "contextual",
      target: 0,
      attentionBand: PERCEPTION_GAP_ALIGNED_POINTS / 100,
      minDenominator: PERCEPTION_GAP_MIN_ATTENDED,
      label: "Perception gap (perceived minus verified fit)",
      origin: "pilot_hypothesis",
    });
    const card: PerceptionGapBottleneckCard = {
      cardId: `bn_perception_gap_${gap.perceived.cohortId}`,
      stageId: PERCEPTION_GAP_STAGE_ID,
      cohortId: gap.perceived.cohortId,
      observed: `${perceptionGapObserved(gap)} (${gap.verified.numerator} verified and ${gap.perceived.numerator} perceived of ${gap.coverage.attended} attended).`,
      comparator: `Aligned within ${PERCEPTION_GAP_ALIGNED_POINTS} points; owner card above ${PERCEPTION_GAP_CARD_POINTS}. Neither direction is automatically good.`,
      dataState: gap.perceived.dataState,
      responsibleFunction: "sales_ops",
      candidateExplanations: gap.alternatives.map((a) => `${a} (hypothesis, not established cause)`),
      proposedInvestigation: `${gap.action} Compare criteria across reps on a matched sample selected by a declared sampling method.${entry ? ` ${entry.guardrails[0]}.` : ""}`,
      verdict,
      perception: gap,
    };
    cards.push(card);
  }

  const order: Record<string, number> = { data_state: 0, material_issue: 1, attention: 2 };
  return cards.sort((a, b) => (order[a.verdict.state] ?? 9) - (order[b.verdict.state] ?? 9));
}
