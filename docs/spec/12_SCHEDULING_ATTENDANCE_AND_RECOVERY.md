---
document_id: SOS-12
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Scheduling, show verification, and no-show recovery

**Read with:** [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [04_INTEGRATIONS_AND_AUTOMATIC_TRACKING.md](04_INTEGRATIONS_AND_AUTOMATIC_TRACKING.md), [06_LEAD_ROUTING_AND_CAPACITY.md](06_LEAD_ROUTING_AND_CAPACITY.md)

## Why this matters

In the supplied transcript, pre-call work and show rate materially affect reported revenue per lead. The product should make attendance measurable and recoverable. It must not inflate it with calendar metadata or compensate for poor attendance by promising impossible simultaneous meetings.

## Appointment object and lineage

Store appointment type, offer/path, prospect and representative IDs, timezone, scheduled start/end, provider meeting ID, invitation state, confirmation state, retention cutoff, cancellation reason, and reschedule lineage. Each new scheduled occurrence has its own instance ID; all instances remain linked to the original appointment intent.

Separate booking, invitation delivery, customer confirmation, retention after review, attendance, and substantive conversation. A prospect can confirm and still not show; a person can join briefly without completing discovery.

## Attendance evidence rules

For a video meeting, match the relevant customer identity and representative identity to provider participant events, calculate overlap, and check the approved attendance policy. Do not treat a common display name as verified identity. A customer can reconnect repeatedly; combine intervals without double-counting overlapping time.

For a phone appointment, link the scheduled instance with the appropriate provider call and reviewed human-interaction evidence. For in-person meetings, use a permitted check-in or an audited staff confirmation. A calendar event alone is insufficient in every modality.

No universal duration threshold is asserted. The pilot must define what counts as attended versus completed by meeting type. Preserve both attendance duration and the semantic outcome. Two minutes of a genuine appointment may be a valid attendance but an incomplete discovery.

## Instance outcomes

Use `scheduled`, `canceled_before_cutoff`, `superseded_before_cutoff`, `late_canceled`, `attended`, `customer_no_show`, `rep_no_show`, `both_absent`, `technical_failure`, and `unknown`. `Unknown` is not a customer failure. Late provider data can correct an outcome with a revision, not an invisible overwrite.

The show denominator follows SOS-02. After cutoff, an unfavorable outcome cannot be removed by rescheduling it. Track recovered attendance separately so the system rewards recovery without rewriting the original experience.

## Reminder and preparation policy

Reminders state the actual purpose, time, timezone, responsible person, link/phone method, and a simple reschedule/cancel path. Channel, cadence, local timing, and permission are approved settings. Do not hard-code the earlier aggressive repeat-call example as a universal sequence.

Preparation should reduce uncertainty: what the customer should bring, what they will learn, and what decisions are optional. Do not fabricate urgency or imply that booking commits them to buy.

Stop stale reminders when the appointment is changed, the customer replies, or permission changes. Send actions recheck status immediately before execution, not only when a task was created.

## Recovery workflow

At the scheduled time, check whether attendance evidence exists. During a configured grace period, a permitted reminder may ask whether the person can still join. Alert the representative to contact through the agreed channel if appropriate. After the maturity period, classify only when evidence is sufficient; otherwise open an exception.

Offer a respectful reschedule. Do not assume absence means low intent, low income, or bad character. Record a stated reason only when supplied. If the representative caused the failure, acknowledge and route a service recovery task rather than blaming the customer.

## Double booking: source idea, not default behavior

The speaker reports using double booking to address roughly 48% attendance. This pack does not enable routine double booking. Under the purely illustrative assumption that two prospects independently attend with probability 0.48, both attend with probability `0.48 × 0.48 = 23.04%`. One rep cannot conduct two promised live meetings simultaneously. Independence itself may be false.

Preferred alternatives are shorter booking lead time where feasible, accurate preparation, waitlists with customer agreement, standby coverage, backup closers, and flexible team pools. Evaluate these against actual capacity and customer experience.

Any overbooking trial requires explicit owner approval, a backup host with reserved capacity, honest customer expectations, maximum wait limits, collision monitoring, an immediate stop rule, and separate reporting of customer and rep failures. Do not present overbooking as free extra capacity.

## Service and business metrics

Show rate, rep punctuality, customer wait time, unknown evidence rate, late cancellation, rescheduling frequency, recovery rate, completion rate, and net outcome per allocated opportunity. A reminder that lifts attendance but increases opt-outs or complaints must be reviewed.

## Acceptance criteria

Timezone changes and daylight-saving transitions are handled correctly. A participant reconnecting does not generate multiple shows. A late webhook can resolve Unknown. A rep absence is not customer no-show. Reschedules preserve history. Duplicate booking retries do not create parallel meetings. Both customers arriving at an experimental overbooked slot trigger the documented backup, not silent abandonment.

## Agent task prompt

```text
Specify the appointment lifecycle for video, phone, and optional in-person meetings. Define evidence, identity matching, duration policy, lineage, denominator cutoff, Unknown handling, reminder cancellation, and recovery. Keep routine overbooking off; treat any proposed trial as a capacity and customer-experience experiment with a backup and stop rule.
```

