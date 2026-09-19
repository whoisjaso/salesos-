"use client";

import { MetricTile } from "@/components/metrics/MetricTile";
import type { MetricDefinitionText } from "@/components/metrics/MetricDefinitionSheet";
import type { PerformanceVerdict } from "@/domain/types";
import type { EconomicsView } from "@/lib/owner-model";

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

/** Two up on a phone, four across on desktop. */
export function MoneyView({ economics }: { economics: EconomicsView }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricTile metric={economics.netCollected} verdict={DESCRIPTIVE} definition={DEFINITIONS.net} delay={0.05} />
      <MetricTile metric={economics.contracted} verdict={DESCRIPTIVE} definition={DEFINITIONS.contracted} delay={0.1} />
      <MetricTile metric={economics.outstanding} verdict={DESCRIPTIVE} definition={DEFINITIONS.outstanding} delay={0.15} />
      <MetricTile
        metric={{ ...economics.refunds, label: `Refunds and disputes (${economics.refundCount})` }}
        verdict={DESCRIPTIVE}
        definition={DEFINITIONS.refunds}
        delay={0.2}
      />
    </div>
  );
}
