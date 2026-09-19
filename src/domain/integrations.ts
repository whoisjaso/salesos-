/**
 * Integration provider registry: what an owner can connect, how it authorizes, what it feeds.
 * Source: docs/spec/04_INTEGRATIONS_AND_AUTOMATIC_TRACKING.md, docs/DECISIONS.md ("Leads from anywhere, one intake").
 *
 * The connect flow is modeled as OAuth where the provider supports it. Real provider app credentials
 * and redirect URIs are an owner decision (D04). Until then the SimulatedAuthorizer stands in.
 * Logos: Simple Icons slugs (CC0), rendered from https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/<slug>.svg
 */
import type { EntryPath, Id, ISODateTime } from "./types";

export type AuthMethod = "oauth" | "api_key" | "webhook" | "none";
export type Feed = "leads" | "bookings" | "calls" | "meetings" | "payments" | "messages" | "contracts";

export interface IntegrationProvider {
  providerId: string;
  name: string;
  category: "ads" | "social" | "calendar" | "forms_pages" | "crm" | "telephony" | "meetings" | "payments" | "automation" | "other";
  logoSlug: string; // simple-icons slug
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
  { providerId: "gohighlevel", name: "GoHighLevel", category: "crm", logoSlug: "gohighlevel", brandColor: "#2C7BE5", auth: "oauth", feeds: ["leads", "bookings", "messages"], entryPathDefault: "form_entry", permissions: ["Read contacts and opportunities", "Read calendar bookings"], setup: ["Tap Connect", "Approve in GHL", "Pick a location"], oneLiner: "Funnels and bookings from GHL" },
  { providerId: "hubspot", name: "HubSpot", category: "crm", logoSlug: "hubspot", brandColor: "#FF7A59", auth: "oauth", feeds: ["leads", "contracts"], entryPathDefault: "form_entry", permissions: ["Read contacts and forms", "Read deals"], setup: ["Tap Connect", "Approve in HubSpot"], oneLiner: "Forms and deals from HubSpot" },
  { providerId: "typeform", name: "Typeform", category: "forms_pages", logoSlug: "typeform", brandColor: "#262627", auth: "oauth", feeds: ["leads"], entryPathDefault: "form_entry", permissions: ["Read form responses"], setup: ["Tap Connect", "Pick a form"], oneLiner: "Every response is a lead" },
  { providerId: "webflow", name: "Webflow", category: "forms_pages", logoSlug: "webflow", brandColor: "#146EF5", auth: "oauth", feeds: ["leads"], entryPathDefault: "form_entry", permissions: ["Read form submissions"], setup: ["Tap Connect", "Approve in Webflow", "Pick a site"], oneLiner: "Landing page forms, no code" },
  { providerId: "clickfunnels", name: "ClickFunnels", category: "forms_pages", logoSlug: "clickfunnels", brandColor: "#1E63EF", auth: "webhook", feeds: ["leads"], entryPathDefault: "form_entry", permissions: ["Send opt-ins to Sales OS"], setup: ["Copy the webhook URL", "Paste in your funnel"], oneLiner: "VSL opt-ins in real time" },
  { providerId: "landing_page", name: "Any landing page", category: "forms_pages", logoSlug: "html5", brandColor: "#E34F26", auth: "webhook", feeds: ["leads"], entryPathDefault: "form_entry", permissions: ["Send form posts to Sales OS"], setup: ["Copy one line of code", "Paste in your form"], oneLiner: "Works with any page or VSL", popular: true },
  { providerId: "twilio", name: "Twilio", category: "telephony", logoSlug: "twilio", brandColor: "#F22F46", auth: "api_key", feeds: ["calls", "messages"], entryPathDefault: "form_entry", permissions: ["Place and record calls from your number", "Send and receive texts"], setup: ["Paste account SID and token", "Pick your number"], oneLiner: "Your business number, in the dialer", popular: true },
  { providerId: "zoom", name: "Zoom", category: "meetings", logoSlug: "zoom", brandColor: "#0B5CFF", auth: "oauth", feeds: ["meetings"], entryPathDefault: "booked_entry", permissions: ["Read meeting participants and join times", "Read recordings you allow"], setup: ["Tap Connect", "Approve in Zoom"], oneLiner: "Proves who showed up" },
  { providerId: "google_meet", name: "Google Meet", category: "meetings", logoSlug: "googlemeet", brandColor: "#00897B", auth: "oauth", feeds: ["meetings"], entryPathDefault: "booked_entry", permissions: ["Read meeting attendance"], setup: ["Tap Connect", "Approve in Google"], oneLiner: "Attendance from Meet" },
  { providerId: "stripe", name: "Stripe", category: "payments", logoSlug: "stripe", brandColor: "#635BFF", auth: "oauth", feeds: ["payments"], entryPathDefault: "form_entry", permissions: ["Read payments, refunds, and disputes"], setup: ["Tap Connect", "Approve in Stripe"], oneLiner: "Cash in, refunds out, reconciled", popular: true },
  { providerId: "docusign", name: "DocuSign", category: "other", logoSlug: "docusign", brandColor: "#FFB805", auth: "oauth", feeds: ["contracts"], entryPathDefault: "form_entry", permissions: ["Read envelope status"], setup: ["Tap Connect", "Approve in DocuSign"], oneLiner: "Signed means signed" },
  { providerId: "zapier", name: "Zapier", category: "automation", logoSlug: "zapier", brandColor: "#FF4F00", auth: "webhook", feeds: ["leads", "bookings"], entryPathDefault: "form_entry", permissions: ["Send any Zap to Sales OS"], setup: ["Copy the webhook URL", "Add a Webhooks step"], oneLiner: "Anything Zapier can reach" },
  { providerId: "make", name: "Make", category: "automation", logoSlug: "make", brandColor: "#6D00CC", auth: "webhook", feeds: ["leads", "bookings"], entryPathDefault: "form_entry", permissions: ["Send any scenario to Sales OS"], setup: ["Copy the webhook URL", "Add an HTTP module"], oneLiner: "Anything Make can reach" },
  { providerId: "share_link", name: "Share link", category: "other", logoSlug: "link", brandColor: "#7BA4F0", auth: "none", feeds: ["leads"], entryPathDefault: "form_entry", permissions: [], setup: ["Copy your link", "Send it anywhere"], oneLiner: "Organic, referrals, walk-ins" },
  { providerId: "csv", name: "Spreadsheet", category: "other", logoSlug: "googlesheets", brandColor: "#34A853", auth: "none", feeds: ["leads"], entryPathDefault: "form_entry", permissions: [], setup: ["Upload a file", "Match the columns"], oneLiner: "Bring an old list in" },
];

export const providerById = Object.fromEntries(PROVIDERS.map((p) => [p.providerId, p])) as Record<string, IntegrationProvider>;

export function logoUrl(p: IntegrationProvider): string {
  return `https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/${p.logoSlug}.svg`;
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

export type ConnectionStatus = "not_connected" | "authorizing" | "connected" | "error" | "paused";

export interface ProviderConnection {
  tenantId: Id;
  connectionId: Id;
  providerId: string;
  status: ConnectionStatus;
  accountLabel?: string; // e.g. "Obavia Page", "acct_1234"
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
  grantedPermissions?: string[];
  error?: string;
}

/** Real implementations open the provider's consent screen and exchange the code server-side. */
export interface Authorizer {
  begin(req: AuthorizeRequest): { url: string };
  complete(req: AuthorizeRequest, code: string): Promise<AuthorizeResult>;
}

/** Stand-in until provider app credentials exist (D04). Grants the catalog permissions after one simulated approval. */
export const SimulatedAuthorizer: Authorizer = {
  begin(req) {
    return { url: `${req.redirectUri}?state=${encodeURIComponent(req.state)}&code=simulated_${req.providerId}` };
  },
  async complete(req, code) {
    const p = providerById[req.providerId];
    if (!p) return { ok: false, error: "Unknown provider" };
    if (!code.startsWith("simulated_")) return { ok: false, error: "Invalid code" };
    return { ok: true, accountLabel: `${p.name} account`, grantedPermissions: p.permissions };
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
    grantedPermissions: [],
    eventCount: 0,
  };
  if (!input.result.ok) return { ...base, status: "error", error: input.result.error ?? "Authorization failed" };
  return {
    ...base,
    status: "connected",
    accountLabel: input.result.accountLabel,
    grantedPermissions: input.result.grantedPermissions ?? [],
    connectedAt: input.now,
    error: undefined,
  };
}

export function disconnect(conn: ProviderConnection): ProviderConnection {
  return { ...conn, status: "not_connected", grantedPermissions: [], accountLabel: undefined, connectedAt: undefined };
}
