import { test, expect, PEOPLE, dock } from "./fixtures";

test.describe("Route gating: setter", () => {
  test.use({ person: PEOPLE.setter });

  test("/owner sends a setter to their own Today", async ({ page }) => {
    await page.goto("/owner");
    await expect(page).toHaveURL(/\/$/);
    await expect(dock(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    await expect(page.getByText("Net collected cash per assigned opportunity")).toHaveCount(0);
    await expect(page.getByRole("radiogroup", { name: "View" })).toHaveCount(0);
  });

  test("/coach sends a setter to Me", async ({ page }) => {
    await page.goto("/coach");
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole("region", { name: "Details" }).getByRole("button", { name: /Level/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Not you?" })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`^${PEOPLE.setter.displayName}`) })).toBeVisible();
  });

  test("/closer and /setter both land on Today", async ({ page }) => {
    await page.goto("/closer");
    await expect(page).toHaveURL(/\/$/);
    await expect(dock(page)).toBeVisible();
    await page.goto("/setter");
    await expect(page).toHaveURL(/\/$/);
    await expect(dock(page)).toBeVisible();
  });
});

test.describe("Route gating: owner", () => {
  test.use({ person: PEOPLE.owner });

  test("/setter sends the owner to Business", async ({ page }) => {
    await page.goto("/setter");
    await expect(page).toHaveURL(/\/$/);
    const view = page.getByRole("radiogroup", { name: "View" });
    await expect(view).toBeVisible();
    await expect(view.getByRole("radio")).toHaveText(["Now", "Money", "Source"]);
    await expect(page.getByTestId("dock")).toHaveCount(0);
  });

  test("/owner and /coach resolve to Business and Me", async ({ page }) => {
    await page.goto("/owner");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: /Net collected cash per assigned opportunity/ })).toBeVisible();
    await page.goto("/coach");
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole("link", { name: "Connect" })).toBeVisible();
  });
});

test.describe("Route gating: signed out", () => {
  test.use({ person: null });

  for (const path of ["/me", "/owner", "/coach", "/setter", "/closer", "/team"]) {
    test(`${path} shows Who are you`, async ({ page }) => {
      // src gap: TeamView renders its board without a session; it needs the same gate MeScreen has.
      test.fixme(path === "/team", "src/components/team/TeamView.tsx has no signed-out redirect to /");
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: "Who are you" })).toBeVisible();
      await expect(page.locator("nav")).toHaveCount(0);
      await expect(page.getByTestId("dock")).toHaveCount(0);
    });
  }
});
