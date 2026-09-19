import { test, expect, PEOPLE, sheet, closeSheet } from "./fixtures";

/**
 * Native call review (D: "Call intelligence, not a third-party notetaker"; D: "The transcript
 * decides. No rep approval."; D: "A stage is a stage, a prediction is a prediction, a payment is
 * a payment"; D: "Every correction keeps the original"). Transcripts come from
 * src/fixtures/calls.ts: call_005 (books, Tomasz), call_008 (voicemail, Tomasz), call_016 (partner
 * decides, Tomasz), call_010 (price objection, Marcus). Rules score them: call_005 Buying 65%
 * Likely, call_008 No contact, call_016 Contacted, call_010 Qualified 75%. The default view says
 * the assessment in words and names the next step; the numbers, what each one is a probability of,
 * the band that moved the stage, the cited spans and the calibration line live in Details.
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

    // Each row carries the stage it cleared, as a stage: no number, no second chip, never a confirm prompt.
    const thaddeus = rows.filter({ hasText: "Thaddeus Kowalczyk" });
    await expect(thaddeus.getByTestId("stage-word")).toHaveText("Buying");
    await expect(thaddeus.locator(".chip")).toHaveCount(0);
    await expect(page.getByText("Needs confirm")).toHaveCount(0);

    await thaddeus.getByRole("link").click();
    await expect(page).toHaveURL(/\/review\?call=call_005/);

    // The assessment is in words, under a kicker that says it is an assessment.
    await expect(page.getByTestId("assessment-kicker")).toHaveText("Current assessment");
    await expect(page.getByTestId("assessment")).toHaveText("Considering the offer");
    await expect(page.getByTestId("next-step")).toHaveText("Next step: Confirm the booking and who attends");
    await expect(page.getByTestId("view-support")).toHaveText("View supporting conversation");
    await expect(page.getByTestId("flag-issue")).toHaveText("Flag an issue");

    // No ring, no bare percentage, no band word standing alone, nothing to mistake for a measured probability.
    await expect(page.getByTestId("probability-ring")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("%");
    // "Buying" appears once, as a label on the stage bar, and nowhere as a verdict.
    await expect(page.locator("main").getByText("Buying", { exact: true })).toHaveCount(1);
    await expect(page.getByTestId("stage-strip").getByText("Buying", { exact: true })).toHaveCount(1);
    await expect(page.getByText("65%, likely")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Wrong?", exact: true })).toHaveCount(0);
    // The main screen carries no moment chips and no provenance tags; they live in Details.
    await expect(page.getByTestId("moment")).toHaveCount(0);
    await expect(page.locator("main").getByText("From transcript")).toHaveCount(0);
    await expect(page.locator("main").getByText("Not asserted")).toHaveCount(0);
    await expect(page.locator("main").locator(".chip")).toHaveCount(0);
    await expect(page.getByTestId("angle-chip")).toHaveCount(1); // the one Angle, not a chip
  });

  test("View supporting conversation highlights the cited spans and scrolls to them", async ({ page }) => {
    await page.goto("/review?call=call_005");
    await expect(highlighted(page)).toHaveCount(0);
    await page.getByTestId("view-support").click();
    // Buying cites five customer and rep turns; every one of them lights up.
    expect(await highlighted(page).count()).toBeGreaterThan(1);
    await expect(highlighted(page).first()).toBeInViewport();
    await expect(highlighted(page).first()).toHaveAttribute("data-cited", "true");
  });

  test("the stage bar has four segments, a band word with an icon on tap, and never a percent", async ({ page }) => {
    await page.goto("/review?call=call_005");
    const strip = page.getByTestId("stage-strip");
    await expect(strip).toBeVisible();
    const segments = strip.getByTestId("stage-segment");
    await expect(segments).toHaveCount(4);
    await expect(segments.nth(0)).toContainText("Contacted");
    await expect(segments.nth(1)).toContainText("Qualified");
    await expect(segments.nth(2)).toContainText("Buying");
    await expect(segments.nth(3)).toContainText("Bought");
    // The accessible name carries the band word, so the bar never means anything by color alone,
    // and it carries no number, because the number belongs beside its explanation.
    await expect(segments.nth(2)).toHaveAttribute("aria-label", "Buying, Likely, see supporting conversation");
    await expect(segments.nth(2)).toHaveAttribute("data-band", "likely");
    await expect(segments.nth(3)).toHaveAttribute("data-band", "no");
    await expect(strip).not.toContainText("%");

    await segments.nth(2).click();
    await expect(segments.nth(2)).toHaveAttribute("aria-pressed", "true");
    await expect(segments.nth(2).getByTestId("stage-band")).toHaveText("Likely");
    await expect(segments.nth(2).locator("svg")).toHaveCount(1); // the band icon, never color alone
    expect(await highlighted(page).count()).toBeGreaterThan(0);
    await expect(highlighted(page).first()).toHaveAttribute("data-cited", "true");
  });

  test("Details returns the numbers, each with what it is a probability of and an honest calibration line", async ({ page }) => {
    await page.goto("/review?call=call_005");
    await page.getByTestId("details-open").click();
    const details = sheet(page, "Details");
    await expect(details).toBeVisible();

    const numbers = details.getByTestId("numbers");
    await expect(numbers.getByText("What the numbers are")).toBeVisible();
    const rows = numbers.getByTestId("stage-number");
    await expect(rows).toHaveCount(4);

    const buying = numbers.locator('[data-stage="buying"]');
    await expect(buying.getByTestId("stage-percent")).toHaveText("65%");
    // The sentence that answers "65% of what?", and rules out the worst reading.
    await expect(buying).toContainText("How strongly this transcript reads as active consideration of the offer");
    await expect(buying).toContainText("It is not a chance of purchase");
    await expect(buying.getByTestId("stage-band-word")).toHaveText("Likely");
    await expect(buying).toContainText("Reached the Likely band, so the stage moved");

    const bought = numbers.locator('[data-stage="bought"]');
    await expect(bought.getByTestId("stage-percent")).toHaveText("0%");
    await expect(bought).toContainText("Not scored on this call");
    await expect(numbers.locator('[data-stage="qualified"]')).toContainText("it does not rate the customer");

    // Calibration is stated, not implied.
    await expect(details.getByTestId("calibration")).toContainText("Not calibrated yet");
    await expect(details.getByTestId("calibration")).toContainText("no percentage here is a track record");

    // A cited timecode goes to the moment behind the number.
    await buying.getByRole("button", { name: /Go to the words behind buying/ }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
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

  test("Flag an issue holds the field, keeps the original and its cited words, and withdrawing appends", async ({ page }) => {
    await page.goto("/review?call=call_005");
    // One word on the Changes row; the list of changes sits behind it.
    await expect(page.getByTestId("policy-tag")).toHaveText("Applied");
    await expect(page.getByText("Creates a booking task")).toHaveCount(0);
    await page.getByTestId("changes-open").click();
    const changes = sheet(page, "What this changes");
    await expect(changes.getByText("Creates a booking task")).toBeVisible();
    await expect(changes.getByText("Confirms the fit assessment")).toBeVisible();
    await expect(changes.getByText("Never writes money, consent, or attendance")).toBeVisible();
    await closeSheet(page);

    await page.getByTestId("details-open").click();
    const details = sheet(page, "Details");
    await expect(details.getByTestId("keeps-original")).toContainText("The original reading and the words it cited are kept");
    const field = details.getByTestId("extracted-field").first();
    const original = (await field.locator("p").first().innerText()).trim();
    await field.getByRole("button", { name: "Flag an issue", exact: true }).click();
    await expect(field.getByText("Flagged", { exact: true })).toBeVisible();

    // The reading itself is untouched, and the history says so with the words it cited.
    await expect(field.locator("p").first()).toHaveText(original);
    const entries = field.getByTestId("correction-entry");
    await expect(entries).toHaveCount(1);
    await expect(entries.first()).toHaveAttribute("data-kind", "flagged");
    await expect(entries.first()).toContainText(`Original kept: “${original}”`);
    await expect(entries.first()).toContainText(/cited at \d+:\d\d/);

    // Withdrawing adds an entry; it never erases the flag that came before.
    await field.getByRole("button", { name: "Withdraw flag", exact: true }).click();
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toHaveAttribute("data-kind", "flagged");
    await expect(entries.nth(1)).toHaveAttribute("data-kind", "withdrawn");
    await expect(entries.nth(1)).toContainText(`Original kept: “${original}”`);

    // Flag it again and the policy holds what it touched.
    await field.getByRole("button", { name: "Flag an issue", exact: true }).click();
    await expect(entries).toHaveCount(3);
    await closeSheet(page);
    await expect(page.getByTestId("policy-tag")).toHaveText("Held");
    await expect(page.getByTestId("flag-issue")).toHaveText("Flagged 1");
    await page.getByTestId("changes-open").click();
    await expect(sheet(page, "What this changes").getByTestId("dispute-event")).toContainText("The original extraction and the words it cited are kept");
    await closeSheet(page);
  });

  test("Flag an issue under the assessment opens Details; there is no Confirm and no Wrong?", async ({ page }) => {
    await page.goto("/review?call=call_008");
    await expect(page.getByTestId("assessment")).toHaveText("No conversation yet");
    await expect(page.getByTestId("next-step")).toContainText("Try them again and leave a way to reply");
    await expect(page.locator("main")).not.toContainText("%");
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);

    await page.getByTestId("flag-issue").click();
    const details = sheet(page, "Details");
    await expect(details).toBeVisible();
    await expect(details.getByTestId("extracted-field").filter({ hasText: "Stage, contacted" })).toBeVisible();
    await details.getByTestId("extracted-field").first().getByRole("button", { name: "Flag an issue", exact: true }).click();
    await closeSheet(page);
    await expect(page.getByTestId("flag-issue")).toHaveText(/Flagged/);
    await expect(page.getByTestId("policy-tag")).toHaveText("Held");
  });

  test("feedback lives in Details and points at moments", async ({ page }) => {
    await page.goto("/review?call=call_016");
    await expect(page.getByTestId("assessment")).toHaveText("Talking with us");
    await expect(page.getByTestId("next-step")).toContainText("Call back at the time you agreed");
    await expect(page.getByTestId("feedback-card")).toHaveCount(0);
    await page.getByTestId("details-open").click();
    const cards = sheet(page, "Details").getByTestId("feedback-card");
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText("An objection was left open");
    await cards.first().getByRole("button", { name: /See moment/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(highlighted(page)).toHaveCount(1);
    await expect(highlighted(page)).toContainText(/worried/);
    // Below the band reads as leaning, not applied, inside Changes.
    await page.getByTestId("changes-open").click();
    const changes = sheet(page, "What this changes");
    await expect(changes.getByText("Records a leaning fit assessment")).toBeVisible();
    await expect(changes.getByText("Leaning, not applied").first()).toBeVisible();
    await closeSheet(page);
  });

  test("a buyer mode row and the read both reach the words they came from", async ({ page }) => {
    await page.goto("/review?call=call_016");
    await page.getByTestId("details-open").click();
    const details = sheet(page, "Details");
    const bm = details.getByTestId("review-buyer-mode");
    // The approach leads the block; the read sits under it with the sentence that says what it measures.
    await expect(bm.getByTestId("review-approach")).toContainText("Lead with the numbers");
    await expect(bm.getByTestId("read-meaning")).toContainText("not a score for the person");
    const row = bm.getByTestId("buyer-mode-row").filter({ hasText: "Control orientation" });
    await row.getByRole("button").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(highlighted(page)).toHaveCount(1);
    await expect(highlighted(page)).toHaveAttribute("data-cited", "true");
  });

  test("a deep link to one span lands on that passage highlighted", async ({ page }) => {
    await page.goto("/review?call=call_016&span=32000");
    await expect(highlighted(page)).toHaveCount(1);
    await expect(highlighted(page)).toContainText("hockey team");
    await expect(highlighted(page)).toBeInViewport();
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
    await expect(page.getByTestId("assessment")).toHaveCount(0);
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

    // The owner sees the same assessment, bar, and Details as the rep.
    await page.goto("/review?call=call_005");
    await expect(page.getByTestId("assessment")).toHaveText("Considering the offer");
    await expect(page.getByTestId("stage-strip").getByTestId("stage-segment")).toHaveCount(4);
    await expect(page.getByTestId("angle-chip")).toHaveCount(1);
    // Sharing lives behind the Good example row.
    await expect(page.getByRole("button", { name: "Share to playbook" })).toHaveCount(0);
    const row = page.getByTestId("playbook-open");
    await expect(row).toContainText("Share");
    await row.click();
    await sheet(page, "Good example").getByRole("button", { name: "Share to playbook" }).click();
    await expect(page.getByText("Marked for review")).toBeVisible();
    await closeSheet(page);
    await expect(row).toContainText("Marked");
  });

  test("the price objection call never proposes a discount, and ambushed reads confirmed in their words", async ({ page }) => {
    await page.goto("/review?call=call_010");
    await expect(page.getByTestId("assessment")).toHaveText("A fit for the offer");
    await expect(page.getByTestId("next-step")).toContainText("Send the proposal they asked for");
    // Buying 60% sits under the band: the proposal task is a lean, not created.
    await expect(page.getByTestId("policy-tag")).toHaveText("Applied");
    await page.getByTestId("changes-open").click();
    const proposal = sheet(page, "What this changes").getByTestId("change").filter({ hasText: "Creates a proposal task" });
    await expect(proposal).toBeVisible();
    await expect(proposal).toHaveAttribute("data-applied", "false");
    await expect(proposal).toContainText("Leaning, not applied");
    await closeSheet(page);
    await expect(page.getByTestId("angle-chip")).not.toContainText(/price|discount|guarantee|contract/i);
    await page.getByTestId("details-open").click();
    const details = sheet(page, "Details");
    // The number that is under its band says so, in words, beside the number.
    const buying = details.getByTestId("numbers").locator('[data-stage="buying"]');
    await expect(buying.getByTestId("stage-percent")).toHaveText("60%");
    await expect(buying.getByTestId("stage-band-word")).toHaveText("Unlikely");
    await expect(buying).toContainText("Under the Likely band, so nothing moved");
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
