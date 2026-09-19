import { describe, expect, it } from "vitest";
import { NOW, obaviaDataset, obaviaDatasetWithPairs, obaviaPairs } from "@/fixtures/obavia";
import { buildStandings, ownStanding } from "@/domain/leaderboard";
import { pairDiagnostic, pairFunnel } from "@/domain/pairs";
import type { Assignment } from "@/domain/types";
import {
  attendedRead,
  descriptivePolicy,
  pairResponsibilities,
  rowMoneyRead,
  seasonPolicy,
  standingsLines,
} from "@/lib/team-data";

const roster = () => buildStandings(obaviaDataset, "comparable_performance", seasonPolicy(NOW), NOW);
const ranked = () => buildStandings(obaviaDataset, "comparable_performance", descriptivePolicy(NOW), NOW);

describe("standingsLines", () => {
  it("says the list is a roster, states the order, and names what ranking waits on and who owns it", () => {
    const lines = standingsLines(roster());
    expect(lines.kind).toBe("roster");
    expect(lines.kindLabel).toBe("Roster, not a ranking");
    expect(lines.orderLine).toBe("Roster in alphabetical order, not a ranking.");
    expect(lines.holdLabel).toBe("Ranking on hold");
    expect(lines.holdLine).toMatch(/^Ranking waits until /);
    expect(lines.holdLine).toContain("unlinked payment");
    expect(lines.holdLine).toContain("Finance owns that.");
  });

  it("says the list is ranked, and marks the descriptive override as not a standing", () => {
    const lines = standingsLines(ranked(), true);
    expect(lines.kind).toBe("ranked");
    expect(lines.kindLabel).toBe("Ranked, descriptive only");
    expect(lines.orderLine).toMatch(/^Ranked by net collected cash per assigned opportunity/);
    expect(lines.holdLine).toBeNull();
  });

  it("produces no rank number anywhere in a roster", () => {
    expect(roster().rows.every((r) => r.rank === null)).toBe(true);
  });
});

describe("money and attendance reads", () => {
  it("reads a verified zero and a missing figure as different facts", () => {
    const held = roster().rows;
    const clear = ranked().rows;
    const marcusHeld = held.find((r) => r.displayName === "Marcus Ellery");
    const marcusClear = clear.find((r) => r.displayName === "Marcus Ellery");
    expect(rowMoneyRead(marcusHeld!)).toEqual({ kind: "unavailable", text: "Payment data not available", provisional: false });
    expect(rowMoneyRead(marcusClear!)).toEqual({ kind: "verified_zero", text: "$0 collected", provisional: false });
  });

  it("reads an amount with a provisional mark while the basis is held", () => {
    const renata = roster().rows.find((r) => r.displayName === "Renata Solís")!;
    const read = rowMoneyRead(renata);
    expect(read.kind).toBe("amount");
    expect(read.provisional).toBe(true);
    expect(read.text).toMatch(/^\$[\d,]+\.\d{2}$/);
  });

  it("never states a false exact attended count", () => {
    const rows = roster().rows;
    const held = rows.find((r) => r.attendedState === "at_least")!;
    expect(attendedRead(held)).toBe(`At least ${held.attendedAppointments} attended, ${held.unresolvedAttendanceCount} outcomes unresolved`);
    const verified = rows.find((r) => r.attendedState !== "at_least")!;
    expect(attendedRead(verified)).toBe(`${verified.attendedAppointments} attended`);
  });
});

describe("a rep's own standing and the board agree", () => {
  it("agrees in the roster case: no rank on either, same statement", () => {
    const standings = roster();
    const own = ownStanding(standings, "usr_setter_tomasz", "setter");
    const boardRow = standings.rows.find((r) => r.userId === "usr_setter_tomasz" && r.role === "setter")!;
    expect(own.kind).toBe("roster");
    expect(own.rank).toBeNull();
    expect(boardRow.rank).toBeNull();
    expect(own.row).toBe(boardRow);
    expect(own.statement).toBe(standings.heldBy!.statement);
  });

  it("agrees in the ranked case: the personal number is the row's own rank", () => {
    const standings = ranked();
    const own = ownStanding(standings, "usr_setter_tomasz", "setter");
    const boardRow = standings.rows.find((r) => r.userId === "usr_setter_tomasz" && r.role === "setter")!;
    expect(own.kind).toBe("ranked");
    expect(own.rank).toBe(boardRow.rank);
    expect(own.rank).not.toBeNull();
    expect(own.statement).toContain(`Rank ${boardRow.rank}`);
  });

  it("agrees for every rep on the board, in both cases", () => {
    for (const standings of [roster(), ranked()]) {
      for (const row of standings.rows) {
        const own = ownStanding(standings, row.userId, row.role);
        expect(own.rank).toBe(row.rank);
        expect(own.kind).toBe(standings.kind);
      }
    }
  });
});

describe("pairResponsibilities", () => {
  const pairs = obaviaPairs;
  const build = (pairId: string, dataset = obaviaDatasetWithPairs) => {
    const pair = pairs.find((p) => p.pairId === pairId)!;
    return pairResponsibilities(dataset, pair, pairFunnel(dataset, pairs, pairId, {}, NOW), pairDiagnostic(dataset, pairs, pairId, NOW), NOW);
  };

  it("says nothing rather than inventing a state when nothing specific is true", () => {
    expect(build("pair_priya_renata").headline).toBeNull();
  });

  it("names the side, the stage and the gap in words instead of an adjective", () => {
    const headline = build("pair_tomasz_marcus").headline;
    expect(headline).toBe("Setter side, Retained: 25 points under the pooled pair rate");
    expect(headline).not.toContain("Behind");
  });

  it("names a waiting handoff by its hours, against the pair's own acceptance record", () => {
    const dataset = {
      ...obaviaDatasetWithPairs,
      assignments: obaviaDatasetWithPairs.assignments.map((a): Assignment => {
        const carried = obaviaDatasetWithPairs.opportunities.find((o) => o.opportunityId === a.opportunityId);
        if (a.role !== "closer" || carried?.pairId !== "pair_priya_renata") return a;
        const { acceptedAt: _accepted, ...rest } = a;
        void _accepted;
        return { ...rest, decidedAt: "2026-09-17T12:00:00Z" };
      }),
    };
    const answer = build("pair_priya_renata", dataset);
    expect(answer.waiting.length).toBeGreaterThan(0);
    expect(answer.headline).toMatch(/^Handoff waiting 32 hours on /);
    expect(answer.next.closer.action).toMatch(/^Accept the handoff on \d+ opportunit(y|ies), oldest waiting 32 hours\.$/);
  });

  it("answers what the two are responsible for together, with every denominator in words", () => {
    const answer = build("pair_tomasz_marcus");
    expect(answer.shared.map((s) => s.label)).toEqual(["Handoff", "Attended", "Rated qualified"]);
    expect(answer.shared[0].value).toMatch(/^Accepted \d+ of \d+$/);
    expect(answer.shared[1].value).toContain("retained bookings");
    expect(answer.shared[2].value).toContain("attended shows");
  });

  it("gives each person one next action naming the thing and its count", () => {
    const answer = build("pair_tomasz_marcus");
    expect(answer.next.setter.side).toBe("setter");
    expect(answer.next.closer.side).toBe("closer");
    expect(answer.next.setter.action).toBe("Record the agenda and confirmation on 3 bookings that have not retained.");
    expect(answer.next.closer.action).toMatch(/\.$/);
    for (const action of [answer.next.setter.action, answer.next.closer.action]) {
      expect(action).not.toContain("—");
    }
  });
});
