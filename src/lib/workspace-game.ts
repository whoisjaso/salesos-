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
import { transcripts } from "@/fixtures/calls";

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

/** A mission read from a conversation proves itself in the next one, not in a metric. */
const TRANSCRIPT_PROOF_RULE = "Named back on the next call";

export function computeGame(dataset: Dataset, userId: Id, now: ISODateTime): GameView {
  const season = seasonFor(now, dataset.tenant.timezone);
  const player = playerState(dataset, userId, now, { from: season.startsAt, to: season.endsAt }, []);
  // The rep's own conversations go in with the dataset: without them every coached
  // metric rests on attendance or revenue attribution, and one open data exception
  // leaves the rep with a waiting row instead of a mission.
  const rec = RulesCoachingEngine.recommend(dataset, userId, now, { transcripts })[0];
  let mission: Mission | undefined;
  let proofRule: string | undefined;
  if (rec) {
    const metricId: MetricId | undefined = rec.metricIds[0];
    // A measured gap is practiced over the next five eligible cases. An angle read from
    // one conversation is answered in that conversation's next call, so its target is one.
    const base = missionFromRecommendation(rec, metricId ? 5 : 1);
    // A mission is never titled by a data problem. When the metric behind it is
    // waiting, the mission keeps its own name and says what the count waits on
    // (docs/DECISIONS.md, "A held measurement never holds the person"). A
    // recommendation read from a transcript has no metric, so it is titled by the
    // thing it asks for, in the recommendation's own words.
    const title = (metricId && MISSION_LABELS[metricId]) ?? (metricId ? base.title : capitalize(rec.action));
    mission = { ...base, title };
    proofRule = rec.held
      ? `Counts once ${rec.held.waitingOn}. ${rec.held.ownerLabel ?? "The owner"} owns that.`
      : metricId
        ? PROOF_RULES[metricId]
        : TRANSCRIPT_PROOF_RULE;
  }
  return { player, mission, proofRule, seasonLabel: season.label };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
