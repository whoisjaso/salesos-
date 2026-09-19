---
document_id: SOS-00
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Product brief and operating philosophy

## In plain language

Build the place a sales team works, not another database it must babysit. The system receives an opportunity, gives it to an appropriate available salesperson, preserves what happens, guides the next useful action, and shows where the business is losing opportunities or cash. It should help a competent ordinary representative perform consistently without making the business dependent on a single gifted closer.

The requested deliverable is this specification pack. No application, integration, advertising campaign, paid subscription, employment policy, or customer outreach is authorized merely by the existence of these documents.

## The user's intended product

The interface should be clean, premium, fast, and understandable at a glance. The central visual language is a sequence of stage counts with clearly defined conversion rates between them. Subtle green, amber, or red outlines indicate performance relative to a valid stage-specific benchmark. The owner sees economics and bottlenecks; setters and closers see their next action, pipeline, progress, and actionable coaching.

Relational lead-to-representative pairing, communication preferences, ego/identity lenses, gamified progression, transparent leaderboards, and versioned stage SOPs are first-class design concepts. They are not permission to invent personality diagnoses, conceal evidence, pressure customers, or optimize a vanity score instead of sustainable customer value.

## Business scope and assumptions

**Working assumption:** Start as an internal sales system for the user's own offer, with Obavia as the working business context. A later dealer-facing version is a separate product decision. The latest conversation does not establish the launch offer, price, team size, current connected providers, or production budget.

The B2B sale of dealer software/services and the B2C sale or financing of a vehicle must not silently share qualification policies. Vehicle availability, title, registration, consumer finance, and dealership-specific obligations belong in separate domain modules if a dealer-facing scope is approved. This pack does not authorize credit decisions or personality-based financial eligibility.

## Success, expressed as observable outcomes

1. An eligible new inquiry reaches a responsible person without disappearing between systems.
2. The representative knows whom to contact, why, and through which permitted channel.
3. The event history is accurate enough to reproduce stage counts, assignments, collected cash, and attribution.
4. The representative receives one specific, evidence-backed improvement task rather than generic motivational advice.
5. The owner can distinguish volume, lead mix, capacity, execution, data gaps, and economics.
6. The business can replace an employee or provider without losing the customer relationship or essential records.

Before launch, baseline the current process. Measure changes against that baseline; do not invent an improvement percentage as a product promise.

## Stable structure, adaptable execution

The sequence of decision objectives remains understandable: establish contact, understand the problem, establish fit, agree on a next step, present accurate terms, obtain a voluntary decision, collect and reconcile payment, and fulfill the promise. Specific paths vary by offer. A self-booked prospect need not repeat a setter conversation just to satisfy a diagram.

Language, examples, evidence format, question ordering within an approved module, and coaching may adapt. Truth, scope, prices, mandatory disclosures, eligibility rules, and the customer's right to decline do not adapt to an ego label. Process versions change deliberately; there is no forced quarterly script replacement.

## Product boundaries

### Required early

Accurate intake, unique opportunity identity, auditable assignment, a simple calling/task workspace, scheduling, attendance evidence or a clear exception queue, structured qualification, payment reconciliation, basic funnel cards, and access controls.

### Designed now, enabled later

Evidence-linked AI summaries, archetype-informed coaching, fair leaderboards, personal progression, playbook experiments, guarded lead-priority changes, scenario-based earnings tips, and capacity-aware relational routing.

### Deliberately excluded from an initial release

A new phone network, email delivery platform, video service, card processor, full marketing suite, custom general-purpose automation builder, autonomous high-pressure closer, predictive dialer, unrestricted personality inference, or a compulsory data warehouse. Feature specification is not a requirement to build every feature immediately.

## Build-versus-buy position

Default to configuring a suitable CRM and buying communication/payment infrastructure. Add a small differentiated interface or analytics layer only when a measured workflow gap justifies it. Owning a useful normalized history is valuable; owning every infrastructure layer is not required. AI-generated code is a development aid, not proof of correctness, maintainability, security, or low operating cost.

## User journeys

**Setter:** A new inquiry is assigned. The setter sees the source, request, preferred language, time constraints, and prior relationship. One action starts a permitted contact. The system logs provider facts and proposes a summary. The setter confirms uncertain interpretation, agrees on the next step, and moves on.

**Closer:** Before a meeting, the closer sees the prospect's actual words, fit evidence, unresolved questions, approved offer, decision participants, and communication preferences. The closer can ask for clarification rather than trust a personality score. A contract or payment creates its own authoritative event; clicking a stage does not create money.

**Owner:** The owner sees a comparable-cohort funnel, data freshness, actual cash, quality outcomes, representative capacity, and a prioritized investigation. The system says what the evidence supports and what remains a hypothesis.

**Customer:** The person gets timely, coherent communication, truthful answers, a clear appointment, a meaningful handoff, and a simple way to decline, change channels, or stop contact.

## Definition of done for the product concept

The same real opportunity can be traced from source to owner to conversation to appointment to outcome to cash without spreadsheet guesswork. A failed provider or uncertain AI conclusion is visible and recoverable. An ordinary representative can complete the common workflow without editing a large record form.

## Agent task prompt

```text
Read AGENTS.md, this brief, and the metric contracts. Restate the product goal, user roles, explicit requirements, working assumptions, and exclusions. Identify the smallest closed-loop pilot that tests the goal without building a generic CRM. Produce a design proposal, not production code or provider purchases. Preserve relational pairing and gamification as specified capabilities, but separate their design from their activation gates.
```

