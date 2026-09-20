# Payments V2 audit: what exists, what is mocked, and what must be decided

**Date:** 2026-09-20
**Audited against:** `OBAVIA_Simple_UX_and_Verified_Payment_Attribution_v2.md` (version 2.0) and `CLAUDE_Obavia_Payments_V2_Prompt.md`
**Repository state:** `npm test` green at 30 files, 498 tests, run at the time of writing. Working tree clean.
**Status of this document:** an inspection report. It authorizes nothing. It applies no migration, calls no provider, and changes no commission logic.

## How to read this

This report uses six words with fixed meanings, as the handoff requires.

| Word | Meaning |
|---|---|
| implemented_and_tested | The code exists, I read it, and a test in this repository exercises it. |
| mocked | A screen or function renders or returns a result that no external system produced. |
| blocked_by_access | Cannot proceed without provider credentials, approval, or an owner decision. |
| awaiting_provider_review | Built but gated on a provider's publication or partner approval. |
| not_tested | The code exists but no test in this repository exercises it. |
| absent | No file, type, table, or function exists. |

Two limits on this report, stated up front. First, the actual Obavia app registrations, granted provider scopes, provider approvals, account eligibility, and installed provider SDK versions were **not available**. Nothing here establishes provider readiness. Provider readiness is a release gate, not an assumed fact. Second, no migration was applied and no provider was contacted, per `AGENTS.md` rule 7.

## Headline

The repository is stronger than the payments spec assumes in exactly the places that are hardest to retrofit, and weaker in exactly the places that carry money. The money primitive, the metric contract, the event reducer, and the scoped incident model are real, pure, and tested. There is no payment provider integration of any kind: no server, no route handler, no webhook receiver, no token, no secret store, and no outbound network call anywhere in `src/`. Every payment in the running product comes from a synthetic fixture or a spreadsheet import. Three things in the product overclaim today and should be corrected before any new capability is added: a simulated OAuth screen that tells the owner a Stripe permission was "Granted", a spreadsheet deal amount that becomes "Net collected cash", and a rep commission figure whose credit silently follows whoever owns the contact now.

---

# Part 1: Existing code and models to reuse, by path

These are load-bearing and should be extended, not replaced.

## Money and metrics

| Path | Lines | Why it is reusable |
|---|---|---|
| `src/domain/money.ts` | 36 to 53 | Integer minor units with an ISO currency. `add` and `sub` throw `CurrencyMismatchError` rather than guessing a rate. `scale` rounds to a minor unit. This already satisfies spec 15.3 "store money without binary floating-point rounding" and spec 7 "do not sum different currencies". Build the nine money concepts on top of this file. |
| `src/domain/metrics.ts` | 262 to 293, 296 to 354 | `ledgerFor`, `netCollected`, `contractedValue`, and `buildPayload`. Every money figure on every screen already routes through these. `buildPayload` enforces `MetricPayload` with `definitionVersion`, `dataState`, and `unknownCount`, which is the disclosure channel spec 17.2 and scenario 59 need. |
| `src/domain/metrics.ts` | 46 | `DEFINITION_VERSION = "1.0"` rides on every payload. Extending the metric contract means bumping this constant, not inventing a versioning scheme. |
| `docs/spec/02_METRIC_CONTRACTS.md` | whole file | The written metric contract already covers tax and pass-through exclusion, the no-double-subtraction rule for refunds and disputes, minor units, and a no-cross-currency rule. Spec 7 asks for a written net-collected-cash contract. Extend this document; do not author a competing one. |
| `docs/spec/19_REVENUE_COMMISSIONS_AND_FORECASTS.md` | 20, 28, 40 | Line 20 already enumerates almost exactly the spec's nine money concepts as a written requirement. Line 40 already lists the compensation terms the owner must settle. This is the contract to ratify, not to rewrite. |

## Event ingestion and de-duplication

| Path | Lines | Why it is reusable |
|---|---|---|
| `src/domain/events.ts` | 37 to 48 | `buildIdempotencyKey` composes `tenant:source:account:eventId`. This is the delivery-identity half of spec 17.5 and is correct. |
| `src/domain/events.ts` | 144 to 213 | `applyEvents` is a pure, order-independent reducer that dedupes by idempotency key, honors `supersedesEventId`, projects a ledger, and routes entries with no `opportunityId` into `unlinkedLedgerEntries`. This is the right seam for webhook ingestion. It needs a second, economic-movement key beside the delivery key. |
| `src/data/repository.ts` | 105 to 165 | `ProviderEvent` is spec 15.3's "Event receipt" record already designed and named, with provider, provider account, provider event id, received and processed times, and a pending/processed/failed status. Every method takes `tenantId`, and writes report `{applied: false, reason: "duplicate"}` so a redelivery is an ordinary outcome, not an error. |
| `src/data/memory.ts` | 185 to 263 | The reference idempotency and lease semantics, credential-free and deterministic. `src/data/__tests__/memory.test.ts` proves a provider event delivered three times is recorded once and that a foreign-tenant payload is rejected as invalid. This is where payment de-duplication should be proven before any provider exists. |
| `supabase/migrations/20260918000000_sales_os_core.sql` | 478 to 495 | `provider_events` with `unique (tenant_id, provider, provider_account_id, provider_event_id)`. Per-account scoping already exists here, which is half of spec 15.4. |
| `supabase/migrations/20260918000000_sales_os_core.sql` | 504 to 528 | `outbox` with `idempotency_key` unique per tenant, `lease_holder` and `lease_expires_at`, `attempts`, `max_attempts`, `next_attempt_at`, and a `dead` status. The retryable-job substrate spec 11 asks for is already modeled. It has no client code. |
| `supabase/migrations/20260918000000_sales_os_core.sql` | 391 to 410 | `ledger_entries` with `amount_minor bigint` plus `currency char(3)`, a non-negative magnitude with the kind carrying the sign, separate `occurred_at` and `received_at`, and a nullable `opportunity_id` documented as the unlinked-payment exception queue. Add columns here rather than a parallel table. |
| `supabase/migrations/20260918000000_sales_os_core.sql` | 633 to 688 | `reserve_task` and `release_task` are compare-and-set leases executed inside Postgres. This is the same pattern spec 14.4 needs to serialize a rotating refresh-token update. |

## Scoped failure handling, which already matches the spec

This is the strongest alignment in the repository and needs no redesign.

| Path | Lines | Why it is reusable |
|---|---|---|
| `src/domain/incidents.ts` | 38 to 133 | Six named surfaces, a per-surface disposition of provisional versus withheld, and `METRIC_SURFACES` plus `BASIS_SURFACES` so a consumer asks only about what it depends on. |
| `src/domain/incidents.ts` | 228 to 248 | `unlinkedPayments` builds the exception incident scoped to `["revenue_attribution", "commission"]` with the effect sentence "calling, appointments, conversation coaching, and every other verified result keep running". This is spec 11 "Scoped failure handling" and spec 17.4 "explain that limitation at the affected metric, not as a global pause" already implemented. |
| `src/domain/incidents.ts` | 556 to 585 | `holdFor`, `holdForMetric`, `standingsHold`, and `covers`. Note that `covers(incident, subject, id)` is defined and has **no caller anywhere in `src/`**, verified by grep. It is exactly the per-record isolation hook spec 17.4 needs. |
| `src/domain/game.ts` | 118 to 216 | `XP_SURFACE` binds only `cash_collected` and `attended_show` to a surface, so an unlinked payment holds cash XP and nothing else. Tested by name: "an unlinked payment does not pause XP, does not freeze the level, and does not break the streak". |
| `src/domain/coaching.ts` | 806 to 850, 870 to 907 | `coachingPlan` splits standing from held recommendations, and `transcriptRecommendation` has `dependsOn: []` so a rep with an unlinked payment still has a primary task. |
| `src/lib/owner-model.ts` | 160 to 176 | The owner-facing exception list, with each unlinked payment's amount, kind, provider reference, and date. The presentation layer for an operations queue already exists. |

## The boundary that keeps the model out of money

| Path | Lines | Why it is reusable |
|---|---|---|
| `src/domain/callIntelligence.ts` | 795, 866 to 873 | `FORBIDDEN_AI_EVENT_TYPE = /^(payment\|ledger\|consent\|permission\|attendance\|appointment\.attendance\|commission)/i`, enforced as a **throw**, not a filter, on every event the AI path constructs. This is the single most important existing expression of the spec's "a language model may be authoritative for none of the three". Extend this guard; do not build a parallel one. |
| `src/domain/callIntelligence.ts` | 154, 196, 206 to 213, 230 | `FORBIDDEN_EXTRACTION_FIELD` blocks money-named fields at four separate validation points and strips them from model output before validation. |
| `src/domain/callIntelligence.ts` | 1149 to 1290 | `FieldCorrection`, `validateCorrection`, `appendCorrection`, `correctionEvent`. An append-only correction history that copies the original value and its cited spans at flag time and never rewrites them. This is spec 5 step 7 and spec 17.5 "do not overwrite the original history" already working. |
| `src/domain/callIntelligence.ts` | 843 to 865 | The event envelope builder keeps `occurredAt` and `receivedAt` separate and carries `actorType`, `sourceSystem`, `sourceEventId`, and `evidenceRefs`. Spec 11's timestamp requirement has a home here. |

## Adapter and connection seams worth keeping

| Path | Lines | Why it is reusable |
|---|---|---|
| `src/domain/integrations.ts` | 111 to 130 | `AuthorizeRequest` and the `Authorizer` interface with `begin` and `complete`. This is exactly the seam spec 15.1 calls `beginConnection` and `completeConnection`. Keep the seam, replace the implementation, and widen the result type. |
| `src/domain/integrations.ts` | 16 to 38 | The `IntegrationProvider` registry with a real `category: "payments"` slot, plain-words permissions, setup steps, and the logo registry that honors the "Every brand gets its real logo" decision. Extend this row type rather than starting a second registry. |
| `src/domain/crmSync.ts` | 58 to 84 | `pullAll` is a resumable cursor drain over pages with progress callbacks, and is tested. The right shape for spec 15.1's `listPaymentsPage` and `listAdjustmentsPage`. |
| `src/domain/intake.ts` | 57 to 73 | `SourceConnection.webhookSecretRef`, documented as "Reference to a secret in the vault. Never the secret itself." The secret-reference discipline spec 14.1 requires is already this codebase's convention. Only the backing store is missing. |

## UI patterns that already do what the spec asks

| Path | Lines | Why it is reusable |
|---|---|---|
| `src/components/workspace/FinancialLadder.tsx` | 20 to 50 | Six money statuses on one line, only the current one drawn, the rest kept in the accessibility tree. It already refuses to show a positive amount without a `payment_collected` entry. This is where a Processing state and spec 5 step 6 belong, not a new card. |
| `src/components/cash/CashHero.tsx` | 446 to 460 | `MoneyValue` renders a verified zero as `$0.00` in the money face and a genuinely absent figure as words in a lighter face. This is scenario 35's distinction already built. |
| `src/components/cash/CashHero.tsx` | 74 to 77, 311 to 321 | The `ProvisionalNotice` contract: a scoped statement, what it waits on, who owns it, and the sentence "Everything else on this screen is verified and keeps running." |
| `src/components/workspace/EvidenceTag.tsx` | 1 to 33 | The provenance vocabulary Verified, Customer-stated, AI-proposed, rendered only inside Details sheets. Spec 15.3's evidence classification needs one more member of this set, not a new component. |
| `src/content/frameworks/personalMeaningListener.ts` | 261 to 292 | `ACCEPTANCE_EXPECTATIONS`, a numbered registry with a per-item `testKind`, asserted against the actual suite at `src/domain/__tests__/references.test.ts:449`. This is the pattern the 62-scenario checklist should copy so a false coverage claim fails `npm test`. |

---

# Part 2: Real provider integrations versus mocked screens and fixture data

## There are no real provider integrations

State: **absent**, at every layer.

| Claim to check | Finding | Evidence |
|---|---|---|
| Is there a server? | No. | `find src -name "route.ts" -o -name "route.tsx" -o -name "middleware.ts"` returns nothing. `grep -rn "use server" src` returns nothing. `src/app` holds only page components across 13 route directories. |
| Is there any outbound network call? | No. | `grep -rn "fetch(" src --include=*.ts --include=*.tsx` excluding tests returns nothing. The only network client in the repository is the Supabase client constructor at `src/data/supabase.ts:702`. |
| Is Stripe integrated? | No. One catalog row. | `src/domain/integrations.ts:62` is the entire Stripe presence: `auth: "oauth"`, `feeds: ["payments"]`, `permissions: ["Read payments, refunds, and disputes"]`, `setup: ["Tap Connect", "Approve in Stripe"]`, `oneLiner: "Cash in, refunds out, reconciled"`, `popular: true`. No Stripe client, no token exchange, no app registration, no webhook handler. |
| Is Whop present? | No. | Case-insensitive grep for `whop` across `src`, `supabase`, `docs`, and tests returns zero results. |
| Is Toast present? | No. | Zero occurrences as a provider. Correctly, no fabricated `/oauth/authorize` URL exists either. The gap is that there is no honest "Request connection" state to put in its place. |
| Is there a secret store? | No. | Zero matches for `access_token`, `refresh_token`, or `client_secret` in `src`. The `vault://` convention exists in fixtures only (`src/fixtures/sources.ts:28, 46, 64`), with no store, resolver, or reader. |
| Is there an environment concept? | No. | Case-insensitive grep for `livemode`, `live_mode`, `test_mode`, `sandbox` across `src` and `supabase` returns nothing. A test-mode movement and a live movement are indistinguishable. |

## What is mocked, and how honestly

| Path | State | Detail |
|---|---|---|
| `src/domain/integrations.ts:132 to 142` | mocked | `SimulatedAuthorizer.begin` mints its own redirect URL containing `code=simulated_<providerId>`. `complete` accepts any code with that prefix and returns `{ ok: true, accountLabel: "<Provider> account", grantedPermissions: p.permissions }`, that is, the catalog's own requested strings returned as the grant. Honestly labeled in the file header at lines 5 to 6. That honesty never reaches a screen. |
| `src/components/connect/ConnectSheet.tsx:50 to 63` | mocked | The owner-facing authorize path. It builds the request with `redirectUri: "sos://connect"` and a constant `state: \`st_${p.providerId}\``, calls `SimulatedAuthorizer.begin`, reads the fabricated code back out of the returned URL in the browser, and resolves on a `window.setTimeout`. No request leaves the browser. |
| `src/components/connect/ConnectSheet.tsx:81 to 107` | mocked | The success view: the provider's real logo with a filled `CheckCircle` in `text-perf-strong`, the account line, and a section headed "Granted" listing the permissions. |
| `src/components/connect/connect-model.ts:61 to 88` | mocked | `seedConnections()` manufactures five connections with `status: "connected"`, an account label, granted permissions, a connected-at date, and an event count, all from `src/fixtures/sources.ts`. The file header at line 4 states "Nothing persists (D04 pending)". |
| `src/components/import/ConnectCrmSheet.tsx` | mocked | The same simulated approve, then a deliberately paced progress bar over a bundled CSV constant, reading "Pulling contacts N of M". The pacing function is commented "Simulation only". |
| `src/domain/crmSync.ts:111 to 126` | mocked | `simulatedCrmSync` serves a fixture CSV as paged API responses and returns rows only for `contacts`. The import requests a `payments` object that silently yields nothing. |
| `src/fixtures/obavia.ts` | mocked | Every `LedgerEntry`, `CommissionEntry`, and `CommissionPolicy` the running app reads is generated here from a seed, with provider references shaped like Stripe ids (`pi_...`, `re_...`, lines 463, 617, 647). Correctly labeled: tenant name "Obavia (synthetic pilot tenant)" at line 69, `synthetic: true` at line 779, guarded by `src/domain/__tests__/obavia.test.ts`. The source system is the deliberately generic `card_processor` / `acct_main`, never a real provider name. |
| `src/components/workspace/BookingSheet.tsx`, `SetterWorkspace.tsx`, `CloserWorkspace.tsx` | mocked | Calendar invitations, replies, handoffs, and the call transport itself are local state changes. `LiveHead` renders a green dot, the word "Connected", and a "Provider" tag over a `setInterval` clock. |

## What is real and tested

| Path | State | Detail |
|---|---|---|
| `src/domain/money.ts` | implemented_and_tested | `src/domain/__tests__/money.test.ts`, 6 tests, including `CurrencyMismatchError` on both add and sub. Not covered: zero-decimal currencies. |
| `src/domain/metrics.ts` | implemented_and_tested | Pure, `now` injected, no `Date.now()`. `src/domain/__tests__/metrics.test.ts:136 to 155` proves M16 nets a refund and ignores a fee. Untested: mixed-currency ledgers, which would throw. |
| `src/domain/events.ts` | implemented_and_tested | `applyEvents` dedupes, supersedes, projects, and separates unlinked entries. Tested in `src/domain/__tests__/events.test.ts`. It has **no producer**: grep for `payment.succeeded` and its siblings across `src` returns only the map at `events.ts:118 to 125` itself and the tests. |
| `src/domain/cashTiers.ts` | implemented_and_tested | Tiers, `commissionBucket`, `commissionStatus`, `commissionSummary`, `cashRace`, `recentCashDrops`. Covered by `src/domain/__tests__/cashTiers.test.ts`. |
| `src/domain/incidents.ts` | implemented_and_tested | 20 tests in `src/domain/__tests__/incidents.test.ts`. Computes values from a `Dataset`; nothing is persisted. |
| `src/domain/callIntelligence.ts` | implemented_and_tested | 39 tests. Includes a prompt-injection case at `src/domain/__tests__/callIntelligence.test.ts:281` and a sweep at `:473 to 490` asserting no payment, consent, or attendance event in either policy mode, using a transcript that literally says "I paid the $4,800 already". |
| `src/domain/migration.ts` | implemented_and_tested | Header matching, preset detection, money and date parsing, dry run, idempotent import. 38 tests. The engine is correct. What it produces is misclassified; see the honesty violations. |
| `src/data/memory.ts` | implemented_and_tested | 12 tests including triple delivery recorded once, ledger idempotency, and cross-tenant isolation. |
| `src/data/supabase.ts` | not_tested | 935 lines implementing all eight `Repository` methods with explicit tenant filters. No test file exists and no database exists to run it against. |
| `supabase/migrations/20260918000000_sales_os_core.sql` | not_tested | 785 lines, 22 tables, forced RLS on every table. `supabase/README.md` states in bold that nothing in the directory has been applied to any Supabase project, gated on D04 and D14. |
| `src/domain/integrations.ts:144 to 169` | not_tested | `connect()` and `disconnect()` are pure state transitions. There is no `src/domain/__tests__/integrations.test.ts`. This is the only module in `src/domain` modeling a payment connection, and it has no test file. |
| `src/components/connect/` | not_tested | 671 lines across six files. No unit test, and no end-to-end test ever visits `/connect`. The complete list of routes the Playwright suite visits is `/`, `/team`, `/review`, `/me`, `/setter`, `/owner`, `/coach`, `/start`, `/closer`. |
| `src/lib/format.ts` | not_tested | The formatters the owner and rep screens actually call. `src/lib/__tests__/` contains only `qr`, `team-data`, and `zzprobe`. |

## Records the spec requires that do not exist

Grep across `src` and `supabase` confirms all five are **absent**: no type, no table, no function.

| Spec 15.3 record | State | Nearest existing thing |
|---|---|---|
| Connection | absent as a persisted record | `ProviderConnection` at `src/domain/integrations.ts:98 to 109`, held in React state only. No table. |
| Provider object link | absent | Unstructured strings: `LedgerEntry.providerRef`, `Call.providerCallId`, `DomainEvent.sourceEventId`. None carries provider, account, or environment. |
| Event receipt | partial | `ProviderEvent` at `src/data/repository.ts:105 to 117` and `provider_events` in the migration. Missing: occurrence time, retry history, environment, and a protected payload reference. It stores the raw payload inline as `jsonb`. |
| Monetary movement | partial | `LedgerEntry` at `src/domain/types.ts:330 to 344`. Missing: evidence class, provider, account, environment, and state. |
| Attribution snapshot | absent | Nothing. Credit is recomputed on every read from `Opportunity.currentOwner`. |
| Sync checkpoint | absent | Cursors exist only as local variables inside `src/domain/crmSync.ts:58 to 84` and are discarded when the call returns. |
| Exception | partial | `ScopedIncident`, recomputed from the dataset on every read, with a hardcoded `incidentId: "inc_unlinked_payment"` shared by every unlinked payment. No assignee, no resolution history, no table. |

---

# Part 3: The smallest implementation plan and its tests

Sequenced per spec section 19. Every step respects the existing architecture: the domain layer stays pure with no React, no `fetch`, and no `Date.now()`; every metric returns a `MetricPayload`; money stays integer minor units with an ISO currency; and every contract change is recorded in `docs/spec/28_TRACEABILITY_AND_OPEN_DECISIONS.md` per `AGENTS.md` rule 2.

## What can be built now with no provider access at all

Steps A1 through B1 below need no credentials, no app registration, and no owner policy decision beyond the ones already recorded. They are pure domain and schema work, testable against `MemoryRepository` and fixtures. This is most of the risk in the subsystem.

### Step A: inspect and correct (this document, plus three corrections)

**A1. Correct the present-tense overclaims.** No new capability should be added on top of screens that misstate what exists. The three fixes are listed in the honesty section below and are small: a connect-flow gate, an evidence class on imported cash, and a `RecentDrops` prop. Buildable now.

**A2. Record the contract corrections.** `docs/ARCHITECTURE.md` lines 31 to 35 name `ConnectorAdapter`, `src/data/adapters/*`, `src/domain/workflow.ts`, `src/domain/capacity.ts`, and `ActionLease`. I checked each: all five are **absent**. The same line describes `provider_events` as having an `idempotency_key` unique constraint; the actual constraint is the 4-tuple at migration line 491, which is the better constraint. Fix the document, keep the table, note it in spec 28. Buildable now.

### Step B: one Stripe observation path

**B1. Widen the money model. Buildable now, no provider access.**

- Extend `LedgerEntryKind` in `src/domain/types.ts:328` and the check constraint at migration line 396 to express the nine concepts of spec 7: add authorization or processing, processor balance, and payout, and split an opened dispute from a lost one.
- Add to `LedgerEntry` an `evidence` discriminator with the values `processor_confirmed`, `external_recorded`, `imported`, and `manually_marked_paid`, plus `provider`, `providerAccountId`, and `environment`. Add the same columns to `ledger_entries` and put provider, account, and environment into the uniqueness constraint per spec 15.4.
- Add `processing` to `Opportunity.paymentState` at `types.ts:107` and the constraint at migration line 183, and a Processing step to `LADDER_STEPS` in `src/lib/workspace-closer.ts:246`.
- Add an economic-movement identity beside the delivery key in `src/domain/events.ts` and dedupe on both.
- Exclude anything not `processor_confirmed` from the `net_collected_cash` basis until an owner policy admits it.

Tests, all runnable today: three provider event types describing one payment post once and total $3,000, not $9,000; a payment marked `manually_marked_paid` does not enter net collected cash; a test-mode movement changes no standing, no commission, and no XP; a zero-amount movement creates no cash, no XP, and no cash drop; an opened dispute produces an at-risk figure and no realized debit, and a lost dispute produces the debit exactly once.

**B2. Add the attribution snapshot. Buildable now, but gated on one owner decision (the freeze point).**

- Add `Order` and `AttributionSnapshot` to `src/domain/types.ts` and the migration: setter, closer, `pairId`, commission `policyVersion`, freeze point, and an append-only corrections list.
- Point `commissionSummary` in `src/domain/cashTiers.ts:212`, `cashRace` at `:395`, `recentCashDrops` at `:420`, and the XP credit in `src/domain/game.ts:75` at the snapshot. Leave `opportunityAttributedTo` in `src/domain/metrics.ts:160` in place for non-financial cohort filters, which is what it is good at.

Tests: reassigning `currentOwner` after a collected payment leaves both users' commission and both standings rows byte-identical; an operations user recorded as the sender of a payment request receives no closer credit; one contact with two orders produces two snapshots and two independent totals.

**B3. Split the connection state and the capability contract. Buildable now.**

- Replace the single `ConnectionStatus` enum at `src/domain/integrations.ts:96` with the three orthogonal axes spec 14.3 requires: authorization, sync coverage, and feature capability. Persist a `Connection` record and a `SyncCheckpoint` record.
- Record `requestedPermissions` and `grantedPermissions` as separate fields on `AuthorizeResult` and the connection, and persist the spec 15.2 capability contract with per-item values of `verified`, `pending_verification`, `not_requested`, or `unsupported`.
- Add an availability field to `IntegrationProvider` so a provider with no real onboarding path renders "Request connection" instead of opening `ConnectSheet`.
- Make the adapter boundary able to return `unsupported` and `requires_setup`, so the spec's rule "do not implement missing capabilities by returning fake successful responses" has an honest alternative available.

Tests: the owner-facing status string for each of the eight internal conditions in the spec 14.3 table; a connection whose payment-read probe failed never reaches a ready state; an authorized empty read renders differently from a forbidden one; a payments provider may not use `SimulatedAuthorizer`.

Note on an existing test that must change deliberately: `src/domain/__tests__/crmSync.test.ts:160` asserts `result.auth.grantedPermissions` equals `providerById.hubspot.permissions`, which encodes requested-equals-granted. Spec 14.2 item 4 requires them separate. Change that assertion to prove they can differ. This is a deliberate change to committed behavior, not a bug fix.

**B4. Stand up the server path. This is where provider access becomes a gate.**

- Add the first route handlers under `src/app`: an OAuth callback that completes the exchange server-side exactly once, and a signed webhook receiver that writes to `provider_events` first and returns early on the unique-tuple conflict.
- One-use, unpredictable, session-bound state plus PKCE S256. Today `ConnectSheet.tsx:53` uses the constant `st_<providerId>` and `complete()` never reads `state` at all.
- Credentials go to a managed backend secret store, never the browser. Keep the existing `webhookSecretRef` convention.
- Add `Repository` methods over the existing `outbox` table and a worker that drains `provider_events` into the ledger idempotently, plus a periodic reconciliation with a persisted cursor.
- Decide where impure adapters live. `AGENTS.md` rule 3 forbids `fetch` inside `src/domain`, and `vitest.config.mts:6` includes only `src/**/*.test.ts`, so an adapter placed outside `src` would be collected by no harness and would never go red. Recommended: `src/server/providers/`, inside the include pattern and outside `src/domain`. Add a test asserting no file under `src/domain` imports `fetch` or a provider SDK.

The milestone for Step B is not a green Connected badge. It is a genuine test-merchant payment whose verified evidence appears once in the correct workspace with correct credit, with no browser session and no model running.

### Step C: controlled payment-request creation

Only after B is proven and after the owner approves the collection policy. Add an outbound operation record over the existing `outbox` table with a caller-supplied idempotency key that is the same key sent to the provider, and a terminal status that is neither succeeded nor failed so an uncertain timeout blocks retry rather than issuing a second request. Add a server-side `assertCollectionAllowed(connection, operation)` policy function that refuses every collection operation unless the stored capability says authorized. Test the refusal table exhaustively now, before any adapter exists; it needs no provider access.

Put the spec section 10 discrepancy check on this path only. The transcript-side half needs a `moneyStatements` field on `CallExtraction` that is structurally incapable of being a fact: required speaker, required verbatim excerpt that must appear in a cited span, optional ISO currency, amount in minor units only when explicitly spoken, and no status or confirmation member. Exclude it from every emitted event payload and add it to the `FORBIDDEN_AI_EVENT_TYPE` test surface.

### Step D: Whop as a second adapter

Same ledger, same attribution, Whop-specific authorization, permissions, ids, events, amounts, and version pins. Test one separate business, one recurring path, and a denied or incomplete permission grant.

### Step E: defer Toast

Create the request-support state and a capability stub that truthfully reports unavailable. Do not write fabricated OAuth or payment endpoints. Toast is not a launch dependency.

## The 62-scenario checklist as code

Add `src/content/acceptance/paymentsV2.ts` exporting a numbered registry with `{ n, text, phase, status, coveredBy }`, and `src/content/__tests__/paymentsV2.test.ts` asserting that n runs 1 to 62 with no gaps, that every scenario marked `implemented_and_tested` names a test title that actually exists in the suite, and that every Toast and Whop scenario is `blocked_by_access` or `awaiting_provider_review` and never `implemented_and_tested`. That is two files and roughly five assertions, and it makes a false coverage claim fail `npm test`. Copy the pattern already working at `src/content/frameworks/personalMeaningListener.ts:261` and `src/domain/__tests__/references.test.ts:449`.

Namespace the new ids as PV2-01 through PV2-62 with a `supersedes` column, because this repository already has a register numbered T01 to T56 in `docs/spec/26_ACCEPTANCE_TESTS_AND_SCENARIOS.md` whose ids are cited inside live test titles (`src/domain/__tests__/events.test.ts:30` cites T01 and T37). Bare 1 to 62 would make "scenario 14" mean two different things.

---

# Part 4: Missing app registration, permissions, provider approval, credentials, and financial-policy decisions

## Provider prerequisites, none of which this audit could verify

| Item | State | Notes |
|---|---|---|
| Stripe app registration, using operator-owned credentials | blocked_by_access | No registration exists. Nothing in the repository references one. |
| Stripe external-test install link and a separate merchant test account | blocked_by_access | Spec 13.1 requires proving the install route against a merchant account that is not Obavia's own. |
| Stripe app review and publication | awaiting_provider_review | A public install link requires publication. Production use of a test link is explicitly forbidden by spec 13.1 and scenario 38. |
| Stripe permissions actually granted for payments, refunds, disputes, and `event_read` | blocked_by_access | The catalog string at `src/domain/integrations.ts:62` is Obavia's own wording, not a provider grant. |
| Whop development application, business-scoped grant, and event permissions | blocked_by_access | Whop does not exist in the repository. Spec 13.2 is explicit that `openid profile email` is insufficient. |
| Whop background-authorization lifecycle | blocked_by_access | Spec 13.2 requires determining whether the supported grant is login-only. If it is, background sync stays unavailable. |
| Toast partner approval and restaurant or location GUID mapping | blocked_by_access | Deferred per spec 19 Step E. Not a launch dependency. |
| Installed provider SDK versions and method availability | not_tested | No payment SDK is installed. `package.json` dependencies are `@phosphor-icons/react`, `@supabase/supabase-js`, `clsx`, `motion`, `next`, `react`, `react-dom`. Spec 13.2 and scenario 56 require validating methods against the installed release, not a documentation example. |
| A managed backend secret store | absent | No store, no resolver, no reader. The `vault://` strings in `src/fixtures/sources.ts` are fixture text. |
| A hosting target for the server path and the worker | blocked_by_access | Gated on D14. There is no CI either: no `.github` directory exists, so both test suites are run by hand and the recorded decision "Run on every build" is unenforced. |
| A Supabase project for the migration | blocked_by_access | Gated on D04 and D14 by `supabase/README.md`, and by `AGENTS.md` rule 7. |

## Financial and business-policy decisions only the owner can make

These block implementation, not the other way round. D04, D05, D06, D11, and D14 in `docs/spec/28_TRACEABILITY_AND_OPEN_DECISIONS.md` are all still open, and `docs/ROADMAP.md` phase 7 already states "Requires D04, D05, D06 resolved."

1. **The net-collected-cash contract.** `docs/spec/02_METRIC_CONTRACTS.md` answers tax and pass-through exclusion, single subtraction of refunds and disputes, and minor units. It does not answer five of the seven items spec 7 requires: how discounts are represented, whether processing fees are excluded or shown separately, how open disputes appear as at-risk funds, what the actual currency conversion policy is, and what happens to a refund arriving after a leaderboard period has closed. Today fees are captured and then dropped: `src/domain/events.ts:135` gives `fee` a sign of 0 and `src/domain/metrics.ts:279` makes it a no-op, so the spec's "excluded or shown separately" is answered with neither.
2. **The attribution freeze point.** Spec 5 step 2 proposes freezing when the approved order is issued for payment. This repository already freezes `pairId` at handoff acceptance per the "Pairs are relational" decision. Those are two different checkpoints. The owner must name one, or accept both with stated roles, before any snapshot code is written.
3. **The exception rules.** Spec 8 requires a small predetermined set defined once at onboarding: late close by a second representative, reassigned deal, team assist, disputed ownership, split credit, manager-approved reassignment before payment. None exists in `docs/DECISIONS.md`, in spec 19, or in code.
4. **Commission rates and release conditions.** D06 is open. The shipped default is the hypothetical policy at 5 percent setter and 10 percent closer, flagged `hypothetical: true` at `src/domain/types.ts:352`. The spec's worked example uses 2 percent setter and is labeled "Assumptions for this example only". Do not let the example overwrite the recorded decision.
5. **The historical import window.** Spec 17.2 says the operator must set the actual default before launch. No default exists.
6. **The shared-merchant policy.** Spec 15.4 and scenario 47: what happens when a second workspace connects an already-bound merchant. No registry exists to detect it, and no policy exists to apply.
7. **Retention and export on disconnect.** Gated on D05. Spec 14.4 and 18.3 say already-held records are preserved or exported only under the applicable retention policy, and no such policy is recorded.
8. **Whether observation-only is the launch posture.** Spec 16 Level A versus Level B. Recommended: yes, ship Level A first. Nothing in the product can create a charge today, so nothing is falsely enabled, but there is also no server-side policy that would deny one.

---

# Conflicts with this repository's already-approved decisions

Spec 19 Step A requires resolving conflicts with an approved payment business model before altering anything. The most important finding here is that **there is no approved payment business model in this repository**. Grep across `src`, `docs/DECISIONS.md`, and `docs/POSITIONING.md` for merchant, merchant-of-record, processor, and payout returns only fixture idempotency strings and commission-status prose. There is no Connect-versus-Apps-OAuth choice, no processor selection, and no payout model. The spec's Stripe Apps OAuth recommendation therefore reverses nothing and is safe to adopt as a proposal. Adopting it does answer part of D04 and must be recorded as such.

Seven real conflicts follow, each with a recommendation.

### 1. "OAuth first, always" versus providers with no real onboarding path

**Approved decision:** `docs/DECISIONS.md`, "OAuth first, always": for every connection the first option is Connect, authorize in the tool they already use, done.
**Conflict:** the principle is exactly what the spec wants. The implementation reads it as "OAuth always, simulated where unavailable", which produces the fabricated grant spec 12.1 forbids. Read literally it also gives Toast the Connect treatment, which spec 13.3 rules out.
**Recommendation:** keep the decision, amend one clause. "OAuth first where the provider's onboarding path is actually available in the current environment; otherwise Request connection." Add an availability field to `IntegrationProvider` and make `SimulatedAuthorizer` unreachable from `src/components`. Record the amendment in spec 28.

### 2. "Every brand gets its real logo" versus capability from evidence

**Approved decision:** `docs/DECISIONS.md`, "Every brand gets its real logo", implemented at `src/components/connect/ConnectScreen.tsx:109 to 142`.
**Conflict:** none on the logos. The conflict is that the logo tile is itself the primary affordance, so tapping any of the 27 tiles reaches a simulated success. Spec 15.2 requires capabilities displayed from evidence, not from the presence of a provider logo.
**Recommendation:** keep every logo. Separate the mark from the affordance: an unavailable provider renders its real logo with "Request connection". This satisfies both rules at once.

### 3. Ledger expressiveness versus the code contract

**Approved decision:** `src/domain/types.ts:328` defines five ledger kinds, mirrored by the check constraint at migration line 396.
**Conflict:** `docs/spec/19_REVENUE_COMMISSIONS_AND_FORECASTS.md:20` already requires almost exactly the spec's nine concepts, so the repository's own written contract and its code contract disagree. `AGENTS.md` rule 2 says fix the contract and note it in spec 28.
**Recommendation:** widen `LedgerEntryKind` and add the evidence class and provider, account, and environment fields. The blast radius is small because every consumer switches on kind in one of two places, `src/domain/metrics.ts:266 to 285` and `src/domain/events.ts:127 to 138`, plus the migration. The migration must not be applied to a live project without owner authorization.

### 4. The import decision versus evidence classification

**Approved decision:** `docs/DECISIONS.md`, "Bring existing data in without friction", implemented in `src/domain/migration.ts`.
**Conflict:** `src/domain/migration.ts:1313 to 1314` writes a won deal's amount into the ledger as `kind: "payment_collected"`, which is then summed into net collected cash exactly like a provider payment.
**Recommendation:** keep the import, add the classification. This is the single highest-value correction in the whole audit and needs no provider access.

### 5. Credit from current owner versus a frozen snapshot

**Approved decisions:** `docs/DECISIONS.md`, "Pairs are relational" and "Money forward", both reading through `src/domain/metrics.ts:160 to 174` and `src/domain/cashTiers.ts:212`.
**Conflict:** spec 2 and spec 8 forbid deriving historical credit from whoever owns the contact today. **I verified the current behavior empirically** by running the real `commissionSummary` against a one-opportunity dataset with a $3,000 collected payment and a 10 percent closer policy. Before reassignment, `closer_a` shows 30000 minor. After changing only `currentOwner.closer` to `ops_user`, `closer_a` shows 0 and `ops_user` shows 30000. The entire historical commission moved.
**Recommendation:** this is a completion, not a reversal. The owner has already accepted freezing at a checkpoint for pairs. Add `AttributionSnapshot`, point the money reads at it, and leave `opportunityAttributedTo` for non-financial cohorts. Do not change commission logic without owner authorization, per `AGENTS.md` rule 7.

### 6. "Coins" as a tier name on a commission figure

**Approved decisions:** two, in tension with each other. "Money forward" sets the five tiers coins, cash, stacks, bags, diamonds. "Game words for the game, money words for money" then rules that a tier name is never the label on a commission figure and that the tier mark lives in the game section.
**Conflict:** spec 7 says do not call commission "Coins" unless it is genuinely a separate rewards mechanism. `src/domain/cashTiers.ts:70 to 73` sets `basis: "commission"` for both roles, so the tier is computed from pay, and the badge renders beside the commission figure on the Me hero. The second tier is named "Cash", which is also this product's word for net collected cash.
**Recommendation:** owner decision, two defensible options. Either rename the tiers so no tier name collides with a money word, or switch `TIER_POLICY_BY_ROLE.basis` to `net_collected` so the badge is a cash badge and the commission number stands alone. The mitigations already in place are real: `commissionStatus` gives each bucket its own honest word, `cashRace` already runs on net collected cash, and the tier display note says tiers never change pay. Do not resolve this silently in either direction.

### 7. The V2 specification has no place in this repository's authority structure

**Approved rule:** `AGENTS.md` rule 2 and `docs/spec/AGENTS.md` make the modules in `docs/spec/` the governing product intent, with `docs/spec/MANIFEST.json` hashing 33 files at version 1.0.0.
**Conflict:** the V2 document is an upload with no SOS number, no manifest entry, and no row in the open-decision register. Neither it nor the version 1.0 document it supersedes exists anywhere under the repository. Under `docs/spec/AGENTS.md` rule 5, defaults marked proposed are not approved production policy.
**Recommendation:** land the document into `docs/spec/` with an SOS number and a manifest entry, and record the payment decisions it introduces as new D-rows, before implementing from it. Otherwise the repository's own precedence rules become inaccurate.

A minor documentation drift worth fixing in the same pass: `docs/DECISIONS.md` line 45 records pilot tiers at $1,000, $5,000, $25,000, $100,000 while `src/domain/cashTiers.ts:48 to 54` implements tiers-closer-1.1 at $1,000, $10,000, $30,000, $100,000, which is what the later "Pairs are relational" entry records. Two ladders are documented as current.

---

# Honesty violations to fix before anything else

These overclaim in the product **today**. Each is small. None needs provider access. They should land before any new capability, because every new capability would be built on top of a screen that misstates what exists.

### H1. A simulated authorization renders as a completed one

`src/components/connect/ConnectSheet.tsx:50 to 63` fabricates the code in the browser, waits on a `setTimeout`, and `:81 to 107` then renders the provider's real logo with a filled green check, the account line, and a section headed **"Granted"** listing the permissions. For Stripe, which is in the payments category and marked popular, the owner reads "Read payments, refunds, and disputes" as an accomplished grant. Nothing left the browser. Spec 12.1 names this exact failure: "A provider awaiting approval should say Request connection, not open a simulated authorization success screen." The button label also reads "Approving in Stripe" during the timer.

Compounding it: `src/domain/integrations.ts:140` returns `accountLabel: \`${p.name} account\``, fabricating a merchant account identity, which `DetailSheet.tsx:27` then renders as the bound account. And `integrations.ts:156 to 164` sets status `connected` directly from `result.ok` with no account read and no capability probe. There is also a password-type "API key" field at `ConnectSheet.tsx:130 to 141` whose value `authorize()` never reads, never transmits, and never stores, after which the success screen implies the credential was checked.

**Fix:** gate the tile on real availability, render "Request connection" otherwise, and never show a permission as granted that no provider returned.

### H2. A spreadsheet deal amount becomes "Net collected cash"

`src/domain/migration.ts:1313 to 1314` pushes a won row's deal amount into the ledger as `kind: "payment_collected"` with `providerRef: "import:deal:<hash>"`, and `:1339 to 1340` then sets `opportunity.paymentState = "collected"`. The comment directly above reads "never invented cash". A deal marked won in a CRM is a status, not evidence that money moved. That entry flows through `netCollected` into the owner hero labeled "Net collected cash" at `src/components/owner/MoneyView.tsx:59 to 68` and into the team cash race. `LedgerEntry` has no evidence field, so it is indistinguishable downstream from processor-verified cash. This is scenarios 16 and 60.

**Fix:** the evidence class from step B1, and stop minting processor-shaped rows from a won-deal column.

### H3. Credit silently follows whoever owns the contact now

Verified empirically, as described in conflict 5. `commissionSummary` is documented as "A rep's own commission for the season" and renders on the Me hero with the status line "Payable commission, not yet paid", while the credit behind it is a live read of `currentOwner` that a reassignment moves wholesale. The screen honestly discloses that the *rate* is hypothetical. It does not disclose that the *credit* can move.

**Fix:** the attribution snapshot from step B2. Until then, do not build commission release on top of this read.

### H4. An opened dispute is booked as a settled loss

`src/domain/events.ts:122` maps `payment.dispute_opened` to `dispute_debit` with a sign of -1, so the moment a dispute opens the money leaves net collected cash, and `src/components/owner/MoneyView.tsx:33` describes such entries as restating the original cohort. There is no `payment.dispute_lost` event, so opened and lost are the same assertion, and no at-risk figure exists. Spec 17.5: "Dispute risk and a recorded debit are different."

Related and cheap: `src/lib/workspace-closer.ts:256 to 262` has no branch for `paymentState === "disputed"`, so a disputed opportunity falls through to `contractState` and renders "Signed", showing no evidence a payment ever happened. `"refunded"` returns the same index as `"collected"`, so a fully refunded opportunity reads as Collected.

### H5. An unread payment feed would read as a verified zero

`src/components/cash/RecentDrops.tsx:31` defaults `available = true`, and the only call site, `src/components/me/MeScreen.tsx:276 to 282`, does not pass it. The empty branch at `:48` renders "No payments landed on your opportunities. This is a verified zero." The guard that distinguishes an unread feed from a real zero exists and is simply not wired. This contradicts the recorded decision "A verified zero and a missing figure never look alike" and is a one-line fix. The same file's subtitle at `:38` says "from the payment ledger" while `src/domain/cashTiers.ts:422` selects only `payment_collected`, so a refunded payment still shows as a positive amount beside a net figure computed on a different basis.

### H6. `docs/ARCHITECTURE.md` describes code that does not exist

Lines 31 to 35 name `ConnectorAdapter`, `src/data/adapters/*`, `src/domain/workflow.ts`, `src/domain/capacity.ts`, and `ActionLease` in a column headed "Implementation". I checked each: **all five are absent**. The same line describes the connector inbox as having an `idempotency_key` unique constraint; the real constraint is the 4-tuple at migration line 491. An engineer building the payments pipeline from this table would key de-duplication on a column that does not exist. Spec 19 Step A asks for an honest inventory; this table currently reads as one and is not.

### H7. Copy that names a provider pipeline which does not exist

`src/domain/callIntelligence.ts:14 to 15` states as present fact: "The policy never emits payment, consent, or attendance events. Those come from providers." The first sentence is true and enforced by a throw. The second describes an architecture that does not exist. `src/lib/review.ts:259` and `src/domain/lens.ts:55` likewise tell the reader and the model that money comes "only from the ledger and providers", when the only ledger writers are a synthetic fixture and a CSV importer. The direction is right and the copy should be kept; it needs one clause saying provider ingestion is not yet built.

### H8. Minor, but they compound

- `src/domain/integrations.ts:62` advertises "Cash in, refunds out, reconciled" in the present tense for a capability with no code behind it.
- `src/components/connect/DetailSheet.tsx:44 to 57` shows a green "Live" dot with 24-hour, 7-day, and all-time counts computed from fixture timestamps, on feeds that have never received anything.
- `src/components/team/SeasonSheet.tsx:55` renders "XP state: Paused" whenever any track hold exists, although `src/domain/game.ts:205` sets `paused` only when every track is held. The correctly scoped sentence already exists one screen away at `src/components/workspace/GateLine.tsx:57`.
- `src/domain/leaderboard.ts:134 to 140` labels a row `verified_zero` purely because no hold is open and the total is zero. With no provider connection in the repository at all, calling a zero verified asserts more than the evidence supports.
- `src/lib/__tests__/zzprobe.test.ts` is a committed debugging probe with zero assertions that contributes 1 to the advertised 498 and can never fail.
- `src/domain/__tests__/crmSync.test.ts:167` is titled "OAuth path is equivalent to the file path" for a simulation driven by the literal string `simulated_hubspot`.

---

# The 62 acceptance scenarios: traceability

Grouped by the spec section 19 phase each belongs to. **None of these is a test that has been executed against a provider.** Where a row reads implemented_and_tested, that means a test in this repository exercises the behavior against fixtures.

Tally: **3 implemented_and_tested, 11 partial, 45 absent, 1 blocked_by_access, 2 not applicable yet.**

Two rows below are marked "verified by probe". For those I wrote a temporary test against the real functions, ran it, recorded the output, and deleted it. The working tree is clean and `npm test` is green at 498.

## Step B: one observation path (evidence, attribution, reliability)

| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| 1 | Transcript says "I'll pay $12,000", cash and commission unchanged | implemented_and_tested | `src/domain/callIntelligence.ts:795` forbidden event regex enforced as a throw at `:866 to 873`; `:999 to 1017` emits only a decision plus a follow-up task with the reason "money waits for the ledger". Tests at `src/domain/__tests__/callIntelligence.test.ts:426, 473 to 490`. |
| 2 | Customer says "I paid" while processing, UI shows processing | absent | The "not paid" half holds. The "shows processing" half cannot exist: `src/domain/types.ts:107` has no processing value, and `src/lib/workspace-closer.ts:329` labels the opportunity "signed, $0 collected" in exactly this situation, which is a false definite claim. Also `authorized`, `partially_collected`, and `disputed` are never written by any code; only `none`, `collected`, and `refunded` are. |
| 3 | Order-linked $3,000 payment records one movement and correct role attribution | absent | No Order or PaymentRequest entity exists. `CommissionEntry` (`types.ts:357`) has no order, payment, or role reference and is constructed only in `src/fixtures/obavia.ts:471`. Credit reads from the mutable `currentOwner`. |
| 4 | Same webhook three times does not triple cash | partial (implemented_and_tested + absent) | Dedupe is real: `src/domain/events.ts:144 to 162`, tested at `src/domain/__tests__/events.test.ts:30`; storage guards at `src/data/memory.ts:212, 251` and migration lines 407, 467, 491. The webhook it defends is absent: no route handler exists and `recordProviderEvent` has no caller outside tests. |
| 5 | Checkout, payment, and invoice notifications for one payment post once | absent | **Verified by probe.** Three events with different `sourceEventId` values, all describing one $3,000 payment with `providerRef: "pi_777"`, returned applied 3, duplicates 0, ledger rows 3, net 900000 minor, that is $9,000 for one $3,000 payment. Dedupe keys on delivery identity only (`events.ts:37 to 48`); nothing groups on `providerRef`. |
| 6 | Payment success arrives before its subscription notification | absent | No subscription or installment concept. Grep returns only the `recurring` commercial-category label and one sales-script string. No pending-relationship queue. |
| 7 | Contact reassigned after sale, historic attribution does not move | absent | **Verified by probe.** Before reassignment `closer_a` commission is 30000 minor. After changing only `currentOwner.closer`, `closer_a` is 0 and `ops_user` is 30000. Source: `src/domain/cashTiers.ts:212`. No snapshot type exists. |
| 9 | One customer buys two offers, each maps to its own order and snapshot | absent | `Opportunity.offerId` is single (`types.ts:94`); `LedgerEntry.contractId` exists but no aggregation reads it; `src/domain/migration.ts:1222` keys opportunities by contact alone. |
| 10 | Bookkeeper pays from a different email, order reference is retained | absent | No reference lookup exists. `providerRef` is written and only ever displayed (`src/lib/owner-model.ts:172`). Association is identity-based via `src/domain/intake.ts:531 to 548`, so a different email with no matching phone mints a new contact. |
| 11 | Two identical payments same day, amount and timing do not determine ownership | absent | The prohibition holds vacuously: no matching engine exists. But there is no candidate-match with confidence, no ambiguity state on `LedgerEntry`, no operations resolution UI (`src/components/owner/TrustLine.tsx:59` is a static list), and no test. |
| 13 | Test-mode event changes no live standings or commissions | absent | No environment field anywhere in `src` or `supabase`. `createEvent` accepts `sourceAccountId` but does not persist it on the envelope. Every consumer reads the whole ledger unfiltered. |
| 14 | Confirmed refund adjusts cash and commission without deleting the sale | partial (implemented_and_tested + absent) | Cash half is real and additive: `events.ts:121, 127 to 140`, tested at `events.test.ts:47`; update and delete revoked on `ledger_entries` at migration line 722. Commission half is absent: no domain code creates or restates a `CommissionEntry`; the fixture flips state to `adjusted` (`obavia.ts:625`) and `cashTiers.ts:224` then drops the opportunity entirely, so a partial refund erases the whole commission instead of restating it. |
| 15 | Dispute opens then closes, risk and actual adjustments stay distinct | partial (implemented_and_tested + absent) | No double count: open then win returns to the prior figure exactly once, tested at `events.test.ts:64`. Risk versus actual is absent: no at-risk field, no `dispute_lost` event, and `MoneyView.tsx:32` folds dispute debits into a tile labeled "Refunds". |
| 16 | Invoice marked paid outside the processor is not new processor-verified cash | absent | No evidence class on `LedgerEntry` or `ledger_entries`. `src/domain/migration.ts:1313` actively mints processor-shaped cash from a won-deal column. |
| 17 | Zero-amount invoice creates no new cash | absent | Arithmetic is incidentally safe, but a $0 `payment_collected` still fires `cash_collected` XP (`src/domain/game.ts:107`), a cash drop (`cashTiers.ts:418`), the `firstCash` checklist tick (`src/lib/onboarding.tsx:543`), and `paymentState = "collected"`. SQL allows `amount_minor >= 0`. |
| 18 | Later upsell to another closer keeps original installments distinct | absent | No Order, no installments, no upsell path. `EntryPath` declares `existing_customer_expansion` and nothing uses it. |
| 19 | Model upgrade does not change historical financial credit | implemented_and_tested | `FORBIDDEN_AI_EVENT_TYPE` throw at `callIntelligence.ts:869`; `applyAuto` emits a closed set of six non-financial event types; ledger is projected only from `payment.*`. Tests at `callIntelligence.test.ts:286, 486, 619`. |
| 20 | Unreferenced payment goes to a scoped operations task, team is not blocked | partial (implemented_and_tested + absent) | The "not blocked" half is real and well tested: `events.ts:188 to 193` plus `incidents.ts:228 to 248` scoped to two surfaces, with `game.ts`, `leaderboard.ts`, and `coaching.ts` consuming it. Absent: no persisted `Exception` record, no assignee, no resolution history, and no `reconcile_payment` task action. |
| 21 | Model provider fails, verified payment processing continues | partial (implemented_and_tested + absent) | Model fallback is real and tested: `callIntelligence.ts:709 to 724`, test at `callIntelligence.test.ts:341`. The money path calls no model and cannot. But there is no payment processing to continue, so the guarantee is currently vacuous. |
| 22 | A communication cue without evidence is omitted or marked tentative | implemented_and_tested | `src/domain/buyerMode.ts:167 to 175, 330 to 361`: only customer-spoken spans count, Unknown is forced to confidence 0, a non-Unknown value with no cited span is rejected. UI carries the tentative sentence at `BriefSheet.tsx:214 to 237`. Tests at `buyerMode.test.ts:132, 140, 195, 245, 382`. |
| 23 | Details shows supporting excerpts and a correction action without exposing secrets | partial (implemented_and_tested + not_tested) | Excerpts and passage jumps are real on both surfaces (`ReviewCall.tsx:362, 505`; `BriefSheet.tsx:82, 332`). No secret is rendered anywhere. But the correction action exists only on the review surface, not on the rep's pre-call Brief Details, and it writes nothing: `corrections` is React state (`ReviewCall.tsx:98`) and no component touches a `Repository`, so a flag vanishes on reload. |
| 24 | Daily reconciliation recovers a missed event and posts once | partial (implemented_and_tested + absent) | "Posts once" is proven at the reducer and store. The reconciliation itself is absent: no routine, no schedule, no persisted cursor, no `SyncCheckpoint` type. `staleSyncs` exists at `incidents.ts:401` and no application code ever supplies it. |
| 25 | Setter, closer, and pair reports on one sale, company total counts once | partial (implemented_and_tested + not_tested) | The invariant holds by construction: every figure is recomputed from the ledger (`owner-model.ts:377`, `leaderboard.ts:103`, `pairs.ts:427`) and no UI sums rep rows. But no test pins it, the repository's own register names it T41 and nothing cites T41, and `metrics.ts:914` `computeTeamRate` pools per-user numerators, which would double-count a money metric. |
| 26 | Processing fee or bank payout differs from gross payment | partial (implemented_and_tested + absent) | Fee half is real and tested: sign 0 at `events.ts:135`, skipped in `netCollected`, asserted at `metrics.test.ts:136`. Payout and processor balance are absent entirely, and the fee policy is written in no metric contract, so the spec's "excluded or shown separately" is answered with neither. |
| 42 | Event naming an unbound account reaches no tenant ledger | absent | No ingestion surface, and no record binds a provider account to a tenant, so "unbound" is not a recognizable state. `recordProviderEvent` takes `tenantId` from the caller. Tenant isolation itself is implemented_and_tested (`memory.test.ts:195 to 240`) but presumes the tenant was already chosen correctly. |
| 43 | Historical import and a webhook carrying one movement record once | absent | The two paths dedupe in disjoint namespaces: `tenant:source:account:eventId` versus `tenant:migration:fileHash:rowIndex` (`migration.ts:1265, 1318`). `providerRef` is never consulted in any dedupe. |
| 44 | New payment mid-import is captured once | absent | No live stream and no persisted checkpoint. `SyncScope.since` is declared at `crmSync.ts:27` and never read. No sync table exists. |
| 45 | Missing historical attribution keeps collection, leaves credit unallocated | partial (implemented_and_tested + absent) | The machinery is real and tested: optional `opportunityId`, `unlinkedLedgerEntries`, scoped incident, `MetricPayload.unknownCount`, and imported opportunities with no resolvable owner get `currentOwner: {}`. Absent: no provider import exists, and the one import that does exist attaches every payment to a synthesized opportunity (`migration.ts:1322`). |
| 48 | One payment through two systems with a verified cross-reference counts once | absent | No cross-reference or canonical-movement concept. `sourceSystem` is inside the dedupe key, so two providers produce two rows and doubled totals. Only one payments provider exists. |
| 49 | Two similar payments with no authoritative link are not merged | absent | No amount or transcript matching exists, so the prohibition holds vacuously. But there is no canonical-source selection, no isolation of an unresolved stream from additive totals, and no provider model for the case to arise in. |
| 54 | Transcript instructing a refund changes no financial operation or boundary | partial (implemented_and_tested + absent) | The domain-event guard is genuine and tested, including a literal injection case at `callIntelligence.test.ts:281`. But the prompt layer is not_tested against any model (`ModelCallIntelligence` is never instantiated outside tests and there is no `fetch` in `src`), and "no authorization boundary changes" is vacuous because no merchant binding exists: grep for `merchant` in `src` returns zero hits. |
| 57 | One sale paid through two processors keeps both source identities | absent | `LedgerEntry` has no provider or account field and the projection at `events.ts:171` drops `sourceSystem`. Source identity survives only as an unparsed substring of the idempotency key, which nothing parses. No second processor exists. |
| 59 | Partial historical coverage is visibly disclosed in totals | absent | No coverage record. `MetricPayload` carries `dataState` and `unknownCount` but no coverage window. `pullAll` accepts `since` and discards it. |
| 60 | Cash tender or manually paid invoice stays external, not processor-confirmed | absent | No evidence classification exists, and `migration.ts:1307 to 1314` produces exactly this misclassification today. |
| 62 | A successful test event validates delivery only | absent | No environment field, and no event is ever received: `recordProviderEvent` has no caller outside `src/data`. |

## Step C: controlled payment-request creation

| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| 8 | Operations user sends the link, credited closer does not change | absent | Nothing in the repository creates or sends a payment link. And the guarantee is unimplemented: credit reads `currentOwner`, which carries the full historical commission (verified in scenario 7). `Task.ownerUserId` with a `collect_payment` action exists at `types.ts:180` but no attribution code reads it. |
| 12 | Browser substituting another closer ID is rejected by the server | absent | There is no server. Attribution is written from browser state: `src/lib/onboarding.tsx:411` is a client localStorage store setting `currentOwner`. The schema's only authorization is tenant isolation; `field_authority_registry` at migration line 570 documents the intent and no TypeScript reads it. |
| 36 | Declined optional collection permission leaves observation working | absent | Permissions are all-or-nothing: `SimulatedAuthorizer` returns the full catalog list verbatim (`integrations.ts:140`). Requested versus granted is never compared. Whop is absent. |
| 37 | Observation mode blocks checkout, billing changes, refunds, transfers | absent | No write capability exists to abuse, which is the absence of the feature, not a guard. No server-side policy object refuses anything, and `Feed` has no write member. |
| 58 | Uncertain payment-request timeout is not blindly retried | absent | No outbound operation exists. Every idempotency mechanism in the repository is inbound receipt dedupe. The `outbox` table anticipates this exactly, with the comment at migration line 501 "A timeout is reconciled before retry; it is not assumed to be a failure", and has no client code. `WriteReason` has no unresolved state. |
| 61 | Added write permissions require provider reapproval before server writes | absent | No capability model, no read/write split, no server write to gate. `connect()` replaces `grantedPermissions` wholesale with no diff and no pending-upgrade record. |

## Step D: Whop

| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| 28 | Identity-only Whop grant is not accepted as payment authorization | absent | Whop does not exist in the repository. The general rule is also unrepresented: `grantedPermissions` holds human sentences, not scope identifiers, so an identity-only grant could not be detected for any provider. |

## Step E: Toast (deferred, must not be reported as passing)

| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| 40 | Toast offers Request connection, not an invented OAuth grant | absent | Toast is not in the catalog, and no "Request connection" state exists for any provider: `ConnectSheet` branches only on the four `AuthMethod` values. Credit where due: no fabricated Toast endpoint exists either. |
| 41 | Two Toast restaurants each mapped before use | blocked_by_access | Toast partner approval is genuinely gated per spec 13.3. In the repository it is absent: one connection per tenant per provider (`connectionId = conn_<tenant>_<provider>`) with a single free-text `accountLabel`, so multi-location mapping cannot be represented. |

## Connection lifecycle (prerequisite for Step B)

| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| 27 | Authorization succeeds but the payment-read probe fails, no ready state | absent | No probe exists. `ConnectSheet.tsx:50 to 62` waits 900ms then sets phase connected. `ConnectionStatus` at `integrations.ts:96` is the single flat enum spec 14.3 rules out. |
| 29 | Multi-business grant ingests only the owner-confirmed business | absent | No account discovery and no merchant binding. `AuthorizeResult` carries one free-text label, synthesized as `"<Provider> account"`. No connections table exists. Do not mistake `BusinessPicker.tsx` for this; it picks an Obavia tenant. |
| 30 | Bad, expired, reused, or wrong-workspace state is rejected | absent | `state` is generated and never read: `complete(req, code)` checks only the code prefix. The value is the constant `st_<providerId>`. No PKCE anywhere. No callback exists to reject on. |
| 31 | Retried token exchange does not re-redeem or duplicate accounts | absent | `complete` is a pure function returning ok for any `simulated_` code, every time. No consumed-code record. Duplicate rows are avoided only by a deterministic id in a React state map, which is last-write-wins and would also collapse two different merchants. The correct pattern exists at `src/data/auth.ts:110` for magic links. |
| 32 | Concurrent rotating-token refresh is serialized | absent | No tokens, no refresh path, no workers. `Authorizer` declares only begin and complete. The lease pattern exists in SQL at migration lines 633 and 665 for tasks. |
| 33 | Denied consent leaves the app usable with a retry or skip | absent | No denial branch: `authorize()` sets phase connected with no check on `result.ok`, so a failed authorization renders the green check. The correct pattern exists one directory away at `ConnectCrmSheet.tsx:78 to 125`, which renders `role="alert"` and leaves the button enabled. |
| 34 | Reads work but event delivery is not ready, UI says delayed | absent | No read, no delivery, no state to distinguish them. The owner sees a Live/Quiet/Paused tone derived from lead recency (`connect-model.ts:53`), which is a data-recency heuristic, not capability. |
| 35 | Empty read is distinct from missing permission or failed import | absent | `DetailSheet.tsx:49` renders "No leads yet" plus three zeros for every not-yet-seen case. The principle exists in the metric layer (`MetricPayload.dataState`) and is not wired to a connection. |
| 38 | Public Stripe install before publication stays gated | absent | The opposite happens: Stripe is a tappable Connect tile that reaches a simulated success asserting a granted payment-read permission. No publication flag, no environment, no availability state. Credit where due: no invented stripe.com endpoint exists; the flow never leaves the app. |
| 39 | Platform-account install assumes no access to connected merchants | absent | The connection model cannot represent a merchant account at all: no account id, no environment, one connection per provider per tenant. `provider_events` gets this right with a per-account unique tuple; the connection and ledger do not. |
| 46 | Reconnecting one merchant reuses mappings and cursors | absent | Nothing to reuse, and the flow discards what exists: `ConnectSheet.tsx:58` passes `undefined` as `existing`, so `connect()`'s reuse branch never runs and `eventCount` resets. `ConnectScreen.tsx:52` then replaces the map entry, dropping source and health. |
| 47 | Another workspace connecting a bound merchant follows a sharing policy | absent | No merchant registry exists, so a second workspace is undetectable. The analogous no-leak-on-email guard at `intake.ts:537` is implemented but not_tested for that case, and operates on contacts, not merchants. |
| 50 | Disconnect stops work, removes only Obavia-owned subscriptions, keeps history | absent | `disconnect()` is a local field reset on an in-memory object. No jobs to stop, no subscriptions to remove, no retention policy, and `ConnectScreen.tsx:63` discards the connection's history from view. |
| 51 | Losing the authorizer's access requests reauthorization | absent | No authorizer identity, no token, no expiry, no `reconnect_required` state. |
| 52 | Sign-out does not silently make a login-only grant permanent | absent | Sign-out is identity-only and client-side. Nothing records whether a grant is login-scoped or app-installed; `AuthMethod` has four values and none distinguishes them. Connections do not persist at all. |
| 53 | Processing continues with no model and no browser open | absent | There is no server runtime: no route handler, no `"use server"`, no middleware, no edge function, no worker script in `package.json`. Currently overclaiming: `src/domain/intake.ts:870` hands the owner a webhook URL for an `/intake` endpoint that does not exist. |

## Process and policy (no code surface in a client-only repository)

| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| 55 | MCP support tool receiving another business ID is blocked by allowlist | not applicable yet | No MCP code exists in the application. The only occurrences are prohibitions in `supabase/README.md:19, 51`. Spec 13.4 makes MCP explicitly optional and not the financial pipeline. Register as a deferred gate, not as passing. |
| 56 | SDK lacking a documented method is reported, not invented | not applicable yet | No payment SDK is installed, so the mismatch cannot occur. The failure has also not been committed in another form: no fabricated provider endpoint exists in `src`. Missing: no version pin, no capability contract recording verified versus documented-only, and no assertion that called methods exist on the installed client. |

---

# What was NOT inspected or tested

Stated plainly, because the value of this report depends on its limits being known.

## Provider reality: nothing was verified

- **No provider was contacted.** No Stripe, Whop, or Toast endpoint was called, in any environment, per `AGENTS.md` rule 7.
- **No app registration was inspected or created.** Whether Obavia has a Stripe app, a Whop development application, or Toast partner credentials is unknown to this audit.
- **No granted scopes were observed.** Every permission string in this repository is Obavia's own wording in `src/domain/integrations.ts`, never a provider response.
- **No provider approval status is known.** Stripe app publication and Toast partner approval are release gates whose state was not available.
- **No installed provider SDK was validated**, because none is installed. Spec 13.2 and scenario 56 require checking methods against the installed release; that check cannot be performed yet.
- **Provider documentation was not rechecked.** The spec's own source list is current to 2026-09-19 and says to recheck exact scopes, endpoints, webhook objects, and SDK methods at implementation time against the live documentation and the installed package. This audit did not do that.

Therefore: **provider readiness in this report is a release gate, not an assumed fact.** Any statement here about what Stripe, Whop, or Toast supports comes from the specification document, not from testing.

## Repository areas not exercised

- **The Supabase migration has never run.** 785 lines, 22 tables, and 2 lease functions have never executed. `supabase/README.md` states this and gates it on D04 and D14. Every claim in this report about a constraint is a claim about SQL text, not about observed database behavior.
- **`src/data/supabase.ts` has no test.** 935 lines of adapter code, including its RLS and service-role interaction, is not_tested.
- **The Playwright suite was not run in this audit.** It exists (`tests/e2e`, 9 spec files, 82 test bodies across a phone and a desktop project) and is reported green by earlier work, but I ran only `npm test`, which is Vitest only. Any statement here about an end-to-end assertion comes from reading the spec file, not from a run I performed.
- **`npm run build` was not run** as part of this audit. `AGENTS.md` rule 8 requires it green before a push; this report changes no source.
- **No screen was viewed in a browser.** UI findings come from reading components and their tests. Visual, motion, contrast, and reduced-motion conformance were not re-verified here.
- **Accessibility was not audited** beyond noting that existing components carry text labels and aria attributes where the recorded decisions require them.
- **Security was not audited** beyond the credential-handling facts stated: no provider secret exists, none is written to browser storage, and the one API-key input discards its value. No penetration testing, dependency audit, or threat model was performed.
- **`set_tenant` is `SECURITY DEFINER`, accepts any tenant id, and is never revoked from PUBLIC** (migration lines 49 to 56). I read this and report it; I did not test it, because no database exists. It is currently unreachable in practice, and it should be fixed before the schema is ever applied.

## Analytical limits

- **The fixture is synthetic and labeled synthetic**, per `AGENTS.md` rule 9. The source sheet behind this product is a visual reading, not verified operating data. No conclusion here rests on real operating numbers.
- **Two behaviors were verified by probe, not by a committed test.** Scenarios 5 and 7. I wrote temporary tests against the real functions, ran them, recorded the output in this document, and deleted them. Those probes should become committed regression tests as part of step B.
- **The V2 specification itself was not landed into `docs/spec/`.** This audit treats it as a proposal, per `docs/spec/AGENTS.md` rule 5.
- **Counts of "no matches" come from grep** over `src`, `supabase`, `docs`, and tests, excluding `node_modules` and `.next`. A term could exist under a spelling I did not search.

---

# Recommended next three actions

1. **Decide the six owner questions** in Part 4, above all the attribution freeze point and the net-collected-cash contract clauses. Nothing in step B2 should be written before the freeze point is named.
2. **Land the honesty fixes H1, H2, and H5.** They need no provider access, they are small, and every one of them is a statement the product makes today that the evidence does not support.
3. **Authorize, or decline, the Stripe app registration and a separate merchant test account.** Until that exists, the honest state for Stripe is blocked_by_access for the live path and awaiting_provider_review for publication, and only the offline-verifiable work in steps A and B1 through B3 can proceed.
