/**
 * The adapter result type and the per-function contract every payment adapter
 * must declare. Specification 15.1.
 *
 * OFFLINE AND SANDBOX ONLY. Nothing in src/server/providers makes a network
 * request, imports a provider SDK, or names a provider endpoint. These files
 * are typed seams. Every one of them returns `requires_setup` or `unsupported`
 * until a real, authorized, version-pinned integration replaces the body.
 *
 * The rule this file exists to make mechanical: "A provider may report
 * `unsupported` or `requires_setup`. Do not implement missing capabilities by
 * returning fake successful responses."
 *
 * These files live outside src/domain because they are the impure half of the
 * boundary. src/domain stays pure (AGENTS.md rule 3) and a test in this
 * directory asserts it.
 */
import type { ProviderEnvironment } from "@/domain/types";

/** The twelve internal responsibilities named in specification 15.1. */
export type AdapterFunctionName =
  | "beginConnection"
  | "completeConnection"
  | "verifyAccessibleAccounts"
  | "probeCapabilities"
  | "refreshAuthorizationIfSupported"
  | "ensureOwnedEventSubscriptionIfSupported"
  | "verifyAndParseEvent"
  | "listPaymentsPage"
  | "retrievePaymentEvidence"
  | "listAdjustmentsPage"
  | "createOrderLinkedPaymentRequestIfSupported"
  | "revokeConnectionIfSupported";

export const ADAPTER_FUNCTION_NAMES: readonly AdapterFunctionName[] = [
  "beginConnection",
  "completeConnection",
  "verifyAccessibleAccounts",
  "probeCapabilities",
  "refreshAuthorizationIfSupported",
  "ensureOwnedEventSubscriptionIfSupported",
  "verifyAndParseEvent",
  "listPaymentsPage",
  "retrievePaymentEvidence",
  "listAdjustmentsPage",
  "createOrderLinkedPaymentRequestIfSupported",
  "revokeConnectionIfSupported",
];

/**
 * The credential a function runs on. Different mechanisms have different token
 * lifecycles and account boundaries; one provider's flow is never copied into
 * another's.
 */
export type CredentialType =
  | "none"
  | "operator_client_credentials"
  | "oauth_authorization_code_exchange"
  | "oauth_access_token"
  | "oauth_refresh_token"
  | "app_install_token"
  | "partner_client_credentials_token"
  | "restricted_api_key"
  | "webhook_signing_secret";

export type AccountBoundary =
  | "none"
  | "workspace"
  | "single_merchant_account"
  | "single_location"
  | "operator_application";

/**
 * A permission name that no provider has confirmed. Used instead of guessing
 * one. Specification 13.2: "Do not invent permission names."
 */
export const UNVERIFIED_PERMISSION = "unverified: no provider grant has been observed in this environment";

/** An API version that has not been pinned against a live provider contract. */
export const UNPINNED_API_VERSION = "unpinned: no provider API version has been verified in this environment";

export interface AdapterFunctionContract {
  fn: AdapterFunctionName;
  /** Level A observation, Level B collection, or connection lifecycle. */
  level: "observation" | "collection" | "lifecycle";
  credential: CredentialType;
  /**
   * The provider permission this needs. UNVERIFIED_PERMISSION until a real
   * grant proves one. A documentation example is not a grant.
   */
  permission: string;
  accountBoundary: AccountBoundary;
  /** Which environment this function is declared for. Test and live never mix. */
  environment: ProviderEnvironment | "either";
  /** UNPINNED_API_VERSION until a version is pinned and tested against. */
  apiVersion: string;
  /** How far this specific function has actually been built. */
  implementationState: "absent" | "sandbox_only" | "blocked_by_provider_access" | "awaiting_publication" | "live";
  /** Plain words: what would have to be true for this function to do anything. */
  prerequisite: string;
}

export type AdapterBlocker = "provider_access" | "provider_review" | "owner_decision" | "not_built";

/**
 * Every adapter call returns one of these. There is deliberately no shape that
 * lets a caller mistake "not built" for "nothing happened but it worked".
 */
export type AdapterResult<T> =
  | { status: "ok"; value: T }
  /** The provider does not offer this at all. Never fake it. */
  | { status: "unsupported"; reason: string }
  /** The provider offers it; the setup, approval, or registration is not done. */
  | { status: "requires_setup"; reason: string; blockedBy: AdapterBlocker }
  /** Obavia's own policy refused the call before the provider was consulted. */
  | { status: "refused"; reason: string; code: string }
  /** The call ran and did not succeed. */
  | { status: "failed"; reason: string; retryable: boolean };

export function ok<T>(value: T): AdapterResult<T> {
  return { status: "ok", value };
}

export function unsupported<T>(reason: string): AdapterResult<T> {
  return { status: "unsupported", reason };
}

export function requiresSetup<T>(reason: string, blockedBy: AdapterBlocker): AdapterResult<T> {
  return { status: "requires_setup", reason, blockedBy };
}

export function refused<T>(reason: string, code: string): AdapterResult<T> {
  return { status: "refused", reason, code };
}

export function failed<T>(reason: string, retryable = false): AdapterResult<T> {
  return { status: "failed", reason, retryable };
}

/** True only for a real success. A caller that forgets this cannot read a value. */
export function isOk<T>(r: AdapterResult<T>): r is { status: "ok"; value: T } {
  return r.status === "ok";
}
