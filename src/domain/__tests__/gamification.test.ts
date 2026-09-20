import { describe, expect, it } from "vitest";
import { defaultSkillPaths, missionFromRecommendation, personalMilestone, seasonFor } from "@/domain/gamification";
import type { CoachingRecommendation } from "@/domain/types";

const rec: CoachingRecommendation = {
  tenantId: "obavia",
  recommendationId: "rec_1",
  ownerRole: "rep",
  ownerUserId: "usr_closer_marcus",
  title: "Low retained-booking attendance",
  issue: "x",
  metricIds: ["M08"],
  cohortId: "c",
  dataState: "complete",
  observed: "70 of 140",
  comparator: "target 60%",
  alternativeExplanations: [],
  evidenceRefs: ["q"],
  action: "confirm the customer's goal, the meeting purpose, and an easy reschedule option",
  effort: "2 min",
  guardrails: [],
  reviewAt: "2026-10-02T20:00:00Z",
  state: "proposed",
  provenance: { engine: "rules", version: "rules-1.0" },
};

describe("gamification (SOS-15)", () => {
  it("builds a mission with an evidence rule, not a checkbox", () => {
    const m = missionFromRecommendation(rec);
    expect(m.userId).toBe("usr_closer_marcus");
    expect(m.linkedMetricId).toBe("M08");
    expect(m.target).toBe(5);
    expect(m.evidenceRule).toMatch(/provider evidence/);
    expect(m.evidenceRule).toMatch(/not a statistically sufficient/);
    expect(m.kind).toBe("personal_mastery");
    expect(m.state).toBe("active");
    expect(missionFromRecommendation({ ...rec, suppressed: { reason: "partial" } }).state).toBe("paused");
    expect(() => missionFromRecommendation({ ...rec, ownerUserId: undefined })).toThrow();
  });

  it("ships the SOS-15 skill paths", () => {
    const paths = defaultSkillPaths();
    expect(paths.map((p) => p.name)).toEqual([
      "Intake discipline", "Useful discovery", "Appointment preparation", "Product knowledge",
      "Clear explanation", "Fit judgment", "Accurate closing", "Delivery handoff",
    ]);
    expect(paths[0].steps.map((s) => s.label)).toContain("Revalidate after offer change");
  });

  it("season is the current month, a display layer", () => {
    const s = seasonFor("2026-09-18T20:00:00Z");
    expect(s.seasonId).toBe("season_2026_09");
    expect(s.startsAt).toBe("2026-09-01T00:00:00Z");
    expect(s.endsAt).toBe("2026-10-01T00:00:00Z");
    expect(s.label).toMatch(/September 2026/);
  });

  it("777 personal milestone is private and optional", () => {
    const m = personalMilestone("usr_setter_priya", 120);
    expect(m.target).toBe(777);
    expect(m.remaining).toBe(657);
    expect(m.visibility).toBe("private");
    expect(m.optional).toBe(true);
    expect(m.note).toMatch(/Not a quota/);
  });
});
