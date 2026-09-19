"use client";

import { Fragment, useState } from "react";
import { DetailsRow } from "@/components/ui/DetailsRow";
import { Sheet } from "@/components/ui/Sheet";
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
import { measurementSentence, type MeasurementCopy } from "@/lib/owner-model";
import { HeroCard } from "./HeroCard";
import { ProvisionalMark } from "./ProvisionalMark";

/**
 * The owner's source sheet is a visual reading of a spreadsheet, not verified operating
 * data (AGENTS.md rule 9). Every figure taken from it says so where it is read.
 */
const SHEET_PERIOD = "August 2026";
const UNVERIFIED = {
  label: "Unverified",
  reason: "a visual reading of the owner's sheet, revenue basis unknown",
  sentence: "Unverified: these figures are a visual reading of the owner's sheet and the revenue basis is unknown, so they are not operating data.",
} as const;

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

/** Every cell for one column, in COLUMNS order. */
function cellsOf(c: SourceSheetColumn, total = false): string[] {
  const d = deriveSourceMetrics(c);
  return [
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
}

function Row({ c, total = false }: { c: SourceSheetColumn; total?: boolean }) {
  const cells = cellsOf(c, total);
  return (
    <tr className={cn("border-t border-line", total && "bg-hover font-medium")}>
      <th scope="row" className="sticky left-0 z-10 bg-raised px-3 py-2 text-left text-[13px] font-medium text-fg whitespace-nowrap">
        <span className="inline-flex items-center gap-2">
          {total ? "Team total" : shortName(c)}
          {c.anomaly && !total ? <StateChip state="partial" label="Retained > leads" meaning="Retained bookings exceed the leads for this column, so the sheet's own arithmetic does not close." explain /> : null}
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

/** The whole August 2026 sheet: 12 columns as rows grouped by lead tier, plus sum-over-sum totals. */
function SheetTable({ totals }: { totals: SourceSheetColumn }) {
  const tiers = [1, 2, 3] as const;
  return (
    <Surface padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-raised px-3 py-2.5 text-left text-[12px] font-medium text-fg-subtle">
                Rep
              </th>
              {COLUMNS.map((col) => (
                <th key={col.key} scope="col" className={cn("px-3 py-2.5 text-[12px] font-medium text-fg-subtle whitespace-nowrap", col.align === "right" ? "text-right" : "text-left")}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => (
              <Fragment key={tier}>
                <tr className="border-t border-line-strong">
                  <th scope="rowgroup" colSpan={COLUMNS.length + 1} className="sticky left-0 bg-sunken px-3 py-1.5 text-left text-[12px] font-medium text-fg-subtle">
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
  );
}

/**
 * One hero: the team's reported revenue per lead. One list: a row per rep with the same
 * number. The provenance, the scenario and the full sheet sit behind the hero; every other
 * column for a rep sits behind the rep's row.
 */
export function SourceView() {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rep, setRep] = useState<SourceSheetColumn | null>(null);
  const totals = sourceSheetTotals();
  const ben = sourceColumn("ben");
  const highVolume = sourceColumn("rep_high_volume");
  const counterfactual = counterfactualRevenueAtLeads(ben, highVolume.leads);
  const teamRpl = money(deriveSourceMetrics(totals).revenuePerLeadMinor, true);
  const reps = [...sourceSheetColumns].sort((a, b) => a.leadTier - b.leadTier);
  const teamMeasure: MeasurementCopy = {
    name: "Reported revenue per lead",
    over: `Reported revenue over ${formatCount(totals.leads)} leads`,
    period: SHEET_PERIOD,
    provisional: { ...UNVERIFIED },
  };

  return (
    <div className="flex flex-col gap-4">
      <HeroCard
        label={teamMeasure.name}
        value={teamRpl}
        qualifiers={[teamMeasure.over, teamMeasure.period, <ProvisionalMark key="unverified" note={teamMeasure.provisional!} />]}
        ariaLabel={`${measurementSentence(teamRpl, teamMeasure)} Tap for details.`}
        onClick={() => setDetailsOpen(true)}
        data-testid="source-hero"
      />

      <Surface padding="none">
        <ul className="divide-y divide-line" aria-label="Reps">
          {reps.map((c) => {
            const value = money(deriveSourceMetrics(c).revenuePerLeadMinor, true);
            const measure: MeasurementCopy = {
              name: `${shortName(c)}, reported revenue per lead`,
              over: `Reported revenue over ${formatCount(c.leads)} leads, lead tier ${c.leadTier}`,
              period: SHEET_PERIOD,
              provisional: { ...UNVERIFIED },
            };
            return (
              <li key={c.repLabel}>
                <DetailsRow
                  label={shortName(c)}
                  hint={`${measure.over}, ${SHEET_PERIOD}, unverified`}
                  value={value}
                  ariaLabel={`${measurementSentence(value, measure)} Tap for details.`}
                  data-testid="source-row"
                  onClick={() => setRep(c)}
                />
              </li>
            );
          })}
        </ul>
      </Surface>

      <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Source sheet" description="Visual reading, August 2026" width={1280}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
            <StateChip state="unknown" label="Not verified" meaning="A visual reading of the owner's sheet. The revenue basis is unknown, so nothing here is operating data." explain />
            <span>Revenue basis unknown</span>
          </div>

          <Surface padding="md" className="flex flex-col gap-1.5 border-dashed">
            <div className="text-[12px] font-medium text-fg-subtle">Arithmetic scenario, not a forecast</div>
            <div className="tabular text-[24px] font-semibold leading-none text-fg">{formatMoneyMinor(Math.round(counterfactual.amountMinor), "USD", { cents: true })}</div>
            <div className="tabular text-[12px] text-fg-subtle">
              {formatCount(highVolume.leads)} × ({formatMoneyMinor(ben.reportedRevenue.amountMinor, "USD")} / {formatCount(ben.leads)}), tier 1 rate at tier 2 volume
            </div>
          </Surface>

          <SheetTable totals={totals} />
        </div>
      </Sheet>

      <Sheet open={rep !== null} onClose={() => setRep(null)} title={rep ? shortName(rep) : ""} description={rep ? `Tier ${rep.leadTier}, August 2026, unverified` : undefined}>
        {rep ? (
          <div className="flex flex-col gap-4">
            {rep.anomaly ? <StateChip state="partial" label="Retained > leads" meaning="Retained bookings exceed the leads for this column, so the sheet's own arithmetic does not close." explain /> : null}
            <dl className="divide-y divide-line border-t border-line">
              {cellsOf(rep).map((v, i) =>
                COLUMNS[i].key === "tier" ? null : (
                  <div key={COLUMNS[i].key} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                    <dt className="text-fg-subtle">{COLUMNS[i].label}</dt>
                    <dd className="tabular text-fg">{v}</dd>
                  </div>
                ),
              )}
            </dl>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
