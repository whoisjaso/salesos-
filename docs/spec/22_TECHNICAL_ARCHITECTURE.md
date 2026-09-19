---
document_id: SOS-22
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Technical architecture and system boundaries

**Read with:** [03_DOMAIN_MODEL_AND_EVENTS.md](03_DOMAIN_MODEL_AND_EVENTS.md), [04_INTEGRATIONS_AND_AUTOMATIC_TRACKING.md](04_INTEGRATIONS_AND_AUTOMATIC_TRACKING.md), [23_SECURITY_CONSENT_AND_AI_CONTROLS.md](23_SECURITY_CONSENT_AND_AI_CONTROLS.md), [25_BUILD_BUY_AND_DELIVERY_GATES.md](25_BUILD_BUY_AND_DELIVERY_GATES.md)

## Architecture objective

Support a reliable closed-loop sales workflow with the smallest maintainable system. The initial architecture should be a configured operational CRM plus optional lightweight adapters/read models, not an automatic build of a new CRM, warehouse, dialer, and AI platform.

If a custom interface is justified, start with a modular application and relational database. Full event sourcing, microservices, a streaming platform, and a data warehouse are optional later responses to measured needs, not prerequisites.

## Deployment modes

**Configured-CRM mode:** CRM remains authoritative for contacts, opportunities, assignment, tasks, and scheduling references. Telephony/meeting/payment providers remain authoritative for their facts. Export or mirror only the minimum data needed for durable analytics and custom views.

**Thin-overlay mode:** The CRM still handles commodity operations; a focused interface, metrics service, and coaching layer use mapped canonical identities. Each field has one declared operational writer. Do not allow two systems to fight over ownership, status, or appointments.

**Custom-operating-core mode:** Consider only after a validated workflow gap, sustainable economics, engineering ownership, migration plan, and reliability tests justify it. This pack defines the domain contracts, not a mandate to choose this mode.

## Components and responsibilities

| Component | Responsibility |
|---|---|
| Identity/access layer | Tenant and role verification, user sessions, privileged actions. |
| Operational records | Contacts, organizations, opportunities, assignments, tasks, and workflow state. |
| Connector inbox | Durable receipt and restricted storage of provider events. |
| Normalization adapters | Provider-specific mapping, identity links, schema versions, deduplication. |
| Workflow engine | Deterministic state transitions, task generation, assignment, and cancellation. |
| Outbox/worker | Reliable external actions with idempotency, retries, rate control, and permission rechecks. |
| Scheduling/capacity service | Slot reservation, appointment lineage, availability, backup rules. |
| Financial ledger | Reconciled money movements and attribution; separate payout approvals. |
| Evidence store | Restricted recordings, transcripts, source spans, and deletion/retention controls. |
| Metrics read model | Canonical definitions, cohort calculations, freshness, and drill-down queries. |
| AI service | Structured extraction and suggestions using approved context, not authoritative financial writes. |
| User interfaces | Setter, closer, owner, and team-learning experiences. |
| Operations controls | Health monitoring, failed-event queue, replay, audit, backup, and recovery. |

These can be modules in one application or features of an existing platform. They do not require separate deployed services.

## End-to-end transaction

A provider inquiry is verified and persisted. The adapter links or creates the correct identity/opportunity. The workflow applies permissions and routing, reserves responsibility, and creates a task. An authorized worker or representative starts contact. Provider events and reviewed interpretations update the canonical records. Appointments, assessments, contracts, and payments follow their own evidence rules. Read models update and display their processing watermark.

If an external action times out, reconcile its status before retrying. Do not assume a timeout means the action failed. If a payment event arrives before its related opportunity mapping, hold it in an exception state rather than discard or misattribute it.

## Reliability model

Assume webhooks may be duplicated, delayed, out of order, malformed, or temporarily absent. Use durable inbox/outbox patterns, unique idempotency constraints, bounded retries, backoff, and provider reconciliation. Record event occurrence and receipt separately. Exactly-once business effects require transactional controls; do not promise exactly-once transport.

Queue workers use action leases and current-state checks to prevent simultaneous calls or stale messages. Stop-contact checks happen at send time. Financial updates and assignment reservations are atomic within the chosen store's guarantees.

## Data ownership and writers

Maintain a field authority registry: field, authoritative system, allowed writers, mapping, conflict behavior, reconciliation owner, and export path. Example: a payment amount comes from the payment ledger; a rep can dispute attribution but not edit the amount. A calendar provider owns its event IDs, while the product owns the business interpretation and appointment lineage.

A contact's communication permission is canonical and enforced across connectors. Do not let an imported old CRM record overwrite a newer opt-out.

## AI boundary

LLM inputs contain only necessary, permitted context. Retrieval includes approved offer facts and relevant evidence. Outputs use a validated schema, source references, uncertainty/unknowns, and a proposed action. The policy engine decides whether the action is permitted; the LLM cannot grant itself authority.

Separate extraction from coaching and from action execution. An extraction can be corrected without replaying a message or altering a payment. Record model, prompt, retrieval, and schema versions for reproducibility. Keep a provider-agnostic interface and deterministic fallback so a model outage does not stop sales.

## Storage and analytics

Use relational storage for canonical entities and financial/assignment invariants. Use object storage for larger evidence with signed access and retention. Start with ordinary analytical queries or materialized views; add a warehouse only when query scale or cross-system analysis justifies it.

Do not store sensitive content unnecessarily in model logs, events, analytics exports, or prompt-debug screens. Tenant filters must be enforced server-side. A frontend-hidden record is not access control.

## Operations and engineering ownership

Define staging and production environments, secret management, schema migrations, backups, restore tests, observability, cost ceilings, and rollback. Assign a responsible maintainer. AI-assisted development does not remove the need for code review, testing, incident response, and dependency maintenance.

Proposed service targets must be approved and tested for the actual scale. State expected event volume, concurrency, integration quotas, and latency budgets before optimizing. No unsupported production-capacity promise belongs in the documentation.

## Acceptance criteria

A single opportunity can complete the closed loop with reconciled evidence. One-writer rules prevent sync loops. Duplicate and out-of-order events do not corrupt state. Model failure leaves a usable workflow. Tenant isolation is tested. Backups can be restored. One connector can be replaced through its adapter contract. The custom footprint is justified by an actual unmet workflow need.

## Agent task prompt

```text
Choose the smallest architecture that satisfies the approved pilot. Compare configured CRM, thin overlay, and custom core without assuming custom wins. Define component boundaries, authoritative writers, inbox/outbox behavior, idempotency, AI policy boundary, tenant security, recovery, and maintenance ownership. Produce an architecture decision record and vertical-slice design, not a sprawling platform scaffold.
```

