---
document_id: SOS-06
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Lead assignment, routing, and capacity control

**Read with:** [07_RELATIONAL_PAIRING_AND_ARCHETYPES.md](07_RELATIONAL_PAIRING_AND_ARCHETYPES.md), [14_LEADERBOARDS_AND_FAIR_COMPARISONS.md](14_LEADERBOARDS_AND_FAIR_COMPARISONS.md), [23_SECURITY_CONSENT_AND_AI_CONTROLS.md](23_SECURITY_CONSENT_AND_AI_CONTROLS.md)

## In plain language

Send the right opportunity to an available, appropriate representative quickly. Do not send everything to yesterday's revenue leader, starve newcomers, or leave a prospect waiting for an imagined perfect personality match.

## Routing order

The routing decision uses this order of precedence:

1. **Permission and eligibility:** communication permission, active account, product authorization, language capability, approved territory and working hours, conflict restrictions.
2. **Relationship continuity:** existing responsible representative or explicit customer preference, unless unavailable beyond the agreed service window.
3. **Real capacity:** upcoming appointments, active conversations, required preparation, follow-up commitments, and availability actually provided.
4. **Service level:** ensure a timely response and preserve already agreed customer commitments.
5. **Fair opportunity allocation:** round robin or capacity-weighted allocation, with an explicit development pool for qualified newer representatives.
6. **Validated performance preference:** bounded weighting using comparable, mature outcomes, not raw lifetime revenue.
7. **Relational preference:** evidence-backed communication compatibility as a bounded tie-breaker after the preceding constraints.

During the first pilot, activate steps 1-5. Log the later inputs in shadow mode rather than claiming a trained matching engine already exists.

## Inputs and output

Input includes tenant, opportunity, offer/workflow, source/tier snapshot, language/channel preferences, existing relationship, current owners, time constraints, live representative availability, active workload, eligibility policy, routing version, experiment status, and evidence-backed profile fields when permitted.

Output is an assignment record with chosen representative, responsible role, decision time, eligible candidate set, exclusions and reasons, ranking components if used, actual selection probability, capacity reservation, acceptance deadline, fallback destination, and a human-readable explanation.

Example explanation: `Assigned to Rep B: English support, three open intake slots, available now, existing Rep A unavailable until tomorrow. Personality information was not used.`

## Setter and closer are different decisions

A new form inquiry can be routed to a setter. A self-booked qualified inquiry may route directly to a closer. A setter's conversion performance does not automatically qualify them to handle a closer's offer. Define role-specific eligibility and coverage.

The closer handoff must contain fit evidence, customer wording, stakeholders, appointment details, approved expectations, missing information, and who owns the follow-up. A receiving closer explicitly accepts the handoff or the system retains a fallback owner. No opportunity may become ownerless because two people assume the other is responsible.

## Availability and capacity

Published calendar hours are intentions, not measured selling capacity. Estimate load as scheduled meeting duration plus preparation, wrap-up, reasonable follow-up allowance, existing task commitments, and buffer. Keep offered availability, actual attendance, utilization, and service quality separate.

Reserve capacity atomically when booking or assigning a capacity-limited task. Release it when the appointment is superseded or canceled under policy. A representative accepting 100 overlapping slots is not more available than a representative offering 20 deliverable slots.

A representative can pause new intake without deleting existing obligations. Breaks, training, leave, and approved non-selling work reduce available capacity. Do not reward unsafe schedules or penalize a person for refusing simultaneous customer promises they cannot fulfill.

## Queue lifecycle

States are `unassigned`, `reserved`, `assigned`, `accepted`, `in_progress`, `awaiting_customer`, `completed`, `escalated`, and `canceled`. Reservation and assignment transitions use a lock or compare-and-set rule so two workers cannot call the same lead concurrently.

Use one action lease per opportunity/channel. A task checks consent and current state immediately before execution. A reply or booking can invalidate a stale queued call. Expired acceptance deadlines escalate using a configured business-hours clock rather than a universal timer.

A proposed service target is assignment within ten seconds of a valid ingested inquiry while coverage exists. This is an engineering target to test, not an established provider guarantee. Preserve separate timestamps for source generation, ingestion, normalization, assignment, first attempt, and first contact.

## Performance tiering without a feedback trap

Lead pools may have different acquisition cost and intent. Store the pool's definition before assignment. Performance privileges are bounded, reviewed, and reversible. A high performer receives more opportunity only while data is comparable, customer outcomes are acceptable, and actual capacity exists.

Reserve a predefined exploration/development share among eligible representatives. Its value is a pilot policy decision, not a universal percentage. Log assignment probabilities to evaluate the policy. A newer representative must have a feasible route to a mature evaluation sample without depending entirely on poor-quality leftovers.

Monthly competition can reset its display, but routing must not forget past safety problems, customer relationships, qualification skills, or historical evidence. Movement during the month remains provisional until the rules permit a change.

## Fallbacks and failure cases

If no representative is eligible, retain the opportunity in a monitored holding queue, acknowledge only through permitted channels, and offer a truthful response expectation. Do not silently send it to an unqualified person. If a requested representative is busy, offer another person or a later appointment rather than transferring without context.

If routing or profiling fails, fall back to deterministic eligibility plus round robin/capacity. If a representative leaves, revoke access and reassign outstanding work through the historical assignment ledger. The system must not require that representative's personal phone or login to recover the relationship.

## Acceptance criteria

An opted-out contact never starts a queued sales action. Two simultaneous assignment workers produce one owner. A full closer stops receiving new appointments. A returning customer retains continuity when feasible. An unknown communication profile causes no delay. Newcomers receive the development allocation specified by policy. The manager can explain every assignment without saying only that AI decided.

## Agent task prompt

```text
Propose the routing policy for one approved offer and team. Separate hard constraints from optimization preferences. Specify role handoffs, capacity reservations, race-condition protection, explainability, exploration, and fallback. Treat unvalidated personality matching as shadow-mode only. Produce example decisions for a new lead, existing customer, busy top performer, newcomer, and no eligible representative.
```

