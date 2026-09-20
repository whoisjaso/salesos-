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

No pricing, subscription plan, launch budget, exact offer, provider integration, commission rate, or delivery date is established by this pack. Examples are not approved policy merely because they appear in JSON or a table. A worked example labelled "assumptions for this example only" is the clearest case of this rule and does not overwrite a recorded decision.

**No payment provider has ever been contacted from this repository.** There is no app registration, no OAuth credential, no bound merchant account, no received webhook, and no payment SDK installed. No migration in `supabase/migrations` has ever been executed against any project. Everything filed under payments is offline domain logic, synthetic fixtures, and SQL text. Provider approval, app publication, actually granted permissions, and installed SDK method availability are release gates, not assumed facts, and are tracked as D30 and in `docs/PAYMENTS_AUDIT.md` part 4.

## Contract corrections

AGENTS.md rule 2: when the spec modules and `src/domain/types.ts` disagree, fix the contract and record it here. Each row states what was wrong, what it is now, and how the claim was checked.

| ID | Date | Correction | Verification |
|---|---|---|---|
| C-01 | 2026-09-20 | `docs/ARCHITECTURE.md` named five implementation artifacts that do not exist: `ConnectorAdapter`, `src/data/adapters/*`, `src/domain/workflow.ts`, `src/domain/capacity.ts`, and `ActionLease`. All five rows are corrected to state what exists and where the real seam is. | Each name checked individually: repository-wide search across `.ts`, `.tsx`, `.sql` and `.md` for the two identifiers, directory and file listings for the three paths. All absent. |
| C-02 | 2026-09-20 | The same passage described the connector inbox as having an `idempotency_key` unique constraint. `provider_events` has no such column. Its uniqueness is the four-tuple `(tenant_id, provider, provider_account_id, provider_event_id)` at `supabase/migrations/20260918000000_sales_os_core.sql:491`. The four-tuple is kept because it is the better constraint: an external event id is not a global namespace. | Read the table definition at migration lines 478 to 495. `idempotency_key` appears on `outbox` and the write-side tables, never on the inbox. |
| C-03 | 2026-09-20 | Modules 02 and 19 amended, and this module amended. `MANIFEST.json` still carries the version 1.0.0 `sha256` for every file, so the hashes for the amended modules are now stale. Module 13 and this module were already stale before this pass. `MANIFEST.json` is not owned by this pass and was not edited. | Recomputed every `sha256` in `MANIFEST.json` against the files on disk. |
| C-04 | 2026-09-20 | `LedgerEntryKind` widened from five values to sixteen, so that the nine money states module 19 already required exist in the code contract. `EvidenceClass`, `provider`, `providerAccountId`, `environment`, `providerMovementId`, `orderId` and `attributionSnapshotId` added to `LedgerEntry`. `Opportunity.paymentState` gained `processing`. | `src/domain/types.ts:383` and the evidence block that follows it. |
| C-05 | 2026-09-20 | `DEFINITION_VERSION` raised from `"1.0"` to `"1.1"` in `src/domain/metrics.ts:58`, and the example payload in module 02 updated to match, because the net collected cash basis genuinely narrowed to processor-confirmed live movements. The dispute-open behaviour changed in the same pass: an opened dispute now yields an at-risk figure and no debit. | `src/domain/metrics.ts:58`, `src/domain/events.ts:117` (`ledgerSign`), and the amended contract in module 02. |
| C-06 | 2026-09-20 | The payments specification that drove this work (`OBAVIA_Simple_UX_and_Verified_Payment_Attribution_v2.md`) has no SOS number, no `MANIFEST.json` entry, and does not exist anywhere under this repository. Under `docs/spec/AGENTS.md` it therefore carries no authority here, and its proposed defaults are proposals. Landing it into `docs/spec/` with a number and a manifest entry is required before it governs anything. Not done in this pass: the file is not owned here. | `docs/spec/MANIFEST.json` lists 33 files, none of them this document. Reported, not fixed. |

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

## Payments and attribution decisions, opened 2026-09-20

D17 to D31 come from the payment evidence and attribution work. Every one of them is currently implemented as a **proposed default** held in a single named constant with `ratified: false`, so ratifying a different answer is one edit and not a search through call sites. Shipping code that uses a proposed default is not the same as the owner having decided it.

**D17. The attribution freeze point.**
Options: (a) capture at handoff acceptance and seal at order issuance, which is what the code does today; (b) seal at handoff acceptance alone; (c) seal at first successful payment; (d) seal at contract signature.
Recommendation: (a). It preserves the existing `pairId` behaviour recorded under "Pairs are relational" and adds a seal at the moment credit becomes financially consequential. (b) gives the first closer credit for an order a second closer later shaped. (c) leaves credit unknown at the moment the payment request is sent, which is exactly when the mapping must already exist. (d) needs a signed-agreement event this product does not always have.
Held at `ATTRIBUTION_FREEZE_POLICY`, `src/domain/types.ts:515`. Blocks: nothing today, because the code implements (a). Ratifying a different option changes who gets paid.

**D18. How discounts are represented.**
Options: (a) a discount reduces the order's contracted value and never touches cash; (b) the discount is its own ledger line against the order so gross contracted value stays visible; (c) both, with the line as the audit record and the reduced value as the reported figure.
Recommendation: (a) now, (c) when the owner wants discount reporting. (b) alone invites a discount being read as negative cash.

**D19. Processing fees: excluded, or netted out.**
Options: (a) excluded from net collected cash and reported separately, which is the current behaviour; (b) net-of-fee cash as the headline with gross secondary; (c) fees out of this metric entirely and handled only in contribution analysis (M18).
Recommendation: (a). Collected cash is what the customer paid. The fee is a company cost, and folding it in silently shrinks a representative's commission basis. Note that (b) changes pay and therefore needs D06 authorization as well.

**D20. How an open dispute appears.**
Options: (a) at-risk figure only, no debit, with a lost dispute debiting once and a won dispute clearing the risk, which is the current behaviour; (b) subtract immediately and credit back on a win; (c) show the at-risk figure to the owner only.
Recommendation: (a). Under (b) one event moves the number twice and a representative watches their standing fall and rise for a dispute they will win. (c) hides a fact that changes what a rep does next.

**D21. Currency conversion policy.**
Options: (a) refuse, which is the current behaviour: keep each currency separate and throw rather than guess a rate; (b) convert at the movement's occurrence date from a named daily rate source, storing both original and converted amounts; (c) convert at period close using one period rate, disclosed on the metric.
Recommendation: (a) until a second currency actually exists, then (b). A conversion policy needs a named rate source, a conversion date rule, and a reporting currency, and inventing one silently is worse than showing two figures.

**D22. A refund that lands after a period closes.**
Options: (a) restate the period the movement belongs to and disclose the revision, which is the current behaviour; (b) apply it to the open period and disclose its origin; (c) freeze the closed period and record the adjustment only in an audit view.
Recommendation: (a). (b) keeps closed standings frozen at the cost of making the open period wrong. (c) makes the reported history permanently inconsistent with the ledger. Whichever is chosen, an already-paid commission's recoverability is a compensation-agreement question under D06, not a software default; no recovery or wage deduction is implemented.

**D23. Attribution exception rules.**
The small predetermined set the owner defines once at onboarding: split credit, manager reassignment before payment, late close by a second representative, team assist, disputed ownership, and unallocated resolution. Options and recommendations for each are tabulated in module 19 under "Exception rules".
Recommendation: adopt the proposed set as written, with split percentages left to the owner. A language model is never asked to adjudicate a compensation dispute.
Held at `ATTRIBUTION_EXCEPTION_RULES`, `src/domain/attribution.ts:393`.

**D24. Tier naming versus commission.**
Two recorded decisions are in tension. "Money forward" names five tiers coins, cash, stacks, bags, diamonds and computes them from commission (`TIER_POLICY_BY_ROLE.basis` is `commission`). "Game words for the game, money words for money" then rules that a tier name is never the label on a commission figure. The payments specification adds that commission must not be called "Coins" unless it is genuinely a separate rewards mechanism, and the second tier is named "Cash", which is also this product's word for net collected cash.
Options: (a) rename the tiers so no tier name collides with a money word; (b) switch the tier basis to net collected cash so the badge is a cash badge and the commission number stands alone; (c) keep both and rely on the existing mitigations.
Recommendation: (b), because the race already runs on net collected cash and the two would then agree. (a) is equally defensible. (c) is not, because the collision is in the words themselves. Do not resolve this silently in either direction.

**D25. Launch posture: Level A only.**
Options: (a) ship observation only, with collection refused by server-side policy; (b) ship both levels behind a flag; (c) defer payments entirely until collection is also ready.
Recommendation: (a). Nothing in the product can create a charge today, and `checkCollectionAllowed` in `src/domain/connections.ts` now refuses one with a reason rather than silently succeeding. Level B is a separate grant, a separate consent, and a separate decision.

**D26. The historical import window.**
Options: (a) 90 days, owner-overridable, which is the current default; (b) 30 days; (c) 12 months; (d) all available history.
Recommendation: (a). It covers a normal sales cycle without a long first sync, and the import records the scope that actually loaded so a partial window is disclosed rather than presented as complete. The specification is explicit that the operator must set the real default before launch.
Held at `HISTORICAL_IMPORT_DEFAULT_WINDOW_DAYS`, `src/domain/types.ts:569`.

**D27. A second workspace connecting an already-bound merchant.**
Options: (a) reject with an explicit reason, which is the current default; (b) allow with an explicit allocation policy defining which workspace sees which records; (c) allow and replicate the merchant's data into both.
Recommendation: (a) until (b) has a reviewed allocation model. (c) leaks one business's records into another. Under no option is the conflict resolved by matching an email address.
Held at `MERCHANT_BINDING_CONFLICT_POLICY`, `src/domain/types.ts:575`. The cross-workspace unique binding on `(provider, provider_account_id, environment)` in the unapplied payments migration is what makes this a refusal rather than a merge.

**D28. Retention and export on disconnect.**
Options: (a) retain already-held records indefinitely and offer export; (b) retain for a named period, then delete; (c) delete on disconnect and offer export first.
Recommendation: (b) with the period named by the owner, and export available in every case. Gated on D05. Nothing is implemented, and the specification is explicit that the retention mechanism is a reliable workflow and useful records, not obstructed exports.

**D29. Confirmation of the hypothetical commission rates.**
The repository records 5 percent setter and 10 percent closer on net collected cash, per role, marked hypothetical. The payments specification's worked example uses 10 percent closer and 2 percent setter under a heading reading "assumptions for this example only".
Options: (a) confirm 5 and 10 as the real agreement; (b) ratify different rates; (c) keep them hypothetical until the compensation agreement is written.
Recommendation: (c) until D06 closes, and in the meantime every commission figure keeps its "Hypothetical policy" chip. The specification's example numbers are an illustration of arithmetic and must never overwrite the recorded rates. AGENTS.md rule 7 forbids changing commission logic without explicit authorization.
Held at `COMMISSION_RATE_DEFAULTS`, `src/domain/types.ts:559`. This is a sub-decision of D06, not a replacement for it.

**D30. Authorization to register a Stripe app, and to open a separate merchant test account.**
Nothing can be proven against a provider without both. Registration uses operator-owned credentials, and the install route must be proven against a merchant account that is not Obavia's own. A public install link additionally requires app publication; production use of a test link is forbidden.
Options: (a) authorize both now and begin external-test onboarding; (b) authorize registration only and defer the test merchant; (c) defer both and keep all payments work offline.
Recommendation: (a). Until it happens the state is `blocked_by_provider_access`, and every payments capability stays at `requires_setup` or `unsupported`. This is the single gate between the domain work that exists and any claim about a real payment.

**D31. The unclassified evidence fallback.**
`UNCLASSIFIED_EVIDENCE_FALLBACK` at `src/domain/events.ts:97` is `"processor_confirmed"`, so ledger rows written before the evidence class existed keep counting as they did and the pre-existing test suite stayed honest rather than being weakened. The database column carries no such default.
Options: (a) keep the permissive fallback and classify every writer, which is the current state and is protected by a test that pins the value; (b) flip the fallback to a class that is not cash, which is safer and will change existing fixture totals; (c) make the class required and refuse to post an unclassified movement.
Recommendation: (c) as the end state, reached by (b) once every writer is classified. The fixture importer already writes `imported_record`; the remaining unclassified rows are in fixtures.

## Decision defaults while unresolved

Do not buy or deploy. Do not send live messages. Do not activate recordings, inferred personality routing, automatic financial actions, or consequential rankings. Use neutral states instead of fabricated benchmarks. Test with synthetic or authorized sandbox data. Draft a narrow pilot proposal rather than asking the user to resolve every possible future feature before useful planning can continue.

## Acceptance criteria

Every requested feature has a home. Every consequential unknown has an owner and gate. Transcript claims are adapted explicitly. A new feature proposal includes source/need, expected benefit, maintenance cost, risk, and phase. Changes update the relevant contracts and tests rather than creating a second competing architecture.

## Agent task prompt

```text
Review a proposed change against the requirement and feature matrices. Identify the user need, source evidence, adaptation, risks, dependencies, and activation gate. Update the open decision register when required. Do not silently convert illustrative defaults, speaker claims, or unresolved provider assumptions into production policy.
```

