/**
 * The domain barrel is a seam. Three payments modules (orders, attribution,
 * connections) were written in parallel and none of them was added to
 * `src/domain/index.ts`, so anything importing from `@/domain` could not reach
 * `commissionAccruals`, `creditForEntry` or `assertCollectionAllowed` at all.
 *
 * Adding them surfaced a real collision: `appendCorrection` existed in both
 * `callIntelligence.ts` (a transcript field correction) and `attribution.ts`
 * (an authorized correction appended to a sealed attribution snapshot). Two
 * different functions under one name in one barrel is a defect whichever one a
 * caller happened to get, so the attribution one is now
 * `appendAttributionCorrection`. This test keeps both facts true.
 */
import { describe, expect, it } from "vitest";
import * as domain from "@/domain";
import { appendCorrection as transcriptCorrection } from "@/domain/callIntelligence";
import { appendAttributionCorrection } from "@/domain/attribution";

describe("the domain barrel reaches the payments modules", () => {
  it("exports the money, attribution and connection primitives a caller needs", () => {
    const required = [
      // orders
      "createOrder",
      "issueOrderForPayment",
      "installmentCollections",
      "commissionAccruals",
      "companyCollected",
      // attribution
      "creditForEntry",
      "sealAttribution",
      "ledgerCreditedTo",
      "appendAttributionCorrection",
      "ordinaryEdit",
      // connections
      "deriveConnectionStatus",
      "assertCollectionAllowed",
      "checkCollectionAllowed",
      "readPaymentProbe",
      "isMerchantPaymentAuthorization",
      // the evidence rule everything above is measured against
      "countsAsNetCollectedCash",
    ];
    for (const name of required) {
      expect(typeof (domain as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("keeps the two corrections separate so neither shadows the other", () => {
    expect(appendAttributionCorrection).not.toBe(transcriptCorrection);
    expect(domain.appendCorrection).toBe(transcriptCorrection);
    expect(domain.appendAttributionCorrection).toBe(appendAttributionCorrection);
  });

  it("exports the owner policy constants as named values rather than scattered literals", () => {
    const constants = [
      "UNSEALED_CREDIT_FALLBACK",
      "ATTRIBUTION_EXCEPTION_RULES",
      "COLLECTION_SCOPE_POLICY",
      "DEFAULT_PROVIDER_AVAILABILITY",
    ];
    for (const name of constants) {
      expect((domain as Record<string, unknown>)[name]).toBeDefined();
    }
  });
});
