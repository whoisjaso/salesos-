"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowsClockwise, ClockCounterClockwise, Lock } from "@phosphor-icons/react";
import type { SopModule } from "@/content/sops";
import { Surface } from "@/components/ui/Surface";
import { StageRail } from "./StageRail";
import { SopCard } from "./SopCard";
import { STAGES } from "./stages";

export interface PlaybooksViewProps {
  sops: SopModule[];
  boundaries: { canAdapt: string[]; neverAdapts: string[] };
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

const enter = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };

/** Owns the selected stage. The SOP and its history follow that one choice; the boundaries never change. */
export function PlaybooksView({ sops, boundaries }: PlaybooksViewProps) {
  const reduce = useReducedMotion();
  const panelId = useId();
  const [stage, setStage] = useState(STAGES[0].stage);
  const sop = sops.find((s) => s.stage === stage) ?? sops[0];

  return (
    <>
      <StageRail value={stage} onChange={setStage} panelId={panelId} className="mb-5" />

      <motion.div
        key={sop.sopId}
        id={panelId}
        role="tabpanel"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={enter}
      >
        <SopCard sop={sop} />
      </motion.div>

      <section aria-labelledby="adapt-heading" className="mt-10">
        <h2 id="adapt-heading" className="mb-3 text-[13px] font-medium text-fg-subtle">
          What adapts and what never adapts
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Surface padding="md">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-fg">
              <ArrowsClockwise size={15} weight="bold" aria-hidden className="text-accent" />
              Adapts
            </h3>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {boundaries.canAdapt.map((it) => (
                <li key={it} className="rounded-sm border border-line-strong px-2 py-1 text-[12px] font-medium leading-snug text-fg-muted">
                  {it}
                </li>
              ))}
            </ul>
          </Surface>
          <Surface padding="md">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-fg">
              <Lock size={15} weight="bold" aria-hidden className="text-perf-issue" />
              Never adapts
            </h3>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {boundaries.neverAdapts.map((it) => (
                <li
                  key={it}
                  className="rounded-sm border border-[color:var(--perf-issue-line)] px-2 py-1 text-[12px] font-medium leading-snug text-perf-issue"
                >
                  {it}
                </li>
              ))}
            </ul>
          </Surface>
        </div>
      </section>

      <motion.section
        key={`${sop.sopId}-history`}
        aria-labelledby="history-heading"
        className="mt-10"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={enter}
      >
        <h2 id="history-heading" className="mb-3 text-[13px] font-medium text-fg-subtle">
          Version history
        </h2>
        <ol className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
          {sop.reviewHistory.map((h, i) => (
            <li key={`${h.date}-${i}`} className="flex items-start gap-3 px-4 py-3">
              <ClockCounterClockwise size={15} weight="regular" aria-hidden className="mt-0.5 shrink-0 text-fg-subtle" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="tabular shrink-0 text-[12px] text-fg-subtle sm:w-28">{formatDate(h.date)}</span>
                <span className="text-[13px] text-fg">{h.note}</span>
              </div>
            </li>
          ))}
        </ol>
      </motion.section>
    </>
  );
}
