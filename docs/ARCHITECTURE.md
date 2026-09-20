# Architecture Decision Record: Sales OS

**Status:** Accepted for Phases 1 to 6
**Governs:** SOS-22 (technical architecture), SOS-03 (domain model), SOS-23 (security and AI controls)
**Last correction:** 2026-09-20. See "Corrections of 2026-09-20" below.

## Decision

Build a modular monolith: Next.js App Router (TypeScript) with a pure, framework-free domain layer under `src/domain`, a repository interface under `src/data`, and role-specific UIs under `src/app`. Persistence targets Postgres through Supabase, with an in-memory fixture adapter as the default so the product runs with zero external credentials.

This is the "thin overlay growing into an operating core" path from SOS-22, chosen because the owner has authorized a full product build. The domain contracts remain provider-agnostic so a configured CRM can still be the operational writer for any field via the field authority registry.

## Layers

```
src/domain/        pure TypeScript. entities, metric engine, routing, coaching, leaderboard, glow policy,
                   money, ledger evidence, orders, attribution snapshots, connection capability contracts.
                   no React, no fetch, no Date.now() without injection. fully unit-tested.
src/data/          Repository interface + two adapters: memory.ts (fixture) and supabase.ts. One declared
                   writer per field. There is no src/data/adapters/ directory.
src/fixtures/      corrected source-reproduction sheet (SOS-01) + synthetic operational cohort. labeled synthetic.
src/components/    design system: tokens, FunnelCard, MetricTile, GlowOutline, DataState, CountUp, Sheet, etc.
src/app/           routes: /owner, /setter, /closer, /team, /coach, /playbooks, /connect, /import, /review,
                   /me, /start, /join.
supabase/          SQL migrations mirroring the domain model. Never applied. See the note under Persistence.
docs/              PRD, ADR, ROADMAP, DECISIONS, stories, spec pack, PAYMENTS_AUDIT.
```

## Component responsibilities (SOS-22 mapping)

This table states what exists today. Where a SOS-22 component is designed but not built, the row says so and names the nearest real seam. A row is never allowed to name a file that does not exist.

| SOS-22 component | Implementation state | Where |
|---|---|---|
| Identity/access | Built | `tenant_id` on every entity. Role from session context. Server-side filter in the repository contract, `src/data/repository.ts`. |
| Operational records | Built | Relational tables. Current state in ordinary rows. `supabase/migrations/20260918000000_sales_os_core.sql`. |
| Connector inbox | Table built, no adapter interface | `provider_events` at `supabase/migrations/20260918000000_sales_os_core.sql:478`, unique on the four-tuple `(tenant_id, provider, provider_account_id, provider_event_id)` at line 491. Written by `src/data/supabase.ts:884`. There is no `ConnectorAdapter` interface anywhere in the repository. |
| Normalization adapters | Not built | There is no `src/data/adapters/` directory. The nearest real seams are the provider registry and `Authorizer` in `src/domain/integrations.ts`, and the capability contract and connection-condition machine in `src/domain/connections.ts`. Neither parses a provider payload, because no provider payload has ever arrived. |
| Workflow engine | Built, different file | There is no `src/domain/workflow.ts`. Stage transitions are proposed by `src/domain/callIntelligence.ts` (`applyExtractionPolicy`, banded probabilities, forbidden-event assertion) and reduced deterministically by `applyEvents` in `src/domain/events.ts`. |
| Outbox/worker | Table only | `outbox` with lease columns at `supabase/migrations/20260918000000_sales_os_core.sql:504`, unique on `(tenant_id, idempotency_key)` at line 523. There is no TypeScript `ActionLease`, no worker, no queue, and no process that takes a lease. Phase 6 design. |
| Scheduling/capacity | Built, different file | There is no `src/domain/capacity.ts`. `CapacityPolicy`, `DEFAULT_CAPACITY_POLICY`, and precedence step 3 live in `src/domain/routing.ts`. Atomic reservation is designed in SOS-06 and is not implemented. |
| Financial ledger | Built | `ledger_entries` in integer minor units with ISO currency. Sixteen `LedgerEntryKind` values at `src/domain/types.ts:383`. Refunds, disputes, fees, payouts and commission states are movements, not mutations. |
| Payment evidence | Built (domain), no provider | `EvidenceClass` at `src/domain/types.ts`, `countsAsNetCollectedCash` at `src/domain/events.ts:154`. Every movement records how it is known. No movement has ever been received from a payment processor. |
| Attribution snapshot | Built (domain) | `AttributionSnapshot` in `src/domain/types.ts`, sealing and corrections in `src/domain/attribution.ts`, order issuance in `src/domain/orders.ts`. |
| Evidence store | Partial | `evidence_refs` on events. Payload storage out of scope for fixtures; `provider_events.payload_ref` exists in the unapplied payments migration for the case where a raw body must not be stored inline. |
| Metrics read model | Built | `src/domain/metrics.ts`: M01 to M21 returning `MetricPayload`. Never a bare number. `DEFINITION_VERSION` is `"1.1"` at `src/domain/metrics.ts:58`. |
| AI service | Built, rule-based | Interface `CoachingEngine` with a deterministic rule-based implementation. LLM later, behind schema validation. |
| User interfaces | Built | Role routes under `src/app`. |
| Operations controls | Built | `data_state` surfaced on every tile. Scoped incidents in `src/domain/incidents.ts`. Incident list on owner home. |

## Corrections of 2026-09-20

The previous version of the table above named five implementation artifacts that do not exist. Each was checked individually before being cut:

| Named artifact | Check | Result |
|---|---|---|
| `ConnectorAdapter` | Repository-wide search across `.ts`, `.tsx`, `.sql`, `.md` | No definition, no reference outside this document and `docs/PAYMENTS_AUDIT.md`. |
| `src/data/adapters/*` | Directory listing of `src/data` | Directory does not exist. `src/data` holds `auth.ts`, `index.ts`, `memory.ts`, `repository.ts`, `supabase.ts`, `__tests__/`. |
| `src/domain/workflow.ts` | File listing of `src/domain` | Does not exist. |
| `src/domain/capacity.ts` | File listing of `src/domain` | Does not exist. |
| `ActionLease` | Repository-wide search | No definition, no reference. The lease columns exist in SQL only. |

The same passage described the connector inbox as having an `idempotency_key` unique constraint. It does not. `provider_events` has no `idempotency_key` column at all; its uniqueness is the four-tuple `(tenant_id, provider, provider_account_id, provider_event_id)` at migration line 491. `idempotency_key` is a column on `outbox`, `domain_events` and the other write-side tables, not on the inbox.

The four-tuple is the better constraint and is kept. An external event id is not a global namespace: provider, merchant account and environment belong in the key (SOS-V2 section 15.4). An engineer building the payments pipeline from the old table would have keyed de-duplication on a column that does not exist.

Recorded as corrections C-01 and C-02 in `docs/spec/28_TRACEABILITY_AND_OPEN_DECISIONS.md` under AGENTS.md rule 2.

## Invariants enforced in code

1. Every metric result is a `MetricPayload` with numerator, denominator, unknown count, cohort, data state, definition version.
2. Zero denominator yields `N/A`, never zero.
3. Team rates are `sum(num)/sum(den)`, never mean of percentages.
4. Money is integer minor units with currency. No cross-currency sums: `add` and `sum` in `src/domain/money.ts` throw `CurrencyMismatchError` rather than guess a rate.
5. A connector rate renders only when `numeratorStage.parentStage === denominatorStage`.
6. Glow state requires a benchmark, a sample threshold, and a `complete` data state. Otherwise neutral or data-state treatment.
7. DQ never removes an opportunity from the assigned denominator.
8. Unknown attendance is reported as lower bound and upper bound, and pauses consequential ranking.
9. Routing precedence: eligibility, continuity, capacity, service level, fair allocation, validated performance (bounded), relational (shadow). Steps 6 and 7 are logged, not applied, until policy flags enable them.
10. Coaching cards carry alternative explanations and label scenarios as not forecasts.
11. Every monetary movement carries an evidence class and an environment. Only a `processor_confirmed` movement in the `live` environment counts as net collected cash (`countsAsNetCollectedCash`, `src/domain/events.ts:154`).
12. Financial credit reads from a sealed attribution snapshot, not from whoever owns the contact today.

## Reliability model

Webhooks may be duplicated, delayed, and out of order. Occurrence and receipt timestamps are separate columns. Business effects are idempotent by aggregate and event type.

De-duplication happens on two independent axes, because they answer two different questions:

1. **Delivery identity.** Did we already receive this delivery? Keyed by `(tenant_id, provider, provider_account_id, provider_event_id)` on `provider_events`, and by `buildIdempotencyKey` at `src/domain/events.ts:48` on the domain envelope.
2. **Economic movement identity.** Did we already post this money? Keyed by `buildEconomicMovementKey` at `src/domain/events.ts:74`, which composes `tenant:provider:account:environment:movementId` and returns `undefined` rather than guess when the movement cannot be named. The posting key adds the ledger kind, so a charge and its processing fee that share one provider id stay two facts. The matching SQL is the partial unique index `ledger_entries_movement_identity_uniq` in `supabase/migrations/20260920000000_payments_evidence_and_attribution.sql`.

One axis alone is insufficient. A checkout event, a payment-intent event and an invoice event are three deliveries describing one movement: distinct on axis 1, identical on axis 2. A redelivery of one webhook is identical on both. Collapsing the two axes into one key is how a ledger triples a payment.

## Money and payment evidence

Five rules, all enforced in `src/domain`:

1. Money is an integer minor amount plus an ISO currency. Never a float. `src/domain/money.ts`.
2. A movement records how it is known. `EvidenceClass` is one of `processor_confirmed`, `provider_reported`, `manually_marked_paid`, `externally_recorded`, `imported_record`.
3. Net collected cash counts only `processor_confirmed` movements in the `live` environment. Everything else remains a genuine record reported on its own terms, never silently summed into a sales metric. The written contract is in `docs/spec/02_METRIC_CONTRACTS.md` and `docs/spec/19_REVENUE_COMMISSIONS_AND_FORECASTS.md`.
4. Observation is separate from collection. Reading payments never implies authority to charge, refund, or alter a subscription. `COLLECTION_SCOPE_POLICY` and `checkCollectionAllowed` in `src/domain/connections.ts`.
5. Attribution is sealed into an immutable snapshot at order issuance and corrected only by appending an authorized correction. `src/domain/attribution.ts`.

One known compromise is recorded rather than hidden: `UNCLASSIFIED_EVIDENCE_FALLBACK` at `src/domain/events.ts:97` is `"processor_confirmed"`, so that ledger rows written before the evidence class existed keep counting as they did. The database column carries no such default. A test pins the fallback so changing it is a visible decision. This is open decision D31.

## Provider readiness is a release gate, not an assumed fact

No payment provider has ever been contacted from this repository. No app registration exists, no OAuth credential exists, no merchant account is bound, no webhook has ever been received, and no payment SDK is installed (`package.json` holds `@phosphor-icons/react`, `@supabase/supabase-js`, `clsx`, `motion`, `next`, `react`, `react-dom`).

Everything under the heading "payments" in this repository is offline domain logic, synthetic fixtures, and SQL text. The `supabase/migrations` directory has never been executed against any project; every claim a migration makes is a claim about SQL text and not about a live schema.

Consequences the architecture must keep honest:

- A capability is displayed from evidence, never from the presence of a provider logo. `CapabilityState` is one of `verified`, `pending_verification`, `not_requested`, `not_authorized`, `requires_setup`, `unsupported`.
- A provider with no real onboarding path in the current environment shows "Request connection". It can never reach a success state. There is no code path from a simulated authorization to a verified capability.
- A function whose capability is unproven returns `unsupported` or `requires_setup`. It never returns a fabricated success.
- Provider approval, app publication, granted permissions, and installed SDK method availability are release dependencies tracked in `docs/PAYMENTS_AUDIT.md` part 4 and in the open decision register.

## AI boundary

The LLM never writes money, attendance, or permission. It proposes. A policy function decides. Model, prompt, and schema versions are recorded on every `CoachingRecommendation`.

Three authorities stay separate and the model owns none of them: conversation intelligence says what was discussed, payment evidence says what money moved, attribution rules say who gets credit. A transcript can raise a discrepancy and can never settle one. A transcript containing an instruction to refund money or change a merchant id changes no financial state and no authorization boundary.

## Why not full event sourcing or microservices

SOS-22 says these are responses to measured needs. A relational store plus an append-only `domain_events` audit table reproduces stage counts and corrections without the operational cost.
