"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Info, PauseCircle } from "@phosphor-icons/react";
import { obaviaCommissionPolicies, obaviaDataset, obaviaDatasetWithPairs, obaviaPairs, NOW } from "@/fixtures/obavia";
import { commissionPolicyFor } from "@/domain/cashTiers";
import { buildLeaderboard } from "@/domain/leaderboard";
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
  pauseConditions,
  rowRole,
  seasonDaysLeft,
  seasonPolicy,
  seasonTitle,
  skillPathsForRep,
  stageChampions,
  type PairView,
} from "@/lib/team-data";
import { PairCard } from "@/components/pairs/PairCard";
import { PairSheet } from "@/components/pairs/PairSheet";
import { Segmented, Switch } from "./Segmented";
import { SeasonHero } from "./SeasonHero";
import { LeaderboardRow } from "./LeaderboardRow";
import { StageChampions } from "./StageChampions";
import { MeTab } from "./MeTab";
import { InfoSheet } from "./InfoSheet";
import { SourceSheetList } from "./SourceSheetList";

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

/** Team board. The session user is "me"; the owner sees the team ring instead. */
export function TeamView() {
  const reduce = useReducedMotion();
  const { session, ready } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (ready && !session) router.replace("/");
  }, [ready, session, router]);
  const isOwner = session?.role === "owner";
  const meId = !isOwner && session ? session.userId : null;
  const [segment, setSegment] = useState<Segment>("board");
  const [role, setRole] = useState<RoleFilter>(session?.role === "setter" ? "setter" : "closer");
  const [descriptive, setDescriptive] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, boolean>>({});
  const [openPair, setOpenPair] = useState<PairView | null>(null);

  const season = useMemo(() => seasonFor(NOW), []);
  const basePolicy = useMemo(() => seasonPolicy(NOW), []);
  const policy = useMemo(() => (descriptive ? descriptivePolicy(NOW) : basePolicy), [descriptive, basePolicy]);
  const rows = useMemo(() => buildLeaderboard(dataset, "comparable_performance", policy, NOW), [policy]);
  const visible = useMemo(() => rows.filter((r) => r.role === role), [rows, role]);
  const allProvisional = visible.length > 0 && visible.every((r) => r.provisional);
  const pause = useMemo(() => pauseConditions(dataset, NOW), []);
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
  const myRow = meId ? rows.find((r) => r.userId === meId) : undefined;
  const missions = useMemo(() => (meId ? missionsForRep(RulesCoachingEngine.recommend(dataset, meId, NOW), dataset, meId, NOW) : []), [meId]);
  const paths = useMemo(() => (meId ? skillPathsForRep(dataset, meId) : []), [meId]);
  const milestone = useMemo(() => (meId ? personalMilestone(meId, opportunitiesProcessed(dataset, meId), 777, "accountable opportunities processed") : null), [meId]);
  const funnels = useMemo(() => {
    const out: Record<string, ReturnType<typeof computeFunnel>["stages"]> = {};
    for (const r of rows) out[`${r.userId}:${r.role}`] = computeFunnel(dataset, { userId: r.userId, role: rowRole(r), from: policy.periodFrom, to: policy.periodTo }, NOW).stages;
    return out;
  }, [rows, policy]);

  const pauseText = [
    pause.unlinkedPayments ? `${pause.unlinkedPayments} unlinked ${pause.unlinkedPayments === 1 ? "payment" : "payments"}` : null,
    pause.unresolvedAttendance ? `${pause.unresolvedAttendance} unresolved ${pause.unresolvedAttendance === 1 ? "attendance" : "attendances"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const fade = reduce ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const } };
  const segments = isOwner ? OWNER_SEGMENTS : REP_SEGMENTS;

  return (
    <>
      <div className="flex flex-col gap-4">
        {player ? (
          <SeasonHero title={seasonTitle(NOW)} daysLeft={seasonDaysLeft(NOW)} level={player.commercial} streakDays={player.streakDays} pausedReasons={player.gate.paused ? player.gate.reasons : []} myRow={myRow} descriptive={descriptive} />
        ) : (
          <SeasonHero title={seasonTitle(NOW)} daysLeft={seasonDaysLeft(NOW)} level={teamTrack.level} streakDays={teamTrack.streakDays} team descriptive={descriptive} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented options={segments} value={segment} onChange={setSegment} label="View" />
          <div className="flex items-center gap-1">
            {segment === "board" || segment === "stages" ? <Segmented options={ROLES} value={role} onChange={setRole} label="Role" /> : null}
            <button type="button" onClick={() => setInfoOpen(true)} aria-label="Rules" className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-sm text-fg-muted hover:bg-hover hover:text-fg">
              <Info size={18} weight="regular" aria-hidden />
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={segment} {...fade}>
            {segment === "board" ? (
              <div className="flex flex-col gap-3">
                {allProvisional && pauseText ? (
                  <div className="surface flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-2 text-[13px] text-fg">
                      <PauseCircle size={16} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-fg-muted" />
                      <span className="tabular min-w-0 leading-snug">
                        Ranking paused: {pauseText}
                        {isOwner ? (
                          <Link href="/" className="ml-2 font-medium text-accent underline-offset-2 hover:underline">
                            Fix in Business
                          </Link>
                        ) : null}
                      </span>
                    </div>
                    <Switch checked={descriptive} onChange={setDescriptive} label="Show ranks anyway" className="sm:shrink-0" />
                  </div>
                ) : null}
                {showSource ? (
                  <SourceSheetList />
                ) : (
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
                  </ol>
                )}
                <div className="flex justify-end px-1">
                  <Switch checked={showSource} onChange={setShowSource} label="Source sheet" className="text-[12px]" />
                </div>
              </div>
            ) : segment === "pairs" ? (
              pairViews.length > 0 ? (
                <ol className="flex flex-col gap-3" aria-label="Pairs">
                  {pairViews.map((v) => (
                    <PairCard key={v.pair.pairId} view={v} meId={meId} onOpen={setOpenPair} />
                  ))}
                </ol>
              ) : (
                <div className="surface px-4 py-6 text-center text-[13px] text-fg-muted">No active pairs</div>
              )
            ) : segment === "stages" ? (
              <StageChampions champions={champions} />
            ) : player && milestone ? (
              <MeTab player={player} missions={missions} paths={paths} milestone={milestone} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <InfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} policy={basePolicy} guardrails={guardrails} />
      {session ? <PairSheet open={openPair !== null} onClose={() => setOpenPair(null)} view={openPair} viewer={{ role: session.role, userId: session.userId }} rates={PAIR_RATES} /> : null}
    </>
  );
}
