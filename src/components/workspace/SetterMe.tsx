"use client";

import { useMemo } from "react";
import { Flask, HandCoins } from "@phosphor-icons/react";
import type { Dataset } from "@/domain/metrics";
import { computeFunnel, computeMetric } from "@/domain/metrics";
import { RulesCoachingEngine } from "@/domain/coaching";
import { Surface } from "@/components/ui/Surface";
import { StateChip } from "@/components/ui/StateChip";
import { formatCount, formatMoneyMinor } from "@/lib/format";
import { formatDayIn, TENANT_TZ } from "@/lib/workspace-setter";

export interface SetterMeProps {
  dataset: Dataset;
  userId: string;
  now: string;
}

/** Personal funnel, earnings (M19), one coaching card. All numbers carry their denominators. */
export function SetterMe({ dataset, userId, now }: SetterMeProps) {
  const funnel = useMemo(() => computeFunnel(dataset, { userId, role: "setter" }, now), [dataset, userId, now]);
  const m19 = useMemo(() => computeMetric("M19", dataset, { userId, role: "setter" }, now), [dataset, userId, now]);
  const rec = useMemo(() => RulesCoachingEngine.recommend(dataset, userId, now)[0], [dataset, userId, now]);
  const max = Math.max(1, ...funnel.stages.map((s) => s.count));
  const stages = funnel.stages.filter((s) => s.stageId !== "net_collected_cash");

  return (
    <div className="flex flex-col gap-3">
      <Surface padding="md">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-fg-muted">Funnel</h3>
          <span className="text-[11px] text-fg-subtle">My assigned</span>
        </div>
        <ol className="flex flex-col gap-2">
          {stages.map((s) => (
            <li key={s.stageId} className="grid grid-cols-[92px_1fr_32px] items-center gap-2 text-[12px]">
              <span className="truncate text-fg-muted">{s.label.replace("opportunities", "").replace("Perceived qualified", "Qualified")}</span>
              <span className="h-2 overflow-hidden rounded-full bg-sunken">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (s.count / max) * 100)}%` }} />
              </span>
              <span className="tabular text-right font-medium text-fg">{formatCount(s.count)}</span>
            </li>
          ))}
        </ol>
      </Surface>

      <Surface padding="md">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-fg-muted">
            <HandCoins size={14} aria-hidden />
            Per attended appointment
          </h3>
          {dataset.commissionPolicy.hypothetical ? (
            <span className="inline-flex h-5 items-center rounded-[4px] border border-dashed border-line-strong px-1.5 text-[11px] text-fg-muted">Hypothetical policy</span>
          ) : null}
        </div>
        <div className="tabular mt-2 text-[26px] font-semibold leading-none text-fg">
          {m19.value === null ? "N/A" : formatMoneyMinor(Math.round(m19.value), m19.currency ?? "USD", { cents: true })}
        </div>
        <div className="tabular mt-1.5 text-[12px] text-fg-subtle">
          {formatMoneyMinor(m19.numerator, m19.currency ?? "USD")} over {formatCount(m19.denominator)} attended. Not an hourly rate.
        </div>
      </Surface>

      {rec ? (
        <Surface padding="md" state={rec.suppressed ? "data_state" : undefined}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-medium text-fg-muted">Coaching</h3>
            <StateChip state={rec.dataState} />
          </div>
          <div className="mt-1.5 text-[15px] font-semibold leading-snug text-fg">{rec.title}</div>
          <dl className="mt-2 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[12.5px]">
            <dt className="text-fg-subtle">Observed</dt>
            <dd className="tabular text-fg">{rec.observed}</dd>
            <dt className="text-fg-subtle">Action</dt>
            <dd className="text-fg">{rec.action}</dd>
            <dt className="text-fg-subtle">Review</dt>
            <dd className="tabular text-fg">{formatDayIn(rec.reviewAt, TENANT_TZ)}</dd>
          </dl>
          {rec.scenario ? (
            <div className="mt-2 inline-flex h-6 items-center gap-1 rounded-sm border border-dashed border-line-strong px-2 text-[11px] text-fg-muted">
              <Flask size={11} aria-hidden />
              {rec.scenario.disclaimer}
            </div>
          ) : null}
        </Surface>
      ) : null}
    </div>
  );
}
