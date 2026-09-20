"use client";

import { useState, type ReactNode } from "react";
import { CaretRight, HourglassMedium } from "@phosphor-icons/react";
import type { ChampionRow } from "@/lib/team-data";
import { Avatar } from "@/components/ui/Avatar";
import { Sheet } from "@/components/ui/Sheet";
import { formatCount, formatMoneyMinor, formatPercent } from "@/lib/format";

export interface StageChampionsProps {
  champions: ChampionRow[];
}

function championValue(c: ChampionRow): string {
  if (c.rate === null) return "N/A";
  return c.unit === "money_per_unit" ? formatMoneyMinor(Math.round(c.rate), c.currency, { cents: true }) : formatPercent(c.rate, { digits: 0 });
}

function championDetail(c: ChampionRow): string {
  return c.unit === "money_per_unit" ? `${formatMoneyMinor(c.numerator, c.currency)} over ${formatCount(c.denominator)}` : `${formatCount(c.numerator)} of ${formatCount(c.denominator)}`;
}

/**
 * One row per stage: the leader within the comparable tier and the rate. Tap a
 * row for n of d, the tier, and the provisional reason. Learning candidates, not proof.
 */
export function StageChampions({ champions }: StageChampionsProps) {
  const [open, setOpen] = useState<ChampionRow | null>(null);
  const tier = champions[0]?.leadTier;
  return (
    <>
      <ol className="surface divide-y divide-line px-4" aria-label="Stages">
        {champions.map((c) => (
          <li key={c.stageId}>
            <button type="button" onClick={() => setOpen(c)} className="flex min-h-16 w-full items-center gap-3 py-2.5 text-left hover:bg-hover active:bg-hover">
              {c.userId ? (
                <Avatar userId={c.userId} size={40} />
              ) : (
                <span aria-hidden className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken text-[13px] font-semibold text-fg-subtle">
                  ?
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[12px] font-medium leading-tight text-fg-subtle">{c.label}</span>
                <span className="truncate text-[15px] font-medium leading-tight text-fg">{c.displayName ?? "No leader yet"}</span>
              </span>
              <span className="tabular shrink-0 text-[17px] font-semibold leading-none tracking-tight text-fg">{championValue(c)}</span>
              <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
            </button>
          </li>
        ))}
      </ol>

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? `${open.label} leader` : ""} description={`Within tier ${tier ?? "unknown"}, learning candidates, not proof`}>
        {open ? (
          <dl className="flex flex-col divide-y divide-line">
            <SheetRow label="Leader">{open.displayName ?? "No leader yet"}</SheetRow>
            <SheetRow label="Rate">{championValue(open)}</SheetRow>
            <SheetRow label="Counted">{championDetail(open)}</SheetRow>
            <SheetRow label="Standing">
              {open.provisional ? (
                <span className="flex items-start gap-1.5">
                  <HourglassMedium size={13} weight="bold" aria-hidden className="mt-1.5 shrink-0 text-fg-subtle" />
                  <span>
                    Provisional
                    {open.reason ? <span className="text-fg-muted">, {open.reason}</span> : null}
                  </span>
                </span>
              ) : (
                "Counts"
              )}
            </SheetRow>
            {open.stageId === "fit" ? <SheetRow label="Note">Contextual: fit is a perception, checked against verified outcomes later</SheetRow> : null}
          </dl>
        ) : null}
      </Sheet>
    </>
  );
}

function SheetRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5 first:pt-0">
      <dt className="text-[13px] font-medium text-fg-muted">{label}</dt>
      <dd className="tabular text-[13.5px] leading-relaxed text-fg">{children}</dd>
    </div>
  );
}
