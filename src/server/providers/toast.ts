/**
 * Toast adapter shell. Specification 13.3 and 19 step E: Toast is
 * PARTNER-GATED and deferred. It is Request connection, never a redirect grant.
 *
 * OFFLINE AND SANDBOX ONLY. No network request, no SDK, and deliberately no
 * authorization URL, no refresh-token flow, and no settlement feed. Toast
 * authenticates backend clients with client credentials issued after partner
 * approval, and a restaurant enables an approved partner integration on its
 * own side. That is not the merchant redirect used for Stripe or Whop, and
 * this file does not pretend it is.
 *
 * Two refusals specific to Toast:
 * - Several functions are `unsupported` rather than `requires_setup`, because
 *   there is no owner-initiated authorization redirect to set up at all.
 * - A closed restaurant check is not processor-confirmed bank cash. Tenders,
 *   refunds, voids, partial payments, tips, and timing would all have to be
 *   validated before any movement from Toast could be classified as anything
 *   stronger than an externally recorded payment.
 */
import { declare, makeAdapter } from "./shell";
import type { PaymentProviderAdapter } from "./types";

const TOAST_PARTNER_APPROVAL_MISSING =
  "Toast partner approval and partner API credentials do not exist for Obavia, so there is no client to authenticate.";
const TOAST_NO_REDIRECT =
  "Toast has no owner-initiated authorization redirect of the kind this function models. Connection is arranged through approved partner enablement, which is Request connection here.";
const TOAST_LOCATION_MAPPING_MISSING =
  "Authorized restaurant and location identifiers must be mapped to the intended workspace before any record is read.";

export const toastAdapter: PaymentProviderAdapter = makeAdapter({
  providerId: "toast",
  displayName: "Toast",
  availability: {
    state: "request_connection",
    implementationState: "blocked_by_provider_access",
    blockedBy: "provider_access",
    reason:
      "Toast is a partner-gated integration. It needs approved partner credentials and restaurant location mapping before it can be enabled.",
  },
  functions: {
    beginConnection: declare({
      level: "lifecycle",
      credential: "none",
      accountBoundary: "none",
      outcome: "unsupported",
      prerequisite: TOAST_NO_REDIRECT,
    }),
    completeConnection: declare({
      level: "lifecycle",
      credential: "none",
      accountBoundary: "none",
      outcome: "unsupported",
      prerequisite: TOAST_NO_REDIRECT,
    }),
    verifyAccessibleAccounts: declare({
      level: "lifecycle",
      credential: "partner_client_credentials_token",
      accountBoundary: "single_location",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: `${TOAST_PARTNER_APPROVAL_MISSING} ${TOAST_LOCATION_MAPPING_MISSING}`,
    }),
    probeCapabilities: declare({
      level: "observation",
      credential: "partner_client_credentials_token",
      accountBoundary: "single_location",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: `${TOAST_PARTNER_APPROVAL_MISSING} The distinction between a restaurant payment record and independently confirmed processor settlement is also unvalidated.`,
    }),
    refreshAuthorizationIfSupported: declare({
      level: "lifecycle",
      credential: "partner_client_credentials_token",
      accountBoundary: "operator_application",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: `${TOAST_PARTNER_APPROVAL_MISSING} A client-credentials lifecycle is not the refresh-token lifecycle used by the other adapters and is never copied from them.`,
    }),
    ensureOwnedEventSubscriptionIfSupported: declare({
      level: "lifecycle",
      credential: "partner_client_credentials_token",
      accountBoundary: "single_location",
      outcome: "unsupported",
      prerequisite:
        "No event delivery path has been established or verified for Toast, and none is assumed to exist by analogy with another provider.",
    }),
    verifyAndParseEvent: declare({
      level: "observation",
      credential: "webhook_signing_secret",
      accountBoundary: "single_location",
      outcome: "unsupported",
      prerequisite: "No signed event path is established, so no Toast payload may be trusted.",
    }),
    listPaymentsPage: declare({
      level: "observation",
      credential: "partner_client_credentials_token",
      accountBoundary: "single_location",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: `${TOAST_PARTNER_APPROVAL_MISSING} ${TOAST_LOCATION_MAPPING_MISSING}`,
    }),
    retrievePaymentEvidence: declare({
      level: "observation",
      credential: "partner_client_credentials_token",
      accountBoundary: "single_location",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite:
        "Tenders, refunds, voids, partial payments, tips, and timing are unvalidated, so no Toast record could yet be classified as processor confirmed.",
    }),
    listAdjustmentsPage: declare({
      level: "observation",
      credential: "partner_client_credentials_token",
      accountBoundary: "single_location",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: `${TOAST_PARTNER_APPROVAL_MISSING} Void and refund semantics differ from a card processor's and are unvalidated.`,
    }),
    createOrderLinkedPaymentRequestIfSupported: declare({
      level: "collection",
      credential: "none",
      accountBoundary: "single_location",
      outcome: "unsupported",
      prerequisite:
        "Collection through Toast is not in scope. Toast is deferred until customer demand, provider approval, location binding, and financial semantics are confirmed.",
    }),
    revokeConnectionIfSupported: declare({
      level: "lifecycle",
      credential: "partner_client_credentials_token",
      accountBoundary: "single_location",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: `${TOAST_PARTNER_APPROVAL_MISSING} Disabling an approved partner integration happens on the restaurant's side and is not an Obavia revocation.`,
    }),
  },
});
