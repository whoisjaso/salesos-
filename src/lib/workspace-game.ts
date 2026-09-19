/**
 * Game strip helpers (SOS-15). XP, levels, streaks and the quality gate come
 * from src/domain/game.ts (verified stage events only). This file only shapes
 * them for display and picks the active mission. `now` is injected.
 */
import type { ISODateTime, Id, MetricId, Mission } from "@/domain/types";
import type { Dataset } from "@/domain/metrics";
import { playerState, type PlayerState } from "@/domain/game";
import { seasonFor, missionFromRecommendation } from "@/domain/gamification";
import { RulesCoachingEngine } from "@/domain/coaching";

export interface GameView {
  player: PlayerState;
  mission?: Mission;
  /** Five-word proof rule for the mission. */
  proofRule?: string;
  seasonLabel: string;
}

const PROOF_RULES: Partial<Record<MetricId, string>> = {
  M03: "First attempt logged in time",
  M04: "Confirmed live conversation, not voicemail",
  M06: "Retained booking, agenda recorded",
  M08: "Provider-verified show, agenda recorded",
  M09: "Fit rating with evidence refs",
  M11: "Decision objective recorded, revisited",
  M12: "Review documented, one behavior practiced",
  M16: "Ledger-confirmed collection, not proposal",
};

const MISSION_LABELS: Partial<Record<MetricId, string>> = {
  M03: "Log 5 first attempts on time",
  M04: "Reach 5 customers live",
  M06: "Confirm purpose on 5 bookings",
  M08: "Record agenda on 5 confirmations",
  M09: "Attach evidence to 5 ratings",
  M11: "Record 1 open objective per deal",
  M12: "Review 5 attended conversations",
  M16: "Confirm 5 payment steps",
};

export function computeGame(dataset: Dataset, userId: Id, now: ISODateTime): GameView {
  const season = seasonFor(now, dataset.tenant.timezone);
  const player = playerState(dataset, userId, now, { from: season.startsAt, to: season.endsAt }, []);
  const rec = RulesCoachingEngine.recommend(dataset, userId, now)[0];
  let mission: Mission | undefined;
  let proofRule: string | undefined;
  if (rec) {
    const base = missionFromRecommendation(rec, 5);
    const metricId = rec.metricIds[0];
    mission = { ...base, title: rec.suppressed ? "Paused until data is fixed" : MISSION_LABELS[metricId] ?? base.title };
    proofRule = rec.suppressed ? "Resolve data before practice counts" : PROOF_RULES[metricId];
  }
  return { player, mission, proofRule, seasonLabel: season.label };
}
