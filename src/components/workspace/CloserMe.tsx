"use client";

import { useMemo } from "react";
import { Flask, Info } from "@phosphor-icons/react";
import type { Dataset } from "@/domain/metrics";
import { computeMetric } from "@/domain/metrics";
import { RulesCoachingEngine } from "@/domain/coaching";
import { Surface } from "@/components/ui/Surface";
import { StateChip } from "@/components/ui/StateChip";
import { formatCount, formatFraction, formatMoneyMinor, formatPercent } from "@/lib/format";
import { formatDayIn, TENANT_TZ } from "@/lib/workspace-setter";
import { closerStats } from "@/lib/workspace-closer";

export function CloserMe({ dataset, userId, now }: { dataset: Dataset; userId: string; now: string }) {
  const stats = useMemo(() => closerStats(dataset, userId), [dataset, userId]);
  const m12 = useMemo(() => computeMetric("M12", dataset, { userId, role: "closer" }, now), [dataset, userId, now]);
  const rec = useMemo(() => RulesCoachingEngine.recommend(dataset, userId, now)[0], [dataset, userId, now]);

  return (
    <div className="flex flex-col gap-3">
      <Surface padding="md">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <Stat value={formatCount(stats.attended)} label="Attended" />
          <Stat value={formatCount(stats.wins)} label="Wins" />
          <Stat value={formatMoneyMinor(stats.netCollectedMinor, stats.currency)} label="Net collected" sub="Ledger, after refunds" />
          <Stat value={formatPercent(m12.value)} label="Show to win" sub={formatFraction(m12.numerator, m12.denominator)} />
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-[11.5px] leading-snug text-fg-subtle">
          <Info size={12} aria-hidden className="mt-0.5 shrink-0" />
          Differences can reflect lead mix, setter handoff, offer, or delivery, not only closing.
        </p>
      </Surface>

      {rec ? (
        <Surface padding="md" state={rec.suppressed ? "data_state" : undefined}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-medium text-fg-muted">Coaching priority</h3>
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

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="tabular truncate text-[22px] font-semibold leading-none tracking-tight text-fg">{value}</div>
      <div className="mt-1.5 text-[11px] text-fg-subtle">{label}</div>
      {sub ? <div className="tabular text-[11px] text-fg-subtle">{sub}</div> : null}
    </div>
  );
}
