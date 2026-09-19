import { describe, expect, it } from "vitest";
import type { DomainEvent, LedgerEntry, Task } from "@/domain/types";
import { MemoryRepository, emptyDataset } from "../memory";
import type { DatasetLike, ProviderEvent } from "../repository";

const T1 = "tenant_a";
const T2 = "tenant_b";
const NOW = "2026-09-18T15:00:00.000Z";

function task(tenantId: string, taskId: string, overrides: Partial<Task> = {}): Task {
  return {
    tenantId,
    taskId,
    opportunityId: `opp_${taskId}`,
    action: "call",
    priority: { kind: "fresh_inquiry", receivedAt: NOW },
    state: "unassigned",
    idempotencyKey: `${tenantId}:${taskId}`,
    ...overrides,
  };
}

function ledger(tenantId: string, entryId: string, idempotencyKey: string): LedgerEntry {
  return {
    tenantId,
    entryId,
    opportunityId: "opp_1",
    kind: "payment_collected",
    amount: { amountMinor: 1_000_000, currency: "USD" },
    providerRef: "pi_123",
    idempotencyKey,
    occurredAt: NOW,
    receivedAt: NOW,
    commercialCategory: "new_customer",
  };
}

function event(tenantId: string, eventId: string, idempotencyKey: string): DomainEvent {
  return {
    eventId,
    tenantId,
    eventType: "payment.succeeded",
    schemaVersion: 1,
    aggregateType: "ledger_entry",
    aggregateId: "le_1",
    opportunityId: "opp_1",
    occurredAt: NOW,
    receivedAt: NOW,
    actorType: "integration",
    actorId: "payment_connector",
    idempotencyKey,
    evidenceRefs: [],
    payload: {},
  };
}

function providerEvent(tenantId: string, providerEventId: string): ProviderEvent {
  return {
    tenantId,
    provider: "stripe",
    providerAccountId: "acct_1",
    providerEventId,
    receivedAt: NOW,
    status: "pending",
    payload: { type: "payment_intent.succeeded" },
  };
}

function dataset(tenantId: string, extra: Partial<DatasetLike> = {}): DatasetLike {
  return { ...emptyDataset(tenantId), ...extra };
}

describe("MemoryRepository idempotency", () => {
  it("records a provider event delivered three times exactly once", async () => {
    const repo = new MemoryRepository(dataset(T1));
    const pe = providerEvent(T1, "evt_001");

    const r1 = await repo.recordProviderEvent(T1, pe);
    const r2 = await repo.recordProviderEvent(T1, pe);
    const r3 = await repo.recordProviderEvent(T1, { ...pe, receivedAt: "2026-09-18T15:00:05.000Z" });

    expect(r1).toEqual({ applied: true });
    expect(r2).toEqual({ applied: false, reason: "duplicate" });
    expect(r3).toEqual({ applied: false, reason: "duplicate" });
    expect(await repo.listProviderEvents(T1)).toHaveLength(1);
  });

  it("applies a ledger entry with the same idempotency key once and money changes once", async () => {
    const repo = new MemoryRepository(dataset(T1));

    const first = await repo.recordLedgerEntry(T1, ledger(T1, "le_1", "stripe:acct_1:pi_123"));
    const redelivered = await repo.recordLedgerEntry(T1, ledger(T1, "le_1_again", "stripe:acct_1:pi_123"));

    expect(first.applied).toBe(true);
    expect(redelivered).toEqual({ applied: false, reason: "duplicate" });

    const entries = await repo.listLedger(T1);
    expect(entries).toHaveLength(1);
    expect(entries.reduce((sum, e) => sum + e.amount.amountMinor, 0)).toBe(1_000_000);
  });

  it("appends a domain event once per idempotency key", async () => {
    const repo = new MemoryRepository(dataset(T1));
    expect((await repo.appendEvent(T1, event(T1, "evt_1", "k1"))).applied).toBe(true);
    expect(await repo.appendEvent(T1, event(T1, "evt_2", "k1"))).toEqual({ applied: false, reason: "duplicate" });
    expect(await repo.listEvents(T1)).toHaveLength(1);
  });

  it("rejects an adjustment event whose original does not exist", async () => {
    const repo = new MemoryRepository(dataset(T1));
    const adj = { ...event(T1, "evt_adj", "k_adj"), supersedesEventId: "evt_missing" };
    const r = await repo.appendEvent(T1, adj);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("invalid");
  });
});

describe("MemoryRepository task leases (compare-and-set)", () => {
  it("gives exactly one holder when two users reserve the same task", async () => {
    const repo = new MemoryRepository(dataset(T1, { tasks: [task(T1, "task_1")] }));

    const a = await repo.reserveTask(T1, "task_1", "user_a", 60, NOW);
    const b = await repo.reserveTask(T1, "task_1", "user_b", 60, "2026-09-18T15:00:10.000Z");

    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(a).toBe(true);
    expect(b).toBe(false);

    const ds = await repo.getDataset(T1);
    const t = ds.tasks.find((x) => x.taskId === "task_1");
    expect(t?.leaseHolderUserId).toBe("user_a");
    expect(t?.leaseExpiresAt).toBe("2026-09-18T15:01:00.000Z");
    expect(t?.state).toBe("reserved");
  });

  it("lets the current holder renew its own lease", async () => {
    const repo = new MemoryRepository(dataset(T1, { tasks: [task(T1, "task_1")] }));
    expect(await repo.reserveTask(T1, "task_1", "user_a", 60, NOW)).toBe(true);
    expect(await repo.reserveTask(T1, "task_1", "user_a", 60, "2026-09-18T15:00:30.000Z")).toBe(true);
    const t = (await repo.getDataset(T1)).tasks[0];
    expect(t.leaseExpiresAt).toBe("2026-09-18T15:01:30.000Z");
  });

  it("allows an expired lease to be taken by another user", async () => {
    const repo = new MemoryRepository(dataset(T1, { tasks: [task(T1, "task_1")] }));

    expect(await repo.reserveTask(T1, "task_1", "user_a", 60, NOW)).toBe(true);
    // 59s later: still live
    expect(await repo.reserveTask(T1, "task_1", "user_b", 60, "2026-09-18T15:00:59.000Z")).toBe(false);
    // exactly at expiry: lease is no longer live
    expect(await repo.reserveTask(T1, "task_1", "user_b", 60, "2026-09-18T15:01:00.000Z")).toBe(true);

    const t = (await repo.getDataset(T1)).tasks[0];
    expect(t.leaseHolderUserId).toBe("user_b");
    expect(t.leaseExpiresAt).toBe("2026-09-18T15:02:00.000Z");
  });

  it("releases only for the holder and reopens the task", async () => {
    const repo = new MemoryRepository(dataset(T1, { tasks: [task(T1, "task_1")] }));
    await repo.reserveTask(T1, "task_1", "user_a", 60, NOW);

    expect(await repo.releaseTask(T1, "task_1", "user_b", NOW)).toBe(false);
    expect(await repo.releaseTask(T1, "task_1", "user_a", NOW)).toBe(true);

    const t = (await repo.getDataset(T1)).tasks[0];
    expect(t.leaseHolderUserId).toBeUndefined();
    expect(t.state).toBe("unassigned");
    expect(await repo.reserveTask(T1, "task_1", "user_b", 60, NOW)).toBe(true);
  });

  it("refuses to lease a terminal task", async () => {
    const repo = new MemoryRepository(dataset(T1, { tasks: [task(T1, "task_done", { state: "completed" })] }));
    expect(await repo.reserveTask(T1, "task_done", "user_a", 60, NOW)).toBe(false);
  });

  it("listTasksForUser returns owned and leased tasks, not terminal ones", async () => {
    const repo = new MemoryRepository(
      dataset(T1, {
        tasks: [
          task(T1, "owned", { ownerUserId: "user_a", state: "assigned" }),
          task(T1, "leased"),
          task(T1, "other", { ownerUserId: "user_b", state: "assigned" }),
          task(T1, "done", { ownerUserId: "user_a", state: "completed" }),
        ],
      }),
    );
    await repo.reserveTask(T1, "leased", "user_a", 60, NOW);
    const ids = (await repo.listTasksForUser(T1, "user_a")).map((t) => t.taskId).sort();
    expect(ids).toEqual(["leased", "owned"]);
  });
});

describe("MemoryRepository tenant isolation", () => {
  it("never returns another tenant's rows", async () => {
    const repo = new MemoryRepository([
      dataset(T1, {
        tasks: [task(T1, "t1_task")],
        ledger: [ledger(T1, "t1_le", "t1:k")],
        opportunities: [
          {
            tenantId: T1,
            opportunityId: "t1_opp",
            contactIds: ["c1"],
            primaryContactId: "c1",
            offerId: "offer_1",
            workflowVersion: "v1",
            entryPath: "form_entry",
            source: "meta_lead_form",
            commercialStatus: "open",
            accountabilityStartedAt: NOW,
            currentOwner: { setter: "user_a" },
            contactState: "none",
            fitState: "unassessed",
            contractState: "none",
            paymentState: "none",
          },
        ],
      }),
      dataset(T2, { tasks: [task(T2, "t2_task", { ownerUserId: "user_a", state: "assigned" })] }),
    ]);
    await repo.appendEvent(T1, event(T1, "t1_evt", "t1:evt"));
    await repo.recordProviderEvent(T1, providerEvent(T1, "t1_pe"));

    expect(await repo.listOpportunities(T2)).toEqual([]);
    expect(await repo.getOpportunity(T2, "t1_opp")).toBeNull();
    expect(await repo.listLedger(T2)).toEqual([]);
    expect(await repo.listEvents(T2)).toEqual([]);
    expect(await repo.listProviderEvents(T2)).toEqual([]);
    expect((await repo.listTasksForUser(T2, "user_a")).map((t) => t.taskId)).toEqual(["t2_task"]);
    expect((await repo.getDataset(T2)).ledger).toEqual([]);

    // A cross-tenant id never resolves: reserving tenant_a's task via tenant_b fails.
    expect(await repo.reserveTask(T2, "t1_task", "user_a", 60, NOW)).toBe(false);

    // A write whose payload names a different tenant than the call is rejected, not misfiled.
    const r = await repo.recordLedgerEntry(T2, ledger(T1, "x", "x"));
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("invalid");
    expect(await repo.listLedger(T1)).toHaveLength(1);
  });

  it("does not mutate the seed dataset it was constructed with", async () => {
    const seed = dataset(T1, { tasks: [task(T1, "task_1")] });
    const repo = new MemoryRepository(seed);
    await repo.reserveTask(T1, "task_1", "user_a", 60, NOW);
    await repo.recordLedgerEntry(T1, ledger(T1, "le_1", "k"));
    expect(seed.tasks[0].leaseHolderUserId).toBeUndefined();
    expect(seed.ledger).toHaveLength(0);
  });
});
