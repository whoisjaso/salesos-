import { describe, expect, it } from "vitest";
import {
  applyPaymentReadProbe,
  assertCollectionAllowed,
  canOfferConnect,
  checkCollectionAllowed,
  collectionAxisOf,
  comparePermissions,
  connectionAxes,
  CollectionNotAllowedError,
  COLLECTION_ABSENT_DISCLOSURE,
  COLLECTION_OPERATIONS,
  COLLECTION_SCOPE_POLICY,
  CONNECTION_CONDITIONS,
  CONNECTION_CONDITION_ORDER,
  deriveConnectionStatus,
  emptyCapabilityContract,
  IDENTITY_ONLY_SCOPES,
  isCollectionAuthorized,
  isMerchantPaymentAuthorization,
  isObservationReady,
  ownerFacingText,
  readPaymentProbe,
  syncCoverageOf,
  type CollectionOperation,
  type ConnectionCondition,
  type PaymentReadProbeOutcome,
  type ProviderAvailabilityRecord,
} from "@/domain/connections";
import { MERCHANT_BINDING_CONFLICT_POLICY } from "@/domain/types";
import type {
  CapabilityContract,
  CapabilityState,
  ConnectionAuthorizationState,
  ProviderConnectionRecord,
  SyncCheckpoint,
} from "@/domain/types";

const NOW = "2026-09-20T12:00:00.000Z";

const AVAILABLE: ProviderAvailabilityRecord = {
  state: "available",
  implementationState: "live",
  reason: "A proven onboarding path exists (synthetic fixture for this test only).",
};
const REQUEST_ONLY: ProviderAvailabilityRecord = {
  state: "request_connection",
  implementationState: "blocked_by_provider_access",
  blockedBy: "provider_access",
  reason: "Partner approval is required before this can be enabled.",
};
const UNAVAILABLE: ProviderAvailabilityRecord = {
  state: "unavailable",
  implementationState: "absent",
  blockedBy: "not_built",
  reason: "No onboarding path for this provider is implemented in this environment.",
};

const CAPABILITY_STATES: CapabilityState[] = [
  "verified",
  "pending_verification",
  "not_requested",
  "not_authorized",
  "requires_setup",
  "unsupported",
];

function contract(over: Partial<CapabilityContract> = {}): CapabilityContract {
  const base = emptyCapabilityContract("oauth_authorization_code", "sandbox_only");
  return {
    ...base,
    ...over,
    observation: { ...base.observation, ...(over.observation ?? {}) },
    collection: { ...base.collection, ...(over.collection ?? {}) },
  };
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
    capabilities: contract(),
    authorizedByUserId: "u_owner",
    authorizationState: "none",
    ...over,
  };
}

function checkpoint(over: Partial<SyncCheckpoint> = {}): SyncCheckpoint {
  return {
    tenantId: "t_1",
    checkpointId: "ck_1",
    connectionId: "conn_1",
    provider: "stripe",
    providerAccountId: "acct_synthetic_1",
    environment: "test",
    resource: "payments",
    requestedWindowDays: 90,
    state: "current",
    ...over,
  };
}

/** Reads verified, events verified, one current payments checkpoint: the only ready shape. */
function readyConnection(over: Partial<ProviderConnectionRecord> = {}): ProviderConnectionRecord {
  return connection({
    authorizationState: "granted",
    capabilities: contract({
      observation: {
        paymentReads: "verified",
        historicalImport: "verified",
        signedEventDelivery: "verified",
        refundReads: "verified",
        disputeReads: "not_requested",
        payoutReads: "not_requested",
      },
    }),
    ...over,
  });
}

// ---------- The eight conditions of specification 14.3 ----------

describe("the eight conditions of specification 14.3", () => {
  it("registers exactly eight conditions and no more", () => {
    expect(CONNECTION_CONDITION_ORDER).toHaveLength(8);
    expect(Object.keys(CONNECTION_CONDITIONS).sort()).toEqual([...CONNECTION_CONDITION_ORDER].sort());
  });

  it("carries the specification's owner-facing text verbatim for each condition", () => {
    const expected: Record<ConnectionCondition, string> = {
      no_grant: "Not connected",
      probes_pending: "Checking connection",
      history_loading: "Connected. Syncing payment history",
      live_coverage_validated: "Payment tracking ready",
      no_event_coverage: "Updates may be delayed",
      collection_permission_absent: "Tracking enabled",
      grant_revoked_or_invalid: "Reconnect to resume updates",
      setup_required: "Connection requires setup",
    };
    for (const condition of CONNECTION_CONDITION_ORDER) {
      expect(CONNECTION_CONDITIONS[condition].ownerText).toBe(expected[condition]);
      expect(ownerFacingText(condition)).toBe(expected[condition]);
    }
  });

  it("carries the specification's internal condition and effect verbatim for each condition", () => {
    const expected: Record<ConnectionCondition, { internalCondition: string; effect: string }> = {
      no_grant: { internalCondition: "No grant", effect: "Existing sales workspace remains usable." },
      probes_pending: {
        internalCondition: "Consent granted; account/read probes pending",
        effect: "No promise of working tracking.",
      },
      history_loading: {
        internalCondition: "Read access verified; history loading",
        effect: "Show coverage of available data; do not call partial history complete.",
      },
      live_coverage_validated: {
        internalCondition: "Live coverage validated",
        effect: "Automatic updates for the verified scope.",
      },
      no_event_coverage: {
        internalCondition: "Read works; no event coverage",
        effect: "Poll only if supported; disclose timing and limitations.",
      },
      collection_permission_absent: {
        internalCondition: "Extra collection permission absent",
        effect: "Checkout creation unavailable without extra authorization.",
      },
      grant_revoked_or_invalid: {
        internalCondition: "Grant revoked/invalid",
        effect: "Stop unauthorized work; preserve historical records per policy.",
      },
      setup_required: { internalCondition: "Partner approval needed", effect: "No simulated authorization." },
    };
    for (const condition of CONNECTION_CONDITION_ORDER) {
      expect(CONNECTION_CONDITIONS[condition].internalCondition).toBe(expected[condition].internalCondition);
      expect(CONNECTION_CONDITIONS[condition].effect).toBe(expected[condition].effect);
    }
  });

  it("gives every condition a text label and an icon, so no state is carried by colour alone", () => {
    const labels = new Set<string>();
    const icons = new Set<string>();
    for (const condition of CONNECTION_CONDITION_ORDER) {
      const d = CONNECTION_CONDITIONS[condition];
      expect(d.label.trim().length).toBeGreaterThan(0);
      expect(d.icon.trim().length).toBeGreaterThan(0);
      labels.add(d.label);
      icons.add(d.icon);
    }
    // Two conditions that mean different things never share a label or an icon.
    expect(labels.size).toBe(8);
    expect(icons.size).toBe(8);
  });

  it("uses no em dash in any owner-facing string", () => {
    for (const condition of CONNECTION_CONDITION_ORDER) {
      const d = CONNECTION_CONDITIONS[condition];
      for (const s of [d.ownerText, d.effect, d.label, d.internalCondition]) {
        expect(s).not.toContain("—");
      }
    }
  });

  it("derives each of the eight conditions from a real connection shape", () => {
    const seen = new Map<ConnectionCondition, string>();

    // No grant, on a provider that is actually available.
    seen.set(
      deriveConnectionStatus({ connection: connection(), availability: AVAILABLE }).condition,
      "no grant",
    );
    // Consent granted, probes pending.
    seen.set(
      deriveConnectionStatus({
        connection: connection({ authorizationState: "pending" }),
        availability: AVAILABLE,
      }).condition,
      "probes pending",
    );
    // Reads verified, history still loading.
    seen.set(
      deriveConnectionStatus({
        connection: readyConnection(),
        availability: AVAILABLE,
        checkpoints: [checkpoint({ state: "importing" })],
      }).condition,
      "history loading",
    );
    // Live coverage validated.
    seen.set(
      deriveConnectionStatus({
        connection: readyConnection(),
        availability: AVAILABLE,
        checkpoints: [checkpoint({ state: "current" })],
      }).condition,
      "live",
    );
    // Reads work, no event coverage.
    seen.set(
      deriveConnectionStatus({
        connection: readyConnection({
          capabilities: contract({
            observation: {
              paymentReads: "verified",
              historicalImport: "verified",
              signedEventDelivery: "pending_verification",
              refundReads: "verified",
              disputeReads: "not_requested",
              payoutReads: "not_requested",
            },
          }),
        }),
        availability: AVAILABLE,
        checkpoints: [checkpoint({ state: "current" })],
      }).condition,
      "no event coverage",
    );
    // Grant revoked.
    seen.set(
      deriveConnectionStatus({
        connection: connection({ authorizationState: "revoked" }),
        availability: AVAILABLE,
      }).condition,
      "revoked",
    );
    // Partner approval needed.
    seen.set(
      deriveConnectionStatus({ connection: connection(), availability: REQUEST_ONLY }).condition,
      "partner gated",
    );
    // Extra collection permission absent, reported alongside a working observation state.
    const tracking = deriveConnectionStatus({
      connection: readyConnection(),
      availability: AVAILABLE,
      checkpoints: [checkpoint({ state: "current" })],
    });
    expect(tracking.conditions).toContain("collection_permission_absent");
    seen.set("collection_permission_absent", "collection absent");

    expect([...seen.keys()].sort()).toEqual([...CONNECTION_CONDITION_ORDER].sort());
  });
});

// ---------- Three orthogonal axes ----------

describe("three orthogonal axes, not one boolean", () => {
  it("reports authorization, sync coverage, and collection separately", () => {
    const axes = connectionAxes({
      connection: readyConnection(),
      availability: AVAILABLE,
      checkpoints: [checkpoint({ state: "current" })],
    });
    expect(axes).toEqual({ authorization: "granted", syncCoverage: "live", collection: "not_requested" });
  });

  it("gives a granted connection no coverage until its reads are verified", () => {
    for (const state of CAPABILITY_STATES) {
      const c = connection({
        authorizationState: "granted",
        capabilities: contract({ observation: { ...contract().observation, paymentReads: state } }),
      });
      const coverage = syncCoverageOf(c, [checkpoint({ state: "current" })]);
      if (state === "verified") expect(coverage).toBe("delayed");
      else expect(["probing", "failed"]).toContain(coverage);
    }
  });

  it("has no coverage at all without a grant, whatever the contract claims", () => {
    const authStates: ConnectionAuthorizationState[] = ["none", "pending", "revoked", "reconnect_required"];
    for (const authorizationState of authStates) {
      expect(syncCoverageOf(readyConnection({ authorizationState }), [checkpoint()])).toBe("none");
    }
  });

  it("maps every capability state onto the collection axis without inventing an authorization", () => {
    const expected: Record<CapabilityState, string> = {
      verified: "authorized",
      pending_verification: "not_authorized",
      not_requested: "not_requested",
      not_authorized: "not_authorized",
      requires_setup: "requires_setup",
      unsupported: "unsupported",
    };
    for (const state of CAPABILITY_STATES) {
      expect(collectionAxisOf(contract({ collection: { ...contract().collection, createPaymentRequest: state } }))).toBe(
        expected[state],
      );
    }
  });
});

// ---------- A failed probe never reaches a ready state ----------

describe("a failed payment-read probe never reaches a ready state (scenario 27)", () => {
  it("never produces Payment tracking ready for any non-verified read state", () => {
    const notVerified = CAPABILITY_STATES.filter((s) => s !== "verified");
    for (const paymentReads of notVerified) {
      const view = deriveConnectionStatus({
        connection: readyConnection({
          capabilities: contract({
            observation: {
              paymentReads,
              historicalImport: "verified",
              signedEventDelivery: "verified",
              refundReads: "verified",
              disputeReads: "verified",
              payoutReads: "verified",
            },
            collection: {
              createPaymentRequest: "verified",
              updateSubscription: "verified",
              issueRefund: "verified",
            },
          }),
        }),
        availability: AVAILABLE,
        checkpoints: [checkpoint({ state: "current" })],
      });
      expect(view.condition).not.toBe("live_coverage_validated");
      expect(view.ownerText).not.toBe("Payment tracking ready");
      expect(view.observationReady).toBe(false);
    }
  });

  it("says what is missing when the read was refused rather than merely pending", () => {
    const refusedRead = deriveConnectionStatus({
      connection: readyConnection({
        capabilities: contract({ observation: { ...contract().observation, paymentReads: "not_authorized" } }),
      }),
      availability: AVAILABLE,
    });
    expect(refusedRead.condition).toBe("setup_required");
    expect(refusedRead.disclosures.join(" ")).toContain("did not grant payment access");

    const pendingRead = deriveConnectionStatus({
      connection: readyConnection({
        capabilities: contract({ observation: { ...contract().observation, paymentReads: "pending_verification" } }),
      }),
      availability: AVAILABLE,
    });
    expect(pendingRead.condition).toBe("probes_pending");
    expect(pendingRead.ownerText).toBe("Checking connection");
  });

  it("keeps observationReady false for every state except live and delayed coverage", () => {
    expect(
      deriveConnectionStatus({
        connection: readyConnection(),
        availability: AVAILABLE,
        checkpoints: [checkpoint({ state: "importing" })],
      }).observationReady,
    ).toBe(false);
  });
});

// ---------- An authorized empty read is not a forbidden one (scenario 35) ----------

describe("an authorized empty read renders differently from a forbidden one", () => {
  const empty = readPaymentProbe({ kind: "authorized_empty" });
  const forbidden = readPaymentProbe({ kind: "forbidden", reason: "The grant does not include payment access." });

  it("gives them different capability states", () => {
    expect(empty.capability).toBe("verified");
    expect(forbidden.capability).toBe("not_authorized");
  });

  it("gives them different words and different icons", () => {
    expect(empty.label).not.toBe(forbidden.label);
    expect(empty.icon).not.toBe(forbidden.icon);
    expect(empty.ownerText).not.toBe(forbidden.ownerText);
  });

  it("counts the empty read as an answer and the forbidden read as an absence of permission", () => {
    expect(empty.isAnswer).toBe(true);
    expect(empty.readsVerified).toBe(true);
    expect(forbidden.isAnswer).toBe(false);
    expect(forbidden.readsVerified).toBe(false);
  });

  it("distinguishes a failed read from both of them", () => {
    const failed = readPaymentProbe({ kind: "failed", reason: "The request did not complete." });
    expect(failed.capability).toBe("pending_verification");
    expect(new Set([empty.label, forbidden.label, failed.label]).size).toBe(3);
  });

  it("promotes only a verified read onto the contract", () => {
    const outcomes: PaymentReadProbeOutcome[] = [
      { kind: "authorized_empty" },
      { kind: "authorized_records", recordCount: 4 },
      { kind: "forbidden", reason: "refused" },
      { kind: "failed", reason: "timeout" },
      { kind: "unsupported", reason: "not offered" },
      { kind: "requires_setup", reason: "not set up" },
    ];
    for (const outcome of outcomes) {
      const applied = applyPaymentReadProbe(contract(), outcome, NOW);
      const verified = outcome.kind === "authorized_empty" || outcome.kind === "authorized_records";
      expect(isObservationReady(applied)).toBe(verified);
      expect(applied.verifiedAt).toBe(verified ? NOW : undefined);
      // The probe never touches anything it did not measure.
      expect(applied.observation.signedEventDelivery).toBe("not_requested");
      expect(applied.collection.createPaymentRequest).toBe("not_requested");
    }
  });
});

// ---------- Availability gates the Connect affordance ----------

describe("availability gates the Connect affordance", () => {
  it("offers Connect only for an available provider", () => {
    expect(canOfferConnect(AVAILABLE)).toBe(true);
    expect(canOfferConnect(REQUEST_ONLY)).toBe(false);
    expect(canOfferConnect(UNAVAILABLE)).toBe(false);
  });

  it("downgrades a no-grant Connect to Request connection when the path does not exist", () => {
    expect(deriveConnectionStatus({ connection: connection(), availability: AVAILABLE }).affordance).toBe("connect");
    for (const availability of [REQUEST_ONLY, UNAVAILABLE]) {
      const view = deriveConnectionStatus({ connection: connection(), availability });
      expect(view.affordance).toBe("request_connection");
      expect(view.ownerText).toBe("Connection requires setup");
      expect(view.disclosures).toContain(availability.reason);
    }
  });

  it("offers reconnection, never a fresh connect, for a revoked grant", () => {
    const view = deriveConnectionStatus({
      connection: connection({ authorizationState: "reconnect_required" }),
      availability: AVAILABLE,
    });
    expect(view.condition).toBe("grant_revoked_or_invalid");
    expect(view.affordance).toBe("reconnect");
  });
});

// ---------- Merchant binding conflict (scenario 47) ----------

describe("a merchant already bound elsewhere is refused with a reason", () => {
  it("outranks every other condition and never merges", () => {
    const view = deriveConnectionStatus({
      connection: readyConnection({
        bindingConflict: { reason: MERCHANT_BINDING_CONFLICT_POLICY.reason, boundTenantId: "t_other" },
      }),
      availability: AVAILABLE,
      checkpoints: [checkpoint({ state: "current" })],
    });
    expect(view.condition).toBe("setup_required");
    expect(view.disclosures).toContain(MERCHANT_BINDING_CONFLICT_POLICY.reason);
    expect(MERCHANT_BINDING_CONFLICT_POLICY.resolveByEmailMatch).toBe(false);
  });
});

// ---------- Coverage disclosure ----------

describe("partial coverage is disclosed, never called complete", () => {
  it("reports a limited checkpoint as syncing history and carries its limitation", () => {
    const view = deriveConnectionStatus({
      connection: readyConnection(),
      availability: AVAILABLE,
      checkpoints: [
        checkpoint({ state: "limited", limitation: "History covers 31 of the 90 days requested." }),
      ],
    });
    expect(view.condition).toBe("history_loading");
    expect(view.ownerText).toBe("Connected. Syncing payment history");
    expect(view.disclosures).toContain("History covers 31 of the 90 days requested.");
  });
});

// ---------- Requested permissions versus granted permissions ----------

describe("requested permissions are stored separately from granted permissions", () => {
  it("names what is missing and what came back broader than the request", () => {
    const c = comparePermissions(["payments:read", "refunds:read"], ["payments:read", "customers:write"]);
    expect(c.missing).toEqual(["refunds:read"]);
    expect(c.extra).toEqual(["customers:write"]);
    expect(c.identityOnly).toBe(false);
  });

  it("refuses an identity-only grant as merchant payment authorization (scenario 28)", () => {
    expect(comparePermissions(["payments:read"], ["openid", "profile", "email"]).identityOnly).toBe(true);
    expect(isMerchantPaymentAuthorization(["openid", "profile", "email"])).toBe(false);
    expect(isMerchantPaymentAuthorization([])).toBe(false);
    expect(isMerchantPaymentAuthorization(["openid", "payments:read"])).toBe(true);
    for (const scope of IDENTITY_ONLY_SCOPES) {
      expect(isMerchantPaymentAuthorization([scope])).toBe(false);
    }
  });

  it("compares scopes without being fooled by case or padding", () => {
    expect(comparePermissions(["Payments:Read"], [" payments:read "]).missing).toEqual([]);
  });
});

// ---------- The collection refusal table ----------

describe("assertCollectionAllowed refuses every collection operation without an explicit grant", () => {
  const fullyGranted = contract({
    collection: { createPaymentRequest: "verified", updateSubscription: "verified", issueRefund: "verified" },
  });

  it("allows exactly one operation, and only on a granted connection with a proven capability", () => {
    const allowed = COLLECTION_OPERATIONS.filter(
      (op) =>
        checkCollectionAllowed(
          connection({ authorizationState: "granted", capabilities: fullyGranted }),
          op,
        ).allowed,
    );
    expect(allowed).toEqual(["create_payment_request"]);
    expect(COLLECTION_SCOPE_POLICY.enabledOperations).toEqual(["create_payment_request"]);
    expect(COLLECTION_SCOPE_POLICY.ratified).toBe(false);
  });

  it("refuses the never-in-scope operations even when the provider granted them", () => {
    for (const op of COLLECTION_SCOPE_POLICY.neverInScope) {
      const d = checkCollectionAllowed(
        connection({ authorizationState: "granted", capabilities: fullyGranted }),
        op,
      );
      expect(d.allowed).toBe(false);
      expect(d.code).toBe("operation_never_in_scope");
    }
  });

  it("refuses refunds and subscription changes as out of scope for this revision", () => {
    for (const op of ["issue_refund", "update_subscription", "capture_payment"] as CollectionOperation[]) {
      const d = checkCollectionAllowed(
        connection({ authorizationState: "granted", capabilities: fullyGranted }),
        op,
      );
      expect(d.allowed).toBe(false);
      expect(d.code).toBe("operation_out_of_scope_this_revision");
    }
  });

  it("covers the whole refusal table: every operation against every capability state and authorization state", () => {
    const authStates: ConnectionAuthorizationState[] = [
      "none",
      "pending",
      "granted",
      "revoked",
      "reconnect_required",
    ];
    let allowedCount = 0;
    let checked = 0;
    for (const op of COLLECTION_OPERATIONS) {
      for (const state of CAPABILITY_STATES) {
        for (const authorizationState of authStates) {
          checked += 1;
          const conn = connection({
            authorizationState,
            capabilities: contract({
              collection: { createPaymentRequest: state, updateSubscription: state, issueRefund: state },
            }),
          });
          const d = checkCollectionAllowed(conn, op);
          const shouldAllow =
            op === "create_payment_request" && state === "verified" && authorizationState === "granted";
          expect(d.allowed).toBe(shouldAllow);
          if (d.allowed) allowedCount += 1;
          else expect(d.reason.length).toBeGreaterThan(0);
        }
      }
    }
    expect(checked).toBe(COLLECTION_OPERATIONS.length * CAPABILITY_STATES.length * authStates.length);
    expect(allowedCount).toBe(1);
  });

  it("refuses an unbound account and a conflicted binding before any capability is consulted", () => {
    const unbound = checkCollectionAllowed(
      connection({ authorizationState: "granted", providerAccountId: "", capabilities: fullyGranted }),
      "create_payment_request",
    );
    expect(unbound.code).toBe("account_not_bound");

    const conflicted = checkCollectionAllowed(
      connection({
        authorizationState: "granted",
        capabilities: fullyGranted,
        bindingConflict: { reason: MERCHANT_BINDING_CONFLICT_POLICY.reason },
      }),
      "create_payment_request",
    );
    expect(conflicted.code).toBe("merchant_binding_conflict");
  });

  it("throws a typed error that carries the refusal code and operation", () => {
    expect(() => assertCollectionAllowed(connection(), "create_payment_request")).toThrow(CollectionNotAllowedError);
    try {
      assertCollectionAllowed(connection({ authorizationState: "granted" }), "create_payment_request");
      throw new Error("expected a refusal");
    } catch (e) {
      expect(e).toBeInstanceOf(CollectionNotAllowedError);
      const err = e as CollectionNotAllowedError;
      expect(err.code).toBe("capability_not_verified");
      expect(err.operation).toBe("create_payment_request");
    }
    expect(() =>
      assertCollectionAllowed(
        connection({ authorizationState: "granted", capabilities: fullyGranted }),
        "create_payment_request",
      ),
    ).not.toThrow();
  });
});

describe("Level A never implies Level B", () => {
  const trackingOnly = readyConnection({
    capabilities: contract({
      observation: {
        paymentReads: "verified",
        historicalImport: "verified",
        signedEventDelivery: "verified",
        refundReads: "verified",
        disputeReads: "verified",
        payoutReads: "verified",
      },
      // Every observation capability proven. No collection capability requested.
    }),
  });

  it("refuses payment-request creation on a fully verified observation connection", () => {
    expect(isObservationReady(trackingOnly.capabilities)).toBe(true);
    expect(isCollectionAuthorized(trackingOnly.capabilities, "create_payment_request")).toBe(false);
    const d = checkCollectionAllowed(trackingOnly, "create_payment_request");
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("capability_not_verified");
    expect(d.reason).toContain("Tracking payments does not grant it");
  });

  it("says Tracking enabled and discloses that checkout creation is unavailable", () => {
    const view = deriveConnectionStatus({
      connection: trackingOnly,
      availability: AVAILABLE,
      checkpoints: [checkpoint({ state: "current" })],
    });
    expect(view.condition).toBe("live_coverage_validated");
    expect(view.conditions).toContain("collection_permission_absent");
    expect(CONNECTION_CONDITIONS.collection_permission_absent.ownerText).toBe("Tracking enabled");
    expect(view.disclosures).toContain(COLLECTION_ABSENT_DISCLOSURE);
  });

  it("drops the collection disclosure once the capability is actually proven", () => {
    const withCollection = readyConnection({
      capabilities: contract({
        observation: { ...trackingOnly.capabilities.observation },
        collection: { createPaymentRequest: "verified", updateSubscription: "not_requested", issueRefund: "not_requested" },
      }),
    });
    const view = deriveConnectionStatus({
      connection: withCollection,
      availability: AVAILABLE,
      checkpoints: [checkpoint({ state: "current" })],
    });
    expect(view.conditions).not.toContain("collection_permission_absent");
  });
});

describe("an empty capability contract claims nothing", () => {
  it("starts every capability un-requested and the implementation absent", () => {
    const c = emptyCapabilityContract("none");
    expect(Object.values(c.observation).every((v) => v === "not_requested")).toBe(true);
    expect(Object.values(c.collection).every((v) => v === "not_requested")).toBe(true);
    expect(c.implementationState).toBe("absent");
    expect(c.verifiedAt).toBeUndefined();
    expect(c.apiVersion).toBeUndefined();
    expect(isObservationReady(c)).toBe(false);
  });
});
