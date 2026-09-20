/**
 * Honest connection state: three orthogonal axes, the eight owner-facing
 * conditions of specification 14.3, the persisted capability contract of
 * specification 15.2, and the server-side collection policy.
 *
 * Source: OBAVIA_Simple_UX_and_Verified_Payment_Attribution_v2.md sections 12
 * to 16, docs/PAYMENTS_AUDIT.md step B3, docs/DECISIONS.md ("OAuth first,
 * always", amended: OAuth first where the provider's onboarding path is
 * actually available in the current environment, otherwise Request connection).
 *
 * Pure. No React, no I/O, no network, no Date.now(). Every timestamp is
 * injected. Nothing in this file contacts a provider or claims that one was
 * contacted.
 *
 * Three rules this module exists to enforce:
 * 1. A single `connected: true` boolean is not an integration model. Authorization,
 *    sync coverage, and collection capability are separate axes and are derived
 *    separately.
 * 2. A capability is displayed from evidence. There is no "available" capability
 *    state: a capability is `verified` by a probe or it is not claimed.
 * 3. Level A (track payments) never implies Level B (send payment requests).
 *    Every collection operation is refused unless the stored capability contract
 *    says it was proven, and unless the operation is inside the enabled scope.
 */
import type {
  CapabilityContract,
  CapabilityState,
  ConnectionAuthorizationState,
  AuthorizationMethod,
  ImplementationState,
  ProviderConnectionRecord,
  SyncCheckpoint,
} from "./types";
import { MERCHANT_BINDING_CONFLICT_POLICY } from "./types";

// ---------- Axis 1: provider availability in this environment ----------

/**
 * Whether a provider has an onboarding path that actually exists here.
 * A provider that is not `available` can never present a Connect affordance
 * (specification 12.1: "A provider awaiting approval should say Request
 * connection, not open a simulated authorization success screen").
 */
export type ProviderAvailability =
  /** A real, proven onboarding path exists in this environment. */
  | "available"
  /** No self-serve path. The owner registers interest and an operator follows up. */
  | "request_connection"
  /** Nothing is built and nothing is claimed. */
  | "unavailable";

export type AvailabilityBlocker =
  | "provider_access"
  | "provider_review"
  | "owner_decision"
  | "not_built";

export interface ProviderAvailabilityRecord {
  state: ProviderAvailability;
  /** Plain words for the owner. Says what is missing, never that it works. */
  reason: string;
  implementationState: ImplementationState;
  blockedBy?: AvailabilityBlocker;
}

/** A Connect affordance is legal only for a provider that is actually available. */
export function canOfferConnect(availability: ProviderAvailabilityRecord): boolean {
  return availability.state === "available";
}

// ---------- Axis 2: sync coverage ----------

/**
 * What the connection can actually read right now. Separate from whether a
 * grant exists: a granted connection with a failed payment read has no coverage.
 */
export type SyncCoverageAxis =
  /** No read has been attempted. */
  | "none"
  /** Probes are running or incomplete. No promise of working tracking. */
  | "probing"
  /** Reads verified, bounded history still loading. Partial is never called complete. */
  | "importing_history"
  /** Reads verified and signed event delivery verified. */
  | "live"
  /** Reads verified, no event coverage. Freshness is disclosed. */
  | "delayed"
  /** Reads verified but coverage is short of what was requested (scenario 59). */
  | "limited"
  /** The read itself did not succeed or was refused. */
  | "failed";

// ---------- Axis 3: collection capability ----------

export type CollectionAxis =
  | "not_requested"
  | "not_authorized"
  | "authorized"
  | "requires_setup"
  | "unsupported";

export interface ConnectionAxes {
  authorization: ConnectionAuthorizationState;
  syncCoverage: SyncCoverageAxis;
  collection: CollectionAxis;
}

// ---------- The eight conditions of specification 14.3 ----------

export type ConnectionCondition =
  | "no_grant"
  | "probes_pending"
  | "history_loading"
  | "live_coverage_validated"
  | "no_event_coverage"
  | "collection_permission_absent"
  | "grant_revoked_or_invalid"
  | "setup_required";

export type ConnectAffordance =
  | "connect"
  | "request_connection"
  | "reconnect"
  | "details_only"
  | "none";

export interface ConnectionConditionDescriptor {
  condition: ConnectionCondition;
  /** Verbatim from the specification 14.3 table, "Internal condition" column. */
  internalCondition: string;
  /** Verbatim from the specification 14.3 table, "Suggested owner-facing text" column. */
  ownerText: string;
  /** Verbatim from the specification 14.3 table, "Effect" column. */
  effect: string;
  /** Short text label. Every state has one, so no state is carried by colour alone. */
  label: string;
  /** Phosphor icon name, paired with the label. Never a colour on its own. */
  icon: string;
  /** What the owner may press. Never "connect" for an unavailable provider. */
  affordance: ConnectAffordance;
}

/**
 * The eight rows of specification 14.3, in the order the specification lists
 * them. The owner-facing text and the effect are quoted, not paraphrased,
 * so a copy change is a visible decision.
 */
export const CONNECTION_CONDITIONS: Record<ConnectionCondition, ConnectionConditionDescriptor> = {
  no_grant: {
    condition: "no_grant",
    internalCondition: "No grant",
    ownerText: "Not connected",
    effect: "Existing sales workspace remains usable.",
    label: "Not connected",
    icon: "Plugs",
    affordance: "connect",
  },
  probes_pending: {
    condition: "probes_pending",
    internalCondition: "Consent granted; account/read probes pending",
    ownerText: "Checking connection",
    effect: "No promise of working tracking.",
    label: "Checking",
    icon: "Hourglass",
    affordance: "details_only",
  },
  history_loading: {
    condition: "history_loading",
    internalCondition: "Read access verified; history loading",
    ownerText: "Connected. Syncing payment history",
    effect: "Show coverage of available data; do not call partial history complete.",
    label: "Syncing history",
    icon: "ArrowsClockwise",
    affordance: "details_only",
  },
  live_coverage_validated: {
    condition: "live_coverage_validated",
    internalCondition: "Live coverage validated",
    ownerText: "Payment tracking ready",
    effect: "Automatic updates for the verified scope.",
    label: "Tracking ready",
    icon: "CheckCircle",
    affordance: "details_only",
  },
  no_event_coverage: {
    condition: "no_event_coverage",
    internalCondition: "Read works; no event coverage",
    ownerText: "Updates may be delayed",
    effect: "Poll only if supported; disclose timing and limitations.",
    label: "Delayed updates",
    icon: "Clock",
    affordance: "details_only",
  },
  collection_permission_absent: {
    condition: "collection_permission_absent",
    internalCondition: "Extra collection permission absent",
    ownerText: "Tracking enabled",
    effect: "Checkout creation unavailable without extra authorization.",
    label: "Tracking only",
    icon: "Eye",
    affordance: "details_only",
  },
  grant_revoked_or_invalid: {
    condition: "grant_revoked_or_invalid",
    internalCondition: "Grant revoked/invalid",
    ownerText: "Reconnect to resume updates",
    effect: "Stop unauthorized work; preserve historical records per policy.",
    label: "Reconnect needed",
    icon: "ArrowCounterClockwise",
    affordance: "reconnect",
  },
  setup_required: {
    condition: "setup_required",
    internalCondition: "Partner approval needed",
    ownerText: "Connection requires setup",
    effect: "No simulated authorization.",
    label: "Setup required",
    icon: "Wrench",
    affordance: "request_connection",
  },
};

/** The eight conditions in specification order. */
export const CONNECTION_CONDITION_ORDER: readonly ConnectionCondition[] = [
  "no_grant",
  "probes_pending",
  "history_loading",
  "live_coverage_validated",
  "no_event_coverage",
  "collection_permission_absent",
  "grant_revoked_or_invalid",
  "setup_required",
];

/** The owner-facing string alone, for a screen that needs nothing else. */
export function ownerFacingText(condition: ConnectionCondition): string {
  return CONNECTION_CONDITIONS[condition].ownerText;
}

// ---------- Deriving the state ----------

export interface ConnectionStatusView {
  /** The headline condition. Resolved by the documented precedence below. */
  condition: ConnectionCondition;
  ownerText: string;
  effect: string;
  label: string;
  icon: string;
  affordance: ConnectAffordance;
  /**
   * Every condition that holds, headline first. The 14.3 rows are not mutually
   * exclusive: a connection can be tracking-ready on the observation axis and
   * still have no collection permission.
   */
  conditions: ConnectionCondition[];
  axes: ConnectionAxes;
  /**
   * True only when the owner may be shown a working payment figure from this
   * connection. A failed probe never produces true.
   */
  observationReady: boolean;
  /** Plain-words limitations to state where the figure is read, not globally. */
  disclosures: string[];
}

export interface ConnectionStatusInput {
  connection: ProviderConnectionRecord;
  availability: ProviderAvailabilityRecord;
  /** Checkpoints for this connection. Coverage that actually loaded, not what was asked for. */
  checkpoints?: SyncCheckpoint[];
}

/** Maps the stored collection capability onto the collection axis. */
export function collectionAxisOf(contract: CapabilityContract): CollectionAxis {
  switch (contract.collection.createPaymentRequest) {
    case "verified":
      return "authorized";
    case "not_requested":
      return "not_requested";
    case "requires_setup":
      return "requires_setup";
    case "unsupported":
      return "unsupported";
    // A capability that is merely requested is not a capability. It is not authorized.
    case "pending_verification":
    case "not_authorized":
    default:
      return "not_authorized";
  }
}

/**
 * Sync coverage from the proven capability contract and the checkpoints that
 * recorded what actually loaded. A payment read that is anything other than
 * `verified` can never produce coverage.
 */
export function syncCoverageOf(
  connection: ProviderConnectionRecord,
  checkpoints: SyncCheckpoint[] = [],
): SyncCoverageAxis {
  if (connection.authorizationState !== "granted") return "none";
  const reads = connection.capabilities.observation.paymentReads;
  if (reads === "not_authorized" || reads === "unsupported" || reads === "requires_setup") return "failed";
  if (reads !== "verified") return "probing";

  const payments = checkpoints.filter((c) => c.connectionId === connection.connectionId && c.resource === "payments");
  if (payments.some((c) => c.state === "failed")) return "limited";
  if (payments.some((c) => c.state === "importing" || c.state === "never_run")) return "importing_history";
  if (payments.some((c) => c.state === "limited")) return "limited";
  if (payments.length === 0) return "importing_history";
  if (connection.capabilities.observation.signedEventDelivery !== "verified") return "delayed";
  return "live";
}

export function connectionAxes(input: ConnectionStatusInput): ConnectionAxes {
  return {
    authorization: input.connection.authorizationState,
    syncCoverage: syncCoverageOf(input.connection, input.checkpoints ?? []),
    collection: collectionAxisOf(input.connection.capabilities),
  };
}

/**
 * Resolve the headline condition.
 *
 * Precedence, highest first, each one a refusal to overstate:
 * 1. A merchant already bound to another workspace is a setup problem, never a merge.
 * 2. A revoked or invalid grant stops work before anything else is considered.
 * 3. A provider with no onboarding path here never reaches a Connect affordance.
 * 4. No grant, then a pending grant.
 * 5. With a grant: the coverage axis decides, and a failed read lands on setup,
 *    never on a ready state.
 */
export function deriveConnectionStatus(input: ConnectionStatusInput): ConnectionStatusView {
  const axes = connectionAxes(input);
  const disclosures: string[] = [];
  const { connection, availability } = input;

  let headline: ConnectionCondition;

  if (connection.bindingConflict) {
    headline = "setup_required";
    disclosures.push(connection.bindingConflict.reason || MERCHANT_BINDING_CONFLICT_POLICY.reason);
  } else if (axes.authorization === "revoked" || axes.authorization === "reconnect_required") {
    headline = "grant_revoked_or_invalid";
  } else if (axes.authorization === "none") {
    headline = availability.state === "available" ? "no_grant" : "setup_required";
    if (availability.state !== "available") disclosures.push(availability.reason);
  } else if (axes.authorization === "pending") {
    headline = "probes_pending";
  } else {
    switch (axes.syncCoverage) {
      case "failed":
        headline = "setup_required";
        disclosures.push(readFailureDisclosure(connection.capabilities.observation.paymentReads));
        break;
      case "none":
      case "probing":
        headline = "probes_pending";
        break;
      case "importing_history":
        headline = "history_loading";
        break;
      case "limited":
        headline = "history_loading";
        break;
      case "delayed":
        headline = "no_event_coverage";
        break;
      case "live":
      default:
        headline = "live_coverage_validated";
        break;
    }
  }

  const conditions: ConnectionCondition[] = [headline];

  // The collection axis is orthogonal. It is reported alongside a working
  // observation state, never instead of it, and never as a promotion.
  const observationWorking =
    axes.authorization === "granted" &&
    (axes.syncCoverage === "live" ||
      axes.syncCoverage === "delayed" ||
      axes.syncCoverage === "importing_history" ||
      axes.syncCoverage === "limited");
  if (observationWorking && axes.collection !== "authorized") {
    conditions.push("collection_permission_absent");
    disclosures.push(COLLECTION_ABSENT_DISCLOSURE);
  }

  for (const c of input.checkpoints ?? []) {
    if (c.connectionId !== connection.connectionId) continue;
    if (c.limitation) disclosures.push(c.limitation);
  }

  const d = CONNECTION_CONDITIONS[headline];
  const affordance: ConnectAffordance =
    d.affordance === "connect" && !canOfferConnect(availability) ? "request_connection" : d.affordance;

  return {
    condition: headline,
    ownerText: d.ownerText,
    effect: d.effect,
    label: d.label,
    icon: d.icon,
    affordance,
    conditions,
    axes,
    observationReady:
      axes.authorization === "granted" && (axes.syncCoverage === "live" || axes.syncCoverage === "delayed"),
    disclosures,
  };
}

export const COLLECTION_ABSENT_DISCLOSURE =
  "Checkout creation is unavailable. Sending payment requests needs a separately granted collection permission.";

function readFailureDisclosure(state: CapabilityState): string {
  switch (state) {
    case "not_authorized":
      return "This account did not grant payment access, so payment history cannot be read.";
    case "unsupported":
      return "This provider does not offer a payment read that Obavia can use.";
    case "requires_setup":
      return "Payment reading needs setup that is not complete.";
    default:
      return "Payment reading is not verified.";
  }
}

// ---------- The payment-read probe (specification 14.2 step 5) ----------

/**
 * "Probe a harmless payment-data operation. An empty authorized result can be
 * valid; a forbidden response is not the same as no payments."
 *
 * No probe in this repository has ever been executed against a provider. These
 * are the shapes an adapter would return, and the readings the owner would see.
 */
export type PaymentReadProbeOutcome =
  | { kind: "authorized_empty" }
  | { kind: "authorized_records"; recordCount: number }
  | { kind: "forbidden"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "unsupported"; reason: string }
  | { kind: "requires_setup"; reason: string };

export interface ProbeReading {
  capability: CapabilityState;
  /** Short text label. Two different readings never share one. */
  label: string;
  icon: string;
  ownerText: string;
  /**
   * True when the provider answered the question. An authorized empty read is
   * an answer ("no payments"). A forbidden read is the absence of permission.
   */
  isAnswer: boolean;
  /** Whether this reading may contribute to a ready state. */
  readsVerified: boolean;
}

export function readPaymentProbe(outcome: PaymentReadProbeOutcome): ProbeReading {
  switch (outcome.kind) {
    case "authorized_empty":
      return {
        capability: "verified",
        label: "No payments yet",
        icon: "Tray",
        ownerText: "Payment access verified. This account has no payments in the requested window.",
        isAnswer: true,
        readsVerified: true,
      };
    case "authorized_records":
      return {
        capability: "verified",
        label: "Payments readable",
        icon: "CheckCircle",
        ownerText: `Payment access verified. ${outcome.recordCount} payment records are readable.`,
        isAnswer: true,
        readsVerified: true,
      };
    case "forbidden":
      return {
        capability: "not_authorized",
        label: "Permission refused",
        icon: "Prohibit",
        ownerText: `This account did not grant payment access. ${outcome.reason}`,
        isAnswer: false,
        readsVerified: false,
      };
    case "failed":
      return {
        capability: "pending_verification",
        label: "Read did not complete",
        icon: "WarningCircle",
        ownerText: `The payment read did not complete, so payment tracking is not verified. ${outcome.reason}`,
        isAnswer: false,
        readsVerified: false,
      };
    case "unsupported":
      return {
        capability: "unsupported",
        label: "Not offered",
        icon: "MinusCircle",
        ownerText: `This provider does not offer a payment read that Obavia can use. ${outcome.reason}`,
        isAnswer: false,
        readsVerified: false,
      };
    case "requires_setup":
    default:
      return {
        capability: "requires_setup",
        label: "Setup required",
        icon: "Wrench",
        ownerText: `Payment reading needs setup that is not complete. ${outcome.reason}`,
        isAnswer: false,
        readsVerified: false,
      };
  }
}

/** Record the probe result on the contract. Never promotes anything else. */
export function applyPaymentReadProbe(
  contract: CapabilityContract,
  outcome: PaymentReadProbeOutcome,
  verifiedAt?: string,
): CapabilityContract {
  const reading = readPaymentProbe(outcome);
  return {
    ...contract,
    observation: { ...contract.observation, paymentReads: reading.capability },
    verifiedAt: reading.readsVerified ? (verifiedAt ?? contract.verifiedAt) : contract.verifiedAt,
  };
}

// ---------- The capability contract ----------

/**
 * A contract that claims nothing. Every capability starts un-requested, and the
 * implementation state starts at whatever has actually been built.
 */
export function emptyCapabilityContract(
  authorizationMethod: AuthorizationMethod,
  implementationState: ImplementationState = "absent",
): CapabilityContract {
  return {
    authorizationMethod,
    observation: {
      paymentReads: "not_requested",
      historicalImport: "not_requested",
      signedEventDelivery: "not_requested",
      refundReads: "not_requested",
      disputeReads: "not_requested",
      payoutReads: "not_requested",
    },
    collection: {
      createPaymentRequest: "not_requested",
      updateSubscription: "not_requested",
      issueRefund: "not_requested",
    },
    implementationState,
  };
}

/** Observation is ready only when reads are proven. Nothing else substitutes. */
export function isObservationReady(contract: CapabilityContract): boolean {
  return contract.observation.paymentReads === "verified";
}

/**
 * Level A never implies Level B. This function reads only the collection block
 * and is the single place that answers the question.
 */
export function isCollectionAuthorized(contract: CapabilityContract, operation: CollectionOperation): boolean {
  const field = COLLECTION_CAPABILITY_FIELD[operation];
  if (!field) return false;
  return contract.collection[field] === "verified";
}

// ---------- Requested permissions versus granted permissions ----------

/**
 * Scopes that prove who signed in and nothing about a merchant's money.
 * Specification 13.2: "Basic identity scopes are not proof of merchant payment
 * access." Scenario 28.
 */
export const IDENTITY_ONLY_SCOPES: readonly string[] = ["openid", "profile", "email", "user:read", "identity"];

export interface PermissionComparison {
  requested: string[];
  granted: string[];
  /** Asked for and not granted. Capabilities that need these stay unproven. */
  missing: string[];
  /** Granted although never asked for. Must be disclosed before consent (specification 16). */
  extra: string[];
  /** Every granted scope is an identity scope. Not merchant payment authorization. */
  identityOnly: boolean;
}

export function comparePermissions(requested: string[], granted: string[]): PermissionComparison {
  const norm = (s: string) => s.trim().toLowerCase();
  const req = requested.map(norm);
  const gr = granted.map(norm);
  return {
    requested: [...requested],
    granted: [...granted],
    missing: requested.filter((s) => !gr.includes(norm(s))),
    extra: granted.filter((s) => !req.includes(norm(s))),
    identityOnly: gr.length > 0 && gr.every((s) => IDENTITY_ONLY_SCOPES.includes(s)),
  };
}

/**
 * An identity grant is never merchant payment authorization, and an empty grant
 * is never one either. This is a refusal, not a score.
 */
export function isMerchantPaymentAuthorization(granted: string[]): boolean {
  if (granted.length === 0) return false;
  return !comparePermissions([], granted).identityOnly;
}

// ---------- Server-side collection policy (Level B) ----------

export type CollectionOperation =
  | "create_payment_request"
  | "update_subscription"
  | "issue_refund"
  | "capture_payment"
  | "transfer_funds"
  | "change_billing"
  | "delete_customer";

export const COLLECTION_OPERATIONS: readonly CollectionOperation[] = [
  "create_payment_request",
  "update_subscription",
  "issue_refund",
  "capture_payment",
  "transfer_funds",
  "change_billing",
  "delete_customer",
];

/** Which capability field, if any, could ever authorize an operation. */
const COLLECTION_CAPABILITY_FIELD: Partial<
  Record<CollectionOperation, keyof CapabilityContract["collection"]>
> = {
  create_payment_request: "createPaymentRequest",
  update_subscription: "updateSubscription",
  issue_refund: "issueRefund",
};

/**
 * PROPOSED DEFAULT, not ratified. One named constant so the owner changes the
 * policy here and nowhere else.
 *
 * Specification 16: "Collection functionality, refund execution, and commission
 * payouts are three different scopes of work. Only the approved collection
 * request is in this revision."
 */
export const COLLECTION_SCOPE_POLICY = {
  ratified: false,
  /** The only Level B operation this revision may perform, and only when proven. */
  enabledOperations: ["create_payment_request"] as readonly CollectionOperation[],
  /**
   * Never in scope for this product at any grant. Specification 16: "Do not
   * request payout changes, money transfers, balance debits, refunds, customer
   * deletion, or subscription changes merely to calculate standings."
   */
  neverInScope: ["transfer_funds", "change_billing", "delete_customer"] as readonly CollectionOperation[],
  /** Writes are refused outside the live environment binding they were proven in. */
  requireEnvironmentBinding: true,
  note: "Level A (track payments) never implies Level B (send payment requests). Proposed default pending owner ratification.",
} as const;

export type CollectionRefusalCode =
  | "operation_never_in_scope"
  | "operation_out_of_scope_this_revision"
  | "merchant_binding_conflict"
  | "authorization_not_granted"
  | "account_not_bound"
  | "capability_not_verified";

export interface CollectionDecision {
  allowed: boolean;
  operation: CollectionOperation;
  code: CollectionRefusalCode | "allowed";
  /** Plain words. Says which authority is missing, never "try again". */
  reason: string;
}

/**
 * The refusal table. Every collection operation is refused unless the stored
 * capability contract says it was proven and the operation is in scope.
 *
 * Order matters: an operation that is never in scope is refused before the
 * grant is even consulted, so a broad grant can never widen the product.
 */
export function checkCollectionAllowed(
  connection: ProviderConnectionRecord,
  operation: CollectionOperation,
): CollectionDecision {
  const refuse = (code: CollectionRefusalCode, reason: string): CollectionDecision => ({
    allowed: false,
    operation,
    code,
    reason,
  });

  if (COLLECTION_SCOPE_POLICY.neverInScope.includes(operation)) {
    return refuse(
      "operation_never_in_scope",
      `Obavia never performs ${operation.replace(/_/g, " ")}. No provider grant changes this.`,
    );
  }
  if (!COLLECTION_SCOPE_POLICY.enabledOperations.includes(operation)) {
    return refuse(
      "operation_out_of_scope_this_revision",
      `${operation.replace(/_/g, " ")} is outside the approved collection scope of this revision.`,
    );
  }
  if (connection.bindingConflict) {
    return refuse(
      "merchant_binding_conflict",
      connection.bindingConflict.reason || MERCHANT_BINDING_CONFLICT_POLICY.reason,
    );
  }
  if (connection.authorizationState !== "granted") {
    return refuse(
      "authorization_not_granted",
      `This connection is ${connection.authorizationState.replace(/_/g, " ")}, so no operation may run on the merchant account.`,
    );
  }
  if (!connection.providerAccountId) {
    return refuse(
      "account_not_bound",
      "No merchant account is bound to this connection, so there is no account to act on.",
    );
  }
  if (!isCollectionAuthorized(connection.capabilities, operation)) {
    const field = COLLECTION_CAPABILITY_FIELD[operation];
    const state = field ? connection.capabilities.collection[field] : "not_requested";
    return refuse(
      "capability_not_verified",
      `Sending payment requests is ${state.replace(/_/g, " ")} on this connection. Tracking payments does not grant it.`,
    );
  }
  return {
    allowed: true,
    operation,
    code: "allowed",
    reason: "The stored capability contract proves this operation on this bound merchant account.",
  };
}

export class CollectionNotAllowedError extends Error {
  readonly code: CollectionRefusalCode;
  readonly operation: CollectionOperation;
  constructor(decision: CollectionDecision) {
    super(decision.reason);
    this.name = "CollectionNotAllowedError";
    this.code = decision.code as CollectionRefusalCode;
    this.operation = decision.operation;
  }
}

/**
 * Server-side gate. Every collection path calls this before it does anything,
 * and a refusal throws rather than returning a value a caller could ignore.
 * Never call this from a browser: the decision must not be re-derivable or
 * skippable by the client that asked for the operation.
 */
export function assertCollectionAllowed(
  connection: ProviderConnectionRecord,
  operation: CollectionOperation,
): void {
  const decision = checkCollectionAllowed(connection, operation);
  if (!decision.allowed) throw new CollectionNotAllowedError(decision);
}
