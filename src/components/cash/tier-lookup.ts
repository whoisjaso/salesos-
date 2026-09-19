/**
 * Season tier per rep from net collected cash, shared by the Team board and
 * the Me screen so both show the same badge. Computed once per module from
 * the fixture dataset; never from commission (D11, SOS-14 privacy).
 */
import { type CashRaceEntry, type CashTier, cashRace } from "@/domain/cashTiers";
import { seasonFor } from "@/domain/gamification";
import { NOW, obaviaDataset } from "@/fixtures/obavia";

let cache: CashRaceEntry[] | null = null;

export function seasonRace(): CashRaceEntry[] {
  if (!cache) {
    const season = seasonFor(NOW);
    cache = cashRace(obaviaDataset, { from: season.startsAt, to: season.endsAt });
  }
  return cache;
}

/** Tier for a rep in a role this season, or undefined when the rep has no race entry. */
export function seasonTierFor(userId: string, role: "setter" | "closer"): CashTier | undefined {
  return seasonRace().find((r) => r.userId === userId && r.role === role)?.tier;
}
