---
document_id: SOS-01
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Source audit, corrected interpretation, and worked example

**Read with:** [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [29_SOURCES_AND_RESEARCH.md](29_SOURCES_AND_RESEARCH.md)

## Why this document exists

Earlier responses made confident interpretations of a low-resolution spreadsheet before the transcript was available. Those interpretations must not become implementation requirements. This file supersedes those errors. Sources are the user's supplied transcript [U1] and screenshot [U2], preserved in this pack; neither is an independent audit of the speaker's business.

## Critical corrections

| Earlier interpretation | Correct treatment in this pack |
|---|---|
| The roughly 777 figure was calls | The high-volume representative's screenshot column shows 776 leads. It is not 776 completed conversations. |
| 475 calls meant completed calls or meaningful contact | The speaker explicitly defines these as calendar bookings retained after pre-call disqualification. Call attempts, connections, and live conversations are different metrics. |
| The high-volume representative had 150 shows | The screenshot appears to show **159**. Its displayed 33% show rate, 69% qualified-show rate, and 25% show-to-close rate are consistent with 159, not 150. |
| Lead-to-call was a contact rate | In this source it is the retained-booking rate: 475 / 776. |
| All qualification decisions were objective | The speaker describes the sheet's qualified-show measure as the representative's perceived fit, not an independently verified universal standard. |
| Ben was proven the best salesperson | Ben has higher observed revenue per assigned lead in this snapshot. Lead tiers differ, and skill, lead quality, capacity, and causal effects are not isolated. |
| Revenue per lead holds everything constant | It accounts for revenue per allocated opportunity, but does not by itself control source, offer, time, representative tenure, lead tier, or assignment selection. |
| Commission divided by shows is an hourly rate | It is commission per attended appointment. It becomes a live-call hourly rate only with measured live duration; an all-work hourly rate needs all work time. |
| A peer gap is money the representative lost | It is a benchmark scenario, not observed lost revenue or employee liability. |
| Calendar records prove attendance | A booking proves scheduling. Attendance needs separate evidence or human verification. |
| Novel language will necessarily work | Novelty is a testable communication hypothesis, not a guarantee of trust or conversion. |

## Source provenance and uncertainty

The sheet is headed August 2026. The supplied transcript refers to that prior month and a subsequent September view. Preserve these distinctions; do not combine them into one actual production dataset. The high-volume representative's written label appears to be **Taron**; the spoken transcript contains several inconsistent renderings. In examples use `rep_high_volume` rather than treating Torres, Toronto, Terron, and Taron as confirmed separate identities.

The source reports about $4.89 million of new sales-team revenue, more than $5 million including other revenue, 2,671 leads, 1,633 retained calls, and roughly 800 shows. These are **speaker-reported figures**. The source does not establish cash collection timing, refunds, revenue recognition, unique-person deduplication, or profitability. Do not replace the word revenue with collected cash in a reproduction of this sheet.

## Two-column transcription fixture

This is a text reading of the supplied image, not a native spreadsheet export. Values should be verified against the original sheet before being used as production records.

| Field | Ben | High-volume representative |
|---|---:|---:|
| Lead tier shown | 1 | 2 |
| Leads | 129 | 776 |
| Retained calendar bookings, labeled Calls | 85 | 475 |
| Shows | 71 | 159 |
| Representative-perceived qualified shows | 58 | 109 |
| Wins | 21 | 39 |
| Reported revenue | $686,000 | $1,234,000 |

## Recalculated metrics

| Derived measure | Formula | Ben | High-volume representative |
|---|---|---:|---:|
| Retained-booking rate | retained / leads | 65.89% | 61.21% |
| Pre-call DQ complement | 1 - retained / leads | 34.11% | 38.79% |
| Show rate | shows / retained | 83.53% | 33.47% |
| Perceived qualified-show rate | perceived qualified / shows | 81.69% | 68.55% |
| Win / perceived qualified | wins / perceived qualified | 36.21% | 35.78% |
| Show-to-win rate | wins / shows | 29.58% | 24.53% |
| Lead-to-win rate | wins / leads | 16.28% | 5.03% |
| Leads needed per win | leads / wins | 6.14 | 19.90 |
| Revenue per lead | reported revenue / leads | $5,317.83 | $1,590.21 |
| Revenue per retained booking | reported revenue / retained | $8,070.59 | $2,597.89 |
| Revenue per win | reported revenue / wins | $32,666.67 | $31,641.03 |

The apparent biggest stage difference is attendance after retention, not qualified-to-win conversion. However, these are different lead tiers. The first managerial action is a comparable-cohort investigation, not a conclusion that one person caused the gap.

## Counterfactual, explicitly not a forecast

Applying Ben's observed revenue per lead to 776 leads gives:

`776 × (686000 / 129) = $4,126,635.66`

This is about `3.3441 × $1,234,000`. It assumes the same lead mix, availability, conversion behavior, offer value, and downstream capacity despite a major increase in volume. Those assumptions are unverified. Display it only as an arithmetic scenario, not expected income, a hiring promise, or money owed by an employee.

Likewise, raising the high-volume representative's show rate to Ben's while holding that representative's downstream revenue per show fixed produces roughly $1.845 million of additional **theoretical reported revenue**. This comparison crosses lead tiers and ignores capacity; it is not the default coaching estimate. It belongs in a labeled teaching example, not a punitive dashboard.

## What to preserve from the speaker

Preserve whole-funnel accountability, revenue-per-opportunity visibility, stage coaching, transparent rules, attention to pre-call work, commission visibility, knowledge sharing, and comparison within meaningful lead categories. Adapt the mechanics of tiering, incentives, availability, and forecasting rather than copying them uncritically.

## What not to import as fact

The transcript does not prove that low perceived qualification means pessimism, high call volume causes skill, a particular team size fits our offer, the reported earnings are typical, the business harmed a competitor as claimed, double booking is safe, or the spreadsheet's entire incentive design caused $5 million in monthly revenue.

## Acceptance criteria

Any reproduction labels 475 as retained bookings; shows the corrected 159 reading with its provenance; distinguishes reported revenue from collected cash; includes the lead-tier difference; and does not label the source's qualified-show measure as verified buyer eligibility. All calculations retain full precision until display rounding.

## Agent task prompt

```text
Audit a proposed feature or metric against U1, U2, and this correction file. List what is directly stated, visually read, mathematically derived, hypothesized, or unknown. Replace prior misreadings rather than repeating them. Do not identify the original CRM or certify the speaker's revenue without evidence. Recalculate the two-column example and flag cross-tier comparisons.
```

