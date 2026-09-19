/**
 * Leaderboards (SOS-14): three views with defensible denominators.
 * - economic_output: total eligible revenue on the declared basis and raw RPL. Not a skill ranking.
 * - comparable_performance: same role + lead tier + matured sample >= minimum; else provisional.
 * - personal_progress: the rep against their own prior period. No public rank.
 */
import type { ISODateTime, Id, LeaderboardRow, LeaderboardView, MetricPayload, RevenueBasis, User } from "./types";
import {
  type CohortFilter,
  type Dataset,
  attendedOpportunityIds,
  computeM08,
  computeM15,
  computeM16,
  contractedValue,
  ledgerFor,
  netCollected,
  opportunityMatured,
  selectOpportunities,
  wonOpportunities,
} from "./metrics";
import { formatMinorPerUnit, zero } from "./money";

export interface LeaderboardPolicy {
  policyVersion: string;
  basis: RevenueBasis;
  minMaturedSample: number;
  /** Cohort window on accountability start, half-open. */
  periodFrom: ISODateTime;
  periodTo: ISODateTime;
  /** Prior comparable period for personal progress. */
  priorPeriodFrom?: ISODateTime;
  priorPeriodTo?: ISODateTime;
  /** Roles ranked. */
  roles?: ("setter" | "closer")[];
  /** Pause consequential ranking while attendance is unresolved or payments are unlinked (SOS-14). */
  pauseOnUnresolvedData?: boolean;
}

export const DEFAULT_LEADERBOARD_POLICY: Omit<LeaderboardPolicy, "periodFrom" | "periodTo"> = {
  policyVersion: "leaderboard-1.0-pilot",
  basis: "net_collected_cash",
  minMaturedSample: 25,
  roles: ["setter", "closer"],
  pauseOnUnresolvedData: true,
};

function modeTier(tiers: (number | undefined)[]): number | undefined {
  const counts = new Map<number, number>();
  for (const t of tiers) if (t !== undefined) counts.set(t, (counts.get(t) ?? 0) + 1);
  let best: number | undefined;
  let bestCount = 0;
  for (const [tier, n] of counts) if (n > bestCount || (n === bestCount && best !== undefined && tier < best)) [best, bestCount] = [tier, n];
  return best;
}

function rplFor(dataset: Dataset, filter: CohortFilter, basis: RevenueBasis, now: ISODateTime): MetricPayload {
  const payload = basis === "net_collected_cash" ? computeM16(dataset, filter, now) : computeM15(dataset, filter, now);
  if (basis === "reported_revenue") {
    payload.basis = "reported_revenue";
    payload.label = "Reported revenue per lead (imported; basis unknown)";
  }
  return payload;
}

interface RowDraft extends LeaderboardRow {
  rankKey: number;
  unresolvedAttendance: number;
}

function buildRow(dataset: Dataset, user: User, role: "setter" | "closer", policy: LeaderboardPolicy, now: ISODateTime): RowDraft {
  const filter: CohortFilter = { userId: user.userId, role, from: policy.periodFrom, to: policy.periodTo };
  const opps = selectOpportunities(dataset, filter, now);
  const ids = new Set(opps.map((o) => o.opportunityId));
  const matured = opps.filter((o) => opportunityMatured(o, dataset.tenant, now)).length;
  const currency = dataset.tenant.reportingCurrency;
  const rpl = rplFor(dataset, filter, policy.basis, now);
  const total =
    policy.basis === "net_collected_cash" ? netCollected(ledgerFor(dataset, ids), currency) : contractedValue(dataset, ids, currency);
  const attended = attendedOpportunityIds(dataset, ids).size;
  const wins = wonOpportunities(opps).length;
  const refunds = ledgerFor(dataset, ids).filter((e) => e.kind === "refund" || e.kind === "dispute_debit").length;
  const show = computeM08(dataset, filter, now);
  const leadTier = modeTier(opps.map((o) => o.leadTier));

  let prior: number | null | undefined;
  if (policy.priorPeriodFrom && policy.priorPeriodTo) {
    prior = rplFor(dataset, { ...filter, from: policy.priorPeriodFrom, to: policy.priorPeriodTo }, policy.basis, now).value;
  }

  return {
    userId: user.userId,
    displayName: user.displayName,
    role,
    cohortId: `${policy.policyVersion}:${role}:tier=${leadTier ?? "unknown"}:[${policy.periodFrom},${policy.periodTo})`,
    leadTier,
    rank: null,
    provisional: false,
    assignedOpportunities: opps.length,
    maturedSample: matured,
    revenuePerLead: rpl,
    totalRevenue: total.amountMinor === 0 ? zero(currency) : total,
    basis: policy.basis,
    attendedAppointments: attended,
    wins,
    refundCount: refunds,
    priorPeriodRevenuePerLead: prior,
    rankKey: rpl.value ?? Number.NEGATIVE_INFINITY,
    unresolvedAttendance: show.unknownCount,
  };
}

export function buildLeaderboard(
  dataset: Dataset,
  view: LeaderboardView,
  policy: LeaderboardPolicy,
  now: ISODateTime,
): LeaderboardRow[] {
  const roles = policy.roles ?? ["setter", "closer"];
  const drafts: RowDraft[] = [];
  for (const user of dataset.users) {
    if (!user.active) continue;
    for (const role of roles) {
      if (!user.roles.includes(role)) continue;
      const row = buildRow(dataset, user, role, policy, now);
      if (row.assignedOpportunities === 0) continue;
      drafts.push(row);
    }
  }

  const unlinkedPayments = dataset.ledger.filter((e) => e.opportunityId === undefined).length;

  if (view === "economic_output") {
    // Descriptive output: rank by total revenue on the declared basis. Not a skill ranking.
    const sorted = [...drafts].sort((a, b) => b.totalRevenue.amountMinor - a.totalRevenue.amountMinor || a.displayName.localeCompare(b.displayName));
    return sorted.map((row, i) => finish({
      ...row,
      rank: i + 1,
      provisional: false,
      movementReason: `Economic output on ${basisLabel(row.basis)} basis; describes allocation and output, not isolated skill.`,
    }));
  }

  if (view === "personal_progress") {
    return drafts
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .map((row) => {
        const current = row.revenuePerLead.value;
        const prior = row.priorPeriodRevenuePerLead;
        let movementReason: string;
        if (prior === undefined) movementReason = "No prior period configured; showing current period only.";
        else if (prior === null || current === null) movementReason = "No computable revenue per lead in the prior period or the current period (N/A); nothing to compare yet.";
        else {
          const delta = current - prior;
          movementReason = `${delta >= 0 ? "+" : "-"}${formatMinorPerUnit(Math.abs(delta), row.revenuePerLead.currency)} per lead versus own prior period (${formatMinorPerUnit(prior, row.revenuePerLead.currency)} -> ${formatMinorPerUnit(current, row.revenuePerLead.currency)}).`;
        }
        return finish({ ...row, rank: null, provisional: false, movementReason });
      });
  }

  // comparable_performance: group by role + lead tier; eligibility needs matured sample and reconciled data.
  const groups = new Map<string, RowDraft[]>();
  for (const row of drafts) {
    const key = `${row.role}:tier=${row.leadTier ?? "unknown"}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const out: LeaderboardRow[] = [];
  for (const [, rows] of groups) {
    for (const row of rows) {
      const reasons: string[] = [];
      if (row.maturedSample < policy.minMaturedSample) {
        reasons.push(`${row.assignedOpportunities} assigned opportunities, minimum ${policy.minMaturedSample} for eligible rank (${row.maturedSample} matured)`);
      }
      if (row.leadTier === undefined) reasons.push("lead tier unknown; comparison group undefined");
      if (policy.pauseOnUnresolvedData && row.unresolvedAttendance > 0) {
        reasons.push(`${row.unresolvedAttendance} unresolved attendance outcome(s); consequential ranking paused`);
      }
      if (policy.pauseOnUnresolvedData && policy.basis === "net_collected_cash" && unlinkedPayments > 0) {
        reasons.push(`${unlinkedPayments} unlinked payment(s) awaiting reconciliation; ranking paused`);
      }
      if (row.revenuePerLead.value === null) reasons.push("revenue per lead is N/A");
      row.provisional = reasons.length > 0;
      row.provisionalReason = reasons.length ? reasons.join("; ") : undefined;
    }
    const eligible = rows.filter((r) => !r.provisional).sort((a, b) => b.rankKey - a.rankKey || a.displayName.localeCompare(b.displayName));
    eligible.forEach((r, i) => {
      r.rank = i + 1;
      r.movementReason = i === 0 ? "Eligible rank after cohort matured; ties broken by display name (declared before use)." : "Eligible rank after cohort matured.";
    });
    for (const r of rows) {
      if (r.provisional) {
        r.rank = null;
        r.movementReason = `Provisional: ${r.provisionalReason}. Value shown honestly; not ranked.`;
      }
      out.push(finish(r));
    }
  }
  return out.sort((a, b) => a.role.localeCompare(b.role) || (a.leadTier ?? 99) - (b.leadTier ?? 99) || (a.rank ?? 999) - (b.rank ?? 999) || a.displayName.localeCompare(b.displayName));
}

function basisLabel(basis: RevenueBasis): string {
  switch (basis) {
    case "net_collected_cash":
      return "net collected cash";
    case "contracted_value":
      return "contracted value";
    case "reported_revenue":
      return "reported revenue";
  }
}

function finish(row: RowDraft): LeaderboardRow {
  const { rankKey: _rankKey, unresolvedAttendance: _u, ...rest } = row;
  void _rankKey;
  void _u;
  return rest;
}

export function userIdsWithRole(dataset: Dataset, role: "setter" | "closer"): Id[] {
  return dataset.users.filter((u) => u.active && u.roles.includes(role)).map((u) => u.userId);
}
