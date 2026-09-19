/**
 * Builds a RepCard from the domain: verified season numbers only, nothing
 * self-reported. Pure; `now` is injected.
 */
import { type CashTier, type TierRole, cashRace, tierPolicyFor } from "@/domain/cashTiers";
import { playerState } from "@/domain/game";
import { seasonFor } from "@/domain/gamification";
import { type Dataset, attendedOpportunityIds, ledgerFor, netCollected, selectOpportunities, wonOpportunities } from "@/domain/metrics";
import { activePairs, pairsOf } from "@/domain/pairs";
import { type Profile, type RepCard, emptyProfile } from "@/domain/profile";
import type { ISODateTime, Id, Pair, Role } from "@/domain/types";

const ROLE_ORDER: Role[] = ["owner", "closer", "setter", "manager", "delivery"];

export const ROLE_WORD: Record<Role, string> = {
  owner: "Owner",
  closer: "Closer",
  setter: "Setter",
  manager: "Manager",
  delivery: "Delivery",
};

export function primaryRole(roles: Role[]): Role {
  return ROLE_ORDER.find((r) => roles.includes(r)) ?? roles[0] ?? "setter";
}

/** Tier for a card's tier id, or undefined for people outside the race (the owner). */
export function cardTier(card: Pick<RepCard, "role" | "tierId">): CashTier | undefined {
  if (card.role !== "setter" && card.role !== "closer") return undefined;
  return tierPolicyFor(card.role).tiers.find((t) => t.id === card.tierId);
}

export function buildRepCard(dataset: Dataset, pairs: Pair[], userId: Id, now: ISODateTime, profile?: Profile): RepCard {
  const user = dataset.users.find((u) => u.userId === userId);
  const displayName = user?.displayName ?? userId;
  const role = primaryRole(user?.roles ?? []);
  const season = seasonFor(now);
  const window = { from: season.startsAt, to: season.endsAt };
  const currency = dataset.tenant.reportingCurrency;
  const player = playerState(dataset, userId, now, window, []);

  const isRep = role === "setter" || role === "closer";
  const filter = isRep ? { userId, role: role as TierRole, from: window.from, to: window.to } : { from: window.from, to: window.to };
  const opps = selectOpportunities(dataset, filter, now);
  const ids = new Set(opps.map((o) => o.opportunityId));
  const wins = wonOpportunities(opps).length;
  const attended = attendedOpportunityIds(dataset, ids).size;

  let netCollectedMinor: number;
  let tierId = "team";
  let tierLabel = "Team";
  if (isRep) {
    const entry = cashRace(dataset, window, role as TierRole).find((e) => e.userId === userId);
    netCollectedMinor = entry?.netCollectedMinor ?? 0;
    const tier = entry?.tier ?? tierPolicyFor(role as TierRole).tiers[0];
    tierId = tier.id;
    tierLabel = tier.label;
  } else {
    const seasonLedger = dataset.ledger.filter((e) => e.occurredAt >= window.from && e.occurredAt < window.to);
    const all = new Set(dataset.opportunities.map((o) => o.opportunityId));
    netCollectedMinor = netCollected(ledgerFor({ ...dataset, ledger: seasonLedger }, all), currency).amountMinor;
  }

  const mine = activePairs(pairsOf(pairs, userId), now).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const pair = mine[0];
  let partner: RepCard["partner"];
  if (pair) {
    const otherId = pair.setterUserId === userId ? pair.closerUserId : pair.setterUserId;
    const other = dataset.users.find((u) => u.userId === otherId);
    if (other) partner = { userId: otherId, displayName: other.displayName, role: pair.setterUserId === userId ? "closer" : "setter" };
  }

  return {
    profile: profile ?? emptyProfile(dataset.tenant.tenantId, userId, displayName, now),
    role,
    level: player.commercial.level,
    tierId,
    tierLabel,
    streakDays: player.streakDays,
    seasonLabel: season.label.split(" season")[0],
    netCollectedMinor,
    currency,
    wins,
    attended,
    partner,
  };
}

/** Level progress for the ring, 0..1. */
export function levelProgress(dataset: Dataset, userId: Id, now: ISODateTime): { level: number; progress: number } {
  const season = seasonFor(now);
  const player = playerState(dataset, userId, now, { from: season.startsAt, to: season.endsAt }, []);
  return { level: player.commercial.level, progress: player.commercial.progress };
}
