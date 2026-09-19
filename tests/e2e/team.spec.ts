import { test, expect, PEOPLE, closeSheet, tabLabels } from "./fixtures";

test.describe("Team and Me: Renata", () => {
  test.use({ person: PEOPLE.closerRenata });

  test("season hero is the ring, the month, and one number; XP and rules live in its sheet", async ({ page }) => {
    await page.goto("/team");
    const season = page.getByRole("region", { name: "Season" });
    await expect(season).toBeVisible();
    await expect(season.getByText("September", { exact: true })).toBeVisible();
    await expect(season.getByText(/^\d+ days left$/)).toBeVisible();
    await expect(season.locator('[aria-label^="Level "]')).toHaveCount(1);
    // Nothing else on the hero: XP, streak, chips are behind the tap.
    await expect(season.getByText(/XP/)).toHaveCount(0);
    await expect(season.getByText("Provisional")).toHaveCount(0);
    await season.getByRole("button", { name: /open details$/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { level: 2, name: "September 2026" })).toBeVisible();
    await expect(sheet.getByText(/^L\d+$/)).toBeVisible();
    await expect(sheet.getByText(/[\d,]+ XP/).first()).toBeVisible();
    await expect(sheet.getByText("Provisional", { exact: false })).toBeVisible();
    await expect(sheet.getByText("Rules", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Guardrails", { exact: true })).toBeVisible();
    await closeSheet(page);
    expect(await tabLabels(page)).toEqual(["Today", "Team", "Me"]);
  });

  test("board rows are avatar, name, one number; ranks are paused until data is fixed", async ({ page }) => {
    await page.goto("/team");
    await expect(page.getByRole("radio", { name: "Board" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: "Closers" })).toHaveAttribute("aria-checked", "true");

    const board = page.getByRole("list", { name: "Board" });
    const me = board.getByRole("listitem").filter({ hasText: "Renata Solís" });
    await expect(me).toHaveCount(1);
    await expect(me.getByText(/^\$[\d,]+\.\d{2}$|^N\/A$/)).toBeVisible();
    // No chip, no T1 badge, no hourglass on the row: the basis label appears once above the list.
    await expect(me).not.toContainText("Net collected cash");
    await expect(me).not.toContainText(/T\d/);
    await expect(board.getByLabel("Provisional")).toHaveCount(0);
    await expect(page.getByText("Net collected cash, per lead")).toBeVisible();

    // Paused: one line under the hero, no numeric rank on the rows, and no fix link for a rep.
    const pausedRow = page.getByTestId("ranks-paused");
    await expect(pausedRow).toContainText("Ranks paused");
    await expect(page.getByText(/^Ranking paused: /)).toHaveCount(0);
    const rankCells = board.locator("li span.tabular.w-5");
    await expect(rankCells).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Fix in Business" })).toHaveCount(0);

    // The ranks sheet names the data reason and holds the descriptive override.
    await pausedRow.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(/^Ranking paused: /)).toContainText("unlinked payment");
    await expect(sheet.getByRole("link", { name: "Fix in Business" })).toHaveCount(0);
    const toggle = sheet.getByRole("switch", { name: "Show ranks anyway" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await closeSheet(page);

    // Descriptive ranks: numbered rows, the line says so, and my season sheet carries my rank.
    await expect(rankCells.first()).toBeVisible();
    await expect(rankCells.first()).toHaveText(/^\d+$/);
    expect(await rankCells.count()).toBe(await board.getByRole("listitem").filter({ has: page.locator("[data-avatar]") }).count());
    await expect(pausedRow).toContainText("Shown anyway");
    await expect(page.getByRole("region", { name: "Season" })).toContainText(/#\d+/);
    await page.getByRole("region", { name: "Season" }).getByRole("button", { name: /open details$/ }).click();
    await expect(page.getByRole("dialog")).toContainText(/#\d+, descriptive/);
    await closeSheet(page);

    // The source-sheet comparison is one row at the end of the list.
    await board.getByRole("button", { name: "Compare to source sheet" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { level: 2, name: "Source sheet" })).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Reported per lead").first()).toBeVisible();
    await closeSheet(page);
  });

  test("owner sees the same paused board with a Fix in Business link in the ranks sheet", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript((s) => window.localStorage.setItem("sos-session", JSON.stringify(s)), PEOPLE.owner);
    const page = await ctx.newPage();
    await page.goto("/team");
    const season = page.getByRole("region", { name: "Season" });
    await expect(season.getByRole("progressbar", { name: /^Team level \d+/ })).toBeVisible();
    await expect(season.getByRole("button", { name: "Invite" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Missions" })).toHaveCount(0);
    await page.getByTestId("ranks-paused").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(/^Ranking paused: /)).toContainText("unlinked payment");
    await expect(sheet.getByRole("link", { name: "Fix in Business" })).toHaveAttribute("href", "/");
    await ctx.close();
  });

  test("a row opens a sheet with its funnel and a correction request", async ({ page }) => {
    await page.goto("/team");
    const row = page.getByRole("list", { name: "Board" }).getByRole("listitem").filter({ hasText: "Renata Solís" });
    await expect(row.getByText("Matured", { exact: true })).toHaveCount(0);
    await row.getByRole("button", { name: /Renata Solís/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { level: 2, name: "Renata Solís" })).toBeVisible();
    await expect(sheet.getByText("Matured", { exact: true })).toBeVisible();
    await expect(sheet.getByText(/^\d+ of \d+$/)).toBeVisible();
    await expect(sheet.getByRole("list", { name: "Funnel with denominators" })).toBeVisible();
    await expect(sheet.getByText("Tier", { exact: true })).toBeVisible();
    await sheet.getByRole("button", { name: "Request correction" }).click();
    await expect(sheet.getByText("Sent for review")).toBeVisible();
    await closeSheet(page);
  });

  test("Stages and Missions are one list each; a row opens its sheet", async ({ page }) => {
    await page.goto("/team");
    await page.getByRole("radio", { name: "Stages" }).click();
    const stages = page.getByRole("list", { name: "Stages" });
    await expect(stages.getByRole("listitem")).toHaveCount(6);
    await expect(stages.getByText("Contact", { exact: true })).toBeVisible();
    await expect(page.getByText(/Within tier/)).toHaveCount(0);
    await stages.getByRole("listitem").first().getByRole("button").click();
    await expect(page.getByRole("dialog").getByText("Counted", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(/Within tier/);
    await closeSheet(page);

    await page.getByRole("radio", { name: "Missions" }).click();
    const missions = page.getByRole("list", { name: "Missions" });
    await expect(missions.getByRole("listitem").first()).toBeVisible();
    await expect(missions.getByText(/^\d+ of \d+$/).first()).toBeVisible();
    await expect(page.getByText(/^Proof: /)).toHaveCount(0);
    await missions.getByRole("listitem").first().getByRole("button").click();
    await expect(page.getByRole("dialog").getByText("Proof", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Evidence", { exact: true })).toBeVisible();
    await closeSheet(page);
    await missions.getByRole("button", { name: /^Skill paths/ }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { level: 2, name: "Skill paths" })).toBeVisible();
    await closeSheet(page);
    await missions.getByRole("button", { name: /^Milestone/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Hide milestone" }).click();
    await expect(page.getByRole("dialog").getByText("Milestone hidden")).toBeVisible();
    await closeSheet(page);
    await expect(missions.getByRole("button", { name: /^Milestone/ })).toContainText("Hidden");
  });

  test("Pairs segment lists pair rows with one number; a row opens the pair sheet with the handoff", async ({ page }) => {
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
    // The chosen-by tag, the basis chip, and the pair bar are in the sheet, not on the row.
    await expect(first.getByText(/^(Owner|Closer|Setter) picked$/)).toHaveCount(0);
    await expect(first.getByText("Net collected cash")).toHaveCount(0);
    await expect(first.getByRole("img", { name: /^Pair bar: / })).toHaveCount(0);
    await expect(first.getByText(/^\$[\d,]+\.\d{2}$|^N\/A$/)).toBeVisible();

    // Renata's own pair: she sees her commission line, never the setter's.
    const mine = cards.filter({ hasText: "Priya and Renata" });
    await expect(mine).toHaveCount(1);
    await mine.getByRole("button", { name: /open pair$/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(/(Owner|Closer|Setter) picked/)).toBeVisible();
    await expect(sheet.getByRole("img", { name: /^Pair bar: / })).toBeAttached();
    await expect(sheet.locator(".chip", { hasText: "Net collected cash" })).toBeVisible();
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
    // First view: identity row, money hero, one group of rows. Level, streak, coaching and
    // the commission split are all behind a tap.
    await expect(page.getByRole("button", { name: /^Renata Solís/ })).toBeVisible();
    const hero = page.getByRole("region", { name: "Commission, September" });
    await expect(hero).toBeVisible();
    // Money words for the money: the period, the figure, and the status of that money.
    // The tier name never labels the dollar figure, and the tier line says what a tier is.
    await expect(hero.getByText("September", { exact: true })).toBeVisible();
    await expect(hero.getByText("Payable commission, not yet paid")).toBeVisible();
    await expect(hero.getByText(/^Cash tier\. Next: Stacks$/)).toBeVisible();
    await expect(hero.getByText("Tiers are display only and never change pay")).toBeVisible();
    // Provisional says so where the figure is read, in words, with what it waits on.
    await expect(hero.getByText(/^Provisional until .+\.$/)).toBeVisible();
    // The action names where it goes. "Collect more" named nothing.
    await expect(hero.getByRole("link", { name: "Open today's appointments" })).toBeVisible();
    await expect(page.getByText("Collect more")).toHaveCount(0);
    const rows = page.getByRole("region", { name: "Details" });
    await expect(rows.getByRole("button", { name: /Level/ })).toBeVisible();
    await expect(page.getByText(/XP to next|Max level/)).toHaveCount(0);
    await expect(page.getByText("Hypothetical policy")).toHaveCount(0);
    await expect(page.getByText("Proposed", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);

    // The Level row is the rep's own verified progress, never a global pause.
    await expect(rows.getByRole("button", { name: /Level/ })).not.toContainText("Paused");

    // Level row opens the level ring, XP to next, the streak, and any hold named by its track.
    await rows.getByRole("button", { name: /Level/ }).click();
    const level = page.getByRole("dialog");
    await expect(level.getByRole("heading", { level: 2, name: "Renata Solís" })).toBeVisible();
    await expect(level.getByText(/^(Commercial|Practice|Team) XP partly on hold$/)).toBeVisible();
    await expect(level.getByText(/Level \d+/).first()).toBeVisible();
    await expect(level.getByRole("progressbar", { name: /^Level \d+, \d+% to next$/ })).toBeVisible();
    await expect(level.getByText(/XP to next|Max level/)).toBeVisible();
    await expect(level.getByText(/day streak|No streak/)).toBeVisible();
    await closeSheet(page);

    // The money hero opens Details: every figure with its period, the denominator in full
    // words, every tier threshold, per opportunity and the cash ledger.
    await hero.getByRole("button", { name: /Open details$/ }).click();
    const money = page.getByRole("dialog");
    await expect(money.getByRole("heading", { level: 2, name: "September commission" })).toBeVisible();
    await expect(money.getByText("Accrued", { exact: true })).toBeVisible();
    await expect(money.getByText("Eligible", { exact: true })).toBeVisible();
    await expect(money.getByText("Paid", { exact: true })).toBeVisible();
    await expect(money.getByText("Per attended appointment", { exact: true })).toBeVisible();
    await expect(money.getByText(/September, \$[\d,.]+ over \d+ attended appointments/)).toBeVisible();
    await expect(money.getByText("Hypothetical policy").first()).toBeVisible();
    await expect(money.getByRole("region", { name: "Tier thresholds" })).toBeVisible();
    await expect(money.getByText("Cash (yours now)")).toBeVisible();
    await expect(money.getByText("Net collected cash per assigned opportunity, September", { exact: false })).toBeVisible();
    await expect(money.getByText("Per opportunity")).toBeVisible();
    await expect(money.getByText("Cash collected", { exact: true })).toBeVisible();
    await closeSheet(page);

    // Coach row opens exactly one coaching card: a proposal with Why and Premise is wrong.
    await rows.getByRole("button", { name: /^Coach/ }).click();
    const coach = page.getByRole("dialog");
    await expect(coach.getByText("Proposed", { exact: true })).toHaveCount(1);
    await expect(coach.getByRole("button", { name: "Why", exact: true })).toHaveCount(1);
    await expect(coach.getByRole("button", { name: "Premise is wrong" })).toHaveCount(1);
    await closeSheet(page);

    // Partner and Race rows open their own sheets.
    await rows.getByRole("button", { name: /^Partner/ }).click();
    await expect(page.getByRole("dialog").getByRole("img", { name: /^Pair bar/ })).toBeVisible();
    await closeSheet(page);
    await rows.getByRole("button", { name: /^Race/ }).click();
    await expect(page.getByRole("dialog").getByRole("list", { name: "Ranked by net collected cash" })).toBeVisible();
    await closeSheet(page);

    await expect(rows.getByRole("button", { name: "Playbook" })).toBeVisible();
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
