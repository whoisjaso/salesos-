/**
 * Season tier per rep from net collected cash, shared by the Team board and
 * the Me screen so both show the same badge. Computed once per role from the
 * fixture dataset; never from commission (D11, SOS-14 privacy).
 *
 * Roles never mix: setters and closers race separately and each race uses
 * its own tier policy (`tierPolicyFor(role)`), so a setter's badge is read
 * against the setter thresholds and a closer's against the closer thresholds.
 */
import { type CashRaceEntry, type CashTier, type TierRole, cashRace, tierPolicyFor } from "@/domain/cashTiers";
import { seasonFor } from "@/domain/gamification";
import { NOW, obaviaDataset } from "@/fixtures/obavia";

const cache: Partial<Record<TierRole, CashRaceEntry[]>> = {};

/** The season race for ONE role, ranked by net collected cash with that role's tier badges. */
export function seasonRace(role: TierRole): CashRaceEntry[] {
  let race = cache[role];
  if (!race) {
    const season = seasonFor(NOW);
    race = cashRace(obaviaDataset, { from: season.startsAt, to: season.endsAt }, role, tierPolicyFor(role));
    cache[role] = race;
  }
  return race;
}

/** Tier for a rep in a role this season, or undefined when the rep has no race entry in that role. */
export function seasonTierFor(userId: string, role: TierRole): CashTier | undefined {
  return seasonRace(role).find((r) => r.userId === userId)?.tier;
}
