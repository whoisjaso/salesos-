import { test, expect, PEOPLE, closeSheet, tabLabels } from "./fixtures";

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
    // The rank cell sits in the row regardless of how the avatar and button are nested.
    const rankCells = board.locator("li span.tabular.w-5");
    await expect(rankCells).toHaveCount(0);
    await expect(board.getByLabel("Provisional").first()).toBeVisible();

    // Reps cannot fix the data from here (owner-only link).
    await expect(page.getByRole("link", { name: "Fix in Business" })).toHaveCount(0);

    // Show ranks anyway: descriptive, numbered, labelled as such on every row and on my season chip.
    const toggle = page.getByRole("switch", { name: "Show ranks anyway" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(rankCells.first()).toBeVisible();
    await expect(rankCells.first()).toHaveText(/^\d+$/);
    expect(await rankCells.count()).toBe(await board.getByRole("listitem").count());
    await expect(board.getByText("descriptive").first()).toBeVisible();
    await expect(me).toContainText("descriptive");
    await expect(page.getByRole("region", { name: "Season" })).toContainText(/#\d+/);
    await expect(page.getByRole("region", { name: "Season" })).toContainText("descriptive");
    // Note: once ranks show, every row has a rank, so the paused banner (and its switch) unmounts.
    // Reps cannot flip it back without a reload; see report.
  });

  test("owner sees the same paused board with a Fix in Business link", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript((s) => window.localStorage.setItem("sos-session", JSON.stringify(s)), PEOPLE.owner);
    const page = await ctx.newPage();
    await page.goto("/team");
    await expect(page.getByRole("region", { name: "Season" })).toContainText("Team,");
    await expect(page.getByText(/^Ranking paused: /)).toContainText("unlinked payment");
    await expect(page.getByRole("link", { name: "Fix in Business" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("radio", { name: "Missions" })).toHaveCount(0);
    await ctx.close();
  });

  test("a row opens to its funnel and a correction request", async ({ page }) => {
    await page.goto("/team");
    const row = page.getByRole("list", { name: "Board" }).getByRole("listitem").filter({ hasText: "Renata Solís" });
    await row.getByRole("button", { name: /Renata Solís/ }).click();
    await expect(row.getByText("Matured", { exact: true })).toBeVisible();
    await expect(row.getByText(/^\d+ of \d+$/)).toBeVisible();
    await row.getByRole("button", { name: "Request correction" }).click();
    await expect(row.getByText("Sent for review")).toBeVisible();
  });

  test("Pairs segment lists pair cards with a chosen-by tag; a card opens the pair sheet with the handoff", async ({ page }) => {
    await page.goto("/team");
    await page.getByRole("radio", { name: "Pairs" }).click();
    await expect(page.getByRole("radio", { name: "Pairs" })).toHaveAttribute("aria-checked", "true");
    // Pairs are a separate board: the individual role switch is gone.
    await expect(page.getByRole("radiogroup", { name: "Role" })).toHaveCount(0);

    const pairs = page.getByRole("list", { name: "Pairs" });
    const cards = pairs.getByRole("listitem");
    const first = cards.first();
    await expect(first).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
    await expect(first.getByText(/^(Owner|Closer|Setter) picked$/)).toBeVisible();
    await expect(first.getByText("Net collected cash")).toBeVisible();
    await expect(first.getByRole("img", { name: /^Pair bar: / })).toBeAttached();

    // Renata's own pair: she sees her commission line, never the setter's.
    const mine = cards.filter({ hasText: "Priya and Renata" });
    await expect(mine).toHaveCount(1);
    await mine.getByRole("button", { name: /open pair$/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Handoff", { exact: true })).toBeVisible();
    await expect(sheet.getByText(/^Accepted \d+ of \d+$/)).toBeVisible();
    await expect(sheet.getByRole("region", { name: "Setter side" })).toBeVisible();
    await expect(sheet.getByRole("region", { name: "Closer side" })).toBeVisible();
    await expect(sheet.getByText(/^Closer commission/)).toBeVisible();
    await expect(sheet.getByText(/^Setter commission/)).toHaveCount(0);
    await closeSheet(page);
  });

  test("Me shows Level and one coaching card", async ({ page }) => {
    await page.goto("/me");
    await expect(page.getByRole("heading", { level: 2, name: "Renata Solís" })).toBeVisible();
    await expect(page.getByText(/Level \d+/).first()).toBeVisible();
    await expect(page.getByRole("progressbar", { name: /^Level \d+, \d+% to next$/ })).toBeVisible();
    await expect(page.getByText(/XP to next|Max level/)).toBeVisible();
    await expect(page.getByText("Per opportunity")).toBeVisible();
    // Exactly one coaching card: a proposal with Why and Premise is wrong.
    await expect(page.getByText("Proposed", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Why", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Premise is wrong" })).toHaveCount(1);
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
