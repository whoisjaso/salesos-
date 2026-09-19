---
document_id: SOS-10
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Closer workspace, live guidance, and handoff to delivery

**Read with:** [11_SALES_PROCESS_AND_STAGE_SOPS.md](11_SALES_PROCESS_AND_STAGE_SOPS.md), [19_REVENUE_COMMISSIONS_AND_FORECASTS.md](19_REVENUE_COMMISSIONS_AND_FORECASTS.md), [20_UX_AND_VISUAL_METRIC_LANGUAGE.md](20_UX_AND_VISUAL_METRIC_LANGUAGE.md)

## Purpose

Give the closer enough context to make a useful recommendation without making the customer repeat the entire story. Make the next commercial step clear while preventing unapproved promises, misleading financial states, and lost fulfillment commitments.

## Pre-call brief

The brief contains the customer's request, problem and desired outcome in their own words, relevant account context, decision participants, verified fit criteria, unknowns, previous promises, current offer version, communication preferences, appointment details, and linked evidence. Clearly label assertions as customer-stated, independently verified, or AI-proposed.

A short brief is the default. Evidence, timeline, and deeper notes expand on demand. A private label such as `pessimistic lead` is not acceptable context. A concrete concern such as `asked how cancellation works` is useful.

## During the conversation

The workspace provides a stable stage checklist, approved offer facts, optional next question, and a place to capture commitments. It supports a natural conversation rather than forcing a scripted sequence when the customer has already answered a question.

The copilot may surface a missing stakeholder, unclear implementation responsibility, unresolved limitation, or contradiction. It must not fabricate an objection, invent a savings calculation, or claim certainty unsupported by evidence. A representative can dismiss a suggestion, with feedback available for model evaluation.

## Proposal and terms

Use a versioned offer record. The closer may select approved options and authorized discounts, not improvise a new contract. Proposed exceptions route to an authorized approver before the customer is promised them. AI can draft an explanation of terms but cannot alter the underlying terms.

Proposal, contract signature, payment authorization, collection, and fulfillment eligibility have separate statuses. A verbal Yes can create a follow-up task, not a collected revenue event. Payment links originate from the approved business provider and use the correct tenant/account.

## Closing without information shortcuts

Before advancing, confirm the customer understands scope, responsibility, timing, price, and important limitations. Ask for the next voluntary decision. Where implementation prerequisites remain unresolved, record them and create a conditional next step rather than treating enthusiasm as readiness.

A no-sale because the offer is unsuitable should be recorded accurately. The system should not punish a closer for respecting an objective exclusion or escalate pressure just because the month is ending.

## Follow-up management

Every active follow-up has an owner, purpose, due time, permitted channel, and customer commitment if one exists. Stop generic sequences when the prospect replies, books, buys, opts out, or enters a different approved workflow. Allow a purposeful human follow-up after a reply; stopping automation is not abandoning the relationship.

The closer's queue distinguishes due commitments, unanswered customer questions, proposals awaiting a decision, contract steps, payment issues, and delivery handoffs. A huge probability-sorted deal list should not hide a promised callback.

## Handoff to fulfillment

The sale creates a structured delivery brief: contracted scope/version, paid and outstanding amounts, prerequisites, promised dates, customer dependencies, exclusions, special approvals, owner, and acceptance criteria. Delivery explicitly accepts responsibility and can flag an unfulfillable promise.

A payment does not prove the delivery team has capacity. If a sale depends on a delivery slot, reserve that capacity under the offer policy before making the promise. This links sales incentives to actual service rather than pushing risk downstream.

## Personal performance view

Show comparable qualified opportunities, attended sales appointments, wins, eligible collected cash, contribution where costs are reliable, time-to-close, refunds/cancellations, customer outcome signals, and one coaching priority. Display stage rates with their denominators and maturity.

Setters and closers need different scorecards. A closer's result can reflect marketing quality, setter behavior, offer constraints, and delivery reputation. Diagnostics must name those possibilities rather than attribute every difference to closing skill.

## Exceptions and recovery

A customer joins under an unknown name: confirm identity before linking private history. A call drops: preserve the task and offer a permitted reconnect. A payment link fails: retain the commercial status and create a payment support task. An unauthorized promise appears in the transcript: flag review and do not silently rewrite the recording or contract.

## Acceptance criteria

The closer can explain why the opportunity was routed to them and what is still unknown. The live workspace is usable without AI. Price authority is enforced outside the model. A signed unpaid contract is not shown as cash. A delivery owner accepts the handoff. A customer request to stop is respected across all relevant sequences. Performance evidence remains traceable to actual cohorts and outcomes.

## Agent task prompt

```text
Design the closer workflow from accepted handoff through conversation, proposal, contract, cash, and delivery acceptance. Include live guidance without script overload, evidence labels, offer authority, exception approvals, and honest financial states. Return the minimal screen and transition specification with tests. Do not equate verbal agreement, signature, or payment authorization with collected revenue.
```

