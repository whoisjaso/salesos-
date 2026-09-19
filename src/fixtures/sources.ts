/**
 * SYNTHETIC source connections and inbound payloads for tenant "obavia".
 * Five ways leads reach the business, in the shapes providers actually send.
 * Everything is invented; the phone numbers use the 555-01xx reserved range.
 */
import type { RawInbound, SourceConnection } from "@/domain/intake";

export const SOURCES_NOW = "2026-09-18T20:00:00Z";
export const SOURCES_TENANT_ID = "obavia";

export const sourceConnections: SourceConnection[] = [
  {
    tenantId: SOURCES_TENANT_ID,
    sourceId: "src_meta_dealer_video",
    kind: "meta_lead_form",
    label: "Meta: Dealer BDC video form",
    status: "connected",
    createdAt: "2026-07-02T15:10:00Z",
    lastReceivedAt: "2026-09-18T18:42:00Z",
    receivedCount: 212,
    entryPathDefault: "form_entry",
    leadTierDefault: 1,
    consentPolicy: [
      { channel: "phone", grantedByDefault: true },
      { channel: "sms", grantedByDefault: false, evidenceField: "sms_opt_in" },
      { channel: "email", grantedByDefault: true },
    ],
    webhookSecretRef: "vault://obavia/meta/app_secret",
  },
  {
    tenantId: SOURCES_TENANT_ID,
    sourceId: "src_vsl_landing",
    kind: "webhook_form",
    label: "VSL landing page",
    status: "connected",
    createdAt: "2026-07-20T09:00:00Z",
    lastReceivedAt: "2026-09-18T13:05:00Z",
    receivedCount: 87,
    entryPathDefault: "form_entry",
    leadTierDefault: 2,
    consentPolicy: [
      { channel: "phone", grantedByDefault: false, evidenceField: "agree_to_contact" },
      { channel: "sms", grantedByDefault: false, evidenceField: "agree_to_contact" },
      { channel: "email", grantedByDefault: true },
    ],
    webhookSecretRef: "vault://obavia/vsl/webhook_key",
    fieldMap: { requestText: "biggest_challenge", campaign: "page_variant" },
  },
  {
    tenantId: SOURCES_TENANT_ID,
    sourceId: "src_calendly_demo",
    kind: "calendar_booking",
    label: "Calendly: Dealer demo",
    status: "connected",
    createdAt: "2026-08-01T12:00:00Z",
    lastReceivedAt: "2026-09-17T22:15:00Z",
    receivedCount: 34,
    entryPathDefault: "booked_entry",
    consentPolicy: [
      { channel: "phone", grantedByDefault: true },
      { channel: "sms", grantedByDefault: false, evidenceField: "sms_opt_in" },
      { channel: "email", grantedByDefault: true },
    ],
    webhookSecretRef: "vault://obavia/calendly/signing_key",
  },
  {
    tenantId: SOURCES_TENANT_ID,
    sourceId: "src_ig_dm_link",
    kind: "share_link",
    label: "Instagram DM tap-to-add",
    status: "connected",
    createdAt: "2026-08-14T16:30:00Z",
    lastReceivedAt: "2026-09-15T19:20:00Z",
    receivedCount: 19,
    entryPathDefault: "form_entry",
    consentPolicy: [
      { channel: "phone", grantedByDefault: true },
      { channel: "sms", grantedByDefault: true },
      { channel: "email", grantedByDefault: false },
    ],
  },
  {
    tenantId: SOURCES_TENANT_ID,
    sourceId: "src_csv_legacy",
    kind: "csv_import",
    label: "Legacy spreadsheet import",
    status: "paused",
    createdAt: "2026-07-01T08:00:00Z",
    lastReceivedAt: "2026-07-01T08:45:00Z",
    receivedCount: 140,
    entryPathDefault: "form_entry",
    consentPolicy: [{ channel: "email", grantedByDefault: false, evidenceField: "opted_in" }],
  },
];

export function sourceById(sourceId: string): SourceConnection {
  const c = sourceConnections.find((s) => s.sourceId === sourceId);
  if (!c) throw new Error(`no fixture source ${sourceId}`);
  return c;
}

/** Meta lead-form shape: nested field_data array. */
export const metaInbound: RawInbound = {
  tenantId: SOURCES_TENANT_ID,
  sourceId: "src_meta_dealer_video",
  providerEventId: "lgid_9127734410021",
  receivedAt: "2026-09-18T18:42:00Z",
  payload: {
    id: "9127734410021",
    created_time: "2026-09-18T18:41:52+0000",
    ad_id: "120212345678900",
    adset_id: "120212345678800",
    campaign_id: "120212345678700",
    campaign_name: "q3_dealer_bdc_video",
    form_id: "88811223344",
    platform: "ig",
    field_data: [
      { name: "full_name", values: ["Marisol Ochoa-Reyes"] },
      { name: "phone_number", values: ["(512) 555-0142"] },
      { name: "email", values: ["Marisol.Ochoa@LonestarMotors.example"] },
      { name: "what_do_you_need_help_with", values: ["Our BDC loses internet leads after the first call. Need follow-up that actually happens."] },
      { name: "sms_opt_in", values: ["true"] },
      { name: "preferred_language", values: ["Spanish"] },
    ],
  },
  headers: { "x-hub-signature-256": "sha256=redacted" },
};

/** Flat landing page form post. */
export const landingInbound: RawInbound = {
  tenantId: SOURCES_TENANT_ID,
  sourceId: "src_vsl_landing",
  providerEventId: "vsl_form_20260918T130500_a81f",
  receivedAt: "2026-09-18T13:05:00Z",
  payload: {
    first_name: "Deshawn",
    last_name: "Whitfield",
    phone: "737-555-0188",
    email: "dwhitfield@capitalcityautos.example",
    biggest_challenge: "Reps text from personal phones and nothing gets logged",
    page_variant: "vsl_v3_long",
    agree_to_contact: "on",
    utm_source: "youtube",
    utm_medium: "cpc",
    utm_campaign: "vsl_v3",
    lang: "en-US",
  },
  headers: { "user-agent": "Mozilla/5.0", "content-type": "application/x-www-form-urlencoded" },
};

/** Calendly-style invitee.created event. */
export const calendlyInbound: RawInbound = {
  tenantId: SOURCES_TENANT_ID,
  sourceId: "src_calendly_demo",
  providerEventId: "evt_calendly_01J8X2Q9WZ5N",
  receivedAt: "2026-09-17T22:15:00Z",
  payload: {
    event: "invitee.created",
    created_at: "2026-09-17T22:14:48.000000Z",
    payload: {
      invitee: {
        name: "Priya Raghunathan",
        email: "priya@hillcountryford.example",
        text_reminder_number: "+1 830 555 0107",
        timezone: "America/Chicago",
      },
      scheduled_event: {
        name: "Dealer demo (30 min)",
        start_time: "2026-09-22T15:30:00.000000Z",
        end_time: "2026-09-22T16:00:00.000000Z",
      },
      questions_and_answers: [
        { question: "What do you want to see in the demo?", answer: "How the follow-up cadence works for a 6-person BDC" },
      ],
      tracking: { utm_campaign: "demo_page", utm_source: "site" },
    },
  },
  headers: { "user-agent": "Calendly-Webhooks/1.0", "calendly-webhook-signature": "t=1,v1=redacted" },
};

/** Share link: the minimum a rep types with their thumb. */
export const shareLinkInbound: RawInbound = {
  tenantId: SOURCES_TENANT_ID,
  sourceId: "src_ig_dm_link",
  providerEventId: "share_20260915T192000_u_rep_marcus",
  receivedAt: "2026-09-15T19:20:00Z",
  payload: { name: "Tomas Ibarra", phone: "2105550163" },
};

export const sampleInbound: RawInbound[] = [metaInbound, landingInbound, calendlyInbound, shareLinkInbound];
