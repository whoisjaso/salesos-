"use client";

import { useState } from "react";
import { EyeSlash, Lock } from "@phosphor-icons/react";
import type { SkillPath } from "@/domain/types";
import type { PlayerState } from "@/domain/game";
import { XP_TABLE } from "@/domain/game";
import type { PersonalMilestone } from "@/domain/gamification";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { proofShort, type RepMission } from "@/lib/team-data";

export interface MeTabProps {
  player: PlayerState;
  missions: RepMission[];
  paths: SkillPath[];
  milestone: PersonalMilestone;
}

/** Drop the "On the next 5 eligible cases:" prefix (the ring already shows 0/5) and capitalize. */
function shortTitle(title: string): string {
  const t = title.replace(/^On the next \d+ eligible cases: /, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const TRACKS:{ key: "commercial" | "mastery" | "team"; label: string }[] = [
  { key: "commercial", label: "Cash" },
  { key: "mastery", label: "Craft" },
  { key: "team", label: "Team" },
];

/** Me: three track rings, one active mission, skill path dots, private milestone. */
export function MeTab({ player, missions, paths, milestone }: MeTabProps) {
  const [showMilestone, setShowMilestone] = useState(true);
  const [showProof, setShowProof] = useState(false);
  const active = missions[0];
  const rest = missions.slice(1);

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Tracks" className="surface flex items-center justify-around px-2 py-4">
        {TRACKS.map((t) => {
          const lvl = player[t.key];
          return (
            <div key={t.key} className="flex flex-col items-center gap-1.5">
              <ProgressRing value={lvl.progress} size={60} strokeWidth={5} label={`${t.label} level ${lvl.level}`} centerText={`L${lvl.level}`} />
              <span className="text-[12.5px] font-medium text-fg-muted">{t.label}</span>
              <span className="tabular text-[11px] text-fg-subtle">{formatCount(lvl.xp)} XP</span>
            </div>
          );
        })}
      </section>

      {active ? (
        <section aria-label="Mission" className="surface p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <ProgressRing
              value={active.mission.target === 0 ? 0 : active.mission.progress / active.mission.target}
              size={96}
              strokeWidth={7}
              label="Mission progress"
              centerText={`${active.mission.progress}/${active.mission.target}`}
              className="shrink-0 [&>span]:text-[16px] [&>span]:font-semibold"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-fg-subtle">
                <span>{active.source === "coaching" ? "Mission" : "Optional lesson"}</span>
                {active.mission.state === "paused" ? <span className="rounded-[4px] border border-dashed border-line-strong px-1.5 py-0.5 text-fg-muted">Paused, data first</span> : null}
              </div>
              <p className="mt-1 text-[15px] font-medium leading-snug text-fg">{shortTitle(active.mission.title)}</p>
              <button type="button" onClick={() => setShowProof((v) => !v)} aria-expanded={showProof} className="mt-2 text-left text-[12.5px] text-fg-muted hover:text-fg">
                Proof: {proofShort(active.mission.linkedMetricId)}
              </button>
              {showProof ? <p className="mt-1 text-[12px] leading-snug text-fg-subtle">{active.mission.evidenceRule}</p> : null}
            </div>
          </div>
          {rest.length ? (
            <ol className="mt-4 divide-y divide-line border-t border-line">
              {rest.map((m) => (
                <li key={m.mission.missionId} className="flex items-center gap-3 py-2.5">
                  <span className="tabular w-8 shrink-0 text-[12px] text-fg-subtle">{m.mission.progress}/{m.mission.target}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">{shortTitle(m.mission.title)}</span>
                  <span className="shrink-0 text-[11px] text-fg-subtle">{m.source === "coaching" ? "Next" : "Lesson"}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      <section aria-label="Skill paths" className="surface px-4 py-2">
        <ol className="divide-y divide-line">
          {paths.map((p) => {
            const done = p.steps.filter((s) => s.done).length;
            return (
              <li key={p.pathId} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{p.name}</span>
                <span className="tabular text-[11px] text-fg-subtle">{done}/{p.steps.length}</span>
                <span className="flex shrink-0 gap-1" aria-label={`${done} of ${p.steps.length} steps done`}>
                  {p.steps.map((s) => (
                    <span key={s.id} aria-hidden className={cn("h-2 w-2 rounded-full", s.done ? "bg-accent" : "bg-line-strong")} />
                  ))}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-label="Personal milestone" className="surface flex items-center gap-4 p-4">
        <Lock size={16} weight="regular" aria-hidden className="shrink-0 text-fg-subtle" />
        {showMilestone ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-fg-subtle">Private, optional</div>
              <div className="tabular mt-0.5 text-[15px] font-semibold text-fg">
                {formatCount(milestone.progress)} <span className="font-medium text-fg-muted">of {formatCount(milestone.target)}</span>
              </div>
              <div className="text-[12px] text-fg-subtle">{milestone.label.replace(/^\d+ /, "")}</div>
            </div>
            <div className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-sunken sm:w-32">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (milestone.progress / milestone.target) * 100)}%` }} />
            </div>
          </>
        ) : (
          <span className="flex-1 text-[13px] text-fg-subtle">Milestone hidden</span>
        )}
        <Button variant="ghost" size="sm" onClick={() => setShowMilestone((v) => !v)} aria-label={showMilestone ? "Hide milestone" : "Show milestone"} className="-mr-2">
          <EyeSlash size={15} weight="bold" aria-hidden />
        </Button>
      </section>

      {player.recent.length ? (
        <section aria-label="Recent verified events" className="px-1">
          <ol className="flex flex-wrap gap-1.5">
            {player.recent.map((e) => (
              <li key={e.evidenceRef} className="tabular inline-flex h-6 items-center gap-1 rounded-sm border border-line px-2 text-[11.5px] text-fg-muted">
                {XP_TABLE[e.kind].label}
                <span className="text-fg-subtle">+{XP_TABLE[e.kind].xp}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
