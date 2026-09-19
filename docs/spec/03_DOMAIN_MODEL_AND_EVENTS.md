---
document_id: SOS-03
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Domain model, event history, and state transitions

**Read with:** [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [22_TECHNICAL_ARCHITECTURE.md](22_TECHNICAL_ARCHITECTURE.md)

## Purpose and reasoning

A person is not a lead event, a lead event is not a deal, and a deal is not a payment. Keeping those objects separate prevents duplicate people, inflated pipelines, lost attribution, and phantom revenue. An append-oriented audit history makes corrections explainable without requiring a full event-sourcing platform.

## Core entities

| Entity | Meaning and key fields |
|---|---|
| Tenant | Business boundary; timezone, currency policy, access and retention settings. |
| User / Team | Human operator, roles, active status, skills, coverage, availability. AI agents have distinct actor identities. |
| Organization | B2B account with multiple contacts and decision participants. Not a substitute for individual consent. |
| Contact | Person identity and verified contact points; preferred language/channel; communication permissions. |
| LeadSubmission | Original source inquiry with provider ID, payload reference, campaign/source snapshot, entry path, received time. |
| Opportunity | One commercial buying cycle for one offer/workflow; linked contacts, account, status, ownership, cohort metadata. |
| Assignment | Historical responsibility interval, role, policy version, eligible candidate set, assignment reason, acceptance/SLA times. |
| Task | Next action, responsible actor, due time, dependencies, cancellation state, idempotent action key. |
| Call / Message | Provider interaction identifiers, direction, state, participants, timestamps, evidence links; transport facts separate from interpreted outcome. |
| Appointment | Intent, type, timezone, contact, owner, meeting provider, durable reschedule lineage. |
| AppointmentInstance | One scheduled occurrence and its attendance evidence, retention cutoff, cancellations, outcome. |
| QualificationAssessment | Objective rules, rep perception, evidence, unknowns, policy version, reviewer; separate fields, not one magic score. |
| CommunicationProfile | Conversation-scoped preferences/lenses with source evidence, validation state, review date, contradictions. |
| Offer / Contract | Versioned approved scope, price, terms, signatures, discount authority and fulfillment prerequisites. |
| Payment / LedgerEntry | Customer payment lifecycle, provider reference, collected amounts, refunds, disputes, fees, attribution allocations. |
| CommissionEntry | Policy version, attributed sale, accrual/eligibility/payment/adjustment states and reasons. |
| Playbook / Experiment | Versioned modules, allowed variants, enrollment and exposure events, approved release and rollback. |
| CoachingRecommendation | Observation, diagnosis hypothesis, supporting metric/evidence IDs, action, scenario, review outcome. |
| DomainEvent | Auditable event record connecting these objects without duplicating all sensitive payloads. |

## Invariants

Every business object has `tenant_id`. A contact may have multiple opportunities and an opportunity may have multiple contacts. Each provider object is unique within the relevant tenant/provider account. One payment is not counted twice because two contacts or representatives participated. Deleting a UI card is not deleting historical accountability.

Current operational state lives in ordinary relational records. Store an event when a meaningful state or attribution decision changes. Use deterministic transactions for financial and assignment changes. Analytical projections can be rebuilt from canonical records plus the audit history.

## Domain event envelope

```json
{
  "event_id": "evt_example_001",
  "tenant_id": "tenant_example",
  "event_type": "appointment.attendance_verified",
  "schema_version": 1,
  "aggregate_type": "appointment_instance",
  "aggregate_id": "appt_instance_example",
  "opportunity_id": "opp_example",
  "occurred_at": "2026-09-18T15:03:00Z",
  "received_at": "2026-09-18T15:03:04Z",
  "actor_type": "integration",
  "actor_id": "meeting_connector",
  "source_system": "meeting_provider",
  "source_account_id": "provider_account_example",
  "source_event_id": "provider_event_example",
  "idempotency_key": "tenant:provider:account:event",
  "correlation_id": "journey_example",
  "causation_id": "evt_example_previous",
  "evidence_refs": ["evidence_example_123"],
  "payload": {"attendance_status": "attended", "verified_contact_id": "contact_example"}
}
```

If a provider does not supply a stable event ID, the adapter must define a collision-resistant deduplication strategy using provider-specific immutable fields. A timestamp alone is not a safe universal idempotency key.

## State is multi-dimensional

Maintain commercial status (`open`, `won`, `lost`, `nurture`, `DQ`, `reactivated`), contact state, appointment state, fit-assessment state, contract state, payment state, and consent state separately. A signed but unpaid deal and a paid-but-disputed deal cannot be represented accurately by one stage label.

A workflow definition declares stages and allowed branches. State transitions need evidence and authority, not merely AI text. Examples:

- `call.finished` may lead to a proposed conversation outcome, not automatic `qualified`.
- `appointment.booked` creates an instance and tasks, not `attended`.
- `qualification.perceived_recorded` does not change verified eligibility.
- `contract.signed` may establish a commercial win under the offer policy, but not collected cash.
- `payment.succeeded` creates a ledger event and fulfillment eligibility checks, not irreversible payout.
- `consent.revoked` cancels relevant queued communications before another contact action starts.

## Correction and privacy model

Correct errors with an adjustment event that references the original, reason, actor, and authority. Mark superseded interpretations while preserving the audit trail. Financial history should reconcile after correction rather than simply accumulate contradictory entries.

Append-oriented does not mean all personal content must be retained forever. Keep evidence payloads in restricted storage with retention/deletion controls. Events can preserve non-identifying facts or deletion tombstones while sensitive content is removed under an approved policy. Do not embed entire call transcripts in every event.

## Query and reporting boundaries

Transactional tables serve workspaces. Read models serve dashboards. Large analytics exports are optional later. Every projection records its definition version and processing watermark, making lag visible. An opportunity can be operationally updated before every analytical tile has caught up; the UI must not hide that interval.

## Acceptance criteria

A customer with two contacts and three calls remains one opportunity. A second legitimate buying cycle is separate. Reassignments preserve all owners. One provider payment event delivered three times generates one financial effect. A late refund revises the original cohort. A transcript can be removed without silently corrupting ledger totals. Cross-tenant identifiers never grant cross-tenant access.

## Agent task prompt

```text
Translate this domain model into a proposed schema and event catalog for the approved platform. Preserve identity grain, tenant boundaries, evidence references, idempotency, and correction rules. Prefer ordinary relational state plus an audit log before introducing event sourcing or a warehouse. Return a data dictionary, invariants, sample transitions, and tests; do not implement unapproved integrations.
```

