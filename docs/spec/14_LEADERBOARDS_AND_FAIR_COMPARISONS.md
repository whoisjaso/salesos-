---
document_id: SOS-14
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Leaderboards, revenue efficiency, and fair comparisons

**Read with:** [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [05_ATTRIBUTION_AND_DATA_QUALITY.md](05_ATTRIBUTION_AND_DATA_QUALITY.md), [15_GAMIFICATION_AND_TEAM_PROGRESSION.md](15_GAMIFICATION_AND_TEAM_PROGRESSION.md)

## Purpose

Make progress and economic contribution visible without pretending that everyone received identical opportunities. The leaderboard should be engaging and transparent, but the business must be able to defend its denominator, comparison group, and incentive effects.

## Three leaderboard views

**Economic output:** total eligible revenue, assigned volume, and raw revenue per lead. This describes output and allocation efficiency. It is not labeled an isolated skill ranking. A reproduction of the speaker's sheet uses reported revenue and visibly retains that basis.

**Comparable performance:** the same role, relevant offer/path, source or lead tier, maturity window, attribution policy, and quality gates. This is the appropriate view for proposed performance-based progression. If comparability or sample support is weak, mark it provisional rather than inventing adjusted certainty.

**Personal progress and contribution:** improvement against one's own comparable baseline, reliable execution, coaching practice, and validated knowledge-sharing contributions. This gives developing representatives a meaningful path beyond competing with a tiny or unusually favorable sample.

## Primary commercial measure

For the operating product, default to **net collected revenue per assigned opportunity** within a declared cohort, subject to data and customer-quality gates. Show contribution per opportunity alongside it when cost data is sufficiently reliable. Do not equate revenue with profit or raw RPL with causal selling ability.

Owner policy may choose a different primary metric for a specific offer, but its definition must be explicit and versioned. The objective must not change mid-period without notice and a visible comparison impact.

## A representative row

Show display name, role, comparison cohort, rank or provisional state, assigned opportunities, observed/matured sample, net collected RPL, total net collected amount, attended appointments, conversion cards, refund/cancellation context, actual capacity, prior comparable period, and the reason for the latest movement.

Keep sensitive customer details out of the public board. Compensation visibility follows an explicit workforce privacy policy. Public team access to selected performance metrics does not grant access to every prospect transcript or personal commission detail.

## Small samples and uneven opportunity

A representative with one win from six leads can have exceptional raw RPL without enough evidence for a stable promotion. Show the value and sample honestly; do not either hide the result or declare the person best. Minimum maturity and evidence requirements are configurable policy decisions established before evaluation.

When statistical adjustment is introduced, use an auditable approach such as stratification, standardized lead mixes, or appropriately reviewed partial pooling. Show the raw result alongside any adjusted estimate and its uncertainty. Avoid fitting a complex model to a tiny dataset or presenting its output as objective truth.

An overall team rate is weighted by its underlying denominator. Do not average percentages across representatives or use a blended color as a mathematical score.

## Lead-tier circularity

The speaker rewards high RPL with better lead tiers. That changes future inputs and can amplify rank differences. Our system records the assignment policy, pool, tier definition, capacity, and actual assignment probabilities. A development/exploration policy gives eligible newcomers enough varied opportunity to be evaluated.

Comparisons within a tier are better than ignoring tiers, but not automatically causal. Within the same tier there can still be differences in campaign, timing, demand, offer value, or customer readiness. This is why the board must not say that RPL holds everything else constant.

## Ranking and movement rules

Eligibility requires active role, reconciled relevant data, adequate cohort maturity, policy compliance, and customer-quality review. Tie handling is declared before use. Movement is explainable: `Moved from provisional to eligible after cohort matured`, or `Position changed after a payment adjustment`.

Monthly seasons reset visible competition totals where appropriate, not the underlying event history. Late refunds or corrected attribution can restate the month. Preserve a report revision and the policy used. Mid-month movement may be visible as provisional; material lead privileges change only under the published routing policy.

Do not use rankings as the sole basis for employment, compensation disputes, or irreversible lead deprivation. Managers review source quality, workload, training, and data issues.

## Stage champions and team learning

A stage-specific board can surface representatives with strong show rates, clean handoffs, or objection-resolution examples within comparable conditions. Link to approved redacted playbook examples. These are candidates for learning and testing, not proof that copying one phrase will transfer the performance.

Do not combine the best observed rate from every representative into a fictional attainable super-funnel. Interactions between tactics, capacity, customer mix, and skill matter.

## Appeals and anti-gaming

Every rep can inspect their counted opportunities and submit a correction request. DQ, rescheduling, transferring, or hiding records must not remove historical accountability. An accepted appeal generates an auditable adjustment. Fraud or data disputes are handled privately; the public board should not shame people with unverified accusations.

## Acceptance criteria

Source-based and collected-cash rankings cannot be confused. The six-lead outlier is provisional when policy requires. Different lead tiers are visible. Unknown attendance or stale payments pause consequential ranking decisions. Team totals reconcile. A rep can understand and challenge a count. Promotion has an explainable rule, not a secret AI score.

## Agent task prompt

```text
Design the leaderboard with separate output, comparable-performance, and personal-progress views. Define the main metric, eligibility, cohorts, maturity, uncertainty, ties, revisions, privacy, and appeals. Include small-sample and unequal-lead-tier examples. Preserve gamification while preventing raw RPL from masquerading as a causal measure of selling skill.
```

