---
document_id: SOS-13
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Qualification, perceived fit, and disqualification governance

**Read with:** [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [08_PSYCHOLOGY_AND_ADAPTIVE_COMMUNICATION.md](08_PSYCHOLOGY_AND_ADAPTIVE_COMMUNICATION.md), [05_ATTRIBUTION_AND_DATA_QUALITY.md](05_ATTRIBUTION_AND_DATA_QUALITY.md)

## In plain language

The system needs to know whether the offer fits the customer. It also needs to know what the representative thinks. Those are different records. Neither should be manipulated to improve a rank or make a representative appear more confident.

## Three distinct assessments

**Objective offer fit:** explicit, versioned business criteria with evidence. Examples include whether the offer solves the stated workflow, implementation prerequisites, appropriate decision authority, and relevant commercial constraints. Criteria differ by offer and must be approved before use.

**Representative-perceived fit:** the rep's judgment at that moment, with reasons and optional confidence. This can reveal where conversations need review. It is not a clinical measure of optimism or confidence.

**AI-proposed assessment:** extracted evidence and proposed findings. This remains a proposal until the policy allows automatic adoption or a human reviews it. A model confidence number is not a verified probability.

## Source interpretation

The speaker explicitly calls qualified-show rate subjective and interprets lower values as lower rep confidence. That interpretation is not established by the spreadsheet. The same pattern could reflect different lead mixes, inconsistent criteria, missing information, incomplete product knowledge, or real fit differences. Store the perception measure, but do not diagnose the representative or punish them for having a lower perception rate. [U1]

## Fit policy structure

Each rule has ID, offer version, business rationale, input fact, required evidence, allowed values, missing-data behavior, exception authority, and customer-facing explanation where needed. Avoid arbitrary scores such as `80 means qualified` without calibration and an approved business rationale.

Suggested record:

```json
{
  "opportunity_id": "opp_example",
  "policy_version": "offer_fit_v1",
  "objective_assessment": {
    "problem_match": {"value": "yes", "evidence_refs": ["span_1"]},
    "implementation_owner": {"value": "unknown", "evidence_refs": []},
    "decision_process_known": {"value": "partial", "evidence_refs": ["span_2"]}
  },
  "rep_perceived_fit": "likely",
  "rep_reason": "Relevant problem; implementation ownership unresolved",
  "ai_recommendation": "clarify",
  "review_state": "needs_confirmation",
  "next_question": "Who would own the setup on your side?"
}
```

## Budget and economic fit

Use offer-relevant information actually supplied or verified. Do not infer income, wealth, credit quality, or ability to pay from a voice, accent, name, perceived status, or ego lens. Do not substitute company revenue for cash availability or authority to buy.

A buyer's inability to justify the purchase can indicate a bad offer fit, not a sales objection to defeat. Optional financing, vehicle credit, or consumer eligibility requires separate approved domain policies; this general CRM specification does not authorize those decisions.

## Pre-call DQ

A representative can propose DQ using an approved reason code and evidence. The decision must distinguish spam/test/duplicate correction, wrong service, ineligible product need, contact request withdrawn, unreachable after approved attempts, and timing/nurture. Not all non-retained bookings are DQ.

DQ does not delete the opportunity or remove it from the accountable assigned denominator. Genuine system duplicates are corrected by an independently permissioned process. A manager can audit decisions, including a sample of rejected opportunities, without automatically recontacting people who opted out.

## Authority and review

Clear deterministic hard exclusions can be automated when the policy and evidence support them. Ambiguous fit, unknown evidence, and sensitive cases go to human review. A rep can appeal an assessment; a manager cannot secretly change the criteria retroactively to justify a ranking decision.

For quality assurance, reviewers should use the same rubric and, when feasible, review without seeing the rep's rank or commercial outcome. A sale does not retroactively prove the original fit assessment was correct. A no-sale does not prove it was wrong.

## Coaching use

Low perceived qualification triggers an investigation: compare actual lead characteristics, review assessment coverage, inspect a few representative examples, identify product-knowledge gaps, and check whether the criteria are being applied consistently. The recommendation might be a clarification question or product lesson, not `be more positive`.

High DQ also needs context. It may be appropriate for an unsuitable acquisition source. Reducing DQ merely to boost booking or show volume can waste time and harm customers. Evaluate whole-cohort cash/contribution and suitability outcomes, not a universal low-DQ target.

## Audit and customer control

Keep actor, timestamp, assessment stage, source evidence, policy version, review decisions, and changes. Later discoveries append a new assessment rather than erase earlier judgment. Show the customer a clear respectful outcome when appropriate; do not expose speculative internal labels.

## Acceptance criteria

Unknown authority is not automatic No. AI cannot fabricate a budget. A DQ record remains in the assigned denominator. Perceived fit and verified fit appear separately. A later no-show cannot be reclassified to erase its attendance effect. A manager can compare criteria across reps. A customer opt-out is honored regardless of perceived commercial potential.

## Agent task prompt

```text
Define qualification for the approved offer. Separate objective criteria, customer-stated facts, rep-perceived fit, and AI proposals. Provide rule records, evidence requirements, Unknown handling, DQ reason codes, review/appeal flows, and tests. Do not diagnose confidence from qualification percentages or reward reps for labeling every prospect qualified.
```

