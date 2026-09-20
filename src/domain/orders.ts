/**
 * Orders and their installment schedules (payments specification sections 5, 6).
 *
 * The person and the company are identity records. The opportunity is the sales
 * effort. The ORDER is the specific purchased agreement, and it is the thing
 * money pays down. One contact can hold several orders: a later upsell sold by a
 * different closer is a NEW order with its OWN attribution snapshot, never an
 * extension of the first closer's credit (spec 6, scenario 18).
 *
 * The rule this file exists to enforce: commission accrues per successful
 * installment and never for the whole contract at once. A $12,000 agreement
 * collected as four $3,000 payments accrues on $3,000 when the first one
 * succeeds, and on nothing else until the second one does.
 *
 * Money here is integer minor units with an ISO currency throughout. A schedule
 * is split so that the parts sum back to the whole exactly; no float divides a
 * price.
 *
 * Pure: no React, no I/O, no Date.now(). Every timestamp is injected.
 */
import type {
  ISODateTime,
  Id,
  LedgerEntry,
  Money,
  Order,
  OrderInstallment,
  AttributionSnapshot,
  CommissionPolicy,
  InstallmentState,
} from "./types";
import { COMMISSION_RATE_DEFAULTS } from "./types";
import { countsAsNetCollectedCash } from "./events";
import { add, scale, sub, zero } from "./money";
import {
  type AttributionRole,
  type DatasetWithAttribution,
  type SealInput,
  effectiveCredit,
  sealAttribution,
} from "./attribution";

// ---------- Building a schedule ----------

/**
 * Split an amount into `count` parts whose minor units sum back to the original
 * exactly. The remainder goes to the EARLIEST parts, so a schedule's deposit is
 * never a cent short of what the customer was told.
 *
 * Throws on a non-positive count rather than returning an empty schedule that a
 * caller would read as "paid in full".
 */
export function splitEvenly(total: Money, count: number): Money[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`splitEvenly needs a whole count of at least 1, received ${String(count)}`);
  }
  const base = Math.trunc(total.amountMinor / count);
  let remainder = total.amountMinor - base * count;
  const parts: Money[] = [];
  for (let i = 0; i < count; i += 1) {
    const extra = remainder > 0 ? 1 : remainder < 0 ? -1 : 0;
    remainder -= extra;
    parts.push({ amountMinor: base + extra, currency: total.currency });
  }
  return parts;
}

export interface ScheduleInput {
  orderId: Id;
  total: Money;
  /** Number of installments. 1 means a single payment, which is still a schedule. */
  count: number;
  firstDueAt: ISODateTime;
  /** Days between installments. Injected, so no clock is read here. */
  intervalDays: number;
}

/** A schedule of installments whose amounts sum to the order's contracted value. */
export function buildInstallments(input: ScheduleInput): OrderInstallment[] {
  const parts = splitEvenly(input.total, input.count);
  const firstMs = Date.parse(input.firstDueAt);
  if (Number.isNaN(firstMs)) throw new Error(`buildInstallments: firstDueAt is not a timestamp: ${input.firstDueAt}`);
  return parts.map((amount, i) => ({
    installmentId: `${input.orderId}_i${String(i + 1).padStart(2, "0")}`,
    sequence: i + 1,
    dueAt: new Date(firstMs + i * input.intervalDays * 86_400_000).toISOString().replace(".000Z", "Z"),
    amount,
    state: "scheduled" as InstallmentState,
  }));
}

export function scheduledTotal(order: Pick<Order, "installments" | "contractedValue">): Money {
  return order.installments.reduce((acc, i) => add(acc, i.amount), zero(order.contractedValue.currency));
}

export interface CreateOrderInput {
  tenantId: Id;
  orderId: Id;
  opportunityId: Id;
  offerId: Id;
  offerVersion: string;
  contractId?: Id;
  contractedValue: Money;
  discount?: Order["discount"];
  installments: OrderInstallment[];
  createdAt: ISODateTime;
  createdByUserId: Id;
  state?: Order["state"];
}

/**
 * An order in `draft` (or an explicitly given earlier state). It carries no
 * attribution yet: credit is sealed at issue, not at draft.
 *
 * Refuses a schedule that does not sum to the contracted value. A schedule that
 * silently disagrees with the price is how a customer ends up owing an amount
 * nobody quoted.
 */
export function createOrder(input: CreateOrderInput): Order {
  const order: Order = {
    tenantId: input.tenantId,
    orderId: input.orderId,
    opportunityId: input.opportunityId,
    offerId: input.offerId,
    offerVersion: input.offerVersion,
    contractId: input.contractId,
    contractedValue: input.contractedValue,
    discount: input.discount,
    installments: input.installments,
    state: input.state ?? "draft",
    createdAt: input.createdAt,
    createdByUserId: input.createdByUserId,
  };
  const scheduled = scheduledTotal(order);
  if (scheduled.amountMinor !== order.contractedValue.amountMinor || scheduled.currency !== order.contractedValue.currency) {
    throw new Error(
      `createOrder ${input.orderId}: the schedule totals ${scheduled.amountMinor} ${scheduled.currency} but the contracted value is ${order.contractedValue.amountMinor} ${order.contractedValue.currency}.`,
    );
  }
  return order;
}

export interface IssueInput extends Omit<SealInput, "order"> {
  issuedAt: ISODateTime;
}

/**
 * Issue an order for payment. This is the attribution seal point
 * (ATTRIBUTION_FREEZE_POLICY.sealedAt): from here the credited identities are
 * immutable and every money read follows the snapshot.
 *
 * Returns a NEW order object; the input is not mutated. Issuing twice is
 * refused, because a second seal on one order would be a silent rewrite of
 * credit that already governs collected money.
 */
export function issueOrderForPayment(order: Order, input: IssueInput): { order: Order; snapshot: AttributionSnapshot } {
  if (order.attributionSnapshotId) {
    throw new Error(
      `issueOrderForPayment ${order.orderId}: already issued and sealed as ${order.attributionSnapshotId}. Credit changes only through an appended authorized correction.`,
    );
  }
  const snapshot = sealAttribution({
    snapshotId: input.snapshotId,
    order,
    frozenAt: input.frozenAt,
    commissionPolicyVersion: input.commissionPolicyVersion,
    setterUserId: input.setterUserId,
    closerUserId: input.closerUserId,
    pairId: input.pairId,
  });
  return {
    order: {
      ...order,
      state: "issued_for_payment",
      issuedForPaymentAt: input.issuedAt,
      attributionSnapshotId: snapshot.snapshotId,
    },
    snapshot,
  };
}

// ---------- Money that landed on an order ----------

/** Movements bound to this order, in occurrence order. */
export function orderLedger(order: Pick<Order, "orderId">, entries: LedgerEntry[]): LedgerEntry[] {
  return entries
    .filter((e) => e.orderId === order.orderId)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.entryId.localeCompare(b.entryId));
}

export interface InstallmentCollection {
  installment: OrderInstallment;
  /** Cash confirmed against this installment, after any adjustment applied to it. */
  collected: Money;
  /** Confirmed money returned or lost that was applied against this installment. */
  adjusted: Money;
  /** Derived from evidence, not from a flag someone typed. */
  state: InstallmentState;
  /** Entry ids that fed this installment, so the figure can be traced. */
  entryIds: Id[];
}

/**
 * How much confirmed cash each installment has actually received.
 *
 * Allocation, stated plainly so nobody mistakes it for provider evidence:
 * - An explicit binding wins. When a movement names its installment through
 *   `bindings`, that is used and nothing is inferred.
 * - Otherwise collections fill the schedule in sequence order, earliest first.
 *   A four-part schedule receiving one payment has paid installment one.
 * - Confirmed reductions (a refund, a lost dispute) are applied in REVERSE
 *   sequence, against the most recently satisfied installment first, and never
 *   below zero for that installment.
 *
 * Only movements that pass `countsAsNetCollectedCash` participate. A payment
 * still processing, an invoice marked paid outside the processor, a spreadsheet
 * row and a test-mode event are each genuine records and none of them satisfies
 * an installment.
 */
export function installmentCollections(
  order: Order,
  entries: LedgerEntry[],
  bindings: Record<Id, Id> = {},
): InstallmentCollection[] {
  const currency = order.contractedValue.currency;
  const schedule = [...order.installments].sort((a, b) => a.sequence - b.sequence);
  const collected = new Map<Id, number>();
  const adjusted = new Map<Id, number>();
  const traced = new Map<Id, Id[]>();
  for (const i of schedule) {
    collected.set(i.installmentId, 0);
    adjusted.set(i.installmentId, 0);
    traced.set(i.installmentId, []);
  }

  const cash = orderLedger(order, entries).filter(countsAsNetCollectedCash);
  const credits = cash.filter((e) => e.kind === "payment_collected" || e.kind === "dispute_credit");
  const debits = cash.filter((e) => e.kind === "refund" || e.kind === "dispute_debit");

  const place = (entry: LedgerEntry, order_: Id[], target: Map<Id, number>, capacityOf: (id: Id) => number) => {
    let left = entry.amount.amountMinor;
    const bound = bindings[entry.entryId];
    const ids = bound ? [bound] : order_;
    for (const id of ids) {
      if (left <= 0) break;
      const room = bound ? left : Math.max(0, capacityOf(id));
      const take = Math.min(left, room);
      if (take <= 0) continue;
      target.set(id, (target.get(id) ?? 0) + take);
      traced.get(id)?.push(entry.entryId);
      left -= take;
    }
    // Money beyond the schedule still happened. It stays on the order's totals
    // (an overpayment is a real fact) and satisfies no further installment.
  };

  const forward = schedule.map((i) => i.installmentId);
  for (const entry of credits) {
    place(entry, forward, collected, (id) => {
      const due = schedule.find((i) => i.installmentId === id)?.amount.amountMinor ?? 0;
      return due - (collected.get(id) ?? 0);
    });
  }
  const reverse = [...forward].reverse();
  for (const entry of debits) {
    place(entry, reverse, adjusted, (id) => (collected.get(id) ?? 0) - (adjusted.get(id) ?? 0));
  }

  return schedule.map((installment) => {
    const gross = collected.get(installment.installmentId) ?? 0;
    const back = adjusted.get(installment.installmentId) ?? 0;
    const net = gross - back;
    const state: InstallmentState =
      net >= installment.amount.amountMinor && installment.amount.amountMinor > 0
        ? "collected"
        : installment.state === "canceled" || installment.state === "failed"
          ? installment.state
          : gross > 0
            ? "requested"
            : installment.state;
    return {
      installment,
      collected: { amountMinor: net, currency },
      adjusted: { amountMinor: back, currency },
      state,
      entryIds: traced.get(installment.installmentId) ?? [],
    };
  });
}

export interface OrderTotals {
  orderId: Id;
  /** The approved value of the agreement. A discount reduces this and nothing else. */
  contracted: Money;
  /** Processor-confirmed cash on this order, after confirmed reductions. */
  collected: Money;
  /** Contracted value not yet confirmed as collected. Never negative. */
  remainingScheduled: Money;
  /** Installments fully satisfied by confirmed cash. */
  collectedInstallments: number;
  totalInstallments: number;
}

export function orderTotals(order: Order, entries: LedgerEntry[], bindings: Record<Id, Id> = {}): OrderTotals {
  const currency = order.contractedValue.currency;
  const rows = installmentCollections(order, entries, bindings);
  const collected = rows.reduce((acc, r) => add(acc, r.collected), zero(currency));
  const remaining = sub(order.contractedValue, collected);
  return {
    orderId: order.orderId,
    contracted: order.contractedValue,
    collected,
    remainingScheduled: { amountMinor: Math.max(0, remaining.amountMinor), currency },
    collectedInstallments: rows.filter((r) => r.state === "collected").length,
    totalInstallments: rows.length,
  };
}

// ---------- Commission, per successful installment ----------

export interface CommissionAccrual {
  orderId: Id;
  installmentId: Id;
  sequence: number;
  userId: Id;
  role: AttributionRole;
  /** The confirmed cash this accrual is calculated from. Never the contract total. */
  basisAmount: Money;
  ratePercent: number;
  amount: Money;
  /** The policy version sealed with the order, not today's policy. */
  policyVersion: string;
  hypothetical: boolean;
}

function rateFor(policies: CommissionPolicy[], role: AttributionRole): CommissionPolicy | undefined {
  return policies.find((p) => p.role === role) ?? policies.find((p) => p.role === undefined);
}

/**
 * Commission accrued on an order, one row per credited rep per SUCCESSFUL
 * installment.
 *
 * Three properties this shape guarantees:
 * - Nothing accrues on an installment that has not been collected. A signed
 *   $12,000 agreement with one $3,000 payment accrues on $3,000.
 * - The setter row and the closer row reference the SAME $3,000. They are two
 *   role views of one movement, and summing them is not a company figure.
 *   Company collected cash for that installment is `basisAmount`, once.
 * - Credit and the policy version come from the sealed snapshot. Reassigning
 *   the contact tomorrow changes neither.
 *
 * Partially collected installments accrue nothing: an installment is a
 * successful payment or it is not one yet. That keeps the rule in spec 6
 * ("do not award the entire contract's commission when only the first
 * installment has been collected") from being softened into proration.
 */
export function commissionAccruals(
  order: Order,
  snapshot: AttributionSnapshot,
  entries: LedgerEntry[],
  policies: CommissionPolicy[],
  bindings: Record<Id, Id> = {},
): CommissionAccrual[] {
  const credit = effectiveCredit(snapshot);
  const out: CommissionAccrual[] = [];
  for (const row of installmentCollections(order, entries, bindings)) {
    if (row.state !== "collected") continue;
    for (const role of ["setter", "closer"] as const) {
      const userId = role === "setter" ? credit.setterUserId : credit.closerUserId;
      if (!userId) continue;
      const policy = rateFor(policies, role);
      if (!policy) continue;
      out.push({
        orderId: order.orderId,
        installmentId: row.installment.installmentId,
        sequence: row.installment.sequence,
        userId,
        role,
        basisAmount: row.collected,
        ratePercent: policy.ratePercent,
        amount: scale(row.collected, policy.ratePercent / 100),
        policyVersion: snapshot.commissionPolicyVersion,
        hypothetical: policy.hypothetical || COMMISSION_RATE_DEFAULTS.hypothetical,
      });
    }
  }
  return out;
}

/**
 * The company's collected cash across a set of orders: every movement counted
 * once, whatever role views exist over it. Setter and closer reports each
 * reference this same money; they are not additive (spec 6, scenario 25).
 */
export function companyCollected(orders: Order[], entries: LedgerEntry[], currency: string): Money {
  let total = zero(currency);
  for (const order of orders) total = add(total, orderTotals(order, entries).collected);
  return total;
}

/** Every order on one opportunity, oldest first. A later upsell is its own row. */
export function ordersFor(data: DatasetWithAttribution, opportunityId: Id): Order[] {
  return (data.orders ?? [])
    .filter((o) => o.opportunityId === opportunityId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.orderId.localeCompare(b.orderId));
}
