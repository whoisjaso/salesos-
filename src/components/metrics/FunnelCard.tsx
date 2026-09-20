"use client";

import type { FunnelStage, PerformanceVerdict, RevenueBasis } from "@/domain/types";
import { Surface } from "@/components/ui/Surface";
import { StateChip } from "@/components/ui/StateChip";
import { CountUp } from "@/components/ui/CountUp";
import { cn } from "@/lib/cn";
import { formatBasis, formatCount, formatMoneyMinor } from "@/lib/format";

export interface FunnelCardMoney {
  currency: string;
  basis: RevenueBasis;
}

export interface FunnelCardProps {
  stage: FunnelStage;
  /** Verdict for the stage itself. Most stages carry none; the connector carries the rate verdict. */
  verdict?: PerformanceVerdict;
  /** When set, `stage.count` is integer minor units and the basis is labeled. */
  money?: FunnelCardMoney;
  onOpen?: (stage: FunnelStage) => void;
  /** Count-up delay in seconds for staggering. */
  delay?: number;
  className?: string;
}

/** Stage name, count, cohort label, data state, supporting text, unknown count when present. */
export function FunnelCard({ stage, verdict, money, onOpen, delay = 0, className }: FunnelCardProps) {
  const clickable = Boolean(onOpen);
  const format = money ? (v: number) => formatMoneyMinor(Math.round(v / 100) * 100, money.currency) : formatCount;
  const state = verdict?.state ?? (stage.dataState !== "complete" ? "data_state" : undefined);

  return (
    <Surface
      as={clickable ? "button" : "div"}
      interactive={clickable}
      state={state}
      padding="none"
      onClick={clickable ? () => onOpen?.(stage) : undefined}
      aria-label={clickable ? `${stage.label}, ${format(stage.count)}. Open definition.` : undefined}
      className={cn("flex h-full w-full flex-col gap-3 p-4 xl:p-3.5", className)}
    >
      <div className="text-[13px] font-medium leading-snug text-fg-muted">{stage.label}</div>

      <div className="min-w-0">
        <div className={cn("tabular font-semibold leading-none tracking-tight text-fg", money ? "text-[24px] xl:text-[20px]" : "text-[26px] xl:text-[24px]")}>
          <CountUp value={stage.count} format={format} delay={delay} />
        </div>
        {money ? (
          <div className="mt-2 inline-flex h-5 max-w-full items-center whitespace-nowrap rounded-[4px] bg-accent-soft px-1.5 text-[11px] font-medium text-accent xl:px-1 xl:text-[10.5px]">
            {formatBasis(money.basis)}
          </div>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-1.5 text-[12px] leading-snug text-fg-subtle">
        {stage.supportingText ? <div className="tabular">{stage.supportingText}</div> : null}
        {stage.unknownCount ? (
          <div className="tabular text-fg-muted">{formatCount(stage.unknownCount)} unknown</div>
        ) : null}
        <div>{stage.cohortLabel}</div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {verdict ? <StateChip state={verdict.state} label={verdict.label} /> : null}
        <StateChip state={stage.dataState} />
      </div>
    </Surface>
  );
}
