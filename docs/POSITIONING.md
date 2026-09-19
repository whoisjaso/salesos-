# Positioning: the operating system that turns a sales team into a measurable, self-improving game

Source: `docs/sources/Competitive_Landscape_and_Edge.md`. This page maps its conclusions onto what is built and what changes.

## The thesis in one line

Owner: make every lead worth more. Rep: see exactly how to become better and make more money. Software: observe everything, learn what works, improve who gets each opportunity and how it gets sold.

## The loop is the company

Lead, best available setter, conversation, evidence qualification and buyer mode, best available closer, prepared call, coached call, collected cash, rep progression and company economics, learn what worked, update playbook, improve routing, next lead.

## Where the edge is, and where it is in the code

| Edge (from the landscape) | Differentiation | Status | Where |
|---|---|---|---|
| Revenue per lead as the organizing number for owner and rep | High | Built | Owner Business hero (M16), rep Me hero, race, board |
| Standardized, auditable, evidence-cited qualification | High | Built; wording updated | `callIntelligence.ts` stage scores with spans, verified fit (M10) vs perceived fit (M09) |
| Perception gap as coaching data | High | Building | `coaching.ts` perception gap card, owner bottleneck, rep coach line |
| Rep-side earnings optimization | High | Built | Cash tiers, commission by state, scenarios labeled not forecasts |
| Buyer communication intelligence tied to outcomes | High | Phase one built (post-call feedback); Buyer Mode card next | `lens.ts`, `callIntelligence.ts` feedback, closer brief |
| Setter × closer pair analytics | Very high | Built | `pairs.ts`, Team Pairs, partner card |
| Prospect × rep matching | Very high if validated | Shadow mode only | `routing.ts` steps 6 and 7 logged, not applied |
| Versioned sales-method experimentation | Very high | Playbooks versioned; experiments not built | `src/content/sops.ts`, SOS-17, SOS-18 |
| Call behavior to economic outcome dataset | Extremely high | Foundations built | Domain events, ledger, stage scores, pair ids, playbook versions on SOPs |
| Cross-company benchmark graph | Potentially extremely high | Not started; governance first | SOS-25 Gate 7 |

## Words we use

- "Standardized, auditable, calibrated," never "objective." A model applies the same reading to every call; that is consistency, not truth. Calibration comes from outcomes.
- "Buyer Mode," "Communication Profile," "Conversation Fit" on screen. Ego archetypes stay an internal lens the model reads.
- "Own the cockpit, rent the rails." Dialer, calendars, meetings, payments, identity: all providers behind adapters.
- "If the system can observe an event, the rep never reports it."

## Buyer Mode

Learned from the conversation, revised as evidence arrives, each dimension with confidence and the words it came from:

decision speed, evidence preference, risk sensitivity, control orientation, detail appetite, social proof need, primary motivation, primary friction, communication style.

Output is a best-approach list for the closer, never a type label. Phase one: post-call feedback (built). Phase two: preparation card before the closer call (next). Phase three: routing tiebreaker after validation. Phase four: causal prospect × rep × pair model.

## Adoption order

Connect the funnel, calendar, existing CRM, and payments by OAuth, import the team, use our phone, go. Their CRM can stay the writer for contacts while we own calls, qualification, routing, and economics. System-of-record status is earned, not demanded.

## Initial customer

Call-centric high-ticket teams, roughly 5 to 30 setters and closers, meaningful inbound volume, an identifiable setter and closer funnel, enough value per opportunity that conversion changes the business.

## Pricing stance

Value-based, not scarcity. Platform fee plus active seller fee plus transparent communications usage. Illustrative ranges in the source; none adopted as policy. Exclusivity belongs in distribution (founding teams, founder-led onboarding, product council), never in restricting the learning loop.

## Single point of failure to avoid

A thin prompt around a fashionable model. The durable inputs are ours: normalized event history, verified outcomes, transcripts, behavior features, qualification evidence, playbook versions, rep and pair histories, collected cash, retention and refund outcomes. Any reasoning model sits underneath and can be swapped.
