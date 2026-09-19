import { test, expect, PEOPLE, sheet, closeSheet } from "./fixtures";

/**
 * Native call review (D: "Call intelligence, not a third-party notetaker"; D: "The transcript
 * decides. No rep approval."; design law: one hero, one number, one action). Transcripts come from
 * src/fixtures/calls.ts: call_005 (books, Tomasz), call_008 (voicemail, Tomasz), call_016 (partner
 * decides, Tomasz), call_010 (price objection, Marcus). Rules score them: call_005 Buying 65% Likely,
 * call_008 No contact, call_016 Contacted, call_010 Qualified 75%. Moments, their words, feedback and
 * every extracted field live in the Details sheet; the main screen keeps one Angle at most.
 */

const highlighted = (page: import("@playwright/test").Page) => page.locator('[data-testid="transcript-span"][data-highlighted="true"]');

test.describe("Review: setter", () => {
  test.use({ person: PEOPLE.setter });

  test("lists own calls with one word each and opens the meaningful one", async ({ page }) => {
    await page.goto("/review");
    const rows = page.getByTestId("review-row");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
    // Only Tomasz's calls: Marcus's price call is not listed.
    await expect(rows.filter({ hasText: "Bartholomew Haddad" })).toHaveCount(0);

    // Each row carries the one word the transcript cleared, no second chip, never a confirm prompt.
    const thaddeus = rows.filter({ hasText: "Thaddeus Kowalczyk" });
    await expect(thaddeus.getByTestId("stage-word")).toHaveText("Buying");
    await expect(thaddeus.locator(".chip")).toHaveCount(0);
    await expect(page.getByText("Needs confirm")).toHaveCount(0);

    await thaddeus.getByRole("link").click();
    await expect(page).toHaveURL(/\/review\?call=call_005/);
    await expect(page.getByTestId("hero-outcome")).toHaveText("Buying");
    await expect(page.getByTestId("hero-caption")).toHaveText("65%, likely");
    await expect(page.getByTestId("probability-ring")).toContainText("65%");
    // One word, one ring, one caption: no outcome chip, no band chip, no unknown chip, no Confirm.
    await expect(page.getByText("Transcript decided")).toHaveCount(0);
    await expect(page.getByText("Meaningful", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/^\d+ unknown$/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("wrong")).toHaveText("Wrong?");
    // The main screen carries no moment chips; they live in Details.
    await expect(page.getByTestId("moment")).toHaveCount(0);
  });

  test("the stage bar has four segments, percent on tap, and a tap goes to the cited span", async ({ page }) => {
    await page.goto("/review?call=call_005");
    const strip = page.getByTestId("stage-strip");
    await expect(strip).toBeVisible();
    const segments = strip.getByTestId("stage-segment");
    await expect(segments).toHaveCount(4);
    await expect(segments.nth(0)).toContainText("Contacted");
    await expect(segments.nth(1)).toContainText("Qualified");
    await expect(segments.nth(2)).toContainText("Buying");
    await expect(segments.nth(3)).toContainText("Bought");
    // No percent, band word, or icon until a tap; the accessible name carries both so meaning is never color alone.
    await expect(strip.getByTestId("stage-percent")).toHaveCount(0);
    await expect(strip.locator("svg")).toHaveCount(0);
    await expect(segments.nth(2)).toHaveAttribute("aria-label", "Buying 65 percent, Likely, see moment");
    await expect(segments.nth(2)).toHaveAttribute("data-band", "likely");
    await expect(segments.nth(3)).toHaveAttribute("data-band", "no");

    await segments.nth(2).click();
    await expect(segments.nth(2)).toHaveAttribute("aria-pressed", "true");
    await expect(segments.nth(2).getByTestId("stage-percent")).toHaveText("65%");
    await expect(highlighted(page)).toHaveCount(1);
    await expect(highlighted(page)).toHaveAttribute("data-cited", "true");
  });

  test("Details holds the moments; a moment highlights its cited span; a span shows its citations", async ({ page }) => {
    await page.goto("/review?call=call_005");
    await page.getByTestId("details-open").click();
    const details = sheet(page, "Details");
    await expect(details).toBeVisible();
    const moment = details.getByTestId("moment").filter({ hasText: "Next step, book" });
    await expect(moment).toBeVisible();
    await moment.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(highlighted(page)).toHaveCount(1);
    await expect(highlighted(page)).toHaveAttribute("data-cited", "true");
    await expect(highlighted(page)).toContainText(/Thursday/);

    // Tap the span: the fields that cite it appear.
    await highlighted(page).getByRole("button").first().click();
    await expect(page.getByTestId("span-citations")).toContainText("Next step");
  });

  test("disputing a field marks the applied changes Disputed", async ({ page }) => {
    await page.goto("/review?call=call_005");
    await expect(page.getByTestId("policy-tag")).toHaveText("Applied");
    await expect(page.getByText("Creates a booking task")).toBeVisible();
    await expect(page.getByText("Confirms the fit assessment")).toBeVisible();
    await expect(page.getByText("Never writes money, consent, or attendance")).toBeVisible();

    await page.getByTestId("details-open").click();
    const details = sheet(page, "Details");
    await expect(details).toBeVisible();
    await expect(details.getByTestId("extracted-field").first()).toBeVisible();
    await details.getByRole("button", { name: "Dispute", exact: true }).first().click();
    await expect(details.getByText("Disputed", { exact: true }).first()).toBeVisible();
    await closeSheet(page);

    await expect(page.getByTestId("policy-tag")).toHaveText("Disputed");
    await expect(page.getByTestId("wrong")).toHaveText("Disputed 1");
  });

  test("Wrong? under the caption opens Details; there is no Confirm", async ({ page }) => {
    await page.goto("/review?call=call_008");
    await expect(page.getByTestId("hero-outcome")).toHaveText("No contact");
    await expect(page.getByTestId("hero-caption")).toHaveText("10%, no");
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);

    await page.getByTestId("wrong").click();
    const details = sheet(page, "Details");
    await expect(details).toBeVisible();
    await expect(details.getByTestId("extracted-field").filter({ hasText: "Stage, contacted" })).toBeVisible();
    await details.getByRole("button", { name: "Dispute", exact: true }).first().click();
    await closeSheet(page);
    await expect(page.getByTestId("wrong")).toHaveText(/Disputed/);
    await expect(page.getByTestId("policy-tag")).toHaveText("Disputed");
  });

  test("feedback lives in Details and points at moments", async ({ page }) => {
    await page.goto("/review?call=call_016");
    await expect(page.getByTestId("hero-outcome")).toHaveText("Contacted");
    await expect(page.getByTestId("feedback-card")).toHaveCount(0);
    await page.getByTestId("details-open").click();
    const cards = sheet(page, "Details").getByTestId("feedback-card");
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText("An objection was left open");
    await cards.first().getByRole("button", { name: /See moment/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(highlighted(page)).toHaveCount(1);
    await expect(highlighted(page)).toContainText(/worried/);
    // Below the band reads as leaning, not applied.
    await expect(page.getByText("Records a leaning fit assessment")).toBeVisible();
    await expect(page.getByText("Leaning, not applied").first()).toBeVisible();
  });

  test("their words: the hockey card, its span, and the one Angle that rejecting it removes", async ({ page }) => {
    await page.goto("/review?call=call_016");
    // One Angle on the main screen, under the later "who handles the reply" turn, in the prospect's frame.
    const angle = page.getByTestId("angle-chip");
    await expect(angle).toHaveCount(1);
    await expect(angle).toContainText("Using your hockey example, who should own the first response");
    await expect(angle).not.toContainText(/price|discount|guarantee|contract/i);
    const angleTurn = page.getByTestId("transcript-span").filter({ has: angle });
    await expect(angleTurn).toContainText("who handles the reply");

    await page.getByTestId("details-open").click();
    const details = sheet(page, "Details");
    const card = details.getByTestId("reference-card").filter({ hasText: "like a hockey team where nobody knows who is defending" });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("nobody knows who is defending");
    await expect(card).toContainText("Spontaneous");
    await expect(card).toContainText("Observed");
    await expect(card.getByRole("button", { name: "Use later" })).toBeVisible();

    // Tap the expression: the cited span is highlighted and cites Their words.
    await card.getByTestId("reference-expression").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(highlighted(page)).toHaveCount(1);
    await expect(highlighted(page)).toContainText("like a hockey team where nobody knows who is defending");
    await highlighted(page).getByRole("button").first().click();
    await expect(page.getByTestId("span-citations")).toContainText("Their words");

    // Not this: reuse stops and the Angle is gone. The card stays, marked Not used.
    await page.getByTestId("details-open").click();
    await details.getByTestId("reference-card").getByRole("button", { name: "Not this" }).click();
    await expect(details.getByTestId("reference-card").first()).toHaveAttribute("data-rejected", "true");
    await expect(details.getByRole("button", { name: "Not used" })).toBeVisible();
    await closeSheet(page);
    await expect(page.getByTestId("angle-chip")).toHaveCount(0);
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
    // Five transcripts in src/fixtures/calls.ts: four review shapes plus the Svetlana confirmation call (call_089c).
    await expect(rows).toHaveCount(5);
    await expect(rows.filter({ hasText: "Bartholomew Haddad" })).toHaveCount(1);
    await expect(rows.getByTestId("stage-word")).toHaveCount(5);
    await expect(page.getByText("Needs confirm")).toHaveCount(0);

    // The owner sees the same hero, bar, and Details as the rep.
    await page.goto("/review?call=call_005");
    await expect(page.getByTestId("hero-outcome")).toHaveText("Buying");
    await expect(page.getByTestId("stage-strip").getByTestId("stage-segment")).toHaveCount(4);
    await expect(page.getByTestId("angle-chip")).toHaveCount(1);
    await page.getByRole("button", { name: "Share to playbook" }).click();
    await expect(page.getByText("Marked for review")).toBeVisible();
  });

  test("the price objection call never proposes a discount, and ambushed reads confirmed in their words", async ({ page }) => {
    await page.goto("/review?call=call_010");
    await expect(page.getByTestId("hero-outcome")).toHaveText("Qualified");
    // Buying 60% sits under the band: the proposal task is a lean, not created.
    const proposal = page.getByTestId("change").filter({ hasText: "Creates a proposal task" });
    await expect(proposal).toBeVisible();
    await expect(proposal).toHaveAttribute("data-applied", "false");
    await expect(proposal).toContainText("Leaning, not applied");
    await expect(page.getByTestId("policy-tag")).toHaveText("Applied");
    await expect(page.getByTestId("angle-chip")).not.toContainText(/price|discount|guarantee|contract/i);
    await page.getByTestId("details-open").click();
    const details = sheet(page, "Details");
    await expect(details.getByTestId("moment").filter({ hasText: "Objection, price" })).toBeVisible();
    await expect(details.getByText(/discount/i)).toHaveCount(0);
    const card = details.getByTestId("reference-card").filter({ hasText: "ambushed" });
    await expect(card).toContainText("Confirmed");
    await expect(card).toContainText("By then they had our website");
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
