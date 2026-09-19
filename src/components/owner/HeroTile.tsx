"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CaretRight } from "@phosphor-icons/react";
import type { FunnelStage, PerformanceVerdict } from "@/domain/types";
import { Surface } from "@/components/ui/Surface";
import { StateChip } from "@/components/ui/StateChip";
import { CountUp } from "@/components/ui/CountUp";
import { Sheet } from "@/components/ui/Sheet";
import { Funnel } from "@/components/metrics/Funnel";
import { useMetricDefinition } from "@/components/metrics/MetricDefinitionProvider";
import { cn } from "@/lib/cn";
import { formatBasis, formatCount, formatMoneyMinor } from "@/lib/format";
import type { EconomicsView, FlowView } from "@/lib/owner-model";

const SHORT_LABEL: Record<string, string> = {
  assigned: "Assigned",
  two_way_contact: "Contact",
  retained_booking: "Retained",
  attended: "Attended",
  perceived_qualified: "Qualified",
  won: "Won",
};

const PHONE_LABEL: Record<string, string> = {
  assigned: "Leads",
  two_way_contact: "Contact",
  retained_booking: "Booked",
  attended: "Shows",
  perceived_qualified: "Fit",
  won: "Won",
};

const SEGMENT_TONE: Record<PerformanceVerdict["state"], string> = {
  strong: "border-[color:var(--perf-strong-line)]",
  attention: "border-[color:var(--perf-attention-line)]",
  material_issue: "border-[color:var(--perf-issue-line)]",
  neutral_no_benchmark: "border-line-strong",
  provisional_small_sample: "border-dashed border-line-strong",
  data_state: "border-dashed border-line-strong",
};

export interface HeroTileProps {
  economics: EconomicsView;
  flow: FlowView;
  cohortLabel: string;
}

/** Net collected per assigned opportunity, big, with a six-segment stage bar. */
export function HeroTile({ economics, flow, cohortLabel }: HeroTileProps) {
  const sheet = useMetricDefinition();
  const reduce = useReducedMotion();
  const [funnelOpen, setFunnelOpen] = useState(false);
  const metric = economics.perOpportunity;
  const verdict = economics.perOpportunityVerdict;

  const countStages: FunnelStage[] = flow.stages.filter((s) => s.stageId in SHORT_LABEL);
  const base = countStages[0]?.count ?? 0;

  /** Verdict for a segment: the incoming connector's verdict, else the stage's own. */
  const segmentVerdict = (stage: FunnelStage, index: number): PerformanceVerdict | undefined => {
    if (index === 0) return undefined;
    const prev = countStages[index - 1];
    const connector = flow.connectors.find((c) => c.fromStageId === prev.stageId && c.toStageId === stage.stageId);
    if (connector?.metric) return connector.verdict;
    return flow.stageVerdicts[stage.stageId];
  };

  return (
    <>
      <Surface padding="md" className="flex flex-col gap-4 lg:gap-5 lg:p-6">
        <button
          type="button"
          onClick={() => sheet.open(metric, { verdict })}
          aria-label="Net collected per assigned opportunity. Open definition."
          className="group -m-2 flex flex-col gap-3 rounded-sm p-2 text-left"
        >
          <div className="flex w-full items-start justify-between gap-2">
            <span className="text-[13px] font-medium text-fg-muted">Net collected per assigned opportunity</span>
            <CaretRight size={14} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-fg-faint transition-colors group-hover:text-fg-muted" />
          </div>
          <div className="tabular text-[40px] font-semibold leading-none tracking-tight text-fg sm:text-[52px]">
            {metric.value === null ? (
              <span className="text-fg-muted">N/A</span>
            ) : (
              <CountUp value={metric.value} format={(v) => formatMoneyMinor(Math.round(v), metric.currency ?? "USD", { cents: true })} />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {metric.basis ? (
              <span className="inline-flex h-5 items-center rounded-[4px] bg-accent-soft px-1.5 text-[11px] font-medium text-accent">
                {formatBasis(metric.basis)}
              </span>
            ) : null}
            <span className="tabular text-[12px] text-fg-subtle">
              {formatMoneyMinor(metric.numerator, metric.currency ?? "USD")} over {formatCount(metric.denominator)}
            </span>
            {metric.dataState !== "complete" ? <StateChip state={metric.dataState} /> : null}
          </div>
        </button>

        <div>
          <ol className="grid w-full grid-cols-6 gap-1" aria-label="Funnel stages, tap for the full funnel">
            {countStages.map((stage, i) => {
              const v = segmentVerdict(stage, i);
              const share = base > 0 ? stage.count / base : 0;
              return (
                <motion.li
                  key={stage.stageId}
                  className="min-w-0"
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                >
                  <button
                    type="button"
                    onClick={() => setFunnelOpen(true)}
                    aria-label={`${stage.label}, ${formatCount(stage.count)}${stage.unknownCount ? `, ${stage.unknownCount} unknown` : ""}${v ? `, ${v.label}` : ""}. Open funnel.`}
                    className={cn(
                      "relative flex h-14 w-full flex-col justify-between overflow-hidden rounded-[6px] border bg-raised px-1 py-1.5 text-left transition-colors hover:bg-hover motion-reduce:transition-none sm:px-2",
                      v ? SEGMENT_TONE[v.state] : "border-line-strong",
                    )}
                  >
                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-line" />
                    <span aria-hidden className="absolute bottom-0 left-0 h-0.5 bg-fg-faint" style={{ width: `${share * 100}%` }} />
                    <span className="truncate text-[10px] font-medium leading-none text-fg-subtle sm:text-[11px]">
                      <span className="sm:hidden">{PHONE_LABEL[stage.stageId]}</span>
                      <span className="hidden sm:inline">{SHORT_LABEL[stage.stageId]}</span>
                    </span>
                    <span className="tabular truncate text-[14px] font-semibold leading-none text-fg sm:text-[16px]">
                      {formatCount(stage.count)}
                      {stage.unknownCount ? <span className="text-[10px] font-medium text-fg-subtle sm:text-[11px]">+{stage.unknownCount}?</span> : null}
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ol>
          <div className="mt-2 flex items-center justify-between text-[11px] text-fg-subtle">
            <span className="truncate">{cohortLabel}</span>
            <span className="shrink-0">Sum over sum</span>
          </div>
        </div>
      </Surface>

      <Sheet open={funnelOpen} onClose={() => setFunnelOpen(false)} title="Funnel" description={cohortLabel} width={520}>
        <Funnel
          stages={flow.stages}
          connectors={flow.connectors}
          stageVerdicts={flow.stageVerdicts}
          stageMetrics={flow.stageMetrics}
          moneyStages={flow.moneyStages}
          className="[&>div:first-child]:hidden [&>ol]:flex"
        />
      </Sheet>
    </>
  );
}
