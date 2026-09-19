---
document_id: SOS-28
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Requirements traceability, transcript discoveries, and open decisions

**Read with:** [01_SOURCE_AUDIT_AND_CORRECTIONS.md](01_SOURCE_AUDIT_AND_CORRECTIONS.md), [25_BUILD_BUY_AND_DELIVERY_GATES.md](25_BUILD_BUY_AND_DELIVERY_GATES.md), [29_SOURCES_AND_RESEARCH.md](29_SOURCES_AND_RESEARCH.md), [30_USER_SUPPLIED_TRANSCRIPT.md](30_USER_SUPPLIED_TRANSCRIPT.md)

## Purpose

Preserve what the user asked for, show where it is specified, and prevent a future agent from confusing an attractive source idea with an approved production feature. The requirement IDs below represent the current conversation's intent; they are not a claim that the user approved every proposed default.

## User requirement coverage

| Requirement | User's requested outcome | Authoritative modules |
|---|---|---|
| U-01 | Actual separate Markdown files usable by another AI | README, AGENTS, 27, all module files |
| U-02 | Understandable stage counts and A-to-B conversion rates | 01, 02, 20 |
| U-03 | Subtle green/amber/red outline or glow for performance | 20; stage-specific definitions in 02 |
| U-04 | Overall salesperson performance without relying only on total revenue | 14, 19, 21 |
| U-05 | Automatic tracking of leads, calls, shows, fit, wins, and cash | 03, 04, 05, 12, 13, 19 |
| U-06 | Clean immediate lead queue and calling experience | 06, 09 |
| U-07 | Distinct setter and closer experiences | 09, 10, 11 |
| U-08 | Lead-to-salesperson ego/personality/relational pairing | 06, 07 |
| U-09 | Psychology that supports contextual communication | 07, 08 |
| U-10 | Gamification, public progress, and leaderboards | 14, 15 |
| U-11 | Stage-by-stage SOPs and team replication of useful practices | 11, 17 |
| U-12 | Iterative improvement and adaptive language, not a static script | 17, 18 |
| U-13 | Tips that show how a representative might improve earnings | 16, 19 |
| U-14 | Revenue efficiency and bottleneck-based owner decisions | 02, 14, 21 |
| U-15 | Avoid unnecessary custom-building when existing software is better | 00, 22, 25 |
| U-16 | Depth, reasoning, and an actionable AI prompt per subcategory | Every substantive module; coordinated in 27 |
| U-17 | Learn additional features from the supplied transcript | 01, this file, 30 |
| U-18 | Preserve leverage, control, continuity, and aligned incentives | 06, 19, 23, 24 |
| U-19 | Personal significance of 777 without treating it as an economic law | 01, 15 |

## Transcript-derived feature decisions

| Source idea | Product treatment | Where / activation |
|---|---|---|
| RPL is the principal leaderboard measure | Adopt commercial efficiency, with clear basis, cohorts, quality, and comparability limits | 02, 14, 19; after trusted data |
| Calls exclude bookings removed in pre-call DQ | Correct the imported source definition; do not confuse with dial/conversation counts | 01, 02; immediate contract |
| Pre-call work can improve attendance | Add preparation, reminders, and evidence-based show coaching | 11, 12, 16; test actual impact |
| Better performance earns better leads | Bounded progression with source snapshots, capacity, and a development pool | 06, 14, 15; controlled later policy |
| Greater availability earns routing priority | Count deliverable capacity, not merely posted slots | 06, 12; pilot |
| Team sees rankings and examples | Share approved performance and redacted learning, not unrestricted customer records | 14, 15, 17 |
| Qualified-show rate reflects rep confidence | Keep perceived fit separate; do not treat it as proof of a mental state | 13; immediate contract |
| Lower DQ is desirable | Evaluate fit and full-cohort economics; no universal low-DQ target | 13, 21 |
| Effective hourly rate equals commissions divided by shows | Relabel as commission per attended appointment; require time for hourly labels | 02, 19 |
| Mid-month estimates motivate reps | Provide labeled run rates/scenarios, maturity and uncertainty, not promises | 16, 19 |
| Efficiency cost compares against a peer | Use a non-punitive benchmark opportunity scenario, not lost money or debt | 01, 16, 21 |
| Monthly reset and mid-month movement | Reset season display only; preserve history and provisional status | 14, 15 |
| Double booking offsets no-shows | Not a default; controlled exception only with backup and customer safeguards | 12 |
| More calls create better reps | Encourage deliberate practice and real capacity; do not assert causation from the sheet | 15, 17, 18 |
| Reps learn from call reviews and account management | Add evidence library and product-to-sales feedback | 16, 17 |
| Large earnings attract talent | Actual approved context may be shared under policy; no typical-earnings guarantee | 15, 19, 23 |
| New, recurring, referral and backend revenue differ | Separate commercial categories and avoid double-counting | 05, 19 |
| The source scaled with a small high-output team | Treat as a reported business example, not a staffing benchmark | 01, 21, 25 |
| Rep confirms AI outcome | Superseded: the transcript decides with banded probabilities per stage (contacted, qualified, buying, bought; bands-1.0: 80 Yes, 63 Likely, 40 Unlikely, owner-set); stages move at the band, lean below it; dispute only, no confirm. Money, consent, attendance still from ledger and providers | `src/domain/callIntelligence.ts` (StageScores, BandPolicy, applyExtractionPolicy auto mode), `src/domain/lens.ts`, review screen (`src/lib/review.ts`, `src/components/review/`), setter post-call; owner decision in docs/DECISIONS.md |

## Important proposals, not approved facts

Internal-first use for Obavia is a working assumption. The lens taxonomy is a proposed configurable library, not an authenticated scientific framework. A ten-second assignment objective is an engineering target to test. Any evaluation horizon, sample threshold, exploration allocation, reminder cadence, or game reward must be selected for the real operation.

No pricing, subscription plan, launch budget, exact offer, provider integration, commission rate, or delivery date is established by this pack. Examples are not approved policy merely because they appear in JSON or a table.

## Open decision register

| ID | Decision needed | Owner / blocking effect |
|---|---|---|
| D01 | Internal sales workflow first, dealer-facing product, or both in separate phases? | Product owner; blocks scope/productization. |
| D02 | First offer, price, buyer, outcome, and delivery capacity | Business owner; blocks qualification and revenue assumptions. |
| D03 | First entry path and whether setter/closer separation is necessary | Sales owner; blocks workflow configuration. |
| D04 | Current CRM, plan, calling, scheduling, meeting, and payment providers | Operations; blocks integration selection. |
| D05 | Jurisdictions, channels, recording/transcription basis, and retention policy | Owner with appropriate review; blocks live automation. |
| D06 | Actual compensation agreement and attribution policy | Owner/finance with review; blocks commission automation. |
| D07 | Opportunity identity, cycle, exclusion, and accountability rules for this offer | Sales operations/data owner; blocks valid RPL. |
| D08 | Cohort maturity, refund horizon, and reporting basis | Finance/analytics; blocks consequential comparisons. |
| D09 | Stage benchmarks, data-sufficiency rules, and quality gates | Sales/analytics; blocks performance colors and promotions. |
| D10 | Measured capacity, coverage, acceptance SLA, and backup owners | Operations; blocks safe routing. |
| D11 | What performance and compensation can be visible to the team | Owner/workforce policy review; blocks public pay displays. |
| D12 | Final profile taxonomy, evidence policy, and permitted activation | Product/privacy/sales; blocks inferred relational routing. |
| D13 | Development/exploration policy and ranking consequences | Sales owner; blocks performance-based allocation. |
| D14 | Engineering maintainer, budget, hosting, export and recovery plan | Owner; blocks a custom production component. |
| D15 | Exact external scripts or trainer materials to incorporate, with permission | User/content owner; blocks claims of faithful reproduction. |
| D16 | Access to the original spreadsheet and native definitions | Source owner; blocks treating image readings as verified operating data. |

## Decision defaults while unresolved

Do not buy or deploy. Do not send live messages. Do not activate recordings, inferred personality routing, automatic financial actions, or consequential rankings. Use neutral states instead of fabricated benchmarks. Test with synthetic or authorized sandbox data. Draft a narrow pilot proposal rather than asking the user to resolve every possible future feature before useful planning can continue.

## Acceptance criteria

Every requested feature has a home. Every consequential unknown has an owner and gate. Transcript claims are adapted explicitly. A new feature proposal includes source/need, expected benefit, maintenance cost, risk, and phase. Changes update the relevant contracts and tests rather than creating a second competing architecture.

## Agent task prompt

```text
Review a proposed change against the requirement and feature matrices. Identify the user need, source evidence, adaptation, risks, dependencies, and activation gate. Update the open decision register when required. Do not silently convert illustrative defaults, speaker claims, or unresolved provider assumptions into production policy.
```

