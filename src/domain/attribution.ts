/**
 * Frozen sale-level credit (payments specification sections 2, 5 step 2, and 8).
 *
 * The defect this module exists to close: credit used to be a live read of
 * `Opportunity.currentOwner`, so changing who owns a contact today moved that
 * rep's entire historical commission to someone else. Spec section 2 forbids
 * deriving historical credit from whoever owns the contact today; section 8
 * requires a freeze.
 *
 * The rule here, in one sentence: once an order is issued for payment its
 * credited identities are SEALED into an AttributionSnapshot, and every money
 * read follows the seal instead of today's owner.
 *
 * Three things this module deliberately does not do:
 * - It never derives credit from who sent the payment request. An operations
 *   employee may send an invoice on a closer's behalf and acquires no credit
 *   (spec 5 step 2, scenario 8). `PaymentRequest.requestedByUserId` is never
 *   read here.
 * - It never resolves ambiguity by guessing. An entry that cannot be tied to
 *   exactly one snapshot is reported unsealed, not attached to a convenient
 *   representative.
 * - It never edits a sealed record. An authorized, reasoned correction is
 *   APPENDED; the original values are copied into the correction and kept.
 *
 * Pure: no React, no I/O, no Date.now(). Every timestamp is injected.
 */
import type {
  AttributionCorrection,
  AttributionSnapshot,
  ISODateTime,
  Id,
  LedgerEntry,
  Opportunity,
  Order,
  PaymentRequest,
  Role,
} from "./types";
import { ATTRIBUTION_FREEZE_POLICY } from "./types";
import type { Dataset } from "./metrics";

export type AttributionRole = "setter" | "closer";

/**
 * The dataset extended with the order and attribution records. Every field is
 * optional, so an existing `Dataset` is still a valid argument everywhere and
 * nothing in this file changes behaviour for data that carries no snapshots.
 * Same shape of extension as `DatasetWithPairs` in pairs.ts.
 */
export type AttributionRecords = {
  orders?: Order[];
  attributionSnapshots?: AttributionSnapshot[];
  paymentRequests?: PaymentRequest[];
};

export type DatasetWithAttribution = Dataset & AttributionRecords;

/**
 * What a money read does with a movement that carries NO sealed credit.
 *
 * This is a compatibility decision, kept as one named constant so that changing
 * it is a visible act rather than a scattered edit. Records written before
 * orders existed (fixtures, spreadsheet imports, every pre-existing ledger row)
 * have no snapshot, and for those the reader falls back to the opportunity's
 * current owner exactly as it always did. Nothing regresses, and nothing
 * pretends to be sealed that is not.
 *
 * The moment a movement IS sealed, the seal wins outright and today's owner is
 * never consulted. That is the whole fix.
 */
export const UNSEALED_CREDIT_FALLBACK = "current_owner" as const;

/** Where a credit came from, so a caller can disclose it rather than guess. */
export type CreditSource =
  /** An AttributionSnapshot sealed at order issuance. Immutable. */
  | "snapshot"
  /** No snapshot exists for this record. Today's owner, under UNSEALED_CREDIT_FALLBACK. */
  | "current_owner"
  /** Several snapshots could apply and none is authoritative. Never guessed. */
  | "ambiguous"
  /** No credit could be established at all. Genuine collection, unallocated credit. */
  | "unallocated";

export interface Credit {
  setterUserId?: Id;
  closerUserId?: Id;
  pairId?: Id;
  /** Present only when the credit came from a snapshot. */
  commissionPolicyVersion?: string;
  snapshotId?: Id;
  source: CreditSource;
}

// ---------- Reading the sealed record ----------

function snapshots(data: AttributionRecords): AttributionSnapshot[] {
  return data.attributionSnapshots ?? [];
}

function orders(data: AttributionRecords): Order[] {
  return data.orders ?? [];
}

export function snapshotById(data: AttributionRecords, snapshotId: Id): AttributionSnapshot | undefined {
  return snapshots(data).find((s) => s.snapshotId === snapshotId);
}

export function orderById(data: AttributionRecords, orderId: Id): Order | undefined {
  return orders(data).find((o) => o.orderId === orderId);
}

export function ordersForOpportunity(data: AttributionRecords, opportunityId: Id): Order[] {
  return orders(data).filter((o) => o.opportunityId === opportunityId);
}

export function snapshotsForOpportunity(data: AttributionRecords, opportunityId: Id): AttributionSnapshot[] {
  return snapshots(data).filter((s) => s.opportunityId === opportunityId);
}

/**
 * The credit a snapshot establishes right now: the sealed identities with every
 * appended authorized correction folded over them, in append order.
 *
 * The sealed fields themselves are never rewritten. Folding is a read.
 */
export function effectiveCredit(snapshot: AttributionSnapshot): Credit {
  let setterUserId = snapshot.setterUserId;
  let closerUserId = snapshot.closerUserId;
  let pairId = snapshot.pairId;
  for (const correction of snapshot.corrections) {
    setterUserId = correction.next.setterUserId;
    closerUserId = correction.next.closerUserId;
    pairId = correction.next.pairId;
  }
  const unallocated = snapshot.unallocated === true || (!setterUserId && !closerUserId);
  return {
    setterUserId,
    closerUserId,
    pairId,
    commissionPolicyVersion: snapshot.commissionPolicyVersion,
    snapshotId: snapshot.snapshotId,
    source: unallocated ? "unallocated" : "snapshot",
  };
}

/**
 * The snapshot that governs one ledger entry, in a fixed order of preference.
 * Every step is an explicit binding made before or at the time money moved; no
 * step infers a relationship from an amount, a date, a name or an email.
 *
 *   1. The entry names its snapshot.
 *   2. The entry names its order, and that order was issued (so it has a seal).
 *   3. The entry names an opportunity that holds exactly ONE snapshot.
 *
 * Step 3 stops at "exactly one" on purpose. A contact with two orders has two
 * snapshots, and choosing between them from an amount would be the guesswork
 * this module exists to refuse (scenario 9, scenario 11).
 */
export function snapshotForEntry(data: AttributionRecords, entry: LedgerEntry): AttributionSnapshot | undefined {
  if (entry.attributionSnapshotId) {
    const direct = snapshotById(data, entry.attributionSnapshotId);
    if (direct) return direct;
  }
  if (entry.orderId) {
    const order = orderById(data, entry.orderId);
    if (order?.attributionSnapshotId) {
      const viaOrder = snapshotById(data, order.attributionSnapshotId);
      if (viaOrder) return viaOrder;
    }
  }
  if (entry.opportunityId) {
    const forOpportunity = snapshotsForOpportunity(data, entry.opportunityId);
    if (forOpportunity.length === 1) return forOpportunity[0];
  }
  return undefined;
}

/** True when the entry's credit is sealed, whatever that seal says. */
export function isSealed(data: AttributionRecords, entry: LedgerEntry): boolean {
  return snapshotForEntry(data, entry) !== undefined;
}

function opportunityById(data: Dataset, opportunityId?: Id): Opportunity | undefined {
  if (!opportunityId) return undefined;
  return data.opportunities.find((o) => o.opportunityId === opportunityId);
}

/**
 * Who is credited for one movement, in one role.
 *
 * Sealed movements answer from the seal and never consult today's owner. An
 * unsealed movement answers from the opportunity's current owner under
 * UNSEALED_CREDIT_FALLBACK, which is what every pre-order record did already.
 */
export function creditForEntry(data: DatasetWithAttribution, entry: LedgerEntry): Credit {
  const snapshot = snapshotForEntry(data, entry);
  if (snapshot) return effectiveCredit(snapshot);
  if (entry.opportunityId && snapshotsForOpportunity(data, entry.opportunityId).length > 1) {
    return { source: "ambiguous" };
  }
  const opp = opportunityById(data, entry.opportunityId);
  if (!opp) return { source: "unallocated" };
  return {
    setterUserId: opp.currentOwner.setter,
    closerUserId: opp.currentOwner.closer,
    pairId: opp.pairId,
    source: UNSEALED_CREDIT_FALLBACK,
  };
}

export function creditedUserIn(credit: Credit, role: AttributionRole): Id | undefined {
  return role === "setter" ? credit.setterUserId : credit.closerUserId;
}

/** Who is credited for this movement in this role, sealed credit first. */
export function creditedUserForEntry(
  data: DatasetWithAttribution,
  entry: LedgerEntry,
  role: AttributionRole,
): Id | undefined {
  return creditedUserIn(creditForEntry(data, entry), role);
}

export function entryCreditedTo(
  data: DatasetWithAttribution,
  entry: LedgerEntry,
  userId: Id,
  role: AttributionRole,
): boolean {
  return creditedUserForEntry(data, entry, role) === userId;
}

/** Movements credited to this user in this role. Order is preserved. */
export function ledgerCreditedTo(
  data: DatasetWithAttribution,
  userId: Id,
  role: AttributionRole,
  entries: LedgerEntry[] = data.ledger,
): LedgerEntry[] {
  return entries.filter((e) => entryCreditedTo(data, e, userId, role));
}

/**
 * Movements credited to this user in EITHER role. Used where a rep's own feed
 * shows their work rather than a role-scoped ranking. The same movement can
 * appear in a setter view and a closer view; those views are not additive, and
 * company cash still counts it once (spec section 6).
 */
export function ledgerCreditedToAnyRole(
  data: DatasetWithAttribution,
  userId: Id,
  entries: LedgerEntry[] = data.ledger,
): LedgerEntry[] {
  return entries.filter((e) => entryCreditedTo(data, e, userId, "setter") || entryCreditedTo(data, e, userId, "closer"));
}

/**
 * True only when a seal EXISTS for this movement and it names someone else.
 *
 * This is the conservative half of the contract, for readers whose cohort is
 * already defined some other way (a leaderboard row selects opportunities by
 * assignment history, which is a genuine statement about assigned work). Such a
 * reader should not re-derive its cohort from ownership; it only needs to stop
 * counting money that is sealed to a different rep. An unsealed movement is
 * left exactly as that reader already had it.
 */
export function sealedElsewhere(
  data: DatasetWithAttribution,
  entry: LedgerEntry,
  userId: Id,
  role: AttributionRole,
): boolean {
  const snapshot = snapshotForEntry(data, entry);
  if (!snapshot) return false;
  return creditedUserIn(effectiveCredit(snapshot), role) !== userId;
}

/**
 * What the seals on one opportunity say about this user in this role.
 * - "unsealed"        No order on it has been issued. Nothing to say; the
 *                     caller keeps whatever cohort rule it already had.
 * - "sealed_to_user"  At least one sealed order on it credits this user.
 * - "sealed_elsewhere" It is sealed, and to somebody else.
 */
export function opportunitySealVerdict(
  data: AttributionRecords,
  opportunityId: Id,
  userId: Id,
  role: AttributionRole,
): "unsealed" | "sealed_to_user" | "sealed_elsewhere" {
  const sealed = snapshotsForOpportunity(data, opportunityId);
  if (sealed.length === 0) return "unsealed";
  return sealed.some((s) => creditedUserIn(effectiveCredit(s), role) === userId) ? "sealed_to_user" : "sealed_elsewhere";
}

/**
 * Opportunities whose credit in this role belongs to the user: sealed credit
 * first, today's owner only where nothing is sealed.
 *
 * An opportunity holding several snapshots (a sale and a later upsell) is
 * included when ANY of them credits the user, because the user genuinely holds
 * credit on part of that contact's business. Which movement belongs to which
 * order is decided per movement by `creditForEntry`, never here.
 */
export function opportunitiesCreditedTo(
  data: DatasetWithAttribution,
  userId: Id,
  role: AttributionRole,
): Opportunity[] {
  return data.opportunities.filter((opp) => {
    const verdict = opportunitySealVerdict(data, opp.opportunityId, userId, role);
    if (verdict !== "unsealed") return verdict === "sealed_to_user";
    return opp.currentOwner[role] === userId;
  });
}

// ---------- Sealing ----------

export interface SealInput {
  snapshotId: Id;
  order: Pick<Order, "tenantId" | "orderId" | "opportunityId">;
  /** Injected. No clock is read inside the domain. */
  frozenAt: ISODateTime;
  commissionPolicyVersion: string;
  /**
   * Identities from authenticated assignments and accepted handoffs. Never from
   * a browser field, and never from whoever pressed send on a payment request.
   */
  setterUserId?: Id;
  closerUserId?: Id;
  pairId?: Id;
}

/**
 * Seal the credit for an order. The freeze point comes from
 * ATTRIBUTION_FREEZE_POLICY (proposed default: captured at handoff acceptance,
 * sealed at order issuance), so changing the policy changes every seal at once.
 *
 * A snapshot with neither a setter nor a closer is marked `unallocated`: the
 * collection is still genuine, the credit simply is not established yet
 * (spec 17.2, scenario 45).
 */
export function sealAttribution(input: SealInput): AttributionSnapshot {
  const unallocated = !input.setterUserId && !input.closerUserId;
  return {
    tenantId: input.order.tenantId,
    snapshotId: input.snapshotId,
    orderId: input.order.orderId,
    opportunityId: input.order.opportunityId,
    setterUserId: input.setterUserId,
    closerUserId: input.closerUserId,
    pairId: input.pairId,
    commissionPolicyVersion: input.commissionPolicyVersion,
    freezePoint: ATTRIBUTION_FREEZE_POLICY.sealedAt,
    frozenAt: input.frozenAt,
    corrections: [],
    ...(unallocated ? { unallocated: true } : {}),
  };
}

/**
 * Identities for a seal, taken from the opportunity's authenticated assignment
 * state at issue time and from nothing else.
 *
 * `sentByUserId` is accepted and deliberately ignored: it exists so a caller
 * can pass what it has without that value ever reaching the credit. Sending the
 * invoice is not proof of being the closer (spec 5 step 2, scenario 8).
 */
export function identitiesAtIssue(opportunity: Opportunity, _sentByUserId?: Id): Pick<SealInput, "setterUserId" | "closerUserId" | "pairId"> {
  void _sentByUserId;
  return {
    setterUserId: opportunity.currentOwner.setter,
    closerUserId: opportunity.currentOwner.closer,
    pairId: opportunity.pairId,
  };
}

/**
 * The credit a payment request's sender acquires: none, in every case.
 * Kept as a named function so the rule is testable and impossible to forget.
 */
export function senderCredit(_request: Pick<PaymentRequest, "requestedByUserId">): null {
  void _request;
  return null;
}

// ---------- Corrections ----------

/**
 * The small predetermined set of exception rules spec section 8 requires the
 * owner to define once at onboarding, rather than letting a representative pick
 * a new attribution method per sale. PROPOSED, not ratified.
 */
export const ATTRIBUTION_EXCEPTION_RULES = {
  ratified: false,
  rules: [
    "split_credit",
    "manager_reassignment_before_payment",
    "late_close_by_second_rep",
    "team_assist",
    "disputed_ownership",
    "unallocated_resolution",
  ] as const,
} as const;

export type AttributionExceptionRule = (typeof ATTRIBUTION_EXCEPTION_RULES.rules)[number];

/** Only these roles may authorize a correction. A rep never corrects their own credit. */
export const AUTHORIZED_CORRECTION_ROLES: Role[] = ["owner", "manager"];

/**
 * Fields that the seal fixes. None of them is reachable by an ordinary edit,
 * whoever is asking. The commission policy version in particular is never
 * correctable at all: a sale is compensated under the policy that was in force
 * when it was sealed.
 */
export const SEALED_SNAPSHOT_FIELDS = [
  "setterUserId",
  "closerUserId",
  "pairId",
  "commissionPolicyVersion",
  "freezePoint",
  "frozenAt",
  "orderId",
  "opportunityId",
] as const;

/** Sealed fields that an appended, authorized correction may establish new values for. */
export const CORRECTABLE_FIELDS = ["setterUserId", "closerUserId", "pairId"] as const;

export interface Actor {
  userId: Id;
  roles: Role[];
}

export interface CorrectionRequest {
  correctionId: Id;
  at: ISODateTime;
  rule: string;
  reason: string;
  next: { setterUserId?: Id; closerUserId?: Id; pairId?: Id };
  evidenceRefs?: Id[];
}

export type CorrectionOutcome =
  | { ok: true; snapshot: AttributionSnapshot; correction: AttributionCorrection }
  | { ok: false; reason: string; code: CorrectionRefusalCode };

export type CorrectionRefusalCode =
  | "not_authorized_role"
  | "self_serving"
  | "unknown_rule"
  | "reason_required"
  | "no_change";

/**
 * Append an authorized, reasoned correction to a sealed snapshot.
 *
 * Refusals, each one a policy and not an accident:
 * - The actor must hold an authorizing role. A representative may not change
 *   their own credited closer through an ordinary edit or through this path.
 * - The actor may not be a party to the change, in or out. Someone who would
 *   gain credit, or who is losing it, does not sign their own reassignment.
 * - The rule must be one of the owner's predetermined exceptions. A free-text
 *   justification invented per sale is exactly what spec 8 rules out.
 * - A reason is required, and a correction that changes nothing is refused
 *   rather than written as noise into an audit trail.
 *
 * On success the ORIGINAL snapshot object is untouched: a new snapshot is
 * returned with the correction appended, and the correction carries a copy of
 * the values as they stood. Nothing is ever overwritten.
 */
export function appendCorrection(
  snapshot: AttributionSnapshot,
  request: CorrectionRequest,
  actor: Actor,
): CorrectionOutcome {
  const authorizingRole = actor.roles.find((r) => AUTHORIZED_CORRECTION_ROLES.includes(r));
  if (!authorizingRole) {
    return {
      ok: false,
      code: "not_authorized_role",
      reason: `Sealed credit is changed only by ${AUTHORIZED_CORRECTION_ROLES.join(" or ")}. A representative cannot change their own credited closer.`,
    };
  }
  if (!request.reason.trim()) {
    return { ok: false, code: "reason_required", reason: "A correction to sealed credit requires a stated reason." };
  }
  if (!(ATTRIBUTION_EXCEPTION_RULES.rules as readonly string[]).includes(request.rule)) {
    return {
      ok: false,
      code: "unknown_rule",
      reason: `"${request.rule}" is not one of the approved exception rules (${ATTRIBUTION_EXCEPTION_RULES.rules.join(", ")}).`,
    };
  }

  const before = effectiveCredit(snapshot);
  const previous = { setterUserId: before.setterUserId, closerUserId: before.closerUserId, pairId: before.pairId };
  const parties = new Set<Id>();
  for (const id of [previous.setterUserId, previous.closerUserId, request.next.setterUserId, request.next.closerUserId]) {
    if (id) parties.add(id);
  }
  if (parties.has(actor.userId)) {
    return {
      ok: false,
      code: "self_serving",
      reason: "The person authorizing a credit correction cannot be a party to it, gaining or losing.",
    };
  }
  const unchanged =
    previous.setterUserId === request.next.setterUserId &&
    previous.closerUserId === request.next.closerUserId &&
    previous.pairId === request.next.pairId;
  if (unchanged) {
    return { ok: false, code: "no_change", reason: "This correction would change nothing. Nothing is appended." };
  }

  const correction: AttributionCorrection = {
    correctionId: request.correctionId,
    at: request.at,
    authorizedByUserId: actor.userId,
    authorizerRole: authorizingRole,
    rule: request.rule,
    reason: request.reason,
    previous,
    next: { ...request.next },
    evidenceRefs: request.evidenceRefs ?? [],
  };
  return {
    ok: true,
    correction,
    snapshot: { ...snapshot, corrections: [...snapshot.corrections, correction] },
  };
}

export interface EditRefusal {
  ok: false;
  code: "sealed";
  reason: string;
  refusedFields: string[];
}

/**
 * The ordinary edit path, which exists only to refuse.
 *
 * Whoever the actor is, and whatever they are patching, a sealed field is not
 * editable. There is one supported route and it leaves a trail:
 * `appendCorrection`. This makes the rule "a representative cannot change their
 * own credited closer or commission policy version through an ordinary edit"
 * a behaviour with a test, rather than a sentence in a document.
 */
export function ordinaryEdit(patch: Partial<Record<(typeof SEALED_SNAPSHOT_FIELDS)[number], unknown>>): EditRefusal {
  const refusedFields = SEALED_SNAPSHOT_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(patch, f));
  return {
    ok: false,
    code: "sealed",
    reason:
      refusedFields.length === 0
        ? "An attribution snapshot is sealed. Credit changes only through an authorized, reasoned correction that is appended to it."
        : `${refusedFields.join(", ")} ${refusedFields.length === 1 ? "is" : "are"} sealed at order issuance. Credit changes only through an authorized, reasoned correction that is appended to the snapshot.`,
    refusedFields: [...refusedFields],
  };
}
