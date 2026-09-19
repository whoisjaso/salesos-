/**
 * SYNTHETIC operational dataset for tenant "obavia".
 *
 * Everything here is invented for the pilot build: names, dealerships,
 * amounts, and outcomes. Obavia sells dealer follow-up software; the single
 * offer is "Obavia Dealer Follow-Up System" at $4,800 one-time (fixture price).
 * The commission policy is HYPOTHETICAL (D06). Generation is deterministic
 * (seeded PRNG, no Math.random) so tests and screenshots are reproducible.
 */
import type {
  Appointment,
  AppointmentInstance,
  AppointmentInstanceOutcome,
  Assignment,
  Call,
  CommissionEntry,
  CommissionPolicy,
  CommunicationProfile,
  Contact,
  Contract,
  EntryPath,
  ISODateTime,
  Id,
  LeadSubmission,
  LedgerEntry,
  Offer,
  Opportunity,
  QualificationAssessment,
  Task,
  TaskPriorityReason,
  Tenant,
  User,
} from "@/domain/types";
import type { Dataset, TrackedWorkHours } from "@/domain/metrics";
import { fromDollars, scale } from "@/domain/money";

export const NOW: ISODateTime = "2026-09-18T20:00:00Z";
export const TENANT_ID = "obavia";
export const OFFER_ID = "offer_dealer_followup_v1";
export const SYNTHETIC_LABEL = "SYNTHETIC FIXTURE: invented names, amounts, and outcomes for the pilot build.";

// ---------- Deterministic PRNG (mulberry32) ----------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (ms: number): ISODateTime => new Date(ms).toISOString().replace(".000Z", "Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BASE = Date.UTC(2026, 7, 20, 0, 0, 0); // 2026-08-20T00:00:00Z
const NOW_MS = Date.parse(NOW);

// ---------- Static entities ----------

export const tenant: Tenant = {
  tenantId: TENANT_ID,
  name: "Obavia (synthetic pilot tenant)",
  timezone: "America/New_York",
  reportingCurrency: "USD",
  /** Pilot setting for this synthetic cohort so part of it has matured by NOW; 30 days is the product default (D08). */
  maturityHorizonDays: 14,
};

const user = (userId: Id, displayName: string, roles: User["roles"], startedAt: ISODateTime, extra: Partial<User> = {}): User => ({
  tenantId: TENANT_ID,
  userId,
  displayName,
  roles,
  active: true,
  languages: ["en"],
  capabilities: [],
  startedAt,
  ...extra,
});

export const users: User[] = [
  user("usr_owner_delphine", "Delphine Okafor", ["owner"], "2024-01-08T14:00:00Z", { capabilities: ["offer_approval", "policy_admin"] }),
  user("usr_setter_tomasz", "Tomasz Wierzbicki", ["setter"], "2025-03-03T13:00:00Z", { languages: ["en", "pl"], capabilities: ["intake_discipline", "timely_acknowledgment"] }),
  user("usr_setter_priya", "Priya Raghunathan", ["setter"], "2025-09-15T13:00:00Z", { capabilities: ["intake_discipline"], selfDescribedStyle: "warm and direct" }),
  user("usr_closer_marcus", "Marcus Ellery", ["closer"], "2024-06-10T13:00:00Z", { capabilities: ["offer_dealer_followup", "verified_handoff", "clear_explanation"] }),
  user("usr_closer_renata", "Renata Solís", ["closer"], "2025-01-20T13:00:00Z", { languages: ["en", "es"], capabilities: ["offer_dealer_followup", "fit_judgment"] }),
  /** Newcomer: development pool candidate (SOS-06). */
  user("usr_closer_devin", "Devin Achterberg", ["closer"], "2026-09-01T13:00:00Z", { capabilities: ["offer_dealer_followup"] }),
];

export const SETTERS = ["usr_setter_tomasz", "usr_setter_priya"];
export const CLOSERS = ["usr_closer_marcus", "usr_closer_renata", "usr_closer_devin"];

export const offer: Offer = {
  tenantId: TENANT_ID,
  offerId: OFFER_ID,
  name: "Obavia Dealer Follow-Up System",
  version: "2026.08",
  listPrice: fromDollars(4_800),
  approvedOptions: [
    { id: "opt_second_rooftop", label: "Second rooftop license", delta: fromDollars(1_900) },
    { id: "opt_onboarding_workshop", label: "On-site onboarding workshop", delta: fromDollars(750) },
  ],
  discountAuthority: { maxPercent: 10, approverRole: "owner" },
};

export const commissionPolicy: CommissionPolicy = {
  tenantId: TENANT_ID,
  policyVersion: "commission-hypothetical-0.1",
  effectiveFrom: "2026-08-01T00:00:00Z",
  basis: "net_collected_cash",
  ratePercent: 5,
  hypothetical: true,
};

const FIRST_NAMES = [
  "Rosalind", "Ephraim", "Kenji", "Marguerite", "Thaddeus", "Ines", "Olamide", "Bartholomew", "Svetlana", "Cormac",
  "Yusuf", "Annelise", "Desmond", "Priyanka", "Lucero", "Hollis", "Oksana", "Ignatius", "Temperance", "Wendell",
];
const LAST_NAMES = [
  "Vasquez-Pruitt", "Ostrowski", "Nakagawa", "Beaumont", "Achebe", "Lindqvist", "Ferreira", "Castellano", "Oyelaran", "MacAllister",
  "Dubois", "Kowalczyk", "Haddad", "Petrakis", "Sørensen", "Villanueva", "Brightwater", "Okonkwo", "Radcliffe", "Esposito",
];
const DEALERSHIPS = [
  "Ridgeline Auto Group", "Harbor Point Motors", "Twin Pines Pre-Owned", "Mesa Verde Chrysler", "Northgate Family Auto",
  "Copperfield Trucks", "Bluewater Honda", "Summit & Sons Used Cars", "Lakeshore Kia", "Iron Horse Auto Mall",
  "Redbud Motors", "Cedar Falls Auto Outlet",
];
const REQUESTS = [
  "We lose track of internet leads after the first call. Need something that chases them for us.",
  "Looking for automated follow-up texts for our BDC, we have two people covering 300 leads a month.",
  "Our CRM reminders get ignored. Want to see how your follow-up system works.",
  "Service-to-sales follow-up is nonexistent here. Can this help?",
  "Owner asked me to look at follow-up tools before Q4. Booking a demo.",
  "Need Spanish-language follow-up for about a third of our customers.",
  "Do you integrate with our DMS? We want unsold showroom traffic followed up automatically.",
  "Just want pricing and whether it works for a single rooftop.",
];

// ---------- Generation ----------

interface Build {
  contacts: Contact[];
  submissions: LeadSubmission[];
  opportunities: Opportunity[];
  assignments: Assignment[];
  tasks: Task[];
  calls: Call[];
  appointments: Appointment[];
  appointmentInstances: AppointmentInstance[];
  assessments: QualificationAssessment[];
  contracts: Contract[];
  ledger: LedgerEntry[];
  commissionEntries: CommissionEntry[];
  communicationProfiles: CommunicationProfile[];
  trackedWorkHours: TrackedWorkHours[];
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function weighted<T>(rng: () => number, entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

function pad(n: number): string {
  return String(n).padStart(3, "0");
}

export function generateObaviaDataset(seed = 20260918): Dataset {
  const rng = mulberry32(seed);
  const b: Build = {
    contacts: [], submissions: [], opportunities: [], assignments: [], tasks: [], calls: [], appointments: [],
    appointmentInstances: [], assessments: [], contracts: [], ledger: [], commissionEntries: [], communicationProfiles: [], trackedWorkHours: [],
  };
  let closerCursor = 0;
  let callSeq = 0;
  let instanceSeq = 0;
  let ledgerSeq = 0;
  const OPP_COUNT = 90;

  for (let i = 0; i < OPP_COUNT; i += 1) {
    const n = i + 1;
    const oppId = `opp_${pad(n)}`;
    const contactId = `ct_${pad(n)}`;
    const dayOffset = Math.floor((i * 30) / OPP_COUNT); // 0..29 -> Aug 20 .. Sep 18
    const receivedMs = BASE + dayOffset * DAY + (8 + Math.floor(rng() * 10)) * HOUR + Math.floor(rng() * 60) * 60_000;
    const isLast = i === OPP_COUNT - 1; // opted-out contact
    const entryPath: EntryPath = isLast ? "form_entry" : rng() < 0.6 ? "form_entry" : "booked_entry";
    const leadTier = weighted(rng, [[1, 0.3], [2, 0.45], [3, 0.25]]);
    const displayName = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length]}`;
    const preferredLanguage = i % 11 === 5 ? "es" : "en";

    b.contacts.push({
      tenantId: TENANT_ID,
      contactId,
      displayName,
      organizationName: DEALERSHIPS[(i * 5 + 1) % DEALERSHIPS.length],
      preferredLanguage,
      preferredChannel: pick(rng, ["phone", "sms", "email", "video"]),
      consent: isLast
        ? { phone: "revoked", sms: "revoked", email: "revoked" }
        : { phone: "granted", sms: rng() < 0.8 ? "granted" : "unknown", email: "granted" },
    });

    const source = entryPath === "booked_entry" ? "calendar_booking_page" : rng() < 0.7 ? "meta_lead_form" : "website_form";
    b.submissions.push({
      tenantId: TENANT_ID,
      submissionId: `sub_${pad(n)}`,
      providerEventId: `pev_${seed}_${pad(n)}`,
      source,
      campaign: source === "meta_lead_form" ? (leadTier === 1 ? "q3_dealer_bdc_video" : "q3_dealer_broad") : undefined,
      leadTier,
      entryPath,
      receivedAt: iso(receivedMs),
      requestText: REQUESTS[i % REQUESTS.length],
      contactId,
    });

    const opp: Opportunity = {
      tenantId: TENANT_ID,
      opportunityId: oppId,
      contactIds: [contactId],
      primaryContactId: contactId,
      offerId: OFFER_ID,
      workflowVersion: "wf-dealer-followup-1.0",
      entryPath,
      source,
      leadTier,
      commercialStatus: "open",
      accountabilityStartedAt: iso(receivedMs + 5_000),
      currentOwner: {},
      contactState: "none",
      fitState: "unassessed",
      contractState: "none",
      paymentState: "none",
    };
    b.opportunities.push(opp);

    if (isLast) {
      // Opted out before any action: no calls, no tasks, held for consent.
      opp.commercialStatus = "nurture";
      opp.dqReason = undefined;
      continue;
    }

    const assign = (role: "setter" | "closer", userId: Id, at: number, explanation: string) => {
      b.assignments.push({
        tenantId: TENANT_ID,
        assignmentId: `asg_${pad(n)}_${role}`,
        opportunityId: oppId,
        role,
        userId,
        policyVersion: "routing-1.0-pilot",
        decidedAt: iso(at),
        eligibleCandidateIds: role === "setter" ? SETTERS : CLOSERS.filter((c) => c !== "usr_closer_devin" || at >= Date.UTC(2026, 8, 1)),
        exclusions: [],
        selectionProbability: role === "setter" ? 0.5 : 1 / 3,
        explanation,
        acceptedAt: iso(at + 90_000),
      });
      opp.currentOwner[role] = userId;
    };

    const nextCloser = (at: number): Id => {
      const pool = at >= Date.UTC(2026, 8, 1) ? CLOSERS : CLOSERS.filter((c) => c !== "usr_closer_devin");
      const chosen = pool[closerCursor % pool.length];
      closerCursor += 1;
      return chosen;
    };

    const addCall = (userId: Id, at: number, outcome: Call["interpretedOutcome"], transport: Call["transportState"], duration?: number) => {
      callSeq += 1;
      b.calls.push({
        tenantId: TENANT_ID,
        callId: `call_${pad(callSeq)}`,
        opportunityId: oppId,
        userId,
        direction: "outbound",
        providerCallId: `pc_${seed}_${pad(callSeq)}`,
        transportState: transport,
        startedAt: iso(at),
        endedAt: transport === "ended" ? iso(at + (duration ?? 30) * 1000) : undefined,
        durationSeconds: transport === "ended" ? duration ?? 30 : undefined,
        interpretedOutcome: outcome,
        outcomeConfirmedBy: outcome === "meaningful_interaction" ? "rep" : outcome === "unknown" ? undefined : "policy",
        evidenceRefs: [`ev_call_${pad(callSeq)}`],
      });
    };

    const addInstance = (
      appointmentId: Id,
      startMs: number,
      retained: boolean,
      supersedes?: Id,
      forcedOutcome?: AppointmentInstanceOutcome,
    ): AppointmentInstance => {
      instanceSeq += 1;
      const endMs = startMs + 45 * 60_000;
      const matured = endMs + DAY <= NOW_MS;
      let outcome: AppointmentInstanceOutcome;
      if (forcedOutcome) outcome = forcedOutcome;
      else if (!retained) outcome = "canceled_before_cutoff";
      else if (!matured) outcome = "scheduled";
      else outcome = weighted(rng, [["attended", 0.62], ["customer_no_show", 0.22], ["late_canceled", 0.06], ["rep_no_show", 0.03], ["unknown", 0.07]]);
      const inst: AppointmentInstance = {
        tenantId: TENANT_ID,
        instanceId: `inst_${pad(instanceSeq)}`,
        appointmentId,
        opportunityId: oppId,
        scheduledStart: iso(startMs),
        scheduledEnd: iso(endMs),
        supersedesInstanceId: supersedes,
        confirmedByCustomer: retained && rng() < 0.75,
        retainedAfterReview: retained,
        outcome,
        attendanceEvidenceRefs: outcome === "attended" ? [`ev_meet_${pad(instanceSeq)}`] : [],
        attendedDurationSeconds: outcome === "attended" ? 900 + Math.floor(rng() * 1800) : undefined,
        matured: matured && outcome !== "scheduled",
      };
      b.appointmentInstances.push(inst);
      return inst;
    };

    const runClose = (closerId: Id, inst: AppointmentInstance) => {
      if (inst.outcome !== "attended") {
        if (inst.outcome === "customer_no_show" || inst.outcome === "late_canceled") {
          opp.commercialStatus = rng() < 0.5 ? "nurture" : "open";
        }
        return;
      }
      opp.contactState = "two_way_contact";
      const attendedAt = Date.parse(inst.scheduledEnd);
      addCall(closerId, Date.parse(inst.scheduledStart), "meaningful_interaction", "ended", inst.attendedDurationSeconds ?? 1500);
      const fit = weighted(rng, [["likely", 0.7], ["unlikely", 0.2], ["unsure", 0.1]] as [QualificationAssessment["repPerceivedFit"], number][]);
      const budgetKnown = rng() < 0.7;
      b.assessments.push({
        tenantId: TENANT_ID,
        assessmentId: `qa_${pad(n)}`,
        opportunityId: oppId,
        policyVersion: "fit-policy-1.0",
        objective: {
          rooftop_count_known: { value: "yes", evidenceRefs: [`ev_meet_${inst.instanceId}`] },
          budget_authority: { value: budgetKnown ? "yes" : "unknown", evidenceRefs: budgetKnown ? [`ev_meet_${inst.instanceId}`] : [] },
          dms_compatible: { value: rng() < 0.85 ? "yes" : "partial", evidenceRefs: [] },
        },
        repPerceivedFit: fit,
        repReason: fit === "likely" ? "Has a BDC and a lead volume problem they described in their own words." : fit === "unlikely" ? "Single rooftop, owner not involved yet." : "Need a second conversation with the GM.",
        aiRecommendation: fit === "likely" ? "proceed" : fit === "unlikely" ? "clarify" : "clarify",
        reviewState: "confirmed",
        nextQuestion: budgetKnown ? undefined : "Who signs off on software spend at the store?",
        assessedAt: iso(attendedAt + 10 * 60_000),
        assessedByUserId: closerId,
      });
      if (fit === "likely") {
        opp.fitState = budgetKnown ? "verified" : "likely";
        if (rng() < 0.4) {
          // Won: signed contract. Cash is separate.
          const withOption = rng() < 0.3;
          const value = withOption ? { amountMinor: offer.listPrice.amountMinor + offer.approvedOptions[1].delta.amountMinor, currency: "USD" } : offer.listPrice;
          const signedMs = attendedAt + (1 + Math.floor(rng() * 4)) * DAY;
          b.contracts.push({
            tenantId: TENANT_ID,
            contractId: `ctr_${pad(n)}`,
            opportunityId: oppId,
            offerId: OFFER_ID,
            offerVersion: offer.version,
            value,
            state: "signed",
            signedAt: iso(signedMs),
          });
          opp.contractState = "signed";
          opp.commercialStatus = "won";
          if (signedMs + DAY <= NOW_MS && rng() < 0.85) {
            ledgerSeq += 1;
            const paidMs = signedMs + Math.floor(rng() * 2) * DAY + 3 * HOUR;
            b.ledger.push({
              tenantId: TENANT_ID,
              entryId: `led_${pad(ledgerSeq)}`,
              opportunityId: oppId,
              contractId: `ctr_${pad(n)}`,
              kind: "payment_collected",
              amount: value,
              providerRef: `pi_${seed}_${pad(ledgerSeq)}`,
              idempotencyKey: `${TENANT_ID}:card_processor:acct_main:pi_${seed}_${pad(ledgerSeq)}`,
              occurredAt: iso(paidMs),
              receivedAt: iso(paidMs + 4_000),
              commercialCategory: "new_customer",
            });
            opp.paymentState = "collected";
            b.commissionEntries.push({
              tenantId: TENANT_ID,
              entryId: `com_${pad(n)}`,
              userId: closerId,
              opportunityId: oppId,
              policyVersion: commissionPolicy.policyVersion,
              amount: scale(value, commissionPolicy.ratePercent / 100),
              state: paidMs + 7 * DAY <= NOW_MS ? "payable" : "accrued",
            });
          } else {
            opp.paymentState = "none"; // signed but unpaid: contracted value moves, cash does not
            b.tasks.push({
              tenantId: TENANT_ID,
              taskId: `task_collect_${pad(n)}`,
              opportunityId: oppId,
              ownerUserId: closerId,
              action: "collect_payment",
              priority: { kind: "agreed_follow_up", dueAt: iso(signedMs + 3 * DAY) },
              dueAt: iso(signedMs + 3 * DAY),
              state: "assigned",
              idempotencyKey: `task:${oppId}:collect_payment`,
            });
          }
        } else {
          opp.commercialStatus = rng() < 0.4 ? "lost" : "open";
        }
      } else if (fit === "unlikely") {
        opp.fitState = "unlikely";
        opp.commercialStatus = rng() < 0.6 ? "lost" : "nurture";
      } else {
        opp.fitState = "clarify";
      }
    };

    if (entryPath === "form_entry") {
      const setterId = SETTERS[i % SETTERS.length];
      assign("setter", setterId, receivedMs + 6_000, `Assigned to ${users.find((u) => u.userId === setterId)?.displayName}: English support, open intake slots, available now, capacity-weighted round robin. Personality information was not used.`);
      const firstAttemptMs = receivedMs + (2 + Math.floor(rng() * 40)) * 60_000;
      const contacted = rng() < 0.65;
      if (!contacted) {
        const attempts = 1 + Math.floor(rng() * 3);
        for (let a = 0; a < attempts; a += 1) {
          addCall(setterId, firstAttemptMs + a * 6 * HOUR, rng() < 0.6 ? "voicemail" : "no_answer", "ended", 20);
        }
        opp.contactState = rng() < 0.6 ? "voicemail" : "attempted";
        if (attempts >= 3 && rng() < 0.5) opp.commercialStatus = "nurture";
        continue;
      }
      if (rng() < 0.3) addCall(setterId, firstAttemptMs, "voicemail", "ended", 15);
      const contactMs = firstAttemptMs + Math.floor(rng() * 3) * HOUR + 15 * 60_000;
      addCall(setterId, contactMs, "meaningful_interaction", "ended", 300 + Math.floor(rng() * 600));
      opp.contactState = "two_way_contact";
      if (rng() < 0.15) {
        // Pre-call DQ. Stays in the assigned denominator.
        opp.commercialStatus = "dq";
        opp.fitState = "unlikely";
        opp.dqReason = pick(rng, ["No sales BDC; wanted service scheduling only", "Dealership closing next month", "Already under contract with another vendor until 2027"]);
        continue;
      }
      if (rng() < 0.7) {
        const closerId = nextCloser(contactMs);
        assign("closer", closerId, contactMs + 20 * 60_000, `Assigned to ${users.find((u) => u.userId === closerId)?.displayName}: handoff with fit evidence and customer wording; open intake slots; capacity-weighted round robin. Personality information was not used.`);
        b.appointments.push({
          tenantId: TENANT_ID,
          appointmentId: `apt_${pad(n)}`,
          opportunityId: oppId,
          type: "sales",
          modality: "video",
          contactId,
          repUserId: closerId,
          timezone: "America/New_York",
          purpose: "See whether Obavia can chase internet leads the BDC drops after the first call",
        });
        const startMs = contactMs + (1 + Math.floor(rng() * 4)) * DAY + 2 * HOUR;
        const retained = rng() < 0.9;
        const inst = addInstance(`apt_${pad(n)}`, startMs, retained);
        runClose(closerId, inst);
      }
      continue;
    }

    // booked_entry: direct to closer; booking can precede any conversation.
    const closerId = nextCloser(receivedMs);
    assign("closer", closerId, receivedMs + 6_000, `Assigned to ${users.find((u) => u.userId === closerId)?.displayName}: self-booked inquiry routed directly to a closer; English support; open intake slots; available now. Personality information was not used.`);
    b.appointments.push({
      tenantId: TENANT_ID,
      appointmentId: `apt_${pad(n)}`,
      opportunityId: oppId,
      type: "sales",
      modality: rng() < 0.85 ? "video" : "phone",
      contactId,
      repUserId: closerId,
      timezone: "America/New_York",
      purpose: "Demo of automated follow-up for unsold showroom and internet traffic",
    });
    const startMs = receivedMs + (1 + Math.floor(rng() * 5)) * DAY + 3 * HOUR;
    const retained = rng() < 0.85;
    if (i === 7) {
      // Reschedule lineage: first instance superseded before cutoff, second attended.
      const first = addInstance(`apt_${pad(n)}`, startMs, true, undefined, "superseded_before_cutoff");
      first.matured = true;
      const second = addInstance(`apt_${pad(n)}`, startMs + 2 * DAY, true, first.instanceId, "attended");
      runClose(closerId, second);
      continue;
    }
    const inst = addInstance(`apt_${pad(n)}`, startMs, retained);
    runClose(closerId, inst);
  }

  // ---------- Specials ----------

  // Duplicate submission for opp_003's contact: preserved as an inquiry, no new accountable opportunity.
  const dupOf = b.submissions[2];
  b.submissions.push({
    ...dupOf,
    submissionId: "sub_003_dup",
    providerEventId: `${dupOf.providerEventId}_resubmit`,
    receivedAt: iso(Date.parse(dupOf.receivedAt) + 2 * DAY),
    requestText: "Submitting again, did not hear back yet on the follow-up tool.",
    duplicateOfSubmissionId: dupOf.submissionId,
  });

  // One refund on the first paid opportunity (T38 shape: collected, then partial refund).
  const firstPayment = b.ledger.find((e) => e.kind === "payment_collected");
  if (firstPayment) {
    ledgerSeq += 1;
    const refundMs = Date.parse(firstPayment.occurredAt) + 6 * DAY;
    b.ledger.push({
      tenantId: TENANT_ID,
      entryId: `led_${pad(ledgerSeq)}`,
      opportunityId: firstPayment.opportunityId,
      contractId: firstPayment.contractId,
      kind: "refund",
      amount: fromDollars(1_200),
      providerRef: `re_${seed}_${pad(ledgerSeq)}`,
      idempotencyKey: `${TENANT_ID}:card_processor:acct_main:re_${seed}_${pad(ledgerSeq)}`,
      occurredAt: iso(refundMs),
      receivedAt: iso(refundMs + 3_000),
      commercialCategory: "new_customer",
    });
    const refundedOpp = b.opportunities.find((o) => o.opportunityId === firstPayment.opportunityId);
    if (refundedOpp) refundedOpp.paymentState = "refunded";
    const com = b.commissionEntries.find((c) => c.opportunityId === firstPayment.opportunityId);
    if (com) com.state = "adjusted";
  }

  // One unlinked payment: exception queue.
  ledgerSeq += 1;
  b.ledger.push({
    tenantId: TENANT_ID,
    entryId: `led_${pad(ledgerSeq)}`,
    opportunityId: undefined,
    kind: "payment_collected",
    amount: fromDollars(4_800),
    providerRef: `pi_${seed}_unlinked_0917`,
    idempotencyKey: `${TENANT_ID}:card_processor:acct_main:pi_${seed}_unlinked_0917`,
    occurredAt: "2026-09-17T15:12:00Z",
    receivedAt: "2026-09-17T15:12:05Z",
    commercialCategory: "other",
  });

  // Calls in other transport states (today).
  const liveOpp = b.opportunities.find((o) => o.commercialStatus === "open" && o.entryPath === "form_entry" && o.contactState !== "two_way_contact");
  if (liveOpp) {
    for (const [transport, outcome] of [["queued", "unknown"], ["ringing", "unknown"], ["failed", "no_answer"]] as [Call["transportState"], Call["interpretedOutcome"]][]) {
      callSeq += 1;
      b.calls.push({
        tenantId: TENANT_ID,
        callId: `call_${pad(callSeq)}`,
        opportunityId: liveOpp.opportunityId,
        userId: liveOpp.currentOwner.setter ?? SETTERS[0],
        direction: "outbound",
        providerCallId: transport === "queued" ? undefined : `pc_${seed}_${pad(callSeq)}`,
        transportState: transport,
        startedAt: transport === "queued" ? undefined : iso(NOW_MS - 20 * 60_000),
        interpretedOutcome: outcome,
        outcomeConfirmedBy: outcome === "unknown" ? undefined : "policy",
        evidenceRefs: [],
      });
    }
  }

  // Open tasks covering every TaskPriorityReason kind.
  const openForm = b.opportunities.filter((o) => o.commercialStatus === "open" && o.entryPath === "form_entry");
  const upcomingInst = b.appointmentInstances.find((i) => i.outcome === "scheduled");
  const priorities: [TaskPriorityReason, Task["action"], Task["state"]][] = [
    [{ kind: "scheduled_commitment", dueAt: upcomingInst?.scheduledStart ?? iso(NOW_MS + 2 * HOUR) }, "confirm_appointment", "accepted"],
    [{ kind: "urgent_customer_reply", receivedAt: iso(NOW_MS - 25 * 60_000) }, "reply", "assigned"],
    [{ kind: "fresh_inquiry", receivedAt: iso(NOW_MS - 8 * 60_000) }, "call", "assigned"],
    [{ kind: "agreed_follow_up", dueAt: iso(NOW_MS + 3 * HOUR) }, "follow_up", "in_progress"],
    [{ kind: "approved_reattempt", attempt: 2 }, "call", "assigned"],
    [{ kind: "appointment_confirmation_review", appointmentInstanceId: upcomingInst?.instanceId ?? "inst_none" }, "review_dq", "assigned"],
  ];
  priorities.forEach(([priority, action, state], idx) => {
    const target = openForm[idx % Math.max(1, openForm.length)];
    if (!target) return;
    b.tasks.push({
      tenantId: TENANT_ID,
      taskId: `task_open_${pad(idx + 1)}`,
      opportunityId: target.opportunityId,
      ownerUserId: target.currentOwner.setter ?? SETTERS[idx % 2],
      action,
      priority,
      dueAt: "dueAt" in priority ? priority.dueAt : undefined,
      state,
      idempotencyKey: `task:${target.opportunityId}:${action}:${priority.kind}`,
      leaseHolderUserId: state === "in_progress" ? target.currentOwner.setter : undefined,
      leaseExpiresAt: state === "in_progress" ? iso(NOW_MS + 15 * 60_000) : undefined,
    });
  });

  // Communication profiles with explicit, plain-language preferences.
  const profiled = b.opportunities.filter((o) => o.contactState === "two_way_contact").slice(0, 3);
  const prefs = [
    ["prefers numbers first, then the story", "wants email summaries after every call"],
    ["asks for Spanish on calls; English is fine for documents", "does not want texts after 6pm local"],
    ["wants the GM on every decision call", "prefers a short agenda sent the day before"],
  ];
  profiled.forEach((o, idx) => {
    b.communicationProfiles.push({
      tenantId: TENANT_ID,
      profileId: `cp_${o.opportunityId}`,
      scope: "opportunity_conversation",
      opportunityId: o.opportunityId,
      preferredLanguage: { value: idx === 1 ? "es" : "en", source: "customer_selected" },
      explicitPreferences: prefs[idx].map((text, j) => ({ text, evidenceRef: `ev_pref_${o.opportunityId}_${j}` })),
      observedPreferences: idx === 0 ? [{ text: "responds faster to SMS than email", evidenceRef: `ev_obs_${o.opportunityId}`, confirmed: false }] : [],
      lenses: idx === 0
        ? [{ name: "efficiency_simplicity", status: "hypothesis", evidenceRefs: [`ev_pref_${o.opportunityId}_0`], contradictingEvidenceRefs: [], humanConfirmed: false }]
        : [],
      lastReviewedAt: iso(NOW_MS - 3 * DAY),
      reviewDueAt: iso(NOW_MS + 11 * DAY),
      policyVersion: "profile-policy-1.0",
    });
  });

  // Tracked work hours: partial coverage so M21 is provisional.
  b.trackedWorkHours.push({
    userId: "usr_closer_marcus",
    periodStart: iso(BASE),
    periodEnd: NOW,
    hours: 96,
    coverageComplete: false,
  });

  return {
    tenant,
    users,
    contacts: b.contacts,
    submissions: b.submissions,
    opportunities: b.opportunities,
    assignments: b.assignments,
    tasks: b.tasks,
    calls: b.calls,
    appointments: b.appointments,
    appointmentInstances: b.appointmentInstances,
    assessments: b.assessments,
    contracts: b.contracts,
    ledger: b.ledger,
    commissionPolicy,
    commissionEntries: b.commissionEntries,
    offers: [offer],
    communicationProfiles: b.communicationProfiles,
    trackedWorkHours: b.trackedWorkHours,
    synthetic: true,
  };
}

export const obaviaDataset: Dataset = generateObaviaDataset();

/** The opted-out contact and its opportunity, for routing and consent tests. */
export const OPTED_OUT_CONTACT_ID = "ct_090";
export const OPTED_OUT_OPPORTUNITY_ID = "opp_090";
/** Opportunity with a reschedule lineage (superseded instance then attended). */
export const RESCHEDULED_OPPORTUNITY_ID = "opp_008";
