"use client";

import { ArrowsSplit, CaretRight } from "@phosphor-icons/react";
import type { FunnelConnector as FunnelConnectorData, MetricPayload } from "@/domain/types";
import { CHIP_SPEC } from "@/components/ui/StateChip";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { formatFraction, formatPercent } from "@/lib/format";

export interface FunnelConnectorProps {
  connector: FunnelConnectorData;
  orientation?: "horizontal" | "vertical";
  onOpen?: (metric: MetricPayload, connector: FunnelConnectorData) => void;
  className?: string;
}

const LINE: Record<string, string> = {
  strong: "var(--perf-strong-line)",
  attention: "var(--perf-attention-line)",
  material_issue: "var(--perf-issue-line)",
  neutral_no_benchmark: "var(--perf-neutral-line)",
  provisional_small_sample: "var(--perf-neutral-line)",
  data_state: "var(--line-strong)",
};

const TONE_TEXT: Record<string, string> = {
  strong: "text-perf-strong",
  attention: "text-perf-attention",
  issue: "text-perf-issue",
  neutral: "text-fg-muted",
  data: "text-fg-muted",
};

/**
 * The rate between two stages. Valid ratio: percent, "n of d", verdict label.
 * Null metric: a split-path marker; the refusal reason lives in a tooltip and in the sheet.
 */
export function FunnelConnector({ connector, orientation = "horizontal", onOpen, className }: FunnelConnectorProps) {
  const { metric, verdict } = connector;
  const spec = CHIP_SPEC[verdict.state];
  const Icon = spec.icon;
  const lineColor = LINE[verdict.state];
  const dashed = verdict.state === "provisional_small_sample" || verdict.state === "data_state";
  const vertical = orientation === "vertical";

  const rail = (
    <span
      aria-hidden
      className={cn("block shrink-0", vertical ? "h-full w-px" : "h-px w-full")}
      style={{
        background: dashed
          ? `repeating-linear-gradient(${vertical ? "180deg" : "90deg"}, ${lineColor} 0 4px, transparent 4px 8px)`
          : lineColor,
      }}
    />
  );

  const label = (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium leading-tight",
        !vertical && "max-w-[72px] justify-center text-center",
        TONE_TEXT[spec.tone],
      )}
    >
      <Icon size={12} weight="bold" aria-hidden className="shrink-0" />
      <span>{verdict.label}</span>
    </span>
  );

  const body =
    metric === null ? (
      <Tooltip
        content={
          <span>
            <span className="font-medium">No rate. </span>
            {verdict.explanation}
          </span>
        }
      >
        <span
          tabIndex={0}
          className="flex flex-col items-center gap-1.5 rounded-sm px-1 py-1 text-fg-muted"
          aria-label={`Split path. ${verdict.explanation}`}
        >
          <ArrowsSplit size={18} weight="bold" aria-hidden />
          <span className="text-[11px] font-medium leading-none">Split path</span>
          {label}
        </span>
      </Tooltip>
    ) : (
      <button
        type="button"
        onClick={onOpen ? () => onOpen(metric, connector) : undefined}
        aria-label={`${metric.label} ${formatPercent(metric.value)}, ${formatFraction(metric.numerator, metric.denominator)}, ${verdict.label}. Open definition.`}
        className={cn(
          "group flex flex-col items-center gap-1 rounded-sm px-1.5 py-1 transition-colors hover:bg-hover motion-reduce:transition-none",
          vertical && "flex-row gap-3",
        )}
      >
        <span className={cn("flex flex-col items-center", vertical && "items-start")}>
          <span className="tabular text-[15px] font-semibold leading-none tracking-tight text-fg">
            {metric.refusalReason ? "N/A" : formatPercent(metric.value)}
          </span>
          <span className="tabular mt-1 text-[11px] leading-none text-fg-subtle">
            {formatFraction(metric.numerator, metric.denominator)}
          </span>
        </span>
        {label}
      </button>
    );

  if (vertical) {
    return (
      <div className={cn("flex items-stretch gap-4 pl-4", className)}>
        <div className="flex w-4 flex-col items-center py-1">{rail}</div>
        <div className="flex items-center py-2">{body}</div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col items-center justify-center gap-1.5", className)}>
      <div className="flex w-full items-center gap-1">
        {rail}
        <CaretRight size={10} weight="bold" aria-hidden style={{ color: lineColor }} className="shrink-0" />
      </div>
      {body}
    </div>
  );
}
