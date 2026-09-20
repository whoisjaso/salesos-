/**
 * The 62 acceptance scenarios of specification section 20, transcribed verbatim
 * and graded against this repository as it actually stands.
 *
 * Source: OBAVIA_Simple_UX_and_Verified_Payment_Attribution_v2.md, section 20,
 * version 2.0, dated 2026-09-19. The scenario text is quoted, never paraphrased,
 * so a wording drift is a visible decision rather than a silent one.
 *
 * Why this file exists. A checklist in prose can claim coverage that does not
 * exist. This registry is asserted against the real suite by
 * src/content/__tests__/paymentsV2.test.ts: a row that claims
 * implemented_and_tested must name a test title that is actually present in a
 * test file on disk, no Whop or Toast row may claim it at all, and no row whose
 * evidence would need a provider credential may claim it, because no credential
 * exists. A false coverage claim therefore fails `npm test`.
 *
 * Ids are namespaced PV2-01 to PV2-62. This repository already carries a
 * register numbered T01 to T56 in docs/spec/26_ACCEPTANCE_TESTS_AND_SCENARIOS.md
 * whose ids are cited inside live test titles, so a bare "scenario 14" would
 * mean two different things.
 *
 * Nothing here is evidence of a provider test. No provider was contacted, no
 * credential was used, no migration was applied. Where a row reads
 * implemented_and_tested it means a test in this repository exercises the
 * behaviour against synthetic fixtures, offline.
 *
 * This module is deliberately dependency-free: it is data plus its renderer, so
 * docs/PAYMENTS_SCENARIOS.md can be generated from it and compared byte for byte.
 */

/** The implementation phase of specification section 19 that a scenario belongs to. */
export type ScenarioPhase =
  | "step_b_observation"
  | "step_c_payment_requests"
  | "step_d_whop"
  | "step_e_toast"
  | "connection_lifecycle"
  | "process_and_policy";

/**
 * The six words the handoff fixes the meaning of. There is deliberately no
 * "partial": a scenario that is half proven takes the lower status and says
 * what is proven in its notes.
 */
export type ScenarioStatus =
  | "implemented_and_tested"
  | "mocked"
  | "blocked_by_access"
  | "awaiting_provider_review"
  | "not_tested"
  | "absent";

/** A test that proves a scenario, named exactly as the suite names it. */
export interface ScenarioTestRef {
  /** Repository-relative path of the test file. */
  readonly file: string;
  /** The exact `it(...)` title. The guard test asserts this string is in that file. */
  readonly title: string;
}

export interface AcceptanceScenario {
  /** 1 to 62, as specification section 20 numbers them. */
  readonly n: number;
  /** PV2-01 to PV2-62. Namespaced away from the existing T01 to T56 register. */
  readonly id: string;
  /** Verbatim from specification section 20. */
  readonly text: string;
  readonly phase: ScenarioPhase;
  readonly status: ScenarioStatus;
  /**
   * Required and non-empty when the status is implemented_and_tested, empty
   * otherwise. Partial coverage belongs in `notes`, never here, so that this
   * field can only ever mean "this test proves this scenario".
   */
  readonly coveredBy: readonly ScenarioTestRef[];
  /**
   * True when an end-to-end proof would need a provider credential, a provider
   * approval, or a merchant account. Such a row can never be
   * implemented_and_tested, because none of those exists.
   */
  readonly evidenceNeedsProviderCredential: boolean;
  /** What is actually proven, what is not, and why. Plain words, no em dashes. */
  readonly notes: string;
}

export interface PhaseDescriptor {
  readonly phase: ScenarioPhase;
  /** Short text label. Paired with an icon, so no state is carried by colour. */
  readonly label: string;
  /** Phosphor icon name. */
  readonly icon: string;
  readonly summary: string;
}

export const SCENARIO_PHASES: readonly PhaseDescriptor[] = [
  {
    phase: "step_b_observation",
    label: "Step B: one observation path",
    icon: "Eye",
    summary: "Evidence, attribution, and reliable event processing. Everything money touches before a payment request exists.",
  },
  {
    phase: "step_c_payment_requests",
    label: "Step C: payment requests",
    icon: "PaperPlaneTilt",
    summary: "Order-linked checkout and invoice creation. Separately enabled, separately authorized, and refused by default.",
  },
  {
    phase: "step_d_whop",
    label: "Step D: Whop",
    icon: "PlugsConnected",
    summary: "The second adapter. Same ledger and attribution, different authorization, permissions, ids, events and versions.",
  },
  {
    phase: "step_e_toast",
    label: "Step E: Toast",
    icon: "Lock",
    summary: "Partner gated and deferred. Request connection only, and never a fabricated redirect grant.",
  },
  {
    phase: "connection_lifecycle",
    label: "Connection lifecycle",
    icon: "ShieldCheck",
    summary: "Authorization, account binding, verification, coverage, reconnection and disconnect. The prerequisite for Step B.",
  },
  {
    phase: "process_and_policy",
    label: "Process and policy",
    icon: "Notebook",
    summary: "Deferred gates with no code surface in a client-only repository. Registered so they are never quietly assumed to pass.",
  },
];

export interface StatusDescriptor {
  readonly status: ScenarioStatus;
  /** Short text label. Never colour alone. */
  readonly label: string;
  /** Phosphor icon name. */
  readonly icon: string;
  /** The fixed meaning, as the payments handoff defines it. */
  readonly meaning: string;
}

export const SCENARIO_STATUSES: readonly StatusDescriptor[] = [
  {
    status: "implemented_and_tested",
    label: "Tested here",
    icon: "CheckCircle",
    meaning: "The code exists and a test in this repository exercises it against synthetic fixtures. Never evidence of a provider test.",
  },
  {
    status: "mocked",
    label: "Mocked",
    icon: "Placeholder",
    meaning: "A screen or function renders or returns a result that no external system produced.",
  },
  {
    status: "blocked_by_access",
    label: "Blocked by access",
    icon: "Lock",
    meaning: "Cannot proceed without provider credentials, approval, or an owner decision.",
  },
  {
    status: "awaiting_provider_review",
    label: "Awaiting provider review",
    icon: "Hourglass",
    meaning: "Built but gated on a provider's publication or partner approval.",
  },
  {
    status: "not_tested",
    label: "Not tested",
    icon: "Question",
    meaning: "The mechanism is partly or wholly present and no test in this repository proves the scenario.",
  },
  {
    status: "absent",
    label: "Absent",
    icon: "Prohibit",
    meaning: "No file, type, table, or function implements the mechanism this scenario names.",
  },
];

/**
 * Providers whose rows may never claim test coverage. Whop has no application,
 * grant or SDK here. Toast is partner gated and unapproved. A row that names
 * either is capped below implemented_and_tested by the guard test, whatever a
 * provider-neutral test elsewhere happens to prove.
 */
export const UNPROVEN_PROVIDERS: readonly string[] = ["Whop", "Toast"];

export const ACCEPTANCE_SCENARIOS: readonly AcceptanceScenario[] = [
  {
    n: 1,
    id: "PV2-01",
    text: "A transcript states \"I'll pay $12,000\" with no provider event: collected cash and commission remain unchanged.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/callIntelligence.test.ts", title: "bought at the yes band records a verbal yes and a follow-up task, never a ledger or contract event" },
      { file: "src/domain/__tests__/callIntelligence.test.ts", title: "never emits payment, consent, or attendance events, in either mode" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "The transcript path is structurally incapable of emitting a payment event: FORBIDDEN_AI_EVENT_TYPE throws rather than filters.",
  },
  {
    n: 2,
    id: "PV2-02",
    text: "A customer states \"I paid\" while the payment is processing: the UI shows processing, not paid.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/lib/__tests__/workspace-closer.test.ts", title: "lists seven steps with Processing between authorized and collected" },
      { file: "src/lib/__tests__/workspace-closer.test.ts", title: "puts a processing payment on Processing, not on Collected and not on Signed" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "Opportunity.paymentState carries processing and the ladder renders it with a word and an icon. No provider sets the state yet, so the state is reached only from fixtures.",
  },
  {
    n: 3,
    id: "PV2-03",
    text: "An order-linked $3,000 payment succeeds: one monetary movement and the correct role attribution are recorded.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/orders.test.ts", title: "only the collected installment accrues commission" },
      { file: "src/domain/__tests__/attribution.test.ts", title: "seals at the policy's freeze point and reads credit from the snapshot, never from the opportunity" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "One movement, one order, credit read from the sealed snapshot. The movement itself comes from a synthetic fixture, never from a processor.",
  },
  {
    n: 4,
    id: "PV2-04",
    text: "The same webhook arrives three times: company cash and commissions do not triple.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/events.test.ts", title: "a payment delivered three times affects the ledger once (T01/T37)" },
      { file: "src/data/__tests__/memory.test.ts", title: "records a provider event delivered three times exactly once" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "De-duplication is proven at the reducer and at the store. The webhook receiver it would defend does not exist.",
  },
  {
    n: 5,
    id: "PV2-05",
    text: "Checkout, payment, and invoice notifications describe the same payment: it posts once.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/events.test.ts", title: "a checkout, a payment-intent and an invoice event describing one payment post once and total 3000" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "Economic movement identity is de-duplicated separately from delivery identity. This closes the defect the audit proved by probe: three event types once totalled 9000 for one 3000 payment.",
  },
  {
    n: 6,
    id: "PV2-06",
    text: "A payment-success notification arrives before its related subscription notification: the system reconciles correctly.",
    phase: "step_b_observation",
    status: "absent",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "Out-of-order delivery is handled (events.test.ts, out-of-order delivery still yields one effect), but no subscription record exists. Subscription appears only as a ProviderObjectType and a SyncResource label, so there is no related notification to reconcile against.",
  },
  {
    n: 7,
    id: "PV2-07",
    text: "A contact is reassigned after sale: historic attribution and original-agreement installments do not silently move.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/attribution.test.ts", title: "reassigning currentOwner after a collected payment leaves both users' commission and both standings rows byte-identical" },
      { file: "src/domain/__tests__/attribution.test.ts", title: "without a seal the same reassignment does move the money, which is the defect this exists to close" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "The second test pins the old behaviour so the seal cannot be silently removed.",
  },
  {
    n: 8,
    id: "PV2-08",
    text: "An operations user sends the payment link: the credited closer does not change to the operations user.",
    phase: "step_c_payment_requests",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/attribution.test.ts", title: "a recorded payment-request sender receives no closer credit" },
      { file: "src/domain/__tests__/attribution.test.ts", title: "identitiesAtIssue takes the sender and drops it on the floor" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "The PaymentRequest record exists and carries requestedByUserId. Nothing sends one to a provider.",
  },
  {
    n: 9,
    id: "PV2-09",
    text: "One customer purchases two offers: each payment maps to its own order and credit snapshot.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/attribution.test.ts", title: "one contact with two orders yields two snapshots and two independent totals" },
      { file: "src/domain/__tests__/orders.test.ts", title: "only movements bound to this order are read" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "",
  },
  {
    n: 10,
    id: "PV2-10",
    text: "A company's bookkeeper pays using a different email: a valid order reference retains the order association.",
    phase: "step_b_observation",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "LedgerEntry.orderId and ProviderObjectLink give an order reference somewhere to live, and orders.test.ts, only movements bound to this order are read, proves the binding governs. No test drives a payer identity that disagrees with the reference, and no identity resolution consults the order reference first.",
  },
  {
    n: 11,
    id: "PV2-11",
    text: "Two people pay the same amount on the same day: amount and timing alone do not determine ownership.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/attribution.test.ts", title: "an entry on a two-order contact that names no order is reported ambiguous, never guessed" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "creditForEntry returns source ambiguous rather than picking by amount, date or contact. There is no candidate-matching engine to constrain, which is why the guarantee currently holds by refusal.",
  },
  {
    n: 12,
    id: "PV2-12",
    text: "A browser request substitutes another closer ID: the server ignores or rejects unauthorized attribution.",
    phase: "step_c_payment_requests",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "The sealed fields refuse an ordinary edit and a self-serving correction (attribution.test.ts, a representative cannot change their own credited closer, by correction or by an ordinary edit). There is no server: no route handler, no use server directive, no middleware, so there is nothing that receives and rejects a browser-supplied closer id.",
  },
  {
    n: 13,
    id: "PV2-13",
    text: "A test-mode event arrives: no live standings or commissions change.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/metrics.test.ts", title: "a test-environment movement changes no cash figure, no standing and no commission" },
      { file: "src/domain/__tests__/events.test.ts", title: "a test-environment movement is not live cash" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "",
  },
  {
    n: 14,
    id: "PV2-14",
    text: "A refund is confirmed: cash and policy-based commission adjustments are recorded without deleting the original sale.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/events.test.ts", title: "refund and dispute movements net correctly without double subtraction (T38/T39)" },
      { file: "src/domain/__tests__/orders.test.ts", title: "a confirmed refund reduces the most recently satisfied installment and deletes nothing" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "",
  },
  {
    n: 15,
    id: "PV2-15",
    text: "A dispute opens and later closes: risk and actual adjustments are distinct and not double-counted.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/events.test.ts", title: "an opened dispute is at risk and debits nothing; a lost dispute debits exactly once" },
      { file: "src/domain/__tests__/orders.test.ts", title: "an opened dispute is at risk and satisfies nothing away; only a lost one debits" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "",
  },
  {
    n: 16,
    id: "PV2-16",
    text: "An invoice is manually marked paid outside the processor: it is not treated as new processor-verified cash.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/events.test.ts", title: "a manually marked paid movement is recorded and never enters net collected cash" },
      { file: "src/domain/__tests__/metrics.test.ts", title: "M16 counts a processor-confirmed payment and refuses an invoice marked paid outside the processor" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "",
  },
  {
    n: 17,
    id: "PV2-17",
    text: "A zero-amount invoice is paid: no new cash is created.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/events.test.ts", title: "a zero-amount movement creates no ledger entry and no cash" },
      { file: "src/domain/__tests__/metrics.test.ts", title: "a zero-amount movement creates no cash" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "No ledger entry is created at all, so the XP award and the cash drop the audit found cannot fire either.",
  },
  {
    n: 18,
    id: "PV2-18",
    text: "A later upsell belongs to another closer: original installments and the new order stay distinct.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/attribution.test.ts", title: "the synthetic fixture carries a second order on one contact, sold by a different closer" },
      { file: "src/domain/__tests__/orders.test.ts", title: "only movements bound to this order are read" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "",
  },
  {
    n: 19,
    id: "PV2-19",
    text: "An AI assessment changes after a model upgrade: historical financial credit does not change.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/callIntelligence.test.ts", title: "never emits payment, consent, or attendance events, in either mode" },
      { file: "src/domain/__tests__/callIntelligence.test.ts", title: "never takes ids or versions from the model" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "Financial credit is projected from sealed snapshots and payment events. No model output reaches either.",
  },
  {
    n: 20,
    id: "PV2-20",
    text: "A payment lacks an order reference: operations receives a scoped reconciliation task; the whole team's work is not blocked.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/events.test.ts", title: "unlinked payments go to the exception queue, not into any opportunity" },
      { file: "src/domain/__tests__/incidents.test.ts", title: "declares its surfaces, its owner, what it waits on, and a one-sentence effect" },
      { file: "src/domain/__tests__/game.test.ts", title: "an unlinked payment does not pause XP, does not freeze the level, and does not break the streak" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "The incident is computed on every read. There is still no persisted exception row, no assignee and no resolution history, so the task exists as a derived statement rather than as a record operations can close.",
  },
  {
    n: 21,
    id: "PV2-21",
    text: "The model provider fails: verified payment processing and known attribution continue.",
    phase: "step_b_observation",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "The model fallback is real and tested (callIntelligence.test.ts, falls back to the rules when the output is invalid, not JSON, or the model fails), and domainPurity.test.ts proves no domain file imports a model client. The other half is vacuous: there is no provider-confirmed payment processing to continue.",
  },
  {
    n: 22,
    id: "PV2-22",
    text: "A communication cue lacks evidence: the default brief omits it or marks it tentative.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/buyerMode.test.ts", title: "is Unknown at confidence 0 with no spans on every dimension when the transcript is silent" },
      { file: "src/domain/__tests__/buyerMode.test.ts", title: "every non-Unknown value cites at least one customer span, on every fixture transcript" },
      { file: "src/domain/__tests__/buyerMode.test.ts", title: "the approach kicker leads with doing, and its caveat says the recommendation is tentative and unchecked" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "",
  },
  {
    n: 23,
    id: "PV2-23",
    text: "A user opens Details: the supporting excerpts and correction action are accessible without exposing secrets.",
    phase: "step_b_observation",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "Excerpts, source dates and span jumps render on both Details surfaces and no secret is rendered anywhere. The correction action exists only on the review surface and writes to React state, so a flag does not survive a reload. No test covers either surface.",
  },
  {
    n: 24,
    id: "PV2-24",
    text: "A daily reconciliation discovers a missed event: recovery posts the correct result once.",
    phase: "step_b_observation",
    status: "absent",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "Posting once on recovery is proven (events.test.ts, a payment delivered three times affects the ledger once (T01/T37)). The reconciliation that would discover the miss is absent: no schedule, no job, no persisted cursor drain. SyncCheckpoint is a type with no producer.",
  },
  {
    n: 25,
    id: "PV2-25",
    text: "Setter, closer, and pair reports all reference one sale: company totals still count the money only once.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/orders.test.ts", title: "setter and closer read the same money, and the company counts it once" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "The repository's own register names this T41. Before this run nothing cited it.",
  },
  {
    n: 26,
    id: "PV2-26",
    text: "A processing fee or bank payout differs from the customer's gross payment: the ledger does not confuse the amounts.",
    phase: "step_b_observation",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "The fee half is proven: events.test.ts, a processing fee is excluded from cash and reported separately, and workspace-closer.test.ts, never folds them into one number. The payout half is modelled and unproven: processor_balance_credit and payout_to_bank carry sign 0 in events.ts and no test pins them.",
  },
  {
    n: 27,
    id: "PV2-27",
    text: "A user completes Stripe account authorization but the payment-read probe fails: no Payment tracking ready state is shown.",
    phase: "connection_lifecycle",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/connections.test.ts", title: "never produces Payment tracking ready for any non-verified read state" },
      { file: "src/domain/__tests__/connections.test.ts", title: "says what is missing when the read was refused rather than merely pending" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "The status derivation is pure and proven against fixtures. No Stripe authorization has ever been completed, because no app registration exists.",
  },
  {
    n: 28,
    id: "PV2-28",
    text: "A Whop connection grants only basic identity access: it is not accepted as merchant payment authorization.",
    phase: "step_d_whop",
    status: "blocked_by_access",
    coveredBy: [],
    evidenceNeedsProviderCredential: true,
    notes: "The provider-neutral rule is proven offline by connections.test.ts, refuses an identity-only grant as merchant payment authorization (scenario 28). The Whop-specific claim cannot be implemented_and_tested: no Whop application, grant, business-scoped credential or SDK exists, and this registry forbids a Whop row from claiming test coverage.",
  },
  {
    n: 29,
    id: "PV2-29",
    text: "The provider grant exposes multiple businesses: only the owner-confirmed business is ingested into this workspace.",
    phase: "connection_lifecycle",
    status: "absent",
    coveredBy: [],
    evidenceNeedsProviderCredential: true,
    notes: "ProviderConnectionRecord binds one providerAccountId and one environment, and an unbound account is refused before any capability is consulted. There is no account discovery step and no owner confirmation of which accessible business to ingest.",
  },
  {
    n: 30,
    id: "PV2-30",
    text: "An OAuth callback has an incorrect, expired, reused, or wrong-workspace state: connection is rejected without binding the merchant.",
    phase: "connection_lifecycle",
    status: "absent",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "There is no OAuth callback to reject on. No server route, no one-use state, no PKCE.",
  },
  {
    n: 31,
    id: "PV2-31",
    text: "A token exchange callback is retried: the connection flow does not blindly redeem the same code again or create duplicate accounts.",
    phase: "connection_lifecycle",
    status: "absent",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "No token exchange exists. The consumed-code pattern this needs already exists for magic links in src/data/auth.ts and has not been applied here.",
  },
  {
    n: 32,
    id: "PV2-32",
    text: "Two workers refresh one rotating token at the same time: serialization prevents loss of the valid replacement token.",
    phase: "connection_lifecycle",
    status: "absent",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "No tokens, no refresh path, no workers. The compare-and-set lease pattern exists in SQL for tasks and has never been executed.",
  },
  {
    n: 33,
    id: "PV2-33",
    text: "The owner denies consent: the app remains usable and provides a retry or skip path without error loops.",
    phase: "connection_lifecycle",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "The domain half is proven: integrations.test.ts, records no grant at all when authorization failed. The owner-facing denial path is untested, and in this build no provider offers a Connect affordance at all, so consent is never sought.",
  },
  {
    n: 34,
    id: "PV2-34",
    text: "Payment reading works but webhook delivery is not ready: the UI reports the actual delayed/limited state, not live readiness.",
    phase: "connection_lifecycle",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/connections.test.ts", title: "carries the specification's owner-facing text verbatim for each condition" },
      { file: "src/domain/__tests__/connections.test.ts", title: "derives each of the eight conditions from a real connection shape" },
      { file: "src/domain/__tests__/connections.test.ts", title: "keeps observationReady false for every state except live and delayed coverage" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "Updates may be delayed is one of the eight conditions and is derived, not hand-set.",
  },
  {
    n: 35,
    id: "PV2-35",
    text: "An account has no payments: the successful empty read is distinct from missing permissions or failed history import.",
    phase: "connection_lifecycle",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/connections.test.ts", title: "counts the empty read as an answer and the forbidden read as an absence of permission" },
      { file: "src/domain/__tests__/connections.test.ts", title: "gives them different words and different icons" },
      { file: "src/domain/__tests__/connections.test.ts", title: "distinguishes a failed read from both of them" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "",
  },
  {
    n: 36,
    id: "PV2-36",
    text: "A Whop creator declines an optional collection permission: observation continues and payment-request creation is unavailable.",
    phase: "step_c_payment_requests",
    status: "blocked_by_access",
    coveredBy: [],
    evidenceNeedsProviderCredential: true,
    notes: "The provider-neutral half is proven offline: connections.test.ts, says Tracking enabled and discloses that checkout creation is unavailable, and the full refusal table. The Whop-specific claim needs a creator, a consent screen and an optional permission that do not exist here.",
  },
  {
    n: 37,
    id: "PV2-37",
    text: "An owner connects in observation mode: creating a checkout, changing billing, refunding, and transferring funds are blocked by server policy.",
    phase: "step_c_payment_requests",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/connections.test.ts", title: "covers the whole refusal table: every operation against every capability state and authorization state" },
      { file: "src/domain/__tests__/connections.test.ts", title: "refuses the never-in-scope operations even when the provider granted them" },
      { file: "src/server/providers/__tests__/adapters.test.ts", title: "refuses before the provider is consulted, so policy outranks the adapter's own state" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "The policy is enforced in src/server/providers, outside src/domain, and refuses before the adapter is consulted. It is a module boundary, not yet an HTTP boundary, because there is no server route.",
  },
  {
    n: 38,
    id: "PV2-38",
    text: "A public Stripe installation is attempted before publication: the feature stays gated; no fake or production use of a test link.",
    phase: "connection_lifecycle",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/integrations.test.ts", title: "refuses to begin a simulated authorization for any payments provider" },
      { file: "src/domain/__tests__/integrations.test.ts", title: "registers Stripe as the first payment candidate and unproven" },
      { file: "src/components/connect/__tests__/availability.test.ts", title: "offers no Connect affordance at all in this build" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "The gate is stronger than the scenario asks for: no payments provider can be connected at all, and the simulated authorizer now throws for a payments provider rather than fabricating a grant. There is no publication flag because there is no app registration to publish.",
  },
  {
    n: 39,
    id: "PV2-39",
    text: "A Stripe installation belongs to a platform account: no access to its connected merchants is assumed without a valid separate route.",
    phase: "connection_lifecycle",
    status: "absent",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "The connection record binds one merchant account, so a platform account and its connected merchants are not distinguishable states. Nothing claims access it does not have, but nothing represents the distinction either.",
  },
  {
    n: 40,
    id: "PV2-40",
    text: "Toast has no approved partner access: the UI offers Request connection, not an invented working OAuth authorization.",
    phase: "step_e_toast",
    status: "blocked_by_access",
    coveredBy: [],
    evidenceNeedsProviderCredential: true,
    notes: "Toast is registered as Request connection, partner gated, and its adapter reports connection as unsupported. Tests exist in integrations.test.ts and adapters.test.ts. This registry forbids a Toast row from claiming implemented_and_tested, and Toast partner approval has not been sought.",
  },
  {
    n: 41,
    id: "PV2-41",
    text: "Toast access includes two restaurants: each location is mapped to the intended customer/workspace before use.",
    phase: "step_e_toast",
    status: "blocked_by_access",
    coveredBy: [],
    evidenceNeedsProviderCredential: true,
    notes: "Toast partner approval and restaurant GUIDs are genuinely unavailable. The connection record binds exactly one account, so two locations under one grant cannot yet be represented.",
  },
  {
    n: 42,
    id: "PV2-42",
    text: "A provider event names an unbound account: no tenant ledger or dashboard receives the transaction.",
    phase: "step_b_observation",
    status: "absent",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "Tenant isolation is proven (memory.test.ts, never returns another tenant's rows) and the movement key carries provider, account and environment. Nothing checks a movement's account against a bound connection before it reaches a ledger, because there is no ingestion surface and no connection store.",
  },
  {
    n: 43,
    id: "PV2-43",
    text: "Historical import and a webhook contain the same movement: it is recorded once and does not create duplicate commission.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/events.test.ts", title: "the same movement seen by a historical import and by an event is not two movements" },
      { file: "src/domain/__tests__/migration.test.ts", title: "produces one record when the same import runs twice" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "Both paths now key on the economic movement identity, not only on their own delivery namespace.",
  },
  {
    n: 44,
    id: "PV2-44",
    text: "A new payment occurs midway through historical import: overlapping reconciliation captures it once.",
    phase: "step_b_observation",
    status: "absent",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "Movement identity makes the overlap representable, but there is no bounded historical import, no live event stream, and no overlapping reconciliation window to run.",
  },
  {
    n: 45,
    id: "PV2-45",
    text: "Historical attribution is missing: provider collection is preserved, representative attribution remains unallocated, and unaffected selling continues.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/attribution.test.ts", title: "a snapshot with no representative is unallocated, and the collection is still genuine" },
      { file: "src/domain/__tests__/orders.test.ts", title: "an unallocated snapshot accrues nothing while the collection stays real" },
      { file: "src/domain/__tests__/game.test.ts", title: "an unlinked payment does not pause XP, does not freeze the level, and does not break the streak" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "",
  },
  {
    n: 46,
    id: "PV2-46",
    text: "The same merchant is reconnected: mappings and cursors are reused rather than starting a second additive ledger.",
    phase: "connection_lifecycle",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "The mapping half is proven: integrations.test.ts, reuses an existing connection rather than starting a second one. Cursors are not: no SyncCheckpoint is ever persisted or resumed, so there is nothing to reuse on reconnect.",
  },
  {
    n: 47,
    id: "PV2-47",
    text: "Another workspace attempts to connect an already-bound merchant: apply the explicit sharing policy; never leak records based on matching email.",
    phase: "connection_lifecycle",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/connections.test.ts", title: "outranks every other condition and never merges" },
      { file: "src/domain/__tests__/connections.test.ts", title: "refuses an unbound account and a conflicted binding before any capability is consulted" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "MERCHANT_BINDING_CONFLICT_POLICY is reject_with_reason with resolveByEmailMatch false, and it is a proposed default: ratified is false pending the owner. The cross-workspace unique binding also exists in a migration that has never been applied.",
  },
  {
    n: 48,
    id: "PV2-48",
    text: "One underlying payment appears through two authorized systems with a verified cross-reference: totals use one canonical movement.",
    phase: "step_b_observation",
    status: "absent",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "The movement key includes the provider, so two authorized systems produce two movements. There is no cross-reference record, no canonical-source selection, and only one payments provider is even a candidate.",
  },
  {
    n: 49,
    id: "PV2-49",
    text: "Two similar payments lack an authoritative cross-provider link: they are not automatically merged by amount or transcript.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/events.test.ts", title: "the movement key separates provider, account and environment" },
      { file: "src/domain/__tests__/attribution.test.ts", title: "an entry on a two-order contact that names no order is reported ambiguous, never guessed" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "Nothing merges by amount, date or transcript, and nothing can: no similarity matcher exists. The guarantee currently holds by refusal rather than by a scored decision.",
  },
  {
    n: 50,
    id: "PV2-50",
    text: "The owner disconnects: Obavia stops reads/writes and event processing for that grant, removes only its owned subscriptions where supported, and retains history according to policy.",
    phase: "connection_lifecycle",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "Disconnect clears both permission lists (integrations.test.ts, clears both permission lists on disconnect). There are no jobs to stop, no owned subscriptions to remove, and no retention policy: D05 is open.",
  },
  {
    n: 51,
    id: "PV2-51",
    text: "The authorizing employee loses merchant access: the affected connection requests reauthorization rather than silently failing or switching identities.",
    phase: "connection_lifecycle",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: true,
    notes: "The consequence is proven: connections.test.ts, offers reconnection, never a fresh connect, for a revoked grant. ProviderConnectionRecord records authorizedByUserId. Nothing detects that the authorizer lost provider access, because detecting it requires the provider.",
  },
  {
    n: 52,
    id: "PV2-52",
    text: "An Obavia user signs out: a separately approved persistent business connection follows its documented grant lifecycle; a login-only grant is never silently treated as permanent.",
    phase: "connection_lifecycle",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: true,
    notes: "AuthorizationMethod distinguishes oauth_authorization_code, app_installation, partner_enablement_client_credentials, assisted_restricted_key and none, so a login-only grant is nameable. No sign-out path consults it, and which grant is login-only is a provider fact this repository cannot establish.",
  },
  {
    n: 53,
    id: "PV2-53",
    text: "No model is running and no browser is open: provider-confirmed payment processing continues under the authorized background integration.",
    phase: "connection_lifecycle",
    status: "absent",
    coveredBy: [],
    evidenceNeedsProviderCredential: true,
    notes: "domainPurity.test.ts proves the money path imports no React and no HTTP client, so it does not need a browser. There is no background runtime at all: no route handler, no use server directive, no middleware, no worker.",
  },
  {
    n: 54,
    id: "PV2-54",
    text: "A transcript contains instructions to refund money or change the merchant ID: no financial operation or authorization boundary changes.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/callIntelligence.test.ts", title: "treats instructions inside the transcript as quoted data" },
      { file: "src/domain/__tests__/callIntelligence.test.ts", title: "never emits payment, consent, or attendance events, in either mode" },
      { file: "src/domain/__tests__/callIntelligence.test.ts", title: "refuses a correction that would touch money, consent, or attendance" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "The financial half is enforced by a throw. The authorization boundary half is currently easy: no merchant binding is mutable from any transcript path, and no write capability exists to change.",
  },
  {
    n: 55,
    id: "PV2-55",
    text: "An optional MCP support tool receives another business ID from a model: server account allowlisting blocks the request.",
    phase: "process_and_policy",
    status: "absent",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "No MCP code exists in the application. The only occurrences in the repository are prohibitions in supabase/README.md. Register this as a deferred gate, never as passing.",
  },
  {
    n: 56,
    id: "PV2-56",
    text: "The provider SDK lacks a method shown in a newer documentation example: the agent reports the mismatch and uses a verified supported approach, not an invented import.",
    phase: "process_and_policy",
    status: "absent",
    coveredBy: [],
    evidenceNeedsProviderCredential: true,
    notes: "The prohibition half is enforced: domainPurity.test.ts, invents no provider endpoint, because no URL to a provider appears at all, and adapters.test.ts, invents no provider permission name and pins no unverified API version. The mismatch itself cannot arise: no payment SDK is installed, so there is no installed release to check a method against.",
  },
  {
    n: 57,
    id: "PV2-57",
    text: "One sale has supported payments from two processors: both genuine movements map to the same order without overwriting their source identity.",
    phase: "step_b_observation",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "LedgerEntry now carries provider, providerAccountId, environment and orderId, so two processors can hold one order without overwriting each other, and the movement key keeps them distinct. No test drives two providers onto a single order, and the money.ts currency guard would throw on a cross-currency sum, which is correct and unexercised here.",
  },
  {
    n: 58,
    id: "PV2-58",
    text: "Payment-request creation times out with an uncertain outcome: use the original provider-supported idempotency key where available, or verify the original request through a documented reference/lookup path. If neither can establish the result, keep the operation unresolved instead of blindly issuing a second request.",
    phase: "step_c_payment_requests",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "PaymentRequest carries an idempotencyKey and a PaymentRequestState of unresolved, documented as blocking retry and never assumed to be a failure. No code transitions into it and no test exercises it. The outbox table that would hold the outbound operation still has no client code.",
  },
  {
    n: 59,
    id: "PV2-59",
    text: "The sync covers only a subset of the requested historical period: totals visibly disclose the actual coverage.",
    phase: "step_b_observation",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: false,
    notes: "The connection view discloses partial coverage: connections.test.ts, reports a limited checkpoint as syncing history and carries its limitation. The totals do not. MetricPayload carries dataState and unknownCount, and no sync checkpoint is wired to any metric, so a total cannot yet disclose its coverage window.",
  },
  {
    n: 60,
    id: "PV2-60",
    text: "A provider exposes a cash tender or manually paid invoice rather than a processor movement: evidence classification remains external/recorded, not processor-confirmed.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/migration.test.ts", title: "classifies a wire or a check as externally recorded and an invoice closed by hand as manually marked paid" },
      { file: "src/domain/__tests__/migration.test.ts", title: "never produces processor-confirmed evidence from any file" },
      { file: "src/domain/__tests__/migration.test.ts", title: "reads a tender word only from a method column, never from a processor name" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "This closes audit finding H2: the importer no longer mints processor-shaped cash from a won-deal column.",
  },
  {
    n: 61,
    id: "PV2-61",
    text: "An authorized upgrade adds write permissions: the provider-supported reapproval is completed before server write capabilities become available.",
    phase: "step_c_payment_requests",
    status: "not_tested",
    coveredBy: [],
    evidenceNeedsProviderCredential: true,
    notes: "CapabilityContract keeps each collection capability at not_requested until proven, and connections.test.ts, refuses payment-request creation on a fully verified observation connection, shows the refusal. There is no pending-upgrade record and no reapproval step, because reapproval is a provider process.",
  },
  {
    n: 62,
    id: "PV2-62",
    text: "A successful test event is received: it validates delivery only and does not create a real payment or count as evidence of a real customer sale.",
    phase: "step_b_observation",
    status: "implemented_and_tested",
    coveredBy: [
      { file: "src/domain/__tests__/events.test.ts", title: "a test-environment movement is not live cash" },
      { file: "src/domain/__tests__/metrics.test.ts", title: "a test-environment movement changes no cash figure, no standing and no commission" },
    ],
    evidenceNeedsProviderCredential: false,
    notes: "The environment travels on the event envelope and on the ledger entry, so a test movement is recorded and excluded rather than discarded. No provider has ever delivered a test event here.",
  },
];

export const SCENARIO_COUNT = 62;

export function scenario(n: number): AcceptanceScenario {
  const found = ACCEPTANCE_SCENARIOS.find((s) => s.n === n);
  if (!found) throw new Error(`No acceptance scenario numbered ${n}`);
  return found;
}

export function scenariosByPhase(phase: ScenarioPhase): readonly AcceptanceScenario[] {
  return ACCEPTANCE_SCENARIOS.filter((s) => s.phase === phase);
}

export function phaseDescriptor(phase: ScenarioPhase): PhaseDescriptor {
  const found = SCENARIO_PHASES.find((p) => p.phase === phase);
  if (!found) throw new Error(`No phase descriptor for ${phase}`);
  return found;
}

export function statusDescriptor(status: ScenarioStatus): StatusDescriptor {
  const found = SCENARIO_STATUSES.find((s) => s.status === status);
  if (!found) throw new Error(`No status descriptor for ${status}`);
  return found;
}

/** True when the scenario text names a provider whose access is unproven. */
export function namesUnprovenProvider(s: AcceptanceScenario): boolean {
  if (s.phase === "step_d_whop" || s.phase === "step_e_toast") return true;
  const text = s.text.toLowerCase();
  return UNPROVEN_PROVIDERS.some((p) => text.includes(p.toLowerCase()));
}

export type ScenarioTally = Record<ScenarioStatus, number>;

export function scenarioTally(scenarios: readonly AcceptanceScenario[] = ACCEPTANCE_SCENARIOS): ScenarioTally {
  const tally = {
    implemented_and_tested: 0,
    mocked: 0,
    blocked_by_access: 0,
    awaiting_provider_review: 0,
    not_tested: 0,
    absent: 0,
  } as ScenarioTally;
  for (const s of scenarios) tally[s.status] += 1;
  return tally;
}

/**
 * The human-readable view of this registry, grouped by phase. The guard test
 * compares this output to docs/PAYMENTS_SCENARIOS.md byte for byte, so the
 * document cannot drift from the data it describes.
 */
export function renderScenariosDoc(): string {
  const tally = scenarioTally();
  const out: string[] = [];
  out.push("# The 62 acceptance scenarios, graded against this repository");
  out.push("");
  out.push("Generated from `src/content/acceptance/paymentsV2.ts`. Do not edit by hand: `src/content/__tests__/paymentsV2.test.ts` compares this file to `renderScenariosDoc()` and fails on any difference.");
  out.push("");
  out.push("To regenerate after changing the registry, from the repository root:");
  out.push("");
  out.push("```sh");
  out.push("node --experimental-strip-types --input-type=module -e \\");
  out.push("  \"import{writeFileSync}from'node:fs';\\");
  out.push("   const m=await import('./src/content/acceptance/paymentsV2.ts');\\");
  out.push("   writeFileSync('docs/PAYMENTS_SCENARIOS.md',m.renderScenariosDoc())\"");
  out.push("```");
  out.push("");
  out.push("**Source:** `OBAVIA_Simple_UX_and_Verified_Payment_Attribution_v2.md` section 20, version 2.0, dated 2026-09-19. Scenario text is quoted verbatim.");
  out.push("");
  out.push("**What a grade means here.** These are implementation requirements, not tests executed against a provider. No provider was contacted, no credential was used, no migration was applied, and no network request was made. Where a row reads `implemented_and_tested`, a test in this repository exercises the behaviour against synthetic fixtures, offline. That is the strongest claim anything here makes.");
  out.push("");
  out.push("## Tally");
  out.push("");
  out.push("| Status | Count | Meaning |");
  out.push("| --- | ---: | --- |");
  for (const d of SCENARIO_STATUSES) {
    out.push(`| \`${d.status}\` | ${tally[d.status]} | ${d.meaning} |`);
  }
  out.push(`| **Total** | **${ACCEPTANCE_SCENARIOS.length}** | |`);
  out.push("");
  out.push("There is no `partial`. A scenario that is half proven takes the lower status and says what is proven in its note. Two rules cap a grade regardless of what any test proves: no row naming Whop or Toast may read `implemented_and_tested`, and no row whose evidence would need a provider credential may read it either.");
  out.push("");
  for (const p of SCENARIO_PHASES) {
    const rows = scenariosByPhase(p.phase);
    out.push(`## ${p.label}`);
    out.push("");
    out.push(p.summary);
    out.push("");
    if (rows.length === 0) {
      out.push("No scenarios.");
      out.push("");
      continue;
    }
    out.push("| # | Id | Scenario | Status | Proven by | Note |");
    out.push("| ---: | --- | --- | --- | --- | --- |");
    for (const s of rows) {
      const proven = s.coveredBy.length === 0
        ? (s.evidenceNeedsProviderCredential ? "Needs a provider credential" : "Nothing yet")
        : s.coveredBy.map((t) => `\`${t.file}\`: "${t.title}"`).join("<br>");
      out.push(`| ${s.n} | ${s.id} | ${s.text} | \`${s.status}\` | ${proven} | ${s.notes || "&nbsp;"} |`);
    }
    out.push("");
  }
  out.push("## Owner decisions that cap several of these rows");
  out.push("");
  out.push("Five policy defaults are implemented as named constants and none is ratified. Until the owner settles them, a row that depends on one cannot rise above its current grade:");
  out.push("");
  out.push("1. **Attribution freeze point.** Identities are captured at handoff acceptance and sealed when the order is issued for payment. `ATTRIBUTION_FREEZE_POLICY`, `ratified: false`.");
  out.push("2. **Net collected cash basis.** Processor-confirmed live movements only. Fees excluded and reported separately, open disputes at risk with no debit, refunds after a period closes restated and disclosed. `NET_COLLECTED_CASH_POLICY`, `ratified: false`.");
  out.push("3. **Commission rates.** 5 percent setter and 10 percent closer, still marked hypothetical pending D06. The specification's worked example uses different numbers and is labelled assumptions for that example only. It must never overwrite the recorded decision.");
  out.push("4. **Historical import window.** 90 days, owner-overridable. `HISTORICAL_IMPORT_DEFAULT_WINDOW_DAYS`.");
  out.push("5. **Shared merchant policy.** A second workspace connecting an already-bound merchant is rejected with a reason, never resolved by email match. `MERCHANT_BINDING_CONFLICT_POLICY`, `ratified: false`.");
  out.push("");
  out.push("## What no grade on this page establishes");
  out.push("");
  out.push("- No Stripe, Whop or Toast endpoint was called, in any environment.");
  out.push("- No application registration, granted scope, provider approval or account eligibility was inspected. Provider readiness is a release gate, not an assumed fact.");
  out.push("- No payment SDK is installed, so no method was validated against an installed release.");
  out.push("- The Supabase migration has never been executed. Every claim about a constraint is a claim about SQL text.");
  out.push("- Fixtures are synthetic and labelled synthetic. The source sheet behind this product is a visual reading, not verified operating data.");
  out.push("");
  return out.join("\n");
}
