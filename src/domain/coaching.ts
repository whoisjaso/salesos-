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
import { type CohortFilter, type Dataset, computeMetric, ledgerFor, netCollected, selectOpportunities, wonOpportunities } from "./metrics";
import { defaultBenchmarkFor, evaluate } from "./performance";
import { formatMoney, formatPercent, money, scale } from "./money";

export const COACHING_ENGINE_VERSION = "rules-1.0";

// ---------- Stage-to-action library (SOS-16) ----------

export interface StageAction {
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

  const order: Record<string, number> = { data_state: 0, material_issue: 1, attention: 2 };
  return cards.sort((a, b) => (order[a.verdict.state] ?? 9) - (order[b.verdict.state] ?? 9));
}
