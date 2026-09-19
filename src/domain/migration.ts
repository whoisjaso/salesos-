/**
 * Data migration (import) engine.
 *
 * Owner's words: "a way for them to transfer all of their existing data onto
 * this site very seamlessly. All of their fields may not be the exact same,
 * but we want close to 100% accurately transferred so there is no friction in
 * onboarding."
 *
 * Pipeline: parseCsv -> profileColumns -> detectPreset -> suggestMapping
 * (-> applyManualMapping) -> dryRun -> runImport.
 *
 * Rules:
 * - Pure and deterministic: time is injected, ids come from FNV-1a, no
 *   Math.random, no Date.now. The same file imported twice yields the same
 *   ids and the same event idempotency keys, so nothing applies twice.
 * - Identity reuses intake's identify(): phone first, then email, never name
 *   alone (SOS-05). Rows sharing a contact point fold into one contact.
 * - Consent is never downgraded by an import: an existing revoked consent
 *   stays revoked even when the file says "yes" (SOS-03 privacy model).
 * - Every created record is provenance-tagged ("import:<preset>", row hash).
 * - Nothing is invented: a value the file does not carry stays undefined,
 *   an unparseable value becomes an issue, never a guess.
 */
import type {
  Appointment,
  AppointmentInstance,
  AppointmentInstanceOutcome,
  CommercialStatus,
  ConsentState,
  DomainEvent,
  ISODateTime,
  Id,
  LeadSubmission,
  LedgerEntry,
  LedgerEntryKind,
  Opportunity,
  User,
} from "./types";
import { createEvent } from "./events";
import {
  DEFAULT_OFFER_ID,
  DEFAULT_WORKFLOW_VERSION,
  contactIdFor,
  fnv1a,
  identify,
  normalizeEmail,
  normalizePhone,
  opportunityIdFor,
  submissionIdFor,
  type IntakeContact,
} from "./intake";

// ---------- Public types ----------

export type TargetEntity = "contact" | "opportunity" | "appointment" | "payment" | "note";

/** Dotted target, e.g. "contact.phone". "ignore" skips the column. */
export type TargetField = string;

export interface TargetFieldDef {
  field: TargetField;
  entity: TargetEntity;
  label: string;
  required?: boolean;
  kind: "text" | "phone" | "email" | "date" | "money" | "enum" | "number" | "boolean";
  enumValues?: string[];
  /** Natural-language header phrases; matched after normalization. */
  synonyms: string[];
}

export type SourcePreset = "hubspot" | "gohighlevel" | "salesforce" | "pipedrive" | "zoho" | "close" | "google_sheets" | "generic";

export interface ColumnProfile {
  header: string;
  sampleValues: string[];
  nonEmpty: number;
  total: number;
  detectedKind: TargetFieldDef["kind"] | "unknown";
}

export interface ColumnMapping {
  header: string;
  /** "ignore" when unmapped (reason "unmapped") or explicitly skipped. */
  target: TargetField;
  /** 0..1 */
  confidence: number;
  reason: "preset" | "header_exact" | "header_synonym" | "value_shape" | "manual" | "unmapped";
  alternatives: TargetField[];
}

export interface MappingPlan {
  preset: SourcePreset;
  columns: ColumnMapping[];
  /** Columns with a real target (not ignore, not unmapped). */
  mappedCount: number;
  totalColumns: number;
  /** confidence < 0.8 or unmapped, excluding explicitly ignored columns. */
  needsReview: ColumnMapping[];
}

export interface RowIssue {
  /** 0-based data row index (header excluded). */
  row: number;
  header: string;
  problem: string;
  value: string;
  severity: "error" | "warning";
}

export interface DryRunReport {
  rows: number;
  contacts: { create: number; merge: number };
  opportunities: number;
  appointments: number;
  payments: { count: number; totalMinor: number; currency: string };
  notes: number;
  duplicatesMerged: number;
  issues: RowIssue[];
  unmappedColumns: string[];
  /** Existing revoked consents the file tried to grant; kept revoked. */
  consentPreserved: number;
  /** 0..100: rows without errors / rows. */
  readyPercent: number;
}

export interface ImportContext {
  tenantId: string;
  now: string;
  existingContacts: IntakeContact[];
  existingSubmissions?: LeadSubmission[];
  defaultCurrency?: string;
  users?: User[];
}

export interface ImportResult {
  contacts: IntakeContact[];
  submissions: LeadSubmission[];
  opportunities: Opportunity[];
  appointments: Appointment[];
  instances: AppointmentInstance[];
  ledger: LedgerEntry[];
  events: DomainEvent[];
  report: DryRunReport;
}

// ---------- Target catalog ----------

const COMMERCIAL_STATUSES: CommercialStatus[] = ["open", "won", "lost", "nurture", "dq", "reactivated"];
const OUTCOMES: AppointmentInstanceOutcome[] = [
  "scheduled",
  "canceled_before_cutoff",
  "superseded_before_cutoff",
  "late_canceled",
  "attended",
  "customer_no_show",
  "rep_no_show",
  "both_absent",
  "technical_failure",
  "unknown",
];

export const TARGET_FIELDS: TargetFieldDef[] = [
  { field: "contact.fullName", entity: "contact", label: "Full name", required: true, kind: "text", synonyms: ["name", "full name", "contact name", "customer name", "client name", "lead name", "person name", "contact", "person", "display name"] },
  { field: "contact.firstName", entity: "contact", label: "First name", kind: "text", synonyms: ["first name", "first", "given name", "firstname"] },
  { field: "contact.lastName", entity: "contact", label: "Last name", kind: "text", synonyms: ["last name", "last", "surname", "family name", "lastname"] },
  { field: "contact.phone", entity: "contact", label: "Phone", required: true, kind: "phone", synonyms: ["phone", "phone number", "mobile", "mobile phone", "mobile number", "telephone", "contact number", "primary phone", "phones", "whatsapp", "best number"] },
  { field: "contact.email", entity: "contact", label: "Email", required: true, kind: "email", synonyms: ["email", "email address", "e-mail", "emails", "contact email", "primary email", "mail"] },
  { field: "contact.organizationName", entity: "contact", label: "Company", kind: "text", synonyms: ["company", "company name", "organization", "organisation", "business", "business name", "account", "account name", "dealership", "employer"] },
  { field: "contact.preferredLanguage", entity: "contact", label: "Language", kind: "text", synonyms: ["language", "preferred language", "lang", "locale"] },
  { field: "contact.consent.phone", entity: "contact", label: "Call consent", kind: "boolean", enumValues: ["granted", "revoked", "unknown"], synonyms: ["call consent", "phone consent", "ok to call", "do not call", "dnc", "call opt in"] },
  { field: "contact.consent.sms", entity: "contact", label: "Text consent", kind: "boolean", enumValues: ["granted", "revoked", "unknown"], synonyms: ["sms consent", "text consent", "ok to text", "do not text", "sms opt in", "text opt in", "dnd", "do not disturb", "do not contact", "opted out of sms"] },
  { field: "contact.consent.email", entity: "contact", label: "Email consent", kind: "boolean", enumValues: ["granted", "revoked", "unknown"], synonyms: ["email consent", "email opt in", "unsubscribed", "unsubscribed from all email", "do not email", "email opt out", "marketing consent", "subscribed"] },
  { field: "opportunity.source", entity: "opportunity", label: "Source", kind: "text", synonyms: ["source", "lead source", "where from", "how did you hear about us", "channel", "origin", "original source", "referral source", "found us"] },
  { field: "opportunity.campaign", entity: "opportunity", label: "Campaign", kind: "text", synonyms: ["campaign", "campaign name", "utm campaign", "ad name", "promo"] },
  { field: "opportunity.leadTier", entity: "opportunity", label: "Lead tier", kind: "number", synonyms: ["lead tier", "tier", "lead score", "grade", "lead grade", "priority"] },
  { field: "opportunity.status", entity: "opportunity", label: "Status", kind: "enum", enumValues: COMMERCIAL_STATUSES, synonyms: ["status", "deal stage", "stage", "pipeline stage", "deal status", "opportunity status", "lead status", "result"] },
  { field: "opportunity.ownerName", entity: "opportunity", label: "Owner", kind: "text", synonyms: ["owner", "contact owner", "deal owner", "assigned to", "assigned", "rep", "sales rep", "setter", "closer", "salesperson", "agent", "account owner", "owner name"] },
  { field: "opportunity.createdAt", entity: "opportunity", label: "Created", kind: "date", synonyms: ["created", "create date", "created at", "created date", "date added", "added", "date created", "created time", "lead date", "date", "inquiry date", "submitted"] },
  { field: "opportunity.requestText", entity: "opportunity", label: "Customer's request", kind: "text", synonyms: ["message", "request", "inquiry", "what do you need", "goal", "goals", "question", "description"] },
  { field: "opportunity.dqReason", entity: "opportunity", label: "DQ reason", kind: "text", synonyms: ["dq reason", "disqualified reason", "lost reason", "reason", "reason lost", "why lost"] },
  { field: "opportunity.amount", entity: "opportunity", label: "Deal amount", kind: "money", synonyms: ["deal amount", "deal value", "value", "lead value", "opportunity value", "opportunity amount", "expected revenue", "contract value"] },
  { field: "appointment.start", entity: "appointment", label: "Appointment time", kind: "date", synonyms: ["appointment", "appointment time", "appointment date", "booked", "booking", "booking time", "meeting time", "meeting", "call time", "scheduled", "scheduled at", "start", "start time", "appointment start", "event start", "demo date"] },
  { field: "appointment.end", entity: "appointment", label: "Appointment end", kind: "date", synonyms: ["end", "end time", "appointment end", "event end"] },
  { field: "appointment.outcome", entity: "appointment", label: "Appointment outcome", kind: "enum", enumValues: OUTCOMES, synonyms: ["showed", "show", "attended", "appointment outcome", "appointment status", "appointment result", "show status", "attendance", "no show"] },
  { field: "appointment.repName", entity: "appointment", label: "Appointment rep", kind: "text", synonyms: ["rep name", "appointment rep", "host", "meeting host", "assigned rep", "appointment owner"] },
  { field: "payment.amount", entity: "payment", label: "Amount paid", kind: "money", synonyms: ["amount", "paid", "amount paid", "payment", "payment amount", "total paid", "cash collected", "collected", "revenue", "price", "total"] },
  { field: "payment.currency", entity: "payment", label: "Currency", kind: "text", synonyms: ["currency", "currency code"] },
  { field: "payment.date", entity: "payment", label: "Payment date", kind: "date", synonyms: ["payment date", "paid on", "paid date", "date paid", "close date", "closed date", "closing date", "won date", "won time", "sale date"] },
  { field: "payment.providerRef", entity: "payment", label: "Payment reference", kind: "text", synonyms: ["payment id", "transaction id", "charge id", "invoice", "invoice number", "receipt", "reference", "payment reference", "stripe id"] },
  { field: "payment.kind", entity: "payment", label: "Payment kind", kind: "enum", enumValues: ["payment", "refund", "dispute", "fee"], synonyms: ["payment kind", "payment type", "transaction type", "type"] },
  { field: "note.text", entity: "note", label: "Notes", kind: "text", synonyms: ["notes", "note", "comment", "comments", "internal notes", "remarks", "tags", "memo"] },
  { field: "note.at", entity: "note", label: "Note date", kind: "date", synonyms: ["note date", "last activity", "last activity date", "last contacted", "last touch"] },
  { field: "ignore", entity: "note", label: "Ignore", kind: "text", synonyms: [] },
];

const TARGET_BY_FIELD = new Map(TARGET_FIELDS.map((t) => [t.field, t]));

/** Targets that may be fed by more than one column (values concatenate). */
const MULTI_COLUMN_TARGETS = new Set<TargetField>(["ignore", "note.text"]);

/** Headers whose values are free-text notes already; anything else feeding note.text is prefixed with its header. */
const plainNoteHeaders = new Set(["notes", "note", "comment", "comments", "internalnotes", "remarks", "memo"]);

export function targetDef(field: TargetField): TargetFieldDef | undefined {
  return TARGET_BY_FIELD.get(field);
}

// ---------- Presets ----------

export const PRESETS: Record<SourcePreset, { label: string; logoSlug: string; headerMap: Record<string, TargetField> }> = {
  hubspot: {
    label: "HubSpot",
    logoSlug: "hubspot",
    headerMap: {
      "First Name": "contact.firstName",
      "Last Name": "contact.lastName",
      "Phone Number": "contact.phone",
      "Mobile Phone Number": "contact.phone",
      Email: "contact.email",
      "Company name": "contact.organizationName",
      "Lifecycle Stage": "note.text",
      "Lead Status": "opportunity.status",
      "Deal Stage": "opportunity.status",
      "Deal Name": "note.text",
      Pipeline: "ignore",
      Amount: "opportunity.amount",
      "Close Date": "payment.date",
      "Contact owner": "opportunity.ownerName",
      "Deal owner": "opportunity.ownerName",
      "Create Date": "opportunity.createdAt",
      "Original Source": "opportunity.source",
      "Unsubscribed from all email": "contact.consent.email",
      "Closed Lost Reason": "opportunity.dqReason",
    },
  },
  gohighlevel: {
    label: "GoHighLevel",
    logoSlug: "gohighlevel",
    headerMap: {
      "Contact Name": "contact.fullName",
      "First Name": "contact.firstName",
      "Last Name": "contact.lastName",
      Phone: "contact.phone",
      Email: "contact.email",
      "Business Name": "contact.organizationName",
      Tags: "note.text",
      Source: "opportunity.source",
      "Pipeline Stage": "opportunity.status",
      "Opportunity Status": "opportunity.status",
      "Lead Value": "opportunity.amount",
      "Appointment Status": "appointment.outcome",
      "Appointment Time": "appointment.start",
      "Assigned To": "opportunity.ownerName",
      "Date Added": "opportunity.createdAt",
      Created: "opportunity.createdAt",
      DND: "contact.consent.sms",
    },
  },
  salesforce: {
    label: "Salesforce",
    logoSlug: "salesforce",
    headerMap: {
      FirstName: "contact.firstName",
      LastName: "contact.lastName",
      Phone: "contact.phone",
      MobilePhone: "contact.phone",
      Email: "contact.email",
      Company: "contact.organizationName",
      LeadSource: "opportunity.source",
      Status: "opportunity.status",
      StageName: "opportunity.status",
      "Owner Name": "opportunity.ownerName",
      OwnerId: "ignore",
      CreatedDate: "opportunity.createdAt",
      Amount: "opportunity.amount",
      CloseDate: "payment.date",
      Description: "opportunity.requestText",
      HasOptedOutOfEmail: "contact.consent.email",
      DoNotCall: "contact.consent.phone",
    },
  },
  pipedrive: {
    label: "Pipedrive",
    logoSlug: "pipedrive",
    headerMap: {
      "Person - Name": "contact.fullName",
      "Person - Phone": "contact.phone",
      "Person - Email": "contact.email",
      "Organization - Name": "contact.organizationName",
      "Deal - Title": "note.text",
      "Deal - Value": "opportunity.amount",
      "Deal - Status": "opportunity.status",
      "Deal - Owner": "opportunity.ownerName",
      "Deal - Won time": "payment.date",
      "Deal - Lost reason": "opportunity.dqReason",
      "Deal - Add time": "opportunity.createdAt",
      "Deal - Source": "opportunity.source",
      "Activity - Due date": "appointment.start",
    },
  },
  zoho: {
    label: "Zoho CRM",
    logoSlug: "zoho",
    headerMap: {
      "First Name": "contact.firstName",
      "Last Name": "contact.lastName",
      Mobile: "contact.phone",
      Email: "contact.email",
      Company: "contact.organizationName",
      "Lead Source": "opportunity.source",
      "Lead Status": "opportunity.status",
      "Lead Owner": "opportunity.ownerName",
      "Created Time": "opportunity.createdAt",
      Amount: "opportunity.amount",
      "Closing Date": "payment.date",
      Stage: "opportunity.status",
      Description: "opportunity.requestText",
      "Email Opt Out": "contact.consent.email",
    },
  },
  close: {
    label: "Close",
    logoSlug: "close",
    headerMap: {
      display_name: "contact.fullName",
      "contact display_name": "contact.fullName",
      phones: "contact.phone",
      "primary_phone": "contact.phone",
      emails: "contact.email",
      "primary_email": "contact.email",
      "lead name": "contact.organizationName",
      status_label: "opportunity.status",
      lead_source: "opportunity.source",
      date_created: "opportunity.createdAt",
      opportunity_status: "opportunity.status",
      opportunity_value: "opportunity.amount",
      assigned_to: "opportunity.ownerName",
      note: "note.text",
    },
  },
  google_sheets: {
    label: "Google Sheets",
    logoSlug: "google-sheets",
    headerMap: {
      Name: "contact.fullName",
      Phone: "contact.phone",
      Email: "contact.email",
      Company: "contact.organizationName",
      Source: "opportunity.source",
      Status: "opportunity.status",
      Owner: "opportunity.ownerName",
      Date: "opportunity.createdAt",
      Appointment: "appointment.start",
      Amount: "payment.amount",
      Notes: "note.text",
    },
  },
  generic: { label: "Spreadsheet", logoSlug: "spreadsheet", headerMap: {} },
};

// ---------- CSV ----------

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF/LF/CR, BOM, ragged rows padded. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const src = text.startsWith("﻿") ? text.slice(1) : text;
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    records.push(row);
    row = [];
  };
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === ",") {
      endField();
      i++;
      continue;
    }
    if (ch === "\r") {
      endRow();
      i += src[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) endRow();

  const nonEmpty = records.filter((r) => r.some((c) => c.trim().length > 0));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const out = r.slice(0, headers.length).map((c) => c.trim());
    while (out.length < headers.length) out.push("");
    return out;
  });
  return { headers, rows };
}

// ---------- Normalization and matching helpers ----------

/** Lowercase, non-alphanumerics stripped: "E-mail" -> "email". */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

function tokenOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = new Set([...sa, ...sb]).size;
  return inter / union;
}

// ---------- Value parsers ----------

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function toIso(ms: number): ISODateTime | undefined {
  if (!Number.isFinite(ms)) return undefined;
  return `${new Date(ms).toISOString().slice(0, 19)}Z`;
}

function parseTimePart(part: string | undefined): { h: number; mi: number; s: number; tzMs: number } | undefined {
  if (!part || !part.trim()) return { h: 0, mi: 0, s: 0, tzMs: 0 };
  const m = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?(?:\.\d+)?\s*(am|pm|a\.m\.|p\.m\.)?\s*(z|utc|gmt|[+-]\d{2}:?\d{2})?$/i.exec(part.trim());
  if (!m) return undefined;
  let h = Number(m[1]);
  const mi = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  const ampm = m[4]?.toLowerCase().replace(/\./g, "");
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h > 23 || mi > 59 || s > 59) return undefined;
  let tzMs = 0;
  const tz = m[5]?.toLowerCase();
  if (tz && tz !== "z" && tz !== "utc" && tz !== "gmt") {
    const sign = tz.startsWith("-") ? -1 : 1;
    const digits = tz.slice(1).replace(":", "");
    tzMs = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60_000;
  }
  return { h, mi, s, tzMs };
}

function buildUtc(y: number, mo: number, d: number, t: { h: number; mi: number; s: number; tzMs: number }): ISODateTime | undefined {
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || y < 1900 || y > 2200) return undefined;
  const ms = Date.UTC(y, mo, d, t.h, t.mi, t.s) - t.tzMs;
  const check = new Date(ms + t.tzMs);
  if (check.getUTCMonth() !== mo || check.getUTCDate() !== d) return undefined; // e.g. Feb 30
  return toIso(ms);
}

/**
 * ISO 8601, US m/d/y (2- or 4-digit year), "Sep 3, 2026", "3 Sep 2026",
 * epoch seconds or milliseconds; optional time with am/pm and offset.
 * Times without an offset are read as UTC so the result is deterministic.
 */
export function parseDate(input: string | undefined): ISODateTime | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (!s) return undefined;
  if (/^\d{13}$/.test(s)) return toIso(Number(s));
  if (/^\d{10}$/.test(s)) return toIso(Number(s) * 1000);

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](.+))?$/i.exec(s);
  if (m) {
    const t = parseTimePart(m[4]);
    return t ? buildUtc(Number(m[1]), Number(m[2]) - 1, Number(m[3]), t) : undefined;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ ,T]+(.+))?$/.exec(s);
  if (m) {
    const t = parseTimePart(m[4]);
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return t ? buildUtc(year, Number(m[1]) - 1, Number(m[2]), t) : undefined;
  }
  m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:[ ,]+(?:at\s+)?(.+))?$/i.exec(s);
  if (m && MONTHS[m[1].toLowerCase()] !== undefined) {
    const t = parseTimePart(m[4]);
    return t ? buildUtc(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]), t) : undefined;
  }
  m = /^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})(?:[ ,]+(?:at\s+)?(.+))?$/i.exec(s);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
    const t = parseTimePart(m[4]);
    return t ? buildUtc(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), t) : undefined;
  }
  return undefined;
}

const CURRENCY_SYMBOLS: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "CA$": "CAD", "C$": "CAD", "A$": "AUD", "US$": "USD" };

export interface ParsedMoney {
  /** Positive magnitude in minor units. */
  amountMinor: number;
  negative: boolean;
  /** Only when the value itself carried a symbol or code. */
  currency?: string;
}

/** "$4,800.00", "4800", "(200)" (negative), "-50", "USD 1,200", "1200 EUR". */
export function parseMoney(input: string | undefined): ParsedMoney | undefined {
  if (!input) return undefined;
  let s = input.trim();
  if (!s) return undefined;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  let currency: string | undefined;
  for (const sym of ["CA$", "US$", "C$", "A$", "$", "€", "£"]) {
    if (s.includes(sym)) {
      currency = CURRENCY_SYMBOLS[sym];
      s = s.replace(sym, "");
      break;
    }
  }
  const code = /(?:^|\s)([A-Za-z]{3})(?:\s|$)/.exec(s);
  if (code && !currency) {
    currency = code[1].toUpperCase();
    s = s.replace(code[1], "");
  }
  s = s.trim();
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s.trim())) return undefined;
  const value = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(value)) return undefined;
  return { amountMinor: Math.round(value * 100), negative, currency };
}

function normalizeWord(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const STATUS_TABLE: [RegExp, CommercialStatus][] = [
  [/^(won|closedwon|closewon|sold|customer|purchased|signed|paid|closed|complete|completed|deal|success)$/, "won"],
  [/^(lost|closedlost|closelost|dead|notinterested|churned|declined|rejected|cancelled|canceled)$/, "lost"],
  [/^(dq|disqualified|unqualified|notqualified|badfit|spam|junk|notafit|invalid)$/, "dq"],
  [/^(nurture|nurturing|onhold|hold|later|followuplater|paused|cold|longterm|parked)$/, "nurture"],
  [/^(reactivated|reopened|reengaged)$/, "reactivated"],
];

/** Anything unrecognized (including blank) is "open": an imported record is never invented closed. */
export function parseStatus(input: string | undefined): CommercialStatus {
  const w = normalizeWord(input ?? "");
  if (!w) return "open";
  for (const [re, status] of STATUS_TABLE) if (re.test(w)) return status;
  return "open";
}

const OUTCOME_TABLE: [RegExp, AppointmentInstanceOutcome][] = [
  [/^(showed|show|attended|completed|complete|held|yes|y|true|met|done|success)$/, "attended"],
  [/^(noshow|ns|noshowed|didnotshow|no|n|false|missed|customernoshow|absent)$/, "customer_no_show"],
  [/^(cancelled|canceled|cancel|cancelledbycustomer|canceledbycustomer)$/, "canceled_before_cutoff"],
  [/^(rescheduled|reschedule|moved|superseded)$/, "superseded_before_cutoff"],
  [/^(latecancel|latecancelled|latecanceled|latecancellation)$/, "late_canceled"],
  [/^(repnoshow|hostnoshow|wenoshowed)$/, "rep_no_show"],
  [/^(scheduled|confirmed|booked|upcoming|pending|new)$/, "scheduled"],
  [/^(technicalfailure|techissue|technical)$/, "technical_failure"],
];

export function parseOutcome(input: string | undefined): AppointmentInstanceOutcome {
  const w = normalizeWord(input ?? "");
  if (!w) return "unknown";
  for (const [re, outcome] of OUTCOME_TABLE) if (re.test(w)) return outcome;
  return "unknown";
}

const CONSENT_YES = /^(yes|y|true|t|1|on|x|granted|optedin|optin|subscribed|allowed|ok|agreed|consented)$/;
const CONSENT_NO = /^(no|n|false|f|0|off|revoked|optedout|optout|unsubscribed|unsubscribe|stop|dnd|dnc|donotcontact|blocked|denied|declined)$/;
/** Values whose meaning does not flip under a "Do not text" header. */
const CONSENT_EXPLICIT = /^(granted|optedin|optin|subscribed|revoked|optedout|optout|unsubscribed|unsubscribe|stop|dnd|dnc|donotcontact)$/;

/** "yes"/"true"/"1"/"opted in" -> granted; "no"/"false"/"0"/"opted out"/"unsubscribed"/"stop" -> revoked; blank -> unknown. */
export function parseConsent(input: string | undefined, invert = false): ConsentState {
  const w = normalizeWord(input ?? "");
  if (!w) return "unknown";
  let state: ConsentState = "unknown";
  if (CONSENT_YES.test(w)) state = "granted";
  else if (CONSENT_NO.test(w)) state = "revoked";
  if (invert && !CONSENT_EXPLICIT.test(w)) {
    if (state === "granted") state = "revoked";
    else if (state === "revoked") state = "granted";
  }
  return state;
}

/** Headers phrased as a negation: "Do not text", "DND", "Unsubscribed". A "yes" there means revoked. */
export function isNegatedConsentHeader(header: string): boolean {
  return /donot|dnd|dnc|optout|optedout|unsub|^stop|nocontact|blocked/.test(normalizeHeader(header));
}

/** DND / do-not-contact style headers revoke every channel, not just the mapped one. */
function consentScopeAll(header: string): boolean {
  return /^dnd$|donotdisturb|donotcontact|^dnc$|nocontact/.test(normalizeHeader(header));
}

function parsePaymentKind(input: string | undefined): LedgerEntryKind | undefined {
  const w = normalizeWord(input ?? "");
  if (!w) return undefined;
  if (/^(refund|refunded|return|returned|reversal|credit)$/.test(w)) return "refund";
  if (/^(dispute|chargeback|disputed)$/.test(w)) return "dispute_debit";
  if (/^(fee|fees|processingfee)$/.test(w)) return "fee";
  if (/^(payment|paid|charge|sale|collected|deposit|invoice|succeeded)$/.test(w)) return "payment_collected";
  return undefined;
}

// ---------- Value shape detection ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BOOL_RE = /^(yes|no|y|n|true|false|1|0|on|off|optedin|optedout|optin|optout|subscribed|unsubscribed|stop|dnd|granted|revoked)$/;

export function looksLikePhone(v: string): boolean {
  const t = v.trim();
  if (!t) return false;
  if (/^\d{13}$/.test(t)) return false; // epoch ms
  if (/^1[5-9]\d{8}$/.test(t)) return false; // epoch seconds 2017..2033, not a phone
  if (!normalizePhone(t)) return false;
  const digits = t.replace(/\D/g, "").length;
  return /[\s().+-]/.test(t) || digits === 10 || digits === 11;
}

export function looksLikeMoney(v: string): boolean {
  const t = v.trim();
  if (!t) return false;
  const p = parseMoney(t);
  if (!p) return false;
  return /[$€£(),]|\.\d{2}$|[A-Za-z]{3}/.test(t);
}

function shapeOf(v: string): TargetFieldDef["kind"] | "text" {
  const t = v.trim();
  if (!t) return "text";
  if (BOOL_RE.test(normalizeWord(t))) return "boolean";
  if (EMAIL_RE.test(t)) return "email";
  if (looksLikePhone(t)) return "phone";
  if (parseDate(t)) return "date";
  if (looksLikeMoney(t)) return "money";
  if (/^-?\d+(\.\d+)?$/.test(t)) return "number";
  return "text";
}

function detectKind(samples: string[]): ColumnProfile["detectedKind"] {
  if (samples.length === 0) return "unknown";
  const counts = new Map<string, number>();
  for (const s of samples) counts.set(shapeOf(s), (counts.get(shapeOf(s)) ?? 0) + 1);
  const threshold = samples.length * 0.8;
  for (const kind of ["boolean", "email", "phone", "date", "money", "number"] as const) {
    if ((counts.get(kind) ?? 0) >= threshold) return kind;
  }
  // Plain numbers count toward money when money-looking values dominate the rest.
  if ((counts.get("money") ?? 0) + (counts.get("number") ?? 0) >= threshold && (counts.get("money") ?? 0) > 0) return "money";
  return "text";
}

export function profileColumns(headers: string[], rows: string[][], sample = 50): ColumnProfile[] {
  return headers.map((header, i) => {
    const values = rows.map((r) => (r[i] ?? "").trim());
    const nonEmptyValues = values.filter((v) => v.length > 0);
    const sampleValues = nonEmptyValues.slice(0, Math.max(0, sample));
    return { header, sampleValues, nonEmpty: nonEmptyValues.length, total: rows.length, detectedKind: detectKind(sampleValues) };
  });
}

// ---------- Preset detection ----------

function presetLookup(preset: SourcePreset): Map<string, TargetField> {
  const m = new Map<string, TargetField>();
  for (const [h, t] of Object.entries(PRESETS[preset].headerMap)) m.set(normalizeHeader(h), t);
  return m;
}

/** Share of the file's headers found in each preset's header map. Below 0.5 the file is "generic". */
export function detectPreset(headers: string[]): { preset: SourcePreset; score: number } {
  if (headers.length === 0) return { preset: "generic", score: 1 };
  const norm = headers.map(normalizeHeader);
  let best: { preset: SourcePreset; score: number } = { preset: "generic", score: 0 };
  for (const preset of Object.keys(PRESETS) as SourcePreset[]) {
    if (preset === "generic") continue;
    const lookup = presetLookup(preset);
    const hits = norm.filter((h) => lookup.has(h)).length;
    const score = hits / headers.length;
    if (score > best.score) best = { preset, score };
  }
  if (best.score >= 0.5) return { preset: best.preset, score: round3(best.score) };
  return { preset: "generic", score: round3(1 - best.score) };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ---------- Mapping suggestion ----------

interface Candidate {
  target: TargetField;
  score: number;
  reason: ColumnMapping["reason"];
}

function headerCandidates(header: string): Candidate[] {
  const norm = normalizeHeader(header);
  const toks = tokens(header);
  const out: Candidate[] = [];
  for (const def of TARGET_FIELDS) {
    if (def.field === "ignore") continue;
    let best: Candidate | undefined;
    const consider = (c: Candidate) => {
      if (!best || c.score > best.score) best = c;
    };
    if (norm === normalizeHeader(def.label)) consider({ target: def.field, score: 0.95, reason: "header_exact" });
    for (const syn of def.synonyms) {
      const ns = normalizeHeader(syn);
      if (ns === norm) {
        consider({ target: def.field, score: 0.95, reason: "header_synonym" });
        continue;
      }
      if (norm.length >= 5 && ns.length >= 5 && levenshtein(norm, ns) <= 2) consider({ target: def.field, score: 0.75, reason: "header_synonym" });
      if (tokenOverlap(toks, tokens(syn)) >= 0.6) consider({ target: def.field, score: 0.75, reason: "header_synonym" });
    }
    if (best) out.push(best);
  }
  return out;
}

function shapeTarget(profile: ColumnProfile): TargetField | undefined {
  const h = normalizeHeader(profile.header);
  switch (profile.detectedKind) {
    case "phone":
      return "contact.phone";
    case "email":
      return "contact.email";
    case "money":
      return /deal|value/.test(h) ? "opportunity.amount" : "payment.amount";
    case "date":
      if (/appt|appoint|book|meet|call|demo|schedul/.test(h)) return "appointment.start";
      if (/paid|pay|close|won|sale/.test(h)) return "payment.date";
      return "opportunity.createdAt";
    case "boolean":
      if (/text|sms/.test(h)) return "contact.consent.sms";
      if (/email|mail/.test(h)) return "contact.consent.email";
      if (/call|phone/.test(h)) return "contact.consent.phone";
      if (/dnd|dnc|donot|optout|unsub|consent|subscri/.test(h)) return "contact.consent.sms";
      return undefined;
    default:
      return undefined;
  }
}

function kindAlternatives(kind: ColumnProfile["detectedKind"]): TargetField[] {
  return TARGET_FIELDS.filter((t) => t.field !== "ignore" && t.kind === kind).map((t) => t.field);
}

function finalizePlan(preset: SourcePreset, columns: ColumnMapping[]): MappingPlan {
  const mappedCount = columns.filter((c) => c.target !== "ignore" && c.reason !== "unmapped").length;
  const needsReview = columns.filter((c) => c.reason === "unmapped" || (c.target !== "ignore" && c.confidence < 0.8));
  return { preset, columns, mappedCount, totalColumns: columns.length, needsReview };
}

function unmapped(header: string, alternatives: TargetField[]): ColumnMapping {
  return { header, target: "ignore", confidence: 0, reason: "unmapped", alternatives: alternatives.slice(0, 3) };
}

/**
 * Enforces one column per target (except note.text and ignore). Columns are
 * visited by confidence, then file order; a later claimant is unmapped and
 * the contested target becomes its first alternative.
 */
function dedupeTargets(columns: ColumnMapping[]): ColumnMapping[] {
  const order = columns
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.confidence - a.c.confidence || a.i - b.i);
  const taken = new Set<TargetField>();
  const out = [...columns];
  for (const { c, i } of order) {
    if (c.reason === "unmapped" || MULTI_COLUMN_TARGETS.has(c.target)) continue;
    if (taken.has(c.target)) {
      out[i] = unmapped(c.header, [c.target, ...c.alternatives.filter((a) => a !== c.target)]);
      continue;
    }
    taken.add(c.target);
  }
  return out;
}

export function suggestMapping(profiles: ColumnProfile[], preset?: SourcePreset): MappingPlan {
  const chosen = preset ?? detectPreset(profiles.map((p) => p.header)).preset;
  const lookup = presetLookup(chosen);
  const columns: ColumnMapping[] = profiles.map((profile) => {
    const norm = normalizeHeader(profile.header);
    const candidates = headerCandidates(profile.header).sort((a, b) => b.score - a.score);
    const shape = shapeTarget(profile);
    const scored = new Map<TargetField, number>();
    for (const c of candidates) scored.set(c.target, c.score);
    if (shape) scored.set(shape, Math.max(scored.get(shape) ?? 0, 0.6));
    const ranked = [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    const alternativesExcluding = (t: TargetField | undefined) => ranked.filter((x) => x !== t).slice(0, 3);

    const presetTarget = lookup.get(norm);
    if (presetTarget) return { header: profile.header, target: presetTarget, confidence: 0.98, reason: "preset", alternatives: alternativesExcluding(presetTarget) };
    const top = candidates[0];
    if (top && top.score >= 0.95) return { header: profile.header, target: top.target, confidence: 0.95, reason: top.reason, alternatives: alternativesExcluding(top.target) };
    if (top && top.score >= 0.75) return { header: profile.header, target: top.target, confidence: 0.75, reason: top.reason, alternatives: alternativesExcluding(top.target) };
    if (shape) return { header: profile.header, target: shape, confidence: 0.6, reason: "value_shape", alternatives: alternativesExcluding(shape) };
    const alts = ranked.length ? ranked : kindAlternatives(profile.detectedKind);
    return unmapped(profile.header, alts);
  });
  return finalizePlan(chosen, dedupeTargets(columns));
}

/** A person's choice wins: confidence 1. Another column holding the same single-column target is released. */
export function applyManualMapping(plan: MappingPlan, header: string, target: TargetField): MappingPlan {
  if (!TARGET_BY_FIELD.has(target)) throw new Error(`unknown target field ${target}`);
  const columns = plan.columns.map((c) => {
    if (c.header === header) {
      return { ...c, target, confidence: 1, reason: "manual" as const, alternatives: c.alternatives.filter((a) => a !== target) };
    }
    if (c.target === target && !MULTI_COLUMN_TARGETS.has(target) && c.reason !== "unmapped") {
      return unmapped(c.header, [target, ...c.alternatives.filter((a) => a !== target)]);
    }
    return c;
  });
  if (!columns.some((c) => c.header === header)) throw new Error(`no column with header "${header}"`);
  return finalizePlan(plan.preset, columns);
}

// ---------- Row parsing ----------

type Channel = "phone" | "sms" | "email";
const CHANNELS: Channel[] = ["phone", "sms", "email"];

interface ParsedRow {
  index: number;
  hash: string;
  providerEventId: string;
  fullName?: string;
  phone?: string;
  email?: string;
  organizationName?: string;
  preferredLanguage?: string;
  consent: Partial<Record<Channel, ConsentState>>;
  source?: string;
  campaign?: string;
  leadTier?: number;
  status: CommercialStatus;
  statusRaw?: string;
  ownerName?: string;
  createdAt?: ISODateTime;
  requestText?: string;
  dqReason?: string;
  dealAmount?: ParsedMoney;
  appointment?: { start: ISODateTime; end?: ISODateTime; outcome: AppointmentInstanceOutcome; outcomeRaw?: string; repName?: string };
  payment?: { amount: ParsedMoney; date?: ISODateTime; providerRef?: string; kind?: LedgerEntryKind };
  note?: { text: string; at?: ISODateTime };
  issues: RowIssue[];
}

function normalizeLanguage(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const v = input.trim().toLowerCase();
  const names: Record<string, string> = { english: "en", spanish: "es", "español": "es", espanol: "es", french: "fr", portuguese: "pt", "português": "pt" };
  if (names[v]) return names[v];
  const m = /^([a-z]{2})(?:[-_][a-z]{2})?$/.exec(v);
  return m ? m[1] : input.trim();
}

function parseRow(plan: MappingPlan, headers: string[], row: string[], index: number, now: ISODateTime): ParsedRow {
  const issues: RowIssue[] = [];
  const byTarget = new Map<TargetField, { header: string; value: string }[]>();
  plan.columns.forEach((c) => {
    if (c.reason === "unmapped" || c.target === "ignore") return;
    const i = headers.indexOf(c.header);
    if (i < 0) return;
    const value = (row[i] ?? "").trim();
    const list = byTarget.get(c.target) ?? [];
    list.push({ header: c.header, value });
    byTarget.set(c.target, list);
  });
  const first = (t: TargetField) => byTarget.get(t)?.[0];
  const text = (t: TargetField): string | undefined => {
    const v = first(t)?.value;
    return v && v.length ? v : undefined;
  };
  const date = (t: TargetField): ISODateTime | undefined => {
    const cell = first(t);
    if (!cell || !cell.value) return undefined;
    const d = parseDate(cell.value);
    if (!d) issues.push({ row: index, header: cell.header, problem: "unrecognized date", value: cell.value, severity: "warning" });
    return d;
  };
  const moneyAt = (t: TargetField): { cell: { header: string; value: string }; parsed?: ParsedMoney } | undefined => {
    const cell = first(t);
    if (!cell || !cell.value) return undefined;
    return { cell, parsed: parseMoney(cell.value) };
  };

  const hash = fnv1a(row.join("\u001f"));
  const nowMs = Date.parse(now);

  let fullName = text("contact.fullName");
  if (!fullName) {
    const joined = [text("contact.firstName"), text("contact.lastName")].filter(Boolean).join(" ").trim();
    fullName = joined.length ? joined : undefined;
  }
  const phoneCell = first("contact.phone");
  const phone = normalizePhone(phoneCell?.value);
  if (phoneCell?.value && !phone) issues.push({ row: index, header: phoneCell.header, problem: "unrecognized phone", value: phoneCell.value, severity: "warning" });
  const emailCell = first("contact.email");
  const email = normalizeEmail(emailCell?.value);
  if (emailCell?.value && !email) issues.push({ row: index, header: emailCell.header, problem: "unrecognized email", value: emailCell.value, severity: "warning" });
  if (!phone && !email) {
    issues.push({ row: index, header: phoneCell?.header ?? emailCell?.header ?? "", problem: "no contact point", value: [phoneCell?.value, emailCell?.value].filter(Boolean).join(" / "), severity: "error" });
  }

  const consent: Partial<Record<Channel, ConsentState>> = {};
  for (const ch of CHANNELS) {
    const cell = first(`contact.consent.${ch}`);
    if (!cell || !cell.value) continue;
    const state = parseConsent(cell.value, isNegatedConsentHeader(cell.header));
    if (state === "unknown") {
      issues.push({ row: index, header: cell.header, problem: "unrecognized consent value", value: cell.value, severity: "warning" });
      continue;
    }
    if (state === "revoked" && consentScopeAll(cell.header)) {
      for (const all of CHANNELS) consent[all] = "revoked";
    } else if (consent[ch] !== "revoked") {
      consent[ch] = state;
    }
  }

  const tierRaw = text("opportunity.leadTier");
  let leadTier: number | undefined;
  if (tierRaw) {
    const n = Number.parseInt(tierRaw.replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(n)) leadTier = n;
    else issues.push({ row: index, header: first("opportunity.leadTier")!.header, problem: "unrecognized lead tier", value: tierRaw, severity: "warning" });
  }

  const statusRaw = text("opportunity.status");
  const status = parseStatus(statusRaw);
  const createdAt = date("opportunity.createdAt");

  const dealAmount = moneyAt("opportunity.amount");
  if (dealAmount && !dealAmount.parsed) issues.push({ row: index, header: dealAmount.cell.header, problem: "unrecognized amount", value: dealAmount.cell.value, severity: "warning" });

  // Appointment
  let appointment: ParsedRow["appointment"];
  const start = date("appointment.start");
  const outcomeRaw = text("appointment.outcome");
  if (start) {
    const end = date("appointment.end");
    let outcome = parseOutcome(outcomeRaw);
    const startMs = Date.parse(start);
    if (startMs > nowMs) {
      issues.push({ row: index, header: first("appointment.start")!.header, problem: "appointment is in the future", value: first("appointment.start")!.value, severity: "warning" });
      if (outcome === "unknown") outcome = "scheduled";
    } else if (outcome === "scheduled") {
      outcome = "unknown"; // past with no attendance evidence
    }
    if (outcomeRaw && parseOutcome(outcomeRaw) === "unknown") {
      issues.push({ row: index, header: first("appointment.outcome")!.header, problem: "unrecognized appointment outcome", value: outcomeRaw, severity: "warning" });
    }
    appointment = { start, end, outcome, outcomeRaw, repName: text("appointment.repName") };
  } else if (outcomeRaw && parseOutcome(outcomeRaw) !== "unknown") {
    issues.push({ row: index, header: first("appointment.outcome")!.header, problem: "appointment outcome without an appointment time", value: outcomeRaw, severity: "warning" });
  }

  // Payment
  let payment: ParsedRow["payment"];
  const amount = moneyAt("payment.amount");
  const paymentDate = date("payment.date");
  const providerRef = text("payment.providerRef");
  const kindRaw = text("payment.kind");
  if (amount) {
    if (!amount.parsed) {
      issues.push({ row: index, header: amount.cell.header, problem: "unrecognized amount", value: amount.cell.value, severity: "error" });
    } else {
      const kind = parsePaymentKind(kindRaw);
      if (kindRaw && !kind) issues.push({ row: index, header: first("payment.kind")!.header, problem: "unrecognized payment kind", value: kindRaw, severity: "warning" });
      payment = { amount: amount.parsed, date: paymentDate, providerRef, kind };
    }
  } else if ((providerRef || kindRaw) && !dealAmount) {
    const cell = first("payment.providerRef") ?? first("payment.kind")!;
    issues.push({ row: index, header: first("payment.amount")?.header ?? cell.header, problem: "payment without an amount", value: cell.value, severity: "error" });
  }

  // Notes: several columns may feed one note; a column that is not literally "notes" is prefixed with its header.
  const noteCells = (byTarget.get("note.text") ?? []).filter((c) => c.value.length > 0);
  const noteParts = noteCells.map((c) => (plainNoteHeaders.has(normalizeHeader(c.header)) && noteCells.length === 1 ? c.value : `${c.header}: ${c.value}`));
  const note = noteParts.length ? { text: noteParts.join("\n"), at: date("note.at") } : undefined;

  return {
    index,
    hash,
    providerEventId: `import:${hash}`,
    fullName,
    phone,
    email,
    organizationName: text("contact.organizationName"),
    preferredLanguage: normalizeLanguage(text("contact.preferredLanguage")),
    consent,
    source: text("opportunity.source"),
    campaign: text("opportunity.campaign"),
    leadTier,
    status,
    statusRaw,
    ownerName: text("opportunity.ownerName"),
    createdAt,
    requestText: text("opportunity.requestText"),
    dqReason: text("opportunity.dqReason"),
    dealAmount: dealAmount?.parsed,
    appointment,
    payment,
    note,
    issues,
  };
}

// ---------- Import ----------

const CONSENT_RANK: Record<ConsentState, number> = { unknown: 0, granted: 1, revoked: 2 };

function resolveUser(name: string | undefined, users: User[], tenantId: Id): User | undefined {
  if (!name) return undefined;
  const n = normalizeWord(name);
  if (!n) return undefined;
  const pool = users.filter((u) => u.tenantId === tenantId);
  const exact = pool.find((u) => normalizeWord(u.displayName) === n || normalizeWord(u.userId) === n);
  if (exact) return exact;
  const byFirst = pool.filter((u) => normalizeWord(u.displayName.split(/\s+/)[0]) === n);
  return byFirst.length === 1 ? byFirst[0] : undefined;
}

interface Group {
  contactId: Id;
  existing?: IntakeContact;
  contact: IntakeContact;
  rows: ParsedRow[];
  consentPreserved: number;
}

function fileHashOf(headers: string[], rows: string[][]): string {
  return fnv1a([headers.join("\u001f"), ...rows.map((r) => r.join("\u001f"))].join("\u001e"));
}

/**
 * Applies the plan to the rows. `dryRun` returns only the report; `runImport`
 * returns the records too. Both run the same code so the preview is exact.
 */
export function runImport(plan: MappingPlan, headers: string[], rows: string[][], ctx: ImportContext): ImportResult {
  const { tenantId, now } = ctx;
  const currency = ctx.defaultCurrency ?? "USD";
  const users = ctx.users ?? [];
  const fileHash = fileHashOf(headers, rows);
  const sourceId = `import:${plan.preset}`;
  const nowMs = Date.parse(now);

  const issues: RowIssue[] = [];
  const parsed: ParsedRow[] = rows.map((row, i) => parseRow(plan, headers, row, i, now));

  const alreadyImported = new Set((ctx.existingSubmissions ?? []).filter((s) => s.tenantId === tenantId).map((s) => s.providerEventId));
  const seenInFile = new Set<string>();
  const groups = new Map<Id, Group>();
  const fileIndex: IntakeContact[] = [];
  let duplicatesMerged = 0;
  let consentPreserved = 0;
  const applied: { row: ParsedRow; group: Group }[] = [];

  for (const row of parsed) {
    issues.push(...row.issues);
    if (row.issues.some((i) => i.severity === "error")) continue;
    if (alreadyImported.has(row.providerEventId)) {
      issues.push({ row: row.index, header: "", problem: "already imported", value: row.providerEventId, severity: "warning" });
      continue;
    }
    if (seenInFile.has(row.providerEventId)) {
      duplicatesMerged++;
      issues.push({ row: row.index, header: "", problem: "exact duplicate row", value: row.providerEventId, severity: "warning" });
      continue;
    }
    seenInFile.add(row.providerEventId);

    const identity = identify({ phone: row.phone, email: row.email }, [...ctx.existingContacts, ...fileIndex], tenantId);
    let group = groups.get(identity.contactId);
    if (!group) {
      const existing = ctx.existingContacts.find((c) => c.tenantId === tenantId && c.contactId === identity.contactId);
      const contact: IntakeContact = existing
        ? { ...existing, consent: { ...existing.consent } }
        : {
            tenantId,
            contactId: contactIdFor(tenantId, row.phone ?? row.email ?? "no-contact-point"),
            displayName: row.fullName ?? row.email ?? row.phone ?? "Unknown contact",
            consent: { phone: "unknown", sms: "unknown", email: "unknown" },
            preferredChannel: row.phone ? "phone" : "email",
          };
      group = { contactId: contact.contactId, existing, contact, rows: [], consentPreserved: 0 };
      groups.set(identity.contactId, group);
      fileIndex.push(group.contact);
    } else {
      duplicatesMerged++;
    }
    const c = group.contact;
    c.phone = c.phone ?? row.phone;
    c.email = c.email ?? row.email;
    if (!group.existing && (c.displayName === c.email || c.displayName === c.phone) && row.fullName) c.displayName = row.fullName;
    c.organizationName = c.organizationName ?? row.organizationName;
    c.preferredLanguage = c.preferredLanguage ?? row.preferredLanguage;
    for (const ch of CHANNELS) {
      const incoming = row.consent[ch];
      if (!incoming) continue;
      const current = c.consent[ch];
      if (current === "revoked" && incoming === "granted") {
        consentPreserved++;
        group.consentPreserved++;
        continue;
      }
      if (CONSENT_RANK[incoming] > CONSENT_RANK[current]) c.consent[ch] = incoming;
    }
    group.rows.push(row);
    applied.push({ row, group });
  }

  // Records
  const submissions: LeadSubmission[] = [];
  const opportunities: Opportunity[] = [];
  const appointments: Appointment[] = [];
  const instances: AppointmentInstance[] = [];
  const ledger: LedgerEntry[] = [];
  const events: DomainEvent[] = [];
  let notes = 0;
  let paymentCount = 0;
  let paymentTotal = 0;
  const oppByGroup = new Map<Id, Opportunity>();
  const rootSubmissionByGroup = new Map<Id, Id>();

  for (const { row, group } of applied) {
    const submissionId = submissionIdFor({ tenantId, sourceId, providerEventId: row.providerEventId });
    const rootSubmissionId = rootSubmissionByGroup.get(group.contactId);
    const hasAppointment = Boolean(row.appointment);
    const entryPath = hasAppointment ? "booked_entry" : "form_entry";
    const receivedAt = row.createdAt ?? now;

    submissions.push({
      tenantId,
      submissionId,
      providerEventId: row.providerEventId,
      source: sourceId,
      campaign: row.campaign,
      leadTier: row.leadTier,
      entryPath,
      receivedAt,
      requestText: row.requestText ?? "",
      contactId: group.contactId,
      duplicateOfSubmissionId: rootSubmissionId,
    });

    let opportunity = oppByGroup.get(group.contactId);
    const owner = resolveUser(row.ownerName, users, tenantId);
    if (row.ownerName && !owner) {
      const col = plan.columns.find((c) => c.target === "opportunity.ownerName");
      issues.push({ row: row.index, header: col?.header ?? "", problem: "unknown owner", value: row.ownerName, severity: "warning" });
    }
    if (!opportunity) {
      const opportunityId = opportunityIdFor(submissionId);
      opportunity = {
        tenantId,
        opportunityId,
        contactIds: [group.contactId],
        primaryContactId: group.contactId,
        offerId: DEFAULT_OFFER_ID,
        workflowVersion: DEFAULT_WORKFLOW_VERSION,
        entryPath,
        source: row.source ?? sourceId,
        leadTier: row.leadTier,
        commercialStatus: row.status,
        accountabilityStartedAt: receivedAt,
        currentOwner: {},
        contactState: "none",
        fitState: "unassessed",
        contractState: "none",
        paymentState: "none",
        dqReason: row.dqReason,
      };
      oppByGroup.set(group.contactId, opportunity);
      rootSubmissionByGroup.set(group.contactId, submissionId);
      opportunities.push(opportunity);
    } else {
      // Later rows for the same person enrich, first-known acquisition values stay (SOS-05).
      if (opportunity.commercialStatus === "open" && row.status !== "open") opportunity.commercialStatus = row.status;
      opportunity.leadTier = opportunity.leadTier ?? row.leadTier;
      opportunity.dqReason = opportunity.dqReason ?? row.dqReason;
      if (hasAppointment && opportunity.entryPath === "form_entry") opportunity.entryPath = "booked_entry";
      if (row.createdAt && row.createdAt < opportunity.accountabilityStartedAt) opportunity.accountabilityStartedAt = row.createdAt;
    }
    if (owner && !opportunity.currentOwner.closer && !opportunity.currentOwner.setter) {
      const role: "setter" | "closer" = owner.roles.includes("closer") || !owner.roles.includes("setter") ? "closer" : "setter";
      opportunity.currentOwner[role] = owner.userId;
    }

    const rowKey = `${tenantId}:migration:${fileHash}:${row.index}`;
    const appliedIds: Record<string, unknown> = {};

    if (row.appointment) {
      const rep = resolveUser(row.appointment.repName, users, tenantId) ?? owner;
      if (row.appointment.repName && !resolveUser(row.appointment.repName, users, tenantId)) {
        const col = plan.columns.find((c) => c.target === "appointment.repName");
        issues.push({ row: row.index, header: col?.header ?? "", problem: "unknown rep", value: row.appointment.repName, severity: "warning" });
      }
      const appointmentId = `apt_${fnv1a(`${rowKey}:appointment`)}`;
      const instanceId = `ai_${fnv1a(`${rowKey}:instance`)}`;
      const scheduledStart = row.appointment.start;
      const scheduledEnd = row.appointment.end ?? toIso(Date.parse(scheduledStart) + 30 * 60_000)!;
      const outcome = row.appointment.outcome;
      appointments.push({
        tenantId,
        appointmentId,
        opportunityId: opportunity.opportunityId,
        type: "sales",
        modality: "video",
        contactId: group.contactId,
        repUserId: rep?.userId ?? "unassigned",
        timezone: "UTC",
        purpose: row.requestText ?? "Imported appointment",
      });
      instances.push({
        tenantId,
        instanceId,
        appointmentId,
        opportunityId: opportunity.opportunityId,
        scheduledStart,
        scheduledEnd,
        confirmedByCustomer: false,
        retainedAfterReview: outcome !== "canceled_before_cutoff" && outcome !== "superseded_before_cutoff",
        outcome,
        attendanceEvidenceRefs: [],
        matured: Date.parse(scheduledEnd) < nowMs,
      });
      appliedIds.appointmentId = appointmentId;
      appliedIds.instanceId = instanceId;
    }

    // Cash: explicit payments always; a deal amount only when the deal is won (never invented cash).
    const cash: { amount: ParsedMoney; kind: LedgerEntryKind; providerRef: string; occurredAt: ISODateTime; suffix: string }[] = [];
    if (row.payment) {
      const kind: LedgerEntryKind = row.payment.amount.negative && row.payment.kind !== "dispute_debit" && row.payment.kind !== "fee" ? "refund" : (row.payment.kind ?? "payment_collected");
      cash.push({ amount: row.payment.amount, kind, providerRef: row.payment.providerRef ?? `import:${row.hash}`, occurredAt: row.payment.date ?? receivedAt, suffix: "payment" });
    }
    if (row.dealAmount && row.status === "won" && row.dealAmount.amountMinor > 0) {
      cash.push({ amount: row.dealAmount, kind: row.dealAmount.negative ? "refund" : "payment_collected", providerRef: `import:deal:${row.hash}`, occurredAt: row.payment?.date ?? receivedAt, suffix: "deal" });
    }
    for (const c of cash) {
      const entryCurrency = c.amount.currency ?? currency;
      const idempotencyKey = `${rowKey}:${c.suffix}`;
      ledger.push({
        tenantId,
        entryId: `led_${fnv1a(idempotencyKey)}`,
        opportunityId: opportunity.opportunityId,
        kind: c.kind,
        amount: { amountMinor: c.amount.amountMinor, currency: entryCurrency },
        providerRef: c.providerRef,
        idempotencyKey,
        occurredAt: c.occurredAt,
        receivedAt: now,
        commercialCategory: group.existing ? "other" : "new_customer",
      });
      paymentCount++;
      if (entryCurrency === currency) {
        const sign = c.kind === "payment_collected" || c.kind === "dispute_credit" ? 1 : c.kind === "fee" ? 0 : -1;
        paymentTotal += sign * c.amount.amountMinor;
      } else {
        const col = plan.columns.find((x) => x.target === "payment.amount" || x.target === "opportunity.amount");
        issues.push({ row: row.index, header: col?.header ?? "", problem: `currency ${entryCurrency} differs from ${currency}; not totaled`, value: String(c.amount.amountMinor), severity: "warning" });
      }
      if (c.kind === "refund" || c.kind === "dispute_debit") opportunity.paymentState = "refunded";
      else if (c.kind === "payment_collected" && opportunity.paymentState !== "refunded") opportunity.paymentState = "collected";
    }
    if (cash.length) appliedIds.ledgerEntryIds = ledger.slice(-cash.length).map((l) => l.entryId);

    if (row.note) notes++;

    events.push(
      createEvent({
        eventId: `ev_${fnv1a(rowKey)}`,
        tenantId,
        eventType: "import.row_applied",
        aggregateType: "lead_submission",
        aggregateId: submissionId,
        opportunityId: opportunity.opportunityId,
        occurredAt: now,
        receivedAt: now,
        actorType: "integration",
        actorId: sourceId,
        sourceSystem: "migration",
        sourceAccountId: fileHash,
        sourceEventId: String(row.index),
        correlationId: submissionId,
        payload: {
          preset: plan.preset,
          fileHash,
          row: row.index,
          rowHash: row.hash,
          contactId: group.contactId,
          contactMerged: Boolean(group.existing),
          duplicateOfSubmissionId: rootSubmissionId,
          status: row.status,
          statusRaw: row.statusRaw,
          originalSource: row.source,
          ownerName: row.ownerName,
          dealAmountMinor: row.dealAmount ? (row.dealAmount.negative ? -1 : 1) * row.dealAmount.amountMinor : undefined,
          note: row.note?.text,
          noteAt: row.note?.at,
          consent: row.consent,
          consentPreserved: group.consentPreserved,
          ...appliedIds,
        },
      }),
    );
  }

  const errorRows = new Set(issues.filter((i) => i.severity === "error").map((i) => i.row)).size;
  const contacts = [...groups.values()].map((g) => g.contact);
  const report: DryRunReport = {
    rows: rows.length,
    contacts: {
      create: contacts.filter((c) => !ctx.existingContacts.some((e) => e.tenantId === tenantId && e.contactId === c.contactId)).length,
      merge: contacts.filter((c) => ctx.existingContacts.some((e) => e.tenantId === tenantId && e.contactId === c.contactId)).length,
    },
    opportunities: opportunities.length,
    appointments: appointments.length,
    payments: { count: paymentCount, totalMinor: paymentTotal, currency },
    notes,
    duplicatesMerged,
    issues: issues.sort((a, b) => a.row - b.row || (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1)),
    unmappedColumns: plan.columns.filter((c) => c.reason === "unmapped").map((c) => c.header),
    consentPreserved,
    readyPercent: rows.length === 0 ? 100 : Math.round(((rows.length - errorRows) / rows.length) * 1000) / 10,
  };

  return { contacts, submissions, opportunities, appointments, instances, ledger, events, report };
}

/** Exact preview of what runImport would do, without the records. */
export function dryRun(plan: MappingPlan, headers: string[], rows: string[][], ctx: ImportContext): DryRunReport {
  return runImport(plan, headers, rows, ctx).report;
}
