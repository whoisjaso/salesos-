"use client";

/**
 * Client onboarding store: identity, businesses, memberships, invites, and the
 * first leads of a brand-new business (docs/ONBOARDING.md). Persisted to
 * localStorage under "sos-onboarding", same pattern as src/lib/session.tsx.
 *
 * The domain functions in src/domain/onboarding.ts do the work; this file only
 * holds state, injects `now` and `rng`, and answers "what does this tenant have".
 * The demo tenant ("obavia") reads the synthetic fixture dataset; any business
 * created here starts with zero rows, so its empty states are real.
 */
import { useMemo, useSyncExternalStore } from "react";
import type { Accent } from "@/domain/profile";
import {
  acceptInvite,
  changeRole,
  createInvite,
  createTenant,
  inviteState,
  onboardingChecklist,
  revokeInvite,
  setActive,
  switchTenant,
  tenantsFor,
  type AcceptInviteResult,
  type ChecklistFlags,
  type EmptyStateCounts,
  type Identity,
  type Invite,
  type InviteKind,
  type InviteRole,
  type Membership,
  type OnboardingChecklist,
  type TenantSession,
} from "@/domain/onboarding";
import { contactIdFor, DEFAULT_OFFER_ID, DEFAULT_WORKFLOW_VERSION, normalizePhone, opportunityIdFor, submissionIdFor, trackingSnippet } from "@/domain/intake";
import type { Contact, DomainEvent, Id, ISODateTime, LeadSubmission, Opportunity, Pair, Role, Tenant, User } from "@/domain/types";
import type { Dataset } from "@/domain/metrics";
import { SimulatedAuthAdapter } from "@/data/auth";
import { obaviaDataset, TENANT_ID as DEMO_TENANT_ID } from "@/fixtures/obavia";
import { SEED_CONNECTED_COUNT } from "@/components/connect/connect-model";
import { useSession } from "@/lib/session";

export { DEMO_TENANT_ID };
export const ONBOARDING_KEY = "sos-onboarding";

/** Wall clock for client stamps. Domain code takes `now` injected. */
export function clientNow(): ISODateTime {
  return new Date().toISOString();
}

const rng = () => Math.random();

/** One simulated adapter for the whole page, so a sent link can be opened later in the same session. */
export const auth = new SimulatedAuthAdapter({ now: clientNow });

// ---------- State ----------

export interface ManualLead {
  tenantId: Id;
  createdBy: Id;
  /** E.164, for the dial button. Contacts carry consent, not numbers, in this dataset. */
  phone: string;
  contact: Contact;
  submission: LeadSubmission;
  opportunity: Opportunity;
}

/** Logo and accent of a business created here. The name, timezone, and currency live on the Tenant. */
export interface BusinessBrand {
  tenantId: Id;
  accent: Accent;
  logoDataUrl?: string;
  completedAt?: ISODateTime;
}

export interface OnboardingState {
  identity: Identity | null;
  tenants: Tenant[];
  users: User[];
  memberships: Membership[];
  invites: Invite[];
  pairs: Pair[];
  leads: ManualLead[];
  brands: BusinessBrand[];
  /** Connected source ids per business created here. The demo tenant reads the fixture. */
  sources: Record<Id, string[]>;
  events: DomainEvent[];
}

export const EMPTY_STATE: OnboardingState = {
  identity: null,
  tenants: [],
  users: [],
  memberships: [],
  invites: [],
  pairs: [],
  leads: [],
  brands: [],
  sources: {},
  events: [],
};

const EVENT = "sos-onboarding-change";
const LOADING = "loading" as const;
let cached: OnboardingState | undefined;

function readStored(): OnboardingState {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      identity: parsed.identity ?? null,
      tenants: parsed.tenants ?? [],
      users: parsed.users ?? [],
      memberships: parsed.memberships ?? [],
      invites: parsed.invites ?? [],
      pairs: parsed.pairs ?? [],
      leads: parsed.leads ?? [],
      brands: parsed.brands ?? [],
      sources: parsed.sources ?? {},
      events: parsed.events ?? [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

function writeStored(next: OnboardingState) {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable or full: the state still applies for this page */
  }
  cached = next;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === ONBOARDING_KEY) {
      cached = undefined;
      onChange();
    }
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): OnboardingState {
  if (cached === undefined) cached = readStored();
  return cached;
}

function getServerSnapshot(): typeof LOADING {
  return LOADING;
}

function current(): OnboardingState {
  return getSnapshot();
}

function update(fn: (s: OnboardingState) => OnboardingState) {
  writeStored(fn(current()));
}

// ---------- Members ----------

export interface Member {
  user: User;
  membership: Membership;
  /** From the synthetic fixture, not created through onboarding. */
  fixture: boolean;
}

function fixtureMembership(u: User): Membership {
  const role = (["owner", "closer", "setter"] as Role[]).find((r) => u.roles.includes(r)) ?? u.roles[0];
  return { tenantId: u.tenantId, userId: u.userId, identityId: `fixture:${u.userId}`, role, active: u.active, joinedAt: u.startedAt };
}

/** Everyone in a business: fixture people for the demo tenant, plus anyone who joined here. Store records win. */
export function membersOf(state: OnboardingState, tenantId: Id): Member[] {
  const out: Member[] = [];
  if (tenantId === DEMO_TENANT_ID) {
    for (const u of obaviaDataset.users) {
      const stored = state.memberships.find((m) => m.tenantId === tenantId && m.userId === u.userId);
      const user = state.users.find((x) => x.tenantId === tenantId && x.userId === u.userId) ?? u;
      out.push({ user, membership: stored ?? fixtureMembership(u), fixture: true });
    }
  }
  for (const m of state.memberships) {
    if (m.tenantId !== tenantId) continue;
    if (out.some((x) => x.membership.userId === m.userId)) continue;
    const user = state.users.find((u) => u.tenantId === tenantId && u.userId === m.userId);
    if (user) out.push({ user, membership: m, fixture: false });
  }
  return out;
}

export function tenantById(state: OnboardingState, tenantId: Id): Tenant | undefined {
  if (tenantId === DEMO_TENANT_ID) return obaviaDataset.tenant;
  return state.tenants.find((t) => t.tenantId === tenantId);
}

/** The name people see: the demo tenant's fixture label is long, so it stays "Obavia" in the shell. */
export function tenantDisplayName(state: OnboardingState, tenantId: Id | undefined, fallback = "Obavia"): string {
  if (!tenantId || tenantId === DEMO_TENANT_ID) return fallback;
  return tenantById(state, tenantId)?.name ?? fallback;
}

// ---------- Actions ----------

export function setIdentity(identity: Identity | null) {
  update((s) => ({ ...s, identity }));
}

export interface CreateBusinessInput {
  name: string;
  timezone: string;
  currency: string;
}

export function createBusiness(input: CreateBusinessInput, identity: Identity): { tenant: Tenant; session: TenantSession } {
  const result = createTenant({ ...input, ownerIdentity: identity, now: clientNow(), rng });
  update((s) => ({
    ...s,
    tenants: [...s.tenants, result.tenant],
    users: [...s.users, result.owner],
    memberships: [...s.memberships, result.membership],
    events: [...s.events, ...result.events],
  }));
  return {
    tenant: result.tenant,
    session: { userId: result.owner.userId, role: "owner", displayName: result.owner.displayName, tenantId: result.tenant.tenantId },
  };
}

export function saveBrand(brand: BusinessBrand) {
  update((s) => ({ ...s, brands: [...s.brands.filter((b) => b.tenantId !== brand.tenantId), brand] }));
}

export interface SendInviteInput {
  tenantId: Id;
  kind: InviteKind;
  target?: string;
  role: InviteRole;
  pairWithUserId?: Id;
  createdBy: Id;
}

/** Throws with a plain message when the target is not valid; the sheet shows it under the field. */
export function sendInvite(input: SendInviteInput): Invite {
  const invite = createInvite({ ...input, now: clientNow(), rng });
  update((s) => ({ ...s, invites: [...s.invites, invite] }));
  return invite;
}

export function revoke(inviteId: Id, by: Id) {
  const now = clientNow();
  update((s) => ({ ...s, invites: s.invites.map((i) => (i.inviteId === inviteId ? revokeInvite(i, by, now) : i)) }));
}

export function pendingTeamCode(state: OnboardingState, tenantId: Id, now: ISODateTime): Invite | undefined {
  return state.invites.find((i) => i.tenantId === tenantId && i.kind === "team_code" && inviteState(i, now) === "pending");
}

/** Revokes any live code for the business and issues a fresh one with the given role. */
export function regenerateTeamCode(tenantId: Id, role: InviteRole, by: Id): Invite {
  const now = clientNow();
  const fresh = createInvite({ tenantId, kind: "team_code", role, createdBy: by, now, rng });
  update((s) => ({
    ...s,
    invites: [...s.invites.map((i) => (i.tenantId === tenantId && i.kind === "team_code" ? revokeInvite(i, by, now) : i)), fresh],
  }));
  return fresh;
}

/** A 32-hex token from a link, or a 6-character team code typed by hand (case and spaces ignored). */
export function findInvite(state: OnboardingState, raw: string): Invite | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const byToken = state.invites.find((i) => i.token === value);
  if (byToken) return byToken;
  const code = value.replace(/[\s-]/g, "").toUpperCase();
  const codes = state.invites.filter((i) => i.kind === "team_code" && i.token === code);
  // The live code wins over an older revoked one with the same letters.
  const now = clientNow();
  return codes.find((i) => inviteState(i, now) === "pending") ?? codes[codes.length - 1];
}

export function accept(invite: Invite, identity: Identity): AcceptInviteResult {
  const s = current();
  const result = acceptInvite({
    invite,
    identity,
    existingUsers: [...obaviaDataset.users, ...s.users],
    existingMemberships: s.memberships,
    now: clientNow(),
    rng,
  });
  if (!result.ok) return result;
  update((st) => ({
    ...st,
    users: [...st.users, result.user],
    memberships: [...st.memberships, result.membership],
    pairs: result.pair ? [...st.pairs, result.pair] : st.pairs,
    invites: st.invites.map((i) => (i.inviteId === invite.inviteId ? result.invite : i)),
    events: [...st.events, ...result.events],
  }));
  return result;
}

/** A fixture person becomes a stored record the first time the owner changes them. */
function materialize(s: OnboardingState, tenantId: Id, userId: Id): { state: OnboardingState; member: Member } | null {
  const member = membersOf(s, tenantId).find((m) => m.membership.userId === userId);
  if (!member) return null;
  const hasUser = s.users.some((u) => u.tenantId === tenantId && u.userId === userId);
  const hasMembership = s.memberships.some((m) => m.tenantId === tenantId && m.userId === userId);
  return {
    state: {
      ...s,
      users: hasUser ? s.users : [...s.users, member.user],
      memberships: hasMembership ? s.memberships : [...s.memberships, member.membership],
    },
    member,
  };
}

export function changeMemberRole(tenantId: Id, userId: Id, role: InviteRole, by: Id) {
  update((s) => {
    const m = materialize(s, tenantId, userId);
    if (!m) return s;
    const change = changeRole(m.member.user, m.member.membership, role, by, clientNow(), rng);
    return {
      ...m.state,
      users: m.state.users.map((u) => (u.tenantId === tenantId && u.userId === userId ? change.user : u)),
      memberships: m.state.memberships.map((x) => (x.tenantId === tenantId && x.userId === userId ? change.membership : x)),
      events: [...m.state.events, ...change.events],
    };
  });
}

export function setMemberActive(tenantId: Id, userId: Id, active: boolean, by: Id) {
  update((s) => {
    const m = materialize(s, tenantId, userId);
    if (!m) return s;
    const change = setActive(m.member.user, m.member.membership, active, by, clientNow(), rng);
    return {
      ...m.state,
      users: m.state.users.map((u) => (u.tenantId === tenantId && u.userId === userId ? change.user : u)),
      memberships: m.state.memberships.map((x) => (x.tenantId === tenantId && x.userId === userId ? change.membership : x)),
      events: [...m.state.events, ...change.events],
    };
  });
}

export interface AddLeadInput {
  name: string;
  phone: string;
  note: string;
  /** They asked to be contacted on this number. */
  phoneConsent: boolean;
}

export const MANUAL_SOURCE_ID = "src_manual";
export const SHARE_LINK_SOURCE_ID = "src_share_link";

/** A lead typed by hand becomes a LeadSubmission and an accountable Opportunity owned by the setter. */
export function addLead(tenantId: Id, setterUserId: Id, input: AddLeadInput): ManualLead | { error: string } {
  const name = input.name.trim();
  if (!name) return { error: "Name" };
  const phone = normalizePhone(input.phone);
  if (!phone) return { error: "Phone with area code" };
  const now = clientNow();
  const contactId = contactIdFor(tenantId, phone);
  const submissionId = submissionIdFor({ tenantId, sourceId: MANUAL_SOURCE_ID, providerEventId: `manual_${now}_${contactId}` });
  const contact: Contact = {
    tenantId,
    contactId,
    displayName: name,
    preferredChannel: "phone",
    consent: { phone: input.phoneConsent ? "granted" : "unknown", sms: "unknown", email: "unknown" },
  };
  const submission: LeadSubmission = {
    tenantId,
    submissionId,
    providerEventId: submissionId,
    source: "manual",
    entryPath: "form_entry",
    receivedAt: now,
    requestText: input.note.trim(),
    contactId,
  };
  const opportunity: Opportunity = {
    tenantId,
    opportunityId: opportunityIdFor(submissionId),
    contactIds: [contactId],
    primaryContactId: contactId,
    offerId: DEFAULT_OFFER_ID,
    workflowVersion: DEFAULT_WORKFLOW_VERSION,
    entryPath: "form_entry",
    source: "manual",
    commercialStatus: "open",
    accountabilityStartedAt: now,
    currentOwner: { setter: setterUserId },
    contactState: "none",
    fitState: "unassessed",
    contractState: "none",
    paymentState: "none",
  };
  const lead: ManualLead = { tenantId, createdBy: setterUserId, phone, contact, submission, opportunity };
  update((s) => ({ ...s, leads: [...s.leads, lead] }));
  return lead;
}

export function markSourceConnected(tenantId: Id, sourceId: string) {
  update((s) => ({ ...s, sources: { ...s.sources, [tenantId]: [...new Set([...(s.sources[tenantId] ?? []), sourceId])] } }));
}

/** The share link a setter sends anywhere. Built from the intake share_link source. */
export function shareLinkFor(tenantId: Id, origin: string): string {
  return trackingSnippet(
    {
      tenantId,
      sourceId: SHARE_LINK_SOURCE_ID,
      kind: "share_link",
      label: "Share link",
      status: "connected",
      createdAt: "2026-01-01T00:00:00Z",
      receivedCount: 0,
      entryPathDefault: "form_entry",
      consentPolicy: [],
    },
    origin,
  ).url;
}

export function inviteLink(invite: Invite, origin: string): string {
  return invite.kind === "team_code" ? `${origin}/join?code=${invite.token}` : `${origin}/join?token=${invite.token}`;
}

/** Sessions are per business. */
export function sessionFor(state: OnboardingState, identity: Identity, tenantId: Id): TenantSession | null {
  return switchTenant(identity, state.memberships, tenantId);
}

export function businessesFor(state: OnboardingState, identity: Identity): Tenant[] {
  return tenantsFor(identity, state.memberships)
    .map((id) => tenantById(state, id))
    .filter((t): t is Tenant => Boolean(t));
}

// ---------- Hooks ----------

export interface OnboardingValue {
  state: OnboardingState;
  /** False until localStorage has been read on the client. */
  ready: boolean;
}

/** No provider needed: module-level store, same as a context would hold. */
export function useOnboarding(): OnboardingValue {
  const snapshot = useSyncExternalStore<OnboardingState | typeof LOADING>(subscribe, getSnapshot, getServerSnapshot);
  const ready = snapshot !== LOADING;
  return { state: ready ? snapshot : EMPTY_STATE, ready };
}

export interface TenantData {
  tenantId: Id;
  tenant: Tenant;
  /** The synthetic demo tenant with fixture data. */
  demo: boolean;
  dataset: Dataset;
  now: ISODateTime;
  members: Member[];
  invites: Invite[];
  leads: ManualLead[];
  brand?: BusinessBrand;
  counts: EmptyStateCounts;
  checklist: OnboardingChecklist;
  ready: boolean;
}

function emptyDataset(tenant: Tenant, users: User[], leads: ManualLead[]): Dataset {
  return {
    tenant,
    users,
    contacts: leads.map((l) => l.contact),
    submissions: leads.map((l) => l.submission),
    opportunities: leads.map((l) => l.opportunity),
    assignments: [],
    tasks: [],
    calls: [],
    appointments: [],
    appointmentInstances: [],
    assessments: [],
    contracts: [],
    ledger: [],
    commissionPolicy: obaviaDataset.commissionPolicy,
    commissionEntries: [],
    offers: obaviaDataset.offers,
    events: [],
    synthetic: false,
  };
}

/** The fixture dataset for the demo tenant; zero rows for any business created here. */
export function useTenantData(): TenantData {
  const { session } = useSession();
  const { state, ready } = useOnboarding();
  const tenantId = session?.tenantId ?? DEMO_TENANT_ID;
  return useMemo(() => {
    const demo = tenantId === DEMO_TENANT_ID;
    const tenant = tenantById(state, tenantId) ?? obaviaDataset.tenant;
    const members = membersOf(state, tenantId);
    const invites = state.invites.filter((i) => i.tenantId === tenantId);
    const leads = state.leads.filter((l) => l.tenantId === tenantId);
    const now = clientNow();
    const pendingInvites = invites.filter((i) => inviteState(i, now) === "pending" && i.kind !== "team_code").length;
    const reps = members.filter((m) => m.membership.active && (m.membership.role === "setter" || m.membership.role === "closer")).length;
    const dataset = demo ? obaviaDataset : emptyDataset(tenant, members.map((m) => m.user), leads);
    const counts: EmptyStateCounts = {
      leads: dataset.submissions.length,
      sources: demo ? SEED_CONNECTED_COUNT : (state.sources[tenantId] ?? []).length,
      reps,
      pendingInvites,
      appointments: dataset.appointmentInstances.length,
      opportunities: dataset.opportunities.length,
    };
    const brand = state.brands.find((b) => b.tenantId === tenantId);
    const flags: ChecklistFlags = {
      businessProfileComplete: demo || Boolean(brand?.completedAt),
      sourcesConnected: counts.sources > 0,
      repsJoined: reps > 0,
      firstLead: counts.leads > 0,
      firstAppointment: counts.appointments > 0,
      firstCash: dataset.ledger.some((e) => e.kind === "payment_collected"),
    };
    return { tenantId, tenant, demo, dataset, now, members, invites, leads, brand, counts, checklist: onboardingChecklist(flags), ready };
  }, [state, tenantId, ready]);
}

/** The business name for the shell header. */
export function useTenantName(fallback = "Obavia"): string {
  const { session } = useSession();
  const { state } = useOnboarding();
  return tenantDisplayName(state, session?.tenantId, fallback);
}
