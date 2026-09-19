# Architecture Decision Record: Sales OS

**Status:** Accepted for Phases 1 to 6
**Governs:** SOS-22 (technical architecture), SOS-03 (domain model), SOS-23 (security and AI controls)

## Decision

Build a modular monolith: Next.js App Router (TypeScript) with a pure, framework-free domain layer under `src/domain`, a repository interface under `src/data`, and role-specific UIs under `src/app`. Persistence targets Postgres through Supabase, with an in-memory fixture adapter as the default so the product runs with zero external credentials.

This is the "thin overlay growing into an operating core" path from SOS-22, chosen because the owner has authorized a full product build. The domain contracts remain provider-agnostic so a configured CRM can still be the operational writer for any field via the field authority registry.

## Layers

```
src/domain/        pure TypeScript. entities, metric engine, routing, coaching, leaderboard, glow policy.
                   no React, no fetch, no Date.now() without injection. fully unit-tested.
src/data/          Repository interface + adapters (memory fixture, supabase). One declared writer per field.
src/fixtures/      corrected source-reproduction sheet (SOS-01) + synthetic operational cohort. labeled synthetic.
src/components/    design system: tokens, FunnelCard, MetricTile, GlowOutline, DataState, CountUp, Sheet, etc.
src/app/           routes: /owner, /setter, /closer, /team (leaderboard), /coach, /playbooks.
supabase/          SQL migrations mirroring the domain model. Never applied without explicit authorization.
docs/              PRD, ADR, ROADMAP, stories, spec pack.
```

## Component responsibilities (SOS-22 mapping)

| SOS-22 component | Implementation |
|---|---|
| Identity/access | `tenant_id` on every entity. Role from session context. Server-side filter in repository. |
| Operational records | Relational tables. Current state in ordinary rows. |
| Connector inbox | `provider_events` table with `idempotency_key` unique constraint. Adapter interface `ConnectorAdapter`. |
| Normalization adapters | `src/data/adapters/*`. Map provider payloads to domain events. |
| Workflow engine | `src/domain/workflow.ts`: deterministic transitions with evidence and authority checks. |
| Outbox/worker | `outbox` table + `ActionLease`. Phase 6. |
| Scheduling/capacity | `src/domain/capacity.ts`: load estimate, atomic reservation semantics. |
| Financial ledger | `ledger_entries` in minor units with ISO currency. Refunds and disputes as movements. |
| Evidence store | `evidence_refs` on events. Payload storage out of scope for fixtures. |
| Metrics read model | `src/domain/metrics.ts`: M01 to M21 returning `MetricPayload`. Never a bare number. |
| AI service | Interface `CoachingEngine` with deterministic rule-based implementation first. LLM later, behind schema validation. |
| User interfaces | Role routes. |
| Operations controls | `data_state` surfaced on every tile. Incident list on owner home. |

## Invariants enforced in code

1. Every metric result is a `MetricPayload` with numerator, denominator, unknown count, cohort, data state, definition version.
2. Zero denominator yields `N/A`, never zero.
3. Team rates are `sum(num)/sum(den)`, never mean of percentages.
4. Money is integer minor units with currency. No cross-currency sums.
5. A connector rate renders only when `numeratorStage.parentStage === denominatorStage`.
6. Glow state requires a benchmark, a sample threshold, and a `complete` data state. Otherwise neutral or data-state treatment.
7. DQ never removes an opportunity from the assigned denominator.
8. Unknown attendance is reported as lower bound and upper bound, and pauses consequential ranking.
9. Routing precedence: eligibility, continuity, capacity, service level, fair allocation, validated performance (bounded), relational (shadow). Steps 6 and 7 are logged, not applied, until policy flags enable them.
10. Coaching cards carry alternative explanations and label scenarios as not forecasts.

## Reliability model (deferred to Phase 6, designed now)

Webhooks may be duplicated, delayed, out of order. `provider_events.idempotency_key` is unique. Occurrence and receipt timestamps are separate. Business effects are idempotent by aggregate and event type.

## AI boundary

The LLM never writes money, attendance, or permission. It proposes. A policy function decides. Model, prompt, and schema versions are recorded on every `CoachingRecommendation`.

## Why not full event sourcing or microservices

SOS-22 says these are responses to measured needs. A relational store plus an append-only `domain_events` audit table reproduces stage counts and corrections without the operational cost.
