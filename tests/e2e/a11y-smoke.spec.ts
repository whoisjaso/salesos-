import { test, expect, PEOPLE, type Person } from "./fixtures";
import type { Page } from "@playwright/test";

interface Home {
  label: string;
  person: Person | null;
  /** Locator string for the primary control on that home. */
  primary: string;
  primaryName?: RegExp;
}

const HOMES: Home[] = [
  { label: "sign-in", person: null, primary: "ul button", primaryName: /Delphine Okafor/ },
  { label: "setter", person: PEOPLE.setter, primary: '[data-testid="dock"]' },
  { label: "closer", person: PEOPLE.closerMarcus, primary: '[data-testid="dock"]' },
  { label: "owner", person: PEOPLE.owner, primary: 'button[aria-label^="Net collected per assigned opportunity"]' },
];

/** Tabs until `selector` owns focus, or gives up after `max` presses. */
async function tabTo(page: Page, selector: string, max = 40): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate((sel) => {
      const el = document.activeElement;
      return !!el && el.matches(sel);
    }, selector);
    if (focused) return true;
  }
  return false;
}

async function focusRing(page: Page): Promise<{ outlineStyle: string; outlineWidth: string; boxShadow: string; matchesFocusVisible: boolean }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return {
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      boxShadow: cs.boxShadow,
      matchesFocusVisible: el.matches(":focus-visible"),
    };
  });
}

async function imagesWithoutAlt(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("img"))
      .filter((img) => !img.hasAttribute("alt"))
      .map((img) => img.outerHTML.slice(0, 120)),
  );
}

for (const home of HOMES) {
  test.describe(`Keyboard: ${home.label}`, () => {
    test.use({ person: home.person });

    test("primary control is reachable by Tab and shows a visible focus ring", async ({ page }) => {
      await page.goto("/");
      const primary = page.locator(home.primary).filter(home.primaryName ? { hasText: home.primaryName } : {}).first();
      await expect(primary).toBeVisible();
      await expect(primary).toBeEnabled();

      const reached = await tabTo(page, home.primary);
      expect(reached, `Tab should reach ${home.primary} on the ${home.label} home`).toBe(true);
      await expect(primary).toBeFocused();

      const ring = await focusRing(page);
      expect(ring.matchesFocusVisible).toBe(true);
      const hasOutline = ring.outlineStyle !== "none" && ring.outlineWidth !== "0px";
      const hasShadow = ring.boxShadow !== "none";
      expect(hasOutline || hasShadow, `focus ring: ${JSON.stringify(ring)}`).toBe(true);

      // Enter activates it like a click would.
      if (home.person && home.person.role !== "owner") {
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("dock")).toHaveText(/End call|Reserving|Reply|Send|Next|Confirm/);
      }
    });

    test("every image has alt text", async ({ page }) => {
      await page.goto("/");
      expect(await imagesWithoutAlt(page)).toEqual([]);
      if (home.person) {
        for (const path of ["/team", "/me"]) {
          await page.goto(path);
          await expect(page.locator("main")).toBeVisible();
          expect(await imagesWithoutAlt(page), path).toEqual([]);
        }
      }
    });

    if (home.person) {
      test("tab bar links have accessible names and one current page", async ({ page }) => {
        await page.goto("/");
        const bar = page.locator('nav[aria-label="Primary"]:visible, nav[aria-label="Primary, compact"]:visible');
        await expect(bar).toBeVisible();
        const links = bar.getByRole("link");
        await expect(links).toHaveCount(3);
        for (const link of await links.all()) await expect(link).toHaveAccessibleName(/\S/);
        await expect(bar.locator('[aria-current="page"]')).toHaveCount(1);
        // Icons in the bar are decorative.
        await expect(bar.locator("svg:not([aria-hidden='true'])")).toHaveCount(0);
      });
    }
  });
}
