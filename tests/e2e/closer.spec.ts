import { test, expect, PEOPLE, dock, sheet, closeSheet } from "./fixtures";

const TIME = /\d{1,2}:\d{2} (AM|PM)/;

test.describe("Closer: Marcus", () => {
  test.use({ person: PEOPLE.closerMarcus });

  test("hero shows the time, the name and Join", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(TIME).first()).toBeVisible();
    const name = page.getByRole("heading", { level: 2 }).first();
    await expect(name).toBeVisible();
    await expect(name).toHaveText(/\S+ \S+/);
    await expect(dock(page)).toHaveText("Join");
    await expect(dock(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Brief" })).toBeVisible();
  });

  test("the screen is a hero, a control and a list", async ({ page }) => {
    await page.goto("/");
    const main = page.locator("main");
    // No quote, no people strip, no stats bar, no game strip.
    await expect(main.getByText(/^“/)).toHaveCount(0);
    await expect(main.getByText(/Paused until data is fixed/)).toHaveCount(0);
    await expect(main.getByText(/Level \d+/)).toHaveCount(0);
    await expect(main.getByRole("region", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Now" })).toHaveAttribute("aria-selected", "true");
  });

  test("brief explains why this closer and shows verified fit, behind Details", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Brief" }).click();
    const brief = sheet(page, "Brief");
    await expect(brief).toBeVisible();
    // The first view carries no provenance tag and none of the labeled rows.
    await expect(brief.getByText(/^(Customer-stated|Verified|AI-proposed)$/)).toHaveCount(0);
    await expect(brief.getByText("Why you")).toHaveCount(0);

    await brief.getByTestId("brief-details-row").click();
    const details = sheet(page, "Details");
    await expect(details).toBeVisible();
    await expect(details.getByText("Why you")).toBeVisible();
    // The assignment explanation is a sentence, tagged Verified, and never uses personality.
    const why = details.locator("div.py-2\\.5").filter({ hasText: "Why you" }).first();
    await expect(why.getByText("Verified", { exact: true })).toBeVisible();
    await expect(why.locator("p")).toHaveText(/^Assigned to .+; .+/);
    await expect(why.locator("p")).toContainText("Personality information was not used");

    // Every row carries provenance.
    await expect(details.getByText("Customer-stated").first()).toBeVisible();
    await expect(details.getByText("Verified", { exact: true }).first()).toBeVisible();
    for (const row of ["Request", "Desired outcome", "Previous promises", "Offer version"]) {
      await expect(details.getByText(row, { exact: true })).toBeVisible();
    }

    // Fit: chips when assessed, an explicit "Not assessed" plus an Unknown otherwise. Never invented.
    await expect(details.getByText("Verified fit")).toBeVisible();
    const fitBlock = details.locator("div.py-2\\.5").filter({ hasText: "Verified fit" }).first();
    const chips = fitBlock.getByRole("listitem");
    if (await chips.count()) {
      for (const chip of await chips.all()) {
        await expect(chip).toHaveText(/(yes|partial|no)/);
        await expect(chip).toHaveText(/(Customer-stated|Verified|AI-proposed)/);
      }
    } else {
      await expect(fitBlock.getByText("Not assessed")).toBeVisible();
      await expect(details.getByRole("listitem").filter({ hasText: "Offer fit not assessed" })).toHaveCount(1);
    }
    await details.getByRole("button", { name: "Close", exact: true }).click();
    await expect(details).toHaveCount(0);

    // The ask names who it reaches. Never a bare "Ask for clarification" with no recipient.
    const ask = brief.getByTestId("brief-ask");
    await expect(ask).toHaveText(/^(Ask the setter, \w+|Add missing context)$/);
    const asked = (await ask.innerText()).startsWith("Ask the setter") ? /^Asked \w+$/ : /^Context added$/;
    await ask.click();
    await expect(ask).toHaveText(asked);
    await expect(ask).toBeDisabled();
    await closeSheet(page);
  });

  test("brief leads with the suggested approach; the read, its labels and its percentages are one tap in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Brief" }).click();
    const brief = sheet(page, "Brief");
    await expect(brief).toBeVisible();
    const section = brief.getByTestId("buyer-mode");
    await expect(section).toBeVisible();
    // The first thing in the sheet is what to do, not a word about the customer.
    await expect(brief.locator("[data-testid]").first()).toHaveAttribute("data-testid", "buyer-mode");
    const approach = section.getByTestId("suggested-approach");
    await expect(approach.getByText("Suggested approach")).toBeVisible();
    await expect(approach.getByTestId("approach-caveat")).toContainText("tentative");
    await expect(approach.getByTestId("approach-caveat")).toContainText("earlier conversation");
    // No percentage, no archetype label, no value word headlining the brief.
    await expect(brief).not.toContainText("%");
    await expect(brief).not.toContainText("They value");
    await expect(brief.getByTestId("read-value")).toHaveCount(0);
    await expect(section).not.toContainText(/\btype\b/i);
    await expect(section).not.toContainText(/archetype/i);

    const hasRead = (await approach.getByTestId("approach").count()) > 0;
    if (hasRead) {
      // Marcus's next appointment has a transcript (call_089c): numbers first, a fast decision, a partner in the room.
      await expect(approach.getByTestId("approach-lead")).toHaveText("Lead with the numbers");
      expect(await approach.getByTestId("approach").getByRole("listitem").count()).toBeLessThanOrEqual(2);

      // The read is one tap in, and nothing about it was deleted.
      await brief.getByTestId("brief-details-row").click();
      const details = sheet(page, "Details");
      const read = details.getByTestId("brief-read");
      await expect(read.getByText("The read behind it")).toBeVisible();
      await expect(read.getByText("They value")).toBeVisible();
      await expect(read.getByTestId("read-value")).toHaveText("Proof");
      await expect(read.getByTestId("read-top")).toHaveText(/^[A-Z][a-z]+ \u00b7 \d{1,2}%$/);
      // The sentence that says what that percentage is, right above the list it belongs to.
      await expect(read.getByTestId("read-meaning")).toContainText("how strongly we read this signal in the customer's own words");
      await expect(read.getByTestId("read-meaning")).toContainText("not a score for the person");
      await expect(read.getByTestId("read-row")).toHaveCount(12);
      await expect(read.getByText("No signal", { exact: true }).first()).toBeVisible();
      await expect(read.getByText(/\d{1,2}% (High|Medium|Low)/).first()).toBeVisible();

      // A cited word opens the passage it came from, with that turn highlighted.
      const quote = read.getByTestId("quote-open").first();
      const words = (await quote.innerText()).replace(/[\u201C\u201D]/g, "").trim();
      await quote.click();
      const passage = read.getByTestId("quote-passage").first();
      await expect(passage).toBeVisible();
      await expect(passage.locator('[data-cited="true"]')).toHaveCount(1);
      await expect(passage.locator('[data-cited="true"]')).toContainText(words);
      await expect(passage).toContainText("Svetlana Esposito");

      // The dimensions live in the same sheet, each with its own cited words.
      const dims = details.getByTestId("buyer-mode-dimensions");
      await expect(dims.getByText("Buyer mode", { exact: true })).toBeVisible();
      const rows = dims.getByTestId("buyer-mode-row");
      expect(await rows.count()).toBeGreaterThan(0);
      expect(await rows.count()).toBeLessThanOrEqual(3);
      await expect(rows.first()).toContainText(/^[A-Z][a-z ]+: [A-Z][a-z]+/);
      await expect(rows.first().getByTestId("confidence-dot")).toHaveAttribute("aria-label", /Confident|Low confidence/);
      await expect(dims.getByText("Evidence preference: Quantitative")).toBeVisible();
      await rows.first().getByRole("button").first().click();
      const cited = rows.first().getByTestId("cited-words");
      await expect(cited).toBeVisible();
      await expect(cited.getByText("Customer-stated").first()).toBeVisible();
      await expect(cited).toContainText(/numbers/i);
      await details.getByRole("button", { name: "Close", exact: true }).click();
      await expect(details).toHaveCount(0);
    } else {
      await expect(approach.getByTestId("approach-lead")).toHaveText("No suggestion yet");
      await expect(section.getByTestId("buyer-mode-empty")).toHaveText("No signal yet");
    }
    await closeSheet(page);
  });

  test("join to verbal yes with zero collected, then a Due task", async ({ page }) => {
    await page.goto("/");
    const name = await page.getByRole("heading", { level: 2 }).first().innerText();

    await dock(page).click();
    await expect(page.getByText(/^Connected/)).toBeVisible();
    await expect(page.getByText("Provider", { exact: true })).toBeVisible();
    await expect(dock(page)).toHaveText("End call");

    const stages = page.getByRole("list", { name: "Stages" });
    const items = stages.getByRole("checkbox");
    await expect(items).toHaveCount(6);
    await expect(items.nth(0)).toHaveText("Restate problem");
    await expect(items.nth(5)).toHaveText("Ask for the next voluntary decision");
    await items.nth(0).click();
    await expect(items.nth(0)).toHaveAttribute("aria-checked", "true");

    // Offer facts are the approved ones, never typed by the rep.
    await expect(page.getByText("$4,800")).toBeVisible();
    await expect(page.getByText(/Discount up to \d+%/)).toBeVisible();

    // A commitment made on the call is captured.
    await page.getByRole("textbox", { name: "Commitment" }).fill("Send proposal by Friday");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Send proposal by Friday")).toBeVisible();

    await dock(page).click();
    await expect(page.getByText(/^Ended/)).toBeVisible();
    await expect(dock(page)).toHaveText("Save outcome");
    await expect(dock(page)).toBeDisabled();
    await page.getByRole("radio", { name: "Verbal yes" }).click();
    await expect(page.getByText("Creates a follow-up task. Not revenue.")).toBeVisible();
    await expect(dock(page)).toBeEnabled();
    await dock(page).click();

    // Result: task, not revenue. The ladder shows the current step and $0 collected (signed, unpaid).
    await expect(page.getByText("Follow-up task created, not revenue")).toBeVisible();
    const ladder = page.getByRole("list", { name: "Financial state" });
    await expect(ladder).toBeVisible();
    await expect(ladder.getByRole("listitem")).toHaveCount(6);
    await expect(ladder.getByText("Now", { exact: true })).toHaveCount(1);
    const current = ladder.getByRole("listitem").filter({ hasText: "Now" });
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("Verbal yes");
    const steps = await ladder.getByRole("listitem").allInnerTexts();
    expect(steps.map((s) => s.split("\n")[0])).toEqual(["Verbal yes", "Proposal sent", "Signed", "Payment authorized", "Collected", "Delivery accepted"]);

    // Signed-unpaid rule: Collected shows "$0 collected" once signed with no ledger entry,
    // and never a positive amount without a payment_collected entry. Before signing it shows no amount at all.
    const collected = ladder.getByRole("listitem").filter({ hasText: "Collected" }).first();
    const collectedText = (await collected.innerText()).replace(/\s+/g, " ").trim();
    expect(collectedText === "Collected" || collectedText === "Collected $0 collected").toBe(true);
    expect(collectedText).not.toMatch(/\$[1-9]/);
    await expect(dock(page)).toHaveText("Done");

    // The follow-up is a Due task in the queue.
    await page.getByRole("tab", { name: /^Queue/ }).click();
    await expect(page.getByRole("tab", { name: /^Due/ })).toHaveAttribute("aria-selected", "true");
    const due = page.getByRole("region", { name: "Due" });
    const task = due.getByRole("button").filter({ hasText: "follow up: send proposal" });
    await expect(task).toHaveCount(1);
    await expect(task).toContainText(name);
  });
});
