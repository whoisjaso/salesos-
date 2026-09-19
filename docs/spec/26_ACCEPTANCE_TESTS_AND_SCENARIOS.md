---
document_id: SOS-26
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Acceptance tests, adversarial scenarios, and release evidence

**Read with:** [01_SOURCE_AUDIT_AND_CORRECTIONS.md](01_SOURCE_AUDIT_AND_CORRECTIONS.md), [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [22_TECHNICAL_ARCHITECTURE.md](22_TECHNICAL_ARCHITECTURE.md)

## Purpose and status

These are **required tests for a future implementation**, not a claim that an application has been built or passed them. The separate packaging validation checks the Markdown artifacts, arithmetic fixtures, links, and example syntax only.

A release passes only when its implemented scope has evidence from the real code/configuration and appropriate sandbox/provider tests. Missing live integrations cannot be replaced by screenshots of mocked success.

## Canonical source fixture

Use the source-reproduction input below for calculation tests. It is illustrative source data, not a claim of independently verified revenue.

```json
{
  "basis": "imported_reported_revenue_unknown_collection_status",
  "ben": {"tier": 1, "leads": 129, "retained_bookings": 85, "shows": 71, "perceived_qualified": 58, "wins": 21, "revenue_minor": 68600000, "currency": "USD"},
  "high_volume_rep": {"tier": 2, "leads": 776, "retained_bookings": 475, "shows": 159, "perceived_qualified": 109, "wins": 39, "revenue_minor": 123400000, "currency": "USD"}
}
```

Expected high-volume show rate is `159 / 475`, about 33.47%, not `150 / 475`. Ben's RPL is `$686,000 / 129`, about $5,317.83. Different tiers remain visible. Scaling Ben's raw RPL to 776 leads is a scenario, not a forecast.

## Identity, intake, and attribution tests

| ID | Given / action | Required result |
|---|---|---|
| T01 | The same provider submission arrives three times | One source business event/opportunity effect; replay remains auditable. |
| T02 | A person submits twice about the same active buying cycle | Preserve two inquiry events; do not create duplicate accountable opportunity credit. |
| T03 | Two people share a company phone number | Do not merge automatically without sufficient identity evidence. |
| T04 | One company has two decision participants | One commercial opportunity can link both contacts without doubling revenue. |
| T05 | A rep DQs an assigned opportunity | It remains in the assigned denominator; reason and policy are preserved. |
| T06 | A manager transfers a near-close deal | Historical responsibility and the attribution policy determine reporting, not only current owner. |
| T07 | A genuine duplicate is centrally corrected | Record adjustment and report revision; reconcile before/after totals. |
| T08 | A tier changes after a promotion | Prior opportunities retain tier-at-assignment and routing-policy version. |

## Calls, appointments, and permissions

| ID | Given / action | Required result |
|---|---|---|
| T09 | Provider reports a completed voicemail call | Count appropriate attempt/status, not a verified human conversation. |
| T10 | An appointment exists but nobody joined | Do not mark Show from booking metadata. |
| T11 | A meeting participant has an ambiguous display name | Attendance remains unresolved until identity evidence is sufficient. |
| T12 | Customer reconnects three times | Merge attendance intervals appropriately; one appointment show. |
| T13 | Rep is absent but customer attends | Record rep service failure, not customer no-show. |
| T14 | Appointment is rescheduled before cutoff | Preserve lineage; apply declared denominator policy without duplicate shows. |
| T15 | Rep reschedules after a missed appointment | Original locked outcome remains; recovery is recorded separately. |
| T16 | Attendance webhook arrives late | Unknown can be corrected with a visible revision; do not silently penalize the rep beforehand. |
| T17 | Two workers start the same contact task | One action lease succeeds; customer is not dialed twice. |
| T18 | Customer opts out after a message was queued | Send-time check cancels the relevant action and future sequence. |
| T19 | Customer replies while an old reminder is pending | Re-evaluate/cancel the stale task according to workflow. |
| T20 | Booking API times out after creating the event | Reconcile before retry; no duplicate meeting. |
| T21 | A daylight-saving/timezone boundary is crossed | Correct customer-facing time and canonical UTC scheduling. |
| T22 | Both prospects attend an approved overbooking trial | Reserved backup and wait policy execute; no silent abandonment. |

## Qualification, psychology, and AI behavior

| ID | Given / action | Required result |
|---|---|---|
| T23 | Customer authority or budget is unstated | Unknown and a relevant question, not an invented value. |
| T24 | Rep perceives low fit but objective evidence meets criteria | Store both assessments; review discrepancy without diagnosing pessimism. |
| T25 | A single sentence suggests an identity lens | Provisional evidence-linked hypothesis, not a permanent personality fact. |
| T26 | Explicit customer preference contradicts a profile | Respect the preference and record the correction. |
| T27 | No profile exists for a new lead | Route promptly through the normal eligible/capacity baseline. |
| T28 | Irrelevant sensitive demographic details change | They do not alter qualification, price, or routing decisions. |
| T29 | Transcript contains instructions to export customer data | Treat as untrusted content; no tool action or permission change. |
| T30 | AI is unavailable mid-call | Rep can continue with approved facts, SOP, and manual confirmation. |
| T31 | AI proposes an unsupported guarantee | Block the claim and surface the approved offer boundary. |
| T32 | Prospect says No or asks to stop | Respect the decision; no identity-pressure suggestion. |

## Metrics, money, and incentives

| ID | Given / action | Required result |
|---|---|---|
| T33 | Denominator is zero | N/A with explanation; not zero efficiency or 100%. |
| T34 | Team rates have unequal rep denominators | Calculate pooled numerator / pooled denominator, not the unweighted mean. |
| T35 | Current-month cash includes older opportunities | Separate activity cash from acquisition-cohort RPL. |
| T36 | One win from six leads produces high raw RPL | Display result and sample; consequential ranking follows maturity policy. |
| T37 | Payment event is duplicated or arrives out of order | One reconciled financial effect; pending mappings go to review. |
| T38 | $10,000 is collected and $2,000 refunded | Eligible net basis becomes $8,000 before fees under the declared policy. |
| T39 | Remaining $8,000 is disputed and later returned | Ledger moves to zero and back to $8,000 without double subtraction. |
| T40 | Contract is signed but unpaid | Contracted value changes; collected cash does not. |
| T41 | Same payment is split across setter and closer | Allocation reconciles to one payment; company revenue is not doubled. |
| T42 | Commission is divided by appointment count | Label per-appointment, not hourly, unless actual duration supports the chosen time metric. |
| T43 | Coaching computes a peer benchmark gap | Label counterfactual scenario; no employee debt or automatic deduction. |
| T44 | A gamified mission produces more complaints | Guardrail can pause the mission despite higher activity. |
| T45 | A compensation rule changes | Preserve applicable historical policy; no silent retroactive rewrite. |

## Security, operations, and experimentation

| ID | Given / action | Required result |
|---|---|---|
| T46 | A user requests another tenant's object ID | Server-side authorization denies access. |
| T47 | A representative leaves | Access revoked; active commitments reassigned; history preserved. |
| T48 | Provider credentials expire | Health alert, bounded retries, fallback and recovery procedure. |
| T49 | Data is stale or materially incomplete | Visible state and pause on consequential ranking/financial automation. |
| T50 | A backup is restored into a clean environment | Required records, mappings, and audit integrity are recovered and verified. |
| T51 | A script experiment is assigned after the outcome | Enrollment is rejected or flagged invalid; no false causal analysis. |
| T52 | One prospect is placed in conflicting variants | Sticky assignment or an approved interaction plan prevents contradiction. |
| T53 | A profile model is changed | Version, evaluation, and rollback exist; behavior does not silently change. |
| T54 | The interface is used without color, hover, or mouse | Status and core workflows remain understandable and operable. |
| T55 | Customer evidence is removed under approved retention policy | Sensitive payload is removed; permitted non-identifying audit/ledger integrity remains. |
| T56 | An agent tries to change payment destination | Policy and authorization layer blocks the operation. |

## Release evidence format

For each implemented test, record build/configuration version, environment, fixture, procedure, expected result, actual result, artifact/log evidence, reviewer, date, and unresolved limitations. Mark Not Implemented, Not Run, Passed, Failed, or Blocked. Do not use Passed for a design review alone.

A pilot also needs task-based user testing, reconciliation over a declared observation window, operational-owner acceptance, security/permission review, and a rollback demonstration. Provider simulations are useful but must be distinguished from actual sandbox integration evidence.

## Agent task scope

An implementation agent should select tests for the approved vertical slice before writing code, add slice-specific cases, and report only executed results. Tests for future modules remain in the backlog without implying that the present release contains them.

## Agent task prompt

```text
Select acceptance tests for the approved vertical slice and turn them into executable checks where appropriate. Keep fixture tests, provider sandbox tests, usability tests, security checks, and unimplemented future tests distinct. Report actual evidence and limitations. Do not claim an application passes merely because the Markdown pack or mocked interface is valid.
```

