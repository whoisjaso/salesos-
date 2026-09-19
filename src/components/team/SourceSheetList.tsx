"use client";

import { Warning } from "@phosphor-icons/react";
import { deriveSourceMetrics, sourceSheetColumns } from "@/fixtures/sourceSheet";
import { formatCount, formatMoney, formatMoneyMinor } from "@/lib/format";

/** The 12 source columns by reported revenue per lead. Descriptive reading; no winner is named. */
export function SourceSheetList() {
  const rows = sourceSheetColumns
    .map((c) => ({ c, d: deriveSourceMetrics(c) }))
    .sort((a, b) => (b.d.revenuePerLeadMinor ?? -1) - (a.d.revenuePerLeadMinor ?? -1));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-dashed border-line-strong px-2 text-[12px] font-medium text-fg-muted">
          <Warning size={13} weight="bold" aria-hidden />
          Reported revenue, visual reading, tiers differ
        </span>
        <span className="text-[12px] text-fg-subtle">August 2026, 12 columns as read</span>
      </div>
      <ol className="surface divide-y divide-line px-4">
        {rows.map(({ c, d }) => (
          <li key={c.repLabel} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-[14px] font-medium text-fg">{c.displayName}</span>
                <span className="inline-flex h-5 items-center rounded-[4px] border border-line-strong px-1.5 text-[11px] font-medium text-fg-muted">
                  Tier {c.leadTier}
                </span>
              </div>
              <div className="tabular mt-0.5 text-[12px] text-fg-subtle">
                {formatCount(c.leads)} leads · {formatCount(c.wins)} won · {formatMoney(c.reportedRevenue)} reported
                {c.anomaly ? <span className="text-perf-attention"> · {c.anomaly}</span> : null}
              </div>
            </div>
            <div className="text-right">
              <div className="tabular text-[15px] font-semibold text-fg">
                {d.revenuePerLeadMinor === null ? "N/A" : formatMoneyMinor(Math.round(d.revenuePerLeadMinor), "USD", { cents: true })}
              </div>
              <div className="text-[10.5px] text-fg-subtle">reported per lead</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
