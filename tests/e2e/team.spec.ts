import { test, expect, PEOPLE, tabLabels } from "./fixtures";

test.describe("Team and Me: Renata", () => {
  test.use({ person: PEOPLE.closerRenata });

  test("season card carries a level ring", async ({ page }) => {
    await page.goto("/team");
    const season = page.getByRole("region", { name: "Season" });
    await expect(season).toBeVisible();
    await expect(season.getByText(/^\d+ days left$/)).toBeVisible();
    await expect(season.getByText(/^\d+ XP$|[\d,]+ XP/)).toBeVisible();
    await expect(season.locator('[aria-label^="Level "]')).toHaveCount(1);
    await expect(season.getByText(/^L\d+$/)).toBeVisible();
    expect(await tabLabels(page)).toEqual(["Today", "Team", "Me"]);
  });

  test("board lists Renata with a net-collected chip; ranks are paused until data is fixed", async ({ page }) => {
    await page.goto("/team");
    await expect(page.getByRole("radio", { name: "Board" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: "Closers" })).toHaveAttribute("aria-checked", "true");

    const board = page.getByRole("list", { name: "Board" });
    const me = board.getByRole("listitem").filter({ hasText: "Renata Solís" });
    await expect(me).toHaveCount(1);
    await expect(me).toContainText("Net collected cash");
    await expect(me.getByText(/^\$[\d,]+\.\d{2}$|^N\/A$/)).toBeVisible();

    // Paused: the banner names the data reason, and no numeric rank is shown.
    const banner = page.getByText(/^Ranking paused: /);
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("unlinked payment");
    const rankCells = board.locator("li > button > span.tabular.w-5");
    await expect(rankCells).toHaveCount(0);
    await expect(board.getByLabel("Provisional").first()).toBeVisible();

    // Reps cannot fix the data from here (owner-only link).
    await expect(page.getByRole("link", { name: "Fix in Business" })).toHaveCount(0);

    // Show ranks anyway: descriptive, numbered.
    const toggle = page.getByRole("switch", { name: "Show ranks anyway" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(rankCells.first()).toBeVisible();
    await expect(rankCells.first()).toHaveText(/^\d+$/);
    await expect(board.getByText("descriptive").first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Season" })).toContainText(/#\d+/);
  });

  test("a row opens to its funnel and a correction request", async ({ page }) => {
    await page.goto("/team");
    const row = page.getByRole("list", { name: "Board" }).getByRole("listitem").filter({ hasText: "Renata Solís" });
    await row.getByRole("button", { name: /Renata Solís/ }).click();
    await expect(row.getByText("Matured")).toBeVisible();
    await row.getByRole("button", { name: "Request correction" }).click();
    await expect(row.getByText("Sent for review")).toBeVisible();
  });

  test("Me shows Level and one coaching card", async ({ page }) => {
    await page.goto("/me");
    await expect(page.getByText(/^Level \d+$/).first()).toBeVisible();
    await expect(page.locator('[aria-label^="Level "]').first()).toBeVisible();
    await expect(page.getByText(/XP to next|Max level/)).toBeVisible();
    // One coaching card with a proposed recommendation and a metric.
    const coaching = page.locator("article, section").filter({ hasText: /Proposed|Accepted|Why/ }).first();
    await expect(coaching).toBeVisible();
    await expect(page.getByText("Per attended appointment")).toBeVisible();
    await expect(page.getByRole("button", { name: "Playbook" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Not you?" })).toBeVisible();
    // Reps never see owner-only rows.
    await expect(page.getByRole("link", { name: "Connect" })).toHaveCount(0);
  });

  test("Not you? signs out to Who are you", async ({ page }) => {
    await page.goto("/me");
    await page.getByRole("button", { name: "Not you?" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Who are you" })).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem("sos-session"))).toBeNull();
  });
});
