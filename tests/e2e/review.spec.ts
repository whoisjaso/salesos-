import { test, expect, PEOPLE, sheet, closeSheet } from "./fixtures";

/**
 * Native call review (D: "Call intelligence, not a third-party notetaker").
 * Transcripts come from src/fixtures/calls.ts: call_005 (books, Tomasz), call_008 (voicemail, Tomasz),
 * call_016 (partner decides, Tomasz), call_010 (price objection, Marcus).
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

    await rows.filter({ hasText: "Thaddeus Kowalczyk" }).getByRole("link").click();
    await expect(page).toHaveURL(/\/review\?call=call_005/);
    await expect(page.getByTestId("hero-outcome")).toHaveText("Meaningful");
    await expect(page.getByTestId("outcome-status")).toHaveText(/AI proposed/);
    await expect(page.getByText("High confidence")).toBeVisible();
    await expect(page.getByTestId("moment").first()).toBeVisible();
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

  test("disputing a field flips the policy to Needs confirm", async ({ page }) => {
    await page.goto("/review?call=call_005");
    await expect(page.getByTestId("policy-tag")).toHaveText("Applied by policy");
    await expect(page.getByText("Creates a booking task")).toBeVisible();
    await expect(page.getByText("Never writes money, consent, or attendance")).toBeVisible();

    await page.getByTestId("extracted-open").click();
    const extracted = sheet(page, "Extracted");
    await expect(extracted).toBeVisible();
    await expect(extracted.getByTestId("extracted-field").first()).toBeVisible();
    await extracted.getByRole("button", { name: "Dispute", exact: true }).first().click();
    await expect(extracted.getByText("Disputed", { exact: true }).first()).toBeVisible();
    await closeSheet(page);

    await expect(page.getByTestId("policy-tag")).toHaveText("Needs confirm");
  });

  test("confirm and dispute on the hero", async ({ page }) => {
    await page.goto("/review?call=call_008");
    await expect(page.getByTestId("hero-outcome")).toHaveText("Voicemail");
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByTestId("outcome-status")).toHaveText(/Confirmed by you/);
    await page.getByRole("button", { name: "Dispute", exact: true }).click();
    await expect(page.getByTestId("outcome-status")).toHaveText(/Disputed/);
    await expect(page.getByTestId("policy-tag")).toHaveText("Needs confirm");
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
    await expect(rows.filter({ hasText: "Needs confirm" })).toHaveCount(2);

    await page.goto("/review?call=call_005");
    await expect(page.getByTestId("hero-outcome")).toHaveText("Meaningful");
    await page.getByRole("button", { name: "Share to playbook" }).click();
    await expect(page.getByText("Marked for review")).toBeVisible();
  });

  test("the price objection call never proposes a discount", async ({ page }) => {
    await page.goto("/review?call=call_010");
    await expect(page.getByTestId("moment").filter({ hasText: "Objection, price" })).toBeVisible();
    await expect(page.getByText("Creates a proposal task")).toBeVisible();
    await expect(page.getByTestId("policy-tag")).toHaveText("Needs confirm");
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
