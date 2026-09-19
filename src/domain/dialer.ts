/**
 * Warm-lead power dialer (SOS-09 call workflow, SOS-23 consent at dial time,
 * D: "Warm-lead power dialer"). Pure TypeScript: no timers, no I/O; the provider
 * sits behind DialerAdapter and time is injected.
 *
 * Rules baked in:
 * - Queue order is the SOS-09 priority rule, never hypothetical deal value.
 * - Consent is checked on the channel at dial time. Revoked or unknown never dials.
 * - One active lease per opportunity + channel (compare-and-set), so a race or a
 *   refresh cannot dial the same customer twice.
 * - Every dial carries an idempotency key `tenant:opp:task:attempt`.
 * - Transport states are provider facts; interpretation lives in callIntelligence.
 * - An unknown timeout queries adapter.status before any retry (SOS-09 booking rule, applied to dialing).
 * - Never cold or random numbers: a dial always belongs to a task on an opportunity.
 */
import type { CallTransportState, Contact, ISODateTime, Id, Task, TaskPriorityReason, User } from "./types";

// ---------- Adapter contract ----------

export interface DialRequest {
  tenantId: Id;
  opportunityId: Id;
  contactId: Id;
  userId: Id;
  /** Reference to a stored number, never the raw digits (SOS-23 data minimization). */
  toNumberRef: string;
  /** The business-owned number the call is placed from. */
  fromNumberRef: string;
  idempotencyKey: string;
}

export type DialResult =
  | { ok: true; callRef: string; providerCallId?: string; /** true when the provider already had this idempotency key. */ duplicate: boolean }
  | { ok: false; reason: string };

export type DialerEventKind = "queued" | "ringing" | "connected" | "ended" | "failed" | "recording_ready";

export interface DialerEvent {
  kind: DialerEventKind;
  callRef: string;
  at: ISODateTime;
  /** Provider's stable event id; duplicates are ignored. */
  providerEventId: string;
  durationSeconds?: number;
  recordingRef?: string;
}

export interface DialerStatus {
  callRef: string;
  /** "not_found" when the provider has no record of the call: the dial never happened. */
  state: CallTransportState | "not_found";
  at: ISODateTime;
  durationSeconds?: number;
}

export interface DialerAdapter {
  dial(req: DialRequest): Promise<DialResult>;
  hangup(callRef: string): Promise<void>;
  /** Authoritative provider state; must be consulted after an unknown timeout before retrying. */
  status(callRef: string): Promise<DialerStatus>;
  /** Returns an unsubscribe function. */
  onEvent(handler: (e: DialerEvent) => void): () => void;
}

// ---------- Leases (compare-and-set) ----------

export type LeaseChannel = "phone" | "sms" | "email";

export interface Lease {
  leaseId: Id;
  tenantId: Id;
  opportunityId: Id;
  channel: LeaseChannel;
  holderUserId: Id;
  acquiredAt: ISODateTime;
  expiresAt: ISODateTime;
}

export type LeaseAttempt = { acquired: true; lease: Lease } | { acquired: false; current: Lease };

/**
 * One active lease per opportunity + channel. First claim wins; an expired lease is
 * reclaimable. Same pattern as AssignmentRegistry in routing.ts.
 */
export class LeaseRegistry {
  private readonly leases = new Map<string, Lease>();
  private seq = 0;

  private key(tenantId: Id, opportunityId: Id, channel: LeaseChannel): string {
    return `${tenantId}:${opportunityId}:${channel}`;
  }

  tryAcquire(req: { tenantId: Id; opportunityId: Id; channel: LeaseChannel; holderUserId: Id; now: ISODateTime; ttlMs: number }): LeaseAttempt {
    const k = this.key(req.tenantId, req.opportunityId, req.channel);
    const existing = this.leases.get(k);
    if (existing && Date.parse(existing.expiresAt) > Date.parse(req.now)) return { acquired: false, current: existing };
    this.seq += 1;
    const lease: Lease = {
      leaseId: `lease_${this.seq}`,
      tenantId: req.tenantId,
      opportunityId: req.opportunityId,
      channel: req.channel,
      holderUserId: req.holderUserId,
      acquiredAt: req.now,
      expiresAt: new Date(Date.parse(req.now) + req.ttlMs).toISOString(),
    };
    this.leases.set(k, lease);
    return { acquired: true, lease };
  }

  /** Releases only if the given lease is still the current one (no stale release). */
  release(lease: Lease): boolean {
    const k = this.key(lease.tenantId, lease.opportunityId, lease.channel);
    const current = this.leases.get(k);
    if (!current || current.leaseId !== lease.leaseId) return false;
    this.leases.delete(k);
    return true;
  }

  current(tenantId: Id, opportunityId: Id, channel: LeaseChannel, now: ISODateTime): Lease | undefined {
    const l = this.leases.get(this.key(tenantId, opportunityId, channel));
    if (!l || Date.parse(l.expiresAt) <= Date.parse(now)) return undefined;
    return l;
  }
}

// ---------- Queue ordering (SOS-09) ----------

export interface QueueEntry {
  task: Task;
  rank: number;
  /** Plain-language reason shown on the card. */
  reason: string;
  sortKey: string;
}

const ACTIONABLE: ReadonlySet<Task["state"]> = new Set(["unassigned", "reserved", "assigned", "accepted", "in_progress", "awaiting_customer"]);

function minutesAgo(iso: ISODateTime, now: ISODateTime): number {
  return Math.max(0, Math.round((Date.parse(now) - Date.parse(iso)) / 60_000));
}

function priorityRank(p: TaskPriorityReason, now: ISODateTime): { rank: number; reason: string; sortKey: string } {
  const nowMs = Date.parse(now);
  switch (p.kind) {
    case "scheduled_commitment": {
      const due = Date.parse(p.dueAt) <= nowMs;
      return due
        ? { rank: 0, reason: `Customer asked for a callback at ${p.dueAt.slice(11, 16)} UTC; due now`, sortKey: p.dueAt }
        : { rank: 5, reason: `Scheduled commitment at ${p.dueAt.slice(11, 16)} UTC`, sortKey: p.dueAt };
    }
    case "urgent_customer_reply":
      return { rank: 1, reason: `Customer replied ${minutesAgo(p.receivedAt, now)} minutes ago`, sortKey: p.receivedAt };
    case "fresh_inquiry":
      return { rank: 2, reason: `New eligible inquiry received ${minutesAgo(p.receivedAt, now)} minutes ago`, sortKey: p.receivedAt };
    case "agreed_follow_up": {
      const due = Date.parse(p.dueAt) <= nowMs;
      return due
        ? { rank: 3, reason: "Agreed follow-up is due", sortKey: p.dueAt }
        : { rank: 5, reason: `Agreed follow-up at ${p.dueAt.slice(11, 16)} UTC`, sortKey: p.dueAt };
    }
    case "approved_reattempt":
      return { rank: 4, reason: `Approved reattempt ${p.attempt}`, sortKey: String(p.attempt).padStart(3, "0") };
    case "appointment_confirmation_review":
      return { rank: 6, reason: "Appointment confirmation needs review", sortKey: p.appointmentInstanceId };
  }
}

/**
 * Orders actionable tasks: scheduled commitments at their due time, urgent customer
 * replies, fresh eligible inquiries, agreed follow-ups that are due, approved reattempts,
 * then not-yet-due commitments and reviews. Oldest first within a rank.
 */
export function orderQueue(tasks: Task[], now: ISODateTime): QueueEntry[] {
  return tasks
    .filter((t) => ACTIONABLE.has(t.state))
    .map((task) => ({ task, ...priorityRank(task.priority, now) }))
    .sort((a, b) => a.rank - b.rank || a.sortKey.localeCompare(b.sortKey) || a.task.taskId.localeCompare(b.task.taskId));
}

// ---------- Call session state machine ----------

const TRANSITIONS: Record<CallTransportState, ReadonlySet<CallTransportState>> = {
  queued: new Set(["ringing", "connected", "ended", "failed"]),
  ringing: new Set(["connected", "ended", "failed"]),
  connected: new Set(["ended", "failed"]),
  ended: new Set(),
  failed: new Set(),
};

export interface ApplyResult {
  accepted: boolean;
  reason?: string;
}

export class CallSession {
  state: CallTransportState = "queued";
  readonly history: DialerEvent[] = [];
  durationSeconds?: number;
  recordingRef?: string;
  released = false;
  /** Set when the caller stopped hearing from the provider. */
  timedOutAt?: ISODateTime;
  /** Set only by an adapter.status() check; required before any retry. */
  statusCheckedAt?: ISODateTime;
  lastStatus?: DialerStatus;
  private readonly seen = new Set<string>();
  private unsubscribe?: () => void;

  constructor(
    readonly callRef: string,
    readonly taskId: Id,
    readonly opportunityId: Id,
    readonly idempotencyKey: string,
    readonly attempt: number,
    readonly lease: Lease,
    private readonly leases: LeaseRegistry,
    readonly providerCallId?: string,
  ) {}

  get terminal(): boolean {
    return this.state === "ended" || this.state === "failed";
  }

  /** Transport facts from the provider. Idempotent by providerEventId; other calls' events are ignored. */
  apply(e: DialerEvent): ApplyResult {
    if (e.callRef !== this.callRef) return { accepted: false, reason: "event belongs to another call" };
    if (this.seen.has(e.providerEventId)) return { accepted: false, reason: "duplicate provider event" };
    if (e.kind === "recording_ready") {
      this.seen.add(e.providerEventId);
      this.history.push(e);
      this.recordingRef = e.recordingRef;
      return { accepted: true };
    }
    if (e.kind === "queued") {
      this.seen.add(e.providerEventId);
      this.history.push(e);
      return { accepted: this.state === "queued", reason: this.state === "queued" ? undefined : "already past queued" };
    }
    if (!TRANSITIONS[this.state].has(e.kind)) return { accepted: false, reason: `cannot move from ${this.state} to ${e.kind}` };
    this.seen.add(e.providerEventId);
    this.history.push(e);
    this.state = e.kind;
    if (e.durationSeconds !== undefined) this.durationSeconds = e.durationSeconds;
    return { accepted: true };
  }

  /** @internal wire provider events; called by the orchestrator. */
  attach(adapter: DialerAdapter): void {
    this.unsubscribe?.();
    this.unsubscribe = adapter.onEvent((e) => {
      this.apply(e);
    });
  }

  /** Releases the lease and stops listening. Safe to call twice. */
  release(): void {
    if (this.released) return;
    this.released = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.leases.release(this.lease);
  }
}

// ---------- Orchestrator ----------

export type StartCallRefusal =
  | "consent_refused"
  | "task_not_actionable"
  | "not_task_owner"
  | "user_inactive"
  | "lease_held"
  | "status_unchecked"
  | "dial_failed";

export type StartCallResult =
  | { ok: true; session: CallSession; /** true when the provider matched an earlier dial with this key. */ resumed: boolean }
  | { ok: false; code: StartCallRefusal; reason: string };

export interface StartCallInput {
  task: Task;
  contact: Contact;
  user: User;
  now: ISODateTime;
  adapter: DialerAdapter;
  leases: LeaseRegistry;
  toNumberRef?: string;
  fromNumberRef?: string;
  /** Explicit attempt number; defaults to the approved reattempt count or 1. */
  attempt?: number;
  /** Fresh read of the task after the lease is held (SOS-09 step 1: recheck current state). */
  refreshTask?: (taskId: Id) => Task | undefined;
  /** A prior session for the same task that timed out; must have had its status checked. */
  previousSession?: CallSession;
}

export interface WarmLeadDialerOptions {
  leaseTtlMs: number;
  channel: LeaseChannel;
  defaultFromNumberRef: string;
}

export const DEFAULT_DIALER_OPTIONS: WarmLeadDialerOptions = {
  leaseTtlMs: 15 * 60_000,
  channel: "phone",
  defaultFromNumberRef: "business_main",
};

export type TimeoutRecovery =
  | { decision: "wait"; status: DialerStatus }
  | { decision: "resolved"; status: DialerStatus }
  | { decision: "retry"; status: DialerStatus };

function actionable(task: Task | undefined): task is Task {
  return !!task && ACTIONABLE.has(task.state);
}

export class WarmLeadDialer {
  readonly options: WarmLeadDialerOptions;

  constructor(options: Partial<WarmLeadDialerOptions> = {}) {
    this.options = { ...DEFAULT_DIALER_OPTIONS, ...options };
  }

  orderQueue(tasks: Task[], now: ISODateTime): QueueEntry[] {
    return orderQueue(tasks, now);
  }

  nextInQueue(tasks: Task[], now: ISODateTime): Task | undefined {
    return orderQueue(tasks, now)[0]?.task;
  }

  static idempotencyKey(tenantId: Id, opportunityId: Id, taskId: Id, attempt: number): string {
    return `${tenantId}:${opportunityId}:${taskId}:${attempt}`;
  }

  /**
   * SOS-09 steps 1 and 3: consent, lease, state recheck, then dial. Everything up to the
   * provider call runs synchronously, so two concurrent starts for the same opportunity
   * see one lease and produce one dial.
   */
  async startCall(input: StartCallInput): Promise<StartCallResult> {
    const { task, contact, user, now, adapter, leases } = input;
    const channel = this.options.channel;

    // Permission at dial time. Revoked or unknown never dials (SOS-23).
    const consent = contact.consent[channel];
    if (consent !== "granted") {
      return { ok: false, code: "consent_refused", reason: `${channel} consent for contact ${contact.contactId} is ${consent}; no dial` };
    }
    if (!user.active) return { ok: false, code: "user_inactive", reason: `user ${user.userId} is inactive` };
    if (!actionable(task)) return { ok: false, code: "task_not_actionable", reason: `task ${task.taskId} is ${task.state}` };
    if (task.ownerUserId && task.ownerUserId !== user.userId) {
      return { ok: false, code: "not_task_owner", reason: `task ${task.taskId} is owned by ${task.ownerUserId}` };
    }
    if (input.previousSession && !input.previousSession.terminal && input.previousSession.statusCheckedAt === undefined) {
      return { ok: false, code: "status_unchecked", reason: `previous call ${input.previousSession.callRef} timed out; check provider status before retrying` };
    }
    if (input.previousSession && input.previousSession.state === "ended") {
      return { ok: false, code: "task_not_actionable", reason: `previous call ${input.previousSession.callRef} already ended; do not redial` };
    }

    // Lease: compare-and-set, one per opportunity + channel.
    const attempt = leases.tryAcquire({ tenantId: task.tenantId, opportunityId: task.opportunityId, channel, holderUserId: user.userId, now, ttlMs: this.options.leaseTtlMs });
    if (!attempt.acquired) {
      return { ok: false, code: "lease_held", reason: `opportunity ${task.opportunityId} ${channel} lease held by ${attempt.current.holderUserId} until ${attempt.current.expiresAt}` };
    }
    const lease = attempt.lease;

    // Recheck state after the lease is ours: a customer reply or cancellation may have landed.
    const fresh = input.refreshTask ? input.refreshTask(task.taskId) : task;
    const freshState = fresh?.state ?? "missing";
    if (!actionable(fresh) || fresh.opportunityId !== task.opportunityId) {
      leases.release(lease);
      return { ok: false, code: "task_not_actionable", reason: `task ${task.taskId} is ${freshState} after recheck` };
    }
    if (fresh.leaseHolderUserId && fresh.leaseHolderUserId !== user.userId && fresh.leaseExpiresAt && Date.parse(fresh.leaseExpiresAt) > Date.parse(now)) {
      leases.release(lease);
      return { ok: false, code: "lease_held", reason: `task ${task.taskId} lease held by ${fresh.leaseHolderUserId}` };
    }

    const attemptNo = input.attempt ?? (input.previousSession ? input.previousSession.attempt + 1 : task.priority.kind === "approved_reattempt" ? task.priority.attempt : 1);
    const idempotencyKey = WarmLeadDialer.idempotencyKey(task.tenantId, task.opportunityId, task.taskId, attemptNo);

    const result = await adapter.dial({
      tenantId: task.tenantId,
      opportunityId: task.opportunityId,
      contactId: contact.contactId,
      userId: user.userId,
      toNumberRef: input.toNumberRef ?? `contact:${contact.contactId}:${channel}`,
      fromNumberRef: input.fromNumberRef ?? this.options.defaultFromNumberRef,
      idempotencyKey,
    });
    if (!result.ok) {
      leases.release(lease);
      return { ok: false, code: "dial_failed", reason: result.reason };
    }

    const session = new CallSession(result.callRef, task.taskId, task.opportunityId, idempotencyKey, attemptNo, lease, leases, result.providerCallId);
    session.attach(adapter);
    if (result.duplicate) {
      // The provider already placed this call (refresh, replay): restore, never re-execute.
      const status = await adapter.status(result.callRef);
      session.lastStatus = status;
      session.statusCheckedAt = now;
      if (status.state !== "not_found" && status.state !== "queued") {
        session.apply({ kind: status.state, callRef: result.callRef, at: status.at, providerEventId: `status:${result.callRef}:${status.state}`, durationSeconds: status.durationSeconds });
      }
    }
    return { ok: true, session, resumed: result.duplicate };
  }

  /**
   * When provider events stop arriving, ask the provider before doing anything else.
   * "retry" is only offered when the provider says the call failed or never existed.
   */
  async recoverAfterTimeout(session: CallSession, adapter: DialerAdapter, now: ISODateTime): Promise<TimeoutRecovery> {
    session.timedOutAt = session.timedOutAt ?? now;
    const status = await adapter.status(session.callRef);
    session.statusCheckedAt = now;
    session.lastStatus = status;
    if (status.state === "not_found") {
      session.apply({ kind: "failed", callRef: session.callRef, at: now, providerEventId: `status:${session.callRef}:not_found` });
      return { decision: "retry", status };
    }
    if (status.state === "failed") {
      session.apply({ kind: "failed", callRef: session.callRef, at: status.at, providerEventId: `status:${session.callRef}:failed` });
      return { decision: "retry", status };
    }
    if (status.state === "ended") {
      session.apply({ kind: "ended", callRef: session.callRef, at: status.at, providerEventId: `status:${session.callRef}:ended`, durationSeconds: status.durationSeconds });
      return { decision: "resolved", status };
    }
    if (status.state !== "queued" && session.state !== status.state) {
      session.apply({ kind: status.state, callRef: session.callRef, at: status.at, providerEventId: `status:${session.callRef}:${status.state}` });
    }
    return { decision: "wait", status };
  }
}

// ---------- Simulated adapter ----------

export interface SimulatedDialerOptions {
  /** Injected clock. The adapter never reads Date.now(). */
  clock: () => ISODateTime;
  ringAfterMs: number;
  connectAfterMs: number;
  endAfterMs: number;
  recordingAfterMs: number;
  /** "answered" | "no_answer" (rings then ends without connecting) | "fail" (provider failure) | "reject_dial" (dial() itself fails). */
  behavior: "answered" | "no_answer" | "fail" | "reject_dial";
}

/**
 * Emits ringing / connected / ended on a schedule relative to the dial time, released
 * by `pump(now)`. Idempotent on DialRequest.idempotencyKey. Used by tests and by the UI.
 */
export class SimulatedDialerAdapter implements DialerAdapter {
  readonly options: SimulatedDialerOptions;
  readonly dials: DialRequest[] = [];
  readonly hangups: string[] = [];
  private readonly byKey = new Map<string, string>();
  private readonly pending: DialerEvent[] = [];
  private readonly emitted = new Map<string, DialerEvent[]>();
  private readonly handlers = new Set<(e: DialerEvent) => void>();
  private seq = 0;
  private eventSeq = 0;

  constructor(options: Partial<SimulatedDialerOptions> & { clock: () => ISODateTime }) {
    this.options = { ringAfterMs: 1_000, connectAfterMs: 4_000, endAfterMs: 64_000, recordingAfterMs: 5_000, behavior: "answered", ...options };
  }

  get dialCount(): number {
    return this.dials.length;
  }

  private schedule(callRef: string, kind: DialerEventKind, atMs: number, extra: Partial<DialerEvent> = {}): void {
    this.eventSeq += 1;
    this.pending.push({ kind, callRef, at: new Date(atMs).toISOString(), providerEventId: `sim_ev_${this.eventSeq}`, ...extra });
    this.pending.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.providerEventId.localeCompare(b.providerEventId));
  }

  async dial(req: DialRequest): Promise<DialResult> {
    const existing = this.byKey.get(req.idempotencyKey);
    if (existing) return { ok: true, callRef: existing, providerCallId: `pc_${existing}`, duplicate: true };
    if (this.options.behavior === "reject_dial") return { ok: false, reason: "simulated provider rejected the dial" };
    this.seq += 1;
    const callRef = `sim_call_${this.seq}`;
    this.byKey.set(req.idempotencyKey, callRef);
    this.dials.push(req);
    this.emitted.set(callRef, []);
    const t0 = Date.parse(this.options.clock());
    const { ringAfterMs, connectAfterMs, endAfterMs, recordingAfterMs, behavior } = this.options;
    this.schedule(callRef, "ringing", t0 + ringAfterMs);
    if (behavior === "answered") {
      this.schedule(callRef, "connected", t0 + connectAfterMs);
      this.schedule(callRef, "ended", t0 + endAfterMs, { durationSeconds: Math.round((endAfterMs - connectAfterMs) / 1000) });
      this.schedule(callRef, "recording_ready", t0 + endAfterMs + recordingAfterMs, { recordingRef: `rec_${callRef}` });
    } else if (behavior === "no_answer") {
      this.schedule(callRef, "ended", t0 + endAfterMs, { durationSeconds: 0 });
    } else {
      this.schedule(callRef, "failed", t0 + connectAfterMs);
    }
    return { ok: true, callRef, providerCallId: `pc_${callRef}`, duplicate: false };
  }

  async hangup(callRef: string): Promise<void> {
    this.hangups.push(callRef);
    for (let i = this.pending.length - 1; i >= 0; i -= 1) if (this.pending[i].callRef === callRef) this.pending.splice(i, 1);
    if (this.emitted.has(callRef) && !this.stateOf(callRef).terminal) {
      this.eventSeq += 1;
      this.emit({ kind: "ended", callRef, at: this.options.clock(), providerEventId: `sim_ev_${this.eventSeq}`, durationSeconds: 0 });
    }
  }

  async status(callRef: string): Promise<DialerStatus> {
    const at = this.options.clock();
    if (!this.emitted.has(callRef)) return { callRef, state: "not_found", at };
    const { state, durationSeconds } = this.stateOf(callRef);
    return { callRef, state, at, durationSeconds };
  }

  onEvent(handler: (e: DialerEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Releases every scheduled event due at or before `now` (defaults to the clock). Returns what was emitted. */
  pump(now: ISODateTime = this.options.clock()): DialerEvent[] {
    const nowMs = Date.parse(now);
    const out: DialerEvent[] = [];
    while (this.pending.length > 0 && Date.parse(this.pending[0].at) <= nowMs) {
      const e = this.pending.shift() as DialerEvent;
      this.emit(e);
      out.push(e);
    }
    return out;
  }

  /** Re-deliver an already emitted event (simulates provider at-least-once delivery). */
  redeliver(providerEventId: string): boolean {
    for (const events of this.emitted.values()) {
      const e = events.find((x) => x.providerEventId === providerEventId);
      if (e) {
        for (const h of this.handlers) h(e);
        return true;
      }
    }
    return false;
  }

  private emit(e: DialerEvent): void {
    this.emitted.get(e.callRef)?.push(e);
    for (const h of this.handlers) h(e);
  }

  private stateOf(callRef: string): { state: CallTransportState; terminal: boolean; durationSeconds?: number } {
    const events = this.emitted.get(callRef) ?? [];
    let state: CallTransportState = "queued";
    let durationSeconds: number | undefined;
    for (const e of events) {
      if (e.kind === "recording_ready" || e.kind === "queued") continue;
      state = e.kind;
      if (e.durationSeconds !== undefined) durationSeconds = e.durationSeconds;
    }
    return { state, terminal: state === "ended" || state === "failed", durationSeconds };
  }
}
