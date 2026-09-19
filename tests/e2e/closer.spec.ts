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

  test("brief explains why this closer and shows verified fit", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Brief" }).click();
    const brief = sheet(page, "Brief");
    await expect(brief).toBeVisible();
    await expect(brief.getByText("Why you")).toBeVisible();
    // The assignment explanation is a sentence, tagged Verified, and never uses personality.
    const why = brief.locator("div.py-2\\.5").filter({ hasText: "Why you" }).first();
    await expect(why.getByText("Verified", { exact: true })).toBeVisible();
    await expect(why.locator("p")).toHaveText(/^Assigned to .+; .+/);
    await expect(why.locator("p")).toContainText("Personality information was not used");

    // Every row carries provenance.
    await expect(brief.getByText("Customer-stated").first()).toBeVisible();
    await expect(brief.getByText("Verified", { exact: true }).first()).toBeVisible();
    for (const row of ["Request", "Desired outcome", "Previous promises", "Offer version"]) {
      await expect(brief.getByText(row, { exact: true })).toBeVisible();
    }

    // Fit: chips when assessed, an explicit "Not assessed" plus an Unknown otherwise. Never invented.
    await expect(brief.getByText("Verified fit")).toBeVisible();
    const fitBlock = brief.locator("div.py-2\\.5").filter({ hasText: "Verified fit" }).first();
    const chips = fitBlock.getByRole("listitem");
    if (await chips.count()) {
      for (const chip of await chips.all()) {
        await expect(chip).toHaveText(/(yes|partial|no)/);
        await expect(chip).toHaveText(/(Customer-stated|Verified|AI-proposed)/);
      }
    } else {
      await expect(fitBlock.getByText("Not assessed")).toBeVisible();
      await expect(brief.getByRole("listitem").filter({ hasText: "Offer fit not assessed" })).toHaveCount(1);
    }
    await brief.getByRole("button", { name: "Ask for clarification" }).click();
    await expect(brief.getByRole("button", { name: "Clarification requested" })).toBeDisabled();
    await closeSheet(page);
  });

  test("brief shows Buyer mode from the customer's words: the read as one value word, the top dimensions, the approach", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Brief" }).click();
    const brief = sheet(page, "Brief");
    await expect(brief).toBeVisible();
    const section = brief.getByTestId("buyer-mode");
    await expect(section).toBeVisible();
    await expect(section.getByText("Buyer mode", { exact: true })).toBeVisible();
    // The read: "They value" over one value word, never a lens name as the hero, never the word "type".
    const read = section.getByTestId("read-block");
    await expect(read.getByText("They value")).toBeVisible();
    await expect(read.getByTestId("read-value")).toBeVisible();
    await expect(section).not.toContainText(/\btype\b/i);
    await expect(section).not.toContainText(/archetype/i);

    const rows = section.getByTestId("buyer-mode-row");
    if (await rows.count()) {
      // Marcus's next appointment has a transcript (call_089c): numbers first, a fast decision, a partner in the room.
      expect(await rows.count()).toBeLessThanOrEqual(3);
      await expect(rows.first()).toContainText(/^[A-Z][a-z ]+: [A-Z][a-z]+/);
      await expect(rows.first().getByTestId("confidence-dot")).toHaveAttribute("aria-label", /Confident|Low confidence/);
      await expect(section.getByText("Evidence preference: Quantitative")).toBeVisible();
      await expect(section.getByTestId("approach")).toContainText("Lead with the numbers");
      // Tap a row: the cited words appear with the brief's Customer-stated tag.
      await rows.first().getByRole("button").click();
      const cited = rows.first().getByTestId("cited-words");
      await expect(cited).toBeVisible();
      await expect(cited.getByText("Customer-stated").first()).toBeVisible();
      await expect(cited).toContainText(/numbers/i);
      // The read: the value word is a plain word, the lens label sits beneath with a percentage; details list all twelve.
      await expect(read.getByTestId("read-top")).toHaveText(/^[A-Z][a-z]+ · \d{1,2}%$/);
      await read.getByRole("button").click();
      await expect(read.getByTestId("read-row")).toHaveCount(12);
      await expect(read.getByText("what we believe, and how strongly")).toBeVisible();
      await expect(read.getByText("No signal", { exact: true }).first()).toBeVisible();
    } else {
      await expect(section.getByTestId("buyer-mode-empty")).toHaveText("No signal yet");
      await expect(read.getByTestId("read-value")).toHaveText("No signal yet");
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
