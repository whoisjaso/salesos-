/**
 * Owner dashboard view model (SOS-21 hierarchy: trust, economics, flow,
 * capacity, decision). Pure helpers over the domain layer. The server computes
 * one CohortView per entry path x lead tier combination so the client can
 * switch cohorts without re-running the domain.
 */
import type {
  AppointmentInstance,
  BottleneckCard,
  FunnelConnector,
  FunnelStage,
  ISODateTime,
  Id,
  LedgerEntry,
  MetricPayload,
  PerformanceVerdict,
  RevenueBasis,
} from "@/domain/types";
import {
  type CohortFilter,
  type Dataset,
  DEFINITION_VERSION,
  cohortIdFor,
  cohortLabelFor,
  computeFunnel,
  computeMetric,
  contractedValue,
  instanceEligible,
  instanceMatured,
  ledgerFor,
  netCollected,
  opportunityMatured,
  selectOpportunities,
} from "@/domain/metrics";
import { evaluate, defaultBenchmarkFor } from "@/domain/performance";
import { PERCEPTION_GAP_STAGE_ID, buildBottleneckCards, isPerceptionGapCard, type PerceptionGap } from "@/domain/coaching";
import { DEFAULT_CAPACITY_POLICY, estimateLoad, type CapacityPolicy } from "@/domain/routing";
import { playerState } from "@/domain/game";
import { formatAsOf, formatMoneyMinor, formatRelativeTime } from "@/lib/format";

// ---------- Cohort keys ----------

export type PathKey = "all" | "form" | "booked";
export type TierKey = "all" | "1" | "2" | "3";

export interface CohortKey {
  path: PathKey;
  tier: TierKey;
}

export const PATH_OPTIONS: { id: PathKey; label: string }[] = [
  { id: "all", label: "All" },
  { id: "form", label: "Form" },
  { id: "booked", label: "Booked" },
];

export const TIER_OPTIONS: { id: TierKey; label: string }[] = [
  { id: "all", label: "All" },
  { id: "1", label: "1" },
  { id: "2", label: "2" },
  { id: "3", label: "3" },
];

export function cohortKeyId(key: CohortKey): string {
  return `${key.path}|${key.tier}`;
}

export function filterFor(key: CohortKey): CohortFilter {
  const filter: CohortFilter = {};
  if (key.path === "form") filter.entryPath = "form_entry";
  if (key.path === "booked") filter.entryPath = "booked_entry";
  if (key.tier !== "all") filter.leadTier = Number(key.tier);
  return filter;
}

// ---------- Trust layer ----------

export type TrustSeverity = "info" | "warning" | "critical";

export interface TrustRecord {
  id: string;
  text: string;
}

export interface TrustItem {
  id: "freshness" | "attendance" | "unlinked" | "immature";
  severity: TrustSeverity;
  /** Chip text, a few words. */
  label: string;
  /** Phone text: the count or age only. */
  short: string;
  /** Sheet title. */
  title: string;
  /** One sentence: which decisions this touches. */
  affected: string;
  records: TrustRecord[];
}

function ms(iso: ISODateTime): number {
  return Date.parse(iso);
}

function contactName(dataset: Dataset, contactId: Id): string {
  return dataset.contacts.find((c) => c.contactId === contactId)?.displayName ?? contactId;
}

function oppContactName(dataset: Dataset, opportunityId: Id): string {
  const opp = dataset.opportunities.find((o) => o.opportunityId === opportunityId);
  return opp ? contactName(dataset, opp.primaryContactId) : opportunityId;
}

export function buildTrustItems(dataset: Dataset, now: ISODateTime): TrustItem[] {
  const items: TrustItem[] = [];

  // Freshness: latest receipt across every feed.
  const feeds: { id: string; label: string; latest: number }[] = [
    { id: "submissions", label: "Lead intake", latest: Math.max(-Infinity, ...dataset.submissions.map((s) => ms(s.receivedAt))) },
    { id: "ledger", label: "Payments ledger", latest: Math.max(-Infinity, ...dataset.ledger.map((e) => ms(e.receivedAt))) },
    { id: "calls", label: "Call provider", latest: Math.max(-Infinity, ...dataset.calls.map((c) => ms(c.endedAt ?? c.startedAt ?? "")).filter((n) => !Number.isNaN(n))) },
  ];
  if (dataset.events && dataset.events.length > 0) {
    feeds.push({ id: "events", label: "Event log", latest: Math.max(...dataset.events.map((e) => ms(e.receivedAt))) });
  }
  const latest = Math.max(...feeds.map((f) => f.latest).filter(Number.isFinite));
  if (Number.isFinite(latest)) {
    const ageMinutes = (ms(now) - latest) / 60_000;
    const severity: TrustSeverity = ageMinutes <= 60 ? "info" : ageMinutes <= 24 * 60 ? "warning" : "critical";
    items.push({
      id: "freshness",
      severity,
      label: `Updated ${formatRelativeTime(new Date(latest).toISOString(), now)}`,
      short: ageMinutes < 60 ? `${Math.round(ageMinutes)}m` : ageMinutes < 24 * 60 ? `${Math.round(ageMinutes / 60)}h` : `${Math.round(ageMinutes / 1440)}d`,
      title: "Data freshness",
      affected: severity === "info" ? "All feeds reported within the last hour." : "Rates and rankings use the last received record; recent activity may be missing.",
      records: feeds
        .filter((f) => Number.isFinite(f.latest))
        .map((f) => ({ id: f.id, text: `${f.label}: latest ${formatAsOf(new Date(f.latest).toISOString())}` })),
    });
  }

  // Unresolved attendance on matured, eligible instances.
  const unresolved = dataset.appointmentInstances.filter(
    (i) => instanceEligible(i) && instanceMatured(i, now) && (i.outcome === "unknown" || i.outcome === "scheduled"),
  );
  if (unresolved.length > 0) {
    items.push({
      id: "attendance",
      severity: "warning",
      label: `${unresolved.length} unresolved attendance`,
      short: String(unresolved.length),
      title: "Unresolved attendance",
      affected: "Show rate is a bound until these matured appointments have attendance evidence.",
      records: unresolved.map((i) => ({
        id: i.instanceId,
        text: `${oppContactName(dataset, i.opportunityId)}, scheduled ${formatAsOf(i.scheduledStart)}, outcome ${i.outcome}`,
      })),
    });
  }

  // Unlinked payments (exception queue).
  const unlinked = dataset.ledger.filter((e) => e.opportunityId === undefined);
  if (unlinked.length > 0) {
    items.push({
      id: "unlinked",
      severity: "critical",
      label: `${unlinked.length} unlinked ${unlinked.length === 1 ? "payment" : "payments"}`,
      short: String(unlinked.length),
      title: "Unlinked payments",
      affected: "Net collected cash is unreconciled until each payment maps to an opportunity.",
      records: unlinked.map((e) => ({
        id: e.entryId,
        text: `${formatMoneyMinor(e.amount.amountMinor, e.amount.currency)} ${e.kind.replace("_", " ")}, ref ${e.providerRef}, ${formatAsOf(e.occurredAt)}`,
      })),
    });
  }

  // Immature cohort share.
  const opps = dataset.opportunities;
  const immature = opps.filter((o) => !opportunityMatured(o, dataset.tenant, now));
  if (immature.length > 0) {
    const horizon = dataset.tenant.maturityHorizonDays;
    items.push({
      id: "immature",
      severity: "info",
      label: `${immature.length} of ${opps.length} immature`,
      short: String(immature.length),
      title: "Immature cohort",
      affected: `Assigned within the last ${horizon} days. Their outcomes are provisional, not zero.`,
      records: immature.map((o) => ({
        id: o.opportunityId,
        text: `${contactName(dataset, o.primaryContactId)}, assigned ${formatAsOf(o.accountabilityStartedAt)}, matures ${formatAsOf(
          new Date(ms(o.accountabilityStartedAt) + horizon * 86_400_000).toISOString(),
        )}`,
      })),
    });
  }

  return items;
}

// ---------- Economics ----------

export interface EconomicsView {
  netCollected: MetricPayload;
  contracted: MetricPayload;
  outstanding: MetricPayload;
  refunds: MetricPayload;
  refundCount: number;
  /** M16, the primary efficiency metric. */
  perOpportunity: MetricPayload;
  perOpportunityVerdict: PerformanceVerdict;
}

interface MoneyPayloadInput {
  metricId: MetricPayload["metricId"];
  label: string;
  amountMinor: number;
  denominator: number;
  currency: string;
  basis: RevenueBasis;
  cohortId: string;
  timeBasis: string;
  asOf: ISODateTime;
  dataState?: MetricPayload["dataState"];
  unknownCount?: number;
  evidenceQueryId: string;
}

/** A money total. Value is the amount itself, never amount / denominator. */
function moneyPayload(input: MoneyPayloadInput): MetricPayload {
  return {
    metricId: input.metricId,
    definitionVersion: DEFINITION_VERSION,
    label: input.label,
    value: input.amountMinor,
    numerator: input.amountMinor,
    denominator: input.denominator,
    unknownCount: input.unknownCount ?? 0,
    unit: "money_minor",
    currency: input.currency,
    basis: input.basis,
    cohortId: input.cohortId,
    timeBasis: input.timeBasis,
    asOf: input.asOf,
    comparisonStatus: "descriptive_only",
    benchmarkId: null,
    dataState: input.dataState ?? "complete",
    evidenceQueryId: input.evidenceQueryId,
  };
}

function isRefundLike(e: LedgerEntry): boolean {
  return e.kind === "refund" || e.kind === "dispute_debit";
}

export function buildEconomics(dataset: Dataset, filter: CohortFilter, now: ISODateTime): EconomicsView {
  const currency = dataset.tenant.reportingCurrency;
  const opps = selectOpportunities(dataset, filter, now);
  const ids = new Set(opps.map((o) => o.opportunityId));
  const cohortId = cohortIdFor(filter);
  const ledger = ledgerFor(dataset, ids);
  const net = netCollected(ledger, currency);
  const contracted = contractedValue(dataset, ids, currency);
  const unlinked = dataset.ledger.filter((e) => e.opportunityId === undefined).length;
  const refundEntries = ledger.filter(isRefundLike);
  const refundMinor = refundEntries.reduce((s, e) => s + e.amount.amountMinor, 0);
  const signedContracts = dataset.contracts.filter((c) => ids.has(c.opportunityId) && c.state === "signed").length;
  const perOpportunity = computeMetric("M16", dataset, filter, now);

  return {
    netCollected: moneyPayload({
      metricId: "M16",
      label: "Net collected cash",
      amountMinor: net.amountMinor,
      denominator: opps.length,
      currency,
      basis: "net_collected_cash",
      cohortId,
      timeBasis: "ledger entries attributed by opportunity; refunds and disputes subtracted",
      asOf: now,
      dataState: unlinked > 0 ? "partial" : "complete",
      unknownCount: unlinked,
      evidenceQueryId: `query_net_collected_${cohortId}`,
    }),
    contracted: moneyPayload({
      metricId: "M15",
      label: "Contracted value",
      amountMinor: contracted.amountMinor,
      denominator: signedContracts,
      currency,
      basis: "contracted_value",
      cohortId,
      timeBasis: "signed contracts; not cash",
      asOf: now,
      evidenceQueryId: `query_contracted_${cohortId}`,
    }),
    outstanding: moneyPayload({
      metricId: "M15",
      label: "Outstanding",
      amountMinor: contracted.amountMinor - net.amountMinor,
      denominator: signedContracts,
      currency,
      basis: "contracted_value",
      cohortId,
      timeBasis: "contracted value minus net collected cash",
      asOf: now,
      dataState: unlinked > 0 ? "partial" : "complete",
      unknownCount: unlinked,
      evidenceQueryId: `query_outstanding_${cohortId}`,
    }),
    refunds: moneyPayload({
      metricId: "M16",
      label: "Refunds and disputes",
      amountMinor: refundMinor,
      denominator: refundEntries.length,
      currency,
      basis: "net_collected_cash",
      cohortId,
      timeBasis: "refund and dispute debit entries; restate the original cohort",
      asOf: now,
      evidenceQueryId: `query_refunds_${cohortId}`,
    }),
    refundCount: refundEntries.length,
    perOpportunity,
    perOpportunityVerdict: {
      state: "neutral_no_benchmark",
      label: "Descriptive",
      explanation: "Primary efficiency measure. Net collected cash over every assigned opportunity, DQ included. No target until the cash basis is reconciled.",
    },
  };
}

// ---------- Flow ----------

export interface FlowView {
  stages: FunnelStage[];
  connectors: FunnelConnector[];
  stageVerdicts: Record<string, PerformanceVerdict>;
  stageMetrics: Record<string, MetricPayload>;
  moneyStages: Record<string, { currency: string; basis: RevenueBasis }>;
}

/**
 * computeFunnel() reports the money stage's `count` as the number of collected
 * opportunities and carries the amount in `money`. FunnelCard's money mode
 * formats `count` as minor units, so the count is swapped for the amount here.
 */
export function buildFlow(dataset: Dataset, filter: CohortFilter, now: ISODateTime): FlowView {
  const funnel = computeFunnel(dataset, filter, now);
  const stageMetrics: Record<string, MetricPayload> = {};
  const stageVerdicts: Record<string, PerformanceVerdict> = {};
  const moneyStages: FlowView["moneyStages"] = {};

  const stages = funnel.stages.map((stage) => {
    if (stage.metricId) stageMetrics[stage.stageId] = computeMetric(stage.metricId, dataset, filter, now);
    if (stage.money && stage.basis) {
      moneyStages[stage.stageId] = { currency: stage.money.currency, basis: stage.basis };
      return { ...stage, count: stage.money.amountMinor };
    }
    return stage;
  });

  // A stage carries its own verdict only when the incoming connector is a split
  // path, so the benchmarked rate against the assigned denominator is still visible.
  for (const connector of funnel.connectors) {
    if (connector.metric !== null) continue;
    const stage = stages.find((s) => s.stageId === connector.toStageId);
    const metric = stage ? stageMetrics[stage.stageId] : undefined;
    const benchmark = stage?.metricId ? defaultBenchmarkFor(stage.metricId) : undefined;
    if (stage && metric && benchmark) stageVerdicts[stage.stageId] = evaluate(metric, benchmark);
  }

  return { stages, connectors: funnel.connectors, stageVerdicts, stageMetrics, moneyStages };
}

// ---------- Capacity ----------

export interface CapacityRow {
  userId: Id;
  name: string;
  role: "setter" | "closer";
  upcomingInstances: number;
  openTasks: number;
  totalMinutes: number;
  availableMinutes: number;
  /** totalMinutes / availableMinutes, uncapped. */
  loadRatio: number;
  explanation: string;
}

/** Seven-day window; available minutes scale the 24h pilot policy to five selling days. */
export const CAPACITY_WINDOW_POLICY: CapacityPolicy = {
  ...DEFAULT_CAPACITY_POLICY,
  windowHours: 7 * 24,
  availableMinutes: DEFAULT_CAPACITY_POLICY.availableMinutes * 5,
};

export function buildCapacity(dataset: Dataset, now: ISODateTime, policy: CapacityPolicy = CAPACITY_WINDOW_POLICY): CapacityRow[] {
  const repByAppointment = new Map<Id, Id>();
  for (const a of dataset.appointments) repByAppointment.set(a.appointmentId, a.repUserId);
  const instancesByUser = new Map<Id, AppointmentInstance[]>();
  for (const inst of dataset.appointmentInstances) {
    const rep = repByAppointment.get(inst.appointmentId);
    if (!rep) continue;
    const list = instancesByUser.get(rep) ?? [];
    list.push(inst);
    instancesByUser.set(rep, list);
  }

  const rows: CapacityRow[] = [];
  for (const user of dataset.users) {
    if (!user.active) continue;
    const role = user.roles.includes("closer") ? "closer" : user.roles.includes("setter") ? "setter" : null;
    if (!role) continue;
    const load = estimateLoad(user, instancesByUser.get(user.userId) ?? [], dataset.tasks, now, policy);
    rows.push({
      userId: user.userId,
      name: user.displayName,
      role,
      upcomingInstances: load.upcomingAppointments,
      openTasks: load.openTasks,
      totalMinutes: load.totalMinutes,
      availableMinutes: load.availableMinutes,
      loadRatio: load.availableMinutes > 0 ? load.totalMinutes / load.availableMinutes : 0,
      explanation: load.explanation,
    });
  }
  // Closers first, then setters. Order within a role follows the user list, not a rank.
  return rows.sort((a, b) => (a.role === b.role ? 0 : a.role === "closer" ? -1 : 1));
}

// ---------- Team progression (SOS-15) ----------

export interface PlayerRow {
  userId: Id;
  name: string;
  role: "setter" | "closer";
  level: number;
  /** 0..1 within the current level. */
  progress: number;
  xp: number;
  streakDays: number;
  /** Quality gate paused the mechanic (opt-out, refund, dispute under review). */
  paused: boolean;
}

/** Calendar month containing `now`, UTC. Seasons reset the display, not history. */
export function seasonFor(now: ISODateTime): { from: ISODateTime; to: ISODateTime; label: string } {
  const d = new Date(now);
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(from);
  return { from: from.toISOString(), to: to.toISOString(), label };
}

export function buildPlayers(dataset: Dataset, now: ISODateTime): PlayerRow[] {
  const season = seasonFor(now);
  const rows: PlayerRow[] = [];
  for (const user of dataset.users) {
    if (!user.active) continue;
    const role = user.roles.includes("closer") ? "closer" : user.roles.includes("setter") ? "setter" : null;
    if (!role) continue;
    const state = playerState(dataset, user.userId, now, season);
    rows.push({
      userId: user.userId,
      name: user.displayName,
      role,
      level: state.commercial.level,
      progress: state.commercial.progress,
      xp: state.commercial.xp,
      streakDays: state.streakDays,
      paused: state.gate.paused,
    });
  }
  return rows.sort((a, b) => (a.role === b.role ? 0 : a.role === "closer" ? -1 : 1));
}

// ---------- Decision layer ----------

export const STAGE_LABEL: Record<string, string> = {
  first_attempt: "First attempt",
  two_way_contact: "Two-way contact",
  retained_booking: "Retained bookings",
  attended: "Attendance",
  perceived_qualified: "Perceived qualified",
  won: "Won",
  net_collected_cash: "Net collected cash",
  [PERCEPTION_GAP_STAGE_ID]: "Perception gap",
};

/** The two rates behind a perception gap card, passed through untouched; undefined for every other card. */
export function perceptionGapOf(card: BottleneckCard): PerceptionGap | undefined {
  return isPerceptionGapCard(card) ? card.perception : undefined;
}

export const OWNER_FUNCTION_LABEL: Record<BottleneckCard["responsibleFunction"], string> = {
  rep: "Rep",
  marketing: "Marketing",
  sales_ops: "Sales ops",
  product: "Product",
  finance: "Finance",
  delivery: "Delivery",
};

// ---------- Assembly ----------

export interface CohortView {
  key: string;
  label: string;
  assigned: number;
  economics: EconomicsView;
  flow: FlowView;
  cards: BottleneckCard[];
}

export interface OwnerView {
  asOf: ISODateTime;
  synthetic: boolean;
  trust: TrustItem[];
  capacity: CapacityRow[];
  players: PlayerRow[];
  seasonLabel: string;
  cohorts: Record<string, CohortView>;
}

export function buildCohortView(dataset: Dataset, key: CohortKey, now: ISODateTime): CohortView {
  const filter = filterFor(key);
  return {
    key: cohortKeyId(key),
    label: cohortLabelFor(filter),
    assigned: selectOpportunities(dataset, filter, now).length,
    economics: buildEconomics(dataset, filter, now),
    flow: buildFlow(dataset, filter, now),
    cards: buildBottleneckCards(dataset, now, filter),
  };
}

export function buildOwnerView(dataset: Dataset, now: ISODateTime): OwnerView {
  const cohorts: Record<string, CohortView> = {};
  for (const path of PATH_OPTIONS) {
    for (const tier of TIER_OPTIONS) {
      const key = { path: path.id, tier: tier.id };
      cohorts[cohortKeyId(key)] = buildCohortView(dataset, key, now);
    }
  }
  return {
    asOf: now,
    synthetic: dataset.synthetic ?? false,
    trust: buildTrustItems(dataset, now),
    capacity: buildCapacity(dataset, now),
    players: buildPlayers(dataset, now),
    seasonLabel: seasonFor(now).label,
    cohorts,
  };
}
