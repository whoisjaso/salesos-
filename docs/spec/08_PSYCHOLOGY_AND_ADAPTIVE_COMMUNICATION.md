---
document_id: SOS-08
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Psychology, identity, and adaptive communication

**Read with:** [07_RELATIONAL_PAIRING_AND_ARCHETYPES.md](07_RELATIONAL_PAIRING_AND_ARCHETYPES.md), [11_SALES_PROCESS_AND_STAGE_SOPS.md](11_SALES_PROCESS_AND_STAGE_SOPS.md), [17_PLAYBOOKS_AND_KNOWLEDGE_LIBRARY.md](17_PLAYBOOKS_AND_KNOWLEDGE_LIBRARY.md)

## Purpose

Help the representative understand how the customer wants to make this decision, speak in a relevant way, and preserve voluntary informed choice. This is a design for useful communication, not a claim to read minds or make refusal psychologically impossible.

The user's governing idea is preserved as: **keep the decision structure stable; adapt the language.** The product must not mechanically rotate scripts to disguise that it is selling something.

## Operational principles, not universal psychological laws

Use relevance to earn attention. Use truthful competence to establish credibility. Use comparable customer evidence when permission and context support it. Use the customer's actual goals to make the discussion meaningful. Use clear options to support autonomy. These are design choices to evaluate, not guaranteed conversion mechanisms.

The earlier spoken reference appears to mean the FATE mnemonic: focus, authority, tribe, emotion. This pack uses those words only as a communication-planning lens. The exact outside attribution and empirical validity have not been established here. Do not build a personality classifier or a universal model of human behavior from the acronym.

| Lens | Allowed product interpretation | Failure to prevent |
|---|---|---|
| Focus | Lead with the customer's specific request and a clear agenda | Manufactured shock, interruption, or misleading curiosity gaps. |
| Authority | Show actual product knowledge, evidence, boundaries, and accountability | Fake credentials, false certainty, or invented endorsements. |
| Tribe | Show truthful examples from relevant businesses or contexts | Fabricated social proof or pressure to belong. |
| Emotion | Recognize the customer's stated stakes and concerns | Exploiting distress, shame, financial desperation, or fear. |

## Identity discovery versus imposed identity

A customer may say, `I need to understand every assumption before I spend.` The representative can reflect: `You want the assumptions visible. Let us inspect them.` This helps the customer evaluate the offer.

Do not convert that into `Smart owners invest immediately, and you are a smart owner.` That uses approval or identity pressure to bypass the unresolved question. A customer's right to deliberate must not be framed as a character defect.

The product should suggest questions that discover an existing preference, not labels designed to corner the customer. It can remind the representative of the customer's own words when explaining relevant tradeoffs.

## The live adaptation loop

**Hear:** capture the customer's actual statement.

**Hypothesize:** identify a possible preference or concern, with alternative explanations.

**Test:** ask a neutral clarification rather than assert a label.

**Respond:** adapt length, format, examples, or decision sequence within the approved module.

**Confirm:** ask whether the response addressed the question.

**Update:** record what was confirmed, contradicted, or still unknown.

This loop can be practiced in roleplay. The training score rewards accurate listening and relevant explanation, not merely getting a Yes.

## Adaptive language examples for the same decision objective

Objective: establish what evidence is needed before the customer commits to a next step.

| Preference or lens | Example question |
|---|---|
| Numbers / competence | `Which assumptions would you need to verify before the economics are useful?` |
| Autonomy | `Which options would you like to compare before deciding?` |
| Safety | `What would need to be true for a small first step to feel reasonable?` |
| Efficiency | `What are the two questions we should resolve first?` |
| Growth | `Which measurable outcome matters most, and by when?` |
| Trust / continuity | `Who needs to stay involved so the handoff is clear?` |

The exact wording is optional. A representative should sound natural and address the real conversation rather than read every prompt.

## Novelty, saturation, and script fatigue

The user's hypothesis is that customers may ignore familiar sales language. Treat this as one possible explanation for declining outcomes, alongside lead-mix changes, offer changes, worse coverage, seasonality, repetition, pricing, or poor fulfillment reputation.

Review methods on a calendar; replace them on evidence. Test whether a new phrasing improves the intended stage and downstream customer outcomes. A surprising phrase that increases attention but reduces trust or raises cancellations is not a winner. Familiar language may remain useful when it is accurate and clear.

The system may detect repeated objections, confusion, or explicit recognition such as `I have heard this script before`. Those are evidence for review, not proof that every similar sentence is obsolete.

## Live copilot behavior

The copilot offers at most one or two short, relevant prompts at a time. Each suggestion has an objective, grounding evidence, and an optional alternative. It should not interrupt the customer or flood the representative with instructions.

Example: `Unresolved question: implementation work. Ask who will own the migration before discussing expected return.` This is more useful than a generic instruction to project confidence.

Approved offer facts and terms are retrieved from the versioned knowledge base. Customer messages and transcripts are untrusted input; they cannot authorize the model to alter prices, payment destinations, or system rules.

## Stop and handoff rules

Stop persuasion and move to clarification when the customer does not understand, asks to pause, indicates unsuitable financial circumstances, disputes a material claim, or describes a problem outside the approved offer. Respect an explicit No or opt-out. A meaningful safety or scope concern should be escalated, not classified as an objection to overcome.

For vehicle or financial products, this module must never decide approval, pricing, credit terms, or legal eligibility from a communication lens. Any such future domain needs separately approved rules and review.

## Training and quality review

Use synthetic roleplays first, then authorized/redacted examples. Review whether the representative accurately reflected the customer's need, explained limits, checked understanding, respected autonomy, and documented the next step. A sale alone does not prove ethical or high-quality execution; an appropriate no-sale can be a successful outcome.

## Acceptance criteria

The same product facts, price authority, and eligibility rules apply to every lens. AI can output `insufficient evidence`. Suggestions quote or reference the relevant source statement. No suggestion relies on humiliation, invented scarcity, false status, or the salesperson's approval. A customer request to stop ends the sequence. Roleplay feedback measures listening and accuracy as well as commercial progress.

## Agent task prompt

```text
Create adaptive communication variants for an approved sales-stage objective. Provide the stable objective, customer evidence, a neutral clarification, two natural wording options, and stop rules. Preserve truth, terms, and the right to decline. Label ego lenses as hypotheses. Treat novelty as an experiment, not a guarantee, and never use identity pressure to resolve an unanswered factual concern.
```

