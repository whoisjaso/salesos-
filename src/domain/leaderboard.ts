/**
 * Leaderboards (SOS-14): three views with defensible denominators.
 * - economic_output: total eligible revenue on the declared basis and raw RPL. Not a skill ranking.
 * - comparable_performance: same role + lead tier + matured sample >= minimum; else provisional.
 * - personal_progress: the rep against their own prior period. No public rank.
 *
 * Standings (docs/DECISIONS.md, "Never show a list that looks ranked when ranking
 * is not established" and "A held measurement never holds the person"):
 * - When ranking is not established the result is a roster in a stated order, and
 *   no rank number is produced anywhere, so a rep's own rank and the team board
 *   cannot contradict each other. Both read `standingsHold` for the same basis.
 * - The hold is scoped to the basis: an unlinked payment holds a net-collected-cash
 *   board, not a contracted-value one, and unresolved attendance marks the attended
 *   count as a lower bound without touching the money ranking.
 * - A verified zero and a missing figure are different facts: `revenueState`.
 * - Cohort membership stays a statement about assigned work and keeps reading
 *   assignment history: who was given the lead is not a money question. The
 *   MONEY on a row is different. A movement whose credit is sealed to another
 *   rep is removed from this rep's revenue, so reassigning a contact after a
 *   payment cannot move a standings row. Movements with no seal are left exactly
 *   as they were, under UNSEALED_CREDIT_FALLBACK.
 */
import type {
  AffectedSurface,
  ISODateTime,
  Id,
  LeaderboardRow,
  LeaderboardView,
  MetricPayload,
  Opportunity,
  RevenueBasis,
  Role,
  User,
} from "./types";
import {
  BASIS_SURFACES,
  type IncidentScope,
  type SurfaceStatus,
  holdFor,
  scopeIncidents,
  standingsHold,
} from "./incidents";
import {
  type CohortFilter,
  type Dataset,
  attendedOpportunityIds,
  cohortIdFor,
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
import { type DatasetWithAttribution, opportunitySealVerdict, sealedElsewhere } from "./attribution";
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
  /**
   * Hold consequential ranking while a surface the basis depends on is unreliable
   * (SOS-14). Scoped: only the incidents that touch this basis hold it, and the
   * list then reads as a roster instead of a silent ranking. Set false to rank on
   * the figures as they stand.
   */
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
}

/**
 * The dataset as this row may count it: every movement sealed to a different
 * representative is dropped, and nothing else changes. An unsealed ledger is
 * returned untouched, so a workspace with no orders yet reads exactly as before.
 */
function creditScoped(dataset: DatasetWithAttribution, userId: Id, role: "setter" | "closer"): DatasetWithAttribution {
  const kept = dataset.ledger.filter((e) => !sealedElsewhere(dataset, e, userId, role));
  return kept.length === dataset.ledger.length ? dataset : { ...dataset, ledger: kept };
}

/**
 * The cohort a FINANCIAL standing is computed over.
 *
 * Where nothing is sealed this is exactly the existing cohort: assignment
 * history, which is a genuine statement about who was accountable for a lead.
 * Where a sale IS sealed, the seal decides. An opportunity sealed to another
 * rep leaves this rep's cohort, and one sealed to this rep joins it, so
 * reassigning a contact tomorrow moves no row on a standings board.
 */
function financialCohort(
  dataset: DatasetWithAttribution,
  filter: CohortFilter,
  userId: Id,
  role: "setter" | "closer",
  now: ISODateTime,
): Opportunity[] {
  const mine = new Set(selectOpportunities(dataset, filter, now).map((o) => o.opportunityId));
  const inWindow = selectOpportunities(dataset, { ...filter, userId: undefined, role: undefined }, now);
  return inWindow.filter((o) => {
    const verdict = opportunitySealVerdict(dataset, o.opportunityId, userId, role);
    if (verdict === "sealed_to_user") return true;
    if (verdict === "sealed_elsewhere") return false;
    return mine.has(o.opportunityId);
  });
}

function buildRow(
  dataset: DatasetWithAttribution,
  user: User,
  role: "setter" | "closer",
  policy: LeaderboardPolicy,
  now: ISODateTime,
  revenueHold: SurfaceStatus | null,
  attendanceHold: SurfaceStatus | null,
): RowDraft {
  const filter: CohortFilter = { userId: user.userId, role, from: policy.periodFrom, to: policy.periodTo };
  const opps = financialCohort(dataset, filter, user.userId, role, now);
  // One dataset for every figure on this row: this rep's cohort, and only the
  // movements that are not sealed to somebody else. The cohort is already
  // user-scoped, so the filter drops the user and keeps the same cohort id.
  const scoped: DatasetWithAttribution = { ...creditScoped(dataset, user.userId, role), opportunities: opps };
  const scopedFilter: CohortFilter = { ...filter, cohortId: cohortIdFor(filter), userId: undefined, role: undefined };
  const ids = new Set(opps.map((o) => o.opportunityId));
  const matured = opps.filter((o) => opportunityMatured(o, dataset.tenant, now)).length;
  const currency = dataset.tenant.reportingCurrency;
  const rpl = rplFor(scoped, scopedFilter, policy.basis, now);
  const total =
    policy.basis === "net_collected_cash" ? netCollected(ledgerFor(scoped, ids), currency) : contractedValue(scoped, ids, currency);
  const attended = attendedOpportunityIds(dataset, ids).size;
  const wins = wonOpportunities(opps).length;
  const refunds = ledgerFor(scoped, ids).filter((e) => e.kind === "refund" || e.kind === "dispute_debit").length;
  // Attendance is not a money question and keeps its own cohort rule: the show
  // rate reads assignment history, exactly as it did before orders existed.
  const show = computeM08(dataset, filter, now);
  const leadTier = modeTier(opps.map((o) => o.leadTier));

  let prior: number | null | undefined;
  if (policy.priorPeriodFrom && policy.priorPeriodTo) {
    prior = rplFor(
      scoped,
      { ...scopedFilter, cohortId: cohortIdFor({ ...filter, from: policy.priorPeriodFrom, to: policy.priorPeriodTo }), from: policy.priorPeriodFrom, to: policy.priorPeriodTo },
      policy.basis,
      now,
    ).value;
  }

  // A verified zero and a missing figure are different facts, and never render alike.
  const revenueHeld = revenueHold !== null;
  const noAmount = total.amountMinor === 0;
  const revenueState: LeaderboardRow["revenueState"] = revenueHeld
    ? noAmount
      ? "unavailable"
      : "amount"
    : noAmount
      ? "verified_zero"
      : "amount";

  const unresolvedAttendance = show.unknownCount;
  const attendanceHeldHere = attendanceHold !== null && unresolvedAttendance > 0;
  const heldSurfaces: AffectedSurface[] = [
    ...(revenueHeld ? [revenueHold.surface] : []),
    ...(attendanceHeldHere ? [attendanceHold.surface] : []),
  ];
  const heldStatement = [
    revenueHeld ? revenueHold.statement : null,
    attendanceHeldHere
      ? `${attendedLabel(attended, unresolvedAttendance)}; ${attendanceHold.waitingOn} before the count is final.`
      : null,
  ]
    .filter((s): s is string => s !== null)
    .join(" ");

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
    revenueState,
    revenueProvisional: revenueHeld,
    attendedState: attendanceHeldHere ? "at_least" : "verified",
    unresolvedAttendanceCount: unresolvedAttendance,
    heldSurfaces: heldSurfaces.length ? heldSurfaces : undefined,
    heldStatement: heldStatement.length ? heldStatement : undefined,
    rankKey: rpl.value ?? Number.NEGATIVE_INFINITY,
  };
}

function attendedLabel(attended: number, unresolved: number): string {
  return `At least ${attended} attended, with ${unresolved} attendance outcome${unresolved === 1 ? "" : "s"} unresolved`;
}

/** What a standings hold means for the list, in words the screen can render. */
export interface StandingsHold {
  surface: AffectedSurface;
  /** What has to happen before ranks can be produced. */
  waitingOn: string;
  owner: SurfaceStatus["owner"];
  ownerLabel: SurfaceStatus["ownerLabel"];
  /** One sentence: the limited effect. */
  statement: string;
  incidentIds: Id[];
}

export interface Standings {
  view: LeaderboardView;
  /** "roster" means no rank number is produced anywhere in this result. */
  kind: "ranked" | "roster";
  /** The order the list is in, stated in words. Always shown above the list. */
  orderLabel: string;
  /** Set when ranking is held by an incident. Absent when no cohort is simply eligible yet. */
  heldBy?: StandingsHold;
  rows: LeaderboardRow[];
  scope: IncidentScope;
}

function toStandingsHold(status: SurfaceStatus): StandingsHold {
  return {
    surface: status.surface,
    waitingOn: status.waitingOn ?? "",
    owner: status.owner,
    ownerLabel: status.ownerLabel,
    statement: status.statement,
    incidentIds: status.incidents.map((i) => i.incidentId),
  };
}

function byName(a: LeaderboardRow, b: LeaderboardRow): number {
  return a.role.localeCompare(b.role) || a.displayName.localeCompare(b.displayName);
}

/**
 * The full standings result: the rows, whether they are ranked at all, the order
 * they are in, and what holds the ranking when it is held. `buildLeaderboard`
 * returns the rows from this.
 */
export function buildStandings(
  dataset: DatasetWithAttribution,
  view: LeaderboardView,
  policy: LeaderboardPolicy,
  now: ISODateTime,
  scope?: IncidentScope,
): Standings {
  const resolved = scope ?? scopeIncidents(dataset, { now });
  const scoped = policy.pauseOnUnresolvedData === false;
  // Scoped to the basis: contracted value does not rest on payment attribution.
  const revenueHold = scoped ? null : holdFor(resolved, BASIS_SURFACES[policy.basis]);
  const attendanceHold = holdFor(resolved, ["attendance_outcome"]);
  const rankHold = scoped ? null : standingsHold(resolved, policy.basis);

  const roles = policy.roles ?? ["setter", "closer"];
  const drafts: RowDraft[] = [];
  for (const user of dataset.users) {
    if (!user.active) continue;
    for (const role of roles) {
      if (!user.roles.includes(role)) continue;
      const row = buildRow(dataset, user, role, policy, now, revenueHold, attendanceHold);
      if (row.assignedOpportunities === 0) continue;
      drafts.push(row);
    }
  }

  const heldBy = rankHold ? toStandingsHold(rankHold) : undefined;

  if (view === "economic_output") {
    if (heldBy) {
      // The figures are shown and labeled, but a position in this order would read as a rank.
      const rows = drafts
        .map((row) =>
          finish({
            ...row,
            rank: null,
            provisional: true,
            provisionalReason: heldBy.statement,
            movementReason: `Roster, not a ranking: ${heldBy.statement}`,
          }),
        )
        .sort(byName);
      return {
        view,
        kind: "roster",
        orderLabel: `Roster in alphabetical order, not a ranking. ${heldBy.statement}`,
        heldBy,
        rows,
        scope: resolved,
      };
    }
    // Descriptive output: order by total revenue on the declared basis. Not a skill ranking.
    const sorted = [...drafts].sort(
      (a, b) => b.totalRevenue.amountMinor - a.totalRevenue.amountMinor || a.displayName.localeCompare(b.displayName),
    );
    return {
      view,
      kind: "ranked",
      orderLabel: `Ordered by total ${basisLabel(policy.basis)} for the period. Describes allocation and output, not isolated skill.`,
      rows: sorted.map((row, i) =>
        finish({
          ...row,
          rank: i + 1,
          provisional: false,
          movementReason: `Economic output on ${basisLabel(row.basis)} basis; describes allocation and output, not isolated skill.`,
        }),
      ),
      scope: resolved,
    };
  }

  if (view === "personal_progress") {
    const rows = drafts
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
    return {
      view,
      kind: "roster",
      orderLabel: "Each rep against their own prior period, in alphabetical order. No rank.",
      heldBy,
      rows,
      scope: resolved,
    };
  }

  // comparable_performance: group by role + lead tier; eligibility needs a matured sample and a basis that holds up.
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
      if (heldBy) reasons.push(heldBy.statement);
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
  const ranked = out.some((r) => r.rank !== null);
  const sorted = ranked
    ? out.sort(
        (a, b) =>
          a.role.localeCompare(b.role) ||
          (a.leadTier ?? 99) - (b.leadTier ?? 99) ||
          (a.rank ?? 999) - (b.rank ?? 999) ||
          a.displayName.localeCompare(b.displayName),
      )
    : out.sort(byName);
  return {
    view,
    kind: ranked ? "ranked" : "roster",
    orderLabel: ranked
      ? `Ranked by ${basisLabel(policy.basis)} per assigned opportunity, within role and lead tier. Provisional rows are listed with their reason and carry no rank.`
      : `Roster in alphabetical order, not a ranking. ${heldBy ? heldBy.statement : `No cohort has reached the ${policy.minMaturedSample} matured opportunities an eligible rank needs.`}`,
    heldBy,
    rows: sorted,
    scope: resolved,
  };
}

export function buildLeaderboard(
  dataset: DatasetWithAttribution,
  view: LeaderboardView,
  policy: LeaderboardPolicy,
  now: ISODateTime,
): LeaderboardRow[] {
  return buildStandings(dataset, view, policy, now).rows;
}

export interface OwnStanding {
  /** Null whenever the board produces no rank. The two can never disagree: same rows. */
  rank: number | null;
  of: number;
  kind: Standings["kind"];
  row?: LeaderboardRow;
  /** Why there is no rank, when there is none. */
  statement: string;
}

/**
 * A rep's own standing, read from the same rows the team board shows, so the
 * personal view and the board can never contradict each other.
 */
export function ownStanding(standings: Standings, userId: Id, role?: Role): OwnStanding {
  const row = standings.rows.find((r) => r.userId === userId && (role === undefined || r.role === role));
  const peers = row ? standings.rows.filter((r) => r.role === row.role && r.leadTier === row.leadTier) : [];
  const ranked = peers.filter((r) => r.rank !== null).length;
  if (!row) {
    return { rank: null, of: 0, kind: standings.kind, statement: "No assigned opportunities in this period, so there is nothing to place." };
  }
  if (row.rank === null) {
    return {
      rank: null,
      of: ranked,
      kind: standings.kind,
      row,
      statement: standings.heldBy ? standings.heldBy.statement : (row.provisionalReason ?? standings.orderLabel),
    };
  }
  return {
    rank: row.rank,
    of: ranked,
    kind: standings.kind,
    row,
    statement: `Rank ${row.rank} of ${ranked} in ${row.role === "setter" ? "setter" : "closer"} lead tier ${row.leadTier ?? "unknown"}, on ${basisLabel(row.basis)} per assigned opportunity.`,
  };
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
  const { rankKey: _rankKey, ...rest } = row;
  void _rankKey;
  return rest;
}

export function userIdsWithRole(dataset: Dataset, role: "setter" | "closer"): Id[] {
  return dataset.users.filter((u) => u.active && u.roles.includes(role)).map((u) => u.userId);
}
