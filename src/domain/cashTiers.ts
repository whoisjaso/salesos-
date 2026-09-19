/**
 * Cash tiers: the money-forward display layer for a rep's own commission and
 * the team cash race (SOS-14, SOS-15, D06, D11).
 *
 * Rules:
 * - Display only. Nothing here touches pay, eligibility, or routing.
 * - Commission states are reported separately (accrued / eligible / paid) and
 *   never blended into a single "earned" number without those parts beside it.
 * - Teammates never see each other's commission dollars. The race ranks by net
 *   collected cash and shows a tier badge derived from that cash, not from pay.
 * - Thresholds are owner-configurable through TierPolicy; DEFAULT_TIER_POLICY
 *   is the pilot default.
 * - `hypothetical` passes straight through from the commission policy so the
 *   UI can label every number until a real agreement exists (D06).
 */
import type { CommissionEntry, CommissionPolicy, ISODateTime, Id, LedgerEntry, MetricPayload } from "./types";
import { type Dataset, computeM19, contractedValue, ledgerFor, netCollected } from "./metrics";
import { scale } from "./money";

export type TierRole = "setter" | "closer";

export type CashTierId = "coins" | "cash" | "stacks" | "bags" | "diamonds";
export type CashTierIcon = "Coin" | "Money" | "Stack" | "Bag" | "Diamond";

export interface CashTier {
  id: CashTierId;
  label: string;
  /** Inclusive lower bound in USD minor units. */
  minMinor: number;
  /** Phosphor icon name. */
  icon: CashTierIcon;
  /** CSS color. Low saturation for lower tiers, richer for higher. */
  hue: string;
}

export interface TierPolicy {
  tiers: CashTier[];
  /** What the rep's own tier is computed from. The race always uses net collected. */
  basis: "commission" | "net_collected";
  version: string;
}

/**
 * Closer tiers, owner-set: coins $0, cash $1,000, stacks $10,000, bags
 * $30,000, diamonds $100,000 (tiers-closer-1.1). These are also the default
 * tiers so existing call sites without a role follow the closer bracket.
 */
export const CLOSER_TIERS: CashTier[] = [
  { id: "coins", label: "Coins", minMinor: 0, icon: "Coin", hue: "#a7a59d" },
  { id: "cash", label: "Cash", minMinor: 100_000, icon: "Money", hue: "#86c7a2" },
  { id: "stacks", label: "Stacks", minMinor: 1_000_000, icon: "Stack", hue: "#7ba4f0" },
  { id: "bags", label: "Bags", minMinor: 3_000_000, icon: "Bag", hue: "#d9b878" },
  { id: "diamonds", label: "Diamonds", minMinor: 10_000_000, icon: "Diamond", hue: "#8fd3e8" },
];

/**
 * Setter tiers. A setter's commission bracket is roughly half a closer's and
 * the same dollar figure means something very different per role, so the
 * icon thresholds differ: $500, $2,500, $10,000, $25,000 (owner-configurable).
 */
export const SETTER_TIERS: CashTier[] = [
  { id: "coins", label: "Coins", minMinor: 0, icon: "Coin", hue: "#a7a59d" },
  { id: "cash", label: "Cash", minMinor: 50_000, icon: "Money", hue: "#86c7a2" },
  { id: "stacks", label: "Stacks", minMinor: 250_000, icon: "Stack", hue: "#7ba4f0" },
  { id: "bags", label: "Bags", minMinor: 1_000_000, icon: "Bag", hue: "#d9b878" },
  { id: "diamonds", label: "Diamonds", minMinor: 2_500_000, icon: "Diamond", hue: "#8fd3e8" },
];

/** Role-scoped tier policies. Setters and closers never share thresholds or race each other. */
export const TIER_POLICY_BY_ROLE: Record<TierRole, TierPolicy> = {
  setter: { tiers: SETTER_TIERS, basis: "commission", version: "tiers-setter-1.0" },
  closer: { tiers: CLOSER_TIERS, basis: "commission", version: "tiers-closer-1.1" },
};

/** Default tiers are the closer bracket (kept for call sites that pass no role). */
export const DEFAULT_TIERS: CashTier[] = CLOSER_TIERS;
export const DEFAULT_TIER_POLICY: TierPolicy = TIER_POLICY_BY_ROLE.closer;

export function tierPolicyFor(role: TierRole): TierPolicy {
  const policy = TIER_POLICY_BY_ROLE[role];
  if (!policy) throw new Error(`tierPolicyFor: unknown role "${String(role)}"; expected "setter" or "closer"`);
  return policy;
}

/** The commission policy for a role: an exact role match first, then a policy that applies to every role. */
export function commissionPolicyFor(policies: CommissionPolicy[], role: TierRole): CommissionPolicy | undefined {
  return policies.find((p) => p.role === role) ?? policies.find((p) => p.role === undefined);
}

function sortedTiers(policy: TierPolicy): CashTier[] {
  return [...policy.tiers].sort((a, b) => a.minMinor - b.minMinor);
}

/** Highest tier whose minimum is at or below the amount. Never undefined: the lowest tier starts at 0. */
export function tierFor(amountMinor: number, policy: TierPolicy = DEFAULT_TIER_POLICY): CashTier {
  const tiers = sortedTiers(policy);
  let current = tiers[0];
  for (const t of tiers) if (amountMinor >= t.minMinor) current = t;
  return current;
}

export interface NextTier {
  tier: CashTier;
  remainingMinor: number;
  /** 0..1 progress from the current tier's minimum to the next tier's minimum. */
  progress: number;
}

/** The next tier up, or null at the top tier. */
export function nextTier(amountMinor: number, policy: TierPolicy = DEFAULT_TIER_POLICY): NextTier | null {
  const tiers = sortedTiers(policy);
  const current = tierFor(amountMinor, policy);
  const idx = tiers.findIndex((t) => t.id === current.id);
  const next = tiers[idx + 1];
  if (!next) return null;
  const span = next.minMinor - current.minMinor;
  const into = Math.max(0, amountMinor - current.minMinor);
  return {
    tier: next,
    remainingMinor: Math.max(0, next.minMinor - amountMinor),
    progress: span <= 0 ? 1 : Math.max(0, Math.min(1, into / span)),
  };
}

export interface SeasonWindow {
  from: ISODateTime;
  to: ISODateTime;
}

function inSeason(iso: ISODateTime, season: SeasonWindow): boolean {
  return iso >= season.from && iso < season.to;
}

/** Latest linked payment per opportunity: the moment the cash actually landed. */
function latestPaymentByOpportunity(ledger: LedgerEntry[]): Map<Id, LedgerEntry> {
  const map = new Map<Id, LedgerEntry>();
  for (const e of ledger) {
    if (e.kind !== "payment_collected" || e.passThrough || !e.opportunityId) continue;
    const prev = map.get(e.opportunityId);
    if (!prev || e.occurredAt > prev.occurredAt) map.set(e.opportunityId, e);
  }
  return map;
}

export type CommissionBucket = "accrued" | "eligible" | "paid";

/** State to bucket. Disputed and adjusted entries are excluded from every bucket. */
export function commissionBucket(state: CommissionEntry["state"]): CommissionBucket | null {
  switch (state) {
    case "calculated":
    case "accrued":
      return "accrued";
    case "pending_eligibility":
    case "payable":
      return "eligible";
    case "paid":
      return "paid";
    case "disputed":
    case "adjusted":
      return null;
  }
}

export interface CommissionSummary {
  accruedMinor: number;
  eligibleMinor: number;
  paidMinor: number;
  /** accrued + eligible + paid. Never includes disputed or adjusted. */
  totalMinor: number;
  currency: string;
  hypothetical: boolean;
  /** Commission per attended appointment for the same user and season (M19). */
  perAttended: MetricPayload;
}

/**
 * A rep's own commission for the season, split by state.
 *
 * Season attribution: a commission entry belongs to the season in which the
 * linked payment landed (latest non-pass-through payment_collected on the same
 * opportunity, by occurredAt). Commission exists because cash was collected,
 * so the cash date is the honest month. When no linked payment exists (for
 * example an imported or manually keyed entry) the entry is included
 * regardless of season rather than silently dropped.
 */
export function commissionSummary(
  dataset: Dataset,
  userId: Id,
  season: SeasonWindow,
  now: ISODateTime = season.to,
  policies?: CommissionPolicy[],
): CommissionSummary {
  const currency = dataset.tenant.reportingCurrency;
  const payments = latestPaymentByOpportunity(dataset.ledger);
  let accruedMinor = 0;
  let eligibleMinor = 0;
  let paidMinor = 0;
  let hypothetical = dataset.commissionPolicy.hypothetical;

  if (policies && policies.length > 0) {
    // Role-scoped path: commission is computed from the cash on the
    // opportunities the user owns in each role, at that role's rate. The
    // state comes from the user's existing entry on that opportunity when one
    // exists (disputed and adjusted stay excluded); otherwise it is accrued.
    const seasonLedger = dataset.ledger.filter((e) => inSeason(e.occurredAt, season));
    const entryByOpp = new Map<Id, CommissionEntry>();
    for (const e of dataset.commissionEntries) if (e.userId === userId) entryByOpp.set(e.opportunityId, e);
    let usedPolicy = false;
    for (const role of ["setter", "closer"] as const) {
      const policy = commissionPolicyFor(policies, role);
      if (!policy) continue;
      const owned = dataset.opportunities.filter((o) => o.currentOwner[role] === userId);
      if (owned.length === 0) continue;
      hypothetical = usedPolicy ? hypothetical || policy.hypothetical : policy.hypothetical;
      usedPolicy = true;
      for (const opp of owned) {
        const ids = new Set([opp.opportunityId]);
        const base =
          policy.basis === "contracted_value"
            ? contractedValue(dataset, ids, currency)
            : netCollected(ledgerFor({ ...dataset, ledger: seasonLedger }, ids), currency);
        if (base.amountMinor <= 0) continue;
        const entry = entryByOpp.get(opp.opportunityId);
        const bucket = entry ? commissionBucket(entry.state) : "accrued";
        if (!bucket) continue;
        const amount = scale(base, policy.ratePercent / 100).amountMinor;
        if (bucket === "accrued") accruedMinor += amount;
        else if (bucket === "eligible") eligibleMinor += amount;
        else paidMinor += amount;
      }
    }
  } else {
    for (const e of dataset.commissionEntries) {
      if (e.userId !== userId) continue;
      const bucket = commissionBucket(e.state);
      if (!bucket) continue;
      const payment = payments.get(e.opportunityId);
      if (payment && !inSeason(payment.occurredAt, season)) continue;
      if (bucket === "accrued") accruedMinor += e.amount.amountMinor;
      else if (bucket === "eligible") eligibleMinor += e.amount.amountMinor;
      else paidMinor += e.amount.amountMinor;
    }
  }
  return {
    accruedMinor,
    eligibleMinor,
    paidMinor,
    totalMinor: accruedMinor + eligibleMinor + paidMinor,
    currency,
    hypothetical,
    perAttended: computeM19(dataset, { userId, from: season.from, to: season.to }, now),
  };
}

export interface CashRaceEntry {
  userId: Id;
  displayName: string;
  role: "setter" | "closer";
  /** Net collected cash on opportunities this rep currently owns in the role, landed this season. */
  netCollectedMinor: number;
  /** Tier from net collected, never from commission (teammates' pay is private). */
  tier: CashTier;
  /** 1-based, ties share a rank. */
  rank: number;
}

/**
 * Team cash race for ONE role. Ranks the active reps in that role by the net
 * cash collected this season on the opportunities they own. Only net collected
 * and a tier are exposed; no commission figures for anyone.
 *
 * Setters and closers never race each other: the race is always role-scoped
 * and the badge thresholds come from `tierPolicyFor(role)` unless the owner
 * passes an explicit policy.
 *
 * TODO(pairs): UI must pass role. `role` defaults to "closer" only because
 * src/components/cash/tier-lookup.ts and src/components/me/MeScreen.tsx still
 * call cashRace(dataset, season) without one; a setter's own race needs
 * cashRace(dataset, season, "setter"). Any other value throws.
 */
export function cashRace(dataset: Dataset, season: SeasonWindow, role: TierRole = "closer", policy?: TierPolicy): CashRaceEntry[] {
  if (role !== "setter" && role !== "closer") {
    throw new Error(`cashRace requires a role of "setter" or "closer" (received ${JSON.stringify(role)}); setters and closers never race each other`);
  }
  const tierPolicy = policy ?? tierPolicyFor(role);
  const currency = dataset.tenant.reportingCurrency;
  const seasonLedger = dataset.ledger.filter((e) => inSeason(e.occurredAt, season));
  const entries: Omit<CashRaceEntry, "rank">[] = [];
  for (const user of dataset.users) {
    if (!user.active || !user.roles.includes(role)) continue;
    const owned = new Set(dataset.opportunities.filter((o) => o.currentOwner[role] === user.userId).map((o) => o.opportunityId));
    const net = netCollected(ledgerFor({ ...dataset, ledger: seasonLedger }, owned), currency).amountMinor;
    entries.push({ userId: user.userId, displayName: user.displayName, role, netCollectedMinor: net, tier: tierFor(net, tierPolicy) });
  }
  entries.sort((a, b) => b.netCollectedMinor - a.netCollectedMinor || a.displayName.localeCompare(b.displayName));
  const out: CashRaceEntry[] = [];
  let rank = 0;
  let last: number | null = null;
  entries.forEach((e, i) => {
    if (last === null || e.netCollectedMinor !== last) rank = i + 1;
    last = e.netCollectedMinor;
    out.push({ ...e, rank });
  });
  return out;
}

export interface CashDrop {
  at: ISODateTime;
  amountMinor: number;
  opportunityId: Id;
}

/** Recent collected payments attributed to the user (current setter or closer on the opportunity), newest first, at most 8. */
export function recentCashDrops(dataset: Dataset, userId: Id, season: SeasonWindow, limit = 8): CashDrop[] {
  const mine = new Set(
    dataset.opportunities.filter((o) => o.currentOwner.setter === userId || o.currentOwner.closer === userId).map((o) => o.opportunityId),
  );
  return dataset.ledger
    .filter((e) => e.kind === "payment_collected" && !e.passThrough && e.opportunityId && mine.has(e.opportunityId) && inSeason(e.occurredAt, season))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit)
    .map((e) => ({ at: e.occurredAt, amountMinor: e.amount.amountMinor, opportunityId: e.opportunityId as Id }));
}
