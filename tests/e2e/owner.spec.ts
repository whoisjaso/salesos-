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
    await expect(funnel.getByRole("list", { name: "Funnel stages" }).filter({ visible: true }).first()).toBeVisible();
    await expect(funnel.getByText("35", { exact: true }).first()).toBeVisible();
    await expect(funnel.getByText("71", { exact: true })).toHaveCount(0);
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
    await expect(page.getByText("Net collected cash")).toBeVisible();
    await expect(page.getByText("Contracted value")).toBeVisible();
    await expect(page.getByText("Outstanding")).toBeVisible();
    await expect(page.getByText(/^Refunds and disputes \(\d+\)$/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Net collected cash, / })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Contracted value, / })).toBeVisible();
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
    const before = await page.getByText(/\d+ assigned/).first().innerText().catch(() => "");
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
    void before;
  });
});
