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
    // The assignment explanation is a sentence, tagged Verified.
    const why = brief.locator("div").filter({ has: page.getByText("Why you") }).last();
    await expect(why).toContainText("Verified");
    await expect(why.locator("p")).toHaveText(/\S+ \S+ \S+/);

    await expect(brief.getByText("Verified fit")).toBeVisible();
    const fitList = brief.locator("div").filter({ has: page.getByText("Verified fit", { exact: true }) }).last().getByRole("list");
    const chips = fitList.getByRole("listitem");
    await expect(chips.first()).toBeVisible();
    expect(await chips.count()).toBeGreaterThan(0);
    // Every chip carries a yes/partial/no verdict and a provenance tag.
    for (const chip of await chips.all()) {
      await expect(chip).toHaveText(/(yes|partial|no)/);
      await expect(chip).toHaveText(/(Customer-stated|Verified|AI-proposed)/);
    }
    await brief.getByRole("button", { name: "Ask for clarification" }).click();
    await expect(brief.getByRole("button", { name: "Clarification requested" })).toBeDisabled();
    await closeSheet(page);
  });

  test("join to verbal yes with zero collected, then a Due task", async ({ page }) => {
    await page.goto("/");
    const name = await page.getByRole("heading", { level: 2 }).first().innerText();

    await dock(page).click();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
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
    await expect(page.getByText("Ended", { exact: true })).toBeVisible();
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
    await expect(ladder.getByRole("listitem").filter({ hasText: "Collected" }).first()).toContainText("$0 collected");
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
