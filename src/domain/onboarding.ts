/**
 * Onboarding: from zero to a working team. Source: docs/ONBOARDING.md.
 *
 * Identity (who signed in), membership (who belongs to which business, as what),
 * and invites (how a rep gets in). Plus the empty-state and checklist rules the
 * role homes render on day one.
 *
 * Rules:
 * - Pure. `now` and `rng` are injected. No Date.now(), no Math.random().
 * - The role is set by the owner on the invite. A rep never chooses their own role.
 * - Accepting with an identity that exists in another business adds a membership;
 *   it never merges businesses. One person can belong to several businesses.
 * - Removal keeps the User and every event, opportunity, and commission entry.
 *   Only `membership.active` flips and `removedAt` is set.
 * - Empty states are honest: no fake zeros, no placeholder charts.
 */
import type { DomainEvent, ISODateTime, Id, Pair, Role, Tenant, User } from "./types";
import { createEvent } from "./events";
import { fnv1a } from "./intake";

// ---------- Types ----------

export type IdentityProvider = "google" | "email_link" | "phone_otp";

export interface Identity {
  identityId: Id;
  provider: IdentityProvider;
  /** Email, E.164 phone, or the Google subject. */
  subject: string;
  displayName?: string;
  verifiedAt: ISODateTime;
}

export interface Membership {
  tenantId: Id;
  userId: Id;
  identityId: Id;
  role: Role;
  active: boolean;
  joinedAt: ISODateTime;
  removedAt?: ISODateTime;
  pairId?: Id;
}

export type InviteKind = "email" | "sms" | "team_code";
export type InviteRole = "setter" | "closer";
export type InviteState = "pending" | "accepted" | "expired" | "revoked";

export interface Invite {
  tenantId: Id;
  inviteId: Id;
  kind: InviteKind;
  /** Email or phone. Undefined for a team code. */
  target?: string;
  role: InviteRole;
  pairWithUserId?: Id;
  token: string;
  createdBy: Id;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  acceptedBy?: Id;
  acceptedAt?: ISODateTime;
  revokedAt?: ISODateTime;
  revokedBy?: Id;
}

/** A random source in [0, 1). Seed it in tests. */
export type Rng = () => number;

/** The per-business session the shell uses (src/lib/session.tsx), plus the tenant it belongs to. */
export interface TenantSession {
  userId: Id;
  role: "setter" | "closer" | "owner";
  displayName: string;
  tenantId: Id;
}

export const DEFAULT_MATURITY_HORIZON_DAYS = 30;
export const EMAIL_SMS_INVITE_TTL_HOURS = 7 * 24;
export const TEAM_CODE_TTL_HOURS = 24;

/** Uppercase alphanumerics without 0, O, 1, I. */
export const TEAM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const TEAM_CODE_LENGTH = 6;

// ---------- Helpers ----------

const HEX = "0123456789abcdef";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164 = /^\+[1-9]\d{7,14}$/;

function pick(rng: Rng, alphabet: string): string {
  const n = Math.floor(rng() * alphabet.length);
  return alphabet[Math.min(Math.max(n, 0), alphabet.length - 1)];
}

export function hexToken(rng: Rng, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += pick(rng, HEX);
  return out;
}

export function teamCodeToken(rng: Rng): string {
  let out = "";
  for (let i = 0; i < TEAM_CODE_LENGTH; i++) out += pick(rng, TEAM_CODE_ALPHABET);
  return out;
}

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export function isValidE164(value: string): boolean {
  return E164.test(value.trim());
}

function addHours(iso: ISODateTime, hours: number): ISODateTime {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
}

function normalizeTarget(kind: InviteKind, target: string): string {
  return kind === "email" ? target.trim().toLowerCase() : target.trim();
}

/** Stable user id for an identity inside one business. A second business gets a second user. */
export function userIdFor(tenantId: Id, identityId: Id): Id {
  return `user_${fnv1a(`${tenantId}:${identityId}`)}`;
}

function displayNameOf(identity: Identity): string {
  return identity.displayName?.trim() || identity.subject;
}

function event(input: {
  tenantId: Id;
  eventType: string;
  aggregateType: string;
  aggregateId: Id;
  actorId: Id;
  now: ISODateTime;
  rng: Rng;
  payload: Record<string, unknown>;
}): DomainEvent {
  return createEvent({
    eventId: `evt_${hexToken(input.rng, 16)}`,
    tenantId: input.tenantId,
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    occurredAt: input.now,
    receivedAt: input.now,
    actorType: "user",
    actorId: input.actorId,
    payload: input.payload,
  });
}

// ---------- Tenant creation ----------

export interface CreateTenantInput {
  name: string;
  timezone: string;
  currency: string;
  ownerIdentity: Identity;
  now: ISODateTime;
  rng: Rng;
  maturityHorizonDays?: number;
}

export interface CreateTenantResult {
  tenant: Tenant;
  owner: User;
  membership: Membership;
  events: DomainEvent[];
}

export function createTenant(input: CreateTenantInput): CreateTenantResult {
  const name = input.name.trim();
  if (!name) throw new Error("Business name is required");
  if (!input.timezone.trim()) throw new Error("Timezone is required");
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("Currency must be an ISO 4217 code");

  const tenantId = `tenant_${hexToken(input.rng, 12)}`;
  const tenant: Tenant = {
    tenantId,
    name,
    timezone: input.timezone.trim(),
    reportingCurrency: input.currency,
    maturityHorizonDays: input.maturityHorizonDays ?? DEFAULT_MATURITY_HORIZON_DAYS,
  };
  const owner: User = {
    tenantId,
    userId: userIdFor(tenantId, input.ownerIdentity.identityId),
    displayName: displayNameOf(input.ownerIdentity),
    roles: ["owner"],
    active: true,
    languages: [],
    capabilities: [],
    startedAt: input.now,
  };
  const membership: Membership = {
    tenantId,
    userId: owner.userId,
    identityId: input.ownerIdentity.identityId,
    role: "owner",
    active: true,
    joinedAt: input.now,
  };
  const events: DomainEvent[] = [
    event({
      tenantId,
      eventType: "tenant.created",
      aggregateType: "tenant",
      aggregateId: tenantId,
      actorId: owner.userId,
      now: input.now,
      rng: input.rng,
      payload: { name, timezone: tenant.timezone, currency: tenant.reportingCurrency },
    }),
    event({
      tenantId,
      eventType: "membership.created",
      aggregateType: "membership",
      aggregateId: owner.userId,
      actorId: owner.userId,
      now: input.now,
      rng: input.rng,
      payload: { identityId: input.ownerIdentity.identityId, role: "owner" },
    }),
  ];
  return { tenant, owner, membership, events };
}

// ---------- Invites ----------

export interface CreateInviteInput {
  tenantId: Id;
  kind: InviteKind;
  target?: string;
  role: InviteRole;
  pairWithUserId?: Id;
  createdBy: Id;
  now: ISODateTime;
  rng: Rng;
  ttlHours?: number;
}

export function createInvite(input: CreateInviteInput): Invite {
  if (input.role !== "setter" && input.role !== "closer") throw new Error("Invite role must be setter or closer");
  let target: string | undefined;
  if (input.kind === "email") {
    if (!input.target || !isValidEmail(input.target)) throw new Error("Enter a valid email address");
    target = normalizeTarget("email", input.target);
  } else if (input.kind === "sms") {
    if (!input.target || !isValidE164(input.target)) throw new Error("Enter a phone number with country code, like +15551234567");
    target = normalizeTarget("sms", input.target);
  } else {
    target = undefined;
  }
  const ttl = input.ttlHours ?? (input.kind === "team_code" ? TEAM_CODE_TTL_HOURS : EMAIL_SMS_INVITE_TTL_HOURS);
  if (!(ttl > 0)) throw new Error("Invite expiry must be positive");
  const token = input.kind === "team_code" ? teamCodeToken(input.rng) : hexToken(input.rng, 32);
  return {
    tenantId: input.tenantId,
    inviteId: `inv_${hexToken(input.rng, 12)}`,
    kind: input.kind,
    target,
    role: input.role,
    pairWithUserId: input.pairWithUserId,
    token,
    createdBy: input.createdBy,
    createdAt: input.now,
    expiresAt: addHours(input.now, ttl),
  };
}

export function inviteState(invite: Invite, now: ISODateTime): InviteState {
  if (invite.acceptedAt) return "accepted";
  if (invite.revokedAt) return "revoked";
  if (Date.parse(now) >= Date.parse(invite.expiresAt)) return "expired";
  return "pending";
}

export function revokeInvite(invite: Invite, by: Id, now: ISODateTime): Invite {
  if (inviteState(invite, now) !== "pending") return invite;
  return { ...invite, revokedAt: now, revokedBy: by };
}

// ---------- Accepting ----------

export type AcceptRefusal = "expired" | "revoked" | "already_accepted" | "target_mismatch" | "already_member";

export interface AcceptInviteInput {
  invite: Invite;
  identity: Identity;
  existingUsers: User[];
  existingMemberships: Membership[];
  now: ISODateTime;
  rng: Rng;
}

export type AcceptInviteResult =
  | { ok: true; user: User; membership: Membership; pair?: Pair; invite: Invite; events: DomainEvent[] }
  | { ok: false; reason: AcceptRefusal };

function targetMatches(invite: Invite, identity: Identity): boolean {
  if (invite.kind === "team_code") return true;
  if (!invite.target) return false;
  return normalizeTarget(invite.kind, identity.subject) === normalizeTarget(invite.kind, invite.target);
}

export function acceptInvite(input: AcceptInviteInput): AcceptInviteResult {
  const { invite, identity, now, rng } = input;
  const state = inviteState(invite, now);
  if (state === "accepted") return { ok: false, reason: "already_accepted" };
  if (state === "revoked") return { ok: false, reason: "revoked" };
  if (state === "expired") return { ok: false, reason: "expired" };
  if (!targetMatches(invite, identity)) return { ok: false, reason: "target_mismatch" };

  const here = input.existingMemberships.find(
    (m) => m.tenantId === invite.tenantId && m.identityId === identity.identityId && m.active,
  );
  if (here) return { ok: false, reason: "already_member" };

  const userId = userIdFor(invite.tenantId, identity.identityId);
  const user: User = {
    tenantId: invite.tenantId,
    userId,
    displayName: displayNameOf(identity),
    roles: [invite.role],
    active: true,
    languages: [],
    capabilities: [],
    startedAt: now,
  };

  let pair: Pair | undefined;
  const events: DomainEvent[] = [];
  if (invite.pairWithUserId) {
    const partner = input.existingUsers.find((u) => u.tenantId === invite.tenantId && u.userId === invite.pairWithUserId);
    const partnerRole: InviteRole | undefined = partner?.roles.includes("closer")
      ? "closer"
      : partner?.roles.includes("setter")
        ? "setter"
        : undefined;
    // The invite's role decides the side; the partner takes the other side.
    const setterUserId = invite.role === "setter" ? userId : invite.pairWithUserId;
    const closerUserId = invite.role === "closer" ? userId : invite.pairWithUserId;
    if (partner && partnerRole !== invite.role) {
      pair = {
        tenantId: invite.tenantId,
        pairId: `pair_${hexToken(rng, 12)}`,
        setterUserId,
        closerUserId,
        chosenBy: "owner",
        startedAt: now,
        active: true,
      };
    }
  }

  const membership: Membership = {
    tenantId: invite.tenantId,
    userId,
    identityId: identity.identityId,
    role: invite.role,
    active: true,
    joinedAt: now,
    pairId: pair?.pairId,
  };
  const accepted: Invite = { ...invite, acceptedBy: userId, acceptedAt: now };

  events.push(
    event({
      tenantId: invite.tenantId,
      eventType: "invite.accepted",
      aggregateType: "invite",
      aggregateId: invite.inviteId,
      actorId: userId,
      now,
      rng,
      payload: { kind: invite.kind, role: invite.role, identityId: identity.identityId },
    }),
    event({
      tenantId: invite.tenantId,
      eventType: "membership.created",
      aggregateType: "membership",
      aggregateId: userId,
      actorId: userId,
      now,
      rng,
      payload: { identityId: identity.identityId, role: invite.role, inviteId: invite.inviteId },
    }),
  );
  if (pair) {
    events.push(
      event({
        tenantId: invite.tenantId,
        eventType: "pair.created",
        aggregateType: "pair",
        aggregateId: pair.pairId,
        actorId: invite.createdBy,
        now,
        rng,
        payload: { setterUserId: pair.setterUserId, closerUserId: pair.closerUserId, chosenBy: "owner" },
      }),
    );
  }

  return { ok: true, user, membership, pair, invite: accepted, events };
}

// ---------- Membership changes ----------

export interface MembershipChange {
  user: User;
  membership: Membership;
  events: DomainEvent[];
}

/** The owner changes a rep's role. History stays attached to the person. */
export function changeRole(
  user: User,
  membership: Membership,
  role: Role,
  by: Id,
  now: ISODateTime,
  rng: Rng,
): MembershipChange {
  if (membership.role === role) return { user, membership, events: [] };
  const next: User = { ...user, roles: [role] };
  const nextMembership: Membership = { ...membership, role };
  return {
    user: next,
    membership: nextMembership,
    events: [
      event({
        tenantId: membership.tenantId,
        eventType: "membership.role_changed",
        aggregateType: "membership",
        aggregateId: membership.userId,
        actorId: by,
        now,
        rng,
        payload: { from: membership.role, to: role },
      }),
    ],
  };
}

/**
 * Remove or restore a rep. Removal flips `active` and stamps `removedAt`; the User,
 * their opportunities, events, and commission history remain in the tenant.
 */
export function setActive(
  user: User,
  membership: Membership,
  active: boolean,
  by: Id,
  now: ISODateTime,
  rng: Rng,
): MembershipChange {
  if (membership.active === active) return { user, membership, events: [] };
  const nextMembership: Membership = active
    ? { ...membership, active: true, removedAt: undefined }
    : { ...membership, active: false, removedAt: now };
  return {
    user: { ...user, active },
    membership: nextMembership,
    events: [
      event({
        tenantId: membership.tenantId,
        eventType: active ? "membership.restored" : "membership.removed",
        aggregateType: "membership",
        aggregateId: membership.userId,
        actorId: by,
        now,
        rng,
        payload: { identityId: membership.identityId },
      }),
    ],
  };
}

/** Sessions are per business. Returns null when the identity has no active membership there. */
export function switchTenant(identity: Identity, memberships: Membership[], tenantId: Id): TenantSession | null {
  const m = memberships.find((x) => x.tenantId === tenantId && x.identityId === identity.identityId && x.active);
  if (!m) return null;
  if (m.role !== "setter" && m.role !== "closer" && m.role !== "owner") return null;
  return { userId: m.userId, role: m.role, displayName: displayNameOf(identity), tenantId };
}

/** Businesses this identity can switch into, stable by tenantId. */
export function tenantsFor(identity: Identity, memberships: Membership[]): Id[] {
  return [...new Set(memberships.filter((m) => m.identityId === identity.identityId && m.active).map((m) => m.tenantId))].sort();
}

// ---------- Empty states ----------

export type EmptyStateScreen = "owner_business" | "owner_team" | "setter_today" | "closer_today" | "team_board" | "me" | "coach";

export interface EmptyStateCounts {
  leads: number;
  sources: number;
  reps: number;
  pendingInvites: number;
  appointments: number;
  opportunities: number;
}

export interface EmptyStateAction {
  id: string;
  label: string;
}

export interface EmptyState {
  empty: boolean;
  title: string;
  /** Supporting text: counts and the honest reason nothing shows. */
  detail?: string;
  actions: EmptyStateAction[];
}

export const COACH_MIN_OPPORTUNITIES = 25;

const NOT_EMPTY: EmptyState = { empty: false, title: "", actions: [] };

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function emptyStateFor(screen: EmptyStateScreen, counts: EmptyStateCounts): EmptyState {
  switch (screen) {
    case "owner_business":
      if (counts.leads > 0) return NOT_EMPTY;
      return {
        empty: true,
        title: "No leads yet",
        detail: `${plural(counts.sources, "source", "sources")} connected`,
        actions: [
          { id: "connect_source", label: "Connect a source" },
          { id: "import_history", label: "Import history" },
          { id: "invite_team", label: "Invite team" },
        ],
      };
    case "owner_team":
      if (counts.reps > 0) return NOT_EMPTY;
      return {
        empty: true,
        title: "No reps yet",
        detail: `${plural(counts.pendingInvites, "pending invite", "pending invites")}`,
        actions: [{ id: "invite", label: "Invite" }],
      };
    case "setter_today":
      if (counts.leads > 0) return NOT_EMPTY;
      return {
        empty: true,
        title: "Waiting for your first lead",
        detail: "Share your link and the first reply lands here",
        actions: [
          { id: "copy_link", label: "Copy link" },
          { id: "add_lead", label: "Add a lead by hand" },
        ],
      };
    case "closer_today":
      if (counts.appointments > 0) return NOT_EMPTY;
      return {
        empty: true,
        title: "No appointments yet",
        detail: "Nothing to do; the setter's work fills this",
        actions: [],
      };
    case "team_board":
      if (counts.opportunities > 0) return NOT_EMPTY;
      return {
        empty: true,
        title: "Roster only, no ranks yet",
        detail: "Ranks stay provisional until the matured sample fills",
        actions: [],
      };
    case "me":
      if (counts.opportunities > 0) return NOT_EMPTY;
      return {
        empty: true,
        title: "Nothing collected yet",
        detail: "Coins tier, level 1",
        actions: [{ id: "collect_more", label: "Collect more" }],
      };
    case "coach":
      if (counts.opportunities >= COACH_MIN_OPPORTUNITIES) return NOT_EMPTY;
      return {
        empty: true,
        title: `Nothing to coach yet, ${COACH_MIN_OPPORTUNITIES} opportunities needed`,
        detail: `${plural(counts.opportunities, "opportunity", "opportunities")} so far`,
        actions: [],
      };
  }
}

// ---------- Owner checklist ----------

export interface ChecklistFlags {
  businessProfileComplete: boolean;
  sourcesConnected: boolean;
  repsJoined: boolean;
  firstLead: boolean;
  firstAppointment: boolean;
  firstCash: boolean;
}

export interface ChecklistStep {
  id: keyof ChecklistFlags;
  label: string;
  done: boolean;
}

export interface OnboardingChecklist {
  steps: ChecklistStep[];
  nextStepId: ChecklistStep["id"] | null;
  /** Fraction of steps done, 0 to 1. Display only. */
  progress: number;
}

export const CHECKLIST_ORDER: { id: keyof ChecklistFlags; label: string }[] = [
  { id: "businessProfileComplete", label: "Business profile" },
  { id: "sourcesConnected", label: "Connect a source" },
  { id: "repsJoined", label: "Invite your team" },
  { id: "firstLead", label: "First lead" },
  { id: "firstAppointment", label: "First appointment" },
  { id: "firstCash", label: "First cash" },
];

export function onboardingChecklist(flags: ChecklistFlags): OnboardingChecklist {
  const steps = CHECKLIST_ORDER.map((s) => ({ id: s.id, label: s.label, done: Boolean(flags[s.id]) }));
  const next = steps.find((s) => !s.done);
  const done = steps.filter((s) => s.done).length;
  return { steps, nextStepId: next ? next.id : null, progress: done / steps.length };
}
