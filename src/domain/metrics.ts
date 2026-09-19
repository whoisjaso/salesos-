/**
 * Metric engine: M01..M21 as MetricPayload from an in-memory Dataset (SOS-02).
 *
 * Invariants:
 * - Every result is a MetricPayload with numerator, denominator, unknownCount,
 *   cohortId, asOf, dataState, definitionVersion "1.0".
 * - Zero denominator -> value null (N/A). Never zero, never 100%.
 * - Team rate = sum(numerators) / sum(denominators).
 * - DQ never leaves the assigned denominator.
 * - Unknown attendance yields bounds and dataState "partial".
 * - `now` is injected. No Date.now() here.
 */
import type {
  AppointmentInstance,
  Assignment,
  Call,
  CommissionEntry,
  CommissionPolicy,
  CommunicationProfile,
  Contact,
  Contract,
  DataState,
  DomainEvent,
  EntryPath,
  FunnelConnector,
  FunnelStage,
  ISODateTime,
  Id,
  LeadSubmission,
  LedgerEntry,
  MetricId,
  MetricPayload,
  Money,
  Offer,
  Opportunity,
  QualificationAssessment,
  RevenueBasis,
  Task,
  Tenant,
  User,
  Appointment,
} from "./types";
import { add, sub, zero, formatMoney } from "./money";
import { evaluate, defaultBenchmarkFor } from "./performance";

export const DEFINITION_VERSION = "1.0";

/** Grace after scheduled end before an instance is considered mature without an explicit flag. */
export const INSTANCE_MATURITY_GRACE_HOURS = 24;

// ---------- Dataset ----------

export interface TrackedWorkHours {
  userId: Id;
  periodStart: ISODateTime;
  periodEnd: ISODateTime;
  hours: number;
  /** false when time coverage is incomplete; M21 is then provisional. */
  coverageComplete: boolean;
}

export interface AttributableCost {
  cohortId?: string;
  label: string;
  amount: Money;
  estimated: boolean;
}

export interface Dataset {
  tenant: Tenant;
  users: User[];
  contacts: Contact[];
  submissions: LeadSubmission[];
  opportunities: Opportunity[];
  assignments: Assignment[];
  tasks: Task[];
  calls: Call[];
  appointments: Appointment[];
  appointmentInstances: AppointmentInstance[];
  assessments: QualificationAssessment[];
  contracts: Contract[];
  ledger: LedgerEntry[];
  commissionPolicy: CommissionPolicy;
  commissionEntries: CommissionEntry[];
  /** Optional extras. */
  offers?: Offer[];
  communicationProfiles?: CommunicationProfile[];
  events?: DomainEvent[];
  trackedWorkHours?: TrackedWorkHours[];
  attributableCosts?: AttributableCost[];
  /** Label everything synthetic. */
  synthetic?: boolean;
}

// ---------- Cohort filter ----------

export interface CohortFilter {
  cohortId?: string;
  /** Attribute opportunities to this user via assignment history (any role unless `role` is set). */
  userId?: Id;
  role?: "setter" | "closer";
  entryPath?: EntryPath;
  leadTier?: number;
  /** Half-open window [from, to) on accountabilityStartedAt. */
  from?: ISODateTime;
  to?: ISODateTime;
  /** Restrict to opportunities whose accountability start + maturity horizon <= now. */
  onlyMatured?: boolean;
  /** Window for activity metrics (scheduled-date cohort, receipt dates). Defaults to from/to. */
  activityFrom?: ISODateTime;
  activityTo?: ISODateTime;
}

export const EMPTY_FILTER: CohortFilter = {};

function ms(iso: ISODateTime): number {
  return Date.parse(iso);
}

function inWindow(iso: ISODateTime, from?: ISODateTime, to?: ISODateTime): boolean {
  const t = ms(iso);
  if (from && t < ms(from)) return false;
  if (to && t >= ms(to)) return false;
  return true;
}

export function cohortIdFor(filter: CohortFilter): string {
  if (filter.cohortId) return filter.cohortId;
  const parts: string[] = ["cohort"];
  if (filter.userId) parts.push(`user=${filter.userId}`);
  if (filter.role) parts.push(`role=${filter.role}`);
  if (filter.entryPath) parts.push(`path=${filter.entryPath}`);
  if (filter.leadTier !== undefined) parts.push(`tier=${filter.leadTier}`);
  if (filter.from || filter.to) parts.push(`start=[${filter.from ?? "-"},${filter.to ?? "-"})`);
  if (filter.onlyMatured) parts.push("matured");
  return parts.length === 1 ? "cohort:all" : parts.join(":");
}

export function cohortLabelFor(filter: CohortFilter): string {
  const bits: string[] = [];
  if (filter.entryPath) bits.push(filter.entryPath.replace("_", " "));
  if (filter.leadTier !== undefined) bits.push(`lead tier ${filter.leadTier}`);
  if (filter.from || filter.to) bits.push(`assigned ${filter.from?.slice(0, 10) ?? "…"} to ${filter.to?.slice(0, 10) ?? "…"}`);
  if (filter.onlyMatured) bits.push("matured only");
  return bits.length ? bits.join(", ") : "all assigned opportunities";
}

// ---------- Selection helpers ----------

export function opportunityMatured(opp: Opportunity, tenant: Tenant, now: ISODateTime): boolean {
  return ms(opp.accountabilityStartedAt) + tenant.maturityHorizonDays * 86_400_000 <= ms(now);
}

export function instanceMatured(inst: AppointmentInstance, now: ISODateTime): boolean {
  if (inst.matured) return true;
  return ms(inst.scheduledEnd) + INSTANCE_MATURITY_GRACE_HOURS * 3_600_000 <= ms(now);
}

/** Attribution by assignment history so reassignments preserve all owners (SOS-03). */
export function opportunityAttributedTo(
  opp: Opportunity,
  assignments: Assignment[],
  userId: Id,
  role?: "setter" | "closer",
): boolean {
  if (!role || opp.currentOwner[role] === userId) {
    if (opp.currentOwner.setter === userId || opp.currentOwner.closer === userId) {
      if (!role || opp.currentOwner[role] === userId) return true;
    }
  }
  return assignments.some(
    (a) => a.opportunityId === opp.opportunityId && a.userId === userId && (!role || a.role === role),
  );
}

export function selectOpportunities(dataset: Dataset, filter: CohortFilter, now: ISODateTime): Opportunity[] {
  return dataset.opportunities.filter((opp) => {
    if (filter.entryPath && opp.entryPath !== filter.entryPath) return false;
    if (filter.leadTier !== undefined && opp.leadTier !== filter.leadTier) return false;
    if (!inWindow(opp.accountabilityStartedAt, filter.from, filter.to)) return false;
    if (filter.onlyMatured && !opportunityMatured(opp, dataset.tenant, now)) return false;
    if (filter.userId && !opportunityAttributedTo(opp, dataset.assignments, filter.userId, filter.role)) return false;
    return true;
  });
}

function idSet(opps: Opportunity[]): Set<Id> {
  return new Set(opps.map((o) => o.opportunityId));
}

/** Eligible instance: not removed before cutoff. Superseded/canceled-before-cutoff leave the denominator. */
export function instanceEligible(inst: AppointmentInstance): boolean {
  return inst.outcome !== "canceled_before_cutoff" && inst.outcome !== "superseded_before_cutoff";
}

export function instancesFor(dataset: Dataset, oppIds: Set<Id>): AppointmentInstance[] {
  return dataset.appointmentInstances.filter((i) => oppIds.has(i.opportunityId));
}

export function attendedOpportunityIds(dataset: Dataset, oppIds: Set<Id>): Set<Id> {
  const out = new Set<Id>();
  for (const inst of dataset.appointmentInstances) {
    if (oppIds.has(inst.opportunityId) && inst.outcome === "attended") out.add(inst.opportunityId);
  }
  return out;
}

export function retainedOpportunityIds(dataset: Dataset, oppIds: Set<Id>): Set<Id> {
  const out = new Set<Id>();
  for (const inst of dataset.appointmentInstances) {
    if (oppIds.has(inst.opportunityId) && inst.retainedAfterReview && instanceEligible(inst)) out.add(inst.opportunityId);
  }
  return out;
}

export function bookedOpportunityIds(dataset: Dataset, oppIds: Set<Id>): Set<Id> {
  const out = new Set<Id>();
  for (const inst of dataset.appointmentInstances) {
    if (oppIds.has(inst.opportunityId)) out.add(inst.opportunityId);
  }
  return out;
}

/** Two-way contact requires verified two-way communication, not voicemail or bot acknowledgment. */
export function twoWayContactOpportunityIds(dataset: Dataset, opps: Opportunity[]): Set<Id> {
  const out = new Set<Id>();
  const ids = idSet(opps);
  for (const opp of opps) if (opp.contactState === "two_way_contact") out.add(opp.opportunityId);
  for (const call of dataset.calls) {
    if (ids.has(call.opportunityId) && call.interpretedOutcome === "meaningful_interaction" && call.outcomeConfirmedBy) {
      out.add(call.opportunityId);
    }
  }
  return out;
}

export function latestAssessmentByOpportunity(dataset: Dataset): Map<Id, QualificationAssessment> {
  const map = new Map<Id, QualificationAssessment>();
  for (const a of dataset.assessments) {
    const existing = map.get(a.opportunityId);
    if (!existing || ms(a.assessedAt) > ms(existing.assessedAt)) map.set(a.opportunityId, a);
  }
  return map;
}

export function perceivedQualifiedIds(dataset: Dataset, oppIds: Set<Id>): { likely: Set<Id>; unrated: Set<Id> } {
  const latest = latestAssessmentByOpportunity(dataset);
  const likely = new Set<Id>();
  const unrated = new Set<Id>();
  for (const id of oppIds) {
    const a = latest.get(id);
    if (!a || a.repPerceivedFit === "unsure") unrated.add(id);
    else if (a.repPerceivedFit === "likely") likely.add(id);
  }
  return { likely, unrated };
}

export function wonOpportunities(opps: Opportunity[]): Opportunity[] {
  return opps.filter((o) => o.commercialStatus === "won");
}

export function ledgerFor(dataset: Dataset, oppIds: Set<Id>): LedgerEntry[] {
  return dataset.ledger.filter((e) => e.opportunityId !== undefined && oppIds.has(e.opportunityId));
}

export function netCollected(entries: LedgerEntry[], currency: string): Money {
  let total = zero(currency);
  for (const e of entries) {
    if (e.passThrough) continue;
    switch (e.kind) {
      case "payment_collected":
      case "dispute_credit":
        total = add(total, e.amount);
        break;
      case "refund":
      case "dispute_debit":
        total = sub(total, e.amount);
        break;
      case "fee":
        break;
    }
  }
  return total;
}

export function contractedValue(dataset: Dataset, oppIds: Set<Id>, currency: string): Money {
  let total = zero(currency);
  for (const c of dataset.contracts) {
    if (oppIds.has(c.opportunityId) && c.state === "signed") total = add(total, c.value);
  }
  return total;
}

// ---------- Payload construction ----------

export interface PayloadInput {
  metricId: MetricId;
  label: string;
  numerator: number;
  denominator: number;
  unknownCount?: number;
  unit: MetricPayload["unit"];
  currency?: string;
  basis?: RevenueBasis;
  cohortId: string;
  timeBasis: string;
  asOf: ISODateTime;
  dataState?: DataState;
  evidenceQueryId?: string;
  bounds?: { lower: number; upper: number };
  refusalReason?: string;
  zeroDenominatorReason?: string;
}

export function buildPayload(input: PayloadInput): MetricPayload {
  const unknownCount = input.unknownCount ?? 0;
  let value: number | null;
  let refusalReason = input.refusalReason;
  let dataState: DataState = input.dataState ?? "complete";
  if (refusalReason) {
    value = null;
  } else if (input.unit === "count") {
    value = input.numerator;
  } else if (input.denominator === 0) {
    value = null;
    refusalReason = input.zeroDenominatorReason ?? "N/A: zero denominator";
    if (dataState === "complete") dataState = "insufficient_sample";
  } else {
    value = input.numerator / input.denominator;
  }
  if (unknownCount > 0 && dataState === "complete") dataState = "partial";
  return {
    metricId: input.metricId,
    definitionVersion: DEFINITION_VERSION,
    label: input.label,
    value,
    numerator: input.numerator,
    denominator: input.denominator,
    unknownCount,
    unit: input.unit,
    currency: input.currency,
    basis: input.basis,
    cohortId: input.cohortId,
    timeBasis: input.timeBasis,
    asOf: input.asOf,
    comparisonStatus: "descriptive_only",
    benchmarkId: null,
    dataState,
    evidenceQueryId: input.evidenceQueryId ?? `query_${input.metricId}_${input.cohortId}`,
    bounds: input.bounds,
    refusalReason,
  };
}

/** Team rate from member payloads: sum(num)/sum(den), never mean of percentages. */
export function pooledRate(parts: MetricPayload[], cohortId: string, asOf: ISODateTime): MetricPayload {
  if (parts.length === 0) throw new Error("pooledRate requires at least one payload");
  const first = parts[0];
  const numerator = parts.reduce((s, p) => s + p.numerator, 0);
  const denominator = parts.reduce((s, p) => s + p.denominator, 0);
  const unknownCount = parts.reduce((s, p) => s + p.unknownCount, 0);
  const worst = parts.map((p) => p.dataState).reduce<DataState>((acc, s) => (s === "complete" ? acc : s), "complete");
  const bounds =
    unknownCount > 0 && denominator > 0
      ? { lower: numerator / denominator, upper: (numerator + unknownCount) / denominator }
      : undefined;
  return buildPayload({
    metricId: first.metricId,
    label: first.label,
    numerator,
    denominator,
    unknownCount,
    unit: first.unit,
    currency: first.currency,
    basis: first.basis,
    cohortId,
    timeBasis: first.timeBasis,
    asOf,
    dataState: worst,
    bounds,
  });
}

// ---------- Individual metrics ----------

const ACC_START = "accountability_started_at";

export function computeM01(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const from = filter.activityFrom ?? filter.from;
  const to = filter.activityTo ?? filter.to;
  const seen = new Set<string>();
  let count = 0;
  for (const s of dataset.submissions) {
    if (!inWindow(s.receivedAt, from, to)) continue;
    if (filter.entryPath && s.entryPath !== filter.entryPath) continue;
    const key = `${s.source}:${s.providerEventId}`;
    if (seen.has(key)) continue; // transport-level replay
    seen.add(key);
    count += 1; // repeated people still count as raw inquiries
  }
  return buildPayload({
    metricId: "M01",
    label: "Raw inquiries",
    numerator: count,
    denominator: 1,
    unit: "count",
    cohortId: cohortIdFor(filter),
    timeBasis: "received_at",
    asOf: now,
  });
}

export function computeM02(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  return buildPayload({
    metricId: "M02",
    label: "Assigned opportunities",
    numerator: opps.length,
    denominator: 1,
    unit: "count",
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
  });
}

export function computeM03(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  let totalSeconds = 0;
  let withAttempt = 0;
  let noAttempt = 0;
  for (const opp of opps) {
    const attempts = dataset.calls
      .filter((c) => c.opportunityId === opp.opportunityId && c.direction === "outbound" && c.startedAt)
      .map((c) => ms(c.startedAt as string));
    if (attempts.length === 0) {
      noAttempt += 1;
      continue;
    }
    const first = Math.min(...attempts);
    totalSeconds += Math.max(0, (first - ms(opp.accountabilityStartedAt)) / 1000);
    withAttempt += 1;
  }
  return buildPayload({
    metricId: "M03",
    label: "First permitted attempt time (mean)",
    numerator: totalSeconds,
    denominator: withAttempt,
    unknownCount: noAttempt,
    unit: "seconds",
    cohortId: cohortIdFor(filter),
    timeBasis: `first_outbound_attempt - ${ACC_START}`,
    asOf: now,
    zeroDenominatorReason: "N/A: no outbound attempts recorded",
  });
}

export function computeM04(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const contacted = twoWayContactOpportunityIds(dataset, opps);
  return buildPayload({
    metricId: "M04",
    label: "Two-way contact rate",
    numerator: contacted.size,
    denominator: opps.length,
    unit: "ratio",
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
    zeroDenominatorReason: "N/A: no assigned opportunities",
  });
}

export function computeM05(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const ids = idSet(opps);
  const booked = bookedOpportunityIds(dataset, ids);
  return buildPayload({
    metricId: "M05",
    label: `Booking rate (denominator: ${cohortLabelFor(filter)})`,
    numerator: booked.size,
    denominator: opps.length,
    unit: "ratio",
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
    zeroDenominatorReason: "N/A: no eligible opportunities",
  });
}

export function computeM06(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const retained = retainedOpportunityIds(dataset, idSet(opps));
  return buildPayload({
    metricId: "M06",
    label: "Retained-booking rate",
    numerator: retained.size,
    denominator: opps.length,
    unit: "ratio",
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
    zeroDenominatorReason: "N/A: no assigned opportunities",
  });
}

/** Pre-call DQ. Contextual: lower is not automatically better. DQ stays in the assigned denominator. */
export function computeM07(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const attended = attendedOpportunityIds(dataset, idSet(opps));
  const dq = opps.filter((o) => o.commercialStatus === "dq" && !attended.has(o.opportunityId));
  return buildPayload({
    metricId: "M07",
    label: "Pre-call DQ rate (contextual)",
    numerator: dq.length,
    denominator: opps.length,
    unit: "ratio",
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
    zeroDenominatorReason: "N/A: no assigned opportunities",
  });
}

/** Show rate on the scheduled-date cohort of eligible matured instances. Unknowns produce bounds. */
export function computeM08(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const from = filter.activityFrom ?? filter.from;
  const to = filter.activityTo ?? filter.to;
  const oppScope = filter.userId || filter.entryPath || filter.leadTier !== undefined
    ? idSet(selectOpportunities(dataset, { ...filter, from: undefined, to: undefined, onlyMatured: false }, now))
    : null;
  let eligible = 0;
  let attended = 0;
  let unknown = 0;
  let immature = 0;
  for (const inst of dataset.appointmentInstances) {
    if (oppScope && !oppScope.has(inst.opportunityId)) continue;
    if (!inWindow(inst.scheduledStart, from, to)) continue;
    if (!instanceEligible(inst)) continue;
    if (!instanceMatured(inst, now)) {
      immature += 1;
      continue;
    }
    eligible += 1;
    if (inst.outcome === "attended") attended += 1;
    else if (inst.outcome === "unknown" || inst.outcome === "scheduled") unknown += 1;
  }
  const bounds = unknown > 0 && eligible > 0 ? { lower: attended / eligible, upper: (attended + unknown) / eligible } : undefined;
  const payload = buildPayload({
    metricId: "M08",
    label: "Appointment show rate",
    numerator: attended,
    denominator: eligible,
    unknownCount: unknown,
    unit: "ratio",
    cohortId: cohortIdFor(filter),
    timeBasis: "scheduled_start",
    asOf: now,
    bounds,
    dataState: unknown > 0 ? "partial" : eligible === 0 && immature > 0 ? "immature" : "complete",
    zeroDenominatorReason: immature > 0 ? "N/A: no matured eligible instances yet" : "N/A: no eligible appointment instances",
  });
  return payload;
}

/** Perceived qualified-show rate. Contextual. Unknown is not No; coverage shown as unknownCount. */
export function computeM09(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const attended = attendedOpportunityIds(dataset, idSet(opps));
  const { likely, unrated } = perceivedQualifiedIds(dataset, attended);
  return buildPayload({
    metricId: "M09",
    label: "Perceived qualified-show rate (rep perception, contextual)",
    numerator: likely.size,
    denominator: attended.size,
    unknownCount: unrated.size,
    unit: "ratio",
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
    zeroDenominatorReason: "N/A: no attended opportunities",
  });
}

export function computeM10(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const attended = attendedOpportunityIds(dataset, idSet(opps));
  let verified = 0;
  let unassessed = 0;
  for (const opp of opps) {
    if (!attended.has(opp.opportunityId)) continue;
    if (opp.fitState === "verified") verified += 1;
    else if (opp.fitState === "unassessed" || opp.fitState === "clarify") unassessed += 1;
  }
  return buildPayload({
    metricId: "M10",
    label: "Verified-fit rate",
    numerator: verified,
    denominator: attended.size,
    unknownCount: unassessed,
    unit: "ratio",
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
    zeroDenominatorReason: "N/A: no attended opportunities",
  });
}

export function computeM11(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const attended = attendedOpportunityIds(dataset, idSet(opps));
  const { likely } = perceivedQualifiedIds(dataset, attended);
  const won = wonOpportunities(opps).filter((o) => likely.has(o.opportunityId));
  return buildPayload({
    metricId: "M11",
    label: "Qualified-to-win rate (perceived qualified definition)",
    numerator: won.length,
    denominator: likely.size,
    unit: "ratio",
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
    zeroDenominatorReason: "N/A: no perceived qualified opportunities",
  });
}

export function computeM12(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const attended = attendedOpportunityIds(dataset, idSet(opps));
  const won = wonOpportunities(opps).filter((o) => attended.has(o.opportunityId));
  return buildPayload({
    metricId: "M12",
    label: "Show-to-win rate",
    numerator: won.length,
    denominator: attended.size,
    unit: "ratio",
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
    zeroDenominatorReason: "N/A: no attended opportunities",
  });
}

export function computeM13(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  return buildPayload({
    metricId: "M13",
    label: "Lead-to-win rate",
    numerator: wonOpportunities(opps).length,
    denominator: opps.length,
    unit: "ratio",
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
    zeroDenominatorReason: "N/A: no assigned opportunities",
  });
}

export function computeM14(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  return buildPayload({
    metricId: "M14",
    label: "Leads per win",
    numerator: opps.length,
    denominator: wonOpportunities(opps).length,
    unit: "ratio",
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
    zeroDenominatorReason: "N/A: no wins",
  });
}

export function computeM15(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const currency = dataset.tenant.reportingCurrency;
  const value = contractedValue(dataset, idSet(opps), currency);
  return buildPayload({
    metricId: "M15",
    label: "Contracted value per lead (not cash)",
    numerator: value.amountMinor,
    denominator: opps.length,
    unit: "ratio_money_per_unit",
    currency,
    basis: "contracted_value",
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
    zeroDenominatorReason: "N/A: no assigned opportunities",
  });
}

export function computeM16(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const currency = dataset.tenant.reportingCurrency;
  const net = netCollected(ledgerFor(dataset, idSet(opps)), currency);
  const unlinked = dataset.ledger.filter((e) => e.opportunityId === undefined).length;
  return buildPayload({
    metricId: "M16",
    label: "Net collected revenue per lead",
    numerator: net.amountMinor,
    denominator: opps.length,
    unknownCount: unlinked,
    unit: "ratio_money_per_unit",
    currency,
    basis: "net_collected_cash",
    cohortId: cohortIdFor(filter),
    timeBasis: `${ACC_START}; cash attributed by opportunity`,
    asOf: now,
    dataState: unlinked > 0 ? "partial" : "complete",
    zeroDenominatorReason: "N/A: no assigned opportunities",
  });
}

export function computeM17(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const ids = idSet(opps);
  const currency = dataset.tenant.reportingCurrency;
  const net = netCollected(ledgerFor(dataset, ids), currency);
  const conversations = dataset.calls.filter(
    (c) => ids.has(c.opportunityId) && c.interpretedOutcome === "meaningful_interaction" && c.outcomeConfirmedBy,
  ).length;
  return buildPayload({
    metricId: "M17",
    label: "Net collected revenue per verified conversation (repeat conversations counted)",
    numerator: net.amountMinor,
    denominator: conversations,
    unit: "ratio_money_per_unit",
    currency,
    basis: "net_collected_cash",
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
    zeroDenominatorReason: "N/A: no verified live conversations",
  });
}

export function computeM18(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const currency = dataset.tenant.reportingCurrency;
  const cohortId = cohortIdFor(filter);
  const costs = (dataset.attributableCosts ?? []).filter((c) => !c.cohortId || c.cohortId === cohortId);
  if (costs.length === 0) {
    return buildPayload({
      metricId: "M18",
      label: "Contribution per lead",
      numerator: 0,
      denominator: opps.length,
      unit: "ratio_money_per_unit",
      currency,
      basis: "net_collected_cash",
      cohortId,
      timeBasis: ACC_START,
      asOf: now,
      dataState: "unknown",
      refusalReason: "No attributable cost data supplied; contribution cannot be computed",
    });
  }
  let net = netCollected(ledgerFor(dataset, idSet(opps)), currency);
  for (const c of costs) net = sub(net, c.amount);
  const estimated = costs.some((c) => c.estimated);
  return buildPayload({
    metricId: "M18",
    label: `Contribution per lead (costs: ${costs.map((c) => c.label).join(", ")}${estimated ? "; some estimated" : ""})`,
    numerator: net.amountMinor,
    denominator: opps.length,
    unit: "ratio_money_per_unit",
    currency,
    basis: "net_collected_cash",
    cohortId,
    timeBasis: ACC_START,
    asOf: now,
    dataState: estimated ? "partial" : "complete",
    zeroDenominatorReason: "N/A: no assigned opportunities",
  });
}

const ELIGIBLE_COMMISSION_STATES: CommissionEntry["state"][] = ["accrued", "payable", "paid"];

function commissionFor(dataset: Dataset, oppIds: Set<Id>, userId: Id | undefined, currency: string): Money {
  let total = zero(currency);
  for (const e of dataset.commissionEntries) {
    if (!oppIds.has(e.opportunityId)) continue;
    if (userId && e.userId !== userId) continue;
    if (!ELIGIBLE_COMMISSION_STATES.includes(e.state)) continue;
    total = add(total, e.amount);
  }
  return total;
}

/** Commission per attended appointment instance. Not an hourly rate. */
export function computeM19(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const ids = idSet(opps);
  const currency = dataset.tenant.reportingCurrency;
  const commission = commissionFor(dataset, ids, filter.userId, currency);
  const attendedInstances = dataset.appointmentInstances.filter(
    (i) => ids.has(i.opportunityId) && i.outcome === "attended",
  ).length;
  return buildPayload({
    metricId: "M19",
    label: `Commission per attended appointment (policy ${dataset.commissionPolicy.policyVersion}${dataset.commissionPolicy.hypothetical ? ", hypothetical" : ""}; not an hourly rate)`,
    numerator: commission.amountMinor,
    denominator: attendedInstances,
    unit: "ratio_money_per_unit",
    currency,
    basis: dataset.commissionPolicy.basis,
    cohortId: cohortIdFor(filter),
    timeBasis: ACC_START,
    asOf: now,
    zeroDenominatorReason: "N/A: no attended appointment instances",
  });
}

export function computeM20(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const ids = idSet(opps);
  const currency = dataset.tenant.reportingCurrency;
  const commission = commissionFor(dataset, ids, filter.userId, currency);
  let seconds = 0;
  let unmeasured = 0;
  for (const c of dataset.calls) {
    if (!ids.has(c.opportunityId)) continue;
    if (filter.userId && c.userId !== filter.userId) continue;
    if (c.transportState !== "ended" && c.transportState !== "connected") continue;
    if (c.durationSeconds === undefined) {
      unmeasured += 1;
      continue;
    }
    seconds += c.durationSeconds;
  }
  const hours = seconds / 3600;
  return buildPayload({
    metricId: "M20",
    label: "Commission per live-call hour",
    numerator: commission.amountMinor,
    denominator: hours,
    unknownCount: unmeasured,
    unit: "ratio_money_per_unit",
    currency,
    basis: dataset.commissionPolicy.basis,
    cohortId: cohortIdFor(filter),
    timeBasis: "measured call duration",
    asOf: now,
    zeroDenominatorReason: "N/A: no measured live-call time",
  });
}

export function computeM21(dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  const opps = selectOpportunities(dataset, filter, now);
  const ids = idSet(opps);
  const currency = dataset.tenant.reportingCurrency;
  const commission = commissionFor(dataset, ids, filter.userId, currency);
  const tracked = (dataset.trackedWorkHours ?? []).filter((t) => !filter.userId || t.userId === filter.userId);
  const hours = tracked.reduce((s, t) => s + t.hours, 0);
  const incomplete = tracked.some((t) => !t.coverageComplete) || tracked.length === 0;
  return buildPayload({
    metricId: "M21",
    label: "Commission per tracked work hour",
    numerator: commission.amountMinor,
    denominator: hours,
    unknownCount: tracked.filter((t) => !t.coverageComplete).length,
    unit: "ratio_money_per_unit",
    currency,
    basis: dataset.commissionPolicy.basis,
    cohortId: cohortIdFor(filter),
    timeBasis: "tracked work hours",
    asOf: now,
    dataState: tracked.length === 0 ? "unknown" : incomplete ? "partial" : "complete",
    zeroDenominatorReason: "N/A: no tracked work hours",
  });
}

export type MetricComputer = (dataset: Dataset, filter: CohortFilter, now: ISODateTime) => MetricPayload;

export const METRIC_COMPUTERS: Record<MetricId, MetricComputer> = {
  M01: computeM01,
  M02: computeM02,
  M03: computeM03,
  M04: computeM04,
  M05: computeM05,
  M06: computeM06,
  M07: computeM07,
  M08: computeM08,
  M09: computeM09,
  M10: computeM10,
  M11: computeM11,
  M12: computeM12,
  M13: computeM13,
  M14: computeM14,
  M15: computeM15,
  M16: computeM16,
  M17: computeM17,
  M18: computeM18,
  M19: computeM19,
  M20: computeM20,
  M21: computeM21,
};

export function computeMetric(id: MetricId, dataset: Dataset, filter: CohortFilter, now: ISODateTime): MetricPayload {
  return METRIC_COMPUTERS[id](dataset, filter, now);
}

export function computeAllMetrics(
  dataset: Dataset,
  filter: CohortFilter,
  now: ISODateTime,
): Record<MetricId, MetricPayload> {
  const out = {} as Record<MetricId, MetricPayload>;
  for (const id of Object.keys(METRIC_COMPUTERS) as MetricId[]) out[id] = METRIC_COMPUTERS[id](dataset, filter, now);
  return out;
}

/** Team rate for a metric across member users: pooled numerator / pooled denominator. */
export function computeTeamRate(
  id: MetricId,
  dataset: Dataset,
  memberUserIds: Id[],
  baseFilter: CohortFilter,
  now: ISODateTime,
): MetricPayload {
  const parts = memberUserIds.map((userId) => computeMetric(id, dataset, { ...baseFilter, userId }, now));
  return pooledRate(parts, `${cohortIdFor(baseFilter)}:team`, now);
}

// ---------- Funnel (SOS-20) ----------

export type FunnelStageId =
  | "assigned"
  | "two_way_contact"
  | "retained_booking"
  | "attended"
  | "perceived_qualified"
  | "won"
  | "net_collected_cash";

export interface Funnel {
  stages: FunnelStage[];
  connectors: FunnelConnector[];
  cohortId: string;
  asOf: ISODateTime;
}

/**
 * Operational workflow funnel. Connector rates render only when the numerator
 * stage's parentStageId equals the from stage; otherwise the connector metric
 * is null with a refusalReason and the UI renders a split path.
 *
 * Parent rules: retained_booking's parent is two_way_contact only for the
 * form_entry path (setter must reach the customer before booking). For a mixed
 * or booked_entry cohort a booking can precede a conversation, so the parent is
 * assigned and the two_way_contact -> retained_booking connector is refused.
 */
export function computeFunnel(dataset: Dataset, cohortFilter: CohortFilter, now: ISODateTime): Funnel {
  const opps = selectOpportunities(dataset, cohortFilter, now);
  const ids = idSet(opps);
  const cohortId = cohortIdFor(cohortFilter);
  const cohortLabel = cohortLabelFor(cohortFilter);
  const currency = dataset.tenant.reportingCurrency;

  const contacted = twoWayContactOpportunityIds(dataset, opps);
  const retained = retainedOpportunityIds(dataset, ids);
  const attended = attendedOpportunityIds(dataset, ids);
  const { likely, unrated } = perceivedQualifiedIds(dataset, attended);
  const won = wonOpportunities(opps);
  const wonIds = idSet(won);
  const wonWithoutRating = won.filter((o) => !likely.has(o.opportunityId)).length;

  const unresolvedInstances = dataset.appointmentInstances.filter(
    (i) => ids.has(i.opportunityId) && instanceEligible(i) && instanceMatured(i, now) && (i.outcome === "unknown" || i.outcome === "scheduled"),
  );
  const unresolvedOppIds = new Set(unresolvedInstances.map((i) => i.opportunityId));

  const ledger = ledgerFor(dataset, ids);
  const net = netCollected(ledger, currency);
  const collectedOppIds = new Set<Id>();
  for (const oppId of wonIds) {
    const n = netCollected(ledger.filter((e) => e.opportunityId === oppId), currency);
    if (n.amountMinor > 0) collectedOppIds.add(oppId);
  }
  const unlinked = dataset.ledger.filter((e) => e.opportunityId === undefined).length;

  const retainedParent: FunnelStageId = cohortFilter.entryPath === "form_entry" ? "two_way_contact" : "assigned";

  const stages: FunnelStage[] = [
    {
      stageId: "assigned",
      label: "Assigned opportunities",
      count: opps.length,
      metricId: "M02",
      dataState: "complete",
      cohortLabel,
      supportingText: `${opps.length} accountable opportunities; DQ remains in this denominator`,
    },
    {
      stageId: "two_way_contact",
      label: "Two-way contact",
      count: contacted.size,
      parentStageId: "assigned",
      metricId: "M04",
      dataState: "complete",
      cohortLabel,
      supportingText: `${contacted.size} contacted / ${opps.length} assigned`,
    },
    {
      stageId: "retained_booking",
      label: "Retained bookings",
      count: retained.size,
      parentStageId: retainedParent,
      metricId: "M06",
      dataState: "complete",
      cohortLabel,
      supportingText: `${retained.size} retained bookings / ${opps.length} assigned (bookings, not conversations)`,
    },
    {
      stageId: "attended",
      label: "Attended",
      count: attended.size,
      unknownCount: unresolvedOppIds.size,
      parentStageId: "retained_booking",
      metricId: "M08",
      dataState: unresolvedOppIds.size > 0 ? "partial" : "complete",
      cohortLabel,
      supportingText: `${attended.size} attended / ${retained.size} retained bookings${unresolvedOppIds.size ? `; ${unresolvedOppIds.size} unresolved attendance` : ""}`,
    },
    {
      stageId: "perceived_qualified",
      label: "Perceived qualified",
      count: likely.size,
      unknownCount: unrated.size,
      parentStageId: "attended",
      metricId: "M09",
      dataState: unrated.size > 0 ? "partial" : "complete",
      cohortLabel,
      supportingText: `${likely.size} rep-perceived qualified / ${attended.size} attended${unrated.size ? `; ${unrated.size} unrated (unknown is not No)` : ""}`,
    },
    {
      stageId: "won",
      label: "Won",
      count: won.length,
      unknownCount: wonWithoutRating,
      parentStageId: "perceived_qualified",
      metricId: "M11",
      dataState: wonWithoutRating > 0 ? "partial" : "complete",
      cohortLabel,
      supportingText: `${won.length} won${wonWithoutRating ? `; ${wonWithoutRating} without a perceived-fit rating` : ""}`,
    },
    {
      stageId: "net_collected_cash",
      label: "Net collected cash",
      count: collectedOppIds.size,
      unknownCount: unlinked,
      parentStageId: "won",
      metricId: "M16",
      dataState: unlinked > 0 ? "partial" : "complete",
      cohortLabel,
      supportingText: `${formatMoney(net)} net collected cash from ${collectedOppIds.size} of ${won.length} won${unlinked ? `; ${unlinked} unlinked payment(s) in exception queue` : ""}`,
      money: net,
      basis: "net_collected_cash",
    },
  ];

  const connectorMetric = (from: FunnelStage, to: FunnelStage): MetricPayload | null => {
    if (to.parentStageId !== from.stageId) return null;
    const numerator = to.stageId === "won" ? won.filter((o) => likely.has(o.opportunityId)).length : to.count;
    return buildPayload({
      metricId: to.metricId ?? "M02",
      label: `${to.label} / ${from.label}`,
      numerator,
      denominator: from.count,
      unknownCount: to.unknownCount ?? 0,
      unit: "ratio",
      cohortId,
      timeBasis: ACC_START,
      asOf: now,
      dataState: to.dataState,
      bounds:
        to.unknownCount && from.count > 0
          ? { lower: numerator / from.count, upper: Math.min(1, (numerator + to.unknownCount) / from.count) }
          : undefined,
      zeroDenominatorReason: `N/A: no ${from.label.toLowerCase()}`,
    });
  };

  const connectors: FunnelConnector[] = [];
  for (let i = 0; i < stages.length - 1; i += 1) {
    const from = stages[i];
    const to = stages[i + 1];
    const metric = connectorMetric(from, to);
    if (metric === null) {
      connectors.push({
        fromStageId: from.stageId,
        toStageId: to.stageId,
        metric: null,
        verdict: {
          state: "neutral_no_benchmark",
          label: "Split path",
          explanation: `${to.label} is not a subset of ${from.label} in this cohort (parent stage is ${to.parentStageId}); showing counts separately instead of a rate.`,
        },
      });
      continue;
    }
    const refused = to.parentStageId !== from.stageId;
    if (refused) metric.refusalReason = `numerator stage parent is ${to.parentStageId}, not ${from.stageId}`;
    connectors.push({
      fromStageId: from.stageId,
      toStageId: to.stageId,
      metric,
      verdict: evaluate(metric, defaultBenchmarkFor(metric.metricId)),
    });
  }

  return { stages, connectors, cohortId, asOf: now };
}
