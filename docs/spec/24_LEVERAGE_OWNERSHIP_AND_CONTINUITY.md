---
document_id: SOS-24
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Leverage, ownership, dependency, and continuity design

**Read with:** [19_REVENUE_COMMISSIONS_AND_FORECASTS.md](19_REVENUE_COMMISSIONS_AND_FORECASTS.md), [22_TECHNICAL_ARCHITECTURE.md](22_TECHNICAL_ARCHITECTURE.md), [23_SECURITY_CONSENT_AND_AI_CONTROLS.md](23_SECURITY_CONSENT_AND_AI_CONTROLS.md)

## Governing principle

Design the relationship so cooperation is practical and default does not immediately destroy the business. Prefer retained lawful control, staged delivery, clear dependencies, recoverable records, and aligned incentives over relying on a lawsuit after a failure.

Control must not become coercion. Do not hold customer documents, domains, statutory records, personal information, or money hostage beyond a legitimate agreed right. The business is a responsible custodian of customer data, not an unrestricted owner of the person or their information.

## Party-by-party analysis

| Party | What they want | Bottleneck they control | What can fail | Preventive design |
|---|---|---|---|---|
| Customer | Useful outcome, clear terms, continuity, control over the decision | Access to their needs, decision, implementation inputs, and voluntary payment | Nonpayment, delayed inputs, misunderstanding, cancellation | Scoped offer, clear prerequisites, agreed milestones, proportional deposits where appropriate, named delivery owner, simple exit/reschedule path. |
| Representative | Fair opportunity, achievable earnings, tools, recognition | Conversation quality, follow-up, knowledge, relationship attention | Departure, neglect, inaccurate promises, off-platform selling | Business-owned accounts/numbers, logged handoffs, transparent attribution/pay rules, shared approved playbooks, backup owners. |
| Company/owner | Durable margin, trustworthy operations, transferable capability | Offer, budget, allocation, systems, approvals | Founder bottleneck, arbitrary rules, underfunded delivery | Publish rules, delegate named responsibilities, reserve delivery capacity, maintain backup admin, separate financial approvals. |
| Lead/ad platform | Account compliance and commercial usage | Access to source traffic and delivery APIs | Account restriction, lost access, price/quality changes | Business-owned ad accounts, source exports, documented permissions, multiple validated acquisition routes when economically justified. |
| CRM/communications vendor | Subscription or usage revenue and policy compliance | Operational interface, numbers, API limits, exports | Outage, lock-in, price changes, revoked integration | Exportability tests, portable IDs, number-porting review, credentials under company control, fallback runbooks. |
| Developer/integrator | Clear scope, payment, workable access | Source code, deployment, integration knowledge | Disappearance, insecure build, unfinished handoff | Company-controlled repository, staged access, milestone acceptance, documented deployment and recovery, second maintainer. |
| Delivery/account management | Accurate promises, capacity, complete handoff | Actual outcome and customer retention | Unfulfillable scope, overload, missing inputs | Versioned offer, delivery acceptance, dependency checklist, escalation, feedback into sales training. |

## Ownership and access before work begins

The business should control its domain/registrar, approved ad accounts, phone-number account, CRM tenant, payment account, repositories for commissioned custom code subject to the agreement, production hosting, automation credentials, recovery channels, and authorized data exports. Vendors retain their own platform IP; purchasing a subscription does not mean owning the platform.

Grant individuals role-limited access rather than giving them the only master login. Keep at least two authorized recovery paths and test them. Use a credential manager, not secrets pasted into model conversations. Distinguish customer-owned assets from the provider's assets in every project agreement.

## Staging a customer sale

Before accepting payment, confirm scope, price, prerequisites, capability, delivery capacity, and who is responsible for customer inputs. A deposit or milestone payment can reduce nonpayment exposure when appropriate and clearly agreed. The exact terms, refunds, and consumer/workforce requirements need review for the actual transaction.

Stage custom work and access by useful accepted deliverables rather than demanding the entire outcome on trust. Avoid taking more obligations than can be delivered. Keep a recoverable record of promises and acceptance. A customer delay should trigger a transparent revised schedule or pause, not an invented penalty.

Do not treat a payment link click as collateral or a guarantee of collection. Do not assume a title, lien, personal guarantee, security interest, or wage deduction exists because the system has a field for it. This pack does not recommend taking on new debt or personal guarantees to build the CRM.

## Staging developer/vendor work

Use a small discovery/configuration milestone, then one demonstrable vertical slice, then measured expansion. Acceptance requires working source, configuration, tests, exports, deployment instructions, and recoverability under the company's account. Pay according to the reviewed agreement and accepted milestones; do not rely on a developer's personal account as the permanent production host.

A vendor evaluation must prove the required export and event access before a long commitment. Request a limited pilot or reversible arrangement where feasible. A detailed contract without working exports does not solve operational lock-in.

## Representative incentives

Tie compensation to the reviewed policy and real eligible commercial events. Make the attribution and correction process transparent. Use quality safeguards so inaccurate promises are not rewarded. Do not convert the source's hypothetical efficiency cost into a deduction or personal liability.

Make staying and cooperating valuable through useful tools, credible opportunity, skill growth, fair rules, and reliable payment. Preserve a transferable company relationship through business-owned channels and complete handoffs, not through coercive control of a person's career or private accounts.

## Single points of failure and removal

| Single point | Practical elimination or mitigation |
|---|---|
| Founder alone understands the workflow | Stage SOPs, ownership map, train a backup, and run a handoff exercise. |
| One star rep owns every customer relationship | Shared authorized history, backup owner, company contact channels, and agreed continuity process. |
| One CRM contains the only usable records | Tested exports, stable identity mapping, recoverable backup, and documented migration path. |
| One phone number/account held by a contractor | Business administration and verified portability/transfer terms. |
| One AI provider is needed to work | Provider-agnostic proposal interface and manual/deterministic fallback. |
| One developer can deploy or restore | Company repository, documented deployment, protected access, and a second maintainer. |
| One payment feed defines reality | Reconciliation with authoritative provider/accounting records and an exception process. |
| One ad source supplies all demand | Preserve source data and test alternatives when justified; do not add expensive channels merely for appearance. |
| One database backup has never been restored | Scheduled restore tests and a documented recovery owner. |

## Offboarding and disputes

Disable new access/actions, revoke credentials, preserve audit records, reassign active work, notify affected internal owners, and honor legitimate customer/employee obligations. Do not delete evidence, alter history, or interrupt customer access merely to gain leverage in a dispute.

An exit plan includes final exports, customer communication responsibilities, number/domain transfer where contractually appropriate, outstanding financial reconciliation, and a retention/deletion plan. Test the exit process during a pilot, not for the first time during a crisis.

## Acceptance criteria

The business can continue through a rep departure, model outage, or contractor disappearance. Essential accounts and recovery access are under legitimate business control. Customer obligations survive offboarding. Milestone acceptance is observable. Export and restore have been tested. No proposed safeguard depends on an assumed legal right or on withholding assets the business is not entitled to retain.

## Agent task prompt

```text
Review a proposed sales, vendor, staffing, or customer arrangement through wants, bottlenecks, control, nonperformance, staged assets/access/money, incentives, collateral or guarantees where legitimately applicable, and single points of failure. Prefer prevention and recoverability. Do not invent security rights, recommend coercive withholding, or make a contract the only operational safeguard.
```

