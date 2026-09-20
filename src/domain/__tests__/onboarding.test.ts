import { describe, expect, it } from "vitest";
import type { Membership, Identity, Invite, Rng } from "../onboarding";
import {
  CHECKLIST_ORDER,
  TEAM_CODE_ALPHABET,
  acceptInvite,
  changeRole,
  createInvite,
  createTenant,
  emptyStateFor,
  inviteState,
  onboardingChecklist,
  revokeInvite,
  setActive,
  switchTenant,
  tenantsFor,
  userIdFor,
} from "../onboarding";
import type { User } from "../types";

const NOW = "2026-09-19T12:00:00.000Z";

/** Mulberry32: a tiny seeded rng for deterministic tests. */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ownerIdentity: Identity = {
  identityId: "id_owner",
  provider: "google",
  subject: "owner@obavia.example",
  displayName: "Ola Owner",
  verifiedAt: NOW,
};

function tenantFixture(seed = 1) {
  const rng = seeded(seed);
  const created = createTenant({ name: "Obavia", timezone: "America/Chicago", currency: "USD", ownerIdentity, now: NOW, rng });
  return { ...created, rng };
}

function rep(tenantId: string, userId: string, role: "setter" | "closer"): User {
  return { tenantId, userId, displayName: userId, roles: [role], active: true, languages: [], capabilities: [], startedAt: NOW };
}

const setterIdentity: Identity = {
  identityId: "id_sam",
  provider: "email_link",
  subject: "sam@obavia.example",
  displayName: "Sam Setter",
  verifiedAt: NOW,
};

describe("createTenant", () => {
  it("creates the tenant, the owner user, and an owner membership with events", () => {
    const { tenant, owner, membership, events } = tenantFixture();
    expect(tenant.tenantId).toMatch(/^tenant_[0-9a-f]{12}$/);
    expect(tenant.maturityHorizonDays).toBe(30);
    expect(tenant.reportingCurrency).toBe("USD");
    expect(owner.tenantId).toBe(tenant.tenantId);
    expect(owner.roles).toEqual(["owner"]);
    expect(owner.userId).toBe(userIdFor(tenant.tenantId, "id_owner"));
    expect(owner.startedAt).toBe(NOW);
    expect(membership).toMatchObject({ tenantId: tenant.tenantId, userId: owner.userId, identityId: "id_owner", role: "owner", active: true, joinedAt: NOW });
    expect(events.map((e) => e.eventType)).toEqual(["tenant.created", "membership.created"]);
  });

  it("rejects a blank name and a non-ISO currency", () => {
    expect(() => createTenant({ name: " ", timezone: "UTC", currency: "USD", ownerIdentity, now: NOW, rng: seeded(1) })).toThrow();
    expect(() => createTenant({ name: "X", timezone: "UTC", currency: "dollars", ownerIdentity, now: NOW, rng: seeded(1) })).toThrow();
  });
});

describe("createInvite", () => {
  it("email and sms invites expire in 7 days with a 32 hex token", () => {
    const { tenant, owner, rng } = tenantFixture();
    const email = createInvite({ tenantId: tenant.tenantId, kind: "email", target: "Sam@Obavia.example", role: "setter", createdBy: owner.userId, now: NOW, rng });
    const sms = createInvite({ tenantId: tenant.tenantId, kind: "sms", target: "+15551234567", role: "closer", createdBy: owner.userId, now: NOW, rng });
    expect(email.expiresAt).toBe("2026-09-26T12:00:00.000Z");
    expect(sms.expiresAt).toBe("2026-09-26T12:00:00.000Z");
    expect(email.token).toMatch(/^[0-9a-f]{32}$/);
    expect(sms.token).toMatch(/^[0-9a-f]{32}$/);
    expect(email.target).toBe("sam@obavia.example");
    expect(email.role).toBe("setter");
  });

  it("team codes expire in 24 hours with 6 characters and no 0/O/1/I", () => {
    const { tenant, owner } = tenantFixture();
    for (let seed = 1; seed <= 50; seed++) {
      const code = createInvite({ tenantId: tenant.tenantId, kind: "team_code", role: "setter", createdBy: owner.userId, now: NOW, rng: seeded(seed) });
      expect(code.token).toHaveLength(6);
      expect(code.token).toMatch(/^[A-Z2-9]+$/);
      expect(code.token).not.toMatch(/[0O1I]/);
      expect([...code.token].every((c) => TEAM_CODE_ALPHABET.includes(c))).toBe(true);
      expect(code.target).toBeUndefined();
      expect(code.expiresAt).toBe("2026-09-20T12:00:00.000Z");
    }
  });

  it("honors ttlHours", () => {
    const { tenant, owner, rng } = tenantFixture();
    const inv = createInvite({ tenantId: tenant.tenantId, kind: "team_code", role: "setter", createdBy: owner.userId, now: NOW, rng, ttlHours: 2 });
    expect(inv.expiresAt).toBe("2026-09-19T14:00:00.000Z");
  });

  it("validates the target per kind", () => {
    const { tenant, owner, rng } = tenantFixture();
    const base = { tenantId: tenant.tenantId, role: "setter" as const, createdBy: owner.userId, now: NOW, rng };
    expect(() => createInvite({ ...base, kind: "email", target: "not-an-email" })).toThrow();
    expect(() => createInvite({ ...base, kind: "email" })).toThrow();
    expect(() => createInvite({ ...base, kind: "sms", target: "5551234567" })).toThrow();
    expect(() => createInvite({ ...base, kind: "sms", target: "+1 555 123 4567" })).toThrow();
    expect(() => createInvite({ ...base, kind: "sms", target: "+15551234567" })).not.toThrow();
    expect(() => createInvite({ ...base, kind: "email", target: "a@b.co" })).not.toThrow();
  });
});

describe("inviteState and revokeInvite", () => {
  function invite(): Invite {
    const { tenant, owner, rng } = tenantFixture();
    return createInvite({ tenantId: tenant.tenantId, kind: "email", target: "sam@obavia.example", role: "setter", createdBy: owner.userId, now: NOW, rng });
  }

  it("is pending until the exact expiry instant, then expired", () => {
    const inv = invite();
    expect(inviteState(inv, NOW)).toBe("pending");
    expect(inviteState(inv, "2026-09-26T11:59:59.999Z")).toBe("pending");
    expect(inviteState(inv, inv.expiresAt)).toBe("expired");
    expect(inviteState(inv, "2026-09-27T00:00:00.000Z")).toBe("expired");
  });

  it("revoke marks the invite revoked and is a no-op afterwards", () => {
    const inv = invite();
    const revoked = revokeInvite(inv, "owner", "2026-09-20T00:00:00.000Z");
    expect(revoked.revokedAt).toBe("2026-09-20T00:00:00.000Z");
    expect(revoked.revokedBy).toBe("owner");
    expect(inviteState(revoked, "2026-09-21T00:00:00.000Z")).toBe("revoked");
    expect(revokeInvite(revoked, "owner", "2026-09-22T00:00:00.000Z")).toBe(revoked);
  });

  it("accepted wins over revoked and expired", () => {
    const inv = { ...invite(), acceptedAt: NOW, acceptedBy: "u" };
    expect(inviteState(inv, "2027-01-01T00:00:00.000Z")).toBe("accepted");
    expect(inviteState({ ...inv, revokedAt: NOW }, NOW)).toBe("accepted");
  });
});

describe("acceptInvite", () => {
  function setup() {
    const t = tenantFixture(7);
    const users: User[] = [t.owner];
    const memberships: Membership[] = [t.membership];
    return { ...t, users, memberships };
  }

  it("accepts an email invite when the identity email matches, case-insensitively", () => {
    const { tenant, owner, rng, users, memberships } = setup();
    const invite = createInvite({ tenantId: tenant.tenantId, kind: "email", target: "SAM@obavia.example", role: "setter", createdBy: owner.userId, now: NOW, rng });
    const res = acceptInvite({ invite, identity: { ...setterIdentity, subject: "sam@Obavia.Example" }, existingUsers: users, existingMemberships: memberships, now: NOW, rng });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.user.tenantId).toBe(tenant.tenantId);
    expect(res.user.roles).toEqual(["setter"]);
    expect(res.user.startedAt).toBe(NOW);
    expect(res.user.displayName).toBe("Sam Setter");
    expect(res.membership).toMatchObject({ tenantId: tenant.tenantId, userId: res.user.userId, identityId: "id_sam", role: "setter", active: true, joinedAt: NOW });
    expect(res.pair).toBeUndefined();
    expect(res.invite.acceptedBy).toBe(res.user.userId);
    expect(res.invite.acceptedAt).toBe(NOW);
    expect(res.events.map((e) => e.eventType)).toEqual(["invite.accepted", "membership.created"]);
  });

  it("accepts an sms invite when the phone matches", () => {
    const { tenant, owner, rng, users, memberships } = setup();
    const invite = createInvite({ tenantId: tenant.tenantId, kind: "sms", target: "+15551234567", role: "closer", createdBy: owner.userId, now: NOW, rng });
    const identity: Identity = { identityId: "id_phone", provider: "phone_otp", subject: "+15551234567", verifiedAt: NOW };
    const res = acceptInvite({ invite, identity, existingUsers: users, existingMemberships: memberships, now: NOW, rng });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.user.roles).toEqual(["closer"]);
    expect(res.user.displayName).toBe("+15551234567");
  });

  it("accepts a team code from any identity and takes the role from the invite", () => {
    const { tenant, owner, rng, users, memberships } = setup();
    const invite = createInvite({ tenantId: tenant.tenantId, kind: "team_code", role: "closer", createdBy: owner.userId, now: NOW, rng });
    const identity: Identity = { identityId: "id_any", provider: "google", subject: "anyone@example.com", verifiedAt: NOW };
    const res = acceptInvite({ invite, identity, existingUsers: users, existingMemberships: memberships, now: NOW, rng });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.membership.role).toBe("closer");
  });

  it("refuses a target mismatch", () => {
    const { tenant, owner, rng, users, memberships } = setup();
    const invite = createInvite({ tenantId: tenant.tenantId, kind: "email", target: "sam@obavia.example", role: "setter", createdBy: owner.userId, now: NOW, rng });
    const res = acceptInvite({ invite, identity: { ...setterIdentity, subject: "someone.else@obavia.example" }, existingUsers: users, existingMemberships: memberships, now: NOW, rng });
    expect(res).toEqual({ ok: false, reason: "target_mismatch" });
  });

  it("refuses expired and revoked invites", () => {
    const { tenant, owner, rng, users, memberships } = setup();
    const invite = createInvite({ tenantId: tenant.tenantId, kind: "email", target: "sam@obavia.example", role: "setter", createdBy: owner.userId, now: NOW, rng });
    expect(acceptInvite({ invite, identity: setterIdentity, existingUsers: users, existingMemberships: memberships, now: invite.expiresAt, rng })).toEqual({ ok: false, reason: "expired" });
    const revoked = revokeInvite(invite, owner.userId, NOW);
    expect(acceptInvite({ invite: revoked, identity: setterIdentity, existingUsers: users, existingMemberships: memberships, now: NOW, rng })).toEqual({ ok: false, reason: "revoked" });
  });

  it("refuses an already accepted invite", () => {
    const { tenant, owner, rng, users, memberships } = setup();
    const invite = createInvite({ tenantId: tenant.tenantId, kind: "team_code", role: "setter", createdBy: owner.userId, now: NOW, rng });
    const first = acceptInvite({ invite, identity: setterIdentity, existingUsers: users, existingMemberships: memberships, now: NOW, rng });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const other: Identity = { identityId: "id_other", provider: "google", subject: "o@example.com", verifiedAt: NOW };
    const second = acceptInvite({ invite: first.invite, identity: other, existingUsers: users, existingMemberships: memberships, now: NOW, rng });
    expect(second).toEqual({ ok: false, reason: "already_accepted" });
  });

  it("refuses an identity that is already a member of the tenant", () => {
    const { tenant, owner, rng, users, memberships } = setup();
    const invite = createInvite({ tenantId: tenant.tenantId, kind: "team_code", role: "setter", createdBy: owner.userId, now: NOW, rng });
    const res = acceptInvite({ invite, identity: ownerIdentity, existingUsers: users, existingMemberships: memberships, now: NOW, rng });
    expect(res).toEqual({ ok: false, reason: "already_member" });
  });

  it("gives an identity from another tenant a new membership and user, never a merge", () => {
    const a = tenantFixture(11);
    const b = tenantFixture(12);
    expect(a.tenant.tenantId).not.toBe(b.tenant.tenantId);
    const inviteA = createInvite({ tenantId: a.tenant.tenantId, kind: "team_code", role: "setter", createdBy: a.owner.userId, now: NOW, rng: a.rng });
    const inA = acceptInvite({ invite: inviteA, identity: setterIdentity, existingUsers: [a.owner], existingMemberships: [a.membership], now: NOW, rng: a.rng });
    expect(inA.ok).toBe(true);
    if (!inA.ok) return;
    const inviteB = createInvite({ tenantId: b.tenant.tenantId, kind: "team_code", role: "closer", createdBy: b.owner.userId, now: NOW, rng: b.rng });
    const inB = acceptInvite({
      invite: inviteB,
      identity: setterIdentity,
      existingUsers: [a.owner, b.owner, inA.user],
      existingMemberships: [a.membership, b.membership, inA.membership],
      now: NOW,
      rng: b.rng,
    });
    expect(inB.ok).toBe(true);
    if (!inB.ok) return;
    expect(inB.user.tenantId).toBe(b.tenant.tenantId);
    expect(inB.user.userId).not.toBe(inA.user.userId);
    expect(inB.membership.identityId).toBe(inA.membership.identityId);
    expect(inB.user.roles).toEqual(["closer"]);
    expect(tenantsFor(setterIdentity, [inA.membership, inB.membership])).toEqual([a.tenant.tenantId, b.tenant.tenantId].sort());
  });

  it("creates a pair chosen by the owner with the setter and closer on the right sides", () => {
    const { tenant, owner, rng, users, memberships } = setup();
    const closer = rep(tenant.tenantId, "user_closer", "closer");
    const invite = createInvite({ tenantId: tenant.tenantId, kind: "email", target: "sam@obavia.example", role: "setter", pairWithUserId: closer.userId, createdBy: owner.userId, now: NOW, rng });
    const res = acceptInvite({ invite, identity: setterIdentity, existingUsers: [...users, closer], existingMemberships: memberships, now: NOW, rng });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pair).toMatchObject({ tenantId: tenant.tenantId, setterUserId: res.user.userId, closerUserId: "user_closer", chosenBy: "owner", startedAt: NOW, active: true });
    expect(res.membership.pairId).toBe(res.pair?.pairId);
    expect(res.events.map((e) => e.eventType)).toContain("pair.created");

    // Inviting a closer to pair with a setter flips the sides.
    const setter = rep(tenant.tenantId, "user_setter", "setter");
    const invite2 = createInvite({ tenantId: tenant.tenantId, kind: "team_code", role: "closer", pairWithUserId: setter.userId, createdBy: owner.userId, now: NOW, rng });
    const identity: Identity = { identityId: "id_cleo", provider: "google", subject: "cleo@example.com", verifiedAt: NOW };
    const res2 = acceptInvite({ invite: invite2, identity, existingUsers: [...users, setter], existingMemberships: memberships, now: NOW, rng });
    expect(res2.ok).toBe(true);
    if (res2.ok) expect(res2.pair).toMatchObject({ setterUserId: "user_setter", closerUserId: res2.user.userId, chosenBy: "owner" });
  });

  it("does not pair two people with the same role", () => {
    const { tenant, owner, rng, users, memberships } = setup();
    const setter = rep(tenant.tenantId, "user_setter", "setter");
    const invite = createInvite({ tenantId: tenant.tenantId, kind: "team_code", role: "setter", pairWithUserId: setter.userId, createdBy: owner.userId, now: NOW, rng });
    const res = acceptInvite({ invite, identity: setterIdentity, existingUsers: [...users, setter], existingMemberships: memberships, now: NOW, rng });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.pair).toBeUndefined();
  });
});

describe("changeRole and setActive", () => {
  function member() {
    const { tenant, owner, rng, membership } = tenantFixture(3);
    const invite = createInvite({ tenantId: tenant.tenantId, kind: "team_code", role: "setter", createdBy: owner.userId, now: NOW, rng });
    const res = acceptInvite({ invite, identity: setterIdentity, existingUsers: [owner], existingMemberships: [membership], now: NOW, rng });
    if (!res.ok) throw new Error("fixture");
    return { owner, rng, user: res.user, membership: res.membership };
  }

  it("changes the role on both the user and the membership, keeping the same userId", () => {
    const { owner, rng, user, membership } = member();
    const changed = changeRole(user, membership, "closer", owner.userId, "2026-09-20T00:00:00.000Z", rng);
    expect(changed.user.userId).toBe(user.userId);
    expect(changed.user.roles).toEqual(["closer"]);
    expect(changed.membership.role).toBe("closer");
    expect(changed.membership.joinedAt).toBe(NOW);
    expect(changed.events[0]).toMatchObject({ eventType: "membership.role_changed", payload: { from: "setter", to: "closer" } });
    expect(changeRole(user, membership, "setter", owner.userId, NOW, rng).events).toEqual([]);
  });

  it("removal keeps the user and history, flips active, and can be restored", () => {
    const { owner, rng, user, membership } = member();
    const removed = setActive(user, membership, false, owner.userId, "2026-10-01T00:00:00.000Z", rng);
    expect(removed.user.userId).toBe(user.userId);
    expect(removed.user.startedAt).toBe(NOW);
    expect(removed.user.active).toBe(false);
    expect(removed.membership).toMatchObject({ active: false, removedAt: "2026-10-01T00:00:00.000Z", joinedAt: NOW, identityId: "id_sam" });
    expect(removed.events[0].eventType).toBe("membership.removed");
    expect(switchTenant(setterIdentity, [removed.membership], membership.tenantId)).toBeNull();

    const restored = setActive(removed.user, removed.membership, true, owner.userId, "2026-10-02T00:00:00.000Z", rng);
    expect(restored.membership.active).toBe(true);
    expect(restored.membership.removedAt).toBeUndefined();
    expect(restored.events[0].eventType).toBe("membership.restored");
  });
});

describe("switchTenant", () => {
  it("returns the per-business session shape, or null", () => {
    const a = tenantFixture(21);
    const b = tenantFixture(22);
    const memberships: Membership[] = [a.membership, { ...b.membership, role: "closer", userId: "user_b" }];
    expect(switchTenant(ownerIdentity, memberships, a.tenant.tenantId)).toEqual({ userId: a.owner.userId, role: "owner", displayName: "Ola Owner", tenantId: a.tenant.tenantId });
    expect(switchTenant(ownerIdentity, memberships, b.tenant.tenantId)).toEqual({ userId: "user_b", role: "closer", displayName: "Ola Owner", tenantId: b.tenant.tenantId });
    expect(switchTenant(ownerIdentity, memberships, "tenant_nowhere")).toBeNull();
    expect(switchTenant(setterIdentity, memberships, a.tenant.tenantId)).toBeNull();
    expect(switchTenant(ownerIdentity, [{ ...a.membership, role: "delivery" }], a.tenant.tenantId)).toBeNull();
  });
});

describe("emptyStateFor", () => {
  const zero = { leads: 0, sources: 0, reps: 0, pendingInvites: 0, appointments: 0, opportunities: 0 };
  const busy = { leads: 12, sources: 2, reps: 4, pendingInvites: 1, appointments: 3, opportunities: 40 };

  it("owner_business", () => {
    const e = emptyStateFor("owner_business", { ...zero, sources: 1 });
    expect(e.empty).toBe(true);
    expect(e.title).toBe("No leads yet");
    expect(e.detail).toBe("1 source connected");
    expect(e.actions).toEqual([
      { id: "connect_source", label: "Connect a source" },
      { id: "import_history", label: "Import history" },
      { id: "invite_team", label: "Invite team" },
    ]);
    expect(emptyStateFor("owner_business", busy).empty).toBe(false);
  });

  it("owner_team", () => {
    const e = emptyStateFor("owner_team", { ...zero, pendingInvites: 2 });
    expect(e.empty).toBe(true);
    expect(e.detail).toBe("2 pending invites");
    expect(e.actions).toEqual([{ id: "invite", label: "Invite" }]);
    expect(emptyStateFor("owner_team", busy).empty).toBe(false);
  });

  it("setter_today", () => {
    const e = emptyStateFor("setter_today", zero);
    expect(e).toMatchObject({ empty: true, title: "Waiting for your first lead" });
    expect(e.actions).toEqual([
      { id: "copy_link", label: "Copy link" },
      { id: "add_lead", label: "Add a lead by hand" },
    ]);
    expect(emptyStateFor("setter_today", busy).empty).toBe(false);
  });

  it("closer_today", () => {
    const e = emptyStateFor("closer_today", zero);
    expect(e).toMatchObject({ empty: true, title: "No appointments yet", actions: [] });
    expect(emptyStateFor("closer_today", busy).empty).toBe(false);
  });

  it("team_board", () => {
    const e = emptyStateFor("team_board", zero);
    expect(e.empty).toBe(true);
    expect(e.title).toContain("Roster only");
    expect(e.actions).toEqual([]);
    expect(emptyStateFor("team_board", busy).empty).toBe(false);
  });

  it("me", () => {
    const e = emptyStateFor("me", zero);
    expect(e.empty).toBe(true);
    expect(e.detail).toBe("Coins tier, level 1");
    expect(e.actions).toEqual([{ id: "collect_more", label: "Collect more" }]);
    expect(emptyStateFor("me", busy).empty).toBe(false);
  });

  it("coach needs 25 opportunities", () => {
    const e = emptyStateFor("coach", { ...zero, opportunities: 24 });
    expect(e).toMatchObject({ empty: true, title: "Nothing to coach yet, 25 opportunities needed", actions: [] });
    expect(emptyStateFor("coach", { ...zero, opportunities: 25 }).empty).toBe(false);
    expect(emptyStateFor("coach", busy).empty).toBe(false);
  });

  it("every non-empty screen returns no title and no actions", () => {
    for (const screen of ["owner_business", "owner_team", "setter_today", "closer_today", "team_board", "me", "coach"] as const) {
      expect(emptyStateFor(screen, busy)).toEqual({ empty: false, title: "", actions: [] });
    }
  });
});

describe("onboardingChecklist", () => {
  it("keeps the documented order and points at the first undone step", () => {
    const c = onboardingChecklist({ businessProfileComplete: true, sourcesConnected: true, repsJoined: false, firstLead: false, firstAppointment: false, firstCash: false });
    expect(c.steps.map((s) => s.label)).toEqual(["Business profile", "Connect a source", "Invite your team", "First lead", "First appointment", "First cash"]);
    expect(c.steps.map((s) => s.id)).toEqual(CHECKLIST_ORDER.map((s) => s.id));
    expect(c.nextStepId).toBe("repsJoined");
    expect(c.progress).toBeCloseTo(2 / 6);
  });

  it("is complete with nextStepId null, and skipped steps still count as next", () => {
    const all = onboardingChecklist({ businessProfileComplete: true, sourcesConnected: true, repsJoined: true, firstLead: true, firstAppointment: true, firstCash: true });
    expect(all.nextStepId).toBeNull();
    expect(all.progress).toBe(1);
    const gap = onboardingChecklist({ businessProfileComplete: true, sourcesConnected: false, repsJoined: true, firstLead: true, firstAppointment: false, firstCash: false });
    expect(gap.nextStepId).toBe("sourcesConnected");
    expect(gap.progress).toBeCloseTo(3 / 6);
    expect(onboardingChecklist({ businessProfileComplete: false, sourcesConnected: false, repsJoined: false, firstLead: false, firstAppointment: false, firstCash: false }).progress).toBe(0);
  });
});

describe("determinism", () => {
  it("the same seed produces the same tenant, invites, ids, and events", () => {
    const run = () => {
      const t = tenantFixture(99);
      const invite = createInvite({ tenantId: t.tenant.tenantId, kind: "team_code", role: "setter", createdBy: t.owner.userId, now: NOW, rng: t.rng });
      const res = acceptInvite({ invite, identity: setterIdentity, existingUsers: [t.owner], existingMemberships: [t.membership], now: NOW, rng: t.rng });
      return { t: { tenant: t.tenant, owner: t.owner, membership: t.membership, events: t.events }, invite, res };
    };
    expect(run()).toEqual(run());
    expect(run().invite.token).not.toBe(createInvite({ tenantId: "x", kind: "team_code", role: "setter", createdBy: "o", now: NOW, rng: seeded(100) }).token);
  });
});
