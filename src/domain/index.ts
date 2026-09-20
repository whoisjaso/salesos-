/**
 * Sales OS domain barrel. Pure TypeScript: no React, no I/O, time injected.
 *
 * Payments contract, for anything that touches money:
 * - Evidence travels with the movement. Only processor_confirmed live
 *   movements are net collected cash (NET_COLLECTED_CASH_POLICY in types.ts).
 *   Test a ledger entry with `countsAsNetCollectedCash`, never with
 *   `kind === "payment_collected"` on its own.
 * - Delivery identity and economic-movement identity are deduplicated
 *   separately: `buildIdempotencyKey` and `buildEconomicMovementKey`.
 * - Credit reads from an AttributionSnapshot, never from
 *   Opportunity.currentOwner.
 * - The owner policy defaults are proposed, not ratified. Each one is a single
 *   named constant in types.ts.
 */
export * from "./types";
export * from "./money";
export * from "./incidents";
export * from "./events";
export * from "./metrics";
export * from "./performance";
export * from "./routing";
export * from "./coaching";
export * from "./leaderboard";
export * from "./gamification";
export * from "./game";
export * from "./callIntelligence"; export * from "./dialer";
export * from "./intake";
export * from "./integrations";
export * from "./migration";
export * from "./crmSync";
export * from "./cashTiers";
export * from "./pairs";
export * from "./profile";
export * from "./onboarding";
export * from "./orders";
export * from "./attribution";
export * from "./connections";
