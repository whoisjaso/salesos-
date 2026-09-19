---
document_id: SOS-18
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Experiments, script evolution, and evidence of improvement

**Read with:** [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [07_RELATIONAL_PAIRING_AND_ARCHETYPES.md](07_RELATIONAL_PAIRING_AND_ARCHETYPES.md), [17_PLAYBOOKS_AND_KNOWLEDGE_LIBRARY.md](17_PLAYBOOKS_AND_KNOWLEDGE_LIBRARY.md)

## In plain language

Keep useful methods until there is a reason to change them. When a method appears weaker, test an explanation instead of replacing the whole process on instinct. New wording is a candidate, not automatically an improvement.

## Questions the system should distinguish

Is the stage rate declining? Did source quality, offer, pricing, availability, or measurement change? Is a particular execution associated with different outcomes? Does changing that execution cause an improvement? Does that improvement survive downstream quality, cash, and workload effects?

These are different questions with different evidence requirements. An AI pattern report answers only what the underlying data supports.

## Experiment record

Store hypothesis, stage/objective, population, eligibility, control, challenger, assignment unit, randomization/stratification method, allocation probability, primary outcome, maturity window, secondary outcomes, guardrails, minimum detectable effect, sample-size reasoning, analysis plan, exclusions, owner, approval, start/stop conditions, and rollback.

An illustrative hypothesis: `A clearer appointment agenda increases attended appointments among otherwise comparable booked-entry opportunities without increasing complaints or reducing downstream net collected RPL.` This is more testable than `use more novelty`.

## Randomization and exposure

For message or reminder tests, randomize at the opportunity or account level so a prospect does not receive conflicting variants. Stratify relevant factors such as lead source, offer, and representative when appropriate. For a change taught to an entire rep, account for representative-level clustering and possible learning spillover; do not treat every call as an independent randomized unit when it is not.

Assign before the outcome. Log actual exposure, policy version, and assignment probability. A representative may depart from the assigned wording; report that instead of quietly removing inconvenient outcomes. Intention-to-treat should be the default analysis of the assignment policy, with carefully labeled exposure analyses as additional views.

## Sample size and uncertainty

There is no universally sufficient number such as 50, 100, or 600 calls. Plan the sample based on baseline outcome frequency, effect size worth detecting, variance, clustering, maturity, and the business cost of uncertainty. Revenue-per-lead data can be dominated by a few large wins; choose an appropriate analysis and show uncertainty.

Do not repeatedly peek and stop the first time a result looks favorable unless the analysis method explicitly supports sequential monitoring. Predefine the evaluation window or use a reviewed sequential design. Correct for multiple comparisons or clearly label exploratory findings when many variants, phrases, and subgroups are searched.

Do not require statistical precision that makes a small pilot impossible. A small pilot can validate usability and data collection while remaining inconclusive on commercial lift.

## Guardrails

Monitor opt-outs, complaints, factual accuracy, customer understanding, suitability, refunds, cancellations, delivery burden, response time, representative workload, and permission compliance. Stop immediately for material safety, consent, or misrepresentation issues; other guardrail thresholds are declared before launch.

A higher show rate is not a win if the new method attracts people who misunderstood the meeting or cannot use the offer. A higher close rate is not a win if it produces more refunds or unfulfillable promises.

## Prevent confounded experiments

Do not simultaneously change lead tier, script, price, and commission and then credit the script for improved revenue. Log unavoidable business changes and evaluate whether the experiment remains interpretable. Do not enroll a prospect into conflicting tests without an interaction plan.

A routing experiment changes who receives opportunities; a messaging experiment changes what the customer hears. Keep their identifiers separate. For adaptive routing, maintain exploration and record selection probabilities, otherwise observed winners can simply reflect the allocation policy.

## Drift and novelty monitoring

Watch comparable cohorts over time. Detect data-definition changes and source shifts before diagnosing script fatigue. An explicit customer comment about canned wording is useful qualitative evidence, not proof of a universal market response.

Review on a calendar; change on evidence. A quarterly review can assess policy, offer, and knowledge freshness. It does not mandate quarterly replacement of working language. The earlier claim that novelty will necessarily work is rejected by this specification.

## Promotion and rollback

Possible outcomes are adopt, reject, inconclusive, revise and retest, or stop for harm. A winner becomes a versioned module with its evidence, population, limitations, and review date. Do not automatically deploy AI-generated challengers or change pay/routing weights without approval.

Rollback restores the prior module and preserves affected customer histories. A material factual correction may require customer follow-up under an approved plan, not just reverting a code flag.

## Acceptance criteria

The same opportunity is not randomized twice into conflicting variants. Assignment precedes outcome. Actual exposure is stored. Small-sample results are not labeled proven. Guardrails can override commercial lift. Multiple testing and clustering are considered. The agent can produce Inconclusive. Every promotion has an authorized reviewer and reversible release.

## Agent task prompt

```text
Design a controlled test of one proposed sales improvement. State the causal question, eligible population, assignment unit, control, challenger, primary metric, maturity, sample-size reasoning, confounders, guardrails, and analysis/stop rules. Separate usability validation from commercial-effect evidence. Do not declare novelty, a script phrase, or personality matching effective from correlation alone.
```

