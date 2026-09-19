"use client";

import { HourglassMedium } from "@phosphor-icons/react";
import type { ChampionRow } from "@/lib/team-data";
import { Tooltip } from "@/components/ui/Tooltip";
import { initials } from "@/lib/team-data";
import { formatCount, formatMoneyMinor, formatPercent } from "@/lib/format";

export interface StageChampionsProps {
  champions: ChampionRow[];
}

/** One row per stage: the leader within the comparable tier, the rate, and n of d. Learning candidates, not proof. */
export function StageChampions({ champions }: StageChampionsProps) {
  const tier = champions[0]?.leadTier;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[12px] text-fg-subtle">
        <span>Within tier {tier ?? "unknown"}</span>
        <span>Learning candidates</span>
      </div>
      <ol className="surface divide-y divide-line px-4">
        {champions.map((c) => {
          const value =
            c.rate === null
              ? "N/A"
              : c.unit === "money_per_unit"
                ? formatMoneyMinor(Math.round(c.rate), c.currency, {
                    cents: true,
                  })
                : formatPercent(c.rate, { digits: 0 });
          const detail =
            c.unit === "money_per_unit"
              ? `${formatMoneyMinor(c.numerator, c.currency)} over ${formatCount(c.denominator)}`
              : `${formatCount(c.numerator)} of ${formatCount(c.denominator)}`;
          return (
            <li key={c.stageId} className="flex items-center gap-3 py-3">
              <span className="w-14 shrink-0 text-[13px] font-medium text-fg-muted">
                {c.label}
              </span>
              <span
                aria-hidden
                className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-[12px] font-semibold text-fg-muted"
              >
                {c.displayName ? initials(c.displayName) : "?"}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
                <span className="truncate text-[14.5px] font-medium text-fg">
                  {c.displayName ?? "No leader yet"}
                </span>
                <span className="flex items-center gap-1.5">
                  {c.provisional ? (
                    <Tooltip content={c.reason ?? "Provisional"}>
                      <span
                        tabIndex={0}
                        aria-label="Provisional"
                        className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border border-dashed border-line-strong text-fg-muted"
                      >
                        <HourglassMedium size={12} weight="bold" aria-hidden />
                      </span>
                    </Tooltip>
                  ) : null}
                  {c.stageId === "fit" ? (
                    <span className="text-[10.5px] text-fg-subtle">
                      contextual
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="tabular text-[17px] font-semibold leading-none tracking-tight text-fg">
                  {value}
                </span>
                <span className="tabular mt-1 text-[11px] text-fg-subtle">
                  {detail}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
