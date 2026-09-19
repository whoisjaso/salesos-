import { test as base, expect, type Locator, type Page } from "@playwright/test";

/** Mirrors `Session` in src/lib/session.tsx and the ids in src/fixtures/obavia.ts. */
export interface Person {
  userId: string;
  role: "setter" | "closer" | "owner";
  displayName: string;
}

export const PEOPLE = {
  setter: { userId: "usr_setter_tomasz", role: "setter", displayName: "Tomasz Wierzbicki" },
  closerMarcus: { userId: "usr_closer_marcus", role: "closer", displayName: "Marcus Ellery" },
  closerRenata: { userId: "usr_closer_renata", role: "closer", displayName: "Renata Solís" },
  owner: { userId: "usr_owner_delphine", role: "owner", displayName: "Delphine Okafor" },
} as const satisfies Record<string, Person>;

export const SESSION_KEY = "sos-session";

/**
 * `person` is a per-describe option. The page fixture seeds localStorage through
 * addInitScript so the session exists before the app's first render.
 */
export const test = base.extend<{ person: Person | null }>({
  person: [null, { option: true }],
  page: async ({ page, person }, use) => {
    await page.addInitScript(
      ({ key, session }) => {
        try {
          if (session) window.localStorage.setItem(key, JSON.stringify(session));
          else window.localStorage.removeItem(key);
        } catch {
          /* storage unavailable in this context */
        }
      },
      { key: SESSION_KEY, session: person },
    );
    await use(page);
  },
});

export { expect };

/** The visible tab bar: bottom bar on phones, left rail on desktop. */
export function tabBar(page: Page): Locator {
  return page.locator('nav[aria-label="Primary"]:visible, nav[aria-label="Primary, compact"]:visible');
}

export async function tabLabels(page: Page): Promise<string[]> {
  const bar = tabBar(page);
  await expect(bar).toBeVisible();
  return bar.getByRole("link").allInnerTexts().then((t) => t.map((s) => s.trim()));
}

/** The one primary control on a rep home (SetterWorkspace / CloserWorkspace dock). */
export function dock(page: Page): Locator {
  return page.getByTestId("dock");
}

/** Open sheet (src/components/ui/Sheet.tsx renders role="dialog" aria-modal). */
export function sheet(page: Page, title?: string | RegExp): Locator {
  const dialog = page.getByRole("dialog");
  return title ? dialog.filter({ has: page.getByRole("heading", { name: title, level: 2 }) }) : dialog;
}

export async function closeSheet(page: Page): Promise<void> {
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
