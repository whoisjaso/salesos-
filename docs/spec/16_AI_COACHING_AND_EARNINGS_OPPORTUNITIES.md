---
document_id: SOS-16
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# AI coaching, stage diagnostics, and earnings opportunities

**Read with:** [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [13_QUALIFICATION_AND_DQ_GOVERNANCE.md](13_QUALIFICATION_AND_DQ_GOVERNANCE.md), [18_EXPERIMENTS_AND_SCRIPT_EVOLUTION.md](18_EXPERIMENTS_AND_SCRIPT_EVOLUTION.md), [19_REVENUE_COMMISSIONS_AND_FORECASTS.md](19_REVENUE_COMMISSIONS_AND_FORECASTS.md)

## In plain language

Tell the representative where improvement may pay off, why that conclusion is supported, and exactly what to practice next. Do not generate generic encouragement or imply that a spreadsheet difference proves the person caused lost revenue.

A useful coaching card follows this sequence: **observation, evidence check, possible cause, controllable action, labeled financial scenario, review**.

## Inputs

Read canonical metrics and cohort metadata, assignment/source mix, attendance and qualification coverage, approved call/message evidence, current playbook, customer outcomes, capacity, actual commission-policy version when authorized, and prior coaching history. The coach does not calculate money by reading a screenshot when a canonical ledger is available.

No recommendation should be consequential when the relevant data is stale, unreconciled, too immature, or materially incomplete. In those cases the next action may be `resolve attendance evidence` or `verify payment mapping`, not `call harder`.

## Diagnostic sequence

1. Confirm the metric definition and denominator.
2. Check data coverage, cohort maturity, source/tier changes, offer changes, and assignment policy.
3. Compare against an appropriate baseline, not automatically the top outlier.
4. Identify the stage difference and its uncertainty.
5. Inspect representative examples to generate competing explanations.
6. Choose an intervention the assigned owner can actually control.
7. Estimate a bounded scenario only when assumptions and capacity can be stated.
8. Schedule a review with downstream quality guardrails.

AI can flag correlations. It must not say a phrase, personality type, or representative behavior caused the result without an appropriate causal evaluation.

## Stage-to-action library

| Observed issue | Investigate before blaming the rep | Possible useful action |
|---|---|---|
| Slow first attempt | Ingestion lag, coverage, assignment backlog, consent restrictions | Fix routing/coverage; then practice timely acknowledgment. |
| Low two-way contact | Invalid contacts, channel preference, caller reputation, timing, source quality | Verify source quality and test an approved channel/timing change. |
| High pre-call DQ | Offer mismatch, unclear criteria, missing facts, inconsistent review | Review a matched DQ sample and clarify one offer-fit question. |
| Low retained-booking attendance | Booking lead time, timezone, unclear purpose, reminder delivery, rep punctuality | Test an accurate agenda and easier rescheduling. |
| Low perceived qualification | Lead mix, assessment coverage, product knowledge, inconsistent criteria | Review evidence and practice clarification; do not diagnose pessimism. |
| Low qualified-to-win | Fit definition, unresolved stakeholders, offer limitations, price changes | Review comparable conversations and one unresolved decision objective. |
| Signed deals not collecting | Payment friction, inaccurate terms, wrong authority, collection timing | Fix the payment workflow and clarify approved terms. |
| High refunds or delivery failures | Mis-selling, product quality, scope mismatch, implementation capacity | Coordinate with delivery; pause the harmful script or offer promise. |
| High revenue with poor contribution | Discounts, costly customers, ad cost, delivery burden | Review offer economics, not merely demand more calls. |

## Worked earnings scenario, entirely illustrative

Assume a consistent mature cohort with 200 assigned opportunities, 140 retained appointments, 70 shows, a 20% show-to-win rate, $5,000 average net collected amount per win, and a hypothetical 5% commission on that basis. Assume all other factors remain constant and extra conversations can be delivered.

Current show rate: `70 / 140 = 50%`.

A target of 60% yields `140 × (0.60 - 0.50) = 14` additional attended appointments. At 20% show-to-win, that is `14 × 0.20 = 2.8` expected additional wins in the arithmetic model. Fractional wins are scenario expectations, not literal deals.

Additional cash scenario: `2.8 × $5,000 = $14,000`.

Additional commission scenario: `$14,000 × 0.05 = $700`.

| Show-rate scenario | Additional shows | Additional modeled cash | Additional modeled commission |
|---|---:|---:|---:|
| 55% | 7 | $7,000 | $350 |
| 60% | 14 | $14,000 | $700 |
| 65% | 21 | $21,000 | $1,050 |

These are sensitivity cases, not confidence intervals, promises, or proof that a reminder will create the improvement. They omit changes in customer mix, workload, sale size, refunds, and costs. If only ten additional appointment slots are available, cap the modeled increase accordingly. Evaluate contribution after incremental delivery and acquisition costs before recommending a business investment.

## Recommendation card contract

A card contains `recommendation_id`, owner, issue, metric/query IDs, cohort, data state, observed counts, comparator and reason, alternative explanations, evidence links, proposed action, applicable playbook version, time/capacity required, scenario assumptions, guardrails, review date, and outcome state.

Example display:

**Opportunity:** Improve appointment preparation.

**Observed:** 70 of 140 retained appointments attended in this mature cohort.

**Investigate:** Booking delay and purpose clarity; review five attended and five missed cases selected under a declared sampling method.

**Practice:** On the next eligible bookings, confirm the customer's goal, the meeting purpose, and an easy reschedule option.

**Scenario:** A ten-point attendance increase would model $700 additional commission under the stated assumptions. Not a forecast.

**Review:** Check attendance, customer replies, opt-outs, and downstream win/refund outcomes after the evaluation window.

The sample review is a diagnostic starting point, not a statistically conclusive experiment.

## Priority selection

Choose the highest expected useful improvement given evidence confidence, controllability, available capacity, implementation effort, customer risk, and downstream economics. Do not always choose the largest raw percentage gap. A small improvement in collection may be more valuable than more unqualified appointments.

Prefer one primary coaching task and at most a small number of optional lessons. The representative can inspect the reasoning, challenge the data, and report an external constraint. Managers can assign ownership to marketing, operations, product, or delivery instead of making every recommendation a rep problem.

## Learning from strong representatives

Find comparable conversations or workflows with good outcomes, obtain permission and redact sensitive material, identify the behavior as a hypothesis, create a reusable lesson, and test transferability. A rep can contribute an example and receive recognition after review.

Also include product learning from account management and delivery. If customers repeatedly misunderstand implementation, coaching may require a product demonstration or a better offer explanation, not a stronger objection script.

## Feedback and measurement

A recommendation moves through proposed, accepted, in practice, evaluated, adopted, rejected, or inconclusive. Store actual exposure to the intervention. Track whether the task was useful, whether the relevant behavior changed, and whether downstream outcomes improved. Avoid declaring the recommendation successful merely because the rep clicked Complete.

## Acceptance criteria

Each tip has a metric, evidence, owner, and actionable step. Unknown data can suppress it. Financial scenarios show assumptions, capacity, and commission basis. No tip claims causal certainty from correlation. No-show coaching uses the correct retained-booking denominator. Quality deterioration can cancel a recommendation. A representative can correct a mistaken premise.

## Agent task prompt

```text
Generate one evidence-backed coaching recommendation from the supplied canonical metrics and approved evidence. Return observation, data limitations, comparable baseline, alternative causes, controllable next action, time/capacity needs, optional financial sensitivity scenario, guardrails, and review plan. Use the actual commission policy only when supplied. Do not call hypothetical gaps lost money, diagnose confidence, or promise earnings.
```

