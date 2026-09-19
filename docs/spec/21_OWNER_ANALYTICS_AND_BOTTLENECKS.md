---
document_id: SOS-21
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Owner analytics, economic constraints, and bottleneck diagnosis

**Read with:** [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [16_AI_COACHING_AND_EARNINGS_OPPORTUNITIES.md](16_AI_COACHING_AND_EARNINGS_OPPORTUNITIES.md), [19_REVENUE_COMMISSIONS_AND_FORECASTS.md](19_REVENUE_COMMISSIONS_AND_FORECASTS.md)

## In plain language

The owner's dashboard should help decide what to fix, who owns the fix, and whether fixing it is economically worthwhile. It should not merely display who collected the most money or issue a confident explanation for every fluctuation.

## Owner questions

How many accountable opportunities arrived, through which sources, and at what cost? Who received them? How much work can the team deliver? Where are customers failing to progress? How much cash was actually collected? What remains outstanding? Which sales produce good delivery outcomes? Is the apparent problem sales execution, acquisition quality, capacity, the offer, collection, fulfillment, or faulty data?

## Dashboard hierarchy

**Trust layer:** data freshness, unresolved integration/reconciliation issues, cohort maturity, and incomplete sources. A financial dashboard with a broken payment feed must say so before presenting rank or growth.

**Economic layer:** eligible collected cash, contracted value, outstanding receivables, refunds/disputes, source cost, defined contribution, actual commissions, and delivery commitments. Keep new business, recurring receipts, expansion, and referrals distinguishable.

**Flow layer:** path-specific stage counts and rates, contact and appointment timing, DQ/qualification coverage, and follow-up backlog.

**Capacity layer:** actual scheduled selling time, active workload, response coverage, rep punctuality, available fulfillment capacity, and overflow incidents.

**Decision layer:** one or a few evidence-backed investigations with owner, likely value range under stated assumptions, effort, confidence, and customer-quality risk.

## Diagnostic hierarchy

Investigate broken measurement first. Then inspect changes in input mix and assignment. Then investigate operational execution, offer fit, commercial terms, and delivery. Do not train a rep to compensate for invalid lead data or an offer that does not solve the customer's problem.

A diagnostic should separate observation from hypothesis. Example: `Show rate is lower in the current booked-entry cohort. The data also shows longer booking lead time. This suggests reviewing scheduling and reminders, but does not establish the cause.`

## Bottleneck card

Each card contains stage, affected cohort, current counts, valid comparator, data state, source/offer changes, responsible function, evidence links, candidate explanations, proposed investigation, intervention cost, capacity constraints, scenario assumptions, and stop/review conditions.

The owner can assign an issue to marketing, sales operations, the setter team, the closer, product, finance, or delivery. A representative should not be held solely accountable for an upstream campaign problem.

## Benchmark gap versus lost revenue

An optional benchmark scenario is:

`assigned opportunities × (matched benchmark net collected RPL - observed net collected RPL)`.

This is a descriptive counterfactual. It assumes the benchmark is transferable and the required capacity exists. It is not a measured financial loss, an accounting expense, an amount owed by the rep, or proof of inefficiency caused by the rep. Label it `benchmark opportunity scenario`, show assumptions, and avoid punitive red debt-like treatment.

Prefer a robust matched baseline or a clearly chosen target over the single best small-sample rep. If no valid comparator exists, do not fabricate the scenario. The source's term `efficiency cost` is retained only in the transcript; it is not adopted as the production label.

## Stage improvement scenarios

For a stage with N eligible opportunities and a rate moving from a to b, the arithmetic incremental exits are `N × (b-a)`. Apply downstream conversion, net commercial value, and commission only when those assumptions are explicit and populations are nested. Cap the scenario by available representative and fulfillment capacity.

A stage can improve while another worsens. More lenient pre-call screening may increase shows and reduce show-to-win while still improving net revenue per lead. Conversely, an aggressive DQ policy may make close rate look excellent while wasting paid opportunities. Inspect the whole opportunity cohort.

## Allocation decisions

Before increasing ad spend or headcount, examine whether current coverage, contact, attendance, suitability, collection, and delivery are the limiting factors. More lead volume can be wasteful when the team cannot respond. More closers can be unnecessary when the main problem is unreliable booking evidence.

Do not copy the speaker's claim that one representative should produce a particular monthly revenue. That depends on offer value, cycle, customer mix, marketing spend, service capacity, and actual rep workload. Model the user's offer from its own evidence.

## Reporting cadence

Daily: intake, outstanding commitments, incidents, overdue actions, and short-term capacity.

Weekly: mature-enough stage patterns, coaching, source mix, customer outcomes, and unresolved reconciliation.

Monthly: comparable cohorts, actual collected cash and commissions, forecast error, unit economics, and season progression.

Quarterly: offer, source, vendor, policy, playbook, and risk review. Review does not require replacing a functioning method.

## AI analyst constraints

The analyst uses canonical queries and approved evidence. It cannot invent a reason for a metric change, call correlation a cause, diagnose an employee's confidence, or produce a dollar-loss accusation from a benchmark gap. Recommendations include alternative explanations and an investigation plan.

An automated morning brief can be concise: what changed, what is reliable, what needs attention, who owns the next action, and when the result will be reviewed. It should not become a generic motivational report.

## Acceptance criteria

The owner can distinguish cash from contract value and actual from modeled outcomes. Data incidents are prominent. Every diagnosed constraint has evidence and an owner. Scenarios include capacity and cost assumptions. Source changes are visible before rep comparisons. A recommendation can be to fix measurement or fulfillment instead of generating more calls.

## Agent task prompt

```text
Create an owner decision brief using the supplied canonical metrics. Separate observations, data limitations, likely constraints, competing explanations, and proposed actions. Use a matched benchmark only when defensible. Label any economic gap as a counterfactual scenario, not lost money. Identify whether the responsible bottleneck is marketing, sales, operations, finance, or delivery.
```

