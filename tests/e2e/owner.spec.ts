import { test, expect, PEOPLE, sheet, closeSheet, tabLabels } from "./fixtures";

test.describe("Owner: Delphine", () => {
  test.use({ person: PEOPLE.owner });

  test("Business is home: one number, a six-segment stage bar, three tabs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Net collected per assigned opportunity")).toBeVisible();
    await expect(page.getByText(/^\$[\d,]+\.\d{2}$/).first()).toBeVisible();

    const bar = page.getByRole("list", { name: /^Funnel stages/ });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("listitem")).toHaveCount(6);
    await expect(bar.getByRole("button")).toHaveCount(6);
    await expect(page.getByText("Sum over sum")).toBeVisible();

    const view = page.getByRole("radiogroup", { name: "View" });
    await expect(view.getByRole("radio")).toHaveText(["Now", "Money", "Source"]);
    await expect(view.getByRole("radio", { name: "Now" })).toHaveAttribute("aria-checked", "true");

    expect(await tabLabels(page)).toEqual(["Business", "Team", "Me"]);
  });

  test("tapping the Shows segment opens the Funnel with the real count, not the source sheet", async ({ page }) => {
    await page.goto("/");
    const segments = page.getByRole("list", { name: /^Funnel stages/ }).getByRole("button");
    const shows = segments.nth(3);
    await expect(shows).toHaveAccessibleName(/^(Attended|Shows)/);
    await shows.click();

    const funnel = sheet(page, "Funnel");
    await expect(funnel).toBeVisible();
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
    await expect(page.getByText("Net collected per assigned opportunity")).toBeVisible();
  });

  test("Fix this first: one card, owner assignment persists", async ({ page }) => {
    await page.goto("/");
    const section = page.getByRole("region", { name: "Fix this first" });
    await expect(section).toBeVisible();
    await expect(section.getByRole("article")).toHaveCount(1);
    await expect(section.getByText("Observed")).toBeVisible();
    await expect(section.getByText("Comparator")).toBeVisible();
    await expect(section.getByText("Investigate")).toBeVisible();

    const owner = section.getByRole("combobox", { name: "Assign owner function" });
    await owner.selectOption("marketing");
    await expect(owner).toHaveValue("marketing");
    await expect(owner.locator("option:checked")).toHaveText("Marketing");

    // Survives leaving and returning to the Now view (client state on the dashboard).
    await page.getByRole("radio", { name: "Money" }).click();
    await page.getByRole("radio", { name: "Now" }).click();
    await expect(page.getByRole("region", { name: "Fix this first" }).getByRole("combobox", { name: "Assign owner function" })).toHaveValue("marketing");

    // See all opens every investigation with the same assignment.
    const seeAll = section.getByRole("button", { name: /^See all \d+$/ });
    if (await seeAll.count()) {
      await seeAll.click();
      const all = sheet(page, "All investigations");
      await expect(all).toBeVisible();
      await expect(all.getByRole("combobox", { name: "Assign owner function" }).first()).toHaveValue("marketing");
      await closeSheet(page);
    }
  });

  test("Money shows cash and contracted value as separate tiles", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "Money" }).click();
    const tiles = page.locator("main").getByRole("button", { name: /Open definition\.$/ });
    await expect(tiles).toHaveCount(4);
    await expect(tiles.nth(0)).toHaveAccessibleName(/^Net collected cash, \$[\d,]+\. Open definition\.$/);
    await expect(tiles.nth(1)).toHaveAccessibleName(/^Contracted value, \$[\d,]+\. Open definition\.$/);
    await expect(tiles.nth(2)).toHaveAccessibleName(/^Outstanding, /);
    await expect(tiles.nth(3)).toHaveAccessibleName(/^Refunds and disputes \(\d+\), /);
    // Cash and contract are different numbers on different tiles.
    const cash = await tiles.nth(0).getAttribute("aria-label");
    const contracted = await tiles.nth(1).getAttribute("aria-label");
    expect(cash?.match(/\$[\d,]+/)?.[0]).not.toEqual(contracted?.match(/\$[\d,]+/)?.[0]);
    await expect(page.getByText("Descriptive").first()).toBeVisible();

    // A tile opens its definition with numerator and denominator.
    await tiles.nth(1).click();
    const def = page.getByRole("dialog");
    await expect(def).toBeVisible();
    await expect(def).toContainText("Not cash");
    await closeSheet(page);
  });

  test("Source is labelled unverified and the scenario is arithmetic, not a forecast", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "Source" }).click();
    await expect(page.getByText("Not verified")).toBeVisible();
    await expect(page.getByText("$4,126,635.66")).toBeVisible();
    await expect(page.getByText("Arithmetic scenario, not a forecast")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Team total" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Revenue per lead" })).toBeAttached();
  });

  test("cohort filter changes the hero basis and resets", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Cohort filter, all. Open." })).toBeVisible();
    await page.getByRole("button", { name: /^Cohort filter/ }).click();
    const cohort = sheet(page, "Cohort");
    await expect(cohort).toBeVisible();
    await expect(cohort.getByText(/^\d+ assigned$/)).toBeVisible();
    const paths = cohort.getByRole("radiogroup", { name: "Entry path" }).getByRole("radio");
    await paths.nth(1).click();
    await expect(cohort.getByRole("button", { name: "Reset" })).toBeEnabled();
    await cohort.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Cohort filter, (?!all)/ })).toBeVisible();
    // The hero still renders one number for the narrowed cohort.
    await expect(page.getByText("Net collected per assigned opportunity")).toBeVisible();
    await expect(page.getByRole("list", { name: /^Funnel stages/ }).getByRole("listitem")).toHaveCount(6);
  });
});
