import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync("/opt/pw-browsers")) process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/pw-browsers";
const OUT = "/tmp/claude-0/-home-user-salesos-/296a40de-0ecf-5406-87b3-a68dad63e69b/scratchpad/shots/v5";
const BASE = "http://localhost:3911";
const STORE = "sos-onboarding";
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
const settle = (page) => page.waitForTimeout(500);

const browser = await chromium.launch();
const mk = async (init) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce", colorScheme: "dark" });
  if (init) await ctx.addInitScript(init.fn, init.arg);
  return { ctx, page: await ctx.newPage() };
};

// 1. sign-in
const owner = await mk();
const p = owner.page;
await p.goto(`${BASE}/`);
await p.getByRole("heading", { level: 1, name: "Who are you" }).waitFor();
await settle(p);
await shot(p, "onboarding-signin");

// 2. create business
await p.getByRole("button", { name: "Continue with work email" }).click();
await p.getByLabel("Work email").fill("ada@lumen.co");
await p.getByRole("button", { name: "Send link" }).click();
await p.getByRole("button", { name: "Open link" }).click();
await p.getByRole("button", { name: "Create a business" }).click();
await p.getByLabel("Business name").fill("Lumen Solar");
await p.getByLabel("Timezone").selectOption("America/Chicago");
await settle(p);
await shot(p, "onboarding-create-business");
await p.getByRole("button", { name: "Create" }).click();
await p.getByRole("radio", { name: "Teal" }).click();
await p.getByRole("button", { name: "Next" }).click();
await p.getByRole("button", { name: "Skip for now" }).click();
await p.getByLabel("Name", { exact: true }).fill("Ada Lumen");
await p.getByRole("button", { name: "Next" }).click();
await p.getByRole("button", { name: "Next" }).click();
await p.getByRole("button", { name: "Done" }).click();

// 3. owner empty Business
await p.getByRole("region", { name: "Getting started" }).waitFor();
await settle(p);
await shot(p, "onboarding-owner-empty");

// 4. invite sheet, email
await p.goto(`${BASE}/team`);
await p.getByRole("button", { name: "Invite" }).first().click();
const sheet = p.getByRole("dialog");
await sheet.getByLabel("Work email").fill("sam@lumen.co");
await sheet.getByRole("button", { name: "Send" }).click();
await sheet.getByText("Invite sent to sam@lumen.co").waitFor();
const link = (await sheet.getByLabel("Invite link").innerText()).trim();
await settle(p);
await shot(p, "onboarding-invite");

// 5. team code
await sheet.getByRole("radio", { name: "Team code" }).click();
await sheet.getByRole("button", { name: "Make a code" }).click();
await sheet.getByRole("button", { name: "Show QR" }).click();
await sheet.getByRole("img", { name: /QR for team code/ }).waitFor();
await settle(p);
await shot(p, "onboarding-teamcode");

// 6. join, second phone
const raw = await p.evaluate((k) => window.localStorage.getItem(k), STORE);
const store = JSON.parse(raw ?? "{}");
store.identity = null;
const rep = await mk({ fn: ({ k, v }) => { if (!window.localStorage.getItem(k)) window.localStorage.setItem(k, v); }, arg: { k: STORE, v: JSON.stringify(store) } });
const r = rep.page;
await r.goto(link);
await r.getByRole("heading", { level: 1, name: "Join a team" }).waitFor();
await settle(r);
await shot(r, "onboarding-join");

// 7. setter empty Today
await r.getByRole("button", { name: "Continue with Google" }).click();
await r.getByLabel("Google account").fill("sam@lumen.co");
await r.getByRole("button", { name: "Continue", exact: true }).click();
await r.getByRole("button", { name: "Join" }).click();
await r.getByRole("button", { name: "Skip for now" }).click();
await r.getByLabel("Name", { exact: true }).fill("Sam Okoro");
await r.getByRole("button", { name: "Next" }).click();
await r.getByRole("button", { name: "Next" }).click();
await r.getByRole("button", { name: "Done" }).click();
await r.getByRole("region", { name: "Waiting for your first lead" }).waitFor();
await settle(r);
await shot(r, "onboarding-setter-empty");

await browser.close();
console.log("ok");
