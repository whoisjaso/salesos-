/**
 * The shared shell that turns a declared, unproven contract into a working
 * adapter object. Every function returns the refusal its contract declares.
 *
 * OFFLINE AND SANDBOX ONLY. There is no request, no SDK, and no endpoint here.
 * This file is the single place where "not built" becomes a value a caller can
 * handle, so no individual adapter is ever tempted to return a fake success.
 */
import { assertCollectionAllowed, CollectionNotAllowedError } from "@/domain/connections";
import type { ProviderAvailabilityRecord } from "@/domain/connections";
import {
  ADAPTER_FUNCTION_NAMES,
  refused,
  requiresSetup,
  unsupported,
  UNPINNED_API_VERSION,
  UNVERIFIED_PERMISSION,
  type AdapterBlocker,
  type AdapterFunctionContract,
  type AdapterFunctionName,
  type AdapterResult,
} from "./contract";
import type { AdapterContext, CreatePaymentRequestInput, PaymentProviderAdapter } from "./types";

/** What one function is declared to be, and why it cannot run yet. */
export type FunctionDeclaration = Omit<AdapterFunctionContract, "fn"> &
  ({ outcome: "requires_setup"; blockedBy: AdapterBlocker } | { outcome: "unsupported" });

export interface AdapterSpec {
  providerId: string;
  displayName: string;
  availability: ProviderAvailabilityRecord;
  functions: Record<AdapterFunctionName, FunctionDeclaration>;
}

/** Sensible unproven defaults, so a declaration only states what it knows. */
export function declare(
  partial: Partial<FunctionDeclaration> & Pick<FunctionDeclaration, "level" | "prerequisite">,
): FunctionDeclaration {
  const base = {
    credential: "none" as const,
    permission: UNVERIFIED_PERMISSION,
    accountBoundary: "single_merchant_account" as const,
    environment: "test" as const,
    apiVersion: UNPINNED_API_VERSION,
    implementationState: "absent" as const,
    outcome: "requires_setup" as const,
    blockedBy: "not_built" as AdapterBlocker,
  };
  return { ...base, ...partial } as FunctionDeclaration;
}

function refusalFor<T>(d: FunctionDeclaration, providerName: string, fn: AdapterFunctionName): AdapterResult<T> {
  if (d.outcome === "unsupported") {
    return unsupported<T>(`${providerName} does not offer ${fn} in a form Obavia can use. ${d.prerequisite}`);
  }
  return requiresSetup<T>(`${providerName} ${fn} is not set up. ${d.prerequisite}`, d.blockedBy);
}

/**
 * Build an adapter whose every function honestly refuses.
 *
 * The one function with behaviour is createOrderLinkedPaymentRequestIfSupported:
 * it runs the server-side collection policy FIRST, so a refusal is reported as
 * a refusal even for a provider that is not built. Level A never reaches Level B,
 * whatever state the adapter is in.
 */
export function makeAdapter(spec: AdapterSpec): PaymentProviderAdapter {
  const contracts = Object.fromEntries(
    ADAPTER_FUNCTION_NAMES.map((fn) => {
      const d = spec.functions[fn];
      const contract: AdapterFunctionContract = {
        fn,
        level: d.level,
        credential: d.credential,
        permission: d.permission,
        accountBoundary: d.accountBoundary,
        environment: d.environment,
        apiVersion: d.apiVersion,
        implementationState: d.implementationState,
        prerequisite: d.prerequisite,
      };
      return [fn, contract];
    }),
  ) as Record<AdapterFunctionName, AdapterFunctionContract>;

  const no = <T>(fn: AdapterFunctionName): AdapterResult<T> =>
    refusalFor<T>(spec.functions[fn], spec.displayName, fn);

  return {
    providerId: spec.providerId,
    displayName: spec.displayName,
    availability: spec.availability,
    contracts,
    makesNetworkRequests: false,

    async beginConnection() {
      return no("beginConnection");
    },
    async completeConnection() {
      return no("completeConnection");
    },
    async verifyAccessibleAccounts() {
      return no("verifyAccessibleAccounts");
    },
    async probeCapabilities() {
      return no("probeCapabilities");
    },
    async refreshAuthorizationIfSupported() {
      return no("refreshAuthorizationIfSupported");
    },
    async ensureOwnedEventSubscriptionIfSupported() {
      return no("ensureOwnedEventSubscriptionIfSupported");
    },
    async verifyAndParseEvent() {
      return no("verifyAndParseEvent");
    },
    async listPaymentsPage() {
      return no("listPaymentsPage");
    },
    async retrievePaymentEvidence() {
      return no("retrievePaymentEvidence");
    },
    async listAdjustmentsPage() {
      return no("listAdjustmentsPage");
    },
    async createOrderLinkedPaymentRequestIfSupported(_ctx: AdapterContext, input: CreatePaymentRequestInput) {
      void _ctx;
      try {
        assertCollectionAllowed(input.connection, "create_payment_request");
      } catch (e) {
        if (e instanceof CollectionNotAllowedError) {
          return refused<{ providerObjectId: string; checkoutUrl?: string }>(e.message, e.code);
        }
        throw e;
      }
      return no("createOrderLinkedPaymentRequestIfSupported");
    },
    async revokeConnectionIfSupported() {
      return no("revokeConnectionIfSupported");
    },
  };
}
