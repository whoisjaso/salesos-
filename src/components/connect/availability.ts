/**
 * What the Connect surfaces are allowed to SAY about a provider.
 *
 * Whether a provider may be connected at all is not decided here. That is
 * `availabilityOf` and `canConnect` in `src/domain/integrations.ts`, backed by
 * `canOfferConnect` in `src/domain/connections.ts`. This module is the screen's
 * side of that one decision: the affordance, the headings, and the sentences
 * that keep a permission list from reading as a grant.
 *
 * Source: OBAVIA_Simple_UX_and_Verified_Payment_Attribution_v2.md section 12.1
 * ("Show active Connect buttons only for providers whose onboarding path is
 * actually available in the current environment. A provider awaiting approval
 * should say Request connection, not open a simulated authorization success
 * screen") and section 14.3; docs/PAYMENTS_AUDIT.md H1 and H8.
 *
 * The brand mark is never gated. The mark is identity, the affordance is a
 * claim, and only the claim is gated.
 *
 * Pure. No React, no fetch, no Date.now().
 */
import { availabilityOf, canConnect, isPaymentsProvider, type IntegrationProvider } from "@/domain/integrations";

/** Where this build runs. Every state a person reads says so. */
export const CONNECT_ENVIRONMENT = "sandbox" as const;

/** One short sentence, shown once on the screen and again in every sheet. */
export const SANDBOX_NOTE = "Sandbox build. No provider has been contacted from here.";

/**
 * The spreadsheet is not a provider and has no onboarding path to be available
 * or unavailable. It is a file the owner picks, read by `src/domain/migration.ts`
 * in this browser. It therefore sits outside the provider-availability axis, and
 * it is the one affordance on this screen that really completes.
 */
export const FILE_IMPORT_PROVIDER_ID = "csv";

/** What the owner may press. There is no simulated grant among them. */
export type ConnectAction = "connect" | "upload_file" | "request_connection";

/**
 * Everything the Connect surfaces may say about one provider. Every state
 * carries a text label and an icon name, so no state is carried by colour alone.
 */
export interface ProviderConnectView {
  /** True only when the domain says a real onboarding path exists here. */
  canConnect: boolean;
  action: ConnectAction;
  actionLabel: string;
  /** The state a person reads, in words. */
  statusLabel: string;
  /** Phosphor icon name paired with the label. */
  statusIcon: string;
  /**
   * The line under the provider name. For anything that cannot be connected this
   * is the availability reason, never the catalog one-liner: a one-liner is a
   * capability promise in the present tense and is only true of a connection
   * that exists.
   */
  subtitle: string;
  /** Heading over the permission list. Nothing is ever headed "Granted" here. */
  permissionsHeading: string;
  /** One sentence under that list, so the list cannot be read as a grant. */
  permissionsNote: string;
  /** Heading over the setup steps. */
  setupHeading: string;
  /** Webhook and link snippets stay visible, always with this caveat. */
  snippetCaveat?: string;
  /** What pressing the action actually does, said before it is pressed. */
  actionEffect: string;
}

export function connectViewFor(p: IntegrationProvider): ProviderConnectView {
  if (p.providerId === FILE_IMPORT_PROVIDER_ID) {
    return {
      canConnect: false,
      action: "upload_file",
      actionLabel: "Upload file",
      statusLabel: "File import",
      statusIcon: "UploadSimple",
      subtitle: "Reads a file you choose. Runs in this app and contacts no provider.",
      permissionsHeading: "What this reads",
      permissionsNote: "Only the file you pick. Nothing is sent anywhere.",
      setupHeading: "Setup",
      actionEffect: "Matches the columns in this browser. No row is written until you confirm the dry run.",
    };
  }

  if (canConnect(p)) {
    return {
      canConnect: true,
      action: "connect",
      actionLabel: `Connect with ${p.name}`,
      statusLabel: "Not connected",
      statusIcon: "Plugs",
      subtitle: p.oneLiner,
      permissionsHeading: "What Obavia will request",
      permissionsNote: `${p.name} decides what to grant. What it actually grants is recorded separately from what was asked for.`,
      setupHeading: "Setup",
      actionEffect: `${p.name} has an onboarding path, but the authorization step is not wired into this screen yet. Nothing here will contact ${p.name}.`,
    };
  }

  const availability = availabilityOf(p);
  const isWebhookLike = p.auth === "webhook" || p.auth === "none";
  return {
    canConnect: false,
    action: "request_connection",
    actionLabel: "Request connection",
    // Specification 14.3, "Partner approval needed": Connection requires setup.
    statusLabel: "Connection requires setup",
    statusIcon: "Wrench",
    subtitle: availability.reason,
    permissionsHeading: p.permissions.length > 0 ? "What a connection would request" : "What a connection would do",
    permissionsNote: `Nothing below has been requested from ${p.name}, and nothing has been granted.`,
    setupHeading: "What setup would involve",
    snippetCaveat: isWebhookLike
      ? "Preview only. The endpoint that would receive this is not built in this build."
      : undefined,
    actionEffect: `Records your interest on this device. Nothing is sent to ${p.name}.`,
  };
}

/**
 * Whether any payments provider has a proven onboarding path here. The screens
 * that would otherwise call a zero "verified" read this: with no payment
 * provider reachable anywhere, a zero rests on the ledger this build was seeded
 * with and on nothing else (docs/PAYMENTS_AUDIT.md H8).
 */
export function anyPaymentsProviderAvailable(providers: IntegrationProvider[]): boolean {
  return providers.some((p) => isPaymentsProvider(p) && canConnect(p));
}
