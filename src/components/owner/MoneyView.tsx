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

const DEFINITIONS: Record<"net" | "contracted" | "outstanding" | "refunds" | "atRisk" | "fees", MetricDefinitionText> = {
  /**
   * The written basis, said where the figure is read (NET_COLLECTED_CASH_POLICY
   * in src/domain/types.ts). Every clause here is a rule the reducer enforces,
   * not a description of intent.
   */
  net: {
    definition:
      "Processor-confirmed payments in the live environment, minus confirmed refunds and lost disputes, attributed by opportunity. An invoice marked paid outside the processor, an imported spreadsheet row, a card authorization, a successful checkout redirect and a test-mode movement are recorded and are not counted here. Processing fees are excluded and reported separately. An open dispute is money at risk and is never subtracted.",
    numerator: "processor-confirmed net collected, minor units",
    denominator: "assigned opportunities in the cohort",
  },
  contracted: {
    definition: "Value of signed contracts. Not cash. A discount reduces this figure, never collected cash.",
    numerator: "signed contract value, minor units",
    denominator: "signed contracts",
  },
  outstanding: {
    definition: "Contracted value minus net collected cash.",
    numerator: "contracted minus collected, minor units",
    denominator: "signed contracts",
  },
  refunds: {
    definition:
      "Confirmed refunds and lost disputes. They restate the period the original payment belongs to and never delete the sale. An opened dispute is not in this figure: it is at risk until it is decided.",
    numerator: "refund and lost-dispute amount, minor units",
    denominator: "refund and lost-dispute entries",
  },
  atRisk: {
    definition:
      "Money in disputes that are open and not yet decided. Disclosed beside collected cash and never subtracted from it. A lost dispute debits exactly once, and then leaves this figure.",
    numerator: "open dispute amount, minor units",
    denominator: "open disputes",
  },
  fees: {
    definition: "Processor fees. A cost, not a negative sale, so they are excluded from collected cash and reported on their own.",
    numerator: "fee amount, minor units",
    denominator: "fee entries",
  },
};

/** Whole dollars, the way money totals read on a tile. */
function whole(metric: MetricPayload): string {
  return formatMoneyMinor(Math.round((metric.value ?? 0) / 100) * 100, metric.currency ?? "USD");
}

export interface MoneyViewProps {
  economics: EconomicsView;
  /**
   * Money in disputes that are open and not yet decided. Reported beside cash
   * and never inside it. Rendered only when a caller supplies it: a figure this
   * screen cannot compute is left unsaid rather than shown as zero.
   *
   * `src/lib/owner-model.ts` (not owned by this change) has the ledger and can
   * fill it from `disputeAtRisk`; `OwnerDashboard` then passes it through.
   */
  atRisk?: MetricPayload | null;
  /** Processing fees, excluded from cash and reported separately. Same contract as `atRisk`. */
  fees?: MetricPayload | null;
}

/** One hero, cash. One list: contracted, outstanding, refunds. Each opens its definition. */
export function MoneyView({ economics, atRisk = null, fees = null }: MoneyViewProps) {
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
                // The row's own denominator and period; the name already carries the basis,
                // and the definition sheet one tap in carries the rest.
                hint={
                  <>
                    {`${m.count}, ${m.period}`}
                    {m.provisional ? <span className="font-medium text-fg">{`. ${m.provisional.label}.`}</span> : null}
                  </>
                }
                value={whole(metric)}
                ariaLabel={`${measurementSentence(whole(metric), m)} Open definition.`}
                data-testid="money-row"
                onClick={() => open(metric, DEFINITIONS[key])}
              />
            );
          })}
        </div>
      </Surface>

      {/*
        Reported separately, never summed into the hero. Each carries its own
        period and its own denominator, and each says in one line why it is not
        part of collected cash (specification 17.5).
      */}
      {atRisk || fees ? (
        <Surface padding="none">
          <div className="divide-y divide-line">
            {atRisk ? (
              <DetailsRow
                label="At risk"
                hint={`Open disputes, ${measure.period}. Not subtracted from cash.`}
                value={whole(atRisk)}
                ariaLabel={`At risk, ${whole(atRisk)}. Open disputes, not yet decided, ${measure.period}. Never subtracted from collected cash. Open definition.`}
                data-testid="money-disclosure-row"
                onClick={() => open(atRisk, DEFINITIONS.atRisk)}
              />
            ) : null}
            {fees ? (
              <DetailsRow
                label="Processing fees"
                hint={`${measure.period}. Excluded from collected cash.`}
                value={whole(fees)}
                ariaLabel={`Processing fees, ${whole(fees)}. ${measure.period}. Excluded from collected cash and reported separately. Open definition.`}
                data-testid="money-disclosure-row"
                onClick={() => open(fees, DEFINITIONS.fees)}
              />
            ) : null}
          </div>
        </Surface>
      ) : null}
    </div>
  );
}
