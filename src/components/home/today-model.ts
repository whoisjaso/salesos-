/**
 * Everything the Today screen needs, precomputed on the server for each person
 * who can sign in (setters, closers, owner) as plain serializable data.
 * `now` is injected; nothing here reads the clock.
 */
import type { Dataset } from "@/domain/metrics";
import { computeFunnel, computeMetric, ledgerFor, netCollected } from "@/domain/metrics";
import { deriveGameEvents, levelFor, playerState, streakDays, XP_TABLE, type GameEvent, type LevelState } from "@/domain/game";
import { seasonFor } from "@/domain/gamification";
import type { FunnelConnector, FunnelStage, ISODateTime, Id, PerformanceState, RevenueBasis } from "@/domain/types";

export type PersonaRole = "setter" | "closer" | "owner";

export interface StageSegment {
  stageId: string;
  /** One short word. */
  label: string;
  count: number;
  /** Verdict of the rate leading into this stage. Drives the segment hue. */
  state: PerformanceState;
}

export interface RecentWin {
  kind: GameEvent["kind"];
  label: string;
  xp: number;
  occurredAt: ISODateTime;
  evidenceRef: string;
}

export interface TeamMember {
  userId: Id;
  displayName: string;
  initials: string;
  role: "setter" | "closer";
  level: number;
}

export interface TodayModel {
  userId: Id;
  displayName: string;
  firstName: string;
  role: PersonaRole;
  /** Commercial track for reps; pooled team track for the owner. */
  track: LevelState;
  streakDays: number;
  xpPaused: boolean;
  action: { label: string; href: string };
  number: {
    /** Minor units per opportunity. null when nothing is assigned. */
    perOpportunityMinor: number | null;
    currency: string;
    basis: RevenueBasis;
    opportunities: number;
    complete: boolean;
  };
  segments: StageSegment[];
  funnel: { stages: FunnelStage[]; connectors: FunnelConnector[] };
  wins: RecentWin[];
}

export interface TodayData {
  now: ISODateTime;
  season: { label: string; daysLeft: number; from: ISODateTime; to: ISODateTime };
  personas: TodayModel[];
  team: TeamMember[];
}

const SEGMENT_LABELS: Record<string, string> = {
  two_way_contact: "Contact",
  retained_booking: "Booked",
  attended: "Show",
  perceived_qualified: "Fit",
  won: "Won",
  net_collected_cash: "Cash",
};

export const SEGMENT_ORDER = ["two_way_contact", "retained_booking", "attended", "perceived_qualified", "won", "net_collected_cash"];

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function segmentsFrom(funnel: { stages: FunnelStage[]; connectors: FunnelConnector[] }): StageSegment[] {
  return SEGMENT_ORDER.map((stageId) => {
    const stage = funnel.stages.find((s) => s.stageId === stageId);
    const into = funnel.connectors.find((c) => c.toStageId === stageId);
    return {
      stageId,
      label: SEGMENT_LABELS[stageId] ?? stageId,
      count: stage?.count ?? 0,
      state: into?.verdict.state ?? "neutral_no_benchmark",
    };
  });
}

function winsFrom(events: GameEvent[]): RecentWin[] {
  return events.slice(0, 5).map((e) => ({
    kind: e.kind,
    label: XP_TABLE[e.kind].label,
    xp: XP_TABLE[e.kind].xp,
    occurredAt: e.occurredAt,
    evidenceRef: e.evidenceRef,
  }));
}

export function buildTodayData(dataset: Dataset, now: ISODateTime): TodayData {
  const season = seasonFor(now, dataset.tenant.timezone);
  const window = { from: season.startsAt, to: season.endsAt };
  const monthLabel = new Date(season.startsAt).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const daysLeft = Math.max(0, Math.floor((Date.parse(season.endsAt) - Date.parse(now)) / 86_400_000));
  const currency = dataset.tenant.reportingCurrency;
  const allEvents = deriveGameEvents(dataset).filter((e) => e.occurredAt <= now);

  const reps = dataset.users.filter((u) => u.active && (u.roles.includes("setter") || u.roles.includes("closer")));
  const owner = dataset.users.find((u) => u.roles.includes("owner"));

  const personas: TodayModel[] = [];
  const team: TeamMember[] = [];

  for (const u of reps) {
    const role: "setter" | "closer" = u.roles.includes("closer") ? "closer" : "setter";
    const player = playerState(dataset, u.userId, now, window);
    const owned = dataset.opportunities.filter(
      (o) => o.currentOwner[role] === u.userId && o.accountabilityStartedAt >= window.from && o.accountabilityStartedAt < window.to,
    );
    const net = netCollected(ledgerFor(dataset, new Set(owned.map((o) => o.opportunityId))), currency);
    const funnel = computeFunnel(dataset, { userId: u.userId, role, ...window }, now);

    team.push({ userId: u.userId, displayName: u.displayName, initials: initialsOf(u.displayName), role, level: player.commercial.level });
    personas.push({
      userId: u.userId,
      displayName: u.displayName,
      firstName: u.displayName.split(" ")[0]!,
      role,
      track: player.commercial,
      streakDays: player.streakDays,
      xpPaused: player.gate.paused,
      action: { label: "Next action", href: role === "closer" ? "/closer" : "/setter" },
      number: {
        perOpportunityMinor: owned.length === 0 ? null : net.amountMinor / owned.length,
        currency,
        basis: "net_collected_cash",
        opportunities: owned.length,
        complete: true,
      },
      segments: segmentsFrom(funnel),
      funnel: { stages: funnel.stages, connectors: funnel.connectors },
      wins: winsFrom(player.recent),
    });
  }

  if (owner) {
    const repIds = new Set(reps.map((r) => r.userId));
    const teamEvents = allEvents.filter((e) => repIds.has(e.userId) && e.occurredAt >= window.from && e.occurredAt < window.to);
    const teamXp = teamEvents.filter((e) => XP_TABLE[e.kind].track === "commercial").reduce((acc, e) => acc + XP_TABLE[e.kind].xp, 0);
    const m16 = computeMetric("M16", dataset, {}, now);
    const funnel = computeFunnel(dataset, {}, now);
    personas.push({
      userId: owner.userId,
      displayName: owner.displayName,
      firstName: "Owner",
      role: "owner",
      track: levelFor(teamXp),
      streakDays: streakDays(allEvents.filter((e) => repIds.has(e.userId)), now),
      xpPaused: false,
      action: { label: "Fix this first", href: "/owner" },
      number: {
        perOpportunityMinor: m16.value,
        currency: m16.currency ?? currency,
        basis: m16.basis ?? "net_collected_cash",
        opportunities: m16.denominator,
        complete: m16.dataState === "complete",
      },
      segments: segmentsFrom(funnel),
      funnel: { stages: funnel.stages, connectors: funnel.connectors },
      wins: winsFrom([...teamEvents].reverse()),
    });
  }

  return {
    now,
    season: { label: `${monthLabel} season`, daysLeft, from: season.startsAt, to: season.endsAt },
    personas,
    team,
  };
}
