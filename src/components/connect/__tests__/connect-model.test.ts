/**
 * H8: a green "Live" dot with 24-hour and 7-day counts computed from fixture
 * timestamps asserts a feed that has never received anything, and a fixture
 * source has no permissions to have been granted.
 *
 * docs/PAYMENTS_AUDIT.md H8, AGENTS.md rule 9.
 */
import { describe, expect, it } from "vitest";
import { seedConnections, toneOf, isConnected, connectedCount, type Connection } from "../connect-model";

const seeded = seedConnections();

describe("seeded connections are fixture sources and say so", () => {
  it("seeds at least one source", () => {
    expect(connectedCount(seeded)).toBeGreaterThan(0);
  });

  it("marks every seeded connection synthetic", () => {
    for (const c of Object.values(seeded)) expect(c.synthetic).toBe(true);
  });

  it("never reads as Live, however recent the fixture timestamps are", () => {
    for (const c of Object.values(seeded)) {
      expect(toneOf(c)).toBe("fixture");
      expect(toneOf(c)).not.toBe("live");
    }
  });

  it("records no granted permission, because no provider granted one", () => {
    for (const c of Object.values(seeded)) {
      expect(c.conn.grantedPermissions).toEqual([]);
    }
  });
});

describe("provenance outranks health", () => {
  const base = Object.values(seeded)[0];

  it("a synthetic connection is fixture even when it would otherwise be paused", () => {
    const paused: Connection = { ...base, conn: { ...base.conn, status: "paused" } };
    expect(toneOf(paused)).toBe("fixture");
  });

  it("a real connection still reports live, quiet and paused", () => {
    const real: Connection = { ...base, synthetic: false, health: undefined };
    expect(toneOf({ ...real, conn: { ...real.conn, lastEventAt: "2026-09-19T12:00:00.000Z" } }, "2026-09-19T14:00:00.000Z")).toBe("live");
    expect(toneOf({ ...real, conn: { ...real.conn, lastEventAt: "2026-09-10T12:00:00.000Z" } }, "2026-09-19T14:00:00.000Z")).toBe("stale");
    expect(toneOf({ ...real, conn: { ...real.conn, lastEventAt: undefined } }, "2026-09-19T14:00:00.000Z")).toBe("stale");
    expect(toneOf({ ...real, conn: { ...real.conn, status: "paused" } }, "2026-09-19T14:00:00.000Z")).toBe("paused");
  });

  it("still counts a fixture source as connected, so the screen keeps its list", () => {
    expect(isConnected(base)).toBe(true);
  });
});
