import { describe, expect, it } from "vitest";
import {
  CallSession,
  LeaseRegistry,
  SimulatedDialerAdapter,
  WarmLeadDialer,
  orderQueue,
  type DialerAdapter,
  type DialerEvent,
  type DialerStatus,
  type DialRequest,
  type DialResult,
} from "@/domain/dialer";
import type { Contact, Task, User } from "@/domain/types";
import { mkUser } from "./helpers";

const T0 = "2026-09-18T20:00:00Z";
const plus = (ms: number, from = T0) => new Date(Date.parse(from) + ms).toISOString();

const contact = (consent: Contact["consent"]["phone"] = "granted"): Contact => ({
  tenantId: "t_test",
  contactId: "ct_1",
  displayName: "Rosalind Vasquez-Pruitt",
  consent: { phone: consent, sms: "granted", email: "granted" },
});

const task = (extra: Partial<Task> = {}): Task => ({
  tenantId: "t_test",
  taskId: "task_1",
  opportunityId: "o1",
  ownerUserId: "s1",
  action: "call",
  priority: { kind: "fresh_inquiry", receivedAt: plus(-8 * 60_000) },
  state: "assigned",
  idempotencyKey: "task:o1:call",
  ...extra,
});

const setter: User = mkUser("s1", ["setter"]);

function clockAt(iso: string) {
  let now = iso;
  return { now: () => now, set: (v: string) => { now = v; } };
}

function harness(behavior: SimulatedDialerAdapter["options"]["behavior"] = "answered") {
  const clock = clockAt(T0);
  const adapter = new SimulatedDialerAdapter({ clock: clock.now, behavior });
  const leases = new LeaseRegistry();
  const dialer = new WarmLeadDialer();
  return { clock, adapter, leases, dialer };
}

describe("orderQueue (SOS-09 priorities)", () => {
  it("orders by due commitment, urgent reply, fresh inquiry, due follow-up, reattempt, then not-yet-due and reviews", () => {
    const tasks: Task[] = [
      task({ taskId: "review", priority: { kind: "appointment_confirmation_review", appointmentInstanceId: "inst_1" } }),
      task({ taskId: "reattempt3", priority: { kind: "approved_reattempt", attempt: 3 } }),
      task({ taskId: "followup_due", priority: { kind: "agreed_follow_up", dueAt: plus(-60_000) } }),
      task({ taskId: "fresh_old", priority: { kind: "fresh_inquiry", receivedAt: plus(-20 * 60_000) } }),
      task({ taskId: "fresh_new", priority: { kind: "fresh_inquiry", receivedAt: plus(-2 * 60_000) } }),
      task({ taskId: "reply", priority: { kind: "urgent_customer_reply", receivedAt: plus(-5 * 60_000) } }),
      task({ taskId: "commit_due", priority: { kind: "scheduled_commitment", dueAt: T0 } }),
      task({ taskId: "commit_later", priority: { kind: "scheduled_commitment", dueAt: plus(2 * 3_600_000) } }),
      task({ taskId: "followup_later", priority: { kind: "agreed_follow_up", dueAt: plus(3 * 3_600_000) } }),
      task({ taskId: "reattempt2", priority: { kind: "approved_reattempt", attempt: 2 } }),
      task({ taskId: "done", state: "completed", priority: { kind: "scheduled_commitment", dueAt: plus(-3_600_000) } }),
      task({ taskId: "canceled", state: "canceled", priority: { kind: "urgent_customer_reply", receivedAt: plus(-3_600_000) } }),
    ];
    const ordered = orderQueue(tasks, T0).map((e) => e.task.taskId);
    expect(ordered).toEqual([
      "commit_due", "reply", "fresh_old", "fresh_new", "followup_due", "reattempt2", "reattempt3", "commit_later", "followup_later", "review",
    ]);
    const entries = orderQueue(tasks, T0);
    expect(entries[0].reason).toMatch(/due now/);
    expect(entries[2].reason).toMatch(/New eligible inquiry received 20 minutes ago/);
    expect(new WarmLeadDialer().nextInQueue(tasks, T0)?.taskId).toBe("commit_due");
    expect(new WarmLeadDialer().nextInQueue([], T0)).toBeUndefined();
  });
});

describe("WarmLeadDialer.startCall", () => {
  it("an opted-out or unknown-consent contact never dials", async () => {
    const h = harness();
    for (const consent of ["revoked", "unknown"] as const) {
      const r = await h.dialer.startCall({ task: task(), contact: contact(consent), user: setter, now: T0, adapter: h.adapter, leases: h.leases });
      expect(r).toMatchObject({ ok: false, code: "consent_refused" });
      if (!r.ok) expect(r.reason).toMatch(consent);
    }
    expect(h.adapter.dialCount).toBe(0);
    expect(h.leases.current("t_test", "o1", "phone", T0)).toBeUndefined();
  });

  it("a canceled or completed task refuses, and so does a task that is canceled on recheck", async () => {
    const h = harness();
    for (const state of ["canceled", "completed", "escalated"] as const) {
      const r = await h.dialer.startCall({ task: task({ state }), contact: contact(), user: setter, now: T0, adapter: h.adapter, leases: h.leases });
      expect(r).toMatchObject({ ok: false, code: "task_not_actionable" });
    }
    // Customer replied while we were reserving: the fresh read says canceled.
    const r = await h.dialer.startCall({
      task: task(), contact: contact(), user: setter, now: T0, adapter: h.adapter, leases: h.leases,
      refreshTask: () => task({ state: "canceled" }),
    });
    expect(r).toMatchObject({ ok: false, code: "task_not_actionable" });
    expect(h.adapter.dialCount).toBe(0);
    // The lease taken for the recheck was released.
    expect(h.leases.current("t_test", "o1", "phone", T0)).toBeUndefined();
  });

  it("two concurrent startCall for the same opportunity produce one dial", async () => {
    const h = harness();
    const other: User = mkUser("s2", ["setter"]);
    const [a, b] = await Promise.all([
      h.dialer.startCall({ task: task(), contact: contact(), user: setter, now: T0, adapter: h.adapter, leases: h.leases }),
      h.dialer.startCall({ task: task({ taskId: "task_2", ownerUserId: "s2" }), contact: contact(), user: other, now: T0, adapter: h.adapter, leases: h.leases }),
    ]);
    expect(a.ok).toBe(true);
    expect(b).toMatchObject({ ok: false, code: "lease_held" });
    if (!b.ok) expect(b.reason).toMatch(/held by s1/);
    expect(h.adapter.dialCount).toBe(1);
    if (a.ok) {
      expect(a.session.idempotencyKey).toBe("t_test:o1:task_1:1");
      expect(h.adapter.dials[0]).toMatchObject<Partial<DialRequest>>({ tenantId: "t_test", opportunityId: "o1", contactId: "ct_1", userId: "s1", idempotencyKey: "t_test:o1:task_1:1", fromNumberRef: "business_main" });
      a.session.release();
      expect(a.session.released).toBe(true);
    }
    // After release, the next start for the same opportunity is allowed again.
    const c = await h.dialer.startCall({ task: task({ taskId: "task_2", ownerUserId: "s2" }), contact: contact(), user: other, now: plus(1000), adapter: h.adapter, leases: h.leases });
    expect(c.ok).toBe(true);
    expect(h.adapter.dialCount).toBe(2);
  });

  it("an expired lease is reclaimable; a live lease is not", () => {
    const leases = new LeaseRegistry();
    const first = leases.tryAcquire({ tenantId: "t", opportunityId: "o", channel: "phone", holderUserId: "a", now: T0, ttlMs: 60_000 });
    expect(first.acquired).toBe(true);
    expect(leases.tryAcquire({ tenantId: "t", opportunityId: "o", channel: "phone", holderUserId: "b", now: plus(59_000), ttlMs: 60_000 }).acquired).toBe(false);
    // Different channel is a different lease.
    expect(leases.tryAcquire({ tenantId: "t", opportunityId: "o", channel: "sms", holderUserId: "b", now: plus(1000), ttlMs: 60_000 }).acquired).toBe(true);
    const second = leases.tryAcquire({ tenantId: "t", opportunityId: "o", channel: "phone", holderUserId: "b", now: plus(60_000), ttlMs: 60_000 });
    expect(second.acquired).toBe(true);
    // A stale release from the first holder cannot drop the second holder's lease.
    if (first.acquired) expect(leases.release(first.lease)).toBe(false);
    expect(leases.current("t", "o", "phone", plus(61_000))?.holderUserId).toBe("b");
  });

  it("a repeated idempotency key does not double dial; the session is restored from provider status", async () => {
    const h = harness();
    const a = await h.dialer.startCall({ task: task(), contact: contact(), user: setter, now: T0, adapter: h.adapter, leases: h.leases });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    h.clock.set(plus(5_000));
    h.adapter.pump();
    expect(a.session.state).toBe("connected");
    // Browser reload: the lease is released by the old page and the same task is started again.
    a.session.release();
    const b = await h.dialer.startCall({ task: task(), contact: contact(), user: setter, now: plus(6_000), adapter: h.adapter, leases: h.leases });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.resumed).toBe(true);
    expect(b.session.callRef).toBe(a.session.callRef);
    expect(b.session.state).toBe("connected");
    expect(h.adapter.dialCount).toBe(1);
    // A second attempt number is a different key and a new dial.
    b.session.release();
    const c = await h.dialer.startCall({ task: task(), contact: contact(), user: setter, now: plus(7_000), adapter: h.adapter, leases: h.leases, attempt: 2 });
    expect(c.ok && c.session.idempotencyKey).toBe("t_test:o1:task_1:2");
    expect(h.adapter.dialCount).toBe(2);
  });

  it("refuses a task owned by someone else, an inactive user, and a task whose own lease is held by another rep", async () => {
    const h = harness();
    const other: User = mkUser("s2", ["setter"]);
    expect(await h.dialer.startCall({ task: task(), contact: contact(), user: other, now: T0, adapter: h.adapter, leases: h.leases })).toMatchObject({ ok: false, code: "not_task_owner" });
    expect(await h.dialer.startCall({ task: task(), contact: contact(), user: { ...setter, active: false }, now: T0, adapter: h.adapter, leases: h.leases })).toMatchObject({ ok: false, code: "user_inactive" });
    const leased = task({ leaseHolderUserId: "s9", leaseExpiresAt: plus(10 * 60_000) });
    expect(await h.dialer.startCall({ task: leased, contact: contact(), user: setter, now: T0, adapter: h.adapter, leases: h.leases })).toMatchObject({ ok: false, code: "lease_held" });
    expect(h.adapter.dialCount).toBe(0);
    expect(h.leases.current("t_test", "o1", "phone", T0)).toBeUndefined();
  });

  it("a provider dial failure releases the lease", async () => {
    const h = harness("reject_dial");
    const r = await h.dialer.startCall({ task: task(), contact: contact(), user: setter, now: T0, adapter: h.adapter, leases: h.leases });
    expect(r).toMatchObject({ ok: false, code: "dial_failed" });
    expect(h.leases.current("t_test", "o1", "phone", T0)).toBeUndefined();
  });
});

describe("CallSession state machine", () => {
  it("queued -> ringing -> connected -> ended with recording, driven by the simulated clock", async () => {
    const h = harness();
    const r = await h.dialer.startCall({ task: task(), contact: contact(), user: setter, now: T0, adapter: h.adapter, leases: h.leases });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.session;
    expect(s.state).toBe("queued");
    expect(h.adapter.pump()).toEqual([]);
    h.clock.set(plus(1_000));
    expect(h.adapter.pump().map((e) => e.kind)).toEqual(["ringing"]);
    expect(s.state).toBe("ringing");
    h.clock.set(plus(4_000));
    h.adapter.pump();
    expect(s.state).toBe("connected");
    h.clock.set(plus(64_000));
    h.adapter.pump();
    expect(s.state).toBe("ended");
    expect(s.durationSeconds).toBe(60);
    expect(s.terminal).toBe(true);
    expect(s.recordingRef).toBeUndefined();
    h.clock.set(plus(69_000));
    h.adapter.pump();
    expect(s.recordingRef).toBe(`rec_${s.callRef}`);
    expect(s.history.map((e) => e.kind)).toEqual(["ringing", "connected", "ended", "recording_ready"]);
    expect((await h.adapter.status(s.callRef)).state).toBe("ended");
    s.release();
    expect(h.leases.current("t_test", "o1", "phone", plus(70_000))).toBeUndefined();
  });

  it("rejects illegal transitions, duplicate provider events, and other calls' events", () => {
    const leases = new LeaseRegistry();
    const lease = leases.tryAcquire({ tenantId: "t", opportunityId: "o", channel: "phone", holderUserId: "u", now: T0, ttlMs: 1000 });
    if (!lease.acquired) throw new Error("lease");
    const s = new CallSession("c1", "task", "o", "t:o:task:1", 1, lease.lease, leases);
    const ev = (kind: DialerEvent["kind"], id: string, callRef = "c1"): DialerEvent => ({ kind, callRef, at: T0, providerEventId: id });
    expect(s.apply(ev("ended", "e0", "other")).accepted).toBe(false);
    expect(s.apply(ev("ringing", "e1")).accepted).toBe(true);
    expect(s.apply(ev("ringing", "e1"))).toEqual({ accepted: false, reason: "duplicate provider event" });
    expect(s.apply(ev("queued", "e2")).accepted).toBe(false);
    expect(s.apply(ev("connected", "e3")).accepted).toBe(true);
    expect(s.apply(ev("ringing", "e4"))).toEqual({ accepted: false, reason: "cannot move from connected to ringing" });
    expect(s.apply(ev("ended", "e5")).accepted).toBe(true);
    expect(s.apply(ev("connected", "e6")).accepted).toBe(false);
    expect(s.apply(ev("failed", "e7")).accepted).toBe(false);
    expect(s.state).toBe("ended");
    // No answer: ringing straight to ended. Failure from queued.
    const s2 = new CallSession("c2", "task", "o", "k", 1, lease.lease, leases);
    expect(s2.apply(ev("ringing", "f1", "c2")).accepted).toBe(true);
    expect(s2.apply(ev("ended", "f2", "c2")).accepted).toBe(true);
    const s3 = new CallSession("c3", "task", "o", "k", 1, lease.lease, leases);
    expect(s3.apply(ev("failed", "g1", "c3")).accepted).toBe(true);
    expect(s3.terminal).toBe(true);
  });

  it("at-least-once provider delivery does not replay a transition", async () => {
    const h = harness("no_answer");
    const r = await h.dialer.startCall({ task: task(), contact: contact(), user: setter, now: T0, adapter: h.adapter, leases: h.leases });
    if (!r.ok) throw new Error(r.reason);
    h.clock.set(plus(64_000));
    const emitted = h.adapter.pump();
    expect(r.session.state).toBe("ended");
    expect(h.adapter.redeliver(emitted[0].providerEventId)).toBe(true);
    expect(r.session.history).toHaveLength(2);
  });
});

describe("unknown timeout", () => {
  function silentAdapter(statusState: DialerStatus["state"]): DialerAdapter & { statusCalls: string[]; dialCount: number } {
    return {
      statusCalls: [],
      dialCount: 0,
      async dial(): Promise<DialResult> {
        this.dialCount += 1;
        return { ok: true, callRef: `silent_${this.dialCount}`, duplicate: false };
      },
      async hangup() {},
      async status(callRef) {
        this.statusCalls.push(callRef);
        return { callRef, state: statusState, at: T0 };
      },
      onEvent() {
        return () => {};
      },
    };
  }

  it("must call adapter.status before a retry is allowed; retry only when the provider says failed or not found", async () => {
    const h = harness();
    const adapter = silentAdapter("not_found");
    const a = await h.dialer.startCall({ task: task(), contact: contact(), user: setter, now: T0, adapter, leases: h.leases });
    if (!a.ok) throw new Error(a.reason);
    a.session.release();
    // Retrying blind is refused.
    const blind = await h.dialer.startCall({ task: task(), contact: contact(), user: setter, now: plus(30_000), adapter, leases: h.leases, previousSession: a.session });
    expect(blind).toMatchObject({ ok: false, code: "status_unchecked" });
    expect(adapter.statusCalls).toEqual([]);
    expect(adapter.dialCount).toBe(1);
    // Ask the provider first.
    const rec = await h.dialer.recoverAfterTimeout(a.session, adapter, plus(30_000));
    expect(adapter.statusCalls).toEqual([a.session.callRef]);
    expect(rec.decision).toBe("retry");
    expect(a.session.state).toBe("failed");
    const retry = await h.dialer.startCall({ task: task(), contact: contact(), user: setter, now: plus(31_000), adapter, leases: h.leases, previousSession: a.session });
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      expect(retry.session.attempt).toBe(2);
      expect(retry.session.idempotencyKey).toBe("t_test:o1:task_1:2");
    }
    expect(adapter.dialCount).toBe(2);
  });

  it("a call the provider reports as connected waits; one reported ended is resolved and never redialed", async () => {
    const h = harness();
    const live = silentAdapter("connected");
    const a = await h.dialer.startCall({ task: task(), contact: contact(), user: setter, now: T0, adapter: live, leases: h.leases });
    if (!a.ok) throw new Error(a.reason);
    const rec = await h.dialer.recoverAfterTimeout(a.session, live, plus(30_000));
    expect(rec.decision).toBe("wait");
    expect(a.session.state).toBe("connected");
    a.session.release();

    const done = silentAdapter("ended");
    const b = await h.dialer.startCall({ task: task({ taskId: "task_9" }), contact: contact(), user: setter, now: plus(40_000), adapter: done, leases: h.leases });
    if (!b.ok) throw new Error(b.reason);
    const rec2 = await h.dialer.recoverAfterTimeout(b.session, done, plus(70_000));
    expect(rec2.decision).toBe("resolved");
    expect(b.session.state).toBe("ended");
    b.session.release();
    const again = await h.dialer.startCall({ task: task({ taskId: "task_9" }), contact: contact(), user: setter, now: plus(71_000), adapter: done, leases: h.leases, previousSession: b.session });
    expect(again).toMatchObject({ ok: false, code: "task_not_actionable" });
    expect(done.dialCount).toBe(1);
  });
});

describe("SimulatedDialerAdapter", () => {
  it("hangup cancels pending events and ends the call at the clock time", async () => {
    const h = harness();
    const r = await h.adapter.dial({ tenantId: "t", opportunityId: "o", contactId: "c", userId: "u", toNumberRef: "n", fromNumberRef: "f", idempotencyKey: "k" });
    if (!r.ok) throw new Error(r.reason);
    const seen: DialerEvent[] = [];
    const off = h.adapter.onEvent((e) => seen.push(e));
    h.clock.set(plus(4_000));
    h.adapter.pump();
    h.clock.set(plus(10_000));
    await h.adapter.hangup(r.callRef);
    expect(seen.map((e) => e.kind)).toEqual(["ringing", "connected", "ended"]);
    expect(seen[2].at).toBe(plus(10_000));
    h.clock.set(plus(120_000));
    expect(h.adapter.pump()).toEqual([]);
    expect((await h.adapter.status(r.callRef)).state).toBe("ended");
    expect((await h.adapter.status("nope")).state).toBe("not_found");
    off();
  });
});
