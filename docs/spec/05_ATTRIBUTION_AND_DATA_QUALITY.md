---
document_id: SOS-05
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Attribution, denominator integrity, and data quality

**Read with:** [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [03_DOMAIN_MODEL_AND_EVENTS.md](03_DOMAIN_MODEL_AND_EVENTS.md)

## Purpose

Make accountability traceable without letting lead transfers, DQ decisions, duplicate records, stale data, or attribution changes rewrite the game. Attribution is a declared accounting policy for performance analysis, not proof of causation.

## Four histories that must not be collapsed

**Acquisition history:** original source, campaign, ad/form/page identifiers where available, referral relationship, acquisition time, and entry path. Preserve first-known values; append later touches rather than overwriting them.

**Ownership history:** who was responsible, for which role, and during which interval. Initial accountability, current operational ownership, setter contribution, closer contribution, and customer-success ownership can differ.

**Exposure history:** which script, reminder, communication profile, offer version, and experiment variant the customer actually encountered. Planned use and actual use are different.

**Financial history:** which payment dollars attach to which opportunity and commercial category. New business, repeat purchases, expansion, recurring receipts, and referrals remain separate categories.

## Attribution policy

Start with a simple, documented policy. A company-level opportunity-cohort report counts the opportunity and its cash once. For role leaderboards, build separately defined setter and closer cohorts, with frozen role-assignment rules and disclosed reassignment handling. Do not sum independent role leaderboards into company revenue.

For multi-representative monetary attribution, allocation weights for a given payment and attribution view must sum to one. Commission splits are a separate approved compensation policy; they are not automatically the same as analytical influence credit. Record `policy_version`, effective date, allocation reason, source event, and approver.

When an opportunity is reassigned, retain original accountability and operational intervals. If attribution is revised, show a report revision. Reassigning a difficult lead does not make it disappear. No representative can improve their denominator by moving a record to an unmonitored bucket.

## Identity and deduplication

Normalize phone and email formats, but do not merge people merely because they share a company number, household phone, generic inbox, or similar name. Use verified contact points and source identifiers as evidence. Ambiguous matches go to review.

Repeated inquiries can enrich one active opportunity without generating fresh lead credit. A genuinely new offer or buying cycle can create another opportunity under a declared cycle policy. Preserve the original inquiry events so acquisition volume and sales opportunity volume remain distinguishable.

## Lead-tier integrity

Store `lead_tier_at_assignment`, its definition, source evidence, and marketing-policy version. A tier must not be retroactively redefined after a representative wins or loses. Never declare pools identical just because they share a color. Source, campaign, offer, urgency, time, account size where explicitly collected, and assignment path can still vary.

Routing based on performance changes future lead composition. Reports need that policy context; otherwise the best-fed representative may appear intrinsically best. For experiments preserve actual candidate eligibility and assignment probabilities.

## Data quality states

Every scorecard reports:

- Source freshness and processing watermark.
- Identity-resolution coverage.
- Attendance evidence coverage.
- Qualification assessment coverage.
- Cash reconciliation coverage.
- Cohort maturity and unclosed opportunity count.
- Disputes/corrections pending that could change results.

Use `complete`, `provisional`, `stale`, `incomplete`, and `blocked` states. A stale result is not a normal current result with a tiny hidden disclaimer. Materially incomplete data pauses promotions, penalties, and financial automation.

## Reconciliation routine

Compare raw source events with intake records; intake with accepted opportunities; assignments with responsible queues; appointments with provider occurrences; payment movements with the processor ledger; and dashboard totals with canonical queries. Each discrepancy has severity, affected period, affected records, owner, and resolution.

A reconciliation fix cannot use invented values to make totals match. Missing provider amounts remain missing. Manual corrections need evidence and authorization. Keep before/after totals and a report revision identifier.

## Anti-gaming examples

**Deleting a DQ lead:** Block destructive deletion; retain the assigned denominator and DQ reason.

**Marking an appointment unqualified after a no-show:** Preserve the attendance denominator's locked eligibility and record the later assessment separately.

**Transferring a near-close deal for rank:** Preserve contribution history and apply the pre-agreed attribution policy rather than current-owner-only credit.

**Booking fake appointments:** Require customer/meeting evidence before rewarding attendance or quality outcomes.

**Overpromising to maximize revenue:** Quality, cancellation, refund, complaint, and fulfillment evidence remain linked to the original acquisition and sale.

**Early-month one-sale dominance:** Show sample size, maturity, and provisional standing; do not turn a tiny sample into permanent lead privileges.

## Acceptance criteria

A company report remains invariant under harmless UI reassignment. Multi-person attribution reconciles to company totals. A duplicate lead merge is reversible and audited. Tier history survives promotion. A late refund updates the originating cohort. A failed integration visibly changes data state. A manager can reconstruct why a displayed RPL changed between two report revisions.

## Agent task prompt

```text
Design or audit the attribution and data-quality layer. Return entity grain, denominator policy, source and assignment snapshots, revenue allocation rules, reconciliation jobs, and anti-gaming tests. Explain how reassignments and corrections affect each report. Do not present attribution as causation or silently assume all leads in a tier are exchangeable.
```

