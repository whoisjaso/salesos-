/**
 * Incident scope: what a data incident actually makes unreliable, and nothing else.
 *
 * Source: docs/DECISIONS.md, "A held measurement never holds the person" (2026-09-19),
 * with "Never show a list that looks ranked when ranking is not established" and SOS-21.
 *
 * Rules baked into this module:
 * - An incident declares the surfaces it makes unreliable. Every other surface keeps running.
 * - An incident with no declared scope holds nothing. Silence is never a global pause.
 * - Every hold names what it waits on, who owns it, and the limited effect in one sentence.
 * - Pure. `now` is injected and is optional; without it, nothing is held for being late.
 *
 * Surfaces are measurements, not screens. A consumer asks for the surfaces it
 * depends on (`holdFor`) rather than for "is anything wrong anywhere".
 *
 * Note on standings: an incident declares "standings" only when it attacks the
 * roster or the ranking itself. A board derives its own hold from the surfaces
 * its revenue basis depends on, through `standingsHold`, so a contracted-value
 * board is not held by an unlinked payment.
 */
import type {
  AffectedSurface,
  DataIncident,
  DataIncidentKind,
  ISODateTime,
  Id,
  IncidentOwnerRole,
  IncidentSubjects,
  MetricId,
  RevenueBasis,
  ScopedIncident,
  SurfaceDisposition,
} from "./types";
import { type Dataset, instanceEligible, instanceMatured, opportunityAttributedTo } from "./metrics";

// ---------- Surface vocabulary ----------

export const SURFACES: AffectedSurface[] = [
  "revenue_attribution",
  "commission",
  "standings",
  "attendance_outcome",
  "contact_permission",
  "communication_read",
];

export const SURFACE_LABEL: Record<AffectedSurface, string> = {
  revenue_attribution: "Collected revenue attribution",
  commission: "Commission",
  standings: "Standings",
  attendance_outcome: "Attendance outcome",
  contact_permission: "Contact permission",
  communication_read: "Conversation read",
};

/** Plural agreement for the one-sentence statements. */
const SURFACE_VERB: Record<AffectedSurface, "is" | "are"> = {
  revenue_attribution: "is",
  commission: "is",
  standings: "are",
  attendance_outcome: "is",
  contact_permission: "is",
  communication_read: "is",
};

/** What a held surface allows: show the figure and label it, or do not produce it at all. */
export const SURFACE_DISPOSITION: Record<AffectedSurface, Exclude<SurfaceDisposition, "reliable">> = {
  revenue_attribution: "provisional",
  commission: "provisional",
  standings: "withheld",
  attendance_outcome: "provisional",
  contact_permission: "withheld",
  communication_read: "provisional",
};

/** The remedial action a held surface asks for. Short, and owned by a named function. */
export const SURFACE_ACTION: Record<AffectedSurface, string> = {
  revenue_attribution: "verify payment mapping",
  commission: "verify payment mapping",
  standings: "resolve the measurement the standing rests on",
  attendance_outcome: "resolve attendance evidence",
  contact_permission: "record the contact's permission",
  communication_read: "review the conversation and confirm its outcome",
};

export const OWNER_LABEL: Record<IncidentOwnerRole, string> = {
  rep: "The rep",
  owner: "The owner",
  sales_ops: "Sales ops",
  finance: "Finance",
  marketing: "Marketing",
  product: "Product",
  delivery: "Delivery",
};

const OWNER_PHRASE: Record<IncidentOwnerRole, string> = {
  rep: "the rep",
  owner: "the owner",
  sales_ops: "sales ops",
  finance: "finance",
  marketing: "marketing",
  product: "product",
  delivery: "delivery",
};

/**
 * Which surfaces a metric's evidence rests on. A metric absent from this map
 * rests on none of them and can never be held by a data incident.
 */
export const METRIC_SURFACES: Partial<Record<MetricId, AffectedSurface[]>> = {
  M04: ["communication_read"],
  M08: ["attendance_outcome"],
  M09: ["attendance_outcome"],
  M10: ["attendance_outcome"],
  M12: ["attendance_outcome"],
  M16: ["revenue_attribution"],
  M17: ["revenue_attribution"],
  M18: ["revenue_attribution"],
  M19: ["revenue_attribution", "commission"],
  M20: ["commission"],
  M21: ["commission"],
};

export function surfacesForMetric(metricId: MetricId): AffectedSurface[] {
  return METRIC_SURFACES[metricId] ?? [];
}

/** The surfaces a revenue basis depends on. Contracted value does not depend on payment attribution. */
export const BASIS_SURFACES: Record<RevenueBasis, AffectedSurface[]> = {
  net_collected_cash: ["revenue_attribution"],
  contracted_value: [],
  reported_revenue: [],
};

// ---------- Scope result ----------

export interface SurfaceStatus {
  surface: AffectedSurface;
  label: string;
  held: boolean;
  disposition: SurfaceDisposition;
  /** The incidents behind this surface, worst severity first. Empty when reliable. */
  incidents: ScopedIncident[];
  owner?: IncidentOwnerRole;
  ownerLabel?: string;
  /** What has to happen for the hold to lift. */
  waitingOn?: string;
  /** The remedial action, owned by `owner`. */
  action?: string;
  /** One sentence in plain words, ready to render. */
  statement: string;
}

export interface IncidentScope {
  /** Set when the scope was narrowed to one person's work. */
  userId?: Id;
  /** Every open incident, worst severity first. */
  incidents: ScopedIncident[];
  /** Only the surfaces an incident actually touches. */
  affected: SurfaceStatus[];
  /** Every surface, held or not, for a direct lookup. */
  surfaces: Record<AffectedSurface, SurfaceStatus>;
}

export interface StaleSyncInput {
  /** The connection that is behind, e.g. "Payments provider". */
  label: string;
  surfaces: AffectedSurface[];
  lastSyncedAt: ISODateTime;
  /** Hours after which the sync is stale. Default STALE_SYNC_HOURS. */
  staleAfterHours?: number;
  owner?: IncidentOwnerRole;
}

export interface IncidentScopeOptions {
  /** Narrow to the opportunities this person is accountable for. */
  userId?: Id;
  /** Injected time. Without it nothing is held for being late or for being matured. */
  now?: ISODateTime;
  /** Incidents recorded elsewhere. One with no declared scope holds nothing. */
  declared?: DataIncident[];
  /** Connections whose freshness is known to the caller. */
  staleSyncs?: StaleSyncInput[];
}

export const STALE_SYNC_HOURS = 24;

const SEVERITY_ORDER: Record<ScopedIncident["severity"], number> = { critical: 0, warning: 1, info: 2 };

// ---------- Small helpers ----------

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

function verb(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}

function earliest(times: ISODateTime[]): ISODateTime {
  return [...times].sort()[0];
}

function worstOf(incidents: ScopedIncident[]): ScopedIncident {
  return [...incidents].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0];
}

function ownedOpportunityIds(dataset: Dataset, userId?: Id): Set<Id> | null {
  if (!userId) return null;
  return new Set(
    dataset.opportunities
      .filter((o) => opportunityAttributedTo(o, dataset.assignments, userId))
      .map((o) => o.opportunityId),
  );
}

function mine(ids: Set<Id> | null, opportunityId?: Id): boolean {
  if (ids === null) return true;
  return opportunityId !== undefined && ids.has(opportunityId);
}

// ---------- Detectors ----------

/**
 * Unlinked payments. Attribution-dependent revenue and commission are provisional
 * for everyone, because the payment could belong to anyone. Never scoped to one rep.
 */
function unlinkedPayments(dataset: Dataset): ScopedIncident | undefined {
  const entries = dataset.ledger.filter((e) => e.opportunityId === undefined);
  if (entries.length === 0) return undefined;
  const n = entries.length;
  const waitingOn = `${plural(n, "unlinked payment")} ${verb(n, "is", "are")} mapped to an opportunity or recorded as an audited exception`;
  return {
    incidentId: "inc_unlinked_payment",
    kind: "unlinked_payment",
    severity: "warning",
    title: `${plural(n, "payment")} not linked to an opportunity`,
    surfaces: ["revenue_attribution", "commission"],
    owner: "sales_ops",
    ownerLabel: OWNER_LABEL.sales_ops,
    effect: `Collected revenue attribution and commission are provisional while ${plural(n, "payment")} ${verb(n, "sits", "sit")} in the exception queue; calling, appointments, conversation coaching, and every other verified result keep running.`,
    waitingOn,
    openedAt: earliest(entries.map((e) => e.receivedAt)),
    subjects: { ledgerEntryIds: entries.map((e) => e.entryId) },
    evidenceRefs: entries.map((e) => e.entryId),
    count: n,
  };
}

/** Matured appointments whose attendance is not evidenced. Holds those meetings, not the rest of the day. */
function unresolvedAttendance(dataset: Dataset, ids: Set<Id> | null, now?: ISODateTime): ScopedIncident | undefined {
  const open = dataset.appointmentInstances.filter((inst) => {
    if (!mine(ids, inst.opportunityId)) return false;
    if (!instanceEligible(inst)) return false;
    const matured = now ? instanceMatured(inst, now) : inst.matured;
    if (!matured) return false;
    return inst.outcome === "unknown" || inst.outcome === "scheduled";
  });
  if (open.length === 0) return undefined;
  const n = open.length;
  return {
    incidentId: "inc_unresolved_attendance",
    kind: "unresolved_attendance",
    severity: "warning",
    title: `${plural(n, "appointment")} with unresolved attendance`,
    surfaces: ["attendance_outcome"],
    owner: "sales_ops",
    ownerLabel: OWNER_LABEL.sales_ops,
    effect: `${plural(n, "matured appointment")} ${verb(n, "has", "have")} no attendance evidence, so the show rate is a bound on those meetings only; other meetings, lead work, and coaching from conversations are unaffected.`,
    waitingOn: `${plural(n, "unresolved attendance outcome")} ${verb(n, "is", "are")} evidenced`,
    openedAt: earliest(open.map((i) => i.scheduledEnd)),
    subjects: {
      appointmentInstanceIds: open.map((i) => i.instanceId),
      opportunityIds: [...new Set(open.map((i) => i.opportunityId))],
    },
    evidenceRefs: open.map((i) => i.instanceId),
    count: n,
  };
}

/** Refunds and disputes under review restate the cash, not the person's activity. */
function refundsUnderReview(dataset: Dataset, ids: Set<Id> | null): ScopedIncident | undefined {
  const entries = dataset.ledger.filter(
    (e) => (e.kind === "refund" || e.kind === "dispute_debit") && mine(ids, e.opportunityId),
  );
  if (entries.length === 0) return undefined;
  const n = entries.length;
  return {
    incidentId: "inc_refund_under_review",
    kind: "refund_under_review",
    severity: "warning",
    title: `${plural(n, "refund or dispute")} under review`,
    surfaces: ["revenue_attribution", "commission"],
    owner: "finance",
    ownerLabel: OWNER_LABEL.finance,
    effect: `${plural(n, "refund or dispute")} restates the collected cash on ${verb(n, "that opportunity", "those opportunities")}, so revenue and commission on ${verb(n, "it", "them")} are provisional; verified activity, levels, and streaks are untouched.`,
    waitingOn: `${plural(n, "refund or dispute")} ${verb(n, "is", "are")} settled and the cohort restated`,
    openedAt: earliest(entries.map((e) => e.occurredAt)),
    subjects: {
      ledgerEntryIds: entries.map((e) => e.entryId),
      opportunityIds: [...new Set(entries.map((e) => e.opportunityId).filter((x): x is Id => x !== undefined))],
    },
    evidenceRefs: entries.map((e) => e.entryId),
    count: n,
  };
}

function contactsOnOpportunities(dataset: Dataset, ids: Set<Id> | null): { contactIds: Set<Id>; since: ISODateTime } {
  const contactIds = new Set<Id>();
  const starts: ISODateTime[] = [];
  for (const opp of dataset.opportunities) {
    if (!mine(ids, opp.opportunityId)) continue;
    for (const contactId of opp.contactIds) contactIds.add(contactId);
    contactIds.add(opp.primaryContactId);
    starts.push(opp.accountabilityStartedAt);
  }
  return { contactIds, since: starts.length ? earliest(starts) : "" };
}

/** A channel with no permission record. Holds that channel, and says so. */
function missingConsentRecords(dataset: Dataset, ids: Set<Id> | null): ScopedIncident | undefined {
  const { contactIds, since } = contactsOnOpportunities(dataset, ids);
  const contacts = dataset.contacts.filter(
    (c) => contactIds.has(c.contactId) && Object.values(c.consent).some((s) => s === "unknown"),
  );
  if (contacts.length === 0) return undefined;
  const n = contacts.length;
  return {
    incidentId: "inc_missing_consent_record",
    kind: "missing_consent_record",
    severity: "info",
    title: `${plural(n, "contact")} with no permission record on a channel`,
    surfaces: ["contact_permission"],
    owner: "sales_ops",
    ownerLabel: OWNER_LABEL.sales_ops,
    effect: `${plural(n, "contact")} ${verb(n, "has", "have")} no recorded permission on at least one channel, so that channel stays unavailable for ${verb(n, "them", "them")}; permitted channels, appointments, and every measurement keep running.`,
    waitingOn: `the permission record for ${plural(n, "contact")} is captured`,
    openedAt: since,
    subjects: { contactIds: contacts.map((c) => c.contactId) },
    evidenceRefs: contacts.map((c) => c.contactId),
    count: n,
  };
}

/** A revoked channel is a real restriction, not an unreliable measurement. It blocks one action. */
function contactRestrictions(dataset: Dataset, ids: Set<Id> | null): ScopedIncident | undefined {
  const { contactIds, since } = contactsOnOpportunities(dataset, ids);
  const contacts = dataset.contacts.filter(
    (c) => contactIds.has(c.contactId) && Object.values(c.consent).some((s) => s === "revoked"),
  );
  if (contacts.length === 0) return undefined;
  const n = contacts.length;
  return {
    incidentId: "inc_contact_restriction",
    kind: "contact_restriction",
    severity: "info",
    title: `${plural(n, "contact")} opted out of a channel`,
    surfaces: ["contact_permission"],
    owner: "rep",
    ownerLabel: OWNER_LABEL.rep,
    effect: `${plural(n, "contact")} withdrew permission on a channel, so that one action is blocked with its reason; the other channels, the opportunity, and the rep's measurements are unaffected.`,
    waitingOn: "the customer grants permission again, and until then the channel stays closed",
    openedAt: since,
    subjects: { contactIds: contacts.map((c) => c.contactId) },
    evidenceRefs: contacts.map((c) => c.contactId),
    count: n,
  };
}

/** A call whose outcome was never read. The read is tentative or absent; the conversation still happened. */
function unreviewedCommunication(dataset: Dataset, ids: Set<Id> | null): ScopedIncident | undefined {
  const calls = dataset.calls.filter(
    (c) =>
      mine(ids, c.opportunityId) &&
      c.transportState === "ended" &&
      (c.interpretedOutcome === "unknown" || !c.outcomeConfirmedBy),
  );
  if (calls.length === 0) return undefined;
  const n = calls.length;
  return {
    incidentId: "inc_unreviewed_communication",
    kind: "unreviewed_communication",
    severity: "info",
    title: `${plural(n, "call")} with no confirmed outcome`,
    surfaces: ["communication_read"],
    owner: "rep",
    ownerLabel: OWNER_LABEL.rep,
    effect: `${plural(n, "call")} ${verb(n, "has", "have")} no confirmed outcome, so the read on ${verb(n, "it", "them")} is tentative; the brief, the known facts, and the conversation continue.`,
    waitingOn: `${plural(n, "call outcome")} ${verb(n, "is", "are")} reviewed and confirmed`,
    openedAt: earliest(calls.map((c) => c.endedAt ?? c.startedAt ?? "")),
    subjects: {
      callIds: calls.map((c) => c.callId),
      opportunityIds: [...new Set(calls.map((c) => c.opportunityId))],
    },
    evidenceRefs: calls.map((c) => c.callId),
    count: n,
  };
}

/** A connection behind its freshness window. Holds the surfaces the caller declared, and no others. */
function staleSyncs(inputs: StaleSyncInput[], now?: ISODateTime): ScopedIncident[] {
  if (!now) return []; // Without an injected clock, nothing is late. Never hold on a missing time.
  const out: ScopedIncident[] = [];
  for (const input of inputs) {
    const limit = (input.staleAfterHours ?? STALE_SYNC_HOURS) * 3_600_000;
    const behindMs = Date.parse(now) - Date.parse(input.lastSyncedAt);
    if (!(behindMs > limit)) continue;
    const hours = Math.floor(behindMs / 3_600_000);
    const owner = input.owner ?? "sales_ops";
    const surfaces = [...input.surfaces];
    out.push({
      incidentId: `inc_stale_sync:${input.label}`,
      kind: "stale_sync",
      severity: "warning",
      title: `${input.label} last synced ${plural(hours, "hour")} ago`,
      surfaces,
      owner,
      ownerLabel: OWNER_LABEL[owner],
      effect: `${input.label} is ${plural(hours, "hour")} behind, so ${surfaces.map((s) => SURFACE_LABEL[s].toLowerCase()).join(" and ")} can move when it catches up; everything that does not read from it is unaffected.`,
      waitingOn: `${input.label} finishes a sync`,
      openedAt: input.lastSyncedAt,
      subjects: {},
      evidenceRefs: [],
      count: 1,
    });
  }
  return out;
}

/**
 * An incident recorded elsewhere. It holds exactly the surfaces it declares.
 * One that declares none is listed and holds nothing: an unscoped worry is not a pause.
 */
function fromDeclared(declared: DataIncident[]): ScopedIncident[] {
  return declared.map((d) => {
    const surfaces = d.surfaces ?? [];
    const owner: IncidentOwnerRole = d.ownerRole ?? d.owner ?? "owner";
    const waitingOn = d.waitingOn ?? `${d.title} is resolved`;
    return {
      incidentId: d.incidentId,
      kind: d.kind ?? "declared",
      severity: d.severity,
      title: d.title,
      surfaces,
      owner,
      ownerLabel: OWNER_LABEL[owner],
      effect:
        d.effect ??
        (surfaces.length === 0
          ? `${d.title} is recorded against ${d.affected}; it holds no measurement on its own until its scope is declared.`
          : `${d.title} affects ${surfaces.map((s) => SURFACE_LABEL[s].toLowerCase()).join(" and ")} only; everything else keeps running.`),
      waitingOn,
      openedAt: d.openedAt,
      subjects: d.subjects ?? {},
      evidenceRefs: [],
      count: 1,
    } satisfies ScopedIncident;
  });
}

// ---------- Scope ----------

function statusFor(surface: AffectedSurface, incidents: ScopedIncident[]): SurfaceStatus {
  const label = SURFACE_LABEL[surface];
  const be = SURFACE_VERB[surface];
  if (incidents.length === 0) {
    return {
      surface,
      label,
      held: false,
      disposition: "reliable",
      incidents: [],
      statement: `${label} ${be} established; no open incident touches it.`,
    };
  }
  const ordered = [...incidents].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const worst = ordered[0];
  const disposition = SURFACE_DISPOSITION[surface];
  const waitingOn = ordered.map((i) => i.waitingOn).join(", and ");
  const state = disposition === "withheld" ? "not established" : "provisional";
  return {
    surface,
    label,
    held: true,
    disposition,
    incidents: ordered,
    owner: worst.owner,
    ownerLabel: worst.ownerLabel,
    waitingOn,
    action: SURFACE_ACTION[surface],
    statement: `${label} ${be} ${state} until ${waitingOn}; ${OWNER_PHRASE[worst.owner]} owns that, and nothing else is held.`,
  };
}

/**
 * Every open incident with the surfaces it makes unreliable, the owner who
 * resolves it, and a one-sentence statement of the limited effect.
 *
 * With `userId`, opportunity-bound incidents are narrowed to that person's work.
 * Unlinked payments are never narrowed: an unattributed payment could be anyone's.
 */
export function scopeIncidents(dataset: Dataset, options: IncidentScopeOptions = {}): IncidentScope {
  const ids = ownedOpportunityIds(dataset, options.userId);
  const found: (ScopedIncident | undefined)[] = [
    unlinkedPayments(dataset),
    unresolvedAttendance(dataset, ids, options.now),
    refundsUnderReview(dataset, ids),
    missingConsentRecords(dataset, ids),
    contactRestrictions(dataset, ids),
    unreviewedCommunication(dataset, ids),
  ];
  const incidents = [
    ...found.filter((i): i is ScopedIncident => i !== undefined),
    ...staleSyncs(options.staleSyncs ?? [], options.now),
    ...fromDeclared(options.declared ?? []),
  ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.incidentId.localeCompare(b.incidentId));

  const surfaces = {} as Record<AffectedSurface, SurfaceStatus>;
  for (const surface of SURFACES) {
    surfaces[surface] = statusFor(
      surface,
      incidents.filter((i) => i.surfaces.includes(surface)),
    );
  }
  return {
    userId: options.userId,
    incidents,
    affected: SURFACES.map((s) => surfaces[s]).filter((s) => s.held),
    surfaces,
  };
}

/** An empty scope: nothing is held. Useful as a default in pure consumers. */
export function emptyScope(): IncidentScope {
  const surfaces = {} as Record<AffectedSurface, SurfaceStatus>;
  for (const surface of SURFACES) surfaces[surface] = statusFor(surface, []);
  return { incidents: [], affected: [], surfaces };
}

export function surfaceStatus(scope: IncidentScope, surface: AffectedSurface): SurfaceStatus {
  return scope.surfaces[surface];
}

export function isHeld(scope: IncidentScope, surface: AffectedSurface): boolean {
  return scope.surfaces[surface].held;
}

export function heldSurfaces(scope: IncidentScope): AffectedSurface[] {
  return scope.affected.map((s) => s.surface);
}

/**
 * "Is THIS number provisional, and why." Ask with the surfaces the number rests
 * on; the answer is the worst hold among them, or null when the number stands.
 */
export function holdFor(scope: IncidentScope, surfaces: AffectedSurface[]): SurfaceStatus | null {
  const held = surfaces.map((s) => scope.surfaces[s]).filter((s) => s.held);
  if (held.length === 0) return null;
  return [...held].sort(
    (a, b) => SEVERITY_ORDER[worstOf(a.incidents).severity] - SEVERITY_ORDER[worstOf(b.incidents).severity],
  )[0];
}

/** The hold on one metric's figure, through the surfaces its evidence rests on. */
export function holdForMetric(scope: IncidentScope, metricId: MetricId): SurfaceStatus | null {
  return holdFor(scope, surfacesForMetric(metricId));
}

/**
 * The hold on a ranking, given the basis it ranks on. A board asks this, and so
 * does a rep's own rank, so the two can never contradict each other.
 */
export function standingsHold(scope: IncidentScope, basis: RevenueBasis): SurfaceStatus | null {
  return holdFor(scope, ["standings", ...BASIS_SURFACES[basis]]);
}

/** The incidents that touch a given surface, worst severity first. */
export function incidentsForSurface(scope: IncidentScope, surface: AffectedSurface): ScopedIncident[] {
  return scope.surfaces[surface].incidents;
}

/** Does this incident cover this record? Used to mark one row, not the whole list. */
export function covers(incident: ScopedIncident, subject: keyof IncidentSubjects, id: Id): boolean {
  return (incident.subjects[subject] ?? []).includes(id);
}

export function incidentKinds(scope: IncidentScope): DataIncidentKind[] {
  return [...new Set(scope.incidents.map((i) => i.kind))];
}
