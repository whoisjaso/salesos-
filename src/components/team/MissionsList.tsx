"use client";

import { useState, type ReactNode } from "react";
import { CaretRight, EyeSlash, Lock } from "@phosphor-icons/react";
import type { SkillPath } from "@/domain/types";
import type { PersonalMilestone } from "@/domain/gamification";
import { Button } from "@/components/ui/Button";
import { DetailsRow } from "@/components/ui/DetailsRow";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { proofShort, type RepMission } from "@/lib/team-data";

export interface MissionsListProps {
  missions: RepMission[];
  paths: SkillPath[];
  milestone: PersonalMilestone;
}

/** Drop the "On the next 5 eligible cases:" prefix (the value already shows 0/5) and capitalize. */
function shortTitle(title: string): string {
  const t = title.replace(/^On the next \d+ eligible cases: /, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

type Open = { kind: "mission"; mission: RepMission } | { kind: "paths" } | { kind: "milestone" } | null;

/**
 * Missions: one list. A mission row is its title and progress; skill paths and
 * the private milestone are two rows at the end. Everything else is in the sheet.
 */
export function MissionsList({ missions, paths, milestone }: MissionsListProps) {
  const [open, setOpen] = useState<Open>(null);
  const [showMilestone, setShowMilestone] = useState(true);
  const stepsDone = paths.reduce((acc, p) => acc + p.steps.filter((s) => s.done).length, 0);
  const stepsAll = paths.reduce((acc, p) => acc + p.steps.length, 0);
  const active = open?.kind === "mission" ? open.mission : null;

  return (
    <>
      <ol className="surface divide-y divide-line" aria-label="Missions">
        {missions.map((m, i) => (
          <li key={m.mission.missionId}>
            <button type="button" onClick={() => setOpen({ kind: "mission", mission: m })} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-hover active:bg-hover">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[12px] font-medium leading-tight text-fg-subtle">{i === 0 && m.source === "coaching" ? "Mission" : m.source === "coaching" ? "Next" : "Optional lesson"}</span>
                <span className="line-clamp-2 text-[15px] font-medium leading-tight text-fg">{shortTitle(m.mission.title)}</span>
              </span>
              <span className="tabular shrink-0 text-[15px] font-semibold text-fg">
                {m.mission.progress} of {m.mission.target}
              </span>
              <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
            </button>
          </li>
        ))}
        <li>
          <DetailsRow label="Skill paths" value={`${stepsDone} of ${stepsAll}`} onClick={() => setOpen({ kind: "paths" })} />
        </li>
        <li>
          <DetailsRow leading={<Lock size={14} weight="regular" aria-hidden className="text-fg-subtle" />} label="Milestone" value={showMilestone ? `${formatCount(milestone.progress)} of ${formatCount(milestone.target)}` : "Hidden"} onClick={() => setOpen({ kind: "milestone" })} />
        </li>
      </ol>

      <Sheet open={active !== null} onClose={() => setOpen(null)} title={active ? shortTitle(active.mission.title) : ""} description={active ? (active.source === "coaching" ? "Mission" : "Optional lesson") : undefined}>
        {active ? (
          <dl className="flex flex-col divide-y divide-line">
            <SheetRow label="Progress">
              {active.mission.progress} of {active.mission.target}
            </SheetRow>
            <SheetRow label="State">{active.mission.state === "paused" ? "Paused, data first" : active.mission.state}</SheetRow>
            <SheetRow label="Proof">{proofShort(active.mission.linkedMetricId)}</SheetRow>
            <SheetRow label="Evidence">{active.mission.evidenceRule}</SheetRow>
          </dl>
        ) : null}
      </Sheet>

      <Sheet open={open?.kind === "paths"} onClose={() => setOpen(null)} title="Skill paths" description="Steps done only where an audited capability certifies the path">
        <ol className="divide-y divide-line">
          {paths.map((p) => {
            const done = p.steps.filter((s) => s.done).length;
            return (
              <li key={p.pathId} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1 truncate text-[14px] text-fg">{p.name}</span>
                <span className="tabular text-[12px] text-fg-subtle">
                  {done}/{p.steps.length}
                </span>
                <span className="flex shrink-0 gap-1" aria-label={`${done} of ${p.steps.length} steps done`}>
                  {p.steps.map((s) => (
                    <span key={s.id} aria-hidden className={cn("h-2 w-2 rounded-full", s.done ? "bg-accent" : "bg-line-strong")} />
                  ))}
                </span>
              </li>
            );
          })}
        </ol>
      </Sheet>

      <Sheet open={open?.kind === "milestone"} onClose={() => setOpen(null)} title="Milestone" description="Private, optional">
        <div className="flex flex-col gap-4">
          {showMilestone ? (
            <>
              <div className="tabular text-[24px] font-semibold text-fg">
                {formatCount(milestone.progress)} <span className="text-[15px] font-medium text-fg-muted">of {formatCount(milestone.target)}</span>
              </div>
              <div className="text-[13px] text-fg-muted">{milestone.label.replace(/^\d+ /, "")}</div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (milestone.progress / milestone.target) * 100)}%` }} />
              </div>
            </>
          ) : (
            <p className="text-[14px] text-fg-muted">Milestone hidden</p>
          )}
          <Button variant="secondary" size="md" onClick={() => setShowMilestone((v) => !v)} leading={<EyeSlash size={16} weight="bold" aria-hidden />} className="self-start">
            {showMilestone ? "Hide milestone" : "Show milestone"}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

function SheetRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5 first:pt-0">
      <dt className="text-[13px] font-medium text-fg-muted">{label}</dt>
      <dd className="tabular text-[13.5px] leading-relaxed text-fg">{children}</dd>
    </div>
  );
}
