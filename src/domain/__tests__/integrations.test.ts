import { describe, expect, it } from "vitest";
import {
  availabilityOf,
  canConnect,
  connect,
  DEFAULT_PROVIDER_AVAILABILITY,
  disconnect,
  isPaymentsProvider,
  logoMode,
  logoUrl,
  PROVIDERS,
  providerById,
  SIMULATED_AUTHORIZER_PAYMENTS_REFUSAL,
  SimulatedAuthorizer,
  type AuthorizeRequest,
  type ProviderConnection,
} from "@/domain/integrations";

const NOW = "2026-09-20T12:00:00.000Z";

function request(providerId: string): AuthorizeRequest {
  return { tenantId: "t_1", providerId, redirectUri: "sos://connect", state: "st_one_use_unpredictable" };
}

describe("provider availability", () => {
  it("defaults every provider to unavailable, because nothing here has a proven onboarding path", () => {
    expect(DEFAULT_PROVIDER_AVAILABILITY.state).toBe("unavailable");
    expect(DEFAULT_PROVIDER_AVAILABILITY.implementationState).toBe("absent");
  });

  it("gives every registry row an availability record with a stated reason", () => {
    for (const p of PROVIDERS) {
      const a = availabilityOf(p);
      expect(["available", "request_connection", "unavailable"]).toContain(a.state);
      expect(a.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("offers a Connect affordance for no provider in this environment", () => {
    const connectable = PROVIDERS.filter(canConnect).map((p) => p.providerId);
    expect(connectable).toEqual([]);
  });

  it("registers Stripe as the first payment candidate and unproven", () => {
    const stripe = providerById.stripe;
    expect(stripe.category).toBe("payments");
    const a = availabilityOf(stripe);
    expect(a.state).toBe("unavailable");
    expect(a.implementationState).toBe("blocked_by_provider_access");
    expect(a.blockedBy).toBe("provider_access");
    expect(a.reason).toContain("no verified permissions");
    expect(canConnect(stripe)).toBe(false);
  });

  it("registers Whop honestly as absent rather than leaving it out", () => {
    const whop = providerById.whop;
    expect(whop).toBeDefined();
    expect(whop.category).toBe("payments");
    const a = availabilityOf(whop);
    expect(a.state).toBe("unavailable");
    expect(a.implementationState).toBe("absent");
    expect(a.blockedBy).toBe("not_built");
    expect(canConnect(whop)).toBe(false);
  });

  it("registers Toast as Request connection, partner gated, never a redirect grant", () => {
    const toast = providerById.toast;
    expect(toast).toBeDefined();
    const a = availabilityOf(toast);
    expect(a.state).toBe("request_connection");
    expect(a.blockedBy).toBe("provider_access");
    expect(a.reason).toContain("partner");
    expect(canConnect(toast)).toBe(false);
    // Partner enablement, deliberately not "oauth": there is no owner-facing
    // authorization redirect for Toast, so it must never be rendered as one.
    expect(toast.auth).toBe("partner");
  });

  it("keeps every provider's real logo even when it cannot be connected", () => {
    for (const id of ["stripe", "whop", "toast"]) {
      const p = providerById[id];
      expect(logoUrl(p).length).toBeGreaterThan(0);
      expect(["mask", "image", "icon"]).toContain(logoMode(p));
    }
  });
});

describe("a payments provider may not use the simulated authorizer", () => {
  it("identifies every payments provider by category or feed", () => {
    const payments = PROVIDERS.filter(isPaymentsProvider).map((p) => p.providerId).sort();
    expect(payments).toEqual(["stripe", "toast", "whop"]);
  });

  it("refuses to begin a simulated authorization for any payments provider", () => {
    for (const p of PROVIDERS.filter(isPaymentsProvider)) {
      const begun = SimulatedAuthorizer.begin(request(p.providerId));
      expect(begun.url).toBe("");
      expect(begun.refusedReason).toBe(SIMULATED_AUTHORIZER_PAYMENTS_REFUSAL);
    }
  });

  it("refuses to complete a simulated authorization for any payments provider", async () => {
    for (const p of PROVIDERS.filter(isPaymentsProvider)) {
      const result = await SimulatedAuthorizer.complete(request(p.providerId), `simulated_${p.providerId}`);
      expect(result.ok).toBe(false);
      expect(result.refusalCode).toBe("payments_simulation_refused");
      expect(result.grantedPermissions).toBeUndefined();
      expect(result.accountLabel).toBeUndefined();
    }
  });

  it("still serves a non-payments source, so lead and booking connections are unaffected", async () => {
    const begun = SimulatedAuthorizer.begin(request("hubspot"));
    expect(begun.refusedReason).toBeUndefined();
    expect(begun.url).toContain("code=simulated_hubspot");
    const result = await SimulatedAuthorizer.complete(request("hubspot"), "simulated_hubspot");
    expect(result.ok).toBe(true);
    expect(result.grantedPermissions).toEqual(providerById.hubspot.permissions);
  });

  it("leaves the two pre-existing refusal shapes exactly as they were", async () => {
    // crmSync.test.ts asserts these byte for byte. The payments refusal is the
    // only branch that gained a machine-readable code.
    expect(await SimulatedAuthorizer.complete(request("no_such_provider"), "simulated_x")).toEqual({
      ok: false,
      error: "Unknown provider",
    });
    expect(await SimulatedAuthorizer.complete(request("hubspot"), "real_looking_code")).toEqual({
      ok: false,
      error: "Invalid code",
    });
  });
});

describe("requested permissions are recorded separately from granted permissions", () => {
  it("keeps both on the connection after a successful authorization", async () => {
    const result = await SimulatedAuthorizer.complete(request("hubspot"), "simulated_hubspot");
    const conn = connect(undefined, { tenantId: "t_1", providerId: "hubspot", result, now: NOW });
    expect(conn.status).toBe("connected");
    expect(conn.requestedPermissions).toEqual(providerById.hubspot.permissions);
    expect(conn.grantedPermissions).toEqual(providerById.hubspot.permissions);
  });

  it("records no grant at all when authorization failed", async () => {
    const result = await SimulatedAuthorizer.complete(request("stripe"), "simulated_stripe");
    const conn = connect(undefined, { tenantId: "t_1", providerId: "stripe", result, now: NOW });
    expect(conn.status).toBe("error");
    expect(conn.grantedPermissions).toEqual([]);
    expect(conn.connectedAt).toBeUndefined();
    expect(conn.error).toBe(SIMULATED_AUTHORIZER_PAYMENTS_REFUSAL);
  });

  it("reuses an existing connection rather than starting a second one", async () => {
    const existing: ProviderConnection = {
      tenantId: "t_1",
      connectionId: "conn_t_1_hubspot",
      providerId: "hubspot",
      status: "paused",
      requestedPermissions: ["Read contacts and forms"],
      grantedPermissions: [],
      eventCount: 41,
      lastEventAt: "2026-09-01T00:00:00.000Z",
    };
    const result = await SimulatedAuthorizer.complete(request("hubspot"), "simulated_hubspot");
    const conn = connect(existing, { tenantId: "t_1", providerId: "hubspot", result, now: NOW });
    expect(conn.connectionId).toBe("conn_t_1_hubspot");
    expect(conn.eventCount).toBe(41);
    expect(conn.lastEventAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("clears both permission lists on disconnect", () => {
    const conn: ProviderConnection = {
      tenantId: "t_1",
      connectionId: "conn_t_1_hubspot",
      providerId: "hubspot",
      status: "connected",
      accountLabel: "HubSpot account",
      requestedPermissions: ["Read contacts and forms"],
      grantedPermissions: ["Read contacts and forms"],
      connectedAt: NOW,
      eventCount: 3,
    };
    const off = disconnect(conn);
    expect(off.status).toBe("not_connected");
    expect(off.requestedPermissions).toEqual([]);
    expect(off.grantedPermissions).toEqual([]);
    expect(off.accountLabel).toBeUndefined();
    // History is preserved; only the grant is dropped.
    expect(off.eventCount).toBe(3);
  });
});

describe("registry copy stays honest", () => {
  it("uses no em dash anywhere in owner-facing copy", () => {
    for (const p of PROVIDERS) {
      for (const s of [p.name, p.oneLiner, ...p.permissions, ...p.setup, availabilityOf(p).reason]) {
        expect(s).not.toContain("—");
      }
    }
  });

  it("does not describe an unbuilt payments integration in the present tense", () => {
    for (const p of PROVIDERS.filter(isPaymentsProvider)) {
      expect(availabilityOf(p).state).not.toBe("available");
      // The old copy said "Cash in, refunds out, reconciled" for a capability with no code behind it.
      expect(p.oneLiner).not.toMatch(/reconciled/i);
      expect(p.setup[0]).toBe("Request connection");
    }
  });

  it("keeps provider ids unique", () => {
    const ids = PROVIDERS.map((p) => p.providerId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
