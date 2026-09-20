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

    // End the call: one word, the stage bar, and the dock already set to the next step. No Confirm, no label, no box.
    await dock(page).click();
    const postcall = page.getByTestId("postcall");
    await expect(postcall.getByTestId("postcall-outcome")).toHaveText("Voicemail");
    await expect(page.getByText(/transcript decided/i)).toHaveCount(0);
    await expect(postcall.getByTestId("stage-strip")).toBeVisible();
    await expect(postcall.getByTestId("stage-segment")).toHaveCount(4);
    await expect(postcall.getByText("Next", { exact: true })).toHaveCount(0);
    // A reattempt simulates Voicemail: next step callback, preselected on the dock.
    await expect(dock(page)).toHaveText("Callback");
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Change", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Review" })).toBeVisible();

    // Flag an issue opens the alternatives: the rep corrects it to a real conversation so booking is possible.
    await page.getByTestId("wrong").click();
    const wrong = sheet(page, "Flag an issue");
    await expect(wrong).toBeVisible();
    const outcomes = wrong.getByRole("radiogroup", { name: "Outcome" });
    await expect(outcomes.getByRole("radio")).toHaveCount(4);
    await outcomes.getByRole("radio", { name: "Meaningful interaction" }).click();
    await expect(outcomes.getByRole("radio", { name: "Meaningful interaction" })).toHaveAttribute("aria-checked", "true");
    await expect(wrong.getByRole("radiogroup", { name: "Next step" }).getByRole("radio", { name: "Book" })).toHaveAttribute("aria-checked", "true");
    await closeSheet(page);
    await expect(postcall.getByTestId("postcall-outcome")).toHaveText("Meaningful");

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

    // Handoff opens on the problem in their words and the two actions. No provenance tag on the first view.
    await page.getByRole("button", { name: "Handoff brief" }).click();
    const handoff = sheet(page, "Handoff");
    await expect(handoff).toBeVisible();
    await expect(handoff).toContainText("Desmond");
    await expect(handoff.getByText(/^(Customer-stated|Verified|AI-proposed)$/)).toHaveCount(0);

    // Details carries provenance on every line.
    await handoff.getByTestId("handoff-details-row").click();
    const details = sheet(page, "Details");
    await expect(details).toBeVisible();
    await expect(details.getByRole("heading", { name: "Problem, their words" })).toBeVisible();
    await expect(details.getByText("Customer-stated").first()).toBeVisible();
    await expect(details.getByText("Verified").first()).toBeVisible();
    // Every line in every section carries exactly one provenance tag.
    const provenanceSections = details.locator("section").filter({ hasNot: page.getByRole("heading", { name: "Missing", exact: true }) });
    for (const line of await provenanceSections.locator("ul > li").all()) {
      await expect(line.locator("span").filter({ hasText: /^(Customer-stated|Verified|AI-proposed)$/ })).toHaveCount(1);
    }
    // AI-proposed appears only where the model actually proposed something (a lens or an unconfirmed
    // observed preference). Desmond's profile has neither, so its absence is the correct output.
    const lens = details.getByText("Coaching lens (hypothesis)");
    if (await lens.count()) {
      await expect(details.getByText("AI-proposed").first()).toBeVisible();
    } else {
      await expect(details.getByText("AI-proposed")).toHaveCount(0);
    }
    await expect(details.getByRole("heading", { name: "Missing" })).toBeVisible();
    // The appointment just made is in the commitments.
    await expect(details.getByText(/^Appointment apt_new_\d+/)).toBeVisible();
    await details.getByRole("button", { name: "Close", exact: true }).click();
    await expect(details).toHaveCount(0);
    await handoff.getByRole("button", { name: "Send to closer" }).click();
    await expect(handoff.getByText("Sent to closer")).toBeVisible();
    await closeSheet(page);
    await expect(page.getByRole("button", { name: "Handoff sent" })).toBeVisible();
  });

  test("an opted-out contact is only ever under Stopped and cannot be called", async ({ page }) => {
    await page.goto("/");
    // Stopped is one row with a count; the names sit behind the tap.
    const row = page.getByTestId("stopped-row");
    await expect(row).toBeVisible();
    await expect(row).toHaveText(/Stopped\s*\d+/);
    await row.click();
    const stopped = sheet(page, "Stopped").getByRole("region", { name: "Stopped" });
    await expect(stopped).toBeVisible();
    const cormac = stopped.getByRole("listitem").filter({ hasText: "Cormac Ferreira" });
    await expect(cormac).toHaveCount(1);
    await expect(cormac).toContainText("Opted out, all channels");
    await expect(cormac.getByRole("button")).toHaveCount(0);
    await closeSheet(page);

    // Not in the queue, not in Next up, never the hero.
    await expect(page.getByRole("heading", { level: 2 }).first()).not.toContainText("Cormac");
    await expect(page.getByRole("region", { name: "Next up" }).getByRole("button", { name: /Cormac/ })).toHaveCount(0);
    await page.getByRole("tab", { name: /^Queue/ }).click();
    await expect(page.getByRole("region", { name: "Queue" }).getByRole("button", { name: /Cormac/ })).toHaveCount(0);
    await expect(page.getByTestId("stopped-row")).toBeVisible();
    await expect(page.getByRole("button", { name: /Cormac/ })).toHaveCount(0);
  });

  test("the hero is a name, one line and one action; the rest is behind Details and Today", async ({ page }) => {
    await page.goto("/");
    // No consent chips and no quote on the screen. Dials stay behind the Today row: the
    // strip under the list carries verified progress, not activity counts.
    await expect(page.locator("main").getByText(/SMS (unknown|revoked)/)).toHaveCount(0);
    await expect(page.locator("main").getByText("Dials", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Details" }).click();
    const details = sheet(page, "Details");
    await expect(details).toBeVisible();
    for (const label of ["Source", "Phone consent", "SMS consent"]) {
      await expect(details.getByText(label, { exact: true })).toBeVisible();
    }
    await closeSheet(page);

    const today = page.getByTestId("today-row");
    await expect(today).toHaveText(/Today\s*\d+ dials/);
    await today.click();
    const todaySheet = sheet(page, "Today");
    for (const label of ["Dials", "Two-way", "Booked"]) {
      await expect(todaySheet.getByText(label, { exact: true })).toBeVisible();
    }
    await closeSheet(page);
  });

  test("under the list, today's verified progress, and never a fake zero", async ({ page }) => {
    await page.goto("/");
    const strip = page.getByTestId("today-focus");
    await expect(strip).toHaveAttribute("data-focus", "progress");
    await expect(strip.getByText("Progress so far")).toBeVisible();

    // One count, because one stage has evidence today. Each states what it counts.
    const counts = strip.getByTestId("today-count");
    await expect(counts).toHaveCount(1);
    await expect(counts.first()).toContainText("conversations");
    await expect(counts.first()).toContainText("two-way and confirmed, from 2 calls today");
    // No booking or attendance count is invented for a day that has neither.
    await expect(strip.locator('[data-count="bookings"]')).toHaveCount(0);
    await expect(strip.locator('[data-count="attended"]')).toHaveCount(0);
    // Never a global pause. The one XP kind that waits is named, with its reason on tap.
    await expect(page.locator("main").getByText(/XP paused|Paused/)).toHaveCount(0);
    const gate = page.getByTestId("gate-line");
    if (await gate.count()) {
      await expect(gate).toHaveText(/XP on hold$/);
      await gate.click();
      const sheetEl = sheet(page, /XP on hold/);
      await expect(sheetEl.getByText("Lifts when")).toBeVisible();
      await expect(sheetEl.getByText("Who resolves it")).toBeVisible();
      await closeSheet(page);
    }
  });

  test("after a reviewed call the strip is the next improvement, linked to the moment", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: /^Queue/ }).click();
    await page.getByRole("region", { name: "Queue" }).getByRole("button", { name: /Desmond/ }).click();
    await dock(page).click();
    await expect(page.getByText(/^Connected/)).toBeVisible();
    await dock(page).click();

    const strip = page.getByTestId("today-focus");
    await expect(strip).toHaveAttribute("data-focus", "improvement");
    await expect(strip.getByTestId("improvement-label")).toHaveText("An objection was left open");
    await expect(strip.getByTestId("improvement-sentence")).toHaveText(/^Name it back in their words/);
    // One improvement, not a list, and never one that is waiting on data.
    await expect(strip.getByTestId("improvement-sentence")).toHaveCount(1);
    await expect(strip).not.toContainText("Waiting on data");

    const link = strip.getByTestId("improvement-link");
    await expect(link).toHaveAttribute("href", "/review?call=call_016&span=52800");
    await expect(link).toContainText("0:52");
    await link.click();
    await expect(page).toHaveURL(/\/review\?call=call_016&span=52800$/);
  });

  test("on a desktop the customer stands beside the call, never behind it", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Desktop layout only; the phone keeps the facts behind Details.");
    await page.goto("/");
    await page.getByRole("tab", { name: /^Queue/ }).click();
    await page.getByRole("region", { name: "Queue" }).getByRole("button", { name: /Desmond/ }).click();

    const context = page.getByRole("region", { name: "Who this is" });
    await expect(context).toBeVisible();
    await expect(context).toContainText("Desmond");
    await expect(context).toContainText("Source");

    // The queue stays beside the call too, and both survive the call going live.
    await expect(page.getByRole("region", { name: "Queue" })).toBeVisible();
    await dock(page).click();
    await expect(page.getByText(/^Connected/)).toBeVisible();
    await expect(context).toBeVisible();
    await expect(page.getByRole("region", { name: "Queue" })).toBeVisible();
    await expect(dock(page)).toBeInViewport();
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
