"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Wrench } from "@phosphor-icons/react";
import { obaviaDataset, NOW } from "@/fixtures/obavia";
import { RulesCoachingEngine } from "@/domain/coaching";
import { computeMetric } from "@/domain/metrics";
import { PageHeader } from "@/components/shell/PageHeader";
import { StateChip } from "@/components/ui/StateChip";
import { Segmented } from "@/components/team/Segmented";
import { OWNER_LABEL, type RecommendationUiState } from "@/lib/team-data";
import { HeroCard } from "./HeroCard";
import { SensitivityTable } from "./SensitivityTable";
import { ActionLibrary } from "./ActionLibrary";

const OWNER = "__owner__";
const dataset = obaviaDataset;
const reps = dataset.users.filter((u) => u.active && (u.roles.includes("setter") || u.roles.includes("closer")));

const SEGMENTS = [
  { id: "focus" as const, label: "Focus" },
  { id: "more" as const, label: "More" },
];

export function CoachView() {
  const reduce = useReducedMotion();
  const [who, setWho] = useState(reps[0]?.userId ?? OWNER);
  const [segment, setSegment] = useState<"focus" | "more">("focus");
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState<Record<string, RecommendationUiState>>({});

  const userId = who === OWNER ? null : who;
  const recs = useMemo(() => {
    const all = RulesCoachingEngine.recommend(dataset, userId, NOW);
    return userId === null ? all.filter((r) => r.ownerRole !== "rep") : all;
  }, [userId]);
  const primary = recs[Math.min(index, Math.max(0, recs.length - 1))];
  const metric = useMemo(
    () => (primary ? computeMetric(primary.metricIds[0], dataset, userId ? { userId } : {}, NOW) : null),
    [primary, userId],
  );
  const others = recs.filter((r) => r !== primary);

  const fade = reduce ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const } };

  return (
    <>
      <PageHeader
        title="Coach"
        subtitle="One thing to practice. Evidence first."
        actions={
          <label className="inline-flex h-8 items-center gap-2 rounded-sm border border-line-strong bg-raised px-2.5 text-[13px] text-fg">
            <span className="text-fg-subtle">For</span>
            <select
              value={who}
              onChange={(e) => {
                setWho(e.target.value);
                setIndex(0);
              }}
              aria-label="Coaching for"
              className="bg-transparent font-medium text-fg outline-none"
            >
              {reps.map((u) => (
                <option key={u.userId} value={u.userId} className="bg-raised text-fg">
                  {u.displayName}
                </option>
              ))}
              <option value={OWNER} className="bg-raised text-fg">
                Owner view
              </option>
            </select>
          </label>
        }
      />

      <div className="flex flex-col gap-4">
        <Segmented options={SEGMENTS} value={segment} onChange={setSegment} label="Section" size="md" className="self-start" />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${segment}-${who}-${index}`} {...fade} className="flex flex-col gap-4">
            {segment === "focus" ? (
              <>
                {primary && metric ? (
                  <HeroCard
                    rec={primary}
                    metric={metric}
                    state={states[primary.recommendationId] ?? "proposed"}
                    onState={(next) => setStates((s) => ({ ...s, [primary.recommendationId]: next }))}
                  />
                ) : (
                  <div className="surface px-5 py-8 text-[14px] text-fg-muted">Nothing to practice. Every coached metric is on target or too small to judge.</div>
                )}
                {others.length ? (
                  <ol className="surface divide-y divide-line px-4" aria-label="Also">
                    {others.map((r) => {
                      const i = recs.indexOf(r);
                      return (
                        <li key={r.recommendationId}>
                          <button type="button" onClick={() => setIndex(i)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-hover">
                            {r.suppressed ? <Wrench size={15} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" /> : null}
                            <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{r.title.replace(/^Resolve data before coaching: /, "")}</span>
                            <span className="shrink-0 text-[11px] text-fg-subtle">{OWNER_LABEL[r.ownerRole]}</span>
                            <StateChip state={r.dataState} />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </>
            ) : (
              <>
                <SensitivityTable />
                <ActionLibrary />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
