"use client";

import { Fragment } from "react";
import { Surface } from "@/components/ui/Surface";
import { StateChip } from "@/components/ui/StateChip";
import { cn } from "@/lib/cn";
import { formatCount, formatMoneyMinor, formatPercent } from "@/lib/format";
import {
  counterfactualRevenueAtLeads,
  deriveSourceMetrics,
  sourceColumn,
  sourceSheetColumns,
  sourceSheetTotals,
  type SourceSheetColumn,
} from "@/fixtures/sourceSheet";

const COLUMNS: { key: string; label: string; align?: "right" }[] = [
  { key: "tier", label: "Tier" },
  { key: "leads", label: "Leads", align: "right" },
  { key: "retained", label: "Retained bookings", align: "right" },
  { key: "shows", label: "Shows", align: "right" },
  { key: "qualified", label: "Perceived qualified", align: "right" },
  { key: "wins", label: "Wins", align: "right" },
  { key: "revenue", label: "Reported revenue", align: "right" },
  { key: "retainedRate", label: "Retained rate", align: "right" },
  { key: "showRate", label: "Show rate", align: "right" },
  { key: "qualRate", label: "Qualified rate", align: "right" },
  { key: "showToWin", label: "Show-to-win", align: "right" },
  { key: "leadToWin", label: "Lead-to-win", align: "right" },
  { key: "rpl", label: "Revenue per lead", align: "right" },
];

function shortName(c: SourceSheetColumn): string {
  return c.repLabel === "rep_high_volume" ? "High-volume rep" : c.displayName;
}

function money(minor: number | null, cents = false): string {
  return minor === null ? "N/A" : formatMoneyMinor(cents ? Math.round(minor) : Math.round(minor / 100) * 100, "USD", { cents });
}

function Row({ c, total = false }: { c: SourceSheetColumn; total?: boolean }) {
  const d = deriveSourceMetrics(c);
  const cells: string[] = [
    total ? "" : String(c.leadTier),
    formatCount(c.leads),
    formatCount(c.retainedBookings),
    formatCount(c.shows),
    formatCount(c.perceivedQualified),
    formatCount(c.wins),
    money(c.reportedRevenue.amountMinor),
    formatPercent(d.retainedBookingRate),
    formatPercent(d.showRate),
    formatPercent(d.perceivedQualifiedShowRate),
    formatPercent(d.showToWinRate),
    formatPercent(d.leadToWinRate),
    money(d.revenuePerLeadMinor, true),
  ];
  return (
    <tr className={cn("border-t border-line", total && "bg-hover font-medium")}>
      <th scope="row" className="sticky left-0 z-10 bg-raised px-3 py-2 text-left text-[13px] font-medium text-fg whitespace-nowrap">
        <span className="inline-flex items-center gap-2">
          {total ? "Team total" : shortName(c)}
          {c.anomaly && !total ? <StateChip state="partial" label="Retained > leads" /> : null}
        </span>
      </th>
      {cells.map((v, i) => (
        <td key={COLUMNS[i].key} className={cn("tabular px-3 py-2 text-[13px] whitespace-nowrap", COLUMNS[i].align === "right" ? "text-right" : "text-left", total ? "text-fg" : "text-fg-muted")}>
          {v}
        </td>
      ))}
    </tr>
  );
}

/** August 2026 source sheet, 12 columns as rows grouped by lead tier, plus sum-over-sum totals. */
export function SourceView() {
  const tiers = [1, 2, 3] as const;
  const totals = sourceSheetTotals();
  const ben = sourceColumn("ben");
  const highVolume = sourceColumn("rep_high_volume");
  const counterfactual = counterfactualRevenueAtLeads(ben, highVolume.leads);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
        <StateChip state="unknown" label="Not verified" />
        <span>Visual reading of a screenshot. Reported revenue basis unknown.</span>
      </div>

      <Surface padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-raised px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                  August 2026
                </th>
                {COLUMNS.map((col) => (
                  <th key={col.key} scope="col" className={cn("px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle whitespace-nowrap", col.align === "right" ? "text-right" : "text-left")}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <Fragment key={tier}>
                  <tr className="border-t border-line-strong">
                    <th scope="rowgroup" colSpan={COLUMNS.length + 1} className="sticky left-0 bg-sunken px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                      Tier {tier}
                    </th>
                  </tr>
                  {sourceSheetColumns.filter((c) => c.leadTier === tier).map((c) => (
                    <Row key={c.repLabel} c={c} />
                  ))}
                </Fragment>
              ))}
              <Row c={totals} total />
            </tbody>
          </table>
        </div>
      </Surface>

      <Surface padding="md" className="flex flex-col gap-1.5 border-dashed">
        <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Arithmetic scenario, not a forecast</div>
        <div className="tabular text-[24px] font-semibold leading-none text-fg">{formatMoneyMinor(Math.round(counterfactual.amountMinor), "USD", { cents: true })}</div>
        <div className="tabular text-[12px] text-fg-subtle">
          {formatCount(highVolume.leads)} × ({formatMoneyMinor(ben.reportedRevenue.amountMinor, "USD")} / {formatCount(ben.leads)}), tier 1 rate applied to tier 2 volume
        </div>
      </Surface>
    </div>
  );
}
