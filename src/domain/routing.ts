/**
 * Lead routing and capacity (SOS-06).
 * Precedence 1-5 applied: eligibility, continuity, capacity, service level,
 * fair allocation (with a development pool). Steps 6-7 (validated performance,
 * relational preference) are computed into `shadow` only, never applied,
 * until policy flags enable them.
 */
import type {
  AppointmentInstance,
  Assignment,
  Contact,
  ISODateTime,
  Id,
  Opportunity,
  Task,
  User,
} from "./types";

// ---------- Capacity ----------

export interface CapacityPolicy {
  /** Selling minutes a rep can deliver in the load window. */
  availableMinutes: number;
  /** Window ahead of `now` for upcoming instances. */
  windowHours: number;
  prepMinutesPerAppointment: number;
  wrapMinutesPerAppointment: number;
  followUpMinutesPerAppointment: number;
  minutesPerOpenTask: number;
  /** Fraction of scheduled time added as buffer. */
  bufferFraction: number;
  /** Minutes one new intake reserves. */
  intakeSlotMinutes: number;
}

export const DEFAULT_CAPACITY_POLICY: CapacityPolicy = {
  availableMinutes: 360,
  windowHours: 24,
  prepMinutesPerAppointment: 15,
  wrapMinutesPerAppointment: 10,
  followUpMinutesPerAppointment: 10,
  minutesPerOpenTask: 10,
  bufferFraction: 0.1,
  intakeSlotMinutes: 45,
};

export interface LoadEstimate {
  userId: Id;
  upcomingAppointments: number;
  scheduledMinutes: number;
  preparationMinutes: number;
  wrapUpMinutes: number;
  followUpMinutes: number;
  openTasks: number;
  taskMinutes: number;
  bufferMinutes: number;
  totalMinutes: number;
  availableMinutes: number;
  openIntakeSlots: number;
  explanation: string;
}

const OPEN_TASK_STATES: Task["state"][] = ["assigned", "accepted", "in_progress", "reserved"];

/** Load = scheduled duration + prep + wrap-up + follow-up + task commitments + buffer (SOS-06). */
export function estimateLoad(
  user: User,
  upcomingInstances: AppointmentInstance[],
  tasks: Task[],
  now: ISODateTime,
  policy: CapacityPolicy = DEFAULT_CAPACITY_POLICY,
): LoadEstimate {
  const nowMs = Date.parse(now);
  const horizon = nowMs + policy.windowHours * 3_600_000;
  const upcoming = upcomingInstances.filter((i) => {
    const start = Date.parse(i.scheduledStart);
    return i.outcome === "scheduled" && start >= nowMs && start < horizon;
  });
  const scheduledMinutes = upcoming.reduce(
    (s, i) => s + Math.max(0, (Date.parse(i.scheduledEnd) - Date.parse(i.scheduledStart)) / 60_000),
    0,
  );
  const openTasks = tasks.filter((t) => t.ownerUserId === user.userId && OPEN_TASK_STATES.includes(t.state));
  const preparationMinutes = upcoming.length * policy.prepMinutesPerAppointment;
  const wrapUpMinutes = upcoming.length * policy.wrapMinutesPerAppointment;
  const followUpMinutes = upcoming.length * policy.followUpMinutesPerAppointment;
  const taskMinutes = openTasks.length * policy.minutesPerOpenTask;
  const bufferMinutes = Math.round(scheduledMinutes * policy.bufferFraction);
  const totalMinutes = scheduledMinutes + preparationMinutes + wrapUpMinutes + followUpMinutes + taskMinutes + bufferMinutes;
  const openIntakeSlots = Math.max(0, Math.floor((policy.availableMinutes - totalMinutes) / policy.intakeSlotMinutes));
  return {
    userId: user.userId,
    upcomingAppointments: upcoming.length,
    scheduledMinutes,
    preparationMinutes,
    wrapUpMinutes,
    followUpMinutes,
    openTasks: openTasks.length,
    taskMinutes,
    bufferMinutes,
    totalMinutes,
    availableMinutes: policy.availableMinutes,
    openIntakeSlots,
    explanation: `${upcoming.length} upcoming appointment(s) (${scheduledMinutes} min) + prep/wrap/follow-up ${preparationMinutes + wrapUpMinutes + followUpMinutes} min + ${openTasks.length} open task(s) ${taskMinutes} min + buffer ${bufferMinutes} min = ${totalMinutes} of ${policy.availableMinutes} min; ${openIntakeSlots} open intake slot(s)`,
  };
}

// ---------- Routing ----------

export interface RoutingCandidate {
  user: User;
  availableNow: boolean;
  /** When not available now, the next time the rep can act. */
  nextAvailableAt?: ISODateTime;
  /** Rep paused new intake without deleting obligations. */
  intakePaused?: boolean;
  load: LoadEstimate;
  /** Offers this rep is authorized to sell; undefined means no restriction configured. */
  authorizedOfferIds?: Id[];
  /** Shadow step 6 inputs: comparable, mature outcomes only. */
  validatedPerformance?: { comparableRevenuePerLead: number | null; maturedSample: number; leadTier?: number };
  /** Shadow step 7 inputs: evidence-backed communication compatibility. */
  relationalFit?: { score: number; reason: string; evidenceRefs: Id[]; humanConfirmed: boolean };
}

export interface RoutingPolicy {
  policyVersion: string;
  /** Existing rep unavailable beyond this window loses continuity. */
  serviceWindowHours: number;
  /** Share of allocations reserved for eligible newcomers (pilot policy, not a universal percentage). */
  developmentPoolShare: number;
  /** Tenure below which a rep is a newcomer. */
  newcomerTenureDays: number;
  /** Step 6: apply bounded performance weighting. Shadow only when false. */
  enablePerformanceWeighting: boolean;
  /** Step 7: apply relational tie-breaker. Shadow only when false. */
  enableRelationalPreference: boolean;
  /** Bound on the performance weight (0..1) even when enabled. */
  performanceWeightBound: number;
  /** Minimum matured sample before performance weight is computed at all. */
  performanceMinMaturedSample: number;
}

export const DEFAULT_ROUTING_POLICY: RoutingPolicy = {
  policyVersion: "routing-1.0-pilot",
  serviceWindowHours: 4,
  developmentPoolShare: 0.2,
  newcomerTenureDays: 60,
  enablePerformanceWeighting: false,
  enableRelationalPreference: false,
  performanceWeightBound: 0.2,
  performanceMinMaturedSample: 25,
};

export interface RoutingInput {
  tenantId: Id;
  opportunity: Opportunity;
  contact: Contact;
  role: "setter" | "closer";
  candidates: RoutingCandidate[];
  existingRelationship?: { userId: Id };
  policy?: RoutingPolicy;
  now: ISODateTime;
  /** Sequence number of this allocation within the policy period; drives the deterministic development share. */
  allocationSequence?: number;
  /** Deterministic assignment id; defaults to a derived id. */
  assignmentId?: Id;
}

export type RoutingDecision =
  | { kind: "assigned"; assignment: Assignment }
  | {
      kind: "holding_queue";
      reason: string;
      eligibleCandidateIds: Id[];
      exclusions: { userId: Id; reason: string }[];
      explanation: string;
      /** Acknowledge only through permitted channels. */
      permittedChannels: ("phone" | "sms" | "email")[];
    }
  | { kind: "no_action"; reason: string };

function daysBetween(a: ISODateTime, b: ISODateTime): number {
  return (Date.parse(b) - Date.parse(a)) / 86_400_000;
}

function hoursUntil(now: ISODateTime, at: ISODateTime): number {
  return (Date.parse(at) - Date.parse(now)) / 3_600_000;
}

function permittedChannels(contact: Contact): ("phone" | "sms" | "email")[] {
  return (["phone", "sms", "email"] as const).filter((c) => contact.consent[c] === "granted");
}

function slotsText(n: number): string {
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  return `${n <= 10 ? words[n] : String(n)} open intake slot${n === 1 ? "" : "s"}`;
}

export function route(input: RoutingInput): RoutingDecision {
  const policy = input.policy ?? DEFAULT_ROUTING_POLICY;
  const { opportunity, contact, role, now } = input;
  const channels = permittedChannels(contact);

  // Step 1: permission. An opted-out contact never starts a queued sales action.
  if (channels.length === 0) {
    return {
      kind: "no_action",
      reason: `Contact ${contact.contactId} has no granted communication consent; no sales action may be queued.`,
    };
  }
  const requiredLanguage = contact.preferredLanguage;
  const exclusions: { userId: Id; reason: string }[] = [];
  let eligible: RoutingCandidate[] = [];

  for (const c of input.candidates) {
    const u = c.user;
    if (!u.active) {
      exclusions.push({ userId: u.userId, reason: "inactive account" });
      continue;
    }
    if (!u.roles.includes(role)) {
      exclusions.push({ userId: u.userId, reason: `not authorized for role ${role}` });
      continue;
    }
    if (requiredLanguage && !u.languages.includes(requiredLanguage)) {
      exclusions.push({ userId: u.userId, reason: `no ${requiredLanguage} language support` });
      continue;
    }
    if (c.authorizedOfferIds && !c.authorizedOfferIds.includes(opportunity.offerId)) {
      exclusions.push({ userId: u.userId, reason: `not authorized for offer ${opportunity.offerId}` });
      continue;
    }
    if (c.intakePaused) {
      exclusions.push({ userId: u.userId, reason: "new intake paused" });
      continue;
    }
    eligible.push(c);
  }
  const eligibleCandidateIds = eligible.map((c) => c.user.userId);

  const holding = (reason: string): RoutingDecision => ({
    kind: "holding_queue",
    reason,
    eligibleCandidateIds,
    exclusions,
    explanation: `Held in monitored queue: ${reason}. Acknowledge via ${channels.join("/")} with a truthful response expectation. Not sent to an unqualified person.`,
    permittedChannels: channels,
  });

  if (eligible.length === 0) return holding("no eligible representative");

  // Step 2: relationship continuity.
  let chosen: RoutingCandidate | undefined;
  const reasonParts: string[] = [];
  const existing = input.existingRelationship
    ? eligible.find((c) => c.user.userId === input.existingRelationship?.userId)
    : undefined;
  let existingNote = "";
  if (input.existingRelationship) {
    const existingId = input.existingRelationship.userId;
    const excluded = exclusions.find((e) => e.userId === existingId);
    if (existing) {
      const withinWindow =
        existing.availableNow ||
        (existing.nextAvailableAt !== undefined && hoursUntil(now, existing.nextAvailableAt) <= policy.serviceWindowHours);
      if (withinWindow && existing.load.openIntakeSlots > 0) {
        chosen = existing;
        reasonParts.push("existing relationship retained");
      } else {
        existingNote = `existing ${existing.user.displayName} unavailable${existing.nextAvailableAt ? ` until ${describeTime(existing.nextAvailableAt, now)}` : " beyond the service window"}`;
      }
    } else if (excluded) {
      existingNote = `existing rep ${existingId} excluded (${excluded.reason})`;
    }
  }

  // Step 3: real capacity.
  if (!chosen) {
    const withCapacity = eligible.filter((c) => c.load.openIntakeSlots > 0);
    for (const c of eligible) {
      if (c.load.openIntakeSlots <= 0) exclusions.push({ userId: c.user.userId, reason: "no open intake slots" });
    }
    eligible = withCapacity;
    if (eligible.length === 0) return holding("all eligible representatives are at capacity");

    // Step 4: service level. Prefer available now; otherwise earliest within the service window.
    const availableNow = eligible.filter((c) => c.availableNow);
    let pool = availableNow;
    if (pool.length === 0) {
      pool = eligible
        .filter((c) => c.nextAvailableAt && hoursUntil(now, c.nextAvailableAt) <= policy.serviceWindowHours)
        .sort((a, b) => Date.parse(a.nextAvailableAt as string) - Date.parse(b.nextAvailableAt as string));
      if (pool.length === 0) return holding(`no eligible representative available within ${policy.serviceWindowHours}h service window`);
      pool = [pool[0]];
      reasonParts.push(`earliest available ${describeTime(pool[0].nextAvailableAt as string, now)}`);
    } else {
      reasonParts.push("available now");
    }

    // Step 5: fair allocation with a development pool.
    const newcomers = pool.filter((c) => daysBetween(c.user.startedAt, now) < policy.newcomerTenureDays);
    const seq = input.allocationSequence ?? 0;
    const period = policy.developmentPoolShare > 0 ? Math.max(1, Math.round(1 / policy.developmentPoolShare)) : 0;
    const developmentTurn = period > 0 && newcomers.length > 0 && seq % period === 0;
    const allocationPool = developmentTurn ? newcomers : pool;
    // Capacity-weighted: most open slots first; deterministic rotation on ties.
    const sorted = [...allocationPool].sort((a, b) => b.load.openIntakeSlots - a.load.openIntakeSlots || a.user.userId.localeCompare(b.user.userId));
    const top = sorted.filter((c) => c.load.openIntakeSlots === sorted[0].load.openIntakeSlots);
    chosen = top[seq % top.length];
    if (developmentTurn) reasonParts.push("development pool allocation");
    else if (allocationPool.length > 1) reasonParts.push(`capacity-weighted round robin among ${allocationPool.length}`);
  }

  const selectionProbability = (() => {
    const isNewcomer = daysBetween(chosen.user.startedAt, now) < policy.newcomerTenureDays;
    const newcomerCount = eligible.filter((c) => daysBetween(c.user.startedAt, now) < policy.newcomerTenureDays).length;
    if (eligible.length === 1) return 1;
    if (newcomerCount === 0 || newcomerCount === eligible.length) return 1 / eligible.length;
    return isNewcomer
      ? policy.developmentPoolShare / newcomerCount
      : (1 - policy.developmentPoolShare) / (eligible.length - newcomerCount);
  })();

  // Steps 6-7: shadow only.
  const shadow = computeShadow(eligible, policy);

  const languageNote = requiredLanguage ? `${languageLabel(requiredLanguage)} support` : "language unrestricted";
  const explanation = [
    `Assigned to ${chosen.user.displayName}: ${languageNote}, ${slotsText(chosen.load.openIntakeSlots)}, ${reasonParts.join(", ")}${existingNote ? `, ${existingNote}` : ""}.`,
    "Personality information was not used.",
  ].join(" ");

  const assignment: Assignment = {
    tenantId: input.tenantId,
    assignmentId: input.assignmentId ?? `asg_${opportunity.opportunityId}_${role}_${Date.parse(now)}`,
    opportunityId: opportunity.opportunityId,
    role,
    userId: chosen.user.userId,
    policyVersion: policy.policyVersion,
    decidedAt: now,
    eligibleCandidateIds,
    exclusions,
    selectionProbability,
    explanation,
    shadow,
  };
  return { kind: "assigned", assignment };
}

function languageLabel(code: string): string {
  const names: Record<string, string> = { en: "English", es: "Spanish", fr: "French", pt: "Portuguese" };
  return names[code] ?? code;
}

function describeTime(at: ISODateTime, now: ISODateTime): string {
  const h = hoursUntil(now, at);
  if (h <= 0) return "now";
  const nowDay = now.slice(0, 10);
  const atDay = at.slice(0, 10);
  if (atDay === nowDay) return `in ${Math.ceil(h)}h`;
  const dayDiff = Math.round((Date.parse(atDay) - Date.parse(nowDay)) / 86_400_000);
  return dayDiff === 1 ? "tomorrow" : `in ${dayDiff} days`;
}

function computeShadow(eligible: RoutingCandidate[], policy: RoutingPolicy): Assignment["shadow"] {
  const shadow: NonNullable<Assignment["shadow"]> = {};
  const validated = eligible.filter(
    (c) =>
      c.validatedPerformance &&
      c.validatedPerformance.comparableRevenuePerLead !== null &&
      c.validatedPerformance.maturedSample >= policy.performanceMinMaturedSample,
  );
  if (validated.length >= 2) {
    const values = validated.map((c) => c.validatedPerformance?.comparableRevenuePerLead ?? 0);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const best = validated[values.indexOf(max)];
    // Bounded weight: never more than performanceWeightBound above uniform.
    shadow.performanceWeight = max > min ? Math.min(policy.performanceWeightBound, (max - min) / max) : 0;
    shadow.performanceReason = `shadow: bounded performance weight ${shadow.performanceWeight.toFixed(2)} toward ${best.user.displayName} from comparable matured outcomes; ${policy.enablePerformanceWeighting ? "policy flag on but pilot applies steps 1-5 only" : "logged, not applied"}`;
  }
  const relational = eligible
    .filter((c) => c.relationalFit && c.relationalFit.humanConfirmed)
    .sort((a, b) => (b.relationalFit?.score ?? 0) - (a.relationalFit?.score ?? 0));
  if (relational.length > 0) {
    shadow.relationalSuggestionUserId = relational[0].user.userId;
    shadow.relationalReason = `shadow: ${relational[0].relationalFit?.reason} (hypothesis, not applied)`;
  }
  return Object.keys(shadow).length ? shadow : undefined;
}

// ---------- Compare-and-set ownership ----------

/**
 * Simulates the lock / compare-and-set rule: two workers routing the same
 * opportunity produce exactly one owner. The first claim wins; the second
 * gets the existing assignment back.
 */
export class AssignmentRegistry {
  private readonly owners = new Map<string, Assignment>();

  private key(opportunityId: Id, role: "setter" | "closer"): string {
    return `${opportunityId}:${role}`;
  }

  tryClaim(assignment: Assignment): { claimed: boolean; current: Assignment } {
    const k = this.key(assignment.opportunityId, assignment.role);
    const existing = this.owners.get(k);
    if (existing) return { claimed: false, current: existing };
    this.owners.set(k, assignment);
    return { claimed: true, current: assignment };
  }

  current(opportunityId: Id, role: "setter" | "closer"): Assignment | undefined {
    return this.owners.get(this.key(opportunityId, role));
  }
}
