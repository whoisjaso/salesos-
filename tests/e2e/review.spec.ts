import { test, expect, PEOPLE, sheet, closeSheet } from "./fixtures";

/**
 * Native call review (D: "Call intelligence, not a third-party notetaker"; D: "The transcript
 * decides. No rep approval."). Transcripts come from src/fixtures/calls.ts: call_005 (books, Tomasz),
 * call_008 (voicemail, Tomasz), call_016 (partner decides, Tomasz), call_010 (price objection, Marcus).
 * Rules score them: call_005 Buying 65% Likely, call_008 No contact, call_016 Contacted, call_010 Qualified 75%.
 */

test.describe("Review: setter", () => {
  test.use({ person: PEOPLE.setter });

  test("lists own calls and opens the meaningful one", async ({ page }) => {
    await page.goto("/review");
    const rows = page.getByTestId("review-row");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
    // Only Tomasz's calls: Marcus's price call is not listed.
    await expect(rows.filter({ hasText: "Bartholomew Haddad" })).toHaveCount(0);

    // Each row carries the stage the transcript cleared, never a confirm prompt.
    await expect(rows.filter({ hasText: "Thaddeus Kowalczyk" }).getByTestId("stage-chip")).toHaveText(/Buying/);
    await expect(page.getByText("Needs confirm")).toHaveCount(0);

    await rows.filter({ hasText: "Thaddeus Kowalczyk" }).getByRole("link").click();
    await expect(page).toHaveURL(/\/review\?call=call_005/);
    await expect(page.getByTestId("hero-outcome")).toHaveText("Buying");
    await expect(page.getByTestId("hero-band")).toHaveText("Likely");
    await expect(page.getByTestId("probability-ring")).toContainText("65%");
    await expect(page.getByTestId("outcome-status")).toHaveText(/Transcript decided/);
    // No Confirm anywhere: the transcript decided.
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("moment").first()).toBeVisible();
  });

  test("the stage strip shows four banded stages and a tap goes to the cited span", async ({ page }) => {
    await page.goto("/review?call=call_005");
    const strip = page.getByTestId("stage-strip");
    await expect(strip).toBeVisible();
    const segments = strip.getByTestId("stage-segment");
    await expect(segments).toHaveCount(4);
    await expect(segments.nth(0)).toContainText("Contacted");
    await expect(segments.nth(1)).toContainText("Qualified");
    await expect(segments.nth(2)).toContainText("Buying");
    await expect(segments.nth(3)).toContainText("Bought");
    // Every segment carries a percent and a band word, never color alone.
    for (const s of await segments.all()) {
      await expect(s).toContainText(/\d+%/);
      await expect(s).toContainText(/Yes|Likely|Unlikely|No/);
    }
    await expect(segments.nth(2)).toHaveAttribute("data-band", "likely");
    await expect(segments.nth(3)).toHaveAttribute("data-band", "no");
    await expect(segments.nth(3)).toBeDisabled();

    await segments.nth(2).click();
    await expect(segments.nth(2)).toHaveAttribute("aria-pressed", "true");
    const highlighted = page.locator('[data-testid="transcript-span"][data-highlighted="true"]');
    await expect(highlighted).toHaveCount(1);
    await expect(highlighted).toHaveAttribute("data-cited", "true");
  });

  test("a moment highlights its cited span, a span shows its citations", async ({ page }) => {
    await page.goto("/review?call=call_005");
    const moment = page.getByTestId("moment").filter({ hasText: "Next step, book" });
    await expect(moment).toBeVisible();
    await moment.click();
    const highlighted = page.locator('[data-testid="transcript-span"][data-highlighted="true"]');
    await expect(highlighted).toHaveCount(1);
    await expect(highlighted).toHaveAttribute("data-cited", "true");
    await expect(highlighted).toContainText(/Thursday/);
    await expect(moment).toHaveAttribute("aria-pressed", "true");

    // Tap the span: the fields that cite it appear.
    await highlighted.getByRole("button").first().click();
    await expect(page.getByTestId("span-citations")).toContainText("Next step");
  });

  test("disputing a field marks the applied changes Disputed", async ({ page }) => {
    await page.goto("/review?call=call_005");
    await expect(page.getByTestId("policy-tag")).toHaveText("Applied");
    await expect(page.getByText("Creates a booking task")).toBeVisible();
    await expect(page.getByText("Confirms the fit assessment")).toBeVisible();
    await expect(page.getByText("Never writes money, consent, or attendance")).toBeVisible();

    await page.getByTestId("extracted-open").click();
    const extracted = sheet(page, "Extracted");
    await expect(extracted).toBeVisible();
    await expect(extracted.getByTestId("extracted-field").first()).toBeVisible();
    await extracted.getByRole("button", { name: "Dispute", exact: true }).first().click();
    await expect(extracted.getByText("Disputed", { exact: true }).first()).toBeVisible();
    await closeSheet(page);

    await expect(page.getByTestId("policy-tag")).toHaveText("Disputed");
    await expect(page.getByTestId("outcome-status")).toHaveText(/Disputed/);
  });

  test("Wrong? on the hero opens the dispute sheet; there is no Confirm", async ({ page }) => {
    await page.goto("/review?call=call_008");
    await expect(page.getByTestId("hero-outcome")).toHaveText("No contact");
    await expect(page.getByTestId("hero-band")).toHaveText("No");
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("outcome-status")).toHaveText(/Transcript decided/);

    await page.getByTestId("wrong").click();
    const extracted = sheet(page, "Extracted");
    await expect(extracted).toBeVisible();
    await expect(extracted.getByTestId("extracted-field").filter({ hasText: "Stage, contacted" })).toBeVisible();
    await extracted.getByRole("button", { name: "Dispute", exact: true }).first().click();
    await closeSheet(page);
    await expect(page.getByTestId("outcome-status")).toHaveText(/Disputed/);
    await expect(page.getByTestId("policy-tag")).toHaveText("Disputed");
  });

  test("feedback gives angles that point at moments", async ({ page }) => {
    await page.goto("/review?call=call_016");
    await expect(page.getByTestId("hero-outcome")).toHaveText("Contacted");
    const cards = page.getByTestId("feedback-card");
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText("An objection was left open");
    await cards.first().getByRole("button", { name: /See moment/ }).click();
    const highlighted = page.locator('[data-testid="transcript-span"][data-highlighted="true"]');
    await expect(highlighted).toHaveCount(1);
    await expect(highlighted).toContainText(/worried/);
    // Below the band reads as leaning, not applied.
    await expect(page.getByText("Records a leaning fit assessment")).toBeVisible();
    await expect(page.getByText("Leaning, not applied").first()).toBeVisible();
  });

  test("a call that is not theirs shows Not yours", async ({ page }) => {
    await page.goto("/review?call=call_010");
    await expect(page.getByRole("heading", { name: "Not yours" })).toBeVisible();
    await expect(page.getByTestId("hero-outcome")).toHaveCount(0);
  });
});

test.describe("Review: owner", () => {
  test.use({ person: PEOPLE.owner });

  test("sees every call and can share a good example", async ({ page }) => {
    await page.goto("/review");
    const rows = page.getByTestId("review-row");
    await expect(rows).toHaveCount(4);
    await expect(rows.filter({ hasText: "Bartholomew Haddad" })).toHaveCount(1);
    await expect(rows.getByTestId("stage-chip")).toHaveCount(4);
    await expect(page.getByText("Needs confirm")).toHaveCount(0);

    // The owner sees the same hero, strip, and feedback as the rep.
    await page.goto("/review?call=call_005");
    await expect(page.getByTestId("hero-outcome")).toHaveText("Buying");
    await expect(page.getByTestId("stage-strip").getByTestId("stage-segment")).toHaveCount(4);
    await expect(page.getByTestId("feedback-card").first()).toBeVisible();
    await page.getByRole("button", { name: "Share to playbook" }).click();
    await expect(page.getByText("Marked for review")).toBeVisible();
  });

  test("the price objection call never proposes a discount", async ({ page }) => {
    await page.goto("/review?call=call_010");
    await expect(page.getByTestId("hero-outcome")).toHaveText("Qualified");
    await expect(page.getByTestId("moment").filter({ hasText: "Objection, price" })).toBeVisible();
    // Buying 60% sits under the band: the proposal task is a lean, not created.
    const proposal = page.getByTestId("change").filter({ hasText: "Creates a proposal task" });
    await expect(proposal).toBeVisible();
    await expect(proposal).toHaveAttribute("data-applied", "false");
    await expect(proposal).toContainText("Leaning, not applied");
    await expect(page.getByTestId("policy-tag")).toHaveText("Applied");
    await page.getByTestId("extracted-open").click();
    await expect(sheet(page, "Extracted").getByText(/discount/i)).toHaveCount(0);
  });
});

test.describe("Review: closer", () => {
  test.use({ person: PEOPLE.closerMarcus });

  test("lists only own calls", async ({ page }) => {
    await page.goto("/review");
    const rows = page.getByTestId("review-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Bartholomew Haddad");
  });
});

test.describe("Review: signed out", () => {
  test.use({ person: null });

  test("/review goes to sign-in", async ({ page }) => {
    await page.goto("/review");
    await expect(page).toHaveURL(/\/$/);
  });
});
