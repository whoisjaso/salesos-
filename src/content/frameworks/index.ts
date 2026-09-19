/**
 * Barrel for the owner's sales frameworks as structured lens data, plus `frameworkForLens()`,
 * which shapes them exactly like the `salesFrameworks` entries of the LensPack in
 * src/domain/lens.ts so the lens builder can wire them in.
 *
 * Nothing exported from here carries study_only or private_training bank text.
 * Pure data and pure functions: no React, no fetch, no clock.
 */
import type { SalesFramework } from "@/domain/lens";
import { DO_NOTS, IMPACT_FORMULA, PHASES } from "./impactFormula";
import { LISTENER_RULES, PERSONAL_MEANING_LISTENER } from "./personalMeaningListener";

export * from "./impactFormula";
export * from "./questionBank";
export * from "./personalMeaningListener";

/**
 * Short imperative lines for the model, derived from the four phases and the listener.
 * At most 25. Never quotes study_only material.
 */
export const IMPACT_FORMULA_PRINCIPLES: readonly string[] = [
  // Intent
  "Confirm the person and the real reason they are on the call before anything else.",
  "Ask one intent opener, not both: new activity or specific improvement.",
  "Get one tangible in the customer's words, then the experience behind it; a repeated goal is not an experience.",
  "When the answer misses the objective, mirror with a different question for the same answer type.",
  // Logical certainty
  "Learn the current process, how long, and why they chose it before naming any problem.",
  "Ask what they value in the current approach and accept that there may be nothing.",
  "Get the specific problem, what they mean by it, and how long it has been going on.",
  "Get one downstream impact (operational, economic or personal); impact is not emotional intensity.",
  "Mark every quantity as a customer estimate unless verified elsewhere.",
  // Emotional certainty
  "Ask why they seek help now rather than continuing alone.",
  "Walk the decision history: looked before, moved forward, result, barrier, what shifted, ideal criteria.",
  "Get two or three specific positive outcomes, each made concrete: situation, place, people, amount, time frame.",
  "Clarify the customer's own word instead of swapping in a synonym; record whether a label was theirs or confirmed.",
  "Record the stated consequence of not changing as their comparison of options, never as a distress target.",
  "Ask for commitment: unwilling to settle, why now, and whose responsibility, skipping the last where it does not fit.",
  // Pitch
  "Ask permission before presenting a game plan.",
  "Tie each pillar to a problem the customer stated, explain delivery, then check relevance.",
  "Ask perceived fit, why, and the most helpful part before the price.",
  "Quote only the approved price and ask how they would like to proceed; the model never establishes money.",
  "Diagnose the actual constraint (budget, time, authority, fit) as independent blockers; a clear no ends the call respectfully.",
  // Listener
  "Notice the distinctive word or analogy a customer chose once, and keep the relationship it expresses, not just the noun.",
  "Reuse a customer's own frame only where it clarifies a later point; abstaining is valid.",
  "Never infer biography, hobbies or motives from a reference; origin is unknown unless the context shows it was theirs.",
  "Cite a span for every stage score above zero; unknown is always allowed.",
];

/**
 * The frameworks shaped for the lens pack. Principles are the imperative lines above;
 * doNots are every do-not the source study states plus the listener rules that are boundaries.
 */
export function frameworkForLens(): SalesFramework[] {
  return [
    {
      name: IMPACT_FORMULA.name,
      source: IMPACT_FORMULA.source,
      principles: [...IMPACT_FORMULA_PRINCIPLES],
      doNots: [...DO_NOTS],
    },
    {
      name: PERSONAL_MEANING_LISTENER.name,
      source: PERSONAL_MEANING_LISTENER.source,
      principles: [
        PERSONAL_MEANING_LISTENER.operationalQuestion,
        ...PERSONAL_MEANING_LISTENER.loop,
      ],
      doNots: [...LISTENER_RULES],
    },
  ];
}

/** Convenience for the stage scorer: which phase informs which stage, in funnel order. */
export const STAGE_TO_PHASE = Object.fromEntries(PHASES.map((p) => [p.ourStage, p.id])) as Record<
  (typeof PHASES)[number]["ourStage"],
  (typeof PHASES)[number]["id"]
>;
