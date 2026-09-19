"use client";

import { motion, useReducedMotion } from "motion/react";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import { formatCount, formatPercent } from "@/lib/format";
import type { CapacityRow } from "@/lib/owner-model";

/** Per closer and setter: upcoming instances, open tasks, load bar. No ranking. */
export function TeamView({ rows }: { rows: CapacityRow[] }) {
  const reduce = useReducedMotion();
  return (
    <Surface padding="none">
      <ul className="divide-y divide-line">
        {rows.map((row, i) => {
          const pct = Math.min(1, row.loadRatio);
          const over = row.loadRatio > 1;
          return (
            <li key={row.userId} className="flex flex-col gap-2.5 px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-3">
                <span aria-hidden className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full bg-hover text-[12px] font-semibold text-fg-muted">
                  {row.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-fg">{row.name}</div>
                  <div className="text-[12px] capitalize text-fg-subtle">{row.role}</div>
                </div>
                <dl className="tabular flex shrink-0 items-baseline gap-4 text-[13px]">
                  <div className="flex items-baseline gap-1">
                    <dd className="font-semibold text-fg">{formatCount(row.upcomingInstances)}</dd>
                    <dt className="text-[11px] text-fg-subtle">7d</dt>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <dd className="font-semibold text-fg">{formatCount(row.openTasks)}</dd>
                    <dt className="text-[11px] text-fg-subtle">tasks</dt>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <dd className={cn("font-semibold", over ? "text-perf-attention" : "text-fg")}>{formatPercent(row.loadRatio, { digits: 0 })}</dd>
                    <dt className="text-[11px] text-fg-subtle">load</dt>
                  </div>
                </dl>
              </div>
              <div
                role="meter"
                aria-label={`${row.name} load`}
                aria-valuemin={0}
                aria-valuemax={row.availableMinutes}
                aria-valuenow={row.totalMinutes}
                aria-valuetext={row.explanation}
                className="h-1.5 w-full overflow-hidden rounded-full bg-hover"
              >
                <motion.div
                  className={cn("h-full rounded-full", over ? "bg-perf-attention" : "bg-accent")}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${pct * 100}%` }}
                  transition={{ duration: 0.6, delay: 0.05 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}
