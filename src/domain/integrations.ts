/**
 * Integration provider registry: what an owner can connect, how it authorizes, what it feeds.
 * Source: docs/spec/04_INTEGRATIONS_AND_AUTOMATIC_TRACKING.md, docs/DECISIONS.md ("Leads from anywhere, one intake").
 *
 * The connect flow is modeled as OAuth where the provider supports it. Real provider app credentials
 * and redirect URIs are an owner decision (D04). Until then the SimulatedAuthorizer stands in.
 *
 * Amended after the payments audit: "OAuth first" means OAuth first WHERE THE PROVIDER'S ONBOARDING
 * PATH IS ACTUALLY AVAILABLE IN THIS ENVIRONMENT; otherwise Request connection. Every row carries an
 * `availability` record, the default is `unavailable`, and `canConnect()` is the only thing a Connect
 * affordance may be gated on. The SimulatedAuthorizer refuses every payments provider outright: a
 * simulated grant must never stand behind a money figure (specification 12.1).
 * Logos: Simple Icons slugs (CC0), rendered from https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/<slug>.svg
 */
import type { EntryPath, Id, ISODateTime } from "./types";
import type { ProviderAvailabilityRecord } from "./connections";
import { canOfferConnect } from "./connections";

/**
 * How a provider would authorize. `partner` is an approval-gated backend
 * connection (partner credentials plus the customer enabling the integration on
 * the provider's side). It is deliberately NOT `oauth`: it has no owner-facing
 * authorization redirect, so it must never be rendered as one.
 */
export type AuthMethod = "oauth" | "api_key" | "webhook" | "partner" | "none";
export type Feed = "leads" | "bookings" | "calls" | "meetings" | "payments" | "messages" | "contracts";

export type LogoMode = "mask" | "image" | "icon";

export interface IntegrationProvider {
  providerId: string;
  name: string;
  category: "ads" | "social" | "calendar" | "forms_pages" | "crm" | "telephony" | "meetings" | "payments" | "automation" | "other";
  logoSlug: string; // simple-icons slug
  /**
   * Where the mark comes from when Simple Icons has none.
   * mask: monochrome silhouette painted in brand color (Simple Icons default).
   * image: full-color logo rendered as-is (official favicon or color SVG).
   * icon: not a brand; render a generic Phosphor icon.
   */
  logo?: { mode: LogoMode; url?: string };
  brandColor: string; // hex, from simple-icons
  auth: AuthMethod;
  feeds: Feed[];
  entryPathDefault: EntryPath;
  /** What the owner authorizes, in plain words, max 4 items. */
  permissions: string[];
  /** Max 3 steps, each under 8 words. */
  setup: string[];
  oneLiner: string; // max 8 words
  popular?: boolean;
  /**
   * Whether an onboarding path for this provider actually exists in this
   * environment. Omitted means DEFAULT_PROVIDER_AVAILABILITY, which is
   * `unavailable`: nothing is built until a row says otherwise and names its
   * evidence. A Connect affordance is legal only when `canConnect(p)` is true.
   */
  availability?: ProviderAvailabilityRecord;
}

export const PROVIDERS: IntegrationProvider[] = [
  { providerId: "meta_ads", name: "Meta Ads", category: "ads", logoSlug: "meta", brandColor: "#0467DF", auth: "oauth", feeds: ["leads"], entryPathDefault: "form_entry", permissions: ["Read lead form submissions", "Read campaign and ad names"], setup: ["Tap Connect", "Approve in Meta", "Pick your pages"], oneLiner: "Instant leads from Facebook and Instagram ads", popular: true },
  { providerId: "instagram", name: "Instagram", category: "social", logoSlug: "instagram", brandColor: "#FF0069", auth: "oauth", feeds: ["messages", "leads"], entryPathDefault: "form_entry", permissions: ["Read DMs sent to your account", "Reply on your behalf"], setup: ["Tap Connect", "Approve in Instagram"], oneLiner: "DMs become leads with one tap", popular: true },
  { providerId: "google_ads", name: "Google Ads", category: "ads", logoSlug: "googleads", brandColor: "#4285F4", auth: "oauth", feeds: ["leads"], entryPathDefault: "form_entry", permissions: ["Read lead form extensions", "Read campaign names"], setup: ["Tap Connect", "Approve in Google", "Pick your account"], oneLiner: "Lead form extensions land instantly", popular: true },
  { providerId: "tiktok_ads", name: "TikTok Ads", category: "ads", logoSlug: "tiktok", brandColor: "#000000", auth: "oauth", feeds: ["leads"], entryPathDefault: "form_entry", permissions: ["Read instant form leads"], setup: ["Tap Connect", "Approve in TikTok"], oneLiner: "Instant form leads from TikTok" },
  { providerId: "youtube", name: "YouTube", category: "social", logoSlug: "youtube", brandColor: "#FF0000", auth: "oauth", feeds: ["leads"], entryPathDefault: "form_entry", permissions: ["Read lead forms on video campaigns"], setup: ["Tap Connect", "Approve in Google"], oneLiner: "Video campaign leads" },
  { providerId: "calendly", name: "Calendly", category: "calendar", logoSlug: "calendly", brandColor: "#006BFF", auth: "oauth", feeds: ["bookings"], entryPathDefault: "booked_entry", permissions: ["Read scheduled events", "Read invitee details"], setup: ["Tap Connect", "Approve in Calendly"], oneLiner: "Bookings go straight to a closer", popular: true },
  { providerId: "cal_com", name: "Cal.com", category: "calendar", logoSlug: "caldotcom", brandColor: "#292929", auth: "api_key", feeds: ["bookings"], entryPathDefault: "booked_entry", permissions: ["Read bookings"], setup: ["Paste API key", "Pick event types"], oneLiner: "Open-source scheduling, same result" },
  { providerId: "google_calendar", name: "Google Calendar", category: "calendar", logoSlug: "googlecalendar", brandColor: "#4285F4", auth: "oauth", feeds: ["bookings", "meetings"], entryPathDefault: "booked_entry", permissions: ["Read events", "Create appointments you book"], setup: ["Tap Connect", "Approve in Google"], oneLiner: "Your reps' calendars, live", popular: true },
  { providerId: "gohighlevel", logo: { mode: "image", url: "https://www.google.com/s2/favicons?domain=gohighlevel.com&sz=128" }, name: "GoHighLevel", category: "crm", logoSlug: "gohighlevel", brandColor: "#2C7BE5", auth: "oauth", feeds: ["leads", "bookings", "messages"], entryPathDefault: "form_entry", permissions: ["Read contacts and opportunities", "Read calendar bookings"], setup: ["Tap Connect", "Approve in GHL", "Pick a location"], oneLiner: "Funnels and bookings from GHL" },
  { providerId: "hubspot", name: "HubSpot", category: "crm", logoSlug: "hubspot", brandColor: "#FF7A59", auth: "oauth", feeds: ["leads", "contracts"], entryPathDefault: "form_entry", permissions: ["Read contacts and forms", "Read deals"], setup: ["Tap Connect", "Approve in HubSpot"], oneLiner: "Forms and deals from HubSpot" },
  { providerId: "salesforce", name: "Salesforce", category: "crm", logoSlug: "salesforce", brandColor: "#00A1E0", auth: "oauth", feeds: ["leads", "contracts"], entryPathDefault: "form_entry", permissions: ["Read leads, contacts, and opportunities", "Read activities"], setup: ["Tap Connect", "Approve in Salesforce"], oneLiner: "Bring your Salesforce history over" },
  { providerId: "pipedrive", logo: { mode: "image", url: "https://www.google.com/s2/favicons?domain=pipedrive.com&sz=128" }, name: "Pipedrive", category: "crm", logoSlug: "pipedrive", brandColor: "#017737", auth: "oauth", feeds: ["leads", "contracts"], entryPathDefault: "form_entry", permissions: ["Read persons and deals", "Read activities"], setup: ["Tap Connect", "Approve in Pipedrive"], oneLiner: "Persons and deals, synced" },
  { providerId: "zoho", name: "Zoho CRM", category: "crm", logoSlug: "zoho", brandColor: "#E42527", auth: "oauth", feeds: ["leads", "calls", "contracts"], entryPathDefault: "form_entry", permissions: ["Read leads, contacts, and deals", "Read call logs"], setup: ["Tap Connect", "Approve in Zoho"], oneLiner: "Leads, deals, and calls from Zoho" },
  { providerId: "close", logo: { mode: "image", url: "https://cdn.jsdelivr.net/gh/gilbarbara/logos/logos/close.svg" }, name: "Close", category: "crm", logoSlug: "close", brandColor: "#1463FF", auth: "oauth", feeds: ["leads", "calls"], entryPathDefault: "form_entry", permissions: ["Read leads and opportunities", "Read call activity"], setup: ["Tap Connect", "Approve in Close"], oneLiner: "Leads and calls from Close" },
  { providerId: "typeform", name: "Typeform", category: "forms_pages", logoSlug: "typeform", brandColor: "#262627", auth: "oauth", feeds: ["leads"], entryPathDefault: "form_entry", permissions: ["Read form responses"], setup: ["Tap Connect", "Pick a form"], oneLiner: "Every response is a lead" },
  { providerId: "webflow", name: "Webflow", category: "forms_pages", logoSlug: "webflow", brandColor: "#146EF5", auth: "oauth", feeds: ["leads"], entryPathDefault: "form_entry", permissions: ["Read form submissions"], setup: ["Tap Connect", "Approve in Webflow", "Pick a site"], oneLiner: "Landing page forms, no code" },
  { providerId: "clickfunnels", logo: { mode: "image", url: "https://www.google.com/s2/favicons?domain=clickfunnels.com&sz=128" }, name: "ClickFunnels", category: "forms_pages", logoSlug: "clickfunnels", brandColor: "#1E63EF", auth: "webhook", feeds: ["leads"], entryPathDefault: "form_entry", permissions: ["Send opt-ins to Sales OS"], setup: ["Copy the webhook URL", "Paste in your funnel"], oneLiner: "VSL opt-ins in real time" },
  { providerId: "landing_page", name: "Any landing page", category: "forms_pages", logoSlug: "html5", brandColor: "#E34F26", auth: "webhook", feeds: ["leads"], entryPathDefault: "form_entry", permissions: ["Send form posts to Sales OS"], setup: ["Copy one line of code", "Paste in your form"], oneLiner: "Works with any page or VSL", popular: true },
  { providerId: "twilio", name: "Twilio", category: "telephony", logoSlug: "twilio", brandColor: "#F22F46", auth: "api_key", feeds: ["calls", "messages"], entryPathDefault: "form_entry", permissions: ["Place and record calls from your number", "Send and receive texts"], setup: ["Paste account SID and token", "Pick your number"], oneLiner: "Your business number, in the dialer", popular: true },
  { providerId: "zoom", name: "Zoom", category: "meetings", logoSlug: "zoom", brandColor: "#0B5CFF", auth: "oauth", feeds: ["meetings"], entryPathDefault: "booked_entry", permissions: ["Read meeting participants and join times", "Read recordings you allow"], setup: ["Tap Connect", "Approve in Zoom"], oneLiner: "Proves who showed up" },
  { providerId: "google_meet", name: "Google Meet", category: "meetings", logoSlug: "googlemeet", brandColor: "#00897B", auth: "oauth", feeds: ["meetings"], entryPathDefault: "booked_entry", permissions: ["Read meeting attendance"], setup: ["Tap Connect", "Approve in Google"], oneLiner: "Attendance from Meet" },
  // Payments. Stripe is the first candidate and is unproven; Whop is second and absent; Toast is
  // partner-gated. None of the three may present a Connect affordance. The permission strings below
  // are Obavia's own wording for what it would ask for, never a grant a provider returned.
  { providerId: "stripe", name: "Stripe", category: "payments", logoSlug: "stripe", brandColor: "#635BFF", auth: "oauth", feeds: ["payments"], entryPathDefault: "form_entry", permissions: ["Read payments, refunds, and disputes"], setup: ["Request connection", "An operator follows up"], oneLiner: "Payment tracking, once connected", popular: true,
    availability: { state: "unavailable", implementationState: "blocked_by_provider_access", blockedBy: "provider_access",
      reason: "Payment access is not proven here. Nothing in this build has read a payment, a refund or a dispute from a provider. Stripe Apps OAuth is the first candidate: no app registration, no install link and no verified permissions exist in this environment." } },
  { providerId: "whop", logo: { mode: "image", url: "https://www.google.com/s2/favicons?domain=whop.com&sz=128" }, name: "Whop", category: "payments", logoSlug: "whop", brandColor: "#7BA4F0" /* neutral placeholder: no verified brand token on hand */, auth: "oauth", feeds: ["payments"], entryPathDefault: "form_entry", permissions: ["Read payments for one business"], setup: ["Request connection", "An operator follows up"], oneLiner: "Planned second payment adapter",
    availability: { state: "unavailable", implementationState: "absent", blockedBy: "not_built",
      reason: "Whop is the planned second adapter. No development application, no business-scoped grant, and no proven payment or event permissions exist here. An identity sign-in would not be merchant payment authorization." } },
  { providerId: "toast", logo: { mode: "image", url: "https://www.google.com/s2/favicons?domain=toasttab.com&sz=128" }, name: "Toast", category: "payments", logoSlug: "toast", brandColor: "#7BA4F0" /* neutral placeholder: no verified brand token on hand */, auth: "partner", feeds: ["payments"], entryPathDefault: "form_entry", permissions: ["Read restaurant payment records"], setup: ["Request connection", "An operator follows up"], oneLiner: "Partner approval needed first",
    availability: { state: "request_connection", implementationState: "blocked_by_provider_access", blockedBy: "provider_access",
      reason: "Toast is a partner-gated integration. It needs approved partner credentials and restaurant location mapping before it can be enabled, and its check records are not processor-confirmed settlement." } },
  { providerId: "docusign", logo: { mode: "image", url: "https://www.google.com/s2/favicons?domain=docusign.com&sz=128" }, name: "DocuSign", category: "other", logoSlug: "docusign", brandColor: "#FFB805", auth: "oauth", feeds: ["contracts"], entryPathDefault: "form_entry", permissions: ["Read envelope status"], setup: ["Tap Connect", "Approve in DocuSign"], oneLiner: "Signed means signed" },
  { providerId: "zapier", name: "Zapier", category: "automation", logoSlug: "zapier", brandColor: "#FF4F00", auth: "webhook", feeds: ["leads", "bookings"], entryPathDefault: "form_entry", permissions: ["Send any Zap to Sales OS"], setup: ["Copy the webhook URL", "Add a Webhooks step"], oneLiner: "Anything Zapier can reach" },
  { providerId: "make", name: "Make", category: "automation", logoSlug: "make", brandColor: "#6D00CC", auth: "webhook", feeds: ["leads", "bookings"], entryPathDefault: "form_entry", permissions: ["Send any scenario to Sales OS"], setup: ["Copy the webhook URL", "Add an HTTP module"], oneLiner: "Anything Make can reach" },
  { providerId: "share_link", logo: { mode: "icon" }, name: "Share link", category: "other", logoSlug: "link", brandColor: "#7BA4F0", auth: "none", feeds: ["leads"], entryPathDefault: "form_entry", permissions: [], setup: ["Copy your link", "Send it anywhere"], oneLiner: "Organic, referrals, walk-ins" },
  { providerId: "csv", name: "Spreadsheet", category: "other", logoSlug: "googlesheets", brandColor: "#34A853", auth: "none", feeds: ["leads"], entryPathDefault: "form_entry", permissions: [], setup: ["Upload a file", "Match the columns"], oneLiner: "Bring an old list in" },
];

export const providerById = Object.fromEntries(PROVIDERS.map((p) => [p.providerId, p])) as Record<string, IntegrationProvider>;

/**
 * The honest default. Nothing in this repository has a proven onboarding path:
 * there is no provider app registration, no token exchange, and no outbound
 * network call anywhere in src/. A row earns a different availability by naming
 * what was proven, never by omission.
 */
export const DEFAULT_PROVIDER_AVAILABILITY: ProviderAvailabilityRecord = {
  state: "unavailable",
  implementationState: "absent",
  blockedBy: "not_built",
  reason: "No onboarding path for this provider is implemented in this environment.",
};

export function availabilityOf(p: IntegrationProvider): ProviderAvailabilityRecord {
  return p.availability ?? DEFAULT_PROVIDER_AVAILABILITY;
}

/**
 * The only gate a Connect affordance may use. A provider that is not available
 * renders its real logo with Request connection, never a Connect button and
 * never a simulated authorization screen (specification 12.1).
 */
export function canConnect(p: IntegrationProvider): boolean {
  return canOfferConnect(availabilityOf(p));
}

/** Providers that carry money. These may never reach the simulated authorizer. */
export function isPaymentsProvider(p: IntegrationProvider): boolean {
  return p.category === "payments" || p.feeds.includes("payments");
}

export const SIMULATED_AUTHORIZER_PAYMENTS_REFUSAL =
  "A payments provider cannot be authorized by the simulated authorizer. A simulated grant must never stand behind a money figure. Use Request connection until a real provider path is proven.";

export function logoUrl(p: IntegrationProvider): string {
  if (p.logo?.url) return p.logo.url;
  return `https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/${p.logoSlug}.svg`;
}

export function logoMode(p: IntegrationProvider): LogoMode {
  return p.logo?.mode ?? "mask";
}

export const CATEGORY_LABEL: Record<IntegrationProvider["category"], string> = {
  ads: "Ads",
  social: "Social",
  calendar: "Calendars",
  forms_pages: "Pages and forms",
  crm: "CRMs",
  telephony: "Phone",
  meetings: "Meetings",
  payments: "Payments",
  automation: "Automation",
  other: "More",
};

// ---------- Connection lifecycle ----------

/**
 * The screen-level connection state for lead and booking sources. It is NOT the
 * integration model, and it is never evidence that payment tracking works:
 * specification 14.3 forbids a single flat value from standing for a
 * connection. Anything that touches money derives its state from the three axes
 * in connections.ts (`deriveConnectionStatus`) against a persisted
 * ProviderConnectionRecord and its capability contract.
 */
export type ConnectionStatus = "not_connected" | "authorizing" | "connected" | "error" | "paused";

export interface ProviderConnection {
  tenantId: Id;
  connectionId: Id;
  providerId: string;
  status: ConnectionStatus;
  accountLabel?: string; // e.g. "Obavia Page", "acct_1234"
  /**
   * What Obavia asked for. Recorded separately from what was granted and never
   * assumed equal: the registry's `permissions` strings are Obavia's own wording
   * for a request, not a provider response (specification 14.2 step 4).
   */
  requestedPermissions?: string[];
  /** What the provider actually granted. Only a provider response belongs here. */
  grantedPermissions: string[];
  connectedAt?: ISODateTime;
  lastEventAt?: ISODateTime;
  eventCount: number;
  error?: string;
}

export interface AuthorizeRequest {
  tenantId: Id;
  providerId: string;
  redirectUri: string;
  state: string; // CSRF token, generated by the app, never by the provider
}

export interface AuthorizeResult {
  ok: boolean;
  accountLabel?: string;
  /** What was asked for. Kept beside the grant so a shortfall is visible. */
  requestedPermissions?: string[];
  /** What the provider returned. Never the request echoed back. */
  grantedPermissions?: string[];
  error?: string;
  /**
   * Machine-readable refusal, so a caller cannot read a refusal as a success.
   * Only the payments refusal sets it today: the two pre-existing refusal shapes
   * ("Unknown provider", "Invalid code") are asserted byte for byte by
   * src/domain/__tests__/crmSync.test.ts, which this change deliberately leaves
   * untouched rather than weakening. Widening them is a separate, visible edit.
   */
  refusalCode?: "payments_simulation_refused" | "unknown_provider" | "invalid_code" | "provider_unavailable";
}

/** Real implementations open the provider's consent screen and exchange the code server-side. */
export interface Authorizer {
  /**
   * Returns the provider's consent URL. An authorizer that refuses this request
   * returns an empty url and a reason; a caller must check `refusedReason`
   * before treating the url as a destination.
   */
  begin(req: AuthorizeRequest): { url: string; refusedReason?: string };
  complete(req: AuthorizeRequest, code: string): Promise<AuthorizeResult>;
}

/**
 * Stand-in until provider app credentials exist (D04). It hands back the catalog's
 * own request strings after one simulated approval, which is fine for a lead or
 * booking source and is a lie about money.
 *
 * So it REFUSES every payments provider, in `begin` and again in `complete`.
 * Specification 12.1: a provider awaiting approval says Request connection, it
 * does not open a simulated authorization success screen.
 */
export const SimulatedAuthorizer: Authorizer = {
  begin(req) {
    const p = providerById[req.providerId];
    if (p && isPaymentsProvider(p)) return { url: "", refusedReason: SIMULATED_AUTHORIZER_PAYMENTS_REFUSAL };
    return { url: `${req.redirectUri}?state=${encodeURIComponent(req.state)}&code=simulated_${req.providerId}` };
  },
  async complete(req, code) {
    const p = providerById[req.providerId];
    if (!p) return { ok: false, error: "Unknown provider" };
    if (isPaymentsProvider(p)) {
      return { ok: false, error: SIMULATED_AUTHORIZER_PAYMENTS_REFUSAL, refusalCode: "payments_simulation_refused" };
    }
    if (!code.startsWith("simulated_")) return { ok: false, error: "Invalid code" };
    return {
      ok: true,
      accountLabel: `${p.name} account`,
      requestedPermissions: p.permissions,
      grantedPermissions: p.permissions,
    };
  },
};

export function connect(
  existing: ProviderConnection | undefined,
  input: { tenantId: Id; providerId: string; result: AuthorizeResult; now: ISODateTime },
): ProviderConnection {
  const base: ProviderConnection = existing ?? {
    tenantId: input.tenantId,
    connectionId: `conn_${input.tenantId}_${input.providerId}`,
    providerId: input.providerId,
    status: "not_connected",
    requestedPermissions: [],
    grantedPermissions: [],
    eventCount: 0,
  };
  if (!input.result.ok) return { ...base, status: "error", error: input.result.error ?? "Authorization failed" };
  return {
    ...base,
    status: "connected",
    accountLabel: input.result.accountLabel,
    requestedPermissions: input.result.requestedPermissions ?? base.requestedPermissions ?? [],
    grantedPermissions: input.result.grantedPermissions ?? [],
    connectedAt: input.now,
    error: undefined,
  };
}

export function disconnect(conn: ProviderConnection): ProviderConnection {
  return {
    ...conn,
    status: "not_connected",
    requestedPermissions: [],
    grantedPermissions: [],
    accountLabel: undefined,
    connectedAt: undefined,
  };
}
