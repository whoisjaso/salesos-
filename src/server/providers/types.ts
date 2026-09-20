/**
 * The payment provider adapter interface of specification 15.1: a small
 * boundary around the functions Obavia needs, with the names the specification
 * uses. These name internal responsibilities, not provider endpoints.
 *
 * OFFLINE AND SANDBOX ONLY. No network call, no provider SDK, no endpoint.
 *
 * "Do not manufacture a universal payment API that erases differences in
 * provider evidence or permissions." So the normalized shapes below keep the
 * provider's own identities, original amount and currency, environment, and
 * evidence class, and every adapter declares its own contract per function.
 */
import type {
  CapabilityContract,
  EvidenceClass,
  Id,
  ISODateTime,
  LedgerEntryKind,
  Money,
  ProviderConnectionRecord,
  ProviderEnvironment,
} from "@/domain/types";
import type { ProviderAvailabilityRecord } from "@/domain/connections";
import type { AdapterFunctionContract, AdapterFunctionName, AdapterResult } from "./contract";

/**
 * Everything a call is scoped by. Reads and writes are always bound to the
 * verified connection, merchant account, and environment (specification 15.4).
 * `now` is injected: an adapter never reads the wall clock itself.
 */
export interface AdapterContext {
  tenantId: Id;
  connectionId?: Id;
  provider: string;
  providerAccountId?: string;
  environment: ProviderEnvironment;
  /** Reference to a secret in the vault. Never the secret itself. */
  secretRef?: string;
  now: ISODateTime;
}

export interface BeginConnectionInput {
  /** Where the provider returns the owner. Validated against an allowlist server-side. */
  returnTo: string;
  requestedScopes: string[];
  initiatedByUserId: Id;
  /** One-use, unpredictable, session-bound. Never a constant. */
  state: string;
  /** PKCE S256 challenge where the provider supports it. */
  codeChallenge?: string;
}

export interface CompleteConnectionInput {
  state: string;
  code: string;
  codeVerifier?: string;
}

export interface AccessibleAccount {
  providerAccountId: string;
  label: string;
  environment: ProviderEnvironment;
  /** True only when the owner has confirmed this is the business to ingest. */
  confirmedByOwner: boolean;
}

export interface EventSubscriptionInput {
  /** An Obavia-owned delivery destination. Unrelated endpoints are never touched. */
  deliveryUrl: string;
}

export interface VerifyEventInput {
  rawBody: string;
  signatureHeader: string;
  /** Reference to the signing secret in the vault. Never the secret itself. */
  secretRef: string;
}

/**
 * A verified provider event, normalized inside the version-pinned adapter with
 * its original identities preserved.
 */
export interface ParsedProviderEvent {
  /** Delivery identity, de-duplicated separately from the movement identity. */
  deliveryId: string;
  eventType: string;
  providerAccountId: string;
  environment: ProviderEnvironment;
  occurredAt: ISODateTime;
  receivedAt: ISODateTime;
  /** Set only when the event names a monetary movement. */
  movement?: ProviderMovement;
  /** The provider's own version string for this payload shape. */
  payloadVersion: string;
}

/**
 * One monetary movement as the provider reports it. The amount stays in its
 * original minor units and currency. A missing amount or unknown currency is
 * not zero, so both are required and an adapter that cannot establish them
 * returns `failed` rather than inventing a number.
 */
export interface ProviderMovement {
  provider: string;
  providerAccountId: string;
  environment: ProviderEnvironment;
  /** The provider-supported monetary movement identifier. */
  providerMovementId: string;
  kind: LedgerEntryKind;
  amount: Money;
  /**
   * What the provider's record actually proves. A checkout redirect, an invoice
   * marked paid outside the processor, and a cash tender are never
   * processor_confirmed.
   */
  evidence: EvidenceClass;
  occurredAt: ISODateTime;
  /** Opaque Obavia reference carried through the provider, when one exists. */
  orderReference?: string;
  /** The provider object this came from, for the evidence trail. */
  sourceObject: { type: string; id: string };
}

export interface PageRequest {
  cursor?: string;
  pageSize: number;
  /** Bounded window. The owner's approved historical window, never "everything". */
  since?: ISODateTime;
  until?: ISODateTime;
}

export interface ProviderPage<T> {
  items: T[];
  nextCursor?: string;
  /** The window this page actually covered, so partial coverage is disclosed. */
  coverage: { start?: ISODateTime; end?: ISODateTime };
}

export interface CreatePaymentRequestInput {
  /**
   * The stored connection. The adapter calls assertCollectionAllowed against it
   * before anything else, so Level A can never reach Level B.
   */
  connection: ProviderConnectionRecord;
  orderId: Id;
  attributionSnapshotId: Id;
  amount: Money;
  /** The key sent to the provider, so an uncertain timeout resolves, never retries blindly. */
  idempotencyKey: string;
  /** Opaque internal reference only. No transcript, no psychology label, no commission rule. */
  orderReference: string;
}

/**
 * The adapter boundary. Every function may return `unsupported` or
 * `requires_setup`, and no function may return a fabricated success.
 */
export interface PaymentProviderAdapter {
  providerId: string;
  displayName: string;
  availability: ProviderAvailabilityRecord;
  /** Per-function declarations: credential, permission, account boundary, environment, API version. */
  contracts: Record<AdapterFunctionName, AdapterFunctionContract>;
  /** Stated on the adapter itself so a reader never has to infer it. */
  makesNetworkRequests: false;

  beginConnection(
    ctx: AdapterContext,
    input: BeginConnectionInput,
  ): Promise<AdapterResult<{ authorizationUrl: string; expiresAt: ISODateTime }>>;

  completeConnection(
    ctx: AdapterContext,
    input: CompleteConnectionInput,
  ): Promise<AdapterResult<ProviderConnectionRecord>>;

  verifyAccessibleAccounts(ctx: AdapterContext): Promise<AdapterResult<AccessibleAccount[]>>;

  probeCapabilities(ctx: AdapterContext): Promise<AdapterResult<CapabilityContract>>;

  refreshAuthorizationIfSupported(
    ctx: AdapterContext,
  ): Promise<AdapterResult<{ refreshedAt: ISODateTime; expiresAt?: ISODateTime }>>;

  ensureOwnedEventSubscriptionIfSupported(
    ctx: AdapterContext,
    input: EventSubscriptionInput,
  ): Promise<AdapterResult<{ subscriptionId: string; ownedByObavia: true }>>;

  verifyAndParseEvent(ctx: AdapterContext, input: VerifyEventInput): Promise<AdapterResult<ParsedProviderEvent>>;

  listPaymentsPage(
    ctx: AdapterContext,
    input: PageRequest,
  ): Promise<AdapterResult<ProviderPage<ProviderMovement>>>;

  retrievePaymentEvidence(
    ctx: AdapterContext,
    input: { providerMovementId: string },
  ): Promise<AdapterResult<ProviderMovement>>;

  listAdjustmentsPage(
    ctx: AdapterContext,
    input: PageRequest,
  ): Promise<AdapterResult<ProviderPage<ProviderMovement>>>;

  createOrderLinkedPaymentRequestIfSupported(
    ctx: AdapterContext,
    input: CreatePaymentRequestInput,
  ): Promise<AdapterResult<{ providerObjectId: string; checkoutUrl?: string }>>;

  revokeConnectionIfSupported(
    ctx: AdapterContext,
  ): Promise<AdapterResult<{ revokedAt: ISODateTime; providerConfirmed: boolean }>>;
}
