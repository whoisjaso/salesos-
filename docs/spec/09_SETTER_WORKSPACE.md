---
document_id: SOS-09
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Setter workspace and immediate lead execution

**Read with:** [06_LEAD_ROUTING_AND_CAPACITY.md](06_LEAD_ROUTING_AND_CAPACITY.md), [12_SCHEDULING_ATTENDANCE_AND_RECOVERY.md](12_SCHEDULING_ATTENDANCE_AND_RECOVERY.md), [20_UX_AND_VISUAL_METRIC_LANGUAGE.md](20_UX_AND_VISUAL_METRIC_LANGUAGE.md)

## Purpose and experience

The setter opens the product and sees the next useful action. They should not navigate a database to find a fresh inquiry or manually copy every conversation into a CRM. The workspace must remain usable when AI is unavailable.

## Screen hierarchy

**Primary:** current opportunity, responsible action, customer request, permission/channel status, source age, and one prominent action such as Call, Reply, or Confirm Appointment.

**Secondary:** upcoming commitments, callbacks, queue progress, and alerts that affect this customer now.

**Tertiary:** today's activity, a compact funnel, one coaching task, and a link to personal progress. Public rank must not obscure the customer conversation.

A contact card shows name or verified identifier, organization if relevant, preferred language/channel, submitted request, last interaction, next commitment, and short context. Do not expose private psychological speculation or an ungrounded wealth score.

## Queue priorities

Work scheduled commitments at their due time, urgent customer replies, fresh eligible inquiries, agreed follow-ups, and approved reattempts. Priority is not simply the highest hypothetical deal value. The queue must honor promises, consent, and customer preferences.

Each card explains its priority: `New eligible inquiry received two minutes ago`, `Customer asked for a callback at 3:00`, or `Appointment confirmation needs review`. A predictive score without an explanation is not enough.

## Call workflow

1. Reserve the action lease and recheck permissions/current state.
2. Display the customer's request and a short approved opener.
3. Start the call through the business-owned provider connection.
4. Show ringing/connected/ended status as provider facts.
5. When evidence becomes available, propose a summary and likely outcome.
6. Ask for a brief confirmation only when interpretation affects the next step.
7. Create the agreed appointment, task, or DQ review through the canonical workflow.
8. Release the lease and present the next task.

A completed provider call does not automatically mark Contacted. A voicemail outcome offers the permitted next step, not fabricated conversation notes.

## Appointment booking

Offer actual available slots, correct timezone, meeting purpose, duration, and representative. Prefer a concrete agreed next step over a vague `someone will call`. Confirm delivery of the invitation but do not interpret delivery as customer commitment or attendance.

The booking action produces an appointment ID and a visible confirmation. A timeout must query whether booking succeeded before retrying, preventing duplicate appointments. Rescheduling preserves the lineage and customer context.

## Qualification and handoff

Use only a few offer-specific questions that genuinely determine the next step. Separate verified facts, stated but unverified facts, unknowns, and rep-perceived fit. The setter should not need to force a numeric score to move on.

The handoff preview contains the problem in the customer's words, product-fit evidence, decision participants, timeline, explicit questions, commitments already made, communication preferences, and missing information. The receiving closer can accept or request clarification without returning the lead to an ownerless queue.

## Coaching and personal economics

Display one action tied to a real bottleneck: `Confirm the meeting purpose using the customer's own goal on your next five eligible bookings.` Show why it was selected, an example, and the intended measure. Link to comparable team examples when approved.

A personal earnings card distinguishes commission accrued, eligible, paid, and scenario projections. It must not promise a fixed amount for every extra call. The system can say `Your historical commission per attended appointment in this cohort was X`, with sample and time basis.

## Interaction design

Use keyboard support, large mobile touch targets, visible focus, non-color status labels, and recoverable actions. Keep primary controls stable while data updates. Do not move a Call button under the cursor when a new lead arrives. Notify without stealing focus from an active conversation.

Routine note fields can be optional and progressively disclosed. Sensitive actions such as DQ, changing ownership, overriding permission, or editing an attributed outcome need reason capture and permission checks. No production permission override should be available merely to increase dialing volume.

## Exceptions

AI delayed: allow the conversation to continue and offer later review. Phone provider failed: show the approved business fallback. Customer replies during a queued call: cancel or re-evaluate the stale task. Two reps open the same record: show the active owner/lease. Browser reload: restore the current call/task without re-executing it.

## Acceptance criteria

A setter can handle a new inquiry, no answer, meaningful reply, booking, and handoff without browsing multiple unrelated pages. Every action has a recorded result or visible pending state. The customer is not contacted twice due to a race or refresh. The screen is usable on mobile and by keyboard. Manual confirmations are limited to genuine uncertainties and consequential judgments.

## Agent task prompt

```text
Specify the setter's end-to-end interaction for the approved entry path. Return the screen hierarchy, action states, minimal fields, calling/booking behavior, permission checks, errors, and acceptance tests. Optimize for one clear next action, not a dense CRM form. Preserve provider facts versus AI interpretations and do not put leaderboard pressure ahead of the live customer.
```

