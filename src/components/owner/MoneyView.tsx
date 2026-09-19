"use client";

import type { MetricDefinitionText } from "@/components/metrics/MetricDefinitionSheet";
import { useMetricDefinition } from "@/components/metrics/MetricDefinitionProvider";
import { CountUp } from "@/components/ui/CountUp";
import { DetailsRow } from "@/components/ui/DetailsRow";
import { Surface } from "@/components/ui/Surface";
import { formatMoneyMinor } from "@/lib/format";
import type { MetricPayload, PerformanceVerdict } from "@/domain/types";
import { measurementSentence, type EconomicsView, type MeasurementKey } from "@/lib/owner-model";
import { HeroCard } from "./HeroCard";
import { ProvisionalMark } from "./ProvisionalMark";

const DESCRIPTIVE: PerformanceVerdict = { state: "neutral_no_benchmark", label: "Descriptive", explanation: "" };

const DEFINITIONS: Record<"net" | "contracted" | "outstanding" | "refunds", MetricDefinitionText> = {
  net: {
    definition: "Payments collected minus refunds and dispute debits, attributed by opportunity.",
    numerator: "net collected minor units",
    denominator: "assigned opportunities in the cohort",
  },
  contracted: {
    definition: "Value of signed contracts. Not cash.",
    numerator: "signed contract value, minor units",
    denominator: "signed contracts",
  },
  outstanding: {
    definition: "Contracted value minus net collected cash.",
    numerator: "contracted minus collected, minor units",
    denominator: "signed contracts",
  },
  refunds: {
    definition: "Refund and dispute debit entries. They restate the original cohort.",
    numerator: "refund and dispute amount, minor units",
    denominator: "refund and dispute entries",
  },
};

/** Whole dollars, the way money totals read on a tile. */
function whole(metric: MetricPayload): string {
  return formatMoneyMinor(Math.round((metric.value ?? 0) / 100) * 100, metric.currency ?? "USD");
}

/** One hero, cash. One list: contracted, outstanding, refunds. Each opens its definition. */
export function MoneyView({ economics }: { economics: EconomicsView }) {
  const sheet = useMetricDefinition();
  const net = economics.netCollected;
  const currency = net.currency ?? "USD";
  const measure = economics.measurements.netCollected;
  const open = (metric: MetricPayload, definition: MetricDefinitionText) => sheet.open(metric, { verdict: DESCRIPTIVE, definition });
  const rows: { key: MeasurementKey & keyof typeof DEFINITIONS; metric: MetricPayload }[] = [
    { key: "contracted", metric: economics.contracted },
    { key: "outstanding", metric: economics.outstanding },
    { key: "refunds", metric: economics.refunds },
  ];

  return (
    <div className="flex flex-col gap-4">
      <HeroCard
        label={measure.name}
        value={net.value === null ? <span className="text-fg-muted">N/A</span> : <CountUp value={net.value} format={(v) => formatMoneyMinor(Math.round(v / 100) * 100, currency)} />}
        qualifiers={[
          measure.over,
          measure.period,
          ...(measure.provisional ? [<ProvisionalMark key="provisional" note={measure.provisional} />] : []),
        ]}
        ariaLabel={`${measurementSentence(whole(net), measure)} Open definition.`}
        onClick={() => open(net, DEFINITIONS.net)}
        data-testid="money-hero"
      />
      <Surface padding="none">
        <div className="divide-y divide-line">
          {rows.map(({ key, metric }) => {
            const m = economics.measurements[key];
            return (
              <DetailsRow
                key={key}
                label={m.name}
                hint={m.provisional ? `${m.over}, ${m.period}, ${m.provisional.label.toLowerCase()}` : `${m.over}, ${m.period}`}
                value={whole(metric)}
                ariaLabel={`${measurementSentence(whole(metric), m)} Open definition.`}
                data-testid="money-row"
                onClick={() => open(metric, DEFINITIONS[key])}
              />
            );
          })}
        </div>
      </Surface>
    </div>
  );
}
