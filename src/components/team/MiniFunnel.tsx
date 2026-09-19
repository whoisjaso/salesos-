"use client";

import type { FunnelStage } from "@/domain/types";
import { cn } from "@/lib/cn";
import { formatCount, formatMoney } from "@/lib/format";

export interface MiniFunnelProps {
  stages: FunnelStage[];
  className?: string;
}

/** Compact per-rep funnel: label, count, and the denominator line for every stage. Bars are proportional to the first stage. */
export function MiniFunnel({ stages, className }: MiniFunnelProps) {
  const base = Math.max(1, stages[0]?.count ?? 1);
  return (
    <ol className={cn("flex flex-col gap-2", className)} aria-label="Funnel with denominators">
      {stages.map((s) => {
        const money = s.money !== undefined;
        const width = money ? 100 : Math.max(4, Math.round((s.count / base) * 100));
        return (
          <li key={s.stageId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5">
            <span className="truncate text-[12.5px] text-fg-muted">{s.label}</span>
            <span className="tabular text-[13px] font-medium text-fg">
              {money && s.money ? formatMoney(s.money) : formatCount(s.count)}
              {s.unknownCount ? <span className="text-fg-subtle"> +{s.unknownCount} unknown</span> : null}
            </span>
            <div className="col-span-2 h-1 overflow-hidden rounded-full bg-sunken">
              <div
                className={cn("h-full rounded-full", s.dataState === "complete" ? "bg-accent" : "bg-fg-faint")}
                style={{ width: `${width}%` }}
              />
            </div>
            {s.supportingText ? <span className="tabular col-span-2 text-[11.5px] leading-snug text-fg-subtle">{s.supportingText}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
