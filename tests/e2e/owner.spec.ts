import { test, expect, PEOPLE, sheet, closeSheet, tabLabels } from "./fixtures";

/**
 * Owner Business after "The front end is the product" (docs/DECISIONS.md): one segmented
 * control, one hero with one number, one card with one action, one list, the tab bar.
 * Basis, sum over sum, data state, funnel tiles, definition and cohort live in the hero's
 * Details sheet. Why, the owner dropdown and the scenario live in the card's Assign sheet.
 */

const HERO_NAME = /^Net collected per assigned opportunity, \$[\d,]+\.\d{2}\. Tap for details\.$/;

function hero(page: import("@playwright/test").Page) {
  return page.getByTestId("owner-hero");
}

test.describe("Owner: Delphine", () => {
  test.use({ person: PEOPLE.owner });

  test("Business is home: one control, one number, one card, one list, three tabs", async ({ page }) => {
    await page.goto("/");
    await expect(hero(page)).toHaveAccessibleName(HERO_NAME);
    await expect(hero(page).getByText(/^\$[\d,]+\.\d{2}$/)).toBeVisible();
    await expect(hero(page)).toContainText("Per opportunity");

    // Nothing else on the first view: no basis chip, no sum over sum, no funnel tiles, no data-state chip.
    await expect(page.getByText("Sum over sum")).toHaveCount(0);
    await expect(page.getByRole("list", { name: /^Funnel stages/ })).toHaveCount(0);
    await expect(page.locator("main").getByText(/^\$[\d,]+ over \d+$/)).toHaveCount(0);
    await expect(page.locator("main").getByText("Partial", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Cohort filter/ })).toHaveCount(0);

    const view = page.getByRole("radiogroup", { name: "View" });
    await expect(view.getByRole("radio")).toHaveText(["Now", "Money", "Source"]);
    await expect(view.getByRole("radio", { name: "Now" })).toHaveAttribute("aria-checked", "true");

    // One list under the card: every other investigation and the data feeds.
    await expect(page.getByTestId("see-all")).toBeVisible();
    await expect(page.getByTestId("activity-open")).toBeVisible();

    expect(await tabLabels(page)).toEqual(["Business", "Team", "Me"]);
  });

  test("the hero's Details holds the basis, the sum over sum, the six funnel tiles and the data state", async ({ page }) => {
    await page.goto("/");
    await hero(page).click();
    const details = sheet(page, "Per opportunity");
    await expect(details).toBeVisible();
    await expect(details.getByText("Net collected cash")).toBeVisible();
    await expect(details.getByText(/^\$[\d,]+ over \d+$/)).toBeVisible();
    await expect(details.getByText("Sum over sum")).toBeVisible();

    const bar = details.getByRole("list", { name: /^Funnel stages/ });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("listitem")).toHaveCount(6);
    await expect(bar.getByRole("button")).toHaveCount(6);

    await expect(details.getByRole("button", { name: /^Definition/ })).toBeVisible();
    await expect(details.getByTestId("cohort-open")).toBeVisible();
    await closeSheet(page);
    await expect(hero(page)).toBeVisible();
  });

  test("tapping the Shows tile in Details opens the Funnel with the real count, not the source sheet", async ({ page }) => {
    await page.goto("/");
    await hero(page).click();
    const segments = sheet(page, "Per opportunity").getByRole("list", { name: /^Funnel stages/ }).getByRole("button");
    const shows = segments.nth(3);
    await expect(shows).toHaveAccessibleName(/^(Attended|Shows)/);
    await shows.click();

    const funnel = sheet(page, "Funnel");
    await expect(funnel).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(funnel.getByRole("list", { name: "Funnel stages" }).first()).toBeVisible();
    // Attended is 35 in the funnel (the unverified source sheet says 71 shows; that never leaks in here).
    await expect(funnel.getByRole("button", { name: /^Attended, 35\b/ })).toBeVisible();
    await expect(funnel.getByRole("button", { name: /^Assigned opportunities, 90\b/ })).toBeVisible();
    // The source sheet's "71 shows" never appears as a count here (71.4% is a real connector rate, 25 of 35).
    await expect(funnel.getByText("71", { exact: true })).toHaveCount(0);
    await expect(funnel.getByRole("button", { name: /Attended, 71\b/ })).toHaveCount(0);
    await expect(funnel.getByText("Not verified")).toHaveCount(0);
    await expect(funnel.getByText("Reported revenue")).toHaveCount(0);
    await closeSheet(page);
    await expect(hero(page)).toBeVisible();
  });

  test("Fix this first: one card, one action; Why and the owner live in the Assign sheet, and the assignment persists", async ({ page }) => {
    await page.goto("/");
    const section = page.getByRole("region", { name: "Fix this first" });
    await expect(section).toBeVisible();
    await expect(section.getByRole("article")).toHaveCount(1);
    const card = section.getByRole("article");
    // Title, one line, Assign. No chips, no dropdown, no Why on the card itself.
    await expect(card.getByRole("button")).toHaveCount(1);
    await expect(card.getByRole("button", { name: "Assign", exact: true })).toBeVisible();
    await expect(card.getByRole("combobox")).toHaveCount(0);
    await expect(card.getByText("Data state")).toHaveCount(0);

    await card.getByRole("button", { name: "Assign", exact: true }).click();
    const assign = page.getByRole("dialog");
    await expect(assign).toBeVisible();
    await expect(assign.getByRole("heading", { level: 3, name: "Why" })).toBeVisible();
    await expect(assign.getByText("Observed")).toBeVisible();
    await expect(assign.getByText("Comparator")).toBeVisible();
    await expect(assign.getByText("Investigate")).toBeVisible();

    const more = assign.getByRole("button", { name: /^\d+ more$/ });
    if (await more.count()) {
      await more.click();
      await expect(assign.getByRole("button", { name: "Show fewer" })).toBeVisible();
    }
    const assumptions = assign.getByRole("button", { name: "Assumptions" });
    if (await assumptions.count()) {
      await assumptions.click();
      await expect(assumptions).toHaveAttribute("aria-expanded", "true");
    }

    const owner = assign.getByRole("combobox", { name: "Assign owner function" });
    await owner.selectOption("marketing");
    await expect(owner).toHaveValue("marketing");
    await expect(owner.locator("option:checked")).toHaveText("Marketing");
    await closeSheet(page);

    // All investigations is a row under the card; the first card there carries the same assignment, and
    // changing it there is reflected back in the Assign sheet (one client state, not two).
    const seeAll = page.getByTestId("see-all");
    if (await seeAll.count()) {
      await expect(seeAll).toContainText(/\d+/);
      await seeAll.click();
      const all = sheet(page, "All investigations");
      await expect(all).toBeVisible();
      const inSheet = all.getByRole("combobox", { name: "Assign owner function" });
      expect(await inSheet.count()).toBeGreaterThan(1);
      await expect(inSheet.first()).toHaveValue("marketing");
      await inSheet.first().selectOption("sales_ops");
      await closeSheet(page);
      await card.getByRole("button", { name: "Assign", exact: true }).click();
      await expect(page.getByRole("dialog").getByRole("combobox", { name: "Assign owner function" })).toHaveValue("sales_ops");
      await closeSheet(page);
    }
    // Note: leaving the Now view (Money/Source) remounts FixFirst and resets the assignment; see report.
  });

  test("Activity is one row; the feeds and their records open from it", async ({ page }) => {
    await page.goto("/");
    const row = page.getByTestId("activity-open");
    await expect(row).toContainText("Activity");
    await row.click();
    const activity = sheet(page, "Activity");
    await expect(activity).toBeVisible();
    await expect(activity.getByRole("region", { name: "Data freshness" })).toBeVisible();
    await closeSheet(page);
  });

  test("Money is one hero and one list; each opens its definition", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "Money" }).click();
    const cash = page.getByTestId("money-hero");
    await expect(cash).toHaveAccessibleName(/^Net collected cash, \$[\d,]+\. Open definition\.$/);
    const rows = page.getByTestId("money-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(/^Contracted value\$[\d,]+$/);
    await expect(rows.nth(1)).toContainText(/^Outstanding\$[\d,]+$/);
    await expect(rows.nth(2)).toContainText(/^Refunds and disputes\$[\d,]+$/);
    // Cash and contract are different numbers in different places.
    const cashText = (await cash.getAttribute("aria-label"))?.match(/\$[\d,]+/)?.[0];
    const contracted = (await rows.nth(0).innerText()).match(/\$[\d,]+/)?.[0];
    expect(cashText).not.toEqual(contracted);
    // No verdict chips on the first view.
    await expect(page.locator("main").getByText("Descriptive")).toHaveCount(0);

    // A row opens its definition with numerator and denominator.
    await rows.nth(0).click();
    const def = page.getByRole("dialog");
    await expect(def).toBeVisible();
    await expect(def).toContainText("Not cash");
    await expect(def.getByText("Descriptive", { exact: true })).toBeVisible();
    await closeSheet(page);

    await cash.click();
    await expect(page.getByRole("dialog")).toContainText("Payments collected minus refunds");
    await closeSheet(page);
  });

  test("Source is one hero and one list; provenance, the scenario and the table live behind the hero", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "Source" }).click();
    const src = page.getByTestId("source-hero");
    await expect(src).toContainText("Revenue per lead");
    await expect(src).toContainText("unverified");
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByText("$4,126,635.66")).toHaveCount(0);
    const reps = page.getByTestId("source-row");
    expect(await reps.count()).toBeGreaterThan(1);

    await src.click();
    const details = sheet(page, "Source sheet");
    await expect(details).toBeVisible();
    await expect(details.getByText("Not verified")).toBeVisible();
    await expect(details.getByText("$4,126,635.66")).toBeVisible();
    await expect(details.getByText("Arithmetic scenario, not a forecast")).toBeVisible();
    await expect(details.getByRole("table")).toBeVisible();
    await expect(details.getByRole("rowheader", { name: "Team total" })).toBeVisible();
    await expect(details.getByRole("columnheader", { name: "Revenue per lead" })).toBeAttached();
    await closeSheet(page);

    // A rep row opens that rep's columns.
    await reps.first().click();
    const rep = page.getByRole("dialog");
    await expect(rep).toContainText("Retained bookings");
    await expect(rep).toContainText("Lead-to-win");
    await closeSheet(page);
  });

  test("cohort filter lives in Details, changes the hero basis, shows one icon while on, and resets", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^Cohort filter/ })).toHaveCount(0);
    await hero(page).click();
    await sheet(page, "Per opportunity").getByTestId("cohort-open").click();
    const cohort = sheet(page, "Cohort");
    await expect(cohort).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(cohort.getByText(/^\d+ assigned$/)).toBeVisible();
    const paths = cohort.getByRole("radiogroup", { name: "Entry path" }).getByRole("radio");
    await paths.nth(1).click();
    await expect(cohort.getByRole("button", { name: "Reset" })).toBeEnabled();
    await cohort.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The narrowed cohort is the one icon at the top; the hero still renders one number.
    const icon = page.getByRole("button", { name: /^Cohort filter, (?!all)/ });
    await expect(icon).toBeVisible();
    await expect(hero(page)).toHaveAccessibleName(HERO_NAME);

    // The icon reopens the same sheet; Reset takes it away.
    await icon.click();
    await sheet(page, "Cohort").getByRole("button", { name: "Reset" }).click();
    await sheet(page, "Cohort").getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: /^Cohort filter/ })).toHaveCount(0);
  });
});
