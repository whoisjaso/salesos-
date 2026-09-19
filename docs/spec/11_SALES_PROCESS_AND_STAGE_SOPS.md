---
document_id: SOS-11
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Sales process and stage-level standard operating procedures

**Read with:** [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [08_PSYCHOLOGY_AND_ADAPTIVE_COMMUNICATION.md](08_PSYCHOLOGY_AND_ADAPTIVE_COMMUNICATION.md), [17_PLAYBOOKS_AND_KNOWLEDGE_LIBRARY.md](17_PLAYBOOKS_AND_KNOWLEDGE_LIBRARY.md)

## In plain language

Do not have one vague instruction to sell better. Define what must happen at each handoff, what evidence proves it happened, and what to do when it cannot happen. The process is repeatable; the conversation can remain human.

## Workflow variants

**Booked-entry:** source calendar inquiry, intake/assignment, pre-call review and confirmation, attended discovery or sales appointment, fit assessment, decision, contract/payment, delivery.

**Form-entry:** source inquiry, intake/assignment, two-way contact, discovery or fit questions, booking when useful, attended next step, decision, contract/payment, delivery.

**Existing-customer expansion:** verified relationship and new opportunity, need/fit confirmation, approved offer, decision, collection, delivery. Do not count it as new-customer acquisition.

Each opportunity stores its workflow version. The software may show a compact common funnel, but it must preserve different valid entry paths and skipped/not-applicable stages.

## SOP record template

Every module stores ID, version, owner, effective date, applicable offer/path, entry conditions, decision objective, required facts, required actions, allowed language variants, automation, evidence, exit conditions, stop/escalation rules, downstream owner, primary metric, quality guardrail, and review history.

An SOP is not just a script. It includes timing, ownership, system behavior, and exception handling. Where an external script is to be reproduced verbatim, its actual text and usage rights must first be supplied; do not reconstruct it from memory.

## SOP A: Intake to accountable owner

**Objective:** preserve the inquiry and put a responsible person on it.

Verify source ID, normalize contact points, check duplicates, record entry path and source/tier snapshot, preserve permission evidence, create/link opportunity, assign under routing policy, and create the first task. No silent reassignment to improve a score.

**Automation:** ingest, deduplicate, assign, and notify. **Human exception:** ambiguous identity or no eligible representative. **Evidence:** submission, opportunity, assignment, and task IDs. **Exit:** accepted responsibility or monitored holding queue. **Metrics:** intake lag, assignment lag, unassigned count, duplicate review backlog. **Guardrail:** no contact without permission.

## SOP B: Assigned inquiry to meaningful contact

**Objective:** respond to the actual request and establish a two-way exchange.

Review the request and existing relationship. Choose the permitted channel and time. Use a relevant opener, identify the business, and ask whether it is a workable time. Log provider attempts; distinguish no answer, voicemail, wrong contact, and meaningful interaction.

Example: `You asked about reducing the work around dealer follow-up. What part is taking the most time today?` This is illustrative wording, not a mandated claim about the prospect.

**Automation:** calling interface, event collection, proposed summary, approved retry task. **Exit:** confirmed contact, agreed callback, or an accurately recorded outcome. **Metrics:** contact rate and permitted attempt timing. **Guardrails:** opt-outs, wrong-party contact, repeat-contact burden, and caller reputation.

## SOP C: Contact or booked intake to a retained appointment

**Objective:** make the next conversation relevant, feasible, and clearly agreed.

Clarify the prospect's goal, identify what the appointment will resolve, check basic fit without unnecessary interrogation, offer real available slots, confirm timezone/duration, explain who attends, and send the appropriate preparation. Ask what the prospect needs before the call. Do not pretend calendar delivery equals commitment.

For a self-booked inquiry, perform pre-call review without forcing the person to rebook. DQ requires the approved reason/evidence process. A customer needing a different time is not automatically a bad lead.

**Metrics:** path-specific booking/retention, cancellations, and later show rate. **Guardrails:** truthful appointment purpose, unnecessary meetings, excessive reminders, and overbooking.

## SOP D: Retained appointment to attended conversation

**Objective:** remove avoidable friction and be ready when the customer arrives.

Send approved reminders through permitted channels. Confirm the link or call method, timezone, contact details, and responsible representative. At appointment time, verify presence. If the person is absent, use the approved grace and recovery process. If the rep is absent, classify it as a representative/service failure, not customer no-show.

**Automation:** reminders, participant events, attendance proposals, recovery tasks. **Human exception:** identity mismatch, phone/in-person evidence, delayed provider event. **Metrics:** scheduled-cohort show rate, unresolved evidence, rep punctuality, late cancellations. **Guardrail:** customer wait time and contact burden.

## SOP E: Conversation to fit assessment

**Objective:** understand whether the offer addresses the problem and what remains unknown.

Ask about the current process, desired outcome, relevant business constraints, decision participants, implementation readiness, and an appropriate budget/timing discussion. Separate what the customer says from what is verified. Apply the offer's objective criteria. Record rep-perceived fit separately.

Example: `Who would use this day to day, and who needs to agree before you change the process?` Do not convert an unknown answer into a hard rejection.

**Metrics:** assessment coverage, independently reviewed fit accuracy, handoff completeness. **Guardrails:** unsuitable sales, unsupported assumptions, and post-hoc DQ. A high perceived-qualified percentage is not automatically good performance.

## SOP F: Fit to recommendation and decision

**Objective:** offer a relevant, accurate solution and help the customer evaluate it.

Restate the problem and agreed outcome; present only the approved scope; explain implementation, responsibilities, limitations, price and options; resolve actual uncertainty; and ask for the next voluntary decision. Use relevant customer evidence, not canned identity pressure.

Example: `Based on what you described, this option addresses X. It does not handle Y. Would you like to review the implementation steps or the economics first?`

**Metrics:** comparable qualified-to-win, sales cycle, customer understanding and cancellation/refund outcomes. **Guardrails:** unapproved guarantees, discount abuse, and pressure to sell an unsuitable offer.

## SOP G: Decision to contract and collection

**Objective:** document agreement accurately and reconcile actual money.

Create the correct offer/contract version, obtain authorized signatures, issue payment through the business account, track partial or delayed payment, and communicate the next step. Keep verbal Yes, signature, authorization, collection, and payout distinct.

**Metrics:** signed-to-collected conversion, payment completion time, failed payments, outstanding balance. **Guardrails:** duplicate charges, wrong payment destination, unauthorized terms, and insecure card-data handling.

## SOP H: Collected sale to delivery and retention

**Objective:** fulfill what was sold and preserve the relationship.

Handoff scope, promises, dependencies, paid/outstanding amounts, deadline, owner, and acceptance criteria. Delivery acknowledges responsibility and flags gaps. Track customer outcome, cancellation, refund, support burden, and relevant expansion separately from the initial sale.

**Metrics:** handoff acceptance, time to first value, delivery completion, quality-adjusted commercial outcomes. **Guardrail:** selling faster than the business can deliver.

## SOP I: Lost, DQ, nurture, and reactivation

Record the actual reason and evidence. Differentiate poor product fit, timing, no decision, unavailable budget under the approved policy, competitor choice, unreachable contact, and explicit opt-out. Nurture needs a permitted purpose/channel. Reactivation keeps history and creates a new opportunity only when the buying-cycle policy warrants it.

Do not use loss/DQ categories to hide attendance or improve lead denominators. No amount of gamification overrides a stop request.

## Improvement procedure

Choose one stage problem, inspect its evidence and comparable cohorts, identify a controllable hypothesis, select a small approved change, test it, examine downstream guardrails, and update the version only after review. A winning stage tactic may fail when combined with another tactic; test the assembled workflow before general rollout.

## Acceptance criteria

Every live opportunity has a next action or terminal/nurture reason. Every stage has evidence and an owner. Scripts can vary without changing the offer's truth. Direct bookings and combined discovery/sales calls work. A no-show cannot be deleted into a better conversion rate. A sale cannot finish without an accountable delivery handoff.

## Agent task prompt

```text
Write or refine one stage SOP for the approved offer and entry path. Include entry conditions, objective, minimal questions/actions, allowed adaptations, system automation, evidence, exit states, next owner, metric, guardrails, and exceptions. Preserve a stable process while allowing natural language. Do not invent the text of an external sales methodology or implement the entire sales system at once.
```

