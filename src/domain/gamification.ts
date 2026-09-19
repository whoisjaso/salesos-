/**
 * Gamification (SOS-15): missions with evidence rules, skill paths, seasons,
 * and an optional private personal milestone. Practice points never create
 * commission; nothing here touches money.
 */
import type { CoachingRecommendation, ISODateTime, Id, Mission, Season, SkillPath } from "./types";

const EVIDENCE_RULES: Partial<Record<CoachingRecommendation["metricIds"][number], string>> = {
  M03: "Completion counts when the first outbound attempt is logged within the response commitment, verified by call records.",
  M04: "Completion counts only for opportunities whose two-way contact is verified by a confirmed meaningful interaction, not voicemail.",
  M06: "Completion counts when the booking is retained after review with a recorded agenda in the customer's own words.",
  M07: "Completion counts when the DQ review sample is annotated with the offer-fit question asked and the evidence found.",
  M08: "Completion counts when attendance is verified by provider evidence, not calendar metadata; the agreed agenda must be recorded at confirmation.",
  M09: "Completion counts when the perceived-fit rating has attached evidence references and a stated reason.",
  M11: "Completion counts when the unresolved decision objective is recorded and revisited on the next conversation.",
  M12: "Completion counts when the comparable conversation review is documented with one practiced behavior.",
  M16: "Completion counts when the payment workflow step is confirmed collected in the ledger, not when the proposal is sent.",
};

/** A mission is one short practice assignment tied to a bottleneck; completion requires evidence, not a checkbox. */
export function missionFromRecommendation(rec: CoachingRecommendation, target = 5, missionId?: Id): Mission {
  if (!rec.ownerUserId) throw new Error("A mission needs a rep owner; owner-level recommendations become investigations, not missions.");
  const metricId = rec.metricIds[0];
  const evidenceRule = EVIDENCE_RULES[metricId] ?? "Completion requires linked evidence references reviewed by a manager, not a self-reported checkbox.";
  return {
    missionId: missionId ?? `mission_${rec.recommendationId}`,
    userId: rec.ownerUserId,
    title: `On the next ${target} eligible cases: ${rec.action}`,
    linkedMetricId: metricId,
    evidenceRule: `${evidenceRule} ${target} cases is a practice assignment, not a statistically sufficient performance test.`,
    target,
    progress: 0,
    kind: "personal_mastery",
    state: rec.suppressed ? "paused" : "active",
  };
}

/** SOS-15 skill path list. Each has rubric, examples, practice, review, revalidation. */
export function defaultSkillPaths(): SkillPath[] {
  const names = [
    "Intake discipline",
    "Useful discovery",
    "Appointment preparation",
    "Product knowledge",
    "Clear explanation",
    "Fit judgment",
    "Accurate closing",
    "Delivery handoff",
  ];
  const stepLabels = ["Read the rubric", "Review approved examples", "Practice (roleplay or live)", "Manager review", "Revalidate after offer change"];
  return names.map((name) => {
    const pathId = `path_${name.toLowerCase().replace(/\s+/g, "_")}`;
    return {
      pathId,
      name,
      steps: stepLabels.map((label, i) => ({ id: `${pathId}_step_${i + 1}`, label, done: false })),
    };
  });
}

/** Monthly season as a display layer. Audit history continues underneath. */
export function seasonFor(now: ISODateTime, timezone = "UTC"): Season {
  const d = new Date(now);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const label = start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return {
    seasonId: `season_${year}_${String(month + 1).padStart(2, "0")}`,
    label: `${label} season (display layer; ${timezone})`,
    startsAt: start.toISOString().replace(".000Z", "Z"),
    endsAt: end.toISOString().replace(".000Z", "Z"),
  };
}

export interface PersonalMilestone {
  userId: Id;
  label: string;
  target: number;
  progress: number;
  remaining: number;
  reached: boolean;
  /** Private to the rep; never on a public board. */
  visibility: "private";
  optional: true;
  note: string;
}

/**
 * Optional personal milestone (SOS-15). The user associates 777 with personal
 * motivation. This is a private, user-chosen marker: not a universal target,
 * earnings guarantee, or claim that 777 is an optimal workload.
 */
export function personalMilestone(userId: Id, progress: number, target = 777, what = "completed practice repetitions"): PersonalMilestone {
  return {
    userId,
    label: `${target} ${what}`,
    target,
    progress,
    remaining: Math.max(0, target - progress),
    reached: progress >= target,
    visibility: "private",
    optional: true,
    note: "Optional personal marker chosen by the rep. Not a quota, not tied to pay or lead access.",
  };
}
