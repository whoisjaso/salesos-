/**
 * Whop adapter shell. Specification 13.2 and 19 step D: Whop is the SECOND
 * adapter, after Stripe is proven. Nothing exists for it here.
 *
 * OFFLINE AND SANDBOX ONLY. No network request, no Whop SDK import, no
 * endpoint, no scope name, no helper method name. Specification 13.2 is
 * explicit that some Whop documentation mixes current and legacy examples and
 * that a documented helper may not exist in the installed release, so no method
 * is referenced here on the strength of a name.
 *
 * The refusal that matters most: an ordinary buyer sign-in is not authorization
 * to read a seller's business. Basic identity access is not merchant payment
 * access, and this adapter never treats one as the other (scenario 28).
 *
 * Before any body is written here:
 * - A Whop development application, with a business-scoped grant proven on a
 *   separate business, not a personal account.
 * - The actual account identity and grant recorded, not just a user id or email.
 * - Payment listing and retrieval verified for that account and only that account.
 * - Whether the supported grant carries background access at all. If it is
 *   login-only, background sync stays unavailable rather than being faked.
 * - API and webhook version pins, with test payloads run against those pins.
 */
import { declare, makeAdapter } from "./shell";
import type { PaymentProviderAdapter } from "./types";

const WHOP_APPLICATION_MISSING =
  "No Whop development application exists in this environment, so there is nothing to authorize against.";
const WHOP_SCOPE_UNPROVEN =
  "The business-scoped grant and its exact permissions have not been proven. An identity sign-in is not merchant payment authorization.";
const WHOP_VERSION_UNPINNED =
  "No API or webhook version is pinned, and the installed release has not been inspected for the functions this would need.";

export const whopAdapter: PaymentProviderAdapter = makeAdapter({
  providerId: "whop",
  displayName: "Whop",
  availability: {
    state: "unavailable",
    implementationState: "absent",
    blockedBy: "not_built",
    reason:
      "Whop is the planned second adapter. No development application, no business-scoped grant, and no proven payment or event permissions exist here.",
  },
  functions: {
    beginConnection: declare({
      level: "lifecycle",
      credential: "operator_client_credentials",
      accountBoundary: "operator_application",
      prerequisite: `${WHOP_APPLICATION_MISSING} The account-scoped authorization path and its PKCE requirements must be confirmed first.`,
    }),
    completeConnection: declare({
      level: "lifecycle",
      credential: "oauth_authorization_code_exchange",
      accountBoundary: "single_merchant_account",
      prerequisite: `${WHOP_APPLICATION_MISSING} The authorizing person's role on the selected business must be confirmed before any binding.`,
    }),
    verifyAccessibleAccounts: declare({
      level: "lifecycle",
      credential: "oauth_access_token",
      accountBoundary: "single_merchant_account",
      prerequisite: `${WHOP_SCOPE_UNPROVEN} Only the owner-confirmed business may ever be ingested.`,
    }),
    probeCapabilities: declare({
      level: "observation",
      credential: "oauth_access_token",
      accountBoundary: "single_merchant_account",
      prerequisite: WHOP_SCOPE_UNPROVEN,
    }),
    refreshAuthorizationIfSupported: declare({
      level: "lifecycle",
      credential: "oauth_refresh_token",
      accountBoundary: "single_merchant_account",
      prerequisite:
        "The background-authorization lifecycle is undetermined. If the supported grant is login-only, background sync stays unavailable rather than being presented as permanent company access.",
    }),
    ensureOwnedEventSubscriptionIfSupported: declare({
      level: "lifecycle",
      credential: "oauth_access_token",
      accountBoundary: "single_merchant_account",
      prerequisite: `${WHOP_SCOPE_UNPROVEN} Successful profile access is not evidence that this grant may configure events.`,
    }),
    verifyAndParseEvent: declare({
      level: "observation",
      credential: "webhook_signing_secret",
      accountBoundary: "single_merchant_account",
      prerequisite: `${WHOP_VERSION_UNPINNED} No signing secret is held, so no payload may be trusted.`,
    }),
    listPaymentsPage: declare({
      level: "observation",
      credential: "oauth_access_token",
      accountBoundary: "single_merchant_account",
      prerequisite: `${WHOP_SCOPE_UNPROVEN} ${WHOP_VERSION_UNPINNED}`,
    }),
    retrievePaymentEvidence: declare({
      level: "observation",
      credential: "oauth_access_token",
      accountBoundary: "single_merchant_account",
      prerequisite: `${WHOP_SCOPE_UNPROVEN} ${WHOP_VERSION_UNPINNED}`,
    }),
    listAdjustmentsPage: declare({
      level: "observation",
      credential: "oauth_access_token",
      accountBoundary: "single_merchant_account",
      prerequisite: `${WHOP_SCOPE_UNPROVEN} Refund and dispute coverage has not been established for this provider.`,
    }),
    createOrderLinkedPaymentRequestIfSupported: declare({
      level: "collection",
      credential: "oauth_access_token",
      accountBoundary: "single_merchant_account",
      blockedBy: "owner_decision",
      prerequisite:
        "Level B is optional and separately approved. A creator declining the optional collection permission leaves observation working and this unavailable.",
    }),
    revokeConnectionIfSupported: declare({
      level: "lifecycle",
      credential: "oauth_access_token",
      accountBoundary: "single_merchant_account",
      prerequisite: `${WHOP_APPLICATION_MISSING} Ordinary Obavia sign-out is not merchant disconnection and is never treated as one.`,
    }),
  },
});
