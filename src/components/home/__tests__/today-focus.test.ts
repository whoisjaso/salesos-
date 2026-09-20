import { describe, expect, it } from "vitest";
import {
  REVIEWED_WINDOW_HOURS,
  buildTodayFocus,
  latestReviewedCallId,
  nextImprovement,
  todayCounts,
} from "@/components/home/today-focus";
import { coachingPlan } from "@/domain/coaching";
import { obaviaDataset, NOW } from "@/fixtures/obavia";
import { transcripts } from "@/fixtures/calls";

const SETTER = "usr_setter_tomasz";
const CLOSER = "usr_closer_marcus";

describe("Today secondary area: which state the data supports", () => {
  it("leads with today's progress when no call has been reviewed inside the window", () => {
    const focus = buildTodayFocus(obaviaDataset, SETTER, "setter", NOW);
    expect(focus.kind).toBe("progress");
    expect(latestReviewedCallId(SETTER, "setter", NOW)).toBeUndefined();
  });

  it("leads with the improvement once a call has been reviewed, and never with a held one", () => {
    const focus = buildTodayFocus(obaviaDataset, SETTER, "setter", NOW, { reviewedCallId: "call_016" });
    expect(focus.kind).toBe("improvement");
    if (focus.kind !== "improvement") return;
    // Every metric recommendation for this rep is waiting on payment data. What stands is
    // read from the conversation, which waits on nothing, and it is this very call.
    const plan = coachingPlan(obaviaDataset, SETTER, NOW, { transcripts });
    expect(plan.standing[0].held).toBeUndefined();
    expect(plan.standing[0].evidenceRefs).toContain("call_016");
    expect(plan.held.length).toBeGreaterThan(0);
    expect(focus.improvement.sentence).not.toMatch(/waiting on data/i);
    expect(focus.improvement.sentence).toBe("Name it back in their words before the next step, and ask what would settle it.");
    expect(focus.improvement.label).toBe("An objection was left open");
  });

  it("never puts another conversation's words over this call's transcript link", () => {
    // What stands for this setter was read from call_016; the reviewed call is a different
    // one, so the improvement is that call's own angle and the link stays honest.
    const standing = coachingPlan(obaviaDataset, SETTER, NOW, { transcripts }).standing[0];
    expect(standing.evidenceRefs).toContain("call_016");
    const improvement = nextImprovement(obaviaDataset, SETTER, "setter", NOW, "call_089c");
    expect(improvement?.label).toBe("A partner decides with them");
    expect(improvement?.sentence).toBe("Ask what that person needs to see, and offer to bring it to the next call.");
    expect(improvement?.href).toMatch(/^\/review\?call=call_089c&span=\d+$/);
  });

  it("links to the exact transcript moment, not to a search", () => {
    const improvement = nextImprovement(obaviaDataset, SETTER, "setter", NOW, "call_016");
    expect(improvement?.href).toBe("/review?call=call_016&span=52800");
    expect(improvement?.at).toBe("0:52");
    expect(improvement?.source).toBe("Read from your call with Desmond Castellano");
  });

  it("a call reviewed longer ago than the window does not take the area", () => {
    // call_089c ended more than half a day before NOW.
    expect(latestReviewedCallId(SETTER, "setter", NOW, REVIEWED_WINDOW_HOURS)).toBeUndefined();
    expect(latestReviewedCallId(SETTER, "setter", NOW, 48)).toBe("call_089c");
  });

  it("carries at most one held note, naming what it waits on and who owns it", () => {
    const focus = buildTodayFocus(obaviaDataset, SETTER, "setter", NOW);
    expect(focus.held?.ownerLabel).toBe("Finance");
    expect(focus.held?.waitingOn).toMatch(/unlinked payment/);
    expect(focus.held?.action).toBe("verify payment mapping");
  });
});

describe("Today secondary area: verified counts only", () => {
  it("states what each count counts, with its period", () => {
    const counts = todayCounts(obaviaDataset, SETTER, "setter", NOW);
    const conversations = counts.find((c) => c.id === "conversations");
    expect(conversations).toBeDefined();
    expect(conversations?.value).toBe(0);
    expect(conversations?.word).toBe("conversations");
    expect(conversations?.counts).toBe("two-way and confirmed, from 2 calls today");
  });

  it("leaves out a count whose evidence does not exist today instead of printing a zero", () => {
    const counts = todayCounts(obaviaDataset, SETTER, "setter", NOW);
    // This setter has no appointment on today's calendar, so no booking or attendance count is invented.
    expect(counts.map((c) => c.id)).toEqual(["conversations"]);
  });

  it("says at least when unresolved attendance bounds the figure", () => {
    const counts = todayCounts(obaviaDataset, CLOSER, "closer", NOW);
    const attended = counts.find((c) => c.id === "attended");
    expect(attended?.atLeast).toBe(true);
    expect(attended?.counts).toMatch(/still without attendance evidence/);
    const bookings = counts.find((c) => c.id === "bookings");
    expect(bookings?.value).toBe(1);
    expect(bookings?.atLeast).toBe(false);
  });

  it("counts work finished in this session too, because that is today by definition", () => {
    const counts = todayCounts(obaviaDataset, SETTER, "setter", NOW, { conversations: 1, calls: 1, bookings: 1 });
    const conversations = counts.find((c) => c.id === "conversations");
    expect(conversations?.value).toBe(1);
    expect(conversations?.word).toBe("conversation");
    expect(conversations?.counts).toBe("two-way and confirmed, from 3 calls today");
    expect(counts.find((c) => c.id === "bookings")?.value).toBe(1);
  });

  it("is a pure function of the dataset, the person and the injected clock", () => {
    const a = buildTodayFocus(obaviaDataset, SETTER, "setter", NOW);
    const b = buildTodayFocus(obaviaDataset, SETTER, "setter", NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
