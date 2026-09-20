import { describe, expect, it } from "vitest";
import {
  ADAPTER_FUNCTION_NAMES,
  adapterFor,
  PAYMENT_ADAPTERS,
  stripeAdapter,
  toastAdapter,
  UNPINNED_API_VERSION,
  UNVERIFIED_PERMISSION,
  whopAdapter,
  type AdapterContext,
  type AdapterFunctionName,
  type AdapterResult,
  type CreatePaymentRequestInput,
  type PaymentProviderAdapter,
} from "@/server/providers";
import { emptyCapabilityContract, type ProviderAvailabilityRecord } from "@/domain/connections";
import { money } from "@/domain/money";
import type { CapabilityContract, ProviderConnectionRecord } from "@/domain/types";

const NOW = "2026-09-20T12:00:00.000Z";

function ctx(provider: string): AdapterContext {
  return {
    tenantId: "t_1",
    connectionId: "conn_1",
    provider,
    providerAccountId: "acct_synthetic_1",
    environment: "test",
    now: NOW,
  };
}

function capabilities(over: Partial<CapabilityContract["collection"]> = {}): CapabilityContract {
  const base = emptyCapabilityContract("oauth_authorization_code", "sandbox_only");
  return { ...base, collection: { ...base.collection, ...over } };
}

function connection(over: Partial<ProviderConnectionRecord> = {}): ProviderConnectionRecord {
  return {
    tenantId: "t_1",
    connectionId: "conn_1",
    provider: "stripe",
    authorizationMethod: "oauth_authorization_code",
    providerAccountId: "acct_synthetic_1",
    environment: "test",
    requestedScopes: [],
    grantedScopes: [],
    capabilities: capabilities(),
    authorizedByUserId: "u_owner",
    authorizationState: "granted",
    ...over,
  };
}

function paymentRequestInput(conn: ProviderConnectionRecord): CreatePaymentRequestInput {
  return {
    connection: conn,
    orderId: "ord_1",
    attributionSnapshotId: "snap_1",
    amount: money(300_000, "USD"),
    idempotencyKey: "idem_synthetic_1",
    orderReference: "obv_ord_1",
  };
}

/** Calls every one of the twelve functions with minimal, synthetic arguments. */
async function callAll(a: PaymentProviderAdapter): Promise<Record<AdapterFunctionName, AdapterResult<unknown>>> {
  const c = ctx(a.providerId);
  const page = { pageSize: 10 };
  return {
    beginConnection: await a.beginConnection(c, {
      returnTo: "https://example.invalid/return",
      requestedScopes: [],
      initiatedByUserId: "u_owner",
      state: "st_one_use",
    }),
    completeConnection: await a.completeConnection(c, { state: "st_one_use", code: "code_synthetic" }),
    verifyAccessibleAccounts: await a.verifyAccessibleAccounts(c),
    probeCapabilities: await a.probeCapabilities(c),
    refreshAuthorizationIfSupported: await a.refreshAuthorizationIfSupported(c),
    ensureOwnedEventSubscriptionIfSupported: await a.ensureOwnedEventSubscriptionIfSupported(c, {
      deliveryUrl: "https://example.invalid/hook",
    }),
    verifyAndParseEvent: await a.verifyAndParseEvent(c, {
      rawBody: "{}",
      signatureHeader: "none",
      secretRef: "vault://synthetic",
    }),
    listPaymentsPage: await a.listPaymentsPage(c, page),
    retrievePaymentEvidence: await a.retrievePaymentEvidence(c, { providerMovementId: "mv_synthetic" }),
    listAdjustmentsPage: await a.listAdjustmentsPage(c, page),
    createOrderLinkedPaymentRequestIfSupported: await a.createOrderLinkedPaymentRequestIfSupported(
      c,
      paymentRequestInput(connection({ provider: a.providerId })),
    ),
    revokeConnectionIfSupported: await a.revokeConnectionIfSupported(c),
  };
}

describe("the adapter boundary of specification 15.1", () => {
  it("registers exactly the three providers the specification names, in order", () => {
    expect(PAYMENT_ADAPTERS.map((a) => a.providerId)).toEqual(["stripe", "whop", "toast"]);
    expect(adapterFor("stripe")).toBe(stripeAdapter);
    expect(adapterFor("whop")).toBe(whopAdapter);
    expect(adapterFor("toast")).toBe(toastAdapter);
    expect(adapterFor("square")).toBeUndefined();
  });

  it("names all twelve functions from the specification and no others", () => {
    expect(ADAPTER_FUNCTION_NAMES).toHaveLength(12);
    expect([...ADAPTER_FUNCTION_NAMES].sort()).toEqual(
      [
        "beginConnection",
        "completeConnection",
        "createOrderLinkedPaymentRequestIfSupported",
        "ensureOwnedEventSubscriptionIfSupported",
        "listAdjustmentsPage",
        "listPaymentsPage",
        "probeCapabilities",
        "refreshAuthorizationIfSupported",
        "retrievePaymentEvidence",
        "revokeConnectionIfSupported",
        "verifyAccessibleAccounts",
        "verifyAndParseEvent",
      ].sort(),
    );
  });

  it("implements every named function on every adapter", () => {
    for (const a of PAYMENT_ADAPTERS) {
      for (const fn of ADAPTER_FUNCTION_NAMES) {
        expect(typeof (a as unknown as Record<string, unknown>)[fn]).toBe("function");
      }
    }
  });

  it("declares a credential, permission, account boundary, environment, and API version per function", () => {
    for (const a of PAYMENT_ADAPTERS) {
      for (const fn of ADAPTER_FUNCTION_NAMES) {
        const c = a.contracts[fn];
        expect(c, `${a.providerId}.${fn}`).toBeDefined();
        expect(c.fn).toBe(fn);
        expect(["observation", "collection", "lifecycle"]).toContain(c.level);
        expect(c.credential.length).toBeGreaterThan(0);
        expect(c.permission.length).toBeGreaterThan(0);
        expect(c.accountBoundary.length).toBeGreaterThan(0);
        expect(["live", "test", "either"]).toContain(c.environment);
        expect(c.apiVersion.length).toBeGreaterThan(0);
        expect(c.prerequisite.length).toBeGreaterThan(0);
      }
    }
  });

  it("invents no provider permission name and pins no unverified API version", () => {
    for (const a of PAYMENT_ADAPTERS) {
      for (const fn of ADAPTER_FUNCTION_NAMES) {
        expect(a.contracts[fn].permission).toBe(UNVERIFIED_PERMISSION);
        expect(a.contracts[fn].apiVersion).toBe(UNPINNED_API_VERSION);
      }
    }
  });

  it("states on every adapter that it makes no network request", () => {
    for (const a of PAYMENT_ADAPTERS) expect(a.makesNetworkRequests).toBe(false);
  });
});

describe("a missing capability returns unsupported or requires_setup, never a fake success", () => {
  it("returns no ok result from any function of any adapter", async () => {
    for (const a of PAYMENT_ADAPTERS) {
      const results = await callAll(a);
      for (const fn of ADAPTER_FUNCTION_NAMES) {
        const r = results[fn];
        expect(r.status, `${a.providerId}.${fn}`).not.toBe("ok");
        expect(["unsupported", "requires_setup", "refused", "failed"]).toContain(r.status);
        expect((r as { reason: string }).reason.length).toBeGreaterThan(0);
      }
    }
  });

  it("names what is blocking each Stripe function rather than failing blankly", async () => {
    const results = await callAll(stripeAdapter);
    expect(results.beginConnection).toMatchObject({ status: "requires_setup", blockedBy: "provider_review" });
    expect(results.listPaymentsPage).toMatchObject({ status: "requires_setup", blockedBy: "provider_access" });
    const probe = results.probeCapabilities as { status: string; reason: string };
    expect(probe.reason).toContain("verified against a real grant");
  });

  it("marks Whop as not built rather than as awaiting a provider", async () => {
    const results = await callAll(whopAdapter);
    expect(results.completeConnection).toMatchObject({ status: "requires_setup", blockedBy: "not_built" });
    const list = results.listPaymentsPage as { reason: string };
    expect(list.reason).toContain("identity sign-in is not merchant payment authorization");
  });

  it("reports Toast connection as unsupported, because there is no redirect grant to set up", async () => {
    const results = await callAll(toastAdapter);
    expect(results.beginConnection.status).toBe("unsupported");
    expect(results.completeConnection.status).toBe("unsupported");
    expect(results.verifyAndParseEvent.status).toBe("unsupported");
    // The reads are a different kind of blocked: partner approval, not a missing concept.
    expect(results.listPaymentsPage).toMatchObject({ status: "requires_setup", blockedBy: "provider_access" });
  });

  it("keeps Toast on Request connection and the other two off any Connect affordance", () => {
    const expected: Record<string, ProviderAvailabilityRecord["state"]> = {
      stripe: "unavailable",
      whop: "unavailable",
      toast: "request_connection",
    };
    for (const a of PAYMENT_ADAPTERS) {
      expect(a.availability.state).toBe(expected[a.providerId]);
      expect(a.availability.state).not.toBe("available");
    }
  });
});

describe("every collection operation is refused without an explicit grant", () => {
  it("refuses payment-request creation on every adapter when the capability is unproven", async () => {
    for (const a of PAYMENT_ADAPTERS) {
      const r = await a.createOrderLinkedPaymentRequestIfSupported(
        ctx(a.providerId),
        paymentRequestInput(connection({ provider: a.providerId })),
      );
      expect(r.status).toBe("refused");
      expect(r).toMatchObject({ code: "capability_not_verified" });
    }
  });

  it("refuses before the provider is consulted, so policy outranks the adapter's own state", async () => {
    const revoked = connection({ authorizationState: "revoked", capabilities: capabilities({ createPaymentRequest: "verified" }) });
    const r = await stripeAdapter.createOrderLinkedPaymentRequestIfSupported(
      ctx("stripe"),
      paymentRequestInput(revoked),
    );
    expect(r).toMatchObject({ status: "refused", code: "authorization_not_granted" });
  });

  it("falls through to the adapter's honest requires_setup once policy allows the call", async () => {
    const granted = connection({ capabilities: capabilities({ createPaymentRequest: "verified" }) });
    const r = await stripeAdapter.createOrderLinkedPaymentRequestIfSupported(
      ctx("stripe"),
      paymentRequestInput(granted),
    );
    // Policy said yes. The adapter still has nothing built, and says so instead of succeeding.
    expect(r.status).toBe("requires_setup");
    expect((r as { reason: string }).reason).toContain("not set up");
  });

  it("refuses Toast collection as unsupported once policy allows the call", async () => {
    const granted = connection({ provider: "toast", capabilities: capabilities({ createPaymentRequest: "verified" }) });
    const r = await toastAdapter.createOrderLinkedPaymentRequestIfSupported(
      ctx("toast"),
      paymentRequestInput(granted),
    );
    expect(r.status).toBe("unsupported");
  });
});
