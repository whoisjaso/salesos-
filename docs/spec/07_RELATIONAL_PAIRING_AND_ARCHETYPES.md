---
document_id: SOS-07
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Relational lead-to-salesperson pairing and ego/identity lenses

**Read with:** [06_LEAD_ROUTING_AND_CAPACITY.md](06_LEAD_ROUTING_AND_CAPACITY.md), [08_PSYCHOLOGY_AND_ADAPTIVE_COMMUNICATION.md](08_PSYCHOLOGY_AND_ADAPTIVE_COMMUNICATION.md), [18_EXPERIMENTS_AND_SCRIPT_EVOLUTION.md](18_EXPERIMENTS_AND_SCRIPT_EVOLUTION.md)

## In plain language

A buyer who wants a careful explanation may work better with someone who can explain patiently. A buyer who prefers a concise recommendation may benefit from a representative who can be direct without skipping important facts. The product should recognize these preferences and help make a useful match, rather than guessing a permanent personality from a voice or a few words.

This module preserves the user's request for lead-to-salesperson ego-archetype and relational pairing. Its starting point is **observed compatibility**, not a claim that matching two named personality types guarantees a close.

## What is being paired

**Prospect side:** stated communication preferences, desired outcome, decision process, evidence needs, actual concerns, previous relationship, preferred language/channel, and optional provisional identity lenses supported by the conversation.

**Representative side:** demonstrated product knowledge, languages, communication flexibility, evidence-handling strengths, observed performance within comparable opportunity groups, reliable availability, and optionally self-described communication style. A rep's self-described identity is not automatically a proven ability.

Pair primarily on the representative's ability to serve the buyer's needs, not simply on similarity. Two people who both prefer control may not be a good match; a patient representative may serve an autonomy-oriented prospect better by offering clear options. Whether similarity or complementarity helps is an empirical question.

## Three evidence layers

| Layer | Example | Treatment |
|---|---|---|
| Explicit preference | `Please send the numbers first; I do not need a long call.` | Highest-priority communication instruction within the consent and offer policy. |
| Observed conversational preference | Prospect repeatedly requests assumptions and implementation details. | Provisional evidence to confirm through a neutral question. |
| Ego/identity hypothesis | Prospect may value competence or autonomy in this decision. | Optional internal lens, not a diagnosis, fact, or eligibility decision. |

Never infer protected or sensitive traits from appearance, name, voice, accent, neighborhood, or customer behavior. Do not infer wealth or creditworthiness from speaking style. Buying authority and economic fit require relevant, stated business facts and the approved qualification process.

## Proposed configurable plain-language lens library

This is a product taxonomy for discussion and testing, not a validated psychological assessment or a claim to reproduce an outside author's complete framework. The user has preferred plain-language rather than animal labels. Multiple lenses may coexist or be absent.

| Lens | Evidence to look for in the customer's own words | Useful adaptation | Do not do |
|---|---|---|---|
| Competence / intelligence | Wants mechanisms, assumptions, limitations | Offer inspectable evidence and explain tradeoffs | Flatter intelligence to obtain agreement. |
| Autonomy / control | Wants options and final decision ownership | Present choices and a reversible next step | Frame hesitation as weakness. |
| Safety / certainty | Asks about implementation risk and failure | Explain constraints, support, exit and recovery | Promise zero risk or guaranteed outcomes. |
| Achievement / growth | States a measurable expansion objective | Relate the offer to the stated goal | Treat ambition as proof of product fit. |
| Significance / status | Explicitly values differentiation or presentation | Show genuine differentiation relevant to their market | Invent prestige, exclusivity, or endorsements. |
| Connection / trust | Wants continuity and a known point of contact | Explain ownership and follow-through | Pretend friendship or shared identity. |
| Approval / recognition | Requests reassurance about a decision | Offer factual comparisons and time to consider | Make the representative's approval conditional on buying. |
| Care / contribution | Describes helping employees or customers | Examine the actual impact on those people | Use guilt or moral superiority to force a sale. |
| Family / provider | Voluntarily describes family-related priorities | Respect budget, stability, and timing boundaries | Exploit family anxiety or import family data. |
| Novelty / opportunity | Asks about new capabilities or possibilities | Offer a bounded demo with real limits | Treat novelty as evidence of commercial value. |
| Efficiency / simplicity | Wants fewer steps and less work | Summarize decisions and implementation workload | Omit important terms to stay brief. |
| Legacy / durability | Wants an enduring business or transferable system | Explain ownership, maintainability, and continuity | Promise permanent dominance or unverifiable legacy. |

The interface should normally show concrete preferences such as `prefers numbers first` rather than an abstract ego label. The taxonomy is available to trained coaching users; it should not become an insulting customer label.

## Profile record

```json
{
  "profile_id": "profile_example",
  "scope": "opportunity_conversation",
  "opportunity_id": "opp_example",
  "preferred_language": {"value": "en", "source": "customer_selected"},
  "preferred_format": {"value": "written_roi_breakdown", "source": "explicit_statement"},
  "lenses": [
    {
      "name": "competence_intelligence",
      "status": "hypothesis",
      "evidence_refs": ["transcript_span_example_12"],
      "contradicting_evidence_refs": [],
      "human_confirmed": false,
      "model_confidence": null,
      "calibration_status": "not_validated"
    }
  ],
  "last_reviewed_at": "2026-09-18T16:00:00Z",
  "review_due_at": "2026-10-18T16:00:00Z",
  "policy_version": "communication_profile_v1"
}
```

A review date above is illustrative. The production retention/review interval is a policy decision. An LLM saying 94% confident is not a calibrated 94% probability. Store unknowns explicitly and do not generate precision the evidence cannot support.

## Relational fit decision

Step one: honor the customer's actual preference and existing relationship. Step two: apply routing eligibility, capacity, and service-level constraints. Step three: evaluate demonstrated representative competencies against the relevant preferences. Step four: use optional profile signals only within a bounded, approved policy.

Early example: a prospect requests a technical explanation; two eligible closers are available. Rep A has an approved product certification and audited strengths in implementation explanations. Rep B is stronger in concise operational walkthroughs. Route to A with a factual reason, not `intelligence types close intelligence types`.

Later, test whether contextual pairing improves **net contribution or net collected revenue per assigned opportunity** without harming response time, customer satisfaction, fairness, or complaints. Compare against the same eligibility/capacity baseline, not an intentionally weak control. Record actual assignment probabilities and keep a development pool.

No model may use outcomes or transcripts that occurred after the assignment to pretend it knew the correct match at assignment time. That would be data leakage.

## Before a profile exists

Most brand-new inquiries will not contain enough information for an ego hypothesis. Do not add a long personality questionnaire to the form just to feed the model. Route promptly on language, offer, availability, and continuity; learn communication preferences naturally. A closer may receive a better-informed handoff after discovery.

## Confirmation, correction, and expiry

Ask: `Would you rather start with the numbers or see how it works?` or `What would make this decision easier to evaluate?` Let the answer replace an earlier inference. Record contradictory evidence rather than forcing the person into a category. Profiles should be scoped to the current decision and reviewed when context changes.

Customers can ask for another representative, another channel, or no further profiling. Representatives can challenge a label and show why. A manager reviews material routing effects. No profile is a secret permanent grade attached to a person's worth.

## Evidence and rollout gates

**Pilot:** collect explicit preferences and support manual pairing; inferred matching has no effect on lead entitlement.

**Shadow:** produce a suggested match and explanation without changing the actual assignment. Compare predictions with later outcomes, checking sample sufficiency and selection bias.

**Controlled test:** approve a bounded random comparison among otherwise eligible representatives. Measure the full outcome chain, not just initial enthusiasm.

**Limited activation:** enable only demonstrated features, preserve fallback, log every decision, and monitor drift. Disable matching if response time or customer outcomes worsen.

## Acceptance criteria

Unknown profiles route normally. Explicit preferences override a stale inference. A single phrase cannot establish a permanent archetype. Two identical leads with different irrelevant demographic information receive the same eligible treatment. A rep can see the evidence behind a preference. Pairing can be disabled without breaking assignment. All price, qualification, consent, and commercial truth rules remain unchanged across lenses.

## Agent task prompt

```text
Design the relational pairing module using customer-stated preferences, conversation evidence, and demonstrated representative capabilities. Preserve the proposed plain-language ego/identity lenses as optional hypotheses, not facts. Return profile schemas, matching logic, examples, evidence/expiry rules, a shadow-mode evaluation, and a controlled-test plan. Do not infer sensitive traits, wealth from voice, or guaranteed compatibility. Unknown must be a valid output.
```

