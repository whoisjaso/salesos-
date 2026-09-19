import type { Browser, BrowserContext, Page } from "@playwright/test";
import { test, expect, tabLabels } from "./fixtures";

/**
 * Onboarding from zero (docs/ONBOARDING.md). The pilot keeps every record in
 * localStorage ("sos-onboarding"), so a second browser context stands in for a
 * second phone by receiving a copy of that store, minus the first person's identity.
 */
const STORE_KEY = "sos-onboarding";
const OWNER_EMAIL = "ada@lumen.co";
const SETTER_EMAIL = "sam@lumen.co";
const BUSINESS = "Lumen Solar";

/** The one refusal line. Next's route announcer is also role=alert, so match the paragraph. */
function refusal(page: Page) {
  return page.locator('p[role="alert"]');
}

async function signInByWorkEmail(page: Page, email: string) {
  await page.getByRole("button", { name: "Continue with work email" }).click();
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("button", { name: "Open link" }).click();
}

async function signInByGoogle(page: Page, email: string) {
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.getByLabel("Google account").fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

/** ProfileSetup: photo skipped, the name as typed, the rest default. */
async function finishProfile(page: Page, name: string) {
  await expect(page.getByRole("heading", { level: 1, name: "Photo" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Name" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "How I sell" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Color" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
}

/** Owner path: work email link, create the business, brand, own profile, land on Business. */
async function createBusiness(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Who are you" })).toBeVisible();
  await signInByWorkEmail(page, OWNER_EMAIL);
  await expect(page.getByText("No business yet")).toBeVisible();
  await page.getByRole("button", { name: "Create a business" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Business" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Step 1 of 2" })).toBeVisible();
  await page.getByLabel("Business name").fill(BUSINESS);
  await page.getByLabel("Timezone").selectOption("America/Chicago");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Brand" })).toBeVisible();
  await page.getByRole("radio", { name: "Teal" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await finishProfile(page, "Ada Lumen");
  await expect(page).toHaveURL(/\/$/);
  expect(await tabLabels(page)).toEqual(["Business", "Team", "Me"]);
}

/**
 * A context of its own. The shared `page` fixture clears "sos-session" on every
 * navigation when `person` is null, which would sign these journeys out mid-way.
 */
async function newPhone(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  return { ctx, page: await ctx.newPage() };
}

/** Copy the shared store into a fresh context, as if a second phone hit the same backend. */
async function secondPhone(browser: Browser, from: Page, mutate?: (store: Record<string, unknown>) => void): Promise<{ ctx: BrowserContext; page: Page }> {
  const raw = await from.evaluate((k) => window.localStorage.getItem(k), STORE_KEY);
  const store = JSON.parse(raw ?? "{}") as Record<string, unknown>;
  store.identity = null;
  mutate?.(store);
  const ctx = await browser.newContext({ viewport: from.viewportSize() ?? undefined, reducedMotion: "reduce" });
  await ctx.addInitScript(
    ({ k, v }) => {
      // Seed once; later navigations keep what this phone wrote.
      if (!window.localStorage.getItem(k)) window.localStorage.setItem(k, v);
    },
    { k: STORE_KEY, v: JSON.stringify(store) },
  );
  return { ctx, page: await ctx.newPage() };
}

/** The second phone's writes reach the first, as a shared backend would. */
async function syncBack(from: Page, to: Page) {
  const theirs = await from.evaluate((k) => window.localStorage.getItem(k), STORE_KEY);
  await to.evaluate(
    ({ k, v }) => {
      const mine = JSON.parse(window.localStorage.getItem(k) ?? "{}");
      const next = { ...JSON.parse(v ?? "{}"), identity: mine.identity ?? null };
      window.localStorage.setItem(k, JSON.stringify(next));
    },
    { k: STORE_KEY, v: theirs },
  );
}

async function inviteByEmail(page: Page, email: string): Promise<string> {
  await page.goto("/team");
  await page.getByRole("button", { name: "Invite" }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { level: 2, name: "Invite" })).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "Email" })).toHaveAttribute("aria-checked", "true");
  await expect(sheet.getByRole("radio", { name: "Setter" })).toHaveAttribute("aria-checked", "true");
  await sheet.getByLabel("Work email").fill(email);
  await sheet.getByRole("button", { name: "Send" }).click();
  await expect(sheet.getByText(`Invite sent to ${email}`)).toBeVisible();
  const link = (await sheet.getByLabel("Invite link").innerText()).trim();
  expect(link).toMatch(/\/join\?token=[0-9a-f]{32}$/);
  await sheet.getByRole("button", { name: "Copy link" }).click();
  await expect(sheet.getByRole("button", { name: "Copied" })).toBeVisible();
  // Pending, with a way to take it back.
  const pending = sheet.getByRole("region", { name: "Pending invites" });
  await expect(pending.getByText(email)).toBeVisible();
  await expect(pending.getByRole("button", { name: `Revoke invite for ${email}` })).toBeVisible();
  return link;
}

test.describe("Onboarding from zero", () => {
  test.use({ person: null });

  test("sign-in offers Google, work email, phone, join a team, and the demo team", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Who are you" })).toBeVisible();
    for (const name of ["Continue with Google", "Continue with work email", "Continue with phone", "Join a team"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    await expect(page.getByText("Demo team")).toBeVisible();
    await expect(page.getByRole("list", { name: "Demo team" }).getByRole("button")).toHaveCount(6);
    await expect(page.locator("nav")).toHaveCount(0);

    // Email validation is one calm line, not a color.
    await page.getByRole("button", { name: "Continue with work email" }).click();
    await page.getByLabel("Work email").fill("not-an-email");
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(refusal(page)).toHaveText("Enter a work email address");
  });

  test("owner: work email link, create a business, land on empty Business with the checklist", async ({ browser }) => {
    const { ctx, page } = await newPhone(browser);
    await createBusiness(page);

    // The shell carries the new business, not the demo tenant.
    await expect(page.locator("header").getByText(BUSINESS)).toBeVisible();

    // Checklist: six rows, Business profile done, Connect a source next.
    const checklist = page.getByRole("region", { name: "Getting started" });
    await expect(checklist).toBeVisible();
    await expect(checklist.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "17");
    const steps = checklist.getByRole("list", { name: "Steps" }).getByRole("listitem");
    await expect(steps).toHaveCount(6);
    await expect(steps).toHaveText([/Business profile/, /Connect a source/, /Invite your team/, /First lead/, /First appointment/, /First cash/]);
    await expect(steps.nth(0)).toContainText("Done");
    await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
    await expect(steps.nth(1)).toContainText("Next");
    await expect(checklist.getByRole("link", { name: /Connect a source/ })).toHaveAttribute("href", "/connect");

    // Honest hero: no leads, zero sources, one action, the other two ways as rows. No funnel bar, no fake money.
    const hero = page.getByRole("region", { name: "No leads yet" });
    await expect(hero.getByRole("heading", { level: 2, name: "No leads yet" })).toBeVisible();
    await expect(hero.getByText("0 sources connected")).toBeVisible();
    await expect(hero.getByRole("link", { name: "Connect a source" })).toHaveAttribute("href", "/connect");
    await expect(hero.getByRole("link", { name: "Import history" })).toHaveAttribute("href", "/import");
    await expect(hero.getByRole("link", { name: "Invite team" })).toHaveAttribute("href", "/team");
    await expect(page.getByRole("button", { name: /^Net collected cash per assigned opportunity/ })).toHaveCount(0);
    await expect(page.getByRole("list", { name: /^Funnel stages/ })).toHaveCount(0);

    // Team: no reps, roster with the owner, Invite in the header.
    await page.goto("/team");
    await expect(page.getByRole("heading", { level: 3, name: "No reps yet" })).toBeVisible();
    await expect(page.getByText("0 pending invites", { exact: false })).toBeVisible();
    const roster = page.getByRole("region", { name: "Roster" });
    await expect(roster.getByText("Ada Lumen")).toBeVisible();
    await expect(roster.getByText("Owner")).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();

    // Me: coaching is honest about the threshold.
    await page.goto("/me");
    await expect(page.getByRole("heading", { level: 3, name: "Nothing to coach yet, 25 opportunities needed" })).toBeVisible();

    // Reload keeps the per-business session.
    await page.reload();
    await expect(page.locator("header").getByText(BUSINESS)).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("sos-session") ?? "null"));
    expect(stored).toMatchObject({ role: "owner" });
    expect(typeof stored.tenantId).toBe("string");
    await ctx.close();
  });

  test("owner invites a setter by email; the setter joins as a Google identity and lands on an empty Today", async ({ browser }) => {
    const owner = await newPhone(browser);
    const page = owner.page;
    await createBusiness(page);
    const link = await inviteByEmail(page, SETTER_EMAIL);

    const { ctx, page: rep } = await secondPhone(browser, page);
    try {
      await rep.goto(link);
      await expect(rep.getByRole("heading", { level: 1, name: "Join a team" })).toBeVisible();
      await expect(rep.getByText(BUSINESS)).toBeVisible();
      await expect(rep.getByText("Setter, invite open")).toBeVisible();
      await expect(rep.getByText("Sign in first")).toBeVisible();

      await signInByGoogle(rep, SETTER_EMAIL);
      await expect(rep.getByText(`Signed in as`)).toBeVisible();
      await rep.getByRole("button", { name: "Join" }).click();

      await finishProfile(rep, "Sam Okoro");
      await expect(rep).toHaveURL(/\/$/);
      expect(await tabLabels(rep)).toEqual(["Today", "Team", "Me"]);
      await expect(rep.locator("header").getByText(BUSINESS)).toBeVisible();

      // Empty Today: the share link and two ways to the first lead.
      const today = rep.getByRole("region", { name: "Waiting for your first lead" });
      await expect(today.getByRole("heading", { level: 2, name: "Waiting for your first lead" })).toBeVisible();
      await expect(today.getByLabel("Share link")).toContainText("/add?source=src_share_link");
      await today.getByRole("button", { name: "Copy link" }).click();
      await expect(today.getByRole("button", { name: "Copied" })).toBeVisible();
      await expect(rep.getByText("Queue clear")).toHaveCount(0);

      // Add a lead by hand: a LeadSubmission and an Opportunity, and the hero refreshes.
      await today.getByRole("button", { name: "Add a lead by hand" }).click();
      const sheet = rep.getByRole("dialog");
      await sheet.getByLabel("Name").fill("Jordan Reyes");
      await sheet.getByLabel("Phone").fill("(512) 555-0142");
      await sheet.getByLabel("Note").fill("Saw the truck, wants a quote");
      await sheet.getByRole("button", { name: "Add lead" }).click();
      await expect(rep.getByRole("dialog")).toHaveCount(0);
      const first = rep.getByRole("region", { name: "First lead" });
      await expect(first.getByRole("heading", { level: 2, name: "Jordan Reyes" })).toBeVisible();
      await expect(first.getByText("Saw the truck, wants a quote")).toBeVisible();
      await expect(rep.getByTestId("dock")).toHaveText("Call");
      await expect(rep.getByTestId("dock")).toHaveAttribute("href", "tel:+15125550142");
      const store = await rep.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? "{}"), STORE_KEY);
      expect(store.leads).toHaveLength(1);
      expect(store.leads[0].submission.source).toBe("manual");
      expect(store.leads[0].opportunity.commercialStatus).toBe("open");

      // Me on day one: $0 hero, level 1, still the cash components.
      await rep.goto("/me");
      await expect(rep.getByText("Level 1")).toBeVisible();
      await expect(rep.getByText(/^\$0(\.00)?$/).first()).toBeVisible();
      await expect(rep.getByRole("heading", { level: 3, name: "Nothing to coach yet, 25 opportunities needed" })).toBeVisible();

      // Team for a rep: roster only, no ranks, no board, no Invite.
      await rep.goto("/team");
      await expect(rep.getByRole("region", { name: "Roster" }).getByText("Sam Okoro")).toBeVisible();
      await expect(rep.getByRole("list", { name: "Board" })).toHaveCount(0);
      await expect(rep.getByRole("region", { name: "Season" })).toHaveCount(0);
      await expect(rep.getByRole("button", { name: "Invite" })).toHaveCount(0);
    } finally {
      await ctx.close();
      await owner.ctx.close();
    }
  });

  test("team code: shown large with a QR and an expiry, then a rep joins by phone", async ({ browser }) => {
    const owner = await newPhone(browser);
    const page = owner.page;
    await createBusiness(page);
    await page.goto("/team");
    await page.getByRole("button", { name: "Invite" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("radio", { name: "Team code" }).click();
    await sheet.getByRole("radio", { name: "Closer" }).click();
    await sheet.getByRole("button", { name: "Make a code" }).click();

    const code = sheet.getByLabel(/^Team code /);
    await expect(code).toBeVisible();
    const token = (await code.innerText()).trim();
    expect(token).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    await expect(sheet.getByText(/^Expires in \d+h \d{2}m \d{2}s$/)).toBeVisible();
    await expect(sheet.getByText("Closer", { exact: true }).first()).toBeVisible();
    await sheet.getByRole("button", { name: "Show QR" }).click();
    await expect(sheet.getByRole("img", { name: `QR for team code ${token}` })).toBeVisible();

    // Regenerate revokes the old code.
    await sheet.getByRole("button", { name: "Regenerate" }).click();
    const next = (await sheet.getByLabel(/^Team code /).innerText()).trim();
    expect(next).not.toBe(token);

    const { ctx, page: rep } = await secondPhone(browser, page);
    try {
      await rep.goto("/");
      await rep.getByRole("button", { name: "Join a team" }).click();
      await expect(rep.getByRole("heading", { level: 1, name: "Join a team" })).toBeVisible();
      await rep.getByRole("button", { name: "Continue with phone" }).click();
      await rep.getByLabel("Phone").fill("+15551234567");
      await rep.getByRole("button", { name: "Send code" }).click();
      await expect(rep.getByLabel(/^Code sent to/)).toHaveValue("246810");
      await rep.getByRole("button", { name: "Verify" }).click();

      // The old code is refused; the fresh one works.
      await rep.getByLabel("Team code").fill(token.toLowerCase());
      await rep.getByRole("button", { name: "Join" }).click();
      await expect(refusal(rep)).toHaveText("That invite was revoked. Ask for a new one");
      await rep.getByLabel("Team code").fill(next);
      await rep.getByRole("button", { name: "Join" }).click();

      await finishProfile(rep, "Kai Brandt");
      await expect(rep).toHaveURL(/\/$/);
      expect(await tabLabels(rep)).toEqual(["Today", "Team", "Me"]);
      await expect(rep.getByRole("heading", { level: 3, name: "No appointments yet" })).toBeVisible();
      await expect(rep.getByTestId("dock")).toBeDisabled();
      await syncBack(rep, page);
    } finally {
      await ctx.close();
    }

    // Back on the owner's phone, the closer is on the roster.
    await page.reload();
    await page.goto("/team");
    await expect(page.getByRole("heading", { level: 3, name: "No reps yet" })).toHaveCount(0);
    const roster = page.getByRole("region", { name: "Roster" });
    await expect(roster.getByText("+15551234567")).toBeVisible();
    await expect(roster.getByText("Closer", { exact: true })).toBeVisible();

    // The owner can remove; history stays.
    await roster.getByRole("button", { name: "Options, +15551234567" }).click();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(roster.getByText("Removed", { exact: true })).toBeVisible();
    const store = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? "{}"), STORE_KEY);
    const removed = store.memberships.find((m: { role: string }) => m.role === "closer");
    expect(removed.active).toBe(false);
    expect(typeof removed.removedAt).toBe("string");
    expect(store.users.some((u: { displayName: string }) => u.displayName === "+15551234567")).toBe(true);
    await owner.ctx.close();
  });

  test("an expired invite and a wrong address are each refused in one line", async ({ browser }) => {
    const owner = await newPhone(browser);
    const page = owner.page;
    await createBusiness(page);
    const link = await inviteByEmail(page, SETTER_EMAIL);

    const expired = await secondPhone(browser, page, (store) => {
      for (const inv of store.invites as { expiresAt: string }[]) inv.expiresAt = "2020-01-01T00:00:00Z";
    });
    try {
      await expired.page.goto(link);
      await expect(expired.page.getByText("Setter, invite expired")).toBeVisible();
      await signInByGoogle(expired.page, SETTER_EMAIL);
      await expired.page.getByRole("button", { name: "Join" }).click();
      await expect(refusal(expired.page)).toHaveText("That invite expired. Ask for a new one");
      await expect(expired.page.getByRole("heading", { level: 1, name: "Photo" })).toHaveCount(0);
    } finally {
      await expired.ctx.close();
    }

    const wrong = await secondPhone(browser, page);
    try {
      await wrong.page.goto(link);
      await signInByGoogle(wrong.page, "someone.else@gmail.com");
      await wrong.page.getByRole("button", { name: "Join" }).click();
      await expect(refusal(wrong.page)).toHaveText(`That invite is for ${SETTER_EMAIL}. Sign in with that address`);
    } finally {
      await wrong.ctx.close();
    }

    // Revoked on the owner's side.
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: `Revoke invite for ${SETTER_EMAIL}` }).click();
    await expect(sheet.getByRole("region", { name: "Pending invites" })).toHaveCount(0);
    await owner.ctx.close();
  });

  test("/start deep link asks for identity, then creates a business", async ({ page }) => {
    await page.goto("/start");
    await expect(page.getByRole("heading", { level: 1, name: "Create a business" })).toBeVisible();
    await signInByWorkEmail(page, "maya@northwind.co");
    await expect(page.getByRole("heading", { level: 1, name: "Business" })).toBeVisible();
    await expect(page.getByLabel("Business name")).toHaveValue("");
  });

  test("the demo team still signs in the fixture people", async ({ browser }) => {
    const { ctx, page } = await newPhone(browser);
    await page.goto("/");
    await page.getByRole("list", { name: "Demo team" }).getByRole("button", { name: /Delphine Okafor/ }).click();
    await expect(page.getByRole("list", { name: "Step 1 of 5" })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    expect(await tabLabels(page)).toEqual(["Business", "Team", "Me"]);
    await expect(page.getByRole("button", { name: /^Net collected cash per assigned opportunity/ })).toBeVisible();
    // The demo owner has the same Invite control on Team.
    await page.goto("/team");
    await page.getByRole("button", { name: "Invite" }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { level: 2, name: "Invite" })).toBeVisible();
    await expect(sheet.getByRole("region", { name: "Roster" }).getByText("Tomasz Wierzbicki")).toBeVisible();
    await expect(sheet.getByLabel("Partner, optional")).toBeEnabled();
    await ctx.close();
  });
});
