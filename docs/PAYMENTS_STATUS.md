# Payments V2 status, verified against the tree

Date: 2026-09-20. Written after running every gate on the working tree, not from
builder reports. Where a builder's claim and the tree disagreed, the tree won.

Status words used here are exactly six: `implemented_and_tested`, `mocked`,
`blocked_by_access`, `awaiting_provider_review`, `not_tested`, `absent`.

## Standing facts

**No payment provider has ever been contacted.** No OAuth authorization has been
begun or completed against a real provider, no app has been registered with
Stripe, Whop or Toast, no webhook endpoint has been registered, and no partner
approval has been requested. `SimulatedAuthorizer` refuses every payments
provider outright, and `canConnect()` is false for every provider in the
registry.

**No Supabase migration has ever been applied.** `supabase/migrations` is
unmodified in this working tree and nothing in it has been executed against a
live project.

**No credential exists.** There is no API key, client secret, webhook signing
secret or access token anywhere in the repository. A grep for `sk_live_`,
`sk_test_` and `whsec_` across `src/` returns nothing. The only `process.env`
reads are the two pre-existing Supabase environment readers in
`src/data/index.ts` and `src/data/supabase.ts`.

**No network request is made by any code added in this work.** A grep for
`fetch(`, `XMLHttpRequest` and any `https://api.` host across `src/` outside
tests returns nothing, and `src/server/providers/__tests__/domainPurity.test.ts`
asserts this from disk on every run.

**Every fixture is synthetic and labelled synthetic.** The cash feed says so on
screen: "Synthetic fixture ledger. No payment provider is connected in this
build."

## Gates, as measured on this tree

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | clean, no errors, no warnings |
| Types | `npx tsc --noEmit` | clean, exit 0 |
| Unit tests | `npx vitest run` | **705 passed in 41 files**, 0 failed |
| Build | `npm run build` | exit 0, 14 static routes prerendered |
| End to end | `npx playwright test` | **169 passed, 3 skipped**, 0 failed |

Baselines for comparison: unit tests were 497 in 29 files, Playwright was 161
passed and 3 skipped. Both rose. No test was deleted or weakened. `test-results`
and `playwright-report` were removed after the run.

The six builders' own reported counts (563, 671, 699) were counts of a moving
tree taken at different moments. 705 in 41 files is the number after the seam
fixes below, and it is the only one that describes the tree as it now stands.

## What I fixed at the seams

Five defects existed only because six builders worked in parallel. Three were
code defects and two were stale assertions. In both stale cases the behaviour
legitimately changed and the change is pinned by a unit test written by the
builder who made it.

1. **The domain barrel could not reach any of the new payments code.**
   `src/domain/index.ts` had no export for `orders`, `attribution` or
   `connections`, so nothing importing from `@/domain` could reach
   `commissionAccruals`, `creditForEntry` or `assertCollectionAllowed`. Three
   separate builders each reported this as "not my file" and left it. Added.

2. **Adding those exports surfaced a name collision that would have shipped
   silently.** `appendCorrection` existed in both `callIntelligence.ts` (a
   correction to a transcript field) and `attribution.ts` (an authorized
   correction appended to a sealed attribution snapshot). Two different
   functions under one name in one barrel is wrong whichever one a caller got.
   The attribution one is now `appendAttributionCorrection`. Pinned by
   `src/domain/__tests__/barrel.test.ts`.

3. **The owner money hero claimed a subtraction the code does not perform.**
   The hero read "Payments minus refunds and disputes" while the definition one
   tap in, rewritten during this work, read "An open dispute is money at risk and
   is never subtracted." `isRefundLike` in `src/lib/owner-model.ts` matches
   `refund` and `dispute_debit` only, so only confirmed refunds and *lost*
   disputes are subtracted. The hero, the metric `timeBasis` and the refunds row
   now say "refunds and lost disputes". Pinned by
   `src/lib/__tests__/owner-money-copy.test.ts`.

4. **A held cash feed presented itself as complete.** `RecentDrops` rendered
   `heldNote ?? "This list may be incomplete. ..."`, so the moment `MeScreen`
   started passing a specific hold note, the standing claim that the list may be
   missing payments disappeared and only the hold's own wording remained. The
   lead sentence is now unconditional and the note explains which hold it is.
   This was a code fix, not an assertion fix.

5. **Two stale e2e assertions, both behaviour changes.** The closer financial
   ladder is seven steps, not six, because "Processing" is now its own position
   between authorized and collected (pinned by
   `src/lib/__tests__/workspace-closer.test.ts`, "lists seven steps with
   Processing between authorized and collected"). And a Playwright strict-mode
   locator in `team.spec.ts` became ambiguous once two correct places named the
   hold owner; it is now scoped to the hold statement rather than matching
   whichever came first.

## Scenario tally, counted from the registry

`src/content/acceptance/paymentsV2.ts`, all 62 rows of spec section 20, counted
after this run:

| Status | Count |
|---|---:|
| implemented_and_tested | 31 |
| not_tested | 14 |
| absent | 13 |
| blocked_by_access | 4 |
| mocked | 0 |
| awaiting_provider_review | 0 |
| **Total** | **62** |

I recounted these from the file rather than trusting the report, and the count
matches. The audit this work started from had 3 implemented, 11 partial, 45
absent, 1 blocked and 2 other.

The registry has no `partial` status by construction: a half-proven scenario
takes the lower status and its note says what is proven and what is not. The
guard in `src/content/__tests__/paymentsV2.test.ts` asserts that every
`implemented_and_tested` row names an `it(...)` title that exists in the exact
file it cites, and that no Whop row, no Toast row and no credential-requiring
row is ever `implemented_and_tested`.

**Limit of that guard, stated plainly:** it proves the cited test *exists*. It
cannot prove the cited test *proves the scenario*. I spot-checked rows 17, 20,
22, 25, 35 and 62 by reading the cited tests. They hold up. The other 25 rows
are guarded by title existence only.

## implemented_and_tested

- The evidence rule itself. `countsAsNetCollectedCash` is the single predicate,
  and only `processor_confirmed` live movements pass it. Nine money states and
  the evidence classes are in `src/domain/types.ts` with `NET_COLLECTED_CASH_POLICY`
  as one named constant.
- Seven classes of non-cash record each proven to create no cash: manually
  marked paid, imported record, externally recorded, provider reported, test
  environment, pass-through and still processing.
- A zero-amount invoice, a success redirect and a test-environment movement each
  create no cash, no standing change and no commission.
- Dual de-duplication: `buildIdempotencyKey` for delivery identity and
  `buildEconomicMovementKey` for economic movement identity, separately.
- Historical import classification. A won CRM deal is `contracted_value` with
  evidence `imported_record`, not a payment. `IMPORT_EVIDENCE_CLASSES` excludes
  `processor_confirmed` by construction via a `satisfies` clause, so it is a
  compile-time fact. A second identical import produces one record.
- Non-processor tender mapping. Wire, check, cash, ACH and similar map to
  `externally_recorded`; marked paid, comped and written off map to
  `manually_marked_paid`; anything unrecognised, including a cell reading
  "Stripe", stays `imported_record` and never becomes `processor_confirmed`.
- Orders, installments and the seal. `splitEvenly` sums back exactly,
  `createOrder` throws when the schedule disagrees with contracted value,
  `issueOrderForPayment` seals and throws on a second issue.
- Attribution credit for a sealed movement. `creditForEntry` resolves by
  snapshot, then order, then a single-snapshot opportunity, and returns
  `ambiguous` rather than guessing.
- Commission accrual arithmetic: one row per credited rep per *collected*
  installment, at the repository's recorded 5 percent setter and 10 percent
  closer, still marked hypothetical pending D06. The spec example's different
  numbers did not overwrite the recorded decision. A partially collected
  installment accrues nothing. The company counts the movement once and it is
  not the sum of the two role bases.
- Correction refusals: not authorized role, self serving, unknown rule, reason
  required, no change. Sealed fields are never rewritten and
  `commissionPolicyVersion` cannot be corrected at all.
- The sender of a payment request is never the credited closer.
  `senderCredit()` returns `null` unconditionally.
- Collection refusal. The exhaustive table is 7 operations times 6 capability
  states times 5 authorization states, 210 combinations, asserting exactly one
  is allowed. Observation capability never implies collection capability.
- A second workspace connecting an already-bound merchant is rejected with an
  explicit reason, never resolved by email match.
- Provider availability. No provider in the registry is connectable, asserted.
  `DEFAULT_PROVIDER_AVAILABILITY` is `unavailable`, so an un-annotated row can
  never present Connect.
- An empty successful payment read and a forbidden read differ in capability
  state, label, icon, owner text and whether they count as an answer.
- Domain purity, asserted from disk: no file under `src/domain` calls `fetch`,
  uses `XMLHttpRequest`, imports an SDK or HTTP client, imports React or Next,
  or imports from `@/server`.
- The 90 day historical import window as a named overridable constant.

## mocked

Nothing in this tree is `mocked` in the sense of pretending to succeed. That is
deliberate and is the main thing this work changed: the previous simulated
authorization, which produced a fabricated code and a green check, is gone.

Two things are *simulated and say so*, which is why they are not listed as
working integrations:

- `SimulatedAuthorizer` still stands in for non-payments sources such as
  HubSpot. It refuses every payments provider in both `begin` and `complete`.
- Every adapter function in `src/server/providers/` returns its declared
  refusal: `unsupported`, `requires_setup`, `refused` or `failed`. None returns
  `ok`. All permission names are `UNVERIFIED_PERMISSION` and all API versions
  are `UNPINNED_API_VERSION`, asserted, so no provider permission name or
  version has been invented.

## blocked_by_access, and by which gate

| Item | Gate |
|---|---|
| Stripe payment reads, refunds, disputes, payouts | No Stripe app registered, no install link, no verified permission list. Needs an owner-authorized app registration plus a separate merchant test account. |
| Whop | Not built, and no Whop API code exists. Registered in the provider table honestly as `unavailable / absent / not_built` rather than omitted. |
| Toast | Partner approval needed. Backend connection with no owner-facing redirect, which is why `AuthMethod` gained `partner` rather than reusing `oauth`. No Toast API code exists. |
| Scenarios 28, 36, 40, 41 | Provider-neutral tests exist and pass, but the guard forbids a Whop or Toast row from claiming coverage, so they stay blocked. |
| Webhook signature verification, replay and retry handling | No signing secret can exist without a registered app. |

## awaiting_provider_review

Nothing. Nothing has been submitted to any provider, so nothing can be awaiting
their review. This section exists so that its emptiness is on the record rather
than inferred.

## not_tested

- **`RecentDrops`, `MoneyView`, `ConnectSheet`, `FinancialLadder` and every
  other changed component have no unit tests.** This repository has no React
  render-test infrastructure. Their only coverage is Playwright, which exercises
  some states and not others. The `RecentDrops` defect I fixed above existed
  precisely because no unit test could catch it.
- `processor_balance_credit` and `payout_to_bank` carry sign 0 with no test
  pinning them, so scenario 26 (fee or payout) stays `not_tested` even though
  the fee half is proven twice.
- Coverage disclosure on *totals*. The connection view discloses a limited
  checkpoint; the money totals do not.
- Scenarios 46, 50, 51, 52, 59, 61: the consequence is proven, the trigger or
  the persistence is not.
- Late refund restatement. The policy is written down and the disclosure rule is
  stated, but no code restates a closed period. This needs D06.
- Mixed-currency ledgers, which would throw, and zero-decimal currencies.

## Claims I downgraded

Each of these was reported as done or implied done by a builder. I could not
find the test or the call site that proves it, so it is downgraded here.

1. **"Processing fees are excluded and reported separately" and "an open dispute
   produces an at-risk figure" are not visible to an owner.** The domain
   functions `processingFees` and `disputeAtRisk` exist and are tested, and
   `MoneyView` accepts `atRisk` and `fees` props. But
   `src/components/owner/OwnerDashboard.tsx:83` renders
   `<MoneyView economics={cohort.economics} />` and passes neither, and
   `buildEconomics` never computes them. Both rows render nothing today. The
   metric is honest; the "reported separately" half of the policy is
   **not_tested and not reachable on any screen**.

2. **"Credit reads from an AttributionSnapshot, never from
   `Opportunity.currentOwner`" is true only for sealed movements.**
   `UNSEALED_CREDIT_FALLBACK = "current_owner"` means an unsealed movement reads
   today's owner exactly as it did before, which is the audit's H3 defect
   unchanged. The builder named this compromise openly and a test proves the
   defect still exists without a seal. The fixture seals every signed contract,
   so every screen looks correct; real unsealed data would not behave that way.
   Treat this as **implemented_and_tested for sealed movements only**.

3. **`CommissionEntry` is still produced by nothing.** `commissionAccruals`
   computes the correct rows, but no code persists them, and `commissionSummary`
   still derives its buckets from fixture entries. The arithmetic is proven; the
   pipeline is `absent`.

4. **`UNCLASSIFIED_EVIDENCE_FALLBACK` is still `"processor_confirmed"`**
   (`src/domain/events.ts:97`). A ledger entry with no `evidence` field counts as
   cash. Every writer in this tree sets `evidence` explicitly, so nothing
   currently relies on it, but the default is the wrong way round and a test
   pins the wrong value. This is a live residual risk, recorded as an open
   decision rather than fixed, because flipping it changes what existing data
   means and that is an owner call.

5. **A zero on the leaderboard is still labelled `verified_zero` purely because
   no hold is open** (`src/domain/leaderboard.ts:196`). With no payments
   provider available anywhere, calling that zero verified asserts more than the
   evidence supports. Reported by a builder, not fixed, and still live.

6. **`docs/spec/MANIFEST.json` is stale.** I recomputed every hash: four of the
   34 declared files no longer match (`02_METRIC_CONTRACTS.md`,
   `13_QUALIFICATION_AND_DQ_GOVERNANCE.md`,
   `19_REVENUE_COMMISSIONS_AND_FORECASTS.md`,
   `28_TRACEABILITY_AND_OPEN_DECISIONS.md`). The manifest still declares version
   1.0.0. Two of the four were stale before this work.

7. **The V2 specification has no authority in this repository.** It has no SOS
   number, no manifest entry, and does not exist under `docs/`. Everything built
   from it is a proposed default, not a ratified decision.

## What was NOT done, and why

- **No provider integration of any kind.** Blocked on app registration, partner
  approval and a merchant test account. Not attemptable offline, and attempting
  it would require a credential that does not exist.
- **No webhook receiver, no token exchange, no OAuth redirect.** A rendered
  button is not an integration, so the Connect affordance for a payments
  provider is a disabled button with an explicit sentence rather than a working
  one.
- **No persisted exception queue.** Scenario 20's unlinked-payment incident is
  derived on read. There is no stored exception row, no assignee and no
  resolution history.
- **Scenario 43 remains open.** A spreadsheet may carry a real charge id, and a
  later webhook carrying the same movement will not de-duplicate against it,
  because an import cannot honestly name the provider, account or environment
  that `buildEconomicMovementKey` requires. Resolving it needs the provider
  adapter boundary to be real, not a change to the importer.
- **`LedgerEntry` has no `installmentId`.** Installment binding is passed as an
  optional side map so no type change was needed. When a provider movement can
  name its installment, that belongs on the type and on `ledger_entries`, which
  means a migration, which is not authorized.
- **`ProviderConnection` (screen state) and `ProviderConnectionRecord` (durable
  record) are still two types.**
- **Nothing was committed or pushed.** Note that an orchestrator process
  committed a WIP snapshot (`f3ea2bd`) mid-run which captured an earlier draft
  of `src/components/connect/availability.ts`. The on-disk version is the final
  one; a reviewer reading that commit alone is reading a stale draft of that
  file.

## Owner policy defaults, none of them ratified

Every one of these is a single named constant, changeable in one place. Shipping
code that uses a proposed default is not the owner having decided it.

| Policy | Constant | Proposed default |
|---|---|---|
| Attribution freeze point | `ATTRIBUTION_FREEZE_POLICY` | Captured at handoff, sealed at order issuance |
| Unsealed movement credit | `UNSEALED_CREDIT_FALLBACK` | `current_owner`, for compatibility only |
| Net collected cash basis | `NET_COLLECTED_CASH_POLICY` | Processor-confirmed live movements only |
| Commission rates | `COMMISSION_RATE_DEFAULTS` | 5 percent setter, 10 percent closer, hypothetical pending D06 |
| Historical import window | `HISTORICAL_IMPORT_DEFAULT_WINDOW_DAYS` | 90 days |
| Collection scope | `COLLECTION_SCOPE_POLICY` | Only `create_payment_request` enabled; transfer, billing change and customer delete never in scope |
| Attribution exceptions | `ATTRIBUTION_EXCEPTION_RULES` | Six predetermined rules, `ratified: false` |
| Provider availability | `DEFAULT_PROVIDER_AVAILABILITY` | `unavailable` |
