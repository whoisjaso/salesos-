---
document_id: SOS-02
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Canonical metric contracts and denominator rules

**Read with:** [01_SOURCE_AUDIT_AND_CORRECTIONS.md](01_SOURCE_AUDIT_AND_CORRECTIONS.md), [03_DOMAIN_MODEL_AND_EVENTS.md](03_DOMAIN_MODEL_AND_EVENTS.md), [19_REVENUE_COMMISSIONS_AND_FORECASTS.md](19_REVENUE_COMMISSIONS_AND_FORECASTS.md)

## Amendments

**2026-09-20.** Added the net-collected-cash metric contract required by the payments specification section 7, and raised `definition_version` from `1.0` to `1.1` because the cash basis genuinely narrowed. The implementation is `DEFINITION_VERSION` at `src/domain/metrics.ts:58`. Every default in the new contract is marked PROPOSED DEFAULT, PENDING OWNER RATIFICATION and is registered as a numbered open decision in [28_TRACEABILITY_AND_OPEN_DECISIONS.md](28_TRACEABILITY_AND_OPEN_DECISIONS.md). Amending this module leaves its `sha256` in `MANIFEST.json` stale; see correction C-03 in module 28.

## In plain language

Two people must get the same number from the same records. Every percentage needs a named numerator, denominator, time basis, eligibility rule, and definition version. A beautiful funnel built from incompatible populations is still wrong.

## Three separate reporting views

**Source-reproduction view:** Reproduce the supplied spreadsheet with its own labels, clarified as `leads → retained bookings → shows → perceived qualified shows → wins → reported revenue`. This is an illustrative imported snapshot. It is not the universal operating funnel.

**Opportunity-cohort view:** Select opportunities by initial accountable assignment date, offer, workflow, and lead-source attributes. Follow those same opportunities through a declared observation horizon. This is the primary basis for lead-efficiency comparisons. One person can have multiple legitimate opportunities, but a duplicate submission cannot create a new accountable opportunity by itself.

**Activity/appointment view:** Count events that happened, or appointments scheduled, within a period. Useful for today's workload, actual attendance, dial counts, and cash receipts. Do not divide this month's cash by this month's new leads and call it cohort performance when older opportunities generated that cash.

## Accountable lead definition

For this product, an accountable lead is a **unique accepted opportunity intake assigned into the measured sales process**. Record raw submissions separately. Source-level calendar-booking leads and general contact-form inquiries must have distinct `entry_path` values.

Assign a permanent `opportunity_id`, an initial accountability owner or team, `accountability_started_at`, and a versioned eligibility decision. A representative's subsequent DQ does not erase the opportunity from the assigned denominator. Genuine duplicate/test corrections require a centralized audited adjustment and restate affected reports. Independently approved exclusions are visible, not silently removed.

## Canonical measures

| ID | Display label | Definition |
|---|---|---|
| M01 | Raw inquiries | Unique source submission events after transport-level replay deduplication; may include repeated people. |
| M02 | Assigned opportunities | Unique accountable opportunities in the declared cohort, after audited system corrections. |
| M03 | First permitted attempt time | First compliant human/approved-automation attempt minus accountability start; also show source-to-ingest and ingest-to-assignment delay. |
| M04 | Two-way contact rate | Opportunities with verified two-way communication / assigned opportunities. Voicemail, email delivery, and bot-only acknowledgment do not establish customer contact. |
| M05 | Booking rate | Opportunities with a booked appointment / opportunities eligible for the specified entry path and stage. Name the denominator on screen. |
| M06 | Retained-booking rate | Unique opportunities with a retained relevant booking / assigned opportunities, restricted to the declared booked-entry workflow. Not a contact rate. |
| M07 | Pre-call DQ rate | Opportunities disqualified before the relevant appointment / assigned opportunities for that workflow. Do not use `1-retained/assigned` unless all non-retained cases are actually DQ. |
| M08 | Appointment show rate | Confirmed attended eligible appointment instances / all eligible matured appointment instances in the scheduled-date cohort. See attendance rules below. |
| M09 | Perceived qualified-show rate | Rep-perceived qualified attended opportunities / attended opportunities in the same stage cohort; display rating coverage separately. Unknown is not No. |
| M10 | Verified-fit rate | Attended opportunities meeting the approved evidence-based fit policy / attended opportunities, with policy and assessment coverage visible. |
| M11 | Qualified-to-win rate | Won opportunities / qualified opportunities under the same qualified definition, observation horizon, and outcome cutoff. |
| M12 | Show-to-win rate | Won opportunities that reached the relevant attended stage / unique attended opportunities in that opportunity cohort. |
| M13 | Lead-to-win rate | Won opportunities / assigned opportunities in the same opportunity cohort. |
| M14 | Leads per win | Assigned opportunities / won opportunities. Zero wins yields `N/A: no wins`, never zero. |
| M15 | Reported/booked revenue per lead | Approved contracted or imported reported amount / assigned opportunities; prominently label the basis. Not cash. |
| M16 | Net collected revenue per lead | Cohort-attributed net collected cash, as defined by the net-collected-cash contract below, / assigned opportunities. Only processor-confirmed live movements enter the numerator. Exclude taxes and pass-throughs from the commercial revenue basis. |
| M17 | Revenue per conversation | Eligible cohort revenue / verified live conversations, specifying whether repeat conversations are counted. Never label retained bookings as conversations. |
| M18 | Contribution per lead | (Eligible net collected revenue minus defined attributable costs) / assigned opportunities. Show which costs are included and whether estimated. |
| M19 | Commission per attended appointment | Eligible commission amount / attended appointment instances. Not an hourly rate. |
| M20 | Commission per live-call hour | Eligible commission amount / measured customer-facing call hours. |
| M21 | Commission per tracked work hour | Eligible commission amount / all tracked selling-related work hours, including prep, follow-up, and administration. Incomplete time coverage makes this provisional. |

## Attendance denominator and unresolved evidence

An eligible appointment instance has a scheduled start in the selected window, a declared meeting type, and eligibility at the policy's cutoff. The instance is mature only after its end/grace period plus expected provider-delivery lag. Reschedules before the cutoff supersede the old instance; the lineage and rescheduling count remain visible. Late cancellations and after-cutoff reschedules remain in the locked denominator with their own outcomes. They are not automatically no-shows.

Unresolved attendance is `UNKNOWN`. While unknown cases remain, show `confirmed attendance / eligible instances` as a **provisional lower-bound observed rate**, an upper bound `(attended + unknown) / eligible`, and evidence coverage. Do not award rank or penalties from unresolved cases. Never improve a show rate by deleting no-shows or labeling them DQ afterward.

## Stage compatibility

A direct calendar booking can happen before a conversation. A legitimate repeat sale may skip discovery. A DQ opportunity may later be reactivated. Therefore a single rigid linear state is insufficient.

The percentage between two funnel cards may be shown only when the numerator is a defined subset of that exact denominator. If it is not, show separate counts or a split path rather than a misleading connector. Multiplying stage rates reproduces end-to-end conversion only for nested populations with consistent identities, time cutoffs, and stage rules.

## Time, money, and aggregation

Store timestamps in UTC and render them using an explicitly selected business timezone. Use half-open intervals `[start, end)` and store actual as-of time. Month boundaries do not erase cohort history. Set the default maturity horizon during pilot measurement based on the offer's observed sales and refund cycle; 30, 60, or 90 days are candidate settings, not universal truths.

Store money as integer minor units with an ISO currency. Never combine currencies without a disclosed rate source, conversion date, and reporting-currency policy. Team conversion is `sum(numerators) / sum(denominators)`, not the mean of representative percentages. Team RPL is `sum(eligible revenue) / sum(eligible leads)`.

Refunds and disputes are movements of a payment ledger. Never subtract an unpaid receivable from cash that was never collected, or subtract the same disputed dollars as both a refund and a chargeback. Late adjustments restate cohort results and create visible report revisions.

## Net collected cash: the written metric contract

Payments specification section 7 requires a written contract approved before implementation. This is that contract. It governs M16, the owner economics tile, the cash race, tier thresholds, and the commission basis. The compensation consequences of the same contract are in [19_REVENUE_COMMISSIONS_AND_FORECASTS.md](19_REVENUE_COMMISSIONS_AND_FORECASTS.md); the two modules must not diverge.

**Definition.** Net collected cash for a period and a scope is the sum of monetary movements that are all of:

1. `processor_confirmed` in evidence class,
2. in the `live` environment,
3. denominated in one currency, summed with movements of that same currency only,
4. of a cash-moving ledger kind: `payment_collected` and `dispute_credit` add, `refund` and `dispute_debit` subtract,
5. counted exactly once per economic movement identity, not once per delivery.

Implementation: `netCollected` at `src/domain/metrics.ts:290`, backed by `countsAsNetCollectedCash` at `src/domain/events.ts:154` and `ledgerSign` at `src/domain/events.ts:117`. `DEFINITION_VERSION` is `"1.1"`.

**What is never net collected cash.** A discussed price. A contracted value. An authorization. A payment still processing. A success redirect. An invoice marked paid outside the processor. A zero-balance or complimentary invoice. A wire, check or cash recorded by a person. A spreadsheet or CRM import. A test-environment movement. A provider-reported view of a movement whose processor record is the authority. Each of these remains a genuine record, is stored with its evidence class, and is reported on its own terms. None is silently summed into a sales metric.

### The seven required answers

Every row is a PROPOSED DEFAULT, PENDING OWNER RATIFICATION. The code holds each one as a single named field on `NET_COLLECTED_CASH_POLICY` at `src/domain/types.ts:529`, marked `ratified: false`, so ratifying a different answer is one edit rather than a search through call sites.

| # | Question from specification section 7 | Proposed default | Alternatives the owner may choose instead | Open decision |
|---|---|---|---|---|
| 1 | Is tax excluded from the sales-performance base? | Yes. Tax and other pass-through amounts stay out of the commercial basis. `passThroughExcluded: true`. | Include tax and disclose it as a separate line; or exclude tax only where the provider itemizes it and mark the rest provisional. | Answered in this module at version 1.0. Reaffirmed, no open decision. |
| 2 | How are discounts represented? | A discount reduces the order's `contractedValue`. It never appears as a negative cash movement and never reduces collected cash. `discountsReduceContractedValue: true`. | Record the discount as its own ledger line against the order so gross contracted value stays visible; or carry both, with the discount line as the audit record and the reduced contracted value as the reported figure. | D18 |
| 3 | Are processing fees excluded from this metric or shown separately? | Both. Fees are excluded from net collected cash and reported separately by `processingFees` at `src/domain/metrics.ts:303`. Collected cash is the customer's gross payment; the fee is a cost, not a smaller collection. | Report net-of-fee cash as the headline and gross as the secondary figure; or keep fees out of this metric entirely and handle them only in contribution analysis (M18). | D19 |
| 4 | Which confirmed refunds and lost disputes reduce it? | A `processor_confirmed` refund reduces cash on its occurrence date. A lost dispute reduces cash exactly once, through a `dispute_debit`, never additionally as a refund. | Reduce on the settlement date rather than the occurrence date; or hold refunds in a reserve until a maturity horizon passes. | Single subtraction answered in this module at version 1.0. The timing choice rides with D22. |
| 5 | How do open disputes appear as at-risk funds without double subtraction? | An opened dispute produces an at-risk figure only. `dispute_opened` has sign `0` and creates no debit; `disputeAtRisk` at `src/domain/metrics.ts:308` reports the exposure beside the cash figure with its own text label. A lost dispute then debits once; a won dispute clears the risk and mints nothing. | Subtract open disputes immediately and credit them back on a win, accepting a figure that moves twice for one event; or hide the at-risk figure from reps and show it to the owner only. | D20 |
| 6 | How are currency conversion and reporting dates handled? | Refuse. Movements are kept in their original currency and exact minor units. Summing two currencies throws `CurrencyMismatchError` (`src/domain/money.ts:8`) rather than guessing a rate. A multi-currency workspace reports one figure per currency until a conversion policy with a named rate source, conversion date, and reporting currency is ratified. `crossCurrencySum: "refuse"`. | Convert at the movement's occurrence date using a named daily rate source and store both original and converted amounts; or convert at period close using a single period rate, disclosed on the metric. | D21 |
| 7 | How is a refund after a closed leaderboard period reflected? | Restate and disclose. The adjustment restates the period the original movement belongs to, the restatement is visible as a report revision, and the closed period's standings carry a revision note. It is never applied silently to the open period. `lateAdjustment: "restate_the_period_and_disclose"`. | Apply the adjustment to the open period and disclose the origin period, which keeps closed standings frozen but makes the open period wrong; or freeze the closed period entirely and record the adjustment only in an audit view. | D22 |

### Counting once

Net collected cash is counted once per economic movement, not once per delivery and not once per view of a sale.

- A checkout event, a payment-intent event and an invoice event describing one payment post one ledger row. The movement key is `buildEconomicMovementKey` at `src/domain/events.ts:74`; the key returns `undefined` rather than guess when the movement cannot be named, and an unnamed movement is never posted as a duplicate-safe fact.
- A historical import and a webhook carrying the same movement post one row, because both paths use the same key.
- Setter, closer and pair reports may each display the same money, because those are role-attributed views. They are not additive. Company net collected cash counts it once. A view that mixes role attribution with a company total is a defect, not a presentation choice.
- Where a commerce platform and its underlying processor both expose one collection, one source is authoritative and the other is supporting evidence. Cross-provider similarity of amount, date or name is never sufficient to merge. An unresolved overlap is isolated from additive totals, with the limitation stated at the affected metric and nowhere else.

### Coverage and honesty of the figure

A net collected cash figure states the coverage it actually has. A verified zero and an unavailable figure are different words in different weights: "$0 collected" is a measurement, "payment data not available" is an absence. Where a historical import covered less than the requested window, the figure discloses the actual coverage rather than presenting a partial history as complete. Where movements are unattributed, the cash stays in the correct workspace's unallocated records, attribution-dependent outputs are marked provisional, and unrelated selling continues.

Collected cash is an operating metric. It is not accounting revenue recognition, and it is not profit.

## Required metric payload

```json
{
  "metric_id": "M08",
  "definition_version": "1.1",
  "value": 0.8,
  "numerator": 40,
  "denominator": 50,
  "unknown_count": 0,
  "unit": "ratio",
  "cohort_id": "appointment_cohort_example",
  "time_basis": "scheduled_start",
  "as_of": "2026-09-18T20:00:00Z",
  "comparison_status": "descriptive_only",
  "benchmark_id": null,
  "data_state": "complete",
  "evidence_query_id": "query_example_08"
}
```

A bare `61%` without a denominator or definition is not a valid analytics API result.

## Acceptance criteria

Zero-denominator calculations show N/A. Duplicate webhook delivery changes no totals. Three event types describing one payment change totals once. DQ never improves RPL by removing assigned leads. Reschedules follow lineage rules. Lead and revenue cohorts align. Unresolved attendance is visible. Imported reported revenue cannot appear in a collected-cash tile. An invoice marked paid outside the processor cannot appear in a collected-cash tile. A test-environment movement changes no live figure. An opened dispute shows as at-risk and subtracts nothing. Two currencies are never summed. Each displayed number opens a reconciliation view with its included records.

## Agent task prompt

```text
Define or review a metric using the contracts in this file. Return numerator, denominator, entity grain, cohort, maturity rule, source of truth, exclusions, null handling, and an example. Explicitly distinguish retained bookings, dial attempts, human conversations, and attendance. Reject invalid cross-cohort ratios rather than inventing a convenient calculation.
```

