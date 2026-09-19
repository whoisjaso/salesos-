"use client";

import { Fragment, useCallback } from "react";
import { motion, useReducedMotion } from "motion/react";
import type {
  FunnelConnector as FunnelConnectorData,
  FunnelStage,
  MetricPayload,
  PerformanceVerdict,
} from "@/domain/types";
import { cn } from "@/lib/cn";
import { FunnelCard, type FunnelCardMoney } from "./FunnelCard";
import { FunnelConnector } from "./FunnelConnector";
import { useMetricDefinition } from "./MetricDefinitionProvider";
import type { MetricDefinitionText } from "./MetricDefinitionSheet";

export interface FunnelProps {
  stages: FunnelStage[];
  connectors: FunnelConnectorData[];
  /** Verdicts keyed by stageId for the stage cards themselves. Usually only terminal stages carry one. */
  stageVerdicts?: Record<string, PerformanceVerdict>;
  /** Stage ids whose count is money in minor units, with currency and basis. */
  moneyStages?: Record<string, FunnelCardMoney>;
  /** Optional human-written definitions keyed by metricId. */
  definitions?: Partial<Record<MetricPayload["metricId"], MetricDefinitionText>>;
  /** Stage payloads keyed by stageId so a card click can open the definition sheet. */
  stageMetrics?: Record<string, MetricPayload>;
  onOpenMetric?: (metric: MetricPayload) => void;
  className?: string;
}

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Horizontal at xl and up (scrolls sideways if the viewport is too narrow),
 * vertical stack below. Cards enter with a short stagger; connectors follow.
 */
export function Funnel({
  stages,
  connectors,
  stageVerdicts,
  moneyStages,
  definitions,
  stageMetrics,
  onOpenMetric,
  className,
}: FunnelProps) {
  const reduce = useReducedMotion();
  const sheet = useMetricDefinition();

  const openMetric = useCallback(
    (metric: MetricPayload, verdict?: PerformanceVerdict) => {
      if (onOpenMetric) onOpenMetric(metric);
      else sheet.open(metric, { verdict, definition: definitions?.[metric.metricId] });
    },
    [onOpenMetric, sheet, definitions],
  );

  const connectorAfter = (stageId: string, nextId: string | undefined) =>
    nextId ? connectors.find((c) => c.fromStageId === stageId && c.toStageId === nextId) : undefined;

  const enter = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay: 0.05 + i * 0.07, ease },
        };

  return (
    <div className={cn("w-full", className)}>
      {/* Desktop: single row */}
      <div className="hidden xl:block">
        <div className="-mx-1 overflow-x-auto px-1 pb-1" style={{ scrollbarGutter: "stable" }}>
          <ol className="flex items-stretch gap-1" aria-label="Funnel stages">
            {stages.map((stage, i) => {
              const connector = connectorAfter(stage.stageId, stages[i + 1]?.stageId);
              const stageMetric = stageMetrics?.[stage.stageId];
              return (
                <Fragment key={stage.stageId}>
                  <motion.li className="min-w-0 flex-1 basis-0" {...enter(i * 2)}>
                    <FunnelCard
                      stage={stage}
                      verdict={stageVerdicts?.[stage.stageId]}
                      money={moneyStages?.[stage.stageId]}
                      delay={0.05 + i * 0.07}
                      onOpen={stageMetric ? () => openMetric(stageMetric, stageVerdicts?.[stage.stageId]) : undefined}
                    />
                  </motion.li>
                  {connector ? (
                    <motion.li className="w-[72px] shrink-0" aria-label="Connector" {...enter(i * 2 + 1)}>
                      <FunnelConnector
                        connector={connector}
                        orientation="horizontal"
                        onOpen={(m) => openMetric(m, connector.verdict)}
                      />
                    </motion.li>
                  ) : null}
                </Fragment>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Mobile and tablet: vertical stack */}
      <ol className="flex flex-col xl:hidden" aria-label="Funnel stages">
        {stages.map((stage, i) => {
          const connector = connectorAfter(stage.stageId, stages[i + 1]?.stageId);
          const stageMetric = stageMetrics?.[stage.stageId];
          return (
            <Fragment key={stage.stageId}>
              <motion.li {...enter(i * 2)}>
                <FunnelCard
                  stage={stage}
                  verdict={stageVerdicts?.[stage.stageId]}
                  money={moneyStages?.[stage.stageId]}
                  delay={0.05 + i * 0.07}
                  onOpen={stageMetric ? () => openMetric(stageMetric, stageVerdicts?.[stage.stageId]) : undefined}
                />
              </motion.li>
              {connector ? (
                <motion.li className="min-h-[64px]" aria-label="Connector" {...enter(i * 2 + 1)}>
                  <FunnelConnector
                    connector={connector}
                    orientation="vertical"
                    onOpen={(m) => openMetric(m, connector.verdict)}
                  />
                </motion.li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
