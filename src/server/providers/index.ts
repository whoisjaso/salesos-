/**
 * The payment adapter registry.
 *
 * OFFLINE AND SANDBOX ONLY. No adapter in this registry makes a network
 * request, imports a provider SDK, or names a provider endpoint. Every one of
 * them returns `requires_setup` or `unsupported`, which is the honest state of
 * this repository: there is no payment provider integration of any kind.
 *
 * Adding a provider here does not make it connectable. A Connect affordance is
 * gated on `canConnect()` in src/domain/integrations.ts, which reads the
 * registry row's availability, and every one of these three is currently
 * either unavailable or Request connection.
 */
import { stripeAdapter } from "./stripe";
import { toastAdapter } from "./toast";
import { whopAdapter } from "./whop";
import type { PaymentProviderAdapter } from "./types";

export const PAYMENT_ADAPTERS: readonly PaymentProviderAdapter[] = [stripeAdapter, whopAdapter, toastAdapter];

export function adapterFor(providerId: string): PaymentProviderAdapter | undefined {
  return PAYMENT_ADAPTERS.find((a) => a.providerId === providerId);
}

export { stripeAdapter, whopAdapter, toastAdapter };
export * from "./contract";
export type * from "./types";
export { declare, makeAdapter } from "./shell";
export type { AdapterSpec, FunctionDeclaration } from "./shell";
