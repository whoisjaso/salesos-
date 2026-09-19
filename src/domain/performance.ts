/**
 * Performance verdicts (SOS-20 glow policy).
 * A verdict requires a benchmark, a sample threshold, and complete data.
 * Otherwise neutral / provisional / data-state treatment. Never color-only:
 * every verdict carries a text label and an explanation.
 */
import type { Benchmark, MetricId, MetricPayload, PerformanceVerdict } from "./types";

function fmt(metric: MetricPayload, v: number | null): string {
  if (v === null) return "N/A";
  if (metric.unit === "ratio") return `${(v * 100).toFixed(1)}%`;
  if (metric.unit === "ratio_money_per_unit") return `${(v / 100).toFixed(2)} ${metric.currency ?? ""}`.trim();
  return String(v);
}

export function evaluate(metric: MetricPayload, benchmark?: Benchmark): PerformanceVerdict {
  const observed = `${metric.numerator} / ${metric.denominator}`;

  if (!benchmark) {
    return {
      state: "neutral_no_benchmark",
      label: "No benchmark",
      explanation: `Descriptive only: ${observed}. No company policy or pilot hypothesis target is set for ${metric.metricId}.`,
    };
  }

  if (metric.denominator < benchmark.minDenominator) {
    return {
      state: "provisional_small_sample",
      label: "Provisional (small sample)",
      explanation: `${observed} is below the minimum sample of ${benchmark.minDenominator} for ${benchmark.label}. Shown for information, not judged.`,
      benchmark,
    };
  }

  if (metric.dataState !== "complete" || metric.value === null) {
    const extra =
      metric.bounds !== undefined
        ? ` Observed lower bound ${fmt(metric, metric.bounds.lower)}, upper bound ${fmt(metric, metric.bounds.upper)} with ${metric.unknownCount} unresolved.`
        : "";
    return {
      state: "data_state",
      label: `Data state: ${metric.dataState}`,
      explanation: `Not judged while data is ${metric.dataState}${metric.refusalReason ? ` (${metric.refusalReason})` : ""}.${extra} Resolve the data before drawing a performance conclusion.`,
      benchmark,
    };
  }

  if (benchmark.favorableDirection === "contextual") {
    return {
      state: "neutral_no_benchmark",
      label: "Contextual",
      explanation: `${fmt(metric, metric.value)} (${observed}). Higher or lower is not automatically better for ${benchmark.label}; review the matched sample instead of a color.`,
      benchmark,
    };
  }

  const value = metric.value;
  const target = benchmark.target;
  const band = benchmark.attentionBand;
  const gap = benchmark.favorableDirection === "higher" ? target - value : value - target;
  const comparison = `${fmt(metric, value)} vs ${benchmark.origin.replace("_", " ")} target ${fmt(metric, target)} (${observed})`;

  if (gap <= 0) {
    return { state: "strong", label: "On target", explanation: `${comparison}. ${benchmark.label} meets the target.`, benchmark };
  }
  if (gap <= band) {
    return {
      state: "attention",
      label: "Needs attention",
      explanation: `${comparison}. Within the attention band of ${fmt(metric, band)} below target.`,
      benchmark,
    };
  }
  return {
    state: "material_issue",
    label: "Material issue",
    explanation: `${comparison}. Gap exceeds the attention band. Investigate data, lead mix, and capacity before attributing this to a person.`,
    benchmark,
  };
}

/** Default pilot benchmarks. Origin is pilot_hypothesis, never "industry benchmark" (SOS-20, D09). */
export const PILOT_BENCHMARKS: Benchmark[] = [
  {
    benchmarkId: "pilot_M04_two_way_contact",
    metricId: "M04",
    favorableDirection: "higher",
    target: 0.6,
    attentionBand: 0.1,
    minDenominator: 20,
    label: "Two-way contact rate",
    origin: "pilot_hypothesis",
  },
  {
    benchmarkId: "pilot_M06_retained_booking",
    metricId: "M06",
    favorableDirection: "higher",
    target: 0.5,
    attentionBand: 0.1,
    minDenominator: 20,
    label: "Retained-booking rate",
    origin: "pilot_hypothesis",
  },
  {
    benchmarkId: "pilot_M08_show_rate",
    metricId: "M08",
    favorableDirection: "higher",
    target: 0.7,
    attentionBand: 0.15,
    minDenominator: 20,
    label: "Appointment show rate",
    origin: "pilot_hypothesis",
  },
  {
    benchmarkId: "pilot_M09_perceived_qualified",
    metricId: "M09",
    favorableDirection: "contextual",
    target: 0.7,
    attentionBand: 0.15,
    minDenominator: 15,
    label: "Perceived qualified-show rate",
    origin: "pilot_hypothesis",
  },
  {
    benchmarkId: "pilot_M11_qualified_to_win",
    metricId: "M11",
    favorableDirection: "higher",
    target: 0.35,
    attentionBand: 0.1,
    minDenominator: 15,
    label: "Qualified-to-win rate",
    origin: "pilot_hypothesis",
  },
  {
    benchmarkId: "pilot_M12_show_to_win",
    metricId: "M12",
    favorableDirection: "higher",
    target: 0.25,
    attentionBand: 0.08,
    minDenominator: 20,
    label: "Show-to-win rate",
    origin: "pilot_hypothesis",
  },
];

export function defaultBenchmarkFor(metricId: MetricId): Benchmark | undefined {
  return PILOT_BENCHMARKS.find((b) => b.metricId === metricId);
}
