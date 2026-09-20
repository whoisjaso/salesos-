---
document_id: SOS-19
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Revenue, commissions, earnings views, and forecasts

**Read with:** [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [05_ATTRIBUTION_AND_DATA_QUALITY.md](05_ATTRIBUTION_AND_DATA_QUALITY.md), [28_TRACEABILITY_AND_OPEN_DECISIONS.md](28_TRACEABILITY_AND_OPEN_DECISIONS.md), [29_SOURCES_AND_RESEARCH.md](29_SOURCES_AND_RESEARCH.md)

## Amendments

**2026-09-20.** Added the compensation half of the net-collected-cash contract required by payments specification section 7, the attribution freeze point, and the attribution exception rules. Confirmed that the hypothetical commission rates recorded by this repository (5 percent setter, 10 percent closer) are unchanged and that the payments specification's worked example, which is explicitly labelled "assumptions for this example only", does not overwrite them. Every default added here is marked PROPOSED DEFAULT, PENDING OWNER RATIFICATION and carries a numbered open decision in module 28. Amending this module leaves its `sha256` in `MANIFEST.json` stale; see correction C-03 in module 28.

## Purpose

Make the money real. Sales reporting, cash collection, accounting revenue, processor settlement, and employee compensation are related but different. The interface must not collapse them into a reassuring green number.

## Financial states and categories

Track approved contract/order value, invoice issued, payment authorized, payment succeeded/collected under the provider-specific basis, available/settled funds, bank payout where integrated, outstanding receivable, refund, dispute debit/credit, fees, and accounting recognition if supplied by the accounting system.

### Nine distinct money states, and how each one is known

Money passes through nine states that this product must never collapse. They are implemented as `LedgerEntryKind` at `src/domain/types.ts:383`, which carries sixteen values because several of the nine states need more than one movement to stay honest.

| # | State | Ledger kinds | Is it net collected cash? |
|---|---|---|---|
| 1 | A price was discussed | `price_discussed` | No. A statement, with speaker and source excerpt. |
| 2 | An approved agreement has a contracted value | `contracted_value` | No. Discounts reduce this figure. |
| 3 | A payment is authorized or processing | `payment_authorized`, `payment_processing` | No. An authorization is not a collection, and a completed checkout is not a completed payment. |
| 4 | A payment has succeeded under the provider's confirmed state | `payment_collected`, and its reversals `refund`, `dispute_debit`, `dispute_credit` | Yes, and only when the evidence class is `processor_confirmed` and the environment is `live`. |
| 5 | Funds are available in the merchant's processor balance | `processor_balance_credit` | No. A separate fact about the same money. |
| 6 | Funds have been paid out to the merchant's bank | `payout_to_bank` | No. A processor success and a bank payout of the same funds are not two revenues. |
| 7 | Commission has accrued under the employer's policy | `commission_accrued` | No. Commission is not company cash. |
| 8 | Commission is payable | `commission_payable` | No. |
| 9 | Commission has actually been paid to the representative | `commission_paid` | No. |

Two further kinds sit beside these: `fee`, which is excluded from the cash metric and reported separately, and `dispute_opened` and `dispute_closed_won`, which carry risk rather than money and have sign zero.

Alongside the kind, every movement records **how it is known**, as `EvidenceClass`: `processor_confirmed`, `provider_reported`, `manually_marked_paid`, `externally_recorded`, `imported_record`. The class is not cosmetic. It decides whether the movement is cash. A won deal in a CRM export is a status, not evidence that money moved; it is stored as `imported_record` by `src/domain/migration.ts` and never as collection.

Commercial categories include new-customer sale, existing-customer expansion, recurring receipt, referral-originated sale, and other revenue. A recurring payment is not a new lead or a new win unless it reflects a genuinely new opportunity under policy. A referral is an acquisition source and can produce a new sale; do not count its revenue twice.

The supplied screenshot's revenue remains `reported_revenue_basis_unknown` unless better source evidence is obtained. Do not pretend it was collected cash or profit. [U1, U2]

## Net collected revenue basis

Use a reconciled ledger of eligible customer cash, excluding tax/pass-through amounts and applying actual refund/dispute movements exactly once. Keep processor fees and fulfillment costs separately for contribution analysis. A pending authorization is not cash. A processor success and a bank payout of the same funds are not two revenues.

Stripe documents refund and dispute lifecycles, including movements that can affect available balances. Our implementation must map the chosen provider's actual states rather than subtracting broad categories twice. [S07, S08]

Illustrative ledger: collect $10,000; refund $2,000; remaining eligible cash is $8,000 before fees. If the remaining $8,000 is later debited in a dispute, the eligible cash basis falls to zero. If a dispute credit returns $8,000, restore it. Do not also subtract the original $10,000 as bad debt. The precise provider handling must be reconciled to its records.

### The seven answers, and what they mean for pay

The metric contract with its seven required answers, alternatives and open-decision references is in [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md). It is the single definition; this module states only the compensation consequences, and the two must not diverge.

Each answer is a PROPOSED DEFAULT, PENDING OWNER RATIFICATION, held as one named field on `NET_COLLECTED_CASH_POLICY` at `src/domain/types.ts:529` with `ratified: false`.

| Question | Proposed default | Effect on commission |
|---|---|---|
| Tax | Excluded from the commercial basis. | Commission never accrues on tax the business collects and remits. |
| Discounts | Reduce the order's contracted value, not cash. | A discounted deal accrues commission on what was actually collected, not on the pre-discount headline. |
| Processing fees | Excluded from the metric, reported separately. | Commission is calculated on the customer's gross payment. The fee is a company cost, not a deduction from the rep's basis. Changing this to a net-of-fee basis changes pay and needs D06 authorization. |
| Confirmed refunds and lost disputes | Reduce cash once, on the movement. | A refund reduces the accrual for the period the original payment belongs to. Whether an already-paid commission is recoverable is a compensation-agreement question, not a software default. No recovery, holdback, or wage deduction is implemented. |
| Open disputes | At-risk only, no debit. | Commission attached to a disputed payment is marked provisional with a text label. It is not clawed back on the opening of a dispute, and it is not treated as safe either. |
| Currency | Never summed across currencies. | A rep working in two currencies sees two figures. A single blended commission number is not produced until a conversion policy is ratified. |
| Late refunds after a closed period | Restate the period they belong to, and disclose. | A closed commission period is restated visibly with a revision note, not silently reopened and not silently absorbed into the current month. |

A refund is reconciled without deleting the original sale. The original payment, the refund, and the reason all remain in the ledger and in history. Nothing is overwritten to make the newest state look as though it was always true.

## Payment attribution

Link each payment to the correct opportunity, contract, commercial category, and currency. Split allocations must reconcile to the payment amount. An unlinked payment enters an exception queue, not an arbitrary rep's dashboard. Offline payments require authorized evidence and reconciliation; the software cannot verify cash in a drawer by inference.

### The freeze point

Financial credit is never derived from whoever owns the contact today. Credit is captured, then sealed, then corrected only by appending an authorized correction.

PROPOSED DEFAULT, PENDING OWNER RATIFICATION (open decision D17), held as `ATTRIBUTION_FREEZE_POLICY` at `src/domain/types.ts:515` with `ratified: false`:

1. **Captured at handoff acceptance.** The `pairId` active when a setter's handoff is accepted is already stamped on the opportunity under the recorded "Pairs are relational" decision. That behaviour is unchanged.
2. **Sealed at order issuance.** When an approved order is issued for payment, the setter, closer, pair, order, and commission-policy version are copied into an immutable `AttributionSnapshot`. Payments on that order read the snapshot. `issueOrderForPayment` in `src/domain/orders.ts`, `sealAttribution` in `src/domain/attribution.ts`.
3. **Corrected by appending only.** After the seal, credit changes through an authorized correction that keeps the original visible. Only `owner` and `manager` may authorize one (`AUTHORIZED_CORRECTION_ROLES`). A representative cannot change their own credited closer or their own commission policy through an ordinary edit.

Alternatives the owner may choose instead: seal at handoff acceptance alone, which is simpler but gives the first closer credit for an order a second closer later shaped; seal at first successful payment, which matches the money but leaves credit unknown at the moment the request is sent; seal at contract signature, which needs a signed-agreement event this product does not always have.

The identities in a snapshot come from authenticated assignments and approved handoffs. **Sending the payment link is not proof of being the credited closer.** An operations employee may send an invoice on behalf of a closer without acquiring the closer's credit; `senderCredit` at `src/domain/attribution.ts:381` returns null by construction. A browser-supplied salesperson id never determines financial attribution.

Installments on one agreement continue under that agreement's snapshot. A later upsell is a new order with its own snapshot, so a different closer's add-on does not extend the original closer's ownership of everything that person ever buys.

### Exception rules

Specification section 8 requires a small predetermined set of exception rules, defined once by the owner at onboarding, so that a representative does not choose a new attribution method for every sale. A language model is never asked to adjudicate a compensation dispute from its reading of persuasive effort.

The proposed set is `ATTRIBUTION_EXCEPTION_RULES` at `src/domain/attribution.ts:393`, `ratified: false`. PROPOSED DEFAULT, PENDING OWNER RATIFICATION (open decision D23):

| Rule | Situation | Proposed handling | Alternative |
|---|---|---|---|
| `split_credit` | Two representatives genuinely shared the work | Named percentage split recorded on the snapshot, summing to 100 | Whole credit to one named role, decided per case by a manager |
| `manager_reassignment_before_payment` | Ownership changed before the order was issued | Reassign freely before the seal, never after | Allow post-seal reassignment through an appended correction only |
| `late_close_by_second_rep` | A second closer finished a deal the first started | Credit the closer at the seal; an earlier contributor is recognized through `split_credit` if the owner elects it | Credit the closer who obtained the signature, with no split |
| `team_assist` | Someone helped without owning the deal | No financial credit by default; recognized in non-financial views | A fixed assist percentage defined once in policy |
| `disputed_ownership` | Two people claim the same deal | Manager decision recorded as an appended correction with a reason | Escalate to the owner, with the deal held in unallocated until decided |
| `unallocated_resolution` | A payment has no attributable owner | Cash stays in the workspace's unallocated records, attribution-dependent outputs are provisional, and unrelated selling continues | Assign to a default house account, which is discouraged because it makes a dashboard look complete when it is not |

## Commission rates in force

The rates this repository uses are the ones it already recorded: **5 percent setter, 10 percent closer**, on net collected cash, per role, marked hypothetical and pending D06. They are held as `COMMISSION_RATE_DEFAULTS` at `src/domain/types.ts:559` with `hypothetical: true` and `ratified: false`, implemented through `CommissionPolicy.role`, and rendered everywhere behind a "Hypothetical policy" chip until a real agreement lands.

The payments specification's worked example in its section 6 uses 10 percent closer and 2 percent setter under a heading that reads "Assumptions for this example only". That is an illustration of arithmetic, not a compensation decision. **It does not overwrite the recorded rates.** An example in a document, a table, or a JSON block is not approved policy (module 28, "Important proposals, not approved facts"). Changing a rate is a D06 decision by the owner, and AGENTS.md rule 7 forbids changing commission logic without explicit authorization.

The specification's example is nonetheless useful for one thing it demonstrates correctly: under a cash-based policy, the first collected installment of a four-installment agreement accrues commission on that installment only. The whole contract's commission is not awarded when one quarter of the money has arrived. That behaviour is implemented by `commissionAccruals` in `src/domain/orders.ts`.

## Commission policy

Before live use, the owner defines and obtains appropriate review of the actual compensation agreement: eligible basis, rates or tiers, setter/closer splits, attribution, timing, installment treatment, cancellations, refunds, disputes, approved adjustments, leave/departure handling, and payout authorization. This document is not a legal determination about when commission is earned or recoverable.

Represent policy as versioned rules with effective dates. Preserve the policy attached to each eligible transaction. The system must not retroactively change an earned amount simply because a leaderboard rule changes.

Separate `calculated`, `accrued under policy`, `pending eligibility`, `payable`, `paid`, `disputed`, and `adjusted`. Any reserve, holdback, or recovery mechanism is disabled until approved under the actual agreement and applicable requirements. Do not implement automatic wage deductions from hypothetical efficiency costs.

## Representative earnings display

Show the period, source data as-of time, eligible commission basis, accrued/eligible/paid amounts, pending conditions, adjustments, and dispute route. A representative can inspect the included transactions without receiving inappropriate access to another rep's compensation.

Display commission per attended appointment separately from measured commission per live-call hour and per all tracked work hour. Dividing commission by shows is not an hourly wage. Missing preparation/follow-up time requires an incomplete-time warning.

## Forecasts and run rates

A simple run rate extrapolates observed pace over remaining comparable working days. It must be labeled a mechanical projection, especially early in a month. It can fail when pipeline maturity, source mix, holidays, capacity, deal size, collections, or cancellations change.

A later forecast may combine expected eligible opportunities, probability of outcomes, collection timing, expected deal value, and capacity. It needs validation against prior periods, error reporting, and a range whose construction is stated. Low/base/high sensitivity cases are not statistical confidence intervals.

Do not show precise $100,000 earnings predictions from a handful of leads. Do not suggest that additional appointment availability automatically produces demand or revenue. An earnings scenario needs incremental deliverable opportunities, conversion assumptions, commercial value, the actual commission policy, and time/capacity effects.

## Unit economics

Report cost per source inquiry, cost per accepted opportunity, cost per retained/attended appointment, cost per suitable opportunity, and acquisition cost per new customer with explicit cost scope. Distinguish media-only CAC from fully loaded acquisition cost. ROAS and revenue are not profit.

Contribution policy defines attributable acquisition, sales, processing, delivery, support, and adjustment costs. If costs are estimates, label them. Do not rank reps on speculative delivery costs as if they were audited facts.

## Approval and control

The LLM may explain calculations and draft a query. It cannot change bank details, approve its own commission adjustment, issue a refund, or release payroll. Financial writes require deterministic rules, permissions, idempotency, and appropriate approval. Store all money in minor units and preserve currency.

## Acceptance criteria

One payment delivered twice changes money once. Three event types describing one payment change money once. A historical import and a webhook carrying the same movement change money once. Partial collection shows partial cash. Refunds and disputes reconcile without double subtraction. An opened dispute shows at-risk exposure and debits nothing. Unlinked payments are visible and scoped, and do not stop unrelated selling. An invoice marked paid outside the processor, a zero-amount invoice, a success redirect, and an imported won deal each create no cash. A test-environment movement changes no standing, commission, or experience points. Reassigning a contact after a sale moves no historical credit. An operations user sending the payment link does not become the credited closer. A commission follows its approved policy version. Hourly labels require time data. A forecast is distinguishable from actual earnings. Customer funds and employee compensation cannot be redirected by model-generated text.

## Agent task prompt

```text
Design the money and commission model using the approved offer and actual compensation policy, if supplied. Separate contract value, collection, settlement, payout, refunds/disputes, contribution, and commission states. Provide example ledgers and reconciliation tests. Label all projections and assumptions. Do not invent commission terms, authorize payouts, or treat commission per appointment as an hourly wage.
```

