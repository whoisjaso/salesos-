/** Small hand-built dataset builders for metric tests. Not collected by vitest (no .test suffix). */
import type { Dataset } from "@/domain/metrics";
import type { AppointmentInstance, Assignment, Opportunity, Tenant, User } from "@/domain/types";
import { commissionPolicy } from "@/fixtures/obavia";

export const T0 = "2026-08-01T12:00:00Z";
export const NOW = "2026-09-18T20:00:00Z";

export const tenant: Tenant = {
  tenantId: "t_test",
  name: "Test tenant",
  timezone: "UTC",
  reportingCurrency: "USD",
  maturityHorizonDays: 14,
};

export function mkUser(userId: string, roles: User["roles"], startedAt = "2025-01-01T00:00:00Z", extra: Partial<User> = {}): User {
  return { tenantId: "t_test", userId, displayName: userId, roles, active: true, languages: ["en"], capabilities: [], startedAt, ...extra };
}

export function mkOpp(id: string, extra: Partial<Opportunity> = {}): Opportunity {
  return {
    tenantId: "t_test",
    opportunityId: id,
    contactIds: [`ct_${id}`],
    primaryContactId: `ct_${id}`,
    offerId: "offer_test",
    workflowVersion: "wf-1",
    entryPath: "form_entry",
    source: "meta_lead_form",
    leadTier: 2,
    commercialStatus: "open",
    accountabilityStartedAt: T0,
    currentOwner: {},
    contactState: "none",
    fitState: "unassessed",
    contractState: "none",
    paymentState: "none",
    ...extra,
  };
}

export function mkAssignment(oppId: string, userId: string, role: "setter" | "closer"): Assignment {
  return {
    tenantId: "t_test",
    assignmentId: `asg_${oppId}_${role}`,
    opportunityId: oppId,
    role,
    userId,
    policyVersion: "routing-test",
    decidedAt: T0,
    eligibleCandidateIds: [userId],
    exclusions: [],
    explanation: "test",
  };
}

export function mkInstance(id: string, oppId: string, outcome: AppointmentInstance["outcome"], extra: Partial<AppointmentInstance> = {}): AppointmentInstance {
  return {
    tenantId: "t_test",
    instanceId: id,
    appointmentId: `apt_${oppId}`,
    opportunityId: oppId,
    scheduledStart: "2026-08-10T15:00:00Z",
    scheduledEnd: "2026-08-10T15:45:00Z",
    confirmedByCustomer: true,
    retainedAfterReview: true,
    outcome,
    attendanceEvidenceRefs: outcome === "attended" ? [`ev_${id}`] : [],
    matured: true,
    ...extra,
  };
}

export function emptyDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    tenant,
    users: [],
    contacts: [],
    submissions: [],
    opportunities: [],
    assignments: [],
    tasks: [],
    calls: [],
    appointments: [],
    appointmentInstances: [],
    assessments: [],
    contracts: [],
    ledger: [],
    commissionPolicy,
    commissionEntries: [],
    synthetic: true,
    ...overrides,
  };
}
