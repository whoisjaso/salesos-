---
document_id: SOS-25
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Build-versus-buy judgment and staged delivery gates

**Read with:** [00_PRODUCT_BRIEF.md](00_PRODUCT_BRIEF.md), [22_TECHNICAL_ARCHITECTURE.md](22_TECHNICAL_ARCHITECTURE.md), [24_LEVERAGE_OWNERSHIP_AND_CONTINUITY.md](24_LEVERAGE_OWNERSHIP_AND_CONTINUITY.md), [26_ACCEPTANCE_TESTS_AND_SCENARIOS.md](26_ACCEPTANCE_TESTS_AND_SCENARIOS.md), [29_SOURCES_AND_RESEARCH.md](29_SOURCES_AND_RESEARCH.md)

## Decision

Do not start by building everything described in this pack. Start by validating one offer and one sales workflow with an existing operational system. Buy commodity infrastructure. Configure first. Add a narrow custom experience only when the evidence shows a valuable gap.

The earlier blanket recommendation to build the top 20% was too certain for the information available. We do not yet know the actual team, current subscriptions, budget, event permissions, or commercial scale. A feature-rich AI prototype can be fast to produce while still being expensive to make reliable and maintain.

## Three approaches

| Approach | Appropriate when | Main advantage | Main risk |
|---|---|---|---|
| Configure an existing CRM | The workflow can be expressed with existing records, tasks, calls, calendar and reports | Smallest custom maintenance burden | Interface/API/plan limits may constrain the desired experience. |
| Existing CRM plus thin overlay | Operational tools work but funnel clarity, coaching, or role UX has a measured gap | Differentiation without rebuilding commodity operations | Sync conflicts and integration maintenance if authority is unclear. |
| Custom operating core | A validated repeated workflow cannot be served economically by configuration/overlay | Greater workflow control | Security, migrations, support, integrations, outages, and engineering dependence. |

The recommended starting choice is configuration. Thin overlay is the next option only after a concrete failed workflow test. Custom core is not approved by this document.

## Candidate evaluation, not purchase advice

Prior context mentions Zoho, but this pack has not inspected the user's actual active plan or connected configuration. Official Zoho materials describe CRM calling/logging and change notifications, making it a sensible first capability test if it is already in use. That is not a confirmation that the user's plan supports every requirement. [S05, S06]

Evaluate the existing system before a broad shopping exercise. Another product is considered only when a required task fails or total cost is materially better. Do not invent current prices, feature tiers, or claimed implementation times. Verify current official documentation, subscription rights, exportability, and event coverage during the decision.

## Capability test

Use a test opportunity to demonstrate intake, deduplication, assignment, click-to-call and provider facts, booking, attendance evidence or a minimal exception, structured qualification, payment mapping, one funnel report, and export. The product must survive duplicate events and a simulated outage, not merely look correct in a demo.

Document each gap as task, business consequence, current workaround, frequency, cost, and acceptance criterion. A disliked visual style alone may justify a limited interface experiment, not a replacement of all operational infrastructure.

## Total cost of ownership

Compare subscriptions, usage charges, integration plan requirements, onboarding, configuration, development, maintenance, monitoring, support, security review, compliance work, migration, and exit. Include the owner's time and the cost of broken customer follow-up.

Use actual quotes and pilot measurements when available. This pack deliberately does not estimate a dollar budget or completion date without the necessary inputs. Do not finance an unvalidated CRM build by default.

## Gate 0: Define the business slice

Confirm offer, buyer type, entry path, roles, intended customer outcome, qualification policy, commercial basis, and a responsible owner. Success is a clear workflow and baseline, not a large backlog. Exit with one testable process and a small set of metrics.

## Gate 1: Prove the manual/configured loop

Run real authorized opportunities using existing tools, with limited necessary human confirmation. Establish stage definitions, source quality, actual timing, and cash linkage. The initial data teaches what needs automation. Avoid forcing a two-call funnel when one conversation is sufficient.

## Gate 2: Prove automatic evidence

Integrate only the required sources. Demonstrate identity mapping, deduplication, safe retries, attendance evidence/Unknown handling, payment reconciliation, and export. A clean dashboard cannot pass this gate while its numbers are untrustworthy.

## Gate 3: Prove the role experience

Build/configure the setter and closer's minimal home view and owner funnel. Test common tasks and failure states with users. Establish whether the interface removes measurable work or confusion. Stop adding UI features that do not help the closed loop.

## Gate 4: Add supervised intelligence

Enable evidence-linked summaries, missing-question prompts, and one coaching task. Evaluate accuracy and correction burden. Keep objective decisions and money under policy control. Explicit communication preferences can be supported now; inferred personality routing remains off.

## Gate 5: Add transparent progression

Introduce comparable leaderboards, optional missions, and approved learning examples after definitions and data are trusted. Consequential privileges require published rules, maturity, and appeals. No gamified point system automatically changes pay.

## Gate 6: Test adaptive routing and experiments

Only after adequate representative data and baseline performance exist, test relational matching, script variants, and bounded performance-weighted allocation. Use shadow mode, controlled assignment, quality guardrails, and rollback. A small team may never need this stage.

## Gate 7: Consider productization

A dealer-facing or multi-tenant SaaS product requires independent validation, tenant isolation, onboarding, support, contracts, data portability, and domain-specific policies. Internal usefulness alone is not proof of market demand. Keep B2B software sales distinct from regulated vehicle/finance workflows.

## Stop conditions

Stop or narrow the build when demand is unvalidated, core data cannot be trusted, the configured alternative solves the need, custom maintenance exceeds expected value, customer experience worsens, no maintainer exists, or legal/provider requirements remain unresolved. Finishing all specification files is not a reason to implement all features.

## Acceptance criteria

The selected approach follows demonstrated tasks and cost evidence. Existing tools are tested before replacement. Each gate has observable exit evidence. Work is a small vertical slice, not a platform rewrite. No subscriptions, external projects, production messages, or financial arrangements are initiated without authorization.

## Agent task prompt

```text
Evaluate build versus buy for the actual approved workflow. First test the existing CRM and provider capabilities, current plan rights, event access, export, and total cost. Return evidence-backed gaps, the smallest solution, delivery gates, maintenance ownership, and stop conditions. Do not assume AI makes a production CRM trivial or use this pack as authorization to build every module.
```

