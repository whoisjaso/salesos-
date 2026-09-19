"use client";

import type { ReactNode } from "react";
import type { MetricPayload, PerformanceVerdict } from "@/domain/types";
import { Sheet } from "@/components/ui/Sheet";
import { StateChip } from "@/components/ui/StateChip";
import { formatAsOf, formatBasis, formatCount, formatMoneyMinor, formatPercent } from "@/lib/format";

/** Optional human-written definition text. Falls back to what the payload itself declares. */
export interface MetricDefinitionText {
  definition: string;
  numerator: string;
  denominator: string;
  maturity?: string;
}

export interface MetricDefinitionSheetProps {
  open: boolean;
  onClose: () => void;
  metric: MetricPayload | null;
  verdict?: PerformanceVerdict;
  definition?: MetricDefinitionText;
}

const COMPARISON_LABEL: Record<MetricPayload["comparisonStatus"], string> = {
  descriptive_only: "Descriptive only",
  benchmarked: "Benchmarked",
  provisional: "Provisional",
};

const BENCHMARK_ORIGIN: Record<NonNullable<PerformanceVerdict["benchmark"]>["origin"], string> = {
  company_policy: "company policy",
  pilot_hypothesis: "pilot hypothesis",
  experiment: "experiment",
};

export function formatMetricValue(metric: MetricPayload): string {
  if (metric.value === null) return "N/A";
  switch (metric.unit) {
    case "ratio":
      return formatPercent(metric.value);
    case "count":
      return formatCount(metric.value);
    case "money_minor":
      return formatMoneyMinor(metric.value, metric.currency ?? "USD");
    case "ratio_money_per_unit":
      return formatMoneyMinor(metric.value, metric.currency ?? "USD", { cents: true });
    case "seconds":
      return `${formatCount(Math.round(metric.value / 60))} min`;
  }
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 text-[13px]">
      <dt className="text-fg-subtle">{term}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  );
}

/** Definition, numerator, denominator, cohort, maturity, data state, basis. Opened from any metric. */
export function MetricDefinitionSheet({ open, onClose, metric, verdict, definition }: MetricDefinitionSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={metric ? metric.label : "Metric"}
      description={metric ? `${metric.metricId}, definition ${metric.definitionVersion}` : undefined}
    >
      {metric ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="tabular text-[32px] font-semibold leading-none tracking-tight text-fg">
                {formatMetricValue(metric)}
              </div>
              {metric.unit === "ratio" ? (
                <div className="tabular mt-1.5 text-[13px] text-fg-muted">
                  {formatCount(metric.numerator)} of {formatCount(metric.denominator)}
                  {metric.unknownCount > 0 ? `, ${formatCount(metric.unknownCount)} unknown` : ""}
                </div>
              ) : null}
            </div>
            {verdict ? <StateChip state={verdict.state} label={verdict.label} size="md" /> : <StateChip state={metric.dataState} size="md" />}
          </div>

          {verdict?.explanation ? (
            <p className="text-[14px] leading-relaxed text-fg-muted">{verdict.explanation}</p>
          ) : null}

          {metric.refusalReason ? (
            <div className="rounded-sm border border-dashed border-line-strong px-3 py-2.5 text-[13px] text-fg-muted">
              <span className="font-medium text-fg">Rate not computed. </span>
              {metric.refusalReason}
            </div>
          ) : null}

          <dl className="divide-y divide-line border-t border-line">
            <Row term="Definition">
              {definition?.definition ?? `${metric.label} for the ${metric.cohortId} cohort, ${metric.timeBasis}.`}
            </Row>
            <Row term="Numerator">
              <span className="tabular">{formatCount(metric.numerator)}</span>
              {definition?.numerator ? <span className="text-fg-muted">, {definition.numerator}</span> : null}
            </Row>
            <Row term="Denominator">
              <span className="tabular">{formatCount(metric.denominator)}</span>
              {definition?.denominator ? <span className="text-fg-muted">, {definition.denominator}</span> : null}
            </Row>
            {metric.unknownCount > 0 ? (
              <Row term="Unknown">
                <span className="tabular">{formatCount(metric.unknownCount)}</span>
                <span className="text-fg-muted"> records without a confirmed outcome</span>
              </Row>
            ) : null}
            {metric.bounds ? (
              <Row term="Bounds">
                <span className="tabular">
                  {formatPercent(metric.bounds.lower)} to {formatPercent(metric.bounds.upper)}
                </span>
                <span className="text-fg-muted"> depending on unknown outcomes</span>
              </Row>
            ) : null}
            <Row term="Cohort">{metric.cohortId}</Row>
            <Row term="Time basis">{metric.timeBasis}</Row>
            <Row term="Maturity">{definition?.maturity ?? (metric.dataState === "immature" ? "Cohort has not reached the maturity horizon" : "Matured records only")}</Row>
            <Row term="Data state">
              <StateChip state={metric.dataState} />
            </Row>
            <Row term="Comparison">
              {COMPARISON_LABEL[metric.comparisonStatus]}
              {verdict?.benchmark ? (
                <span className="text-fg-muted">
                  , target {verdict.benchmark.favorableDirection === "contextual" ? "contextual" : formatPercent(verdict.benchmark.target)} ({BENCHMARK_ORIGIN[verdict.benchmark.origin]})
                </span>
              ) : null}
            </Row>
            {metric.basis ? <Row term="Basis">{formatBasis(metric.basis)}</Row> : null}
            <Row term="As of">
              <span className="tabular">{formatAsOf(metric.asOf)}</span>
            </Row>
            <Row term="Evidence">
              <span className="font-mono text-[12px] text-fg-muted">{metric.evidenceQueryId}</span>
            </Row>
          </dl>
        </div>
      ) : null}
    </Sheet>
  );
}
