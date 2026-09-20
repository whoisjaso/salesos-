/**
 * H1: a simulated authorization must never render as a completed one.
 *
 * These pin the rule, not another module's wording: whether a provider may be
 * connected is decided in src/domain/integrations.ts, and this screen may only
 * agree with it. Nothing a person reads on the way there may describe a
 * permission as granted (specification 12.1 and 14.3, docs/PAYMENTS_AUDIT.md H1
 * and H8).
 */
import { describe, expect, it } from "vitest";
import { PROVIDERS, availabilityOf, canConnect, isPaymentsProvider, providerById } from "@/domain/integrations";
import { canOfferConnect } from "@/domain/connections";
import {
  CONNECT_ENVIRONMENT,
  FILE_IMPORT_PROVIDER_ID,
  SANDBOX_NOTE,
  anyPaymentsProviderAvailable,
  connectViewFor,
} from "../availability";

describe("the screen agrees with the domain and never overrules it", () => {
  it("claims a connectable provider only where the domain says there is a path", () => {
    for (const p of PROVIDERS) {
      expect(connectViewFor(p).canConnect).toBe(canConnect(p));
      expect(canConnect(p)).toBe(canOfferConnect(availabilityOf(p)));
    }
  });

  it("offers no Connect affordance at all in this build", () => {
    expect(PROVIDERS.filter((p) => connectViewFor(p).action === "connect")).toEqual([]);
  });

  it("gives every provider without a path Request connection and the 14.3 setup wording", () => {
    const requesting = PROVIDERS.filter((p) => p.providerId !== FILE_IMPORT_PROVIDER_ID);
    expect(requesting.length).toBeGreaterThan(20);
    for (const p of requesting) {
      const view = connectViewFor(p);
      expect(view.action).toBe("request_connection");
      expect(view.actionLabel).toBe("Request connection");
      expect(view.statusLabel).toBe("Connection requires setup");
      // A text label and an icon, so no state is carried by colour alone.
      expect(view.statusIcon.length).toBeGreaterThan(0);
    }
  });
});

describe("nothing reads as a grant", () => {
  it("never heads a permission list as granted", () => {
    for (const p of PROVIDERS) {
      expect(connectViewFor(p).permissionsHeading.toLowerCase()).not.toContain("granted");
    }
  });

  it("says in a sentence that nothing was requested and nothing was granted", () => {
    for (const p of PROVIDERS) {
      const view = connectViewFor(p);
      if (view.action !== "request_connection") continue;
      expect(view.permissionsNote).toContain(p.name);
      expect(view.permissionsNote).toContain("nothing has been granted");
    }
  });

  it("says what pressing the action does before it is pressed, and names the provider it will not contact", () => {
    for (const p of PROVIDERS) {
      const view = connectViewFor(p);
      if (view.action !== "request_connection") continue;
      expect(view.actionEffect).toContain(`Nothing is sent to ${p.name}`);
    }
    expect(SANDBOX_NOTE).toContain("No provider has been contacted");
    expect(CONNECT_ENVIRONMENT).toBe("sandbox");
  });
});

describe("a capability promise is never shown for something that does not exist (H8)", () => {
  it("shows the availability reason instead of the catalog one-liner", () => {
    for (const p of PROVIDERS) {
      const view = connectViewFor(p);
      if (view.action !== "request_connection") continue;
      expect(view.subtitle).toBe(availabilityOf(p).reason);
      expect(view.subtitle).not.toBe(p.oneLiner);
      expect(view.subtitle.length).toBeGreaterThan(20);
    }
  });

  it("never lets a present-tense reconciliation promise reach the Stripe sheet", () => {
    const shown = connectViewFor(providerById.stripe).subtitle;
    expect(shown).not.toContain("reconciled");
    expect(shown).toContain("not proven here");
  });
});

describe("payments carry the strictest rule", () => {
  it("has payments providers, and not one of them has a proven path", () => {
    expect(PROVIDERS.filter(isPaymentsProvider).length).toBeGreaterThan(0);
    expect(anyPaymentsProviderAvailable(PROVIDERS)).toBe(false);
    for (const p of PROVIDERS.filter(isPaymentsProvider)) {
      expect(connectViewFor(p).canConnect).toBe(false);
      expect(connectViewFor(p).action).toBe("request_connection");
    }
  });
});

describe("the file import is the one path that completes", () => {
  it("is a local file, not a provider connection, and writes nothing before the dry run", () => {
    const view = connectViewFor(providerById[FILE_IMPORT_PROVIDER_ID]);
    expect(view.action).toBe("upload_file");
    // It is not a provider grant either, so it never claims one.
    expect(view.canConnect).toBe(false);
    expect(view.subtitle).toContain("contacts no provider");
    expect(view.actionEffect).toContain("dry run");
  });
});

describe("webhook and link previews", () => {
  it("caveat the snippet rather than implying a feed starts", () => {
    for (const id of ["zapier", "make", "clickfunnels", "landing_page", "share_link"]) {
      const view = connectViewFor(providerById[id]);
      expect(view.action).toBe("request_connection");
      expect(view.snippetCaveat).toContain("not built");
    }
  });

  it("gives an oauth provider no snippet caveat, because it has no snippet", () => {
    expect(connectViewFor(providerById.stripe).snippetCaveat).toBeUndefined();
  });
});
