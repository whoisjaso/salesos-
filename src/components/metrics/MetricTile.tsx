"use client";

import { CaretRight } from "@phosphor-icons/react";
import type { MetricPayload, PerformanceVerdict } from "@/domain/types";
import { Surface } from "@/components/ui/Surface";
import { StateChip } from "@/components/ui/StateChip";
import { Sparkline } from "@/components/ui/Sparkline";
import { CountUp } from "@/components/ui/CountUp";
import { cn } from "@/lib/cn";
import { formatBasis, formatCount, formatFraction, formatMoneyMinor, formatPercent } from "@/lib/format";
import { useMetricDefinition } from "./MetricDefinitionProvider";
import { formatMetricValue, type MetricDefinitionText } from "./MetricDefinitionSheet";

export interface MetricTileProps {
  metric: MetricPayload;
  verdict?: PerformanceVerdict;
  /** Recent values for the trend line. */
  sparkline?: number[];
  sparklineTitle?: string;
  definition?: MetricDefinitionText;
  /** Override the default behavior of opening the shared definition sheet. */
  onOpen?: (metric: MetricPayload) => void;
  /** Delay (s) for the count-up, to stagger a row of tiles. */
  delay?: number;
  className?: string;
}

/**
 * Label, value, basis chip for money, "n of d" line, verdict or data-state chip,
 * optional sparkline. The whole tile is a button that opens the definition.
 */
export function MetricTile({ metric, verdict, sparkline, sparklineTitle, definition, onOpen, delay = 0, className }: MetricTileProps) {
  const sheet = useMetricDefinition();
  const isMoney = metric.unit === "money_minor" || metric.unit === "ratio_money_per_unit";
  const isRatio = metric.unit === "ratio";
  const open = () => (onOpen ? onOpen(metric) : sheet.open(metric, { verdict, definition }));

  const valueNode =
    metric.value === null ? (
      <span className="text-fg-muted">N/A</span>
    ) : isRatio ? (
      <CountUp value={metric.value} format={(v) => formatPercent(v)} delay={delay} />
    ) : metric.unit === "count" ? (
      <CountUp value={metric.value} format={formatCount} delay={delay} />
    ) : isMoney ? (
      <CountUp
        value={metric.value}
        format={(v) =>
          metric.unit === "ratio_money_per_unit"
            ? formatMoneyMinor(Math.round(v), metric.currency ?? "USD", { cents: true })
            : formatMoneyMinor(Math.round(v / 100) * 100, metric.currency ?? "USD")
        }
        delay={delay}
      />
    ) : (
      <span>{formatMetricValue(metric)}</span>
    );

  return (
    <Surface
      as="button"
      interactive
      state={verdict?.state}
      padding="md"
      onClick={open}
      aria-label={`${metric.label}, ${formatMetricValue(metric)}. Open definition.`}
      className={cn("group flex w-full flex-col gap-3", className)}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-muted">{metric.label}</span>
        <CaretRight
          size={14}
          weight="bold"
          aria-hidden
          className="mt-0.5 shrink-0 text-fg-faint transition-colors group-hover:text-fg-muted"
        />
      </div>

      <div className="flex w-full items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="tabular text-[28px] font-semibold leading-none tracking-tight text-fg">{valueNode}</div>
          {isRatio ? (
            <div className="tabular mt-2 text-[12px] text-fg-subtle">
              {formatFraction(metric.numerator, metric.denominator)}
              {metric.unknownCount > 0 ? <span>, {formatCount(metric.unknownCount)} unknown</span> : null}
            </div>
          ) : isMoney && metric.basis ? (
            <div className="mt-2 inline-flex h-5 items-center rounded-[4px] bg-accent-soft px-1.5 text-[11px] font-medium text-accent">
              {formatBasis(metric.basis)}
            </div>
          ) : null}
        </div>
        {sparkline ? (
          <Sparkline values={sparkline} title={sparklineTitle ?? `${metric.label}, recent trend`} className="mb-0.5" />
        ) : null}
      </div>

      <div className="flex w-full items-center gap-2">
        {verdict ? <StateChip state={verdict.state} label={verdict.label} /> : <StateChip state={metric.dataState} />}
        {verdict && metric.dataState !== "complete" ? <StateChip state={metric.dataState} /> : null}
      </div>
    </Surface>
  );
}
