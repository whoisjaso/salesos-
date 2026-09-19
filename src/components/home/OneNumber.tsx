"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { PerformanceState } from "@/domain/types";
import { Funnel } from "@/components/metrics/Funnel";
import { CountUp } from "@/components/ui/CountUp";
import { Sheet } from "@/components/ui/Sheet";
import { StateChip } from "@/components/ui/StateChip";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import { formatBasis, formatCount, formatMoneyMinor } from "@/lib/format";
import type { StageSegment, TodayModel } from "./today-model";

/** Segment hue from the verdict outline color, kept quiet. */
const SEGMENT_COLOR: Record<PerformanceState, string> = {
  strong: "color-mix(in srgb, var(--perf-strong-line) 70%, transparent)",
  attention: "color-mix(in srgb, var(--perf-attention-line) 70%, transparent)",
  material_issue: "color-mix(in srgb, var(--perf-issue-line) 70%, transparent)",
  neutral_no_benchmark: "var(--perf-neutral-line)",
  provisional_small_sample: "var(--perf-neutral-line)",
  data_state: "var(--perf-neutral-line)",
};

const SEGMENT_TEXT: Record<PerformanceState, string> = {
  strong: "var(--perf-strong-fg)",
  attention: "var(--perf-attention-fg)",
  material_issue: "var(--perf-issue-fg)",
  neutral_no_benchmark: "var(--fg-muted)",
  provisional_small_sample: "var(--fg-muted)",
  data_state: "var(--fg-muted)",
};

function StageBar({ segments, onOpen }: { segments: StageSegment[]; onOpen: (stageId: string) => void }) {
  const reduce = useReducedMotion();
  return (
    <div role="group" aria-label="Stages this season" className="flex h-8 w-full gap-[3px]">
      {segments.map((s, i) => (
        <motion.button
          key={s.stageId}
          type="button"
          onClick={() => onOpen(s.stageId)}
          aria-label={`${s.label}: ${formatCount(s.count)}. Open funnel.`}
          title={s.label}
          initial={reduce ? false : { scaleX: 0.6, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
          style={{
            flexGrow: Math.max(s.count, 0.001),
            flexBasis: 0,
            minWidth: 30,
            backgroundColor: SEGMENT_COLOR[s.state],
            color: SEGMENT_TEXT[s.state],
            transformOrigin: "left center",
          }}
          className={cn(
            "tabular inline-grid place-items-center text-[11px] font-semibold leading-none",
            "transition-[filter] hover:brightness-125 active:brightness-110 motion-reduce:transition-none",
            i === 0 && "rounded-l-full",
            i === segments.length - 1 && "rounded-r-full",
          )}
        >
          {s.count}
        </motion.button>
      ))}
    </div>
  );
}

/** One number: net collected per opportunity, with its basis and the stage bar. */
export function OneNumber({ model, seasonLabel }: { model: TodayModel; seasonLabel: string }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const { number } = model;
  const cohort = model.role === "owner" ? "All assigned, whole tenant" : `${formatCount(number.opportunities)} assigned this season`;
  const format = (v: number) => formatMoneyMinor(Math.round(v), number.currency, { cents: true });
  const focused = model.segments.find((s) => s.stageId === focus);

  return (
    <Surface padding="lg" className="flex flex-col gap-5">
      <div>
        <div className="text-[13px] font-medium text-fg-muted">Per opportunity</div>
        <div className="tabular mt-1 text-[44px] font-semibold leading-none tracking-tight text-fg sm:text-[52px]">
          {number.perOpportunityMinor === null ? <span className="text-fg-muted">N/A</span> : <CountUp value={number.perOpportunityMinor} format={format} delay={0.1} />}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-6 items-center rounded-[4px] bg-accent-soft px-2 text-[12px] font-medium text-accent">{formatBasis(number.basis)}</span>
          {!number.complete ? <StateChip state="partial" /> : null}
          <span className="tabular text-[12px] text-fg-subtle">{cohort}</span>
        </div>
      </div>

      <StageBar
        segments={model.segments}
        onOpen={(id) => {
          setFocus(id);
          setOpen(true);
        }}
      />

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={focused ? `${focused.label}, ${formatCount(focused.count)}` : "Funnel"}
        description={model.role === "owner" ? "Whole tenant, all assigned opportunities" : `${model.firstName}, ${seasonLabel}`}
        width={720}
      >
        <ul className="mb-5 flex flex-wrap gap-x-4 gap-y-2" aria-label="Legend">
          {model.segments.map((s) => (
            <li key={s.stageId} className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEGMENT_COLOR[s.state] }} />
              <span className={cn(s.stageId === focus && "font-semibold text-fg")}>{s.label}</span>
              <span className="tabular text-fg-subtle">{s.count}</span>
            </li>
          ))}
        </ul>
        <Funnel stages={model.funnel.stages} connectors={model.funnel.connectors} moneyStages={{}} stageVerdicts={{}} />
      </Sheet>
    </Surface>
  );
}
