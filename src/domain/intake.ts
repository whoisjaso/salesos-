/**
 * Universal lead intake (SOS-02 accountable lead, SOS-04 adapter contract,
 * SOS-05 identity and deduplication).
 *
 * Business owners get leads from everywhere: Meta lead forms, VSL landing
 * pages, calendar bookings on other tools, DMs, spreadsheets. This module
 * turns ANY inbound payload into one canonical submission, links or creates
 * the contact, drops transport replays, flags repeat inquiries, and opens an
 * accountable opportunity only when policy allows.
 *
 * Rules:
 * - Pure: time is injected, ids are deterministic (FNV-1a), no Math.random.
 * - Never invent a value. A field the payload does not carry stays undefined.
 * - Consent is never assumed. It is "granted" only from connection policy or
 *   payload evidence, "revoked" from a stop/unsubscribe flag, else "unknown".
 * - A replayed provider event changes nothing (SOS-04 acceptance criteria).
 * - A duplicate submission is recorded but never creates a new accountable
 *   opportunity (SOS-02).
 */
import type {
  ConsentState,
  Contact,
  DomainEvent,
  EntryPath,
  ISODateTime,
  Id,
  LeadSubmission,
  Opportunity,
} from "./types";
import { createEvent } from "./events";

// ---------- Sources ----------

export type SourceKind =
  | "meta_lead_form"
  | "google_lead_form"
  | "webhook_form"
  | "calendar_booking"
  | "share_link"
  | "manual"
  | "zapier_make"
  | "email_forward"
  | "csv_import";

export type SourceStatus = "connected" | "pending" | "error" | "paused";

export type ConsentChannel = "phone" | "sms" | "email";

export interface ConsentPolicyRule {
  channel: ConsentChannel;
  /** The connection itself carries permission (e.g. a booking page with a disclosed consent line). */
  grantedByDefault: boolean;
  /** Payload key whose truthy value is the consent evidence (e.g. "sms_opt_in"). */
  evidenceField?: string;
}

export interface SourceConnection {
  tenantId: Id;
  sourceId: Id;
  kind: SourceKind;
  label: string;
  status: SourceStatus;
  createdAt: ISODateTime;
  lastReceivedAt?: ISODateTime;
  receivedCount: number;
  entryPathDefault: EntryPath;
  leadTierDefault?: number;
  consentPolicy: ConsentPolicyRule[];
  /** Reference to a secret in the vault. Never the secret itself. */
  webhookSecretRef?: string;
  /** canonical field -> payload key or dotted path. Wins over heuristics. */
  fieldMap?: Partial<Record<CanonicalField, string>>;
}

export type CanonicalField =
  | "fullName"
  | "firstName"
  | "lastName"
  | "phone"
  | "email"
  | "requestText"
  | "campaign"
  | "adId"
  | "bookingStart"
  | "bookingProvider"
  | "preferredLanguage";

export interface SourceCatalogEntry {
  kind: SourceKind;
  title: string;
  /** Max 8 words. */
  oneLiner: string;
  /** Max 3 steps, each max 10 words. */
  setupSteps: string[];
  /** Phosphor icon name. */
  icon: string;
  entryPathDefault: EntryPath;
}

export const sourceCatalog: SourceCatalogEntry[] = [
  {
    kind: "meta_lead_form",
    title: "Meta lead form",
    oneLiner: "Facebook and Instagram instant forms, auto-synced.",
    setupSteps: ["Connect your Meta Business account", "Pick the page and lead forms", "New leads arrive within seconds"],
    icon: "FacebookLogo",
    entryPathDefault: "form_entry",
  },
  {
    kind: "google_lead_form",
    title: "Google lead form",
    oneLiner: "Google Ads lead form extensions, delivered live.",
    setupSteps: ["Copy the webhook URL and key", "Paste into your Google Ads lead form", "Send a test lead to confirm"],
    icon: "GoogleLogo",
    entryPathDefault: "form_entry",
  },
  {
    kind: "webhook_form",
    title: "Landing page or VSL form",
    oneLiner: "Any website form posts straight here.",
    setupSteps: ["Copy the form snippet or webhook URL", "Add it to your page builder", "Submit the form once to verify"],
    icon: "Globe",
    entryPathDefault: "form_entry",
  },
  {
    kind: "calendar_booking",
    title: "Calendar bookings",
    oneLiner: "Calendly, Cal.com or GHL bookings become leads.",
    setupSteps: ["Connect your booking tool", "Choose which event types count", "Bookings show as booked-entry leads"],
    icon: "CalendarCheck",
    entryPathDefault: "booked_entry",
  },
  {
    kind: "share_link",
    title: "Tap-to-add link",
    oneLiner: "Organic and DM leads, one tap.",
    setupSteps: ["Save the link to your phone", "Tap it when someone messages you", "Type name and number, done"],
    icon: "ChatCircleDots",
    entryPathDefault: "form_entry",
  },
  {
    kind: "manual",
    title: "Add by hand",
    oneLiner: "Type a lead in yourself.",
    setupSteps: ["Open Add lead", "Enter name, phone or email", "Save"],
    icon: "PencilSimple",
    entryPathDefault: "form_entry",
  },
  {
    kind: "zapier_make",
    title: "Zapier or Make",
    oneLiner: "Bridge any app with a zap.",
    setupSteps: ["Copy the webhook URL and key", "Add a webhook action to your zap", "Map name, phone, email, message"],
    icon: "Lightning",
    entryPathDefault: "form_entry",
  },
  {
    kind: "email_forward",
    title: "Email forwarding",
    oneLiner: "Forward lead emails to a private address.",
    setupSteps: ["Copy your private intake address", "Set up forwarding in your inbox", "Forward one lead email to test"],
    icon: "EnvelopeSimple",
    entryPathDefault: "form_entry",
  },
  {
    kind: "csv_import",
    title: "Spreadsheet import",
    oneLiner: "Upload a CSV of existing leads.",
    setupSteps: ["Export your sheet as CSV", "Upload and match the columns", "Review and import"],
    icon: "FileCsv",
    entryPathDefault: "form_entry",
  },
];

export function catalogEntry(kind: SourceKind): SourceCatalogEntry {
  const entry = sourceCatalog.find((c) => c.kind === kind);
  if (!entry) throw new Error(`unknown source kind ${kind}`);
  return entry;
}

// ---------- Inbound envelope ----------

export interface RawInbound {
  tenantId: Id;
  sourceId: Id;
  /** Provider's stable event id. For sources without one, the caller supplies a collision-resistant id. */
  providerEventId: string;
  receivedAt: ISODateTime;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface NormalizedIntake {
  fullName?: string;
  phone?: string;
  email?: string;
  /** The customer's own words. Empty string when the payload carries none. */
  requestText: string;
  campaign?: string;
  adId?: string;
  utm?: Record<string, string>;
  bookingStart?: ISODateTime;
  bookingProvider?: string;
  preferredLanguage?: string;
  consent: Record<ConsentChannel, ConsentState>;
  /** "tenant:sourceId:providerEventId": where the restricted raw envelope lives. */
  rawRef: string;
}

// ---------- Hashing and ids ----------

/** FNV-1a 32-bit, hex. Deterministic ids without Math.random. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function rawRefFor(raw: Pick<RawInbound, "tenantId" | "sourceId" | "providerEventId">): string {
  return `${raw.tenantId}:${raw.sourceId}:${raw.providerEventId}`;
}

export function submissionIdFor(raw: Pick<RawInbound, "tenantId" | "sourceId" | "providerEventId">): Id {
  return `sub_${fnv1a(rawRefFor(raw))}`;
}

export function opportunityIdFor(submissionId: Id): Id {
  return `opp_${fnv1a(`opportunity:${submissionId}`)}`;
}

export function contactIdFor(tenantId: Id, contactPoint: string): Id {
  return `ct_${fnv1a(`${tenantId}:${contactPoint}`)}`;
}

// ---------- Payload flattening and value helpers ----------

type Flat = Map<string, unknown>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeKey(k: string): string {
  return k
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Flattens any payload to leaf values keyed by both the full dotted path and
 * the bare leaf key. Understands the common provider array shapes:
 * - Meta `field_data: [{ name, values: [..] }]`
 * - Calendly `questions_and_answers: [{ question, answer }]`
 * - generic `[{ name|key|field|label, value }]`
 * Earlier keys win on collision so top-level fields beat nested ones.
 */
export function flattenPayload(payload: Record<string, unknown>): Flat {
  const flat: Flat = new Map();
  const put = (key: string, value: unknown) => {
    const nk = normalizeKey(key);
    if (nk && !flat.has(nk)) flat.set(nk, value);
  };
  const walk = (value: unknown, path: string[]) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isPlainObject(item)) continue;
        const name = item.name ?? item.key ?? item.field ?? item.label ?? item.question;
        if (typeof name === "string") {
          const v = "values" in item && Array.isArray(item.values) ? item.values[0] : item.value ?? item.answer;
          if (v !== undefined) {
            put(name, v);
            put([...path, name].join("."), v);
            // Free-text Q&A: the first answer is the customer's own words.
            if (typeof item.question === "string" && item.answer !== undefined) put("answer", v);
          }
        } else {
          walk(item, path);
        }
      }
      return;
    }
    if (isPlainObject(value)) {
      for (const [k, v] of Object.entries(value)) {
        const p = [...path, k];
        if (isPlainObject(v) || Array.isArray(v)) {
          walk(v, p);
        } else {
          put(p.join("."), v);
          put(k, v);
        }
      }
    }
  };
  walk(payload, []);
  return flat;
}

function dottedGet(payload: Record<string, unknown>, path: string): unknown {
  let cur: unknown = payload;
  for (const seg of path.split(".")) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function asText(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : undefined;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

const FALSY_WORDS = new Set(["", "false", "no", "n", "0", "off", "null", "undefined", "none"]);

export function isTruthyFlag(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return !FALSY_WORDS.has(v.trim().toLowerCase());
  return false;
}

function pick(flat: Flat, keys: string[]): string | undefined {
  for (const k of keys) {
    const t = asText(flat.get(k));
    if (t !== undefined) return t;
  }
  return undefined;
}

// ---------- Normalizers ----------

/**
 * E.164-ish: "+" followed by digits. Country default "US".
 * - "+..." or "00..." keeps the country code.
 * - 10 digits under US -> +1 prefix; 11 digits starting with 1 -> +1...
 * - 11-15 digits otherwise are treated as already carrying a country code.
 * - Fewer than 10 digits: undefined (a local number cannot be completed honestly).
 */
export function normalizePhone(input: string | undefined, countryDefault = "US"): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  const explicitPlus = trimmed.startsWith("+") || trimmed.startsWith("00");
  let digits = trimmed.replace(/[^0-9]/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 7) return undefined;
  if (explicitPlus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : undefined;
  if (countryDefault === "US") {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return undefined;
}

export function normalizeEmail(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const e = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : undefined;
}

function normalizeDate(input: string | undefined): ISODateTime | undefined {
  if (!input) return undefined;
  const ms = Date.parse(input);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

function normalizeLanguage(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const v = input.trim().toLowerCase();
  const names: Record<string, string> = {
    english: "en",
    spanish: "es",
    español: "es",
    espanol: "es",
    french: "fr",
    português: "pt",
    portuguese: "pt",
  };
  if (names[v]) return names[v];
  const m = /^([a-z]{2})(?:[-_][a-z]{2})?$/.exec(v);
  return m ? m[1] : undefined;
}

const KEYS = {
  fullName: ["full_name", "name", "fullname", "contact_name", "customer_name", "invitee_name", "invitee.name"],
  firstName: ["first_name", "firstname", "given_name"],
  lastName: ["last_name", "lastname", "family_name", "surname"],
  phone: ["phone", "phone_number", "mobile", "mobile_number", "cell", "telephone", "tel", "text_reminder_number", "whatsapp"],
  email: ["email", "email_address", "e_mail", "invitee.email", "invitee_email"],
  requestText: [
    "message",
    "notes",
    "note",
    "question",
    "goal",
    "goals",
    "what_do_you_need",
    "what_do_you_need_help_with",
    "how_can_we_help",
    "comments",
    "comment",
    "details",
    "description",
    "body",
    "inquiry",
    "request",
    "text",
    "answer",
  ],
  campaign: ["campaign", "campaign_name", "utm_campaign", "campaign_id"],
  adId: ["ad_id", "adid", "ad", "adset_id", "creative_id"],
  bookingStart: ["start_time", "event_start", "scheduled_at", "start", "start_at", "booking_start", "appointment_time", "event.start_time", "scheduled_event.start_time"],
  bookingProvider: ["booking_provider", "provider", "scheduler", "calendar_provider"],
  preferredLanguage: ["language", "lang", "preferred_language", "locale"],
} as const;

const STOP_KEYS = ["unsubscribe", "unsubscribed", "stop", "opt_out", "optout", "opted_out", "do_not_contact", "dnc", "do_not_call", "revoked"];
const STOP_WORDS = new Set(["stop", "unsubscribe", "opt out", "opt-out", "quit", "cancel", "end"]);

function detectProvider(raw: RawInbound, flat: Flat): string | undefined {
  const explicit = pick(flat, [...KEYS.bookingProvider]);
  if (explicit) return explicit.toLowerCase();
  const ua = raw.headers?.["user-agent"] ?? raw.headers?.["User-Agent"];
  if (ua) {
    const l = ua.toLowerCase();
    for (const p of ["calendly", "cal.com", "gohighlevel", "acuity", "zapier", "make"]) if (l.includes(p)) return p;
  }
  const keys = Array.from(flat.keys());
  if (keys.some((k) => k.startsWith("invitee") || k === "scheduled_event.start_time")) return "calendly";
  if (keys.some((k) => k.startsWith("booking") || k.includes("attendees"))) return "cal.com";
  return undefined;
}

/**
 * Maps ANY payload shape to the canonical intake. Connection fieldMap first,
 * then heuristics over common key names. Nothing is invented.
 */
export function normalize(raw: RawInbound, connection: SourceConnection, now: ISODateTime): NormalizedIntake {
  void now;
  const flat = flattenPayload(raw.payload);
  const mapped = (field: CanonicalField): string | undefined => {
    const key = connection.fieldMap?.[field];
    if (!key) return undefined;
    const direct = asText(dottedGet(raw.payload, key));
    if (direct !== undefined) return direct;
    return asText(flat.get(normalizeKey(key)));
  };
  const field = (f: CanonicalField, keys: readonly string[]): string | undefined => mapped(f) ?? pick(flat, [...keys]);

  let fullName = field("fullName", KEYS.fullName);
  if (!fullName) {
    const first = field("firstName", KEYS.firstName);
    const last = field("lastName", KEYS.lastName);
    const joined = [first, last].filter(Boolean).join(" ").trim();
    fullName = joined.length ? joined : undefined;
  }

  const phone = normalizePhone(field("phone", KEYS.phone));
  const email = normalizeEmail(field("email", KEYS.email));
  const requestText = field("requestText", KEYS.requestText) ?? "";
  const campaign = field("campaign", KEYS.campaign);
  const adId = field("adId", KEYS.adId);

  const utm: Record<string, string> = {};
  for (const [k, v] of flat.entries()) {
    if (k.startsWith("utm_")) {
      const t = asText(v);
      if (t !== undefined) utm[k] = t;
    }
  }

  const bookingStart = normalizeDate(field("bookingStart", KEYS.bookingStart));
  const bookingProvider = mapped("bookingProvider") ?? (bookingStart || connection.kind === "calendar_booking" ? detectProvider(raw, flat) : undefined);
  const preferredLanguage = normalizeLanguage(field("preferredLanguage", KEYS.preferredLanguage));

  // Consent: revoked on a stop flag, granted only by policy or evidence, else unknown.
  const stopFlag = STOP_KEYS.some((k) => isTruthyFlag(flat.get(k))) || STOP_WORDS.has(requestText.trim().toLowerCase());
  const consent: Record<ConsentChannel, ConsentState> = { phone: "unknown", sms: "unknown", email: "unknown" };
  for (const rule of connection.consentPolicy) {
    const evidence = rule.evidenceField ? isTruthyFlag(flat.get(normalizeKey(rule.evidenceField)) ?? dottedGet(raw.payload, rule.evidenceField)) : false;
    if (rule.grantedByDefault || evidence) consent[rule.channel] = "granted";
  }
  if (stopFlag) {
    consent.phone = "revoked";
    consent.sms = "revoked";
    consent.email = "revoked";
  }

  return {
    fullName,
    phone,
    email,
    requestText,
    campaign,
    adId,
    utm: Object.keys(utm).length ? utm : undefined,
    bookingStart,
    bookingProvider,
    preferredLanguage,
    consent,
    rawRef: rawRefFor(raw),
  };
}

// ---------- Identity ----------

/** A contact with its verified contact points, the intake index for identity resolution. */
export interface IntakeContact extends Contact {
  phone?: string;
  email?: string;
}

export interface IdentifyResult {
  contactId: Id;
  created: boolean;
  matchedOn?: "phone" | "email";
}

/** Phone first, then lowercased email (SOS-05: verified contact points, never name alone). */
export function identify(
  normalized: Pick<NormalizedIntake, "phone" | "email"> & { rawRef?: string },
  existingContacts: IntakeContact[],
  tenantIdArg?: Id,
): IdentifyResult {
  const tenantId = tenantIdArg ?? normalized.rawRef?.split(":")[0] ?? "default";
  const inTenant = existingContacts.filter((c) => c.tenantId === tenantId);
  if (normalized.phone) {
    const hit = inTenant.find((c) => c.phone && normalizePhone(c.phone) === normalized.phone);
    if (hit) return { contactId: hit.contactId, created: false, matchedOn: "phone" };
  }
  if (normalized.email) {
    const hit = inTenant.find((c) => c.email && normalizeEmail(c.email) === normalized.email);
    if (hit) return { contactId: hit.contactId, created: false, matchedOn: "email" };
  }
  const point = normalized.phone ?? normalized.email ?? "no-contact-point";
  return { contactId: contactIdFor(tenantId, point), created: true };
}

// ---------- Dedupe ----------

/** LeadSubmission plus the connection it arrived through, so per-source health and dedupe stay exact. */
export interface IntakeSubmission extends LeadSubmission {
  sourceId: Id;
}

export type DedupeResult =
  | { kind: "new" }
  | { kind: "replay"; reason: "replay"; originalSubmissionId: Id }
  | { kind: "duplicate"; duplicateOfSubmissionId: Id; sameSource: boolean };

function submissionSourceId(s: LeadSubmission | IntakeSubmission): Id | undefined {
  return "sourceId" in s ? s.sourceId : undefined;
}

/**
 * Transport replay: same providerEventId within tenant+source -> drop.
 * Repeat inquiry: same contact within the window -> duplicateOf set. When the
 * repeat came through the same source it is a plain duplicate; through a
 * different source it is still a duplicate of the earlier submission (one
 * person, one active buying cycle, SOS-05) and `sameSource` is false.
 */
export function dedupe(
  raw: RawInbound,
  contactId: Id,
  existingSubmissions: (LeadSubmission | IntakeSubmission)[],
  windowHours = 72,
): DedupeResult {
  const id = submissionIdFor(raw);
  const replay = existingSubmissions.find(
    (s) =>
      s.tenantId === raw.tenantId &&
      (s.submissionId === id || (s.providerEventId === raw.providerEventId && (submissionSourceId(s) ?? s.source) === raw.sourceId)),
  );
  if (replay) return { kind: "replay", reason: "replay", originalSubmissionId: replay.submissionId };

  const receivedMs = Date.parse(raw.receivedAt);
  const windowMs = windowHours * 3_600_000;
  const priors = existingSubmissions
    .filter((s) => s.tenantId === raw.tenantId && s.contactId === contactId && Math.abs(receivedMs - Date.parse(s.receivedAt)) <= windowMs)
    .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
  if (priors.length === 0) return { kind: "new" };
  // Chain to the root of the duplicate lineage so every repeat points at the accountable one.
  let root = priors[0];
  while (root.duplicateOfSubmissionId) {
    const parent = existingSubmissions.find((s) => s.submissionId === root.duplicateOfSubmissionId);
    if (!parent) break;
    root = parent;
  }
  return { kind: "duplicate", duplicateOfSubmissionId: root.submissionId, sameSource: submissionSourceId(root) === raw.sourceId };
}

// ---------- Ingest ----------

export interface IngestContext {
  now: ISODateTime;
  contacts: IntakeContact[];
  submissions: (LeadSubmission | IntakeSubmission)[];
  opportunities: Opportunity[];
  /** Offer the opened opportunity is for. Defaults to the tenant's single offer id convention. */
  offerId?: Id;
  workflowVersion?: string;
  /** Provider account within the source system, part of the event idempotency key. */
  sourceAccountId?: string;
  windowHours?: number;
}

export interface IngestResult {
  submission: IntakeSubmission;
  contact: IntakeContact;
  opportunity?: Opportunity;
  events: DomainEvent[];
  /** Why no opportunity was opened, in plain words. Empty when one was. */
  holds: string[];
  normalized: NormalizedIntake;
  dedupe: DedupeResult;
  /** True when the delivery was a transport replay: nothing should be persisted. */
  dropped: boolean;
}

export const DEFAULT_OFFER_ID = "offer_default";
export const DEFAULT_WORKFLOW_VERSION = "wf-intake-1.0";

export function ingest(raw: RawInbound, connection: SourceConnection, ctx: IngestContext): IngestResult {
  if (raw.tenantId !== connection.tenantId || raw.sourceId !== connection.sourceId) {
    throw new Error(`inbound ${rawRefFor(raw)} does not belong to connection ${connection.tenantId}:${connection.sourceId}`);
  }
  const normalized = normalize(raw, connection, ctx.now);
  const submissionId = submissionIdFor(raw);
  const identity = identify(normalized, ctx.contacts, raw.tenantId);
  const verdict = dedupe(raw, identity.contactId, ctx.submissions, ctx.windowHours);

  const eventBase = {
    tenantId: raw.tenantId,
    occurredAt: raw.receivedAt,
    receivedAt: ctx.now,
    actorType: "integration" as const,
    actorId: connection.sourceId,
    sourceSystem: connection.kind,
    sourceAccountId: ctx.sourceAccountId ?? connection.sourceId,
    correlationId: submissionId,
  };
  const evId = (suffix: string) => `ev_${fnv1a(`${submissionId}:${suffix}`)}`;
  const events: DomainEvent[] = [];

  const entryPath: EntryPath = normalized.bookingStart ? "booked_entry" : connection.entryPathDefault;

  const existing = ctx.contacts.find((c) => c.tenantId === raw.tenantId && c.contactId === identity.contactId);
  const contact: IntakeContact = existing
    ? {
        ...existing,
        phone: existing.phone ?? normalized.phone,
        email: existing.email ?? normalized.email,
        preferredLanguage: existing.preferredLanguage ?? normalized.preferredLanguage,
        consent: mergeConsent(existing.consent, normalized.consent),
      }
    : {
        tenantId: raw.tenantId,
        contactId: identity.contactId,
        displayName: normalized.fullName ?? normalized.email ?? normalized.phone ?? "Unknown contact",
        preferredLanguage: normalized.preferredLanguage,
        preferredChannel: normalized.phone ? "phone" : normalized.email ? "email" : undefined,
        consent: normalized.consent,
        phone: normalized.phone,
        email: normalized.email,
      };

  const submission: IntakeSubmission = {
    tenantId: raw.tenantId,
    submissionId,
    providerEventId: raw.providerEventId,
    source: connection.kind,
    sourceId: connection.sourceId,
    campaign: normalized.campaign,
    leadTier: connection.leadTierDefault,
    entryPath,
    receivedAt: raw.receivedAt,
    requestText: normalized.requestText,
    contactId: identity.contactId,
    duplicateOfSubmissionId: verdict.kind === "duplicate" ? verdict.duplicateOfSubmissionId : undefined,
  };

  if (verdict.kind === "replay") {
    events.push(
      createEvent({
        ...eventBase,
        eventId: evId("replay"),
        eventType: "intake.replay_dropped",
        aggregateType: "lead_submission",
        aggregateId: verdict.originalSubmissionId,
        sourceEventId: raw.providerEventId,
        payload: { providerEventId: raw.providerEventId, sourceId: connection.sourceId, originalSubmissionId: verdict.originalSubmissionId },
      }),
    );
    return {
      submission: { ...submission, submissionId: verdict.originalSubmissionId },
      contact,
      events,
      holds: ["transport replay: already recorded"],
      normalized,
      dedupe: verdict,
      dropped: true,
    };
  }

  events.push(
    createEvent({
      ...eventBase,
      eventId: evId("received"),
      eventType: "lead.received",
      aggregateType: "lead_submission",
      aggregateId: submissionId,
      sourceEventId: raw.providerEventId,
      payload: {
        sourceId: connection.sourceId,
        kind: connection.kind,
        entryPath,
        campaign: normalized.campaign,
        adId: normalized.adId,
        utm: normalized.utm,
        bookingStart: normalized.bookingStart,
        bookingProvider: normalized.bookingProvider,
        rawRef: normalized.rawRef,
        hasPhone: Boolean(normalized.phone),
        hasEmail: Boolean(normalized.email),
      },
    }),
  );
  events.push(
    createEvent({
      ...eventBase,
      eventId: evId(identity.created ? "contact_created" : "contact_linked"),
      eventType: identity.created ? "contact.created" : "contact.linked",
      aggregateType: "contact",
      aggregateId: identity.contactId,
      causationId: evId("received"),
      payload: { submissionId, matchedOn: identity.matchedOn, consent: contact.consent },
    }),
  );

  const holds: string[] = [];
  if (!normalized.phone && !normalized.email) holds.push("no contact point");
  const channels: ConsentChannel[] = ["phone", "sms", "email"];
  if (channels.every((c) => contact.consent[c] === "revoked")) holds.push("consent revoked");
  if (verdict.kind === "duplicate") {
    holds.push(`duplicate of ${verdict.duplicateOfSubmissionId}`);
    events.push(
      createEvent({
        ...eventBase,
        eventId: evId("duplicate"),
        eventType: "intake.duplicate_flagged",
        aggregateType: "lead_submission",
        aggregateId: submissionId,
        causationId: evId("received"),
        payload: { duplicateOfSubmissionId: verdict.duplicateOfSubmissionId, sameSource: verdict.sameSource, contactId: identity.contactId },
      }),
    );
  }

  let opportunity: Opportunity | undefined;
  if (holds.length === 0) {
    const opportunityId = opportunityIdFor(submissionId);
    opportunity = {
      tenantId: raw.tenantId,
      opportunityId,
      contactIds: [identity.contactId],
      primaryContactId: identity.contactId,
      offerId: ctx.offerId ?? DEFAULT_OFFER_ID,
      workflowVersion: ctx.workflowVersion ?? DEFAULT_WORKFLOW_VERSION,
      entryPath,
      source: connection.kind,
      leadTier: connection.leadTierDefault,
      commercialStatus: "open",
      accountabilityStartedAt: ctx.now,
      currentOwner: {},
      contactState: "none",
      fitState: "unassessed",
      contractState: "none",
      paymentState: "none",
    };
    events.push(
      createEvent({
        ...eventBase,
        eventId: evId("opened"),
        eventType: "opportunity.opened",
        aggregateType: "opportunity",
        aggregateId: opportunityId,
        opportunityId,
        causationId: evId("received"),
        payload: { submissionId, contactId: identity.contactId, entryPath, source: connection.kind, leadTier: connection.leadTierDefault },
      }),
    );
  }

  return { submission, contact, opportunity, events, holds, normalized, dedupe: verdict, dropped: false };
}

/** Revoked always wins; granted beats unknown; unknown never downgrades a known state. */
function mergeConsent(existing: Contact["consent"], incoming: Contact["consent"]): Contact["consent"] {
  const rank: Record<ConsentState, number> = { unknown: 0, granted: 1, revoked: 2 };
  const out = { ...existing };
  for (const c of ["phone", "sms", "email"] as const) {
    out[c] = rank[incoming[c]] > rank[existing[c]] ? incoming[c] : existing[c];
  }
  return out;
}

// ---------- Source health ----------

export interface SourceHealthRow {
  sourceId: Id;
  label: string;
  kind: SourceKind;
  receivedLast7d: number;
  receivedLast24h: number;
  lastReceivedAt?: ISODateTime;
  /** Hours since the last received submission; undefined when nothing was ever received. */
  staleHours?: number;
  status: SourceStatus;
}

export function sourceHealth(
  connections: SourceConnection[],
  submissions: (LeadSubmission | IntakeSubmission)[],
  now: ISODateTime,
): SourceHealthRow[] {
  const nowMs = Date.parse(now);
  return connections.map((c) => {
    const mine = submissions.filter((s) => s.tenantId === c.tenantId && (submissionSourceId(s) ?? s.source) === c.sourceId);
    let last = c.lastReceivedAt;
    for (const s of mine) if (!last || s.receivedAt > last) last = s.receivedAt;
    const within = (h: number) => mine.filter((s) => nowMs - Date.parse(s.receivedAt) < h * 3_600_000 && Date.parse(s.receivedAt) <= nowMs).length;
    return {
      sourceId: c.sourceId,
      label: c.label,
      kind: c.kind,
      receivedLast7d: within(7 * 24),
      receivedLast24h: within(24),
      lastReceivedAt: last,
      staleHours: last ? Math.max(0, Math.round(((nowMs - Date.parse(last)) / 3_600_000) * 10) / 10) : undefined,
      status: c.status,
    };
  });
}

// ---------- Tracking snippets ----------

export interface TrackingSnippet {
  kind: SourceKind;
  /** The address leads post to or open. */
  url: string;
  /** HTML form for a page builder (webhook_form only). */
  html?: string;
  /** Command-line example (webhook_form only). */
  curl?: string;
  /** Plain-language setup text for everything else. */
  instructions: string;
}

export function trackingSnippet(connection: SourceConnection, publicUrl: string): TrackingSnippet {
  const base = publicUrl.replace(/\/+$/, "");
  const intakeUrl = `${base}/intake/${encodeURIComponent(connection.tenantId)}/${encodeURIComponent(connection.sourceId)}`;
  const secretHint = connection.webhookSecretRef ? ` Sign requests with the key stored as ${connection.webhookSecretRef}.` : "";
  switch (connection.kind) {
    case "webhook_form": {
      const html = [
        `<form method="post" action="${intakeUrl}">`,
        `  <input name="full_name" placeholder="Name" required>`,
        `  <input name="phone" type="tel" placeholder="Phone">`,
        `  <input name="email" type="email" placeholder="Email">`,
        `  <textarea name="message" placeholder="What do you need?"></textarea>`,
        `  <label><input name="sms_opt_in" type="checkbox" value="yes"> Text me about this</label>`,
        `  <input name="utm_campaign" type="hidden" value="">`,
        `  <button type="submit">Send</button>`,
        `</form>`,
      ].join("\n");
      const curl = [
        `curl -X POST ${intakeUrl} \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -H "X-Intake-Event-Id: $(date +%s)-example" \\`,
        `  -d '{"full_name":"Test Lead","phone":"(512) 555-0142","email":"test@example.com","message":"Testing the form","sms_opt_in":"yes"}'`,
      ].join("\n");
      return {
        kind: connection.kind,
        url: intakeUrl,
        html,
        curl,
        instructions: `Paste the form into your page, or post JSON to ${intakeUrl}. Each post needs a unique X-Intake-Event-Id header so retries are not counted twice.${secretHint}`,
      };
    }
    case "share_link": {
      const url = `${base}/add?source=${encodeURIComponent(connection.sourceId)}`;
      return { kind: connection.kind, url, instructions: `Save ${url} to your phone. Tap it when someone reaches out and type their name and number.` };
    }
    case "meta_lead_form":
      return { kind: connection.kind, url: intakeUrl, instructions: `Connect your Meta Business account and select the page and lead forms for "${connection.label}". Leads sync automatically; no code needed.` };
    case "google_lead_form":
      return { kind: connection.kind, url: intakeUrl, instructions: `In Google Ads, open the lead form asset, choose Webhook integration, and paste ${intakeUrl}.${secretHint}` };
    case "calendar_booking":
      return { kind: connection.kind, url: intakeUrl, instructions: `Add ${intakeUrl} as a webhook subscriber for invitee.created (Calendly), BOOKING_CREATED (Cal.com) or Appointment (GHL). Bookings arrive as booked-entry leads.${secretHint}` };
    case "zapier_make":
      return { kind: connection.kind, url: intakeUrl, instructions: `Add a "Webhooks: POST" action to your zap or scenario with ${intakeUrl}. Map name, phone, email and message; any extra fields are kept.${secretHint}` };
    case "email_forward":
      return { kind: connection.kind, url: intakeUrl, instructions: `Forward lead emails to intake+${connection.sourceId}@${hostOf(base)}. Sender, subject and body are parsed into a lead.` };
    case "csv_import":
      return { kind: connection.kind, url: `${base}/import?source=${encodeURIComponent(connection.sourceId)}`, instructions: `Upload a CSV with columns like name, phone, email, message. Each row becomes a lead; the file name plus row number is its event id.` };
    case "manual":
      return { kind: connection.kind, url: `${base}/add?source=${encodeURIComponent(connection.sourceId)}`, instructions: "Open Add lead and type the name and a phone or email." };
  }
}

function hostOf(url: string): string {
  const m = /^[a-z]+:\/\/([^/]+)/i.exec(url);
  return m ? m[1] : url;
}
