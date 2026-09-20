# Sales OS: Product Requirements Document

**Owner:** Jason / Obavia
**Status:** Phase-gated build in progress
**Source of truth for intent:** `docs/spec/` (31 numbered modules, SOS-00 to SOS-30). This PRD condenses the spec into a build plan. When the two disagree, the spec module governs and this document is updated.

## 1. Problem

Sales teams babysit CRMs instead of working opportunities. Owners see totals but cannot tell whether a weak month is lead quality, capacity, execution, collection, delivery, or bad data. Reps get motivational noise instead of one evidence-backed thing to practice.

## 2. Product in one loop

Receive an opportunity, assign it responsibly, act, verify what happened, guide the next step, measure the result, improve the process. (SOS-00)

## 3. Users and their home screens

| Role | Sees first | Spec |
|---|---|---|
| Setter | One next action, the live customer, queue with explained priority, compact daily activity, one coaching task | SOS-09 |
| Closer | Upcoming appointment brief, open decisions, proposal/contract/payment tasks, personal funnel with denominators | SOS-10 |
| Owner | Trust layer (data freshness, incidents), economics (collected cash vs contracted), comparable funnel, capacity, prioritized bottleneck investigations | SOS-21 |
| Team | Fair leaderboards (three views), missions, skill paths, seasons, approved learning examples | SOS-14, SOS-15, SOS-17 |

## 4. Non-negotiable semantics (from AGENTS.md and SOS-01/02)

1. Calls in the source sheet are retained calendar bookings, not dials or conversations.
2. Raw submissions, unique contacts, accountable opportunities, appointments, conversations, wins, payments are separate entities.
3. Rep-perceived qualification is not verified fit and does not diagnose confidence.
4. Reported revenue is not collected cash. Collected cash is not profit. Net collected cash counts only processor-confirmed movements in the live environment: a success redirect, an invoice marked paid outside the processor, a zero-balance invoice, a spreadsheet import, and an externally recorded wire or check are each genuine records reported on their own terms and are never summed into it (`docs/spec/02_METRIC_CONTRACTS.md`).
5. Commission per attended appointment is not an hourly wage.
6. Benchmark gaps are scenarios, never lost money or employee debt.
7. Raw revenue per lead does not hold lead tier, capacity, or offer constant.
8. Personality pairing and novel language are hypotheses in shadow mode, not mechanisms.
9. Unknown is a valid state. It is never silently converted to zero or No.
10. Every percentage carries a numerator, denominator, cohort, maturity, and data state.

## 5. Visual metric language (SOS-20)

- Funnel cards: stage name, count, cohort context, data state. Connector rate shown only when numerator is a subset of that exact denominator.
- Performance outline: subtle green (on target), amber (needs attention), red (material issue, restrained), neutral (no benchmark / insufficient sample), explicit data-state treatment for stale or unknown. Never color alone. Always a text label and icon.
- No composite score from mixed colors. Overall summary is: primary economic efficiency, quality and data state, largest supported stage issue.
- Revenue cards label their basis: Reported revenue, Contracted value, Net collected cash. Where a figure excludes movements it could not verify, it says so, and processing fees and open-dispute exposure are shown as their own labelled figures rather than folded in.
- Percent changes: "+10 percentage points", not "up 10%".
- Reduced motion respected. No pulsing, flashing, or rank animation during a live call.

## 6. Functional scope by phase

See `docs/ROADMAP.md`. Phases map to SOS-25 delivery gates, adapted for an owner who has explicitly authorized a full product build rather than a CRM configuration exercise.

## 7. Out of scope for the initial releases (SOS-00)

New phone network, email platform, video service, card processor, marketing suite, general automation builder, autonomous closer, predictive dialer, unrestricted personality inference, mandatory data warehouse. Providers are to be integrated through narrow adapters behind the connector inbox, not rebuilt. The `provider_events` inbox table exists; the adapters do not yet, and no provider has ever been contacted (`docs/ARCHITECTURE.md`, "Provider readiness is a release gate"). Sending payment requests is a second, separately granted capability that is off at launch; tracking payments never implies authority to charge or refund.

## 8. Open decisions carried forward (SOS-28)

D01 to D31 remain open. D17 to D31 were opened on 2026-09-20 by the payment evidence and attribution work; each is implemented as a proposed default in a single named constant marked `ratified: false`, so shipping code that uses one is not the owner having decided it. The build proceeds under labeled working assumptions:

- D01: internal-first for Obavia. Multi-tenant fields exist from day one, tenant switching is not exposed.
- D02/D03: one offer, two entry paths (form-entry via setter, booked-entry direct to closer). Fixtures are synthetic.
- D04: no live provider. Adapters are interfaces with an in-memory implementation.
- D06: commission policy is a versioned hypothetical fixture labeled as such in the UI. The recorded rates are 5 percent setter and 10 percent closer on net collected cash; an example in any specification does not overwrite them (D29).
- D08: 30-day maturity horizon as a pilot default, configurable.
- D09: stage targets are tenant policy, default targets are marked "pilot hypothesis".
- D17: attribution is captured at handoff acceptance and sealed into an immutable snapshot at order issuance. Financial credit never follows whoever owns the contact today.
- D18 to D22: the net collected cash contract. Discounts reduce contracted value, processing fees are excluded and reported separately, an open dispute is at-risk only, currencies are never summed, and a late refund restates the period it belongs to.
- D25: launch posture is observation only. Collection is refused by server-side policy.
- D26: historical import window of 90 days, owner-overridable.
- D27: a second workspace connecting an already-bound merchant is rejected with a reason, never resolved by email match.
- D30: no Stripe app registration or merchant test account is authorized, so every payments capability stays at requires_setup or unsupported.

## 10. Automatic stage capture

| Transition | Automatic evidence | Rep confirms |
|---|---|---|
| Lead to assigned | Form or ad webhook, dedupe, routing record | Never |
| Assigned to contacted | Dialer connect event plus call analysis says a real exchange happened | Never. Dispute only |
| Contacted to booked | Calendar booking event | Never |
| Booked to retained | Pre-call review or DQ reason code | Never. Dispute only |
| Retained to show | Meeting participant join and overlap time | Phone and in-person only |
| Show to qualified | Call analysis extracts fit facts against the offer rules | Never. Rep records perceived fit separately |
| Qualified to won | Signed contract event | Never |
| Won to cash | A processor-confirmed live ledger movement, counted once per economic movement | Never |

The "Rep confirms" column was narrowed by the recorded decision "The transcript decides. No rep approval." in `docs/DECISIONS.md`: stages move on banded probabilities and a rep disputes rather than confirms. Money, consent, and attendance still come only from the ledger and providers, never from a transcript.

## 11. Design law

One hero, one number, one action above the fold. Everything else behind a segmented control or a Sheet. Labels, not sentences. See `docs/DECISIONS.md`.

## 9. Definition of done for the product concept (SOS-00)

The same opportunity can be traced from source to owner to conversation to appointment to outcome to cash without spreadsheet guesswork. A failed provider or uncertain AI conclusion is visible and recoverable. An ordinary rep completes the common workflow without editing a large record form.
