/**
 * Stripe adapter shell. Specification 13.1 and 19 step B: Stripe Apps OAuth is
 * the FIRST CANDIDATE for reading an existing merchant's Stripe activity, and
 * it is unproven here.
 *
 * OFFLINE AND SANDBOX ONLY. This file contains no network request, no Stripe
 * SDK import, no endpoint path, no OAuth URL, and no permission name that
 * Stripe returned. Every function returns `requires_setup` with the specific
 * thing that is missing.
 *
 * What would have to be true before any body is written here, from the
 * specification and the payments audit, none of it done:
 * - An Obavia Stripe app registered with operator-owned credentials.
 * - The install route proven against a separate merchant test account, not
 *   Obavia's own account.
 * - App review and publication, because a public install link requires it and
 *   production use of an external-test link is forbidden (scenario 38).
 * - The exact read permissions for the objects actually used, verified against
 *   the live permissions catalog and the installed package, never pasted from a
 *   documentation example.
 * - An app webhook destination and the event-read permission for the events
 *   actually consumed.
 *
 * Connect OAuth is a different mechanism with a different authorization model.
 * Its token handling is not copied into this file, and this file is not copied
 * into a Connect integration.
 */
import { declare, makeAdapter } from "./shell";
import type { PaymentProviderAdapter } from "./types";

const STRIPE_REGISTRATION_MISSING =
  "No Obavia Stripe app registration exists in this environment, so there is no application to authorize against.";
const STRIPE_PUBLICATION_MISSING =
  "A public install link requires app review and publication. An external-test link is not a production substitute.";
const STRIPE_PERMISSIONS_UNVERIFIED =
  "The permissions this needs have not been verified against a real grant on a merchant test account.";
const STRIPE_EVENTS_UNVERIFIED =
  "No app webhook destination exists and the event-read path has not been verified.";

export const stripeAdapter: PaymentProviderAdapter = makeAdapter({
  providerId: "stripe",
  displayName: "Stripe",
  availability: {
    state: "unavailable",
    implementationState: "blocked_by_provider_access",
    blockedBy: "provider_access",
    reason:
      "Stripe Apps OAuth is the first candidate and is not proven here. No app registration, no install link, and no verified permissions exist in this environment.",
  },
  functions: {
    beginConnection: declare({
      level: "lifecycle",
      credential: "operator_client_credentials",
      accountBoundary: "operator_application",
      implementationState: "awaiting_publication",
      blockedBy: "provider_review",
      prerequisite: `${STRIPE_REGISTRATION_MISSING} ${STRIPE_PUBLICATION_MISSING}`,
    }),
    completeConnection: declare({
      level: "lifecycle",
      credential: "oauth_authorization_code_exchange",
      accountBoundary: "single_merchant_account",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: `${STRIPE_REGISTRATION_MISSING} The code exchange must run server-side exactly once and bind one merchant account and environment.`,
    }),
    verifyAccessibleAccounts: declare({
      level: "lifecycle",
      credential: "app_install_token",
      accountBoundary: "single_merchant_account",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite:
        "An install on a platform account is not access to that platform's connected merchants, so the accessible set must be read and confirmed by the owner, not assumed.",
    }),
    probeCapabilities: declare({
      level: "observation",
      credential: "app_install_token",
      accountBoundary: "single_merchant_account",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: STRIPE_PERMISSIONS_UNVERIFIED,
    }),
    refreshAuthorizationIfSupported: declare({
      level: "lifecycle",
      credential: "oauth_refresh_token",
      accountBoundary: "single_merchant_account",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: `${STRIPE_REGISTRATION_MISSING} Rotation needs a connection-level lock so two workers cannot overwrite a new refresh token with an old one.`,
    }),
    ensureOwnedEventSubscriptionIfSupported: declare({
      level: "lifecycle",
      credential: "operator_client_credentials",
      accountBoundary: "operator_application",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: `${STRIPE_EVENTS_UNVERIFIED} Only an Obavia-owned destination may ever be created or removed.`,
    }),
    verifyAndParseEvent: declare({
      level: "observation",
      credential: "webhook_signing_secret",
      accountBoundary: "single_merchant_account",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: `${STRIPE_EVENTS_UNVERIFIED} No signing secret is held, so no signature can be verified and no payload may be trusted.`,
    }),
    listPaymentsPage: declare({
      level: "observation",
      credential: "app_install_token",
      accountBoundary: "single_merchant_account",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: STRIPE_PERMISSIONS_UNVERIFIED,
    }),
    retrievePaymentEvidence: declare({
      level: "observation",
      credential: "app_install_token",
      accountBoundary: "single_merchant_account",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: `${STRIPE_PERMISSIONS_UNVERIFIED} Permission for one event does not imply access to every expanded related object.`,
    }),
    listAdjustmentsPage: declare({
      level: "observation",
      credential: "app_install_token",
      accountBoundary: "single_merchant_account",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: `${STRIPE_PERMISSIONS_UNVERIFIED} Refund and dispute reads are separate permissions from payment reads.`,
    }),
    createOrderLinkedPaymentRequestIfSupported: declare({
      level: "collection",
      credential: "app_install_token",
      accountBoundary: "single_merchant_account",
      implementationState: "blocked_by_provider_access",
      blockedBy: "owner_decision",
      prerequisite:
        "Level B is a separate capability and a separate permission decision, and the owner has not approved a collection policy. Tracking payments does not grant it.",
    }),
    revokeConnectionIfSupported: declare({
      level: "lifecycle",
      credential: "operator_client_credentials",
      accountBoundary: "single_merchant_account",
      implementationState: "blocked_by_provider_access",
      blockedBy: "provider_access",
      prerequisite: `${STRIPE_REGISTRATION_MISSING} Obavia must stop using a token immediately on disconnect even where the provider cannot invalidate it instantly.`,
    }),
  },
});
