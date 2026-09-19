import { test, expect, tabLabels } from "./fixtures";

const NEVER_A_TAB = ["Owner", "Business", "Setter", "Closer", "Coach"];

test.describe("Signed out", () => {
  test.use({ person: null });

  test("home is the sign-in screen with six people and no chrome", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Who are you" })).toBeVisible();

    const people = page.getByRole("list").first().getByRole("button");
    await expect(people).toHaveCount(6);
    await expect(people.filter({ hasText: "Tomasz Wierzbicki" })).toHaveCount(1);
    await expect(people.filter({ hasText: "Delphine Okafor" })).toHaveCount(1);

    // No tab bar, no role switcher, no page header while signed out.
    await expect(page.locator("nav")).toHaveCount(0);
    for (const word of NEVER_A_TAB) await expect(page.getByRole("link", { name: word, exact: true })).toHaveCount(0);
  });

  test("tapping Tomasz lands on Today with exactly Today, Team, Me", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Tomasz Wierzbicki/ }).click();

    // Session written client-side, shell appears without a navigation.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Who are you" })).toHaveCount(0);
    await expect(page.getByTestId("dock")).toBeVisible();

    const labels = await tabLabels(page);
    expect(labels).toEqual(["Today", "Team", "Me"]);
    for (const word of NEVER_A_TAB) expect(labels).not.toContain(word);

    // Today is the current tab.
    await expect(page.getByRole("link", { name: "Today" }).and(page.locator("[aria-current='page']")).first()).toBeVisible();

    // The session persisted the way the app stores it.
    const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("sos-session") ?? "null"));
    expect(stored).toMatchObject({ userId: "usr_setter_tomasz", role: "setter", displayName: "Tomasz Wierzbicki" });
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-role"))).toBe("setter");
  });
});
