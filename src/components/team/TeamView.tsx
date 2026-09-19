"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Info, PauseCircle } from "@phosphor-icons/react";
import { obaviaDataset, NOW } from "@/fixtures/obavia";
import { buildLeaderboard } from "@/domain/leaderboard";
import { computeFunnel } from "@/domain/metrics";
import { playerState } from "@/domain/game";
import { personalMilestone, seasonFor } from "@/domain/gamification";
import { RulesCoachingEngine } from "@/domain/coaching";
import { PageHeader } from "@/components/shell/PageHeader";
import {
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
} from "@/lib/team-data";
import { Segmented, Switch } from "./Segmented";
import { SeasonHero } from "./SeasonHero";
import { LeaderboardRow } from "./LeaderboardRow";
import { StageChampions } from "./StageChampions";
import { MeTab } from "./MeTab";
import { InfoSheet } from "./InfoSheet";
import { SourceSheetList } from "./SourceSheetList";

type Segment = "board" | "stages" | "me";
type RoleFilter = "closer" | "setter";

const SEGMENTS = [
  { id: "board" as const, label: "Board" },
  { id: "stages" as const, label: "Stages" },
  { id: "me" as const, label: "Me" },
];
const ROLES = [
  { id: "closer" as const, label: "Closers" },
  { id: "setter" as const, label: "Setters" },
];

const dataset = obaviaDataset;
const reps = dataset.users.filter((u) => u.active && (u.roles.includes("setter") || u.roles.includes("closer")));

export function TeamView() {
  const reduce = useReducedMotion();
  const [segment, setSegment] = useState<Segment>("board");
  const [role, setRole] = useState<RoleFilter>("closer");
  const [meId, setMeId] = useState(reps[0]?.userId ?? "");
  const [descriptive, setDescriptive] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, boolean>>({});

  const season = useMemo(() => seasonFor(NOW), []);
  const basePolicy = useMemo(() => seasonPolicy(NOW), []);
  const policy = useMemo(() => (descriptive ? descriptivePolicy(NOW) : basePolicy), [descriptive, basePolicy]);
  const rows = useMemo(() => buildLeaderboard(dataset, "comparable_performance", policy, NOW), [policy]);
  const visible = useMemo(() => rows.filter((r) => r.role === role), [rows, role]);
  const allProvisional = visible.length > 0 && visible.every((r) => r.provisional);
  const pause = useMemo(() => pauseConditions(dataset, NOW), []);
  const guardrails = useMemo(() => guardrailCounts(dataset), []);
  const champions = useMemo(() => stageChampions(dataset, visible, policy, NOW), [visible, policy]);

  const me = reps.find((u) => u.userId === meId) ?? reps[0];
  const myRow = rows.find((r) => r.userId === me.userId);
  const player = useMemo(() => playerState(dataset, me.userId, NOW, { from: season.startsAt, to: season.endsAt }, []), [me.userId, season]);
  const missions = useMemo(() => missionsForRep(RulesCoachingEngine.recommend(dataset, me.userId, NOW), dataset, me.userId, NOW), [me.userId]);
  const paths = useMemo(() => skillPathsForRep(dataset, me.userId), [me.userId]);
  const milestone = useMemo(
    () => personalMilestone(me.userId, opportunitiesProcessed(dataset, me.userId), 777, "accountable opportunities processed"),
    [me.userId],
  );
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

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={`${seasonTitle(NOW)} season. Display resets monthly. History does not.`}
        actions={
          <>
            <label className="inline-flex h-8 items-center gap-2 rounded-sm border border-line-strong bg-raised px-2.5 text-[13px] text-fg">
              <span className="text-fg-subtle">Me</span>
              <select value={me.userId} onChange={(e) => setMeId(e.target.value)} aria-label="Viewing as" className="bg-transparent font-medium text-fg outline-none">
                {reps.map((u) => (
                  <option key={u.userId} value={u.userId} className="bg-raised text-fg">
                    {u.displayName}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              aria-label="Rules and guardrails"
              className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-sm text-fg-muted hover:bg-hover hover:text-fg"
            >
              <Info size={20} weight="regular" aria-hidden />
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <SeasonHero title={seasonTitle(NOW)} daysLeft={seasonDaysLeft(NOW)} player={player} myRow={myRow} descriptive={descriptive} />

        <div className="flex items-center justify-between gap-3">
          <Segmented options={SEGMENTS} value={segment} onChange={setSegment} label="View" size="md" />
          {segment !== "me" ? <Segmented options={ROLES} value={role} onChange={setRole} label="Role" /> : null}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={segment} {...fade}>
            {segment === "board" ? (
              <div className="flex flex-col gap-3">
                {allProvisional && pauseText ? (
                  <div className="surface flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-fg">
                      <PauseCircle size={16} weight="bold" aria-hidden className="shrink-0 text-fg-muted" />
                      <span className="min-w-0">
                        Ranking paused: {pauseText}.{" "}
                        <Link href="/owner" className="text-accent underline-offset-2 hover:underline">
                          Fix in Owner
                        </Link>
                      </span>
                    </div>
                    <Switch checked={descriptive} onChange={setDescriptive} label="Show ranks anyway (descriptive)" />
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
                          isMe={r.userId === me.userId}
                          funnel={funnels[key] ?? []}
                          correctionSent={Boolean(corrections[key])}
                          onRequestCorrection={() => setCorrections((c) => ({ ...c, [key]: true }))}
                        />
                      );
                    })}
                  </ol>
                )}
                <div className="flex justify-end px-1">
                  <Switch checked={showSource} onChange={setShowSource} label="Source sheet (Aug 2026)" />
                </div>
              </div>
            ) : segment === "stages" ? (
              <StageChampions champions={champions} />
            ) : (
              <MeTab player={player} missions={missions} paths={paths} milestone={milestone} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <InfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} policy={basePolicy} guardrails={guardrails} />
    </>
  );
}
