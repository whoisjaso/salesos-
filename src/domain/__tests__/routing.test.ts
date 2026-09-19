import { describe, expect, it } from "vitest";
import { AssignmentRegistry, DEFAULT_ROUTING_POLICY, estimateLoad, route, type RoutingCandidate } from "@/domain/routing";
import type { Contact, User } from "@/domain/types";
import { mkInstance, mkOpp, mkUser } from "./helpers";

const NOW = "2026-09-18T14:00:00Z";

function contact(consent: Contact["consent"], preferredLanguage = "en"): Contact {
  return { tenantId: "t_test", contactId: "ct_1", displayName: "Rosalind Vasquez-Pruitt", preferredLanguage, consent };
}
const granted: Contact["consent"] = { phone: "granted", sms: "granted", email: "granted" };

function candidate(user: User, openSlots: number, extra: Partial<RoutingCandidate> = {}): RoutingCandidate {
  return {
    user,
    availableNow: true,
    load: { ...estimateLoad(user, [], [], NOW), openIntakeSlots: openSlots },
    ...extra,
  };
}

describe("routing (SOS-06)", () => {
  const repA = mkUser("rep_a", ["setter"], "2025-01-01T00:00:00Z", { displayName: "Rep A" });
  const repB = mkUser("rep_b", ["setter"], "2025-01-01T00:00:00Z", { displayName: "Rep B" });
  const opp = mkOpp("opp_1");

  it("never starts a sales action for an opted-out contact", () => {
    const r = route({
      tenantId: "t_test",
      opportunity: opp,
      contact: contact({ phone: "revoked", sms: "revoked", email: "revoked" }),
      role: "setter",
      candidates: [candidate(repA, 3)],
      now: NOW,
    });
    expect(r.kind).toBe("no_action");
  });

  it("holds in a monitored queue when no representative is eligible", () => {
    const r = route({
      tenantId: "t_test",
      opportunity: opp,
      contact: contact(granted, "es"),
      role: "setter",
      candidates: [candidate(repA, 3), candidate({ ...repB, active: false }, 3)],
      now: NOW,
    });
    expect(r.kind).toBe("holding_queue");
    if (r.kind === "holding_queue") {
      expect(r.exclusions).toEqual([
        { userId: "rep_a", reason: "no es language support" },
        { userId: "rep_b", reason: "inactive account" },
      ]);
      expect(r.permittedChannels).toEqual(["phone", "sms", "email"]);
      expect(r.explanation).toMatch(/Not sent to an unqualified person/);
    }
  });

  it("holds when every eligible rep is at capacity", () => {
    const r = route({ tenantId: "t_test", opportunity: opp, contact: contact(granted), role: "setter", candidates: [candidate(repA, 0)], now: NOW });
    expect(r.kind).toBe("holding_queue");
    if (r.kind === "holding_queue") expect(r.reason).toMatch(/capacity/);
  });

  it("explains the assignment in plain language and does not use personality", () => {
    const r = route({
      tenantId: "t_test",
      opportunity: opp,
      contact: contact(granted),
      role: "setter",
      candidates: [
        candidate(repA, 2, { availableNow: false, nextAvailableAt: "2026-09-19T14:00:00Z" }),
        candidate(repB, 3),
      ],
      existingRelationship: { userId: "rep_a" },
      now: NOW,
    });
    expect(r.kind).toBe("assigned");
    if (r.kind === "assigned") {
      expect(r.assignment.userId).toBe("rep_b");
      expect(r.assignment.explanation).toBe(
        "Assigned to Rep B: English support, three open intake slots, available now, existing Rep A unavailable until tomorrow. Personality information was not used.",
      );
      expect(r.assignment.eligibleCandidateIds).toEqual(["rep_a", "rep_b"]);
      expect(r.assignment.policyVersion).toBe(DEFAULT_ROUTING_POLICY.policyVersion);
    }
  });

  it("keeps relationship continuity when the existing rep is within the service window", () => {
    const r = route({
      tenantId: "t_test",
      opportunity: opp,
      contact: contact(granted),
      role: "setter",
      candidates: [candidate(repA, 1, { availableNow: false, nextAvailableAt: "2026-09-18T16:00:00Z" }), candidate(repB, 5)],
      existingRelationship: { userId: "rep_a" },
      now: NOW,
    });
    expect(r.kind === "assigned" && r.assignment.userId).toBe("rep_a");
    expect(r.kind === "assigned" && r.assignment.explanation).toMatch(/existing relationship retained/);
  });

  it("two workers routing the same lead produce one owner (compare-and-set)", () => {
    const registry = new AssignmentRegistry();
    const input = { tenantId: "t_test", opportunity: opp, contact: contact(granted), role: "setter" as const, candidates: [candidate(repA, 3), candidate(repB, 3)], now: NOW };
    const w1 = route({ ...input, assignmentId: "asg_w1" });
    const w2 = route({ ...input, assignmentId: "asg_w2", allocationSequence: 1 });
    expect(w1.kind).toBe("assigned");
    expect(w2.kind).toBe("assigned");
    if (w1.kind === "assigned" && w2.kind === "assigned") {
      const c1 = registry.tryClaim(w1.assignment);
      const c2 = registry.tryClaim(w2.assignment);
      expect(c1.claimed).toBe(true);
      expect(c2.claimed).toBe(false);
      expect(c2.current.assignmentId).toBe("asg_w1");
      expect(registry.current("opp_1", "setter")?.userId).toBe(w1.assignment.userId);
    }
  });

  it("newcomers receive the development pool share", () => {
    const veteran = mkUser("vet", ["closer"], "2024-01-01T00:00:00Z", { displayName: "Veteran" });
    const newcomer = mkUser("new", ["closer"], "2026-09-01T00:00:00Z", { displayName: "Newcomer" });
    const policy = { ...DEFAULT_ROUTING_POLICY, developmentPoolShare: 0.2 };
    const winners: string[] = [];
    for (let seq = 0; seq < 10; seq += 1) {
      const r = route({
        tenantId: "t_test",
        opportunity: opp,
        contact: contact(granted),
        role: "closer",
        candidates: [candidate(veteran, 8), candidate(newcomer, 2)],
        policy,
        now: NOW,
        allocationSequence: seq,
      });
      if (r.kind === "assigned") {
        winners.push(r.assignment.userId);
        if (r.assignment.userId === "new") {
          expect(r.assignment.explanation).toMatch(/development pool allocation/);
          expect(r.assignment.selectionProbability).toBeCloseTo(0.2, 12);
        }
      }
    }
    expect(winners.filter((w) => w === "new")).toHaveLength(2);
  });

  it("computes steps 6-7 into shadow only", () => {
    const r = route({
      tenantId: "t_test",
      opportunity: opp,
      contact: contact(granted),
      role: "setter",
      candidates: [
        candidate(repA, 3, { validatedPerformance: { comparableRevenuePerLead: 300_000, maturedSample: 40 }, relationalFit: { score: 0.8, reason: "prefers numbers first; rep A leads with numbers", evidenceRefs: ["ev1"], humanConfirmed: true } }),
        candidate(repB, 3, { validatedPerformance: { comparableRevenuePerLead: 200_000, maturedSample: 40 } }),
      ],
      now: NOW,
    });
    expect(r.kind).toBe("assigned");
    if (r.kind === "assigned") {
      expect(r.assignment.shadow?.performanceWeight).toBeCloseTo(0.2, 12);
      expect(r.assignment.shadow?.performanceReason).toMatch(/not applied/);
      expect(r.assignment.shadow?.relationalSuggestionUserId).toBe("rep_a");
      expect(r.assignment.shadow?.relationalReason).toMatch(/not applied/);
      expect(r.assignment.explanation).toMatch(/Personality information was not used/);
    }
  });
});

describe("estimateLoad", () => {
  it("adds prep, wrap-up, follow-up, tasks, and buffer to scheduled time", () => {
    const user = mkUser("u", ["closer"]);
    const instances = [
      mkInstance("i1", "o1", "scheduled", { scheduledStart: "2026-09-18T15:00:00Z", scheduledEnd: "2026-09-18T15:45:00Z", matured: false }),
      mkInstance("i2", "o2", "scheduled", { scheduledStart: "2026-09-18T17:00:00Z", scheduledEnd: "2026-09-18T18:00:00Z", matured: false }),
      mkInstance("i3", "o3", "scheduled", { scheduledStart: "2026-09-25T17:00:00Z", scheduledEnd: "2026-09-25T18:00:00Z", matured: false }), // outside window
      mkInstance("i4", "o4", "canceled_before_cutoff", { scheduledStart: "2026-09-18T19:00:00Z", scheduledEnd: "2026-09-18T20:00:00Z" }), // released
    ];
    const tasks = [
      { tenantId: "t_test", taskId: "t1", opportunityId: "o1", ownerUserId: "u", action: "follow_up" as const, priority: { kind: "agreed_follow_up" as const, dueAt: NOW }, state: "assigned" as const, idempotencyKey: "k1" },
      { tenantId: "t_test", taskId: "t2", opportunityId: "o2", ownerUserId: "u", action: "call" as const, priority: { kind: "approved_reattempt" as const, attempt: 2 }, state: "completed" as const, idempotencyKey: "k2" },
    ];
    const load = estimateLoad(user, instances, tasks, NOW);
    expect(load.upcomingAppointments).toBe(2);
    expect(load.scheduledMinutes).toBe(105);
    expect(load.preparationMinutes).toBe(30);
    expect(load.wrapUpMinutes).toBe(20);
    expect(load.followUpMinutes).toBe(20);
    expect(load.openTasks).toBe(1);
    expect(load.taskMinutes).toBe(10);
    expect(load.bufferMinutes).toBe(11);
    expect(load.totalMinutes).toBe(196);
    expect(load.openIntakeSlots).toBe(Math.floor((360 - 196) / 45));
  });
});
