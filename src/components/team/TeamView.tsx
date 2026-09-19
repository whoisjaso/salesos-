"use client";

import { useMemo, useState, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { obaviaCommissionPolicies, obaviaDataset, obaviaDatasetWithPairs, obaviaPairs, NOW } from "@/fixtures/obavia";
import { commissionPolicyFor } from "@/domain/cashTiers";
import { buildStandings, ownStanding } from "@/domain/leaderboard";
import { scopeIncidents } from "@/domain/incidents";
import { computeFunnel } from "@/domain/metrics";
import { deriveGameEvents, levelFor, playerState, streakDays as streakOf, XP_TABLE } from "@/domain/game";
import { personalMilestone, seasonFor } from "@/domain/gamification";
import { RulesCoachingEngine } from "@/domain/coaching";
import { useSession } from "@/lib/session";
import { useRouter } from "next/navigation";
import {
  buildPairViews,
  descriptivePolicy,
  guardrailCounts,
  missionsForRep,
  opportunitiesProcessed,
  rowRole,
  seasonDaysLeft,
  seasonPolicy,
  seasonTitle,
  skillPathsForRep,
  stageChampions,
  standingsLines,
  type PairView,
} from "@/lib/team-data";
import { PairCard } from "@/components/pairs/PairCard";
import { PairSheet } from "@/components/pairs/PairSheet";
import { DetailsRow } from "@/components/ui/DetailsRow";
import { Sheet } from "@/components/ui/Sheet";
import { Segmented } from "./Segmented";
import { SeasonHero } from "./SeasonHero";
import { SeasonSheet } from "./SeasonSheet";
import { StandingsHeader } from "./StandingsHeader";
import { StandingsSheet } from "./StandingsSheet";
import { LeaderboardRow } from "./LeaderboardRow";
import { StageChampions } from "./StageChampions";
import { MissionsList } from "./MissionsList";
import { SourceSheetList } from "./SourceSheetList";
import { useTenantData } from "@/lib/onboarding";
import { InviteButton, TeamRoster } from "@/components/onboarding/TeamRoster";

type Segment = "board" | "pairs" | "stages" | "missions";
type RoleFilter = "closer" | "setter";

const REP_SEGMENTS = [
  { id: "board" as const, label: "Board" },
  { id: "pairs" as const, label: "Pairs" },
  { id: "stages" as const, label: "Stages" },
  { id: "missions" as const, label: "Missions" },
];
const OWNER_SEGMENTS = REP_SEGMENTS.filter((s) => s.id !== "missions");
const ROLES = [
  { id: "closer" as const, label: "Closers" },
  { id: "setter" as const, label: "Setters" },
];

const dataset = obaviaDataset;
/** Hypothetical per-role rates for the pair sheet's commission lines (D06). */
const PAIR_RATES = {
  setter: commissionPolicyFor(obaviaCommissionPolicies, "setter")?.ratePercent,
  closer: commissionPolicyFor(obaviaCommissionPolicies, "closer")?.ratePercent,
};
const reps = dataset.users.filter((u) => u.active && (u.roles.includes("setter") || u.roles.includes("closer")));
const repIds = new Set(reps.map((r) => r.userId));

/**
 * Team: hero, one control, one list, tab bar. The session user is "me"; the
 * owner sees the team ring and the same shape. Everything else is behind a tap.
 */
export function TeamView() {
  const reduce = useReducedMotion();
  const { session, ready } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (ready && !session) router.replace("/");
  }, [ready, session, router]);
  const isOwner = session?.role === "owner";
  const meId = !isOwner && session ? session.userId : null;
  const tenantData = useTenantData();
  const [segment, setSegment] = useState<Segment>("board");
  const [role, setRole] = useState<RoleFilter>(session?.role === "setter" ? "setter" : "closer");
  const [descriptive, setDescriptive] = useState(false);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [ranksOpen, setRanksOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, boolean>>({});
  const [openPair, setOpenPair] = useState<PairView | null>(null);

  const season = useMemo(() => seasonFor(NOW), []);
  const basePolicy = useMemo(() => seasonPolicy(NOW), []);
  const policy = useMemo(() => (descriptive ? descriptivePolicy(NOW) : basePolicy), [descriptive, basePolicy]);
  const scope = useMemo(() => scopeIncidents(dataset, { now: NOW }), []);
  // The standings as the policy really stands: the hold survives the descriptive override.
  const baseStandings = useMemo(() => buildStandings(dataset, "comparable_performance", basePolicy, NOW, scope), [basePolicy, scope]);
  const standings = useMemo(
    () => (descriptive ? buildStandings(dataset, "comparable_performance", policy, NOW, scope) : baseStandings),
    [descriptive, policy, scope, baseStandings],
  );
  const rows = standings.rows;
  const visible = useMemo(() => rows.filter((r) => r.role === role), [rows, role]);
  const baseLines = useMemo(() => standingsLines(baseStandings), [baseStandings]);
  const lines = useMemo(() => standingsLines(standings, descriptive), [standings, descriptive]);
  const guardrails = useMemo(() => guardrailCounts(dataset), []);
  const champions = useMemo(() => stageChampions(dataset, visible, policy, NOW), [visible, policy]);

  const window = useMemo(() => ({ from: season.startsAt, to: season.endsAt }), [season]);
  const pairViews = useMemo(
    () => buildPairViews(obaviaDatasetWithPairs, obaviaPairs, window, NOW, { minMaturedSample: basePolicy.minMaturedSample, policies: obaviaCommissionPolicies }),
    [window, basePolicy.minMaturedSample],
  );
  const player = useMemo(() => (meId ? playerState(dataset, meId, NOW, window, []) : null), [meId, window]);
  const teamTrack = useMemo(() => {
    const events = deriveGameEvents(dataset).filter((e) => repIds.has(e.userId) && e.occurredAt <= NOW);
    const inSeason = events.filter((e) => e.occurredAt >= window.from && e.occurredAt < window.to);
    const xp = inSeason.filter((e) => XP_TABLE[e.kind].track === "commercial").reduce((acc, e) => acc + XP_TABLE[e.kind].xp, 0);
    return { level: levelFor(xp), streakDays: streakOf(events, NOW) };
  }, [window]);
  // A rep's own standing comes from the board's own rows, never from a local count.
  const own = useMemo(
    () => (meId && session && session.role !== "owner" ? ownStanding(standings, meId, session.role) : null),
    [standings, meId, session],
  );
  const missions = useMemo(() => (meId ? missionsForRep(RulesCoachingEngine.recommend(dataset, meId, NOW), dataset, meId, NOW) : []), [meId]);
  const paths = useMemo(() => (meId ? skillPathsForRep(dataset, meId) : []), [meId]);
  const milestone = useMemo(() => (meId ? personalMilestone(meId, opportunitiesProcessed(dataset, meId), 777, "accountable opportunities processed") : null), [meId]);
  const funnels = useMemo(() => {
    const out: Record<string, ReturnType<typeof computeFunnel>["stages"]> = {};
    for (const r of rows) out[`${r.userId}:${r.role}`] = computeFunnel(dataset, { userId: r.userId, role: rowRole(r), from: policy.periodFrom, to: policy.periodTo }, NOW).stages;
    return out;
  }, [rows, policy]);

  const fade = reduce ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const } };
  const segments = isOwner ? OWNER_SEGMENTS : REP_SEGMENTS;
  const title = seasonTitle(NOW);
  const daysLeft = seasonDaysLeft(NOW);
  const level = player ? player.commercial : teamTrack.level;
  const streak = player ? player.streakDays : teamTrack.streakDays;
  const pausedReasons = player?.gate.paused ? player.gate.reasons : [];

  // A business created through onboarding: roster only, no ranks, until its own sample matures.
  if (session && !tenantData.demo) return <TeamRoster data={tenantData} viewer={{ userId: session.userId, role: session.role }} />;

  return (
    <>
      <div className="flex flex-col gap-4">
        <SeasonHero title={title} daysLeft={daysLeft} level={level} own={player ? own : null} team={!player} onOpen={() => setSeasonOpen(true)} action={isOwner && session ? <InviteButton data={tenantData} by={session.userId} /> : null} />

        <Segmented options={segments} value={segment} onChange={setSegment} label="View" size="md" className="w-full [&>button]:flex-1" />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={segment} {...fade}>
            {segment === "board" ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-[12px] text-fg-subtle">Net collected cash, per lead</span>
                  <Segmented options={ROLES} value={role} onChange={setRole} label="Role" />
                </div>
                <ol className="surface px-4" aria-label="Board">
                  {visible.map((r) => {
                    const key = `${r.userId}:${r.role}`;
                    return (
                      <LeaderboardRow
                        key={key}
                        row={r}
                        descriptive={descriptive}
                        isMe={r.userId === meId}
                        funnel={funnels[key] ?? []}
                        correctionSent={Boolean(corrections[key])}
                        onRequestCorrection={() => setCorrections((c) => ({ ...c, [key]: true }))}
                      />
                    );
                  })}
                  <li className="-mx-4 border-t border-line">
                    <DetailsRow label="Compare to source sheet" onClick={() => setSourceOpen(true)} />
                  </li>
                </ol>
              </div>
            ) : segment === "pairs" ? (
              pairViews.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="px-1 text-[12px] text-fg-subtle">Net collected cash, per assigned</div>
                  <ol className="surface px-4" aria-label="Pairs">
                    {pairViews.map((v) => (
                      <PairCard key={v.pair.pairId} view={v} meId={meId} onOpen={setOpenPair} />
                    ))}
                  </ol>
                </div>
              ) : (
                <div className="surface px-4 py-6 text-center text-[13px] text-fg-muted">No active pairs</div>
              )
            ) : segment === "stages" ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-[12px] text-fg-subtle">Leader per stage</span>
                  <Segmented options={ROLES} value={role} onChange={setRole} label="Role" />
                </div>
                <StageChampions champions={champions} />
              </div>
            ) : milestone ? (
              <MissionsList missions={missions} paths={paths} milestone={milestone} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <SeasonSheet
        open={seasonOpen}
        onClose={() => setSeasonOpen(false)}
        title={title}
        daysLeft={daysLeft}
        level={level}
        streakDays={streak}
        pausedReasons={pausedReasons}
        myRow={player ? myRow : undefined}
        team={!player}
        descriptive={descriptive}
        player={player}
        policy={basePolicy}
        guardrails={guardrails}
      />
      <RanksSheet open={ranksOpen} onClose={() => setRanksOpen(false)} pause={pause} descriptive={descriptive} onDescriptive={setDescriptive} isOwner={isOwner} />
      <Sheet open={sourceOpen} onClose={() => setSourceOpen(false)} title="Source sheet" description="August 2026, 12 columns as read">
        <SourceSheetList />
      </Sheet>
      {session ? <PairSheet open={openPair !== null} onClose={() => setOpenPair(null)} view={openPair} viewer={{ role: session.role, userId: session.userId }} rates={PAIR_RATES} /> : null}
    </>
  );
}
