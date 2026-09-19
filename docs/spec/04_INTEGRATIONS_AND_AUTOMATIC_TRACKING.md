---
document_id: SOS-04
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Integrations and automatic evidence collection

**Read with:** [03_DOMAIN_MODEL_AND_EVENTS.md](03_DOMAIN_MODEL_AND_EVENTS.md), [23_SECURITY_CONSENT_AND_AI_CONTROLS.md](23_SECURITY_CONSENT_AND_AI_CONTROLS.md), [29_SOURCES_AND_RESEARCH.md](29_SOURCES_AND_RESEARCH.md)

## In plain language

Automation should collect facts the connected tools can actually observe. It should not pretend that a calendar knows who attended or that an answered phone proves a sales conversation. AI helps interpret evidence; it is not the source of every count.

## Integration contract by stage

| Stage | Required evidence | Typical connection | Unknown or failure handling |
|---|---|---|---|
| Inquiry | Provider submission ID, submitted time, source fields, permission evidence | Website/form/lead-source webhook plus reconciliation | Preserve source ID; quarantine malformed records; do not invent missing permission. |
| Assignment | Canonical routing decision and responsible role | Existing CRM assignment or approved routing service | Unassigned exception queue with SLA alarm. |
| Dial attempt | Provider call ID and initiated timestamp | CRM dialer / cloud telephony | Failed dial remains an attempt; retry only under approved policy. |
| Two-way phone contact | Evidence of customer interaction, not only answered status | Call metadata plus reviewed disposition or permitted transcript analysis | Unknown/human/machine classification remains explicit. |
| Booking | Appointment ID, participants, type, time and revision | Scheduling provider | Reconcile cancellation and reschedule webhooks. |
| Show | Matched customer and representative presence, overlap/duration or verified phone/in-person attendance | Meeting participation events or audited fallback | Unknown if identity or delivery is unresolved. |
| Qualification | Evidence for each objective rule and separate rep assessment | Call transcript and structured questions | Missing evidence becomes Unknown and a question, not an inferred Yes. |
| Win | Approved commercial policy and contract/order evidence | Contract/order provider | Verbal agreement has its own label. |
| Cash | Payment lifecycle and ledger movements | Processor/accounting connector | Reconcile delayed, partial, refunded, disputed, and offline payments. |
| Fulfillment | Handoff accepted, scope and dependencies | Delivery/project tool | Do not mark delivered just because payment succeeded. |

## Verified provider facts and their limits

Twilio documents call-progress callbacks and explicitly notes that completed calls can be answered by a person, IVR, or voicemail. Its call-resource documentation also distinguishes callback event names from terminal call statuses. Therefore our adapter must inspect the actual status and must not map every completed callback to `human_conversation`. [S01]

Zoom documents a `meeting.participant_joined` event and required scopes. This supports attendance instrumentation where the account, app permissions, identity matching, and meeting format provide sufficient evidence. It does not make a calendar booking proof of attendance. [S03]

Stripe documents duplicate webhook delivery and non-guaranteed ordering. Therefore payment ingestion needs signature verification, deduplication, durable processing, and reconciliation. [S02]

Zoho's official materials describe click-to-call, provider integrations, automatic call logging, and CRM change notifications. These make it an evaluation candidate, not a verified statement about the user's subscription or every desired event. [S05, S06]

References are resolved in [the sources register](29_SOURCES_AND_RESEARCH.md). Meta lead-API documentation could not be retrieved successfully during preparation, so exact permissions and webhook contracts remain a launch verification task rather than an invented integration promise.

## Adapter interface

Each connector implements: authenticate and verify; receive provider event; persist restricted raw envelope; acknowledge; normalize; deduplicate; publish canonical change; reconcile; report health. Store connector version, provider API version, required permissions, subscription/plan prerequisites, supported event types, known blind spots, rate limits, and revocation procedure.

Use an inbox record before acknowledging receipt. Process asynchronously after durable receipt. Acknowledge a duplicate without executing its business effect again. Outbound calls, messages, and appointment creation also require idempotent action keys: avoiding duplicate inbound events is not enough.

## AI's specific role

AI may propose a summary, identify a question or objection, extract a stated budget/timeline, flag a contradiction, or suggest a next action. Each field requires a source span and must support `unknown`. The model is not allowed to manufacture a budget, authoritative attendance state, collected amount, or customer's identity from a display name.

Machine-detection and speech recognition can be imperfect. Until measured on representative pilot data, no accuracy percentage should be advertised. Critical financial and permission decisions remain deterministic or explicitly reviewed. Recording/transcription are enabled only after the applicable consent and disclosure gate.

## Automatic does not mean exception-free

The default path should require almost no clerical entry. The exception path should require a small, explicit human decision with an audit reason: match participant, confirm outcome, correct a transcription, resolve an offline payment, or classify a DQ appeal. An honest ten-second confirmation is preferable to silently corrupted performance data.

## Integration outage behavior

If lead ingestion lags, show its timestamp and offer the existing provider's operational inbox. If telephony fails, use the approved business calling fallback and record evidence later. If AI fails, keep the script and manual confirmation available. If payment integration fails, pause automatic financial rankings and commission release, not legitimate customer service.

Alert an integration owner; retries must be bounded and observable. Keep a failed-event queue and a replay tool with permissions. A daily reconciliation compares canonical counts/amounts with provider records for the same windows; discrepancies create cases rather than invisible overwrites.

## Acceptance criteria

Replay a webhook without duplicate tasks or money. Process events out of order. Revoke a credential and show an actionable status. Demonstrate a booked-but-absent prospect is not counted as attended. Demonstrate voicemail is not a customer conversation. Demonstrate an unrecognized meeting participant stays unresolved. Every connector has a named owner and a recovery runbook.

## Agent task prompt

```text
For the requested integration, first inspect current official provider documentation and the actual account's available permissions when authorized. Produce an event-to-domain mapping with known blind spots, consent requirements, replay behavior, reconciliation, and fallback. Do not claim complete automation where the provider supplies only scheduling or transport status. Do not buy services or send communications without separate authorization.
```

