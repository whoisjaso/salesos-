import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type {
  FunnelConnector as FunnelConnectorData,
  FunnelStage,
  MetricPayload,
  PerformanceVerdict,
} from "@/domain/types";
import { PageHeader } from "@/components/shell/PageHeader";
import { Funnel } from "@/components/metrics/Funnel";
import { MetricTile } from "@/components/metrics/MetricTile";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";
import { StateChip } from "@/components/ui/StateChip";
import { Kbd } from "@/components/ui/Kbd";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { NAV_ITEMS } from "@/components/shell/nav";

export const metadata: Metadata = { title: "Command" };

/*
  Demo props. Source reproduction of the SOS-01 Ben example, reported revenue basis,
  August 2026 reading. Numbers are fixture values, not live data.
*/

const AS_OF = "2026-08-31T09:00:00Z";
const COHORT = "Aug 2026, assigned source leads";

function metric(partial: Partial<MetricPayload> & Pick<MetricPayload, "metricId" | "label" | "numerator" | "denominator">): MetricPayload {
  const value = partial.value !== undefined ? partial.value : partial.denominator === 0 ? null : partial.numerator / partial.denominator;
  return {
    definitionVersion: "1.0.0",
    unit: "ratio",
    unknownCount: 0,
    cohortId: COHORT,
    timeBasis: "accountability start in August 2026, matured to Aug 31",
    asOf: AS_OF,
    comparisonStatus: "descriptive_only",
    benchmarkId: null,
    dataState: "complete",
    evidenceQueryId: `eq_${partial.metricId.toLowerCase()}_aug26`,
    ...partial,
    value,
  };
}

const stages: FunnelStage[] = [
  { stageId: "leads", label: "Assigned source leads", count: 129, dataState: "complete", cohortLabel: "Aug 2026" },
  { stageId: "retained", label: "Retained bookings", count: 85, parentStageId: "leads", metricId: "M02", dataState: "complete", cohortLabel: "Aug 2026", supportingText: "85 retained / 129 leads" },
  { stageId: "shows", label: "Shows", count: 71, parentStageId: "retained", metricId: "M03", dataState: "complete", cohortLabel: "Aug 2026", supportingText: "71 attended / 85 retained" },
  { stageId: "qualified", label: "Perceived qualified", count: 58, parentStageId: "shows", metricId: "M04", dataState: "complete", cohortLabel: "Aug 2026", supportingText: "58 likely fit / 71 shows" },
  { stageId: "wins", label: "Wins", count: 21, parentStageId: "qualified", metricId: "M05", dataState: "complete", cohortLabel: "Aug 2026", supportingText: "21 won / 58 qualified" },
  { stageId: "revenue", label: "Reported revenue", count: 68_600_000, parentStageId: "wins", metricId: "M06", dataState: "partial", cohortLabel: "Aug 2026", supportingText: "Basis not reconciled to cash" },
];

const verdict = (state: PerformanceVerdict["state"], label: string, explanation: string, benchmark?: PerformanceVerdict["benchmark"]): PerformanceVerdict => ({
  state,
  label,
  explanation,
  benchmark,
});

const connectors: FunnelConnectorData[] = [
  {
    fromStageId: "leads",
    toStageId: "retained",
    metric: metric({ metricId: "M02", label: "Booking rate", numerator: 85, denominator: 129 }),
    verdict: verdict("neutral_no_benchmark", "No benchmark", "No approved target for booking rate yet. Shown as a descriptive rate only."),
  },
  {
    fromStageId: "retained",
    toStageId: "shows",
    metric: metric({ metricId: "M03", label: "Show rate", numerator: 71, denominator: 85, comparisonStatus: "benchmarked", benchmarkId: "bm_show_pilot_v1" }),
    verdict: verdict("strong", "On target", "83.5% attended against a pilot target of 80%. 85 retained bookings clear the minimum sample of 40.", {
      benchmarkId: "bm_show_pilot_v1",
      metricId: "M03",
      favorableDirection: "higher",
      target: 0.8,
      attentionBand: 0.08,
      minDenominator: 40,
      label: "Show rate, pilot target",
      origin: "pilot_hypothesis",
    }),
  },
  {
    fromStageId: "shows",
    toStageId: "qualified",
    metric: metric({ metricId: "M04", label: "Perceived qualified rate", numerator: 58, denominator: 71 }),
    verdict: verdict("neutral_no_benchmark", "Contextual", "Fit is a contextual measure. A higher or lower rate is not automatically better."),
  },
  {
    fromStageId: "qualified",
    toStageId: "wins",
    metric: metric({ metricId: "M05", label: "Close rate", numerator: 21, denominator: 58, comparisonStatus: "benchmarked", benchmarkId: "bm_close_pilot_v1" }),
    verdict: verdict("attention", "Needs attention", "36.2% closed against a pilot target of 42%. Inside the attention band, not a material issue. 58 qualified is above the minimum sample.", {
      benchmarkId: "bm_close_pilot_v1",
      metricId: "M05",
      favorableDirection: "higher",
      target: 0.42,
      attentionBand: 0.1,
      minDenominator: 30,
      label: "Close rate, pilot target",
      origin: "pilot_hypothesis",
    }),
  },
  {
    fromStageId: "wins",
    toStageId: "revenue",
    metric: null,
    verdict: verdict("data_state", "Not a rate", "Reported revenue is a money total, not a subset of wins. No rate is computed between these two cards."),
  },
];

const tiles: { metric: MetricPayload; verdict?: PerformanceVerdict; sparkline?: number[] }[] = [
  {
    metric: metric({
      metricId: "M07",
      label: "Revenue per assigned lead",
      numerator: 68_600_000,
      denominator: 129,
      unit: "ratio_money_per_unit",
      currency: "USD",
      basis: "reported_revenue",
      dataState: "partial",
      value: 68_600_000 / 129,
    }),
    verdict: verdict("neutral_no_benchmark", "Descriptive", "Primary efficiency metric. No target until the cash basis is reconciled."),
    sparkline: [4120, 4460, 4390, 4810, 5020, 4930, 5318],
  },
  {
    metric: metric({ metricId: "M03", label: "Show rate", numerator: 71, denominator: 85, comparisonStatus: "benchmarked", benchmarkId: "bm_show_pilot_v1" }),
    verdict: connectors[1].verdict,
    sparkline: [0.74, 0.78, 0.76, 0.81, 0.79, 0.82, 0.835],
  },
  {
    metric: metric({ metricId: "M05", label: "Close rate", numerator: 21, denominator: 58, comparisonStatus: "benchmarked", benchmarkId: "bm_close_pilot_v1" }),
    verdict: connectors[3].verdict,
    sparkline: [0.41, 0.39, 0.44, 0.4, 0.37, 0.38, 0.362],
  },
  {
    metric: metric({
      metricId: "M09",
      label: "Attendance, September cohort",
      numerator: 12,
      denominator: 19,
      unknownCount: 7,
      cohortId: "Sep 2026, assigned source leads",
      dataState: "immature",
      comparisonStatus: "provisional",
      bounds: { lower: 12 / 26, upper: 19 / 26 },
    }),
    verdict: verdict("provisional_small_sample", "Small sample", "19 matured of 26 booked. 7 outcomes still unknown. Reading stays provisional until the 30-day horizon."),
  },
];

const stageMetrics: Record<string, MetricPayload> = {
  leads: metric({ metricId: "M01", label: "Assigned source leads", numerator: 129, denominator: 129, unit: "count", value: 129 }),
  retained: connectors[0].metric!,
  shows: connectors[1].metric!,
  qualified: connectors[2].metric!,
  wins: connectors[3].metric!,
  revenue: metric({
    metricId: "M06",
    label: "Reported revenue",
    numerator: 68_600_000,
    denominator: 21,
    unit: "money_minor",
    currency: "USD",
    basis: "reported_revenue",
    dataState: "partial",
    value: 68_600_000,
  }),
};

const roleLinks = NAV_ITEMS.filter((it) => it.href !== "/");

export default function CommandPage() {
  return (
    <>
      <PageHeader
        title="Command"
        subtitle="Source reproduction, reported revenue basis, August 2026 reading."
        actions={
          <Button href="/owner" variant="secondary" size="sm" trailing={<ArrowRight size={14} weight="bold" />}>
            Owner view
          </Button>
        }
      />

      <section aria-labelledby="funnel-heading" className="mb-10">
        <h2 id="funnel-heading" className="sr-only">
          Funnel
        </h2>
        <Funnel
          stages={stages}
          connectors={connectors}
          stageMetrics={stageMetrics}
          moneyStages={{ revenue: { currency: "USD", basis: "reported_revenue" } }}
          stageVerdicts={{}}
        />
      </section>

      <section aria-labelledby="tiles-heading" className="mb-10">
        <h2 id="tiles-heading" className="mb-3 text-[13px] font-medium text-fg-subtle">
          Efficiency and quality
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <MetricTile key={t.metric.metricId + i} metric={t.metric} verdict={t.verdict} sparkline={t.sparkline} delay={0.1 + i * 0.06} />
          ))}
        </div>
      </section>

      <section aria-labelledby="roles-heading" className="mb-10">
        <h2 id="roles-heading" className="mb-3 text-[13px] font-medium text-fg-subtle">
          Views
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {roleLinks.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="surface flex h-full flex-col gap-3 p-4 transition-colors hover:bg-hover motion-reduce:transition-none"
                >
                  <Icon size={20} weight="regular" aria-hidden className="text-accent" />
                  <span className="text-[14px] font-medium text-fg">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="system-heading">
        <h2 id="system-heading" className="mb-3 text-[13px] font-medium text-fg-subtle">
          Visual language
        </h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[3fr_2fr]">
          <Surface padding="md" className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <StateChip state="strong" />
              <StateChip state="attention" />
              <StateChip state="material_issue" />
              <StateChip state="neutral_no_benchmark" />
              <StateChip state="provisional_small_sample" />
              <StateChip state="stale" />
              <StateChip state="unknown" />
              <StateChip state="partial" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Surface state="strong" padding="sm" className="text-[12px] text-fg-muted">Strong</Surface>
              <Surface state="attention" padding="sm" className="text-[12px] text-fg-muted">Attention</Surface>
              <Surface state="material_issue" padding="sm" className="text-[12px] text-fg-muted">Material issue</Surface>
              <Surface state="provisional_small_sample" padding="sm" className="text-[12px] text-fg-muted">Provisional</Surface>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Primary</Button>
              <Button size="sm" variant="secondary">Secondary</Button>
              <Button size="sm" variant="ghost">Ghost</Button>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-fg-subtle">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </div>
          </Surface>
          <Surface padding="md" className="flex items-center gap-5">
            <ProgressRing value={0.62} label="Mission progress" />
            <div className="min-w-0 flex-1">
              <Skeleton height={24} width="56%" />
              <SkeletonText lines={2} className="mt-3" />
            </div>
          </Surface>
        </div>
      </section>
    </>
  );
}
