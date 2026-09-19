---
document_id: SOS-02
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Canonical metric contracts and denominator rules

**Read with:** [01_SOURCE_AUDIT_AND_CORRECTIONS.md](01_SOURCE_AUDIT_AND_CORRECTIONS.md), [03_DOMAIN_MODEL_AND_EVENTS.md](03_DOMAIN_MODEL_AND_EVENTS.md)

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
| M16 | Net collected revenue per lead | Cohort-attributed settled/collected eligible customer cash, adjusted by the ledger policy, / assigned opportunities. Exclude taxes and pass-throughs from the commercial revenue basis. |
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

## Required metric payload

```json
{
  "metric_id": "M08",
  "definition_version": "1.0",
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

Zero-denominator calculations show N/A. Duplicate webhook delivery changes no totals. DQ never improves RPL by removing assigned leads. Reschedules follow lineage rules. Lead and revenue cohorts align. Unresolved attendance is visible. Imported reported revenue cannot appear in a collected-cash tile. Each displayed number opens a reconciliation view with its included records.

## Agent task prompt

```text
Define or review a metric using the contracts in this file. Return numerator, denominator, entity grain, cohort, maturity rule, source of truth, exclusions, null handling, and an example. Explicitly distinguish retained bookings, dial attempts, human conversations, and attendance. Reject invalid cross-cohort ratios rather than inventing a convenient calculation.
```

