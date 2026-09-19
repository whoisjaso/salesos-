import { test, expect, PEOPLE, dock, sheet, closeSheet } from "./fixtures";

/**
 * Records every provider state the hero shows, in order, even when reducedMotion
 * collapses "Ringing" to a 40ms window that a polling expect could miss.
 */
async function watchProviderStates(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __providerStates: string[] }).__providerStates = seen;
    const scan = () => {
      const text = document.body.innerText;
      for (const s of ["Reserving", "Ringing", "Connected"]) {
        if (text.includes(s) && seen[seen.length - 1] !== s) seen.push(s);
      }
    };
    new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

test.describe("Setter: Tomasz", () => {
  test.use({ person: PEOPLE.setter });

  test("hero shows one contact and one primary action", async ({ page }) => {
    await page.goto("/");
    const hero = page.getByRole("heading", { level: 2 }).first();
    await expect(hero).toBeVisible();
    await expect(hero).toHaveText(/\S+ \S+/);
    await expect(dock(page)).toBeVisible();
    await expect(dock(page)).toHaveCount(1);
    await expect(dock(page)).toHaveText(/^(Call|Reply|Confirm appointment|Review|Send proposal|Collect payment|Handoff)/);

    // Segmented control offers Now and a counted Queue.
    await expect(page.getByRole("tab", { name: "Now" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: /^Queue \d+$/ })).toBeVisible();
  });

  test("lead to handoff: call Desmond, the transcript decides, book, brief", async ({ page }) => {
    await page.goto("/");

    // Pick the approved-reattempt row from the Queue.
    await page.getByRole("tab", { name: /^Queue/ }).click();
    const queue = page.getByRole("region", { name: "Queue" });
    const desmond = queue.getByRole("button", { name: /Desmond/ });
    await expect(desmond).toBeVisible();
    await expect(desmond).toContainText(/reattempt/i);
    await desmond.click();
    await expect(desmond).toHaveAttribute("aria-current", "true");

    const hero = page.getByRole("heading", { level: 2 }).first();
    await expect(hero).toContainText("Desmond");
    await expect(dock(page)).toHaveText("Call");

    // Dial through the provider: Reserving, Ringing, Connected.
    await watchProviderStates(page);
    await dock(page).click();
    // The provider line reads "Connected" next to a "Provider" badge in the same element.
    await expect(page.getByText(/^Connected/)).toBeVisible();
    await expect(page.getByText("Provider", { exact: true })).toBeVisible();
    await expect(dock(page)).toHaveText("End call");
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __providerStates: string[] }).__providerStates))
      .toEqual(["Reserving", "Ringing", "Connected"]);

    // End the call: the transcript decides and the dock is already the next step. No Confirm.
    await dock(page).click();
    const postcall = page.getByTestId("postcall");
    await expect(postcall).toContainText("Transcript decided");
    await expect(postcall.getByTestId("stage-strip")).toBeVisible();
    await expect(postcall.getByTestId("stage-segment")).toHaveCount(4);
    // A reattempt simulates Voicemail: next step callback, preselected on the dock.
    await expect(postcall.getByTestId("next-step")).toHaveText("Callback");
    await expect(dock(page)).toHaveText("Callback");
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Change", exact: true })).toHaveCount(0);

    // Wrong? opens the dispute: the rep corrects it to a real conversation so booking is possible.
    await postcall.getByTestId("wrong").click();
    const outcomes = page.getByRole("radiogroup", { name: "Outcome" });
    await expect(outcomes.getByRole("radio")).toHaveCount(4);
    await outcomes.getByRole("radio", { name: "Meaningful interaction" }).click();
    await expect(outcomes.getByRole("radio", { name: "Meaningful interaction" })).toHaveAttribute("aria-checked", "true");
    await expect(postcall.getByTestId("next-step")).toHaveText("Book");

    // Book: first slot, confirm.
    await expect(dock(page)).toHaveText("Book");
    await dock(page).click();
    const booking = sheet(page, "Book");
    await expect(booking).toBeVisible();
    await expect(booking.getByText(/^Slot, /)).toBeVisible();
    const slots = booking.getByRole("button", { name: /\d{1,2}:\d{2} (AM|PM)/ });
    await expect(slots.first()).toBeVisible();
    await slots.first().click();
    await expect(slots.first()).toHaveAttribute("aria-pressed", "true");
    await expect(booking.getByText("45 min")).toBeVisible();
    await booking.getByRole("button", { name: "Confirm" }).click();

    // Appointment confirmation: invitation sent is never customer confirmed.
    const booked = sheet(page, "Booked");
    await expect(booked).toBeVisible();
    await expect(booked.getByText(/^apt_new_\d+$/)).toBeVisible();
    await expect(booked.getByText("Invitation sent")).toBeVisible();
    const customerRow = booked.getByRole("listitem").filter({ hasText: "Customer confirmed" });
    await expect(customerRow).toContainText("Not yet");
    await booked.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await expect(page.getByText(/^Booked apt_new_\d+$/)).toBeVisible();
    await expect(page.getByText("Invitation sent")).toBeVisible();
    await expect(page.getByText("Customer confirmed: not yet")).toBeVisible();
    await expect(page.getByText("Customer confirmed", { exact: true })).toHaveCount(0);
    await expect(dock(page)).toHaveText("Next");

    // Handoff brief carries provenance on every line.
    await page.getByRole("button", { name: "Handoff brief" }).click();
    const handoff = sheet(page, "Handoff");
    await expect(handoff).toBeVisible();
    await expect(handoff).toContainText("Desmond");
    await expect(handoff.getByRole("heading", { name: "Problem, their words" })).toBeVisible();
    await expect(handoff.getByText("Customer-stated").first()).toBeVisible();
    await expect(handoff.getByText("Verified").first()).toBeVisible();
    // Every line in every section carries exactly one provenance tag.
    const provenanceSections = handoff.locator("section").filter({ hasNot: page.getByRole("heading", { name: "Missing", exact: true }) });
    for (const line of await provenanceSections.locator("ul > li").all()) {
      await expect(line.locator("span").filter({ hasText: /^(Customer-stated|Verified|AI-proposed)$/ })).toHaveCount(1);
    }
    // AI-proposed appears only where the model actually proposed something (a lens or an unconfirmed
    // observed preference). Desmond's profile has neither, so its absence is the correct output.
    const lens = handoff.getByText("Coaching lens (hypothesis)");
    if (await lens.count()) {
      await lens.click();
      await expect(handoff.getByText("AI-proposed").first()).toBeVisible();
    } else {
      await expect(handoff.getByText("AI-proposed")).toHaveCount(0);
    }
    await expect(handoff.getByRole("heading", { name: "Missing" })).toBeVisible();
    // The appointment just made is in the commitments.
    await expect(handoff.getByText(/^Appointment apt_new_\d+/)).toBeVisible();
    await handoff.getByRole("button", { name: "Send to closer" }).click();
    await expect(handoff.getByText("Sent to closer")).toBeVisible();
    await closeSheet(page);
    await expect(page.getByRole("button", { name: "Handoff sent" })).toBeVisible();
  });

  test("an opted-out contact is only ever under Stopped and cannot be called", async ({ page }) => {
    await page.goto("/");
    const stopped = page.getByRole("region", { name: "Stopped" });
    await expect(stopped).toBeVisible();
    const cormac = stopped.getByRole("listitem").filter({ hasText: "Cormac Ferreira" });
    await expect(cormac).toHaveCount(1);
    await expect(cormac).toContainText("Opted out, all channels");
    await expect(cormac.getByRole("button")).toHaveCount(0);

    // Not in the queue, not in Next up, never the hero.
    await expect(page.getByRole("heading", { level: 2 }).first()).not.toContainText("Cormac");
    await expect(page.locator('[aria-label="Next up"]').getByRole("button", { name: /Cormac/ })).toHaveCount(0);
    await page.getByRole("tab", { name: /^Queue/ }).click();
    await expect(page.getByRole("region", { name: "Queue" }).getByRole("button", { name: /Cormac/ })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Stopped" }).getByRole("listitem").filter({ hasText: "Cormac Ferreira" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Cormac/ })).toHaveCount(0);
  });

  test("the hero never swaps under a live call", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: /^Queue/ }).click();
    await page.getByRole("region", { name: "Queue" }).getByRole("button", { name: /Desmond/ }).click();
    await dock(page).click();
    await expect(page.getByText(/^Connected/)).toBeVisible();
    const other = page.getByRole("region", { name: "Queue" }).getByRole("button").filter({ hasNotText: "Desmond" }).first();
    const otherName = await other.innerText();
    await other.click();
    // Still Desmond, still connected, still one End call.
    await expect(page.getByText(/^Connected/)).toBeVisible();
    await expect(page.locator("main").getByText("Desmond", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Queue" }).getByRole("button", { name: /Desmond/ })).toHaveAttribute("aria-current", "true");
    expect(otherName).not.toContain("Desmond");
    await expect(dock(page)).toHaveText("End call");
  });
});
