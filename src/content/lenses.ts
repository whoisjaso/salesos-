/**
 * Plain-language identity lens library. Source: docs/spec/07_RELATIONAL_PAIRING_AND_ARCHETYPES.md (SOS-07).
 * A configurable product taxonomy for coaching, not a validated psychological assessment.
 * The interface shows concrete preferences ("prefers numbers first") first; lenses are optional internal hypotheses.
 */
import type { LensName } from "@/domain/types";

export interface LensDefinition {
  name: LensName;
  label: string;
  evidenceToLookFor: string;
  usefulAdaptation: string;
  doNot: string;
}

export const lenses: LensDefinition[] = [
  { name: "competence_intelligence", label: "Competence", evidenceToLookFor: "Wants mechanisms, assumptions, limitations", usefulAdaptation: "Offer inspectable evidence and explain tradeoffs", doNot: "Flatter intelligence to obtain agreement" },
  { name: "autonomy_control", label: "Autonomy", evidenceToLookFor: "Wants options and final decision ownership", usefulAdaptation: "Present choices and a reversible next step", doNot: "Frame hesitation as weakness" },
  { name: "safety_certainty", label: "Safety", evidenceToLookFor: "Asks about implementation risk and failure", usefulAdaptation: "Explain constraints, support, exit and recovery", doNot: "Promise zero risk or guaranteed outcomes" },
  { name: "achievement_growth", label: "Achievement", evidenceToLookFor: "States a measurable expansion objective", usefulAdaptation: "Relate the offer to the stated goal", doNot: "Treat ambition as proof of product fit" },
  { name: "significance_status", label: "Significance", evidenceToLookFor: "Explicitly values differentiation or presentation", usefulAdaptation: "Show genuine differentiation relevant to their market", doNot: "Invent prestige, exclusivity, or endorsements" },
  { name: "connection_trust", label: "Connection", evidenceToLookFor: "Wants continuity and a known point of contact", usefulAdaptation: "Explain ownership and follow-through", doNot: "Pretend friendship or shared identity" },
  { name: "approval_recognition", label: "Approval", evidenceToLookFor: "Requests reassurance about a decision", usefulAdaptation: "Offer factual comparisons and time to consider", doNot: "Make approval conditional on buying" },
  { name: "care_contribution", label: "Care", evidenceToLookFor: "Describes helping employees or customers", usefulAdaptation: "Examine the actual impact on those people", doNot: "Use guilt or moral superiority to force a sale" },
  { name: "family_provider", label: "Provider", evidenceToLookFor: "Voluntarily describes family-related priorities", usefulAdaptation: "Respect budget, stability, and timing boundaries", doNot: "Exploit family anxiety or import family data" },
  { name: "novelty_opportunity", label: "Novelty", evidenceToLookFor: "Asks about new capabilities or possibilities", usefulAdaptation: "Offer a bounded demo with real limits", doNot: "Treat novelty as evidence of commercial value" },
  { name: "efficiency_simplicity", label: "Efficiency", evidenceToLookFor: "Wants fewer steps and less work", usefulAdaptation: "Summarize decisions and implementation workload", doNot: "Omit important terms to stay brief" },
  { name: "legacy_durability", label: "Legacy", evidenceToLookFor: "Wants an enduring business or transferable system", usefulAdaptation: "Explain ownership, maintainability, and continuity", doNot: "Promise permanent dominance or unverifiable legacy" },
];

export const lensByName = Object.fromEntries(lenses.map((l) => [l.name, l])) as Record<LensName, LensDefinition>;

/** Neutral confirmation questions that let the customer replace an inference (SOS-07). */
export const confirmationQuestions = [
  "Would you rather start with the numbers or see how it works?",
  "What would make this decision easier to evaluate?",
  "Who else needs to be comfortable with this before you change the process?",
];

/** What adapts and what never adapts (SOS-08, SOS-00). */
export const adaptationBoundaries = {
  canAdapt: ["Language", "Examples", "Evidence format", "Question ordering within an approved module", "Coaching"],
  neverAdapts: ["Truth", "Scope", "Prices", "Mandatory disclosures", "Eligibility rules", "The customer's right to decline"],
};
