---
document_id: SOS-19
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Revenue, commissions, earnings views, and forecasts

**Read with:** [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [05_ATTRIBUTION_AND_DATA_QUALITY.md](05_ATTRIBUTION_AND_DATA_QUALITY.md), [29_SOURCES_AND_RESEARCH.md](29_SOURCES_AND_RESEARCH.md)

## Purpose

Make the money real. Sales reporting, cash collection, accounting revenue, processor settlement, and employee compensation are related but different. The interface must not collapse them into a reassuring green number.

## Financial states and categories

Track approved contract/order value, invoice issued, payment authorized, payment succeeded/collected under the provider-specific basis, available/settled funds, bank payout where integrated, outstanding receivable, refund, dispute debit/credit, fees, and accounting recognition if supplied by the accounting system.

Commercial categories include new-customer sale, existing-customer expansion, recurring receipt, referral-originated sale, and other revenue. A recurring payment is not a new lead or a new win unless it reflects a genuinely new opportunity under policy. A referral is an acquisition source and can produce a new sale; do not count its revenue twice.

The supplied screenshot's revenue remains `reported_revenue_basis_unknown` unless better source evidence is obtained. Do not pretend it was collected cash or profit. [U1, U2]

## Net collected revenue basis

Use a reconciled ledger of eligible customer cash, excluding tax/pass-through amounts and applying actual refund/dispute movements exactly once. Keep processor fees and fulfillment costs separately for contribution analysis. A pending authorization is not cash. A processor success and a bank payout of the same funds are not two revenues.

Stripe documents refund and dispute lifecycles, including movements that can affect available balances. Our implementation must map the chosen provider's actual states rather than subtracting broad categories twice. [S07, S08]

Illustrative ledger: collect $10,000; refund $2,000; remaining eligible cash is $8,000 before fees. If the remaining $8,000 is later debited in a dispute, the eligible cash basis falls to zero. If a dispute credit returns $8,000, restore it. Do not also subtract the original $10,000 as bad debt. The precise provider handling must be reconciled to its records.

## Payment attribution

Link each payment to the correct opportunity, contract, commercial category, and currency. Split allocations must reconcile to the payment amount. An unlinked payment enters an exception queue, not an arbitrary rep's dashboard. Offline payments require authorized evidence and reconciliation; the software cannot verify cash in a drawer by inference.

## Commission policy

Before live use, the owner defines and obtains appropriate review of the actual compensation agreement: eligible basis, rates or tiers, setter/closer splits, attribution, timing, installment treatment, cancellations, refunds, disputes, approved adjustments, leave/departure handling, and payout authorization. This document is not a legal determination about when commission is earned or recoverable.

Represent policy as versioned rules with effective dates. Preserve the policy attached to each eligible transaction. The system must not retroactively change an earned amount simply because a leaderboard rule changes.

Separate `calculated`, `accrued under policy`, `pending eligibility`, `payable`, `paid`, `disputed`, and `adjusted`. Any reserve, holdback, or recovery mechanism is disabled until approved under the actual agreement and applicable requirements. Do not implement automatic wage deductions from hypothetical efficiency costs.

## Representative earnings display

Show the period, source data as-of time, eligible commission basis, accrued/eligible/paid amounts, pending conditions, adjustments, and dispute route. A representative can inspect the included transactions without receiving inappropriate access to another rep's compensation.

Display commission per attended appointment separately from measured commission per live-call hour and per all tracked work hour. Dividing commission by shows is not an hourly wage. Missing preparation/follow-up time requires an incomplete-time warning.

## Forecasts and run rates

A simple run rate extrapolates observed pace over remaining comparable working days. It must be labeled a mechanical projection, especially early in a month. It can fail when pipeline maturity, source mix, holidays, capacity, deal size, collections, or cancellations change.

A later forecast may combine expected eligible opportunities, probability of outcomes, collection timing, expected deal value, and capacity. It needs validation against prior periods, error reporting, and a range whose construction is stated. Low/base/high sensitivity cases are not statistical confidence intervals.

Do not show precise $100,000 earnings predictions from a handful of leads. Do not suggest that additional appointment availability automatically produces demand or revenue. An earnings scenario needs incremental deliverable opportunities, conversion assumptions, commercial value, the actual commission policy, and time/capacity effects.

## Unit economics

Report cost per source inquiry, cost per accepted opportunity, cost per retained/attended appointment, cost per suitable opportunity, and acquisition cost per new customer with explicit cost scope. Distinguish media-only CAC from fully loaded acquisition cost. ROAS and revenue are not profit.

Contribution policy defines attributable acquisition, sales, processing, delivery, support, and adjustment costs. If costs are estimates, label them. Do not rank reps on speculative delivery costs as if they were audited facts.

## Approval and control

The LLM may explain calculations and draft a query. It cannot change bank details, approve its own commission adjustment, issue a refund, or release payroll. Financial writes require deterministic rules, permissions, idempotency, and appropriate approval. Store all money in minor units and preserve currency.

## Acceptance criteria

One payment delivered twice changes money once. Partial collection shows partial cash. Refunds and disputes reconcile without double subtraction. Unlinked payments are visible. A commission follows its approved policy version. Hourly labels require time data. A forecast is distinguishable from actual earnings. Customer funds and employee compensation cannot be redirected by model-generated text.

## Agent task prompt

```text
Design the money and commission model using the approved offer and actual compensation policy, if supplied. Separate contract value, collection, settlement, payout, refunds/disputes, contribution, and commission states. Provide example ledgers and reconciliation tests. Label all projections and assumptions. Do not invent commission terms, authorize payouts, or treat commission per appointment as an hourly wage.
```

