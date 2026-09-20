import { test, expect, tabLabels } from "./fixtures";

const NEVER_A_TAB = ["Owner", "Business", "Setter", "Closer", "Coach"];
const PROFILES_KEY = "sos-profiles";

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

  test("tapping Tomasz builds a profile first, then lands on Today with exactly Today, Team, Me", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Tomasz Wierzbicki/ }).click();

    // First sign-in: four quick steps, no session yet.
    await expect(page.getByRole("heading", { level: 1, name: "Photo" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Step 1 of 4" })).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem("sos-session"))).toBeNull();
    await page.getByRole("button", { name: "Skip for now" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Name" })).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Tomasz Wierzbicki");
    await expect(page.getByLabel("Handle")).toHaveValue("tomasz.wierzbicki");
    await expect(page.getByText("Available")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "How I sell" })).toBeVisible();
    await page.getByLabel("One line").fill("Numbers first, then the demo");
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Color" })).toBeVisible();
    await page.getByRole("radio", { name: "Teal" }).click();
    await page.getByRole("button", { name: "Done" }).click();

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

    // The profile persisted too, completed, with what was typed.
    const profiles = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), PROFILES_KEY);
    const mine = profiles?.profiles?.find((p: { userId: string }) => p.userId === "usr_setter_tomasz");
    expect(mine).toMatchObject({ handle: "tomasz.wierzbicki", accent: "teal", howISell: "Numbers first, then the demo" });
    expect(typeof mine.completedAt).toBe("string");
  });

  test("a finished profile skips setup and lands on Today", async ({ page }) => {
    await page.addInitScript((key) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          profiles: [
            {
              tenantId: "obavia",
              userId: "usr_setter_tomasz",
              displayName: "Tomasz Wierzbicki",
              handle: "tomasz",
              accent: "green",
              completedAt: "2026-09-01T00:00:00Z",
              updatedAt: "2026-09-01T00:00:00Z",
            },
          ],
        }),
      );
    }, PROFILES_KEY);
    await page.goto("/");
    await page.getByRole("button", { name: /Tomasz Wierzbicki/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Photo" })).toHaveCount(0);
    await expect(page.getByTestId("dock")).toBeVisible();
    expect(await tabLabels(page)).toEqual(["Today", "Team", "Me"]);
  });

  test("the owner's setup adds a Business step", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Delphine Okafor/ }).click();
    await expect(page.getByRole("list", { name: "Step 1 of 5" })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Business" })).toBeVisible();
    await expect(page.getByLabel("Business name")).toHaveValue("Obavia");
    await expect(page.getByLabel("Timezone")).toHaveValue("America/New_York");
    await page.getByRole("button", { name: "Done" }).click();
    expect(await tabLabels(page)).toEqual(["Business", "Team", "Me"]);
  });
});
